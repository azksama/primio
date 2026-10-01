package fr.azks.primio

import android.app.Dialog
import android.content.Context
import android.graphics.*
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.Drawable
import android.os.Bundle
import android.view.*
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.*
import kotlin.math.*

object PrimioStyle {
 val ivory=Color.rgb(243,241,235)
 fun dp(c:Context,n:Int)=(n*c.resources.displayMetrics.density).toInt()
 fun palette(c:Context)=PrimioPalette.from(c)
 private fun originalGlass(c:Context,radius:Int)=GradientDrawable(GradientDrawable.Orientation.TL_BR,intArrayOf(0xa86c7066.toInt(),0x78333730.toInt(),0x9c1c1e1b.toInt())).apply{cornerRadius=dp(c,radius).toFloat();setStroke(dp(c,1),0x88e8e4d5.toInt())}
 fun glass(c:Context,radius:Int=26):android.graphics.drawable.Drawable=if(palette(c).neumorphic)PrimioRelief(palette(c),c.resources.displayMetrics.density,dp(c,radius).toFloat()) else originalGlass(c,radius)
 fun field(c:Context,radius:Int=16):android.graphics.drawable.Drawable=if(palette(c).neumorphic)PrimioRelief(palette(c),c.resources.displayMetrics.density,dp(c,radius).toFloat(),true) else originalGlass(c,radius)
 fun focusGlass(c:Context,radius:Int=26):android.graphics.drawable.Drawable=if(palette(c).neumorphic)glass(c,radius) else android.graphics.drawable.StateListDrawable().apply{addState(intArrayOf(android.R.attr.state_focused),originalGlass(c,radius).apply{setStroke(dp(c,3),ivory)});addState(intArrayOf(android.R.attr.state_pressed),originalGlass(c,radius).apply{setStroke(dp(c,2),ivory)});addState(intArrayOf(),originalGlass(c,radius))}
 fun text(c:Context,label:String,size:Float=15f)=TextView(c).apply{text=label;textSize=size;setTextColor(palette(c).text);fontFeatureSettings="tnum"}
 fun button(c:Context,label:String,description:String=label,action:()->Unit)=text(c,label,15f).apply{contentDescription=description;gravity=Gravity.CENTER;minHeight=dp(c,48);minWidth=dp(c,48);setPadding(dp(c,16),dp(c,10),dp(c,16),dp(c,10));background=focusGlass(c);isClickable=true;isFocusable=true;setOnClickListener{action()}}
}

class PrimioSheet(context:Context,title:String,private val lateral:Boolean=false):Dialog(context) {
 val content=LinearLayout(context).apply{orientation=LinearLayout.VERTICAL;setPadding(20.dp,0,20.dp,12.dp)}
 val scroll=ScrollView(context).apply{isFillViewport=false;addView(content)}
 private val Int.dp:Int get()=PrimioStyle.dp(context,this)
 private val panel=LinearLayout(context).apply{orientation=LinearLayout.VERTICAL;background=PrimioStyle.glass(context)}
 init {
  val head=LinearLayout(context).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(20.dp,12.dp,16.dp,16.dp)}
  head.addView(PrimioStyle.text(context,title,20f),LinearLayout.LayoutParams(0,-2,1f))
  head.addView(PrimioStyle.button(context,"×",PrimioI18n.text(context,"Fermer")){dismiss()},LinearLayout.LayoutParams(48.dp,48.dp).apply{leftMargin=16.dp})
  panel.addView(head)
  panel.addView(scroll,LinearLayout.LayoutParams(-1,0,1f))
  requestWindowFeature(Window.FEATURE_NO_TITLE);setContentView(panel)
  window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
 }
 fun section(title:String){content.addView(PrimioStyle.text(context,title,12f).apply{setTextColor(PrimioStyle.palette(context).muted);setPadding(0,12.dp,0,10.dp)})}
 fun option(label:String,selected:Boolean=false,trailingIcon:String?=null,action:()->Unit){content.addView(PrimioStyle.button(context,(if(selected)"✓  " else "")+label,label){action()}.apply{gravity=Gravity.CENTER_VERTICAL or Gravity.START;isSelected=selected;if(selected)setTextColor(PrimioStyle.palette(context).accent);if(trailingIcon!=null){setCompoundDrawablesWithIntrinsicBounds(null,null,PrimioIconDrawable(context,trailingIcon),null);compoundDrawablePadding=12.dp}},LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=10.dp})}
 override fun onStart(){
  super.onStart()
  val manager=context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
  val metrics=context.resources.displayMetrics
  val bounds=if(android.os.Build.VERSION.SDK_INT>=30)manager.currentWindowMetrics.bounds else Rect(0,0,metrics.widthPixels,metrics.heightPixels)
  val insets=if(android.os.Build.VERSION.SDK_INT>=30)manager.currentWindowMetrics.windowInsets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()) else null
  val height=(bounds.height()-(insets?.top?:0)-(insets?.bottom?:0)-32.dp).coerceAtLeast(120.dp)
  val width=min(bounds.width()-(insets?.left?:0)-(insets?.right?:0)-32.dp,if(lateral)380.dp else 800.dp).coerceAtLeast(160.dp)
  content.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED))
  window?.decorView?.setPadding(0,0,0,0)
  window?.setGravity(if(lateral)Gravity.END or Gravity.CENTER_VERTICAL else Gravity.CENTER)
  window?.attributes=window?.attributes?.apply{x=if(lateral)16.dp else 0;y=0}
  window?.setLayout(width,if(lateral)height else min(height,content.measuredHeight+80.dp))
  window?.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);window?.setDimAmount(.48f)
 }

}

class PrimioIconDrawable(context:Context,private val symbol:String):Drawable() {
 private val size=PrimioStyle.dp(context,24)
 private val paint=Paint(Paint.ANTI_ALIAS_FLAG).apply{color=PrimioStyle.palette(context).text;style=Paint.Style.STROKE;strokeCap=Paint.Cap.ROUND;strokeJoin=Paint.Join.ROUND;strokeWidth=1.8f}
 override fun draw(canvas:Canvas){val saved=canvas.save();canvas.translate(bounds.left.toFloat(),bounds.top.toFloat());canvas.scale(bounds.width()/24f,bounds.height()/24f);(PrimioIcons.paths[symbol]?:emptyList()).forEach{canvas.drawPath(it,paint)};canvas.restoreToCount(saved)}
 override fun getIntrinsicWidth()=size
 override fun getIntrinsicHeight()=size
 override fun setAlpha(alpha:Int){paint.alpha=alpha;invalidateSelf()}
 override fun setColorFilter(filter:ColorFilter?){paint.colorFilter=filter;invalidateSelf()}
 @Deprecated("Deprecated in Java") override fun getOpacity()=PixelFormat.TRANSLUCENT
}

class PrimioLevelIndicator(context:Context,private val kind:String,private val label:String):LinearLayout(context) {
 private var fraction=0f
 private val dp={n:Int->PrimioStyle.dp(context,n)}
 private val icon=ImageView(context).apply{setImageDrawable(PrimioIconDrawable(context,kind));importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO}
 private val percentage=PrimioStyle.text(context,"",12f).apply{gravity=Gravity.CENTER;importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO}
 private val meter=object:View(context){
  private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
  override fun onDraw(canvas:Canvas){
   val palette=PrimioStyle.palette(context);val radius=width/2f
   paint.color=palette.muted;paint.alpha=60;canvas.drawRoundRect(0f,0f,width.toFloat(),height.toFloat(),radius,radius,paint)
   paint.color=palette.accent;paint.alpha=255
   if(fraction>0f)canvas.drawRoundRect(0f,height*(1-fraction),width.toFloat(),height.toFloat(),radius,radius,paint)
  }
 }
 init{
  orientation=VERTICAL;gravity=Gravity.CENTER_HORIZONTAL;setPadding(dp(12),dp(14),dp(12),dp(14));background=PrimioStyle.glass(context,30);visibility=View.GONE
  addView(icon,LayoutParams(dp(28),dp(28)))
  addView(meter,LayoutParams(dp(8),0,1f).apply{topMargin=dp(12);bottomMargin=dp(12)})
  addView(percentage,LayoutParams(-1,dp(18)))
 }
 fun showLevel(value:Float){fraction=value.coerceIn(0f,1f);val percent=(fraction*100).roundToInt();percentage.text="$percent%";contentDescription="$label $percent%";icon.setImageDrawable(PrimioIconDrawable(context,if(kind=="volume"&&fraction==0f)"mute" else kind));meter.invalidate();visibility=View.VISIBLE}
 override fun onInitializeAccessibilityNodeInfo(info:AccessibilityNodeInfo){super.onInitializeAccessibilityNodeInfo(info);info.className="android.widget.ProgressBar";info.rangeInfo=AccessibilityNodeInfo.RangeInfo.obtain(AccessibilityNodeInfo.RangeInfo.RANGE_TYPE_FLOAT,0f,1f,fraction)}
}

class PrimioEpisodeProgress(context:Context):View(context) {
 var fraction=0f;set(value){field=value.coerceIn(0f,1f);contentDescription=PrimioI18n.text(context,"Progression du visionnage")+" · "+(field*100).toInt()+"%";invalidate()}
 private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
 init{importantForAccessibility=IMPORTANT_FOR_ACCESSIBILITY_YES}
 override fun onDraw(canvas:Canvas){paint.color=0xb0000000.toInt();canvas.drawRoundRect(RectF(0f,0f,width.toFloat(),height.toFloat()),height/2f,height/2f,paint);paint.color=PrimioStyle.palette(context).accent;canvas.drawRoundRect(RectF(0f,0f,width*fraction,height.toFloat()),height/2f,height/2f,paint)}
}

class PrimioTimeline(context:Context):View(context) {
 var segments:List<Pair<Float,Float>> = emptyList();set(value){field=value;invalidate()}
 var fraction=0f;set(v){field=v.coerceIn(0f,1f);invalidate()}
 var buffered=0f;set(v){field=v.coerceIn(0f,1f);invalidate()}
 var onSeek:(Float,Boolean)->Unit={_,_->}
 private var dragging=false
 private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
 private val density=resources.displayMetrics.density
 init{isFocusable=true;isClickable=true;contentDescription=PrimioI18n.text(context,"Position de lecture");importantForAccessibility=IMPORTANT_FOR_ACCESSIBILITY_YES}
 override fun onDraw(canvas:Canvas){
  if(PrimioStyle.palette(context).neumorphic){drawRelief(canvas);return}
  val left=14*density;val right=width-left;val y=height/2f
  val half=4*density;val radius=half;val x=left+(right-left)*fraction
  val accent=PrimioStyle.palette(context).accent
  fun glow(alpha:Int)=(accent and 0x00ffffff) or (alpha shl 24)
  val track=RectF(left,y-half,right,y+half)
  paint.style=Paint.Style.FILL
  // Broad, quiet halo under the played range, with a brighter pool at the playhead.
  if(fraction>0f){
   paint.shader=LinearGradient(0f,y-13*density,0f,y+13*density,intArrayOf(Color.TRANSPARENT,glow(80),Color.TRANSPARENT),floatArrayOf(0f,.5f,1f),Shader.TileMode.CLAMP)
   canvas.drawRoundRect(RectF(left-4*density,y-13*density,x+4*density,y+13*density),13*density,13*density,paint)
   paint.shader=RadialGradient(x,y,22*density,intArrayOf(glow(102),glow(34),Color.TRANSPARENT),floatArrayOf(0f,.35f,1f),Shader.TileMode.CLAMP)
   canvas.drawCircle(x,y,22*density,paint)
  }
  paint.shader=LinearGradient(0f,y-half,0f,y+half,intArrayOf(0xaa343630.toInt(),0xb0181a17.toInt()),null,Shader.TileMode.CLAMP)
  canvas.drawRoundRect(track,radius,radius,paint)
  val save=canvas.save();val clip=Path().apply{addRoundRect(track,radius,radius,Path.Direction.CW)};canvas.clipPath(clip)
  paint.shader=null;paint.color=0x559d9f91
  canvas.drawRect(left,y-half,left+(right-left)*buffered,y+half,paint)
  paint.shader=LinearGradient(0f,y-half,0f,y+half,intArrayOf(androidx.core.graphics.ColorUtils.blendARGB(accent,Color.WHITE,.25f),accent,androidx.core.graphics.ColorUtils.blendARGB(accent,Color.WHITE,.1f)),floatArrayOf(0f,.55f,1f),Shader.TileMode.CLAMP)
  canvas.drawRect(left,y-half,x,y+half,paint)
  paint.shader=null;paint.color=0xccbba978.toInt()
  segments.forEach{(start,end)->canvas.drawRect(left+(right-left)*start,y-half,left+(right-left)*end,y+half,paint)}
  paint.color=0x66ffffff;canvas.drawRect(left,y-half,x,y-half+1*density,paint)
  canvas.restoreToCount(save)
  paint.style=Paint.Style.STROKE;paint.strokeWidth=density
  paint.shader=LinearGradient(0f,y-half,0f,y+half,intArrayOf(0x66ffffff,0x15ffffff),null,Shader.TileMode.CLAMP)
  canvas.drawRoundRect(track,radius,radius,paint)
  paint.shader=null;paint.style=Paint.Style.FILL
  val thumb=(if(dragging)9 else 7)*density
  paint.color=glow(85);canvas.drawCircle(x,y,thumb+5*density,paint)
  paint.color=Color.WHITE;paint.shader=LinearGradient(x,y-thumb,x,y+thumb,intArrayOf(Color.WHITE,0xffd7cfb5.toInt()),null,Shader.TileMode.CLAMP)
  canvas.drawCircle(x,y,thumb,paint);paint.shader=null
  paint.style=Paint.Style.STROKE;paint.strokeWidth=density;paint.color=0x99303030.toInt();canvas.drawCircle(x,y,thumb,paint);paint.style=Paint.Style.FILL
 }
 private fun drawRelief(canvas:Canvas){
  val palette=PrimioStyle.palette(context);val left=14*density;val right=width-left;val y=height/2f;val half=4*density;val x=left+(right-left)*fraction
  paint.style=Paint.Style.FILL
  paint.shader=LinearGradient(0f,y-half,0f,y+half,intArrayOf(palette.shadow,palette.surface,palette.highlight),null,Shader.TileMode.CLAMP)
  canvas.drawRoundRect(RectF(left,y-half,right,y+half),half,half,paint);paint.shader=null
  paint.color=palette.muted;paint.alpha=65;canvas.drawRoundRect(RectF(left,y-half,left+(right-left)*buffered,y+half),half,half,paint);paint.alpha=255
  paint.color=palette.accent;canvas.drawRoundRect(RectF(left,y-half,x,y+half),half,half,paint)
  paint.alpha=130;segments.forEach{(start,end)->canvas.drawRoundRect(RectF(left+(right-left)*start,y-half,left+(right-left)*end,y+half),half,half,paint)};paint.alpha=255
  val thumb=(if(dragging)10 else 8)*density
  paint.color=palette.shadow;canvas.drawCircle(x+2*density,y+2*density,thumb+2*density,paint)
  paint.color=palette.text;canvas.drawCircle(x,y,thumb,paint)
  paint.style=Paint.Style.STROKE;paint.strokeWidth=2*density;paint.color=palette.surface;canvas.drawCircle(x,y,thumb,paint);paint.style=Paint.Style.FILL
 }
 override fun onTouchEvent(e:MotionEvent):Boolean {
  when(e.actionMasked){
   MotionEvent.ACTION_DOWN->{parent.requestDisallowInterceptTouchEvent(true);dragging=true}
   MotionEvent.ACTION_CANCEL->{dragging=false;onSeek(fraction,true);invalidate();return true}
  }
  fraction=((e.x-14*density)/(width-28*density).coerceAtLeast(1f)).coerceIn(0f,1f)
  val done=e.actionMasked==MotionEvent.ACTION_UP
  if(done){dragging=false;performClick()}
  onSeek(fraction,done);return true
 }
 override fun performClick():Boolean{super.performClick();return true}
 override fun onKeyDown(keyCode:Int,event:KeyEvent):Boolean {if(keyCode==KeyEvent.KEYCODE_DPAD_LEFT||keyCode==KeyEvent.KEYCODE_DPAD_RIGHT){fraction+=if(keyCode==KeyEvent.KEYCODE_DPAD_RIGHT).02f else -.02f;onSeek(fraction,true);return true};return super.onKeyDown(keyCode,event)}
 override fun onInitializeAccessibilityNodeInfo(info:AccessibilityNodeInfo){super.onInitializeAccessibilityNodeInfo(info);info.className="android.widget.SeekBar";info.rangeInfo=AccessibilityNodeInfo.RangeInfo.obtain(AccessibilityNodeInfo.RangeInfo.RANGE_TYPE_FLOAT,0f,1f,fraction);info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_FORWARD);info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_BACKWARD)}
 override fun performAccessibilityAction(action:Int,args:Bundle?):Boolean {if(action==AccessibilityNodeInfo.ACTION_SCROLL_FORWARD||action==AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD){fraction+=(if(action==AccessibilityNodeInfo.ACTION_SCROLL_FORWARD).02f else -.02f);onSeek(fraction,true);return true};return super.performAccessibilityAction(action,args)}
}

class PrimioSpinner(context:Context):View(context) {
 private val paint=Paint(Paint.ANTI_ALIAS_FLAG).apply{style=Paint.Style.STROKE;strokeWidth=3*resources.displayMetrics.density;strokeCap=Paint.Cap.ROUND}
 override fun onDraw(canvas:Canvas){val inset=8*resources.displayMetrics.density;val bounds=RectF(inset,inset,width-inset,height-inset);paint.color=0x33dad4c5;canvas.drawOval(bounds,paint);paint.color=PrimioStyle.ivory;canvas.drawArc(bounds,(android.os.SystemClock.uptimeMillis()%1200)/1200f*360,95f,false,paint);if(isShown)postInvalidateOnAnimation()}
}

class PrimioIconButton(context:Context,symbol:String,description:String,action:()->Unit):View(context) {
 var symbol=symbol;set(value){if(field!=value){field=value;invalidate()}}
 private val paint=Paint(Paint.ANTI_ALIAS_FLAG).apply{color=PrimioStyle.palette(context).text;strokeCap=Paint.Cap.ROUND;strokeJoin=Paint.Join.ROUND;strokeWidth=1.8f}
 init{contentDescription=description;isClickable=true;isFocusable=true;background=PrimioStyle.focusGlass(context,99);minimumHeight=PrimioStyle.dp(context,48);minimumWidth=PrimioStyle.dp(context,48);setOnClickListener{action()}}
 override fun onDraw(canvas:Canvas){super.onDraw(canvas);val size=PrimioStyle.dp(context,if(symbol=="play"||symbol=="pause")40 else 28).toFloat();val saved=canvas.save();canvas.translate((width-size)/2,(height-size)/2);canvas.scale(size/24,size/24);paint.style=Paint.Style.STROKE
  (PrimioIcons.paths[symbol]?:PrimioIcons.paths.getValue("pause")).forEach{canvas.drawPath(it,paint)};canvas.restoreToCount(saved)
 }
 override fun onInitializeAccessibilityNodeInfo(info:AccessibilityNodeInfo){super.onInitializeAccessibilityNodeInfo(info);info.className="android.widget.Button"}
}

class PrimioCountdown(context:Context):View(context) {
 var elapsed=0f;set(value){field=value.coerceIn(0f,3f);contentDescription=PrimioI18n.text(context,"Annuler le compte à rebours ({n} secondes)",mapOf("n" to ceil(3f-field).toInt().coerceAtLeast(1)));invalidate()}
 private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
 init{background=PrimioStyle.focusGlass(context,24);isClickable=true;isFocusable=true;importantForAccessibility=IMPORTANT_FOR_ACCESSIBILITY_YES}
 override fun onDraw(canvas:Canvas){
  val d=resources.displayMetrics.density;val inset=4*d
  paint.style=Paint.Style.STROKE;paint.strokeWidth=2*d;paint.color=0x44ffffff;paint.strokeCap=Paint.Cap.ROUND
  val circle=RectF(inset,inset,width-inset,height-inset);canvas.drawOval(circle,paint)
  paint.color=PrimioStyle.palette(context).accent;canvas.drawArc(circle,-90f,360f*(1-elapsed/3f),false,paint)
  paint.style=Paint.Style.FILL;paint.textSize=16*d;paint.textAlign=Paint.Align.CENTER
  canvas.drawText(ceil(3f-elapsed).toInt().coerceAtLeast(1).toString(),width/2f,height/2f-(paint.ascent()+paint.descent())/2,paint)
 }
 override fun onInitializeAccessibilityNodeInfo(info:AccessibilityNodeInfo){super.onInitializeAccessibilityNodeInfo(info);info.className="android.widget.Button"}
}
