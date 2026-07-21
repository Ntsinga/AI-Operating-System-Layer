package com.ntsinga.mobile

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

class DevicePolicyModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  private val manager by lazy { reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager }
  private val admin by lazy { ComponentName(reactContext, AiosDeviceAdminReceiver::class.java) }

  override fun getName(): String = "AiosDevicePolicy"

  @ReactMethod
  fun getPolicyStatus(promise: Promise) {
    try {
      val owner = manager.isDeviceOwnerApp(reactContext.packageName)
      promise.resolve(Arguments.createMap().apply {
        putBoolean("deviceOwner", owner)
        putBoolean("provisioningAllowed", manager.isProvisioningAllowed(DevicePolicyManager.ACTION_PROVISION_MANAGED_DEVICE))
        putString("adminComponent", admin.flattenToShortString())
        putString("mode", if (owner) "managed_device" else "normal_app")
      })
    } catch (error: Exception) {
      promise.reject("DEVICE_POLICY_STATUS_FAILED", error)
    }
  }

  @ReactMethod
  fun setApplicationSuspended(packageName: String, suspended: Boolean, promise: Promise) {
    setApplicationsSuspended(arrayOf(packageName), suspended, promise)
  }

  @ReactMethod
  fun setApplicationsSuspended(packageNames: ReadableArray, suspended: Boolean, promise: Promise) {
    if (!manager.isDeviceOwnerApp(reactContext.packageName)) {
      promise.reject("DEVICE_OWNER_REQUIRED", "AI-OS must be provisioned as device owner before enforcing app policies.")
      return
    }
    val requested = (0 until packageNames.size()).mapNotNull { packageNames.getString(it)?.trim() }.distinct()
    if (requested.isEmpty()) {
      promise.reject("DEVICE_POLICY_EMPTY_LIST", "Select at least one app.")
      return
    }
    if (requested.contains(reactContext.packageName)) {
      promise.reject("DEVICE_POLICY_SELF_SUSPEND_BLOCKED", "AI-OS cannot suspend itself.")
      return
    }
    try {
      val failed = manager.setPackagesSuspended(admin, requested.toTypedArray(), suspended)
      promise.resolve(Arguments.createMap().apply {
        putArray("packageNames", Arguments.createArray().apply { requested.forEach { pushString(it) } })
        putBoolean("suspended", suspended)
        putBoolean("applied", failed.isEmpty())
        putArray("failedPackages", Arguments.createArray().apply {
          failed.forEach { pushString(it) }
        })
      })
    } catch (error: Exception) {
      promise.reject("DEVICE_POLICY_SUSPEND_FAILED", error)
    }
  }

  @ReactMethod
  fun setKioskMode(enabled: Boolean, promise: Promise) {
    if (!manager.isDeviceOwnerApp(reactContext.packageName)) {
      promise.reject("DEVICE_OWNER_REQUIRED", "Kiosk mode requires AI-OS to be provisioned as device owner.")
      return
    }
    try {
      if (enabled) {
        manager.setLockTaskPackages(admin, arrayOf(reactContext.packageName))
        val activity = reactContext.currentActivity
          ?: throw IllegalStateException("AI-OS must be visible before kiosk mode can start.")
        activity.startLockTask()
      } else {
        reactContext.currentActivity?.stopLockTask()
      }
      promise.resolve(Arguments.createMap().apply {
        putBoolean("enabled", enabled)
        putBoolean("applied", true)
      })
    } catch (error: Exception) {
      promise.reject("DEVICE_POLICY_KIOSK_FAILED", error)
    }
  }
}
