package com.aioperatingsystem

import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import java.util.concurrent.atomic.AtomicInteger

/**
 * Requests a single runtime permission through the RN bridge's PermissionAwareActivity,
 * running [onGranted] if already granted or once the user approves the prompt. Rejects
 * [promise] with PERMISSION_DENIED if the user declines, or PERMISSION_ACTIVITY_UNAVAILABLE
 * if there is no foreground activity to host the prompt.
 */
object PermissionHelper {
  private val requestCodeSequence = AtomicInteger(1000)

  fun hasPermission(reactContext: ReactApplicationContext, permission: String): Boolean =
    ContextCompat.checkSelfPermission(reactContext, permission) == PackageManager.PERMISSION_GRANTED

  fun requestPermission(
    reactContext: ReactApplicationContext,
    permission: String,
    promise: Promise,
    onGranted: () -> Unit
  ) {
    if (ContextCompat.checkSelfPermission(reactContext, permission) == PackageManager.PERMISSION_GRANTED) {
      onGranted()
      return
    }

    val activity = reactContext.currentActivity as? PermissionAwareActivity
    if (activity == null) {
      promise.reject("PERMISSION_ACTIVITY_UNAVAILABLE", "No foreground activity available to request permission: $permission")
      return
    }

    val requestCode = requestCodeSequence.getAndIncrement()
    activity.requestPermissions(
      arrayOf(permission),
      requestCode,
      PermissionListener { code, _, grantResults ->
        if (code != requestCode) {
          return@PermissionListener false
        }

        if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
          onGranted()
        } else {
          promise.reject("PERMISSION_DENIED", "User denied permission: $permission")
        }
        true
      }
    )
  }
}
