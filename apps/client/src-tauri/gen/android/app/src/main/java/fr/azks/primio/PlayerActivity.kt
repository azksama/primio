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

class PlayerActivity:Activity(),SurfaceHolder.Callback {
 companion object {private var active:java.lang.ref.WeakReference<PlayerActivity>?=null}
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
 private lateinit var overlay:FrameLayout
 private lateinit var seek:PrimioTimeline
 private lateinit var preview:PrimioPreview
 private lateinit var previewPanel:LinearLayout
 private lateinit var previewTime:TextView
 private var fillScreen=false
 private lateinit var time:TextView
 private lateinit var remaining:TextView
 private lateinit var skipButton:TextView
 private lateinit var nextEpisodeButton:TextView
 private var nextEpisodeOffered=false
 private var currentSegment:JSONObject?=null
 private val skipped=mutableSetOf<Double>()
 private lateinit var pause:PrimioIconButton
 private var forceSubtitleStyle=false
 private lateinit var loading:LinearLayout
 private lateinit var loadingLabel:TextView
 private lateinit var gestureLabel:TextView
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
  val surface=SurfaceView(this);surface.holder.addCallback(this);root.addView(surface,FrameLayout.LayoutParams(-1,-1))
  val gestureLayer=View(this);root.addView(gestureLayer,FrameLayout.LayoutParams(-1,-1));installGestures(gestureLayer)
  overlay=FrameLayout(this);root.addView(overlay,FrameLayout.LayoutParams(-1,-1))
  val top=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(24),dp(14),dp(24),dp(8));background=GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,intArrayOf(0xbb000000.toInt(),Color.TRANSPARENT))}
  top.addView(PrimioIconButton(this,"back",tr("Retour")){leavePlayer()},LinearLayout.LayoutParams(dp(48),dp(48)))
  top.addView(text(options.optString("title","Primio"),24f).apply{typeface=android.graphics.Typeface.createFromAsset(assets,"fonts/cormorant-garamond.ttf");setPadding(dp(16),0,dp(12),0);maxLines=2},LinearLayout.LayoutParams(0,-2,1f))
  if((options.optJSONArray("episodes")?.length()?:0)>0)top.addView(button(tr("Épisodes"),tr("Choisir un épisode")){episodes()})
  overlay.addView(top,FrameLayout.LayoutParams(-1,dp(80),Gravity.TOP))
  val center=LinearLayout(this).apply{gravity=Gravity.CENTER}
  center.addView(button("− $rewind",PrimioI18n.text(this,"Reculer de {n} secondes",mapOf("n" to rewind))){jump(false)}.apply{setPadding(dp(4),0,dp(4),0);textSize=14f;maxLines=1},LinearLayout.LayoutParams(dp(54),dp(48)).apply{setMargins(dp(12),0,dp(12),0)})
  pause=PrimioIconButton(this,"pause",tr("Lecture ou pause")){command("cycle","pause");showControls()}
  center.addView(pause,LinearLayout.LayoutParams(dp(58),dp(54)))
  center.addView(button("+ $forward",PrimioI18n.text(this,"Avancer de {n} secondes",mapOf("n" to forward))){jump(true)}.apply{setPadding(dp(4),0,dp(4),0);textSize=14f;maxLines=1},LinearLayout.LayoutParams(dp(54),dp(48)).apply{setMargins(dp(12),0,dp(12),0)})
  overlay.addView(center,FrameLayout.LayoutParams(-1,dp(92),Gravity.CENTER))
  val bottom=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(28),dp(16),dp(28),dp(20));background=GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,intArrayOf(Color.TRANSPARENT,0xdd000000.toInt()))}
  val labels=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL}
  time=text("00:00",13f);remaining=text("",12f)
  labels.addView(time,LinearLayout.LayoutParams(0,-2,1f));labels.addView(remaining,LinearLayout.LayoutParams(-2,-2).apply{rightMargin=dp(18)});labels.addView(button("Audio · ST",tr("Audio et sous-titres")){tracks()});bottom.addView(labels)
  previewPanel=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;background=PrimioStyle.glass(this@PlayerActivity,12);visibility=View.GONE;setPadding(dp(6),dp(6),dp(6),dp(6))}
  val previewImage=ImageView(this).apply{scaleType=ImageView.ScaleType.FIT_CENTER};previewPanel.addView(previewImage,LinearLayout.LayoutParams(dp(160),dp(90)))
  previewTime=text("",13f).apply{gravity=Gravity.CENTER};previewPanel.addView(previewTime);preview=PrimioPreview(options,previewImage)
  overlay.addView(previewPanel,FrameLayout.LayoutParams(dp(172),dp(124),Gravity.TOP or Gravity.START))
  seek=PrimioTimeline(this).apply{onSeek={fraction,done->dragging=!done;handler.removeCallbacks(hide);time.text=format(duration*fraction)+" / "+format(duration);if(done){preview.hide();previewPanel.visibility=View.GONE;command("seek",(duration*fraction).toString(),"absolute");showControls()}else if(duration>0){showSeekPreview(fraction)}}}
  bottom.addView(seek,LinearLayout.LayoutParams(-1,dp(44)));overlay.addView(bottom,FrameLayout.LayoutParams(-1,dp(132),Gravity.BOTTOM))
  loading=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;contentDescription=tr("Chargement de la vidéo")}
  val artwork=ImageView(this).apply{setImageResource(R.drawable.primio_brand);scaleType=ImageView.ScaleType.FIT_CENTER}
  loading.addView(artwork,LinearLayout.LayoutParams(dp(140),dp(80)))
  loadingLabel=text(options.optString("title","Primio"),13f).apply{gravity=Gravity.CENTER;maxLines=2;setPadding(dp(8),dp(10),dp(8),0)};loading.addView(loadingLabel)
  root.addView(loading,FrameLayout.LayoutParams(dp(240),-2,Gravity.CENTER))
  buffering=text("···",22f).apply{visibility=View.GONE;contentDescription=tr("Chargement")};root.addView(buffering,FrameLayout.LayoutParams(dp(48),dp(40),Gravity.BOTTOM or Gravity.START).apply{leftMargin=dp(24);bottomMargin=dp(140)})
  breathing=android.animation.ObjectAnimator.ofFloat(loading,View.ALPHA,.35f,1f).apply{duration=1500;repeatMode=android.animation.ValueAnimator.REVERSE;repeatCount=android.animation.ValueAnimator.INFINITE;if(!options.optBoolean("reduceMotion"))start()}
  loadLogo(artwork,options.optString("logo"))
  overlay.visibility=View.GONE
  gestureLabel=text("",16f).apply{gravity=Gravity.CENTER;background=PrimioStyle.glass(this@PlayerActivity);setPadding(dp(24),dp(16),dp(24),dp(16));visibility=View.GONE}
  root.addView(gestureLabel,FrameLayout.LayoutParams(-2,-2,Gravity.CENTER))
  skipButton=button(tr("Passer l’intro")){currentSegment?.let{command("seek",it.optDouble("end").toString(),"absolute");skipped.add(it.optDouble("start"))}}
  skipButton.visibility=View.GONE
  root.addView(skipButton,FrameLayout.LayoutParams(-2,dp(48),Gravity.BOTTOM or Gravity.END).apply{rightMargin=dp(28);bottomMargin=dp(144)})
  nextEpisodeButton=button(tr("Épisode suivant")){position=duration;requestEpisode(options.optString("nextVideoId"),true)}
  nextEpisodeButton.visibility=View.GONE
  root.addView(nextEpisodeButton,FrameLayout.LayoutParams(-2,dp(48),Gravity.BOTTOM or Gravity.END).apply{rightMargin=dp(28);bottomMargin=dp(144)})
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
  val detector=GestureDetector(this,object:GestureDetector.SimpleOnGestureListener(){
   override fun onDown(e:MotionEvent):Boolean {startVolume=audio.getStreamVolume(AudioManager.STREAM_MUSIC);startBrightness=window.attributes.screenBrightness.takeIf{it>=0}?:0.5f;vertical=false;return true}
   override fun onSingleTapConfirmed(e:MotionEvent):Boolean{if(overlay.visibility==View.VISIBLE)overlay.visibility=View.GONE else showControls();return true}
   override fun onDoubleTap(e:MotionEvent):Boolean{jump(e.x>root.width/2);return true}
   override fun onScroll(first:MotionEvent?,e:MotionEvent,dx:Float,dy:Float):Boolean {
    if(first==null)return false
    val delta=first.y-e.y
    if(!vertical&&(abs(delta)<dp(16)||abs(delta)<abs(e.x-first.x)))return true
    vertical=true;handler.removeCallbacks(hide);val change=delta/root.height.coerceAtLeast(1)*1.4f
    if(first.x<root.width/2){val brightness=(startBrightness+change).coerceIn(0.05f,1f);window.attributes=window.attributes.apply{screenBrightness=brightness};feedback("☀  Luminosité ${(brightness*100).roundToInt()} %")}
    else{val max=audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);val volume=(startVolume+change*max).roundToInt().coerceIn(0,max);audio.setStreamVolume(AudioManager.STREAM_MUSIC,volume,0);feedback("♫  Volume ${(volume*100f/max.coerceAtLeast(1)).roundToInt()} %")};return true
   }
  })
  layer.setOnTouchListener{_,event->pinch.onTouchEvent(event);if(event.pointerCount>1||pinching){if(event.actionMasked==MotionEvent.ACTION_UP||event.actionMasked==MotionEvent.ACTION_CANCEL)pinching=false;true}else{val handled=detector.onTouchEvent(event);if(vertical&&(event.actionMasked==MotionEvent.ACTION_UP||event.actionMasked==MotionEvent.ACTION_CANCEL))showControls();handled}}
 }
 private fun jump(ahead:Boolean){val amount=if(ahead)forward else -rewind;command("seek",amount.toString(),"relative");feedback((if(ahead)"+" else "−")+PrimioI18n.text(this,"{n} secondes",mapOf("n" to abs(amount))));showControls()}
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
 private fun feedback(value:String){gestureLabel.text=value;gestureLabel.visibility=View.VISIBLE;handler.removeCallbacks(clearGesture);handler.postDelayed(clearGesture,1000)}
 private fun exportCertificates():String {
  val file=File(filesDir,"system-ca.pem");val store=KeyStore.getInstance("AndroidCAStore").apply{load(null)}
  file.bufferedWriter().use{writer->val aliases=store.aliases();while(aliases.hasMoreElements()){val certificate=store.getCertificate(aliases.nextElement())?:continue;writer.write("-----BEGIN CERTIFICATE-----\n");writer.write(Base64.encodeToString(certificate.encoded,Base64.NO_WRAP).chunked(64).joinToString("\n"));writer.write("\n-----END CERTIFICATE-----\n")}};return file.absolutePath
 }
 override fun surfaceCreated(holder:SurfaceHolder){if(handle!=0L)return;try{loaded=false;reportedError=false;openedAt=SystemClock.elapsedRealtime();stalledAt=openedAt;options.put("position",if(position>0)position else options.optDouble("position",0.0));handle=nativeCreate(holder.surface,applicationContext,options.toString());handler.post(timer);showControls()}catch(e:Exception){showError(tr("Le lecteur n’a pas pu démarrer."))}}
 override fun surfaceChanged(holder:SurfaceHolder,format:Int,width:Int,height:Int){}
 override fun surfaceDestroyed(holder:SurfaceHolder){release()}
 private fun release(){handler.removeCallbacks(timer);if(handle!=0L){emit(isFinishing);val old=handle;handle=0;nativeDestroy(old)}}
 private fun command(vararg args:String){if(handle==0L)return;try{nativeCommand(handle,JSONArray(args.toList()).toString())}catch(e:Exception){feedback("Commande indisponible")}}
 private fun poll(){if(handle==0L)return;try{
  last=JSONObject(nativeState(handle));val nextPosition=last.optDouble("position",position);if(nextPosition!=position)stalledAt=SystemClock.elapsedRealtime();position=nextPosition;duration=last.optDouble("duration",duration)
  if(!loaded&&last.optBoolean("loaded")){loaded=true;showControls();if(options.optString("language")=="original"){val tracks=last.optJSONArray("tracks")?:JSONArray();val original=(0 until tracks.length()).map{tracks.getJSONObject(it)}.firstOrNull{it.optString("type")=="audio"&&Regex("(?i)\\boriginal\\b|\\bVO\\b").containsMatchIn(it.optString("title"))};original?.let{command("set","aid",it.optInt("id").toString())}};val subs=options.optJSONArray("subtitles")?:JSONArray();if(options.optBoolean("showSubtitles",true)){val preferred=options.optString("subtitleLanguage");val sub=(0 until subs.length()).map{subs.getJSONObject(it)}.firstOrNull{it.optString("lang")==preferred};if(sub!=null)selectExternalSubtitle(sub)}}
  loading.visibility=if(!reportedError&&!loaded)View.VISIBLE else View.GONE;buffering.visibility=if(loaded&&!reportedError&&last.optBoolean("buffering"))View.VISIBLE else View.GONE;if(!loaded)overlay.visibility=View.GONE
  if(!dragging){seek.fraction=if(duration>0)(position/duration).toFloat() else 0f;seek.buffered=if(duration>0)(last.optDouble("bufferedUntil",position)/duration).toFloat() else 0f;time.text=format(position)+" / "+format(duration);remaining.text=if(duration>position)"−"+format(duration-position) else ""}
  if(last.optBoolean("eof")){if(duration>0)position=duration;if(options.optBoolean("autoNextEpisode",true)&&options.optString("nextVideoId").isNotBlank())requestEpisode(options.getString("nextVideoId"),true)else{emit(true);finish()};return}
  val now=SystemClock.elapsedRealtime()
  if(!reportedError&&((!loaded&&now-openedAt>45000)||(last.optBoolean("buffering")&&now-stalledAt>60000))){reportedError=true;showError(tr("La source ne répond pas. Essayez une autre source."))}
  val segments=options.optJSONArray("skipSegments")?:JSONArray()
  seek.segments=if(duration>0)(0 until segments.length()).map{segments.getJSONObject(it)}.filter{it.optDouble("start",-1.0)>=0&&it.optDouble("end",0.0)>it.optDouble("start")&&it.optDouble("end")<=duration}.map{Pair((it.optDouble("start")/duration).toFloat(),(it.optDouble("end")/duration).toFloat())}else emptyList()
  currentSegment=(0 until segments.length()).map{segments.getJSONObject(it)}.firstOrNull{val start=it.optDouble("start",-1.0);val end=it.optDouble("end",-1.0);val reference=it.optDouble("episodeLength",0.0);start>=0&&end>start&&end<=duration&&position>=start&&position<end&&!skipped.contains(start)&&(reference==0.0||abs(duration-reference)<max(10.0,duration*0.03))}
  skipButton.visibility=if(currentSegment!=null)View.VISIBLE else View.GONE
  currentSegment?.let{if(it.optString("kind")=="outro"&&options.optBoolean("autoNextEpisode",true)&&options.optString("nextVideoId").isNotBlank()){position=duration;requestEpisode(options.getString("nextVideoId"),true);return};skipButton.text=it.optString("label",tr("Passer l’intro"));if(options.optBoolean("autoSkipIntro")&&it.optString("kind")=="intro"){skipped.add(it.optDouble("start"));command("seek",it.optDouble("end").toString(),"absolute")}}
  val hasNext=options.optString("nextVideoId").isNotBlank()
  if(loaded&&hasNext&&duration>0&&((duration-position).coerceAtLeast(0.0)<=30.0||currentSegment?.optString("kind")=="outro"))nextEpisodeOffered=true
  nextEpisodeButton.visibility=if(nextEpisodeOffered&&!reportedError&&!last.optBoolean("buffering"))View.VISIBLE else View.GONE
  if(nextEpisodeButton.visibility==View.VISIBLE)skipButton.visibility=View.GONE
  if(isInPictureInPictureMode){overlay.visibility=View.GONE;skipButton.visibility=View.GONE;nextEpisodeButton.visibility=View.GONE;gestureLabel.visibility=View.GONE}
  if(Build.VERSION.SDK_INT>=31)setPictureInPictureParams(pipParams())
  pause.symbol=if(last.optBoolean("paused"))"play" else "pause"
  // mpv's disk cache is append-only. Stop disk writes with headroom for packets in flight.
  if(cacheActive&&(last.optLong("cacheBytes")>=cacheLimit*9/10||cacheDir.usableSpace<256_000_000L)){command("set","cache-on-disk","no");cacheActive=false}
  if(!last.isNull("error")&&!reportedError){reportedError=true;showError(last.getString("error"))}
  if(SystemClock.elapsedRealtime()>=nextProgress){emit(false);nextProgress=SystemClock.elapsedRealtime()+5000}
 }catch(e:Exception){loadingLabel.text="Connexion au lecteur…"}}
 private fun format(seconds:Double):String {val n=seconds.toInt().coerceAtLeast(0);return if(n>=3600)String.format(Locale.ROOT,"%d:%02d:%02d",n/3600,n/60%60,n%60)else String.format(Locale.ROOT,"%02d:%02d",n/60,n%60)}
 private fun showControls(){if(isInPictureInPictureMode||!loaded||last.optBoolean("buffering")||reportedError)return;overlay.visibility=View.VISIBLE;handler.removeCallbacks(hide);handler.postDelayed(hide,4500)}
 private fun emit(closed:Boolean){
  val payload=JSONObject().put("context",options.optJSONObject("context")?:JSONObject()).put("position",position).put("duration",duration).put("updatedAt",System.currentTimeMillis()).put("closed",closed).put("requestedVideoId",requestedVideoId).put("actionId",actionId).put("autoPlay",autoPlay)
  if(duration>0&&position.isFinite())try{PrimioStore.write(this,"playerProgress",payload.toString())}catch(e:Exception){android.util.Log.e("PrimioPlayer","Progress persistence failed",e)}
  nativeProgress(payload.toString())
 }
 private fun showError(message:String){loading.visibility=View.GONE;nextEpisodeButton.visibility=View.GONE;skipButton.visibility=View.GONE;sheet?.dismiss();sheet=PrimioSheet(this,"Lecture indisponible").apply{section(message);option("Revenir aux sources"){finish()};show()}}
 private fun loadLogo(view:ImageView,url:String){
  if(!url.startsWith("https://"))return
  Thread{
   try{
    val connection=java.net.URL(url).openConnection() as java.net.HttpURLConnection
    connection.connectTimeout=4000;connection.readTimeout=4000;connection.instanceFollowRedirects=false
    try{if(BuildConfig.DEBUG)android.util.Log.d("PrimioPlayer","Content logo HTTP ${connection.responseCode}");if(connection.responseCode==200){val bytes=connection.inputStream.use{stream->
      val output=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192)
      while(output.size()<=2_000_000){val count=stream.read(buffer);if(count<0)break;output.write(buffer,0,count)}
      output.toByteArray()
     };if(bytes.size<=2_000_000){
      val bounds=android.graphics.BitmapFactory.Options().apply{inJustDecodeBounds=true}
      android.graphics.BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
      val decoding=android.graphics.BitmapFactory.Options().apply{inSampleSize=1};while(max(bounds.outWidth,bounds.outHeight)/decoding.inSampleSize>1024)decoding.inSampleSize*=2
      val bitmap=android.graphics.BitmapFactory.decodeByteArray(bytes,0,bytes.size,decoding);if(bitmap!=null)runOnUiThread{if(!isFinishing&&!isDestroyed){view.setImageBitmap(bitmap);loadingLabel.visibility=View.GONE}}}}}finally{connection.disconnect()}
   }catch(e:Exception){if(BuildConfig.DEBUG)android.util.Log.d("PrimioPlayer","Content logo unavailable: "+e.javaClass.simpleName)}
  }.start()
 }
 private fun requestEpisode(id:String,automatic:Boolean){
  if(requestedVideoId.isNotBlank()||id.isBlank())return
  requestedVideoId=id;autoPlay=automatic;actionId=java.util.UUID.randomUUID().toString();emit(true);finish()
 }
 private fun episodes(){
  handler.removeCallbacks(hide);sheet?.dismiss()
  val queue=options.optJSONArray("episodes")?:JSONArray()
  val entries=(0 until queue.length()).map{queue.getJSONObject(it)}
  val seasons=entries.map{it.optInt("season",1)}.distinct().sorted()
  val current=options.optString("currentVideoId")
  val season=episodeSeason?:entries.firstOrNull{it.optString("id")==current}?.optInt("season",1)?:seasons.firstOrNull()?:1
  val dialog=PrimioSheet(this,tr("Épisodes"),true)
  if(seasons.size>1)dialog.option(if(season==0)tr("Hors-série  ⌄") else PrimioI18n.text(this,"Saison {n}",mapOf("n" to season))+"  ⌄"){
   dialog.dismiss();val selector=PrimioSheet(this,tr("Saison"),true)
   seasons.forEach{s->selector.option(if(s==0)tr("Hors-série") else PrimioI18n.text(this,"Saison {n}",mapOf("n" to s)),s==season){episodeSeason=s;selector.dismiss();episodes()}}
   sheet=selector;selector.setOnDismissListener{if(sheet===selector)sheet=null};selector.show()
  }
  entries.filter{it.optInt("season",1)==season}.forEach{entry->
   val id=entry.optString("id");val number=entry.optInt("episode")
   dialog.option((if(number>0)"$number. " else "")+entry.optString("title",tr("Épisode")),id==current){dialog.dismiss();requestEpisode(id,false)}
  }
  sheet=dialog;dialog.setOnDismissListener{if(sheet===dialog)sheet=null;showControls()};dialog.show()
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
 private fun tracks(){
  handler.removeCallbacks(hide);sheet?.dismiss()
  val dialog=PrimioSheet(this,tr("Audio et sous-titres"))
  val all=last.optJSONArray("tracks")?:JSONArray();val entries=(0 until all.length()).map{all.getJSONObject(it)}
  val columns=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL}
  fun option(column:LinearLayout,label:String,selected:Boolean=false,action:()->Unit){column.addView(PrimioStyle.button(this,(if(selected)"✓  " else "")+label,label){action()}.apply{gravity=Gravity.START or Gravity.CENTER_VERTICAL;textSize=13f},LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(8)})}
  for(type in listOf("audio","sub")){
   val column=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
   columns.addView(column,LinearLayout.LayoutParams(0,-2,1f).apply{if(type=="audio")rightMargin=dp(12)})
   column.addView(text(tr(if(type=="audio")"PISTES AUDIO" else "SOUS-TITRES"),12f).apply{setPadding(0,dp(4),0,dp(12))})
   val tracks=entries.filter{it.optString("type")==type&&it.optString("externalUrl").isBlank()}
   if(type=="sub")option(column,tr("Désactivés"),entries.none{it.optString("type")=="sub"&&it.optBoolean("selected")}){command("set","sid","no");dialog.dismiss()}
   if(tracks.isEmpty())column.addView(text(tr(if(type=="audio")"Aucune piste audio disponible" else "Aucun sous-titre disponible"),12f))
   tracks.forEachIndexed{i,track->option(column,trackName(track,i),track.optBoolean("selected")){command("set",if(type=="audio")"aid" else "sid",track.getInt("id").toString());if(type=="sub")command("set","sub-visibility","yes");dialog.dismiss()}}
   if(type=="sub"){
    val external=options.optJSONArray("subtitles")?:JSONArray()
    for(i in 0 until external.length()){val sub=external.getJSONObject(i);val selected=entries.any{it.optString("externalUrl")==sub.optString("url")&&it.optBoolean("selected")};option(column,trackName(JSONObject().put("lang",sub.optString("lang")),i),selected){selectExternalSubtitle(sub);dialog.dismiss()}}
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
  fun applyStyle(){
   forceSubtitleStyle=true;options.put("forceSubtitleStyle",true)
   val font=when(options.optString("subtitleFont")){"serif"->"Noto Serif";"monospace"->"Droid Sans Mono";else->"Roboto"}
   command("set","sub-ass-override","force");command("set","sub-font-size",options.optInt("subtitleSize",40).toString());command("set","sub-font",font);command("set","sub-color",options.optString("subtitleColor","#FFFFFF"));command("set","sub-border-size",options.optInt("subtitleOutline",2).toString());command("set","sub-back-color",if(options.optBoolean("subtitleBackground"))"#99000000" else "#00000000")
   preview.textSize=options.optInt("subtitleSize",40)/2f;preview.typeface=android.graphics.Typeface.create(font,0);preview.setTextColor(Color.parseColor(options.optString("subtitleColor","#FFFFFF")));preview.setBackgroundColor(if(options.optBoolean("subtitleBackground"))0x99000000.toInt() else Color.TRANSPARENT);preview.setShadowLayer(options.optInt("subtitleOutline",2).toFloat(),0f,0f,Color.BLACK)
  }
  fun choices(label:String,key:String,values:List<Pair<Any,String>>){
   dialog.section(tr(label));val row=LinearLayout(this)
   values.forEach{(value,name)->row.addView(PrimioStyle.button(this,name){options.put(key,value);applyStyle()}.apply{textSize=12f;setPadding(dp(8),dp(8),dp(8),dp(8))},LinearLayout.LayoutParams(0,-2,1f).apply{rightMargin=dp(8)})};dialog.content.addView(row)
  }
  choices("Taille des sous-titres","subtitleSize",listOf(32 to tr("Petite"),40 to tr("Moyenne"),48 to tr("Grande"),56 to tr("Très grande")))
  choices("Police","subtitleFont",listOf("sans-serif" to tr("Sans empattement"),"serif" to tr("Avec empattement"),"monospace" to tr("Monospace")))
  choices("Couleur","subtitleColor",listOf("#FFFFFF" to tr("Blanc"),"#F5DE93" to tr("Ivoire"),"#BDE6FF" to tr("Bleu clair"),"#BFE3C2" to tr("Vert clair")))
  choices("Contour","subtitleOutline",listOf(0 to tr("Aucun"),1 to tr("Fin"),2 to tr("Moyen"),4 to tr("Épais")))
  choices("Fond","subtitleBackground",listOf(false to tr("Aucun"),true to tr("Noir")))
  dialog.setOnDismissListener{if(sheet===dialog)sheet=null;showControls()};sheet=dialog;dialog.show()
 }
 private fun unfinished():Boolean {
  if(!loaded||reportedError||duration<=0||position/duration>=0.99||last.optBoolean("eof"))return false
  val segments=options.optJSONArray("skipSegments")?:JSONArray()
  return (0 until segments.length()).none{val s=segments.getJSONObject(it);val start=s.optDouble("start",-1.0);val end=s.optDouble("end",-1.0);val reference=s.optDouble("episodeLength",0.0);s.optString("kind")=="outro"&&start>=0&&end>start&&end<=duration&&position>=start&&(reference==0.0||abs(duration-reference)<max(10.0,duration*0.03))}
 }
 private fun pipParams():android.app.PictureInPictureParams {
  val builder=android.app.PictureInPictureParams.Builder().setAspectRatio(android.util.Rational(16,9))
  if(Build.VERSION.SDK_INT>=31)builder.setAutoEnterEnabled(unfinished()).setSeamlessResizeEnabled(true)
  return builder.build()
 }
 private fun enterPip():Boolean {
  if(!unfinished()||!packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE))return false
  return try{sheet?.dismiss();emit(false);enterPictureInPictureMode(pipParams())}catch(e:Exception){false}
 }
 private fun leavePlayer(){if(!enterPip())finish()}
 @Deprecated("Deprecated in Java") override fun onBackPressed(){if(sheet!=null){sheet?.dismiss();sheet=null}else leavePlayer()}
 override fun onUserLeaveHint(){super.onUserLeaveHint();if(Build.VERSION.SDK_INT<31)enterPip()}
 override fun onPictureInPictureModeChanged(inPip:Boolean,configuration:android.content.res.Configuration){
  super.onPictureInPictureModeChanged(inPip,configuration)
  if(inPip){overlay.visibility=View.GONE;skipButton.visibility=View.GONE;nextEpisodeButton.visibility=View.GONE;gestureLabel.visibility=View.GONE}else{if(lifecycleStopped){finish()}else showControls()}
 }
 private var lifecycleStopped=false
 override fun onStart(){super.onStart();lifecycleStopped=false}
 override fun onStop(){super.onStop();lifecycleStopped=true;if(isInPictureInPictureMode){command("set","pause","yes");emit(false)}}
 override fun onPause(){if(isInPictureInPictureMode){emit(false);super.onPause();return};resumeAfterPause=handle!=0L&&!last.optBoolean("paused");command("set","pause","yes");emit(false);super.onPause()}
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
 override fun onDestroy(){if(::preview.isInitialized)preview.close();if(duration>0&&position/duration>=0.95)DownloadStore(this).markWatched(options.optString("downloadId"));if(active?.get()===this){active=null;DownloadStore.playingId=""};breathing?.cancel();handler.removeCallbacksAndMessages(null);sheet?.dismiss();emit(true);release();if(options.optBoolean("deleteWatched")&&options.optString("downloadId").isNotEmpty()&&duration>0&&position/duration>=0.95)DownloadStore(this).remove(options.getString("downloadId"));if(::focus.isInitialized)audio.abandonAudioFocusRequest(focus);super.onDestroy()}
}
