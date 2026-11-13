// A durable write queue. Every answer lands in localStorage before it is sent,
// so closing the tab mid-flush loses nothing: the queue replays on next load.
// Replays are safe because record_answer() is idempotent per attempt_id.

// Ops that are last-write-wins get a dedupe key and collapse in place, keeping
// their position so they never jump ahead of an answer. Answers never collapse.
function dedupeKey(op) {
  if (op.kind === 'flag') return `flag:${op.question_id}`
  if (op.kind === 'prefs') return 'prefs'
  return null
}

export function coalesce(pending, op) {
  const key = dedupeKey(op)
  if (!key) return [...pending, op]
  const index = pending.findIndex((existing) => dedupeKey(existing) === key)
  if (index === -1) return [...pending, op]
  const next = pending.slice()
  next[index] = op
  return next
}

export function createOpQueue({
  key,
  storage,
  send,
  onChange,
  // Delays between immediate retries of one op.
  backoff = [700, 1800, 5000],
  // Delay before picking the queue back up after it gives up.
  retryDelay = 5000,
}) {
  let pending = read()
  let inflight = null
  let timer = null
  let state = pending.length > 0 ? 'saving' : 'idle'

  function read() {
    try {
      const raw = storage.getItem(key)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function persist() {
    try {
      storage.setItem(key, JSON.stringify(pending))
    } catch {
      // Private browsing or a full quota: the queue still drains this session.
    }
  }

  function setState(next) {
    if (state === next) return
    state = next
    onChange?.(state, pending.length)
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  function enqueue(op) {
    pending = coalesce(pending, op)
    persist()
    setState('saving')
    void flush()
  }

  // Resolves only when the queue is empty or has given up, so `await flush()`
  // means "everything queued has actually reached the server". resetBank()
  // depends on that before it erases anything.
  function flush() {
    if (inflight) return inflight
    if (pending.length === 0) return Promise.resolve()

    clearTimer()
    inflight = drain().finally(() => {
      inflight = null
      // Scheduling happens here, not inside drain(), because a retry queued
      // while a drain is still running would be dropped by its own guard.
      if (pending.length > 0) schedule(retryDelay)
    })
    return inflight
  }

  async function drain() {
    setState('saving')

    while (pending.length > 0) {
      const op = pending[0]
      let settled = false

      for (let attempt = 0; attempt <= backoff.length; attempt++) {
        try {
          await send(op)
          settled = true
          break
        } catch (error) {
          // An op the server will always reject would block the queue forever,
          // so drop it and keep going.
          if (error?.permanent) {
            settled = true
            break
          }
          if (attempt < backoff.length) await sleep(backoff[attempt])
        }
      }

      if (!settled) {
        setState('error')
        return
      }

      pending = pending.slice(1)
      persist()
    }

    setState('idle')
  }

  function schedule(delay) {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, delay)
  }

  function clearTimer() {
    if (!timer) return
    clearTimeout(timer)
    timer = null
  }

  return {
    enqueue,
    flush,
    pendingOps: () => pending.slice(),
    size: () => pending.length,
    state: () => state,
    // Called when the session ends, so a pending retry can't fire against a
    // user who has signed out. Queued ops stay on disk for next time.
    stop: () => {
      clearTimer()
    },
    clear: () => {
      pending = []
      persist()
      clearTimer()
      setState('idle')
    },
  }
}
