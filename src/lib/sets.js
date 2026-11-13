// A set is a slice of the bank's stable `position` order, so changing the set
// size re-slices rather than reshuffles. Sheets page within a set.

export const SHEET_SIZE = 10
export const SET_SIZE_MIN = 10
export const SET_SIZE_STEP = 5
export const DEFAULT_SET_SIZE = 100

export function clamp(n, min, max) {
  if (Number.isNaN(n)) return min
  return Math.min(max, Math.max(min, n))
}

export function setCount(total, size) {
  if (total <= 0 || size <= 0) return 0
  return Math.ceil(total / size)
}

export function setBounds(index, size) {
  return { start: index * size, end: (index + 1) * size }
}

// `sorted` is the bank's questions ordered by position.
export function questionsInSet(sorted, size, index) {
  const { start, end } = setBounds(index, size)
  return sorted.slice(start, end)
}

export function chunk(items, size) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// The slider must never leave you pointing at a set that no longer exists.
export function clampSetIndex(index, total, size) {
  const count = setCount(total, size)
  if (count === 0) return 0
  return clamp(index, 0, count - 1)
}

export function sliderMax(total) {
  if (total <= SET_SIZE_MIN) return SET_SIZE_MIN
  return Math.ceil(total / SET_SIZE_STEP) * SET_SIZE_STEP
}

// Deterministic per-view shuffle, so a shuffled sheet stays put across renders
// and reloads instead of reordering under your cursor.
export function seededShuffle(ids, seedText) {
  let seed = 2166136261
  for (let i = 0; i < seedText.length; i++) {
    seed ^= seedText.charCodeAt(i)
    seed = Math.imul(seed, 16777619)
  }
  const rand = () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out = ids.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
