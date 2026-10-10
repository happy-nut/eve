package dev.happynut.eve

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.text.format.DateUtils
import java.io.File

/**
 * A Markdown file opened with Eve or shared to it (Files, Drive, a chat's attachment), or a piece of text
 * shared to it. Android hands over content:// addresses, which the page cannot read and which are Eve's
 * only while it holds the grant: each is copied into the cache as UTF-8 text, under its own name, and the
 * page imports the copies as the Mac imports a file opened from Finder (transfer.ts importPaths). The
 * original is left as it was.
 */
object Opened {
  private val ACTIONS = setOf(Intent.ACTION_VIEW, Intent.ACTION_SEND, Intent.ACTION_SEND_MULTIPLE)
  /** far past any note: a bigger "text" file is not one, and the page would choke on it */
  private const val MAX = 5 * 1024 * 1024
  private val TEXT = Regex("\\.(md|markdown|mdx|txt)$", RegexOption.IGNORE_CASE)

  /** eve://signin… is a VIEW too, and is the page's own (MainActivity.remember) */
  fun wants(intent: Intent?): Boolean =
    intent != null && intent.action in ACTIONS && intent.data?.scheme != "eve"

  /** The copies' paths, none when nothing could be read. Reads from another app's provider: off the main thread. */
  fun copy(context: Context, intent: Intent): List<String> {
    val root = File(context.cacheDir, "opened")
    // the page imports a copy as soon as it hears of it: one a day old is long done with
    root.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > DateUtils.DAY_IN_MILLIS }?.forEach { it.deleteRecursively() }
    val dir = File(root, System.nanoTime().toString(36)).apply { mkdirs() }
    val out = mutableListOf<String>()
    for (uri in uris(context, intent)) {
      val text = try { read(context, uri) } catch (e: Exception) { android.util.Log.w("eve", "could not read $uri", e); null } ?: continue
      out += write(dir, nameOf(context, uri), text)
    }
    // a shared piece of text rather than a file
    val shared = intent.getStringExtra(Intent.EXTRA_TEXT)
    if (out.isEmpty() && intent.action == Intent.ACTION_SEND && !shared.isNullOrBlank())
      out += write(dir, intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: "Shared", shared)
    return out
  }

  private fun uris(context: Context, intent: Intent): List<Uri> {
    val found = mutableListOf<Uri>()
    when (intent.action) {
      Intent.ACTION_VIEW -> intent.data?.let { found += it }
      Intent.ACTION_SEND -> stream(intent)?.let { found += it }
      Intent.ACTION_SEND_MULTIPLE -> found += streams(intent)
    }
    // some apps put the file only in the clip (where the read grant travels)
    if (found.isEmpty()) intent.clipData?.let { clip -> for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { found += it } }
    return found.distinct().filter { allowed(context, it) }
  }

  @Suppress("DEPRECATION")
  private fun stream(intent: Intent): Uri? =
    if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    else intent.getParcelableExtra(Intent.EXTRA_STREAM)

  @Suppress("DEPRECATION")
  private fun streams(intent: Intent): List<Uri> =
    (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
    else intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)).orEmpty()

  /** Nothing of Eve's own: any app may send file:///data/…/dev.happynut.eve/shared_prefs/… (or Eve's own
   *  FileProvider's address), and Eve, which can read it, would have made the sign-in a note. */
  private fun allowed(context: Context, uri: Uri): Boolean = when (uri.scheme) {
    "content" -> uri.authority != "${context.packageName}.fileprovider"
    "file" -> uri.path?.let { File(it).canonicalPath }?.startsWith(File(context.applicationInfo.dataDir).canonicalPath) == false
    else -> false
  }

  private fun read(context: Context, uri: Uri): String? {
    val bytes = context.contentResolver.openInputStream(uri)?.use { input ->
      val buf = java.io.ByteArrayOutputStream()
      val chunk = ByteArray(64 * 1024)
      while (true) {
        val n = input.read(chunk)
        if (n < 0) break
        buf.write(chunk, 0, n)
        if (buf.size() > MAX) return null
      }
      buf.toByteArray()
    } ?: return null
    // invalid bytes become U+FFFD: the page's read wants UTF-8 text, and an odd byte should not lose the file
    return String(bytes, Charsets.UTF_8)
  }

  /** The file's own name (the note's title comes from it when it has no heading), else its address's last part. */
  private fun nameOf(context: Context, uri: Uri): String {
    val shown = runCatching {
      context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
        if (c.moveToFirst() && !c.isNull(0)) c.getString(0) else null
      }
    }.getOrNull()
    return shown ?: uri.lastPathSegment?.substringAfterLast('/') ?: "Opened"
  }

  private fun write(dir: File, name: String, text: String): String {
    var base = name.replace(Regex("[\\\\/:*?\"<>|\\n\\r\\t]+"), " ").trim().trimStart('.').take(80).ifEmpty { "Opened" }
    // a shared "document" or a subject line: still a Markdown file to the page
    if (!TEXT.containsMatchIn(base)) base += ".md"
    var file = File(dir, base)
    var i = 2
    while (file.exists()) file = File(dir, base.replace(TEXT, " ${i++}$0"))
    file.writeText(text)
    return file.absolutePath
  }
}
