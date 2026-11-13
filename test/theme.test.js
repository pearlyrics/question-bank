import { describe, expect, it } from 'vitest'
import {
  THEME_KEY,
  applyTheme,
  normalizeTheme,
  readTheme,
  resolveTheme,
  writeTheme,
} from '../src/lib/theme.js'

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
    has: (key) => map.has(key),
  }
}

function fakeRoot() {
  const attrs = new Map()
  return {
    setAttribute: (name, value) => attrs.set(name, value),
    removeAttribute: (name) => attrs.delete(name),
    getAttribute: (name) => attrs.get(name) ?? null,
  }
}

describe('normalizeTheme', () => {
  it('falls back to system for anything unrecognised', () => {
    expect(normalizeTheme('dark')).toBe('dark')
    expect(normalizeTheme('light')).toBe('light')
    expect(normalizeTheme('system')).toBe('system')
    expect(normalizeTheme('neon')).toBe('system')
    expect(normalizeTheme(null)).toBe('system')
  })
})

describe('reading and writing', () => {
  it('round-trips a pinned theme', () => {
    const storage = fakeStorage()
    writeTheme(storage, 'dark')
    expect(readTheme(storage)).toBe('dark')
  })

  it('stores system as the absence of a value', () => {
    const storage = fakeStorage({ [THEME_KEY]: 'dark' })
    writeTheme(storage, 'system')
    expect(storage.has(THEME_KEY)).toBe(false)
    expect(readTheme(storage)).toBe('system')
  })

  it('survives storage that throws', () => {
    const hostile = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readTheme(hostile)).toBe('system')
    expect(() => writeTheme(hostile, 'dark')).not.toThrow()
  })
})

describe('applyTheme', () => {
  it('pins the attribute for an explicit choice', () => {
    const root = fakeRoot()
    applyTheme('dark', root)
    expect(root.getAttribute('data-theme')).toBe('dark')
    applyTheme('light', root)
    expect(root.getAttribute('data-theme')).toBe('light')
  })

  // The attribute must come off, not be set to "system" — the CSS keys the
  // media query on its absence.
  it('removes the attribute for system', () => {
    const root = fakeRoot()
    applyTheme('dark', root)
    applyTheme('system', root)
    expect(root.getAttribute('data-theme')).toBeNull()
  })
})

describe('resolveTheme', () => {
  it('reports what the viewer is actually looking at', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})
