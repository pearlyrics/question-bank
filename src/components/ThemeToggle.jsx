import { useEffect, useState } from 'react'
import { applyTheme, readTheme, writeTheme } from '../lib/theme.js'

const OPTIONS = [
  { value: 'system', label: 'Auto', hint: 'Follow the device' },
  { value: 'light', label: 'Light', hint: 'Always light' },
  { value: 'dark', label: 'Dark', hint: 'Always dark' },
]

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => readTheme(globalThis.localStorage))

  useEffect(() => {
    applyTheme(theme, document.documentElement)
    writeTheme(globalThis.localStorage, theme)
  }, [theme])

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="flex overflow-hidden rounded border border-rule-strong"
    >
      {OPTIONS.map((option) => {
        const selected = theme === option.value
        return (
          <button
            key={option.value}
            type="button"
            title={option.hint}
            aria-pressed={selected}
            onClick={() => setTheme(option.value)}
            className={`px-2 py-1 font-mono text-[12px] leading-5 ${
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
