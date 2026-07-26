package com.aioperatingsystem

import android.content.Context
import android.media.AudioManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AudioModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  // Not "Audio": avoid any future collision with a built-in RN/Expo module, same
  // convention as AiosDeviceInfo. See ERROR_LOG.md (2026-07-19, get_device_info).
  override fun getName(): String = "AiosAudio"

  @ReactMethod
  fun adjustVolume(direction: String, promise: Promise) {
    val adjustDirection = when (direction) {
      "up" -> AudioManager.ADJUST_RAISE
      "down" -> AudioManager.ADJUST_LOWER
      "mute" -> AudioManager.ADJUST_MUTE
      "unmute" -> AudioManager.ADJUST_UNMUTE
      else -> {
        promise.reject(
          "AUDIO_ADJUST_VOLUME_INVALID_DIRECTION",
          "direction must be one of: up, down, mute, unmute (got: $direction)"
        )
        return
      }
    }

    try {
      val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      // STREAM_MUSIC: the media volume stream, adjustable without any dangerous or
      // special permission (unlike STREAM_RING, which needs Do Not Disturb access).
      audioManager.adjustStreamVolume(AudioManager.STREAM_MUSIC, adjustDirection, AudioManager.FLAG_SHOW_UI)

      val result = Arguments.createMap().apply {
        putInt("currentVolume", audioManager.getStreamVolume(AudioManager.STREAM_MUSIC))
        putInt("maxVolume", audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC))
        putBoolean("isMuted", audioManager.isStreamMute(AudioManager.STREAM_MUSIC))
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("AUDIO_ADJUST_VOLUME_FAILED", error)
    }
  }
}
