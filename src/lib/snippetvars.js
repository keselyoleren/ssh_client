// Snippet variables: {{name}} or {{name:default}} in a snippet's command are asked for
// when it runs, then filled in as typed (no quoting added, so the snippet decides it).

import { form } from './store'

const VAR = /\{\{\s*([A-Za-z_][\w-]*)\s*(?::([^}]*))?\}\}/g

/** Variables of a command, in order of first use: [{ name, def }]. */
export function varsOf(cmd) {
  const seen = new Map()
  for (const m of (cmd || '').matchAll(VAR)) if (!seen.has(m[1])) seen.set(m[1], m[2]?.trim() ?? '')
  return [...seen].map(([name, def]) => ({ name, def }))
}

export const hasVars = (cmd) => varsOf(cmd).length > 0

/** The command with every {{var}} replaced by its value. */
export function fill(cmd, values) {
  return cmd.replace(VAR, (_, name) => values[name] ?? '')
}

// Last values typed this session, per snippet command, so a re-run starts from them.
const last = new Map()

/**
 * The snippet's command ready to run: asks for its variables first.
 * Resolves null when the dialog is cancelled.
 */
export async function resolveSnippet(sn) {
  const vars = varsOf(sn.command)
  if (!vars.length) return sn.command
  const prev = last.get(sn.command) || {}
  const values = await form(
    sn.name || 'Run snippet',
    vars.map((v) => ({ name: v.name, value: prev[v.name] ?? v.def, placeholder: v.def })),
    { detail: sn.command, okText: 'Run' },
  )
  if (!values) return null
  last.set(sn.command, values)
  return fill(sn.command, values)
}
