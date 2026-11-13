import { afterEach, describe, expect, it, vi } from 'vitest'
import { coalesce, createOpQueue } from '../src/lib/queue.js'

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
    raw: map,
  }
}

// Fake timers leaking out of a failing test used to hang the next one.
afterEach(() => {
  vi.useRealTimers()
})

const answerOp = (id, attempt) => ({
  kind: 'answer',
  question_id: id,
  bank_id: 'b1',
  choice: true,
  correct: true,
  attempt_id: attempt,
})

describe('coalesce', () => {
  it('never collapses answers', () => {
    const pending = coalesce(coalesce([], answerOp('q1', 'a1')), answerOp('q1', 'a2'))
    expect(pending).toHaveLength(2)
  })

  it('collapses repeated flag toggles on one question, in place', () => {
    let pending = coalesce([], { kind: 'flag', question_id: 'q1', flagged: true })
    pending = coalesce(pending, answerOp('q2', 'a1'))
    pending = coalesce(pending, { kind: 'flag', question_id: 'q1', flagged: false })

    expect(pending).toHaveLength(2)
    // Position is kept so a flag can never overtake an answer queued after it.
    expect(pending[0]).toEqual({ kind: 'flag', question_id: 'q1', flagged: false })
    expect(pending[1].kind).toBe('answer')
  })

  it('keeps flags on different questions apart', () => {
    let pending = coalesce([], { kind: 'flag', question_id: 'q1', flagged: true })
    pending = coalesce(pending, { kind: 'flag', question_id: 'q2', flagged: true })
    expect(pending).toHaveLength(2)
  })

  it('keeps only the newest prefs write', () => {
    let pending = coalesce([], { kind: 'prefs', set_size: 100 })
    pending = coalesce(pending, { kind: 'prefs', set_size: 50 })
    expect(pending).toEqual([{ kind: 'prefs', set_size: 50 }])
  })
})

describe('createOpQueue', () => {
  it('sends ops in order and empties the queue', async () => {
    const sent = []
    const queue = createOpQueue({
      key: 'q',
      storage: fakeStorage(),
      send: async (op) => void sent.push(op.attempt_id),
    })

    queue.enqueue(answerOp('q1', 'a1'))
    queue.enqueue(answerOp('q2', 'a2'))
    await queue.flush()

    expect(sent).toEqual(['a1', 'a2'])
    expect(queue.size()).toBe(0)
    expect(queue.state()).toBe('idle')
  })

  it('writes pending ops to storage before sending them', () => {
    const storage = fakeStorage()
    const queue = createOpQueue({
      key: 'queue-key',
      storage,
      send: () => new Promise(() => {}), // never resolves
    })

    queue.enqueue(answerOp('q1', 'a1'))

    const persisted = JSON.parse(storage.getItem('queue-key'))
    expect(persisted).toHaveLength(1)
    expect(persisted[0].attempt_id).toBe('a1')
  })

  it('picks up ops left behind by a previous session', async () => {
    const storage = fakeStorage({ 'queue-key': JSON.stringify([answerOp('q1', 'a1')]) })
    const sent = []
    const queue = createOpQueue({
      key: 'queue-key',
      storage,
      send: async (op) => void sent.push(op.attempt_id),
    })

    expect(queue.size()).toBe(1)
    await queue.flush()
    expect(sent).toEqual(['a1'])
  })

  it('retries a failing send, then reports an error without losing the op', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network down'))
    const states = []
    const queue = createOpQueue({
      key: 'q',
      storage: fakeStorage(),
      send,
      onChange: (state) => states.push(state),
      backoff: [0, 0],
      retryDelay: 60_000, // long enough that the background retry stays out of this test
    })

    queue.enqueue(answerOp('q1', 'a1'))
    await queue.flush()
    queue.stop()

    expect(send).toHaveBeenCalledTimes(3) // the first try plus two backoffs
    expect(queue.size()).toBe(1)
    expect(states).toContain('error')
  })

  it('schedules its own retry after giving up, and succeeds on it', async () => {
    vi.useFakeTimers()
    let online = false
    const send = vi.fn(async () => {
      if (!online) throw new Error('offline')
    })
    const queue = createOpQueue({
      key: 'q',
      storage: fakeStorage(),
      send,
      backoff: [0],
      retryDelay: 1000,
    })

    queue.enqueue(answerOp('q1', 'a1'))
    await vi.advanceTimersByTimeAsync(10)
    expect(queue.state()).toBe('error')

    online = true
    await vi.advanceTimersByTimeAsync(1100)

    expect(queue.size()).toBe(0)
    expect(queue.state()).toBe('idle')
  })

  it('recovers and drains once the network returns', async () => {
    let online = false
    const queue = createOpQueue({
      key: 'q',
      storage: fakeStorage(),
      send: async () => {
        if (!online) throw new Error('offline')
      },
      backoff: [0],
      retryDelay: 60_000,
    })

    queue.enqueue(answerOp('q1', 'a1'))
    await queue.flush()
    queue.stop()
    expect(queue.size()).toBe(1)

    online = true
    await queue.flush()
    expect(queue.size()).toBe(0)
    expect(queue.state()).toBe('idle')
  })

  it('drops a permanently rejected op so it cannot block the queue', async () => {
    const sent = []
    const queue = createOpQueue({
      key: 'q',
      storage: fakeStorage(),
      send: async (op) => {
        if (op.question_id === 'gone') {
          const error = new Error('unknown question')
          error.permanent = true
          throw error
        }
        sent.push(op.question_id)
      },
      backoff: [0],
    })

    queue.enqueue(answerOp('gone', 'a1'))
    queue.enqueue(answerOp('q2', 'a2'))
    await queue.flush()

    expect(sent).toEqual(['q2'])
    expect(queue.size()).toBe(0)
  })
})
