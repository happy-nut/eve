package dev.happynut.eve

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

class LineRemindersTest {
  @Test
  fun readsRemindersAsTheAppDoes() {
    val cases = JSONArray(File("../../../../src/lib/reminderCases.json").readText())
    for (i in 0 until cases.length()) {
      val case = cases.getJSONObject(i)
      val body = case.getString("body")
      val want = case.getJSONArray("reminders").let { r -> (0 until r.length()).map { r.getJSONArray(it).let { x -> listOf(x.getString(0), x.getString(1), x.getString(2)) } } }
      assertEquals(body, want, LineReminders.inBody(body).map { listOf(it.day, it.time, it.line) })
    }
  }
}
