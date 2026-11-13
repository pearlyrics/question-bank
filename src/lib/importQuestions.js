// Validates and normalises an upload before it reaches the database.
//
// Two shapes are accepted, so questions can be pasted in the format they were
// generated in:
//
//   full:   { "bank": {...}, "topics": [...], "questions": [...] }
//   legacy: [ ["OV", 1, "statement", "explanation", 193], ... ]
//
// and each question may itself be an object or the legacy 5-element array.

import { RESERVED_SLUGS } from './routes.js'

const TRUTHY = new Set(['true', 't', '1', 'yes', 'y'])
const FALSY = new Set(['false', 'f', '0', 'no', 'n'])

export function normalizeStatement(statement) {
  return String(statement ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

export function coerceAnswer(value) {
  if (value === true || value === false) return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    return null
  }
  const text = String(value ?? '').trim().toLowerCase()
  if (TRUTHY.has(text)) return true
  if (FALSY.has(text)) return false
  return null
}

function coercePage(value) {
  if (value === null || value === undefined || value === '') return null
  const page = Number.parseInt(value, 10)
  return Number.isFinite(page) ? page : null
}

function normalizeQuestion(raw) {
  if (Array.isArray(raw)) {
    const [topic, answer, statement, explanation, page] = raw
    return {
      topic: String(topic ?? '').trim(),
      answer: coerceAnswer(answer),
      statement: normalizeStatement(statement),
      explanation: String(explanation ?? '').trim(),
      page: coercePage(page),
    }
  }
  if (raw && typeof raw === 'object') {
    return {
      topic: String(raw.topic ?? raw.topic_code ?? raw.s ?? '').trim(),
      answer: coerceAnswer(raw.answer ?? raw.a),
      statement: normalizeStatement(raw.statement ?? raw.t ?? raw.text),
      explanation: String(raw.explanation ?? raw.e ?? '').trim(),
      page: coercePage(raw.page ?? raw.p),
    }
  }
  return { topic: '', answer: null, statement: '', explanation: '', page: null }
}

export function parseUpload(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch (error) {
    return { ok: false, errors: [`That isn't valid JSON: ${error.message}`] }
  }

  const rawQuestions = Array.isArray(data) ? data : data?.questions
  if (!Array.isArray(rawQuestions)) {
    return {
      ok: false,
      errors: ['Expected an array of questions, or an object with a "questions" array.'],
    }
  }

  return {
    ok: true,
    bank: Array.isArray(data) ? {} : (data.bank ?? {}),
    topics: Array.isArray(data) ? [] : (data.topics ?? []),
    questions: rawQuestions.map(normalizeQuestion),
  }
}

// Builds the exact payload import_questions() expects, plus a report to show
// before anything is committed.
export function buildImport({ bank, topics, questions }) {
  const errors = []
  const warnings = []

  const slug = String(bank?.slug ?? '').trim()
  if (!slug) errors.push('Bank slug is required.')
  else if (!/^[a-z0-9-]{2,60}$/.test(slug)) {
    errors.push('Bank slug should be lowercase letters, numbers and dashes (2–60 chars).')
  } else if (RESERVED_SLUGS.includes(slug)) {
    // The chapter would live at /<slug> and collide with an app route.
    errors.push(`"${slug}" is reserved — the chapter would be unreachable. Pick another slug.`)
  }

  const title = String(bank?.title ?? '').trim() || slug
  const topicLabels = new Map()
  for (const topic of topics ?? []) {
    const code = String(topic?.code ?? '').trim()
    if (code) topicLabels.set(code, String(topic?.label ?? '').trim() || code)
  }

  // Validate first, then dedupe (last one wins), then count. Doing it in that
  // order keeps the topic tallies consistent with what is actually uploaded.
  const valid = []
  questions.forEach((question, index) => {
    const line = index + 1
    if (!question.statement) {
      errors.push(`Question ${line}: statement is empty.`)
      return
    }
    if (!question.explanation) {
      errors.push(`Question ${line}: explanation is empty.`)
      return
    }
    if (question.answer === null) {
      errors.push(`Question ${line}: answer must be true or false.`)
      return
    }
    if (!question.topic) {
      errors.push(`Question ${line}: topic code is required.`)
      return
    }
    valid.push({ question, line })
  })

  const byFingerprint = new Map()
  for (const entry of valid) {
    const fingerprint = entry.question.statement.toLowerCase()
    const previous = byFingerprint.get(fingerprint)
    if (previous) {
      warnings.push(
        `Question ${entry.line} repeats question ${previous.line}; keeping the later one.`,
      )
    }
    byFingerprint.set(fingerprint, entry)
  }

  const duplicates = valid.length - byFingerprint.size
  const accepted = [...byFingerprint.values()].map((entry) => entry.question)

  const byTopic = new Map()
  for (const question of accepted) {
    const stats = byTopic.get(question.topic) ?? { code: question.topic, true: 0, false: 0 }
    stats[question.answer ? 'true' : 'false']++
    byTopic.set(question.topic, stats)
  }

  if (accepted.length === 0 && errors.length === 0) {
    errors.push('No questions found in that file.')
  }

  // Any topic code used but not described gets its code as its label.
  const usedTopics = [...byTopic.keys()].map((code, index) => ({
    code,
    label: topicLabels.get(code) ?? code,
    sort_order: topicLabels.has(code) ? [...topicLabels.keys()].indexOf(code) : 100 + index,
  }))

  for (const code of topicLabels.keys()) {
    if (!byTopic.has(code)) warnings.push(`Topic "${code}" has no questions in this upload.`)
  }

  const trueCount = accepted.filter((q) => q.answer).length

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    payload: {
      bank: { slug, title, source: String(bank?.source ?? '').trim() || null },
      topics: usedTopics.sort((a, b) => a.sort_order - b.sort_order),
      questions: accepted,
    },
    report: {
      received: questions.length,
      accepted: accepted.length,
      duplicates,
      trueCount,
      falseCount: accepted.length - trueCount,
      topics: [...byTopic.values()].sort((a, b) => a.code.localeCompare(b.code)),
    },
  }
}
