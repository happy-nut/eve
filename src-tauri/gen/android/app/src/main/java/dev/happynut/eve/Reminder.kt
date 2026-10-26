package dev.happynut.eve

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.app.Notification
import dev.happynut.eve.widget.NotesWidget
import java.io.File
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/**
 * The daily note reminder, which has to work with Eve closed: an alarm at the chosen time reads today's
 * note file (the same one the widget reads) and, if nothing has been written in it yet, posts a
 * notification that opens it. Then the next day's alarm is set. The page sets it (setReminder); a
 * reboot or an update of the app sets it again.
 */
object Reminder {
  private const val PREFS = "reminder"
  private const val CHANNEL = "daily"

  /** The page calls this on every start and every change of the notes, so only a new time (or turning it on
   *  or off) sets the alarm again: setting it again cancels today's alarm, and Eve opened at 21:05 with
   *  today's 21:00 still on its way (inexact, later under Doze) moved it to tomorrow, today's reminder lost.
   *  An alarm gone altogether (a force stop drops it, and its PendingIntent with it) is still set again. */
  fun set(context: Context, on: Boolean, at: String, template: String) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val same = prefs.contains("on") && prefs.getBoolean("on", false) == on && prefs.getString("at", null) == at
    prefs.edit().putBoolean("on", on).putString("at", at).putString("template", template).apply()
    val pending = PendingIntent.getBroadcast(context, 7, Intent(context, ReminderReceiver::class.java),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_NO_CREATE) != null
    if (!same || (on && !pending)) schedule(context)
  }

  private const val DAY = "day"
  /** the last day whose alarm came (yyyy-MM-dd), so setting it again knows whether today's is still to come */
  private const val FIRED = "fired"
  private fun keyOf(day: Calendar) = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(day.time)

  /** the alarm, carrying the day it is for (yyyy-MM-dd) */
  private fun alarm(context: Context, day: String? = null) = PendingIntent.getBroadcast(context, 7,
    Intent(context, ReminderReceiver::class.java).putExtra(DAY, day), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

  /** The next occurrence of the time: later today, or tomorrow. Inexact (a window of ten minutes): no
   *  exact-alarm permission to ask for, and a reminder a few minutes late is still a reminder. */
  /** Set again just after the time (the clock or the time zone changed, a reboot, an update of the app, a new
   *  time from the page): inside the ten minutes today's alarm may still be on its way, and moving it to
   *  tomorrow lost today's reminder. Within them, unless today's has come already, today's is still due (now). */
  fun schedule(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val am = context.getSystemService(AlarmManager::class.java)
    am.cancel(alarm(context))
    if (!prefs.getBoolean("on", false)) return
    val (h, m) = (prefs.getString("at", "21:00") ?: "21:00").split(":").map { it.toIntOrNull() ?: 0 }
    val now = System.currentTimeMillis()
    val window = 10 * 60 * 1000L
    val next = Calendar.getInstance().apply {
      set(Calendar.HOUR_OF_DAY, h); set(Calendar.MINUTE, m); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }
    val day = keyOf(next)
    if (next.timeInMillis <= now) {
      if (now - next.timeInMillis < window && prefs.getString(FIRED, null) != day) {
        am.setWindow(AlarmManager.RTC_WAKEUP, now + 1000L, window, alarm(context, day))
        return
      }
      next.add(Calendar.DAY_OF_YEAR, 1)
    }
    am.setWindow(AlarmManager.RTC_WAKEUP, next.timeInMillis, window, alarm(context, keyOf(next)))
  }

  /** The same test as daily.ts isWritten: a line the template did not put there. */
  fun written(context: Context, day: Calendar): Boolean {
    val key = keyOf(day)
    val file = File(NotesWidget.notesDir(context), "daily-$key.md")
    if (!file.isFile) return false
    val text = file.readText()
    val m = Regex("^---\\n([\\s\\S]*?)\\n---\\n?([\\s\\S]*)$").find(text) ?: return false
    if (Regex("(?m)^deleted:\\s*true\\s*$").containsMatchIn(m.groupValues[1])) return false
    val weekday = SimpleDateFormat("EEEE", Locale.getDefault()).format(day.time)
    val template = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("template", "") ?: ""
    fun norm(l: String) = l.replace(' ', ' ').trim()
    val given = template.replace("{{date}}", key).replace("{{weekday}}", weekday).split("\n").map(::norm).toSet()
    return m.groupValues[2].split("\n").map(::norm).any { it.isNotEmpty() && it !in given }
  }

  /** `day`: the day the alarm was set for. The alarm may come up to ten minutes late: one for 23:55 could
   *  arrive past midnight and say "nothing written yet today" of a day just begun; it only sets the next. */
  fun fire(context: Context, day: String?) {
    val today = Calendar.getInstance()
    val due = day == null || day == keyOf(today)
    if (due) context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(FIRED, keyOf(today)).apply()
    if (due && context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("on", false) && !written(context, today)) {
      val nm = context.getSystemService(NotificationManager::class.java)
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Daily note reminder", NotificationManager.IMPORTANCE_DEFAULT))
      val open = PendingIntent.getActivity(context, 8,
        Intent(context, MainActivity::class.java).putExtra(NotesWidget.EXTRA_OPEN, "daily")
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      nm.notify(1, Notification.Builder(context, CHANNEL)
        .setSmallIcon(R.drawable.ic_reminder)
        .setContentTitle("Today's daily note")
        .setContentText("Nothing written yet today. A line or two?")
        .setContentIntent(open)
        .setAutoCancel(true)
        .build())
    }
    schedule(context)
  }
}

/**
 * The reminders written in notes (`@remind`: `@2026-10-26 09:00 ⏰` in the file), rung with Eve closed. The note
 * files are read here, as the widget reads them, so one written on the Mac rings once the background pull has
 * brought it. One alarm at a time, for the next one due; when it comes, every reminder due since the last ring is
 * shown and the next is set. Read again whenever the notes change (the page, the pull) and after a reboot.
 * The same reading as date.ts remindersIn: a done to-do and code do not ring.
 */
object LineReminders {
  private const val PREFS = "lines"
  private const val THROUGH = "through" // rung up to this moment (ms)
  private const val CHANNEL = "lines"
  const val ACTION = "dev.happynut.eve.LINE_REMINDER"
  private val IN_LINE = Regex("(?<![\\w@])@(\\d{4}-\\d{2}-\\d{2}) ((?:[01]\\d|2[0-3]):[0-5]\\d) ⏰")
  private val DONE = Regex("^\\s*(?:[-*+]|\\d+[.)])\\s+\\[[xX]\\]")
  private val MARKS = Regex("^\\s*(?:>\\s*)*(?:#{1,6}\\s+|[-*+]\\s+(?:\\[[ xX]\\]\\s+)?|\\d+[.)]\\s+)?")

  data class Due(val at: Long, val id: String, val title: String, val line: String)

  /** every reminder in every note, a note's own deleted ones left out */
  fun all(context: Context): List<Due> {
    val out = mutableListOf<Due>()
    val fmt = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).apply { isLenient = false }
    for (file in NotesWidget.notesDir(context).listFiles { f -> f.isFile && f.name.endsWith(".md") } ?: emptyArray()) {
      val text = runCatching { file.readText() }.getOrNull() ?: continue
      if (!text.contains('⏰')) continue
      val front = dev.happynut.eve.widget.frontmatter(text)
      if (front?.get("deleted") == "true") continue
      val body = if (front != null) text.substring(text.indexOf("\n---", 4) + 4).trimStart('\n') else text
      var title = ""
      // the fence a line is in ("" a plain one): code is code, but a board's cards are words (date.ts's remindersIn)
      var fence: String? = null
      for (line0 in body.split("\n")) {
        if (title.isEmpty() && line0.isNotBlank()) title = line0.replace(Regex("^#+\\s*"), "").trim()
        val opening = Regex("^\\s*(?:```|~~~)(\\w*)").find(line0)
        if (opening != null) { fence = if (fence == null) opening.groupValues[1] else null; continue }
        if ((fence != null && fence != "kanban") || DONE.containsMatchIn(line0)) continue
        val raw = if (fence == "kanban") line0.replace(Regex("^\\s*\"[^\"]*\":\\s*\""), "").replace(Regex("\",?\\s*$"), "").replace("\\n", " ") else line0
        for (m in IN_LINE.findAll(raw)) {
          val at = runCatching { fmt.parse("${m.groupValues[1]} ${m.groupValues[2]}")?.time }.getOrNull() ?: continue
          val line = MARKS.replace(raw.replace(IN_LINE, ""), "").replace(Regex("\\s+"), " ").trim()
          out += Due(at, file.name.removeSuffix(".md"), title.ifEmpty { "Untitled" }, line.ifEmpty { "${m.groupValues[1]} ${m.groupValues[2]}" })
        }
      }
    }
    return out
  }

  private fun alarm(context: Context) = PendingIntent.getBroadcast(context, 9,
    Intent(context, ReminderReceiver::class.java).setAction(ACTION), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

  /** The alarm for the next reminder not rung yet (one already past, missed while the phone was off: now).
   *  Inexact by a minute: no exact-alarm permission to ask for. Reads files: not on the main thread. */
  fun schedule(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val now = System.currentTimeMillis()
    // the first reading ever rings nothing old
    if (!prefs.contains(THROUGH)) prefs.edit().putLong(THROUGH, now).apply()
    val through = prefs.getLong(THROUGH, now)
    val am = context.getSystemService(AlarmManager::class.java)
    am.cancel(alarm(context))
    val next = all(context).map { it.at }.filter { it > maxOf(through, now - DAY_MS) }.minOrNull() ?: return
    am.setWindow(AlarmManager.RTC_WAKEUP, maxOf(next, now + 1000L), 60_000L, alarm(context))
  }

  /** The alarm: what has come due since the last ring (not older than a day), each its own notification
   *  opening its note; then the next. */
  fun fire(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val now = System.currentTimeMillis()
    val from = maxOf(prefs.getLong(THROUGH, now), now - DAY_MS)
    prefs.edit().putLong(THROUGH, now).apply()
    val due = all(context).filter { it.at > from && it.at <= now }
    if (due.isNotEmpty()) {
      val nm = context.getSystemService(NotificationManager::class.java)
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Reminders in notes", NotificationManager.IMPORTANCE_HIGH))
      for (d in due) {
        val code = (d.id + d.at + d.line).hashCode()
        val open = PendingIntent.getActivity(context, code,
          Intent(context, MainActivity::class.java).putExtra(NotesWidget.EXTRA_OPEN, "note:${d.id}")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
          PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        nm.notify(code, Notification.Builder(context, CHANNEL)
          .setSmallIcon(R.drawable.ic_reminder)
          .setContentTitle(d.title)
          .setContentText(d.line)
          .setWhen(d.at)
          .setShowWhen(true)
          .setContentIntent(open)
          .setAutoCancel(true)
          .build())
      }
    }
    schedule(context)
  }

  /** Read again off the main thread (the page calls it as notes are written) */
  fun scheduleSoon(context: Context) { val app = context.applicationContext; Thread { runCatching { schedule(app) } }.start() }

  private const val DAY_MS = 86_400_000L
}

/** The alarm going off, and the moments an alarm is lost or goes wrong: a reboot, an update of the app, and
 *  the clock or the time zone changing (the alarm is set at a moment, so 21:00 set in Seoul rang at 13:00 in
 *  London, put right only after it had). */
class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_TIME_CHANGED -> { Reminder.schedule(context); later { LineReminders.schedule(context) } }
      LineReminders.ACTION -> later { LineReminders.fire(context) }
      else -> Reminder.fire(context, intent.getStringExtra("day"))
    }
  }

  /** files read off the main thread, the receiver kept alive until they are */
  private fun later(run: () -> Unit) {
    val done = goAsync()
    Thread { try { runCatching(run) } finally { done.finish() } }.start()
  }
}
