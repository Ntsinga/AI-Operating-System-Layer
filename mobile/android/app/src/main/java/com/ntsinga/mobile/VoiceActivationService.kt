package com.ntsinga.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.app.NotificationCompat
import java.net.URLEncoder
import java.util.Locale

private const val VOICE_CHANNEL_ID = "aios_voice_activation_channel"
private const val VOICE_NOTIFICATION_ID = 4302
private const val ACTION_STOP = "com.ntsinga.mobile.VOICE_ACTIVATION_STOP"
private const val WAKE_PHRASE = "hey casper"

/** Opt-in, foreground microphone listener for the "Hey Casper" activation phrase. */
class VoiceActivationService : Service() {
  private var recognizer: SpeechRecognizer? = null
  private var listening = false
  private var armedForCommand = false
  private val mainHandler = Handler(Looper.getMainLooper())

  companion object {
    @Volatile
    var isRunning: Boolean = false
      private set

    fun start(context: android.content.Context) {
      val intent = Intent(context, VoiceActivationService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
      else context.startService(intent)
    }

    fun stop(context: android.content.Context) {
      context.stopService(Intent(context, VoiceActivationService::class.java))
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    if (!SpeechRecognizer.isRecognitionAvailable(this)) {
      stopSelf()
      return
    }

    startForegroundWithNotification("Listening for \"Hey Casper\"")
    recognizer = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
      SpeechRecognizer.createOnDeviceSpeechRecognizer(this)
    } else {
      SpeechRecognizer.createSpeechRecognizer(this)
    }).also { it.setRecognitionListener(listener) }
    isRunning = true
    listen()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) stopSelf()
    return START_STICKY
  }

  private val listener = object : RecognitionListener {
    override fun onReadyForSpeech(params: Bundle?) { listening = true }
    override fun onBeginningOfSpeech() = Unit
    override fun onRmsChanged(rmsdB: Float) = Unit
    override fun onBufferReceived(buffer: ByteArray?) = Unit
    override fun onEndOfSpeech() { listening = false }

    override fun onError(error: Int) {
      listening = false
      if (isRunning) listen()
    }

    override fun onResults(results: Bundle?) {
      listening = false
      val candidates = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
      val confidenceScores = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
      val matchedTranscript = transcriptCandidates(candidates, confidenceScores)
      handleTranscript(matchedTranscript ?: candidates.firstOrNull()?.trim().orEmpty(), matchedTranscript != null)
      if (isRunning && !listening) listen()
    }

    override fun onPartialResults(partialResults: Bundle?) {
      val partial = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
      if (partial.any { wakePhraseIndex(normalize(it)) >= 0 }) {
        OverlayService.setAttentionState(this@VoiceActivationService, "attentive")
      }
    }

    override fun onEvent(eventType: Int, params: Bundle?) = Unit
  }

  private fun listen() {
    if (!isRunning || listening) return
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        putExtra(RecognizerIntent.EXTRA_REQUEST_WORD_CONFIDENCE, true)
      }
      putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
    }
    runCatching {
      recognizer?.startListening(intent)
      listening = true
    }.onFailure { listening = false }
  }

  private fun handleTranscript(rawTranscript: String, wakeCandidate: Boolean = false) {
    if (rawTranscript.isBlank()) return
    val transcript = normalize(rawTranscript)
    val wakeIndex = wakePhraseIndex(transcript)
    if (wakeIndex >= 0 && (wakeCandidate || wakePhraseIndex(transcript) >= 0)) {
      val matchedPhrase = wakePhraseAt(transcript, wakeIndex)
      val command = transcript.substring(wakeIndex + matchedPhrase.length)
        .trim(' ', ',', '.', ':', ';', '-', '—')
      if (command.isBlank()) {
        armedForCommand = true
        OverlayService.setAttentionState(this, "attentive")
        updateNotification("Wake phrase heard - listening for your command")
      } else {
        armedForCommand = false
        OverlayService.setAttentionState(this, "listening")
        launchCommand(command)
        returnToIdleSoon()
      }
      return
    }

    if (armedForCommand) {
      armedForCommand = false
      OverlayService.setAttentionState(this, "listening")
      launchCommand(rawTranscript.trim())
      updateNotification("Listening for \"Hey Casper\"")
      returnToIdleSoon()
    }
  }

  private fun transcriptCandidates(candidates: List<String>, confidenceScores: FloatArray?): String? {
    candidates.forEachIndexed { index, candidate ->
      val confidence = confidenceScores?.getOrNull(index)
      if (wakePhraseIndex(normalize(candidate)) >= 0 && (confidence == null || confidence >= 0.35f)) {
        return candidate.trim()
      }
    }
    return null
  }

  // SpeechRecognizer cannot be retrained with a user's sample. These aliases handle the most
  // common Casper/Kasper/Caspar/Asper transcriptions while requiring the two-word phrase.
  private fun wakePhraseIndex(transcript: String): Int = listOf(
    "hey casper", "hey kasper", "hey caspar", "hey asper"
  ).map { transcript.indexOf(it) }.filter { it >= 0 }.minOrNull() ?: -1

  private fun wakePhraseAt(transcript: String, index: Int): String = listOf(
    "hey casper", "hey kasper", "hey caspar", "hey asper"
  ).firstOrNull { transcript.startsWith(it, index) } ?: WAKE_PHRASE

  private fun normalize(value: String): String = value.lowercase(Locale.getDefault()).replace(Regex("\\s+"), " ").trim()

  private fun returnToIdleSoon() {
    mainHandler.postDelayed({
      if (isRunning && !armedForCommand) OverlayService.setAttentionState(this, "idle")
    }, 2200L)
  }

  private fun launchCommand(command: String) {
    val encoded = URLEncoder.encode(command, Charsets.UTF_8.name())
    val intent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse("aios://voice?command=$encoded")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
    }
    intent?.let { startActivity(it) }
  }

  private fun startForegroundWithNotification(text: String) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(VOICE_CHANNEL_ID, "AI-OS voice activation", NotificationManager.IMPORTANCE_LOW)
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
    val stopIntent = Intent(this, VoiceActivationService::class.java).apply { action = ACTION_STOP }
    val stopPendingIntent = PendingIntent.getService(this, 0, stopIntent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val notification: Notification = NotificationCompat.Builder(this, VOICE_CHANNEL_ID)
      .setContentTitle("AI-OS voice activation")
      .setContentText(text)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setOngoing(true)
      .addAction(0, "Stop", stopPendingIntent)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(VOICE_NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } else startForeground(VOICE_NOTIFICATION_ID, notification)
  }

  private fun updateNotification(text: String) { startForegroundWithNotification(text) }

  override fun onDestroy() {
    isRunning = false
    mainHandler.removeCallbacksAndMessages(null)
    recognizer?.destroy()
    recognizer = null
    OverlayService.setAttentionState(this, "idle")
    super.onDestroy()
  }
}
