package dev.happynut.eve.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.text.format.DateUtils
import android.view.View
import android.widget.RemoteViews
import androidx.core.widget.RemoteViewsCompat
import dev.happynut.eve.MainActivity
import dev.happynut.eve.R
import dev.happynut.eve.sync.PullJob
import java.io.File

/**
 * Home-screen widget, in one of two modes picked when it is added (and again from a long-press):
 * the newest notes, or one note pinned and shown whole. A tap opens the note in Eve ready to write,
 * + starts a new one, ↻ pulls from GitHub. The widget only reads the note files; every edit goes
 * through the app, which is what pushes it.
 */
class NotesWidget : AppWidgetProvider() {
  companion object {
    const val EXTRA_OPEN = "dev.happynut.eve.OPEN"
    private const val ACTION_PULL = "dev.happynut.eve.PULL"
    /** the list widget shows this many of the newest notes */
    private const val MAX = 40
    private const val PREFS = "widgets"

    /** The note a widget is pinned to; null = the newest notes. */
    fun pinned(context: Context, widgetId: Int): String? =
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("note_$widgetId", null)

    fun pin(context: Context, widgetId: Int, noteId: String?) =
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
        if (noteId == null) remove("note_$widgetId") else putString("note_$widgetId", noteId)
      }.apply()

    fun notesDir(context: Context) = File(context.applicationInfo.dataDir, "notes")

    /** Redraw every Eve widget from the note files. The system keeps what it is handed and shows it
     *  when the home screen comes back, so a change made while Eve is in front is not lost. */
    fun refresh(context: Context) {
      val mgr = AppWidgetManager.getInstance(context)
      val ids = mgr.getAppWidgetIds(ComponentName(context, NotesWidget::class.java))
      if (ids.isEmpty()) return
      val notes = readNotes(notesDir(context))
      val full = markdown(context, sized = true)
      val compact = markdown(context, sized = false)
      for (id in ids) mgr.updateAppWidget(id, views(context, id, notes, if (pinned(context, id) == null) compact else full))
    }

    private fun markdown(context: Context, sized: Boolean) =
      Markdown(context.getColor(R.color.widget_accent), context.getColor(R.color.widget_dim), context.getColor(R.color.widget_code), sized)

    private fun views(context: Context, widgetId: Int, notes: List<Note>, md: Markdown): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.widget_notes)
      val items = RemoteViewsCompat.RemoteCollectionItems.Builder().setHasStableIds(true).setViewTypeCount(2)
      val pinnedId = pinned(context, widgetId)
      if (pinnedId == null) {
        views.setTextViewText(R.id.widget_title, "Eve")
        views.setOnClickPendingIntent(R.id.widget_title, open(context, "", 2))
        views.setTextViewText(R.id.widget_empty, context.getString(R.string.widget_empty))
        views.setOnClickPendingIntent(R.id.widget_empty, open(context, "new", 3))
        for (n in notes.filter { it.body.isNotBlank() }.take(MAX)) items.addItem(n.id.hashCode().toLong(), card(context, n, md))
      } else {
        val note = notes.find { it.id == pinnedId }
        views.setTextViewText(R.id.widget_title, note?.let { "${it.icon.ifEmpty { "📝" }}  ${md.title(it.body).ifEmpty { "Untitled" }}" } ?: "Eve")
        views.setOnClickPendingIntent(R.id.widget_title, open(context, "note:$pinnedId", 100 + widgetId))
        views.setTextViewText(R.id.widget_empty, context.getString(if (note == null) R.string.widget_gone else R.string.widget_blank))
        views.setOnClickPendingIntent(R.id.widget_empty, open(context, "note:$pinnedId", 100 + widgetId))
        // the title is already in the header
        note?.let { md.blocks(it.body).drop(1) }?.forEachIndexed { i, block ->
          items.addItem(i.toLong(), line(context, block, pinnedId))
        }
      }
      RemoteViewsCompat.setRemoteAdapter(context, views, widgetId, R.id.widget_list, items.build())
      views.setEmptyView(R.id.widget_list, R.id.widget_empty)
      views.setOnClickPendingIntent(R.id.widget_new, open(context, "new", 1))
      views.setOnClickPendingIntent(R.id.widget_pull, PendingIntent.getBroadcast(context, 5,
        Intent(context, NotesWidget::class.java).setAction(ACTION_PULL), PendingIntent.FLAG_IMMUTABLE))
      // rows fill in "note:<id>" on this template
      views.setPendingIntentTemplate(R.id.widget_list, open(context, "", 4, mutable = true))
      return views
    }

    private fun card(context: Context, n: Note, md: Markdown): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.widget_note_row)
      val blocks = md.blocks(n.body)
      views.setTextViewText(R.id.row_icon, n.icon.ifEmpty { "📝" })
      views.setTextViewText(R.id.row_title, blocks.firstOrNull()?.toString()?.trim().orEmpty().ifEmpty { "Untitled" })
      val preview = android.text.SpannableStringBuilder()
      blocks.drop(1).take(3).forEachIndexed { i, b -> if (i > 0) preview.append('\n'); preview.append(b) }
      views.setTextViewText(R.id.row_preview, preview)
      views.setViewVisibility(R.id.row_preview, if (preview.isEmpty()) View.GONE else View.VISIBLE)
      val now = System.currentTimeMillis()
      views.setTextViewText(R.id.row_time,
        if (now - n.updated < DateUtils.MINUTE_IN_MILLIS) context.getString(R.string.widget_now)
        else DateUtils.getRelativeTimeSpanString(n.updated, now, DateUtils.MINUTE_IN_MILLIS, DateUtils.FORMAT_ABBREV_RELATIVE))
      views.setOnClickFillInIntent(R.id.row, Intent().putExtra(EXTRA_OPEN, "note:${n.id}"))
      return views
    }

    private fun line(context: Context, block: CharSequence, noteId: String): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.widget_line)
      views.setTextViewText(R.id.line, block)
      views.setOnClickFillInIntent(R.id.line, Intent().putExtra(EXTRA_OPEN, "note:$noteId"))
      return views
    }

    private fun open(context: Context, what: String, code: Int, mutable: Boolean = false): PendingIntent {
      val intent = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        if (what.isNotEmpty()) putExtra(EXTRA_OPEN, what)
      }
      val flag = if (mutable) PendingIntent.FLAG_MUTABLE else PendingIntent.FLAG_IMMUTABLE
      return PendingIntent.getActivity(context, code, intent, flag or PendingIntent.FLAG_UPDATE_CURRENT)
    }
  }

  override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) = refresh(context)

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ACTION_PULL) PullJob.now(context)
  }

  override fun onDeleted(context: Context, ids: IntArray) { for (id in ids) pin(context, id, null) }
}

data class Note(val id: String, val icon: String, val body: String, val updated: Long)

/** The notes folder, newest first. Same files the app writes: `---` frontmatter, then markdown. */
fun readNotes(dir: File): List<Note> =
  (dir.listFiles { f -> f.extension == "md" } ?: emptyArray())
    .mapNotNull { runCatching { parseNote(it.readText()) }.getOrNull() }
    .filter { !it.second }
    .map { it.first }
    .sortedByDescending { it.updated }

/** The note and whether it is a tombstone. */
fun parseNote(text: String): Pair<Note, Boolean>? {
  val meta = frontmatter(text) ?: return null
  val id = meta["id"] ?: return null
  val end = text.indexOf("\n---", 4)
  val body = text.substring(end + 4).removePrefix("\n")
  return Note(id, meta["icon"].orEmpty(), body, meta["updated"]?.toLongOrNull() ?: 0) to (meta["deleted"] == "true")
}

fun frontmatter(text: String): Map<String, String>? {
  if (!text.startsWith("---\n")) return null
  val end = text.indexOf("\n---", 4).takeIf { it > 0 } ?: return null
  return text.substring(4, end).lines().mapNotNull { l ->
    val i = l.indexOf(':'); if (i <= 0) null else l.substring(0, i).trim() to l.substring(i + 1).trim()
  }.toMap()
}
