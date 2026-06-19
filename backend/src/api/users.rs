// Copyright (C), 2026 Quartz Systems. Some rights reserved. This work is
// licensed under the terms of the MIT license which can be found in the
// root directory of this project.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use std::sync::Arc;

use crate::{
    auth::{hash_password, AdminUser, AuthUser},
    db,
    error::AppError,
    models::{CreateUserRequest, UpdateUserRequest},
    state::AppState,
};

pub async fn list(
    AuthUser(_): AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<crate::models::User>>, AppError> {
    let users = db::get_all_users(&state.db).await.map_err(AppError::Internal)?;
    Ok(Json(users))
}

pub async fn get(
    AuthUser(_): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<crate::models::User>, AppError> {
    let user = db::get_user_by_id(&state.db, &id)
        .await
        .map_err(AppError::Internal)?
        .ok_or(AppError::NotFound)?;
    Ok(Json(user))
}

pub async fn create(
    AdminUser(_): AdminUser,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateUserRequest>,
) -> Result<(StatusCode, Json<crate::models::User>), AppError> {
    // Validate role
    if !["admin", "operator", "viewer"].contains(&req.role.as_str()) {
        return Err(AppError::BadRequest("role must be admin, operator, or viewer".into()));
    }
    if req.password.len() < 8 {
        return Err(AppError::BadRequest("password must be at least 8 characters".into()));
    }

    // Check uniqueness
    if db::get_user_by_username(&state.db, &req.username)
        .await
        .map_err(AppError::Internal)?
        .is_some()
    {
        return Err(AppError::Conflict(format!("username '{}' already exists", req.username)));
    }

    let hash = hash_password(&req.password).map_err(AppError::Internal)?;
    let user = db::create_user(&state.db, &req, &hash)
        .await
        .map_err(AppError::Internal)?;
    Ok((StatusCode::CREATED, Json(user)))
}

pub async fn update(
    AdminUser(admin): AdminUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateUserRequest>,
) -> Result<Json<crate::models::User>, AppError> {
    // Prevent admin from demoting themselves
    if admin.id == id {
        if let Some(ref role) = req.role {
            if role != "admin" {
                return Err(AppError::BadRequest("Cannot change your own role".into()));
            }
        }
        if let Some(ref status) = req.status {
            if status != "active" {
                return Err(AppError::BadRequest("Cannot deactivate your own account".into()));
            }
        }
    }

    let new_hash = if let Some(ref pw) = req.password {
        if pw.len() < 8 {
            return Err(AppError::BadRequest("password must be at least 8 characters".into()));
        }
        Some(hash_password(pw).map_err(AppError::Internal)?)
    } else {
        None
    };

    let user = db::update_user(&state.db, &id, &req, new_hash.as_deref())
        .await
        .map_err(AppError::Internal)?
        .ok_or(AppError::NotFound)?;

    Ok(Json(user))
}

pub async fn delete(
    AdminUser(admin): AdminUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    if admin.id == id {
        return Err(AppError::BadRequest("Cannot delete your own account".into()));
    }
    let deleted = db::delete_user(&state.db, &id)
        .await
        .map_err(AppError::Internal)?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound)
    }
}
