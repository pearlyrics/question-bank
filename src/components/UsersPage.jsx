import { useEffect, useState } from 'react'
import { adminListUsers, adminUserProgress } from '../lib/data.js'
import { Link } from '../lib/router.jsx'
import { CHAPTERS_PATH } from '../lib/routes.js'

function pct(correct, seen) {
  return seen > 0 ? `${Math.round((correct / seen) * 100)}%` : '–'
}

// One person's chapters, loaded when their name is opened.
function UserProgress({ userId }) {
  const [chapters, setChapters] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    setChapters(null)
    setError(null)
    adminUserProgress(userId)
      .then((rows) => active && setChapters(rows ?? []))
      .catch((loadError) => active && setError(loadError.message))
    return () => {
      active = false
    }
  }, [userId])

  if (error) {
    return <p className="m-0 px-3 py-2 text-sm text-no sm:px-4">Couldn’t load progress: {error}</p>
  }
  if (!chapters) return <p className="m-0 px-3 py-2 text-sm text-muted sm:px-4">Loading…</p>
  if (chapters.length === 0) {
    return <p className="m-0 px-3 py-2 text-sm text-muted sm:px-4">No chapters yet.</p>
  }

  return (
    <div className="overflow-x-auto px-3 pb-3 sm:px-4">
      <table className="w-full min-w-[460px] border-collapse text-left font-mono text-[13px] tabular-nums">
        <thead className="text-muted">
          <tr className="border-b border-rule">
            <th className="py-1.5 pr-3 font-bold">Chapter</th>
            <th className="py-1.5 pr-3 font-bold">Seen</th>
            <th className="py-1.5 pr-3 font-bold">Score</th>
            <th className="py-1.5 pr-3 font-bold">Mistakes</th>
            <th className="py-1.5 font-bold">Flagged</th>
          </tr>
        </thead>
        <tbody>
          {chapters.map((chapter) => (
            <tr key={chapter.bank_id} className="border-b border-rule last:border-b-0">
              <td className="py-1.5 pr-3 font-body">{chapter.title}</td>
              <td className="py-1.5 pr-3">
                {chapter.seen}/{chapter.total}
              </td>
              <td className="py-1.5 pr-3 text-accent">{pct(chapter.correct, chapter.seen)}</td>
              <td className="py-1.5 pr-3 text-no">{chapter.mistakes}</td>
              <td className="py-1.5 text-flag">{chapter.flagged}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function UsersPage() {
  const [users, setUsers] = useState(null)
  const [error, setError] = useState(null)
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    let active = true
    adminListUsers()
      .then((rows) => active && setUsers(rows ?? []))
      .catch((loadError) => active && setError(loadError.message))
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="gutter mx-auto flex w-full max-w-[960px] flex-col gap-4 pt-6 pb-16">
      <Link href={CHAPTERS_PATH} className="font-mono text-[13px] font-bold text-accent">
        ← All chapters
      </Link>

      <header>
        <h1 className="m-0 font-display text-[clamp(24px,4vw,32px)] leading-tight font-semibold">
          Users
        </h1>
        <p className="mt-1 text-sm text-muted">
          Everyone with an account. Open a name to see their progress chapter by chapter.
        </p>
      </header>

      {error && (
        <p className="m-0 rounded-r border-l-4 border-no bg-no-soft px-3 py-2 text-sm">{error}</p>
      )}

      {users === null && !error && <p className="text-muted">Loading users…</p>}

      {users?.length === 0 && (
        <div className="sheet-card p-6 text-center">
          <strong className="mb-1.5 block text-lg">No accounts yet</strong>
        </div>
      )}

      {users?.length > 0 && (
        <ul className="sheet-card m-0 list-none p-0">
          {users.map((user) => {
            const open = openId === user.user_id
            return (
              <li key={user.user_id} className="border-b border-rule last:border-b-0">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : user.user_id)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-3 text-left hover:bg-accent-soft sm:px-4"
                >
                  <span className="font-mono text-[15px] font-bold text-ink">{user.username}</span>
                  {user.is_admin && (
                    <span className="rounded-[10px] bg-accent-soft px-1.5 py-px font-mono text-[11px] text-accent">
                      admin
                    </span>
                  )}
                  <span className="ml-auto flex flex-wrap gap-1.5">
                    <span className="stat-chip">
                      Answered <b className="font-medium text-accent">{user.answered}</b>
                    </span>
                    <span className="stat-chip">
                      Mistakes <b className="font-medium text-no">{user.mistakes}</b>
                    </span>
                    <span className="stat-chip">
                      Flagged <b className="font-medium text-flag">{user.flagged}</b>
                    </span>
                  </span>
                </button>

                {open && <UserProgress userId={user.user_id} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
