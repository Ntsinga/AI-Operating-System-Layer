package com.aioperatingsystem

import android.Manifest
import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class VoiceActivationModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AiosVoiceActivation"

  private val preferences by lazy {
    reactContext.getSharedPreferences("aios_voice_activation", Context.MODE_PRIVATE)
  }

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

  /** Called by LiveVoiceButton.tsx once a live voice session ends (naturally or by the
   * user stopping it), so the wake-word service can resume listening if it's the one
   * that launched this session - see VoiceActivationService.handleKeywordDetected() /
   * resumeAfterLiveVoice(). No promise: this is fire-and-forget, and a no-op if the
   * service isn't running (e.g. the session was started from the manual chat button). */
  @ReactMethod
  fun notifyLiveSessionEnded() {
    VoiceActivationService.resumeAfterLiveVoice(reactContext)
  }

  @ReactMethod
  fun getSetupStatus(promise: Promise) {
    val result = Arguments.createMap().apply {
      putBoolean("hasMicPermission", PermissionHelper.hasPermission(reactContext, Manifest.permission.RECORD_AUDIO))
      putBoolean("hasOverlayPermission", OverlayService.hasPermission(reactContext))
      putBoolean("voiceActive", VoiceActivationService.isRunning)
      putBoolean("overlayActive", OverlayService.isRunning)
      putBoolean("calibrationComplete", preferences.getBoolean("wake_phrase_calibrated", false))
      putString("wakePhrase", "Hey Casper")
    }
    promise.resolve(result)
  }

  /** Stores one private calibration sample and its verified transcript. Android's built-in
   * SpeechRecognizer cannot be retrained with this file; it is retained for future wake-word
   * engines and for the app's own calibration history. */
  @ReactMethod
  fun saveWakePhraseSample(path: String, transcript: String, profile: String, promise: Promise) {
    try {
      val source = java.io.File(path)
      if (!source.exists()) {
        promise.reject("VOICE_CALIBRATION_FILE_MISSING", "The calibration recording no longer exists.")
        return
      }
      val normalizedProfile = if (profile == "high") "high" else "low"
      val destination = java.io.File(reactContext.filesDir, "wake_phrase_sample_${normalizedProfile}.m4a")
      source.copyTo(destination, overwrite = true)
      val editor = preferences.edit().putString("wake_phrase_transcript_${normalizedProfile}", transcript)
      if (normalizedProfile == "high") editor.putBoolean("wake_phrase_calibrated", true)
      editor.apply()
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("VOICE_CALIBRATION_SAVE_FAILED", error)
    }
  }

  @ReactMethod
  fun clearWakePhraseCalibration(promise: Promise) {
    runCatching {
      java.io.File(reactContext.filesDir, "wake_phrase_sample_low.m4a").delete()
      java.io.File(reactContext.filesDir, "wake_phrase_sample_high.m4a").delete()
      preferences.edit().clear().apply()
      promise.resolve(true)
    }.onFailure { error -> promise.reject("VOICE_CALIBRATION_CLEAR_FAILED", error) }
  }
}
