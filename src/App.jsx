import { useEffect } from 'react'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import { StudyProvider, useStudy } from './lib/studyStore.jsx'
import { isConfigured } from './lib/supabase.js'
import { Link, RouterProvider, useRouter } from './lib/router.jsx'
import { CHAPTERS_PATH, IMPORT_PATH, chapterPath } from './lib/routes.js'
import LoginView from './components/LoginView.jsx'
import StudyView from './components/StudyView.jsx'
import ChaptersPage from './components/ChaptersPage.jsx'
import AdminImport from './components/AdminImport.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'

function Setup() {
  return (
    <main className="gutter mx-auto max-w-[620px] py-16">
      <h1 className="m-0 font-display text-3xl font-semibold">Almost there</h1>
      <p className="mt-2 text-sm text-muted">
        This build has no Supabase credentials in it. They are read when the app is{' '}
        <em>built</em>, not when it runs, so adding them means building again.
      </p>

      <h2 className="mt-5 mb-1 font-display text-lg font-semibold">Running locally</h2>
      <p className="m-0 text-sm text-muted">
        Put them in <code className="font-mono">.env</code> and restart the dev server:
      </p>
      <pre className="sheet-card mt-2 overflow-x-auto p-3 font-mono text-[13px]">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
      </pre>

      <h2 className="mt-5 mb-1 font-display text-lg font-semibold">Deployed (Vercel, Netlify…)</h2>
      <p className="m-0 text-sm text-muted">
        Add both names in the project&rsquo;s environment variables, make sure they apply to{' '}
        <b>Production</b>, then <b>redeploy</b>. Variables added after a build are not in that
        build.
      </p>
    </main>
  )
}

function TopBar({ isAdmin }) {
  const { signOut } = useAuth()
  const { profile } = useStudy()
  const { route } = useRouter()

  // Chapters is reached by the "All chapters" link on each page, not from here.
  const links = isAdmin ? [[IMPORT_PATH, 'Import']] : []

  return (
    <div className="border-b border-rule bg-sheet">
      <div className="gutter mx-auto flex w-full max-w-[960px] flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2">
        <nav className="flex items-center gap-1">
          {links.map(([href, label]) => {
            const current = href === IMPORT_PATH && route.name === 'import'
            return (
              <Link
                key={href}
                href={href}
                aria-current={current ? 'page' : undefined}
                className={`flex h-8 items-center rounded px-2.5 text-sm font-bold ${
                  current ? 'bg-accent-soft text-accent' : 'text-muted'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted sm:gap-3">
          <span className="font-mono">{profile?.username ?? '…'}</span>
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex h-8 items-center rounded border border-rule-strong px-2.5 font-bold text-ink"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}

function NotFound({ title, detail }) {
  return (
    <div className="sheet-card gutter mx-auto my-10 max-w-[600px] p-6 text-center">
      <strong className="mb-1.5 block text-lg">{title}</strong>
      <p className="m-0 text-sm text-muted">{detail}</p>
      <Link
        href={CHAPTERS_PATH}
        className="mt-4 inline-block rounded border-[1.5px] border-accent bg-sheet px-3 py-2 text-sm font-bold text-accent"
      >
        All chapters
      </Link>
    </div>
  )
}

// Resolves /<slug> to a chapter and opens it. Opening is a side effect, so it
// happens after render, never during it.
function ChapterRoute({ slug }) {
  const { openSlug, banksLoaded, banks } = useStudy()
  const known = banks.some((entry) => entry.slug === slug)

  useEffect(() => {
    if (known) openSlug(slug)
  }, [known, slug, openSlug])

  if (!known) {
    if (!banksLoaded) return <p className="px-4 py-10 text-center text-muted">Loading…</p>
    return <NotFound title="No such chapter" detail={`Nothing is published at /${slug}.`} />
  }
  return <StudyView />
}

function Routes() {
  const { route, navigate } = useRouter()
  const { profile } = useStudy()
  const isAdmin = profile?.is_admin === true
  const isHome = route.name === 'home'

  useEffect(() => {
    if (isHome) navigate(CHAPTERS_PATH, { replace: true })
  }, [isHome, navigate])

  if (isHome) return null

  return (
    <>
      <TopBar isAdmin={isAdmin} />
      {route.name === 'chapters' && <ChaptersPage isAdmin={isAdmin} />}
      {route.name === 'chapter' && <ChapterRoute slug={route.slug} />}
      {route.name === 'import' &&
        (isAdmin ? (
          <ImportRoute />
        ) : (
          <NotFound title="Admins only" detail="Importing questions needs an admin account." />
        ))}
      {route.name === 'notFound' && (
        <NotFound title="Page not found" detail="That address doesn’t match anything here." />
      )}
    </>
  )
}

function ImportRoute() {
  const { afterImport, refreshBanks } = useStudy()
  const { navigate } = useRouter()
  return (
    <AdminImport
      onReordered={() => void refreshBanks()}
      onImported={async (importedBankId) => {
        const slug = await afterImport(importedBankId)
        navigate(slug ? chapterPath(slug) : CHAPTERS_PATH)
      }}
    />
  )
}

function Gate() {
  const { session, loading } = useAuth()
  const { path, navigate } = useRouter()
  const signedOut = !loading && !session

  // Signed out, the address bar shouldn't keep showing a page you can't see.
  // Send it back to the root, replacing the entry so Back doesn't return to
  // the protected URL.
  useEffect(() => {
    if (signedOut && path !== '/') navigate('/', { replace: true })
  }, [signedOut, path, navigate])

  if (loading) return <p className="px-4 py-16 text-center text-muted">Loading…</p>
  if (!session) return <LoginView />
  return (
    <StudyProvider>
      <Routes />
    </StudyProvider>
  )
}

export default function App() {
  if (!isConfigured) return <Setup />
  return (
    <AuthProvider>
      <RouterProvider>
        <Gate />
      </RouterProvider>
    </AuthProvider>
  )
}
