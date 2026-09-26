package dev.happynut.eve.sync

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.util.Base64
import dev.happynut.eve.MainActivity
import dev.happynut.eve.widget.NotesWidget
import dev.happynut.eve.widget.frontmatter
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Background sync, pull only: while Eve is closed, notes changed elsewhere come down from the GitHub
 * repository into the notes folder, and the widget redraws. Pushing stays with the app, which pushes
 * as it leaves the screen.
 *
 * Same rules as the app's own round (github.ts / sync.svelte.ts): only blobs whose sha moved are
 * fetched; a note untouched here since the last pull takes the remote version; otherwise the later
 * `updated` wins. Pictures never change once written, so a missing one is fetched and nothing else.
 * The app keeps its own record of the remote and simply finds these files already current.
 * ponytail: pull-only; a push here would be a second copy of the commit logic in github.ts.
 */
class PullJob : JobService() {
  companion object {
    private const val PERIODIC = 1
    private const val ONCE = 2
    private const val PREFS = "sync"
    private const val API = "https://api.github.com/repos/"

    /** The app's sign-in, handed over by the page (sign-out passes ""). Starts or stops the schedule. */
    fun account(context: Context, repo: String, token: String) {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val jobs = context.getSystemService(JobScheduler::class.java)
      val same = prefs.getString("repo", "") == repo && prefs.getString("token", "") == token
      if (same && (token.isEmpty() || jobs.getPendingJob(PERIODIC) != null)) return
      if (token.isEmpty()) jobs.cancelAll()
      else jobs.schedule(
        JobInfo.Builder(PERIODIC, ComponentName(context, PullJob::class.java))
          .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
          .setPeriodic(15 * 60 * 1000L) // the floor Android allows
          .setPersisted(true)
          .build()
      )
      // saved once scheduled, so a refusal is tried again on the next call
      // (another account starts its record of the remote over)
      if (!same) prefs.edit().clear().putString("repo", repo).putString("token", token).apply()
    }

    /** Pull as soon as there is a network (the widget's ↻). */
    fun now(context: Context) {
      context.getSystemService(JobScheduler::class.java).schedule(
        JobInfo.Builder(ONCE, ComponentName(context, PullJob::class.java))
          .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
          .build()
      )
    }

    /** git's blob id, as the tree listing reports it */
    fun blobSha(data: ByteArray): String {
      val md = MessageDigest.getInstance("SHA-1")
      md.update("blob ${data.size}\u0000".toByteArray())
      return md.digest(data).joinToString("") { "%02x".format(it) }
    }

    private val SAFE = Regex("^notes/(assets/)?[A-Za-z0-9_.-]+$")

    /** One pull. True when a file changed here. */
    fun pull(context: Context): Boolean {
      if (MainActivity.inFront) return false // the app is syncing itself, and holds the notes in memory
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val repo = prefs.getString("repo", "").orEmpty()
      val token = prefs.getString("token", "").orEmpty()
      if (repo.isEmpty() || token.isEmpty()) return false

      fun get(path: String): JSONObject {
        val c = URL(API + repo + path).openConnection() as HttpURLConnection
        c.connectTimeout = 15_000
        c.readTimeout = 30_000
        c.useCaches = false
        c.setRequestProperty("Authorization", "Bearer $token")
        c.setRequestProperty("Accept", "application/vnd.github+json")
        try {
          if (c.responseCode != 200) throw IllegalStateException("${c.responseCode} $path")
          return JSONObject(c.inputStream.bufferedReader().readText())
        } finally {
          c.disconnect()
        }
      }

      val commit = get("/branches/main").getJSONObject("commit")
      val head = commit.getString("sha")
      if (head == prefs.getString("head", "")) return false
      val tree = get("/git/trees/${commit.getJSONObject("commit").getJSONObject("tree").getString("sha")}?recursive=1")
        .getJSONArray("tree")
      val known = JSONObject(prefs.getString("known", "{}")!!)
      val next = JSONObject()
      val dir = NotesWidget.notesDir(context)
      var changed = false

      for (i in 0 until tree.length()) {
        val e = tree.getJSONObject(i)
        val path = e.getString("path")
        if (e.getString("type") != "blob" || !SAFE.matches(path)) continue
        val sha = e.getString("sha")
        next.put(path, sha)
        if (known.optString(path) == sha) continue
        val file = File(dir, path.removePrefix("notes/"))
        val local = if (file.isFile) file.readBytes() else null
        if (local != null && blobSha(local) == sha) continue
        if (path.startsWith("notes/assets/")) {
          if (local == null) { write(file, blob(::get, sha)); changed = true }
          continue
        }
        if (!path.endsWith(".md")) continue
        val remote = blob(::get, sha)
        val take = when {
          local == null -> true
          known.has(path) && blobSha(local) == known.getString(path) -> true // untouched here: remote wins
          else -> updated(remote) > updated(local)
        }
        if (take) { write(file, remote); changed = true }
      }
      prefs.edit().putString("head", head).putString("known", next.toString()).apply()
      if (changed) NotesWidget.refresh(context)
      return changed
    }

    private fun blob(get: (String) -> JSONObject, sha: String): ByteArray =
      Base64.decode(get("/git/blobs/$sha").getString("content"), Base64.DEFAULT)

    private fun updated(md: ByteArray) = frontmatter(String(md))?.get("updated")?.toLongOrNull() ?: 0

    private fun write(file: File, bytes: ByteArray) {
      file.parentFile?.mkdirs()
      val tmp = File(file.path + ".tmp")
      tmp.writeBytes(bytes)
      tmp.renameTo(file)
    }
  }

  override fun onStartJob(params: JobParameters): Boolean {
    Thread {
      val retry = runCatching { pull(applicationContext) }.isFailure
      jobFinished(params, retry && params.jobId == ONCE)
    }.start()
    return true
  }

  override fun onStopJob(params: JobParameters) = true
}
