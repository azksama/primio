package fr.azks.primio
import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
object PrimioDiagnostics {
 @Volatile private var installed=false
 fun install(context:Context){
  if(installed)return
  installed=true
  val previous=Thread.getDefaultUncaughtExceptionHandler()
  Thread.setDefaultUncaughtExceptionHandler{thread,error->
   try{
    val report="Android ${Build.VERSION.RELEASE} · ${System.currentTimeMillis()}\n${error.javaClass.name}\n"+error.stackTrace.take(60).joinToString("\n")
    java.io.File(context.filesDir,"java-crash.txt").writeText(report.take(16000))
   }catch(_:Exception){}
   previous?.uncaughtException(thread,error)?:run{android.os.Process.killProcess(android.os.Process.myPid())}
  }
 }
 fun report(context:Context):String {
  val javaReport=try{java.io.File(context.filesDir,"java-crash.txt").takeIf{it.length()<=16000}?.readText()?:""}catch(_:Exception){""}
  if(Build.VERSION.SDK_INT<30)return javaReport
  val manager=context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
  val history=manager.getHistoricalProcessExitReasons(context.packageName,0,5)
   .filter{it.reason==ApplicationExitInfo.REASON_CRASH||it.reason==ApplicationExitInfo.REASON_CRASH_NATIVE||it.reason==ApplicationExitInfo.REASON_ANR}
   .joinToString("\n\n"){exit->
    val trace=try{exit.traceInputStream?.use{stream->val buffer=ByteArray(16000);val n=stream.read(buffer);if(n>0)String(buffer,0,n,Charsets.UTF_8) else ""}?:""}catch(_:Exception){""}
    "Android ${Build.VERSION.RELEASE} · ${Build.MANUFACTURER} ${Build.MODEL}\nExit ${exit.reason} · ${exit.timestamp}\n$trace"
   }.take(32000)
  return listOf(history,javaReport).filter{it.isNotEmpty()}.joinToString("\n\n").take(32000)
 }
}
