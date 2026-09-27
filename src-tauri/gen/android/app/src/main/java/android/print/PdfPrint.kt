package android.print

import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import java.io.File

/**
 * Print a WebView's document straight to a PDF file, with no print dialog: the same pages Android's
 * "Save as PDF" would make, drawn with the page's @media print styles. The two callbacks have
 * package-private constructors, which is why this lives in android.print.
 */
object PdfPrint {
  fun write(adapter: PrintDocumentAdapter, attrs: PrintAttributes, out: File, done: (Boolean) -> Unit) {
    adapter.onLayout(null, attrs, null, object : PrintDocumentAdapter.LayoutResultCallback() {
      override fun onLayoutFinished(info: PrintDocumentInfo?, changed: Boolean) {
        val fd = ParcelFileDescriptor.open(out, ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_TRUNCATE or ParcelFileDescriptor.MODE_READ_WRITE)
        adapter.onWrite(arrayOf(PageRange.ALL_PAGES), fd, CancellationSignal(), object : PrintDocumentAdapter.WriteResultCallback() {
          override fun onWriteFinished(pages: Array<out PageRange>?) { fd.close(); adapter.onFinish(); done(true) }
          override fun onWriteFailed(error: CharSequence?) { fd.close(); adapter.onFinish(); done(false) }
        })
      }
      override fun onLayoutFailed(error: CharSequence?) = done(false)
    }, null)
  }
}
