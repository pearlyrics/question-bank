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
    // One field, one button: sign in, and create the account on first use.
    async function enter(rawUsername) {
      const username = normalizeUsername(rawUsername)
      const problem = usernameError(username)
      if (problem) throw new Error(problem)

      const credentials = {
        email: emailFor(username, authEmailDomain),
        password: passwordFor(username),
      }

      const { error } = await supabase.auth.signInWithPassword(credentials)
      if (!error) return { created: false }

      if (!/invalid login credentials/i.test(error.message)) {
        throw new Error(error.message)
      }

      // No account yet, so make one.
      const { data, error: signUpError } = await supabase.auth.signUp({
        ...credentials,
        options: { data: { username } },
      })
      if (signUpError) throw new Error(signUpError.message)
      if (!data.session) {
        throw new Error(
          'Account created, but it needs email confirmation turned off in Supabase ' +
            '(Authentication → Sign In / Providers → Confirm email).',
        )
      }
      return { created: true }
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
