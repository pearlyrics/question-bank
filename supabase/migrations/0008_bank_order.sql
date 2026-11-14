-- Chapters were listed in the order they were imported, which is rarely the
-- order you want to study them in. They get an explicit position instead.

alter table banks add column if not exists sort_order int not null default 0;

-- Existing chapters keep the order they already had.
with ordered as (
  select id, (row_number() over (order by created_at)) as pos from banks
)
update banks b
set sort_order = o.pos
from ordered o
where b.id = o.id and b.sort_order = 0;

-- A new chapter goes to the end. A trigger rather than a change to
-- import_questions(), so the importer stays as it is.
create or replace function banks_default_order()
returns trigger language plpgsql set search_path = public as $fn$
begin
  if new.sort_order is null or new.sort_order = 0 then
    new.sort_order := coalesce((select max(sort_order) from banks), 0) + 1;
  end if;
  return new;
end $fn$;

drop trigger if exists banks_set_order on banks;
create trigger banks_set_order
  before insert on banks
  for each row execute function banks_default_order();

-- Admin-only: takes the chapter ids in the order they should appear.
create or replace function set_bank_order(p_bank_ids uuid[])
returns int language plpgsql security definer set search_path = public as $fn$
declare
  v_count int;
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'admin only';
  end if;
  if p_bank_ids is null or array_length(p_bank_ids, 1) is null then
    raise exception 'no chapters given';
  end if;

  update banks b
  set sort_order = t.position
  from unnest(p_bank_ids) with ordinality as t(id, position)
  where b.id = t.id;

  get diagnostics v_count = row_count;
  return v_count;
end $fn$;

-- Chapter list follows the chosen order.
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
    group by b.id, b.slug, b.title, b.source, b.sort_order, b.created_at
    order by b.sort_order, b.created_at;
end $fn$;

revoke all on function set_bank_order(uuid[]) from public, anon;
revoke all on function chapter_progress()     from public, anon;
grant execute on function set_bank_order(uuid[]) to authenticated;
grant execute on function chapter_progress()     to authenticated;
