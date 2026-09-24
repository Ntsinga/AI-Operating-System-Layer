package com.aioperatingsystem

import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Opens the Board canvas (BoardActivity). The board's data lives on the backend and the page
 * autosaves itself, so this is fire-and-forget: it launches the full-screen canvas and resolves
 * once it's on its way. The React Native side owns the sessions list and refreshes it when the
 * user returns (see src/screens/BoardsListScreen.tsx).
 */
class BoardModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AiosBoard"

  @ReactMethod
  fun openBoard(boardId: String, backendBaseUrl: String, title: String, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("BOARD_ACTIVITY_UNAVAILABLE", "No foreground activity available.")
      return
    }
    if (boardId.isBlank()) {
      promise.reject("BOARD_MISSING_ID", "A board id is required to open the canvas.")
      return
    }
    try {
      activity.startActivity(
        Intent(activity, BoardActivity::class.java)
          .putExtra(EXTRA_BOARD_ID, boardId)
          .putExtra(EXTRA_BOARD_BACKEND, backendBaseUrl)
          .putExtra(EXTRA_BOARD_TITLE, title)
      )
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("BOARD_OPEN_FAILED", error.message ?: "Could not open the board.", error)
    }
  }
}
