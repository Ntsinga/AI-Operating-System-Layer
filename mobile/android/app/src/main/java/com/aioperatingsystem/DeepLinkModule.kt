package com.aioperatingsystem

import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

// Generic https:// URI opener. All "deep-link navigation" tools (search_youtube,
// open_web_search, navigate_maps, open_play_store_listing) are thin TypeScript
// wrappers that build the right URL and call this single native method - see
// docs/AI_OS_ORCHESTRATOR_PLAN.md's "Advanced Capability Backlog", item 2.
// Deliberately restricted to https:// (not arbitrary schemes like market:// or
// geo:) so it stays covered by the existing BROWSABLE https <queries> entry
// instead of needing a new package-visibility declaration per scheme.
class DeepLinkModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AiosDeepLink"

  @ReactMethod
  fun openUri(uri: String, promise: Promise) {
    try {
      val parsed = Uri.parse(uri)
      if (parsed.scheme != "https") {
        promise.reject("DEEP_LINK_OPEN_URI_INVALID_SCHEME", "Only https:// URIs are supported (got: $uri)")
        return
      }

      val intent = Intent(Intent.ACTION_VIEW, parsed).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)

      val result = Arguments.createMap().apply {
        putString("uri", uri)
        putBoolean("opened", true)
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("DEEP_LINK_OPEN_URI_FAILED", error)
    }
  }
}
