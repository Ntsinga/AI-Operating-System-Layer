package com.aioperatingsystem

import android.content.Intent
import android.provider.AlarmClock
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AlarmModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AiosAlarm"

  @ReactMethod
  fun setAlarm(hour: Int, minute: Int, label: String?, promise: Promise) {
    if (hour !in 0..23 || minute !in 0..59) {
      promise.reject("ALARM_INVALID_TIME", "Hour must be 0-23 and minute must be 0-59.")
      return
    }
    try {
      val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
        putExtra(AlarmClock.EXTRA_HOUR, hour)
        putExtra(AlarmClock.EXTRA_MINUTES, minute)
        putExtra(AlarmClock.EXTRA_SKIP_UI, false)
        if (!label.isNullOrBlank()) putExtra(AlarmClock.EXTRA_MESSAGE, label.trim())
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      if (intent.resolveActivity(reactContext.packageManager) == null) {
        promise.reject("ALARM_UNAVAILABLE", "No alarm app is available on this device.")
        return
      }
      reactContext.startActivity(intent)
      promise.resolve(Arguments.createMap().apply {
        putInt("hour", hour); putInt("minute", minute); putString("label", label ?: ""); putBoolean("openedSystemAlarm", true)
      })
    } catch (error: Exception) { promise.reject("ALARM_FAILED", error) }
  }
}
