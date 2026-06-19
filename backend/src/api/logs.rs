// Copyright (C), 2026 Quartz Systems. Some rights reserved. This work is
// licensed under the terms of the MIT license which can be found in the
// root directory of this project.

use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::{auth::AuthUser, db, error::AppError, models::{AuditLog, GlobalEvent}, state::AppState};

#[derive(Deserialize)]
pub struct LogQuery {
    pub limit: Option<i64>,
}

pub async fn events(
    AuthUser(_): AuthUser,
    State(state): State<Arc<AppState>>,
    Query(q): Query<LogQuery>,
) -> Result<Json<Vec<GlobalEvent>>, AppError> {
    let limit = q.limit.unwrap_or(500).min(2000);
    let rows = db::get_global_events(&state.db, limit).await.map_err(AppError::Internal)?;
    Ok(Json(rows))
}

pub async fn audit_log(
    AuthUser(_): AuthUser,
    State(state): State<Arc<AppState>>,
    Query(q): Query<LogQuery>,
) -> Result<Json<Vec<AuditLog>>, AppError> {
    let limit = q.limit.unwrap_or(500).min(2000);
    let rows = db::get_audit_log(&state.db, limit).await.map_err(AppError::Internal)?;
    Ok(Json(rows))
}
