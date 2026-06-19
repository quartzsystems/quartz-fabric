// Copyright (C), 2026 Quartz Systems. Some rights reserved. This work is
// licensed under the terms of the MIT license which can be found in the
// root directory of this project.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use std::sync::Arc;
use tokio::sync::Semaphore;
use tracing::info;

use crate::{
    auth::{AdminUser, AuthUser},
    db,
    error::AppError,
    models::{
        ConfigTemplate, CreateTemplateRequest, PushResult, PushTemplateRequest,
        PushTemplateResponse, UpdateTemplateRequest,
    },
    rest,
    state::AppState,
};

pub async fn list(
    AuthUser(_): AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<ConfigTemplate>>, AppError> {
    let rows = db::get_all_templates(&state.db).await.map_err(AppError::Internal)?;
    Ok(Json(rows))
}

pub async fn get(
    AuthUser(_): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ConfigTemplate>, AppError> {
    let t = db::get_template_by_id(&state.db, &id)
        .await
        .map_err(AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(t))
}

pub async fn create(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateTemplateRequest>,
) -> Result<(StatusCode, Json<ConfigTemplate>), AppError> {
    if user.role == "viewer" {
        return Err(AppError::Forbidden);
    }
    let t = db::create_template(&state.db, &req)
        .await
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                AppError::Conflict(format!("Template '{}' already exists", req.name))
            } else {
                AppError::Internal(e)
            }
        })?;
    info!("Config template '{}' created", t.name);
    Ok((StatusCode::CREATED, Json(t)))
}

pub async fn update(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateTemplateRequest>,
) -> Result<Json<ConfigTemplate>, AppError> {
    if user.role == "viewer" {
        return Err(AppError::Forbidden);
    }
    let t = db::update_template(&state.db, &id, &req)
        .await
        .map_err(AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(t))
}

pub async fn delete(
    AdminUser(_): AdminUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let deleted = db::delete_template(&state.db, &id)
        .await
        .map_err(AppError::Internal)?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound)
    }
}

pub async fn push(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<PushTemplateRequest>,
) -> Result<Json<PushTemplateResponse>, AppError> {
    if user.role == "viewer" {
        return Err(AppError::Forbidden);
    }

    let template = db::get_template_by_id(&state.db, &id)
        .await
        .map_err(AppError::Internal)?
        .ok_or(AppError::NotFound)?;

    // Substitute {{variable}} placeholders
    let mut command = template.content.clone();
    for (key, value) in &req.variables {
        command = command.replace(&format!("{{{{{}}}}}", key), value);
    }

    let rest_timeout = {
        let s = state.settings.read().await;
        s.rest_timeout_secs.max(60) as u64
    };

    let concurrency = {
        let s = state.settings.read().await;
        s.poll_concurrency as usize
    };

    let sem = Arc::new(Semaphore::new(concurrency.max(1)));
    let mut handles = Vec::new();
    let device_ids = req.device_ids.clone();

    for device_id in device_ids {
        let device = match db::get_device_by_id(&state.db, &device_id).await {
            Ok(Some(d)) => d,
            Ok(None) => continue,
            Err(e) => {
                let dev_id_err = device_id.clone();
                handles.push(tokio::spawn(async move {
                    PushResult {
                        device_id: dev_id_err,
                        hostname: "unknown".to_string(),
                        success: false,
                        output: None,
                        error: Some(e.to_string()),
                    }
                }));
                continue;
            }
        };

        let creds = rest::DeviceCreds {
            ip: device.ip_address.clone(),
            port: device.rest_port as u16,
            username: device.rest_username.clone(),
            password: device.rest_password.clone(),
            timeout_secs: rest_timeout,
        };

        let cmd = command.clone();
        let hostname = device.hostname.clone();
        let dev_id = device_id.clone();
        let permit = sem.clone().acquire_owned().await.unwrap();

        handles.push(tokio::spawn(async move {
            let result = match rest::exec_command(creds, &cmd).await {
                Ok(output) => PushResult {
                    device_id: dev_id,
                    hostname,
                    success: true,
                    output: Some(output),
                    error: None,
                },
                Err(e) => PushResult {
                    device_id: dev_id,
                    hostname,
                    success: false,
                    output: None,
                    error: Some(e.to_string()),
                },
            };
            drop(permit);
            result
        }));
    }

    let mut results = Vec::new();
    for handle in handles {
        if let Ok(r) = handle.await {
            results.push(r);
        }
    }

    Ok(Json(PushTemplateResponse { results }))
}
