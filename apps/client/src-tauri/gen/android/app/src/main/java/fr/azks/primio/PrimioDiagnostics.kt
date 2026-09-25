package fr.azks.primio
import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
object PrimioDiagnostics {
 fun report(context:Context):String {
  if(Build.VERSION.SDK_INT<30)return ""
  val manager=context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
  return manager.getHistoricalProcessExitReasons(context.packageName,0,5)
   .filter{it.reason==ApplicationExitInfo.REASON_CRASH||it.reason==ApplicationExitInfo.REASON_CRASH_NATIVE||it.reason==ApplicationExitInfo.REASON_ANR}
   .joinToString("\n\n"){exit->
    val trace=try{exit.traceInputStream?.use{stream->val buffer=ByteArray(16000);val n=stream.read(buffer);if(n>0)String(buffer,0,n,Charsets.UTF_8) else ""}?:""}catch(_:Exception){""}
    "Android ${Build.VERSION.RELEASE} · ${Build.MANUFACTURER} ${Build.MODEL}\nExit ${exit.reason} · ${exit.timestamp}\n$trace"
   }.take(32000)
 }
}
