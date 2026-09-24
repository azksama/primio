use serde_json::{json, Value};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    },
    Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH},
};
static STORAGE_LOCK: Mutex<()> = Mutex::new(());

pub fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
pub fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path)
}
pub fn free_space(path: &std::path::Path) -> u64 {
    use std::os::windows::ffi::OsStrExt;
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut available = 0;
    if unsafe {
        windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    } == 0
    {
        return 0;
    }
    available
}
fn store_path(app: &tauri::AppHandle, key: &str) -> Result<PathBuf, String> {
    if key.is_empty()
        || key.len() > 64
        || !key.bytes().all(|v| v.is_ascii_alphanumeric() || v == b'_')
    {
        return Err("Invalid storage key".into());
    }
    let path = data_dir(app)?.join("secure");
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path.join(format!("{key}.bin")))
}
fn protect(bytes: &[u8], decrypt: bool) -> Result<Vec<u8>, String> {
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    unsafe {
        let result = if decrypt {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if result == 0 {
            return Err("Windows could not unlock the local data.".into());
        }
        let data = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(output.pbData.cast());
        Ok(data)
    }
}
pub fn read(app: &tauri::AppHandle, key: &str) -> Result<Option<String>, String> {
    let _lock = STORAGE_LOCK.lock().map_err(|e| e.to_string())?;
    let path = store_path(app, key)?;
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read(path).map_err(|e| e.to_string())?;
    String::from_utf8(protect(&data, true)?)
        .map(Some)
        .map_err(|e| e.to_string())
}
pub fn write(app: &tauri::AppHandle, key: &str, value: &str) -> Result<(), String> {
    let _lock = STORAGE_LOCK.lock().map_err(|e| e.to_string())?;
    let path = store_path(app, key)?;
    let temp = path.with_extension("tmp");
    fs::write(&temp, protect(value.as_bytes(), false)?).map_err(|e| e.to_string())?;
    use std::os::windows::ffi::OsStrExt;
    let from: Vec<u16> = temp.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    if unsafe {
        MoveFileExW(
            from.as_ptr(),
            to.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        return Err("Could not save local data".into());
    }
    Ok(())
}
pub fn resource(app: &tauri::AppHandle, relative: &str) -> Result<PathBuf, String> {
    let root = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("windows");
    let installed = root.join(relative);
    if installed.exists() {
        return Ok(installed);
    }
    #[cfg(debug_assertions)]
    {
        let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources/windows")
            .join(relative);
        if dev.exists() {
            return Ok(dev);
        }
    }
    Err(format!("Missing Primio resource: {relative}"))
}
pub fn call(app: &tauri::AppHandle, command: &str, args: Value) -> Result<Value, String> {
    match command {
        "openLink" => {
            app.opener()
                .open_url(args["url"].as_str().ok_or("Invalid URL")?, None::<&str>)
                .map_err(|e| e.to_string())?;
            Ok(json!({}))
        }
        "copyText" => {
            arboard::Clipboard::new()
                .map_err(|e| e.to_string())?
                .set_text(args["text"].as_str().unwrap_or(""))
                .map_err(|e| e.to_string())?;
            Ok(json!({}))
        }
        "play" => crate::desktop_player::start(app, args),
        "downloadStart" => crate::desktop_downloads::start(app, args),
        "downloadList" => crate::desktop_downloads::list(app),
        "downloadRemove" => {
            crate::desktop_downloads::remove(app, args["id"].as_str().unwrap_or(""))
        }
        "playDownload" => crate::desktop_downloads::play(app, args),
        "notificationConfig" => {
            let raw = args["value"]
                .as_str()
                .ok_or("Missing notification configuration")?;
            write(app, "nativeNotificationConfig", raw)?;
            check_notifications(app);
            Ok(json!({}))
        }
        "notificationPermission" => {
            let state = app
                .notification()
                .permission_state()
                .map_err(|e| e.to_string())?;
            Ok(json!({"enabled":state==tauri_plugin_notification::PermissionState::Granted}))
        }
        _ => Err("Unsupported Windows operation".into()),
    }
}
pub fn check_notifications(app: &tauri::AppHandle) {
    let Ok(Some(raw)) = read(app, "nativeNotificationConfig") else {
        return;
    };
    let Ok(config) = serde_json::from_str::<Value>(&raw) else {
        return;
    };
    if config["episodes"].as_bool() != Some(true) {
        return;
    }
    let scope = config["scope"].as_str().unwrap_or("");
    let mut seen: Vec<String> = read(app, "nativeNotificationSeen")
        .ok()
        .flatten()
        .and_then(|v| serde_json::from_str(&v).ok())
        .unwrap_or_default();
    let time = now();
    let since = config["since"].as_u64().unwrap_or(time);
    for entry in config["entries"].as_array().into_iter().flatten() {
        let at = entry["at"].as_u64().unwrap_or(0);
        let id = format!("{}:{}", scope, entry["id"].as_str().unwrap_or(""));
        if at >= since && at <= time && time - at < 86400000 && !seen.contains(&id) {
            if app
                .notification()
                .builder()
                .title(entry["title"].as_str().unwrap_or("Primio"))
                .body(entry["body"].as_str().unwrap_or(""))
                .show()
                .is_ok()
            {
                seen.push(id);
            }
        }
    }
    if seen.len() > 2000 {
        seen.drain(0..seen.len() - 2000);
    }
    let _ = write(
        app,
        "nativeNotificationSeen",
        &serde_json::to_string(&seen).unwrap_or_default(),
    );
}
pub fn report_error(app: &tauri::AppHandle, error: String) {
    let _ = app.emit("player-error", error);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn windows_encryption_roundtrip_and_tamper() {
        let encrypted = protect(b"private-test-session", false).unwrap();
        assert_ne!(encrypted, b"private-test-session");
        assert_eq!(protect(&encrypted, true).unwrap(), b"private-test-session");
        let mut modified = encrypted;
        let n = modified.len() - 1;
        modified[n] ^= 1;
        assert!(protect(&modified, true).is_err());
    }
}
