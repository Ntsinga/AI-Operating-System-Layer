package com.aioperatingsystem

import com.facebook.react.bridge.*
import android.content.Intent
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject

class LearningWatcherModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "LearningWatcher"
  @ReactMethod fun setRecording(enabled: Boolean, targetSurface: String?, promise: Promise) {
    if (enabled && LearningWatcherService.instance == null) {
      promise.reject("LEARNING_WATCHER_DISABLED", "Enable AI-OS learning watcher in Android Accessibility settings first.")
      return
    }
    val editor = context.getSharedPreferences(LearningWatcherService.PREFS, android.content.Context.MODE_PRIVATE)
      .edit()
      .putBoolean(LearningWatcherService.RECORDING, enabled)
      .putString(LearningWatcherService.TARGET_SURFACE, (targetSurface ?: "").take(200))
    if (enabled) editor.putString(LearningWatcherService.QUEUE, "[]")
    editor.apply()
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
  @ReactMethod fun replayActions(actions: ReadableArray, values: ReadableMap, completion: ReadableMap?, targetSurface: String?, promise: Promise) {
    val service = LearningWatcherService.instance
    if (service == null) { promise.reject("LEARNING_WATCHER_DISABLED", "Enable AI-OS in Android Accessibility settings first."); return }
    val mapped = mutableListOf<Map<String, String>>()
    for (index in 0 until actions.size()) {
      val item = actions.getMap(index) ?: continue
      val map = mutableMapOf<String, String>()
      for (key in listOf("action", "surface", "role", "text", "resourceId", "contentDescription", "fieldKey", "value")) if (item.hasKey(key) && !item.isNull(key)) map[key] = item.getString(key) ?: ""
      mapped.add(map)
    }
    val runtimeValues = mutableMapOf<String, String>()
    for (key in values.toHashMap().keys) if (!values.isNull(key)) runtimeValues[key] = values.getString(key) ?: ""
    val completionSelector = completion?.toHashMap()?.mapValues { it.value.toString() }
    val packageToOpen = (targetSurface ?: mapped.firstOrNull { !(it["surface"].isNullOrBlank()) }?.get("surface") ?: "").take(200)
    if (packageToOpen.isNotBlank() && packageToOpen != context.packageName) {
      try {
        val launchIntent = context.packageManager.getLaunchIntentForPackage(packageToOpen)
        if (launchIntent == null) {
          promise.reject("LEARNING_REPLAY_TARGET_NOT_LAUNCHABLE", "No launchable activity found for package: $packageToOpen")
          return
        }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        context.startActivity(launchIntent)
      } catch (error: Exception) {
        promise.reject("LEARNING_REPLAY_TARGET_OPEN_FAILED", error)
        return
      }
    }
    promise.resolve(Arguments.makeNativeMap(service.replay(mapped, runtimeValues, completionSelector, packageToOpen)))
  }
  private fun JSONObject.toMap(): Map<String, Any?> = keys().asSequence().associateWith { key -> get(key).toReactValue() }
  private fun JSONArray.toList(): List<Any?> = (0 until length()).map { index -> get(index).toReactValue() }
  private fun Any.toReactValue(): Any? = when (this) {
    is JSONObject -> toMap()
    is JSONArray -> toList()
    JSONObject.NULL -> null
    else -> this
  }
}
