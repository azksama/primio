package fr.azks.primio

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object PrimioStore {
 @Synchronized private fun key():SecretKey {
  val ks=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
  (ks.getKey("primio-aes",null) as? SecretKey)?.let{return it}
  return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
   init(KeyGenParameterSpec.Builder("primio-aes",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
  }.generateKey()
 }

 @Synchronized fun read(context:Context,name:String):String? {
  val encoded=context.getSharedPreferences("primio-vault",0).getString(name,null)?:return null
  val bytes=Base64.decode(encoded,Base64.NO_WRAP)
  val cipher=Cipher.getInstance("AES/GCM/NoPadding")
  cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(0,12)))
  cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
  return String(cipher.doFinal(bytes.copyOfRange(12,bytes.size)),Charsets.UTF_8)
 }
 @Synchronized fun write(context:Context,name:String,value:String) {
  val cipher=Cipher.getInstance("AES/GCM/NoPadding")
  cipher.init(Cipher.ENCRYPT_MODE,key());cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
  val bytes=cipher.iv+cipher.doFinal(value.toByteArray(Charsets.UTF_8))
  check(context.getSharedPreferences("primio-vault",0).edit().putString(name,Base64.encodeToString(bytes,Base64.NO_WRAP)).commit())
 }
}
