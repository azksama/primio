use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};

static BUSY: AtomicBool = AtomicBool::new(false);

// Native playback continues while the Android WebView is suspended.
pub fn publish(app: &tauri::AppHandle, event: &Value) {
    if (event["duration"].as_f64().unwrap_or(0.0) <= 0.0
        && event["watchedChanges"]
            .as_array()
            .is_none_or(|changes| changes.is_empty()))
        || BUSY.swap(true, Ordering::SeqCst)
    {
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
    let raw = crate::secure_read(app.clone(), "session".into())
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
    let snapshot = crate::secure_read(app, "state".into())
        .await?
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok());
    let progress = playback_items(&event, snapshot.as_ref());
    if progress.is_empty() {
        return Ok(());
    }
    crate::network::api_request(
        "/account/progress".into(),
        "POST".into(),
        json!({"profiles":[{"id":context["profileId"],"progress":progress}]}),
        Some(token.into()),
    )
    .await
    .map_err(|e| e.message)?;
    Ok(())
}

fn playback_items(event: &Value, snapshot: Option<&Value>) -> Vec<Value> {
    let context = &event["context"];
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
    let mut items = Vec::new();
    if event["duration"].as_f64().is_some_and(|v| v > 0.0) {
        items.push(item.clone());
    }
    let previous = snapshot
        .and_then(|s| s["profiles"].as_array())
        .and_then(|profiles| profiles.iter().find(|p| p["id"] == context["profileId"]))
        .and_then(|p| p["progress"].as_array());
    for change in event["watchedChanges"]
        .as_array()
        .into_iter()
        .flatten()
        .take(500)
    {
        if change["videoId"].as_str().is_none()
            || change["watched"].as_bool().is_none()
            || change["updatedAt"]
                .as_f64()
                .is_none_or(|time| time > event["updatedAt"].as_f64().unwrap_or(0.0))
        {
            continue;
        }
        if change["videoId"] == context["videoId"] && !items.is_empty() {
            let passed_threshold = change["watched"].as_bool() == Some(false)
                && change["position"]
                    .as_f64()
                    .zip(change["duration"].as_f64())
                    .is_some_and(|(p, d)| d > 0.0 && p / d < 0.95)
                && event["position"]
                    .as_f64()
                    .zip(event["duration"].as_f64())
                    .is_some_and(|(p, d)| d > 0.0 && p / d >= 0.95);
            items[0]["watched"] = json!(passed_threshold || change["watched"] == true);
            continue;
        }
        let mut status = previous
            .and_then(|entries| {
                entries
                    .iter()
                    .find(|p| p["videoId"] == change["videoId"] && p["type"] == meta["type"])
            })
            .cloned()
            .unwrap_or_else(|| {
                let mut entry = item.clone();
                entry["position"] = json!(0);
                entry["duration"] = json!(1);
                entry.as_object_mut().unwrap().remove("episodeThumbnail");
                entry
            });
        status["videoId"] = change["videoId"].clone();
        status["watched"] = change["watched"].clone();
        status["updatedAt"] = change["updatedAt"].clone();
        for key in ["season", "episode"] {
            if !change[key].is_null() {
                status[key] = change[key].clone();
            }
        }
        items.push(status);
    }
    items
}

#[cfg(test)]
mod tests {
    use super::*;
    fn event() -> Value {
        json!({"context":{"profileId":"one","meta":{"id":"series","type":"series","name":"Series"},"videoId":"s3e5"},"position":980,"duration":1000,"updatedAt":20})
    }
    #[test]
    fn preserves_manual_unmark_at_completed_playhead() {
        let mut event = event();
        event["watchedChanges"] = json!([{"videoId":"s3e5","watched":false,"updatedAt":19,"position":970,"duration":1000}]);
        let progress = playback_items(&event, None);
        assert_eq!(progress.len(), 1);
        assert_eq!(progress[0]["watched"], false);
        assert_eq!(progress[0]["position"], 980);
        event["watchedChanges"][0]["position"] = json!(500);
        assert_eq!(playback_items(&event, None)[0]["watched"], true);
    }
    #[test]
    fn status_edits_preserve_another_episodes_progress() {
        let mut event = event();
        event["watchedChanges"] =
            json!([{"videoId":"s3e6","watched":true,"updatedAt":19,"season":3,"episode":6}]);
        let snapshot = json!({"profiles":[{"id":"one","progress":[{"id":"series","type":"series","videoId":"s3e6","position":450,"duration":1000,"updatedAt":10,"episodeThumbnail":"episode.jpg"}]}]});
        let progress = playback_items(&event, Some(&snapshot));
        assert_eq!(progress[1]["position"], 450);
        assert_eq!(progress[1]["duration"], 1000);
        assert_eq!(progress[1]["watched"], true);
        assert_eq!(progress[1]["season"], 3);
        assert_eq!(progress[1]["episodeThumbnail"], "episode.jpg");
    }
    #[test]
    fn sends_status_edits_when_media_has_no_duration() {
        let mut event = event();
        event["duration"] = json!(0);
        event["watchedChanges"] =
            json!([{"videoId":"s3e6","watched":false,"updatedAt":19,"season":3,"episode":6}]);
        let progress = playback_items(&event, None);
        assert_eq!(progress.len(), 1);
        assert_eq!(progress[0]["videoId"], "s3e6");
        assert_eq!(progress[0]["duration"], 1);
    }
}
