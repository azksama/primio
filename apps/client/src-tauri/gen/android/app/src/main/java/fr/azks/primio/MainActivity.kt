package fr.azks.primio
import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
class MainActivity:TauriActivity(){
 override fun onCreate(savedInstanceState:Bundle?){
  enableEdgeToEdge();super.onCreate(savedInstanceState)
  PrimioUpdate.cleanup(this)
  WindowInsetsControllerCompat(window,window.decorView).isAppearanceLightStatusBars=false
  val content=findViewById<View>(android.R.id.content)
  ViewCompat.setOnApplyWindowInsetsListener(content){view,insets->val bars=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout());view.setPadding(bars.left,bars.top,bars.right,bars.bottom);WindowInsetsCompat.CONSUMED}
 }
}
