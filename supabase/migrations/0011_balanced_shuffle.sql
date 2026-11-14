-- Balance each sheet without making the order predictable.
--
-- 0010 shuffled a bank outright, which removed the FTFTFT pattern but let any
-- given sheet of ten come out 8:2 by chance. This keeps a sheet near 5:5 and
-- still random inside it, in three steps:
--
--   1. spread  — rank trues among trues and falses among falses, then order
--                by rank/count. Both run 0..1, so any window of ten holds
--                about five of each. A bank that isn't 50/50 spreads its
--                surplus evenly instead of stacking it at the end.
--   2. sheet   — cut that order into tens.
--   3. shuffle — reorder within each sheet by a different hash, which is what
--                stops step 1's interleave from reading as a pattern.
--
-- Every step keys off md5 of the question id, so the result is fixed: running
-- it again gives the same order, and nothing reshuffles on login or import.

create or replace function reorder_bank(p_bank_id uuid)
returns void language sql security definer set search_path = public as $fn$
  with ranked as (
    select
      id,
      (row_number() over (partition by answer order by md5(id::text || 'spread')) - 1)::numeric
        / greatest(count(*) over (partition by answer), 1) as frac
    from questions
    where bank_id = p_bank_id
  ),
  spread as (
    select id, (row_number() over (order by frac, md5(id::text || 'tie'))) - 1 as seq
    from ranked
  ),
  ordered as (
    select id, (row_number() over (order by seq / 10, md5(id::text || 'within'))) - 1 as pos
    from spread
  )
  update questions q set position = o.pos
  from ordered o
  where q.id = o.id and q.position is distinct from o.pos;
$fn$;

do $$
declare
  v_bank record;
begin
  for v_bank in select id from banks loop
    perform reorder_bank(v_bank.id);
  end loop;
end $$;

revoke all on function reorder_bank(uuid) from public, anon, authenticated;

-- Check afterwards: trues per sheet should sit at 5 (4 or 6 where a bank
-- isn't 50/50), and alternations should be near half the comparisons.
--
--   select b.slug, q.sheet, count(*) filter (where q.answer) as trues, count(*) as of
--   from banks b
--   join (select bank_id, answer, position / 10 as sheet from questions) q
--     on q.bank_id = b.id
--   group by b.slug, q.sheet
--   order by b.slug, q.sheet;
