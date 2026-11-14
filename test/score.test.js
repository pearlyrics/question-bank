import { describe, expect, it } from 'vitest'
import { activeCount, firstRunScore, flaggedIds, mistakeIds, seenCount } from '../src/lib/score.js'
import { applyAnswer, applyClearActive } from '../src/lib/progress.js'

function rowsFrom(entries) {
  return new Map(entries.map((row) => [row.question_id, row]))
}

function answerQuestion(rows, id, { choice, correct, attemptId }) {
  const next = new Map(rows)
  next.set(
    id,
    applyAnswer(rows.get(id), {
      questionId: id,
      bankId: 'b1',
      choice,
      correct,
      attemptId,
      now: '2026-01-01T00:00:00.000Z',
      view: 'sets',
    }),
  )
  return next
}

describe('firstRunScore', () => {
  const ids = ['q1', 'q2', 'q3', 'q4']

  it('reports nothing before any answer', () => {
    const score = firstRunScore(ids, new Map())
    expect(score).toEqual({ answered: 0, correct: 0, total: 4, pct: null })
  })

  it('counts only answered questions', () => {
    let rows = new Map()
    rows = answerQuestion(rows, 'q1', { choice: true, correct: true, attemptId: 'a1' })
    rows = answerQuestion(rows, 'q2', { choice: true, correct: false, attemptId: 'a2' })
    expect(firstRunScore(ids, rows)).toEqual({ answered: 2, correct: 1, total: 4, pct: 50 })
  })

  // The regression the rebuild exists to prevent.
  it('is unchanged by a full round of redos', () => {
    let rows = new Map()
    rows = answerQuestion(rows, 'q1', { choice: true, correct: true, attemptId: 'a1' })
    rows = answerQuestion(rows, 'q2', { choice: true, correct: false, attemptId: 'a2' })
    const before = firstRunScore(ids, rows)

    // Redo both, getting everything right this time.
    for (const id of ['q1', 'q2']) {
      const cleared = applyClearActive(rows.get(id), 'sets')
      rows = new Map(rows).set(id, cleared)
      rows = answerQuestion(rows, id, { choice: true, correct: true, attemptId: `redo-${id}` })
    }

    expect(firstRunScore(ids, rows)).toEqual(before)
    // The attempts themselves are still recorded; only the score is frozen.
    expect(rows.get('q2').attempt_count).toBe(2)
    expect(rows.get('q2').wrong_count).toBe(1)
  })

  it('is untouched by work done under By topic, Mistakes or Flagged', () => {
    let rows = new Map()
    rows = answerQuestion(rows, 'q1', { choice: true, correct: true, attemptId: 'a1' })
    const before = firstRunScore(ids, rows)

    for (const [id, view] of [['q2', 'topic'], ['q3', 'flagged'], ['q4', 'mistakes']]) {
      const next = new Map(rows)
      next.set(
        id,
        applyAnswer(rows.get(id), {
          questionId: id, bankId: 'b1', choice: true, correct: true,
          attemptId: `x-${id}`, now: '2026-03-03T00:00:00.000Z', view,
        }),
      )
      rows = next
    }

    expect(firstRunScore(ids, rows)).toEqual(before)
    expect(firstRunScore(ids, rows).answered).toBe(1)
  })
})

describe('lists', () => {
  const ids = ['q1', 'q2', 'q3']
  const rows = rowsFrom([
    { question_id: 'q1', first_at: 'x', first_correct: false, is_mistake: true, flagged: false, attempt_count: 1, wrong_count: 1, active: { sets: true } },
    { question_id: 'q2', first_at: 'x', first_correct: true, is_mistake: false, flagged: true, attempt_count: 1, wrong_count: 0, active: {} },
    { question_id: 'q3', first_at: null, first_correct: null, is_mistake: false, flagged: true, attempt_count: 0, wrong_count: 0, active: { mistakes: false } },
  ])

  it('lists mistakes until they are answered correctly', () => {
    expect(mistakeIds(ids, rows)).toEqual(['q1'])
  })

  it('lists flags whether or not the question was answered', () => {
    expect(flaggedIds(ids, rows)).toEqual(['q2', 'q3'])
  })

  it('counts seen and revealed separately', () => {
    expect(seenCount(ids, rows)).toBe(2)
    expect(activeCount(ids, rows, 'sets')).toBe(1)
    // q3's revealed answer belongs to Mistakes, not Exam sheets.
    expect(activeCount(ids, rows, 'mistakes')).toBe(1)
    expect(activeCount(ids, rows, 'flagged')).toBe(0)
  })
})
