package com.aioperatingsystem

import android.Manifest
import android.telephony.SmsManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SmsModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AiosSms"

  @ReactMethod
  fun sendSms(phoneNumber: String, message: String, promise: Promise) {
    // SEND_SMS lets any app send texts; only *receiving*/*reading* SMS requires
    // being the default SMS app.
    PermissionHelper.requestPermission(reactContext, Manifest.permission.SEND_SMS, promise) {
      resolveSendSms(phoneNumber, message, promise)
    }
  }

  private fun resolveSendSms(phoneNumber: String, message: String, promise: Promise) {
    try {
      val smsManager = reactContext.getSystemService(SmsManager::class.java)
      val parts = smsManager.divideMessage(message)

      if (parts.size > 1) {
        smsManager.sendMultipartTextMessage(phoneNumber, null, parts, null, null)
      } else {
        smsManager.sendTextMessage(phoneNumber, null, message, null, null)
      }

      val result = Arguments.createMap().apply {
        putString("phoneNumber", phoneNumber)
        putBoolean("sent", true)
        putInt("partCount", parts.size)
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("SMS_SEND_SMS_FAILED", error)
    }
  }
}
