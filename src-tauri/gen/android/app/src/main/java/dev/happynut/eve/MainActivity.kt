package dev.happynut.eve

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import android.webkit.JavascriptInterface
import android.view.inputmethod.InputMethodManager
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import dev.happynut.eve.sync.PullJob
import dev.happynut.eve.widget.NotesWidget

class MainActivity : TauriActivity() {
  companion object {
    /** on screen: the background pull stands aside, the page syncs itself */
    @Volatile var inFront = false
  }

  /** What the home-screen widget asked for ("note:<id>" or "new"), until the page takes it. */
  @Volatile private var pending = ""
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    remember(intent)
    super.onCreate(savedInstanceState)
    // Edge to edge, the keyboard no longer shrinks the window: the page would be scrolled up under the
    // status bar to show the caret instead. Shrink the content by the keyboard's height ourselves; the
    // status and navigation bars stay the page's to handle (CSS safe-area insets).
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
      v.setPadding(0, 0, 0, insets.getInsets(WindowInsetsCompat.Type.ime()).bottom)
      insets
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(Bridge(), "EveAndroid")
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    if (remember(intent)) webView?.evaluateJavascript("window.dispatchEvent(new Event('eve-intent'))", null)
  }

  override fun onStart() {
    super.onStart()
    inFront = true
  }

  /** leaving for the home screen: the widget shows what was just written */
  override fun onStop() {
    super.onStop()
    inFront = false
    NotesWidget.refresh(applicationContext)
  }

  private fun remember(intent: Intent?): Boolean {
    // the widget's extra, or the phone-setup page's eve://connect?c=…&u=… link
    val ask = intent?.getStringExtra(NotesWidget.EXTRA_OPEN)
      ?: intent?.dataString?.takeIf { it.startsWith("eve://connect?") }
      ?: return false
    pending = ask
    return true
  }

  /** window.EveAndroid in the page. */
  inner class Bridge {
    @JavascriptInterface
    fun takeIntent(): String = pending.also { pending = "" }

    /**
     * Put the caret in the note and bring the keyboard up — a script alone can do neither while the
     * activity is still coming to the front (the webview then hands focus back to whatever had it).
     */
    @JavascriptInterface
    fun showKeyboard() = runOnUiThread {
      val view = webView ?: return@runOnUiThread
      view.postDelayed({
        view.requestFocus()
        view.evaluateJavascript("document.querySelector('.card .tiptap, .page .tiptap')?.focus()") {
          (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(view, InputMethodManager.SHOW_IMPLICIT)
        }
      }, 250)
    }

    /**
     * Export the open note: "md" (body is the Markdown), "pdf", or "png" (printed from the page).
     * Ends in the share sheet; the page hears back through window.dispatchEvent('eve-exported').
     */
    @JavascriptInterface
    fun export(kind: String, title: String, body: String) = runOnUiThread {
      val view = webView ?: return@runOnUiThread
      val done = { ok: Boolean -> view.evaluateJavascript("window.dispatchEvent(new CustomEvent('eve-exported', { detail: $ok }))", null); Unit }
      when (kind) {
        "md" -> { Exporter.markdown(this@MainActivity, title, body); done(true) }
        "pdf" -> Exporter.pdf(this@MainActivity, view, title, done)
        "png" -> Exporter.png(this@MainActivity, view, title, done)
      }
    }

    /** Download a release APK and open the system installer; progress as 'eve-update' events. */
    @JavascriptInterface
    fun installUpdate(url: String) = runOnUiThread {
      Updater.install(this@MainActivity, url) { state ->
        webView?.evaluateJavascript("window.dispatchEvent(new CustomEvent('eve-update', { detail: '$state' }))", null)
      }
    }

    /** Put a widget pinned to this note on the home screen (the launcher asks where). False if it can't. */
    @JavascriptInterface
    fun pinWidget(noteId: String): Boolean = NotesWidget.requestPin(applicationContext, noteId)

    /** the notes pinned to the top of the widget, comma-separated (the page shows the pin as on) */
    @JavascriptInterface
    fun widgetTop(): String = NotesWidget.top(applicationContext).joinToString(",")

    /** the GitHub sign-in, so the background pull can run while the app is closed ("" = signed out) */
    @JavascriptInterface
    fun account(repo: String, token: String) = PullJob.account(applicationContext, repo, token)

    /** a note was written: the widget reads the folder again */
    @JavascriptInterface
    fun notesChanged() = NotesWidget.refresh(applicationContext)
  }
}
