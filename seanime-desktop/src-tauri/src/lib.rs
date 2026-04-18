mod config;
mod constants;
mod server;
#[cfg(desktop)]
mod tray;

use config::ServerConfig;
use constants::MAIN_WINDOW_LABEL;
use std::sync::{Arc, Mutex};
#[cfg(target_os = "macos")]
use tauri::utils::TitleBarStyle;
use tauri::{Emitter, Listener, Manager};
use tauri_plugin_os;

// ── Tauri commands exposed to the frontend ──────────────────────────────────

#[tauri::command]
fn get_server_config(app: tauri::AppHandle) -> Option<ServerConfig> {
    config::load_config(&app)
}

#[tauri::command]
fn save_server_config(app: tauri::AppHandle, mode: String, remote_url: Option<String>) -> Result<(), String> {
    let cfg = ServerConfig {
        mode,
        remote_url,
    };
    config::save_config(&app, &cfg)
}

/// Validate a remote server by making an HTTP HEAD/GET request.
/// Returns Ok(true) if any HTTP response is received (even 401/403).
#[tauri::command]
async fn validate_remote_server(url: String) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let target = if url.ends_with('/') {
        format!("{}api/v1/status", url)
    } else {
        format!("{}/api/v1/status", url)
    };

    match client.get(&target).send().await {
        Ok(_) => Ok(true),
        Err(e) => {
            if e.is_timeout() {
                Err("Connection timed out".to_string())
            } else if e.is_connect() {
                Err("Could not connect to server".to_string())
            } else {
                Err(format!("Connection failed: {}", e))
            }
        }
    }
}

/// Called by the splashscreen after saving a "local" config to start the sidecar.
#[tauri::command]
fn start_local_server(app: tauri::AppHandle) -> Result<(), String> {
    app.emit("launch-local-server", "").map_err(|e| e.to_string())
}

// ── Main entry point ────────────────────────────────────────────────────────

pub fn run() {
    let server_process = Arc::new(Mutex::new(
        None::<tauri_plugin_shell::process::CommandChild>,
    ));
    let server_process_for_setup = Arc::clone(&server_process);
    let server_process_for_restart = Arc::clone(&server_process);
    //
    let is_shutdown = Arc::new(Mutex::new(false));
    let is_shutdown_for_setup = Arc::clone(&is_shutdown);
    let is_shutdown_for_restart = Arc::clone(&is_shutdown);

    let server_started = Arc::new(Mutex::new(false));
    let server_started_for_setup = Arc::clone(&server_started);
    let server_started_for_restart = Arc::clone(&server_started);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _cmd, _args| {
            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                window.show().unwrap();
                window.set_focus().unwrap();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            get_server_config,
            save_server_config,
            validate_remote_server,
            start_local_server,
        ])
        .setup(move |app| {
            #[cfg(all(desktop))]
            {
                let handle = app.handle();
                tray::create_tray(handle)?;
            }

            let main_window = app.get_webview_window(MAIN_WINDOW_LABEL).unwrap();
            main_window.hide().unwrap();

            // Set overlay title bar only when building for macOS
            #[cfg(target_os = "macos")]
            main_window
                .set_title_bar_style(TitleBarStyle::Overlay)
                .unwrap();

            // Hide the title bar on Windows
            #[cfg(any(target_os = "windows"))]
            main_window.set_decorations(false).unwrap();

            // Open dev tools only when in dev mode
            #[cfg(debug_assertions)]
            {
                main_window.open_devtools();
            }

            // ── Boot flow: check saved config ──
            let cfg = config::load_config(app.handle());

            match cfg.as_ref().map(|c| c.mode.as_str()) {
                Some("remote") => {
                    // Remote mode — skip sidecar, tell splashscreen to proceed
                    let url = cfg.unwrap().remote_url.unwrap_or_default();
                    println!("Boot: remote mode -> {}", url);
                    app.emit("remote-ready", url).ok();
                }
                Some("local") => {
                    // Local mode — launch sidecar (existing behavior)
                    println!("Boot: local mode");
                    server::launch_seanime_server(
                        app.handle().clone(),
                        server_process_for_setup,
                        is_shutdown_for_setup,
                        server_started_for_setup,
                    );
                }
                _ => {
                    // No config yet — tell splashscreen to show the setup screen
                    println!("Boot: no config, showing setup");
                    app.emit("show-setup", "").ok();
                }
            }

            // Listen for "launch-local-server" from the frontend (after user picks local in setup)
            let app_handle_launch = app.handle().clone();
            let sp_launch = Arc::clone(&server_process);
            let is_launch = Arc::clone(&is_shutdown);
            let ss_launch = Arc::clone(&server_started);
            app.listen("launch-local-server", move |_| {
                println!("EVENT launch-local-server");
                server::launch_seanime_server(
                    app_handle_launch.clone(),
                    Arc::clone(&sp_launch),
                    Arc::clone(&is_launch),
                    Arc::clone(&ss_launch),
                );
            });

            let app_handle = app.handle().clone();
            app.listen("restart-server", move |_| {
                println!("EVENT restart-server");
                let mut child_guard = server_process_for_restart.lock().unwrap();
                if let Some(child) = child_guard.take() {
                    println!("Killing existing server process");
                    // Kill the existing server process
                    if let Err(e) = child.kill() {
                        eprintln!("Failed to kill server process: {}", e);
                    }
                }
                server::launch_seanime_server(
                    app_handle.clone(),
                    Arc::clone(&server_process_for_restart),
                    Arc::clone(&is_shutdown_for_restart),
                    Arc::clone(&server_started_for_restart),
                );
            });

            let app_handle_1 = app.handle().clone();
            let main_window_clone = main_window.clone();
            main_window.listen("macos-activation-policy-accessory", move |_| {
                println!("EVENT macos-activation-policy-accessory");
                #[cfg(target_os = "macos")]
                {
                    if let Err(e) = app_handle_1.set_activation_policy(tauri::ActivationPolicy::Accessory) {
                        eprintln!("Failed to set activation policy to accessory: {}", e);
                    } else {
                        if let Err(e) = main_window_clone.show() {
                            eprintln!("Failed to show main window: {}", e);
                        }
                        if let Err(e) = main_window_clone.set_fullscreen(true) {
                            eprintln!("Failed to set fullscreen: {}", e);
                        } else {
                            std::thread::sleep(std::time::Duration::from_millis(150));
                            if let Err(e) = main_window_clone.set_focus() {
                                eprintln!("Failed to set focus after fullscreen: {}", e);
                            }
                            main_window_clone.emit("macos-activation-policy-accessory-done", "").unwrap();
                        }
                    }
                }
            });

            // main_window.on_window_event()

            let app_handle_2 = app.handle().clone();
            main_window.listen("macos-activation-policy-regular", move |_| {
                println!("EVENT macos-activation-policy-regular");
                #[cfg(target_os = "macos")]
                app_handle_2
                    .set_activation_policy(tauri::ActivationPolicy::Regular)
                    .unwrap();
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run({
            let server_process_for_exit = Arc::clone(&server_process);
            let is_shutdown_for_exit = Arc::clone(&is_shutdown);
            move |app, event| {
                let server_process_for_exit_ = Arc::clone(&server_process);
                app.listen("kill-server", move |_| {
                    let mut child_guard = server_process_for_exit_.lock().unwrap();
                    if let Some(child) = child_guard.take() {
                        // Kill server process
                        if let Err(e) = child.kill() {
                            eprintln!("Failed to kill server process: {}", e);
                        }
                    }
                });

                match event {
                    tauri::RunEvent::WindowEvent {
                        label,
                        event: tauri::WindowEvent::CloseRequested { api, .. },
                        ..
                    } => {
                        let is_shutdown_guard = is_shutdown_for_exit.lock().unwrap();
                        if label.as_str() == MAIN_WINDOW_LABEL && !*is_shutdown_guard {
                            println!("Main window close request");
                            // Hide the window when user clicks 'X'
                            let win = app.get_webview_window(label.as_str()).unwrap();
                            win.hide().unwrap();
                            // Prevent the window from being closed
                            api.prevent_close();
                            #[cfg(target_os = "macos")]
                            app.set_activation_policy(tauri::ActivationPolicy::Accessory)
                                .unwrap();
                        }
                    }

                    // The app is about to exit
                    tauri::RunEvent::ExitRequested { .. } => {
                        println!("Main window exit request");
                        let mut child_guard = server_process_for_exit.lock().unwrap();
                        if let Some(child) = child_guard.take() {
                            // Kill server process
                            if let Err(e) = child.kill() {
                                eprintln!("Failed to kill server process: {}", e);
                            }
                        }
                    }
                    _ => {}
                }
            }
        });
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
