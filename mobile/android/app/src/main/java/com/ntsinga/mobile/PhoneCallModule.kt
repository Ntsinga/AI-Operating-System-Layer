package com.ntsinga.mobile

import android.Manifest
import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class PhoneCallModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AiosPhoneCall"

  @ReactMethod
  fun makeCall(phoneNumber: String, promise: Promise) {
    // CALL_PHONE places the call directly (no dialer confirmation screen) - our own
    // app's Confirm & run step is the user-facing confirmation, same pattern as send_sms.
    PermissionHelper.requestPermission(reactContext, Manifest.permission.CALL_PHONE, promise) {
      resolveMakeCall(phoneNumber, promise)
    }
  }

  private fun resolveMakeCall(phoneNumber: String, promise: Promise) {
    try {
      val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$phoneNumber")).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)

      val result = Arguments.createMap().apply {
        putString("phoneNumber", phoneNumber)
        putBoolean("called", true)
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("PHONE_CALL_MAKE_CALL_FAILED", error)
    }
  }
}
