package com.aioperatingsystem

import com.facebook.react.bridge.*
import android.content.Intent
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

class LearningWatcherModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "LearningWatcher"
  companion object {
    @Volatile private var replayInProgress = false
    @Volatile private var lastReplayStartedAt = 0L
    @Volatile private var lastReplayTarget = ""
    private const val REPLAY_COOLDOWN_MS = 5000L
  }
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
    val raw = synchronized(LearningWatcherService.QUEUE_LOCK) {
      val current = prefs.getString(LearningWatcherService.QUEUE, "[]") ?: "[]"
      prefs.edit().putString(LearningWatcherService.QUEUE, "[]").commit()
      current
    }
    val array = try {
      JSONArray(raw)
    } catch (err: JSONException) {
      JSONArray()
    }
    val counts = mutableMapOf<String, Int>()
    for (index in 0 until array.length()) {
      val type = array.optJSONObject(index)?.optString("action")?.takeIf { it.isNotBlank() } ?: "unknown"
      counts[type] = (counts[type] ?: 0) + 1
    }
    android.util.Log.i("AIOS.Learning", JSONObject(mapOf("event" to "queue_drained", "count" to array.length(), "counts" to counts)).toString())
    val result = Arguments.createArray()
    for (index in 0 until array.length()) result.pushMap(Arguments.makeNativeMap(array.getJSONObject(index).toMap()))
    promise.resolve(result)
  }
  @ReactMethod fun peekActions(promise: Promise) {
    val prefs = context.getSharedPreferences(LearningWatcherService.PREFS, android.content.Context.MODE_PRIVATE)
    val raw = synchronized(LearningWatcherService.QUEUE_LOCK) {
      prefs.getString(LearningWatcherService.QUEUE, "[]") ?: "[]"
    }
    val array = try {
      JSONArray(raw)
    } catch (err: JSONException) {
      JSONArray()
    }
    val counts = mutableMapOf<String, Int>()
    for (index in 0 until array.length()) {
      val type = array.optJSONObject(index)?.optString("action")?.takeIf { it.isNotBlank() } ?: "unknown"
      counts[type] = (counts[type] ?: 0) + 1
    }
    android.util.Log.i("AIOS.Learning", JSONObject(mapOf("event" to "queue_peeked", "count" to array.length(), "counts" to counts)).toString())
    val result = Arguments.createArray()
    for (index in 0 until array.length()) result.pushMap(Arguments.makeNativeMap(array.getJSONObject(index).toMap()))
    promise.resolve(result)
  }
  @ReactMethod fun clearActions(promise: Promise) {
    val prefs = context.getSharedPreferences(LearningWatcherService.PREFS, android.content.Context.MODE_PRIVATE)
    synchronized(LearningWatcherService.QUEUE_LOCK) {
      prefs.edit().putString(LearningWatcherService.QUEUE, "[]").commit()
    }
    android.util.Log.i("AIOS.Learning", JSONObject(mapOf("event" to "queue_cleared")).toString())
    promise.resolve(null)
  }
  @ReactMethod fun replayActions(actions: ReadableArray, values: ReadableMap, completion: ReadableMap?, targetSurface: String?, promise: Promise) {
    val service = LearningWatcherService.instance
    if (service == null) { promise.reject("LEARNING_WATCHER_DISABLED", "Enable AI-OS in Android Accessibility settings first."); return }
    val mapped = mutableListOf<Map<String, String>>()
    for (index in 0 until actions.size()) {
      val item = actions.getMap(index) ?: continue
      val map = mutableMapOf<String, String>()
      for (key in listOf(
        "action",
        "surface",
        "role",
        "text",
        "resourceId",
        "resourceIdOccurrence",
        "contentDescription",
        "fieldKey",
        "value",
        "screenTitle",
        "selectorKind",
        "editable",
        "clickable",
        "scrollable",
        "enabled",
        "nodeClass",
        "parentClass",
        "parentSelectorKind",
        "parentText",
      )) {
        if (item.hasKey(key) && !item.isNull(key)) map[key] = dynamicToString(item.getDynamic(key))
      }
      mapped.add(map)
    }
    val runtimeValues = mutableMapOf<String, String>()
    for (key in values.toHashMap().keys) if (!values.isNull(key)) runtimeValues[key] = values.getString(key) ?: ""
    val completionSelector = completion?.toHashMap()?.mapValues { it.value.toString() }
    val packageToOpen = (targetSurface ?: mapped.firstOrNull { !(it["surface"].isNullOrBlank()) }?.get("surface") ?: "").take(200)
    val now = System.currentTimeMillis()
    if (replayInProgress) {
      promise.reject("LEARNING_REPLAY_BUSY", "A learned procedure replay is already running.")
      return
    }
    if (packageToOpen.isNotBlank() && packageToOpen == lastReplayTarget && now - lastReplayStartedAt < REPLAY_COOLDOWN_MS) {
      promise.reject("LEARNING_REPLAY_COOLDOWN", "Ignoring duplicate replay request for $packageToOpen.")
      return
    }
    replayInProgress = true
    lastReplayStartedAt = now
    lastReplayTarget = packageToOpen
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
        replayInProgress = false
        promise.reject("LEARNING_REPLAY_TARGET_OPEN_FAILED", error)
        return
      }
    }
    try {
      promise.resolve(Arguments.makeNativeMap(service.replay(mapped, runtimeValues, completionSelector, packageToOpen)))
    } finally {
      replayInProgress = false
    }
  }
  private fun JSONObject.toMap(): Map<String, Any?> = keys().asSequence().associateWith { key -> get(key).toReactValue() }
  private fun JSONArray.toList(): List<Any?> = (0 until length()).map { index -> get(index).toReactValue() }
  private fun Any.toReactValue(): Any? = when (this) {
    is JSONObject -> toMap()
    is JSONArray -> toList()
    JSONObject.NULL -> null
    else -> this
  }
  private fun dynamicToString(dynamic: Dynamic): String = when (dynamic.type) {
    ReadableType.Boolean -> dynamic.asBoolean().toString()
    ReadableType.Number -> dynamic.asDouble().toString()
    ReadableType.String -> dynamic.asString() ?: ""
    else -> ""
  }
}
