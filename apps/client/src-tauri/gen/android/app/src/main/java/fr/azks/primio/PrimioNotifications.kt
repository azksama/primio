package fr.azks.primio

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.*
import org.json.*
import java.net.URL
import javax.net.ssl.HttpsURLConnection
import java.util.concurrent.TimeUnit

object PrimioNotifications {
 const val channel="primio-releases"
 fun allowed(context:Context)=NotificationManagerCompat.from(context).areNotificationsEnabled()&&(Build.VERSION.SDK_INT<33||context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)
 @Synchronized fun configure(context:Context,raw:String){
  val value=JSONObject(raw);require((value.optJSONArray("entries")?.length()?:0)<=1000)
  PrimioStore.write(context,"notificationConfig",value.toString())
  val work=WorkManager.getInstance(context)
  if(!value.optBoolean("episodes")&&!value.optBoolean("updates")){work.cancelUniqueWork("primio-notifications");work.cancelUniqueWork("primio-notifications-now");return}
  work.enqueueUniquePeriodicWork("primio-notifications",ExistingPeriodicWorkPolicy.KEEP,PeriodicWorkRequestBuilder<PrimioNotificationWorker>(1,TimeUnit.HOURS).build())
  work.enqueueUniqueWork("primio-notifications-now",ExistingWorkPolicy.KEEP,OneTimeWorkRequestBuilder<PrimioNotificationWorker>().build())
 }
 fun post(context:Context,id:String,title:String,body:String):Boolean {
  if(!allowed(context))return false
  val manager=context.getSystemService(NotificationManager::class.java)
  manager.createNotificationChannel(NotificationChannel(channel,"Primio",NotificationManager.IMPORTANCE_DEFAULT))
  val intent=Intent(context,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP).setData(android.net.Uri.parse("primio://notifications"))
  val pending=PendingIntent.getActivity(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val notification=NotificationCompat.Builder(context,channel).setSmallIcon(R.drawable.ic_notification).setContentTitle(title).setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body)).setContentIntent(pending).setAutoCancel(true).setOnlyAlertOnce(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).build()
  manager.notify(id.hashCode(),notification)
  return true
 }
}
class PrimioNotificationWorker(context:Context,params:WorkerParameters):Worker(context,params){
 override fun doWork():Result {
  try {
   val config=JSONObject(PrimioStore.read(applicationContext,"notificationConfig")?:return Result.success())
   if(!PrimioNotifications.allowed(applicationContext))return Result.success()
   val scope=config.optString("scope");val now=System.currentTimeMillis();val entries=config.optJSONArray("entries")?:JSONArray()
   fun key(id:String)=java.security.MessageDigest.getInstance("SHA-256").digest(id.toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it)}
   val seen=applicationContext.getSharedPreferences("primio-notification-seen",0)
   fun post(id:String,title:String,body:String,kind:String):Boolean = synchronized(PrimioNotifications){
    val current=JSONObject(PrimioStore.read(applicationContext,"notificationConfig")?:"{}")
    if(current.optString("scope")!=scope||!current.optBoolean(kind)||seen.contains(id))false
    else if(PrimioNotifications.post(applicationContext,id,title,body)){seen.edit().putLong(id,now).commit();true}else false
   }
   if(config.optBoolean("episodes"))for(i in 0 until entries.length()){
    val item=entries.getJSONObject(i);val at=item.optLong("at");val id=key(scope+":"+item.optString("id"))
    if(at>now||at<config.optLong("since")||at<now-7*86400000L||seen.contains(id))continue
    if(post(id,item.optString("title"),item.optString("body"),"episodes"))seen.edit().putLong(id,now).apply()
   }
   if(config.optBoolean("updates")){
    val connection=URL("https://primio-api.azks.fr/api/v1/app-release").openConnection() as HttpsURLConnection
    try{connection.connectTimeout=10000;connection.readTimeout=10000;connection.instanceFollowRedirects=false
     if(connection.responseCode==200){val bytes=connection.inputStream.use{stream->val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(1024);while(true){val count=stream.read(buffer);if(count<0)break;require(out.size()+count<=8192);out.write(buffer,0,count)};out.toByteArray()};require(bytes.size<=8192);val release=JSONObject(String(bytes,Charsets.UTF_8));val candidate=release.optString("version");val a=candidate.split('.').mapNotNull{it.toIntOrNull()};val b=BuildConfig.VERSION_NAME.split('.').mapNotNull{it.toIntOrNull()};val newer=a.size==3&&b.size==3&&(a.zip(b).firstOrNull{it.first!=it.second}?.let{it.first>it.second}?:false);val id="update:$candidate"
      if(newer&&!seen.contains(id)&&post(id,"Primio $candidate",PrimioI18n.text(applicationContext,"Mise à jour disponible"),"updates"))seen.edit().putLong(id,now).apply()
     }
    }finally{connection.disconnect()}
   }
   val editor=seen.edit();seen.all.filterValues{it is Long&&it<now-90*86400000L}.keys.forEach{editor.remove(it)};editor.apply()
   return Result.success()
  }catch(_:Exception){return if(runAttemptCount<3)Result.retry() else Result.failure()}
 }
}
