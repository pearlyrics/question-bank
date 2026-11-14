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

// A question sits in Mistakes until it is answered correctly *there*.
export function mistakeIds(questionIds, rowsById) {
  return questionIds.filter((id) => rowsById.get(id)?.is_mistake === true)
}

export function flaggedIds(questionIds, rowsById) {
  return questionIds.filter((id) => rowsById.get(id)?.flagged === true)
}

export function seenCount(questionIds, rowsById) {
  return questionIds.filter((id) => rowsById.get(id)?.first_at).length
}

// Answers revealed in this section's current pass.
export function activeCount(questionIds, rowsById, view) {
  return questionIds.filter((id) => {
    const choice = rowsById.get(id)?.active?.[view]
    return choice === true || choice === false
  }).length
}
