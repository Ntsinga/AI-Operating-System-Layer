package com.ntsinga.mobile

import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class NetworkActionsModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AiosNetworkActions"

  @ReactMethod
  fun openWifiSettings(promise: Promise) {
    openSettings(Settings.ACTION_WIFI_SETTINGS, "wifi", promise)
  }

  @ReactMethod
  fun openNetworkSettings(promise: Promise) {
    openSettings(Settings.ACTION_WIRELESS_SETTINGS, "network", promise)
  }

  private fun openSettings(action: String, panel: String, promise: Promise) {
    try {
      val intent = Intent(action).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
      reactContext.startActivity(intent)
      promise.resolve(Arguments.createMap().apply {
        putString("panel", panel)
        putBoolean("opened", true)
      })
    } catch (error: Exception) {
      promise.reject("NETWORK_SETTINGS_OPEN_FAILED", error)
    }
  }
}
