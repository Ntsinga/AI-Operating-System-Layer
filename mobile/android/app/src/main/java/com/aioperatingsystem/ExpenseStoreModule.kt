package com.aioperatingsystem

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

// Local, on-device persistence for manually-described or scanned expense entries (e.g. from a
// voice command like "I spent 5000 on lunch", handled by the add_expense_entry planner tool),
// mirroring BriefStoreModule.kt's AES/GCM-over-AndroidKeyStore pattern since financial entries
// deserve the same at-rest protection as meeting briefs. Entries are stored pre-serialized as a
// JSON array of JSON-object strings (each element produced by the JS side) - the native side
// only ever does plain string concatenation to append, never parses the JSON itself.
class ExpenseStoreModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val prefs by lazy { context.getSharedPreferences("aios_expense_store", 0) }
  override fun getName(): String = "AiosExpenseStore"

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey("aios_expense_key", null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder("aios_expense_key", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }

  private fun writeBlob(text: String) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
    prefs.edit()
      .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
      .putString("data", Base64.encodeToString(cipher.doFinal(text.toByteArray(StandardCharsets.UTF_8)), Base64.NO_WRAP))
      .apply()
  }

  private fun readBlob(): String {
    val iv = prefs.getString("iv", null) ?: return "[]"
    val data = prefs.getString("data", null) ?: return "[]"
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP))) }
    return String(cipher.doFinal(Base64.decode(data, Base64.NO_WRAP)), StandardCharsets.UTF_8)
  }

  @ReactMethod
  fun addExpenseEntry(entryJson: String, promise: Promise) {
    runCatching {
      val current = readBlob().trim()
      val next = if (current == "[]" || current.isEmpty()) "[$entryJson]" else current.removeSuffix("]") + ",$entryJson]"
      writeBlob(next)
      promise.resolve(true)
    }.onFailure { promise.reject("EXPENSE_STORE_ADD_FAILED", it) }
  }

  @ReactMethod
  fun getExpenseEntries(promise: Promise) {
    runCatching { promise.resolve(readBlob()) }.onFailure { promise.reject("EXPENSE_STORE_READ_FAILED", it) }
  }

  @ReactMethod
  fun clearExpenseEntries(promise: Promise) {
    runCatching {
      prefs.edit().clear().apply()
      promise.resolve(true)
    }.onFailure { promise.reject("EXPENSE_STORE_CLEAR_FAILED", it) }
  }
}
