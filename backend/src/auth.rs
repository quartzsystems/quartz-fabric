// Copyright (C), 2026 Quartz Systems. Some rights reserved. This work is
// licensed under the terms of the MIT license which can be found in the
// root directory of this project.

use anyhow::{anyhow, Result};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    extract::FromRequestParts,
    http::request::Parts,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::{error::AppError, models::User, state::AppState};

// ─── Password ────────────────────────────────────────────────────────────────

pub fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow!("argon2 hash error: {e}"))?;
    Ok(hash.to_string())
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool> {
    let parsed = PasswordHash::new(hash).map_err(|e| anyhow!("invalid hash: {e}"))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

// ─── JWT ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub role: String,
    pub exp: usize,
}

pub fn create_token(user_id: &str, role: &str, secret: &str, expiry_hours: i64) -> Result<String> {
    let exp = (chrono::Utc::now() + chrono::Duration::hours(expiry_hours)).timestamp() as usize;
    let claims = Claims {
        sub: user_id.to_string(),
        role: role.to_string(),
        exp,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| anyhow!("jwt encode error: {e}"))
}

pub fn verify_token(token: &str, secret: &str) -> Result<Claims> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map(|d| d.claims)
    .map_err(|e| anyhow!("jwt error: {e}"))
}

// ─── Request extractors ───────────────────────────────────────────────────────

pub struct AuthUser(pub User);
pub struct AdminUser(pub User);

fn extract_bearer(parts: &Parts) -> Option<String> {
    parts
        .headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|t| t.to_string())
}

impl FromRequestParts<Arc<AppState>> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        let token = extract_bearer(parts)
            .ok_or_else(|| AppError::Unauthorized("No bearer token".into()))?;

        let claims = verify_token(&token, &state.config.jwt_secret)
            .map_err(|_| AppError::Unauthorized("Invalid or expired token".into()))?;

        let user = crate::db::get_user_by_id(&state.db, &claims.sub)
            .await
            .map_err(AppError::Internal)?
            .ok_or_else(|| AppError::Unauthorized("User not found".into()))?;

        if user.status != "active" {
            return Err(AppError::Unauthorized("Account inactive".into()));
        }

        Ok(AuthUser(user))
    }
}

impl FromRequestParts<Arc<AppState>> for AdminUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        let AuthUser(user) = AuthUser::from_request_parts(parts, state).await?;
        if user.role != "admin" {
            return Err(AppError::Forbidden);
        }
        Ok(AdminUser(user))
    }
}
