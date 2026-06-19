// Copyright (C), 2026 Quartz Systems. Some rights reserved. This work is
// licensed under the terms of the MIT license which can be found in the
// root directory of this project.

use std::sync::Arc;
use tokio::sync::RwLock;
use sqlx::SqlitePool;
use crate::{config::Config, models::DbSettings};

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub config: Config,
    pub settings: Arc<RwLock<DbSettings>>,
}
