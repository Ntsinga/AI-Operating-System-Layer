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
  @ReactMethod fun replayActions(actions: ReadableArray, values: ReadableMap, completion: ReadableMap?, promise: Promise) {
    val service = LearningWatcherService.instance
    if (service == null) { promise.reject("LEARNING_WATCHER_DISABLED", "Enable AI-OS in Android Accessibility settings first."); return }
    val mapped = mutableListOf<Map<String, String>>()
    for (index in 0 until actions.size()) {
      val item = actions.getMap(index) ?: continue
      val map = mutableMapOf<String, String>()
      for (key in listOf("action", "text", "resourceId")) if (item.hasKey(key) && !item.isNull(key)) map[key] = item.getString(key) ?: ""
      mapped.add(map)
    }
    val runtimeValues = mutableMapOf<String, String>()
    for (key in values.toHashMap().keys) if (!values.isNull(key)) runtimeValues[key] = values.getString(key) ?: ""
    val completionSelector = completion?.toHashMap()?.mapValues { it.value.toString() }
    promise.resolve(Arguments.makeNativeMap(service.replay(mapped, runtimeValues, completionSelector)))
  }
  private fun org.json.JSONObject.toMap(): Map<String, Any> = keys().asSequence().associateWith { get(it) as Any }
}
