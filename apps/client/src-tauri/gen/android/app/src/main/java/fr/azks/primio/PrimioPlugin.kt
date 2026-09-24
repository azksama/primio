package fr.azks.primio

import android.app.Activity
import android.content.Intent
import android.net.Uri
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke

@InvokeArg class NotificationArgs { var request:Boolean=false }
@InvokeArg class AuthArgs { var register:Boolean=false;var success:Boolean=false;var message:String="" }
@InvokeArg class StoreArgs { var key:String=""; var value:String="" }
@InvokeArg class LinkArgs { var url:String="" }
@InvokeArg class PlayArgs {
 var playerExtra:String="{}"
 var progressContext:String="{}"
 var url:String=""; var title:String=""; var external:Boolean=false; var position:Double=0.0
 var headers:Map<String,String> = emptyMap()
 var subtitles:List<Map<String,String>> = emptyList()
 var language:String="fra"; var showSubtitles:Boolean=true
 var skipSegments:List<Map<String,Any>> = emptyList();var autoSkipIntro:Boolean=false
 var subtitleLanguage:String="fra";var seekBackward:Int=10;var seekForward:Int=10
 var subtitleSize:Int=40;var playbackSpeed:Double=1.0;var hardwareDecoding:Boolean=true;var cacheSizeGb:Double=1.0
}
@InvokeArg class DownloadArgs {var url:String="";var title:String="";var metadata:String="{}";var headers:Map<String,String> = emptyMap();var wifiOnly:Boolean=true}
@InvokeArg class IdArgs {var id:String="";var options:String="{}"}
@InvokeArg class TextArgs {var text:String=""}
@TauriPlugin
class PrimioPlugin(private val activity:Activity):Plugin(activity) {
 private fun tr(s:String)=PrimioI18n.text(activity,s)
 private var auth:PrimioAuth?=null
 @Command fun notificationConfig(invoke:Invoke){try{PrimioNotifications.configure(activity,invoke.parseArgs(StoreArgs::class.java).value);invoke.resolve()}catch(e:Exception){invoke.reject("Notification configuration failed")}}
 @Command fun notificationPermission(invoke:Invoke){val request=invoke.parseArgs(NotificationArgs::class.java).request;activity.runOnUiThread{if(request&&!PrimioNotifications.allowed(activity)){val preferences=activity.getSharedPreferences("primio-notification-permission",0);if(android.os.Build.VERSION.SDK_INT>=33&&activity.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED&&(!preferences.getBoolean("asked",false)||activity.shouldShowRequestPermissionRationale(android.Manifest.permission.POST_NOTIFICATIONS))){preferences.edit().putBoolean("asked",true).apply();activity.requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),904)}else activity.startActivity(Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,activity.packageName))};invoke.resolve(JSObject().put("enabled",PrimioNotifications.allowed(activity)) as JSObject)}}
 @Command fun authForm(invoke:Invoke){val args=invoke.parseArgs(AuthArgs::class.java);activity.runOnUiThread{val dialog=auth?.takeIf{it.isShowing}?:PrimioAuth(activity,args.register).also{auth=it;it.show()};dialog.awaitSubmission(invoke)}}
 @Command fun authComplete(invoke:Invoke){val args=invoke.parseArgs(AuthArgs::class.java);activity.runOnUiThread{auth?.complete(args.success,args.message);if(args.success)auth=null;invoke.resolve()}}
 @Command fun secureRead(invoke:Invoke) {try{val args=invoke.parseArgs(StoreArgs::class.java);val result=JSObject();PrimioStore.read(activity,args.key)?.let{result.put("value",it)};invoke.resolve(result)}catch(e:Exception){invoke.reject("Impossible de lire le coffre local.")}}
 @Command fun secureWrite(invoke:Invoke) {try{val args=invoke.parseArgs(StoreArgs::class.java);PrimioStore.write(activity,args.key,args.value);if(args.key=="downloadPolicy")DownloadStore(activity).configure(args.value);if(args.key=="state"){val language=org.json.JSONObject(args.value).optJSONObject("settings")?.optString("uiLanguage","en")?:"en";activity.getSharedPreferences("primio-settings",0).edit().putString("language",language).apply()};invoke.resolve()}catch(e:Exception){invoke.reject(tr("Impossible d’enregistrer les données locales."))}}
 @Command fun openLink(invoke:Invoke){
  val args=invoke.parseArgs(LinkArgs::class.java)
  activity.runOnUiThread {try{
   require(Uri.parse(args.url).scheme=="https")
   activity.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(args.url)).addCategory(Intent.CATEGORY_BROWSABLE))
   invoke.resolve()
  }catch(e:Exception){invoke.reject("Aucun navigateur disponible.")}}
 }
 @Command fun play(invoke:Invoke){
  val args=invoke.parseArgs(PlayArgs::class.java)
  activity.runOnUiThread {try{
   val uri=Uri.parse(args.url);require(uri.scheme=="https"||uri.scheme=="http")
   if(args.external){
    val intent=Intent(Intent.ACTION_VIEW).setDataAndType(uri,"video/*")
      .putExtra("title",args.title).putExtra("position",(args.position*1000).toInt())
    // Widely supported Android player convention (VLC / MX).
    if(args.headers.isNotEmpty())intent.putExtra("headers",args.headers.flatMap{listOf(it.key,it.value)}.toTypedArray())
    val targets=activity.packageManager.queryIntentActivities(intent,0).filter{it.activityInfo.packageName!=activity.packageName}
    require(targets.isNotEmpty())
    val chooser=PrimioSheet(activity,"Lire avec")
    targets.forEach{info->chooser.option(info.loadLabel(activity.packageManager).toString()){activity.startActivity(Intent(intent).setClassName(info.activityInfo.packageName,info.activityInfo.name));chooser.dismiss()}}
    chooser.show()
   }else{
    val options=org.json.JSONObject().put("context",org.json.JSONObject(args.progressContext)).put("url",args.url).put("title",args.title).put("position",args.position)
      .put("language",args.language).put("showSubtitles",args.showSubtitles)
      .put("skipSegments",org.json.JSONArray(args.skipSegments)).put("autoSkipIntro",args.autoSkipIntro)
      .put("subtitleLanguage",args.subtitleLanguage).put("seekBackward",args.seekBackward).put("seekForward",args.seekForward)
      .put("subtitleSize",args.subtitleSize).put("playbackSpeed",args.playbackSpeed).put("hardwareDecoding",args.hardwareDecoding).put("cacheSizeGb",args.cacheSizeGb)
      .put("headers",org.json.JSONObject(args.headers)).put("subtitles",org.json.JSONArray(args.subtitles))
    val extra=org.json.JSONObject(args.playerExtra)
    for(key in listOf("episodes","currentVideoId","nextVideoId","logo","reduceMotion","autoNextEpisode","forceSubtitleStyle","subtitleFont","subtitleColor","subtitleOutline","subtitleBackground")){if(extra.has(key))options.put(key,extra.get(key))}
    activity.startActivity(Intent(activity,PlayerActivity::class.java).putExtra("options",options.toString()))
   }
   invoke.resolve()
  }catch(e:Exception){invoke.reject(if(args.external)tr("Aucun lecteur externe compatible n’est installé.") else "Impossible d’ouvrir le lecteur.")}}
 }

 @Command fun copyText(invoke:Invoke){val args=invoke.parseArgs(TextArgs::class.java);(activity.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager).setPrimaryClip(android.content.ClipData.newPlainText("Manifeste Primio",args.text));invoke.resolve()}
 @Command fun downloadStart(invoke:Invoke){try{val a=invoke.parseArgs(DownloadArgs::class.java);require(!Uri.parse(a.url).path.orEmpty().matches(Regex(".*\\.(m3u8|mpd)$",RegexOption.IGNORE_CASE))){"Téléchargez une source fichier MP4, MKV ou WebM. Les playlists HLS/DASH ne sont pas des fichiers hors connexion."};val id=DownloadStore(activity).start(a.url,a.title,a.metadata,a.headers,a.wifiOnly);invoke.resolve(JSObject().put("id",id) as JSObject)}catch(e:Exception){invoke.reject(e.message?:"Téléchargement impossible.")}}
 @Command fun downloadList(invoke:Invoke){try{invoke.resolve(JSObject().put("items",DownloadStore(activity).list()) as JSObject)}catch(e:Exception){invoke.reject(tr("Téléchargements indisponibles."))}}
 @Command fun downloadRemove(invoke:Invoke){try{DownloadStore(activity).remove(invoke.parseArgs(IdArgs::class.java).id);invoke.resolve()}catch(e:Exception){invoke.reject("Suppression impossible.")}}
 @Command fun playDownload(invoke:Invoke){val a=invoke.parseArgs(IdArgs::class.java);activity.runOnUiThread{try{val file=DownloadStore(activity).readyFile(a.id);val options=org.json.JSONObject(a.options).put("url",file.absolutePath).put("offline",true).put("downloadId",a.id).put("headers",org.json.JSONObject()).put("subtitles",org.json.JSONArray());activity.startActivity(Intent(activity,PlayerActivity::class.java).putExtra("options",options.toString()));invoke.resolve()}catch(e:Exception){invoke.reject(e.message?:"Fichier indisponible.")}}}
}
