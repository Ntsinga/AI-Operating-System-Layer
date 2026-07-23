package com.ntsinga.mobile

import android.app.AlarmManager
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class FocusPolicyModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private val prefs by lazy { reactContext.getSharedPreferences("aios_focus_policy", Context.MODE_PRIVATE) }
  private val manager by lazy { reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager }
  private val admin by lazy { ComponentName(reactContext, AiosDeviceAdminReceiver::class.java) }
  private val alarm by lazy { reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager }

  override fun getName(): String = "AiosFocusPolicy"

  private fun alarmIntent(): PendingIntent = PendingIntent.getBroadcast(
    reactContext, 7421, Intent(reactContext, FocusPolicyReceiver::class.java),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
  )

  @ReactMethod
  fun startFocus(packageNames: ReadableArray, durationMinutes: Int, promise: Promise) {
    if (!manager.isDeviceOwnerApp(reactContext.packageName)) { promise.reject("DEVICE_OWNER_REQUIRED", "Timed focus policies require Device Owner mode."); return }
    val packages = (0 until packageNames.size()).mapNotNull { packageNames.getString(it)?.trim() }.distinct()
    if (packages.isEmpty()) { promise.reject("FOCUS_EMPTY_LIST", "Select at least one app."); return }
    if (packages.contains(reactContext.packageName)) { promise.reject("FOCUS_SELF_BLOCKED", "AI-OS cannot block itself."); return }
    if (durationMinutes !in 1..10080) { promise.reject("FOCUS_INVALID_DURATION", "Duration must be between 1 minute and 7 days."); return }
    try {
      val failed = manager.setPackagesSuspended(admin, packages.toTypedArray(), true)
      if (failed.isNotEmpty()) { promise.reject("FOCUS_SUSPEND_FAILED", "Some apps could not be blocked: ${failed.joinToString()}"); return }
      val unlockAt = System.currentTimeMillis() + durationMinutes * 60_000L
      prefs.edit().putStringSet("packages", packages.toSet()).putLong("unlockAt", unlockAt).apply()
      alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, unlockAt, alarmIntent())
      promise.resolve(Arguments.createMap().apply {
        putArray("packageNames", Arguments.createArray().apply { packages.forEach { pushString(it) } })
        putInt("durationMinutes", durationMinutes); putDouble("unlockAtEpochMs", unlockAt.toDouble()); putBoolean("active", true)
      })
    } catch (error: Exception) { promise.reject("FOCUS_START_FAILED", error) }
  }

  @ReactMethod
  fun getFocusStatus(promise: Promise) {
    val packages = prefs.getStringSet("packages", emptySet()).orEmpty()
    val unlockAt = prefs.getLong("unlockAt", 0L)
    if (unlockAt > 0L && unlockAt <= System.currentTimeMillis()) prefs.edit().clear().apply()
    promise.resolve(Arguments.createMap().apply {
      putBoolean("active", packages.isNotEmpty() && unlockAt > System.currentTimeMillis())
      putArray("packageNames", Arguments.createArray().apply { packages.forEach { pushString(it) } })
      putDouble("unlockAtEpochMs", unlockAt.toDouble())
    })
  }

  @ReactMethod
  fun stopFocus(promise: Promise) {
    try {
      alarm.cancel(alarmIntent())
      val packages = prefs.getStringSet("packages", emptySet()).orEmpty()
      if (manager.isDeviceOwnerApp(reactContext.packageName) && packages.isNotEmpty()) manager.setPackagesSuspended(admin, packages.toTypedArray(), false)
      prefs.edit().clear().apply()
      promise.resolve(Arguments.createMap().apply { putBoolean("active", false); putBoolean("restored", true) })
    } catch (error: Exception) { promise.reject("FOCUS_STOP_FAILED", error) }
  }
}
