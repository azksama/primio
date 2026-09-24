package fr.azks.primio

import android.app.Activity
import android.app.Dialog
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.text.InputType
import android.view.*
import android.view.autofill.AutofillManager
import android.widget.*
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject

class PrimioAuth(private val activity:Activity,initialRegister:Boolean):Dialog(activity) {
 private fun tr(s:String)=PrimioI18n.text(activity,s)
 private var register=initialRegister
 private var pending:Invoke?=null
 private var submitted=false
 private val content=LinearLayout(activity).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(24),dp(20),dp(24),dp(24));background=PrimioStyle.glass(activity)}
 private val fields=mutableMapOf<String,EditText>()
 private lateinit var error:TextView
 private lateinit var submit:TextView
 private var accepted=false
 private fun dp(n:Int)=PrimioStyle.dp(activity,n)
 init{requestWindowFeature(Window.FEATURE_NO_TITLE);setContentView(ScrollView(activity).apply{isFillViewport=true;addView(content)});window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT));window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);setOnCancelListener{cancelPending()};render()}
 fun awaitSubmission(invoke:Invoke){pending=invoke;submitted=false;submit.isEnabled=true;submit.text=if(register)tr("Créer mon compte") else tr("Se connecter")}
 private fun cancelPending(){activity.getSystemService(AutofillManager::class.java)?.cancel();pending?.resolve(JSObject().put("cancelled",true) as JSObject);pending=null}
 private fun field(key:String,label:String,password:Boolean=false,autofill:String?=null):EditText {
  content.addView(PrimioStyle.text(activity,label,13f).apply{setPadding(0,dp(18),0,dp(8))})
  return EditText(activity).apply {
   id=when(key){"email"->R.id.auth_email;"password"->R.id.auth_password;"username"->R.id.auth_username;else->R.id.auth_confirmation}
   contentDescription=label;hint=if(key=="email")"vous@exemple.fr" else "";setTextColor(PrimioStyle.ivory);setHintTextColor(0xff999c92.toInt());textSize=16f;isSingleLine=true
   inputType=if(password)InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD else if(key=="email")InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS else InputType.TYPE_CLASS_TEXT
   if(autofill!=null){setAutofillHints(autofill);importantForAutofill=View.IMPORTANT_FOR_AUTOFILL_YES}else importantForAutofill=View.IMPORTANT_FOR_AUTOFILL_NO
   background=PrimioStyle.glass(activity,16);setPadding(dp(16),dp(12),dp(16),dp(12))
   if(password){
    val input=this;var visible=false
    val holder=FrameLayout(activity)
    setPadding(dp(16),dp(12),dp(56),dp(12))
    holder.addView(input,FrameLayout.LayoutParams(-1,dp(54)))
    lateinit var eye:PrimioIconButton
    eye=PrimioIconButton(activity,"eye",tr("Afficher le mot de passe")){
     visible=!visible;val cursor=input.selectionStart;input.transformationMethod=if(visible)null else android.text.method.PasswordTransformationMethod.getInstance();input.setSelection(cursor.coerceIn(0,input.length()));eye.symbol=if(visible)"eye-off" else "eye";eye.contentDescription=tr(if(visible)"Masquer le mot de passe" else "Afficher le mot de passe")
    }.apply{background=null}
    holder.addView(eye,FrameLayout.LayoutParams(dp(48),dp(48),Gravity.END or Gravity.CENTER_VERTICAL).apply{rightMargin=dp(3)})
    content.addView(holder,LinearLayout.LayoutParams(-1,dp(54)))
   }else content.addView(this,LinearLayout.LayoutParams(-1,dp(54)))
   fields[key]=this
  }
 }
 private fun render(){
  val email=fields["email"]?.text?.toString().orEmpty();content.removeAllViews();fields.clear();accepted=false
  val head=LinearLayout(activity).apply{gravity=Gravity.CENTER_VERTICAL}
  head.addView(PrimioStyle.text(activity,if(register)tr("Créer un compte") else tr("Bon retour"),24f),LinearLayout.LayoutParams(0,-2,1f));head.addView(PrimioStyle.button(activity,tr("×"),tr("Fermer")){cancelPending();dismiss()});content.addView(head)
  if(register)field("username",tr("Nom d’utilisateur"))
  field("email",tr("Adresse e-mail"),autofill=View.AUTOFILL_HINT_USERNAME).setText(email)
  field("password",tr("Mot de passe"),true,if(register)"newPassword" else View.AUTOFILL_HINT_PASSWORD)
  if(register){
   field("passwordConfirmation",tr("Confirmer le mot de passe"),true)
   val row=LinearLayout(activity).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(0,dp(18),0,dp(8))}
   val consent=PrimioStyle.button(activity,"○","Accepter les conditions d’utilisation"){}
   consent.setOnClickListener{accepted=!accepted;consent.text=if(accepted)"✓" else "○";consent.contentDescription=if(accepted)tr("Conditions acceptées") else "Accepter les conditions d’utilisation"}
   row.addView(consent,LinearLayout.LayoutParams(dp(48),dp(48)))
   row.addView(PrimioStyle.text(activity,tr("J’accepte les")+" "+tr("conditions d’utilisation"),13f).apply{text=android.text.SpannableString(text).apply{val start=tr("J’accepte les").length+1;setSpan(android.text.style.UnderlineSpan(),start,length,0);setSpan(android.text.style.StyleSpan(android.graphics.Typeface.BOLD),start,length,0)};setPadding(dp(12),0,0,0);isClickable=true;isFocusable=true;setOnClickListener{PrimioSheet(activity,tr("Conditions d’utilisation")).apply{section(tr("Primio est un lecteur multimédia. Les addons et plugins sont fournis par des tiers. Primio ne fournit aucun droit d’accès aux œuvres. Utilisez uniquement des sources auxquelles vous êtes autorisé à accéder. Les données de compte, profils, listes et progressions sont enregistrées pour permettre la synchronisation. Vous pouvez supprimer votre compte dans Paramètres."));option(tr("Fermer")){dismiss()};show()}}},LinearLayout.LayoutParams(0,-2,1f));content.addView(row)
  }
  error=PrimioStyle.text(activity,"",13f).apply{setTextColor(0xffe8ad9e.toInt());setPadding(0,dp(14),0,dp(10));visibility=View.GONE};content.addView(error)
  submit=PrimioStyle.button(activity,if(register)tr("Créer mon compte") else tr("Se connecter")){
   val emailValue=fields.getValue("email").text.toString().trim();val password=fields.getValue("password").text.toString()
   val username=fields["username"]?.text?.toString().orEmpty();val confirmation=fields["passwordConfirmation"]?.text?.toString().orEmpty()
   val problem=when { !android.util.Patterns.EMAIL_ADDRESS.matcher(emailValue).matches()->tr("Vérifiez votre adresse e-mail.");password.isEmpty()->"Saisissez votre mot de passe.";register&&!username.matches(Regex("[a-zA-Z0-9_]{3,32}"))->tr("Pseudonyme : 3 à 32 lettres, chiffres ou _.");register&&password.length<12->tr("Le mot de passe doit contenir au moins 12 caractères.");register&&password!=confirmation->tr("Les mots de passe ne correspondent pas.");register&&!accepted->"Acceptez les conditions pour continuer.";else->null }
   if(problem!=null){error.text=problem;error.visibility=View.VISIBLE}else if(!submitted){submitted=true;submit.isEnabled=false;submit.text="Connexion…";error.visibility=View.GONE;val result=JSObject().put("fullName",org.json.JSONObject.NULL).put("email",emailValue).put("password",password).put("register",register).put("username",username).put("passwordConfirmation",confirmation).put("termsAccepted",accepted).put("termsVersion","2026-09-23");pending?.resolve(result as JSObject);pending=null}
  };content.addView(submit,LinearLayout.LayoutParams(-1,dp(56)).apply{topMargin=dp(24)})
  content.addView(PrimioStyle.button(activity,if(register)tr("Déjà un compte ? Se connecter") else tr("Créer un compte")){if(!submitted){activity.getSystemService(AutofillManager::class.java)?.cancel();register=!register;render()}},LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(16)})
  if(isShowing)resize()
 }
 fun complete(success:Boolean,message:String){if(success){activity.getSystemService(AutofillManager::class.java)?.commit();fields.values.forEach{it.text.clear()};dismiss()}else{error.text=tr(message);error.visibility=View.VISIBLE}}
 private fun resize(){window?.setLayout(minOf(activity.resources.displayMetrics.widthPixels-dp(32),dp(460)),minOf(activity.resources.displayMetrics.heightPixels-dp(80),dp(if(register)740 else 470)));window?.setDimAmount(.72f)}
 override fun onStart(){super.onStart();resize()}
}
