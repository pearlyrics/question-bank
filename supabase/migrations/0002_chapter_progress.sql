-- Per-chapter results for the /chapters page.
--
-- Computed on demand from responses rather than stored, for the same reason
-- every other total in this app is: a stored count can disagree with the
-- answers behind it, and this one would be read on every visit.

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
) language sql security definer set search_path = public as $fn$
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
$fn$;

revoke all on function chapter_progress() from anon;

-- ---------------------------------------------------------------- set size

-- Set size used to be one number for the whole account. It belongs to the
-- chapter: 40 per set suits muscle tissue, 100 suits a fresh 400-question
-- chapter. It now lives in user_prefs.prefs alongside the other per-chapter
-- display state, so the column is redundant.

-- Carry the old global value into every chapter already in prefs, so nobody
-- loses the size they had chosen.
update user_prefs up
set prefs = coalesce(
  (
    select jsonb_object_agg(
             entry.key,
             case
               -- entry.value last, so a size already chosen per chapter wins
               -- over the old account-wide one.
               when jsonb_typeof(entry.value) = 'object'
                 then jsonb_build_object('setSize', up.set_size) || entry.value
               else entry.value
             end
           )
    from jsonb_each(up.prefs) as entry
  ),
  up.prefs
)
where up.prefs <> '{}'::jsonb;

alter table user_prefs drop column if exists set_size;
