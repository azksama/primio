use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};

static BUSY: AtomicBool = AtomicBool::new(false);

// Native playback continues while the Android WebView is suspended.
pub fn publish(app: &tauri::AppHandle, event: &Value) {
    if event["duration"].as_f64().unwrap_or(0.0) <= 0.0 || BUSY.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    let event = event.clone();
    tauri::async_runtime::spawn(async move {
        let _ = upload(app, event).await;
        BUSY.store(false, Ordering::SeqCst);
    });
}

async fn upload(app: tauri::AppHandle, event: Value) -> Result<(), String> {
    let raw = crate::secure_read(app, "session".into())
        .await?
        .ok_or("No session")?;
    let session: Value = serde_json::from_str(&raw).map_err(|_| "Invalid session")?;
    let token = session["token"]
        .as_str()
        .filter(|v| !v.is_empty())
        .ok_or("No session")?;
    let context = &event["context"];
    if context["accountId"] != session["email"] {
        return Err("Account changed".into());
    }
    let meta = &context["meta"];
    let mut item = json!({"id":meta["id"],"type":meta["type"],"name":meta["name"],
        "videoId":context["videoId"],"position":event["position"],"duration":event["duration"],"updatedAt":event["updatedAt"]});
    for key in ["poster", "category", "seasonCount"] {
        if !meta[key].is_null() {
            item[key] = meta[key].clone();
        }
    }
    if let Some(video) = meta["videos"]
        .as_array()
        .and_then(|v| v.iter().find(|v| v["id"] == context["videoId"]))
    {
        for (from, to) in [
            ("thumbnail", "episodeThumbnail"),
            ("episode", "episode"),
            ("season", "season"),
        ] {
            if !video[from].is_null() {
                item[to] = video[from].clone();
            }
        }
    }
    crate::network::api_request(
        "/account/progress".into(),
        "POST".into(),
        json!({"profiles":[{"id":context["profileId"],"progress":[item]}]}),
        Some(token.into()),
    )
    .await
    .map_err(|e| e.message)?;
    Ok(())
}
