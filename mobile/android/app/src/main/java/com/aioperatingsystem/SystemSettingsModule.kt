package com.aioperatingsystem

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SystemSettingsModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AiosSystemSettings"

  @ReactMethod
  fun setScreenBrightness(level: Int, promise: Promise) {
    if (level < 0 || level > 255) {
      promise.reject(
        "SYSTEM_SETTINGS_SET_SCREEN_BRIGHTNESS_INVALID_LEVEL",
        "level must be between 0 and 255 (got: $level)"
      )
      return
    }

    // WRITE_SETTINGS is a special permission: there is no runtime dialog for it.
    // The user must flip it on once in a system screen we redirect them to here.
    if (!Settings.System.canWrite(reactContext)) {
      val intent = Intent(
        Settings.ACTION_MANAGE_WRITE_SETTINGS,
        Uri.parse("package:${reactContext.packageName}")
      ).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.reject(
        "SYSTEM_SETTINGS_WRITE_SETTINGS_PERMISSION_REQUIRED",
        "Opened system settings so you can allow \"Modify system settings\" for this app. Grant it, then run this tool again."
      )
      return
    }

    try {
      // If auto-brightness is on, a manual SCREEN_BRIGHTNESS write gets silently
      // overridden by the system's own algorithm moments later. Force manual mode
      // first so the value actually sticks.
      Settings.System.putInt(
        reactContext.contentResolver,
        Settings.System.SCREEN_BRIGHTNESS_MODE,
        Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL
      )
      Settings.System.putInt(reactContext.contentResolver, Settings.System.SCREEN_BRIGHTNESS, level)

      val result = Arguments.createMap().apply {
        putInt("brightness", level)
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("SYSTEM_SETTINGS_SET_SCREEN_BRIGHTNESS_FAILED", error)
    }
  }
}
