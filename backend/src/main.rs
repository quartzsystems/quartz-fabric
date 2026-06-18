mod api;
mod auth;
mod config;
mod db;
mod error;
mod models;
mod polling;
mod ssh;
mod state;

use anyhow::{Context, Result};
use axum::Router;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::{str::FromStr, sync::Arc, time::Duration};
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::info;

use crate::{config::Config, state::AppState};

#[tokio::main]
async fn main() -> Result<()> {
    // Load .env if present
    dotenvy::dotenv().ok();

    // Tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "quartz_fabric_api=info,tower_http=warn".into()),
        )
        .init();

    let config = Config::from_env().context("Failed to load config")?;

    // Database
    let db_opts = SqliteConnectOptions::from_str(&config.database_url)
        .context("Invalid DATABASE_URL")?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .foreign_keys(true);

    let db = SqlitePoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .connect_with(db_opts)
        .await
        .context("Failed to connect to database")?;

    // Migrations
    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .context("Failed to run migrations")?;

    // Seed initial admin if no users exist
    if db::count_users(&db).await? == 0 {
        seed_admin(&db, &config).await?;
    }

    let state = Arc::new(AppState {
        db: db.clone(),
        config: config.clone(),
    });

    // Background polling
    polling::start(state.clone());

    // CORS
    let cors = CorsLayer::new()
        .allow_origin(
            config
                .cors_origin
                .parse::<axum::http::HeaderValue>()
                .context("Invalid CORS_ORIGIN")?,
        )
        .allow_methods(Any)
        .allow_headers(Any);

    // Router
    let app = Router::new()
        .nest("/api", api::router(state))
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    let listener = tokio::net::TcpListener::bind(&config.listen_addr)
        .await
        .context(format!("Failed to bind to {}", config.listen_addr))?;

    info!("Quartz Fabric API listening on {}", config.listen_addr);

    axum::serve(listener, app)
        .await
        .context("Server error")?;

    Ok(())
}

async fn seed_admin(db: &sqlx::SqlitePool, config: &Config) -> Result<()> {
    use crate::models::CreateUserRequest;
    let hash = auth::hash_password(&config.initial_admin_password)
        .context("Failed to hash initial admin password")?;
    let req = CreateUserRequest {
        username: "admin".into(),
        email: "admin@quartz.systems".into(),
        display_name: "Administrator".into(),
        password: config.initial_admin_password.clone(),
        role: "admin".into(),
    };
    db::create_user(db, &req, &hash).await?;
    info!(
        "Created initial admin user (username: admin, password: {})",
        config.initial_admin_password
    );
    Ok(())
}
