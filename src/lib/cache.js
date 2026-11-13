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

export function rowsToArray(rows) {
  return [...rows.values()]
}

export function rowsFromArray(list) {
  return new Map((list ?? []).map((row) => [row.question_id, row]))
}
