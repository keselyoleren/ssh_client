// Autosuggestions (fish / Warp style): track what the user is typing on the current shell
// line and suggest the rest of a previously run command as ghost text.
//
// K-Shell doesn't see the shell's own line editor, so it follows keystrokes and checks them
// against the screen: a suggestion is only shown, and a command only remembered, when the
// typed text is visibly echoed right before the cursor. Hidden input (password prompts)
// is therefore never suggested or stored.

/** Follows the input line from the keys sent to the shell. */
export class LineTracker {
  buf = ''
  valid = true

  reset() {
    this.buf = ''
    this.valid = true
  }

  /**
   * Feed data the terminal is about to send to the shell.
   * Returns the finished line when Enter is pressed (or null).
   */
  input(d) {
    // bracketed paste: treat the pasted text like typed text
    const paste = /^\x1b\[200~([\s\S]*)\x1b\[201~$/.exec(d)
    if (paste) d = paste[1]
    if (d === '\r' || d === '\n') {
      const line = this.valid ? this.buf : null
      this.reset()
      return line
    }
    if (d === '\x7f' || d === '\b') {
      this.buf = this.buf.slice(0, -1)
      return null
    }
    if (d === '\x03' || d === '\x15') {
      // Ctrl+C, Ctrl+U: line discarded
      this.reset()
      return null
    }
    if (d === '\x17') {
      // Ctrl+W: delete the previous word
      this.buf = this.buf.replace(/\S+\s*$/, '')
      return null
    }
    if (/[\x00-\x1f\x7f]/.test(d)) {
      // arrows, Tab completion, history search, multi-line paste…: the shell's line is unknown now
      this.valid = false
      if (/[\r\n]/.test(d)) this.buf = ''
      return null
    }
    this.buf += d
    return null
  }
}

/**
 * Best completion for `typed`: the most recent command starting with it, preferring ones
 * run on the same target, then snippets. Returns the missing suffix ('' when none).
 */
export function suggestFor(typed, { history = [], snippets = [], target = '' } = {}) {
  if (!typed.trim()) return ''
  const ok = (c) => c.length > typed.length && c.startsWith(typed)
  let other = ''
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i]
    if (!ok(h.cmd)) continue
    if (h.target === target) return h.cmd.slice(typed.length)
    other ||= h.cmd
  }
  if (other) return other.slice(typed.length)
  const sn = snippets.find((s) => ok(s.command || ''))
  return sn ? sn.command.slice(typed.length) : ''
}

/** First word (plus following spaces) of a suggestion, for "accept word". */
export const firstWord = (s) => s.match(/^\s*\S+\s?/)?.[0] || s

/**
 * Text of the logical (possibly wrapped) line before the cursor, and how many empty cells
 * follow it (none when the shell draws its own suggestion right after the cursor).
 */
export function cursorContext(term) {
  const b = term.buffer.active
  const y = b.baseY + b.cursorY
  const line = b.getLine(y)
  if (!line) return null
  let before = line.translateToString(false, 0, b.cursorX)
  for (let i = y; i > 0 && b.getLine(i)?.isWrapped; i--) before = b.getLine(i - 1).translateToString(false) + before
  const after = line.translateToString(true, b.cursorX)
  // free cells after the cursor: up to the next drawn text (e.g. a right prompt), minus a gap
  const k = after.search(/\S/)
  const free = k < 0 ? term.cols - b.cursorX : k - 1
  return { before, free }
}
