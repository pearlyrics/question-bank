import { useEffect, useState } from 'react'
import { applyTheme, readTheme, resolveTheme, writeTheme } from '../lib/theme.js'

const OPTIONS = [
  { value: 'light', label: 'Light', hint: 'Always light' },
  { value: 'dark', label: 'Dark', hint: 'Always dark' },
]

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => readTheme(globalThis.localStorage))
  const [prefersDark, setPrefersDark] = useState(
    () => globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )

  // Until someone picks a side, the device still decides — the stored value is
  // "system" and no data-theme attribute is set. Tracking the media query is
  // what lets the control show which of the two is actually in effect.
  useEffect(() => {
    const query = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
    if (!query) return
    const onChange = (event) => setPrefersDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    applyTheme(theme, document.documentElement)
    writeTheme(globalThis.localStorage, theme)
  }, [theme])

  const showing = resolveTheme(theme, prefersDark)

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="flex h-8 items-stretch overflow-hidden rounded border border-rule-strong"
    >
      {OPTIONS.map((option) => {
        const selected = showing === option.value
        return (
          <button
            key={option.value}
            type="button"
            title={option.hint}
            aria-pressed={selected}
            onClick={() => setTheme(option.value)}
            className={`flex items-center px-2 font-mono text-[12px] ${
              selected ? 'bg-accent text-sheet' : 'bg-sheet text-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
