// Copyright (C), 2026 Quartz Systems. Some rights reserved. This work is
// licensed under the terms of the MIT license which can be found in the
// root directory of this project.

use anyhow::{Context, Result};

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub listen_addr: String,
    pub jwt_secret: String,
    pub jwt_expiry_hours: i64,
    pub poll_interval_secs: u64,
    pub poll_concurrency: usize,
    pub rest_timeout_secs: u64,
    pub cors_origin: String,
    pub initial_admin_password: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            database_url: env_var("DATABASE_URL")
                .unwrap_or_else(|| "sqlite:quartz-fabric.db".into()),
            listen_addr: env_var("LISTEN_ADDR")
                .unwrap_or_else(|| "0.0.0.0:8080".into()),
            jwt_secret: env_var("JWT_SECRET")
                .context("JWT_SECRET must be set")?,
            jwt_expiry_hours: env_var("JWT_EXPIRY_HOURS")
                .and_then(|v| v.parse().ok())
                .unwrap_or(8),
            poll_interval_secs: env_var("POLL_INTERVAL_SECS")
                .and_then(|v| v.parse().ok())
                .unwrap_or(300),
            poll_concurrency: env_var("POLL_CONCURRENCY")
                .and_then(|v| v.parse().ok())
                .unwrap_or(5),
            rest_timeout_secs: env_var("REST_TIMEOUT_SECS")
                .and_then(|v| v.parse().ok())
                .unwrap_or(30),
            cors_origin: env_var("CORS_ORIGIN")
                .unwrap_or_else(|| "http://localhost:3000".into()),
            initial_admin_password: env_var("INITIAL_ADMIN_PASSWORD")
                .unwrap_or_else(|| "changeme".into()),
        })
    }
}

fn env_var(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.is_empty())
}
