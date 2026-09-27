package fr.azks.primio
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
class MainActivity:TauriActivity(){
 override fun onWebViewCreate(webView:WebView){
  super.onWebViewCreate(webView)
  WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
  // App chrome is fixed-size; PlayerActivity handles video pinch gestures separately.
  webView.settings.setSupportZoom(false)
  webView.settings.builtInZoomControls=false
  webView.settings.displayZoomControls=false
 }
 override fun onCreate(savedInstanceState:Bundle?){
  enableEdgeToEdge();super.onCreate(savedInstanceState)
  PrimioUpdate.cleanup(this)
  WindowInsetsControllerCompat(window,window.decorView).isAppearanceLightStatusBars=false
  val content=findViewById<View>(android.R.id.content)
  ViewCompat.setOnApplyWindowInsetsListener(content){view,insets->val bars=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout());view.setPadding(bars.left,bars.top,bars.right,bars.bottom);WindowInsetsCompat.CONSUMED}
 }
}
