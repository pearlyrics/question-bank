const COPY = {
  idle: ['Progress saved to your account', 'text-yes'],
  saving: ['Saving…', 'text-muted'],
  error: ['Can’t reach your account. Your answers are kept here and will send themselves.', 'text-flag'],
}

export default function SyncBadge({ state, pending }) {
  const [label, tone] = COPY[state] ?? COPY.idle
  return (
    <span className={`font-bold ${tone}`}>
      {label}
      {pending > 0 && state !== 'idle' ? ` (${pending} waiting)` : ''}
    </span>
  )
}
