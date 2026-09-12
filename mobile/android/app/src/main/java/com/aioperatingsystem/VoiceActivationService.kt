package com.aioperatingsystem

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.app.NotificationCompat
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.KeywordSpotter
import com.k2fsa.sherpa.onnx.KeywordSpotterConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineStream
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import java.net.URLEncoder
import java.util.Locale
import java.util.concurrent.Executors
import kotlin.concurrent.thread
import kotlin.math.max

private const val VOICE_CHANNEL_ID = "aios_voice_activation_channel"
private const val VOICE_NOTIFICATION_ID = 4302
private const val ACTION_STOP = "com.aioperatingsystem.VOICE_ACTIVATION_STOP"
private const val ACTION_RESUME_AFTER_LIVE_VOICE = "com.aioperatingsystem.VOICE_ACTIVATION_RESUME_AFTER_LIVE_VOICE"
private const val WAKE_PHRASE = "hey casper"
// Not private: LiveVoiceModule.kt reads this to resample the handoff buffer below to
// its own capture rate - same package, so no import needed.
const val KWS_SAMPLE_RATE = 16000
private const val KWS_MODEL_DIR = "sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01"
private const val COMMAND_LISTEN_TIMEOUT_MS = 3000L
// How long to keep audio buffered after "Hey Casper" while a live session connects, and
// the sample cap that corresponds to at 16kHz - generous enough to cover real connection
// latency (app foreground + WebSocket handshake) without buffering indefinitely if a
// session never claims it (see handoffBufferTimeout).
private const val HANDOFF_BUFFER_MAX_MS = 8000L
private const val HANDOFF_BUFFER_MAX_SAMPLES = KWS_SAMPLE_RATE * 8
private const val TAG = "AiosVoiceActivation"

/** Opt-in, foreground microphone listener for the "Hey Casper" activation phrase. */
class VoiceActivationService : Service() {
  private var recognizer: SpeechRecognizer? = null
  private var listening = false
  private var armedForCommand = false
  private var keywordSpotter: KeywordSpotter? = null
  private var keywordStream: OnlineStream? = null
  private var audioRecord: AudioRecord? = null
  private var keywordThread: Thread? = null
  @Volatile private var keywordListening = false
  private var keywordMode = false
  private val mainHandler = Handler(Looper.getMainLooper())

  // Audio buffered since "Hey Casper" while a live voice session connects (LiveVoiceModule
  // claims it via takeHandoffAudioSamples() the moment it's ready to open its own mic) - see
  // handleKeywordDetected()/beginHandoffBuffering(). Guarded by its own monitor since it's
  // written from the KWS capture thread and read from whatever thread claims it.
  private val pendingAudioChunks = mutableListOf<ShortArray>()
  private var pendingAudioSampleCount = 0
  @Volatile private var bufferingForHandoff = false
  private val handoffBufferTimeout = Runnable {
    if (bufferingForHandoff) {
      Log.i(TAG, "Live session never claimed the handoff audio buffer within ${HANDOFF_BUFFER_MAX_MS}ms; discarding it")
      synchronized(pendingAudioChunks) {
        bufferingForHandoff = false
        pendingAudioChunks.clear()
        pendingAudioSampleCount = 0
      }
    }
  }

  private val commandTimeout = Runnable {
    if (isRunning && armedForCommand) {
      Log.i(TAG, "No command received within ${COMMAND_LISTEN_TIMEOUT_MS}ms; returning to wake-word listening")
      armedForCommand = false
      listening = false
      runCatching { recognizer?.cancel() }
      OverlayService.setAttentionState(this, "idle")
      updateNotification("Listening for \"Hey Casper\"")
      if (keywordMode) startKeywordSpotter() else listen()
    }
  }
  private val modelExecutor = Executors.newSingleThreadExecutor()

  companion object {
    @Volatile
    var isRunning: Boolean = false
      private set

    @Volatile
    private var runningInstance: VoiceActivationService? = null

    /** Called by LiveVoiceModule.kt right before it opens its own AudioRecord for a live
     * session - hands back (and stops buffering) whatever was said since "Hey Casper", so
     * it can be sent as the session's first audio instead of being lost to the connection
     * gap. Returns an empty array if nothing was buffered (e.g. the session was started
     * from the manual chat-tab button, not the wake word). Safe to call from any thread. */
    fun takeHandoffAudioSamples(): ShortArray = runningInstance?.drainHandoffBuffer() ?: ShortArray(0)

    fun start(context: android.content.Context) {
      val intent = Intent(context, VoiceActivationService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
      else context.startService(intent)
    }

    fun stop(context: android.content.Context) {
      context.stopService(Intent(context, VoiceActivationService::class.java))
    }

    /** Called by VoiceActivationModule.notifyLiveSessionEnded() once a GPT-Live-1 session
     * that this service launched (see launchLiveVoice()) has ended, so the service can
     * resume wake-word listening. A no-op if the service isn't running - e.g. the user
     * started a live session from the manual chat button instead of the wake word, or
     * stopped voice activation entirely while a session was live. */
    fun resumeAfterLiveVoice(context: android.content.Context) {
      if (!isRunning) return
      context.startService(Intent(context, VoiceActivationService::class.java).apply { action = ACTION_RESUME_AFTER_LIVE_VOICE })
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    startForegroundWithNotification("Listening for \"Hey Casper\"")
    isRunning = true
    runningInstance = this

    // Prefer a dedicated on-device KWS loop. It only decodes the configured
    // phrase and therefore avoids the false accepts and latency of continuous
    // full-speech transcription. SpeechRecognizer remains a fallback for
    // devices where the bundled native runtime/model cannot initialize.
    // Model loading is deliberately off the app/service main thread. The
    // runtime can take a couple of seconds on first load and must not blank or
    // stall the React surface while the activation card is rendering.
    modelExecutor.execute {
      val initialized = initializeKeywordSpotter()
      mainHandler.post {
        if (!isRunning) return@post
        keywordMode = initialized
        if (keywordMode) {
          startKeywordSpotter()
        } else if (SpeechRecognizer.isRecognitionAvailable(this)) {
          initializeSpeechRecognizer()
          listen()
        } else {
          Log.e(TAG, "Neither Sherpa KWS nor Android SpeechRecognizer is available")
          stopSelf()
        }
      }
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) stopSelf()
    if (intent?.action == ACTION_RESUME_AFTER_LIVE_VOICE) resumeListeningAfterLiveVoice()
    return START_STICKY
  }

  private fun resumeListeningAfterLiveVoice() {
    if (!isRunning || keywordListening || listening) return
    Log.i(TAG, "Live voice session ended; resuming wake-word listening")
    OverlayService.setAttentionState(this, "idle")
    updateNotification("Listening for \"Hey Casper\"")
    if (keywordMode) startKeywordSpotter() else listen()
  }

  private val listener = object : RecognitionListener {
    override fun onReadyForSpeech(params: Bundle?) { listening = true }
    override fun onBeginningOfSpeech() = Unit
    override fun onRmsChanged(rmsdB: Float) = Unit
    override fun onBufferReceived(buffer: ByteArray?) = Unit
    override fun onEndOfSpeech() { listening = false }

    override fun onError(error: Int) {
      listening = false
      if (!isRunning) return
      if (keywordMode) {
        armedForCommand = false
        startKeywordSpotter()
      } else {
        listen()
      }
    }

    override fun onResults(results: Bundle?) {
      listening = false
      val candidates = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
      val confidenceScores = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
      val matchedTranscript = transcriptCandidates(candidates, confidenceScores)
      handleTranscript(matchedTranscript ?: candidates.firstOrNull()?.trim().orEmpty(), matchedTranscript != null)
      if (isRunning && !listening) {
        if (keywordMode && !armedForCommand) startKeywordSpotter() else if (!keywordMode) listen()
      }
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
    if (!isRunning || listening || keywordMode) return
    startCommandListening()
  }

  private fun startCommandListening() {
    if (!isRunning || listening) return
    initializeSpeechRecognizer()
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

  private fun initializeSpeechRecognizer() {
    if (recognizer != null) return
    if (!SpeechRecognizer.isRecognitionAvailable(this)) return
    recognizer = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
      SpeechRecognizer.createOnDeviceSpeechRecognizer(this)
    } else {
      SpeechRecognizer.createSpeechRecognizer(this)
    }).also { it.setRecognitionListener(listener) }
  }

  private fun initializeKeywordSpotter(): Boolean = runCatching {
    val modelDir = KWS_MODEL_DIR
    val config = KeywordSpotterConfig(
      featConfig = FeatureConfig(sampleRate = KWS_SAMPLE_RATE, featureDim = 80),
      modelConfig = OnlineModelConfig(
        transducer = OnlineTransducerModelConfig(
          encoder = "$modelDir/encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
          decoder = "$modelDir/decoder-epoch-12-avg-2-chunk-16-left-64.onnx",
          joiner = "$modelDir/joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
        ),
        tokens = "$modelDir/tokens.txt",
        numThreads = 1,
        provider = "cpu",
        modelType = "zipformer2",
      ),
      keywordsFile = "$modelDir/keywords.txt",
      // A moderate threshold is a safer starting point. It can be tuned from
      // false-accept/false-reject telemetry without retraining the model.
      // Keep detection permissive enough for accents, phone speakers, and quiet rooms.
      // False accepts are filtered by the follow-up command window; a missed wake word
      // leaves the user with no visible feedback at all.
      keywordsScore = 1.0f,
      keywordsThreshold = 0.10f,
      numTrailingBlanks = 1,
    )
    keywordSpotter = KeywordSpotter(assetManager = assets, config = config)
    Log.i(TAG, "Sherpa-ONNX KWS initialized for Hey Casper")
    true
  }.onFailure {
    Log.e(TAG, "Sherpa-ONNX KWS unavailable; falling back to SpeechRecognizer", it)
  }.getOrDefault(false)

  private fun startKeywordSpotter() {
    if (!isRunning || !keywordMode || keywordListening) return
    if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
      Log.w(TAG, "Microphone permission missing; cannot start KWS")
      return
    }
    val spotter = keywordSpotter ?: run {
      keywordMode = false
      initializeSpeechRecognizer()
      listen()
      return
    }
    val minBuffer = AudioRecord.getMinBufferSize(
      KWS_SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
    )
    if (minBuffer <= 0) {
      keywordMode = false
      initializeSpeechRecognizer()
      listen()
      return
    }
    val record = AudioRecord(
      MediaRecorder.AudioSource.VOICE_RECOGNITION,
      KWS_SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      max(minBuffer * 2, KWS_SAMPLE_RATE / 5),
    )
    val stream = spotter.createStream()
    if (stream.ptr == 0L || record.state != AudioRecord.STATE_INITIALIZED) {
      stream.release()
      record.release()
      keywordMode = false
      initializeSpeechRecognizer()
      listen()
      return
    }
    audioRecord = record
    keywordStream = stream
    keywordListening = true
    record.startRecording()
    if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
      Log.e(TAG, "AudioRecord failed to enter RECORDING state; falling back to SpeechRecognizer")
      keywordListening = false
      stream.release()
      record.release()
      keywordStream = null
      audioRecord = null
      keywordMode = false
      initializeSpeechRecognizer()
      listen()
      return
    }
    Log.i(TAG, "Sherpa KWS microphone started (sampleRate=$KWS_SAMPLE_RATE, buffer=$minBuffer)")
    keywordThread = thread(start = true, name = "aios-sherpa-kws") {
      val buffer = ShortArray(KWS_SAMPLE_RATE / 10)
      while (keywordListening) {
        val count = runCatching { record.read(buffer, 0, buffer.size) }.getOrDefault(0)
        if (count <= 0) continue
        if (bufferingForHandoff) {
          synchronized(pendingAudioChunks) {
            if (pendingAudioSampleCount < HANDOFF_BUFFER_MAX_SAMPLES) {
              pendingAudioChunks.add(buffer.copyOf(count))
              pendingAudioSampleCount += count
            }
          }
        }
        val samples = FloatArray(count) { buffer[it] / 32768.0f }
        stream.acceptWaveform(samples, KWS_SAMPLE_RATE)
        while (keywordListening && spotter.isReady(stream)) {
          spotter.decode(stream)
          val result = spotter.getResult(stream)
          if (result.keyword.isNotBlank()) {
            spotter.reset(stream)
            mainHandler.post { handleKeywordDetected(result.keyword) }
            break
          }
        }
      }
      stream.release()
      runCatching { record.stop() }
      record.release()
    }
    updateNotification("Listening for \"Hey Casper\" (on-device)")
  }

  private fun stopKeywordSpotter() {
    if (keywordListening) Log.i(TAG, "Stopping Sherpa KWS microphone for command capture")
    keywordListening = false
    runCatching { audioRecord?.stop() }
    val thread = keywordThread
    if (thread != null && thread !== Thread.currentThread()) runCatching { thread.join(350) }
    keywordThread = null
    keywordStream = null
    audioRecord = null
  }

  private fun handleKeywordDetected(keyword: String) {
    if (!isRunning || armedForCommand) return
    Log.i(TAG, "Wake word detected: $keyword - buffering audio while a live session connects")
    // Deliberately NOT stopping the KWS mic here - it keeps capturing into
    // pendingAudioChunks (see the read loop in startKeywordSpotter()) for as long as it
    // takes the live session to connect (app foreground + WebSocket handshake), so nothing
    // said right after "Hey Casper" is lost to that gap. LiveVoiceModule.kt claims (and
    // only then stops) it via takeHandoffAudioSamples() right before opening its own
    // AudioRecord. resumeAfterLiveVoice() (via notifyLiveSessionEnded() from JS) is still
    // what resumes listening if the session never claims the buffer at all.
    beginHandoffBuffering()
    OverlayService.setAttentionState(this, "listening")
    updateNotification("Hey Casper - live conversation")
    launchLiveVoice()
  }

  private fun beginHandoffBuffering() {
    synchronized(pendingAudioChunks) {
      pendingAudioChunks.clear()
      pendingAudioSampleCount = 0
      bufferingForHandoff = true
    }
    mainHandler.removeCallbacks(handoffBufferTimeout)
    mainHandler.postDelayed(handoffBufferTimeout, HANDOFF_BUFFER_MAX_MS)
  }

  private fun drainHandoffBuffer(): ShortArray {
    val wasBuffering = bufferingForHandoff
    mainHandler.removeCallbacks(handoffBufferTimeout)
    val merged = synchronized(pendingAudioChunks) {
      bufferingForHandoff = false
      val result = ShortArray(pendingAudioSampleCount)
      var offset = 0
      for (chunk in pendingAudioChunks) {
        chunk.copyInto(result, offset)
        offset += chunk.size
      }
      pendingAudioChunks.clear()
      pendingAudioSampleCount = 0
      result
    }
    if (wasBuffering) {
      Log.i(TAG, "Handing off ${merged.size} buffered samples to the live session")
      stopKeywordSpotter()
    }
    return merged
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
        scheduleCommandTimeout()
        OverlayService.setAttentionState(this, "attentive")
        updateNotification("Wake phrase heard - listening for your command")
      } else {
        cancelCommandTimeout()
        armedForCommand = false
        OverlayService.setAttentionState(this, "listening")
        launchCommand(command)
        returnToIdleSoon()
      }
      return
    }

    if (armedForCommand) {
      cancelCommandTimeout()
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

  private fun scheduleCommandTimeout() {
    mainHandler.removeCallbacks(commandTimeout)
    mainHandler.postDelayed(commandTimeout, COMMAND_LISTEN_TIMEOUT_MS)
  }

  private fun cancelCommandTimeout() {
    mainHandler.removeCallbacks(commandTimeout)
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

  /** Foregrounds the app straight into a live GPT-Live-1 conversation (LiveVoiceButton's
   * autoStart, via App.tsx's aios://voice?live=1 handling) instead of the old one-shot
   * SpeechRecognizer command capture. */
  private fun launchLiveVoice() {
    val intent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse("aios://voice?live=1")
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
    runningInstance = null
    mainHandler.removeCallbacksAndMessages(null)
    cancelCommandTimeout()
    stopKeywordSpotter()
    keywordSpotter?.release()
    keywordSpotter = null
    modelExecutor.shutdownNow()
    recognizer?.destroy()
    recognizer = null
    OverlayService.setAttentionState(this, "idle")
    super.onDestroy()
  }
}
