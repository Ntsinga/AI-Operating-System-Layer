package com.ntsinga.mobile

import android.Manifest
import android.media.MediaRecorder
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// Plain microphone recording for voice input (transcribe_audio / voice command), distinct
// from InAppCaptureActivity's video-with-audio recording - no camera preview needed here,
// just android.media.MediaRecorder writing straight to an AAC/M4A file.
class AudioRecorderModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var recorder: MediaRecorder? = null
  private var outputFile: File? = null

  override fun getName(): String = "AiosAudioRecorder"

  @ReactMethod
  fun startRecording(promise: Promise) {
    PermissionHelper.requestPermission(reactContext, Manifest.permission.RECORD_AUDIO, promise) {
      resolveStartRecording(promise)
    }
  }

  private fun resolveStartRecording(promise: Promise) {
    if (recorder != null) {
      promise.reject("AUDIO_RECORDER_ALREADY_RECORDING", "A recording is already in progress.")
      return
    }

    try {
      val fileName = "aios_voice_${SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())}.m4a"
      val outputDir = File(reactContext.cacheDir, "captures").apply { mkdirs() }
      val file = File(outputDir, fileName)

      @Suppress("DEPRECATION")
      val newRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        MediaRecorder(reactContext)
      } else {
        MediaRecorder()
      }

      newRecorder.apply {
        setAudioSource(MediaRecorder.AudioSource.MIC)
        setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        setOutputFile(file.absolutePath)
        prepare()
        start()
      }

      recorder = newRecorder
      outputFile = file
      promise.resolve(true)
    } catch (error: Exception) {
      recorder = null
      outputFile = null
      promise.reject("AUDIO_RECORDER_START_FAILED", error)
    }
  }

  @ReactMethod
  fun stopRecording(promise: Promise) {
    val activeRecorder = recorder
    val file = outputFile
    recorder = null
    outputFile = null

    if (activeRecorder == null || file == null) {
      promise.reject("AUDIO_RECORDER_NOT_RECORDING", "No recording is in progress.")
      return
    }

    try {
      activeRecorder.stop()
      activeRecorder.release()

      val result = Arguments.createMap().apply {
        putString("uri", file.toURI().toString())
        putString("path", file.absolutePath)
      }
      promise.resolve(result)
    } catch (error: Exception) {
      // stop() throws IllegalStateException if called too soon after start() with no
      // audio data captured yet (common if the user taps stop almost immediately).
      promise.reject("AUDIO_RECORDER_STOP_FAILED", error)
    }
  }
}
