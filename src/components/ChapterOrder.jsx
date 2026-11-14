import { useEffect, useState } from 'react'
import { fetchBanks, setBankOrder } from '../lib/data.js'

// Move up / move down rather than drag and drop: it needs no library, works
// with a keyboard, and is usable on a phone, where dragging a list is awful.
export default function ChapterOrder({ onReordered }) {
  const [chapters, setChapters] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    fetchBanks()
      .then((rows) => active && setChapters(rows ?? []))
      .catch((loadError) => active && setError(loadError.message))
    return () => {
      active = false
    }
  }, [])

  async function move(index, delta) {
    const target = index + delta
    if (!chapters || target < 0 || target >= chapters.length) return

    const next = chapters.slice()
    ;[next[index], next[target]] = [next[target], next[index]]
    setChapters(next) // optimistic: the list shouldn't lag behind the click
    setBusy(true)
    setError(null)
    setSaved(false)

    try {
      await setBankOrder(next.map((chapter) => chapter.id))
      setSaved(true)
      onReordered?.()
    } catch (saveError) {
      setChapters(chapters) // put it back
      setError(saveError.message)
    } finally {
      setBusy(false)
    }
  }

  if (error && !chapters) {
    return (
      <p className="m-0 rounded-r border-l-4 border-no bg-no-soft px-3 py-2 text-sm">
        Couldn’t load chapters: {error}
      </p>
    )
  }
  if (!chapters) return <p className="text-sm text-muted">Loading chapters…</p>
  if (chapters.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="m-0 font-display text-lg font-semibold">Chapter order</h2>
        <p className="mt-1 text-sm text-muted">
          The order everyone sees on the chapters page. Saved as you move them.
          {saved && !busy ? ' Saved.' : ''}
        </p>
      </div>

      {error && (
        <p className="m-0 rounded-r border-l-4 border-no bg-no-soft px-3 py-2 text-sm">{error}</p>
      )}

      <ol className="sheet-card m-0 list-none p-0">
        {chapters.map((chapter, index) => (
          <li
            key={chapter.id}
            className="flex items-center gap-3 border-b border-rule px-3 py-2.5 last:border-b-0 sm:px-4"
          >
            <span className="w-5 shrink-0 text-right font-mono text-[13px] text-muted tabular-nums">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate" title={chapter.title}>
              {chapter.title}
              <span className="ml-2 font-mono text-[12px] text-muted">/{chapter.slug}</span>
            </span>
            <span className="flex shrink-0 gap-1">
              <button
                type="button"
                disabled={index === 0 || busy}
                onClick={() => void move(index, -1)}
                aria-label={`Move ${chapter.title} up`}
                className="touch w-9 rounded border border-rule-strong bg-sheet font-bold text-ink disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === chapters.length - 1 || busy}
                onClick={() => void move(index, 1)}
                aria-label={`Move ${chapter.title} down`}
                className="touch w-9 rounded border border-rule-strong bg-sheet font-bold text-ink disabled:opacity-30"
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
