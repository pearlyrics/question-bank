# Question Bank — design

Date: 2026-11-13
Status: approved, implementing

## Problem

A single-file HTML true/false question bank (`muscle-bank-2.html`, 300 statements,
3 sets of 100) works but has three limits:

1. **Score bug.** Accuracy is `Σcorrect / Σattempts` over *all* attempts, and every
   redo increments those counters. Redoing mistakes or flags therefore always moves
   the score. The score must reflect the first run only.
2. **No accounts.** Progress lives in one browser's `localStorage`.
3. **No ingest path.** Questions are a literal array in the file; ~400 new questions
   arrive weekly.

## Decisions

| Area | Decision |
|---|---|
| Stack | React + Vite + Tailwind v4 + Supabase (Postgres, Auth, RLS) |
| Bank scope | Each weekly upload is a **bank**; user picks a bank, then sets within it |
| Set size | Slider over a stable `position` ordering; sheets of 10 page within a set |
| Score | **First attempt per question**, write-once in SQL, aggregated per view |
| Upload | In-app admin page, paste/drop JSON, validated preview, then commit |
| Persistence | Local-first write-through + durable queue + idempotent `record_answer` |
| Auth | Username only; password derived from username; no email confirmation |

## Schema

Content (admin writes via RPC, authenticated reads):

- `banks` — id, slug (unique), title, source, created_at
- `topics` — id, bank_id, code, label, sort_order; unique (bank_id, code).
  Scoped per bank so topic codes can't collide between chapters.
- `questions` — id, bank_id, topic_id, statement, answer, explanation, page,
  `position`, `statement_hash` (generated); unique (bank_id, statement_hash).

`position` is assigned once at import by `reorder_bank()`: a round-robin interleave
across topics alternating true/false. Set *k* of size *n* is
`position between k*n and (k+1)*n - 1` — moving the slider is arithmetic, not a
reshuffle. `statement_hash` makes a re-upload an upsert, not 400 duplicates.

Progress (per-user, RLS to `auth.uid()`):

- `responses` — PK (user_id, question_id), plus bank_id,
  `first_choice/first_correct/first_at` (**write-once**), `active_choice`
  (null = renders unanswered), `last_correct`, `attempt_count`, `wrong_count`,
  `flagged`, `last_attempt_id`, updated_at.
  A row exists only once a question is answered or flagged — untouched is the
  absence of a row, so 4,000 questions is not 4,000 rows per user.
- `user_prefs` — user_id PK, current_bank_id, set_size, `prefs` jsonb, updated_at.
  Deliberately a jsonb bag: pure display state, never queried server-side.
- `profiles` — id → auth.users, username (unique), is_admin.

Nothing aggregate is stored. Score, mistake count, flag count and per-set progress
are all derived from `responses`, so they cannot disagree with the answers that
produced them — which is how the original bug happened.

`bank_id` on `responses` is a deliberate denormalization: it turns every
per-bank load, mistake list and flag list into a single-table index scan on
`(user_id, bank_id)`. Questions never move banks, so it cannot drift.

## Functions (all `security definer`)

- `record_answer(question_id, choice, attempt_id)` — sets `first_*` only when
  `first_at is null`; increments counters only when `last_attempt_id` differs;
  always refreshes `active_choice` / `last_correct`. **Replay-safe**, so a queued
  write that flushes twice cannot inflate counters or touch the score.
- `set_flag(question_id, flagged)`
- `clear_active(question_ids[])` — backs "Redo these"
- `reset_bank(bank_id, mode)` — `'pass'` clears `active_choice` only (score,
  mistakes, flags intact); `'all'` deletes the bank's rows outright, the one path
  that clears a score, behind an explicit confirm.
- `import_questions(payload jsonb)` — admin-only; upserts bank/topics/questions,
  calls `reorder_bank`, returns a report.
- `reorder_bank(bank_id)` — assigns `position`.

## Sync

Answer → in-memory state renders instantly → full user state written to
`localStorage` → op pushed onto a durable queue → queue flushes to Supabase with
retry and backoff. Each answer carries a client-generated `attempt_id`; the local
reducer mirrors the SQL function exactly, so optimistic state equals server state.

On load: render from cache, fetch fresh, replay unflushed ops on top of the server
snapshot. Refetch on window focus (multi-device); `storage` events keep tabs in
sync. Flag and prefs ops coalesce by key; answer ops never coalesce.

## Auth

One field: username (3–32 chars, `[a-z0-9._-]`). Email is
`<username>@<VITE_AUTH_EMAIL_DOMAIN>`; password is the username, padded
deterministically to Supabase's 6-char minimum. Email confirmation must be off.

Known trade-off, accepted: anyone who knows a username can sign in as that user.
Nothing sensitive belongs in this app.

## Out of scope

Password changes, email recovery, question editing in the UI, per-question timers,
spaced repetition.
