use crate::desktop;
use serde_json::{json, Value};
use std::collections::HashSet;
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
    settings["previewExecutable"] = json!(player_path(&executable));
    settings["previewPath"] = json!(player_path(
        &desktop::data_dir(app)?.join(format!("preview-{generation}.bgra"))
    ));
    settings["previewHeaders"] = json!(args["headers"]
        .as_object()
        .into_iter()
        .flat_map(|m| m.iter())
        .map(|(k, v)| format!("{k}: {}", v.as_str().unwrap_or("")))
        .collect::<Vec<_>>());
    settings["audioLanguage"] = args["language"].clone();
    let logo_dir = desktop::data_dir(app)?.join(format!("logo-{generation}"));
    settings["logoPath"] = json!(player_path(&logo_dir));
    let episode_image_dir = logo_dir.join("episodes");
    settings["episodeImagePath"] = json!(player_path(&episode_image_dir));
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
    if let Some(directory) = extra["customFont"]["directory"].as_str() {
        command.arg(format!("--sub-fonts-dir={directory}"));
    }
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
        let mut context = context;
        let mut position = args["position"].as_f64().unwrap_or(0.0);
        let mut duration = 0.0;
        let result = run(
            &app,
            &pipe_name,
            &url,
            &args,
            &mut context,
            generation,
            &child,
            &mut position,
            &mut duration,
            &episode_image_dir,
        )
        .await;
        if let Ok(mut child) = child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
        if generation == GENERATION.load(Ordering::SeqCst) {
            if result.is_err() || context["playbackReady"] != true {
                context["sourceFailed"] = json!(true);
            }
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
    event["sourceFailed"] = json!(context["sourceFailed"].as_bool().unwrap_or(false));
    if context["watchedChanges"].is_array() {
        event["watchedChanges"] = context["watchedChanges"].clone();
    }
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
    context: &mut Value,
    generation: u64,
    child: &Arc<Mutex<Child>>,
    position: &mut f64,
    duration: &mut f64,
    episode_image_dir: &std::path::Path,
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
        (4, "user-data/primio/track-preferences"),
        (5, "user-data/primio/watched"),
        (6, "paused-for-cache"),
        (7, "user-data/primio/episode-images"),
        (8, "user-data/primio/inferred-watched"),
    ] {
        send(&mut pipe, json!(["observe_property", id, prop])).await?;
    }
    send(&mut pipe, json!(["loadfile", url])).await?;
    let (read, mut writer) = tokio::io::split(pipe);
    let mut lines = BufReader::new(read).lines();
    let mut timer = tokio::time::interval(Duration::from_secs(5));
    let mut loaded = false;
    let opened_at = std::time::Instant::now();
    let mut last_advance = opened_at;
    let mut buffering = false;
    let extra = decoded(&args["playerExtra"]);
    let mut image_jobs = tokio::task::JoinSet::new();
    let image_limit = Arc::new(tokio::sync::Semaphore::new(2));
    let mut requested_images = HashSet::new();
    loop {
        while image_jobs.try_join_next().is_some() {}
        tokio::select! {
            result=lines.next_line()=>{
                let Some(line)=result.map_err(|e|e.to_string())? else {break};
                let Ok(event)=serde_json::from_str::<Value>(&line) else {continue};
                match event["event"].as_str().unwrap_or("") {
                    "property-change"=>match event["name"].as_str().unwrap_or("") {
                        "time-pos"=>if let Some(v)=event["data"].as_f64(){if v != *position {last_advance=std::time::Instant::now();} *position=v},
                        "duration"=>if let Some(v)=event["data"].as_f64(){*duration=v},
                        "user-data/primio/request"=>if event["data"]["id"].as_str().is_some(){if event["data"]["completed"]==true && *duration>0.0 {*position=*duration;}publish(app,context,*position,*duration,true,Some(&event["data"]));break},
                        "user-data/primio/track-preferences"=>if event["data"].is_object(){context["trackPreferences"]=event["data"].clone();publish(app,context,*position,*duration,false,None);},
                        "user-data/primio/watched"=>if event["data"]["videoId"].is_string() && event["data"]["watched"].is_boolean() {
                            let mut change=event["data"].clone();change["updatedAt"]=json!(desktop::now());
                            if change["videoId"] == context["videoId"] {change["position"]=json!(*position);change["duration"]=json!(*duration);}
                            let mut changes=context["watchedChanges"].as_array().cloned().unwrap_or_default();
                            changes.retain(|item| item["videoId"] != change["videoId"]);changes.push(change);
                            context["watchedChanges"]=json!(changes);publish(app,context,*position,*duration,false,None);
                        },
                        "paused-for-cache"=>{buffering=event["data"].as_bool().unwrap_or(false);last_advance=std::time::Instant::now();},
                        "user-data/primio/episode-images"=>{
                            let w=event["data"]["width"].as_u64().unwrap_or(0);
                            let h=event["data"]["height"].as_u64().unwrap_or(0);
                            if (1..=512).contains(&w) && (1..=512).contains(&h) {
                                for index in event["data"]["indices"].as_array().into_iter().flatten().take(12).filter_map(Value::as_u64) {
                                    let Some(url)=extra["episodes"].as_array().and_then(|eps|eps.get(index as usize)).and_then(|ep|ep["thumbnail"].as_str()) else {continue};
                                    if requested_images.len()>=2048 || !requested_images.insert((index,w,h)) {continue}
                                    let url=url.to_owned();let directory=episode_image_dir.to_owned();let limit=image_limit.clone();
                                    image_jobs.spawn(async move {
                                        let Ok(_permit)=limit.acquire_owned().await else {return};
                                        let _=prepare_episode_image(&url,&directory,index,w as u32,h as u32).await;
                                    });
                                }
                            }
                        },
                        "user-data/primio/inferred-watched"=>{
                            let mut changes=context["watchedChanges"].as_array().cloned().unwrap_or_default();
                            for edit in event["data"].as_array().into_iter().flatten().take(499) {
                                if !edit["videoId"].is_string() || edit["watched"]!=true || changes.iter().any(|c|c["videoId"]==edit["videoId"]) {continue}
                                let mut change=edit.clone();change["updatedAt"]=json!(desktop::now());changes.push(change);
                            }
                            context["watchedChanges"]=json!(changes);publish(app,context,*position,*duration,false,None);
                        },
                        _=>{}
                    },
                    "file-loaded"=>{loaded=true;for sub in args["subtitles"].as_array().into_iter().flatten(){if let Some(url)=sub["url"].as_str(){send(&mut writer,json!(["sub-add",url,"auto",sub["lang"].as_str().unwrap_or(""),sub["lang"].as_str().unwrap_or("")])).await?;}}},
                    "playback-restart"=>{context["playbackReady"]=json!(true);last_advance=std::time::Instant::now();},
                    "end-file"=>{if event["reason"]=="error" {return Err("This source could not be played. Please choose another source.".into())} if event["reason"]=="eof" && *duration>0.0 {*position=*duration;} if loaded {break}},
                    "shutdown"=>break,
                    _=>{}
                }
            },
            _=timer.tick()=>{
                if generation!=GENERATION.load(Ordering::SeqCst){break}
                if child.lock().map_err(|e|e.to_string())?.try_wait().map_err(|e|e.to_string())?.is_some(){break}
                if (context["playbackReady"] != true && opened_at.elapsed()>Duration::from_secs(45)) || (buffering && last_advance.elapsed()>Duration::from_secs(60)) {
                    return Err("This source is not responding. Please choose another source.".into());
                }
                if *duration>0.0 {publish(app,context,*position,*duration,false,None);}
            }
        }
    }
    image_jobs.abort_all();
    while image_jobs.join_next().await.is_some() {}
    Ok(())
}

async fn prepare_episode_image(
    url: &str,
    directory: &std::path::Path,
    index: u64,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let mut url = url::Url::parse(url).map_err(|_| "Invalid artwork")?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return Err("Invalid artwork".into());
    }
    let mut redirects = 0;
    let mut response = loop {
        let client = crate::network::client_for(&url).await?;
        let response = client
            .get(url.clone())
            .send()
            .await
            .map_err(|_| "Artwork unavailable")?;
        if !response.status().is_redirection() {
            break response;
        }
        if redirects >= 3 {
            return Err("Artwork unavailable".into());
        }
        let location = response
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .ok_or("Invalid artwork")?;
        url = url.join(location).map_err(|_| "Invalid artwork")?;
        redirects += 1;
    };
    if !response.status().is_success() {
        return Err("Artwork unavailable".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "Artwork unavailable")? {
        if bytes.len() + chunk.len() > 2_000_000 {
            return Err("Artwork too large".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let mut reader = image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| "Invalid artwork")?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(64_000_000);
    reader.limits(limits);
    let image = reader
        .decode()
        .map_err(|_| "Invalid artwork")?
        .resize_to_fill(width, height, image::imageops::FilterType::Lanczos3)
        .to_rgba8();
    let mut data = Vec::with_capacity((width * height * 4) as usize);
    for pixel in image.pixels() {
        let alpha = pixel[3] as f32 / 255.0;
        data.extend_from_slice(&[
            (pixel[2] as f32 * alpha) as u8,
            (pixel[1] as f32 * alpha) as u8,
            (pixel[0] as f32 * alpha) as u8,
            pixel[3],
        ]);
    }
    tokio::fs::create_dir_all(directory)
        .await
        .map_err(|_| "Artwork cache unavailable")?;
    tokio::fs::write(
        directory.join(format!("episode-{index}-{width}-{height}.bgra")),
        data,
    )
    .await
    .map_err(|_| "Artwork cache unavailable")?;
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
    let image = reader.decode().map_err(|_| "Invalid logo")?.to_rgba8();
    let (mut left, mut top, mut right, mut bottom) = (image.width(), image.height(), 0, 0);
    for (x, y, pixel) in image.enumerate_pixels() {
        if pixel[3] > 16 {
            left = left.min(x);
            top = top.min(y);
            right = right.max(x);
            bottom = bottom.max(y);
        }
    }
    let image = if left <= right && top <= bottom {
        image::imageops::crop_imm(&image, left, top, right - left + 1, bottom - top + 1).to_image()
    } else {
        image
    };
    let image = image::DynamicImage::ImageRgba8(image)
        .resize(640, 256, image::imageops::FilterType::Lanczos3)
        .to_rgba8();
    let mut canvas = image::RgbaImage::new(640, 256);
    image::imageops::overlay(
        &mut canvas,
        &image,
        ((640 - image.width()) / 2) as i64,
        ((256 - image.height()) / 2) as i64,
    );
    std::fs::create_dir_all(directory).map_err(|_| "Logo cache unavailable")?;
    for frame in 0..12 {
        let opacity = 0.4 + frame as f32 / 11.0 * 0.6;
        let mut data = Vec::with_capacity(640 * 256 * 4);
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
