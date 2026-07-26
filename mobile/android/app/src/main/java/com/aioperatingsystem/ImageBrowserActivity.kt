package com.aioperatingsystem

import android.app.Activity
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient

const val EXTRA_BROWSER_URL = "aios_browser_url"
const val EXTRA_SELECT_IMAGE = "aios_select_image"
const val EXTRA_SELECTED_IMAGE_URL = "aios_selected_image_url"
const val EXTRA_SELECTED_IMAGE_TITLE = "aios_selected_image_title"

/** AI-OS-owned image browser. Tapping an image returns its URL to the workflow. */
class ImageBrowserActivity : Activity() {
  private lateinit var webView: WebView

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    webView = WebView(this).apply {
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      webViewClient = object : WebViewClient() {
        override fun onPageFinished(view: WebView?, url: String?) {
          super.onPageFinished(view, url)
          if (intent.getBooleanExtra(EXTRA_SELECT_IMAGE, false)) injectImageSelectionScript()
        }
      }
      addJavascriptInterface(ImageSelectionBridge(), "AIOS")
    }
    setContentView(webView)

    val url = intent.getStringExtra(EXTRA_BROWSER_URL)
    if (url.isNullOrBlank() || !(url.startsWith("http://") || url.startsWith("https://"))) {
      setResult(RESULT_CANCELED)
      finish()
      return
    }
    webView.loadUrl(url)
  }

  private fun injectImageSelectionScript() {
    webView.evaluateJavascript(
      """
      (function() {
        if (window.__aiosImageHooked) return;
        window.__aiosImageHooked = true;
        document.addEventListener('click', function(event) {
          var image = event.target && event.target.closest ? event.target.closest('img') : null;
          if (!image) return;
          var imageUrl = image.currentSrc || image.src;
          if (!imageUrl || !/^https?:/.test(imageUrl)) return;
          event.preventDefault();
          event.stopPropagation();
          AIOS.onImageSelected(imageUrl, document.title || 'Selected image');
        }, true);
      })();
      """.trimIndent(),
      null
    )
  }

  override fun onBackPressed() {
    if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
  }

  inner class ImageSelectionBridge {
    @JavascriptInterface
    fun onImageSelected(url: String, title: String) {
      runOnUiThread {
        setResult(RESULT_OK, intent.apply {
          putExtra(EXTRA_SELECTED_IMAGE_URL, url)
          putExtra(EXTRA_SELECTED_IMAGE_TITLE, title)
        })
        finish()
      }
    }
  }
}
