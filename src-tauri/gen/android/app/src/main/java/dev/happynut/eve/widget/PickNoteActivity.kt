package dev.happynut.eve.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.ListView
import android.widget.TextView
import dev.happynut.eve.R

/**
 * What a widget shows, from its long-press "Widget settings" (Android 12+ adds the widget straight
 * away as the newest notes): the newest notes, or one note pinned for good.
 */
class PickNoteActivity : Activity() {
  private companion object {
    val FILE_ACTIONS = setOf(Intent.ACTION_VIEW, Intent.ACTION_SEND, Intent.ACTION_SEND_MULTIPLE)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // The build puts the app's "open / share Markdown" filters on every activity (tauri-build inserts them
    // before each </activity>), so this one is offered too, as a second "Eve": such a file is for Eve itself.
    // It used to end here with nothing done.
    if (intent?.action in FILE_ACTIONS) {
      startActivity(Intent(intent).setClass(this, dev.happynut.eve.MainActivity::class.java).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
      return finish()
    }
    val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
    // backing out adds no widget
    setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
    if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return finish()

    setContentView(R.layout.widget_pick)
    val md = Markdown(0, 0, 0)
    val notes = readNotes(NotesWidget.notesDir(this), NotesWidget.showDaily(this)).filter { it.body.isNotBlank() }
    val current = NotesWidget.pinned(this, widgetId)
    val labels = listOf("🕘  " + getString(R.string.widget_recent)) +
      notes.map { "${it.icon.ifEmpty { "📝" }}  ${md.title(it.body).ifEmpty { "Untitled" }}" }

    val list = findViewById<ListView>(R.id.pick_list)
    list.adapter = ArrayAdapter(this, R.layout.widget_pick_row, labels)
    list.choiceMode = ListView.CHOICE_MODE_SINGLE
    list.setItemChecked(if (current == null) 0 else maxOf(0, notes.indexOfFirst { it.id == current } + 1), true)
    // a tap only selects; OK applies it, Cancel (or back) leaves the widget as it was
    findViewById<Button>(R.id.pick_cancel).setOnClickListener { finish() }
    findViewById<Button>(R.id.pick_ok).setOnClickListener {
      val pos = list.checkedItemPosition
      NotesWidget.pin(this, widgetId, if (pos <= 0) null else notes[pos - 1].id)
      NotesWidget.refresh(this)
      setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
      finish()
    }
    findViewById<TextView>(R.id.pick_title).text = getString(R.string.widget_pick)
  }
}
