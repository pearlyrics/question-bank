import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuth } from './auth.jsx'
import {
  cacheGet,
  cacheKey,
  cacheSet,
  pruneOtherUsers,
  rowsFromArray,
  rowsToArray,
} from './cache.js'
import {
  fetchBanks,
  fetchPrefs,
  fetchQuestions,
  fetchResponses,
  fetchTopics,
  resetBank as resetBankRpc,
  sendOp,
} from './data.js'
import { applyAnswer, applyClearActive, applyFlag, replayOps } from './progress.js'
import { createOpQueue } from './queue.js'
import { DEFAULT_SET_SIZE, clampSetIndex } from './sets.js'
import { DEFAULT_VIEW } from './view.js'

const StudyContext = createContext(null)
const PREFS_DEBOUNCE = 600
const REFETCH_AFTER = 20_000

function newAttemptId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function StudyProvider({ children }) {
  const { session, profile } = useAuth()
  const userId = session?.user?.id ?? null

  // 'idle' until a chapter is opened by the URL.
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [banks, setBanks] = useState([])
  const [banksLoaded, setBanksLoaded] = useState(false)
  const [bankId, setBankId] = useState(null)
  const [questions, setQuestions] = useState([])
  const [topics, setTopics] = useState([])
  const [rows, setRows] = useState(() => new Map())
  const [views, setViews] = useState({})
  const [sync, setSync] = useState({ state: 'idle', pending: 0 })

  const queueRef = useRef(null)
  const prefsTimer = useRef(null)
  const lastFetch = useRef(0)
  const openedBank = useRef(null)
  const latest = useRef({ bankId: null, views: {} })

  latest.current = { bankId, views }

  // ------------------------------------------------------------- the queue
  useEffect(() => {
    if (!userId) {
      queueRef.current = null
      return
    }
    const queue = createOpQueue({
      key: cacheKey('queue', userId),
      storage: localStorage,
      send: (op) => sendOp(op, userId),
      onChange: (state, pending) => setSync({ state, pending }),
    })
    queueRef.current = queue
    void queue.flush()
    return () => {
      // Stop the retry timer so it can't fire against a signed-out user.
      // Anything still queued stays on disk for the next session.
      queue.stop()
      queueRef.current = null
    }
  }, [userId])

  const enqueue = useCallback((op) => {
    queueRef.current?.enqueue(op)
  }, [])

  // ------------------------------------------------------------- loading
  const loadBank = useCallback(
    async (targetBankId, { showLoading } = {}) => {
      if (!userId || !targetBankId) return
      if (showLoading) setStatus('loading')

      const questionsKey = cacheKey('questions', targetBankId)
      const rowsKey = cacheKey('rows', userId, targetBankId)

      const cachedQuestions = cacheGet(questionsKey)
      const cachedRows = cacheGet(rowsKey)
      if (cachedQuestions) {
        setQuestions(cachedQuestions.questions ?? [])
        setTopics(cachedQuestions.topics ?? [])
        setRows(cachedRows ? rowsFromArray(cachedRows) : new Map())
        setStatus('ready')
      }

      try {
        const [freshQuestions, freshTopics, freshRows] = await Promise.all([
          fetchQuestions(targetBankId),
          fetchTopics(targetBankId),
          fetchResponses(targetBankId),
        ])

        // Anything still queued is newer than what the server just returned.
        const pending = queueRef.current?.pendingOps() ?? []
        const merged = replayOps(rowsFromArray(freshRows), pending)

        setQuestions(freshQuestions)
        setTopics(freshTopics)
        setRows(merged)
        setStatus('ready')
        setError(null)
        lastFetch.current = Date.now()

        cacheSet(questionsKey, { questions: freshQuestions, topics: freshTopics })
        cacheSet(rowsKey, rowsToArray(merged))
      } catch (loadError) {
        // Cached content is enough to keep studying; answers keep queueing.
        setStatus(cachedQuestions ? 'ready' : 'error')
        setError(loadError.message)
      }
    },
    [userId],
  )

  // Boot loads only the chapter list and prefs. Which chapter is open is the
  // URL's business, handled by openSlug below.
  useEffect(() => {
    if (!userId) {
      setStatus('idle')
      setBanks([])
      setBanksLoaded(false)
      setQuestions([])
      setRows(new Map())
      openedBank.current = null
      return
    }

    let active = true
    pruneOtherUsers(userId, localStorage)
    const prefsKey = cacheKey('prefs', userId)
    const cachedPrefs = cacheGet(prefsKey)
    if (cachedPrefs) setViews(cachedPrefs.prefs ?? {})
    const cachedBanks = cacheGet(cacheKey('banks'))
    if (cachedBanks) {
      setBanks(cachedBanks)
      setBanksLoaded(true)
    }

    async function boot() {
      try {
        const [bankList, prefs] = await Promise.all([fetchBanks(), fetchPrefs()])
        if (!active) return

        setBanks(bankList)
        setBanksLoaded(true)
        cacheSet(cacheKey('banks'), bankList)

        if (prefs) {
          setViews(prefs.prefs ?? {})
          cacheSet(prefsKey, prefs)
        }
      } catch (bootError) {
        if (!active) return
        setBanksLoaded(Boolean(cachedBanks))
        setError(bootError.message)
      }
    }

    void boot()
    return () => {
      active = false
    }
  }, [userId])

  // --------------------------------------------- multi-device and multi-tab
  useEffect(() => {
    if (!userId || !bankId) return

    function onStorage(event) {
      if (event.key !== cacheKey('rows', userId, bankId)) return
      const next = cacheGet(event.key)
      if (next) setRows(rowsFromArray(next))
    }

    function onFocus() {
      const idle = Date.now() - lastFetch.current > REFETCH_AFTER
      if (!document.hidden && idle && (queueRef.current?.size() ?? 0) === 0) {
        void loadBank(bankId)
      }
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [userId, bankId, loadBank])

  // ------------------------------------------------------------- mutations
  const commitRows = useCallback(
    (updater) => {
      setRows((current) => {
        const next = updater(current)
        if (userId && bankId) cacheSet(cacheKey('rows', userId, bankId), rowsToArray(next))
        return next
      })
    },
    [userId, bankId],
  )

  const answer = useCallback(
    (questionId, choice, viewMode) => {
      const question = questions.find((entry) => entry.id === questionId)
      if (!question) return
      const correct = choice === question.answer
      const attemptId = newAttemptId()
      const at = new Date().toISOString()

      commitRows((current) => {
        const next = new Map(current)
        next.set(
          questionId,
          applyAnswer(current.get(questionId), {
            questionId,
            bankId: question.bank_id,
            choice,
            correct,
            attemptId,
            now: at,
            view: viewMode,
          }),
        )
        return next
      })

      enqueue({
        kind: 'answer',
        question_id: questionId,
        bank_id: question.bank_id,
        choice,
        correct,
        attempt_id: attemptId,
        at,
        view: viewMode,
      })
    },
    [questions, commitRows, enqueue],
  )

  const toggleFlag = useCallback(
    (questionId) => {
      const question = questions.find((entry) => entry.id === questionId)
      if (!question) return
      const flagged = !rows.get(questionId)?.flagged

      commitRows((current) => {
        const next = new Map(current)
        next.set(
          questionId,
          applyFlag(current.get(questionId), { questionId, bankId: question.bank_id, flagged }),
        )
        return next
      })

      enqueue({ kind: 'flag', question_id: questionId, bank_id: question.bank_id, flagged })
    },
    [questions, rows, commitRows, enqueue],
  )

  // Scoped to one section: redoing Mistakes leaves the Exam sheets pass alone.
  const redo = useCallback(
    (questionIds, viewMode) => {
      if (questionIds.length === 0) return
      commitRows((current) => {
        const next = new Map(current)
        for (const id of questionIds) {
          const cleared = applyClearActive(current.get(id), viewMode)
          if (cleared) next.set(id, cleared)
        }
        return next
      })
      enqueue({ kind: 'clear', question_ids: questionIds, view: viewMode })
    },
    [commitRows, enqueue],
  )

  // Prefs are display state, so they are debounced into one write.
  const queuePrefs = useCallback(() => {
    if (prefsTimer.current) clearTimeout(prefsTimer.current)
    prefsTimer.current = setTimeout(() => {
      prefsTimer.current = null
      const snapshot = latest.current
      const payload = { kind: 'prefs', prefs: snapshot.views }
      if (userId) cacheSet(cacheKey('prefs', userId), { prefs: payload.prefs })
      enqueue(payload)
    }, PREFS_DEBOUNCE)
  }, [enqueue, userId])

  // Every per-chapter display setting, set size included, lives in one object.
  const view = useMemo(
    () => ({ ...DEFAULT_VIEW, ...(bankId ? views[bankId] : null) }),
    [views, bankId],
  )

  const updateView = useCallback(
    (patch) => {
      if (!bankId) return
      setViews((current) => {
        const next = {
          ...current,
          [bankId]: { ...DEFAULT_VIEW, ...(current[bankId] ?? {}), ...patch },
        }
        latest.current = { ...latest.current, views: next }
        return next
      })
      queuePrefs()
    },
    [bankId, queuePrefs],
  )

  const changeSetSize = useCallback(
    (size) => {
      if (!bankId) return
      setViews((current) => {
        const existing = { ...DEFAULT_VIEW, ...(current[bankId] ?? {}) }
        const next = {
          ...current,
          [bankId]: {
            ...existing,
            setSize: size,
            // Keep the reader near the same questions after a resize.
            setIndex: clampSetIndex(existing.setIndex, questions.length, size),
            sheetIndex: 0,
          },
        }
        latest.current = { ...latest.current, views: next }
        return next
      })
      queuePrefs()
    },
    [bankId, questions.length, queuePrefs],
  )

  // Opens the chapter named in the URL. Returns false when the slug is
  // unknown, so the page can say so rather than hanging on a spinner.
  const openSlug = useCallback(
    (slug) => {
      const match = banks.find((entry) => entry.slug === slug)
      if (!match) return false
      if (openedBank.current === match.id) return true

      openedBank.current = match.id
      setBankId(match.id)
      latest.current = { ...latest.current, bankId: match.id }
      queuePrefs()
      void loadBank(match.id, { showLoading: true })
      return true
    },
    [banks, loadBank, queuePrefs],
  )

  // The chapter list is otherwise only fetched at login, so a chapter imported
  // mid-session would stay invisible until a page reload.
  const refreshBanks = useCallback(async () => {
    const bankList = await fetchBanks()
    setBanks(bankList)
    setBanksLoaded(true)
    cacheSet(cacheKey('banks'), bankList)
    return bankList
  }, [])

  // After an import, hand back the slug so the app can navigate to it.
  const afterImport = useCallback(
    async (importedBankId) => {
      const bankList = await refreshBanks()
      return bankList.find((entry) => entry.id === importedBankId)?.slug ?? null
    },
    [refreshBanks],
  )

  const resetBank = useCallback(
    async (mode) => {
      if (!bankId) return
      await queueRef.current?.flush()
      await resetBankRpc(bankId, mode)
      await loadBank(bankId, { showLoading: true })
    },
    [bankId, loadBank],
  )

  const value = useMemo(
    () => ({
      status,
      error,
      banks,
      banksLoaded,
      bankId,
      bank: banks.find((entry) => entry.id === bankId) ?? null,
      questions,
      topics,
      rows,
      setSize: view.setSize ?? DEFAULT_SET_SIZE,
      view,
      sync,
      profile,
      answer,
      toggleFlag,
      redo,
      updateView,
      changeSetSize,
      openSlug,
      resetBank,
      refreshBanks,
      afterImport,
      reload: () => loadBank(bankId, { showLoading: true }),
    }),
    [
      status, error, banks, banksLoaded, bankId, questions, topics, rows, view, sync, profile,
      answer, toggleFlag, redo, updateView, changeSetSize, openSlug, resetBank,
      refreshBanks, afterImport, loadBank,
    ],
  )

  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>
}

export function useStudy() {
  const value = useContext(StudyContext)
  if (!value) throw new Error('useStudy must be used inside StudyProvider')
  return value
}
