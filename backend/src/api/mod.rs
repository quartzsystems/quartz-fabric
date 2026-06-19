// Copyright (C), 2026 Quartz Systems. Some rights reserved. This work is
// licensed under the terms of the MIT license which can be found in the
// root directory of this project.

use axum::{
    routing::{get, post},
    Router,
};
use std::sync::Arc;

use crate::state::AppState;

mod auth;
mod devices;
mod logs;
mod settings;
mod templates;
mod users;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        // Auth
        .route("/auth/login", post(auth::login))
        .route("/auth/me", get(auth::me).put(auth::update_me))
        // Settings
        .route("/settings", get(settings::get).put(settings::update))
        // Summary
        .route("/summary", get(devices::summary))
        // Users
        .route("/users", get(users::list).post(users::create))
        .route(
            "/users/{id}",
            get(users::get).put(users::update).delete(users::delete),
        )
        // Devices
        .route("/devices", get(devices::list).post(devices::create))
        .route(
            "/devices/{id}",
            get(devices::get).put(devices::update).delete(devices::delete),
        )
        .route("/devices/{id}/refresh", post(devices::refresh))
        .route("/devices/{id}/interfaces", get(devices::interfaces))
        .route("/devices/{id}/arp", get(devices::arp))
        .route("/devices/{id}/mac", get(devices::mac_table))
        .route("/devices/{id}/vlans", get(devices::vlans))
        .route("/devices/{id}/events", get(devices::events))
        .route("/devices/{id}/environment", get(devices::environment))
        .route("/devices/{id}/exec", post(devices::exec))
        .route("/devices/{id}/configure", post(devices::configure))
        .route("/devices/{id}/yang-discover", get(devices::yang_discover))
        .route("/devices/{id}/yang-fetch", get(devices::yang_fetch))
        // Logs
        .route("/events", get(logs::events))
        .route("/audit-log", get(logs::audit_log))
        // Config Templates
        .route("/templates", get(templates::list).post(templates::create))
        .route(
            "/templates/{id}",
            get(templates::get)
                .put(templates::update)
                .delete(templates::delete),
        )
        .route("/templates/{id}/push", post(templates::push))
        .with_state(state)
}
