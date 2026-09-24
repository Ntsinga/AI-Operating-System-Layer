package com.aioperatingsystem

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

// Small string key-value store for launcher preferences (left-handed layout, default ride app,
// ride pick history). Plain SharedPreferences: nothing sensitive belongs here - anything secret
// goes through an encrypted store like BriefStoreModule instead.
class PrefsModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val prefs by lazy { context.getSharedPreferences("aios_prefs", 0) }

  override fun getName(): String = "AiosPrefs"

  @ReactMethod
  fun getString(key: String, promise: Promise) {
    runCatching { promise.resolve(prefs.getString(key, null)) }
      .onFailure { promise.reject("PREFS_READ_FAILED", it) }
  }

  @ReactMethod
  fun setString(key: String, value: String, promise: Promise) {
    runCatching {
      prefs.edit().putString(key, value).apply()
      promise.resolve(true)
    }.onFailure { promise.reject("PREFS_WRITE_FAILED", it) }
  }
}
