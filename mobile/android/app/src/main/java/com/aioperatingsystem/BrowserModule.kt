package com.aioperatingsystem

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

private const val REQUEST_CODE_IMAGE_BROWSER = 4801

class BrowserModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {
  private var pendingPromise: Promise? = null
  private var pendingSelectImage = false

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = "AiosImageBrowser"

  @ReactMethod
  fun browseForImage(url: String, promise: Promise) {
    startBrowser(url, true, promise)
  }

  @ReactMethod
  fun openUrlInAiosBrowser(url: String, promise: Promise) {
    startBrowser(url, false, promise)
  }

  private fun startBrowser(url: String, selectImage: Boolean, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("IMAGE_BROWSER_ACTIVITY_UNAVAILABLE", "No foreground activity available.")
      return
    }
    if (pendingPromise != null) {
      promise.reject("IMAGE_BROWSER_ALREADY_OPEN", "An image browser is already open.")
      return
    }
    if (!(url.startsWith("http://") || url.startsWith("https://"))) {
      promise.reject("IMAGE_BROWSER_INVALID_URL", "Image browser requires an HTTP(S) URL.")
      return
    }

    pendingPromise = promise
    pendingSelectImage = selectImage
    activity.startActivityForResult(
      Intent(activity, ImageBrowserActivity::class.java)
        .putExtra(EXTRA_BROWSER_URL, url)
        .putExtra(EXTRA_SELECT_IMAGE, selectImage),
      REQUEST_CODE_IMAGE_BROWSER
    )
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_CODE_IMAGE_BROWSER) return
    val promise = pendingPromise ?: return
    pendingPromise = null
    val selectImage = pendingSelectImage
    pendingSelectImage = false
    if (!selectImage) {
      promise.resolve(Arguments.createMap().apply {
        putString("url", data?.dataString ?: "")
        putBoolean("opened", true)
      })
      return
    }
    if (resultCode != Activity.RESULT_OK) {
      promise.reject("IMAGE_BROWSER_CANCELLED", "Image browsing was cancelled.")
      return
    }
    val imageUrl = data?.getStringExtra(EXTRA_SELECTED_IMAGE_URL)
    if (imageUrl.isNullOrBlank()) {
      promise.reject("IMAGE_BROWSER_MISSING_SELECTION", "No image was selected.")
      return
    }
    promise.resolve(Arguments.createMap().apply {
      putString("imageUrl", imageUrl)
      putString("title", data.getStringExtra(EXTRA_SELECTED_IMAGE_TITLE).orEmpty())
    })
  }

  override fun onNewIntent(intent: Intent) = Unit
}
