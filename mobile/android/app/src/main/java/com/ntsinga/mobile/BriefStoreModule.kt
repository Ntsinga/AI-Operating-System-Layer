package com.ntsinga.mobile

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class BriefStoreModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val prefs by lazy { context.getSharedPreferences("aios_brief_store", 0) }
  override fun getName(): String = "AiosBriefStore"
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey("aios_brief_key", null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder("aios_brief_key", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  @ReactMethod fun saveBrief(text: String, promise: Promise) = runCatching {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
    prefs.edit().putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP)).putString("data", Base64.encodeToString(cipher.doFinal(text.toByteArray(StandardCharsets.UTF_8)), Base64.NO_WRAP)).apply()
    OverlayService.updateBrief(context, text)
    promise.resolve(true)
  }.onFailure { promise.reject("BRIEF_SAVE_FAILED", it) }
  @ReactMethod fun getBrief(promise: Promise) = runCatching {
    val iv = prefs.getString("iv", null) ?: return@runCatching promise.resolve(null)
    val data = prefs.getString("data", null) ?: return@runCatching promise.resolve(null)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP))) }
    promise.resolve(String(cipher.doFinal(Base64.decode(data, Base64.NO_WRAP)), StandardCharsets.UTF_8))
  }.onFailure { promise.reject("BRIEF_READ_FAILED", it) }
}
