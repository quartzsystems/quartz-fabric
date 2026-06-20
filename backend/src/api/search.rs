// Copyright (C), 2026 Quartz Systems. Some rights reserved. This work is
// licensed under the terms of the MIT license which can be found in the
// root directory of this project.

use axum::{extract::{Query, State}, Json};
use serde::Deserialize;
use std::sync::Arc;

use crate::{auth::AuthUser, db, error::AppError, models::SearchResult, state::AppState};

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

pub async fn search(
    AuthUser(_): AuthUser,
    State(state): State<Arc<AppState>>,
    Query(params): Query<SearchQuery>,
) -> Result<Json<Vec<SearchResult>>, AppError> {
    let q = params.q.trim().to_string();
    if q.len() < 2 {
        return Ok(Json(vec![]));
    }
    let results = db::search(&state.db, &q, 6).await.map_err(AppError::Internal)?;
    Ok(Json(results))
}
