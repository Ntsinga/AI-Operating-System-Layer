package com.aioperatingsystem

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

class ScheduledAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val channelId = "aios_scheduled_alarms"
    val notifications = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      notifications.createNotificationChannel(NotificationChannel(channelId, "AI-OS alarms", NotificationManager.IMPORTANCE_HIGH))
    }
    val launch = PendingIntent.getActivity(
      context, 9901, Intent(context, MainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val label = intent.getStringExtra("label")?.ifBlank { "AI-OS alarm" } ?: "AI-OS alarm"
    notifications.notify(intent.getIntExtra("notificationId", 9901), NotificationCompat.Builder(context, channelId)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle("AI-OS alarm")
      .setContentText(label)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(launch)
      .build())
  }
}
