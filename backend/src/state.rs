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
