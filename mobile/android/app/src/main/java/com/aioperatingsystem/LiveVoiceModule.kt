package com.aioperatingsystem

import android.Manifest
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.Buffer
import okio.ByteString
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import kotlin.math.max

private const val TAG = "AiosLiveVoice"

// Confirmed against https://developers.openai.com/api/docs/guides/realtime-conversations
// (2026-09-12): OpenAI's default Live/Realtime audio format is mono PCM16 at 24kHz. The
// backend (live_voice.py) never touches sample-level audio - it only relays opaque bytes
// between this module and OpenAI - so this is the one place that format is assumed.
private const val SAMPLE_RATE = 24000

/**
 * Full-duplex audio session for the GPT-Live-1 voice layer: opens a WebSocket to the
 * backend's /live/ws, streams mic audio up and plays speaker audio down, and forwards
 * JSON control frames (proposed tool calls, captions) to JS as events. See
 * mobile/src/native/LiveVoice.ts for the JS side and backend/app/live_voice.py for what's
 * on the other end of the socket.
 *
 * Unlike every other recording path in this app (AudioRecorderModule, VoiceActivationService's
 * KWS loop), mic and speaker are open at the same time here - hence VOICE_COMMUNICATION +
 * echo cancellation instead of a plain MIC source.
 */
class LiveVoiceModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AiosLiveVoice"

  private val client = OkHttpClient.Builder().pingInterval(20, TimeUnit.SECONDS).build()

  private var webSocket: WebSocket? = null
  private var audioRecord: AudioRecord? = null
  private var audioTrack: AudioTrack? = null
  private var echoCanceler: AcousticEchoCanceler? = null
  private var noiseSuppressor: NoiseSuppressor? = null
  private var captureThread: Thread? = null
  @Volatile private var capturing = false
  @Volatile private var sessionActive = false

  @ReactMethod
  fun startSession(wsUrl: String, initPayload: String, promise: Promise) {
    PermissionHelper.requestPermission(reactContext, Manifest.permission.RECORD_AUDIO, promise) {
      resolveStartSession(wsUrl, initPayload, promise)
    }
  }

  private fun resolveStartSession(wsUrl: String, initPayload: String, promise: Promise) {
    if (sessionActive) {
      promise.reject("LIVE_VOICE_ALREADY_ACTIVE", "A live voice session is already active.")
      return
    }

    val request = Request.Builder().url(wsUrl).build()
    webSocket = client.newWebSocket(
      request,
      object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
          Log.i(TAG, "Live voice socket open")
          sessionActive = true
          // First frame must be the init handshake (tools/installedApps/deviceId) -
          // backend/app/live_voice.py's LiveVoiceBridge.run() reads exactly this before
          // connecting onward to OpenAI.
          webSocket.send(initPayload)
          startAudioPlayback()
          if (!startAudioCapture(webSocket)) {
            promise.reject("LIVE_VOICE_MIC_UNAVAILABLE", "Could not start microphone capture.")
            teardown()
            return
          }
          promise.resolve(true)
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
          handleControlMessage(text)
        }

        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
          audioTrack?.write(bytes.toByteArray(), 0, bytes.size)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
          Log.e(TAG, "Live voice socket failure", t)
          val wasActive = sessionActive
          teardown()
          if (wasActive) {
            emit("onError", Arguments.createMap().apply { putString("message", t.message ?: "Live voice connection failed.") })
          } else {
            promise.reject("LIVE_VOICE_CONNECT_FAILED", t)
          }
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
          val wasActive = sessionActive
          teardown()
          if (wasActive) {
            emit("onSessionEnded", Arguments.createMap().apply { putString("reason", reason) })
          }
        }
      }
    )
  }

  @ReactMethod
  fun stopSession(promise: Promise) {
    val wasActive = sessionActive
    webSocket?.close(1000, "client_stop")
    teardown()
    if (wasActive) {
      emit("onSessionEnded", Arguments.createMap().apply { putString("reason", "client_stop") })
    }
    promise.resolve(true)
  }

  @ReactMethod
  fun isSessionActive(promise: Promise) {
    promise.resolve(sessionActive)
  }

  // RN's NativeEventEmitter warns ("was called with a non-null argument without the
  // required addListener/removeListeners method") unless the native module it wraps
  // implements these two - it's how the old bridge tracks listener add/remove counts.
  // We don't need to react to the counts ourselves (emit() below is unconditional), so
  // these are intentionally no-ops - see native/LiveVoice.ts's subscribeLiveVoice().
  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  private fun handleControlMessage(text: String) {
    val payload = runCatching { JSONObject(text) }.getOrNull() ?: return
    when (payload.optString("type")) {
      "proposed_tool" -> emit("onProposedTool", Arguments.makeNativeMap(payload.toMap()))
      "caption" -> emit("onCaption", Arguments.makeNativeMap(payload.toMap()))
      // An application-level error from GPT-Live-1 itself (bad billing, bad request,
      // etc.) - see live_voice.py's _pump_openai_events(). Reuses the same onError event
      // a connection failure would emit, since either way the session is effectively dead.
      "error" -> emit("onError", Arguments.createMap().apply { putString("message", payload.optString("message")) })
      else -> Log.d(TAG, "Unhandled control message: ${payload.optString("type")}")
    }
  }

  private fun emit(eventName: String, params: WritableMap) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("AiosLiveVoice:$eventName", params)
  }

  // --- Audio capture (mic -> WebSocket) ---------------------------------------

  private fun startAudioCapture(webSocket: WebSocket): Boolean {
    // Claims (and stops) whatever VoiceActivationService buffered between "Hey Casper" and
    // now - see its drainHandoffBuffer() - so nothing said during the connection gap is
    // lost. Empty for a manually-tapped session (nothing was ever buffered). Deliberately
    // done before opening our own AudioRecord below: only one exclusive mic consumer at a
    // time, and this call is what stops the KWS one.
    val handoffSamples = VoiceActivationService.takeHandoffAudioSamples()
    if (handoffSamples.isNotEmpty()) {
      Log.i(TAG, "Flushing ${handoffSamples.size} buffered samples from the wake-word handoff")
      sendPcm16(webSocket, resample(handoffSamples, KWS_SAMPLE_RATE, SAMPLE_RATE))
    }

    val minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    if (minBuffer <= 0) return false

    val record = runCatching {
      AudioRecord(
        MediaRecorder.AudioSource.VOICE_COMMUNICATION,
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        max(minBuffer * 2, SAMPLE_RATE / 5),
      )
    }.getOrNull()

    if (record == null || record.state != AudioRecord.STATE_INITIALIZED) {
      record?.release()
      return false
    }

    if (AcousticEchoCanceler.isAvailable()) {
      echoCanceler = AcousticEchoCanceler.create(record.audioSessionId)?.apply { enabled = true }
    }
    if (NoiseSuppressor.isAvailable()) {
      noiseSuppressor = NoiseSuppressor.create(record.audioSessionId)?.apply { enabled = true }
    }

    audioRecord = record
    record.startRecording()
    if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
      Log.e(TAG, "AudioRecord failed to enter RECORDING state")
      return false
    }

    capturing = true
    captureThread = thread(start = true, name = "aios-live-voice-capture") {
      // 20ms frames at 16-bit mono: SAMPLE_RATE * 0.02 * 2 bytes.
      val buffer = ByteArray((SAMPLE_RATE * 0.02 * 2).toInt())
      while (capturing) {
        val count = runCatching { record.read(buffer, 0, buffer.size) }.getOrDefault(0)
        if (count <= 0) continue
        runCatching { webSocket.send(Buffer().write(buffer, 0, count).readByteString()) }
      }
    }
    return true
  }

  // Linear-interpolation resample from the wake-word service's KWS rate (16kHz, fixed by
  // the Sherpa model) to this module's own capture rate (24kHz). Good enough for a brief
  // speech pre-roll - not meant for anything higher fidelity.
  private fun resample(input: ShortArray, fromRate: Int, toRate: Int): ShortArray {
    if (input.isEmpty() || fromRate == toRate) return input
    val ratio = toRate.toDouble() / fromRate.toDouble()
    val output = ShortArray((input.size * ratio).toInt())
    for (i in output.indices) {
      val srcPos = i / ratio
      val srcIndex = srcPos.toInt().coerceIn(0, input.size - 1)
      val nextIndex = (srcIndex + 1).coerceAtMost(input.size - 1)
      val frac = srcPos - srcIndex
      output[i] = (input[srcIndex] + (input[nextIndex] - input[srcIndex]) * frac).toInt().toShort()
    }
    return output
  }

  private fun sendPcm16(webSocket: WebSocket, samples: ShortArray) {
    if (samples.isEmpty()) return
    // Little-endian, matching what AudioRecord.read(ByteArray, ...) already produces for
    // ENCODING_PCM_16BIT elsewhere in this file.
    val bytes = ByteArray(samples.size * 2)
    for (i in samples.indices) {
      val sample = samples[i].toInt()
      bytes[i * 2] = (sample and 0xFF).toByte()
      bytes[i * 2 + 1] = ((sample shr 8) and 0xFF).toByte()
    }
    runCatching { webSocket.send(Buffer().write(bytes, 0, bytes.size).readByteString()) }
  }

  private fun stopAudioCapture() {
    capturing = false
    val thread = captureThread
    if (thread != null && thread !== Thread.currentThread()) runCatching { thread.join(350) }
    captureThread = null
    runCatching { audioRecord?.stop() }
    echoCanceler?.release()
    noiseSuppressor?.release()
    audioRecord?.release()
    echoCanceler = null
    noiseSuppressor = null
    audioRecord = null
  }

  // --- Audio playback (WebSocket -> speaker) ----------------------------------

  private fun startAudioPlayback() {
    val minBuffer = AudioTrack.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val track = AudioTrack(
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build(),
      AudioFormat.Builder()
        .setSampleRate(SAMPLE_RATE)
        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .build(),
      max(minBuffer, SAMPLE_RATE / 5),
      AudioTrack.MODE_STREAM,
      android.media.AudioManager.AUDIO_SESSION_ID_GENERATE,
    )
    track.play()
    audioTrack = track
  }

  private fun stopAudioPlayback() {
    runCatching { audioTrack?.stop() }
    audioTrack?.release()
    audioTrack = null
  }

  private fun teardown() {
    sessionActive = false
    stopAudioCapture()
    stopAudioPlayback()
    webSocket = null
  }

  private fun JSONObject.toMap(): Map<String, Any?> = keys().asSequence().associateWith { key -> get(key).toReactValue() }
  private fun JSONArray.toList(): List<Any?> = (0 until length()).map { index -> get(index).toReactValue() }
  private fun Any.toReactValue(): Any? = when (this) {
    is JSONObject -> toMap()
    is JSONArray -> toList()
    JSONObject.NULL -> null
    else -> this
  }
}
