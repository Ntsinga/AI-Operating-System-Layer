package com.aioperatingsystem

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.net.Uri
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AppHealthModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AiosAppHealth"

  @ReactMethod
  fun inspect(packageName: String, promise: Promise) {
    try {
      val info = reactContext.packageManager.getApplicationInfo(packageName, 0)
      val packageInfo = reactContext.packageManager.getPackageInfo(packageName, 0)
      val label = reactContext.packageManager.getApplicationLabel(info).toString()
      promise.resolve(Arguments.createMap().apply {
        putString("packageName", packageName); putString("appName", label)
        putBoolean("enabled", info.enabled); putBoolean("systemApp", (info.flags and ApplicationInfo.FLAG_SYSTEM) != 0)
        putString("versionName", packageInfo.versionName ?: "unknown"); putLong("versionCode", if (android.os.Build.VERSION.SDK_INT >= 28) packageInfo.longVersionCode else packageInfo.versionCode.toLong())
        putInt("uid", info.uid); putBoolean("launchable", reactContext.packageManager.getLaunchIntentForPackage(packageName) != null)
      })
    } catch (error: Exception) { promise.reject("APP_HEALTH_INSPECT_FAILED", error) }
  }

  @ReactMethod
  fun openSettings(packageName: String, promise: Promise) {
    try {
      reactContext.packageManager.getApplicationInfo(packageName, 0)
      reactContext.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:$packageName"); addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      })
      promise.resolve(Arguments.createMap().apply { putString("packageName", packageName); putBoolean("opened", true) })
    } catch (error: Exception) { promise.reject("APP_SETTINGS_OPEN_FAILED", error) }
  }
}
