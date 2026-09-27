use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::Manager;

fn validate_id(id: &str) -> Result<(), String> {
    if id.len() != 64 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Invalid font identifier".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn prepare_subtitle_font(app: tauri::AppHandle, id: String, data: Vec<u8>) -> Result<Value, String> {
    validate_id(&id)?;
    if data.len() < 12 || data.len() > 5_000_000
        || !(data.starts_with(b"OTTO") || data.starts_with(&[0, 1, 0, 0]))
        || format!("{:x}", Sha256::digest(&data)) != id {
        return Err("Invalid font".into());
    }
    let directory = app.path().app_data_dir().map_err(|e| e.to_string())?.join("subtitle-fonts");
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let path = directory.join(format!("{id}.ttf"));
    if !path.exists() { std::fs::write(&path, data).map_err(|e| e.to_string())?; }
    Ok(json!({"directory": directory, "path": path}))
}
#[tauri::command]
pub async fn remove_subtitle_font(app: tauri::AppHandle, id: String) -> Result<(), String> {
    validate_id(&id)?;
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join("subtitle-fonts").join(format!("{id}.ttf"));
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
