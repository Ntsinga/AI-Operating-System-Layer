package com.aioperatingsystem

import android.app.Activity
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView

const val EXTRA_BOARD_ID = "aios_board_id"
const val EXTRA_BOARD_BACKEND = "aios_board_backend"
const val EXTRA_BOARD_TITLE = "aios_board_title"

/**
 * Hosts the bundled Board canvas (assets/board/index.html). The HTML owns all drawing,
 * autosave, and the "ask about my drawing" call - it talks to the backend directly (CORS is
 * open, see backend/app/main.py), so this Activity is just a themed WebView shell that hands
 * the page its board id and backend URL. Mirrors ImageBrowserActivity's WebView + JS-bridge
 * pattern; here the bridge only needs a close() so the in-page back button can finish us.
 */
class BoardActivity : Activity() {
  private lateinit var webView: WebView

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    webView = WebView(this).apply {
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      // The page is loaded from file:// but fetches the (https) backend; without universal
      // access from file URLs the WebView blocks those cross-origin requests.
      settings.allowFileAccess = true
      settings.allowUniversalAccessFromFileURLs = true
      addJavascriptInterface(BoardBridge(), "AIOSBoard")
    }
    setContentView(webView)

    val boardId = intent.getStringExtra(EXTRA_BOARD_ID).orEmpty()
    val backend = intent.getStringExtra(EXTRA_BOARD_BACKEND).orEmpty()
    val title = intent.getStringExtra(EXTRA_BOARD_TITLE).orEmpty()
    if (boardId.isBlank()) {
      finish()
      return
    }

    val url = Uri.parse("file:///android_asset/board/index.html").buildUpon()
      .appendQueryParameter("boardId", boardId)
      .appendQueryParameter("backend", backend)
      .appendQueryParameter("title", title)
      .build()
      .toString()
    webView.loadUrl(url)
  }

  override fun onDestroy() {
    // Give the page a chance to flush its final autosave before teardown.
    webView.evaluateJavascript("window.dispatchEvent(new Event('pagehide'));", null)
    super.onDestroy()
  }

  inner class BoardBridge {
    @JavascriptInterface
    fun close() {
      runOnUiThread { finish() }
    }
  }
}
