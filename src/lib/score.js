// Every number on screen is derived from `responses` rows. Nothing is stored,
// so no displayed total can drift from the answers that produced it.

// The score. Counts each question's first attempt only, which is why redoing
// mistakes or flags cannot move it.
export function firstRunScore(questionIds, rowsById) {
  let answered = 0
  let correct = 0
  for (const id of questionIds) {
    const row = rowsById.get(id)
    if (row?.first_at) {
      answered++
      if (row.first_correct) correct++
    }
  }
  return {
    answered,
    correct,
    total: questionIds.length,
    pct: answered > 0 ? Math.round((correct / answered) * 100) : null,
  }
}

// Shown separately from the score: how you are doing across all attempts,
// including redos. Free to move.
export function reviewAccuracy(questionIds, rowsById) {
  let attempts = 0
  let wrong = 0
  for (const id of questionIds) {
    const row = rowsById.get(id)
    if (row) {
      attempts += row.attempt_count
      wrong += row.wrong_count
    }
  }
  return {
    attempts,
    correct: attempts - wrong,
    pct: attempts > 0 ? Math.round(((attempts - wrong) / attempts) * 100) : null,
  }
}

// A question sits in Mistakes until it is answered correctly.
export function mistakeIds(questionIds, rowsById) {
  return questionIds.filter((id) => rowsById.get(id)?.last_correct === false)
}

export function flaggedIds(questionIds, rowsById) {
  return questionIds.filter((id) => rowsById.get(id)?.flagged === true)
}

export function seenCount(questionIds, rowsById) {
  return questionIds.filter((id) => rowsById.get(id)?.first_at).length
}

// Answers revealed in the current pass.
export function activeCount(questionIds, rowsById) {
  return questionIds.filter((id) => {
    const choice = rowsById.get(id)?.active_choice
    return choice === true || choice === false
  }).length
}
