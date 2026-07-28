package com.aioperatingsystem

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
import android.text.InputType
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/** Consent-gated semantic recorder. It stores labels/roles only, never screenshots or passwords. */
class LearningWatcherService : AccessibilityService() {
  override fun onServiceConnected() { instance = this }
  override fun onAccessibilityEvent(event: AccessibilityEvent) {
    try {
      lastSurface = event.packageName?.toString() ?: lastSurface
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
          AccessibilityEvent.TYPE_VIEW_FOCUSED -> "focus"
          AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED -> "text_input"
          AccessibilityEvent.TYPE_VIEW_SCROLLED -> "scroll"
          AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
          AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
          AccessibilityEvent.TYPE_WINDOWS_CHANGED -> "screen_transition"
          else -> "observe"
        })
      val label = if (event.eventType == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) null else event.text?.firstOrNull()?.toString()
      if (!label.isNullOrBlank()) action.put("text", label.take(120))
      event.source?.let { node ->
        node.viewIdResourceName?.take(160)?.let { resourceId ->
          action.put("resourceId", resourceId)
          if (event.eventType == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) {
            rootInActiveWindow?.let { root ->
              resourceOccurrenceIndex(root, node, resourceId)?.let { occurrence ->
                action.put("resourceIdOccurrence", occurrence.toString())
              }
            }
          }
        }
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
        action.put("editable", node.isEditable)
        action.put("scrollable", node.isScrollable)
        action.put("enabled", node.isEnabled)
        action.put("nodeClass", node.className?.toString() ?: "")
        action.put("selectorKind", selectorKind(node))
        action.put("bounds", boundsJson(node))
        node.parent?.let { parent ->
          action.put("parentClass", parent.className?.toString() ?: "")
          action.put("parentSelectorKind", selectorKind(parent))
          val parentLabel = readableLabel(parent)
          if (!parentLabel.isNullOrBlank()) action.put("parentText", parentLabel.take(120))
          parent.recycle()
        }
        node.recycle()
      }
      rootInActiveWindow?.let { root ->
        val snapshot = screenSnapshot(root, surface)
        action.put("screen", snapshot)
        snapshot.optString("title").takeIf { it.isNotBlank() }?.let { action.put("screenTitle", it.take(120)) }
        if (action.optString("action") == "screen_transition" && shouldSkipDuplicateScreen(surface, snapshot)) return
      }
      synchronized(QUEUE_LOCK) {
        val queue = readRecordedQueue(prefs.getString(QUEUE, "[]"))
        syntheticFocusBeforeText(action, queue)?.let { focusAction ->
          queue.put(focusAction)
          Log.i("AIOS.Learning", focusAction.toString())
        }
        queue.put(action)
        prefs.edit().putString(QUEUE, compactQueue(queue)).commit()
      }
      Log.i("AIOS.Learning", action.toString())
    } catch (err: Exception) {
      Log.e("AIOS.Learning", "Failed to record accessibility event safely", err)
    }
  }
  override fun onInterrupt() = Unit
  fun replay(actions: List<Map<String, String>>, values: Map<String, String>, completion: Map<String, String>? = null, requestedSurface: String? = null): Map<String, Any> {
    var executed = 0; var skipped = 0
    var lastTextInputValue: String? = null
    val trace = mutableListOf<Map<String, Any?>>()
    val targetSurface = requestedSurface?.takeIf { it.isNotBlank() }
      ?: actions.firstNotNullOfOrNull { it["surface"]?.takeIf { surface -> surface.isNotBlank() } }
    if (!targetSurface.isNullOrBlank()) {
      val ready = waitForSurface(targetSurface, 9000)
      val payload = mapOf(
        "flow" to "replay",
        "event" to if (ready) "target_surface_ready" else "target_surface_timeout",
        "level" to if (ready) "info" else "warn",
        "details" to mapOf("surface" to targetSurface, "matched" to ready, "visibleTexts" to currentVisibleTexts())
      )
      trace.add(payload)
      Log.i("AIOS.Replay", JSONObject(payload).toString())
      if (!ready) {
        skipped = actions.count { !shouldIgnoreReplayAction(it) }
        val summary = mapOf(
          "flow" to "replay",
          "event" to "replay_aborted",
          "level" to "warn",
          "details" to mapOf("reason" to "target_surface_not_ready", "surface" to targetSurface, "executed" to executed, "skipped" to skipped, "verified" to 0)
        )
        trace.add(summary)
        Log.i("AIOS.Replay", JSONObject(summary).toString())
        return mapOf("executed" to executed, "skipped" to skipped, "verified" to 0, "trace" to trace)
      }
    }
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
      if (shouldIgnoreReplayAction(action)) {
        addTrace("step_ignored", details = mapOf("reason" to "non_actionable_recording_noise", "visibleTexts" to currentVisibleTexts()))
        continue
      }
      if (type == "screen_transition") {
        val ready = waitForScreen(action["screenTitle"] ?: action["text"], 3500)
        if (ready) {
          addTrace("step_verified", details = mapOf("screenTitle" to (action["screenTitle"] ?: action["text"]), "visibleTexts" to currentVisibleTexts()))
        } else {
          addTrace("step_skipped", "warn", mapOf("reason" to "screen_not_observed_after_wait", "screenTitle" to (action["screenTitle"] ?: action["text"]), "visibleTexts" to currentVisibleTexts()))
        }
        continue
      }
      if (type == "text_input") {
        if (hasLaterTextInputForSameTarget(actions, index)) {
          addTrace("step_ignored", details = mapOf("reason" to "superseded_by_later_text_input", "visibleTexts" to currentVisibleTexts()))
          continue
        }
        val screenReady = waitForScreenReady(8000)
        addTrace(
          if (screenReady) "screen_ready_before_text" else "screen_still_loading_before_text",
          if (screenReady) "info" else "warn",
          mapOf("visibleTexts" to currentVisibleTexts())
        )
        val key = action["resourceId"] ?: action["fieldKey"] ?: action["text"] ?: action["contentDescription"]
        val value = key?.let { values[it] } ?: action["value"]
        val occurrence = action["resourceIdOccurrence"]?.toIntOrNull()
        val node = waitForNode(
          action["resourceId"] ?: action["fieldKey"],
          null,
          action["contentDescription"],
          4500,
          resourceIdOccurrence = occurrence,
          preferLastDuplicate = occurrence == null,
        )
        addTrace("step_started", details = mapOf("visibleTexts" to currentVisibleTexts()))
        if (node == null) {
          skipped++
          addTrace("step_skipped", "warn", mapOf("reason" to "selector_not_found_after_wait", "rootSurface" to currentRootSurface(), "visibleTexts" to currentVisibleTexts()))
          continue
        }
        if (value == null) {
          skipped++
          addTrace("step_skipped", "warn", mapOf("reason" to "missing_runtime_or_recorded_value", "visibleTexts" to currentVisibleTexts()))
          node.recycle()
          continue
        }
        performClick(node)
        Thread.sleep(260)
        node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        Thread.sleep(40)
        val ok = typeTextIncrementally(action, value)
        if (ok) {
          val attempted = "set_text_incremental"
          var outcome = waitForTextOutcome(action, value, 5200)
          if (outcome == "cleared_without_results" || outcome == "not_observed") {
            Thread.sleep(450)
            outcome = waitForTextOutcome(action, value, 6500)
          }
          executed++
          lastTextInputValue = value
          addTrace("step_executed", details = mapOf("attempted" to attempted, "fieldKey" to key, "textOutcome" to outcome, "visibleTexts" to currentVisibleTexts()))
        } else {
          skipped++
          addTrace("step_skipped", "warn", mapOf("reason" to "set_text_failed", "fieldKey" to key, "visibleTexts" to currentVisibleTexts()))
        }
        node.recycle()
        continue
      }
      val readyForAction = waitForScreenReady(if (type == "tap") 6500 else 2500)
      if (!readyForAction) {
        addTrace("screen_still_loading_before_action", "warn", mapOf("visibleTexts" to currentVisibleTexts()))
      }
      val queryValueBeforeNodeSearch = lastTextInputValue?.takeIf { query ->
        type == "tap" && !action["text"].isNullOrBlank() && action["text"] == query
      }
      if (queryValueBeforeNodeSearch != null) {
        waitForMatchingLocationSuggestion(queryValueBeforeNodeSearch, 3600)
      }
      val suggestionBeforeNodeSearch = queryValueBeforeNodeSearch?.let { findFirstLocationSuggestion(rootInActiveWindow, it) }
      if (suggestionBeforeNodeSearch != null) {
        addTrace("step_started", details = mapOf("rootSurface" to currentRootSurface(), "visibleTexts" to currentVisibleTexts(), "preferred" to "location_suggestion"))
        val ok = performClick(suggestionBeforeNodeSearch)
        suggestionBeforeNodeSearch.recycle()
        if (ok) {
          val accepted = waitForLocationSuggestionAccepted(queryValueBeforeNodeSearch, 4200)
          if (accepted) {
            executed++
            addTrace("step_executed", details = mapOf("attempted" to "tap_location_suggestion", "query" to queryValueBeforeNodeSearch, "accepted" to true, "visibleTexts" to currentVisibleTexts()))
          } else {
            skipped++
            addTrace("step_skipped", "warn", mapOf("reason" to "location_suggestion_tap_not_accepted", "query" to queryValueBeforeNodeSearch, "visibleTexts" to currentVisibleTexts()))
          }
        } else {
          skipped++
          addTrace("step_skipped", "warn", mapOf("reason" to "location_suggestion_click_failed", "query" to queryValueBeforeNodeSearch, "rootSurface" to currentRootSurface(), "visibleTexts" to currentVisibleTexts()))
        }
        continue
      } else if (queryValueBeforeNodeSearch != null && hasPostTextSearchContext(queryValueBeforeNodeSearch)) {
        skipped++
        addTrace("step_skipped", "warn", mapOf("reason" to "no_matching_post_text_selection_target", "query" to queryValueBeforeNodeSearch, "visibleTexts" to currentVisibleTexts()))
        continue
      }
      val node = waitForNode(action["resourceId"], action["text"], action["contentDescription"], 4500, resourceIdOccurrence = action["resourceIdOccurrence"]?.toIntOrNull(), action = action)
      addTrace("step_started", details = mapOf("rootSurface" to currentRootSurface(), "visibleTexts" to currentVisibleTexts()))
      if (node == null) {
        val queryValue = lastTextInputValue?.takeIf { query ->
          type == "tap" && !action["text"].isNullOrBlank() && action["text"] == query
        }
        val suggestion = queryValue?.let { findFirstLocationSuggestion(rootInActiveWindow, it) }
        if (suggestion != null) {
          val ok = performClick(suggestion)
          suggestion.recycle()
          if (ok) {
            val accepted = waitForLocationSuggestionAccepted(queryValue, 4200)
            if (accepted) {
              executed++
              addTrace("step_executed", details = mapOf("attempted" to "tap_location_suggestion_fallback", "query" to queryValue, "accepted" to true, "visibleTexts" to currentVisibleTexts()))
            } else {
              skipped++
              addTrace("step_skipped", "warn", mapOf("reason" to "location_suggestion_tap_not_accepted", "query" to queryValue, "visibleTexts" to currentVisibleTexts()))
            }
          } else {
            skipped++
            addTrace("step_skipped", "warn", mapOf("reason" to "location_suggestion_fallback_click_failed", "query" to queryValue, "rootSurface" to currentRootSurface(), "visibleTexts" to currentVisibleTexts()))
          }
        } else {
          skipped++
          addTrace("step_skipped", "warn", mapOf("reason" to "selector_not_found_after_wait", "rootSurface" to currentRootSurface(), "visibleTexts" to currentVisibleTexts()))
        }
        continue
      }
      val clickableTargetFound = actionableClickNode(node) != null
      val ok = when (type) {
        "tap" -> performClick(node)
        "focus" -> performFocus(node)
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
    listOf("surface", "resourceId", "resourceIdOccurrence", "text", "contentDescription", "fieldKey", "screenTitle", "selectorKind", "nodeClass", "parentSelectorKind").mapNotNull { key ->
      action[key]?.takeIf { it.isNotBlank() }?.let { key to it }
    }.toMap()

  private fun hasLaterTextInputForSameTarget(actions: List<Map<String, String>>, index: Int): Boolean {
    val current = actions[index]
    for (nextIndex in index + 1 until actions.size) {
      val next = actions[nextIndex]
      val nextType = next["action"] ?: ""
      if (shouldIgnoreReplayAction(next)) continue
      if (nextType != "text_input") return false
      if (sameTextInputTarget(current, next)) return true
      return false
    }
    return false
  }

  private fun sameTextInputTarget(a: Map<String, String>, b: Map<String, String>): Boolean {
    val aResource = a["resourceId"] ?: a["fieldKey"]
    val bResource = b["resourceId"] ?: b["fieldKey"]
    if (!aResource.isNullOrBlank() && aResource == bResource) {
      return (a["resourceIdOccurrence"] ?: "") == (b["resourceIdOccurrence"] ?: "")
    }
    val aDescription = a["contentDescription"] ?: a["text"]
    val bDescription = b["contentDescription"] ?: b["text"]
    return !aDescription.isNullOrBlank() && aDescription == bDescription
  }

  private fun waitForTextOutcome(action: Map<String, String>, value: String, timeoutMs: Long): String {
    val wanted = value.trim()
    if (wanted.isBlank()) return "empty_value"
    val deadline = System.currentTimeMillis() + timeoutMs
    var stableTextSamples = 0
    var sawWantedText = false
    while (System.currentTimeMillis() < deadline) {
      val texts = currentVisibleTexts()
      if (texts.none { isLoadingText(it) } && texts.any { isLikelyLocationSuggestion(it, wanted) }) return "suggestions_ready"
      rootInActiveWindow?.let { root ->
        val node = findNode(
          root,
          action["resourceId"] ?: action["fieldKey"],
          null,
          action["contentDescription"],
          action["resourceIdOccurrence"]?.toIntOrNull(),
          preferLastDuplicate = action["resourceIdOccurrence"].isNullOrBlank(),
        )
        if (node != null) {
          val nodeText = node.text?.toString()?.trim()
          node.recycle()
          if (nodeText == wanted) {
            sawWantedText = true
            stableTextSamples++
            if (stableTextSamples >= 4) return "text_retained"
          } else {
            stableTextSamples = 0
          }
        }
      }
      Thread.sleep(120)
    }
    return if (sawWantedText) "cleared_without_results" else "not_observed"
  }

  private fun typeTextIncrementally(action: Map<String, String>, value: String): Boolean {
    val wanted = value.trim()
    if (wanted.isBlank()) return false
    val occurrence = action["resourceIdOccurrence"]?.toIntOrNull()
    val node = waitForNode(
      action["resourceId"] ?: action["fieldKey"],
      null,
      action["contentDescription"],
      2200,
      resourceIdOccurrence = occurrence,
      preferLastDuplicate = occurrence == null,
    ) ?: return false
    return try {
      node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
      Thread.sleep(40)
      node.performAction(
        AccessibilityNodeInfo.ACTION_SET_TEXT,
        android.os.Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "") }
      )
      Thread.sleep(220)
      val typed = StringBuilder()
      for (char in wanted) {
        typed.append(char)
        val ok = node.performAction(
          AccessibilityNodeInfo.ACTION_SET_TEXT,
          android.os.Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, typed.toString()) }
        )
        if (!ok) return false
        Thread.sleep(260)
      }
      true
    } finally {
      node.recycle()
    }
  }

  private fun waitForLocationSuggestionAccepted(query: String, timeoutMs: Long): Boolean {
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline) {
      val texts = currentVisibleTexts()
      val hasQuerySuggestion = texts.any { isLikelyLocationSuggestion(it, query) }
      val hasSearchPlaceholder = texts.any { it.trim().equals("Type or select location", ignoreCase = true) }
      val hasQueryOnScreen = texts.any { it.lowercase().contains(query.trim().lowercase().take(3)) }
      val hasForwardProgress = texts.any {
        val lower = it.lowercase()
        lower.contains("continue") ||
          lower.contains("confirm") ||
          lower.contains("payment") ||
          lower.contains("cash") ||
          lower.contains("ugx")
      }
      if (!hasQuerySuggestion && (!hasSearchPlaceholder || hasForwardProgress || hasQueryOnScreen)) return true
      Thread.sleep(180)
    }
    return false
  }

  private fun waitForMatchingLocationSuggestion(query: String, timeoutMs: Long): Boolean {
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline) {
      rootInActiveWindow?.let { root ->
        val suggestion = findFirstLocationSuggestion(root, query)
        if (suggestion != null) {
          suggestion.recycle()
          return true
        }
      }
      Thread.sleep(220)
    }
    return false
  }

  private fun findFirstLocationSuggestion(root: AccessibilityNodeInfo?, query: String): AccessibilityNodeInfo? {
    if (root == null) return null
    val candidates = mutableListOf<AccessibilityNodeInfo>()
    collectLocationSuggestionNodes(root, query, candidates)
    return candidates.firstOrNull()
  }

  private fun hasPostTextSearchContext(query: String): Boolean {
    val texts = currentVisibleTexts()
    val queryLower = query.trim().lowercase()
    if (queryLower.isBlank()) return false
    val hasInputValue = texts.any { it.trim().lowercase() == queryLower }
    val hasSeveralVisibleOptions = texts.count { text ->
      val lower = text.lowercase()
      lower != queryLower &&
        lower != "google map" &&
        lower != "map marker" &&
        lower != "pick up" &&
        lower != "where to" &&
        lower != "type or select location" &&
        !lower.contains("loading")
    } >= 2
    return hasInputValue && hasSeveralVisibleOptions
  }

  private fun collectLocationSuggestionNodes(node: AccessibilityNodeInfo, query: String, candidates: MutableList<AccessibilityNodeInfo>) {
    if (candidates.size >= 6) return
    val label = readableLabel(node)
    if (!label.isNullOrBlank() && node.isEnabled && isLikelyLocationSuggestion(label, query)) {
      actionableClickNode(node)?.let { clickable ->
        candidates.add(clickable)
        return
      }
    }
    for (index in 0 until node.childCount) {
      node.getChild(index)?.let { child ->
        collectLocationSuggestionNodes(child, query, candidates)
        child.recycle()
      }
      if (candidates.size >= 6) return
    }
  }

  private fun isLikelyLocationSuggestion(text: String, query: String): Boolean {
    val normalized = text.trim()
    if (normalized.isBlank()) return false
    val lower = normalized.lowercase()
    val queryLower = query.trim().lowercase()
    if (lower == queryLower) return false
    if (lower == "google map" || lower == "map marker" || lower == "pick up" || lower == "where to") return false
    if (lower == "type or select location" || lower.contains("loading")) return false
    if (lower.length < 5) return false
    val queryPrefix = queryLower.take(3)
    return queryPrefix.length >= 3 && lower.contains(queryPrefix)
  }

  private fun shouldIgnoreReplayAction(action: Map<String, String>): Boolean {
    val type = action["action"] ?: ""
    if (type == "observe") return true
    val hasSelector = !action["resourceId"].isNullOrBlank() ||
      !action["text"].isNullOrBlank() ||
      !action["contentDescription"].isNullOrBlank() ||
      !action["fieldKey"].isNullOrBlank()
    return type == "scroll" && !hasSelector
  }

  private fun waitForSurface(surface: String, timeoutMs: Long): Boolean {
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline) {
      val rootSurface = rootInActiveWindow?.packageName?.toString()
      if (rootSurface == surface) return true
      Thread.sleep(150)
    }
    return false
  }

  private fun waitForNode(resourceId: String?, text: String?, contentDescription: String?, timeoutMs: Long, resourceIdOccurrence: Int? = null, preferLastDuplicate: Boolean = false, action: Map<String, String>? = null): AccessibilityNodeInfo? {
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline) {
      rootInActiveWindow?.let { root ->
        findNode(root, resourceId, text, contentDescription, resourceIdOccurrence, preferLastDuplicate, action)?.let { return it }
      }
      Thread.sleep(180)
    }
    return null
  }

  private fun waitForScreen(title: String?, timeoutMs: Long): Boolean {
    if (title.isNullOrBlank()) return true
    val wanted = title.trim().lowercase()
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline) {
      if (currentVisibleTexts().any { it.trim().lowercase() == wanted || it.trim().lowercase().contains(wanted) }) return true
      Thread.sleep(180)
    }
    return false
  }

  private fun waitForScreenReady(timeoutMs: Long): Boolean {
    val deadline = System.currentTimeMillis() + timeoutMs
    var stableReadySamples = 0
    while (System.currentTimeMillis() < deadline) {
      val texts = currentVisibleTexts()
      val ready = texts.isNotEmpty() && texts.none { isLoadingText(it) }
      if (ready) {
        stableReadySamples++
        if (stableReadySamples >= 2) return true
      } else {
        stableReadySamples = 0
      }
      Thread.sleep(220)
    }
    return false
  }

  private fun isLoadingText(text: String): Boolean {
    val normalized = text.trim().lowercase()
    return normalized == "loading" ||
      normalized == "loading..." ||
      normalized == "loading…" ||
      normalized.contains("loading")
  }

  private fun currentRootSurface(): String? = rootInActiveWindow?.packageName?.toString()

  private fun readRecordedQueue(raw: String?): JSONArray {
    if (raw.isNullOrBlank()) return JSONArray()
    return try {
      JSONArray(raw)
    } catch (err: JSONException) {
      Log.w("AIOS.Learning", "Discarding corrupt recorded action queue", err)
      JSONArray()
    }
  }

  private fun syntheticFocusBeforeText(action: JSONObject, queue: JSONArray): JSONObject? {
    if (action.optString("action") != "text_input") return null
    if (hasRecentFocusOrTapForSameTarget(action, queue)) return null
    return JSONObject(action.toString())
      .put("action", "focus")
      .put("synthetic", true)
      .removeTextInputValue()
  }

  private fun JSONObject.removeTextInputValue(): JSONObject {
    remove("value")
    return this
  }

  private fun hasRecentFocusOrTapForSameTarget(action: JSONObject, queue: JSONArray): Boolean {
    for (index in queue.length() - 1 downTo 0) {
      val previous = queue.optJSONObject(index) ?: continue
      val previousAction = previous.optString("action")
      if (previousAction in listOf("screen_transition", "observe", "scroll")) continue
      if (!sameRecordedTarget(previous, action)) return false
      return previousAction == "focus" || previousAction == "tap" || previousAction == "text_input"
    }
    return false
  }

  private fun sameRecordedTarget(a: JSONObject, b: JSONObject): Boolean {
    val aResource = a.optString("resourceId")
    val bResource = b.optString("resourceId")
    if (aResource.isNotBlank() && aResource == bResource) {
      val aOccurrence = a.optString("resourceIdOccurrence")
      val bOccurrence = b.optString("resourceIdOccurrence")
      return aOccurrence.isBlank() || bOccurrence.isBlank() || aOccurrence == bOccurrence
    }
    val aField = a.optString("fieldKey")
    val bField = b.optString("fieldKey")
    if (aField.isNotBlank() && aField == bField) return true
    val aDescription = a.optString("contentDescription").ifBlank { a.optString("text") }
    val bDescription = b.optString("contentDescription").ifBlank { b.optString("text") }
    return aDescription.isNotBlank() && aDescription == bDescription
  }

  private fun compactQueue(queue: JSONArray): String {
    while (queue.length() > MAX_RECORDED_ACTIONS) queue.remove(0)
    var serialized = queue.toString()
    while (serialized.length > MAX_QUEUE_CHARS && queue.length() > 1) {
      queue.remove(removableQueueIndex(queue))
      serialized = queue.toString()
    }
    return if (serialized.length <= MAX_QUEUE_CHARS) serialized else JSONArray().put(queue.getJSONObject(queue.length() - 1)).toString()
  }

  private fun removableQueueIndex(queue: JSONArray): Int {
    for (action in listOf("screen_transition", "observe", "scroll")) {
      for (index in 0 until queue.length()) {
        if (queue.optJSONObject(index)?.optString("action") == action) return index
      }
    }
    return 0
  }

  private fun shouldSkipDuplicateScreen(surface: String, snapshot: JSONObject): Boolean {
    val title = snapshot.optString("title")
    val visibleTexts = snapshot.optJSONArray("visibleTexts")
    val signature = "$surface|$title|${visibleTexts?.toString()?.take(300) ?: ""}"
    val now = System.currentTimeMillis()
    if (signature == lastScreenSignature && now - lastScreenRecordedAt < 1200L) return true
    lastScreenSignature = signature
    lastScreenRecordedAt = now
    return false
  }

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
  private fun findNode(root: AccessibilityNodeInfo, resourceId: String?, text: String?, contentDescription: String?, resourceIdOccurrence: Int? = null, preferLastDuplicate: Boolean = false, action: Map<String, String>? = null): AccessibilityNodeInfo? {
    if (!resourceId.isNullOrBlank()) {
      val candidates = root.findAccessibilityNodeInfosByViewId(resourceId)
      if (resourceIdOccurrence != null && resourceIdOccurrence >= 0 && resourceIdOccurrence < candidates.size) {
        val candidate = candidates[resourceIdOccurrence]
        if (selectorMatches(candidate, text, contentDescription) && selectorShapeMatches(candidate, action)) return candidate
      }
      if (preferLastDuplicate && candidates.size > 1) {
        candidates.asReversed().firstOrNull { selectorMatches(it, text, contentDescription) && selectorShapeMatches(it, action) }?.let { return it }
      }
      if (!text.isNullOrBlank() || !contentDescription.isNullOrBlank()) {
        candidates.firstOrNull { selectorMatches(it, text, contentDescription) && selectorShapeMatches(it, action) }?.let { return it }
      }
      candidates.firstOrNull { selectorShapeMatches(it, action) }?.let { return it }
    }
    if (!text.isNullOrBlank()) root.findAccessibilityNodeInfosByText(text).firstOrNull { selectorMatches(it, text, contentDescription) && selectorShapeMatches(it, action) }?.let { return it }
    // Adaptive fallback: app updates often change resource IDs but preserve visible labels,
    // content descriptions, or the semantic class. Walk the current tree instead of replaying
    // stale coordinates.
    return findSemanticFallback(root, text, contentDescription, action)
  }
  private fun resourceOccurrenceIndex(root: AccessibilityNodeInfo, target: AccessibilityNodeInfo, resourceId: String): Int? {
    val candidates = root.findAccessibilityNodeInfosByViewId(resourceId)
    if (candidates.size <= 1) return null
    for ((index, candidate) in candidates.withIndex()) {
      if (sameNode(candidate, target)) return index
    }
    return null
  }
  private fun sameNode(a: AccessibilityNodeInfo, b: AccessibilityNodeInfo): Boolean {
    val aBounds = Rect()
    val bBounds = Rect()
    a.getBoundsInScreen(aBounds)
    b.getBoundsInScreen(bBounds)
    return aBounds == bBounds &&
      a.className?.toString() == b.className?.toString() &&
      a.viewIdResourceName == b.viewIdResourceName
  }
  private fun findSemanticFallback(node: AccessibilityNodeInfo, text: String?, contentDescription: String?, action: Map<String, String>? = null): AccessibilityNodeInfo? {
    val wanted = text?.trim()?.lowercase()
    val wantedDescription = contentDescription?.trim()?.lowercase()
    val label = node.text?.toString()?.trim()?.lowercase()
    val description = node.contentDescription?.toString()?.trim()?.lowercase()
    if (!wanted.isNullOrBlank() && (label == wanted || description == wanted) && selectorShapeMatches(node, action)) return node
    if (!wantedDescription.isNullOrBlank() && description == wantedDescription && selectorShapeMatches(node, action)) return node
    for (index in 0 until node.childCount) {
      node.getChild(index)?.let { child ->
        val match = findSemanticFallback(child, text, contentDescription, action)
        if (match != null) return match
        child.recycle()
      }
    }
    return null
  }
  private fun selectorMatches(node: AccessibilityNodeInfo, text: String?, contentDescription: String?): Boolean {
    val wanted = text?.trim()?.lowercase()
    val wantedDescription = contentDescription?.trim()?.lowercase()
    val label = readableLabel(node)?.trim()?.lowercase()
    val description = node.contentDescription?.toString()?.trim()?.lowercase()
    val textMatches = wanted.isNullOrBlank() || label == wanted || description == wanted
    val descriptionMatches = wantedDescription.isNullOrBlank() || description == wantedDescription || label == wantedDescription
    return textMatches && descriptionMatches
  }
  private fun selectorShapeMatches(node: AccessibilityNodeInfo, action: Map<String, String>?): Boolean {
    if (action == null) return true
    val expectedKind = action["selectorKind"]?.takeIf { it.isNotBlank() }
    if (!expectedKind.isNullOrBlank() && selectorKind(node) != expectedKind) return false
    val expectedEditable = action["editable"]?.toBooleanStrictOrNull()
    if (expectedEditable != null && node.isEditable != expectedEditable) return false
    val expectedClass = action["nodeClass"]?.takeIf { it.isNotBlank() }
    if (!expectedClass.isNullOrBlank() && node.className?.toString() != expectedClass) {
      val relaxedKind = expectedKind == "clickable_result" || expectedKind == "clickable_control"
      if (!relaxedKind) return false
    }
    return true
  }
  private fun performClick(node: AccessibilityNodeInfo): Boolean {
    actionableClickNode(node)?.let { target ->
      val ok = target.performAction(AccessibilityNodeInfo.ACTION_CLICK)
      if (target != node) target.recycle()
      return ok
    }
    return false
  }
  private fun performFocus(node: AccessibilityNodeInfo): Boolean {
    val clickOk = if (node.isClickable || actionableClickNode(node) != null) performClick(node) else false
    Thread.sleep(180)
    val focusOk = node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
    return clickOk || focusOk
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
  private fun selectorKind(node: AccessibilityNodeInfo): String {
    val className = node.className?.toString()?.lowercase() ?: ""
    return when {
      node.isEditable -> "editable_field"
      node.isScrollable -> "scroll_container"
      node.isClickable && (className.contains("card") || className.contains("recyclerview") || className.contains("linearlayout") || className.contains("framelayout")) -> "clickable_result"
      node.isClickable -> "clickable_control"
      else -> "static_text"
    }
  }
  private fun boundsJson(node: AccessibilityNodeInfo): JSONObject {
    val rect = Rect()
    node.getBoundsInScreen(rect)
    return JSONObject()
      .put("left", rect.left)
      .put("top", rect.top)
      .put("right", rect.right)
      .put("bottom", rect.bottom)
      .put("width", rect.width())
      .put("height", rect.height())
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
    if (!label.isNullOrBlank() && visibleTexts.length() < MAX_SCREEN_VISIBLE_TEXTS && !containsString(visibleTexts, label)) {
      visibleTexts.put(label.take(MAX_TEXT_CHARS))
    }
    if ((node.isClickable || node.isEditable || node.isScrollable) && interactiveElements.length() < MAX_SCREEN_ELEMENTS) {
      val element = JSONObject()
        .put("role", node.className?.toString() ?: "")
        .put("clickable", node.isClickable)
        .put("editable", node.isEditable)
        .put("scrollable", node.isScrollable)
        .put("enabled", node.isEnabled)
        .put("selectorKind", selectorKind(node))
        .put("bounds", boundsJson(node))
      node.viewIdResourceName?.take(MAX_ID_CHARS)?.let { element.put("resourceId", it) }
      if (!label.isNullOrBlank()) element.put("text", label.take(MAX_TEXT_CHARS))
      node.contentDescription?.toString()?.take(MAX_TEXT_CHARS)?.let { element.put("contentDescription", it) }
      interactiveElements.put(element)
    }
    for (index in 0 until node.childCount) {
      node.getChild(index)?.let { child ->
        collectScreenSemantics(child, visibleTexts, interactiveElements)
        child.recycle()
      }
      if (visibleTexts.length() >= MAX_SCREEN_VISIBLE_TEXTS && interactiveElements.length() >= MAX_SCREEN_ELEMENTS) return
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
    @Volatile private var lastSurface: String = ""
    const val PREFS = "learning_watcher"
    const val RECORDING = "recording"
    const val QUEUE = "queue"
    const val TARGET_SURFACE = "target_surface"
    private const val MAX_QUEUE_CHARS = 400000
    private const val MAX_RECORDED_ACTIONS = 240
    private const val MAX_SCREEN_VISIBLE_TEXTS = 16
    private const val MAX_SCREEN_ELEMENTS = 14
    private const val MAX_TEXT_CHARS = 90
    private const val MAX_ID_CHARS = 140
    val QUEUE_LOCK = Any()
    @Volatile private var lastScreenSignature: String = ""
    @Volatile private var lastScreenRecordedAt: Long = 0L
  }
}
