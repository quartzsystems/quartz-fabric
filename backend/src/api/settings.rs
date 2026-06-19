// Copyright (C), 2026 Quartz Systems. Some rights reserved. This work is
// licensed under the terms of the MIT license which can be found in the
// root directory of this project.

use axum::{extract::State, Json};
use std::sync::Arc;

use crate::{
    auth::{AdminUser, AuthUser},
    db,
    error::AppError,
    models::{SystemSettings, UpdateSettingsRequest},
    state::AppState,
};

fn to_response(s: &crate::models::DbSettings, config: &crate::config::Config) -> SystemSettings {
    SystemSettings {
        poll_interval_secs: s.poll_interval_secs,
        poll_concurrency: s.poll_concurrency,
        ssh_connect_timeout_secs: s.ssh_connect_timeout_secs,
        ssh_read_timeout_secs: s.ssh_read_timeout_secs,
        jwt_expiry_hours: s.jwt_expiry_hours,
        listen_addr: config.listen_addr.clone(),
        cors_origin: config.cors_origin.clone(),
        updated_at: s.updated_at.clone(),
    }
}

pub async fn get(
    AuthUser(_): AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<Json<SystemSettings>, AppError> {
    let s = state.settings.read().await;
    Ok(Json(to_response(&s, &state.config)))
}

pub async fn update(
    AdminUser(_): AdminUser,
    State(state): State<Arc<AppState>>,
    Json(req): Json<UpdateSettingsRequest>,
) -> Result<Json<SystemSettings>, AppError> {
    let updated = db::update_settings(&state.db, &req)
        .await
        .map_err(AppError::Internal)?;
    *state.settings.write().await = updated.clone();
    Ok(Json(to_response(&updated, &state.config)))
}
