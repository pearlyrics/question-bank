-- "Revealed in the current pass" was one value per question, so a question
-- showing in both Exam sheets and Mistakes shared it: answering or redoing in
-- one section changed what the other displayed. It becomes a small map keyed
-- by section, so each one keeps its own pass.
--
--   active = {"sets": true, "mistakes": false}
--
-- Still display state, still derived from nothing else, and still one column.

alter table responses add column if not exists active jsonb not null default '{}'::jsonb;

-- Everything answered so far was answered in some section; Exam sheets is the
-- only one that can be reconstructed, and it is where nearly all of it happened.
update responses
set active = jsonb_build_object('sets', active_choice)
where active_choice is not null;

alter table responses drop column if exists active_choice;

-- ---------------------------------------------------------------- answering

drop function if exists record_answer(uuid, boolean, uuid);

create or replace function record_answer(
  p_question_id uuid,
  p_choice      boolean,
  p_attempt_id  uuid,
  p_view        text default 'sets'
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
  if p_view is null or p_view not in ('sets', 'topic', 'mistakes', 'flagged') then
    raise exception 'unknown view %', p_view;
  end if;

  select answer, bank_id into v_answer, v_bank from questions where id = p_question_id;
  if not found then
    raise exception 'unknown question %', p_question_id;
  end if;

  v_correct := (p_choice = v_answer);

  insert into responses as r (
    user_id, question_id, bank_id,
    first_choice, first_correct, first_at,
    active, last_correct,
    attempt_count, wrong_count, last_attempt_id, updated_at
  ) values (
    v_user, p_question_id, v_bank,
    p_choice, v_correct, now(),
    jsonb_build_object(p_view, p_choice), v_correct,
    1, case when v_correct then 0 else 1 end, p_attempt_id, now()
  )
  on conflict (user_id, question_id) do update set
    first_choice  = coalesce(r.first_choice,  excluded.first_choice),
    first_correct = coalesce(r.first_correct, excluded.first_correct),
    first_at      = coalesce(r.first_at,      excluded.first_at),
    -- only this section's entry is touched
    active        = r.active || jsonb_build_object(p_view, p_choice),
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

-- "Redo": forget this section's pass, leaving every other section alone.
drop function if exists clear_active(uuid[]);

create or replace function clear_active(p_question_ids uuid[], p_view text default 'sets')
returns int language plpgsql security definer set search_path = public as $fn$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update responses set active = active - p_view, updated_at = now()
  where user_id = auth.uid()
    and question_id = any (p_question_ids)
    and jsonb_exists(active, p_view);

  get diagnostics v_count = row_count;
  return v_count;
end $fn$;

-- A fresh pass clears every section.
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
    update responses set active = '{}'::jsonb, updated_at = now()
    where user_id = auth.uid() and bank_id = p_bank_id and active <> '{}'::jsonb;
  else
    raise exception 'unknown reset mode %', p_mode;
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end $fn$;

-- ---------------------------------------------------------------- grants

revoke all on function record_answer(uuid, boolean, uuid, text) from public, anon;
revoke all on function clear_active(uuid[], text)               from public, anon;
revoke all on function reset_bank(uuid, text)                   from public, anon;

grant execute on function record_answer(uuid, boolean, uuid, text) to authenticated;
grant execute on function clear_active(uuid[], text)               to authenticated;
grant execute on function reset_bank(uuid, text)                   to authenticated;
