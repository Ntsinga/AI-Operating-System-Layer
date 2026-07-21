package com.ntsinga.mobile

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Process
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class UsageStatsModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AiosUsageStats"

  @ReactMethod
  fun hasUsageAccess(promise: Promise) { promise.resolve(checkUsageAccess()) }

  @ReactMethod
  fun requestUsageAccess(promise: Promise) {
    try {
      reactContext.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) })
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("USAGE_ACCESS_SETTINGS_FAILED", error)
    }
  }

  @ReactMethod
  fun getAppUsage(hours: Double, promise: Promise) {
    if (!checkUsageAccess()) {
      promise.reject("USAGE_ACCESS_REQUIRED", "Grant Usage Access to AI-OS, then try again.")
      return
    }
    try {
      val windowHours = hours.toLong().coerceIn(1L, 168L)
      val now = System.currentTimeMillis()
      val start = now - windowHours * 60L * 60L * 1000L
      val usageManager = reactContext.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val stats = usageManager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, now)
      val packageManager = reactContext.packageManager
      val result = Arguments.createArray()
      stats.groupBy { it.packageName }
        .map { (packageName, entries) ->
          val appName = runCatching {
            packageManager.getApplicationLabel(packageManager.getApplicationInfo(packageName, 0)).toString()
          }.getOrDefault(packageName)
          Triple(packageName, appName, entries.sumOf { it.totalTimeInForeground })
        }
        .filter { it.third > 0L }
        .sortedByDescending { it.third }
        .take(50)
        .forEach { (packageName, appName, foregroundTimeMs) ->
          result.pushMap(Arguments.createMap().apply {
            putString("packageName", packageName)
            putString("appName", appName)
            putDouble("foregroundTimeMs", foregroundTimeMs.toDouble())
            putDouble("foregroundMinutes", foregroundTimeMs / 60_000.0)
          })
        }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("APP_USAGE_QUERY_FAILED", error)
    }
  }

  @ReactMethod
  fun openAppBatterySettings(packageName: String, promise: Promise) {
    try {
      reactContext.packageManager.getApplicationInfo(packageName, 0)
      reactContext.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:$packageName")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      })
      promise.resolve(Arguments.createMap().apply {
        putString("packageName", packageName)
        putBoolean("opened", true)
      })
    } catch (error: Exception) {
      promise.reject("APP_BATTERY_SETTINGS_FAILED", error)
    }
  }

  @ReactMethod
  fun getBatteryOptimizationStatus(packageName: String, promise: Promise) {
    try {
      reactContext.packageManager.getApplicationInfo(packageName, 0)
      val power = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
      promise.resolve(Arguments.createMap().apply {
        putString("packageName", packageName)
        putBoolean("ignoringBatteryOptimizations", power.isIgnoringBatteryOptimizations(packageName))
        putBoolean("normallyOptimized", !power.isIgnoringBatteryOptimizations(packageName))
      })
    } catch (error: Exception) { promise.reject("BATTERY_OPTIMIZATION_STATUS_FAILED", error) }
  }

  @ReactMethod
  fun openBatteryOptimizationSettings(promise: Promise) {
    try {
      reactContext.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) })
      promise.resolve(Arguments.createMap().apply { putBoolean("opened", true) })
    } catch (error: Exception) { promise.reject("BATTERY_OPTIMIZATION_SETTINGS_FAILED", error) }
  }

  private fun checkUsageAccess(): Boolean {
    val appOps = reactContext.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    return appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), reactContext.packageName) == AppOpsManager.MODE_ALLOWED
  }
}
