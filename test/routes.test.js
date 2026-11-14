import { describe, expect, it } from 'vitest'
import { RESERVED_SLUGS, chapterPath, parseRoute } from '../src/lib/routes.js'

describe('parseRoute', () => {
  it('sends the root to the chapter list', () => {
    expect(parseRoute('/')).toEqual({ name: 'home' })
    expect(parseRoute('')).toEqual({ name: 'home' })
  })

  it('knows the fixed pages', () => {
    expect(parseRoute('/chapters')).toEqual({ name: 'chapters' })
    expect(parseRoute('/import')).toEqual({ name: 'import' })
    expect(parseRoute('/users')).toEqual({ name: 'users' })
  })

  it('treats any other single segment as a chapter slug', () => {
    expect(parseRoute('/muscle-tissue-bank-ii')).toEqual({
      name: 'chapter',
      slug: 'muscle-tissue-bank-ii',
    })
    expect(parseRoute('/w05-nerve')).toEqual({ name: 'chapter', slug: 'w05-nerve' })
  })

  it('ignores a trailing slash', () => {
    expect(parseRoute('/chapters/')).toEqual({ name: 'chapters' })
    expect(parseRoute('/w05-nerve/')).toEqual({ name: 'chapter', slug: 'w05-nerve' })
  })

  it('rejects nested paths and malformed slugs', () => {
    expect(parseRoute('/a/b')).toEqual({ name: 'notFound' })
    expect(parseRoute('/Nope')).toEqual({ name: 'notFound' })
    expect(parseRoute('/has space')).toEqual({ name: 'notFound' })
    expect(parseRoute('/x')).toEqual({ name: 'notFound' })
  })
})

describe('chapterPath', () => {
  it('round-trips with parseRoute', () => {
    const slug = 'w07-bone'
    expect(parseRoute(chapterPath(slug))).toEqual({ name: 'chapter', slug })
  })
})

describe('reserved slugs', () => {
  // Any reserved word must resolve to its page, not to a chapter — which is
  // exactly why importing one as a slug has to be refused.
  it('never parse as a chapter', () => {
    for (const slug of RESERVED_SLUGS) {
      expect(parseRoute(`/${slug}`).name).not.toBe('chapter')
    }
  })
})
