package fr.azks.primio
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
class MainActivity:TauriActivity(),PrimioThemeOwner {
 private var appWebView:WebView?=null
 override var primioTheme:org.json.JSONObject?=null
 fun applyTheme(value:org.json.JSONObject){
  primioTheme=value
  val palette=PrimioPalette.from(this)
  window.decorView.setBackgroundColor(palette.background)
  WindowInsetsControllerCompat(window,window.decorView).apply{isAppearanceLightStatusBars=palette.light;isAppearanceLightNavigationBars=palette.light}
  getSharedPreferences("primio-appearance",0).edit().putString("theme",value.toString()).apply()
 }
 private var speech:app.tauri.plugin.Invoke?=null
 private val speechHandler=android.os.Handler(android.os.Looper.getMainLooper())
 private val speechTimeout=Runnable{speech?.reject("Voice recognition timed out");speech=null}
 fun recognizeSpeech(invoke:app.tauri.plugin.Invoke,language:String){runOnUiThread{
  if(speech!=null){invoke.reject("Voice recognition is already active");return@runOnUiThread}
  try{val intent=android.content.Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL,android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM).putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE,language).putExtra(android.speech.RecognizerIntent.EXTRA_MAX_RESULTS,1)
   speech=invoke;startActivityForResult(intent,913);speechHandler.postDelayed(speechTimeout,60000)
  }catch(_:Exception){speech=null;invoke.reject("Voice recognition unavailable")}
 }}
 override fun onActivityResult(requestCode:Int,resultCode:Int,data:android.content.Intent?){
  super.onActivityResult(requestCode,resultCode,data)
  if(requestCode==913){speechHandler.removeCallbacks(speechTimeout);val result=data?.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS)?.firstOrNull().orEmpty();speech?.resolve(app.tauri.plugin.JSObject().put("text",if(resultCode==RESULT_OK)result else "") as app.tauri.plugin.JSObject);speech=null}
 }
 override fun onDestroy(){speechHandler.removeCallbacks(speechTimeout);speech?.reject("Activity closed");speech=null;super.onDestroy()}

 override fun onWebViewCreate(webView:WebView){
  super.onWebViewCreate(webView)
  appWebView=webView
  WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
  // App chrome is fixed-size; PlayerActivity handles video pinch gestures separately.
  webView.settings.setSupportZoom(false)
  webView.settings.builtInZoomControls=false
  webView.settings.displayZoomControls=false
 }
 override fun onCreate(savedInstanceState:Bundle?){
  PrimioDiagnostics.install(applicationContext)
  enableEdgeToEdge();super.onCreate(savedInstanceState)
  onBackPressedDispatcher.addCallback(this,object:OnBackPressedCallback(true){
   override fun handleOnBackPressed(){appWebView?.evaluateJavascript("window.dispatchEvent(new Event('primio:back'))",null)}
  })
  PrimioUpdate.cleanup(this)
  WindowInsetsControllerCompat(window,window.decorView).isAppearanceLightStatusBars=false
  runCatching{org.json.JSONObject(getSharedPreferences("primio-appearance",0).getString("theme","{}")?:"{}")}.getOrNull()?.let{applyTheme(it)}
  val content=findViewById<View>(android.R.id.content)
  ViewCompat.setOnApplyWindowInsetsListener(content){view,insets->val bars=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout());view.setPadding(bars.left,bars.top,bars.right,bars.bottom);WindowInsetsCompat.CONSUMED}
 }
}
