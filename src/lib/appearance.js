import { watch, watchEffect } from 'vue'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { store, toast } from './store'
import { themes } from './themes'

/** Accent presets; an empty color means "theme default" (orange). */
export const ACCENTS = [
  { color: '', name: 'K-Shell orange', swatch: '#e07a45' },
  { color: '#3b82f6', name: 'Blue' },
  { color: '#06b6d4', name: 'Cyan' },
  { color: '#14b8a6', name: 'Teal' },
  { color: '#22c55e', name: 'Green' },
  { color: '#eab308', name: 'Yellow' },
  { color: '#8b5cf6', name: 'Violet' },
  { color: '#ec4899', name: 'Pink' },
  { color: '#ef4444', name: 'Red' },
]

export const ZOOMS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]

const S = () => store.vault.settings || {}

/** 'dark' | 'light' after resolving the "system" option. */
export function appMode() {
  const t = S().app_theme || 'dark'
  return t === 'system' ? (store.systemDark ? 'dark' : 'light') : t
}

export function termThemeId() {
  const s = S()
  if (s.term_theme_sync && appMode() === 'light') return s.term_theme_light || 'light'
  return s.term_theme || 'kshell'
}
export const termTheme = () => themes[termThemeId()] || themes.kshell

/** Readable text colour on top of a given background colour. */
export function inkFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const lin = (c) => {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const l = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return l > 0.4 ? '#14110f' : '#ffffff'
}

export function zoomBy(dir) {
  const s = store.vault.settings
  const cur = +s.ui_zoom || 1
  const next = dir > 0 ? ZOOMS.find((z) => z > cur + 0.001) : [...ZOOMS].reverse().find((z) => z < cur - 0.001)
  if (!next) return
  s.ui_zoom = next
  toast(`Zoom ${Math.round(next * 100)}%`, 'info', 1200)
}
export function zoomReset() {
  store.vault.settings.ui_zoom = 1
  toast('Zoom 100%', 'info', 1200)
}

export function initAppearance() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  store.systemDark = mq.matches
  mq.addEventListener('change', (e) => (store.systemDark = e.matches))

  watchEffect(() => {
    const root = document.documentElement
    root.dataset.theme = appMode()
    const a = S().accent
    if (a) {
      root.style.setProperty('--accent', a)
      root.style.setProperty('--accent-ink', inkFor(a))
    } else {
      root.style.removeProperty('--accent')
      root.style.removeProperty('--accent-ink')
    }
  })

  watch(
    () => +S().ui_zoom || 1,
    (z) => {
      try {
        getCurrentWebview()
          .setZoom(z)
          .catch(() => {})
      } catch {
        /* not running inside Tauri */
      }
    },
    { immediate: true },
  )
}
