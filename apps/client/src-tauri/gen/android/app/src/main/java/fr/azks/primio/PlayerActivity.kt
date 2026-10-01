package fr.azks.primio

import android.app.Activity
import android.os.*
import android.content.Context
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.media.*
import android.view.*
import android.widget.*
import android.util.Base64
import org.json.*
import java.io.File
import java.security.KeyStore
import java.util.Locale
import kotlin.math.*

class PlayerActivity:Activity(),SurfaceHolder.Callback,PrimioThemeOwner {
 override val primioTheme:JSONObject? get()=if(::options.isInitialized)options.optJSONObject("theme") else null
 companion object {private var active:java.lang.ref.WeakReference<PlayerActivity>?=null}
 class PipReceiver:android.content.BroadcastReceiver(){
  override fun onReceive(context:Context,intent:android.content.Intent){
   val player=active?.get()?:return
   when(intent.action){
    "fr.azks.primio.PIP_PLAY"->player.command("set","pause","no")
    "fr.azks.primio.PIP_PAUSE"->player.command("set","pause","yes")
   }
  }
 }
 private external fun nativeCreate(surface:Surface,context:Context,options:String):Long
 private external fun nativeCommand(handle:Long,command:String)
 private external fun nativeState(handle:Long):String
 private external fun nativeDestroy(handle:Long)
 private external fun nativeProgress(payload:String)
 private lateinit var buffering:TextView
 private var requestedVideoId=""
 private var actionId=""
 private var autoPlay=false
 private var breathing:android.animation.ObjectAnimator?=null
 private var episodeSeason:Int?=null
 private var handle=0L
 private lateinit var options:JSONObject
 private lateinit var root:FrameLayout
 private lateinit var surface:SurfaceView
 private lateinit var top:FrameLayout
 private lateinit var center:LinearLayout
 private lateinit var playerActions:LinearLayout
 private var scrubbing=false
 private var scrubTarget=0.0
 private var scrubWasPaused=false
 private lateinit var overlay:FrameLayout
 private lateinit var seek:PrimioTimeline
 private lateinit var preview:PrimioPreview
 private lateinit var previewPanel:LinearLayout
 private lateinit var previewTime:TextView
 private var fillScreen=false
 private lateinit var time:TextView
 private lateinit var remaining:TextView
 private lateinit var skipButton:TextView
 private lateinit var skipCountdown:PrimioCountdown
 private var countdownKey=""
 private var countdownElapsed=0f
 private lateinit var nextEpisodeButton:TextView
 private var nextEpisodeOffered=false
 private var currentSegment:JSONObject?=null
 private val skipped=mutableSetOf<Double>()
 private val cancelledSkips=mutableSetOf<Double>()
 private var cancelledNext=false
 private val imageWorker=java.util.concurrent.Executors.newFixedThreadPool(2)
 private val episodeImages=android.util.LruCache<String,android.graphics.Bitmap>(24)
 private val pendingImages=mutableMapOf<String,MutableList<ImageView>>()
 private var inferredPrevious=false
 private lateinit var pause:PrimioIconButton
 private var forceSubtitleStyle=false
 private lateinit var loading:LinearLayout
 private lateinit var loadingLabel:TextView
 private lateinit var gestureLabel:TextView
 private lateinit var seekFeedback:TextView
 private lateinit var brightnessIndicator:PrimioLevelIndicator
 private lateinit var volumeIndicator:PrimioLevelIndicator
 private val clearLevels=Runnable{brightnessIndicator.visibility=View.GONE;volumeIndicator.visibility=View.GONE}
 private val watchedChanges=linkedMapOf<String,JSONObject>()
 private val clearSeekFeedback=Runnable{if(::seekFeedback.isInitialized)seekFeedback.visibility=View.GONE}
 private val fadeSeekFeedback=Runnable{if(::seekFeedback.isInitialized&&!options.optBoolean("reduceMotion"))seekFeedback.animate().alpha(0f).setDuration(250).start()}
 private var seekBurstAt=0L
 private var seekBurstAhead=false
 private var seekBurstTotal=0
 private val episodeRows=mutableMapOf<String,Triple<JSONObject,TextView,PrimioEpisodeProgress>>()
 private lateinit var audio:AudioManager
 private lateinit var focus:AudioFocusRequest
 private var duration=0.0
 private var position=0.0
 private var dragging=false
 private var last=JSONObject()
 private var openedAt=0L
 private var stalledAt=0L
 private var resumeAfterPause=false
 private var loaded=false
 private var reportedError=false
 private var sheet:PrimioSheet?=null
 private var cacheLimit=0L
 private var cacheActive=false
 private var nextProgress=0L
 private var rewind=10
 private var forward=10
 private val handler=Handler(Looper.getMainLooper())
 private val timer=object:Runnable {override fun run(){poll();handler.postDelayed(this,250)}}
 private val hide=Runnable{if(sheet==null&&!dragging)overlay.visibility=View.GONE}
 private val clearGesture=Runnable{gestureLabel.visibility=View.GONE}
 private fun tr(s:String)=PrimioI18n.text(this,s)
 private fun dp(n:Int)=PrimioStyle.dp(this,n)
 private fun text(s:String,size:Float=15f)=PrimioStyle.text(this,s,size)
 private fun button(s:String,description:String=s,action:()->Unit)=PrimioStyle.button(this,s,description){action();showControls()}
 override fun onCreate(savedInstanceState:Bundle?) {
  super.onCreate(savedInstanceState)
  active?.get()?.let{previous->previous.handler.removeCallbacksAndMessages(null);previous.emit(true);previous.release();previous.finish()}
  active=java.lang.ref.WeakReference(this)
  if(Build.VERSION.SDK_INT>=33)onBackInvokedDispatcher.registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT){if(sheet!=null){sheet?.dismiss();sheet=null}else leavePlayer()}
  window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  requestedOrientation=ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
  window.decorView.systemUiVisibility=View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
  options=JSONObject(intent.getStringExtra("options")?:"{}")
  options.put("caFile",exportCertificates())
  forceSubtitleStyle=options.optBoolean("forceSubtitleStyle",false)
  DownloadStore.playingId=options.optString("downloadId")
  rewind=options.optInt("seekBackward",10).coerceIn(5,60);forward=options.optInt("seekForward",10).coerceIn(5,60)
  val cache=File(cacheDir,"media").apply{mkdirs()}
  cacheLimit=min((options.optDouble("cacheSizeGb",1.0).coerceIn(0.0,10.0)*1_000_000_000).toLong(),(cache.usableSpace-512_000_000L).coerceAtLeast(0))
  cacheActive=cacheLimit>=128_000_000L&&!options.optBoolean("offline")
  if(cacheActive)options.put("cacheDir",cache.absolutePath)
  audio=getSystemService(AUDIO_SERVICE) as AudioManager
  root=FrameLayout(this).apply{setBackgroundColor(Color.BLACK)}
  surface=SurfaceView(this);surface.holder.addCallback(this);root.addView(surface,FrameLayout.LayoutParams(-1,-1))
  val gestureLayer=View(this);root.addView(gestureLayer,FrameLayout.LayoutParams(-1,-1));installGestures(gestureLayer)
  overlay=FrameLayout(this);root.addView(overlay,FrameLayout.LayoutParams(-1,-1))
  top=FrameLayout(this).apply{setPadding(dp(24),dp(14),dp(24),dp(14))}
  val headerActions=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL}
  headerActions.addView(PrimioIconButton(this,"back",tr("Retour")){leavePlayer()},LinearLayout.LayoutParams(dp(48),dp(48)))
  headerActions.addView(PrimioIconButton(this,"close",tr("Fermer")){finish()},LinearLayout.LayoutParams(dp(48),dp(48)).apply{leftMargin=dp(10)})
  top.addView(headerActions,FrameLayout.LayoutParams(-2,dp(48),Gravity.START or Gravity.CENTER_VERTICAL))
  top.addView(text(options.optString("title","Primio"),22f).apply{typeface=android.graphics.Typeface.createFromAsset(assets,"fonts/cormorant-garamond.ttf");gravity=Gravity.CENTER;includeFontPadding=false;setShadowLayer(dp(2).toFloat(),0f,dp(1).toFloat(),0xcc000000.toInt());maxLines=3;setAutoSizeTextTypeUniformWithConfiguration(12,22,1,android.util.TypedValue.COMPLEX_UNIT_SP)},FrameLayout.LayoutParams(-1,dp(48),Gravity.CENTER).apply{leftMargin=dp(140);rightMargin=dp(140)})
  if((options.optJSONArray("episodes")?.length()?:0)>0)top.addView(button(tr("Épisodes"),tr("Choisir un épisode")){episodes()},FrameLayout.LayoutParams(dp(128),dp(48),Gravity.END or Gravity.CENTER_VERTICAL))
  overlay.addView(top,FrameLayout.LayoutParams(-1,dp(76),Gravity.TOP))
  center=LinearLayout(this).apply{gravity=Gravity.CENTER}
  center.addView(PrimioIconButton(this,"rewind",PrimioI18n.text(this,"Reculer de {n} secondes",mapOf("n" to rewind))){jump(false)},LinearLayout.LayoutParams(dp(56),dp(56)).apply{setMargins(dp(16),0,dp(16),0)})
  pause=PrimioIconButton(this,"pause",tr("Lecture ou pause")){command("cycle","pause");showControls()}
  center.addView(pause,LinearLayout.LayoutParams(dp(64),dp(64)))
  center.addView(PrimioIconButton(this,"forward",PrimioI18n.text(this,"Avancer de {n} secondes",mapOf("n" to forward))){jump(true)},LinearLayout.LayoutParams(dp(56),dp(56)).apply{setMargins(dp(16),0,dp(16),0)})
  overlay.addView(center,FrameLayout.LayoutParams(-1,dp(92),Gravity.CENTER))
  val bottom=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(28),dp(16),dp(28),dp(20))}
  val labels=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(14),0,dp(14),0)}
  time=text("00:00",13f);remaining=text("",12f)
  for(label in listOf(time,remaining))label.setShadowLayer(dp(2).toFloat(),0f,dp(1).toFloat(),0xee000000.toInt())
  time.maxLines=1;remaining.maxLines=1
  labels.addView(time,LinearLayout.LayoutParams(0,-2,1f));labels.addView(remaining,LinearLayout.LayoutParams(-2,-2));bottom.addView(labels)
  previewPanel=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;background=PrimioStyle.glass(this@PlayerActivity,12);visibility=View.GONE;setPadding(dp(6),dp(6),dp(6),dp(6))}
  val previewImage=ImageView(this).apply{scaleType=ImageView.ScaleType.FIT_CENTER};previewPanel.addView(previewImage,LinearLayout.LayoutParams(dp(160),dp(90)))
  previewTime=text("",13f).apply{gravity=Gravity.CENTER};previewPanel.addView(previewTime);preview=PrimioPreview(options,previewImage)
  overlay.addView(previewPanel,FrameLayout.LayoutParams(dp(172),dp(124),Gravity.TOP or Gravity.START))
  seek=PrimioTimeline(this).apply{onSeek={fraction,done->dragging=!done;handler.removeCallbacks(hide);time.text=format(duration*fraction)+" / "+format(duration);if(done){preview.hide();previewPanel.visibility=View.GONE;command("seek",(duration*fraction).toString(),"absolute");showControls()}else if(duration>0){showSeekPreview(fraction)}}}
  bottom.addView(seek,LinearLayout.LayoutParams(-1,dp(32)).apply{bottomMargin=dp(12)})
  playerActions=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL}
  playerActions.addView(PrimioIconButton(this,"source",tr("Source")){requestEpisode(options.optString("currentVideoId"),false)},LinearLayout.LayoutParams(dp(48),dp(48)))
  playerActions.addView(View(this),LinearLayout.LayoutParams(0,1,1f))
  playerActions.addView(PrimioIconButton(this,"speed",tr("Vitesse")){val dialog=PrimioSheet(this,tr("Vitesse de lecture"));sheet=dialog;dialog.setOnDismissListener{sheet=null;showControls()};listOf(0.5,0.75,1.0,1.25,1.5,1.75,2.0).forEach{speed->dialog.option("${speed}×",false){command("set","speed",speed.toString());dialog.dismiss()}};dialog.show()},LinearLayout.LayoutParams(dp(48),dp(48)).apply{rightMargin=dp(12)})
  playerActions.addView(PrimioIconButton(this,"subtitles",tr("Audio et sous-titres")){tracks()},LinearLayout.LayoutParams(dp(48),dp(48)))
  bottom.addView(playerActions)
  overlay.addView(bottom,FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM))
  loading=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;contentDescription=tr("Chargement de la vidéo")}
  val artwork=ImageView(this).apply{setImageResource(R.drawable.primio_brand);scaleType=ImageView.ScaleType.FIT_CENTER}
  loading.addView(artwork,LinearLayout.LayoutParams(dp(140),dp(80)))
  loadingLabel=text(options.optString("title","Primio"),13f).apply{gravity=Gravity.CENTER;maxLines=2;setPadding(dp(8),dp(10),dp(8),0)};loading.addView(loadingLabel)
  root.addView(loading,FrameLayout.LayoutParams(min(dp(460),(resources.displayMetrics.widthPixels*.7f).toInt()),-2,Gravity.CENTER))
  buffering=text("···",22f).apply{visibility=View.GONE;contentDescription=tr("Chargement")};root.addView(buffering,FrameLayout.LayoutParams(dp(48),dp(40),Gravity.BOTTOM or Gravity.START).apply{leftMargin=dp(24);bottomMargin=dp(140)})
  breathing=android.animation.ObjectAnimator.ofFloat(loading,View.ALPHA,.35f,1f).apply{duration=1500;repeatMode=android.animation.ValueAnimator.REVERSE;repeatCount=android.animation.ValueAnimator.INFINITE;if(!options.optBoolean("reduceMotion"))start()}
  loadLogo(artwork,options.optString("logo"))
  overlay.visibility=View.GONE
  gestureLabel=text("",16f).apply{gravity=Gravity.CENTER;background=PrimioStyle.glass(this@PlayerActivity);setPadding(dp(24),dp(16),dp(24),dp(16));visibility=View.GONE}
  root.addView(gestureLabel,FrameLayout.LayoutParams(-2,-2,Gravity.CENTER))
  seekFeedback=text("",22f).apply{gravity=Gravity.CENTER;includeFontPadding=false;visibility=View.GONE;setShadowLayer(dp(3).toFloat(),0f,dp(1).toFloat(),Color.BLACK);importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO}
  root.addView(seekFeedback,FrameLayout.LayoutParams(dp(144),dp(64),Gravity.CENTER_VERTICAL or Gravity.START))
  brightnessIndicator=PrimioLevelIndicator(this,"brightness",tr("Luminosité"))
  volumeIndicator=PrimioLevelIndicator(this,"volume",tr("Volume"))
  root.addView(brightnessIndicator,FrameLayout.LayoutParams(dp(60),dp(204),Gravity.CENTER_VERTICAL or Gravity.START).apply{leftMargin=dp(28)})
  root.addView(volumeIndicator,FrameLayout.LayoutParams(dp(60),dp(204),Gravity.CENTER_VERTICAL or Gravity.END).apply{rightMargin=dp(28)})
  skipButton=button(tr("Passer l’intro")){currentSegment?.let{command("seek",it.optDouble("end").toString(),"absolute");skipped.add(it.optDouble("start"))}}
  skipButton.visibility=View.GONE
  root.addView(skipButton,FrameLayout.LayoutParams(-2,dp(48),Gravity.BOTTOM or Gravity.END).apply{rightMargin=dp(28);bottomMargin=dp(144)})
  nextEpisodeButton=button(tr("Épisode suivant")){position=duration;requestEpisode(options.optString("nextVideoId"),true)}
  nextEpisodeButton.visibility=View.GONE
  root.addView(nextEpisodeButton,FrameLayout.LayoutParams(-2,dp(48),Gravity.BOTTOM or Gravity.END).apply{rightMargin=dp(28);bottomMargin=dp(144)})
  skipCountdown=PrimioCountdown(this).apply{visibility=View.GONE;setOnClickListener{
   if(countdownKey=="next")cancelledNext=true else countdownKey.substringAfter(':',"").toDoubleOrNull()?.let{cancelledSkips.add(it)}
   visibility=View.GONE;showControls()
  }}
  root.addView(skipCountdown,FrameLayout.LayoutParams(dp(48),dp(48),Gravity.BOTTOM or Gravity.END).apply{rightMargin=dp(28);bottomMargin=dp(144)})
  setContentView(root)
  focus=AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build()).setOnAudioFocusChangeListener{if(it<0)command("set","pause","yes")}.build()
  audio.requestAudioFocus(focus)
 }
 private fun installGestures(layer:View) {
  var pinching=false
  var scale=1f
  val pinch=ScaleGestureDetector(this,object:ScaleGestureDetector.SimpleOnScaleGestureListener(){
   override fun onScaleBegin(d:ScaleGestureDetector):Boolean{pinching=true;scale=1f;return true}
   override fun onScale(d:ScaleGestureDetector):Boolean{scale*=d.scaleFactor;if(scale>1.12f&&!fillScreen){fillScreen=true;command("set","panscan","1");feedback(tr("Remplir l’écran"))}else if(scale<.88f&&fillScreen){fillScreen=false;command("set","panscan","0");feedback(tr("Ajuster à l’écran"))};return true}
  })
  var startVolume=0;var startBrightness=0.5f;var vertical=false
  var downX=0f;var downY=0f;var downTime=0L;var startPosition=0.0
  var burstTap=false
  val detector=GestureDetector(this,object:GestureDetector.SimpleOnGestureListener(){
   override fun onDown(e:MotionEvent):Boolean {startVolume=audio.getStreamVolume(AudioManager.STREAM_MUSIC);startBrightness=window.attributes.screenBrightness.takeIf{it>=0}?:0.5f;vertical=false;return true}
   override fun onSingleTapConfirmed(e:MotionEvent):Boolean{if(scrubbing)return true;if(overlay.visibility==View.VISIBLE)overlay.visibility=View.GONE else showControls();return true}
   override fun onDoubleTap(e:MotionEvent):Boolean{if(!burstTap)jump(e.x>root.width/2);return true}
   override fun onScroll(first:MotionEvent?,e:MotionEvent,dx:Float,dy:Float):Boolean {
    if(first==null||scrubbing)return false
    val delta=first.y-e.y
    if(!vertical&&(abs(delta)<dp(16)||abs(delta)<abs(e.x-first.x)))return true
    vertical=true;handler.removeCallbacks(hide);val change=delta/root.height.coerceAtLeast(1)*1.4f
    if(first.x<root.width/2){val brightness=(startBrightness+change).coerceIn(0.05f,1f);window.attributes=window.attributes.apply{screenBrightness=brightness};showLevel(true,brightness)}
    else{val max=audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);val volume=(startVolume+change*max).roundToInt().coerceIn(0,max);audio.setStreamVolume(AudioManager.STREAM_MUSIC,volume,0);showLevel(false,volume.toFloat()/max.coerceAtLeast(1))};return true
   }
  })
  detector.setIsLongpressEnabled(false)
  layer.setOnTouchListener{_,event->
   if(event.actionMasked==MotionEvent.ACTION_DOWN){downX=event.x;downY=event.y;downTime=event.eventTime;startPosition=position;burstTap=event.eventTime-seekBurstAt in 0..700&&seekBurstAhead==(event.x>root.width/2)}
   pinch.onTouchEvent(event)
   if(event.pointerCount>1||pinching){
    burstTap=false;seekBurstAt=0
    if(scrubbing)endScrub(false)
    if(event.actionMasked==MotionEvent.ACTION_UP||event.actionMasked==MotionEvent.ACTION_CANCEL)pinching=false
    true
   }else{
    val dx=event.x-downX;val dy=event.y-downY
    if(event.actionMasked==MotionEvent.ACTION_MOVE&&!scrubbing&&!vertical&&loaded&&duration>0&&event.eventTime-downTime>=350&&abs(dx)>dp(12)&&abs(dx)>abs(dy)*1.5f){
     scrubbing=true;dragging=true;scrubWasPaused=last.optBoolean("paused");command("set","pause","yes")
     top.visibility=View.INVISIBLE;center.visibility=View.INVISIBLE;playerActions.visibility=View.INVISIBLE;remaining.visibility=View.INVISIBLE
     skipButton.visibility=View.GONE;nextEpisodeButton.visibility=View.GONE;skipCountdown.visibility=View.GONE;gestureLabel.visibility=View.GONE;clearLevels.run()
     preview.hide();previewPanel.visibility=View.GONE;overlay.visibility=View.VISIBLE;handler.removeCallbacks(hide)
     val cancel=MotionEvent.obtain(event);cancel.action=MotionEvent.ACTION_CANCEL;detector.onTouchEvent(cancel);cancel.recycle()
    }
    if(scrubbing){
     scrubTarget=(startPosition+dx/dp(8).coerceAtLeast(1)).roundToInt().toDouble().coerceIn(0.0,(duration-0.1).coerceAtLeast(0.0))
     seek.fraction=(scrubTarget/duration).toFloat();time.text=format(scrubTarget)+" / "+format(duration)
     if(event.actionMasked==MotionEvent.ACTION_UP||event.actionMasked==MotionEvent.ACTION_CANCEL)endScrub(event.actionMasked==MotionEvent.ACTION_UP)
     true
    }else{
     if(abs(dx)>dp(12)||abs(dy)>dp(12)||event.actionMasked==MotionEvent.ACTION_CANCEL)burstTap=false
     if(burstTap&&event.actionMasked==MotionEvent.ACTION_UP){
      if(event.eventTime-downTime<300)jump(event.x>root.width/2)
      val cancel=MotionEvent.obtain(event);cancel.action=MotionEvent.ACTION_CANCEL;detector.onTouchEvent(cancel);cancel.recycle();burstTap=false
     }else detector.onTouchEvent(event)
     true
    }
   }
  }
 }
 private fun endScrub(commit:Boolean){
  if(!scrubbing)return
  if(commit)command("seek",scrubTarget.toString(),"absolute+exact")
  command("set","pause",if(scrubWasPaused)"yes" else "no")
  scrubbing=false;dragging=false;top.visibility=View.VISIBLE;center.visibility=View.VISIBLE;playerActions.visibility=View.VISIBLE;remaining.visibility=View.VISIBLE;showControls()
 }
 private fun jump(ahead:Boolean){
  val amount=if(ahead)forward else -rewind
  val impacted=if(duration>0)(position+amount).coerceIn(0.0,duration)-position else amount.toDouble()
  command("seek",amount.toString(),"relative");showControls()
  val now=SystemClock.uptimeMillis();val continuation=now-seekBurstAt in 0..700&&seekBurstAhead==ahead
  seekBurstTotal=(if(continuation)seekBurstTotal else 0)+abs(impacted.roundToInt());seekBurstAt=now;seekBurstAhead=ahead
  seekFeedback.animate().cancel();handler.removeCallbacks(clearSeekFeedback);handler.removeCallbacks(fadeSeekFeedback)
  seekFeedback.text=(if(ahead)"+" else "−")+seekBurstTotal.toString()+" s"
  seekFeedback.layoutParams=FrameLayout.LayoutParams(dp(144),dp(64),Gravity.CENTER_VERTICAL or Gravity.START).apply{leftMargin=(root.width*(if(ahead).75f else .25f)-dp(72)).roundToInt().coerceIn(dp(16),(root.width-dp(160)).coerceAtLeast(dp(16)))}
  seekFeedback.visibility=View.VISIBLE;seekFeedback.alpha=1f
  handler.postDelayed(fadeSeekFeedback,500);handler.postDelayed(clearSeekFeedback,750)
 }
 override fun onKeyDown(keyCode:Int,event:KeyEvent):Boolean {
  if(sheet==null){when(keyCode){
   KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,KeyEvent.KEYCODE_SPACE->{command("cycle","pause");showControls();return true}
   KeyEvent.KEYCODE_MEDIA_REWIND->{jump(false);return true}
   KeyEvent.KEYCODE_MEDIA_FAST_FORWARD->{jump(true);return true}
   KeyEvent.KEYCODE_DPAD_CENTER,KeyEvent.KEYCODE_ENTER->{if(overlay.visibility!=View.VISIBLE){command("cycle","pause");showControls();pause.requestFocus();return true}}
   KeyEvent.KEYCODE_DPAD_UP,KeyEvent.KEYCODE_DPAD_DOWN,KeyEvent.KEYCODE_DPAD_LEFT,KeyEvent.KEYCODE_DPAD_RIGHT->{if(overlay.visibility!=View.VISIBLE){showControls();pause.requestFocus();return true};handler.removeCallbacks(hide)}
  }}
  return super.onKeyDown(keyCode,event)
 }
 private fun showLevel(brightness:Boolean,value:Float){overlay.visibility=View.GONE;gestureLabel.visibility=View.GONE;handler.removeCallbacks(clearLevels);brightnessIndicator.visibility=View.GONE;volumeIndicator.visibility=View.GONE;(if(brightness)brightnessIndicator else volumeIndicator).showLevel(value);handler.postDelayed(clearLevels,1200)}
 private fun feedback(value:String){gestureLabel.text=value;gestureLabel.visibility=View.VISIBLE;handler.removeCallbacks(clearGesture);handler.postDelayed(clearGesture,1000)}
 private fun exportCertificates():String {
  val file=File(filesDir,"system-ca.pem");val store=KeyStore.getInstance("AndroidCAStore").apply{load(null)}
  file.bufferedWriter().use{writer->val aliases=store.aliases();while(aliases.hasMoreElements()){val certificate=store.getCertificate(aliases.nextElement())?:continue;writer.write("-----BEGIN CERTIFICATE-----\n");writer.write(Base64.encodeToString(certificate.encoded,Base64.NO_WRAP).chunked(64).joinToString("\n"));writer.write("\n-----END CERTIFICATE-----\n")}};return file.absolutePath
 }
 override fun surfaceCreated(holder:SurfaceHolder){if(handle!=0L)return;try{loaded=false;reportedError=false;openedAt=SystemClock.elapsedRealtime();stalledAt=openedAt;options.put("position",if(position>0)position else options.optDouble("position",0.0));handle=nativeCreate(holder.surface,applicationContext,options.toString());handler.post(timer);showControls()}catch(e:Exception){showError(tr("Le lecteur n’a pas pu démarrer."))}}
 override fun surfaceChanged(holder:SurfaceHolder,format:Int,width:Int,height:Int){
  // libmpv keeps its old EGL viewport until the embedding app supplies this size.
  // A PiP window otherwise scales the landscape frame, including its side bars.
  if(width>0&&height>0)command("set","android-surface-size","${width}x$height")
 }
 override fun surfaceDestroyed(holder:SurfaceHolder){release()}
 private fun release(){handler.removeCallbacks(timer);if(handle!=0L){emit(isFinishing);val old=handle;handle=0;nativeDestroy(old)}}
 private fun command(vararg args:String){if(handle==0L)return;try{nativeCommand(handle,JSONArray(args.toList()).toString())}catch(e:Exception){feedback("Commande indisponible")}}
 private fun poll(){if(handle==0L)return;try{
  last=JSONObject(nativeState(handle));val nextPosition=last.optDouble("position",position);if(nextPosition!=position)stalledAt=SystemClock.elapsedRealtime();position=nextPosition;duration=last.optDouble("duration",duration)
  if(!loaded&&last.optBoolean("loaded")){loaded=true;showControls();if(options.optString("language")=="original"){val tracks=last.optJSONArray("tracks")?:JSONArray();val original=(0 until tracks.length()).map{tracks.getJSONObject(it)}.firstOrNull{it.optString("type")=="audio"&&Regex("(?i)\\boriginal\\b|\\bVO\\b").containsMatchIn(it.optString("title"))};original?.let{command("set","aid",it.optInt("id").toString())}};val subs=options.optJSONArray("subtitles")?:JSONArray();if(options.optBoolean("showSubtitles",true)&&options.optJSONObject("trackPreferences")?.optJSONObject("subtitle")==null){val preferred=options.optString("subtitleLanguage");val sub=(0 until subs.length()).map{subs.getJSONObject(it)}.firstOrNull{it.optString("lang")==preferred};if(sub!=null)selectExternalSubtitle(sub)};restoreTrackPreferences()}
  if(loaded)restoreTrackPreferences()
  loading.visibility=if(!reportedError&&!loaded)View.VISIBLE else View.GONE;buffering.visibility=if(loaded&&!scrubbing&&!reportedError&&last.optBoolean("buffering"))View.VISIBLE else View.GONE;if(!loaded)overlay.visibility=View.GONE
  if(!dragging){seek.fraction=if(duration>0)(position/duration).toFloat() else 0f;seek.buffered=if(duration>0)(last.optDouble("bufferedUntil",position)/duration).toFloat() else 0f;time.text=format(position)+" / "+format(duration);remaining.text=if(duration>position)"−"+format(duration-position) else ""}
  if(last.optBoolean("eof")){if(duration>0)position=duration;if(!cancelledNext&&options.optBoolean("autoNextEpisode",true)&&options.optString("nextVideoId").isNotBlank())requestEpisode(options.getString("nextVideoId"),true)else{emit(true);finish()};return}
  if(!inferredPrevious&&duration>0&&position/duration>0.5){
   inferredPrevious=true
   val queue=options.optJSONArray("episodes")?:JSONArray();val entries=(0 until queue.length()).map{queue.getJSONObject(it)}
   val current=entries.firstOrNull{it.optString("id")==options.optString("currentVideoId")}
   if(current!=null&&current.optInt("season",1)>0)entries.filter{val s=it.optInt("season",1);s>0&&(s<current.optInt("season",1)||(s==current.optInt("season",1)&&it.optInt("episode")<current.optInt("episode")))}.forEach{ep->
    val id=ep.optString("id");if(!ep.optBoolean("watched")&&!watchedChanges.containsKey(id)){ep.put("watched",true);watchedChanges[id]=JSONObject().put("videoId",id).put("watched",true).put("updatedAt",System.currentTimeMillis()).put("season",ep.optInt("season",1)).put("episode",ep.optInt("episode"))}
   }
  }
  updateEpisodeRows()
  val now=SystemClock.elapsedRealtime()
  if(!reportedError&&((!loaded&&now-openedAt>45000)||(last.optBoolean("buffering")&&now-stalledAt>60000))){reportedError=true;showError(tr("La source ne répond pas. Essayez une autre source."))}
  val segments=options.optJSONArray("skipSegments")?:JSONArray()
  seek.segments=if(duration>0)(0 until segments.length()).map{segments.getJSONObject(it)}.filter{it.optDouble("start",-1.0)>=0&&it.optDouble("end",0.0)>it.optDouble("start")&&it.optDouble("end")<=duration}.map{Pair((it.optDouble("start")/duration).toFloat(),(it.optDouble("end")/duration).toFloat())}else emptyList()
  val validSegments=(0 until segments.length()).map{segments.getJSONObject(it)}.filter{val start=it.optDouble("start",-1.0);val end=it.optDouble("end",-1.0);val reference=it.optDouble("episodeLength",0.0);start>=0&&end>start&&end<=duration&&!skipped.contains(start)&&(reference==0.0||abs(duration-reference)<max(10.0,duration*0.03))}
  currentSegment=validSegments.firstOrNull{position>=it.optDouble("start")&&position<it.optDouble("end")}
  val upcoming=validSegments.filter{val delta=it.optDouble("start")-position;delta>0&&delta<=3&&!cancelledSkips.contains(it.optDouble("start"))}.minByOrNull{it.optDouble("start")}
  skipButton.visibility=View.GONE
  if(!scrubbing)currentSegment?.let{
   val kind=it.optString("kind")
   val cancelled=cancelledSkips.contains(it.optDouble("start"))
   if(!cancelled&&!cancelledNext&&kind=="outro"&&options.optBoolean("autoNextEpisode",true)&&options.optString("nextVideoId").isNotBlank()){position=duration;requestEpisode(options.getString("nextVideoId"),true);return}
   skipButton.text=it.optString("label",tr(when(kind){"outro"->"Passer le générique";"recap"->"Passer le récap";else->"Passer l’intro"}))
   if(!cancelled&&((options.optBoolean("autoSkipIntro")&&kind=="intro")||(options.optBoolean("autoSkipRecap")&&kind=="recap"))){skipped.add(it.optDouble("start"));command("seek",it.optDouble("end").toString(),"absolute")}
  }
  val hasNext=options.optString("nextVideoId").isNotBlank()
  val hasOutro=validSegments.any{it.optString("kind")=="outro"}
  val nextThreshold=if(hasOutro)30.0 else 60.0
  val nextAvailable=loaded&&hasNext&&duration>0&&((duration-position).coerceAtLeast(0.0)<=nextThreshold||currentSegment?.optString("kind")=="outro")
  if(nextAvailable)nextEpisodeOffered=true
  val fallbackCountdown=!hasOutro&&!cancelledNext&&hasNext&&duration>63&&duration-position>60&&duration-position<=63&&currentSegment==null
  countdownKey=upcoming?.let{it.optString("kind")+":"+it.optDouble("start")}?:if(fallbackCountdown)"next" else ""
  countdownElapsed=when{upcoming!=null->(3-(upcoming.optDouble("start")-position)).toFloat();fallbackCountdown->(63-(duration-position)).toFloat();else->3f}.coerceIn(0f,3f)
  val canShow=loaded&&!scrubbing&&!reportedError&&!last.optBoolean("buffering")&&!isInPictureInPictureMode&&sheet==null&&hasWindowFocus()
  skipCountdown.elapsed=countdownElapsed
  val warning=canShow&&countdownKey.isNotEmpty()&&currentSegment==null
  skipCountdown.visibility=if(warning)View.VISIBLE else View.GONE
  nextEpisodeButton.visibility=if(canShow&&nextAvailable&&!warning)View.VISIBLE else View.GONE
  skipButton.visibility=if(canShow&&!nextAvailable&&currentSegment!=null)View.VISIBLE else View.GONE
  if(isInPictureInPictureMode){overlay.visibility=View.GONE;gestureLabel.visibility=View.GONE}
  if(Build.VERSION.SDK_INT>=31||isInPictureInPictureMode)setPictureInPictureParams(pipParams())
  pause.symbol=if(last.optBoolean("paused"))"play" else "pause"
  // mpv's disk cache is append-only. Stop disk writes with headroom for packets in flight.
  if(cacheActive&&(last.optLong("cacheBytes")>=cacheLimit*9/10||cacheDir.usableSpace<256_000_000L)){command("set","cache-on-disk","no");cacheActive=false}
  if(!last.isNull("error")&&!reportedError){reportedError=true;showError(last.getString("error"))}
  if(SystemClock.elapsedRealtime()>=nextProgress){emit(false);nextProgress=SystemClock.elapsedRealtime()+5000}
 }catch(e:Exception){loadingLabel.text="Connexion au lecteur…"}}
 private fun format(seconds:Double):String {val n=seconds.toInt().coerceAtLeast(0);return if(n>=3600)String.format(Locale.ROOT,"%d:%02d:%02d",n/3600,n/60%60,n%60)else String.format(Locale.ROOT,"%02d:%02d",n/60,n%60)}
 private fun showControls(){if(scrubbing||isInPictureInPictureMode||!loaded||last.optBoolean("buffering")||reportedError)return;overlay.visibility=View.VISIBLE;handler.removeCallbacks(hide);handler.postDelayed(hide,4500)}
 private fun emit(closed:Boolean){
  val sourceFailed=reportedError||(closed&&!loaded)
  val payload=JSONObject().put("context",options.optJSONObject("context")?:JSONObject()).put("position",position).put("duration",duration).put("updatedAt",System.currentTimeMillis()).put("closed",closed).put("requestedVideoId",requestedVideoId).put("actionId",actionId).put("autoPlay",autoPlay).put("sourceFailed",sourceFailed).put("watchedChanges",JSONArray(watchedChanges.values.toList()))
  if((duration>0||sourceFailed||watchedChanges.isNotEmpty())&&position.isFinite())try{PrimioStore.write(this,"playerProgress",payload.toString())}catch(e:Exception){android.util.Log.e("PrimioPlayer","Progress persistence failed",e)}
  nativeProgress(payload.toString())
 }
 private fun showError(message:String){reportedError=true;emit(false);command("set","pause","yes");loading.visibility=View.GONE;skipCountdown.visibility=View.GONE;nextEpisodeButton.visibility=View.GONE;skipButton.visibility=View.GONE;sheet?.dismiss();sheet=PrimioSheet(this,tr("Lecture indisponible")).apply{section(message);option(tr("Revenir aux sources")){requestEpisode(options.optString("currentVideoId"),false)};show()}}
 private fun loadLogo(view:ImageView,url:String){
  if(!url.startsWith("https://"))return
  Thread{
   try{
    var target=java.net.URI(url);var redirects=0
    var connection:java.net.HttpURLConnection
    while(true){
     if(target.scheme!="https"||target.userInfo!=null||target.host.isNullOrBlank())throw java.io.IOException()
     connection=target.toURL().openConnection() as java.net.HttpURLConnection
     connection.connectTimeout=4000;connection.readTimeout=4000;connection.instanceFollowRedirects=false
     if(connection.responseCode !in listOf(301,302,303,307,308))break
     val location=connection.getHeaderField("Location");connection.disconnect()
     if(location.isNullOrBlank()||redirects++>=3)throw java.io.IOException()
     target=target.resolve(location)
    }
    connection.connectTimeout=4000;connection.readTimeout=4000;connection.instanceFollowRedirects=false
    try{if(BuildConfig.DEBUG)android.util.Log.d("PrimioPlayer","Content logo HTTP ${connection.responseCode}");if(connection.responseCode==200){val bytes=connection.inputStream.use{stream->
      val output=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192)
      while(output.size()<=2_000_000){val count=stream.read(buffer);if(count<0)break;output.write(buffer,0,count)}
      output.toByteArray()
     };if(bytes.size<=2_000_000){
      val bounds=android.graphics.BitmapFactory.Options().apply{inJustDecodeBounds=true}
      android.graphics.BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
      val decoding=android.graphics.BitmapFactory.Options().apply{inSampleSize=1};while(max(bounds.outWidth,bounds.outHeight)/decoding.inSampleSize>1024)decoding.inSampleSize*=2
      val bitmap=android.graphics.BitmapFactory.decodeByteArray(bytes,0,bytes.size,decoding);val trimmed=bitmap?.let{trimLogo(it)};if(trimmed!=null)runOnUiThread{if(!isFinishing&&!isDestroyed){view.setImageBitmap(trimmed);view.layoutParams=LinearLayout.LayoutParams(-1,min(dp(190),(resources.displayMetrics.heightPixels*.4f).toInt()));loadingLabel.visibility=View.GONE}}}}}finally{connection.disconnect()}
   }catch(e:Exception){if(BuildConfig.DEBUG)android.util.Log.d("PrimioPlayer","Content logo unavailable: "+e.javaClass.simpleName)}
  }.start()
 }
 private fun trimLogo(bitmap:android.graphics.Bitmap):android.graphics.Bitmap{
  if(!bitmap.hasAlpha())return bitmap
  var left=bitmap.width;var top=bitmap.height;var right=-1;var bottom=-1
  val pixels=IntArray(bitmap.width*bitmap.height);bitmap.getPixels(pixels,0,bitmap.width,0,0,bitmap.width,bitmap.height)
  for(y in 0 until bitmap.height)for(x in 0 until bitmap.width)if(Color.alpha(pixels[y*bitmap.width+x])>16){left=min(left,x);top=min(top,y);right=max(right,x);bottom=max(bottom,y)}
  return if(right>=left&&bottom>=top)android.graphics.Bitmap.createBitmap(bitmap,left,top,right-left+1,bottom-top+1)else bitmap
 }
 private fun requestEpisode(id:String,automatic:Boolean){
  if(requestedVideoId.isNotBlank()||id.isBlank())return
  requestedVideoId=id;autoPlay=automatic;actionId=java.util.UUID.randomUUID().toString();emit(true);finish()
 }
 private fun episodes(resetSeason:Boolean=true,restoreScroll:Int?=null){
  episodeRows.clear()
  if(resetSeason)episodeSeason=null
  handler.removeCallbacks(hide);sheet?.dismiss()
  val queue=options.optJSONArray("episodes")?:JSONArray()
  val entries=(0 until queue.length()).map{queue.getJSONObject(it)}
  val seasons=entries.map{it.optInt("season",1)}.distinct().sorted()
  val current=options.optString("currentVideoId")
  val season=episodeSeason?:entries.firstOrNull{it.optString("id")==current}?.optInt("season",1)?:seasons.firstOrNull()?:1
  val dialog=PrimioSheet(this,tr("Épisodes"),true)
  if(seasons.size>1)dialog.option(if(season==0)tr("Hors-série") else PrimioI18n.text(this,"Saison {n}",mapOf("n" to season)),trailingIcon="chevron"){
   dialog.dismiss();val selector=PrimioSheet(this,tr("Saison"),true)
   seasons.forEach{s->selector.option(if(s==0)tr("Hors-série") else PrimioI18n.text(this,"Saison {n}",mapOf("n" to s)),s==season){episodeSeason=s;selector.dismiss();episodes(false)}}
   sheet=selector;selector.setOnDismissListener{if(sheet===selector)sheet=null};selector.show()
  }
  val thumbnails=mutableListOf<Pair<ImageView,String>>()
  var currentRow:View?=null
  entries.filter{it.optInt("season",1)==season}.forEach{entry->
   val id=entry.optString("id");val number=entry.optInt("episode")
   val watching=id==current
   val palette=PrimioStyle.palette(this)
   val row=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL;background=PrimioStyle.field(this@PlayerActivity,16);setPadding(dp(10),dp(8),dp(10),dp(8))}
   if(watching)row.background=GradientDrawable().apply{cornerRadius=dp(16).toFloat();setColor((palette.accent and 0x00ffffff) or 0x26000000);setStroke(dp(1),palette.accent)}
   val title=(if(number>0)"$number. " else "")+entry.optString("title",tr("Épisode"))
   val episodeButton=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL;isClickable=true;isFocusable=true;contentDescription=title;setOnClickListener{dialog.dismiss();requestEpisode(id,false)}}
   val image=ImageView(this).apply{scaleType=ImageView.ScaleType.CENTER;background=GradientDrawable().apply{cornerRadius=dp(8).toFloat();setColor(palette.surface)};clipToOutline=true;setImageDrawable(PrimioIconDrawable(this@PlayerActivity,"play"));importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO}
   val artwork=FrameLayout(this).apply{background=GradientDrawable().apply{cornerRadius=dp(8).toFloat();setColor(palette.surface)};clipToOutline=true}
   artwork.addView(image,FrameLayout.LayoutParams(-1,-1))
   val viewing=PrimioEpisodeProgress(this).apply{fraction=if(entry.optBoolean("watched"))1f else entry.optDouble("progress",0.0).toFloat()}
   artwork.addView(viewing,FrameLayout.LayoutParams(-1,dp(3),Gravity.BOTTOM).apply{leftMargin=dp(6);rightMargin=dp(6);bottomMargin=dp(6)})
   episodeButton.addView(artwork,LinearLayout.LayoutParams(dp(128),dp(72)))
   thumbnails.add(image to entry.optString("thumbnail"))
   val copy=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;clipChildren=true}
   copy.addView(text(title,14f).apply{setSingleLine(true);ellipsize=android.text.TextUtils.TruncateAt.END;includeFontPadding=false;if(watching)setTextColor(palette.accent)},LinearLayout.LayoutParams(-1,dp(20)))
   if(watching)copy.addView(text(tr("En cours de lecture"),10f).apply{setSingleLine(true);ellipsize=android.text.TextUtils.TruncateAt.END;includeFontPadding=false;setTextColor(palette.accent)},LinearLayout.LayoutParams(-1,dp(16)))
   val description=entry.optString("description")
   if(description.isNotBlank())copy.addView(text(description,12f).apply{maxLines=if(watching)2 else 3;ellipsize=android.text.TextUtils.TruncateAt.END;includeFontPadding=false;setTextColor(palette.muted)},LinearLayout.LayoutParams(-1,0,1f))
   episodeButton.addView(copy,LinearLayout.LayoutParams(0,dp(72),1f).apply{leftMargin=dp(10)})
   row.addView(episodeButton,LinearLayout.LayoutParams(0,dp(72),1f))
   val watched=watchedChanges[id]?.optBoolean("watched")?:entry.optBoolean("watched")
   val status=button(tr(if(watched)"Vu" else "Non vu"),tr(if(watched)"Marquer comme non vu" else "Marquer comme vu")){
    val next=!(watchedChanges[id]?.optBoolean("watched")?:entry.optBoolean("watched"))
    entry.put("watched",next);watchedChanges[id]=JSONObject().put("videoId",id).put("watched",next).put("updatedAt",System.currentTimeMillis()).put("episode",number).put("season",entry.optInt("season",1)).apply{if(id==current){put("position",position);put("duration",duration)}};updateEpisodeRows();emit(false)
   }.apply{isSelected=watched;textSize=11f;setSingleLine(true);ellipsize=android.text.TextUtils.TruncateAt.END;setPadding(dp(4),dp(10),dp(4),dp(10));setTextColor(if(watched)palette.accent else palette.muted)}
   episodeRows[id]=Triple(entry,status,viewing)
   row.addView(status,LinearLayout.LayoutParams(dp(52),dp(48)).apply{leftMargin=dp(8)})
   dialog.content.addView(row,LinearLayout.LayoutParams(-1,dp(88)).apply{bottomMargin=dp(12)})
   if(watching)currentRow=row
  }
  sheet=dialog;dialog.setOnDismissListener{if(sheet===dialog)sheet=null;episodeRows.clear();showControls()};dialog.show();updateEpisodeRows()
  fun loadVisibleImages(){thumbnails.forEach{(image,url)->if(image.isShown&&image.getGlobalVisibleRect(android.graphics.Rect()))loadEpisodeImage(image,url)}}
  dialog.scroll.viewTreeObserver.addOnScrollChangedListener{loadVisibleImages()}
  dialog.scroll.viewTreeObserver.addOnGlobalLayoutListener{loadVisibleImages()}
  val rowTops={ (0 until dialog.content.childCount).map{dialog.content.getChildAt(it)}.filter{it is LinearLayout&&it.layoutParams.height==dp(88)}.map{it.top} }
  var touching=false
  val snap=Runnable{if(!touching&&sheet===dialog){val top=rowTops().minByOrNull{abs(it-dialog.scroll.scrollY)}?:0;dialog.scroll.smoothScrollTo(0,top)}}
  dialog.scroll.setOnTouchListener{_,event->when(event.actionMasked){MotionEvent.ACTION_DOWN->touching=true;MotionEvent.ACTION_UP,MotionEvent.ACTION_CANCEL->{touching=false;handler.postDelayed(snap,180)}};false}
  dialog.scroll.viewTreeObserver.addOnScrollChangedListener{handler.removeCallbacks(snap);if(!touching)handler.postDelayed(snap,180)}
  dialog.scroll.post{
   val maxScroll=(dialog.content.height-dialog.scroll.height).coerceAtLeast(0)
   val finalTop=rowTops().firstOrNull{it>=maxScroll}?:maxScroll
   dialog.content.setPadding(dialog.content.paddingLeft,dialog.content.paddingTop,dialog.content.paddingRight,dialog.content.paddingBottom+finalTop-maxScroll)
   dialog.scroll.scrollTo(0,restoreScroll?:currentRow?.top?:0);loadVisibleImages()
  }
 }
 private fun updateEpisodeRows(){
  val palette=PrimioStyle.palette(this)
  episodeRows.forEach{(id,views)->
   val ep=views.first;val status=views.second;val viewing=views.third
   val watched=watchedChanges[id]?.optBoolean("watched")?:ep.optBoolean("watched")
   status.text=tr(if(watched)"Vu" else "Non vu");status.isSelected=watched
   status.contentDescription=tr(if(watched)"Marquer comme non vu" else "Marquer comme vu")
   status.setTextColor(if(watched)palette.accent else palette.muted)
   viewing.fraction=if(watched)1f else if(id==options.optString("currentVideoId")&&duration>0)(position/duration).toFloat().coerceIn(0f,1f) else if(ep.optDouble("duration",0.0)>0)(ep.optDouble("position",0.0)/ep.optDouble("duration")).toFloat().coerceIn(0f,1f) else 0f
  }
 }
 private fun loadEpisodeImage(view:ImageView,url:String){
  if(isFinishing||isDestroyed||!url.startsWith("https://")||view.tag==url)return
  val uri=try{java.net.URI(url)}catch(_:Exception){return};if(uri.userInfo!=null)return
  episodeImages.get(url)?.let{view.tag=url;view.scaleType=ImageView.ScaleType.CENTER_CROP;view.setImageBitmap(it);return}
  view.tag=url
  pendingImages[url]?.let{it.add(view);return}
  pendingImages[url]=mutableListOf(view)
  imageWorker.execute{
   var bitmap:android.graphics.Bitmap?=null
   try{
    var imageUrl=java.net.URL(url)
    for(redirect in 0..3){
    val imageUri=imageUrl.toURI();if(imageUri.scheme!="https"||imageUri.userInfo!=null)break
    val connection=imageUrl.openConnection() as java.net.HttpURLConnection
    connection.connectTimeout=4000;connection.readTimeout=4000;connection.instanceFollowRedirects=false
    try{val status=connection.responseCode
     if(status in listOf(301,302,303,307,308)&&redirect<3){val location=connection.getHeaderField("Location")?:break;imageUrl=java.net.URL(imageUrl,location);continue}
     if(status==200){val bytes=connection.inputStream.use{stream->val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192);while(out.size()<=2_000_000){val n=stream.read(buffer);if(n<0)break;out.write(buffer,0,n)};out.toByteArray()}
     if(bytes.size<=2_000_000){val bounds=android.graphics.BitmapFactory.Options().apply{inJustDecodeBounds=true};android.graphics.BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
      if(bounds.outWidth in 1..4096&&bounds.outHeight in 1..4096){val decoding=android.graphics.BitmapFactory.Options().apply{inSampleSize=1};while(max(bounds.outWidth,bounds.outHeight)/decoding.inSampleSize>512)decoding.inSampleSize*=2;bitmap=android.graphics.BitmapFactory.decodeByteArray(bytes,0,bytes.size,decoding)}
     }
    }
    break
    }finally{connection.disconnect()}
    }
   }catch(e:Exception){if(BuildConfig.DEBUG)android.util.Log.d("PrimioArtwork",e.javaClass.simpleName)}
   handler.post{val views=pendingImages.remove(url)?:emptyList();if(!isFinishing&&!isDestroyed){bitmap?.let{episodeImages.put(url,it);views.forEach{v->if(v.tag==url){v.scaleType=ImageView.ScaleType.CENTER_CROP;v.setImageBitmap(it)}}}}}
  }
 }
 private fun trackName(track:JSONObject,index:Int):String {
  val raw=track.optString("lang");val aliases=mapOf("fre" to "fr","fra" to "fr","eng" to "en","jpn" to "ja","deu" to "de","ger" to "de","spa" to "es","por" to "pt","ita" to "it","kor" to "ko","zho" to "zh","chi" to "zh")
  val language=if(raw.isBlank()||raw=="und")tr("Langue non précisée") else Locale.forLanguageTag(aliases[raw]?:raw).getDisplayLanguage(Locale.forLanguageTag(PrimioI18n.locale(this))).replaceFirstChar{it.uppercase()}
  val title=track.optString("title").takeIf{it.isNotBlank()};val codec=track.optString("codec").uppercase().takeIf{it.isNotBlank()};val channels=track.optInt("channels").takeIf{it>0}?.let{PrimioI18n.text(this,"{n} canaux",mapOf("n" to it))}
  return listOfNotNull(PrimioI18n.text(this,"Piste {n}",mapOf("n" to index+1))+" · "+language,title,codec,channels).joinToString(" · ")
 }
 private fun selectExternalSubtitle(sub:JSONObject){
  val url=sub.optString("url");if(!url.startsWith("https://")&&!url.startsWith("http://"))return
  val all=last.optJSONArray("tracks")?:JSONArray();val existing=(0 until all.length()).map{all.getJSONObject(it)}.firstOrNull{it.optString("externalUrl")==url}
  if(existing!=null)command("set","sid",existing.optInt("id").toString())else command("sub-add",url,"select",sub.optString("lang"),sub.optString("lang"))
  command("set","sub-visibility","yes")
 }
 private fun languageCode(value:String):String {val v=value.lowercase(Locale.ROOT);return mapOf("fra" to "fr","fre" to "fr","eng" to "en","jpn" to "ja","kor" to "ko","zho" to "zh","chi" to "zh","deu" to "de","ger" to "de","spa" to "es","por" to "pt")[v]?:v}
 private fun forcedTrack(track:JSONObject)=track.optBoolean("forced")||Regex("(?i)forced|forc[ée]s?|signs|songs").containsMatchIn(track.optString("title"))
 private val restoredPreferences=mutableSetOf<String>()
 private fun rememberTrack(type:String,track:JSONObject?,off:Boolean=false){
  restoredPreferences.add(if(type=="audio")"audio" else "subtitle")
  val context=options.optJSONObject("context")?:return
  val preferences=context.optJSONObject("trackPreferences")?:options.optJSONObject("trackPreferences")?:JSONObject()
  preferences.put(if(type=="audio")"audio" else "subtitle",JSONObject().put("language",languageCode(track?.optString("lang")?:"")).put("title",(track?.optString("title")?:"").take(200)).put("forced",track?.let{forcedTrack(it)}?:false).put("off",off))
  context.put("trackPreferences",preferences);emit(false)
 }
 private fun restoreTrackPreferences(){
  val preferences=options.optJSONObject("trackPreferences")?:return
  val tracks=last.optJSONArray("tracks")?:return
  val entries=(0 until tracks.length()).map{tracks.getJSONObject(it)}
  for((kind,type) in listOf("audio" to "audio","subtitle" to "sub")){
   if(restoredPreferences.contains(kind))continue
   val pref=preferences.optJSONObject(kind)?:continue
   if(type=="sub"&&pref.optBoolean("off")){command("set","sid","no");restoredPreferences.add(kind);continue}
   val lang=languageCode(pref.optString("language"));val title=pref.optString("title")
   val match=entries.filter{it.optString("type")==type&&(if(lang.isNotBlank())languageCode(it.optString("lang"))==lang else title.isNotBlank()&&it.optString("title")==title)&&(type!="sub"||forcedTrack(it)==pref.optBoolean("forced"))}.maxByOrNull{if(title.isNotBlank()&&it.optString("title")==title)2 else 1}
   if(match!=null){restoredPreferences.add(kind);command("set",if(type=="audio")"aid" else "sid",match.optInt("id").toString());if(type=="sub")command("set","sub-visibility","yes")}
   else if(type=="sub"&&lang.isNotBlank()){
    val external=options.optJSONArray("subtitles")?:JSONArray()
    val sub=(0 until external.length()).map{external.getJSONObject(it)}.firstOrNull{languageCode(it.optString("lang"))==lang&&forcedTrack(it)==pref.optBoolean("forced")}
    if(sub!=null){restoredPreferences.add(kind);selectExternalSubtitle(sub)}
   }
  }
 }
 private fun tracks(){
  handler.removeCallbacks(hide);sheet?.dismiss()
  val dialog=PrimioSheet(this,tr("Audio et sous-titres"))
  val all=last.optJSONArray("tracks")?:JSONArray();val entries=(0 until all.length()).map{all.getJSONObject(it)}
  val columns=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL}
  fun option(column:LinearLayout,label:String,selected:Boolean=false,action:()->Unit){column.addView(PrimioStyle.button(this,(if(selected)"✓  " else "")+label,label){action()}.apply{gravity=Gravity.START or Gravity.CENTER_VERTICAL;textSize=13f;isSelected=selected;if(selected)setTextColor(PrimioStyle.palette(this@PlayerActivity).accent)},LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(8)})}
  for(type in listOf("audio","sub")){
   val column=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
   columns.addView(column,LinearLayout.LayoutParams(0,-2,1f).apply{if(type=="audio")rightMargin=dp(12)})
   column.addView(text(tr(if(type=="audio")"PISTES AUDIO" else "SOUS-TITRES"),12f).apply{setPadding(0,dp(4),0,dp(12))})
   val tracks=entries.filter{it.optString("type")==type&&it.optString("externalUrl").isBlank()}
   if(type=="sub")option(column,tr("Désactivés"),entries.none{it.optString("type")=="sub"&&it.optBoolean("selected")}){command("set","sid","no");rememberTrack("sub",null,true);dialog.dismiss()}
   if(tracks.isEmpty())column.addView(text(tr(if(type=="audio")"Aucune piste audio disponible" else "Aucun sous-titre disponible"),12f))
   tracks.forEachIndexed{i,track->option(column,trackName(track,i),track.optBoolean("selected")){command("set",if(type=="audio")"aid" else "sid",track.getInt("id").toString());if(type=="sub")command("set","sub-visibility","yes");rememberTrack(type,track);dialog.dismiss()}}
   if(type=="sub"){
    val external=options.optJSONArray("subtitles")?:JSONArray()
    for(i in 0 until external.length()){val sub=external.getJSONObject(i);val selected=entries.any{it.optString("externalUrl")==sub.optString("url")&&it.optBoolean("selected")};option(column,trackName(JSONObject().put("lang",sub.optString("lang")),i),selected){selectExternalSubtitle(sub);rememberTrack("sub",sub);dialog.dismiss()}}
   }
  }
  dialog.content.addView(columns)
  dialog.section(tr("Style des sous-titres"))
  val styles=LinearLayout(this)
  styles.addView(button(tr("Style intégré")){forceSubtitleStyle=false;options.put("forceSubtitleStyle",false);command("set","sub-ass-override","no");dialog.dismiss()},LinearLayout.LayoutParams(0,-2,1f).apply{rightMargin=dp(12)})
  styles.addView(button(tr("Style Primio")){forceSubtitleStyle=true;options.put("forceSubtitleStyle",true);command("set","sub-ass-override","force");dialog.dismiss()},LinearLayout.LayoutParams(0,-2,1f))
  dialog.content.addView(styles,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(16)})
  dialog.option(tr("Réglages du style")){dialog.dismiss();subtitleStyle()}
  dialog.setOnDismissListener{if(sheet===dialog)sheet=null;showControls()};sheet=dialog;dialog.show()
 }
 private fun subtitleStyle(){
  val dialog=PrimioSheet(this,tr("Style des sous-titres"))
  val preview=text(tr("Votre histoire commence."),options.optInt("subtitleSize",40)/2f).apply{gravity=Gravity.CENTER;setPadding(dp(12),dp(14),dp(12),dp(14))}
  dialog.content.addView(preview)
  fun applyStyle(updatePlayer:Boolean=true){
   if(updatePlayer){forceSubtitleStyle=true;options.put("forceSubtitleStyle",true)}
   val custom=options.optJSONObject("customFont")
   val font=when(options.optString("subtitleFont")){"custom"->custom?.optString("family","Roboto")?:"Roboto";"serif"->"Noto Serif";"monospace"->"Droid Sans Mono";else->"Roboto"}
   if(updatePlayer){command("set","sub-ass-override","force");command("set","sub-font-size",options.optInt("subtitleSize",40).toString());command("set","sub-font",font);command("set","sub-color",options.optString("subtitleColor","#FFFFFF"));command("set","sub-border-size",options.optInt("subtitleOutline",2).toString());command("set","sub-back-color",if(options.optBoolean("subtitleBackground"))"#99000000" else "#00000000")}
   preview.textSize=options.optInt("subtitleSize",40)/2f;preview.typeface=if(options.optString("subtitleFont")=="custom"&&custom!=null)runCatching{android.graphics.Typeface.createFromFile(custom.getString("path"))}.getOrDefault(android.graphics.Typeface.DEFAULT) else android.graphics.Typeface.create(font,0);preview.setTextColor(Color.parseColor(options.optString("subtitleColor","#FFFFFF")));preview.setBackgroundColor(if(options.optBoolean("subtitleBackground"))0x99000000.toInt() else Color.TRANSPARENT);preview.setShadowLayer(options.optInt("subtitleOutline",2).toFloat(),0f,0f,Color.BLACK)
  }
  applyStyle(false)
  fun choices(label:String,key:String,values:List<Pair<Any,String>>){
   dialog.section(tr(label));val row=LinearLayout(this)
   values.forEach{(value,name)->row.addView(PrimioStyle.button(this,name){options.put(key,value);applyStyle()}.apply{textSize=12f;setPadding(dp(8),dp(8),dp(8),dp(8))},LinearLayout.LayoutParams(0,-2,1f).apply{rightMargin=dp(8)})};dialog.content.addView(row)
  }
  choices("Taille des sous-titres","subtitleSize",listOf(32 to tr("Petite"),40 to tr("Moyenne"),48 to tr("Grande"),56 to tr("Très grande")))
  choices("Police","subtitleFont",listOf("sans-serif" to tr("Sans empattement"),"serif" to tr("Avec empattement"),"monospace" to tr("Monospace")))
  options.optJSONObject("customFont")?.let{custom->dialog.content.addView(PrimioStyle.button(this,custom.optString("family")){options.put("subtitleFont","custom");applyStyle()})}
  choices("Couleur","subtitleColor",listOf("#FFFFFF" to tr("Blanc"),"#F5DE93" to tr("Ivoire"),"#BDE6FF" to tr("Bleu clair"),"#BFE3C2" to tr("Vert clair")))
  choices("Contour","subtitleOutline",listOf(0 to tr("Aucun"),1 to tr("Fin"),2 to tr("Moyen"),4 to tr("Épais")))
  choices("Fond","subtitleBackground",listOf(false to tr("Aucun"),true to tr("Noir")))
  dialog.setOnDismissListener{if(sheet===dialog)sheet=null;showControls()};sheet=dialog;dialog.show()
 }
 private fun unfinished():Boolean {
  if(!loaded||reportedError||duration<=0||position/duration>=0.99||last.optBoolean("eof"))return false
  val segments=options.optJSONArray("skipSegments")?:JSONArray()
  return (0 until segments.length()).none{val s=segments.getJSONObject(it);val start=s.optDouble("start",-1.0);val end=s.optDouble("end",-1.0);val reference=s.optDouble("episodeLength",0.0);s.optString("kind")=="outro"&&!cancelledSkips.contains(start)&&start>=0&&end>start&&end<=duration&&position>=start&&(reference==0.0||abs(duration-reference)<max(10.0,duration*0.03))}
 }
 private fun pipParams():android.app.PictureInPictureParams {
  val aspect=last.optDouble("videoAspect",16.0/9.0).takeIf{it.isFinite()&&it>0}?:16.0/9.0
  val builder=android.app.PictureInPictureParams.Builder().setAspectRatio(android.util.Rational((aspect.coerceIn(1.0/2.39,2.39)*10000).roundToInt(),10000))
  val paused=last.optBoolean("paused")
  val action=android.content.Intent(this,PipReceiver::class.java).setAction(if(paused)"fr.azks.primio.PIP_PLAY" else "fr.azks.primio.PIP_PAUSE")
  val pending=android.app.PendingIntent.getBroadcast(this,if(paused)1 else 2,action,android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE)
  val label=tr(if(paused)"Lecture" else "Pause")
  builder.setActions(listOf(android.app.RemoteAction(android.graphics.drawable.Icon.createWithResource(this,if(paused)android.R.drawable.ic_media_play else android.R.drawable.ic_media_pause),label,label,pending)))
  if(::surface.isInitialized&&surface.width>0&&surface.height>0){
   val location=IntArray(2);surface.getLocationInWindow(location)
   val w=surface.width;val h=surface.height
   val videoW=if(fillScreen)w else min(w,(h*aspect).roundToInt())
   val videoH=if(fillScreen)h else min(h,(w/aspect).roundToInt())
   val x=location[0]+(w-videoW)/2;val y=location[1]+(h-videoH)/2
   builder.setSourceRectHint(android.graphics.Rect(x,y,x+videoW,y+videoH))
  }
  if(Build.VERSION.SDK_INT>=31)builder.setAutoEnterEnabled(unfinished()).setSeamlessResizeEnabled(true)
  return builder.build()
 }
 private fun enterPip():Boolean {
  if(!unfinished()||!packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE))return false
  return try{sheet?.dismiss();emit(false);enterPictureInPictureMode(pipParams())}catch(e:Exception){false}
 }
 private fun leavePlayer(){if(reportedError||!enterPip())finish()}
 @Deprecated("Deprecated in Java") override fun onBackPressed(){if(sheet!=null){sheet?.dismiss();sheet=null}else leavePlayer()}
 override fun onUserLeaveHint(){super.onUserLeaveHint();if(Build.VERSION.SDK_INT<31)enterPip()}
 override fun onPictureInPictureModeChanged(inPip:Boolean,configuration:android.content.res.Configuration){
  super.onPictureInPictureModeChanged(inPip,configuration)
  command("set","panscan",if(inPip)"0" else if(fillScreen)"1" else "0")
  if(::surface.isInitialized){surface.holder.setSizeFromLayout();surface.requestLayout()}
  if(inPip){skipCountdown.visibility=View.GONE;overlay.visibility=View.GONE;skipButton.visibility=View.GONE;nextEpisodeButton.visibility=View.GONE;gestureLabel.visibility=View.GONE;clearLevels.run();seekFeedback.visibility=View.GONE}else{if(lifecycleStopped){finish()}else showControls()}
 }
 private var lifecycleStopped=false
 override fun onStart(){super.onStart();lifecycleStopped=false}
 override fun onStop(){super.onStop();lifecycleStopped=true;if(isInPictureInPictureMode){command("set","pause","yes");emit(false)}}
 override fun onPause(){endScrub(false);if(isInPictureInPictureMode){emit(false);super.onPause();return};resumeAfterPause=handle!=0L&&!last.optBoolean("paused");command("set","pause","yes");emit(false);super.onPause()}
 override fun onResume(){super.onResume();if(resumeAfterPause){command("set","pause","no");resumeAfterPause=false}}
 private fun showSeekPreview(fraction:Float){
  previewTime.text=format(duration*fraction)
  val trackLocation=IntArray(2);val overlayLocation=IntArray(2)
  seek.getLocationOnScreen(trackLocation);overlay.getLocationOnScreen(overlayLocation)
  val cursorX=trackLocation[0]-overlayLocation[0]+dp(14)+(seek.width-dp(28))*fraction
  val cursorY=trackLocation[1]-overlayLocation[1]+seek.height/2f
  previewPanel.measure(View.MeasureSpec.makeMeasureSpec(dp(172),View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(dp(124),View.MeasureSpec.EXACTLY))
  previewPanel.layoutParams=FrameLayout.LayoutParams(dp(172),dp(124),Gravity.TOP or Gravity.START).apply{
   leftMargin=(cursorX-dp(86)).toInt().coerceIn(dp(8),(overlay.width-dp(180)).coerceAtLeast(dp(8)))
   topMargin=(cursorY-dp(140)).toInt().coerceAtLeast(dp(8))
  }
  previewPanel.visibility=View.VISIBLE;previewPanel.bringToFront();preview.show(duration*fraction)
 }
 override fun onDestroy(){imageWorker.shutdownNow();pendingImages.clear();episodeImages.evictAll();if(::preview.isInitialized)preview.close();if(duration>0&&position/duration>=0.95)DownloadStore(this).markWatched(options.optString("downloadId"));if(active?.get()===this){active=null;DownloadStore.playingId=""};breathing?.cancel();handler.removeCallbacksAndMessages(null);sheet?.dismiss();emit(true);release();if(options.optBoolean("deleteWatched")&&options.optString("downloadId").isNotEmpty()&&duration>0&&position/duration>=0.95)DownloadStore(this).remove(options.getString("downloadId"));if(::focus.isInitialized)audio.abandonAudioFocusRequest(focus);super.onDestroy()}
}
