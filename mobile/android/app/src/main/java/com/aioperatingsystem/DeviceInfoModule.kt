package com.aioperatingsystem

import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DeviceInfoModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  // NOT "DeviceInfo": React Native core already registers a built-in module with that
  // exact bridge name (used internally by the Dimensions API), and it silently wins the
  // name collision — NativeModules.DeviceInfo would resolve to RN's module, not ours.
  override fun getName(): String = "AiosDeviceInfo"

  @ReactMethod
  fun getDeviceInfo(promise: Promise) {
    try {
      // Sticky broadcast: registering a null receiver returns the last broadcast
      // synchronously instead of requiring an async listener.
      val batteryStatus = reactContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))

      val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
      val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
      val batteryPercent = if (level >= 0 && scale > 0) (level * 100) / scale else -1

      val chargePlug = batteryStatus?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1) ?: -1
      val isCharging = chargePlug == BatteryManager.BATTERY_PLUGGED_AC ||
        chargePlug == BatteryManager.BATTERY_PLUGGED_USB ||
        chargePlug == BatteryManager.BATTERY_PLUGGED_WIRELESS

      val result = Arguments.createMap().apply {
        putInt("batteryPercent", batteryPercent)
        putBoolean("isCharging", isCharging)
        putString("deviceModel", Build.MODEL)
        putString("deviceManufacturer", Build.MANUFACTURER)
        putString("androidVersion", Build.VERSION.RELEASE)
        putInt("androidSdkInt", Build.VERSION.SDK_INT)
        putDouble("currentTimeMillis", System.currentTimeMillis().toDouble())
      }

      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("DEVICE_INFO_GET_DEVICE_INFO_FAILED", error)
    }
  }
}
