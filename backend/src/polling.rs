use std::sync::Arc;
use tokio::sync::Semaphore;
use tokio::time::{interval, Duration};
use tracing::{error, info, warn};

use crate::{db, ssh, state::AppState};

pub fn start(state: Arc<AppState>) {
    let poll_secs = state.config.poll_interval_secs;
    let concurrency = state.config.poll_concurrency;

    tokio::spawn(async move {
        let mut ticker = interval(Duration::from_secs(poll_secs));
        ticker.tick().await; // skip the immediate first tick

        loop {
            ticker.tick().await;
            info!("Starting poll cycle");
            poll_all_devices(state.clone(), concurrency).await;
            info!("Poll cycle complete");
        }
    });
}

pub async fn poll_one(state: Arc<AppState>, device_id: &str) {
    let device = match db::get_device_by_id(&state.db, device_id).await {
        Ok(Some(d)) => d,
        Ok(None) => {
            warn!("poll_one: device {device_id} not found");
            return;
        }
        Err(e) => {
            error!("poll_one DB error: {e}");
            return;
        }
    };

    let (connect_timeout, read_timeout) = {
        let s = state.settings.read().await;
        (s.ssh_connect_timeout_secs as u64, s.ssh_read_timeout_secs as u64)
    };
    let creds = ssh::DeviceCreds {
        ip: device.ip_address.clone(),
        port: device.ssh_port as u16,
        username: device.ssh_username.clone(),
        password: device.ssh_password.clone(),
        connect_timeout_secs: connect_timeout,
        read_timeout_secs: read_timeout,
    };

    info!("Polling {} ({})", device.hostname, device.ip_address);

    match ssh::poll_device(creds).await {
        Ok(result) => {
            if let Err(e) = db::apply_poll_result(&state.db, &device.id, &result).await {
                error!("apply_poll_result for {}: {e}", device.hostname);
            } else {
                info!("{} polled successfully", device.hostname);
            }
        }
        Err(e) => {
            warn!("{} unreachable: {e}", device.hostname);
            if let Err(db_e) = db::mark_device_offline(
                &state.db,
                &device.id,
                &format!("SSH poll failed: {e}"),
            )
            .await
            {
                error!("mark_device_offline for {}: {db_e}", device.hostname);
            }
        }
    }
}

async fn poll_all_devices(state: Arc<AppState>, concurrency: usize) {
    let devices = match db::get_all_devices(&state.db).await {
        Ok(d) => d,
        Err(e) => {
            error!("Failed to load devices for polling: {e}");
            return;
        }
    };

    let sem = Arc::new(Semaphore::new(concurrency));
    let mut handles = Vec::new();

    for device in devices {
        let state = state.clone();
        let permit = sem.clone().acquire_owned().await.unwrap();
        let handle = tokio::spawn(async move {
            poll_one(state, &device.id).await;
            drop(permit);
        });
        handles.push(handle);
    }

    for h in handles {
        if let Err(e) = h.await {
            error!("Polling task panicked: {e}");
        }
    }
}
