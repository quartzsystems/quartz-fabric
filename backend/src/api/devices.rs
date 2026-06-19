use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use tracing::info;

use crate::{
    auth::{AdminUser, AuthUser},
    db,
    error::AppError,
    models::{
        ArpEntry, CreateDeviceRequest, Device, DeviceEvent, DeviceInterface, EnvironmentResponse,
        ExecRequest, ExecResponse, MacEntry, Summary, UpdateDeviceRequest, VlanEntry,
    },
    polling, ssh,
    state::AppState,
};

// ─── Devices CRUD ─────────────────────────────────────────────────────────────

pub async fn list(
    AuthUser(_): AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<Device>>, AppError> {
    let devices = db::get_all_devices(&state.db).await.map_err(AppError::Internal)?;
    Ok(Json(devices))
}

pub async fn get(
    AuthUser(_): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Device>, AppError> {
    let device = db::get_device_by_id(&state.db, &id)
        .await
        .map_err(AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(device))
}

pub async fn create(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateDeviceRequest>,
) -> Result<(StatusCode, Json<Device>), AppError> {
    if user.role == "viewer" {
        return Err(AppError::Forbidden);
    }
    let device = db::create_device(&state.db, &req)
        .await
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                AppError::Conflict(format!("IP address '{}' already exists", req.ip_address))
            } else {
                AppError::Internal(e)
            }
        })?;

    // Trigger an immediate first poll in the background
    let state_clone = state.clone();
    let device_id = device.id.clone();
    tokio::spawn(async move {
        polling::poll_one(state_clone, &device_id).await;
    });

    info!("Device {} ({}) added", device.hostname, device.ip_address);
    Ok((StatusCode::CREATED, Json(device)))
}

pub async fn update(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateDeviceRequest>,
) -> Result<Json<Device>, AppError> {
    if user.role == "viewer" {
        return Err(AppError::Forbidden);
    }
    let device = db::update_device(&state.db, &id, &req)
        .await
        .map_err(AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(device))
}

pub async fn delete(
    AdminUser(_): AdminUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let deleted = db::delete_device(&state.db, &id)
        .await
        .map_err(AppError::Internal)?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound)
    }
}

// ─── Manual refresh ───────────────────────────────────────────────────────────

pub async fn refresh(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    if user.role == "viewer" {
        return Err(AppError::Forbidden);
    }
    // Verify device exists
    db::get_device_by_id(&state.db, &id)
        .await
        .map_err(AppError::Internal)?
        .ok_or(AppError::NotFound)?;

    let state_clone = state.clone();
    tokio::spawn(async move {
        polling::poll_one(state_clone, &id).await;
    });

    Ok(StatusCode::ACCEPTED)
}

// ─── Sub-resources ────────────────────────────────────────────────────────────

pub async fn interfaces(
    AuthUser(_): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Vec<DeviceInterface>>, AppError> {
    ensure_device_exists(&state, &id).await?;
    let rows = db::get_device_interfaces(&state.db, &id)
        .await
        .map_err(AppError::Internal)?;
    Ok(Json(rows))
}

pub async fn arp(
    AuthUser(_): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Vec<ArpEntry>>, AppError> {
    ensure_device_exists(&state, &id).await?;
    let rows = db::get_device_arp(&state.db, &id)
        .await
        .map_err(AppError::Internal)?;
    Ok(Json(rows))
}

pub async fn mac_table(
    AuthUser(_): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Vec<MacEntry>>, AppError> {
    ensure_device_exists(&state, &id).await?;
    let rows = db::get_device_mac(&state.db, &id)
        .await
        .map_err(AppError::Internal)?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
pub struct EventsQuery {
    pub limit: Option<i64>,
}

pub async fn events(
    AuthUser(_): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(q): Query<EventsQuery>,
) -> Result<Json<Vec<DeviceEvent>>, AppError> {
    ensure_device_exists(&state, &id).await?;
    let limit = q.limit.unwrap_or(100).min(500);
    let rows = db::get_device_events(&state.db, &id, limit)
        .await
        .map_err(AppError::Internal)?;
    Ok(Json(rows))
}

pub async fn vlans(
    AuthUser(_): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Vec<VlanEntry>>, AppError> {
    ensure_device_exists(&state, &id).await?;
    let rows = db::get_device_vlans(&state.db, &id)
        .await
        .map_err(AppError::Internal)?;
    Ok(Json(rows))
}

pub async fn exec(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<ExecRequest>,
) -> Result<Json<ExecResponse>, AppError> {
    if user.role == "viewer" {
        return Err(AppError::Forbidden);
    }
    let device = db::get_device_by_id(&state.db, &id)
        .await
        .map_err(AppError::Internal)?
        .ok_or(AppError::NotFound)?;

    let settings = state.settings.read().await;
    let creds = ssh::DeviceCreds {
        ip: device.ip_address.clone(),
        port: device.ssh_port as u16,
        username: device.ssh_username.clone(),
        password: device.ssh_password.clone(),
        connect_timeout_secs: settings.ssh_connect_timeout_secs as u64,
        read_timeout_secs: settings.ssh_read_timeout_secs.max(60) as u64,
    };
    drop(settings);

    let output = ssh::exec_command(creds, &req.command)
        .await
        .map_err(|e| AppError::Internal(e))?;

    Ok(Json(ExecResponse { output }))
}

pub async fn environment(
    AuthUser(_): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<EnvironmentResponse>, AppError> {
    ensure_device_exists(&state, &id).await?;
    let (psus, fans, temps) = db::get_device_environment(&state.db, &id)
        .await
        .map_err(AppError::Internal)?;
    Ok(Json(EnvironmentResponse { psus, fans, temps }))
}

// ─── Summary ──────────────────────────────────────────────────────────────────

pub async fn summary(
    AuthUser(_): AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Summary>, AppError> {
    let s = db::get_summary(&state.db).await.map_err(AppError::Internal)?;
    Ok(Json(s))
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async fn ensure_device_exists(state: &AppState, id: &str) -> Result<(), AppError> {
    db::get_device_by_id(&state.db, id)
        .await
        .map_err(AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    Ok(())
}
