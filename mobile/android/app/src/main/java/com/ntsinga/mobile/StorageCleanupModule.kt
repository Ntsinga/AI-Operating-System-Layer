package com.ntsinga.mobile

import android.Manifest
import android.content.ContentUris
import android.content.pm.PackageManager
import android.app.Activity
import android.os.Build
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ActivityEventListener
import java.util.concurrent.TimeUnit

class StorageCleanupModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {
  private var pendingDeletePromise: Promise? = null
  private var pendingDeleteCount = 0

  init { reactContext.addActivityEventListener(this) }

  companion object { private const val DELETE_REQUEST_CODE = 4901 }
  override fun getName(): String = "AiosStorageCleanup"

  @ReactMethod
  fun findStorageCandidates(maxItems: Double, promise: Promise) {
    requestMediaAccess(promise) {
      Thread {
        try {
          val limit = maxItems.toInt().coerceIn(1, 100)
          val projection = arrayOf(
            MediaStore.Files.FileColumns._ID,
            MediaStore.Files.FileColumns.DISPLAY_NAME,
            MediaStore.Files.FileColumns.SIZE,
            MediaStore.Files.FileColumns.DATE_MODIFIED,
            MediaStore.Files.FileColumns.MIME_TYPE,
            MediaStore.Files.FileColumns.MEDIA_TYPE
          )
          val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL)
          } else {
            MediaStore.Files.getContentUri("external")
          }
          val nowSeconds = System.currentTimeMillis() / 1000L
          val result = Arguments.createArray()
          reactContext.contentResolver.query(
            collection,
            projection,
            "${MediaStore.Files.FileColumns.SIZE} > ?",
            arrayOf("0"),
            "${MediaStore.Files.FileColumns.SIZE} DESC"
          )?.use { cursor ->
            val idIndex = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID)
            val nameIndex = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
            val sizeIndex = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
            val modifiedIndex = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_MODIFIED)
            val mimeIndex = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MIME_TYPE)
            val mediaTypeIndex = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MEDIA_TYPE)
            var count = 0
            while (cursor.moveToNext() && count < limit) {
              val id = cursor.getLong(idIndex)
              val size = cursor.getLong(sizeIndex)
              val modified = cursor.getLong(modifiedIndex)
              val ageDays = ((nowSeconds - modified).coerceAtLeast(0L)) / TimeUnit.DAYS.toSeconds(1)
              val mediaType = cursor.getInt(mediaTypeIndex)
              if (mediaType != MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE &&
                mediaType != MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO &&
                mediaType != MediaStore.Files.FileColumns.MEDIA_TYPE_AUDIO) continue
              val uri = ContentUris.withAppendedId(collection, id)
              result.pushMap(Arguments.createMap().apply {
                putString("uri", uri.toString())
                putString("name", cursor.getString(nameIndex) ?: "Unnamed file")
                putString("mimeType", cursor.getString(mimeIndex) ?: "application/octet-stream")
                putDouble("sizeBytes", size.toDouble())
                putDouble("sizeMb", size / (1024.0 * 1024.0))
                putDouble("modifiedAtMillis", modified * 1000.0)
                putInt("ageDays", ageDays.toInt())
                putString("reason", when {
                  size >= 100L * 1024L * 1024L -> "large_file"
                  ageDays >= 180 -> "old_media"
                  else -> "largest_media"
                })
              })
              count++
            }
          }
          promise.resolve(result)
        } catch (error: Exception) {
          promise.reject("STORAGE_CANDIDATES_FAILED", error)
        }
      }.start()
    }
  }

  @ReactMethod
  fun deleteStorageCandidates(uris: ReadableArray, promise: Promise) {
    val parsedUris = (0 until uris.size()).mapNotNull { index ->
      uris.getString(index)?.let { android.net.Uri.parse(it) }
    }.distinct()
    if (parsedUris.isEmpty() || parsedUris.size > 100) {
      promise.reject("STORAGE_DELETE_INVALID_SELECTION", "Select between 1 and 100 media items.")
      return
    }
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("STORAGE_DELETE_ACTIVITY_UNAVAILABLE", "A foreground activity is required for confirmation.")
      return
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      try {
        val request = MediaStore.createDeleteRequest(reactContext.contentResolver, parsedUris)
        pendingDeletePromise = promise
        pendingDeleteCount = parsedUris.size
        activity.startIntentSenderForResult(request.intentSender, DELETE_REQUEST_CODE, null, 0, 0, 0)
      } catch (error: Exception) {
        promise.reject("STORAGE_DELETE_CONFIRMATION_FAILED", error)
      }
    } else {
      Thread {
        try {
          var deleted = 0
          parsedUris.forEach { if (reactContext.contentResolver.delete(it, null, null) > 0) deleted++ }
          promise.resolve(Arguments.createMap().apply {
            putInt("deletedCount", deleted)
            putBoolean("confirmed", true)
          })
        } catch (error: Exception) {
          promise.reject("STORAGE_DELETE_FAILED", error)
        }
      }.start()
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: android.content.Intent?) {
    if (requestCode != DELETE_REQUEST_CODE) return
    val promise = pendingDeletePromise ?: return
    pendingDeletePromise = null
    if (resultCode == Activity.RESULT_OK) {
      promise.resolve(Arguments.createMap().apply {
        putInt("deletedCount", pendingDeleteCount)
        putBoolean("confirmed", true)
      })
    } else {
      promise.reject("STORAGE_DELETE_CANCELLED", "The system delete confirmation was cancelled.")
    }
    pendingDeleteCount = 0
  }

  override fun onNewIntent(intent: android.content.Intent) {}

  private fun requestMediaAccess(promise: Promise, onGranted: () -> Unit) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      PermissionHelper.requestPermission(reactContext, Manifest.permission.READ_MEDIA_IMAGES, promise) {
        PermissionHelper.requestPermission(reactContext, Manifest.permission.READ_MEDIA_VIDEO, promise) {
          PermissionHelper.requestPermission(reactContext, Manifest.permission.READ_MEDIA_AUDIO, promise, onGranted)
        }
      }
    } else {
      PermissionHelper.requestPermission(reactContext, Manifest.permission.READ_EXTERNAL_STORAGE, promise, onGranted)
    }
  }
}
