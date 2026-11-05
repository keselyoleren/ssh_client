// Keyword highlighting in terminal output (ERROR in red, WARN in yellow …).
//
// The output itself is never changed: matches are coloured with xterm decorations, so
// programs that redraw the screen are unaffected. To stay cheap it only looks at lines as
// they arrive (never the whole scrollback), skips full-screen programs (vim, less, htop run
// in the alternate buffer), and keeps a bounded number of decorations.

/** Theme colours a rule can use, besides a hex value. */
export const RULE_COLORS = ['red', 'yellow', 'green', 'blue', 'magenta', 'cyan']

const MAX_LINES_PER_SCAN = 400 // a flood of output: only the latest lines get coloured
const MAX_DECORATIONS = 3000

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Rules from the settings → [{ re, color }]; invalid regular expressions are skipped. */
export function compileRules(rules) {
  const out = []
  for (const r of rules || []) {
    if (!r.enabled || !r.pattern?.trim()) continue
    let src = r.pattern
    if (!r.regex) {
      const words = r.pattern
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean)
        .map(escapeRe)
      if (!words.length) continue
      src = `\\b(?:${words.join('|')})\\b`
    }
    try {
      out.push({ re: new RegExp(src, r.case_sensitive ? 'g' : 'gi'), color: r.color })
    } catch {
      /* not a valid regular expression */
    }
  }
  return out
}

/** Is this pattern a valid regular expression? (for the settings form) */
export function regexError(pattern) {
  try {
    new RegExp(pattern)
    return ''
  } catch (e) {
    return e.message
  }
}

export function createHighlighter(term) {
  let rules = []
  let colors = {}
  let frontier = null // marker on the first line that may still change (the cursor line)
  let timer = 0
  const live = [] // { marker, deco } in the order they were added (ascending lines)

  const colorOf = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : colors[c] || colors.red)

  function drop(item) {
    item.deco.dispose()
    item.marker.dispose()
  }
  function clearAll() {
    while (live.length) drop(live.pop())
  }

  function scanLine(buf, y, cell) {
    const line = buf.getLine(y)
    if (!line) return
    // text of the line, with the cell column of every character (wide characters take two)
    let text = ''
    const col = []
    for (let x = 0; x < line.length; x++) {
      line.getCell(x, cell)
      if (!cell.getWidth()) continue
      const ch = cell.getChars() || ' '
      for (let k = 0; k < ch.length; k++) {
        text += ch[k]
        col.push(x)
      }
    }
    if (!text.trim()) return
    const cursorLine = buf.baseY + buf.cursorY
    for (const r of rules) {
      r.re.lastIndex = 0
      let m
      while ((m = r.re.exec(text))) {
        if (!m[0]) {
          r.re.lastIndex++
          continue
        }
        const x0 = col[m.index]
        const last = col[m.index + m[0].length - 1]
        line.getCell(last, cell)
        const marker = term.registerMarker(y - cursorLine)
        if (!marker) return
        const deco = term.registerDecoration({
          marker,
          x: x0,
          width: last + (cell.getWidth() || 1) - x0,
          foregroundColor: colorOf(r.color),
        })
        if (deco) live.push({ marker, deco })
        else marker.dispose()
      }
    }
  }

  function scan() {
    timer = 0
    const buf = term.buffer.active
    if (!rules.length || buf.type === 'alternate') return
    const cursor = buf.baseY + buf.cursorY
    let from = frontier && !frontier.isDisposed ? frontier.line : cursor - term.rows
    from = Math.max(0, from, cursor - MAX_LINES_PER_SCAN)
    // lines from the frontier on may have changed since the last scan: redo them
    while (live.length) {
      const it = live[live.length - 1]
      if (!it.marker.isDisposed && it.marker.line < from) break
      drop(live.pop())
    }
    const cell = buf.getNullCell()
    for (let y = from; y <= cursor; y++) scanLine(buf, y, cell)
    frontier?.dispose()
    frontier = term.registerMarker(0)
    // old decorations go first; those whose line left the scrollback are already disposed
    while (live.length > MAX_DECORATIONS) drop(live.shift())
  }

  /** Coalesce bursts of output into one scan. */
  function schedule() {
    if (rules.length && !timer) timer = setTimeout(scan, 40)
  }

  /** New rules or colours: recolour what is on screen. */
  function configure(ruleList, theme) {
    rules = compileRules(ruleList)
    colors = theme || {}
    clearAll()
    frontier?.dispose()
    frontier = null
    schedule()
  }

  const onResize = term.onResize(() => {
    // reflow moves text between lines: recolour the visible part
    clearAll()
    frontier?.dispose()
    frontier = null
    schedule()
  })

  return {
    configure,
    schedule,
    dispose() {
      clearTimeout(timer)
      onResize.dispose()
      clearAll()
      frontier?.dispose()
    },
  }
}
