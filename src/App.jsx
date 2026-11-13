import { useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import { StudyProvider, useStudy } from './lib/studyStore.jsx'
import { isConfigured } from './lib/supabase.js'
import LoginView from './components/LoginView.jsx'
import StudyView from './components/StudyView.jsx'
import AdminImport from './components/AdminImport.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'

function Setup() {
  return (
    <main className="gutter mx-auto max-w-[620px] py-16">
      <h1 className="m-0 font-display text-3xl font-semibold">Almost there</h1>
      <p className="mt-2 text-sm text-muted">
        Add your Supabase project URL and anon key to <code className="font-mono">.env</code>, then
        restart the dev server:
      </p>
      <pre className="sheet-card mt-3 overflow-x-auto p-3 font-mono text-[13px]">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
      </pre>
    </main>
  )
}

function Shell() {
  const { profile, signOut } = useAuth()
  const { afterImport } = useStudy()
  const [tab, setTab] = useState('study')
  const isAdmin = profile?.is_admin === true

  return (
    <>
      <div className="border-b border-rule bg-sheet">
        <div className="gutter mx-auto flex w-full max-w-[960px] flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2">
          <div className="flex items-center gap-2">
            {isAdmin &&
              [
                ['study', 'Study'],
                ['import', 'Import'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  aria-current={tab === key}
                  className={`touch rounded px-2.5 py-1.5 text-sm font-bold ${
                    tab === key ? 'bg-accent-soft text-accent' : 'text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted sm:gap-3">
            <ThemeToggle />
            <span className="font-mono">{profile?.username ?? '…'}</span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="touch rounded border border-rule-strong px-2 py-1 font-bold text-ink"
            >
              Log out
            </button>
          </div>
        </div>
      </div>

      {tab === 'import' && isAdmin ? (
        <AdminImport
          onImported={(importedBankId) => {
            setTab('study')
            void afterImport(importedBankId)
          }}
        />
      ) : (
        <StudyView />
      )}
    </>
  )
}

function Gate() {
  const { session, loading } = useAuth()
  if (loading) return <p className="px-4 py-16 text-center text-muted">Loading…</p>
  if (!session) return <LoginView />
  return (
    <StudyProvider>
      <Shell />
    </StudyProvider>
  )
}

export default function App() {
  if (!isConfigured) return <Setup />
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
