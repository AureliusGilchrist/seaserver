use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const CONFIG_FILE: &str = "server_config.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub mode: String, // "local" or "remote"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote_url: Option<String>,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            mode: String::new(), // empty = not configured yet
            remote_url: None,
        }
    }
}

fn config_path(app: &AppHandle) -> PathBuf {
    let data_dir = app
        .path()
        .app_data_dir()
        .expect("failed to resolve app data dir");
    fs::create_dir_all(&data_dir).ok();
    data_dir.join(CONFIG_FILE)
}

pub fn load_config(app: &AppHandle) -> Option<ServerConfig> {
    let path = config_path(app);
    if !path.exists() {
        return None;
    }
    let data = fs::read_to_string(&path).ok()?;
    let cfg: ServerConfig = serde_json::from_str(&data).ok()?;
    if cfg.mode.is_empty() {
        return None;
    }
    Some(cfg)
}

pub fn save_config(app: &AppHandle, cfg: &ServerConfig) -> Result<(), String> {
    let path = config_path(app);
    let data = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(())
}
