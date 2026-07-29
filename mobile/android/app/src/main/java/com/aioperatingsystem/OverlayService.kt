package com.aioperatingsystem

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
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import androidx.core.app.NotificationCompat
import kotlin.math.abs

private const val CHANNEL_ID = "aios_overlay_channel"
private const val NOTIFICATION_ID = 4301
private const val ACTION_STOP = "com.aioperatingsystem.OVERLAY_STOP"
private const val DRAG_THRESHOLD_PX = 12
private const val ACTION_ATTENTION = "com.aioperatingsystem.OVERLAY_ATTENTION"
private const val EXTRA_ATTENTION = "attention"

// Hosts a small draggable floating bubble (TYPE_APPLICATION_OVERLAY) reachable from any app,
// per docs/AI_OS_ORCHESTRATOR_PLAN.md Phase 3.5 Step 1. Must run as a foreground service (with
// its own persistent, dismiss-only notification) because a backgrounded Activity cannot keep an
// overlay window alive. Tapping the bubble brings MainActivity to front; dragging moves it.
// v1 scope: the bubble is a launcher, not yet a rendered chat surface - see plan doc for the
// follow-up (hosting a real RN view inside the overlay window).
class OverlayService : Service() {
  private var windowManager: WindowManager? = null
  private var bubbleView: View? = null
  private var bubbleRing: GradientDrawable? = null
  private var attentionState: String = "idle"
  private var trashView: View? = null
  private var trashParams: WindowManager.LayoutParams? = null
  private var trashBackground: GradientDrawable? = null
  private var overTrash = false
  private var menuOpen = false
  private val actionViews = mutableListOf<View>()

  companion object {
    @Volatile private var latestBrief: String? = null
    @Volatile private var activeService: OverlayService? = null
    fun updateBrief(context: android.content.Context, text: String) { latestBrief = text.take(180); activeService?.startForegroundWithNotification() }
    @Volatile
    var isRunning: Boolean = false
      private set

    fun hasPermission(context: android.content.Context): Boolean =
      Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

    fun setAttentionState(context: android.content.Context, state: String) {
      activeService?.applyAttentionState(state)
        ?: context.sendBroadcast(Intent(ACTION_ATTENTION).putExtra(EXTRA_ATTENTION, state))
    }

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
    addTrash()
    addBubble()
    isRunning = true
    applyAttentionState("idle")
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
    } else if (intent?.action == ACTION_ATTENTION) {
      applyAttentionState(intent.getStringExtra(EXTRA_ATTENTION) ?: "idle")
    }
    return START_STICKY
  }

  private fun applyAttentionState(state: String) {
    attentionState = when (state) {
      "attentive", "listening" -> state
      else -> "idle"
    }
    val (color, scale, text) = when (attentionState) {
      "attentive" -> Triple(Color.parseColor("#F6B84F"), 1.16f, "I heard you - listening for a command")
      "listening" -> Triple(Color.parseColor("#5FD1A0"), 1.12f, "Listening to your command")
      else -> Triple(null, 1.0f, latestBrief ?: "Tap the bubble to open the assistant.")
    }
    color?.let { bubbleRing?.setColor(it) } ?: bubbleRing?.setColors(intArrayOf(Color.parseColor("#4F7CF6"), Color.parseColor("#8B5CF6")))
    // The bubble stays visible regardless of attention state (idle included) - it is only
    // removed via the explicit drag-to-trash gesture or the notification's Stop action, never
    // auto-hidden. See addBubble()/addTrash() for the dismiss gesture.
    bubbleView?.visibility = View.VISIBLE
    bubbleView?.animate()?.scaleX(scale)?.scaleY(scale)?.alpha(0.98f)?.setDuration(180)?.start()
    startForegroundWithNotification(text)
  }

  private fun startForegroundWithNotification(text: String? = null) {
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
      .setContentText(text ?: latestBrief ?: "Tap the bubble to open the assistant.")
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
    var menuOpenAtDown = false

    bubble.setOnTouchListener { _, event ->
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          initialX = params.x
          initialY = params.y
          initialTouchX = event.rawX
          initialTouchY = event.rawY
          isDragging = false
          // A drag always starts from a closed menu, since the action row's position is only
          // valid for the bubble's position at the moment it opened.
          menuOpenAtDown = menuOpen
          if (menuOpen) hideActionMenu()
          // Subtle press feedback - a quick squash on touch-down, released on ACTION_UP/CANCEL.
          bubble.animate().scaleX(0.9f).scaleY(0.9f).setDuration(90).setInterpolator(null).start()
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = (event.rawX - initialTouchX).toInt()
          val dy = (event.rawY - initialTouchY).toInt()
          if (abs(dx) > DRAG_THRESHOLD_PX || abs(dy) > DRAG_THRESHOLD_PX) {
            if (!isDragging) showTrash()
            isDragging = true
          }
          params.x = initialX + dx
          params.y = initialY + dy
          runCatching { windowManager?.updateViewLayout(bubble, params) }
          if (isDragging) updateTrashHover(params.x + outerSize / 2, params.y + outerSize / 2)
          true
        }
        MotionEvent.ACTION_UP -> {
          bubble.animate().scaleX(1f).scaleY(1f).setDuration(220).setInterpolator(OvershootInterpolator(2.2f)).start()
          if (isDragging) {
            if (overTrash) stopSelf()
          } else if (!menuOpenAtDown) {
            // Plain tap on a closed menu: show quick-action intents around the bubble instead
            // of jumping straight into the app. Tapping the bubble again (or an action) closes it.
            showActionMenu(params, outerSize)
          }
          hideTrash()
          true
        }
        MotionEvent.ACTION_CANCEL -> {
          bubble.animate().scaleX(1f).scaleY(1f).setDuration(180).setInterpolator(OvershootInterpolator(2.2f)).start()
          hideTrash()
          true
        }
        else -> false
      }
    }

    runCatching { manager.addView(bubble, params) }.onSuccess { bubbleView = bubble }
  }

  // Mirrors mobile/src/theme.ts (colors.*) so the native overlay reads as the same product as
  // the RN app, since this window can't import that file directly - see buildBrandBubbleView.
  private object OverlayTheme {
    const val SURFACE_ALT = "#131A2C"
    const val BORDER_STRONG = "#2C3860"
    const val TEXT_PRIMARY = "#EEF2FB"
    const val ACCENT = "#4F7CF6" // colors.accent
    const val DANGER = "#F4736A" // colors.danger
    const val POSITIVE = "#5FD1A0" // colors.positive
  }

  private data class QuickAction(val label: String, val accent: Int, val onTap: () -> Unit)

  private fun quickActions(): List<QuickAction> = listOf(
    QuickAction("Take Selfie", Color.parseColor(OverlayTheme.ACCENT)) { launchCapture(CAPTURE_MODE_PHOTO) }, // -> take_photo tool
    QuickAction("Record Video", Color.parseColor(OverlayTheme.DANGER)) { launchCapture(CAPTURE_MODE_VIDEO) }, // -> record_video tool
    QuickAction("Open App", Color.parseColor(OverlayTheme.POSITIVE)) { openApp() },
  )

  // Arranges labeled quick-action pills in a single column anchored to the main bubble's
  // current on-screen position, flipping above/below and clamped horizontally to stay on
  // screen since the bubble can be dragged anywhere. Each action is a thin wrapper around an
  // existing tool (take_photo/record_video in src/tools/registry.ts) - launched natively here
  // so it works without opening the app UI.
  private fun showActionMenu(bubbleParams: WindowManager.LayoutParams, bubbleSizePx: Int) {
    val manager = windowManager ?: return
    hideActionMenu()

    val density = resources.displayMetrics.density
    val scaledDensity = resources.displayMetrics.scaledDensity
    val pillHeight = (40 * density).toInt()
    val pillTextSizePx = 12.5f * scaledDensity
    val horizontalPadding = (16 * density).toInt()
    val dotSize = (7 * density).toInt()
    val dotGap = (8 * density).toInt()
    val gap = (10 * density).toInt()
    val rowOffset = (14 * density).toInt()
    val screenWidth = resources.displayMetrics.widthPixels
    val screenHeight = resources.displayMetrics.heightPixels

    val actions = quickActions()
    val textPaint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
      textSize = pillTextSizePx
      isFakeBoldText = true
    }
    val pillWidth = actions.maxOf { action ->
      kotlin.math.ceil(textPaint.measureText(action.label)).toInt() + dotSize + dotGap + horizontalPadding * 2
    }

    val idealLeft = bubbleParams.x + bubbleSizePx / 2 - pillWidth / 2
    val columnLeft = idealLeft.coerceIn(0, (screenWidth - pillWidth).coerceAtLeast(0))

    val stackHeight = actions.size * pillHeight + (actions.size - 1) * gap
    val belowTop = bubbleParams.y + bubbleSizePx + rowOffset
    val columnTop = if (belowTop + stackHeight > screenHeight) {
      (bubbleParams.y - stackHeight - rowOffset).coerceAtLeast(0)
    } else {
      belowTop
    }

    val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
    }

    actions.forEachIndexed { index, action ->
      val view = buildActionPillView(action.label, action.accent, pillTextSizePx, dotSize, dotGap, horizontalPadding).apply {
        alpha = 0f
        scaleX = 0.85f
        scaleY = 0.85f
        setOnClickListener {
          // A quick confirming pop before dismissal, rather than an instant disappearance.
          it.animate().scaleX(1.05f).scaleY(1.05f).setDuration(80).withEndAction {
            hideActionMenu()
            action.onTap()
          }.start()
        }
      }
      val actionParams = WindowManager.LayoutParams(
        pillWidth,
        pillHeight,
        overlayType,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
        PixelFormat.TRANSLUCENT
      ).apply {
        gravity = Gravity.TOP or Gravity.START
        x = columnLeft
        y = columnTop + index * (pillHeight + gap)
      }
      runCatching { manager.addView(view, actionParams) }.onSuccess {
        actionViews.add(view)
        view.animate()
          .alpha(1f).scaleX(1f).scaleY(1f)
          .setStartDelay(index * 40L)
          .setDuration(190)
          .setInterpolator(OvershootInterpolator(2.2f))
          .start()
      }
    }
    menuOpen = actionViews.isNotEmpty()
  }

  private fun hideActionMenu() {
    menuOpen = false
    if (actionViews.isEmpty()) return
    val manager = windowManager
    actionViews.forEach { view -> runCatching { manager?.removeView(view) } }
    actionViews.clear()
  }

  // A dark HUD-style chip - surfaceAlt fill, a colored border + leading dot per action, bold
  // uppercase label - rather than an icon, per the "game interface" quick-slot look requested.
  private fun buildActionPillView(label: String, accent: Int, textSizePx: Float, dotSize: Int, dotGap: Int, horizontalPadding: Int): View {
    val density = resources.displayMetrics.density
    val pillBackground = GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      cornerRadius = 10 * density
      setColor(Color.parseColor(OverlayTheme.SURFACE_ALT))
      setStroke((1.5f * density).toInt(), accent)
    }

    val dot = View(this).apply {
      layoutParams = android.widget.LinearLayout.LayoutParams(dotSize, dotSize).apply { marginEnd = dotGap }
      background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(accent) }
    }

    val text = android.widget.TextView(this).apply {
      text = label.uppercase()
      setTextColor(Color.parseColor(OverlayTheme.TEXT_PRIMARY))
      setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, textSizePx)
      setTypeface(typeface, android.graphics.Typeface.BOLD)
      letterSpacing = 0.04f
    }

    return android.widget.LinearLayout(this).apply {
      orientation = android.widget.LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(horizontalPadding, 0, horizontalPadding, 0)
      background = pillBackground
      elevation = 6 * density
      addView(dot)
      addView(text)
    }
  }

  // Launches the same in-app CameraX capture screen used by the take_photo/record_video tools
  // (MediaCaptureModule.kt) directly from the overlay, bypassing the RN bridge/Promise round
  // trip since there is no JS caller waiting on a result here - the capture UI is its own
  // visible Activity per docs/AI_OS_ORCHESTRATOR_PLAN.md item 5/6 (never silent/backgrounded).
  private fun launchCapture(mode: String) {
    val intent = Intent(this, InAppCaptureActivity::class.java).apply {
      putExtra(EXTRA_CAPTURE_MODE, mode)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    runCatching { startActivity(intent) }
  }

  // A drag target at the bottom-middle of the screen (mirrors Messenger-style chat-head
  // dismissal): hidden until a bubble drag starts, then fades in; dropping the bubble on it
  // stops the overlay service entirely (removing both bubble and trash).
  private fun addTrash() {
    val manager = getSystemService(WINDOW_SERVICE) as WindowManager
    windowManager = manager

    val density = resources.displayMetrics.density
    val size = (64 * density).toInt()
    val bottomMargin = (96 * density).toInt()

    val trashDrawable = GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(Color.parseColor("#33000000"))
      setStroke((1.5f * density).toInt(), Color.parseColor("#FFFFFF"))
    }
    trashBackground = trashDrawable

    val icon = android.widget.TextView(this).apply {
      text = "✕"
      setTextColor(Color.WHITE)
      textSize = 20f
      gravity = Gravity.CENTER
    }

    val trash = FrameLayout(this).apply {
      layoutParams = FrameLayout.LayoutParams(size, size)
      background = trashDrawable
      addView(icon, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
      alpha = 0f
      visibility = View.GONE
      elevation = 8 * density
    }

    val params = WindowManager.LayoutParams(
      size,
      size,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
      y = bottomMargin
    }
    trashParams = params

    runCatching { manager.addView(trash, params) }.onSuccess { trashView = trash }
  }

  private fun showTrash() {
    trashView?.let { view ->
      view.visibility = View.VISIBLE
      view.animate().alpha(1f).setDuration(120).start()
    }
  }

  private fun hideTrash() {
    overTrash = false
    trashBackground?.setColor(Color.parseColor("#33000000"))
    trashView?.let { view ->
      view.animate().alpha(0f).setDuration(120).withEndAction { view.visibility = View.GONE }.start()
    }
  }

  // bubbleCenterX/Y are in absolute screen coordinates (TOP|START gravity), matched against the
  // trash's own screen position (BOTTOM|CENTER_HORIZONTAL gravity) resolved via its view location.
  private fun updateTrashHover(bubbleCenterX: Int, bubbleCenterY: Int) {
    val trash = trashView ?: return
    val location = IntArray(2)
    trash.getLocationOnScreen(location)
    val trashCenterX = location[0] + trash.width / 2
    val trashCenterY = location[1] + trash.height / 2
    val distance = kotlin.math.hypot(
      (bubbleCenterX - trashCenterX).toDouble(),
      (bubbleCenterY - trashCenterY).toDouble()
    )
    val hovering = distance < trash.width * 1.1
    if (hovering != overTrash) {
      overTrash = hovering
      val color = if (hovering) Color.parseColor("#E5484D") else Color.parseColor("#33000000")
      trashBackground?.setColor(color)
      trash.animate().scaleX(if (hovering) 1.25f else 1f).scaleY(if (hovering) 1.25f else 1f).setDuration(100).start()
    }
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

    val ringDrawable = brandGradient().apply { shape = GradientDrawable.OVAL }
    bubbleRing = ringDrawable
    val ring = FrameLayout(this).apply {
      layoutParams = FrameLayout.LayoutParams(outerSizePx, outerSizePx)
      background = ringDrawable
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
    activeService = null
    hideActionMenu()
    bubbleView?.let { view -> runCatching { windowManager?.removeView(view) } }
    bubbleView = null
    trashView?.let { view -> runCatching { windowManager?.removeView(view) } }
    trashView = null
    isRunning = false
    super.onDestroy()
  }
}
