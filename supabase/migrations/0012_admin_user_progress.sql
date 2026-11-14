-- An admin view of who is using the bank and how they are getting on.
--
-- Row-level security stops anyone reading another person's profile or
-- responses, and that stays exactly as it is — these are security definer
-- functions that check is_admin themselves, so the policies protect ordinary
-- accounts untouched while an admin can see the class.

create or replace function admin_list_users()
returns table (
  user_id    uuid,
  username   text,
  is_admin   boolean,
  created_at timestamptz,
  answered   int,
  mistakes   int,
  flagged    int
) language plpgsql security definer set search_path = public as $fn$
begin
  if not coalesce((select p.is_admin from profiles p where p.id = auth.uid()), false) then
    raise exception 'admin only';
  end if;

  return query
    select
      p.id,
      p.username::text,
      p.is_admin,
      p.created_at,
      count(r.question_id) filter (where r.first_at is not null)::int as answered,
      count(r.question_id) filter (where r.is_mistake)::int           as mistakes,
      count(r.question_id) filter (where r.flagged)::int              as flagged
    from profiles p
    left join responses r on r.user_id = p.id
    group by p.id, p.username, p.is_admin, p.created_at
    order by p.username;
end $fn$;

-- The same per-chapter shape as chapter_progress(), for someone else.
create or replace function admin_user_progress(p_user_id uuid)
returns table (
  bank_id  uuid,
  slug     text,
  title    text,
  total    int,
  seen     int,
  correct  int,
  mistakes int,
  flagged  int
) language plpgsql security definer set search_path = public as $fn$
begin
  if not coalesce((select p.is_admin from profiles p where p.id = auth.uid()), false) then
    raise exception 'admin only';
  end if;
  if p_user_id is null then
    raise exception 'no user given';
  end if;

  return query
    select
      b.id,
      b.slug,
      b.title,
      count(q.id)::int                                as total,
      count(r.first_at)::int                          as seen,
      count(*) filter (where r.first_correct)::int    as correct,
      count(*) filter (where r.is_mistake)::int       as mistakes,
      count(*) filter (where r.flagged)::int          as flagged
    from banks b
    left join questions q on q.bank_id = b.id
    left join responses r on r.question_id = q.id and r.user_id = p_user_id
    group by b.id, b.slug, b.title, b.sort_order, b.created_at
    order by b.sort_order, b.created_at;
end $fn$;

revoke all on function admin_list_users()          from public, anon;
revoke all on function admin_user_progress(uuid)   from public, anon;
grant execute on function admin_list_users()        to authenticated;
grant execute on function admin_user_progress(uuid) to authenticated;
