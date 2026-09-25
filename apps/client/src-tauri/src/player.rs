use jni::{
    objects::{GlobalRef, JObject, JString},
    sys::{jlong, jstring},
    JNIEnv,
};
use libmpv2::Mpv;
use serde_json::{json, Value};
use std::sync::OnceLock;
use tauri::Emitter;
pub static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
static CONTEXT: OnceLock<GlobalRef> = OnceLock::new();
struct Player {
    mpv: Mpv,
    _surface: GlobalRef,
    last_error: Option<String>,
    loaded: bool,
    ended: bool,
    position: f64,
    duration: f64,
}
extern "C" {
    fn mpv_command_async(
        ctx: *mut std::ffi::c_void,
        userdata: u64,
        args: *const *const std::ffi::c_char,
    ) -> i32;
    fn av_jni_set_java_vm(vm: *mut std::ffi::c_void, log: *mut std::ffi::c_void) -> i32;
    fn av_jni_set_android_app_ctx(ctx: *mut std::ffi::c_void, log: *mut std::ffi::c_void) -> i32;
}

/// JNI entrypoints are called only from PlayerActivity's main looper.
/// Kotlin clears the handle before destroying it, preventing use-after-free.
#[no_mangle]
pub extern "system" fn Java_fr_azks_primio_PlayerActivity_nativeCreate(
    mut env: JNIEnv,
    _this: JObject,
    surface: JObject,
    context: JObject,
    options: JString,
) -> jlong {
    let result = (|| -> Result<jlong, String> {
        let options: String = env.get_string(&options).map_err(|e| e.to_string())?.into();
        let o: Value = serde_json::from_str(&options).map_err(|e| e.to_string())?;
        let surface = env.new_global_ref(surface).map_err(|e| e.to_string())?;
        if CONTEXT.get().is_none() {
            CONTEXT
                .set(env.new_global_ref(context).map_err(|e| e.to_string())?)
                .ok();
        }
        unsafe {
            libc::setlocale(libc::LC_NUMERIC, c"C".as_ptr());
            av_jni_set_java_vm(
                env.get_java_vm()
                    .map_err(|e| e.to_string())?
                    .get_java_vm_pointer()
                    .cast(),
                std::ptr::null_mut(),
            );
            av_jni_set_android_app_ctx(
                CONTEXT.get().unwrap().as_obj().as_raw().cast(),
                std::ptr::null_mut(),
            );
        }
        let wid = surface.as_obj().as_raw() as i64;
        let mpv = Mpv::with_initializer(|m| {
            m.set_option("config", false)?;
            m.set_option("load-scripts", false)?;
            m.set_option("vo", "gpu")?;
            m.set_option("gpu-context", "android")?;
            m.set_option("wid", wid)?;
            m.set_option(
                "hwdec",
                if o["hardwareDecoding"].as_bool().unwrap_or(true) {
                    "mediacodec-copy"
                } else {
                    "no"
                },
            )?;
            m.set_option("ao", "audiotrack")?;
            m.set_option("idle", true)?;
            m.set_option("cache", true)?;
            if let Some(path) = o["cacheDir"].as_str() {
                m.set_option("cache-on-disk", true)?;
                m.set_option("demuxer-cache-dir", path)?;
            }
            m.set_option(
                "sub-font-size",
                o["subtitleSize"].as_i64().unwrap_or(40).clamp(24, 72),
            )?;
            m.set_option(
                "sub-font",
                match o["subtitleFont"].as_str() {
                    Some("serif") => "Noto Serif",
                    Some("monospace") => "Droid Sans Mono",
                    _ => "Roboto",
                },
            )?;
            m.set_option(
                "sub-color",
                match o["subtitleColor"].as_str() {
                    Some("#F5DE93") => "#F5DE93",
                    Some("#BDE6FF") => "#BDE6FF",
                    Some("#BFE3C2") => "#BFE3C2",
                    _ => "#FFFFFF",
                },
            )?;
            m.set_option(
                "sub-border-size",
                o["subtitleOutline"].as_i64().unwrap_or(2).clamp(0, 4),
            )?;
            m.set_option("sub-border-color", "#000000")?;
            m.set_option(
                "sub-back-color",
                if o["subtitleBackground"].as_bool().unwrap_or(false) {
                    "#B0000000"
                } else {
                    "#00000000"
                },
            )?;
            m.set_option(
                "sub-ass-override",
                if o["forceSubtitleStyle"].as_bool().unwrap_or(false) {
                    "force"
                } else {
                    "no"
                },
            )?;
            m.set_option(
                "speed",
                o["playbackSpeed"].as_f64().unwrap_or(1.0).clamp(0.5, 2.0),
            )?;
            m.set_option("demuxer-max-bytes", 64 * 1024 * 1024i64)?;
            m.set_option("network-timeout", 20i64)?;
            m.set_option("tls-verify", true)?;
            m.set_option(
                "alang",
                o["language"]
                    .as_str()
                    .filter(|v| *v != "auto" && *v != "original")
                    .unwrap_or(""),
            )?;
            m.set_option(
                "slang",
                o["subtitleLanguage"]
                    .as_str()
                    .filter(|v| *v != "auto" && *v != "original")
                    .unwrap_or(""),
            )?;
            m.set_option(
                "sub-visibility",
                o["showSubtitles"].as_bool().unwrap_or(true),
            )?;
            if let Some(path) = o["caFile"].as_str() {
                m.set_option("tls-ca-file", path)?;
            }
            if let Some(headers) = o["headers"].as_object() {
                let fields = headers
                    .iter()
                    .filter_map(|(k, v)| v.as_str().map(|v| format!("{}: {}", k, v)))
                    .map(|s| s.replace('\\', "\\\\").replace(',', "\\,"))
                    .collect::<Vec<_>>()
                    .join(",");
                if !fields.is_empty() {
                    m.set_option("http-header-fields", fields)?;
                }
            }
            Ok(())
        })
        .map_err(|e| e.to_string())?;
        let position = o["position"].as_f64().unwrap_or(0.0);
        if position > 0.0 {
            mpv.set_property("start", position.to_string())
                .map_err(|e| e.to_string())?;
        }
        let url = o["url"].as_str().ok_or("URL manquante")?;
        mpv.command("loadfile", &[url]).map_err(|e| e.to_string())?;
        // Subtitles are added on file-loaded, when libmpv has an active file.
        let player = Box::new(Player {
            mpv,
            _surface: surface,
            last_error: None,
            loaded: false,
            ended: false,
            position,
            duration: 0.0,
        });
        Ok(Box::into_raw(player) as jlong)
    })();
    match result {
        Ok(handle) => handle,
        Err(e) => {
            let _ = env.throw_new("java/lang/IllegalStateException", e);
            0
        }
    }
}
#[no_mangle]
pub extern "system" fn Java_fr_azks_primio_PlayerActivity_nativeCommand(
    mut env: JNIEnv,
    _this: JObject,
    handle: jlong,
    command: JString,
) {
    if handle == 0 {
        return;
    }
    let result = (|| -> Result<(), String> {
        let raw: String = env.get_string(&command).map_err(|e| e.to_string())?.into();
        let args: Vec<String> = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        let name = args.first().ok_or("Commande vide")?;
        if !["seek", "cycle", "set", "sub-add"].contains(&name.as_str()) {
            return Err("Commande refusée".into());
        }
        let p = unsafe { &*(handle as *mut Player) };
        let strings = args
            .iter()
            .map(|s| std::ffi::CString::new(s.as_str()))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let mut pointers = strings.iter().map(|s| s.as_ptr()).collect::<Vec<_>>();
        pointers.push(std::ptr::null());
        // mpv copies the arguments; network subtitle loading must not block the UI looper.
        let status = unsafe { mpv_command_async(p.mpv.ctx.as_ptr().cast(), 1, pointers.as_ptr()) };
        if status < 0 {
            Err("Commande indisponible".into())
        } else {
            Ok(())
        }
    })();
    if let Err(e) = result {
        let _ = env.throw_new("java/lang/IllegalStateException", e);
    }
}
#[no_mangle]
pub extern "system" fn Java_fr_azks_primio_PlayerActivity_nativeState(
    env: JNIEnv,
    _this: JObject,
    handle: jlong,
) -> jstring {
    let result = if handle == 0 {
        json!({})
    } else {
        let p = unsafe { &mut *(handle as *mut Player) };
        for _ in 0..128 {
            let Some(event) = p.mpv.wait_event(0.0) else {
                break;
            };
            match event {
                Ok(
                    libmpv2::events::Event::FileLoaded | libmpv2::events::Event::PlaybackRestart,
                ) => p.loaded = true,
                Ok(libmpv2::events::Event::EndFile(libmpv2::mpv_end_file_reason::Eof)) => {
                    p.ended = true
                }
                Err(_)
                    if !p.loaded || p.mpv.get_property::<bool>("idle-active").unwrap_or(false) =>
                {
                    p.last_error = Some("Impossible de lire cette source.".into())
                }
                _ => {}
            }
        }
        if let Ok(value) = p.mpv.get_property::<f64>("duration") {
            if value.is_finite() && value > 0.0 {
                p.duration = value;
            }
        }
        if let Ok(value) = p.mpv.get_property::<f64>("time-pos") {
            if value.is_finite() && value >= 0.0 {
                p.position = value;
                p.loaded = true;
            }
        }
        if p.ended && p.duration > 0.0 {
            p.position = p.duration;
        }
        let count = p
            .mpv
            .get_property::<i64>("track-list/count")
            .unwrap_or(0)
            .clamp(0, 100);
        let tracks=(0..count).map(|i|{
   let field=|name:&str|format!("track-list/{i}/{name}");
   json!({"id":p.mpv.get_property::<i64>(&field("id")).unwrap_or(0),"type":p.mpv.get_property::<String>(&field("type")).unwrap_or_default(),"lang":p.mpv.get_property::<String>(&field("lang")).unwrap_or_default(),"title":p.mpv.get_property::<String>(&field("title")).unwrap_or_default(),"codec":p.mpv.get_property::<String>(&field("codec")).unwrap_or_default(),"channels":p.mpv.get_property::<i64>(&field("demux-channel-count")).unwrap_or(0),"externalUrl":p.mpv.get_property::<String>(&field("external-filename")).unwrap_or_default(),"selected":p.mpv.get_property::<bool>(&field("selected")).unwrap_or(false)})
  }).collect::<Vec<_>>();
        json!({"subtitleStyle":p.mpv.get_property::<String>("sub-ass-override").unwrap_or_default(),"cacheBytes":p.mpv.get_property::<i64>("demuxer-cache-state/file-cache-bytes").unwrap_or(0),"bufferedUntil":p.mpv.get_property::<f64>("demuxer-cache-time").unwrap_or(0.0),"position":p.position,"duration":p.duration,"paused":p.mpv.get_property::<bool>("pause").unwrap_or(false),"buffering":p.mpv.get_property::<bool>("paused-for-cache").unwrap_or(false),"eof":p.ended || p.mpv.get_property::<bool>("eof-reached").unwrap_or(false),"loaded":p.loaded,"tracks":tracks,"error":p.last_error})
    };
    env.new_string(result.to_string())
        .map(|s| s.into_raw())
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub extern "system" fn Java_fr_azks_primio_PlayerActivity_nativeProgress(
    mut env: JNIEnv,
    _this: JObject,
    payload: JString,
) {
    if let Ok(raw) = env.get_string(&payload) {
        let raw: String = raw.into();
        if let Ok(value) = serde_json::from_str::<Value>(&raw) {
            if let Some(app) = APP.get() {
                crate::playback_sync::publish(app, &value);
                let _ = app.emit("player-progress", value);
            }
        }
    }
}
#[no_mangle]
pub extern "system" fn Java_fr_azks_primio_PlayerActivity_nativeDestroy(
    _env: JNIEnv,
    _this: JObject,
    handle: jlong,
) {
    if handle != 0 {
        unsafe {
            drop(Box::from_raw(handle as *mut Player));
        }
    }
}
