package com.aioperatingsystem

import android.app.WallpaperManager
import android.graphics.BitmapFactory
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayInputStream
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

        val bytes = readImageBytes(imageUri)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
          throw IllegalArgumentException("The selected file is not a valid image.")
        }

        WallpaperManager.getInstance(reactContext).setStream(
          ByteArrayInputStream(bytes),
          null,
          true,
          flags
        )

        val result = Arguments.createMap().apply {
          putString("imageUri", imageUri)
          putString("target", normalizedTarget)
          putInt("width", bounds.outWidth)
          putInt("height", bounds.outHeight)
        }
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("WALLPAPER_SET_FAILED", error.message ?: "Failed to set wallpaper.", error)
      }
    }.start()
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
