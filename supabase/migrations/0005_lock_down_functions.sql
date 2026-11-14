-- Every function here is `security definer`, which means it runs with the
-- owner's rights and bypasses row-level security. That is deliberate — it is
-- how record_answer() can enforce write-once first attempts — but it makes the
-- EXECUTE grant the only thing standing between an anonymous caller and the
-- function body.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and `anon`
-- inherits from PUBLIC, so the `revoke ... from anon` in 0002 did nothing.
-- Revoking from PUBLIC is what actually closes it.
--
-- Observed before this migration: an anonymous request to chapter_progress()
-- returned every chapter's title, slug and question count.

-- ------------------------------------------------- chapter_progress

-- Rewritten with an explicit guard rather than relying on grants alone: with
-- auth.uid() null the joins simply matched no responses and it happily
-- returned the whole chapter list with zeroes.
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
      count(q.id)::int                                      as total,
      count(r.first_at)::int                                as seen,
      count(*) filter (where r.first_correct)::int          as correct,
      count(*) filter (where r.last_correct is false)::int  as mistakes,
      count(*) filter (where r.flagged)::int                as flagged
    from banks b
    left join questions q on q.bank_id = b.id
    left join responses r on r.question_id = q.id and r.user_id = auth.uid()
    group by b.id, b.slug, b.title, b.source, b.created_at
    order by b.created_at;
end $fn$;

-- ------------------------------------------------- grants

-- Signed-in users need these; nobody else does.
revoke all on function chapter_progress()                      from public, anon;
revoke all on function record_answer(uuid, boolean, uuid)      from public, anon;
revoke all on function set_flag(uuid, boolean)                 from public, anon;
revoke all on function clear_active(uuid[])                    from public, anon;
revoke all on function reset_bank(uuid, text)                  from public, anon;
revoke all on function import_questions(jsonb)                 from public, anon;

grant execute on function chapter_progress()                   to authenticated;
grant execute on function record_answer(uuid, boolean, uuid)   to authenticated;
grant execute on function set_flag(uuid, boolean)              to authenticated;
grant execute on function clear_active(uuid[])                 to authenticated;
grant execute on function reset_bank(uuid, text)               to authenticated;
grant execute on function import_questions(jsonb)              to authenticated;

-- reorder_bank is called only from inside import_questions, which is itself
-- security definer and so runs it as the owner. No client should reach it:
-- it rewrites every question's position in a bank, and it was callable by
-- anonymous requests.
revoke all on function reorder_bank(uuid) from public, anon, authenticated;
