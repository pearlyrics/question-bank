// Three states, matching how people actually think about this: follow the
// device, or pin it light or dark.
//
// The CSS does the work. `:root[data-theme="dark"]` and the
// prefers-color-scheme block guarded by `:root:not([data-theme="light"])`
// mean "system" is simply the absence of the attribute.

const THEMES = ['system', 'light', 'dark']
export const THEME_KEY = 'qbank:v1:theme'

export function normalizeTheme(value) {
  return THEMES.includes(value) ? value : 'system'
}

export function readTheme(storage) {
  try {
    return normalizeTheme(storage?.getItem(THEME_KEY))
  } catch {
    // Private browsing can throw on access alone.
    return 'system'
  }
}

export function writeTheme(storage, theme) {
  try {
    if (theme === 'system') storage?.removeItem(THEME_KEY)
    else storage?.setItem(THEME_KEY, theme)
  } catch {
    // Not being able to remember the choice shouldn't break changing it.
  }
}

// Removing the attribute hands control back to prefers-color-scheme.
export function applyTheme(theme, root) {
  if (!root) return
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

// What the viewer actually sees, for labelling the control.
export function resolveTheme(theme, prefersDark) {
  if (theme === 'light' || theme === 'dark') return theme
  return prefersDark ? 'dark' : 'light'
}
