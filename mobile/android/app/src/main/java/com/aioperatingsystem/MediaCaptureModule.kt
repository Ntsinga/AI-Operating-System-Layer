package com.aioperatingsystem

import android.Manifest
import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

private const val REQUEST_CODE_IMAGE_CAPTURE = 4201
private const val REQUEST_CODE_VIDEO_CAPTURE = 4202

// Both takePhoto and recordVideo launch InAppCaptureActivity (a real in-app CameraX camera,
// not an Intent to the stock Camera app - see InAppCaptureActivity.kt for why). takePhoto
// counts down 3 seconds then auto-fires; recordVideo starts recording immediately and stops
// on a visible on-screen Stop tap or a 60s safety cap.
class MediaCaptureModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private var pendingPromise: Promise? = null
  private var pendingRequestCode: Int? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = "AiosMediaCapture"

  @ReactMethod
  fun takePhoto(promise: Promise) {
    PermissionHelper.requestPermission(reactContext, Manifest.permission.CAMERA, promise) {
      startCapture(CAPTURE_MODE_PHOTO, REQUEST_CODE_IMAGE_CAPTURE, promise)
    }
  }

  @ReactMethod
  fun recordVideo(promise: Promise) {
    PermissionHelper.requestPermission(reactContext, Manifest.permission.CAMERA, promise) {
      PermissionHelper.requestPermission(reactContext, Manifest.permission.RECORD_AUDIO, promise) {
        startCapture(CAPTURE_MODE_VIDEO, REQUEST_CODE_VIDEO_CAPTURE, promise)
      }
    }
  }

  private fun startCapture(mode: String, requestCode: Int, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("MEDIA_CAPTURE_ACTIVITY_UNAVAILABLE", "No foreground activity available to start capture.")
      return
    }

    if (pendingPromise != null) {
      promise.reject("MEDIA_CAPTURE_ALREADY_IN_PROGRESS", "Another capture is already in progress.")
      return
    }

    pendingPromise = promise
    pendingRequestCode = requestCode

    val intent = Intent(activity, InAppCaptureActivity::class.java).apply {
      putExtra(EXTRA_CAPTURE_MODE, mode)
    }
    activity.startActivityForResult(intent, requestCode)
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (pendingRequestCode == null || requestCode != pendingRequestCode) {
      return
    }

    val promise = pendingPromise
    pendingPromise = null
    pendingRequestCode = null

    if (promise == null) {
      return
    }

    if (resultCode != Activity.RESULT_OK) {
      val errorMessage = data?.getStringExtra(EXTRA_ERROR_MESSAGE)
      promise.reject("MEDIA_CAPTURE_CANCELLED", errorMessage ?: "Capture was cancelled.")
      return
    }

    val resultUri = data?.getStringExtra(EXTRA_RESULT_URI)
    if (resultUri == null) {
      promise.reject("MEDIA_CAPTURE_MISSING_RESULT", "Capture finished but no file URI was returned.")
      return
    }

    val result = Arguments.createMap().apply {
      putString("uri", resultUri)
    }
    promise.resolve(result)
  }

  override fun onNewIntent(intent: Intent) {}
}
