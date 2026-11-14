import { describe, expect, it } from 'vitest'
import { pruneOtherUsers } from '../src/lib/cache.js'

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    get length() {
      return map.size
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
    keys: () => [...map.keys()],
  }
}

const ME = 'user-me'
const THEM = 'user-them'

describe('pruneOtherUsers', () => {
  it('clears another account’s cached answers and preferences', () => {
    const storage = fakeStorage({
      [`qbank:v1:rows:${THEM}:bank-1`]: '[]',
      [`qbank:v1:prefs:${THEM}`]: '{}',
    })
    const removed = pruneOtherUsers(ME, storage)
    expect(removed).toHaveLength(2)
    expect(storage.keys()).toEqual([])
  })

  it('never touches the signed-in account', () => {
    const storage = fakeStorage({
      [`qbank:v1:rows:${ME}:bank-1`]: '[]',
      [`qbank:v1:prefs:${ME}`]: '{}',
      [`qbank:v1:queue:${ME}`]: '[]',
    })
    expect(pruneOtherUsers(ME, storage)).toEqual([])
    expect(storage.keys()).toHaveLength(3)
  })

  it('leaves shared content alone — it belongs to nobody', () => {
    const storage = fakeStorage({
      'qbank:v1:questions:bank-1': '{}',
      'qbank:v1:banks': '[]',
      'qbank:v1:theme': 'dark',
    })
    expect(pruneOtherUsers(ME, storage)).toEqual([])
    expect(storage.keys()).toHaveLength(3)
  })

  // The queue is the only cached data that can't be refetched: it holds
  // answers that never reached the server.
  it('keeps another account’s queue when it still holds answers', () => {
    const storage = fakeStorage({
      [`qbank:v1:queue:${THEM}`]: JSON.stringify([{ kind: 'answer', question_id: 'q1' }]),
    })
    expect(pruneOtherUsers(ME, storage)).toEqual([])
    expect(storage.keys()).toHaveLength(1)
  })

  it('clears another account’s queue once it is drained', () => {
    const storage = fakeStorage({ [`qbank:v1:queue:${THEM}`]: '[]' })
    expect(pruneOtherUsers(ME, storage)).toHaveLength(1)
  })

  it('keeps a queue it cannot parse rather than risk losing answers', () => {
    const storage = fakeStorage({ [`qbank:v1:queue:${THEM}`]: 'not json' })
    expect(pruneOtherUsers(ME, storage)).toEqual([])
  })

  it('ignores unrelated keys and does nothing without a user', () => {
    const storage = fakeStorage({
      'some-other-app': 'x',
      [`qbank:v1:rows:${THEM}:bank-1`]: '[]',
    })
    expect(pruneOtherUsers(null, storage)).toEqual([])
    pruneOtherUsers(ME, storage)
    expect(storage.keys()).toEqual(['some-other-app'])
  })
})
