package fr.azks.primio

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import org.json.*
import java.io.File
import java.util.UUID
import androidx.work.*
import java.util.concurrent.TimeUnit

class DownloadStore(private val context:Context) {
 private val prefs=context.getSharedPreferences("primio-downloads",Context.MODE_PRIVATE)
 private val manager=context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
 private fun records()=JSONObject(prefs.getString("items","{}")?:"{}")
 private fun save(items:JSONObject){check(prefs.edit().putString("items",items.toString()).commit())}
 fun configure(raw:String)=synchronized(lock){
  val incoming=JSONObject(raw);val policies=JSONObject(PrimioStore.read(context,"downloadPolicies")?:"{}");val account=incoming.getString("accountId")
  policies.put(account,incoming.getJSONArray("profiles"));PrimioStore.write(context,"downloadPolicies",policies.toString())
  WorkManager.getInstance(context).enqueueUniquePeriodicWork("primio-download-cleanup",ExistingPeriodicWorkPolicy.KEEP,PeriodicWorkRequestBuilder<DownloadCleanupWorker>(1,TimeUnit.HOURS).build())
 }
 fun markWatched(id:String)=synchronized(lock){val items=records();items.optJSONObject(id)?.put("watched",true)?:return@synchronized;save(items)}
 private fun cleanup(items:JSONObject,now:Long){
  val policies=JSONObject(PrimioStore.read(context,"downloadPolicies")?:"{}")
  for(id in items.keys().asSequence().toList()){
   val item=items.getJSONObject(id);val meta=item.optJSONObject("meta")?:continue
   val profiles=policies.optJSONArray(meta.optString("accountId"))?:continue
   val policy=(0 until profiles.length()).map{profiles.getJSONObject(it)}.firstOrNull{it.optString("id")==meta.optString("profileId")}?:continue
   val watched=policy.optJSONArray("watched")?:JSONArray()
   val alreadySeen=item.optBoolean("watched")||(0 until watched.length()).any{val v=watched.getJSONObject(it);v.optString("videoId")==meta.optString("videoId")&&v.optString("type")==meta.optJSONObject("meta")?.optString("type")}
   val days=policy.optInt("days",0).coerceIn(0,365);val completed=item.optLong("completedAt",0)
   if(shouldExpire(item.optString("status"),completed,days,alreadySeen,id==playingId,now)){manager.remove(item.getLong("downloadId"));val file=ownedFile(id);if(file.exists())check(file.delete());items.remove(id)}
  }
 }
 fun start(url:String,title:String,metadata:String,headers:Map<String,String>,wifiOnly:Boolean):String=synchronized(lock){
  require(Uri.parse(url).scheme in listOf("https","http"))
  val meta=JSONObject(metadata);require(meta.toString().length<16000)
  val items=records();require(items.length()<100){"Limite de 100 téléchargements atteinte."}
  val root=context.getExternalFilesDir(Environment.DIRECTORY_MOVIES)?:error("Stockage indisponible.")
  require(root.usableSpace>512_000_000L){"Espace insuffisant : libérez au moins 512 Mo."}
  val id=UUID.randomUUID().toString()
  val request=DownloadManager.Request(Uri.parse(url)).setTitle(title.take(200)).setDescription("Primio · téléchargement interne").setDestinationInExternalFilesDir(context,Environment.DIRECTORY_MOVIES,"$id.media").setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED).setAllowedOverMetered(!wifiOnly).setAllowedOverRoaming(false)
  if(wifiOnly)request.setAllowedNetworkTypes(DownloadManager.Request.NETWORK_WIFI)
  headers.forEach{(name,value)->request.addRequestHeader(name,value)}
  val downloadId=manager.enqueue(request)
  try{items.put(id,JSONObject().put("id",id).put("downloadId",downloadId).put("meta",meta).put("title",title).put("createdAt",System.currentTimeMillis()));save(items)}catch(e:Exception){manager.remove(downloadId);throw e}
  id
 }
 fun list():JSONArray=synchronized(lock){
  val result=JSONArray();val items=records()
  items.keys().forEach{id->val item=items.getJSONObject(id);manager.query(DownloadManager.Query().setFilterById(item.getLong("downloadId")))?.use{cursor->
   if(cursor.moveToFirst()){
    val status=cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
    val total=cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
    val bytes=cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
    val file=ownedFile(id)
    if(status==DownloadManager.STATUS_SUCCESSFUL&&!item.has("completedAt")){val at=cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_LAST_MODIFIED_TIMESTAMP));item.put("completedAt",at.takeIf{it>0}?:System.currentTimeMillis())}
    item.put("status",when(status){DownloadManager.STATUS_SUCCESSFUL->if(!file.exists())"missing" else if(isPlaylist(file))"unsupported" else "complete";DownloadManager.STATUS_FAILED->"failed";DownloadManager.STATUS_PAUSED->"paused";DownloadManager.STATUS_RUNNING->"downloading";else->"queued"}).put("bytes",bytes.coerceAtLeast(0)).put("total",total.coerceAtLeast(0))
   }else item.put("status","missing")
  }?:item.put("status","missing");if(item.optString("status")=="complete"&&!item.has("completedAt"))item.put("completedAt",System.currentTimeMillis())}
  cleanup(items,System.currentTimeMillis());save(items);items.keys().forEach{result.put(items.getJSONObject(it))};result
 }
 private fun isPlaylist(file:File):Boolean {val head=file.inputStream().use{input->val bytes=ByteArray(512);val count=input.read(bytes);if(count<=0)"" else String(bytes,0,count,Charsets.UTF_8)}.trimStart();return head.startsWith("#EXTM3U")||head.startsWith("<?xml")||head.startsWith("<MPD")||head.startsWith("<!DOCTYPE",true)||head.startsWith("<html",true)}
 private fun ownedFile(id:String):File {require(id.matches(Regex("[0-9a-f-]{36}")));val root=context.getExternalFilesDir(Environment.DIRECTORY_MOVIES)?:error("Stockage indisponible");val file=File(root,"$id.media");check(file.canonicalFile.parentFile==root.canonicalFile);return file}
 fun readyFile(id:String):File=synchronized(lock){val list=list();val item=(0 until list.length()).map{list.getJSONObject(it)}.firstOrNull{it.getString("id")==id}?:error("Téléchargement introuvable");require(item.optString("status")=="complete"){"Le téléchargement n’est pas terminé."};ownedFile(id)}
 fun remove(id:String)=synchronized(lock){val items=records();val item=items.optJSONObject(id)?:return@synchronized;manager.remove(item.getLong("downloadId"));val file=ownedFile(id);if(file.exists())check(file.delete());items.remove(id);save(items)}
 companion object{
  private val lock=Any()
  @Volatile var playingId=""
  fun shouldExpire(status:String,completedAt:Long,days:Int,watched:Boolean,playing:Boolean,now:Long)=status=="complete"&&completedAt>0&&days in 1..365&&!watched&&!playing&&now-completedAt>=days*86400000L
 }
}
class DownloadCleanupWorker(context:Context,params:WorkerParameters):Worker(context,params){override fun doWork():Result=try{DownloadStore(applicationContext).list();Result.success()}catch(_:Exception){Result.retry()}}
