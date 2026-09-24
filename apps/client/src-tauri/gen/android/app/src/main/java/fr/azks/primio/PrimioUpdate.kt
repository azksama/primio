package fr.azks.primio

import android.app.Activity
import android.content.*
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import java.io.File

object PrimioUpdate {
 fun install(activity:Activity,path:String) {
  val file=File(path).canonicalFile
  require(file.parentFile==File(activity.cacheDir,"updates").canonicalFile&&file.name.matches(Regex("primio-[0-9]+\\.[0-9]+\\.[0-9]+\\.apk")))
  val flags=if(Build.VERSION.SDK_INT>=28)PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
  val archive=activity.packageManager.getPackageArchiveInfo(file.path,flags)?:error("Invalid APK")
  val current=activity.packageManager.getPackageInfo(activity.packageName,flags)
  require(archive.packageName==activity.packageName)
  val oldSigners=if(Build.VERSION.SDK_INT>=28)current.signingInfo?.apkContentsSigners else current.signatures
  val newSigners=if(Build.VERSION.SDK_INT>=28)archive.signingInfo?.apkContentsSigners else archive.signatures
  require(!oldSigners.isNullOrEmpty()&&!newSigners.isNullOrEmpty()&&oldSigners.toSet()==newSigners.toSet())
  require(if(Build.VERSION.SDK_INT>=28)archive.longVersionCode>current.longVersionCode else archive.versionCode>current.versionCode)
  if(!activity.packageManager.canRequestPackageInstalls()){
   activity.startActivity(Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.packageName)))
   error(PrimioI18n.text(activity,"Autorisez l’installation, puis réessayez."))
  }
  val uri=FileProvider.getUriForFile(activity,activity.packageName+".fileprovider",file)
  activity.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
 }
 fun cleanup(context:Context){
  val directory=File(context.cacheDir,"updates");val version=context.packageManager.getPackageInfo(context.packageName,0).versionName
  if(version!=null&&version.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+"))){
   val file=File(directory,"primio-$version.apk")
   if(file.isFile&&file.delete())File(directory,"ready.json").delete()
  }
 }
}
class PrimioUpdateReceiver:BroadcastReceiver(){
 override fun onReceive(context:Context,intent:Intent){
  if(intent.action!=Intent.ACTION_MY_PACKAGE_REPLACED)return
  PrimioUpdate.cleanup(context)
  PrimioNotifications.post(context,"installed",PrimioI18n.text(context,"Mise à jour installée"),PrimioI18n.text(context,"Ouvrir Primio"))
 }
}
