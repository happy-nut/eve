package dev.happynut.eve.widget

import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.text.style.StrikethroughSpan
import android.text.style.StyleSpan
import android.text.style.TypefaceSpan
import org.json.JSONObject

/**
 * The note's markdown drawn with the spans a widget can carry (bold, italic, sizes, colours, strike,
 * monospace) — the same marks the editor shows, without an editor. One entry per block to show.
 * ponytail: line-based, not a markdown parser; nested emphasis inside links stays plain.
 */
class Markdown(
  private val accent: Int,
  private val dim: Int,
  private val codeBg: Int,
  /** false in the list's short previews, where a bigger heading would crowd the card */
  private val sized: Boolean = true,
) {

  fun blocks(body: String): List<CharSequence> {
    val out = mutableListOf<CharSequence>()
    val lines = body.lines()
    var i = 0
    while (i < lines.size) {
      val raw = lines[i]
      val fence = Regex("^\\s*```(\\w*)").find(raw)
      if (fence != null) {
        val lang = fence.groupValues[1]
        val code = mutableListOf<String>()
        i++
        while (i < lines.size && !lines[i].trimStart().startsWith("```")) code += lines[i++]
        i++ // the closing fence
        out += if (lang == "kanban") board(code.joinToString("\n")) else codeBlock(code)
        continue
      }
      block(raw)?.let { out += it }
      i++
    }
    return out
  }

  /** A one-line version for the list widget: the title, plain. */
  fun title(body: String): String = blocks(body).firstOrNull()?.toString()?.trim() ?: ""

  private fun block(raw: String): CharSequence? {
    if (raw.isBlank()) return null
    val indent = raw.length - raw.trimStart().length
    var line = raw.trim()
    val pad = "  ".repeat(indent / 2)
    val sb = SpannableStringBuilder()

    Regex("^(#{1,6})\\s+(.*)").find(line)?.let { m ->
      val size = floatArrayOf(1.3f, 1.18f, 1.08f, 1f, 1f, 1f)[m.groupValues[1].length - 1]
      inline(sb, m.groupValues[2])
      sb.setSpan(StyleSpan(Typeface.BOLD), 0, sb.length, EX)
      if (sized) sb.setSpan(RelativeSizeSpan(size), 0, sb.length, EX)
      return sb
    }
    if (Regex("^(-{3,}|\\*{3,}|_{3,})$").matches(line)) return dimmed("──────────")
    // a table: cells side by side, the |---| row dropped
    if (line.startsWith("|")) {
      if (Regex("^\\|?[\\s:|-]+\\|?$").matches(line)) return null
      val cells = line.trim('|').split("|").map { it.trim() }
      cells.forEachIndexed { k, c -> if (k > 0) sb.append("   ", ForegroundColorSpan(dim), EX); inline(sb, c) }
      return sb
    }
    // callout: > [!💡] text
    Regex("^>\\s?\\[!([^\\]]*)\\]\\s*(.*)").find(line)?.let { m ->
      sb.append(m.groupValues[1].ifBlank { "💡" }).append(" ")
      inline(sb, m.groupValues[2])
      return sb
    }
    if (line.startsWith(">")) {
      sb.append("▎ ", ForegroundColorSpan(accent), EX)
      val start = sb.length
      inline(sb, line.removePrefix(">").trimStart())
      sb.setSpan(ForegroundColorSpan(dim), start, sb.length, EX)
      sb.setSpan(StyleSpan(Typeface.ITALIC), start, sb.length, EX)
      return sb
    }
    // to-do: - [ ] / - [x] / [ ]
    Regex("^(?:[-*+]\\s+)?\\[([ xX])\\]\\s+(.*)").find(line)?.let { m ->
      val done = m.groupValues[1] != " "
      sb.append(pad).append(if (done) "☑ " else "☐ ", ForegroundColorSpan(if (done) dim else accent), EX)
      val start = sb.length
      inline(sb, m.groupValues[2])
      if (done) {
        sb.setSpan(StrikethroughSpan(), start, sb.length, EX)
        sb.setSpan(ForegroundColorSpan(dim), start, sb.length, EX)
      }
      return sb
    }
    Regex("^[-*+]\\s+(.*)").find(line)?.let { m ->
      sb.append(pad).append(if (indent >= 2) "◦ " else "• ", ForegroundColorSpan(dim), EX)
      inline(sb, m.groupValues[1])
      return sb
    }
    Regex("^(\\d+)[.)]\\s+(.*)").find(line)?.let { m ->
      sb.append(pad).append("${m.groupValues[1]}. ", ForegroundColorSpan(dim), EX)
      inline(sb, m.groupValues[2])
      return sb
    }
    line = line.trimEnd('\\') // markdown's hard break
    inline(sb, line)
    return sb
  }

  private val INLINE = Regex(
    "`([^`]+)`" +                              // 1 code
      "|\\*\\*(.+?)\\*\\*|__(.+?)__" +           // 2,3 bold
      "|~~(.+?)~~" +                             // 4 strike
      "|(?<![\\w*])\\*(?!\\s)(.+?)(?<!\\s)\\*(?!\\*)|(?<!\\w)_(?!\\s)(.+?)(?<!\\s)_(?!\\w)" + // 5,6 italic
      "|!\\[([^\\]]*)\\]\\([^)]*\\)" +           // 7 image / video / file
      "|\\[\\[([^\\]|]+)(?:\\|([^\\]]*))?\\]\\]" + // 8 note link, 9 its label
      "|\\[([^\\]]+)\\]\\([^)]*\\)" +            // 10 link
      "|(?<![\\w@])@(\\d{4}-\\d{2}-\\d{2})(?!\\d)" // 11 a day
  )

  private fun inline(sb: SpannableStringBuilder, text: String) {
    var at = 0
    for (m in INLINE.findAll(text)) {
      sb.append(text, at, m.range.first)
      at = m.range.last + 1
      val g = m.groupValues
      val start = sb.length
      when {
        g[1].isNotEmpty() -> {
          sb.append(g[1])
          sb.setSpan(TypefaceSpan("monospace"), start, sb.length, EX)
          sb.setSpan(BackgroundColorSpan(codeBg), start, sb.length, EX)
        }
        g[2].isNotEmpty() || g[3].isNotEmpty() -> {
          inline(sb, g[2].ifEmpty { g[3] })
          sb.setSpan(StyleSpan(Typeface.BOLD), start, sb.length, EX)
        }
        g[4].isNotEmpty() -> {
          inline(sb, g[4])
          sb.setSpan(StrikethroughSpan(), start, sb.length, EX)
        }
        g[5].isNotEmpty() || g[6].isNotEmpty() -> {
          inline(sb, g[5].ifEmpty { g[6] })
          sb.setSpan(StyleSpan(Typeface.ITALIC), start, sb.length, EX)
        }
        m.value.startsWith("![") -> sb.append("🖼 ").append(g[7].ifBlank { "" }).also {
          sb.setSpan(ForegroundColorSpan(dim), start, sb.length, EX)
        }
        g[8].isNotEmpty() -> {
          sb.append(g[9].ifBlank { g[8] })
          sb.setSpan(ForegroundColorSpan(accent), start, sb.length, EX)
        }
        g[10].isNotEmpty() -> {
          sb.append(g[10])
          sb.setSpan(ForegroundColorSpan(accent), start, sb.length, EX)
        }
        g[11].isNotEmpty() -> {
          sb.append(day(g[11]))
          sb.setSpan(ForegroundColorSpan(accent), start, sb.length, EX)
        }
        else -> sb.append(m.value)
      }
    }
    sb.append(text, at, text.length)
  }

  /** `@2026-09-24` the way the app reads it: 2026.09.24 */
  private fun day(iso: String) = iso.replace('-', '.')

  private fun codeBlock(code: List<String>): CharSequence {
    val sb = SpannableStringBuilder(code.joinToString("\n").ifEmpty { " " })
    sb.setSpan(TypefaceSpan("monospace"), 0, sb.length, EX)
    sb.setSpan(RelativeSizeSpan(0.92f), 0, sb.length, EX)
    sb.setSpan(ForegroundColorSpan(dim), 0, sb.length, EX)
    return sb
  }

  /** A kanban fence as its columns and card counts: "📋 To do 3 · Doing 1 · Done 2" */
  private fun board(json: String): CharSequence {
    val cols = runCatching { JSONObject(json).getJSONArray("columns") }.getOrNull() ?: return codeBlock(json.lines())
    val parts = (0 until cols.length()).map {
      val c = cols.getJSONObject(it)
      "${c.optString("title")} ${c.optJSONArray("cards")?.length() ?: 0}"
    }
    return SpannableStringBuilder("📋 " + parts.joinToString(" · "))
  }

  private fun dimmed(s: String) = SpannableStringBuilder(s).apply { setSpan(ForegroundColorSpan(dim), 0, length, EX) }

  private companion object {
    const val EX = Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
  }
}
