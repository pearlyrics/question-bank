import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { parseRoute } from './routes.js'

// A router this small doesn't need a dependency: four routes, no nesting, no
// loaders. Real <a href> elements so middle-click and open-in-new-tab work.

const RouterContext = createContext(null)

export function RouterProvider({ children }) {
  const [path, setPath] = useState(() => globalThis.location?.pathname ?? '/')

  useEffect(() => {
    // Browsers restore the previous scroll position on reload. The top bar
    // isn't sticky, so a restored offset left it above the viewport with no
    // obvious way back to it. Every page here starts at the top instead.
    if ('scrollRestoration' in globalThis.history) {
      globalThis.history.scrollRestoration = 'manual'
    }
    globalThis.scrollTo?.({ top: 0 })

    const onPopState = () => setPath(globalThis.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((to, { replace = false } = {}) => {
    if (to === globalThis.location.pathname) return
    globalThis.history[replace ? 'replaceState' : 'pushState']({}, '', to)
    setPath(to)
    globalThis.scrollTo?.({ top: 0 })
  }, [])

  const value = useMemo(() => ({ route: parseRoute(path), path, navigate }), [path, navigate])
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function useRouter() {
  const value = useContext(RouterContext)
  if (!value) throw new Error('useRouter must be used inside RouterProvider')
  return value
}

export function Link({ href, children, className, ...rest }) {
  const { navigate } = useRouter()
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        // Leave modified clicks to the browser.
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return
        }
        if (event.button !== 0) return
        event.preventDefault()
        navigate(href)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}
