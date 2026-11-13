import { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'

export default function LoginView() {
  const { enter } = useAuth()
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await enter(username)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[460px] flex-col justify-center gap-5 px-4 py-12">
      <div>
        <h1 className="m-0 font-display text-[clamp(26px,5vw,34px)] leading-tight font-semibold text-balance">
          Question Bank
        </h1>
        <p className="mt-1 text-sm text-muted">
          Your answers, mistakes and flags follow your username on any device.
        </p>
      </div>

      <form className="sheet-card flex flex-col gap-3 p-4" onSubmit={submit}>
        <label htmlFor="username" className="font-mono text-[13px] text-muted">
          Username
        </label>
        <input
          id="username"
          name="username"
          value={username}
          autoComplete="username"
          autoCapitalize="none"
          autoFocus
          spellCheck={false}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="e.g. hamza"
          className="rounded border border-rule-strong bg-sheet px-2.5 py-2 font-mono text-[15px] text-ink"
        />
        {message && (
          <p className="m-0 rounded-r border-l-4 border-no bg-no-soft px-3 py-2 text-sm">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !username.trim()}
          className="rounded border-[1.5px] border-accent bg-accent px-3 py-2 text-sm font-bold text-sheet disabled:opacity-60"
        >
          {busy ? 'Opening…' : 'Start studying'}
        </button>
      </form>
    </main>
  )
}
