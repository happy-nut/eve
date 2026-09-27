package dev.happynut.eve

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Update in place: download the release's APK and hand it to the system installer, which asks once
 * ("Update"). The first time, Android also wants Eve allowed to install apps; that settings page is
 * opened instead, and the next tap goes through. Same signing key, so notes and sign-in stay.
 */
object Updater {
  private const val PREFIX = "https://github.com/happy-nut/eve/releases/download/"

  /** state goes to `report`: "permission", "downloading", "installing", or "error" */
  fun install(activity: Activity, url: String, report: (String) -> Unit) {
    if (!url.startsWith(PREFIX) || !url.endsWith(".apk")) return report("error")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.packageManager.canRequestPackageInstalls()) {
      activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
      return report("permission")
    }
    report("downloading")
    Thread {
      val apk = File(activity.cacheDir, "update.apk")
      val ok = runCatching {
        var conn = URL(url).openConnection() as HttpURLConnection
        // GitHub answers with a redirect to its file host; follow it (https only)
        var hops = 0
        while (conn.responseCode in 300..399 && hops++ < 5) {
          val next = conn.getHeaderField("Location") ?: break
          conn.disconnect()
          if (!next.startsWith("https://")) error("insecure redirect")
          conn = URL(next).openConnection() as HttpURLConnection
        }
        if (conn.responseCode != 200) error("HTTP ${conn.responseCode}")
        conn.inputStream.use { input -> apk.outputStream().use { input.copyTo(it) } }
        conn.disconnect()
      }.isSuccess
      activity.runOnUiThread {
        if (!ok) return@runOnUiThread report("error")
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", apk)
        activity.startActivity(Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(uri, "application/vnd.android.package-archive")
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        })
        report("installing")
      }
    }.start()
  }
}
