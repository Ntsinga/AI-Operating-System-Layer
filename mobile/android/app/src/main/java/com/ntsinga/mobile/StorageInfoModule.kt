package com.ntsinga.mobile

import android.os.Environment
import android.os.StatFs
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class StorageInfoModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AiosStorageInfo"

  @ReactMethod
  fun getStorageInfo(promise: Promise) {
    try {
      val stats = StatFs(Environment.getDataDirectory().path)
      val blockSize = stats.blockSizeLong
      val totalBytes = stats.blockCountLong * blockSize
      val freeBytes = stats.availableBlocksLong * blockSize
      val usedBytes = (totalBytes - freeBytes).coerceAtLeast(0L)
      val usedPercent = if (totalBytes > 0) usedBytes.toDouble() / totalBytes.toDouble() else 0.0

      promise.resolve(Arguments.createMap().apply {
        putDouble("totalBytes", totalBytes.toDouble())
        putDouble("freeBytes", freeBytes.toDouble())
        putDouble("usedBytes", usedBytes.toDouble())
        putDouble("usedPercent", usedPercent)
        putString("path", Environment.getDataDirectory().path)
      })
    } catch (error: Exception) {
      promise.reject("STORAGE_INFO_GET_FAILED", error)
    }
  }
}
