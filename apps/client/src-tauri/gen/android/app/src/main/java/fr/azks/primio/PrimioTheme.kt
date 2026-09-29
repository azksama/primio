package fr.azks.primio

import android.content.Context
import android.content.ContextWrapper
import android.graphics.*
import android.graphics.drawable.Drawable
import org.json.JSONObject

interface PrimioThemeOwner { val primioTheme: JSONObject? }

data class PrimioPalette(
 val neumorphic:Boolean=false, val light:Boolean=false,
 val background:Int=0xff101110.toInt(), val surface:Int=0xff282b30.toInt(),
 val text:Int=0xfff3f1eb.toInt(), val muted:Int=0xffb7b8b1.toInt(),
 val accent:Int=0xffdad4c5.toInt(), val highlight:Int=0xff383d45.toInt(), val shadow:Int=0xff191c20.toInt()
) {
 companion object {
  fun from(context:Context):PrimioPalette {
   val data=(context as? PrimioThemeOwner)?.primioTheme
    ?: return if(context is ContextWrapper && context.baseContext !== context)from(context.baseContext) else PrimioPalette()
   fun color(key:String,fallback:Int)=data.optString(key).takeIf{it.matches(Regex("#[0-9a-fA-F]{6}"))}?.let{Color.parseColor(it)}?:fallback
   return PrimioPalette(data.optString("material")=="neumorphic",data.optString("colorScheme")=="light",
    color("background",0xff101110.toInt()),color("surface",0xff282b30.toInt()),color("text",0xfff3f1eb.toInt()),
    color("muted",0xffb7b8b1.toInt()),color("accent",0xffdad4c5.toInt()),color("shadowLight",0xff383d45.toInt()),color("shadowDark",0xff191c20.toInt()))
  }
 }
}

/** Small cached software tiles give native controls the same paired shadows as the WebView. */
class PrimioRelief(private val palette:PrimioPalette,private val density:Float,private val radius:Float,private val inset:Boolean=false):Drawable() {
 private var tile:Bitmap?=null
 private var pressed=false
 private var focused=false
 private val blit=Paint(Paint.ANTI_ALIAS_FLAG)
 override fun isStateful()=true
 override fun onStateChange(state:IntArray):Boolean {
  val down=state.contains(android.R.attr.state_pressed)||state.contains(android.R.attr.state_selected)||state.contains(android.R.attr.state_checked)
  val focus=state.contains(android.R.attr.state_focused)
  if(down==pressed&&focus==focused)return false
  pressed=down;focused=focus;tile=null;invalidateSelf();return true
 }
 override fun onBoundsChange(bounds:Rect){tile=null}
 override fun draw(canvas:Canvas){
  if(bounds.width()<=0||bounds.height()<=0)return
  val bitmap=tile?:render().also{tile=it}
  canvas.drawBitmap(bitmap,bounds.left.toFloat(),bounds.top.toFloat(),blit)
 }
 private fun render():Bitmap {
  val bitmap=Bitmap.createBitmap(bounds.width(),bounds.height(),Bitmap.Config.ARGB_8888)
  val canvas=Canvas(bitmap);val p=Paint(Paint.ANTI_ALIAS_FLAG)
  val pad=4*density
  val box=RectF(pad,pad,bitmap.width-pad,bitmap.height-pad)
  val r=radius.coerceAtMost(box.height()/2)
  p.color=palette.surface
  if(!pressed&&!inset){
   p.setShadowLayer(6*density,-3*density,-3*density,palette.highlight);canvas.drawRoundRect(box,r,r,p)
   p.setShadowLayer(6*density,3*density,3*density,palette.shadow);canvas.drawRoundRect(box,r,r,p);p.clearShadowLayer()
   p.shader=LinearGradient(box.left,box.top,box.right,box.bottom,intArrayOf(mix(palette.surface,Color.WHITE,.035f),mix(palette.surface,Color.BLACK,.035f)),null,Shader.TileMode.CLAMP)
   canvas.drawRoundRect(box,r,r,p);p.shader=null
  }else{
   canvas.drawRoundRect(box,r,r,p)
   val clip=Path().apply{addRoundRect(box,r,r,Path.Direction.CW)}
   val outside=Path().apply{fillType=Path.FillType.EVEN_ODD;addRect(-100f,-100f,bitmap.width+100f,bitmap.height+100f,Path.Direction.CW);addRoundRect(box,r,r,Path.Direction.CW)}
   val save=canvas.save();canvas.clipPath(clip)
   p.color=palette.shadow;p.setShadowLayer(5*density,3*density,3*density,palette.shadow);canvas.drawPath(outside,p)
   p.color=palette.highlight;p.setShadowLayer(5*density,-3*density,-3*density,palette.highlight);canvas.drawPath(outside,p)
   p.clearShadowLayer();canvas.restoreToCount(save)
  }
  if(focused){p.style=Paint.Style.STROKE;p.strokeWidth=2*density;p.color=palette.accent;canvas.drawRoundRect(box,r,r,p)}
  return bitmap
 }
 private fun mix(a:Int,b:Int,t:Float)=Color.rgb((Color.red(a)*(1-t)+Color.red(b)*t).toInt(),(Color.green(a)*(1-t)+Color.green(b)*t).toInt(),(Color.blue(a)*(1-t)+Color.blue(b)*t).toInt())
 override fun setAlpha(alpha:Int){blit.alpha=alpha;invalidateSelf()}
 override fun setColorFilter(filter:ColorFilter?){blit.colorFilter=filter;invalidateSelf()}
 @Deprecated("Deprecated in Java") override fun getOpacity()=PixelFormat.TRANSLUCENT
}
