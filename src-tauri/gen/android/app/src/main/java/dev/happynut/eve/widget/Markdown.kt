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
    lists.clear()
    val lines = body.lines()
    var i = 0
    while (i < lines.size) {
      val raw = lines[i]
      // the fence as long as the code needs (the editor writes ```` around code holding ```): closed by one as long
      val fence = Regex("^\\s*(`{3,})(\\w*)").find(raw)
      if (fence != null) {
        val ticks = fence.groupValues[1].length
        val lang = fence.groupValues[2]
        val close = Regex("^\\s*`{$ticks,}\\s*$")
        val code = mutableListOf<String>()
        i++
        while (i < lines.size && !close.matches(lines[i])) code += lines[i++]
        i++ // the closing fence
        out += if (lang == "kanban") board(code.joinToString("\n")) else codeBlock(code)
        continue
      }
      olLevel = listLevel(raw)
      block(raw)?.let { out += it }
      i++
    }
    return out
  }

  /** the lists the line sits in, outermost first: each one's indent and whether it is numbered */
  private val lists = mutableListOf<Pair<Int, Boolean>>()
  /** the numbered lists the current line is in, itself included (1 = numbers, 2 = letters, 3 = roman numerals…) */
  private var olLevel = 1

  /**
   * A numbered list inside a numbered list counts a. b. c., the next i. ii. iii., and round again, as the app shows
   * it: here only the lines are seen, so the lists around a line are kept by their indent.
   */
  private fun listLevel(raw: String): Int {
    val indent = raw.length - raw.trimStart().length
    val line = raw.trim()
    val numbered = Regex("^\\d+[.)]\\s").containsMatchIn(line)
    val item = numbered || Regex("^[-*+]\\s").containsMatchIn(line)
    if (!item) {
      if (line.isNotEmpty() && indent == 0) lists.clear() // a line of the note's own: the lists are over
      return 1
    }
    while (lists.isNotEmpty() && lists.last().first >= indent) lists.removeAt(lists.size - 1)
    lists += indent to numbered
    return lists.count { it.second }
  }

  private fun marker(n: Int, level: Int): String = when ((level - 1) % 3) {
    1 -> letters(n)
    2 -> roman(n)
    else -> n.toString()
  }
  private fun letters(n0: Int): String {
    var n = n0; val sb = StringBuilder()
    while (n > 0) { n--; sb.insert(0, ('a' + n % 26)); n /= 26 }
    return sb.toString().ifEmpty { "a" }
  }
  private fun roman(n0: Int): String {
    if (n0 <= 0 || n0 >= 4000) return n0.toString()
    var n = n0; val sb = StringBuilder()
    for ((v, s) in listOf(1000 to "m", 900 to "cm", 500 to "d", 400 to "cd", 100 to "c", 90 to "xc", 50 to "l", 40 to "xl", 10 to "x", 9 to "ix", 5 to "v", 4 to "iv", 1 to "i")) while (n >= v) { sb.append(s); n -= v }
    return sb.toString()
  }

  /** A one-line version for the list widget: the title, plain. */
  fun title(body: String): String = blocks(body).firstOrNull()?.toString()?.trim() ?: ""

  private fun block(raw0: String): CharSequence? {
    // HTML a note keeps (a <span> around a word, a README's <div align="center">, a comment) is not what it says:
    // the tags go, a line of only tags is no line (an escaped \<b\> is text and stays)
    val raw = raw0.replace(COMMENT, "").replace(TAG, "")
    if (raw0.isNotBlank() && raw.isBlank()) return null
    // the editor keeps an empty line as a no-break space (or &nbsp;); it is still an empty line
    if (raw.replace("&nbsp;", "").all { it.isWhitespace() || it == '\u00a0' || it == '\\' }) return null
    val indent = raw.length - raw.trimStart().length
    var line = raw.replace('\u00a0', ' ').trim()
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
    // callout: > [!💡] text, or one of Obsidian's types (> [!warning]- text) as its icon
    Regex("^>\\s?\\[!([^\\]]*)\\][+-]?\\s*(.*)").find(line)?.let { m ->
      val icon = m.groupValues[1]
      sb.append(KINDS[icon.trim().lowercase()] ?: icon.ifBlank { "💡" }).append(" ")
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
      val n = m.groupValues[1].toIntOrNull() ?: 1
      sb.append(pad).append("${marker(n, olLevel)}. ", ForegroundColorSpan(dim), EX)
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
      "|(?<![\\w@])@(\\d{4}-\\d{2}-\\d{2})(?!\\d)" + // 11 a day
      "|<((?:https?://|mailto:)[^>\\s]+)>" +          // 12 an autolink
      "|==(?!\\s)(.+?)(?<!\\s)=="                     // 13 ==highlight==
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
        g[12].isNotEmpty() -> {
          sb.append(g[12].removePrefix("mailto:"))
          sb.setSpan(ForegroundColorSpan(accent), start, sb.length, EX)
        }
        g[11].isNotEmpty() -> {
          sb.append(day(g[11]))
          sb.setSpan(ForegroundColorSpan(accent), start, sb.length, EX)
        }
        g[13].isNotEmpty() -> {
          inline(sb, g[13])
          sb.setSpan(BackgroundColorSpan(MARK), start, sb.length, EX)
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
    /** HTML in a note's markdown, as src/lib/markdown.ts plain() drops it */
    val COMMENT = Regex("<!--.*?(-->|$)")
    val TAG = Regex("(?<!\\\\)</?[a-zA-Z][a-zA-Z0-9-]*(\\s[^>]*?)?(?<!\\\\)>")
    /** the marker pen behind ==highlighted== text, as in the editor */
    const val MARK = 0x73FFD60A
    /** Obsidian's callout types, as the editor draws them (src/lib/calloutKind.ts) */
    val KINDS = mapOf(
      "note" to "✏️", "abstract" to "📋", "summary" to "📋", "tldr" to "📋", "info" to "ℹ️", "todo" to "☑️",
      "tip" to "🔥", "hint" to "🔥", "important" to "🔥", "success" to "✅", "check" to "✅", "done" to "✅",
      "question" to "❓", "help" to "❓", "faq" to "❓", "warning" to "⚠️", "caution" to "⚠️", "attention" to "⚠️",
      "failure" to "❌", "fail" to "❌", "missing" to "❌", "danger" to "⚡", "error" to "⚡", "bug" to "🐛",
      "example" to "📑", "quote" to "💬", "cite" to "💬",
    )
  }
}
