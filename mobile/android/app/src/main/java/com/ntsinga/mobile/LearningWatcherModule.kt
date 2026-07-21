package com.ntsinga.mobile

import com.facebook.react.bridge.*
import android.content.Intent
import android.provider.Settings
import org.json.JSONArray

class LearningWatcherModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "LearningWatcher"
  @ReactMethod fun setRecording(enabled: Boolean, promise: Promise) {
    context.getSharedPreferences(LearningWatcherService.PREFS, android.content.Context.MODE_PRIVATE)
      .edit().putBoolean(LearningWatcherService.RECORDING, enabled).apply()
    promise.resolve(null)
  }
  @ReactMethod fun drainActions(promise: Promise) {
    val prefs = context.getSharedPreferences(LearningWatcherService.PREFS, android.content.Context.MODE_PRIVATE)
    val raw = prefs.getString(LearningWatcherService.QUEUE, "[]") ?: "[]"
    prefs.edit().putString(LearningWatcherService.QUEUE, "[]").apply()
    val array = JSONArray(raw); val result = Arguments.createArray()
    for (index in 0 until array.length()) result.pushMap(Arguments.makeNativeMap(array.getJSONObject(index).toMap()))
    promise.resolve(result)
  }
  private fun org.json.JSONObject.toMap(): Map<String, Any> = keys().asSequence().associateWith { get(it) as Any }
}
