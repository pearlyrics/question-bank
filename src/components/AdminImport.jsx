import { useState } from 'react'
import { buildImport, parseUpload } from '../lib/importQuestions.js'
import { importQuestions } from '../lib/data.js'
import { Link } from '../lib/router.jsx'
import ChapterOrder from './ChapterOrder.jsx'
import { CHAPTERS_PATH } from '../lib/routes.js'

const EXAMPLE = `{
  "bank": {
    "slug": "w05-nerve-tissue",
    "title": "Week 5 · Nerve tissue",
    "source": "Junqueira's Basic Histology, 15th ed. · Ch. 11"
  },
  "topics": [
    { "code": "OV", "label": "Overview & terminology" }
  ],
  "questions": [
    {
      "topic": "OV",
      "answer": true,
      "statement": "Neurons are the functional unit of nervous tissue.",
      "explanation": "True. Neurons receive, process and transmit signals.",
      "page": 221
    }
  ]
}`

export default function AdminImport({ onImported, onReordered }) {
  const [text, setText] = useState('')
  const [bankFields, setBankFields] = useState({ slug: '', title: '', source: '' })
  const [checked, setChecked] = useState(null)
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState(null)
  const [failure, setFailure] = useState(null)

  function check(raw, fields) {
    setResult(null)
    setFailure(null)
    const parsed = parseUpload(raw)
    if (!parsed.ok) {
      setChecked({ ok: false, errors: parsed.errors, warnings: [], report: null })
      return
    }
    // Typed fields win over whatever the file carries, so a paste without a
    // bank block still imports.
    const bank = {
      slug: fields.slug || parsed.bank.slug || '',
      title: fields.title || parsed.bank.title || '',
      source: fields.source || parsed.bank.source || '',
    }
    setBankFields(bank)
    setChecked(buildImport({ bank, topics: parsed.topics, questions: parsed.questions }))
  }

  async function readFile(file) {
    const raw = await file.text()
    setText(raw)
    check(raw, bankFields)
  }

  async function commit() {
    if (!checked?.ok) return
    setCommitting(true)
    setFailure(null)
    try {
      const report = await importQuestions(checked.payload)
      setResult(report)
      setChecked(null)
      setText('')
      onImported?.(report.bank_id)
    } catch (error) {
      setFailure(error.message)
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="gutter mx-auto flex w-full max-w-[960px] flex-col gap-4 pt-6 pb-16">
      <Link href={CHAPTERS_PATH} className="font-mono text-[13px] font-bold text-accent">
        ← All chapters
      </Link>

      <header>
        <h1 className="m-0 font-display text-[clamp(24px,4vw,32px)] leading-tight font-semibold">
          Import questions
        </h1>
        <p className="mt-1 text-sm text-muted">
          Paste a batch, check it, then commit. Re-uploading a statement updates it instead of
          duplicating it, so running the same file twice is safe.
        </p>
      </header>

      <ChapterOrder onReordered={onReordered} />

      <h2 className="mt-2 font-display text-lg font-semibold">Add questions</h2>

      <div className="sheet-card grid gap-3 p-4 sm:grid-cols-3">
        {[
          ['slug', 'Bank slug', 'w05-nerve-tissue'],
          ['title', 'Bank title', 'Week 5 · Nerve tissue'],
          ['source', 'Source (optional)', 'Junqueira 15e · Ch. 11'],
        ].map(([field, label, placeholder]) => (
          <label key={field} className="flex flex-col gap-1 text-[13px] text-muted">
            {label}
            <input
              value={bankFields[field]}
              placeholder={placeholder}
              onChange={(event) => {
                const next = { ...bankFields, [field]: event.target.value }
                setBankFields(next)
                if (text.trim()) check(text, next)
              }}
              className="touch rounded border border-rule-strong bg-sheet px-2.5 py-2 font-mono text-[16px] text-ink"
            />
          </label>
        ))}
      </div>

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          const file = event.dataTransfer.files?.[0]
          if (file) void readFile(file)
        }}
        className="sheet-card flex flex-col gap-3 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="payload" className="font-mono text-[13px] text-muted">
            Questions JSON — paste, or drop a .json file here
          </label>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void readFile(file)
            }}
            className="text-[13px] text-muted"
          />
        </div>

        <textarea
          id="payload"
          value={text}
          spellCheck={false}
          onChange={(event) => setText(event.target.value)}
          placeholder={EXAMPLE}
          rows={14}
          className="w-full resize-y rounded border border-rule-strong bg-sheet px-3 py-2.5 font-mono text-[13px] leading-relaxed text-ink"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => check(text, bankFields)}
            disabled={!text.trim()}
            className="touch flex-1 rounded border-[1.5px] border-accent bg-sheet px-3 py-2 text-sm font-bold text-accent disabled:opacity-50 sm:flex-none"
          >
            Check this batch
          </button>
          <button
            type="button"
            onClick={() => void commit()}
            disabled={!checked?.ok || committing}
            className="touch flex-1 rounded border-[1.5px] border-accent bg-accent px-3 py-2 text-sm font-bold text-sheet disabled:opacity-50 sm:flex-none"
          >
            {committing ? 'Importing…' : 'Import to the bank'}
          </button>
        </div>
      </div>

      {checked && (
        <div className="sheet-card flex flex-col gap-3 p-4">
          <h2 className="m-0 font-display text-lg font-semibold">
            {checked.ok ? 'Ready to import' : 'Fix these first'}
          </h2>

          {checked.errors.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 rounded-r border-l-4 border-no bg-no-soft px-3 py-2 text-sm">
              {checked.errors.slice(0, 20).map((message) => (
                <li key={message}>{message}</li>
              ))}
              {checked.errors.length > 20 && (
                <li className="text-muted">…and {checked.errors.length - 20} more.</li>
              )}
            </ul>
          )}

          {checked.warnings.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 rounded-r border-l-4 border-flag bg-flag-soft px-3 py-2 text-sm">
              {checked.warnings.slice(0, 10).map((message) => (
                <li key={message}>{message}</li>
              ))}
              {checked.warnings.length > 10 && (
                <li className="text-muted">…and {checked.warnings.length - 10} more.</li>
              )}
            </ul>
          )}

          {checked.report && (
            <>
              <div className="flex flex-wrap gap-2">
                <span className="stat-chip">
                  Accepted <b className="font-medium text-accent">{checked.report.accepted}</b>/
                  {checked.report.received}
                </span>
                <span className="stat-chip">
                  True <b className="font-medium text-yes">{checked.report.trueCount}</b>
                </span>
                <span className="stat-chip">
                  False <b className="font-medium text-no">{checked.report.falseCount}</b>
                </span>
                <span className="stat-chip">
                  Duplicates <b className="font-medium text-flag">{checked.report.duplicates}</b>
                </span>
                <span className="stat-chip">
                  Topics <b className="font-medium text-accent">{checked.report.topics.length}</b>
                </span>
              </div>

              <div className="-mx-1 overflow-x-auto px-1">
                <table className="w-full min-w-[260px] border-collapse text-left font-mono text-[13px] tabular-nums">
                <thead className="text-muted">
                  <tr className="border-b border-rule">
                    <th className="py-1.5 pr-3 font-bold">Topic</th>
                    <th className="py-1.5 pr-3 font-bold">True</th>
                    <th className="py-1.5 pr-3 font-bold">False</th>
                  </tr>
                </thead>
                <tbody>
                  {checked.report.topics.map((topic) => (
                    <tr key={topic.code} className="border-b border-rule last:border-b-0">
                      <td className="py-1.5 pr-3">{topic.code}</td>
                      <td className="py-1.5 pr-3 text-yes">{topic.true}</td>
                      <td className="py-1.5 pr-3 text-no">{topic.false}</td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {failure && (
        <p className="m-0 rounded-r border-l-4 border-no bg-no-soft px-3 py-2 text-sm">{failure}</p>
      )}

      {result && (
        <div className="sheet-card flex flex-col gap-2 p-4">
          <h2 className="m-0 font-display text-lg font-semibold">
            Imported into {result.bank_title}
          </h2>
          <p className="m-0 text-[13px] text-muted">
            Now showing in Study — pick it any time from the Chapter menu.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="stat-chip">
              Added <b className="font-medium text-yes">{result.added}</b>
            </span>
            <span className="stat-chip">
              Updated <b className="font-medium text-accent">{result.updated}</b>
            </span>
            <span className="stat-chip">
              Bank total <b className="font-medium text-accent">{result.total_in_bank}</b>
            </span>
            <span className="stat-chip">
              True/False{' '}
              <b className="font-medium text-accent">
                {result.true_count}/{result.false_count}
              </b>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
