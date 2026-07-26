package com.aioperatingsystem

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class OverlayModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AiosOverlay"

  @ReactMethod
  fun hasOverlayPermission(promise: Promise) {
    val granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(reactContext)
    promise.resolve(granted)
  }

  // SYSTEM_ALERT_WINDOW is a special permission like WRITE_SETTINGS: no runtime dialog, the
  // user must flip it on in a system Settings screen we redirect them to here.
  @ReactMethod
  fun requestOverlayPermission(promise: Promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${reactContext.packageName}")
      ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
      reactContext.startActivity(intent)
    }
    promise.resolve(null)
  }

  @ReactMethod
  fun startOverlay(promise: Promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
      promise.reject(
        "OVERLAY_PERMISSION_REQUIRED",
        "\"Display over other apps\" is not granted yet. Call requestOverlayPermission first."
      )
      return
    }

    // POST_NOTIFICATIONS is required at runtime on API 33+ for the foreground service's
    // persistent notification; it is a no-op (auto-granted) on older versions.
    PermissionHelper.requestPermission(reactContext, Manifest.permission.POST_NOTIFICATIONS, promise) {
      resolveStartOverlay(promise)
    }
  }

  private fun resolveStartOverlay(promise: Promise) {
    try {
      OverlayService.start(reactContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("OVERLAY_START_FAILED", error)
    }
  }

  @ReactMethod
  fun stopOverlay(promise: Promise) {
    try {
      OverlayService.stop(reactContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("OVERLAY_STOP_FAILED", error)
    }
  }

  @ReactMethod
  fun isOverlayActive(promise: Promise) {
    promise.resolve(OverlayService.isRunning)
  }
}
