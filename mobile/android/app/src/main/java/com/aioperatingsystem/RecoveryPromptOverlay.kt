package com.aioperatingsystem

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
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
 *
 * Visuals deliberately echo OverlayService's bubble/quick-action-menu language (brand gradient,
 * dark glassy surfaces, pill rows) so this reads as the same assistant asking a question, not a
 * generic system alert dialog.
 */
object RecoveryPromptOverlay {
  sealed class Answer {
    data class Selected(val index: Int) : Answer()
    data class FreeText(val text: String) : Answer()
    object Cancelled : Answer()
  }

  private object Theme {
    const val SCRIM = "#CC05070D"
    const val SURFACE = "#151C30"
    const val SURFACE_RAISED = "#1B2440"
    const val FIELD = "#0C1120"
    const val BORDER = "#2C3860"
    const val BORDER_SOFT = "#232C4A"
    const val TEXT_PRIMARY = "#F3F6FD"
    const val TEXT_MUTED = "#8FA0C9"
    const val ACCENT = "#4F7CF6"
    const val ACCENT_2 = "#8B5CF6"
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
      lateinit var confirmButton: Button
      val view = buildCard(service, title, subtitle) { card, density ->
        if (options.isNotEmpty()) {
          val optionsBox = LinearLayout(service).apply { orientation = LinearLayout.VERTICAL }
          options.forEachIndexed { index, label ->
            optionsBox.addView(optionRow(service, label, density) {
              result = Answer.Selected(index)
              latch.countDown()
            })
          }
          val scrollCap = (240 * density).toInt()
          val scroll = ScrollView(service).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
              // Cap height only when the list would actually overflow it, so a couple of short
              // options don't get stranded inside empty scroll space.
              topMargin = 0
            }
            addView(optionsBox)
          }
          card.addView(scroll)
          scroll.post { if (scroll.height > scrollCap) scroll.layoutParams = scroll.layoutParams.apply { height = scrollCap } }
          card.addView(divider(service, "or type what you mean", density))
        }
        card.addView(TextView(service).apply {
          text = "YOUR ANSWER"
          setTextColor(Color.parseColor(Theme.TEXT_MUTED))
          textSize = 10.5f
          letterSpacing = 0.08f
          setPadding((2 * density).toInt(), 0, 0, (6 * density).toInt())
        })
        input = EditText(service).apply {
          setText(prefillText)
          setSelection(text?.length ?: 0)
          hint = "Type here"
          setHintTextColor(Color.parseColor(Theme.TEXT_MUTED))
          setTextColor(Color.parseColor(Theme.TEXT_PRIMARY))
          textSize = 14.5f
          inputType = InputType.TYPE_CLASS_TEXT
          background = fieldBackground(density)
          setPadding((12 * density).toInt(), (10 * density).toInt(), (12 * density).toInt(), (10 * density).toInt())
        }
        card.addView(input)
        val row = LinearLayout(service).apply {
          orientation = LinearLayout.HORIZONTAL
          setPadding(0, (14 * density).toInt(), 0, 0)
        }
        row.addView(ghostButton(service, "Cancel", density, weight = 1f) {
          result = Answer.Cancelled
          latch.countDown()
        })
        confirmButton = filledButton(service, "Use this text", density, weight = 1.4f) {
          val text = input.text?.toString()?.trim()
          if (!text.isNullOrBlank()) {
            result = Answer.FreeText(text)
            latch.countDown()
          }
        }
        row.addView(confirmButton)
        card.addView(row)
        confirmButton.alpha = if (input.text.isNullOrBlank()) 0.45f else 1f
        input.addTextChangedListener(object : TextWatcher {
          override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
          override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
          override fun afterTextChanged(s: Editable?) {
            confirmButton.alpha = if (s.isNullOrBlank()) 0.45f else 1f
          }
        })
      }
      overlayView = view
      addOverlay(windowManager, view)
    }
    latch.await(timeoutMs, TimeUnit.MILLISECONDS)
    dismiss(windowManager, overlayView)
    return result
  }

  // Pure yes/no gate - no candidate list, no text field. Used to confirm a single, already-
  // identified action before executing it (e.g. an inferred tap whose target was a confident
  // guess at teach time, not a certain TYPE_VIEW_CLICKED capture). Defaults to false on cancel
  // or timeout - an unconfirmed action never proceeds silently.
  fun askConfirm(service: AccessibilityService, title: String, subtitle: String?, confirmLabel: String = "Yes, do this", timeoutMs: Long = 45000): Boolean {
    val latch = CountDownLatch(1)
    var confirmed = false
    var overlayView: View? = null
    val windowManager = service.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    Handler(Looper.getMainLooper()).post {
      val view = buildCard(service, title, subtitle) { card, density ->
        val row = LinearLayout(service).apply {
          orientation = LinearLayout.HORIZONTAL
          setPadding(0, (4 * density).toInt(), 0, 0)
        }
        row.addView(ghostButton(service, "Skip this step", density, weight = 1f) {
          confirmed = false
          latch.countDown()
        })
        row.addView(filledButton(service, confirmLabel, density, weight = 1.4f) {
          confirmed = true
          latch.countDown()
        })
        card.addView(row)
      }
      overlayView = view
      addOverlay(windowManager, view)
    }
    latch.await(timeoutMs, TimeUnit.MILLISECONDS)
    dismiss(windowManager, overlayView)
    return confirmed
  }

  // Plain question, no candidate list - e.g. "what should I type into this field?". Returns null
  // on cancel or timeout; the caller decides whether that means abort-the-step.
  fun askText(service: AccessibilityService, title: String, subtitle: String?, prefill: String, timeoutMs: Long = 60000): String? {
    val answer = askChoiceOrText(service, title, subtitle, emptyList(), prefillText = prefill, timeoutMs = timeoutMs)
    return (answer as? Answer.FreeText)?.text
  }

  private fun brandGradient(): GradientDrawable = GradientDrawable(
    GradientDrawable.Orientation.TL_BR,
    intArrayOf(Color.parseColor(Theme.ACCENT), Color.parseColor(Theme.ACCENT_2)),
  )

  private fun fieldBackground(density: Float) = GradientDrawable().apply {
    shape = GradientDrawable.RECTANGLE
    cornerRadius = 10 * density
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
        cornerRadius = 22 * density
        setColor(Color.parseColor(Theme.SURFACE))
        setStroke((1.5f * density).toInt(), Color.parseColor(Theme.BORDER))
      }
      setPadding((20 * density).toInt(), (20 * density).toInt(), (20 * density).toInt(), (20 * density).toInt())
      elevation = 16 * density
    }

    val header = LinearLayout(service).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    val badgeSize = (30 * density).toInt()
    header.addView(TextView(service).apply {
      text = "?"
      gravity = Gravity.CENTER
      setTextColor(Color.parseColor(Theme.TEXT_PRIMARY))
      textSize = 15f
      setTypeface(typeface, Typeface.BOLD)
      background = brandGradient().apply { shape = GradientDrawable.OVAL }
      layoutParams = LinearLayout.LayoutParams(badgeSize, badgeSize)
    })
    val titleColumn = LinearLayout(service).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
        marginStart = (12 * density).toInt()
      }
    }
    titleColumn.addView(TextView(service).apply {
      text = title
      setTextColor(Color.parseColor(Theme.TEXT_PRIMARY))
      textSize = 16.5f
      setTypeface(typeface, Typeface.BOLD)
    })
    header.addView(titleColumn)
    card.addView(header)

    if (!subtitle.isNullOrBlank()) {
      card.addView(TextView(service).apply {
        text = subtitle
        setTextColor(Color.parseColor(Theme.TEXT_MUTED))
        textSize = 13f
        setLineSpacing(2 * density, 1f)
        val badgeIndent = badgeSize + (12 * density).toInt()
        setPadding(badgeIndent, (6 * density).toInt(), 0, (16 * density).toInt())
      })
    } else {
      card.addView(View(service).apply { layoutParams = LinearLayout.LayoutParams(0, (14 * density).toInt()) })
    }

    populate(card, density)
    root.addView(card)
    return root
  }

  // Thin rule flanking a small centered label - separates "pick one of these" from the always
  // -available free-text fallback without a jarring full-width line.
  private fun divider(service: AccessibilityService, label: String, density: Float): View {
    val row = LinearLayout(service).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(0, (14 * density).toInt(), 0, (10 * density).toInt())
    }
    fun rule() = View(service).apply {
      setBackgroundColor(Color.parseColor(Theme.BORDER_SOFT))
      layoutParams = LinearLayout.LayoutParams(0, (1 * density).toInt(), 1f)
    }
    row.addView(rule())
    row.addView(TextView(service).apply {
      text = label
      setTextColor(Color.parseColor(Theme.TEXT_MUTED))
      textSize = 11.5f
      setPadding((10 * density).toInt(), 0, (10 * density).toInt(), 0)
    })
    row.addView(rule())
    return row
  }

  // A candidate result, styled as a list row (accent dot + label on a raised surface) rather
  // than a wall of same-colored solid buttons - keeps several options readable and lets a real
  // ripple communicate "tappable" instead of borrowing a stock Button's default chrome.
  private fun optionRow(service: AccessibilityService, label: String, density: Float, onClick: () -> Unit): View {
    val dotSize = (8 * density).toInt()
    val row = LinearLayout(service).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      isClickable = true
      isFocusable = true
      val base = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = 14 * density
        setColor(Color.parseColor(Theme.SURFACE_RAISED))
        setStroke((1f * density).toInt(), Color.parseColor(Theme.BORDER_SOFT))
      }
      background = RippleDrawable(rippleTint(Theme.ACCENT), base, base)
      setPadding((14 * density).toInt(), (12 * density).toInt(), (14 * density).toInt(), (12 * density).toInt())
      val params = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
      params.topMargin = (8 * density).toInt()
      layoutParams = params
      setOnClickListener { onClick() }
    }
    row.addView(View(service).apply {
      background = brandGradient().apply { shape = GradientDrawable.OVAL }
      layoutParams = LinearLayout.LayoutParams(dotSize, dotSize).apply { marginEnd = (12 * density).toInt() }
    })
    row.addView(TextView(service).apply {
      text = label
      setTextColor(Color.parseColor(Theme.TEXT_PRIMARY))
      textSize = 14f
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    })
    return row
  }

  // Outline-only, muted - reserves solid danger-red for something more critical than "no thanks."
  private fun ghostButton(service: AccessibilityService, label: String, density: Float, weight: Float, onClick: () -> Unit): Button {
    return Button(service).apply {
      text = label
      isAllCaps = false
      elevation = 0f
      stateListAnimator = null
      setTextColor(Color.parseColor(Theme.DANGER))
      textSize = 14f
      val base = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = 12 * density
        setColor(Color.TRANSPARENT)
        setStroke((1.2f * density).toInt(), Color.parseColor(Theme.DANGER))
      }
      background = RippleDrawable(rippleTint(Theme.DANGER), base, base)
      val params = LinearLayout.LayoutParams(0, (44 * density).toInt(), weight)
      params.marginEnd = (8 * density).toInt()
      layoutParams = params
      setOnClickListener { onClick() }
    }
  }

  // Solid brand-gradient fill - the one visually "loud" element on the card, reserved for the
  // primary confirm action.
  private fun filledButton(service: AccessibilityService, label: String, density: Float, weight: Float, onClick: () -> Unit): Button {
    return Button(service).apply {
      text = label
      isAllCaps = false
      elevation = 0f
      stateListAnimator = null
      setTextColor(Color.parseColor(Theme.TEXT_PRIMARY))
      textSize = 14f
      setTypeface(typeface, Typeface.BOLD)
      val base = brandGradient().apply { cornerRadius = 12 * density }
      background = RippleDrawable(rippleTint("#FFFFFF"), base, base)
      layoutParams = LinearLayout.LayoutParams(0, (44 * density).toInt(), weight)
      setOnClickListener { onClick() }
    }
  }

  private fun rippleTint(hexColor: String): android.content.res.ColorStateList {
    val color = Color.parseColor(hexColor)
    val alpha = Color.argb(70, Color.red(color), Color.green(color), Color.blue(color))
    return android.content.res.ColorStateList.valueOf(alpha)
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

  // Blocks the calling (background replay) thread until the overlay window is actually gone, not
  // just until its removal has been posted. A fire-and-forget post here previously let replay's
  // very next step run isTargetSurfaceActive() while this overlay was still the topmost window -
  // rootInActiveWindow would then report com.aioperatingsystem instead of the target app,
  // wrongly concluding the target was lost and aborting the entire rest of the replay. See
  // ERROR_LOG.md 2026-07-30 (replay opened the target app, resolved one recovery prompt, then
  // immediately aborted with target_surface_lost_abort on the very next step).
  private fun dismiss(windowManager: WindowManager, view: View?) {
    if (view == null) return
    val latch = CountDownLatch(1)
    Handler(Looper.getMainLooper()).post {
      try {
        windowManager.removeView(view)
      } catch (error: Exception) {
        // Already removed or never attached - ignore.
      } finally {
        latch.countDown()
      }
    }
    latch.await(2000, TimeUnit.MILLISECONDS)
    // WindowManagerService's own focus/root recalculation can lag a little behind removeView()
    // returning - a short settle window here is cheap insurance against the same race this whole
    // function exists to close.
    Thread.sleep(200)
  }
}
