package com.ntsinga.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.core.app.NotificationCompat
import kotlin.math.abs

private const val CHANNEL_ID = "aios_overlay_channel"
private const val NOTIFICATION_ID = 4301
private const val ACTION_STOP = "com.ntsinga.mobile.OVERLAY_STOP"
private const val DRAG_THRESHOLD_PX = 12

// Hosts a small draggable floating bubble (TYPE_APPLICATION_OVERLAY) reachable from any app,
// per docs/AI_OS_ORCHESTRATOR_PLAN.md Phase 3.5 Step 1. Must run as a foreground service (with
// its own persistent, dismiss-only notification) because a backgrounded Activity cannot keep an
// overlay window alive. Tapping the bubble brings MainActivity to front; dragging moves it.
// v1 scope: the bubble is a launcher, not yet a rendered chat surface - see plan doc for the
// follow-up (hosting a real RN view inside the overlay window).
class OverlayService : Service() {
  private var windowManager: WindowManager? = null
  private var bubbleView: View? = null

  companion object {
    @Volatile private var latestBrief: String? = null
    @Volatile private var activeService: OverlayService? = null
    fun updateBrief(context: android.content.Context, text: String) { latestBrief = text.take(180); activeService?.startForegroundWithNotification() }
    @Volatile
    var isRunning: Boolean = false
      private set

    fun start(context: android.content.Context) {
      val intent = Intent(context, OverlayService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: android.content.Context) {
      context.stopService(Intent(context, OverlayService::class.java))
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    activeService = this
    startForegroundWithNotification()
    addBubble()
    isRunning = true
  }

  override fun onDestroy() {
    activeService = null
    super.onDestroy()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
    }
    return START_STICKY
  }

  private fun startForegroundWithNotification() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, "AI-OS overlay", NotificationManager.IMPORTANCE_LOW)
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    val stopIntent = Intent(this, OverlayService::class.java).apply { action = ACTION_STOP }
    val stopPendingIntent = PendingIntent.getService(
      this, 0, stopIntent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    val openIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
    }
    val openPendingIntent = PendingIntent.getActivity(
      this, 0, openIntent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("AI-OS is active")
      .setContentText(latestBrief ?: "Tap the bubble to open the assistant.")
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentIntent(openPendingIntent)
      .addAction(0, "Stop", stopPendingIntent)
      .setOngoing(true)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun addBubble() {
    val manager = getSystemService(WINDOW_SERVICE) as WindowManager
    windowManager = manager

    val density = resources.displayMetrics.density
    val outerSize = (56 * density).toInt()
    val bubble = buildBrandBubbleView(outerSize)

    val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
    }

    val params = WindowManager.LayoutParams(
      outerSize,
      outerSize,
      overlayType,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = 0
      y = 300
    }

    var initialX = 0
    var initialY = 0
    var initialTouchX = 0f
    var initialTouchY = 0f
    var isDragging = false

    bubble.setOnTouchListener { _, event ->
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          initialX = params.x
          initialY = params.y
          initialTouchX = event.rawX
          initialTouchY = event.rawY
          isDragging = false
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = (event.rawX - initialTouchX).toInt()
          val dy = (event.rawY - initialTouchY).toInt()
          if (abs(dx) > DRAG_THRESHOLD_PX || abs(dy) > DRAG_THRESHOLD_PX) {
            isDragging = true
          }
          params.x = initialX + dx
          params.y = initialY + dy
          runCatching { windowManager?.updateViewLayout(bubble, params) }
          true
        }
        MotionEvent.ACTION_UP -> {
          if (!isDragging) {
            openApp()
          }
          true
        }
        else -> false
      }
    }

    runCatching { manager.addView(bubble, params) }.onSuccess { bubbleView = bubble }
  }

  // Mirrors mobile/src/components/BrandMark.tsx: a blue->purple gradient ring with a dark
  // inner circle holding two vertical gradient "eyes", built from plain Views/drawables since
  // an overlay window cannot host a React Native tree without a much larger integration.
  private fun buildBrandBubbleView(outerSizePx: Int): View {
    val density = resources.displayMetrics.density
    val innerSize = (outerSizePx * 0.82f).toInt()
    val eyeWidth = (outerSizePx * 0.11f).toInt()
    val eyeHeight = (outerSizePx * 0.28f).toInt()
    val eyeGap = (outerSizePx * 0.14f).toInt()

    fun brandGradient() = GradientDrawable(
      GradientDrawable.Orientation.TL_BR,
      intArrayOf(Color.parseColor("#4F7CF6"), Color.parseColor("#8B5CF6"))
    )

    val ring = FrameLayout(this).apply {
      layoutParams = FrameLayout.LayoutParams(outerSizePx, outerSizePx)
      background = brandGradient().apply { shape = GradientDrawable.OVAL }
    }

    val inner = FrameLayout(this).apply {
      layoutParams = FrameLayout.LayoutParams(innerSize, innerSize, Gravity.CENTER)
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor("#080B14"))
      }
    }

    val eyeRow = android.widget.LinearLayout(this).apply {
      layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER)
      orientation = android.widget.LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }

    repeat(2) { index ->
      val eye = View(this).apply {
        val lp = android.widget.LinearLayout.LayoutParams(eyeWidth, eyeHeight)
        if (index == 1) lp.marginStart = eyeGap
        layoutParams = lp
        background = brandGradient().apply { cornerRadius = eyeWidth / 2f }
      }
      eyeRow.addView(eye)
    }

    inner.addView(eyeRow)
    ring.addView(inner)
    ring.elevation = 8 * density
    return ring
  }

  private fun openApp() {
    val intent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
    }
    intent?.let { startActivity(it) }
  }

  override fun onDestroy() {
    bubbleView?.let { view -> runCatching { windowManager?.removeView(view) } }
    bubbleView = null
    isRunning = false
    super.onDestroy()
  }
}
