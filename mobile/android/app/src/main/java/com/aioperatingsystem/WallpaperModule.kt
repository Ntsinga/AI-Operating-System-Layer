package com.aioperatingsystem

import android.app.WallpaperManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.net.HttpURLConnection
import java.net.URL

private const val MAX_IMAGE_BYTES = 25 * 1024 * 1024

class WallpaperModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AiosWallpaper"

  @ReactMethod
  fun setWallpaper(imageUri: String, target: String, promise: Promise) {
    Thread {
      try {
        val normalizedTarget = target.lowercase()
        val flags = when (normalizedTarget) {
          "home", "system" -> WallpaperManager.FLAG_SYSTEM
          "lock" -> WallpaperManager.FLAG_LOCK
          "both" -> WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK
          else -> throw IllegalArgumentException("Target must be home, lock, or both.")
        }

        val manager = WallpaperManager.getInstance(reactContext)
        // Launchers request a canvas wider than the physical screen for horizontal-scroll
        // parallax; a normal (non-panorama) source image handed to setStream() with no crop
        // hint gets treated as if it already filled that wide canvas, so only a small
        // zoomed-in slice ends up visible. Explicitly scale-to-cover and center-crop to the
        // launcher's actual requested size instead.
        val targetWidth = manager.desiredMinimumWidth.takeIf { it > 0 } ?: reactContext.resources.displayMetrics.widthPixels
        val targetHeight = manager.desiredMinimumHeight.takeIf { it > 0 } ?: reactContext.resources.displayMetrics.heightPixels

        val bytes = readImageBytes(imageUri)
        val bitmap = decodeFittingCanvas(bytes, targetWidth, targetHeight)

        manager.setBitmap(bitmap, null, true, flags)

        val result = Arguments.createMap().apply {
          putString("imageUri", imageUri)
          putString("target", normalizedTarget)
          putInt("width", bitmap.width)
          putInt("height", bitmap.height)
        }
        bitmap.recycle()
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("WALLPAPER_SET_FAILED", error.message ?: "Failed to set wallpaper.", error)
      }
    }.start()
  }

  private fun decodeFittingCanvas(bytes: ByteArray, targetWidth: Int, targetHeight: Int): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      throw IllegalArgumentException("The selected file is not a valid image.")
    }

    var sampleSize = 1
    while (bounds.outWidth / (sampleSize * 2) >= targetWidth && bounds.outHeight / (sampleSize * 2) >= targetHeight) {
      sampleSize *= 2
    }

    val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sampleSize })
      ?: throw IllegalArgumentException("Could not decode the selected image.")

    return centerCropToSize(decoded, targetWidth, targetHeight)
  }

  // Scales to cover the target size (never stretches/distorts), then crops the overflow evenly
  // from center - the standard "cover" behavior most wallpaper pickers use.
  private fun centerCropToSize(source: Bitmap, targetWidth: Int, targetHeight: Int): Bitmap {
    val sourceRatio = source.width.toFloat() / source.height.toFloat()
    val targetRatio = targetWidth.toFloat() / targetHeight.toFloat()
    val scale = if (sourceRatio > targetRatio) targetHeight.toFloat() / source.height.toFloat() else targetWidth.toFloat() / source.width.toFloat()
    val scaledWidth = (source.width * scale).toInt().coerceAtLeast(1)
    val scaledHeight = (source.height * scale).toInt().coerceAtLeast(1)
    val scaled = Bitmap.createScaledBitmap(source, scaledWidth, scaledHeight, true)
    if (scaled !== source) source.recycle()

    val x = ((scaledWidth - targetWidth) / 2).coerceAtLeast(0)
    val y = ((scaledHeight - targetHeight) / 2).coerceAtLeast(0)
    val cropWidth = targetWidth.coerceAtMost(scaledWidth)
    val cropHeight = targetHeight.coerceAtMost(scaledHeight)
    val cropped = Bitmap.createBitmap(scaled, x, y, cropWidth, cropHeight)
    if (cropped !== scaled) scaled.recycle()
    return cropped
  }

  private fun readImageBytes(imageUri: String): ByteArray {
    val input = when {
      imageUri.startsWith("http://") || imageUri.startsWith("https://") -> {
        val connection = URL(imageUri).openConnection() as HttpURLConnection
        connection.connectTimeout = 10_000
        connection.readTimeout = 20_000
        connection.instanceFollowRedirects = true
        connection.connect()
        if (connection.responseCode !in 200..299) {
          connection.disconnect()
          throw IllegalArgumentException("Image download failed with HTTP ${connection.responseCode}.")
        }
        connection.inputStream
      }
      imageUri.startsWith("content://") || imageUri.startsWith("file://") -> {
        reactContext.contentResolver.openInputStream(Uri.parse(imageUri))
          ?: throw IllegalArgumentException("Could not open image URI.")
      }
      else -> FileInputStream(File(imageUri))
    }

    input.use { stream ->
      val output = ByteArrayOutputStream()
      val buffer = ByteArray(8192)
      var total = 0
      while (true) {
        val read = stream.read(buffer)
        if (read < 0) break
        total += read
        if (total > MAX_IMAGE_BYTES) {
          throw IllegalArgumentException("Image is larger than 25 MB.")
        }
        output.write(buffer, 0, read)
      }
      return output.toByteArray()
    }
  }
}
