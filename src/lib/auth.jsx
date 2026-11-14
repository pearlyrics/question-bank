import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { authEmailDomain, isConfigured, supabase } from './supabase.js'
import { emailFor, normalizeUsername, passwordFor, usernameError } from './username.js'
import { fetchProfile } from './data.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(isConfigured)

  useEffect(() => {
    if (!isConfigured) return
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session ?? null)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) {
      setProfile(null)
      return
    }
    let active = true
    fetchProfile(userId)
      .then((row) => {
        if (active) setProfile(row)
      })
      .catch(() => {
        // The username also lives in user metadata, so a failed profile read
        // degrades to a usable session rather than a dead end.
        if (active) {
          setProfile({ id: userId, username: session.user.user_metadata?.username ?? 'you', is_admin: false })
        }
      })
    return () => {
      active = false
    }
  }, [session])

  const value = useMemo(() => {
    // One field for most people: the password is derived from the username and
    // the account is created on first use.
    //
    // An account can also have a password of its own — set outside the app, for
    // an admin. Then the derived password fails, the sign-up that follows
    // reports the address as taken, and we ask for the real one. Nothing here
    // reveals which accounts those are: the prompt appears only after a
    // password that should have worked didn't.
    async function enter(rawUsername, typedPassword) {
      const username = normalizeUsername(rawUsername)
      const problem = usernameError(username)
      if (problem) throw new Error(problem)

      const email = emailFor(username, authEmailDomain)
      const password = typedPassword || passwordFor(username)

      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (!error) return { signedIn: true }

      if (!/invalid login credentials/i.test(error.message)) {
        throw new Error(error.message)
      }
      if (typedPassword) {
        throw new Error('That password doesn’t match.')
      }

      // The derived password didn't work: either there is no such account yet,
      // or it has a password of its own.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      })

      if (signUpError) {
        if (/already registered|already exists/i.test(signUpError.message)) {
          return { needsPassword: true }
        }
        throw new Error(signUpError.message)
      }

      if (!data.session) {
        // Supabase can answer a sign-up for an existing address with a user
        // carrying no identities, rather than an error.
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          return { needsPassword: true }
        }
        throw new Error(
          'Account created, but it needs email confirmation turned off in Supabase ' +
            '(Authentication → Sign In / Providers → Confirm email).',
        )
      }

      return { signedIn: true }
    }

    async function signOut() {
      await supabase.auth.signOut()
    }

    return { session, profile, loading, isConfigured, enter, signOut }
  }, [session, profile, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
