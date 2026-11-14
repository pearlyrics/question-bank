import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import ThemeToggle from './ThemeToggle.jsx'

export default function LoginView() {
  const { enter } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const passwordRef = useRef(null)

  // When the prompt appears, put the cursor in it.
  useEffect(() => {
    if (needsPassword) passwordRef.current?.focus()
  }, [needsPassword])

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const result = await enter(username, needsPassword ? password : undefined)
      if (result?.needsPassword) {
        setNeedsPassword(true)
        setMessage(null)
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="gutter mx-auto flex min-h-dvh w-full max-w-[460px] flex-col justify-center gap-5 py-12">
      <div className="flex justify-end">
        <ThemeToggle />
      </div>
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
          onChange={(event) => {
            setUsername(event.target.value)
            // A different name may not need a password at all.
            if (needsPassword) {
              setNeedsPassword(false)
              setPassword('')
            }
          }}
          placeholder="e.g. hamza"
          className="touch rounded border border-rule-strong bg-sheet px-2.5 py-2 font-mono text-[16px] text-ink"
        />

        {needsPassword ? (
          <>
            <label htmlFor="password" className="font-mono text-[13px] text-muted">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              ref={passwordRef}
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              className="touch rounded border border-rule-strong bg-sheet px-2.5 py-2 font-mono text-[16px] text-ink"
            />
            <p className="m-0 text-[13px] text-muted">
              This account has a password of its own.
            </p>
          </>
        ) : (
          <p className="m-0 text-[13px] text-muted">
            That’s the whole login. First time with a name creates it.
          </p>
        )}

        {message && (
          <p className="m-0 rounded-r border-l-4 border-no bg-no-soft px-3 py-2 text-sm">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !username.trim() || (needsPassword && !password)}
          className="touch rounded border-[1.5px] border-accent bg-accent px-3 py-2 text-sm font-bold text-sheet disabled:opacity-60"
        >
          {busy ? 'Opening…' : 'Start studying'}
        </button>
      </form>
    </main>
  )
}
