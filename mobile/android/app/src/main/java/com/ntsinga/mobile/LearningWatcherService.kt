package com.ntsinga.mobile

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import org.json.JSONArray
import org.json.JSONObject

/** Consent-gated semantic recorder. It stores labels/roles only, never screenshots or passwords. */
class LearningWatcherService : AccessibilityService() {
  override fun onAccessibilityEvent(event: AccessibilityEvent) {
    val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    if (!prefs.getBoolean(RECORDING, false)) return
    val action = JSONObject()
      .put("surface", event.packageName?.toString() ?: "")
      .put("role", event.className?.toString() ?: "")
      .put("action", when (event.eventType) {
        AccessibilityEvent.TYPE_VIEW_CLICKED -> "tap"
        AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED -> "text_changed"
        AccessibilityEvent.TYPE_VIEW_SCROLLED -> "scroll"
        else -> "observe"
      })
    val label = event.text?.firstOrNull()?.toString()?.take(120)
    if (!label.isNullOrBlank()) action.put("text", label)
    event.source?.let { node ->
      node.viewIdResourceName?.take(160)?.let { action.put("resourceId", it) }
      node.recycle()
    }
    val queue = JSONArray(prefs.getString(QUEUE, "[]"))
    queue.put(action)
    prefs.edit().putString(QUEUE, queue.toString().take(50000)).apply()
  }
  override fun onInterrupt() = Unit
  companion object { const val PREFS = "learning_watcher"; const val RECORDING = "recording"; const val QUEUE = "queue" }
}
