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
        AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED -> "text_input"
        AccessibilityEvent.TYPE_VIEW_SCROLLED -> "scroll"
        else -> "observe"
      })
    val label = if (event.eventType == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) null else event.text?.firstOrNull()?.toString()?.take(120)
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
  fun replay(actions: List<Map<String, String>>, values: Map<String, String>, completion: Map<String, String>? = null): Map<String, Int> {
    var executed = 0; var skipped = 0
    for (action in actions) {
      val type = action["action"] ?: ""
      if (type == "text_input") {
        val key = action["resourceId"] ?: action["fieldKey"]
        val value = key?.let { values[it] }
        val root = rootInActiveWindow
        val node = root?.let { findNode(it, action["resourceId"], action["text"]) }
        if (node == null || value == null) { skipped++; continue }
        val bundle = android.os.Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value) }
        if (node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, bundle)) executed++ else skipped++
        node.recycle()
        continue
      }
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
    val verified = completion?.let { findNode(rootInActiveWindow ?: return@let false, it["resourceId"], it["text"]) != null } ?: false
    return mapOf("executed" to executed, "skipped" to skipped, "verified" to if (verified || completion == null) 1 else 0)
  }
  private fun findNode(root: AccessibilityNodeInfo, resourceId: String?, text: String?): AccessibilityNodeInfo? {
    if (!resourceId.isNullOrBlank()) root.findAccessibilityNodeInfosByViewId(resourceId).firstOrNull()?.let { return it }
    if (!text.isNullOrBlank()) root.findAccessibilityNodeInfosByText(text).firstOrNull()?.let { return it }
    // Adaptive fallback: app updates often change resource IDs but preserve visible labels,
    // content descriptions, or the semantic class. Walk the current tree instead of replaying
    // stale coordinates.
    return findSemanticFallback(root, text)
  }
  private fun findSemanticFallback(node: AccessibilityNodeInfo, text: String?): AccessibilityNodeInfo? {
    val wanted = text?.trim()?.lowercase()
    val label = node.text?.toString()?.trim()?.lowercase()
    val description = node.contentDescription?.toString()?.trim()?.lowercase()
    if (!wanted.isNullOrBlank() && (label == wanted || description == wanted)) return node
    for (index in 0 until node.childCount) {
      node.getChild(index)?.let { child ->
        val match = findSemanticFallback(child, text)
        if (match != null) return match
        child.recycle()
      }
    }
    return null
  }
  companion object { var instance: LearningWatcherService? = null; const val PREFS = "learning_watcher"; const val RECORDING = "recording"; const val QUEUE = "queue" }
}
