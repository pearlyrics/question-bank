-- Question bank schema.
-- Run this once in the Supabase SQL editor (or `supabase db push`).

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------- accounts

create table if not exists profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   citext not null unique,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

-- A profile row is created automatically for every new auth user.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------- content

create table if not exists banks (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  title      text not null,
  source     text,
  created_at timestamptz not null default now()
);

-- Topic codes are scoped to a bank: "CT" means something different in
-- chapter 10 than in chapter 11.
create table if not exists topics (
  id         uuid primary key default gen_random_uuid(),
  bank_id    uuid not null references banks (id) on delete cascade,
  code       text not null,
  label      text not null,
  sort_order int not null default 0,
  unique (bank_id, code)
);

create table if not exists questions (
  id          uuid primary key default gen_random_uuid(),
  bank_id     uuid not null references banks (id) on delete cascade,
  topic_id    uuid not null references topics (id) on delete cascade,
  statement   text not null check (length(btrim(statement)) > 0),
  answer      boolean not null,
  explanation text not null check (length(btrim(explanation)) > 0),
  page        int,
  -- Stable study order within the bank; assigned by reorder_bank().
  position    int not null default 0,
  -- Re-uploading the same statement updates it instead of duplicating it.
  statement_hash text generated always as
    (md5(lower(regexp_replace(btrim(statement), '\s+', ' ', 'g')))) stored,
  created_at  timestamptz not null default now(),
  unique (bank_id, statement_hash)
);

create index if not exists questions_bank_position_idx on questions (bank_id, position);
create index if not exists questions_topic_idx on questions (topic_id);

-- ---------------------------------------------------------------- progress

-- One row per (user, question), created on first answer or first flag.
-- An untouched question has no row at all.
create table if not exists responses (
  user_id         uuid not null references profiles (id) on delete cascade,
  question_id     uuid not null references questions (id) on delete cascade,
  bank_id         uuid not null references banks (id) on delete cascade,

  -- Write-once. The score is computed from these and nothing else.
  first_choice    boolean,
  first_correct   boolean,
  first_at        timestamptz,

  -- What the UI renders right now. null = show as unanswered.
  active_choice   boolean,

  last_correct    boolean,
  attempt_count   int not null default 0,
  wrong_count     int not null default 0,
  flagged         boolean not null default false,

  -- Guards against a queued write being flushed twice.
  last_attempt_id uuid,
  updated_at      timestamptz not null default now(),

  primary key (user_id, question_id)
);

create index if not exists responses_user_bank_idx on responses (user_id, bank_id);

create table if not exists user_prefs (
  user_id         uuid primary key references profiles (id) on delete cascade,
  current_bank_id uuid references banks (id) on delete set null,
  set_size        int not null default 100 check (set_size between 5 and 1000),
  -- Pure display state (mode, set size, sheet, topic, page) per bank.
  prefs           jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS

alter table profiles   enable row level security;
alter table banks      enable row level security;
alter table topics     enable row level security;
alter table questions  enable row level security;
alter table responses  enable row level security;
alter table user_prefs enable row level security;

drop policy if exists "read own profile" on profiles;
create policy "read own profile" on profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "read banks" on banks;
create policy "read banks" on banks
  for select to authenticated using (true);

drop policy if exists "read topics" on topics;
create policy "read topics" on topics
  for select to authenticated using (true);

drop policy if exists "read questions" on questions;
create policy "read questions" on questions
  for select to authenticated using (true);

-- Content is written only through import_questions(), which checks is_admin.
-- There are intentionally no insert/update policies on banks/topics/questions.

drop policy if exists "own responses" on responses;
create policy "own responses" on responses
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own prefs" on user_prefs;
create policy "own prefs" on user_prefs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- answering

-- Records an answer. Three invariants:
--   * first_choice/first_correct/first_at are written once and never change,
--     so replaying or redoing a question cannot move the score;
--   * counters advance only when p_attempt_id differs from the last one, so a
--     queued write that flushes twice is harmless;
--   * active_choice/last_correct always reflect the newest answer.
create or replace function record_answer(
  p_question_id uuid,
  p_choice      boolean,
  p_attempt_id  uuid
) returns responses language plpgsql security definer set search_path = public as $fn$
declare
  v_user    uuid := auth.uid();
  v_answer  boolean;
  v_bank    uuid;
  v_correct boolean;
  v_row     responses;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_choice is null or p_attempt_id is null then
    raise exception 'choice and attempt_id are required';
  end if;

  select answer, bank_id into v_answer, v_bank from questions where id = p_question_id;
  if not found then
    raise exception 'unknown question %', p_question_id;
  end if;

  v_correct := (p_choice = v_answer);

  insert into responses as r (
    user_id, question_id, bank_id,
    first_choice, first_correct, first_at,
    active_choice, last_correct,
    attempt_count, wrong_count, last_attempt_id, updated_at
  ) values (
    v_user, p_question_id, v_bank,
    p_choice, v_correct, now(),
    p_choice, v_correct,
    1, case when v_correct then 0 else 1 end, p_attempt_id, now()
  )
  on conflict (user_id, question_id) do update set
    first_choice  = coalesce(r.first_choice,  excluded.first_choice),
    first_correct = coalesce(r.first_correct, excluded.first_correct),
    first_at      = coalesce(r.first_at,      excluded.first_at),
    active_choice = excluded.active_choice,
    last_correct  = excluded.last_correct,
    attempt_count = r.attempt_count
                  + case when r.last_attempt_id is distinct from p_attempt_id then 1 else 0 end,
    wrong_count   = r.wrong_count
                  + case when r.last_attempt_id is distinct from p_attempt_id
                              and not v_correct then 1 else 0 end,
    last_attempt_id = p_attempt_id,
    updated_at      = now()
  returning * into v_row;

  return v_row;
end $fn$;

create or replace function set_flag(p_question_id uuid, p_flagged boolean)
returns responses language plpgsql security definer set search_path = public as $fn$
declare
  v_user uuid := auth.uid();
  v_bank uuid;
  v_row  responses;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select bank_id into v_bank from questions where id = p_question_id;
  if not found then
    raise exception 'unknown question %', p_question_id;
  end if;

  insert into responses as r (user_id, question_id, bank_id, flagged, updated_at)
  values (v_user, p_question_id, v_bank, coalesce(p_flagged, false), now())
  on conflict (user_id, question_id) do update set
    flagged    = excluded.flagged,
    updated_at = now()
  returning * into v_row;

  return v_row;
end $fn$;

-- "Redo these": hide the revealed answers without touching any history.
create or replace function clear_active(p_question_ids uuid[])
returns int language plpgsql security definer set search_path = public as $fn$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update responses set active_choice = null, updated_at = now()
  where user_id = auth.uid()
    and question_id = any (p_question_ids)
    and active_choice is not null;

  get diagnostics v_count = row_count;
  return v_count;
end $fn$;

-- mode 'pass' : start a clean pass; score, mistakes and flags are kept.
-- mode 'all'  : erase this bank's progress entirely, score included.
create or replace function reset_bank(p_bank_id uuid, p_mode text default 'pass')
returns int language plpgsql security definer set search_path = public as $fn$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_mode = 'all' then
    delete from responses where user_id = auth.uid() and bank_id = p_bank_id;
  elsif p_mode = 'pass' then
    update responses set active_choice = null, updated_at = now()
    where user_id = auth.uid() and bank_id = p_bank_id and active_choice is not null;
  else
    raise exception 'unknown reset mode %', p_mode;
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end $fn$;

-- ---------------------------------------------------------------- ingest

-- Stable study order: deal every topic's statements round-robin, alternating
-- true/false, so any slice (a set, a sheet of 10) stays balanced.
create or replace function reorder_bank(p_bank_id uuid)
returns void language sql security definer set search_path = public as $fn$
  with buckets as (
    select q.id,
           t.sort_order as topic_sort,
           q.answer,
           row_number() over (partition by q.topic_id, q.answer
                              order by q.statement_hash) as rn
    from questions q
    join topics t on t.id = q.topic_id
    where q.bank_id = p_bank_id
  ),
  ordered as (
    select id, (row_number() over (order by rn, topic_sort, answer)) - 1 as pos
    from buckets
  )
  update questions q set position = o.pos
  from ordered o
  where q.id = o.id and q.position is distinct from o.pos;
$fn$;

-- Admin-only bulk upsert. Payload shape:
-- {
--   "bank":   {"slug":"w05-nerve","title":"Week 5 · Nerve tissue","source":"Junqueira 15e ch.11"},
--   "topics": [{"code":"OV","label":"Overview","sort_order":0}],
--   "questions":[{"topic":"OV","answer":true,"statement":"...","explanation":"...","page":193}]
-- }
create or replace function import_questions(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_bank      banks;
  v_slug      text := payload->'bank'->>'slug';
  v_topic_id  uuid;
  v_before    int;
  v_after     int;
  v_seen      int := 0;
  v_order     int := 0;
  t           jsonb;
  q           jsonb;
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'admin only';
  end if;
  if v_slug is null or btrim(v_slug) = '' then
    raise exception 'bank.slug is required';
  end if;
  if jsonb_typeof(payload->'questions') <> 'array' then
    raise exception 'questions must be an array';
  end if;

  insert into banks (slug, title, source)
  values (btrim(v_slug),
          coalesce(nullif(btrim(payload->'bank'->>'title'), ''), btrim(v_slug)),
          nullif(btrim(coalesce(payload->'bank'->>'source', '')), ''))
  on conflict (slug) do update set
    title  = excluded.title,
    source = coalesce(excluded.source, banks.source)
  returning * into v_bank;

  for t in select * from jsonb_array_elements(coalesce(payload->'topics', '[]'::jsonb)) loop
    insert into topics (bank_id, code, label, sort_order)
    values (v_bank.id,
            btrim(t->>'code'),
            coalesce(nullif(btrim(t->>'label'), ''), btrim(t->>'code')),
            coalesce((t->>'sort_order')::int, v_order))
    on conflict (bank_id, code) do update set
      label      = excluded.label,
      sort_order = excluded.sort_order;
    v_order := v_order + 1;
  end loop;

  select count(*) into v_before from questions where bank_id = v_bank.id;

  for q in select * from jsonb_array_elements(payload->'questions') loop
    v_seen := v_seen + 1;

    if coalesce(btrim(q->>'statement'), '') = '' then
      raise exception 'question %: statement is empty', v_seen;
    end if;
    if coalesce(btrim(q->>'explanation'), '') = '' then
      raise exception 'question %: explanation is empty', v_seen;
    end if;
    if q->>'answer' is null or lower(q->>'answer') not in ('true', 'false', 't', 'f', '1', '0') then
      raise exception 'question %: answer must be true or false', v_seen;
    end if;
    if coalesce(btrim(q->>'topic'), '') = '' then
      raise exception 'question %: topic code is required', v_seen;
    end if;

    select id into v_topic_id
    from topics where bank_id = v_bank.id and code = btrim(q->>'topic');

    if v_topic_id is null then
      insert into topics (bank_id, code, label, sort_order)
      values (v_bank.id, btrim(q->>'topic'), btrim(q->>'topic'), 9999)
      on conflict (bank_id, code) do update set label = topics.label
      returning id into v_topic_id;
    end if;

    insert into questions (bank_id, topic_id, statement, answer, explanation, page)
    values (v_bank.id,
            v_topic_id,
            btrim(q->>'statement'),
            lower(q->>'answer') in ('true', 't', '1'),
            btrim(q->>'explanation'),
            nullif(btrim(coalesce(q->>'page', '')), '')::int)
    on conflict (bank_id, statement_hash) do update set
      topic_id    = excluded.topic_id,
      answer      = excluded.answer,
      explanation = excluded.explanation,
      page        = excluded.page;
  end loop;

  select count(*) into v_after from questions where bank_id = v_bank.id;
  perform reorder_bank(v_bank.id);

  return jsonb_build_object(
    'bank_id',   v_bank.id,
    'bank_slug', v_bank.slug,
    'bank_title', v_bank.title,
    'received',  v_seen,
    'added',     v_after - v_before,
    'updated',   v_seen - (v_after - v_before),
    'total_in_bank', v_after,
    'true_count',  (select count(*) from questions where bank_id = v_bank.id and answer),
    'false_count', (select count(*) from questions where bank_id = v_bank.id and not answer)
  );
end $fn$;

revoke all on function import_questions(jsonb) from anon;
