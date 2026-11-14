import { supabase } from './supabase.js'

// Errors that will never succeed on retry are marked permanent so one bad op
// cannot block the queue forever. Anything else keeps its place in line.
const PERMANENT_CODES = new Set(['42883', '42703', '42P01', '22P02', '23503'])

function wrapError(error) {
  const wrapped = new Error(error?.message ?? 'Request failed')
  wrapped.cause = error
  const message = String(error?.message ?? '').toLowerCase()
  wrapped.permanent =
    PERMANENT_CODES.has(error?.code) ||
    message.includes('unknown question') ||
    message.includes('admin only')
  return wrapped
}

async function run(query) {
  const { data, error } = await query
  if (error) throw wrapError(error)
  return data
}

export async function fetchProfile(userId) {
  const rows = await run(
    supabase.from('profiles').select('id, username, is_admin').eq('id', userId).limit(1),
  )
  return rows?.[0] ?? null
}

export async function fetchBanks() {
  return run(
    supabase
      .from('banks')
      .select('id, slug, title, source, sort_order')
      .order('sort_order')
      .order('created_at'),
  )
}

// Admin-only: everyone with an account, and how far along they are.
export async function adminListUsers() {
  return run(supabase.rpc('admin_list_users'))
}

// Admin-only: one person's progress, chapter by chapter.
export async function adminUserProgress(userId) {
  return run(supabase.rpc('admin_user_progress', { p_user_id: userId }))
}

// Admin-only, and irreversible: the account and every answer with it.
export async function adminDeleteUser(userId) {
  return run(supabase.rpc('admin_delete_user', { p_user_id: userId }))
}

// Admin-only. Takes the chapter ids in the order they should appear.
export async function setBankOrder(bankIds) {
  return run(supabase.rpc('set_bank_order', { p_bank_ids: bankIds }))
}

export async function fetchQuestions(bankId) {
  return run(
    supabase
      .from('questions')
      .select('id, bank_id, topic_id, statement, answer, explanation, page, position')
      .eq('bank_id', bankId)
      .order('position'),
  )
}

export async function fetchTopics(bankId) {
  return run(
    supabase
      .from('topics')
      .select('id, code, label, sort_order')
      .eq('bank_id', bankId)
      .order('sort_order'),
  )
}

export async function fetchResponses(bankId) {
  return run(
    supabase
      .from('responses')
      .select(
        'question_id, bank_id, first_choice, first_correct, first_at, active, ' +
          'is_mistake, attempt_count, wrong_count, flagged, last_attempt_id',
      )
      .eq('bank_id', bankId),
  )
}

export async function fetchPrefs() {
  const rows = await run(
    supabase.from('user_prefs').select('prefs').limit(1),
  )
  return rows?.[0] ?? null
}

// Bank-wide results for every chapter, in one round trip.
export async function fetchChapterProgress() {
  return run(supabase.rpc('chapter_progress'))
}

export async function importQuestions(payload) {
  return run(supabase.rpc('import_questions', { payload }))
}

export async function resetBank(bankId, mode) {
  return run(supabase.rpc('reset_bank', { p_bank_id: bankId, p_mode: mode }))
}

// The single path from a queued op to the database.
export async function sendOp(op, userId) {
  switch (op.kind) {
    case 'answer':
      return run(
        supabase.rpc('record_answer', {
          p_question_id: op.question_id,
          p_choice: op.choice,
          p_attempt_id: op.attempt_id,
          p_view: op.view,
        }),
      )
    case 'flag':
      return run(
        supabase.rpc('set_flag', { p_question_id: op.question_id, p_flagged: op.flagged }),
      )
    case 'clear':
      return run(supabase.rpc('clear_active', { p_question_ids: op.question_ids, p_view: op.view }))
    case 'prefs':
      return run(
        supabase.from('user_prefs').upsert(
          {
            user_id: userId,
            prefs: op.prefs,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        ),
      )
    default: {
      const error = new Error(`Unknown op ${op.kind}`)
      error.permanent = true
      throw error
    }
  }
}
