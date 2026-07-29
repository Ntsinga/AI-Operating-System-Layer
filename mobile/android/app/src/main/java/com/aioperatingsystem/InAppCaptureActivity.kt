package com.aioperatingsystem

import android.Manifest
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

const val EXTRA_RESULT_URI = "resultUri"
const val EXTRA_ERROR_MESSAGE = "errorMessage"
const val EXTRA_CAPTURE_MODE = "captureMode"
const val CAPTURE_MODE_PHOTO = "photo"
const val CAPTURE_MODE_VIDEO = "video"

private const val PHOTO_COUNTDOWN_SECONDS = 3
private const val VIDEO_MAX_DURATION_SECONDS = 60
private const val PERMISSION_REQUEST_CODE = 5301

// A real in-app camera (not an Intent to the stock Camera app), because neither auto-firing
// after a countdown (photo) nor auto-starting immediately (video) can be driven through
// ACTION_IMAGE_CAPTURE/ACTION_VIDEO_CAPTURE Intent extras - those only open the Camera app's
// own UI and wait for a manual tap. Both modes stay fully visible on screen (preview + status
// text + a Stop button for video) - this is an automated capture, not a hidden/silent one.
// See docs/AI_OS_ORCHESTRATOR_PLAN.md item 5/6 and ERROR_LOG.md.
class InAppCaptureActivity : AppCompatActivity() {
  private lateinit var previewView: PreviewView
  private lateinit var statusText: TextView
  private lateinit var stopButton: Button
  private var imageCapture: ImageCapture? = null
  private var videoCapture: VideoCapture<Recorder>? = null
  private var activeRecording: Recording? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private var recordedSeconds = 0
  private var finished = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val root = FrameLayout(this).apply {
      layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    }

    previewView = PreviewView(this).apply {
      layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    }
    root.addView(previewView)

    statusText = TextView(this).apply {
      layoutParams = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
        Gravity.CENTER
      )
      textSize = 64f
      setTextColor(Color.WHITE)
      setShadowLayer(12f, 0f, 0f, Color.BLACK)
    }
    root.addView(statusText)

    stopButton = Button(this).apply {
      layoutParams = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
        Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
      ).apply { bottomMargin = 96 }
      text = "Stop"
      visibility = android.view.View.GONE
      setOnClickListener { stopVideoRecording() }
    }
    root.addView(stopButton)

    setContentView(root)
    ensurePermissionsThenStartCamera()
  }

  private fun isVideoMode(): Boolean = intent.getStringExtra(EXTRA_CAPTURE_MODE) == CAPTURE_MODE_VIDEO

  // MediaCaptureModule pre-checks/requests these before starting this activity via the RN
  // bridge, but the overlay's quick-action menu (OverlayService.kt) launches this activity
  // directly with a plain startActivity - no promise, no pre-check. Owning the permission
  // check here makes the activity work correctly regardless of caller.
  private fun ensurePermissionsThenStartCamera() {
    val required = mutableListOf(Manifest.permission.CAMERA)
    if (isVideoMode()) required.add(Manifest.permission.RECORD_AUDIO)

    val missing = required.filter {
      ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
    }

    if (missing.isEmpty()) {
      startCamera()
    } else {
      ActivityCompat.requestPermissions(this, missing.toTypedArray(), PERMISSION_REQUEST_CODE)
    }
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode != PERMISSION_REQUEST_CODE) return
    if (grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
      startCamera()
    } else {
      finishWithError("Camera or microphone permission was not granted.")
    }
  }

  private fun startCamera() {
    val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
    cameraProviderFuture.addListener({
      try {
        val cameraProvider = cameraProviderFuture.get()

        val preview = Preview.Builder().build().also {
          it.surfaceProvider = previewView.surfaceProvider
        }

        cameraProvider.unbindAll()

        if (isVideoMode()) {
          // Quality.HIGHEST (not a fixed value like SD/HD) lets CameraX resolve to whatever
          // the actual camera supports - a fixed quality can be unsupported on some devices,
          // notably emulators with a software/virtual camera backend (see ERROR_LOG.md).
          val recorder = Recorder.Builder().setQualitySelector(QualitySelector.from(Quality.HIGHEST)).build()
          val capture = VideoCapture.withOutput(recorder)
          videoCapture = capture
          cameraProvider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, capture)
          startVideoRecording()
        } else {
          val capture = ImageCapture.Builder().build()
          imageCapture = capture
          cameraProvider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, capture)
          runPhotoCountdown(PHOTO_COUNTDOWN_SECONDS)
        }
      } catch (error: Exception) {
        finishWithError("Failed to start camera: ${error.message}")
      }
    }, ContextCompat.getMainExecutor(this))
  }

  // --- Photo: countdown then auto-capture ---

  private fun runPhotoCountdown(secondsLeft: Int) {
    if (secondsLeft <= 0) {
      statusText.text = ""
      capturePhoto()
      return
    }

    statusText.text = secondsLeft.toString()
    mainHandler.postDelayed({ runPhotoCountdown(secondsLeft - 1) }, 1000L)
  }

  private fun capturePhoto() {
    val capture = imageCapture
    if (capture == null) {
      finishWithError("Camera was not ready.")
      return
    }

    try {
      val outputFile = createOutputFile("jpg")
      val outputOptions = ImageCapture.OutputFileOptions.Builder(outputFile).build()

      capture.takePicture(
        outputOptions,
        ContextCompat.getMainExecutor(this),
        object : ImageCapture.OnImageSavedCallback {
          override fun onImageSaved(output: ImageCapture.OutputFileResults) {
            finishWithUri(outputFile)
          }

          override fun onError(exception: ImageCaptureException) {
            finishWithError("Capture failed: ${exception.message}")
          }
        }
      )
    } catch (error: Exception) {
      finishWithError("Capture failed: ${error.message}")
    }
  }

  // --- Video: start immediately, stop on tap or after a max safety duration ---

  private fun startVideoRecording() {
    val capture = videoCapture
    if (capture == null) {
      finishWithError("Camera was not ready.")
      return
    }

    try {
      val outputFile = createOutputFile("mp4")
      val outputOptions = FileOutputOptions.Builder(outputFile).build()

      activeRecording = capture.output
        .prepareRecording(this, outputOptions)
        .withAudioEnabled()
        .start(ContextCompat.getMainExecutor(this)) { event ->
          if (event is VideoRecordEvent.Finalize) {
            if (finished) return@start
            if (event.hasError()) {
              finishWithError("Recording failed: ${event.cause?.message}")
            } else {
              finishWithUri(outputFile)
            }
          }
        }

      stopButton.visibility = android.view.View.VISIBLE
      recordedSeconds = 0
      tickRecordingTimer()
    } catch (error: Exception) {
      finishWithError("Failed to start recording: ${error.message}")
    }
  }

  private fun tickRecordingTimer() {
    if (activeRecording == null) return

    val minutes = recordedSeconds / 60
    val seconds = recordedSeconds % 60
    statusText.text = "● %d:%02d".format(minutes, seconds)

    if (recordedSeconds >= VIDEO_MAX_DURATION_SECONDS) {
      stopVideoRecording()
      return
    }

    recordedSeconds += 1
    mainHandler.postDelayed({ tickRecordingTimer() }, 1000L)
  }

  private fun stopVideoRecording() {
    stopButton.visibility = android.view.View.GONE
    activeRecording?.stop()
    activeRecording = null
  }

  // --- Shared helpers ---

  private fun createOutputFile(extension: String): File {
    val fileName = "aios_${SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())}.$extension"
    val outputDir = File(cacheDir, "captures").apply { mkdirs() }
    return File(outputDir, fileName)
  }

  // The captured file always lands in the app's private cache first (createOutputFile), which
  // is invisible in Gallery/Photos and, when this activity is launched from the overlay's
  // quick-action menu (OverlayService.kt) via a bare startActivity with no result channel, is
  // never surfaced anywhere else either - from the user's side that looked identical to capture
  // silently failing. Copying into the public MediaStore makes every capture actually visible
  // regardless of how this activity was launched.
  private fun saveToMediaStore(file: File, isVideo: Boolean): Uri? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null // pre-scoped-storage path not worth the extra permission handling
    val collection = if (isVideo) {
      MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    } else {
      MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    }
    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
      put(MediaStore.MediaColumns.MIME_TYPE, if (isVideo) "video/mp4" else "image/jpeg")
      put(MediaStore.MediaColumns.RELATIVE_PATH, if (isVideo) "Movies/AI-OS" else "Pictures/AI-OS")
      put(MediaStore.MediaColumns.IS_PENDING, 1)
    }
    val itemUri = contentResolver.insert(collection, values) ?: return null
    contentResolver.openOutputStream(itemUri)?.use { out -> file.inputStream().use { it.copyTo(out) } }
    values.clear()
    values.put(MediaStore.MediaColumns.IS_PENDING, 0)
    contentResolver.update(itemUri, values, null, null)
    return itemUri
  }

  private fun finishWithUri(file: File) {
    if (finished) return
    finished = true
    val savedToGallery = runCatching { saveToMediaStore(file, isVideoMode()) }.getOrNull() != null
    Toast.makeText(
      this,
      if (savedToGallery) (if (isVideoMode()) "Video saved to Gallery" else "Photo saved to Gallery") else "Capture saved",
      Toast.LENGTH_SHORT
    ).show()
    val uri = FileProvider.getUriForFile(this, "$packageName.aiosfileprovider", file)
    val resultIntent = Intent().putExtra(EXTRA_RESULT_URI, uri.toString())
    setResult(RESULT_OK, resultIntent)
    finish()
  }

  private fun finishWithError(message: String) {
    if (finished) return
    finished = true
    val resultIntent = Intent().putExtra(EXTRA_ERROR_MESSAGE, message)
    setResult(RESULT_CANCELED, resultIntent)
    finish()
  }

  override fun onDestroy() {
    activeRecording?.stop()
    super.onDestroy()
  }
}
