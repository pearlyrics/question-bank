import { DEFAULT_SET_SIZE, SHEET_SIZE, chunk, clampSetIndex, questionsInSet } from './sets.js'
import { flaggedIds, mistakeIds } from './score.js'

export const MODES = ['sets', 'topic', 'mistakes', 'flagged']

export const DEFAULT_VIEW = {
  mode: 'sets',
  // Per chapter, not per account: 40 per set can suit one chapter and 100 another.
  setSize: DEFAULT_SET_SIZE,
  setIndex: 0,
  sheetIndex: 0,
  topicCode: null,
  listPage: 0,
}

// Builds exactly what the sheet should render. Pure, so the paging and slicing
// rules can be tested without a browser.
//
// The selected set is the scope for every mode except By topic: Mistakes and
// Flagged list what you got wrong or marked *inside the current set*, so the
// set buttons stay meaningful no matter which tab you are on.
//
// `snapshot` freezes the Mistakes/Flagged list while you work through it, so a
// question you just got right doesn't vanish from under your cursor mid-sheet.
export function buildView({ questions, rows, view, setSize, topics, snapshot }) {
  const setIndex = clampSetIndex(view.setIndex, questions.length, setSize)
  const setIds = questionsInSet(questions, setSize, setIndex).map((question) => question.id)
  const context = { setIndex, setIds }

  if (view.mode === 'topic') {
    const code = view.topicCode ?? topics?.[0]?.code ?? null
    const topic = topics?.find((entry) => entry.code === code) ?? null
    const ids = questions.filter((question) => question.topic_id === topic?.id).map((q) => q.id)
    return paged({
      ...context,
      ids,
      view,
      title: topic?.label ?? 'Topic',
      meta: `${ids.length} statement${ids.length === 1 ? '' : 's'} across the bank`,
      scopeIds: ids,
    })
  }

  if (view.mode === 'mistakes' || view.mode === 'flagged') {
    const live = view.mode === 'mistakes' ? mistakeIds(setIds, rows) : flaggedIds(setIds, rows)
    // A frozen snapshot can still only show questions from the set in view.
    const ids = snapshot ? snapshot.filter((id) => setIds.includes(id)) : live
    return paged({
      ...context,
      ids,
      view,
      title: view.mode === 'mistakes' ? 'Mistakes' : 'Flagged',
      meta: '',
      scopeIds: ids,
    })
  }

  const sheets = chunk(setIds, SHEET_SIZE)
  const sheetIndex = Math.min(Math.max(view.sheetIndex, 0), Math.max(sheets.length - 1, 0))
  const ids = sheets[sheetIndex] ?? []

  return {
    ...context,
    kind: 'sets',
    title: `Sheet ${sheetIndex + 1}`,
    meta: `Mixed topics · ${ids.length} statement${ids.length === 1 ? '' : 's'}`,
    ids,
    firstNumber: setIndex * setSize + sheetIndex * SHEET_SIZE + 1,
    scopeIds: setIds,
    sheetIndex,
    sheetCount: sheets.length,
    sheets,
    pageCount: sheets.length,
    pageIndex: sheetIndex,
    hasNext: sheetIndex < sheets.length - 1,
  }
}

function paged({ ids, view, title, meta, scopeIds, setIndex, setIds }) {
  const pageCount = Math.max(1, Math.ceil(ids.length / SHEET_SIZE))
  const pageIndex = Math.min(Math.max(view.listPage, 0), pageCount - 1)
  const slice = ids.slice(pageIndex * SHEET_SIZE, pageIndex * SHEET_SIZE + SHEET_SIZE)
  return {
    setIndex,
    setIds,
    kind: view.mode,
    title,
    meta:
      meta || (ids.length ? `Page ${pageIndex + 1} of ${pageCount} · ${ids.length} total` : ''),
    ids: slice,
    firstNumber: pageIndex * SHEET_SIZE + 1,
    scopeIds,
    pageCount,
    pageIndex,
    sheetCount: pageCount,
    sheetIndex: pageIndex,
    hasNext: pageIndex < pageCount - 1,
  }
}
