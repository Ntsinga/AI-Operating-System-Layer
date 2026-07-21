package com.ntsinga.mobile

import android.Manifest
import android.provider.Telephony
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SmsInboxModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName(): String = "AiosSmsInbox"
  @ReactMethod fun getRecentSms(hours: Double, promise: Promise) {
    PermissionHelper.requestPermission(context, Manifest.permission.READ_SMS, promise) {
      try {
        val since = System.currentTimeMillis() - hours.toLong().coerceIn(1L, 744L) * 60L * 60L * 1000L
        val result = Arguments.createArray()
        context.contentResolver.query(Telephony.Sms.CONTENT_URI, arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE, Telephony.Sms.TYPE), "date >= ?", arrayOf(since.toString()), "date DESC")?.use { cursor ->
          val address = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS); val body = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY); val date = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE); val type = cursor.getColumnIndexOrThrow(Telephony.Sms.TYPE)
          while (cursor.moveToNext() && result.size() < 300) result.pushMap(Arguments.createMap().apply { putString("address", cursor.getString(address) ?: ""); putString("body", cursor.getString(body) ?: ""); putDouble("dateEpochMs", cursor.getLong(date).toDouble()); putInt("type", cursor.getInt(type)) })
        }
        promise.resolve(result)
      } catch (error: Exception) { promise.reject("SMS_INBOX_READ_FAILED", error) }
    }
  }
}
