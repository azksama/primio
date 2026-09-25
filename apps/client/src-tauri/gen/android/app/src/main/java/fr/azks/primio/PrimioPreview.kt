package fr.azks.primio

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.os.Handler
import android.os.Looper
import android.widget.ImageView
import org.json.JSONObject
import java.util.concurrent.Executors

/** A separate decoder: preview requests never seek or reload the playing video. */
class PrimioPreview(private val options:JSONObject, private val view:ImageView) {
 private val worker=Executors.newSingleThreadExecutor()
 private val handler=Handler(Looper.getMainLooper())
 private val cache=android.util.LruCache<Long,Bitmap>(16)
 private var pending:Long?=null
 private var working=false
 private var closed=false
 private var requested=0L
 fun show(seconds:Double){
  if(closed)return
  val key=(seconds.coerceAtLeast(0.0)/5).toLong()*5
  requested=key
  cache.get(key)?.let{view.setImageBitmap(it);return}
  view.setImageDrawable(null)
  pending=key
  pump()
 }
 private fun pump(){
  if(working||closed)return
  val key=pending?:return;pending=null;working=true
  worker.execute{
   val retriever=MediaMetadataRetriever()
   var frame:Bitmap?=null
   try{
    val headers=mutableMapOf<String,String>();options.optJSONObject("headers")?.let{h->h.keys().forEach{headers[it]=h.optString(it)}}
    val url=options.optString("url")
    if(url.startsWith("/"))retriever.setDataSource(url) else retriever.setDataSource(url,headers)
    frame=retriever.getScaledFrameAtTime(key*1000000,MediaMetadataRetriever.OPTION_CLOSEST_SYNC,240,135)
   }catch(_:Exception){}finally{try{retriever.release()}catch(_:Exception){}}
   handler.post{
    working=false
    if(closed){frame?.recycle();return@post}
    frame?.let{cache.put(key,it);if(requested==key)view.setImageBitmap(it)}
    pump()
   }
  }
 }
 fun hide(){pending=null;requested=-1;view.setImageDrawable(null)}
 fun close(){closed=true;pending=null;worker.shutdownNow();view.setImageDrawable(null);cache.evictAll()}
}
