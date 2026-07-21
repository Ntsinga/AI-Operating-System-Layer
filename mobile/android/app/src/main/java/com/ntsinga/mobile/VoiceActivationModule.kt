package com.ntsinga.mobile

import android.Manifest
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class VoiceActivationModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AiosVoiceActivation"

  @ReactMethod
  fun startVoiceActivation(promise: Promise) {
    PermissionHelper.requestPermission(reactContext, Manifest.permission.RECORD_AUDIO, promise) {
      try {
        VoiceActivationService.start(reactContext)
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("VOICE_ACTIVATION_START_FAILED", error)
      }
    }
  }

  @ReactMethod
  fun stopVoiceActivation(promise: Promise) {
    try {
      VoiceActivationService.stop(reactContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("VOICE_ACTIVATION_STOP_FAILED", error)
    }
  }

  @ReactMethod
  fun isVoiceActivationActive(promise: Promise) {
    promise.resolve(VoiceActivationService.isRunning)
  }
}
