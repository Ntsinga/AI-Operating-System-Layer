package com.ntsinga.mobile

import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/** Restores apps when a persisted focus policy reaches its deadline. */
class FocusPolicyReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val prefs = context.getSharedPreferences("aios_focus_policy", Context.MODE_PRIVATE)
    val packages = prefs.getStringSet("packages", emptySet()).orEmpty()
    val manager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    if (packages.isNotEmpty() && manager.isDeviceOwnerApp(context.packageName)) {
      try {
        manager.setPackagesSuspended(
          ComponentName(context, AiosDeviceAdminReceiver::class.java),
          packages.toTypedArray(), false
        )
      } catch (_: Exception) { /* keep the policy record for the next foreground verification */ }
    }
    prefs.edit().clear().apply()
  }
}
