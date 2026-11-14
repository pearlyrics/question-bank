import { describe, expect, it } from 'vitest'
import { applyAnswer, applyClearActive, applyFlag, emptyRow, replayOps } from '../src/lib/progress.js'

const Q = 'q1'
const BANK = 'b1'

function answer(row, { choice, correct, attemptId, now = '2026-01-01T00:00:00.000Z', view = 'sets' }) {
  return applyAnswer(row, { questionId: Q, bankId: BANK, choice, correct, attemptId, now, view })
}

describe('first-attempt record', () => {
  it('stores the first answer', () => {
    const row = answer(undefined, { choice: false, correct: false, attemptId: 'a1' })
    expect(row.first_choice).toBe(false)
    expect(row.first_correct).toBe(false)
    expect(row.first_at).toBe('2026-01-01T00:00:00.000Z')
    expect(row.attempt_count).toBe(1)
    expect(row.wrong_count).toBe(1)
  })

  // This is the original bug: redoing a mistake moved the score.
  it('never changes once set, however many times the question is redone', () => {
    let row = answer(undefined, { choice: false, correct: false, attemptId: 'a1' })
    const firstRun = {
      first_choice: row.first_choice,
      first_correct: row.first_correct,
      first_at: row.first_at,
    }

    for (let i = 0; i < 25; i++) {
      row = applyClearActive(row, 'sets')
      row = answer(row, {
        choice: true,
        correct: true,
        attemptId: `redo-${i}`,
        now: '2026-02-02T00:00:00.000Z',
      })
    }

    expect(row.first_choice).toBe(firstRun.first_choice)
    expect(row.first_correct).toBe(false)
    expect(row.first_at).toBe(firstRun.first_at)
    // The live state still tracks the newest answer.
    expect(row.active.sets).toBe(true)
    expect(row.last_correct).toBe(true)
    expect(row.attempt_count).toBe(26)
  })

  it('keeps a first answer of false distinct from no answer', () => {
    const flaggedOnly = applyFlag(undefined, { questionId: Q, bankId: BANK, flagged: true })
    expect(flaggedOnly.first_at).toBeNull()

    const answered = answer(flaggedOnly, { choice: false, correct: true, attemptId: 'a1' })
    expect(answered.first_choice).toBe(false)
    expect(answered.first_correct).toBe(true)
    expect(answered.flagged).toBe(true)
  })
})

describe('only Exam sheets establishes a first run', () => {
  // By topic and Flagged both contain questions that have never been answered,
  // so answering one there must not create a score for it.
  it('records nothing for a first answer given outside Exam sheets', () => {
    for (const view of ['topic', 'mistakes', 'flagged']) {
      const row = answer(undefined, { choice: true, correct: true, attemptId: 'a1', view })
      expect(row.first_at).toBeNull()
      expect(row.first_choice).toBeNull()
      expect(row.first_correct).toBeNull()
      // the attempt itself is still history, and the pass is still shown
      expect(row.attempt_count).toBe(1)
      expect(row.active[view]).toBe(true)
      expect(row.last_correct).toBe(true)
    }
  })

  it('still records the first run when the answer comes from Exam sheets', () => {
    const row = answer(undefined, { choice: true, correct: true, attemptId: 'a1', view: 'sets' })
    expect(row.first_at).not.toBeNull()
    expect(row.first_correct).toBe(true)
  })

  it('leaves an existing first run alone when other sections answer it', () => {
    let row = answer(undefined, { choice: false, correct: false, attemptId: 'a1', view: 'sets' })
    for (const view of ['topic', 'mistakes', 'flagged']) {
      row = answer(row, { choice: true, correct: true, attemptId: `x-${view}`, view })
    }
    expect(row.first_correct).toBe(false)
    expect(row.first_at).toBe('2026-01-01T00:00:00.000Z')
    // a mistake answered correctly elsewhere still leaves the Mistakes list
    expect(row.last_correct).toBe(true)
  })
})

describe('replay safety', () => {
  it('does not double-count when the same attempt is applied twice', () => {
    const once = answer(undefined, { choice: false, correct: false, attemptId: 'a1' })
    const twice = answer(once, { choice: false, correct: false, attemptId: 'a1' })
    expect(twice.attempt_count).toBe(1)
    expect(twice.wrong_count).toBe(1)
  })

  it('counts genuinely new attempts', () => {
    const once = answer(undefined, { choice: false, correct: false, attemptId: 'a1' })
    const twice = answer(once, { choice: false, correct: false, attemptId: 'a2' })
    expect(twice.attempt_count).toBe(2)
    expect(twice.wrong_count).toBe(2)
  })

  it('is idempotent when a whole queue is replayed over a server snapshot', () => {
    const ops = [
      { kind: 'answer', question_id: Q, bank_id: BANK, choice: true, correct: true, attempt_id: 'a1', at: '2026-01-01T00:00:00.000Z', view: 'sets' },
      { kind: 'flag', question_id: Q, bank_id: BANK, flagged: true },
    ]
    const once = replayOps(new Map(), ops)
    const twice = replayOps(once, ops)
    expect(twice.get(Q)).toEqual(once.get(Q))
  })
})

describe('clearing the current pass', () => {
  it('hides the revealed answer without touching history', () => {
    const answered = answer(undefined, { choice: true, correct: true, attemptId: 'a1' })
    const cleared = applyClearActive(answered, 'sets')
    expect(cleared.active).toEqual({})
    expect(cleared.first_correct).toBe(true)
    expect(cleared.attempt_count).toBe(1)
  })

  it('leaves an untouched row alone', () => {
    const row = emptyRow(Q, BANK)
    expect(applyClearActive(row, 'sets')).toBe(row)
  })

  // The bug this replaced: one shared value meant redoing Mistakes wiped the
  // answer you were looking at under Exam sheets.
  it('clears only the section asked for', () => {
    let row = answer(undefined, { choice: true, correct: true, attemptId: 'a1', view: 'sets' })
    row = answer(row, { choice: false, correct: false, attemptId: 'a2', view: 'mistakes' })
    expect(row.active).toEqual({ sets: true, mistakes: false })

    const afterRedo = applyClearActive(row, 'mistakes')
    expect(afterRedo.active).toEqual({ sets: true })
    expect(afterRedo.first_correct).toBe(true)
  })

  it('keeps each section’s answer to the same question apart', () => {
    let row = answer(undefined, { choice: true, correct: true, attemptId: 'a1', view: 'sets' })
    row = answer(row, { choice: false, correct: false, attemptId: 'a2', view: 'flagged' })
    expect(row.active.sets).toBe(true)
    expect(row.active.flagged).toBe(false)
  })
})
