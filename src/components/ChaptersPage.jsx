import { useEffect, useState } from 'react'
import { fetchChapterProgress } from '../lib/data.js'
import { Link, useRouter } from '../lib/router.jsx'
import { IMPORT_PATH, chapterPath } from '../lib/routes.js'

// A contents page: one ruled line per chapter, your results on the right.
// Everything here is bank-wide — the set slider is a thing you deal with
// inside a chapter, not when choosing between them.
export default function ChaptersPage({ isAdmin }) {
  const { navigate } = useRouter()
  const [chapters, setChapters] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    fetchChapterProgress()
      .then((rows) => {
        if (active) setChapters(rows ?? [])
      })
      .catch((loadError) => {
        if (active) setError(loadError.message)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="gutter mx-auto flex w-full max-w-[960px] flex-col gap-4 pt-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 font-display text-[clamp(26px,4vw,36px)] leading-tight font-semibold">
            Chapters
          </h1>
          <p className="mt-1 text-sm text-muted">
            Pick a chapter to study. Scores here count your first answer to every
            question in the whole chapter.
          </p>
        </div>
        {isAdmin && (
          <Link
            href={IMPORT_PATH}
            className="touch inline-flex items-center justify-center rounded border-[1.5px] border-accent bg-sheet px-3 py-2 text-sm font-bold text-accent"
          >
            Import questions
          </Link>
        )}
      </header>

      {error && (
        <p className="m-0 rounded-r border-l-4 border-no bg-no-soft px-3 py-2 text-sm">
          Couldn’t load your chapters: {error}
        </p>
      )}

      {chapters === null && !error && <p className="text-muted">Loading chapters…</p>}

      {chapters?.length === 0 && (
        <div className="sheet-card p-6 text-center">
          <strong className="mb-1.5 block text-lg">No chapters yet</strong>
          <p className="m-0 text-sm text-muted">
            {isAdmin
              ? 'Import a batch of questions to create your first chapter.'
              : 'Nothing has been published yet.'}
          </p>
        </div>
      )}

      {chapters?.length > 0 && (
        <section className="sheet-card">
          {chapters.map((chapter) => {
            const pct = chapter.seen > 0 ? Math.round((chapter.correct / chapter.seen) * 100) : null
            const done = chapter.total > 0 ? (chapter.seen / chapter.total) * 100 : 0
            return (
              <Link
                key={chapter.bank_id}
                href={chapterPath(chapter.slug)}
                onAuxClick={() => navigate(chapterPath(chapter.slug))}
                className="flex flex-col gap-3 border-b border-rule px-4 py-4 last:border-b-0 hover:bg-accent-soft sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-display text-xl font-semibold text-ink">{chapter.title}</div>
                  {chapter.source && (
                    <div className="mt-0.5 text-[13px] text-muted">{chapter.source}</div>
                  )}

                  {/* Progress through the chapter, as a ruled bar. */}
                  <div className="mt-2 flex items-center gap-2">
                    <div
                      className="h-1.5 w-full max-w-[260px] overflow-hidden rounded-sm bg-accent-soft"
                      role="img"
                      aria-label={`${chapter.seen} of ${chapter.total} answered`}
                    >
                      <div className="h-full bg-accent" style={{ width: `${done}%` }} />
                    </div>
                    <span className="font-mono text-[12px] text-muted tabular-nums">
                      {chapter.seen}/{chapter.total}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 sm:justify-end">
                  <span className="stat-chip">
                    Score{' '}
                    <b className="font-medium text-accent">{pct === null ? '–' : `${pct}%`}</b>
                  </span>
                  <span className="stat-chip">
                    Mistakes <b className="font-medium text-no">{chapter.mistakes}</b>
                  </span>
                  <span className="stat-chip">
                    Flagged <b className="font-medium text-flag">{chapter.flagged}</b>
                  </span>
                </div>
              </Link>
            )
          })}
        </section>
      )}
    </div>
  )
}
