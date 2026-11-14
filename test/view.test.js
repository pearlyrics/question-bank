import { describe, expect, it } from 'vitest'
import { buildView } from '../src/lib/view.js'
import { DEFAULT_VIEW } from '../src/lib/view.js'

const topics = [
  { id: 't1', code: 'OV', label: 'Overview', sort_order: 0 },
  { id: 't2', code: 'CT', label: 'Connective tissue', sort_order: 1 },
]

const questions = Array.from({ length: 45 }, (_, index) => ({
  id: `q${index}`,
  bank_id: 'b1',
  topic_id: index % 2 === 0 ? 't1' : 't2',
  answer: index % 3 === 0,
  statement: `statement ${index}`,
  explanation: 'because',
  page: 1,
  position: index,
}))

function view(patch) {
  return { ...DEFAULT_VIEW, ...patch }
}

describe('sets mode', () => {
  it('renders the first sheet of the chosen set', () => {
    const built = buildView({ questions, rows: new Map(), view: view({}), setSize: 20, topics })
    expect(built.ids).toHaveLength(10)
    expect(built.ids[0]).toBe('q0')
    expect(built.firstNumber).toBe(1)
    expect(built.sheetCount).toBe(2)
    expect(built.hasNext).toBe(true)
  })

  it('numbers later sheets continuously through the bank', () => {
    const built = buildView({
      questions,
      rows: new Map(),
      view: view({ setIndex: 1, sheetIndex: 1 }),
      setSize: 20,
      topics,
    })
    expect(built.ids[0]).toBe('q30')
    expect(built.firstNumber).toBe(31)
  })

  it('clamps a set index that no longer exists after a resize', () => {
    const built = buildView({
      questions,
      rows: new Map(),
      view: view({ setIndex: 9 }),
      setSize: 20,
      topics,
    })
    expect(built.setIndex).toBe(2)
  })

  it('gives the final short set its remaining questions', () => {
    const built = buildView({
      questions,
      rows: new Map(),
      view: view({ setIndex: 2 }),
      setSize: 20,
      topics,
    })
    expect(built.scopeIds).toHaveLength(5)
    expect(built.hasNext).toBe(false)
  })
})

describe('topic mode', () => {
  it('lists one topic, paged by ten', () => {
    const built = buildView({
      questions,
      rows: new Map(),
      view: view({ mode: 'topic', topicCode: 'CT' }),
      setSize: 20,
      topics,
    })
    expect(built.title).toBe('Connective tissue')
    expect(built.scopeIds).toHaveLength(22)
    expect(built.ids).toHaveLength(10)
  })

  it('falls back to the first topic when none is chosen', () => {
    const built = buildView({
      questions,
      rows: new Map(),
      view: view({ mode: 'topic' }),
      setSize: 20,
      topics,
    })
    expect(built.title).toBe('Overview')
  })
})

describe('mistakes and flagged modes', () => {
  // q0..q19 are set 0 at size 20; q20+ belong to later sets.
  const rows = new Map([
    ['q1', { question_id: 'q1', is_mistake: true, flagged: false }],
    ['q2', { question_id: 'q2', is_mistake: false, flagged: true }],
    ['q3', { question_id: 'q3', is_mistake: true, flagged: false }],
    ['q25', { question_id: 'q25', is_mistake: true, flagged: true }],
  ])

  it('lists only mistakes from the set in view', () => {
    const built = buildView({
      questions,
      rows,
      view: view({ mode: 'mistakes', setIndex: 0 }),
      setSize: 20,
      topics,
    })
    expect(built.ids).toEqual(['q1', 'q3'])
    expect(built.setIndex).toBe(0)
  })

  it('shows a different set’s mistakes when the set changes', () => {
    const built = buildView({
      questions,
      rows,
      view: view({ mode: 'mistakes', setIndex: 1 }),
      setSize: 20,
      topics,
    })
    expect(built.ids).toEqual(['q25'])
  })

  it('scopes flags to the set too', () => {
    expect(
      buildView({ questions, rows, view: view({ mode: 'flagged', setIndex: 0 }), setSize: 20, topics }).ids,
    ).toEqual(['q2'])
    expect(
      buildView({ questions, rows, view: view({ mode: 'flagged', setIndex: 1 }), setSize: 20, topics }).ids,
    ).toEqual(['q25'])
  })

  it('re-scopes when the slider merges sets together', () => {
    const built = buildView({
      questions,
      rows,
      view: view({ mode: 'mistakes', setIndex: 0 }),
      setSize: 45,
      topics,
    })
    expect(built.ids).toEqual(['q1', 'q3', 'q25'])
  })

  // Without a snapshot, answering a mistake correctly would drop the row from
  // the list mid-sheet and renumber everything below it.
  it('keeps a frozen snapshot even after the mistakes are fixed', () => {
    const fixed = new Map(rows).set('q1', { question_id: 'q1', is_mistake: false })
    const built = buildView({
      questions,
      rows: fixed,
      view: view({ mode: 'mistakes', setIndex: 0 }),
      setSize: 20,
      topics,
      snapshot: ['q1', 'q3'],
    })
    expect(built.ids).toEqual(['q1', 'q3'])
  })

  // A snapshot taken in one set must not leak into another.
  it('filters a stale snapshot down to the set in view', () => {
    const built = buildView({
      questions,
      rows,
      view: view({ mode: 'mistakes', setIndex: 1 }),
      setSize: 20,
      topics,
      snapshot: ['q1', 'q3', 'q25'],
    })
    expect(built.ids).toEqual(['q25'])
  })

  it('pages long lists and clamps an out-of-range page', () => {
    const many = new Map(
      questions.map((question) => [question.id, { question_id: question.id, is_mistake: true }]),
    )
    const built = buildView({
      questions,
      rows: many,
      view: view({ mode: 'mistakes', setIndex: 0, listPage: 99 }),
      setSize: 20,
      topics,
    })
    expect(built.pageCount).toBe(2)
    expect(built.pageIndex).toBe(1)
    expect(built.ids).toHaveLength(10)
    expect(built.firstNumber).toBe(11)
  })
})
