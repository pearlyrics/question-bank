#!/usr/bin/env node
// Turns the original single-file bank into an import payload.
//
//   node scripts/convert-legacy.mjs muscle-bank-2.html data/muscle-tissue-ii.json
//
// The HTML holds `const Q = [...]` (topic, answer, statement, explanation, page)
// and `const TOPICS = {...}`, so both are lifted out and evaluated as data.

import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const [, , inputPath = 'muscle-bank-2.html', outputPath = 'data/legacy-bank.json'] = process.argv

function extract(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  if (start === -1) throw new Error(`Could not find ${startMarker} in the file`)
  const end = source.indexOf(endMarker, start)
  if (end === -1) throw new Error(`Could not find the end of ${startMarker}`)
  return source.slice(start + startMarker.length, end)
}

const html = readFileSync(inputPath, 'utf8')

const questionsLiteral = extract(html, 'const Q = [', '\n];')
const topicsLiteral = extract(html, 'const TOPICS={', '};')
const titleMatch = html.match(/<title>([^<]+)<\/title>/)
const sourceMatch = html.match(/<p class="sub">([^<]*)</)

// eslint-disable-next-line no-new-func
const questions = new Function(`return [${questionsLiteral}]`)()
// eslint-disable-next-line no-new-func
const topicMap = new Function(`return {${topicsLiteral}}`)()

const title = titleMatch ? titleMatch[1].trim() : basename(inputPath)
const slug = title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 60)

const source = sourceMatch
  ? sourceMatch[1].split('·').slice(0, 2).join('·').trim()
  : null

const payload = {
  bank: { slug, title, source },
  topics: Object.entries(topicMap).map(([code, label], index) => ({
    code,
    label,
    sort_order: index,
  })),
  questions: questions.map(([topic, answer, statement, explanation, page]) => ({
    topic,
    answer: answer === 1 || answer === true,
    statement: String(statement).trim(),
    explanation: String(explanation).trim(),
    page: Number.isFinite(page) ? page : null,
  })),
}

writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`)

const trueCount = payload.questions.filter((question) => question.answer).length
console.log(`Wrote ${outputPath}`)
console.log(`  bank      ${payload.bank.slug} — ${payload.bank.title}`)
console.log(`  topics    ${payload.topics.length}`)
console.log(`  questions ${payload.questions.length} (${trueCount} true / ${payload.questions.length - trueCount} false)`)
