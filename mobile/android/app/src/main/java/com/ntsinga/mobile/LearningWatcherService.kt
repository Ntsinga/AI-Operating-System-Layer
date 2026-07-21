package com.ntsinga.mobile

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject

/** Consent-gated semantic recorder. It stores labels/roles only, never screenshots or passwords. */
class LearningWatcherService : AccessibilityService() {
  override fun onServiceConnected() { instance = this }
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
  fun replay(actions: List<Map<String, String>>): Map<String, Int> {
    var executed = 0; var skipped = 0
    for (action in actions) {
      val type = action["action"] ?: ""
      if (type == "text_changed") { skipped++; continue }
      val root = rootInActiveWindow
      val node = root?.let { findNode(it, action["resourceId"], action["text"]) }
      if (node == null) { skipped++; continue }
      val ok = when (type) {
        "tap" -> node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        "scroll" -> node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
        else -> false
      }
      if (ok) executed++ else skipped++
      node.recycle()
    }
    return mapOf("executed" to executed, "skipped" to skipped)
  }
  private fun findNode(root: AccessibilityNodeInfo, resourceId: String?, text: String?): AccessibilityNodeInfo? {
    if (!resourceId.isNullOrBlank()) root.findAccessibilityNodeInfosByViewId(resourceId).firstOrNull()?.let { return it }
    if (!text.isNullOrBlank()) root.findAccessibilityNodeInfosByText(text).firstOrNull()?.let { return it }
    return null
  }
  companion object { var instance: LearningWatcherService? = null; const val PREFS = "learning_watcher"; const val RECORDING = "recording"; const val QUEUE = "queue" }
}
