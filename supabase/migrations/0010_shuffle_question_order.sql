-- Question order was a round-robin deal across topics, alternating false then
-- true within each. The intent was balance; the result was a tell. Every bank
-- read FTFTFTFT... from position 0 with topics arriving in same-topic pairs,
-- so you could answer correctly by counting rather than by knowing.
--
-- Replaced with a deterministic shuffle. md5 of the question id gives an
-- order with no relation to topic, answer or import sequence, and the same
-- order every time it is run — so re-importing a bank doesn't reshuffle what
-- people are working through.
--
-- Balance still holds where it matters: a bank written with 200 true and 200
-- false statements stays 50/50, and a set drawn from a shuffled 400 carries
-- roughly every topic. It just isn't a pattern any more.

create or replace function reorder_bank(p_bank_id uuid)
returns void language sql security definer set search_path = public as $fn$
  with ordered as (
    select id, (row_number() over (order by md5(id::text))) - 1 as pos
    from questions
    where bank_id = p_bank_id
  )
  update questions q set position = o.pos
  from ordered o
  where q.id = o.id and q.position is distinct from o.pos;
$fn$;

-- Apply it to every bank that already exists.
do $$
declare
  v_bank record;
begin
  for v_bank in select id from banks loop
    perform reorder_bank(v_bank.id);
  end loop;
end $$;

-- Nothing should call this directly; import_questions() runs it as the owner.
revoke all on function reorder_bank(uuid) from public, anon, authenticated;

-- Sanity check. Run it after the migration: alternations should land near
-- half of the comparisons, not all of them.
--
--   select b.slug,
--          count(*) filter (where q.answer <> prev) as alternations,
--          count(*)                                 as comparisons
--   from banks b
--   join (
--     select bank_id, answer,
--            lag(answer) over (partition by bank_id order by position) as prev
--     from questions
--   ) q on q.bank_id = b.id
--   where q.prev is not null
--   group by b.slug;
