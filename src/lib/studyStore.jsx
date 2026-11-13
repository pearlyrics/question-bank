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
import { cacheGet, cacheKey, cacheSet, rowsFromArray, rowsToArray } from './cache.js'
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

  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [banks, setBanks] = useState([])
  const [bankId, setBankId] = useState(null)
  const [questions, setQuestions] = useState([])
  const [topics, setTopics] = useState([])
  const [rows, setRows] = useState(() => new Map())
  const [setSize, setSetSize] = useState(DEFAULT_SET_SIZE)
  const [views, setViews] = useState({})
  const [sync, setSync] = useState({ state: 'idle', pending: 0 })

  const queueRef = useRef(null)
  const prefsTimer = useRef(null)
  const lastFetch = useRef(0)
  const latest = useRef({ bankId: null, setSize: DEFAULT_SET_SIZE, views: {} })

  latest.current = { bankId, setSize, views }

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
        if (cachedRows) setRows(rowsFromArray(cachedRows))
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
        if (cachedQuestions) setStatus('ready')
        else setStatus('error')
        setError(loadError.message)
      }
    },
    [userId],
  )

  useEffect(() => {
    if (!userId) {
      setStatus('loading')
      setBanks([])
      setQuestions([])
      setRows(new Map())
      return
    }

    let active = true
    const prefsKey = cacheKey('prefs', userId)
    const cachedPrefs = cacheGet(prefsKey)
    if (cachedPrefs) {
      setSetSize(cachedPrefs.set_size ?? DEFAULT_SET_SIZE)
      setViews(cachedPrefs.prefs ?? {})
      if (cachedPrefs.current_bank_id) setBankId(cachedPrefs.current_bank_id)
    }
    const cachedBanks = cacheGet(cacheKey('banks'))
    if (cachedBanks) setBanks(cachedBanks)

    async function boot() {
      try {
        const [bankList, prefs] = await Promise.all([fetchBanks(), fetchPrefs()])
        if (!active) return

        setBanks(bankList)
        cacheSet(cacheKey('banks'), bankList)

        if (prefs) {
          setSetSize(prefs.set_size ?? DEFAULT_SET_SIZE)
          setViews(prefs.prefs ?? {})
          cacheSet(prefsKey, prefs)
        }

        const preferred =
          (prefs?.current_bank_id && bankList.some((bank) => bank.id === prefs.current_bank_id)
            ? prefs.current_bank_id
            : null) ?? bankList[0]?.id ?? null

        if (!preferred) {
          setStatus('empty')
          return
        }
        setBankId(preferred)
        await loadBank(preferred)
      } catch (bootError) {
        if (!active) return
        setStatus(cachedBanks?.length ? 'ready' : 'error')
        setError(bootError.message)
      }
    }

    void boot()
    return () => {
      active = false
    }
  }, [userId, loadBank])

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

  // The bank list is otherwise only fetched at login, so a chapter imported
  // mid-session would stay invisible until a page reload.
  const refreshBanks = useCallback(async () => {
    const bankList = await fetchBanks()
    setBanks(bankList)
    cacheSet(cacheKey('banks'), bankList)
    return bankList
  }, [])

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
    (questionId, choice) => {
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

      enqueue({
        kind: 'flag',
        question_id: questionId,
        bank_id: question.bank_id,
        flagged,
      })
    },
    [questions, rows, commitRows, enqueue],
  )

  const redo = useCallback(
    (questionIds) => {
      if (questionIds.length === 0) return
      commitRows((current) => {
        const next = new Map(current)
        for (const id of questionIds) {
          const cleared = applyClearActive(current.get(id))
          if (cleared) next.set(id, cleared)
        }
        return next
      })
      enqueue({ kind: 'clear', question_ids: questionIds })
    },
    [commitRows, enqueue],
  )

  // Prefs are display state, so they are debounced into one write.
  const queuePrefs = useCallback(() => {
    if (prefsTimer.current) clearTimeout(prefsTimer.current)
    prefsTimer.current = setTimeout(() => {
      prefsTimer.current = null
      const snapshot = latest.current
      const payload = {
        kind: 'prefs',
        current_bank_id: snapshot.bankId,
        set_size: snapshot.setSize,
        prefs: snapshot.views,
      }
      if (userId) {
        cacheSet(cacheKey('prefs', userId), {
          current_bank_id: payload.current_bank_id,
          set_size: payload.set_size,
          prefs: payload.prefs,
        })
      }
      enqueue(payload)
    }, PREFS_DEBOUNCE)
  }, [enqueue, userId])

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
      setSetSize(size)
      latest.current = { ...latest.current, setSize: size }
      // Keep the reader near the same questions after a resize.
      setViews((current) => {
        if (!bankId) return current
        const existing = { ...DEFAULT_VIEW, ...(current[bankId] ?? {}) }
        const next = {
          ...current,
          [bankId]: {
            ...existing,
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

  const changeBank = useCallback(
    (nextBankId) => {
      if (nextBankId === bankId) return
      setBankId(nextBankId)
      latest.current = { ...latest.current, bankId: nextBankId }
      queuePrefs()
      void loadBank(nextBankId, { showLoading: true })
    },
    [bankId, loadBank, queuePrefs],
  )

  // Called when an import finishes: pick up the new chapter and switch to it.
  const afterImport = useCallback(
    async (importedBankId) => {
      const bankList = await refreshBanks()
      const target = bankList.some((entry) => entry.id === importedBankId)
        ? importedBankId
        : bankId
      if (!target) return
      if (target !== bankId) {
        setBankId(target)
        latest.current = { ...latest.current, bankId: target }
        queuePrefs()
      }
      await loadBank(target, { showLoading: true })
    },
    [bankId, refreshBanks, loadBank, queuePrefs],
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
      bankId,
      bank: banks.find((entry) => entry.id === bankId) ?? null,
      questions,
      topics,
      rows,
      setSize,
      view,
      sync,
      profile,
      answer,
      toggleFlag,
      redo,
      updateView,
      changeSetSize,
      changeBank,
      resetBank,
      refreshBanks,
      afterImport,
      reload: () => loadBank(bankId, { showLoading: true }),
    }),
    [
      status, error, banks, bankId, questions, topics, rows, setSize, view, sync, profile,
      answer, toggleFlag, redo, updateView, changeSetSize, changeBank, resetBank,
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
