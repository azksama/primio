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
 fun glass(c:Context,radius:Int=26)=GradientDrawable(GradientDrawable.Orientation.TL_BR,intArrayOf(0xa86c7066.toInt(),0x78333730.toInt(),0x9c1c1e1b.toInt())).apply{cornerRadius=dp(c,radius).toFloat();setStroke(dp(c,1),0x88e8e4d5.toInt())}
 fun text(c:Context,label:String,size:Float=15f)=TextView(c).apply{text=label;textSize=size;setTextColor(ivory);fontFeatureSettings="tnum"}
 fun button(c:Context,label:String,description:String=label,action:()->Unit)=text(c,label,15f).apply{contentDescription=description;gravity=Gravity.CENTER;minHeight=dp(c,48);minWidth=dp(c,48);setPadding(dp(c,16),dp(c,10),dp(c,16),dp(c,10));background=glass(c);isClickable=true;isFocusable=true;setOnClickListener{action()}}
}

class PrimioSheet(context:Context,title:String,private val lateral:Boolean=false):Dialog(context) {
 val content=LinearLayout(context).apply{orientation=LinearLayout.VERTICAL;setPadding(20.dp,0,20.dp,12.dp)}
 private val Int.dp:Int get()=PrimioStyle.dp(context,this)
 private val panel=LinearLayout(context).apply{orientation=LinearLayout.VERTICAL;background=PrimioStyle.glass(context)}
 init {
  val head=LinearLayout(context).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(20.dp,12.dp,16.dp,16.dp)}
  head.addView(PrimioStyle.text(context,title,20f),LinearLayout.LayoutParams(0,-2,1f))
  head.addView(PrimioStyle.button(context,"×",PrimioI18n.text(context,"Fermer")){dismiss()},LinearLayout.LayoutParams(48.dp,48.dp).apply{leftMargin=16.dp})
  panel.addView(head)
  panel.addView(ScrollView(context).apply{isFillViewport=false;addView(content)},LinearLayout.LayoutParams(-1,0,1f))
  requestWindowFeature(Window.FEATURE_NO_TITLE);setContentView(panel)
  window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
 }
 fun section(title:String){content.addView(PrimioStyle.text(context,title,12f).apply{setTextColor(0xffb7b8b1.toInt());setPadding(0,12.dp,0,10.dp)})}
 fun option(label:String,selected:Boolean=false,action:()->Unit){content.addView(PrimioStyle.button(context,(if(selected)"✓  " else "")+label,label){action()}.apply{gravity=Gravity.CENTER_VERTICAL or Gravity.START},LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=10.dp})}
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
   "eye","eye-off"->{val path=Path().apply{moveTo(2f,12f);cubicTo(6f,4f,18f,4f,22f,12f);cubicTo(18f,20f,6f,20f,2f,12f)};canvas.drawPath(path,paint);canvas.drawCircle(12f,12f,3f,paint);if(symbol=="eye-off")canvas.drawLine(3f,3f,21f,21f,paint)}
   "play"->{val path=Path().apply{moveTo(7f,4f);lineTo(20f,12f);lineTo(7f,20f);close()};canvas.drawPath(path,paint)}
   else->{canvas.drawRoundRect(RectF(6f,4f,9f,20f),1f,1f,paint);canvas.drawRoundRect(RectF(15f,4f,18f,20f),1f,1f,paint)}
  };canvas.restoreToCount(saved)
 }
 override fun onInitializeAccessibilityNodeInfo(info:AccessibilityNodeInfo){super.onInitializeAccessibilityNodeInfo(info);info.className="android.widget.Button"}
}
