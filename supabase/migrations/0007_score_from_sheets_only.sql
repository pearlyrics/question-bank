-- The score is your first answer to each question *in Exam sheets*.
--
-- 0006 gave each section its own pass, but first_choice/first_correct/first_at
-- were still set by whichever section answered a question first. Mistakes only
-- ever contains questions already answered, so it was safe there — but By topic
-- and Flagged both contain questions that have never been answered, so working
-- through them would quietly establish a first run and move the score.
--
-- Everything else still updates from any section: last_correct so a question
-- leaves Mistakes once you get it right, and the attempt and wrong counts so
-- "missed 3x" stays honest.

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
  v_scores  boolean;
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
  v_scores  := (p_view = 'sets');

  insert into responses as r (
    user_id, question_id, bank_id,
    first_choice, first_correct, first_at,
    active, last_correct,
    attempt_count, wrong_count, last_attempt_id, updated_at
  ) values (
    v_user, p_question_id, v_bank,
    case when v_scores then p_choice end,
    case when v_scores then v_correct end,
    case when v_scores then now() end,
    jsonb_build_object(p_view, p_choice), v_correct,
    1, case when v_correct then 0 else 1 end, p_attempt_id, now()
  )
  on conflict (user_id, question_id) do update set
    -- write-once, and only from Exam sheets
    first_choice  = case when v_scores then coalesce(r.first_choice,  excluded.first_choice)
                         else r.first_choice end,
    first_correct = case when v_scores then coalesce(r.first_correct, excluded.first_correct)
                         else r.first_correct end,
    first_at      = case when v_scores then coalesce(r.first_at,      excluded.first_at)
                         else r.first_at end,
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

revoke all on function record_answer(uuid, boolean, uuid, text) from public, anon;
grant execute on function record_answer(uuid, boolean, uuid, text) to authenticated;
