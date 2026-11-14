-- A question was in Mistakes while last_correct was false, and last_correct
-- was written by whichever section answered last. So redoing a question in
-- Exam sheets and getting it right removed it from Mistakes — work in one
-- section changing another, which is exactly what the sections are meant to
-- stop.
--
-- Mistakes now owns its own list:
--   a question becomes a mistake when it is answered wrong, anywhere;
--   it stops being one only when it is answered correctly in the Mistakes tab.
--
-- Flagged already worked this way: a flag is set and cleared by hand, so
-- answering in another section never touched it.

alter table responses add column if not exists is_mistake boolean not null default false;

update responses set is_mistake = true where last_correct is false;

alter table responses drop column if exists last_correct;

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
    active, is_mistake,
    attempt_count, wrong_count, last_attempt_id, updated_at
  ) values (
    v_user, p_question_id, v_bank,
    case when v_scores then p_choice end,
    case when v_scores then v_correct end,
    case when v_scores then now() end,
    jsonb_build_object(p_view, p_choice), not v_correct,
    1, case when v_correct then 0 else 1 end, p_attempt_id, now()
  )
  on conflict (user_id, question_id) do update set
    first_choice  = case when v_scores then coalesce(r.first_choice,  excluded.first_choice)
                         else r.first_choice end,
    first_correct = case when v_scores then coalesce(r.first_correct, excluded.first_correct)
                         else r.first_correct end,
    first_at      = case when v_scores then coalesce(r.first_at,      excluded.first_at)
                         else r.first_at end,
    active        = r.active || jsonb_build_object(p_view, p_choice),
    -- wrong anywhere makes it a mistake; only the Mistakes tab can clear it
    is_mistake    = case
                      when not v_correct then true
                      when p_view = 'mistakes' then false
                      else r.is_mistake
                    end,
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

create or replace function chapter_progress()
returns table (
  bank_id   uuid,
  slug      text,
  title     text,
  source    text,
  total     int,
  seen      int,
  correct   int,
  mistakes  int,
  flagged   int
) language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  return query
    select
      b.id,
      b.slug,
      b.title,
      b.source,
      count(q.id)::int                                as total,
      count(r.first_at)::int                          as seen,
      count(*) filter (where r.first_correct)::int    as correct,
      count(*) filter (where r.is_mistake)::int       as mistakes,
      count(*) filter (where r.flagged)::int          as flagged
    from banks b
    left join questions q on q.bank_id = b.id
    left join responses r on r.question_id = q.id and r.user_id = auth.uid()
    group by b.id, b.slug, b.title, b.source, b.sort_order, b.created_at
    order by b.sort_order, b.created_at;
end $fn$;

revoke all on function record_answer(uuid, boolean, uuid, text) from public, anon;
revoke all on function chapter_progress()                       from public, anon;
grant execute on function record_answer(uuid, boolean, uuid, text) to authenticated;
grant execute on function chapter_progress()                       to authenticated;
