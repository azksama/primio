#[cfg(target_os = "windows")]
mod desktop;
#[cfg(target_os = "windows")]
mod desktop_downloads;
#[cfg(target_os = "windows")]
mod desktop_player;
mod extensions;
mod network;
#[cfg(target_os = "android")]
mod player;
mod updates;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
#[cfg(any(target_os = "android", target_os = "windows"))]
use tauri::Manager;
#[cfg(target_os = "android")]
struct Mobile(tauri::plugin::PluginHandle<tauri::Wry>);
#[derive(Debug, Serialize)]
pub struct ApiError {
    message: String,
    status: u16,
    data: Value,
}
#[tauri::command]
async fn fetch_json(url: String) -> Result<Value, String> {
    let mut response = network::fetch_json(&url).await?;
    for extension in extensions::registry() {
        response = extension.resource(&url, response)?;
    }
    Ok(response)
}
#[tauri::command]
async fn provider_request(operation: String, body: Value) -> Result<Value, String> {
    network::provider_request(&operation, body).await
}
#[tauri::command]
async fn api_request(
    path: String,
    method: String,
    body: Value,
    token: Option<String>,
) -> Result<Value, ApiError> {
    network::api_request(&path, &method, body, token).await
}
fn mobile_call(app: &tauri::AppHandle, command: &str, args: Value) -> Result<Value, String> {
    #[cfg(target_os = "android")]
    {
        app.state::<Mobile>()
            .0
            .run_mobile_plugin(command, args)
            .map_err(|e| e.to_string())
    }
    #[cfg(target_os = "windows")]
    {
        desktop::call(app, command, args)
    }
    #[cfg(not(any(target_os = "android", target_os = "windows")))]
    {
        let _ = (app, command, args);
        Err("Cette fonction native est disponible sur Android.".into())
    }
}
#[tauri::command]
async fn notification_config(app: tauri::AppHandle, data: String) -> Result<Value, String> {
    if data.len() > 1_000_000 {
        return Err("Notification data too large".into());
    }
    mobile_call(&app, "notificationConfig", json!({"value":data}))
}
#[tauri::command]
async fn notification_permission(app: tauri::AppHandle, request: bool) -> Result<Value, String> {
    mobile_call(&app, "notificationPermission", json!({"request":request}))
}
#[tauri::command]
async fn native_auth(app: tauri::AppHandle, register: bool) -> Result<Value, String> {
    loop {
        let input = mobile_call(&app, "authForm", json!({"register": register}))?;
        if input["cancelled"].as_bool().unwrap_or(false) {
            return Ok(input);
        }
        let signup = input["register"].as_bool().unwrap_or(false);
        let path = if signup {
            "/auth/signup"
        } else {
            "/auth/login"
        };
        match network::api_request(path.into(), "POST".into(), input.clone(), None).await {
            Ok(mut result) => {
                mobile_call(&app, "authComplete", json!({"success": true}))?;
                result["email"] = input["email"].clone();
                result["register"] = json!(signup);
                return Ok(result);
            }
            Err(error) => {
                mobile_call(
                    &app,
                    "authComplete",
                    json!({"success": false, "message": error.message}),
                )?;
            }
        }
    }
}
#[tauri::command]
async fn secure_read(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    if ![
        "state",
        "session",
        "plugins",
        "playerProgress",
        "notifications",
        "onboarding",
        "startupProfile",
        "downloadPolicy",
    ]
    .contains(&key.as_str())
    {
        return Err("Clé invalide".into());
    }
    #[cfg(target_os = "android")]
    {
        let value = mobile_call(&app, "secureRead", json!({"key":key}))?;
        Ok(value["value"].as_str().map(str::to_owned))
    }
    #[cfg(target_os = "windows")]
    {
        desktop::read(&app, &key)
    }
    #[cfg(not(any(target_os = "android", target_os = "windows")))]
    {
        let _ = app;
        Ok(None)
    }
}
#[tauri::command]
async fn secure_write(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    if ![
        "state",
        "session",
        "plugins",
        "notifications",
        "onboarding",
        "startupProfile",
        "downloadPolicy",
    ]
    .contains(&key.as_str())
        || value.len() > 2_000_000
    {
        return Err("Données invalides".into());
    }
    #[cfg(target_os = "android")]
    {
        mobile_call(&app, "secureWrite", json!({"key":key,"value":value}))?;
    }
    #[cfg(target_os = "windows")]
    {
        desktop::write(&app, &key, &value)?;
    }
    #[cfg(not(any(target_os = "android", target_os = "windows")))]
    {
        let _ = (app, value);
    }
    Ok(())
}
#[derive(Serialize, Deserialize)]
pub struct Subtitle {
    pub id: String,
    pub url: String,
    pub lang: String,
}
#[tauri::command]
async fn play_media(
    app: tauri::AppHandle,
    url: String,
    title: String,
    external: bool,
    position: f64,
    progress_context: String,
    player_extra: String,
    headers: std::collections::HashMap<String, String>,
    subtitles: Vec<Subtitle>,
    language: String,
    subtitle_language: String,
    seek_backward: u32,
    seek_forward: u32,
    subtitle_size: u32,
    playback_speed: f64,
    hardware_decoding: bool,
    cache_size_gb: f64,
    skip_segments: Value,
    auto_skip_intro: bool,
    show_subtitles: bool,
) -> Result<(), String> {
    let mut request = primio_plugin_sdk::PlaybackRequest {
        url,
        title,
        headers,
    };
    for extension in extensions::registry() {
        request = extension.before_play(request)?;
    }
    let primio_plugin_sdk::PlaybackRequest {
        url,
        title,
        headers,
    } = request;
    network::validate_media(&url)?;
    if headers.len() > 20
        || headers.iter().any(|(k, v)| {
            k.len() > 100 || v.len() > 4096 || k.contains(['\r', '\n']) || v.contains(['\r', '\n'])
        })
    {
        return Err("En-têtes invalides".into());
    }
    for s in &subtitles {
        network::validate_media(&s.url)?;
    }
    mobile_call(
        &app,
        "play",
        json!({"url":url,"title":title,"external":external,"position":position.max(0.0),"progressContext":progress_context,"playerExtra":player_extra,"headers":headers,"subtitles":subtitles,"language":language,"showSubtitles":show_subtitles,"subtitleLanguage":subtitle_language,"seekBackward":seek_backward.clamp(5,60),"seekForward":seek_forward.clamp(5,60),"subtitleSize":subtitle_size.clamp(24,72),"playbackSpeed":playback_speed.clamp(0.5,2.0),"hardwareDecoding":hardware_decoding,"cacheSizeGb":cache_size_gb.clamp(0.0,10.0),"skipSegments":skip_segments,"autoSkipIntro":auto_skip_intro}),
    )?;
    Ok(())
}
#[tauri::command]
async fn open_link(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|_| "Lien invalide")?;
    if parsed.scheme() != "https" {
        return Err("HTTPS requis".into());
    }
    mobile_call(&app, "openLink", json!({"url":url}))?;
    Ok(())
}
#[tauri::command]
async fn download_start(
    app: tauri::AppHandle,
    url: String,
    title: String,
    metadata: Value,
    headers: std::collections::HashMap<String, String>,
    wifi_only: bool,
) -> Result<Value, String> {
    network::validate_media(&url)?;
    if headers.len() > 20
        || headers.iter().any(|(k, v)| {
            k.len() > 100 || v.len() > 4096 || k.contains(['\r', '\n']) || v.contains(['\r', '\n'])
        })
    {
        return Err("En-têtes invalides".into());
    }
    mobile_call(
        &app,
        "downloadStart",
        json!({"url":url,"title":title,"metadata":metadata.to_string(),"headers":headers,"wifiOnly":wifi_only}),
    )
}
#[tauri::command]
async fn download_list(app: tauri::AppHandle) -> Result<Value, String> {
    mobile_call(&app, "downloadList", json!({}))
}
#[tauri::command]
async fn download_remove(app: tauri::AppHandle, id: String) -> Result<Value, String> {
    mobile_call(&app, "downloadRemove", json!({"id":id}))
}
#[tauri::command]
async fn play_download(app: tauri::AppHandle, id: String, options: Value) -> Result<Value, String> {
    mobile_call(
        &app,
        "playDownload",
        json!({"id":id,"options":options.to_string()}),
    )
}
#[tauri::command]
async fn copy_text(app: tauri::AppHandle, text: String) -> Result<Value, String> {
    if text.len() > 16384 {
        return Err("Texte trop long".into());
    }
    mobile_call(&app, "copyText", json!({"text":text}))
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "windows")]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            updates::cleanup(app.handle());
            desktop_downloads::recover(app.handle());
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    desktop::check_notifications(&handle);
                    tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                desktop_player::stop();
            }
        });
    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("primio-native")
                .setup(|app, api| {
                    #[cfg(target_os = "android")]
                    {
                        let handle =
                            api.register_android_plugin("fr.azks.primio", "PrimioPlugin")?;
                        app.manage(Mobile(handle));
                        player::APP.set(app.clone()).ok();
                    }
                    #[cfg(not(target_os = "android"))]
                    let _ = (app, api);
                    Ok(())
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            fetch_json,
            provider_request,
            updates::update_check,
            updates::update_download,
            updates::update_install,
            api_request,
            native_auth,
            notification_config,
            notification_permission,
            secure_read,
            secure_write,
            play_media,
            open_link,
            download_start,
            download_list,
            download_remove,
            play_download,
            copy_text
        ])
        .run(tauri::generate_context!())
        .expect("Primio could not start");
}
