package fr.azks.primio

import android.app.Dialog
import android.content.Context
import android.graphics.*
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.*
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.*
import kotlin.math.*

object PrimioStyle {
 val ivory=Color.rgb(243,241,235)
 fun dp(c:Context,n:Int)=(n*c.resources.displayMetrics.density).toInt()
 fun glass(c:Context,radius:Int=26)=GradientDrawable(GradientDrawable.Orientation.TL_BR,intArrayOf(0xee363831.toInt(),0xee1c1e1b.toInt())).apply{cornerRadius=dp(c,radius).toFloat();setStroke(dp(c,1),0x55dad4c5)}
 fun text(c:Context,label:String,size:Float=15f)=TextView(c).apply{text=label;textSize=size;setTextColor(ivory);fontFeatureSettings="tnum"}
 fun button(c:Context,label:String,description:String=label,action:()->Unit)=text(c,label,15f).apply{contentDescription=description;gravity=Gravity.CENTER;minHeight=dp(c,48);minWidth=dp(c,48);setPadding(dp(c,16),dp(c,10),dp(c,16),dp(c,10));background=glass(c);isClickable=true;isFocusable=true;setOnClickListener{action()}}
}

class PrimioSheet(context:Context,title:String,private val lateral:Boolean=false):Dialog(context) {
 val content=LinearLayout(context).apply{orientation=LinearLayout.VERTICAL;setPadding(24.dp,20.dp,24.dp,20.dp);background=PrimioStyle.glass(context)}
 private val Int.dp:Int get()=PrimioStyle.dp(context,this)
 init {
  val head=LinearLayout(context).apply{gravity=Gravity.CENTER_VERTICAL}
  head.addView(PrimioStyle.text(context,title,22f),LinearLayout.LayoutParams(0,-2,1f))
  head.addView(PrimioStyle.button(context,"×",PrimioI18n.text(context,"Fermer")){dismiss()},LinearLayout.LayoutParams(48.dp,48.dp).apply{leftMargin=16.dp})
  content.addView(head,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=24.dp})
  requestWindowFeature(Window.FEATURE_NO_TITLE)
  setContentView(ScrollView(context).apply{addView(content)})
  window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
 }
 fun section(title:String){content.addView(PrimioStyle.text(context,title,12f).apply{setTextColor(0xffb7b8b1.toInt());setPadding(0,20.dp,0,10.dp)})}
 fun option(label:String,selected:Boolean=false,action:()->Unit){content.addView(PrimioStyle.button(context,(if(selected)"✓  " else "")+label,label){action()}.apply{gravity=Gravity.CENTER_VERTICAL or Gravity.START},LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=12.dp})}
 override fun onStart(){super.onStart();window?.setLayout(min(context.resources.displayMetrics.widthPixels-32.dp,if(lateral)360.dp else 600.dp),if(lateral)context.resources.displayMetrics.heightPixels-32.dp else WindowManager.LayoutParams.WRAP_CONTENT);if(lateral)window?.setGravity(Gravity.END or Gravity.CENTER_VERTICAL);window?.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);window?.setDimAmount(.64f)}
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
  val left=14*density;val right=width-left;val y=height/2f
  val half=4*density;val radius=half;val x=left+(right-left)*fraction
  val track=RectF(left,y-half,right,y+half)
  paint.style=Paint.Style.FILL
  // Broad, quiet halo under the played range, with a brighter pool at the playhead.
  if(fraction>0f){
   paint.shader=LinearGradient(0f,y-13*density,0f,y+13*density,intArrayOf(Color.TRANSPARENT,0x50ddd4b9,Color.TRANSPARENT),floatArrayOf(0f,.5f,1f),Shader.TileMode.CLAMP)
   canvas.drawRoundRect(RectF(left-4*density,y-13*density,x+4*density,y+13*density),13*density,13*density,paint)
   paint.shader=RadialGradient(x,y,22*density,intArrayOf(0x66fff1cb,0x22e2d6b7,Color.TRANSPARENT),floatArrayOf(0f,.35f,1f),Shader.TileMode.CLAMP)
   canvas.drawCircle(x,y,22*density,paint)
  }
  paint.shader=LinearGradient(0f,y-half,0f,y+half,intArrayOf(0xaa343630.toInt(),0xb0181a17.toInt()),null,Shader.TileMode.CLAMP)
  canvas.drawRoundRect(track,radius,radius,paint)
  val save=canvas.save();val clip=Path().apply{addRoundRect(track,radius,radius,Path.Direction.CW)};canvas.clipPath(clip)
  paint.shader=null;paint.color=0x559d9f91
  canvas.drawRect(left,y-half,left+(right-left)*buffered,y+half,paint)
  paint.shader=LinearGradient(0f,y-half,0f,y+half,intArrayOf(0xfff5edda.toInt(),0xffbfb99f.toInt(),0xffd9d1b7.toInt()),floatArrayOf(0f,.55f,1f),Shader.TileMode.CLAMP)
  canvas.drawRect(left,y-half,x,y+half,paint)
  paint.shader=null;paint.color=0xccbba978.toInt()
  segments.forEach{(start,end)->canvas.drawRect(left+(right-left)*start,y-half,left+(right-left)*end,y+half,paint)}
  paint.color=0x66ffffff;canvas.drawRect(left,y-half,x,y-half+1*density,paint)
  canvas.restoreToCount(save)
  paint.style=Paint.Style.STROKE;paint.strokeWidth=density
  paint.shader=LinearGradient(0f,y-half,0f,y+half,intArrayOf(0x66ffffff,0x15ffffff),null,Shader.TileMode.CLAMP)
  canvas.drawRoundRect(track,radius,radius,paint)
  paint.shader=null;paint.style=Paint.Style.FILL
  val thumb=(if(dragging)7 else 5)*density
  paint.color=0x22f5edda;canvas.drawCircle(x,y,thumb+5*density,paint)
  paint.shader=LinearGradient(x,y-thumb,x,y+thumb,intArrayOf(Color.WHITE,0xffd7cfb5.toInt()),null,Shader.TileMode.CLAMP)
  canvas.drawCircle(x,y,thumb,paint);paint.shader=null
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
 override fun onInitializeAccessibilityNodeInfo(info:AccessibilityNodeInfo){super.onInitializeAccessibilityNodeInfo(info);info.className="android.widget.SeekBar";info.rangeInfo=AccessibilityNodeInfo.RangeInfo.obtain(AccessibilityNodeInfo.RangeInfo.RANGE_TYPE_FLOAT,0f,1f,fraction);info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_FORWARD);info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_BACKWARD)}
 override fun performAccessibilityAction(action:Int,args:Bundle?):Boolean {if(action==AccessibilityNodeInfo.ACTION_SCROLL_FORWARD||action==AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD){fraction+=(if(action==AccessibilityNodeInfo.ACTION_SCROLL_FORWARD).02f else -.02f);onSeek(fraction,true);return true};return super.performAccessibilityAction(action,args)}
}

class PrimioSpinner(context:Context):View(context) {
 private val paint=Paint(Paint.ANTI_ALIAS_FLAG).apply{style=Paint.Style.STROKE;strokeWidth=3*resources.displayMetrics.density;strokeCap=Paint.Cap.ROUND}
 override fun onDraw(canvas:Canvas){val inset=8*resources.displayMetrics.density;val bounds=RectF(inset,inset,width-inset,height-inset);paint.color=0x33dad4c5;canvas.drawOval(bounds,paint);paint.color=PrimioStyle.ivory;canvas.drawArc(bounds,(android.os.SystemClock.uptimeMillis()%1200)/1200f*360,95f,false,paint);if(isShown)postInvalidateOnAnimation()}
}

class PrimioIconButton(context:Context,symbol:String,description:String,action:()->Unit):View(context) {
 var symbol=symbol;set(value){if(field!=value){field=value;invalidate()}}
 private val paint=Paint(Paint.ANTI_ALIAS_FLAG).apply{color=PrimioStyle.ivory;strokeCap=Paint.Cap.ROUND;strokeJoin=Paint.Join.ROUND;strokeWidth=1.8f}
 init{contentDescription=description;isClickable=true;isFocusable=true;background=PrimioStyle.glass(context);minimumHeight=PrimioStyle.dp(context,48);minimumWidth=PrimioStyle.dp(context,48);setOnClickListener{action()}}
 override fun onDraw(canvas:Canvas){super.onDraw(canvas);val size=PrimioStyle.dp(context,if(symbol=="back")26 else 32).toFloat();val saved=canvas.save();canvas.translate((width-size)/2,(height-size)/2);canvas.scale(size/24,size/24);paint.style=Paint.Style.STROKE
  when(symbol){
   "back"->{val path=Path().apply{moveTo(12f,19f);lineTo(5f,12f);lineTo(12f,5f);moveTo(5f,12f);lineTo(19f,12f)};canvas.drawPath(path,paint)}
   "play"->{val path=Path().apply{moveTo(7f,4f);lineTo(20f,12f);lineTo(7f,20f);close()};canvas.drawPath(path,paint)}
   else->{canvas.drawRoundRect(RectF(6f,4f,9f,20f),1f,1f,paint);canvas.drawRoundRect(RectF(15f,4f,18f,20f),1f,1f,paint)}
  };canvas.restoreToCount(saved)
 }
 override fun onInitializeAccessibilityNodeInfo(info:AccessibilityNodeInfo){super.onInitializeAccessibilityNodeInfo(info);info.className="android.widget.Button"}
}
