use crate::desktop;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, LazyLock, Mutex,
    },
    time::Duration,
};
use tokio::io::AsyncWriteExt;

static LOCK: Mutex<()> = Mutex::new(());
static JOBS: LazyLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static IDS: AtomicU64 = AtomicU64::new(0);
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() < 80 && id.bytes().all(|v| v.is_ascii_alphanumeric() || v == b'-')
}
fn path(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) {
        return Err("Invalid download".into());
    }
    let dir = desktop::data_dir(app)?.join("downloads");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{id}.media")))
}
fn records(app: &tauri::AppHandle) -> Vec<Value> {
    desktop::read(app, "offlineDownloads")
        .ok()
        .flatten()
        .and_then(|v| serde_json::from_str(&v).ok())
        .unwrap_or_default()
}
fn save(app: &tauri::AppHandle, items: &[Value]) -> Result<(), String> {
    desktop::write(
        app,
        "offlineDownloads",
        &serde_json::to_string(items).map_err(|e| e.to_string())?,
    )
}
fn update(app: &tauri::AppHandle, id: &str, status: &str, bytes: u64, total: u64) {
    if let Ok(_lock) = LOCK.lock() {
        let mut items = records(app);
        if let Some(item) = items.iter_mut().find(|v| v["id"] == id) {
            item["status"] = json!(status);
            item["bytes"] = json!(bytes);
            item["total"] = json!(total);
            let _ = save(app, &items);
        }
    }
}
pub fn recover(app: &tauri::AppHandle) {
    if let Ok(_lock) = LOCK.lock() {
        let mut items = records(app);
        for item in &mut items {
            if ["downloading", "queued", "paused"].contains(&item["status"].as_str().unwrap_or(""))
            {
                item["status"] = json!("failed");
            }
            if item["status"] == "complete"
                && !path(app, item["id"].as_str().unwrap_or(""))
                    .map(|p| p.exists())
                    .unwrap_or(false)
            {
                item["status"] = json!("missing");
            }
        }
        let _ = save(app, &items);
    }
}
fn wifi() -> bool {
    use windows::Networking::Connectivity::NetworkInformation;
    NetworkInformation::GetInternetConnectionProfile()
        .and_then(|p| p.IsWlanConnectionProfile())
        .unwrap_or(false)
}
pub fn start(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let url = args["url"].as_str().ok_or("Missing media")?.to_owned();
    let parsed = crate::network::validate_media(&url)?;
    if [".m3u8", ".mpd"]
        .iter()
        .any(|ext| parsed.path().to_lowercase().ends_with(ext))
    {
        return Err("Offline downloads require a direct media file.".into());
    }
    let meta: Value = serde_json::from_str(args["metadata"].as_str().unwrap_or("{}"))
        .map_err(|e| e.to_string())?;
    let id = format!("{}-{}", desktop::now(), IDS.fetch_add(1, Ordering::Relaxed));
    let destination = path(app, &id)?;
    let cancel = Arc::new(AtomicBool::new(false));
    JOBS.lock()
        .map_err(|e| e.to_string())?
        .insert(id.clone(), cancel.clone());
    {
        let _lock = LOCK.lock().map_err(|e| e.to_string())?;
        let mut items = records(app);
        items.push(json!({"id":id,"title":args["title"],"status":"queued","bytes":0,"total":0,"createdAt":desktop::now(),"meta":meta}));
        save(app, &items)?;
    }
    let handle = app.clone();
    let job_id = id.clone();
    tauri::async_runtime::spawn(async move {
        let result = transfer(&handle, &job_id, &url, &args, &destination, &cancel).await;
        if result.is_err() && !cancel.load(Ordering::Relaxed) {
            let _guard = LOCK.lock();
            let mut items = records(&handle);
            if let Some(item) = items.iter_mut().find(|v| v["id"] == job_id) {
                item["status"] = json!("failed");
                let _ = save(&handle, &items);
            }
        }
        if cancel.load(Ordering::Relaxed) {
            let _ = tokio::fs::remove_file(&destination).await;
        }
        if let Ok(mut jobs) = JOBS.lock() {
            jobs.remove(&job_id);
        }
    });
    Ok(json!({"id":id}))
}
async fn transfer(
    app: &tauri::AppHandle,
    id: &str,
    url: &str,
    args: &Value,
    destination: &PathBuf,
    cancel: &AtomicBool,
) -> Result<(), String> {
    while args["wifiOnly"] == true && !wifi() {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        update(app, id, "paused", 0, 0);
        tokio::time::sleep(Duration::from_secs(5)).await;
    }
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .read_timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;
    let mut request = client.get(url);
    for (k, v) in args["headers"]
        .as_object()
        .into_iter()
        .flat_map(|v| v.iter())
    {
        request = request.header(k, v.as_str().unwrap_or(""));
    }
    let mut response = request
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let mime = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    if mime.contains("mpegurl") || mime.contains("dash+xml") || mime.contains("text/html") {
        update(app, id, "unsupported", 0, 0);
        return Ok(());
    }
    let total = response.content_length().unwrap_or(0);
    let mut bytes = 0;
    let mut last = std::time::Instant::now();
    let mut file = tokio::fs::File::create(destination)
        .await
        .map_err(|e| e.to_string())?;
    update(app, id, "downloading", bytes, total);
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        while args["wifiOnly"] == true && !wifi() {
            if cancel.load(Ordering::Relaxed) {
                return Ok(());
            }
            update(app, id, "paused", bytes, total);
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
        let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? else {
            break;
        };
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        bytes += chunk.len() as u64;
        if last.elapsed() > Duration::from_secs(2) {
            update(app, id, "downloading", bytes, total);
            last = std::time::Instant::now();
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    if total > 0 && bytes != total {
        return Err("Incomplete download".into());
    }
    if bytes == 0 {
        return Err("Empty media".into());
    }
    update(app, id, "complete", bytes, bytes);
    Ok(())
}
pub fn remove(app: &tauri::AppHandle, id: &str) -> Result<Value, String> {
    let file = path(app, id)?;
    if let Some(job) = JOBS.lock().map_err(|e| e.to_string())?.get(id) {
        job.store(true, Ordering::Relaxed);
    }
    let _lock = LOCK.lock().map_err(|e| e.to_string())?;
    let mut items = records(app);
    if !items.iter().any(|v| v["id"] == id) {
        return Err("Download not found".into());
    }
    if file.exists() {
        match std::fs::remove_file(file) {
            Ok(()) => {}
            Err(e) if !JOBS.lock().map_err(|e| e.to_string())?.contains_key(id) => {
                return Err(e.to_string())
            }
            _ => {}
        }
    }
    items.retain(|v| v["id"] != id);
    save(app, &items)?;
    Ok(json!({}))
}
pub fn list(app: &tauri::AppHandle) -> Result<Value, String> {
    let policy: Value = desktop::read(app, "downloadPolicy")?
        .and_then(|v| serde_json::from_str(&v).ok())
        .unwrap_or(Value::Null);
    for item in records(app) {
        if item["status"] != "complete" || item["meta"]["accountId"] != policy["accountId"] {
            continue;
        }
        for profile in policy["profiles"].as_array().into_iter().flatten() {
            let days = profile["days"].as_u64().unwrap_or(0);
            if days == 0 || item["meta"]["profileId"] != profile["id"] {
                continue;
            }
            let watched = profile["watched"]
                .as_array()
                .into_iter()
                .flatten()
                .any(|p| {
                    p["videoId"] == item["meta"]["videoId"]
                        && p["type"] == item["meta"]["meta"]["type"]
                });
            if !watched
                && desktop::now().saturating_sub(item["createdAt"].as_u64().unwrap_or(u64::MAX))
                    >= days.saturating_mul(86_400_000)
            {
                let _ = remove(app, item["id"].as_str().unwrap_or(""));
            }
        }
    }
    Ok(json!({"items":records(app)}))
}
pub fn remove_watched(app: &tauri::AppHandle, context: &Value) {
    for item in records(app) {
        if item["meta"]["accountId"] == context["accountId"]
            && item["meta"]["profileId"] == context["profileId"]
            && item["meta"]["videoId"] == context["videoId"]
            && item["meta"]["meta"]["type"] == context["meta"]["type"]
        {
            let _ = remove(app, item["id"].as_str().unwrap_or(""));
        }
    }
}
pub fn play(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let id = args["id"].as_str().ok_or("Missing download")?;
    let item = records(app)
        .into_iter()
        .find(|v| v["id"] == id && v["status"] == "complete")
        .ok_or("Download unavailable")?;
    let file = path(app, id)?;
    if !file.exists() {
        return Err("Download file unavailable".into());
    }
    let mut options: Value = serde_json::from_str(args["options"].as_str().unwrap_or("{}"))
        .map_err(|e| e.to_string())?;
    options["playerExtra"] = json!(options.to_string());
    options["progressContext"] = options["context"].clone();
    options["url"] = json!(file.to_string_lossy());
    options["title"] = item["title"].clone();
    crate::desktop_player::start(app, options)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_download_path_traversal() {
        for bad in ["../secret", "C:\\secret", "", "a/b", "a.b", "../", "a:b"] {
            assert!(!valid_id(bad));
        }
        assert!(valid_id("172222222-3"));
    }
}
