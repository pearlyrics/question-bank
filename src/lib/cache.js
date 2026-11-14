// Read-through cache so a reload paints the sheet you were on before the
// network answers. Keys are namespaced per user and bank.

const PREFIX = 'qbank:v1'

export function cacheKey(...parts) {
  return [PREFIX, ...parts].join(':')
}

export function cacheGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function cacheSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private browsing or a full quota: the session still works in memory.
  }
}

export function cacheRemove(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

// Keys shaped qbank:v1:<kind>:<userId>[:<bankId>]. Shared content
// (questions, banks) has no user segment and is never pruned.
const USER_SCOPED = new Set(['rows', 'prefs', 'queue'])

function allKeys(storage) {
  const keys = []
  for (let index = 0; index < storage.length; index++) keys.push(storage.key(index))
  return keys
}

function queueIsEmpty(raw) {
  try {
    const parsed = JSON.parse(raw ?? '[]')
    return Array.isArray(parsed) && parsed.length === 0
  } catch {
    // Unreadable: treat as holding something, and keep it.
    return false
  }
}

// Several accounts on one browser (a shared iPad, say) each leave a cache
// behind. They're never read by anyone else — the keys are per user — but they
// sit there forever, so clear them out when someone signs in.
//
// With one exception: a queue can hold answers that never reached the server.
// It's the only cached data that can't be refetched, so a non-empty queue
// belonging to another account is left alone for them to come back to.
export function pruneOtherUsers(userId, storage) {
  if (!userId || !storage) return []
  const removed = []

  for (const key of allKeys(storage)) {
    const parts = String(key).split(':')
    if (parts.length < 4) continue
    const [namespace, version, kind, owner] = parts
    if (namespace !== 'qbank' || version !== 'v1') continue
    if (!USER_SCOPED.has(kind) || owner === userId) continue
    if (kind === 'queue' && !queueIsEmpty(storage.getItem(key))) continue

    storage.removeItem(key)
    removed.push(key)
  }

  return removed
}

export function rowsToArray(rows) {
  return [...rows.values()]
}

export function rowsFromArray(list) {
  return new Map((list ?? []).map((row) => [row.question_id, row]))
}
