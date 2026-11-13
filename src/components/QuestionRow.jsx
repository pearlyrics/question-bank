const FlagIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current stroke-2">
    <path d="M5 21V4h11l-2 4 2 4H5" />
  </svg>
)

export default function QuestionRow({ question, row, number, topicLabel, onAnswer, onFlag, showCleared }) {
  const choice = row?.active_choice
  const answered = choice === true || choice === false
  const correct = answered && choice === question.answer
  const flagged = row?.flagged === true
  const misses = row?.wrong_count ?? 0

  const buttonTone = (value) => {
    if (!answered) return 'border-rule-strong hover:border-accent'
    if (choice === value) {
      return correct
        ? 'bg-yes-soft border-yes text-yes'
        : 'bg-no-soft border-no text-no'
    }
    if (question.answer === value) return 'border-yes border-dashed'
    return 'border-rule-strong'
  }

  return (
    <div className="exam-grid border-b border-rule last:border-b-0">
      <div className="px-2.5 pt-3 pb-0 text-right font-mono text-sm text-muted tabular-nums sm:py-3">
        {number}
      </div>

      <div className="min-w-0 px-1 py-3 sm:border-l sm:border-rule sm:px-3">
        <span className="text-[11px] uppercase tracking-[0.06em] text-muted">{topicLabel}</span>
        {misses > 0 && (
          <span className="ml-1.5 font-mono text-[11px] text-no">missed {misses}×</span>
        )}
        <p className="m-0 text-[16.5px]">{question.statement}</p>

        {answered && (
          <div
            className={`feedback-in mt-2.5 rounded-r border-l-4 px-3 py-2.5 text-[15px] ${
              correct ? 'border-yes bg-yes-soft' : 'border-no bg-no-soft'
            }`}
          >
            <span className={`font-bold ${correct ? 'text-yes' : 'text-no'}`}>
              {correct ? 'Correct.' : 'Wrong.'}
            </span>{' '}
            The statement is <b>{question.answer ? 'TRUE' : 'FALSE'}</b>.
            {showCleared && correct ? ' Removed from your mistakes.' : ''}
            <br />
            {question.explanation.replace(/^(True|False)\.\s*/, '')}
            {question.page ? (
              <span className="ml-1.5 font-mono text-xs whitespace-nowrap text-muted">
                p. {question.page}
              </span>
            ) : null}
          </div>
        )}
      </div>

      <div className="col-span-2 flex items-center gap-2 border-t border-dashed border-rule px-3 py-2 sm:col-span-1 sm:flex-col sm:items-stretch sm:gap-1.5 sm:border-t-0 sm:border-l sm:border-solid sm:p-2.5">
        <div className="grid flex-1 grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={answered}
            onClick={() => onAnswer(question.id, true)}
            aria-label={`True: ${question.statement}`}
            className={`rounded border-[1.5px] bg-sheet px-1.5 py-2 text-sm font-bold text-ink disabled:cursor-default ${buttonTone(true)}`}
          >
            YES
          </button>
          <button
            type="button"
            disabled={answered}
            onClick={() => onAnswer(question.id, false)}
            aria-label={`False: ${question.statement}`}
            className={`rounded border-[1.5px] bg-sheet px-1.5 py-2 text-sm font-bold text-ink disabled:cursor-default ${buttonTone(false)}`}
          >
            NO
          </button>
        </div>
        <button
          type="button"
          aria-pressed={flagged}
          onClick={() => onFlag(question.id)}
          className={`flex items-center justify-center gap-1.5 rounded border px-1.5 py-1 text-[13px] ${
            flagged
              ? 'border-flag bg-flag-soft text-flag [&_svg]:fill-current'
              : 'border-transparent text-muted hover:border-rule'
          }`}
        >
          <FlagIcon />
          <span>{flagged ? 'Flagged' : 'Flag'}</span>
        </button>
      </div>
    </div>
  )
}
