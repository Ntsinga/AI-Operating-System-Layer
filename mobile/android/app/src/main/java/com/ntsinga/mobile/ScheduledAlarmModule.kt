package com.ntsinga.mobile

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ScheduledAlarmModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private val alarm by lazy { reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager }
  override fun getName(): String = "AiosScheduledAlarm"

  @ReactMethod
  fun schedule(triggerAtEpochMs: Double, label: String?, promise: Promise) {
    val triggerAt = triggerAtEpochMs.toLong()
    if (triggerAt <= System.currentTimeMillis()) { promise.reject("ALARM_PAST_DATE", "The alarm time must be in the future."); return }
    val id = (triggerAt / 1000L % Int.MAX_VALUE).toInt()
    val intent = Intent(reactContext, ScheduledAlarmReceiver::class.java).apply {
      putExtra("label", label ?: "AI-OS alarm"); putExtra("notificationId", id)
    }
    val pending = PendingIntent.getBroadcast(reactContext, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    try {
      alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
      promise.resolve(Arguments.createMap().apply { putDouble("triggerAtEpochMs", triggerAt.toDouble()); putString("label", label ?: "AI-OS alarm"); putBoolean("scheduled", true) })
    } catch (error: SecurityException) {
      promise.reject("EXACT_ALARM_PERMISSION_REQUIRED", "Android requires exact-alarm permission for a date-specific alarm.")
    } catch (error: Exception) { promise.reject("SCHEDULED_ALARM_FAILED", error) }
  }
}
