// Copyright (C), 2026 Quartz Systems. Some rights reserved. This work is
// licensed under the terms of the MIT license which can be found in the
// root directory of this project.

use axum::{extract::State, Json};
use std::sync::Arc;
use tracing::info;

use crate::{
    auth::{create_token, hash_password, verify_password, AuthUser},
    db,
    error::AppError,
    models::{LoginRequest, LoginResponse, UpdateProfileRequest, UpdateUserRequest},
    state::AppState,
};

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    let user = db::get_user_by_username(&state.db, &req.username)
        .await
        .map_err(AppError::Internal)?
        .ok_or_else(|| AppError::Unauthorized("Invalid username or password".into()))?;

    if user.status != "active" {
        return Err(AppError::Unauthorized("Account inactive".into()));
    }

    let valid = verify_password(&req.password, &user.password_hash)
        .map_err(AppError::Internal)?;
    if !valid {
        return Err(AppError::Unauthorized("Invalid username or password".into()));
    }

    db::update_last_login(&state.db, &user.id)
        .await
        .map_err(AppError::Internal)?;

    let token = create_token(
        &user.id,
        &user.role,
        &state.config.jwt_secret,
        state.config.jwt_expiry_hours,
    )
    .map_err(AppError::Internal)?;

    info!("User '{}' logged in", user.username);

    Ok(Json(LoginResponse { token, user }))
}

pub async fn me(AuthUser(user): AuthUser) -> Json<crate::models::User> {
    Json(user)
}

pub async fn update_me(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Json(req): Json<UpdateProfileRequest>,
) -> Result<Json<crate::models::User>, AppError> {
    if let Some(ref pw) = req.password {
        if pw.len() < 8 {
            return Err(AppError::BadRequest(
                "Password must be at least 8 characters".into(),
            ));
        }
    }

    let new_hash = if let Some(ref pw) = req.password {
        Some(hash_password(pw).map_err(AppError::Internal)?)
    } else {
        None
    };

    let update_req = UpdateUserRequest {
        display_name: req.display_name,
        email: req.email,
        role: None,
        status: None,
        password: None,
    };

    let updated = db::update_user(&state.db, &user.id, &update_req, new_hash.as_deref())
        .await
        .map_err(AppError::Internal)?
        .ok_or(AppError::NotFound)?;

    Ok(Json(updated))
}
