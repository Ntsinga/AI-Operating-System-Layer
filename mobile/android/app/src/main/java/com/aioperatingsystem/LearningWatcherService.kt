package com.aioperatingsystem

import android.accessibilityservice.AccessibilityService
import android.text.InputType
import android.util.Log
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
    val surface = event.packageName?.toString() ?: ""
    val targetSurface = prefs.getString(TARGET_SURFACE, "") ?: ""
    if (targetSurface.isNotBlank() && surface != targetSurface) return
    if (targetSurface.isBlank() && (surface == packageName || surface == "com.android.settings")) return
    val action = JSONObject()
      .put("schemaVersion", 2)
      .put("surface", surface)
      .put("role", event.className?.toString() ?: "")
      .put("action", when (event.eventType) {
        AccessibilityEvent.TYPE_VIEW_CLICKED -> "tap"
        AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED -> "text_input"
        AccessibilityEvent.TYPE_VIEW_SCROLLED -> "scroll"
        else -> "observe"
      })
    val label = if (event.eventType == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) null else event.text?.firstOrNull()?.toString()
    if (!label.isNullOrBlank()) action.put("text", label.take(120))
    event.source?.let { node ->
      node.viewIdResourceName?.take(160)?.let { action.put("resourceId", it) }
      val nodeLabel = readableLabel(node)
      if (!nodeLabel.isNullOrBlank() && !action.has("text")) action.put("text", nodeLabel.take(120))
      node.contentDescription?.toString()?.take(120)?.let { action.put("contentDescription", it) }
      if (event.eventType == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED && !isSensitiveTextNode(node)) {
        val currentValue = node.text?.toString()?.trim()
          ?: event.text?.lastOrNull()?.toString()?.trim()
        if (!currentValue.isNullOrBlank()) action.put("value", currentValue.take(160))
      }
      val fieldKey = node.viewIdResourceName ?: node.contentDescription?.toString() ?: nodeLabel
      if (!fieldKey.isNullOrBlank()) action.put("fieldKey", fieldKey.take(160))
      action.put("clickable", node.isClickable)
      action.put("enabled", node.isEnabled)
      node.recycle()
    }
    rootInActiveWindow?.let { root ->
      action.put("screen", screenSnapshot(root, surface))
    }
    val queue = JSONArray(prefs.getString(QUEUE, "[]"))
    queue.put(action)
    prefs.edit().putString(QUEUE, queue.toString().take(50000)).apply()
    Log.i("AIOS.Learning", action.toString())
  }
  override fun onInterrupt() = Unit
  fun replay(actions: List<Map<String, String>>, values: Map<String, String>, completion: Map<String, String>? = null): Map<String, Any> {
    var executed = 0; var skipped = 0
    val trace = mutableListOf<Map<String, Any?>>()
    for ((index, action) in actions.withIndex()) {
      val step = index + 1
      val type = action["action"] ?: ""
      val selector = selectorDetails(action)
      fun addTrace(event: String, level: String = "info", details: Map<String, Any?> = emptyMap()) {
        val payload = mapOf(
          "flow" to "replay",
          "event" to event,
          "level" to level,
          "step" to step,
          "details" to (mapOf("action" to type, "selector" to selector) + details)
        )
        trace.add(payload)
        Log.i("AIOS.Replay", JSONObject(payload).toString())
      }
      addTrace("step_started", details = mapOf("visibleTexts" to currentVisibleTexts()))
      if (type == "text_input") {
        val key = action["resourceId"] ?: action["fieldKey"] ?: action["text"] ?: action["contentDescription"]
        val value = key?.let { values[it] } ?: action["value"]
        val root = rootInActiveWindow
        val node = root?.let { findNode(it, action["resourceId"], action["text"], action["contentDescription"]) }
        if (node == null) {
          skipped++
          addTrace("step_skipped", "warn", mapOf("reason" to "selector_not_found", "visibleTexts" to currentVisibleTexts()))
          continue
        }
        if (value == null) {
          skipped++
          addTrace("step_skipped", "warn", mapOf("reason" to "missing_runtime_or_recorded_value", "visibleTexts" to currentVisibleTexts()))
          node.recycle()
          continue
        }
        val bundle = android.os.Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value) }
        val ok = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, bundle)
        if (ok) {
          executed++
          addTrace("step_executed", details = mapOf("attempted" to "set_text", "fieldKey" to key))
        } else {
          skipped++
          addTrace("step_skipped", "warn", mapOf("reason" to "set_text_failed", "fieldKey" to key, "visibleTexts" to currentVisibleTexts()))
        }
        node.recycle()
        continue
      }
      val root = rootInActiveWindow
      val node = root?.let { findNode(it, action["resourceId"], action["text"], action["contentDescription"]) }
      if (node == null) {
        skipped++
        addTrace("step_skipped", "warn", mapOf("reason" to "selector_not_found", "visibleTexts" to currentVisibleTexts()))
        continue
      }
      val clickableTargetFound = actionableClickNode(node) != null
      val ok = when (type) {
        "tap" -> performClick(node)
        "scroll" -> performScroll(node)
        else -> false
      }
      if (ok) {
        executed++
        addTrace("step_executed", details = mapOf("attempted" to type, "clickableTargetFound" to clickableTargetFound))
      } else {
        skipped++
        addTrace("step_skipped", "warn", mapOf("reason" to "action_failed_or_unsupported", "attempted" to type, "clickableTargetFound" to clickableTargetFound, "visibleTexts" to currentVisibleTexts()))
      }
      node.recycle()
    }
    val verified = completion?.let { findNode(rootInActiveWindow ?: return@let false, it["resourceId"], it["text"], it["contentDescription"]) != null } ?: false
    val verifiedInt = if (verified || completion == null) 1 else 0
    val summary = mapOf(
      "flow" to "replay",
      "event" to "replay_completed",
      "level" to if (skipped > 0 || verifiedInt == 0) "warn" else "info",
      "details" to mapOf("executed" to executed, "skipped" to skipped, "verified" to verifiedInt, "completion" to completion)
    )
    trace.add(summary)
    Log.i("AIOS.Replay", JSONObject(summary).toString())
    return mapOf("executed" to executed, "skipped" to skipped, "verified" to verifiedInt, "trace" to trace)
  }
  private fun selectorDetails(action: Map<String, String>): Map<String, String> =
    listOf("resourceId", "text", "contentDescription", "fieldKey").mapNotNull { key ->
      action[key]?.takeIf { it.isNotBlank() }?.let { key to it }
    }.toMap()

  private fun currentVisibleTexts(): List<String> {
    val root = rootInActiveWindow ?: return emptyList()
    val texts = mutableListOf<String>()
    collectVisibleTexts(root, texts)
    return texts
  }

  private fun collectVisibleTexts(node: AccessibilityNodeInfo, texts: MutableList<String>) {
    val label = if (isSensitiveTextNode(node)) null else readableLabel(node)
    if (!label.isNullOrBlank() && texts.size < 25 && !texts.contains(label.take(120))) texts.add(label.take(120))
    for (index in 0 until node.childCount) {
      if (texts.size >= 25) return
      node.getChild(index)?.let { child ->
        collectVisibleTexts(child, texts)
        child.recycle()
      }
    }
  }
  private fun findNode(root: AccessibilityNodeInfo, resourceId: String?, text: String?, contentDescription: String?): AccessibilityNodeInfo? {
    if (!resourceId.isNullOrBlank()) root.findAccessibilityNodeInfosByViewId(resourceId).firstOrNull()?.let { return it }
    if (!text.isNullOrBlank()) root.findAccessibilityNodeInfosByText(text).firstOrNull()?.let { return it }
    // Adaptive fallback: app updates often change resource IDs but preserve visible labels,
    // content descriptions, or the semantic class. Walk the current tree instead of replaying
    // stale coordinates.
    return findSemanticFallback(root, text, contentDescription)
  }
  private fun findSemanticFallback(node: AccessibilityNodeInfo, text: String?, contentDescription: String?): AccessibilityNodeInfo? {
    val wanted = text?.trim()?.lowercase()
    val wantedDescription = contentDescription?.trim()?.lowercase()
    val label = node.text?.toString()?.trim()?.lowercase()
    val description = node.contentDescription?.toString()?.trim()?.lowercase()
    if (!wanted.isNullOrBlank() && (label == wanted || description == wanted)) return node
    if (!wantedDescription.isNullOrBlank() && description == wantedDescription) return node
    for (index in 0 until node.childCount) {
      node.getChild(index)?.let { child ->
        val match = findSemanticFallback(child, text, contentDescription)
        if (match != null) return match
        child.recycle()
      }
    }
    return null
  }
  private fun performClick(node: AccessibilityNodeInfo): Boolean {
    actionableClickNode(node)?.let { target ->
      val ok = target.performAction(AccessibilityNodeInfo.ACTION_CLICK)
      if (target != node) target.recycle()
      return ok
    }
    return false
  }
  private fun performScroll(node: AccessibilityNodeInfo): Boolean {
    actionableScrollNode(node)?.let { target ->
      val ok = target.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
      if (target != node) target.recycle()
      return ok
    }
    return false
  }
  private fun actionableClickNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
    if (node.isClickable && node.isEnabled) return node
    var parent = node.parent
    while (parent != null) {
      if (parent.isClickable && parent.isEnabled) return parent
      val next = parent.parent
      parent.recycle()
      parent = next
    }
    return findFirstActionable(node) { it.isClickable && it.isEnabled }
  }
  private fun actionableScrollNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
    if (node.isScrollable && node.isEnabled) return node
    var parent = node.parent
    while (parent != null) {
      if (parent.isScrollable && parent.isEnabled) return parent
      val next = parent.parent
      parent.recycle()
      parent = next
    }
    return findFirstActionable(node) { it.isScrollable && it.isEnabled }
  }
  private fun findFirstActionable(node: AccessibilityNodeInfo, predicate: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo? {
    if (predicate(node)) return node
    for (index in 0 until node.childCount) {
      node.getChild(index)?.let { child ->
        if (predicate(child)) return child
        val match = findFirstActionable(child, predicate)
        child.recycle()
        if (match != null) return match
      }
    }
    return null
  }
  private fun readableLabel(node: AccessibilityNodeInfo): String? {
    node.text?.toString()?.trim()?.takeIf { it.isNotBlank() }?.let { return it }
    node.contentDescription?.toString()?.trim()?.takeIf { it.isNotBlank() }?.let { return it }
    for (index in 0 until node.childCount) {
      node.getChild(index)?.let { child ->
        val label = readableLabel(child)
        child.recycle()
        if (!label.isNullOrBlank()) return label
      }
    }
    return null
  }
  private fun screenSnapshot(root: AccessibilityNodeInfo, surface: String): JSONObject {
    val visibleTexts = JSONArray()
    val interactiveElements = JSONArray()
    collectScreenSemantics(root, visibleTexts, interactiveElements)
    return JSONObject()
      .put("surface", surface)
      .put("role", root.className?.toString() ?: "")
      .put("title", if (visibleTexts.length() > 0) visibleTexts.optString(0) else "")
      .put("visibleTexts", visibleTexts)
      .put("interactiveElements", interactiveElements)
  }
  private fun collectScreenSemantics(node: AccessibilityNodeInfo, visibleTexts: JSONArray, interactiveElements: JSONArray) {
    val label = if (isSensitiveTextNode(node)) null else readableLabel(node)
    if (!label.isNullOrBlank() && visibleTexts.length() < 25 && !containsString(visibleTexts, label)) {
      visibleTexts.put(label.take(120))
    }
    if ((node.isClickable || node.isEditable || node.isScrollable) && interactiveElements.length() < 30) {
      val element = JSONObject()
        .put("role", node.className?.toString() ?: "")
        .put("clickable", node.isClickable)
        .put("editable", node.isEditable)
        .put("scrollable", node.isScrollable)
        .put("enabled", node.isEnabled)
      node.viewIdResourceName?.take(160)?.let { element.put("resourceId", it) }
      if (!label.isNullOrBlank()) element.put("text", label.take(120))
      node.contentDescription?.toString()?.take(120)?.let { element.put("contentDescription", it) }
      interactiveElements.put(element)
    }
    for (index in 0 until node.childCount) {
      node.getChild(index)?.let { child ->
        collectScreenSemantics(child, visibleTexts, interactiveElements)
        child.recycle()
      }
      if (visibleTexts.length() >= 25 && interactiveElements.length() >= 30) return
    }
  }
  private fun containsString(array: JSONArray, value: String): Boolean {
    for (index in 0 until array.length()) if (array.optString(index) == value) return true
    return false
  }
  private fun isSensitiveTextNode(node: AccessibilityNodeInfo): Boolean {
    if (node.isPassword) return true
    val inputType = node.inputType
    val variation = inputType and InputType.TYPE_MASK_VARIATION
    return variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
      variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
      variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
      variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD
  }
  companion object {
    var instance: LearningWatcherService? = null
    const val PREFS = "learning_watcher"
    const val RECORDING = "recording"
    const val QUEUE = "queue"
    const val TARGET_SURFACE = "target_surface"
  }
}
