package dev.happynut.eve

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.print.PdfPrint
import android.print.PrintAttributes
import android.webkit.WebView
import androidx.core.content.FileProvider
import java.io.File

/**
 * A note leaving the phone: Markdown as it is stored, a PDF printed from the page (the app's print
 * styles, as on the Mac), or a picture of that PDF's first page. Each goes to the share sheet, which
 * saves to Files or Drive, or sends it on.
 */
object Exporter {
  private fun dir(activity: Activity) = File(activity.cacheDir, "export").apply { mkdirs() }

  /** a file name from a title: no slashes or other characters a file system or chat app trips on */
  private fun fileName(title: String, ext: String) =
    (title.replace(Regex("[\\\\/:*?\"<>|\\n\\r\\t]+"), " ").trim().take(80).ifEmpty { "Eve note" }) + ".$ext"

  fun markdown(activity: Activity, title: String, body: String) {
    val f = File(dir(activity), fileName(title, "md")).apply { writeText(body) }
    share(activity, f, "text/markdown")
  }

  fun pdf(activity: Activity, webView: WebView, title: String, done: (Boolean) -> Unit) {
    val f = File(dir(activity), fileName(title, "pdf"))
    print(webView, title, f) { ok -> if (ok) share(activity, f, "application/pdf"); done(ok) }
  }

  fun png(activity: Activity, webView: WebView, title: String, done: (Boolean) -> Unit) {
    val pdf = File(dir(activity), "page.pdf")
    print(webView, title, pdf) { ok ->
      if (!ok) return@print done(false)
      val out = File(dir(activity), fileName(title, "png"))
      runCatching {
        ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
          PdfRenderer(fd).use { r ->
            r.openPage(0).use { page ->
              val width = 1600 // the width the Mac's export uses
              val bmp = Bitmap.createBitmap(width, width * page.height / page.width, Bitmap.Config.ARGB_8888)
              bmp.eraseColor(Color.WHITE)
              page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
              out.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
            }
          }
        }
      }.onSuccess { share(activity, out, "image/png"); done(true) }.onFailure { done(false) }
      pdf.delete()
    }
  }

  /** A4 with the Mac's 24pt margins (1/3 inch, in mils) */
  private fun print(webView: WebView, title: String, out: File, done: (Boolean) -> Unit) {
    val attrs = PrintAttributes.Builder()
      .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
      .setResolution(PrintAttributes.Resolution("pdf", "pdf", 300, 300))
      .setMinMargins(PrintAttributes.Margins(333, 333, 333, 333))
      .build()
    PdfPrint.write(webView.createPrintDocumentAdapter(title), attrs, out, done)
  }

  private fun share(activity: Activity, f: File, mime: String) {
    val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", f)
    val send = Intent(Intent.ACTION_SEND).apply {
      type = mime
      putExtra(Intent.EXTRA_STREAM, uri)
      putExtra(Intent.EXTRA_TITLE, f.name)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    activity.startActivity(Intent.createChooser(send, f.name))
  }
}
