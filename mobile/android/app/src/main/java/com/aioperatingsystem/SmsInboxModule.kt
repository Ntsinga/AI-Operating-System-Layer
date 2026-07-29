package com.aioperatingsystem

import android.Manifest
import android.provider.Telephony
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SmsInboxModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName(): String = "AiosSmsInbox"
  // Cap raised from 31 to 180 days: recurring-charge detection (subscriptions.py) needs at
  // least two occurrences of a monthly charge to confirm a pattern, which a 31-day window can
  // never contain. Ordinary month/day-scoped expense loads still pass 744 and are unaffected.
  @ReactMethod fun getRecentSms(hours: Double, promise: Promise) {
    PermissionHelper.requestPermission(context, Manifest.permission.READ_SMS, promise) {
      try {
        val since = System.currentTimeMillis() - hours.toLong().coerceIn(1L, 4380L) * 60L * 60L * 1000L
        val result = Arguments.createArray()
        context.contentResolver.query(Telephony.Sms.CONTENT_URI, arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE, Telephony.Sms.TYPE), "date >= ?", arrayOf(since.toString()), "date DESC")?.use { cursor ->
          val address = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS); val body = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY); val date = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE); val type = cursor.getColumnIndexOrThrow(Telephony.Sms.TYPE)
          while (cursor.moveToNext() && result.size() < 1500) result.pushMap(Arguments.createMap().apply { putString("address", cursor.getString(address) ?: ""); putString("body", cursor.getString(body) ?: ""); putDouble("dateEpochMs", cursor.getLong(date).toDouble()); putInt("type", cursor.getInt(type)) })
        }
        promise.resolve(result)
      } catch (error: Exception) { promise.reject("SMS_INBOX_READ_FAILED", error) }
    }
  }
}
