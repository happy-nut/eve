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

/** The alarm going off, and the moments an alarm is lost or goes wrong: a reboot, an update of the app, and
 *  the clock or the time zone changing (the alarm is set at a moment, so 21:00 set in Seoul rang at 13:00 in
 *  London, put right only after it had). */
class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_TIME_CHANGED -> Reminder.schedule(context)
      else -> Reminder.fire(context, intent.getStringExtra("day"))
    }
  }
}
