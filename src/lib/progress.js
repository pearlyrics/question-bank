// Local mirror of the SQL functions in supabase/migrations/0001_init.sql.
//
// Optimistic UI and the server must agree exactly, so these three rules are
// implemented identically in both places:
//   1. first_choice / first_correct / first_at are written once, never changed,
//      and only ever by Exam sheets — working through By topic, Mistakes or
//      Flagged must not establish a first run or move the score.
//   2. attempt_count / wrong_count advance only for a new attemptId.
//   3. active[view] tracks the newest answer in that section. `active`
//      is keyed by section, so Exam sheets and Mistakes keep separate passes
//      of the same question.

export function emptyRow(questionId, bankId) {
  return {
    question_id: questionId,
    bank_id: bankId,
    first_choice: null,
    first_correct: null,
    first_at: null,
    active: {},
    is_mistake: false,
    attempt_count: 0,
    wrong_count: 0,
    flagged: false,
    last_attempt_id: null,
  }
}

export function applyAnswer(row, { questionId, bankId, choice, correct, attemptId, now, view }) {
  const base = row ?? emptyRow(questionId, bankId)
  const isReplay = base.last_attempt_id === attemptId
  const at = now ?? new Date().toISOString()

  const scores = view === 'sets'
  const isFirst = scores && base.first_at === null

  return {
    ...base,
    // Rule 1: set once, and only from Exam sheets.
    first_choice: isFirst ? choice : base.first_choice,
    first_correct: isFirst ? correct : base.first_correct,
    first_at: isFirst ? at : base.first_at,
    // Rule 3 — only this section's entry.
    active: { ...base.active, [view]: choice },
    // Wrong anywhere makes it a mistake; only the Mistakes tab clears it, so
    // redoing a question in Exam sheets can't empty the Mistakes list.
    is_mistake: !correct ? true : view === 'mistakes' ? false : base.is_mistake,
    // Rule 2.
    attempt_count: base.attempt_count + (isReplay ? 0 : 1),
    wrong_count: base.wrong_count + (!isReplay && !correct ? 1 : 0),
    last_attempt_id: attemptId,
  }
}

export function applyFlag(row, { questionId, bankId, flagged }) {
  const base = row ?? emptyRow(questionId, bankId)
  return { ...base, flagged }
}

export function applyClearActive(row, view) {
  if (!row || !(view in (row.active ?? {}))) return row
  const active = { ...row.active }
  delete active[view]
  return { ...row, active }
}

// Replays queued ops on top of a freshly fetched server snapshot, so answers
// given while offline survive a reload that beats the flush.
export function replayOps(rowsById, ops) {
  const next = new Map(rowsById)
  for (const op of ops) {
    if (op.kind === 'answer') {
      next.set(
        op.question_id,
        applyAnswer(next.get(op.question_id), {
          questionId: op.question_id,
          bankId: op.bank_id,
          choice: op.choice,
          correct: op.correct,
          attemptId: op.attempt_id,
          now: op.at,
          view: op.view,
        }),
      )
    } else if (op.kind === 'flag') {
      next.set(
        op.question_id,
        applyFlag(next.get(op.question_id), {
          questionId: op.question_id,
          bankId: op.bank_id,
          flagged: op.flagged,
        }),
      )
    } else if (op.kind === 'clear') {
      for (const id of op.question_ids) {
        const cleared = applyClearActive(next.get(id), op.view)
        if (cleared) next.set(id, cleared)
      }
    }
  }
  return next
}
