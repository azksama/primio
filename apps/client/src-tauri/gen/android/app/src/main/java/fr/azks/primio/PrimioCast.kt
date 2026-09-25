package fr.azks.primio
import android.app.Activity
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.mediarouter.media.MediaRouter
import androidx.mediarouter.media.MediaRouteSelector
import com.google.android.gms.cast.*
import com.google.android.gms.cast.framework.*
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import org.json.JSONObject

class PrimioCastOptions:OptionsProvider {
 override fun getCastOptions(context:Context)=CastOptions.Builder().setReceiverApplicationId(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID).build()
 override fun getAdditionalSessionProviders(context:Context):List<SessionProvider>?=null
}
object PrimioCast {
 fun execute(activity:Activity, action:String, data:JSONObject, invoke:Invoke){
  activity.runOnUiThread {try{
   val context=CastContext.getSharedInstance(activity)
   val client=context.sessionManager.currentCastSession?.remoteMediaClient
   if(action=="status"){invoke.resolve(JSObject().put("position",(client?.approximateStreamPosition?:0)/1000.0).put("duration",(client?.streamDuration?:0)/1000.0).put("connected",client!=null) as JSObject);return@runOnUiThread}
   if(action!="load"){
    if(client==null){invoke.reject("No connected Cast device");return@runOnUiThread}
    when(action){"pause"->client.pause();"play"->client.play();"stop"->context.sessionManager.endCurrentSession(true);"seek"->client.seek(MediaSeekOptions.Builder().setPosition((data.optDouble("position").coerceIn(0.0,86400.0)*1000).toLong()).build());else->throw IllegalArgumentException("Unknown command")};invoke.resolve();return@runOnUiThread
   }
   val url=data.getString("url");require(url.startsWith("https://")||url.startsWith("http://"))
   fun load(){
    val remote=context.sessionManager.currentCastSession?.remoteMediaClient
    if(remote==null){invoke.reject("Cast connection failed");return}
    val path=android.net.Uri.parse(url).path.orEmpty().lowercase()
    val mime=when{path.endsWith(".m3u8")->"application/x-mpegURL";path.endsWith(".mpd")->"application/dash+xml";path.endsWith(".webm")->"video/webm";path.endsWith(".mkv")->"video/x-matroska";else->"video/mp4"}
    val metadata=MediaMetadata(MediaMetadata.MEDIA_TYPE_MOVIE).apply{putString(MediaMetadata.KEY_TITLE,data.optString("title","Primio"))}
    val media=MediaInfo.Builder(url).setContentType(mime).setStreamType(MediaInfo.STREAM_TYPE_BUFFERED).setMetadata(metadata).build()
    remote.load(MediaLoadRequestData.Builder().setMediaInfo(media).setAutoplay(true).setCurrentTime((data.optDouble("position",0.0)*1000).toLong()).build()).setResultCallback{result->if(result.status.isSuccess)invoke.resolve() else invoke.reject("The TV cannot play this source")}
   }
   if(client!=null){load();return@runOnUiThread}
   val router=MediaRouter.getInstance(activity)
   val selector=MediaRouteSelector.Builder().addControlCategory(CastMediaControlIntent.categoryForCast(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID)).build()
   val dialog=PrimioSheet(activity,"Google Cast")
   var selected=false
   fun render(){dialog.content.removeAllViews();val routes=router.routes.filter{!it.isDefault&&it.matchesSelector(selector)};if(routes.isEmpty())dialog.section(PrimioI18n.text(activity,"Recherche de téléviseurs…"));routes.forEach{route->dialog.option(route.name){selected=true;router.selectRoute(route);dialog.dismiss();val handler=Handler(Looper.getMainLooper());val start=SystemClock.elapsedRealtime();val poll=object:Runnable{override fun run(){if(activity.isDestroyed){invoke.reject("Casting cancelled");return};if(context.sessionManager.currentCastSession?.isConnected==true){load()}else if(SystemClock.elapsedRealtime()-start>20000){invoke.reject("Cast connection timed out")}else handler.postDelayed(this,300)}};handler.post(poll)}}}
   val listener=object:MediaRouter.Callback(){override fun onRouteAdded(r:MediaRouter,route:MediaRouter.RouteInfo){render()};override fun onRouteRemoved(r:MediaRouter,route:MediaRouter.RouteInfo){render()}}
   router.addCallback(selector,listener,MediaRouter.CALLBACK_FLAG_REQUEST_DISCOVERY)
   dialog.setOnDismissListener{router.removeCallback(listener);if(!selected)invoke.reject("Casting cancelled")}
   render();dialog.show()
  }catch(_:Exception){invoke.reject("Google Cast unavailable on this device")}}
 }
}
