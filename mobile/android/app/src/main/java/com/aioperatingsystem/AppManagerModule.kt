package com.aioperatingsystem

import android.content.Intent
import android.content.pm.PackageManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AppManagerModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AppManager"

  @ReactMethod
  fun getInstalledApps(promise: Promise) {
    try {
      val packageManager = reactContext.packageManager
      val launcherIntent = Intent(Intent.ACTION_MAIN, null).apply {
        addCategory(Intent.CATEGORY_LAUNCHER)
      }
      @Suppress("DEPRECATION")
      val activities = packageManager.queryIntentActivities(launcherIntent, 0)
      val result = Arguments.createArray()

      activities
        .map { resolveInfo ->
          val activityInfo = resolveInfo.activityInfo
          val appName = resolveInfo.loadLabel(packageManager).toString()
          val packageName = activityInfo.packageName
          appName to packageName
        }
        .distinctBy { (_, packageName) -> packageName }
        .sortedBy { (appName, _) -> appName.lowercase() }
        .forEach { (appName, packageName) ->
          val app = Arguments.createMap().apply {
            putString("name", appName)
            putString("packageName", packageName)
            putBoolean("launchable", packageManager.getLaunchIntentForPackage(packageName) != null)
          }

          result.pushMap(app)
        }

      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("APP_MANAGER_GET_INSTALLED_APPS_FAILED", error)
    }
  }

  @ReactMethod
  fun openApplication(packageName: String, forceRestart: Boolean, promise: Promise) {
    try {
      val launchIntent = reactContext.packageManager.getLaunchIntentForPackage(packageName)
      if (launchIntent == null) {
        promise.reject(
          "APP_MANAGER_OPEN_APPLICATION_NOT_LAUNCHABLE",
          "No launchable activity found for package: $packageName"
        )
        return
      }

      // Launching from a non-Activity (application) context requires a new task.
      launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      // Regular apps can't force-stop another app (that needs a system/device-owner permission
      // this project doesn't have - see ERROR_LOG.md, GoalGuardCard). CLEAR_TASK is the
      // permission-free equivalent for "start fresh": it discards the target's existing
      // activity back-stack so the launch intent's activity becomes a true fresh root, instead
      // of just bringing whatever screen it was last on to the foreground. Opt-in only - default
      // "open this app" behavior (e.g. the planner's open_application tool) should keep the
      // normal, less disruptive bring-to-foreground behavior; teaching specifically wants a
      // known, reproducible starting screen so a taught procedure's recorded steps match what
      // replay will actually see (ERROR_LOG.md 2026-07-30: procedures taught mid-navigation were
      // missing the leading steps to reach their own starting screen from a fresh launch).
      if (forceRestart) {
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK)
      }
      reactContext.startActivity(launchIntent)

      val result = Arguments.createMap().apply {
        putString("packageName", packageName)
        putBoolean("launched", true)
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("APP_MANAGER_OPEN_APPLICATION_FAILED", error)
    }
  }
}