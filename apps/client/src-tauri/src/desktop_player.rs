use crate::desktop;
use serde_json::{json, Value};
use std::os::windows::process::CommandExt;
use std::{
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::windows::named_pipe::ClientOptions;

static PLAYER: Mutex<Option<Arc<Mutex<Child>>>> = Mutex::new(None);
static GENERATION: AtomicU64 = AtomicU64::new(0);

pub fn stop() {
    if let Ok(mut current) = PLAYER.lock() {
        if let Some(child) = current.take() {
            if let Ok(mut child) = child.lock() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn decoded(value: &Value) -> Value {
    value
        .as_str()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_else(|| value.clone())
}

// mpv's Lua runtime cannot resolve Windows extended-length path prefixes.
fn player_path(path: &std::path::Path) -> String {
    let raw = path.to_string_lossy();
    if let Some(unc) = raw.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{unc}");
    }
    raw.strip_prefix(r"\\?\").unwrap_or(&raw).to_owned()
}

pub fn start(app: &tauri::AppHandle, args: Value) -> Result<Value, String> {
    let executable = desktop::resource(app, "mpv/primio-player.exe")?;
    let config_dir = desktop::resource(app, "player")?;
    let url = args["url"].as_str().ok_or("Missing media")?.to_owned();
    let extra = decoded(&args["playerExtra"]);
    let context = decoded(&args["progressContext"]);
    stop();
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let pipe_name = format!(
        r"\\.\pipe\primio-{}-{}-{}",
        std::process::id(),
        desktop::now(),
        generation
    );
    let config = desktop::data_dir(app)?.join(format!("player-{generation}.json"));
    let mut settings = extra.clone();
    settings["title"] = args["title"].clone();
    settings["audioLanguage"] = args["language"].clone();
    let logo_dir = desktop::data_dir(app)?.join(format!("logo-{generation}"));
    settings["logoPath"] = json!(player_path(&logo_dir));
    let logo_url = extra["logo"].as_str().unwrap_or("").to_owned();
    let logo_task_dir = logo_dir.clone();
    let logo_task = tauri::async_runtime::spawn(async move {
        let _ = prepare_logo(&logo_url, &logo_task_dir).await;
    });
    settings["skipSegments"] = args["skipSegments"].clone();
    settings["autoSkipIntro"] = args["autoSkipIntro"].clone();
    let cache = desktop::data_dir(app)?.join("cache");
    std::fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
    let cache_gb = args["cacheSizeGb"].as_f64().unwrap_or(0.0).clamp(0.0, 10.0);
    let cache_bytes = ((cache_gb * 1_000_000_000.0) as u64)
        .min(desktop::free_space(&cache).saturating_sub(256_000_000));
    settings["cacheLimitBytes"] = json!(cache_bytes);
    std::fs::write(&config, settings.to_string()).map_err(|e| e.to_string())?;
    let mut command = Command::new(executable);
    command
        .creation_flags(0x08000000)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .arg("--idle=yes")
        .arg("--force-window=immediate")
        .arg("--border=no")
        .arg("--osc=no")
        .arg("--osd-font=Inter")
        .arg("--input-default-bindings=yes")
        .arg("--keep-open=no")
        .arg("--save-position-on-quit=no")
        .arg("--fullscreen=yes")
        .arg("--geometry=50%:50%")
        .arg(format!("--config-dir={}", player_path(&config_dir)))
        .arg(format!("--input-ipc-server={pipe_name}"))
        .arg(format!(
            "--title={}",
            args["title"].as_str().unwrap_or("Primio")
        ))
        .arg(format!(
            "--hwdec={}",
            if args["hardwareDecoding"].as_bool().unwrap_or(true) {
                "auto-safe"
            } else {
                "no"
            }
        ))
        .arg(format!(
            "--speed={}",
            args["playbackSpeed"]
                .as_f64()
                .unwrap_or(1.0)
                .clamp(0.5, 2.0)
        ))
        .arg(format!(
            "--start={}",
            args["position"].as_f64().unwrap_or(0.0).max(0.0)
        ))
        .arg(format!(
            "--alang={}",
            args["language"]
                .as_str()
                .filter(|v| *v != "original" && *v != "auto")
                .unwrap_or("")
        ))
        .arg(format!(
            "--slang={}",
            args["subtitleLanguage"].as_str().unwrap_or("en")
        ))
        .arg(format!(
            "--sub-visibility={}",
            if args["showSubtitles"].as_bool().unwrap_or(true) {
                "yes"
            } else {
                "no"
            }
        ))
        .arg(format!("--demuxer-cache-dir={}", player_path(&cache)))
        .arg(format!(
            "--cache-on-disk={}",
            if cache_bytes > 128_000_000 {
                "yes"
            } else {
                "no"
            }
        ))
        .arg("--demuxer-max-bytes=64MiB")
        .arg("--demuxer-cache-unlink-files=immediate")
        .arg(format!(
            "--script-opt=uosc-languages={}",
            extra["locale"].as_str().unwrap_or("en")
        ))
        .env("PRIMIO_PLAYER_CONFIG", player_path(&config));
    let child = match command.spawn() {
        Ok(child) => Arc::new(Mutex::new(child)),
        Err(e) => {
            logo_task.abort();
            let _ = std::fs::remove_dir_all(&logo_dir);
            let _ = std::fs::remove_file(&config);
            return Err(format!("Could not open the player: {e}"));
        }
    };
    *PLAYER.lock().map_err(|e| e.to_string())? = Some(child.clone());
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut position = args["position"].as_f64().unwrap_or(0.0);
        let mut duration = 0.0;
        let result = run(
            &app,
            &pipe_name,
            &url,
            &args,
            &context,
            generation,
            &child,
            &mut position,
            &mut duration,
        )
        .await;
        if let Ok(mut child) = child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
        if generation == GENERATION.load(Ordering::SeqCst) {
            publish(&app, &context, position, duration, true, None);
            if let Err(e) = result {
                desktop::report_error(&app, e);
            }
            if extra["deleteWatched"].as_bool() == Some(true)
                && duration > 0.0
                && position >= duration * 0.95
            {
                crate::desktop_downloads::remove_watched(&app, &context);
            }
        }
        logo_task.abort();
        let _ = std::fs::remove_dir_all(logo_dir);
        let _ = std::fs::remove_file(config);
    });
    Ok(json!({}))
}

pub fn publish(
    app: &tauri::AppHandle,
    context: &Value,
    position: f64,
    duration: f64,
    closed: bool,
    request: Option<&Value>,
) {
    let mut event = json!({"context":context,"position":position,"duration":duration,"updatedAt":desktop::now(),"closed":closed});
    if let Some(request) = request {
        event["requestedVideoId"] = request["id"].clone();
        event["autoPlay"] = request["auto"].clone();
        event["actionId"] = json!(format!("windows-{}", desktop::now()));
    }
    let _ = desktop::write(app, "playerProgress", &event.to_string());
    crate::playback_sync::publish(app, &event);
    let _ = app.emit("player-progress", event);
}

async fn send(
    pipe: &mut (impl tokio::io::AsyncWrite + Unpin),
    command: Value,
) -> Result<(), String> {
    pipe.write_all(format!("{}\n", json!({"command":command})).as_bytes())
        .await
        .map_err(|e| e.to_string())
}

async fn run(
    app: &tauri::AppHandle,
    name: &str,
    url: &str,
    args: &Value,
    context: &Value,
    generation: u64,
    child: &Arc<Mutex<Child>>,
    position: &mut f64,
    duration: &mut f64,
) -> Result<(), String> {
    let mut connected = None;
    for _ in 0..100 {
        if generation != GENERATION.load(Ordering::SeqCst) {
            return Ok(());
        }
        if let Ok(pipe) = ClientOptions::new().open(name) {
            connected = Some(pipe);
            break;
        }
        if child
            .lock()
            .map_err(|e| e.to_string())?
            .try_wait()
            .map_err(|e| e.to_string())?
            .is_some()
        {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    let mut pipe = connected.ok_or("The video player could not start.")?;
    let headers: Vec<String> = args["headers"]
        .as_object()
        .into_iter()
        .flat_map(|map| map.iter())
        .map(|(k, v)| format!("{k}: {}", v.as_str().unwrap_or("")))
        .collect();
    send(
        &mut pipe,
        json!(["set_property", "http-header-fields", headers]),
    )
    .await?;
    for (id, prop) in [
        (1, "time-pos"),
        (2, "duration"),
        (3, "user-data/primio/request"),
    ] {
        send(&mut pipe, json!(["observe_property", id, prop])).await?;
    }
    send(&mut pipe, json!(["loadfile", url])).await?;
    let (read, mut writer) = tokio::io::split(pipe);
    let mut lines = BufReader::new(read).lines();
    let mut timer = tokio::time::interval(Duration::from_secs(5));
    let mut loaded = false;
    loop {
        tokio::select! {
            result=lines.next_line()=>{
                let Some(line)=result.map_err(|e|e.to_string())? else {break};
                let Ok(event)=serde_json::from_str::<Value>(&line) else {continue};
                match event["event"].as_str().unwrap_or("") {
                    "property-change"=>match event["name"].as_str().unwrap_or("") {
                        "time-pos"=>if let Some(v)=event["data"].as_f64(){*position=v},
                        "duration"=>if let Some(v)=event["data"].as_f64(){*duration=v},
                        "user-data/primio/request"=>if event["data"]["id"].as_str().is_some(){publish(app,context,*position,*duration,true,Some(&event["data"]));break},
                        _=>{}
                    },
                    "file-loaded"=>{loaded=true;for sub in args["subtitles"].as_array().into_iter().flatten(){if let Some(url)=sub["url"].as_str(){send(&mut writer,json!(["sub-add",url,"auto",sub["lang"].as_str().unwrap_or(""),sub["lang"].as_str().unwrap_or("")])).await?;}}},
                    "end-file"=>{if event["reason"]=="error" {return Err("This source could not be played. Please choose another source.".into())} if loaded {break}},
                    "shutdown"=>break,
                    _=>{}
                }
            },
            _=timer.tick()=>{if generation!=GENERATION.load(Ordering::SeqCst){break} if child.lock().map_err(|e|e.to_string())?.try_wait().map_err(|e|e.to_string())?.is_some(){break} if *duration>0.0 {publish(app,context,*position,*duration,false,None);}}
        }
    }
    Ok(())
}

async fn prepare_logo(url: &str, directory: &std::path::Path) -> Result<(), String> {
    let url = url::Url::parse(url).map_err(|_| "No logo")?;
    let client = crate::network::client_for(&url).await?;
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|_| "Logo unavailable")?;
    if !response.status().is_success() {
        return Err("Logo unavailable".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "Logo unavailable")? {
        if bytes.len() + chunk.len() > 4_000_000 {
            return Err("Logo too large".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let mut reader = image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| "Invalid logo")?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(64_000_000);
    reader.limits(limits);
    let image = reader
        .decode()
        .map_err(|_| "Invalid logo")?
        .resize(320, 128, image::imageops::FilterType::Lanczos3)
        .to_rgba8();
    let mut canvas = image::RgbaImage::new(320, 128);
    image::imageops::overlay(
        &mut canvas,
        &image,
        ((320 - image.width()) / 2) as i64,
        ((128 - image.height()) / 2) as i64,
    );
    std::fs::create_dir_all(directory).map_err(|_| "Logo cache unavailable")?;
    for frame in 0..12 {
        let opacity = 0.4 + frame as f32 / 11.0 * 0.6;
        let mut data = Vec::with_capacity(320 * 128 * 4);
        for pixel in canvas.pixels() {
            let alpha = pixel[3] as f32 / 255.0 * opacity;
            data.extend_from_slice(&[
                (pixel[2] as f32 * alpha) as u8,
                (pixel[1] as f32 * alpha) as u8,
                (pixel[0] as f32 * alpha) as u8,
                (alpha * 255.0) as u8,
            ]);
        }
        let partial = directory.join(format!("{frame}.partial"));
        std::fs::write(&partial, data).map_err(|_| "Logo cache unavailable")?;
        std::fs::rename(partial, directory.join(format!("{frame}.bgra")))
            .map_err(|_| "Logo cache unavailable")?;
    }
    Ok(())
}
