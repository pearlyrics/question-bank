import { describe, expect, it } from 'vitest'
import { buildImport, coerceAnswer, normalizeStatement, parseUpload } from '../src/lib/importQuestions.js'

const good = {
  bank: { slug: 'w05-nerve', title: 'Week 5 · Nerve tissue', source: 'Junqueira 15e' },
  topics: [
    { code: 'OV', label: 'Overview' },
    { code: 'CT', label: 'Connective tissue' },
  ],
  questions: [
    { topic: 'OV', answer: true, statement: 'Neurons signal.', explanation: 'True. They do.', page: 221 },
    { topic: 'CT', answer: false, statement: 'Collagen is a lipid.', explanation: 'False. It is a protein.', page: 222 },
  ],
}

describe('coerceAnswer', () => {
  it('accepts the shapes questions actually arrive in', () => {
    for (const value of [true, 1, '1', 'true', 'TRUE', 't', 'yes']) {
      expect(coerceAnswer(value)).toBe(true)
    }
    for (const value of [false, 0, '0', 'false', 'F', 'no']) {
      expect(coerceAnswer(value)).toBe(false)
    }
  })

  it('rejects anything ambiguous', () => {
    for (const value of [null, undefined, '', 'maybe', 2, {}]) {
      expect(coerceAnswer(value)).toBeNull()
    }
  })
})

describe('normalizeStatement', () => {
  it('collapses whitespace so near-identical pastes dedupe', () => {
    expect(normalizeStatement('  Neurons   signal.\n')).toBe('Neurons signal.')
  })
})

describe('parseUpload', () => {
  it('reads the full object form', () => {
    const parsed = parseUpload(JSON.stringify(good))
    expect(parsed.ok).toBe(true)
    expect(parsed.questions).toHaveLength(2)
    expect(parsed.bank.slug).toBe('w05-nerve')
  })

  it('reads the legacy array form from the original HTML', () => {
    const legacy = [
      ['OV', 1, 'Contractility is universal.', 'True. All cells have actin.', 193],
      ['OV', 0, 'Muscle alone has actin.', 'False. Every cell does.', 193],
    ]
    const parsed = parseUpload(JSON.stringify(legacy))
    expect(parsed.ok).toBe(true)
    expect(parsed.questions[0]).toEqual({
      topic: 'OV',
      answer: true,
      statement: 'Contractility is universal.',
      explanation: 'True. All cells have actin.',
      page: 193,
    })
    expect(parsed.questions[1].answer).toBe(false)
  })

  it('explains bad JSON instead of throwing', () => {
    const parsed = parseUpload('{ nope')
    expect(parsed.ok).toBe(false)
    expect(parsed.errors[0]).toMatch(/isn't valid JSON/i)
  })

  it('rejects a shape with no questions array', () => {
    expect(parseUpload('{"bank":{}}').ok).toBe(false)
  })
})

describe('buildImport', () => {
  it('accepts a clean batch and reports its balance', () => {
    const parsed = parseUpload(JSON.stringify(good))
    const built = buildImport(parsed)

    expect(built.ok).toBe(true)
    expect(built.errors).toEqual([])
    expect(built.report).toMatchObject({ received: 2, accepted: 2, trueCount: 1, falseCount: 1, duplicates: 0 })
    expect(built.payload.topics.map((t) => t.code)).toEqual(['OV', 'CT'])
  })

  it('requires a usable bank slug', () => {
    const parsed = parseUpload(JSON.stringify({ ...good, bank: { slug: 'Not A Slug' } }))
    expect(buildImport(parsed).errors.join(' ')).toMatch(/slug/i)
  })

  it('names the line of every bad question', () => {
    const parsed = parseUpload(
      JSON.stringify({
        ...good,
        questions: [
          { topic: 'OV', answer: true, statement: '', explanation: 'x' },
          { topic: 'OV', answer: 'maybe', statement: 'A thing.', explanation: 'x' },
          { topic: '', answer: true, statement: 'Another thing.', explanation: 'x' },
          { topic: 'OV', answer: true, statement: 'Third thing.', explanation: '' },
        ],
      }),
    )
    const built = buildImport(parsed)
    expect(built.ok).toBe(false)
    expect(built.errors).toHaveLength(4)
    expect(built.errors[0]).toMatch(/^Question 1: statement/)
    expect(built.errors[1]).toMatch(/^Question 2: answer/)
    expect(built.errors[2]).toMatch(/^Question 3: topic/)
    expect(built.errors[3]).toMatch(/^Question 4: explanation/)
  })

  it('keeps the later copy of a duplicated statement and says so', () => {
    const parsed = parseUpload(
      JSON.stringify({
        ...good,
        questions: [
          { topic: 'OV', answer: true, statement: 'Neurons signal.', explanation: 'First take.' },
          { topic: 'OV', answer: true, statement: 'neurons   signal.', explanation: 'Better take.' },
        ],
      }),
    )
    const built = buildImport(parsed)

    expect(built.ok).toBe(true)
    expect(built.report.accepted).toBe(1)
    expect(built.report.duplicates).toBe(1)
    expect(built.payload.questions[0].explanation).toBe('Better take.')
    expect(built.warnings[0]).toMatch(/repeats question 1/)
    // Topic tallies follow the deduped list, not the raw paste.
    expect(built.report.topics).toEqual([{ code: 'OV', true: 1, false: 0 }])
  })

  it('invents a topic entry for a code used but not described', () => {
    const parsed = parseUpload(
      JSON.stringify({
        bank: { slug: 'w06-bone' },
        questions: [{ topic: 'XX', answer: true, statement: 'Bone is hard.', explanation: 'True.' }],
      }),
    )
    const built = buildImport(parsed)
    expect(built.ok).toBe(true)
    expect(built.payload.topics).toEqual([{ code: 'XX', label: 'XX', sort_order: 100 }])
  })

  it('warns about a described topic with no questions', () => {
    const parsed = parseUpload(JSON.stringify({ ...good, questions: [good.questions[0]] }))
    const built = buildImport(parsed)
    expect(built.warnings.join(' ')).toMatch(/"CT" has no questions/)
  })

  it('refuses an empty batch', () => {
    const parsed = parseUpload(JSON.stringify({ bank: { slug: 'w07' }, questions: [] }))
    expect(buildImport(parsed).ok).toBe(false)
  })
})
