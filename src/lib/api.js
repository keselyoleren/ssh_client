import { invoke, Channel } from '@tauri-apps/api/core'

export { Channel }
export const api = new Proxy(
  {},
  {
    get:
      (_, cmd) =>
      (args = {}) =>
        invoke(cmd, args),
  },
)

/** Normalise a raw channel payload into a Uint8Array (or null when it is a JSON event). */
export function asBytes(m) {
  if (m instanceof ArrayBuffer) return new Uint8Array(m)
  if (m instanceof Uint8Array) return m
  if (Array.isArray(m)) return new Uint8Array(m)
  return null
}

export function fmtSize(n) {
  if (n == null) return ''
  if (n < 1024) return n + ' B'
  const u = ['KB', 'MB', 'GB', 'TB']
  let i = -1
  do {
    n /= 1024
    i++
  } while (n >= 1024 && i < u.length - 1)
  return n.toFixed(n < 10 ? 1 : 0) + ' ' + u[i]
}

export function fmtTime(s) {
  if (!s) return ''
  const d = new Date(s * 1000)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleString(
    undefined,
    sameYear
      ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { year: 'numeric', month: 'short', day: 'numeric' },
  )
}

export function fmtPerm(p) {
  if (p == null) return ''
  const r = (x) => (x & 4 ? 'r' : '-') + (x & 2 ? 'w' : '-') + (x & 1 ? 'x' : '-')
  return r((p >> 6) & 7) + r((p >> 3) & 7) + r(p & 7)
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))
