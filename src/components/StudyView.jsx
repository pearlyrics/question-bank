import { useEffect, useMemo, useRef, useState } from 'react'
import { useStudy } from '../lib/studyStore.jsx'
import {
  activeCount,
  firstRunScore,
  flaggedIds,
  mistakeIds,
  seenCount,
} from '../lib/score.js'
import { SHEET_SIZE, chunk, clampSetIndex, questionsInSet, setCount } from '../lib/sets.js'
import { buildView } from '../lib/view.js'
import { Link } from '../lib/router.jsx'
import { CHAPTERS_PATH } from '../lib/routes.js'
import QuestionRow from './QuestionRow.jsx'
import SetSizeSlider from './SetSizeSlider.jsx'

const TABS = [
  { mode: 'sets', label: 'Exam sheets', short: 'Sheets' },
  { mode: 'mistakes', label: 'Mistakes', short: 'Mistakes', tone: 'mis' },
  { mode: 'flagged', label: 'Flagged', short: 'Flagged', tone: 'flg' },
  { mode: 'topic', label: 'By topic', short: 'Topic' },
]

export default function StudyView() {
  const {
    bank, questions, topics, rows, setSize, view, status, error,
    answer, toggleFlag, redo, updateView, changeSetSize, resetBank,
  } = useStudy()

  const [snapshot, setSnapshot] = useState(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const rowsRef = useRef(rows)
  const sheetRef = useRef(null)
  const stickyRef = useRef(null)
  rowsRef.current = rows

  // Clearing the answers removes every feedback block — around 500px on a full
  // sheet. The Redo button sits at the bottom, so you are scrolled to the
  // bottom when you press it, and the browser has to clamp your scroll
  // position to the shorter page: the whole view lurches. Since a redo means
  // starting this sheet over, put the first question at the top deliberately
  // rather than leaving the browser to pick.
  // Puts the first row just under the pinned bar, rather than at the very top
  // of the window where the bar would cover it.
  function scrollToSheetTop() {
    requestAnimationFrame(() => {
      const sheet = sheetRef.current
      if (!sheet) return
      const barHeight = stickyRef.current?.getBoundingClientRect().height ?? 0
      const top = window.scrollY + sheet.getBoundingClientRect().top - barHeight
      window.scrollTo({ top: Math.max(0, top) })
    })
  }

  function handleRedo(ids) {
    redo(ids)
    scrollToSheetTop()
  }

  const topicById = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics])
  const questionById = useMemo(
    () => new Map(questions.map((question) => [question.id, question])),
    [questions],
  )

  // The current set is the scope for the stats, the tab counts, and the
  // Mistakes and Flagged lists.
  const setIndex = clampSetIndex(view.setIndex, questions.length, setSize)
  const setIds = useMemo(
    () => questionsInSet(questions, setSize, setIndex).map((question) => question.id),
    [questions, setSize, setIndex],
  )

  // Entering Mistakes or Flagged — or moving to another set while on one of
  // them — freezes the list so rows don't vanish mid-pass.
  //
  // It deliberately does NOT clear the answers already showing: leaving for
  // another tab and coming back must not throw away a pass in progress.
  // Clearing happens only when "Redo these" is pressed.
  useEffect(() => {
    if (view.mode !== 'mistakes' && view.mode !== 'flagged') {
      setSnapshot(null)
      return
    }
    const current = rowsRef.current
    setSnapshot(
      view.mode === 'mistakes' ? mistakeIds(setIds, current) : flaggedIds(setIds, current),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.mode, bank?.id, setIndex, setIds.length])

  const built = useMemo(
    () => buildView({ questions, rows, view, setSize, topics, snapshot }),
    [questions, rows, view, setSize, topics, snapshot],
  )

  // Set-scoped numbers.
  const setScore = firstRunScore(setIds, rows)
  const setMistakes = mistakeIds(setIds, rows)
  const setFlags = flaggedIds(setIds, rows)

  const sheetScore = firstRunScore(built.ids, rows)
  const pass = activeCount(built.ids, rows)
  const passCorrect = built.ids.filter((id) => {
    const row = rows.get(id)
    return row?.active_choice !== null && row?.active_choice === questionById.get(id)?.answer
  }).length

  const sets = useMemo(() => {
    const total = setCount(questions.length, setSize)
    return Array.from({ length: total }, (_, index) => {
      const ids = questionsInSet(questions, setSize, index).map((question) => question.id)
      return { index, ids, score: firstRunScore(ids, rows), seen: seenCount(ids, rows) }
    })
  }, [questions, setSize, rows])

  if (status === 'loading') {
    return <p className="px-4 py-10 text-center text-muted">Loading your progress…</p>
  }

  if (status === 'empty') {
    return (
      <div className="sheet-card mx-auto my-10 max-w-[600px] p-6 text-center">
        <strong className="mb-1.5 block text-lg">No question banks yet</strong>
        <p className="m-0 text-sm text-muted">
          Upload a batch from the Import tab to start studying.
        </p>
      </div>
    )
  }

  const topicCode = view.topicCode ?? topics[0]?.code ?? null

  return (
    <div className="gutter mx-auto flex w-full max-w-[960px] flex-col gap-3 pt-4 pb-16 sm:gap-4 sm:pt-5">
      <Link
        href={CHAPTERS_PATH}
        className="font-mono text-[13px] font-bold text-accent"
      >
        ← All chapters
      </Link>

      <header className="shrink-0">
        <h1 className="m-0 font-display text-[clamp(26px,4vw,36px)] leading-tight font-semibold text-balance">
          {bank?.title ?? 'Question Bank'}
        </h1>
        {bank?.source && <p className="mt-1 text-sm text-muted">{bank.source}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5 sm:gap-2">
          <span className="stat-chip">
            Set {setIndex + 1} · Seen{' '}
            <b className="font-medium text-accent">{setScore.answered}</b>/{setIds.length}
          </span>
          <span className="stat-chip">
            Score{' '}
            <b className="font-medium text-accent">
              {setScore.pct === null ? '–' : `${setScore.pct}%`}
            </b>
          </span>
        </div>
      </header>

      <div className="shrink-0 sheet-card flex flex-col gap-3 px-4 py-3">
        <SetSizeSlider total={questions.length} setSize={setSize} onChange={changeSetSize} />
        <nav
          aria-label="Question sets"
          className="grid grid-cols-[repeat(auto-fill,minmax(124px,1fr))] gap-2"
        >
          {sets.map((entry) => (
            <button
              key={entry.index}
              type="button"
              aria-pressed={entry.index === setIndex}
              // Switching sets keeps the tab you are on, so Mistakes and
              // Flagged follow you from set to set.
              onClick={() => updateView({ setIndex: entry.index, sheetIndex: 0, listPage: 0 })}
              className={`flex min-w-0 flex-col gap-0.5 rounded border-[1.5px] p-2 text-left ${
                entry.index === setIndex
                  ? 'border-accent bg-accent-soft shadow-[inset_0_-3px_0_var(--accent)]'
                  : 'border-rule-strong bg-sheet'
              }`}
            >
              <span className="font-display text-[17px] font-semibold">Set {entry.index + 1}</span>
              <span className="font-mono text-[11px] text-muted tabular-nums">
                <b className="font-medium text-accent">{entry.seen}</b>/{entry.ids.length} seen
                {entry.score.pct === null ? '' : ` · ${entry.score.pct}%`}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Everything from the tabs down pins to the top once you reach it, so
          the questions scroll under a bar that keeps the score and the
          controls in reach. */}
      <div ref={stickyRef} className="sticky top-0 z-10 -mx-1 -mb-3 bg-bg px-1 pt-2 sm:-mb-4">
      <nav role="tablist" className="flex flex-wrap gap-1.5 border-b-2 border-rule-strong">
        {TABS.map((tab) => {
          const selected = view.mode === tab.mode
          const count =
            tab.mode === 'mistakes'
              ? setMistakes.length
              : tab.mode === 'flagged'
                ? setFlags.length
                : null
          return (
            <button
              key={tab.mode}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => {
                updateView({ mode: tab.mode, listPage: 0 })
                scrollToSheetTop()
              }}
              className={`touch -mb-0.5 border-b-[3px] px-2.5 py-2.5 text-[15px] font-bold sm:px-3.5 ${
                selected ? 'border-accent text-ink' : 'border-transparent text-muted'
              }`}
            >
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.short}</span>
              {count !== null && (
                <span
                  className={`ml-1.5 rounded-[10px] px-1.5 py-px font-mono text-xs font-medium ${
                    tab.tone === 'mis' ? 'bg-no-soft text-no' : 'bg-flag-soft text-flag'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Picker: sheets within the set, a topic, or list pages. */}
      <div className="chip-rail flex flex-wrap items-center gap-1.5 py-2.5">
        {view.mode === 'sets' &&
          chunk(setIds, SHEET_SIZE).map((ids, index) => {
            const done = ids.filter((id) => rows.get(id)?.first_at).length
            return (
              <button
                key={index}
                type="button"
                aria-pressed={index === built.sheetIndex}
                title={`Sheet ${index + 1}: ${done}/${ids.length} seen`}
                onClick={() => {
                  updateView({ sheetIndex: index })
                  window.scrollTo({ top: 0 })
                }}
                className={`touch min-w-11 rounded border px-2 py-1.5 font-mono text-[13px] tabular-nums ${
                  index === built.sheetIndex
                    ? 'border-accent bg-accent text-sheet'
                    : 'border-rule-strong bg-sheet text-ink'
                } ${
                  done === ids.length
                    ? 'shadow-[inset_0_-3px_0_var(--yes)]'
                    : done > 0
                      ? 'shadow-[inset_0_-3px_0_var(--flag)]'
                      : ''
                }`}
              >
                {index + 1}
              </button>
            )
          })}

        {view.mode === 'topic' && topics.length > 0 && (
          <>
            <label htmlFor="topic" className="text-[13px] text-muted">
              Topic
            </label>
            <select
              id="topic"
              value={topicCode ?? ''}
              onChange={(event) => updateView({ topicCode: event.target.value, listPage: 0 })}
              className="touch max-w-full rounded border border-rule-strong bg-sheet px-2.5 py-1.5 text-ink"
            >
              {topics.map((topic) => {
                const count = questions.filter((question) => question.topic_id === topic.id).length
                return (
                  <option key={topic.id} value={topic.code}>
                    {topic.label} ({count})
                  </option>
                )
              })}
            </select>
          </>
        )}

        {(view.mode === 'mistakes' || view.mode === 'flagged') &&
          Array.from({ length: built.pageCount }, (_, index) => (
            <button
              key={index}
              type="button"
              aria-pressed={index === built.pageIndex}
              onClick={() => updateView({ listPage: index })}
              className={`touch min-w-11 rounded border px-2 py-1.5 font-mono text-[13px] tabular-nums ${
                index === built.pageIndex
                  ? 'border-accent bg-accent text-sheet'
                  : 'border-rule-strong bg-sheet text-ink'
              }`}
            >
              {index + 1}
            </button>
          ))}
      </div>

        {built.ids.length > 0 && (
          <div className="sheet-card flex flex-wrap items-center gap-x-3 gap-y-2.5 px-3 py-2.5 sm:px-4 sm:py-3.5">
              <span className="order-1 font-display text-xl font-semibold">{built.title}</span>

              {/* Narrow: its own full-width row, under the buttons.
                  Wide: inline, between the title and the buttons. */}
              <span className="order-3 basis-full border-t border-rule pt-2 font-mono text-[13px] tabular-nums sm:order-2 sm:basis-auto sm:border-t-0 sm:pt-0">
                1st run {sheetScore.correct}/{sheetScore.answered}
                {sheetScore.pct === null ? '' : ` · ${sheetScore.pct}%`}
                <span className="text-muted">
                  {' '}
                  · this pass {passCorrect}/{pass}
                  {pass < built.ids.length ? ` · ${built.ids.length - pass} left` : ''}
                </span>
              </span>

              <div className="order-2 ml-auto flex gap-2 sm:order-3">
                <button
                  type="button"
                  onClick={() => handleRedo(built.ids)}
                  className="rounded border-[1.5px] border-accent bg-sheet px-2.5 py-1 text-[13px] font-bold text-accent"
                >
                  Redo these
                </button>
                {(view.mode === 'mistakes' || view.mode === 'flagged') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSnapshot(view.mode === 'mistakes' ? setMistakes : setFlags)
                      updateView({ listPage: 0 })
                    }}
                    className="rounded border-[1.5px] border-accent bg-sheet px-2.5 py-1 text-[13px] font-bold text-accent"
                  >
                    Refresh list
                  </button>
                )}
                {built.hasNext && (
                  <button
                    type="button"
                    onClick={() => {
                      if (view.mode === 'sets') updateView({ sheetIndex: built.sheetIndex + 1 })
                      else updateView({ listPage: built.pageIndex + 1 })
                      scrollToSheetTop()
                    }}
                    className="rounded border-[1.5px] border-accent bg-accent px-2.5 py-1 text-[13px] font-bold text-sheet"
                  >
                    Next {view.mode === 'sets' ? 'sheet' : 'page'}
                  </button>
                )}
              </div>
          </div>
        )}
      </div>

      <section className="sheet-card" ref={sheetRef} aria-live="polite">
        {built.ids.length === 0 ? (
          <div className="px-5 py-10 text-center text-muted">
            <strong className="mb-1.5 block text-lg text-ink">
              {view.mode === 'mistakes'
                ? `No mistakes in Set ${setIndex + 1}`
                : `Nothing flagged in Set ${setIndex + 1}`}
            </strong>
            {view.mode === 'mistakes'
              ? 'Wrong answers from this set land here so you can redo them. Pick another set above to see its mistakes.'
              : 'Tap Flag on any statement to keep it here. Pick another set above to see its flags.'}
          </div>
        ) : (
          <>
            <div
              aria-hidden="true"
              className="exam-grid hidden border-b border-rule text-[13px] font-bold uppercase tracking-[0.06em] text-muted sm:grid"
            >
              <div className="px-2.5 py-1.5">No.</div>
              <div className="border-l border-rule px-2.5 py-1.5">Statement</div>
              <div className="border-l border-rule px-2.5 py-1.5">Yes / No</div>
            </div>

            {built.ids.map((id, index) => {
              const question = questionById.get(id)
              if (!question) return null
              return (
                <QuestionRow
                  key={id}
                  question={question}
                  row={rows.get(id)}
                  number={built.firstNumber + index}
                  topicLabel={topicById.get(question.topic_id)?.label ?? ''}
                  onAnswer={answer}
                  onFlag={toggleFlag}
                  showCleared={view.mode === 'mistakes'}
                />
              )
            })}
          </>
        )}
      </section>

      <div className="flex flex-col items-start justify-end gap-3 text-sm text-muted sm:flex-row sm:items-center sm:gap-2.5">
        {confirmReset ? (
          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
            <span>Erase this bank?</span>
            <button
              type="button"
              onClick={() => {
                setConfirmReset(false)
                void resetBank('pass')
              }}
              className="rounded border-[1.5px] border-accent bg-sheet touch px-3 py-2 text-sm font-bold text-accent"
            >
              Just start a fresh pass
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmReset(false)
                void resetBank('all')
              }}
              className="touch rounded border-[1.5px] border-no bg-sheet px-3 py-2 text-sm font-bold text-no"
            >
              Erase everything, score included
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="rounded border-[1.5px] border-accent bg-sheet touch px-3 py-2 text-sm font-bold text-accent"
            >
              Keep
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="touch rounded border-[1.5px] border-no bg-sheet px-3 py-2 text-sm font-bold text-no"
          >
            Reset this bank
          </button>
        )}
      </div>

    </div>
  )
}
