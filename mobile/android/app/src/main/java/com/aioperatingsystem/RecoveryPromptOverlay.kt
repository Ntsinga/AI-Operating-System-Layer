package com.aioperatingsystem

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Blocking, in-replay human-in-the-loop prompts for bounded replay recovery
 * (LearningWatcherService.attemptBoundedRecovery / attemptTextInputRecovery). Reached only when
 * automatic recovery (backend/app/replay_recovery.py) cannot confidently resolve a broken
 * selector on its own, or when a text_input step's target can no longer be found at all - never
 * as the first resort, and never to type a model-guessed value: whatever text ends up typed
 * always comes from a real synchronous answer collected here from the person holding the phone.
 * See AGENTS.md and ERROR_LOG.md 2026-07-29.
 *
 * Draws a TYPE_ACCESSIBILITY_OVERLAY window, which an accessibility service may add without the
 * separate SYSTEM_ALERT_WINDOW permission. Blocks the calling (background replay) thread with a
 * CountDownLatch until the user answers or a timeout elapses, so the replay loop simply resumes
 * (or aborts the step) once this returns - no separate callback plumbing needed.
 */
object RecoveryPromptOverlay {
  sealed class Answer {
    data class Selected(val index: Int) : Answer()
    data class FreeText(val text: String) : Answer()
    object Cancelled : Answer()
  }

  private object Theme {
    const val SCRIM = "#B3000508"
    const val SURFACE = "#131A2C"
    const val FIELD = "#0D1220"
    const val BORDER = "#2C3860"
    const val TEXT_PRIMARY = "#EEF2FB"
    const val TEXT_MUTED = "#9AA7C7"
    const val ACCENT = "#4F7CF6"
    const val DANGER = "#F4736A"
  }

  // Shows candidate buttons plus an always-available text field, so the assistant can either
  // offer options ("which one did you mean?") or just ask plainly and take free-form input -
  // both shapes the same request can take, in a single round trip.
  fun askChoiceOrText(
    service: AccessibilityService,
    title: String,
    subtitle: String?,
    options: List<String>,
    prefillText: String = "",
    timeoutMs: Long = 60000,
  ): Answer {
    val latch = CountDownLatch(1)
    var result: Answer = Answer.Cancelled
    var overlayView: View? = null
    val windowManager = service.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    Handler(Looper.getMainLooper()).post {
      lateinit var input: EditText
      val view = buildCard(service, title, subtitle) { card, density ->
        if (options.isNotEmpty()) {
          val optionsBox = LinearLayout(service).apply { orientation = LinearLayout.VERTICAL }
          options.forEachIndexed { index, label ->
            optionsBox.addView(actionButton(service, label, Theme.ACCENT, density) {
              result = Answer.Selected(index)
              latch.countDown()
            })
          }
          val scroll = ScrollView(service).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (240 * density).toInt())
            addView(optionsBox)
          }
          card.addView(scroll)
          card.addView(TextView(service).apply {
            text = "or type what you mean"
            setTextColor(Color.parseColor(Theme.TEXT_MUTED))
            textSize = 12f
            setPadding(0, (12 * density).toInt(), 0, (4 * density).toInt())
          })
        }
        input = EditText(service).apply {
          setText(prefillText)
          hint = "Type here"
          setHintTextColor(Color.parseColor(Theme.TEXT_MUTED))
          setTextColor(Color.parseColor(Theme.TEXT_PRIMARY))
          inputType = InputType.TYPE_CLASS_TEXT
          background = fieldBackground(density)
          setPadding((10 * density).toInt(), (8 * density).toInt(), (10 * density).toInt(), (8 * density).toInt())
        }
        card.addView(input)
        val row = LinearLayout(service).apply {
          orientation = LinearLayout.HORIZONTAL
          setPadding(0, (10 * density).toInt(), 0, 0)
        }
        row.addView(actionButton(service, "Cancel", Theme.DANGER, density, weight = 1f) {
          result = Answer.Cancelled
          latch.countDown()
        })
        row.addView(actionButton(service, "Use this text", Theme.ACCENT, density, weight = 1f) {
          val text = input.text?.toString()?.trim()
          if (!text.isNullOrBlank()) {
            result = Answer.FreeText(text)
            latch.countDown()
          }
        })
        card.addView(row)
      }
      overlayView = view
      addOverlay(windowManager, view)
    }
    latch.await(timeoutMs, TimeUnit.MILLISECONDS)
    dismiss(windowManager, overlayView)
    return result
  }

  // Plain question, no candidate list - e.g. "what should I type into this field?". Returns null
  // on cancel or timeout; the caller decides whether that means abort-the-step.
  fun askText(service: AccessibilityService, title: String, subtitle: String?, prefill: String, timeoutMs: Long = 60000): String? {
    val answer = askChoiceOrText(service, title, subtitle, emptyList(), prefillText = prefill, timeoutMs = timeoutMs)
    return (answer as? Answer.FreeText)?.text
  }

  private fun fieldBackground(density: Float) = GradientDrawable().apply {
    shape = GradientDrawable.RECTANGLE
    cornerRadius = 8 * density
    setColor(Color.parseColor(Theme.FIELD))
    setStroke((1f * density).toInt(), Color.parseColor(Theme.BORDER))
  }

  private fun buildCard(service: AccessibilityService, title: String, subtitle: String?, populate: (LinearLayout, Float) -> Unit): View {
    val density = service.resources.displayMetrics.density
    val root = LinearLayout(service).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.parseColor(Theme.SCRIM))
      setPadding((24 * density).toInt(), 0, (24 * density).toInt(), 0)
    }
    val card = LinearLayout(service).apply {
      orientation = LinearLayout.VERTICAL
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = 18 * density
        setColor(Color.parseColor(Theme.SURFACE))
        setStroke((1.5f * density).toInt(), Color.parseColor(Theme.BORDER))
      }
      setPadding((18 * density).toInt(), (18 * density).toInt(), (18 * density).toInt(), (18 * density).toInt())
    }
    card.addView(TextView(service).apply {
      text = title
      setTextColor(Color.parseColor(Theme.TEXT_PRIMARY))
      textSize = 16f
      setTypeface(typeface, Typeface.BOLD)
    })
    if (!subtitle.isNullOrBlank()) {
      card.addView(TextView(service).apply {
        text = subtitle
        setTextColor(Color.parseColor(Theme.TEXT_MUTED))
        textSize = 13f
        setPadding(0, (4 * density).toInt(), 0, (12 * density).toInt())
      })
    }
    populate(card, density)
    root.addView(card)
    return root
  }

  private fun actionButton(service: AccessibilityService, label: String, color: String, density: Float, weight: Float? = null, onClick: () -> Unit): Button {
    return Button(service).apply {
      text = label
      isAllCaps = false
      setTextColor(Color.parseColor(Theme.TEXT_PRIMARY))
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = 10 * density
        setColor(Color.parseColor(color))
      }
      val params = LinearLayout.LayoutParams(
        if (weight != null) 0 else LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
      )
      params.topMargin = (8 * density).toInt()
      if (weight != null) {
        params.weight = weight
        params.marginEnd = (6 * density).toInt()
      }
      layoutParams = params
      setOnClickListener { onClick() }
    }
  }

  // Focusable (unlike the drag-to-dismiss bubble in OverlayService) so the on-screen keyboard
  // can attach to the text field - this prompt is meant to fully hold the user's attention while
  // replay is paused waiting for it, so blocking touches to whatever is underneath is intended.
  private fun addOverlay(windowManager: WindowManager, view: View) {
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    )
    params.gravity = Gravity.CENTER
    try {
      windowManager.addView(view, params)
    } catch (error: Exception) {
      Log.e("AIOS.Replay", "Failed to add recovery prompt overlay", error)
    }
  }

  private fun dismiss(windowManager: WindowManager, view: View?) {
    if (view == null) return
    Handler(Looper.getMainLooper()).post {
      try {
        windowManager.removeView(view)
      } catch (error: Exception) {
        // Already removed or never attached - ignore.
      }
    }
  }
}
