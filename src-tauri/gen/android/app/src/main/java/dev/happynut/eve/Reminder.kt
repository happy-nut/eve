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

  fun set(context: Context, on: Boolean, at: String, template: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putBoolean("on", on).putString("at", at).putString("template", template).apply()
    schedule(context)
  }

  private fun alarm(context: Context) = PendingIntent.getBroadcast(context, 7,
    Intent(context, ReminderReceiver::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

  /** The next occurrence of the time: later today, or tomorrow. Inexact (a window of ten minutes): no
   *  exact-alarm permission to ask for, and a reminder a few minutes late is still a reminder. */
  fun schedule(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val am = context.getSystemService(AlarmManager::class.java)
    am.cancel(alarm(context))
    if (!prefs.getBoolean("on", false)) return
    val (h, m) = (prefs.getString("at", "21:00") ?: "21:00").split(":").map { it.toIntOrNull() ?: 0 }
    val next = Calendar.getInstance().apply {
      set(Calendar.HOUR_OF_DAY, h); set(Calendar.MINUTE, m); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
      if (timeInMillis <= System.currentTimeMillis()) add(Calendar.DAY_OF_YEAR, 1)
    }
    am.setWindow(AlarmManager.RTC_WAKEUP, next.timeInMillis, 10 * 60 * 1000L, alarm(context))
  }

  /** The same test as daily.ts isWritten: a line the template did not put there. */
  fun written(context: Context, day: Calendar): Boolean {
    val key = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(day.time)
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

  fun fire(context: Context) {
    if (context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("on", false) && !written(context, Calendar.getInstance())) {
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

/** The alarm going off, and the moments an alarm is lost: a reboot, an update of the app. */
class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> Reminder.schedule(context)
      else -> Reminder.fire(context)
    }
  }
}
