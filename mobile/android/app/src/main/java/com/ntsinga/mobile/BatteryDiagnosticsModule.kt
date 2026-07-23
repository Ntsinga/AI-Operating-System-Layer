package com.ntsinga.mobile

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class BatteryDiagnosticsModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AiosBatteryDiagnostics"

  @ReactMethod
  fun diagnoseBattery(promise: Promise) {
    try {
      val battery = reactContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
      val batteryManager = reactContext.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
      val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager

      val level = battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
      val scale = battery?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
      val percent = if (level >= 0 && scale > 0) (level * 100) / scale else -1
      val status = battery?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
      val plugged = battery?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1) ?: -1
      val temperatureTenthsC = battery?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1
      val voltageMv = battery?.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1) ?: -1
      val health = battery?.getIntExtra(BatteryManager.EXTRA_HEALTH, -1) ?: -1
      val currentMicroamps = readCurrent(batteryManager)
      val energyNanowattHours = readEnergy(batteryManager)

      promise.resolve(Arguments.createMap().apply {
        putInt("batteryPercent", percent)
        putBoolean("charging", status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL)
        putString("status", statusName(status))
        putString("plugged", pluggedName(plugged))
        putDouble("temperatureC", if (temperatureTenthsC >= 0) temperatureTenthsC / 10.0 else -1.0)
        putInt("voltageMv", voltageMv)
        putInt("currentMicroamps", currentMicroamps)
        putLong("energyNanowattHours", energyNanowattHours)
        putString("health", healthName(health))
        putBoolean("powerSaverEnabled", if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) powerManager.isPowerSaveMode else false)
        putLong("measuredAtMillis", System.currentTimeMillis())
      })
    } catch (error: Exception) {
      promise.reject("BATTERY_DIAGNOSTICS_FAILED", error)
    }
  }

  private fun readCurrent(manager: BatteryManager): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)
    } else -1
  }

  private fun readEnergy(manager: BatteryManager): Long {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      manager.getLongProperty(BatteryManager.BATTERY_PROPERTY_ENERGY_COUNTER)
    } else -1L
  }

  private fun statusName(status: Int) = when (status) {
    BatteryManager.BATTERY_STATUS_CHARGING -> "charging"
    BatteryManager.BATTERY_STATUS_DISCHARGING -> "discharging"
    BatteryManager.BATTERY_STATUS_FULL -> "full"
    BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "not_charging"
    else -> "unknown"
  }

  private fun pluggedName(plugged: Int) = when (plugged) {
    BatteryManager.BATTERY_PLUGGED_AC -> "ac"
    BatteryManager.BATTERY_PLUGGED_USB -> "usb"
    BatteryManager.BATTERY_PLUGGED_WIRELESS -> "wireless"
    else -> "none_or_unknown"
  }

  private fun healthName(health: Int) = when (health) {
    BatteryManager.BATTERY_HEALTH_GOOD -> "good"
    BatteryManager.BATTERY_HEALTH_OVERHEAT -> "overheat"
    BatteryManager.BATTERY_HEALTH_DEAD -> "dead"
    BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "over_voltage"
    BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "failure"
    BatteryManager.BATTERY_HEALTH_COLD -> "cold"
    else -> "unknown"
  }
}
