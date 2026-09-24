package fr.azks.primio
import android.content.Context
import org.json.JSONObject
import java.util.Locale
object PrimioI18n {
 private val dictionaries=mutableMapOf<String,JSONObject>()
 fun locale(context:Context)=context.getSharedPreferences("primio-settings",0).getString("language","en")?:"en"
 fun text(context:Context,key:String,values:Map<String,Any> = emptyMap()):String {
  val language=locale(context)
  val text=if(language=="fr")key else try{val dictionary=synchronized(dictionaries){dictionaries.getOrPut(language){JSONObject(context.assets.open("locales/$language.json").bufferedReader().use{it.readText()})}};dictionary.optString(key,key)}catch(_:Exception){key}
  return values.entries.fold(text){s,(k,v)->s.replace("{$k}",v.toString())}
 }
}
