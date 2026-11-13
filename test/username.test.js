import { describe, expect, it } from 'vitest'
import { emailFor, normalizeUsername, passwordFor, usernameError } from '../src/lib/username.js'

describe('normalizeUsername', () => {
  it('trims and lowercases so logins are forgiving', () => {
    expect(normalizeUsername('  Hamza  ')).toBe('hamza')
    expect(normalizeUsername(undefined)).toBe('')
  })
})

describe('usernameError', () => {
  it('accepts ordinary usernames', () => {
    for (const name of ['hamza', 'a_b-c.d', 'student01']) {
      expect(usernameError(name)).toBeNull()
    }
  })

  it('explains what is wrong', () => {
    expect(usernameError('')).toMatch(/enter a username/i)
    expect(usernameError('ab')).toMatch(/3 characters/)
    expect(usernameError('a'.repeat(33))).toMatch(/32 characters/)
    expect(usernameError('has space')).toMatch(/lowercase/)
  })
})

describe('passwordFor', () => {
  it('is the username itself when long enough', () => {
    expect(passwordFor('hamza1')).toBe('hamza1')
    expect(passwordFor('studentlongname')).toBe('studentlongname')
  })

  it('pads a short username to Supabase’s six-character floor, deterministically', () => {
    expect(passwordFor('abc')).toBe('abcqba')
    expect(passwordFor('abc')).toBe(passwordFor('abc'))
    expect(passwordFor('abc').length).toBeGreaterThanOrEqual(6)
    expect(passwordFor('ab')).toHaveLength(6)
  })
})

describe('emailFor', () => {
  it('builds a stable address from the username', () => {
    expect(emailFor('hamza', 'qbank.local')).toBe('hamza@qbank.local')
    expect(emailFor('hamza')).toBe('hamza@qbank.local')
  })
})
