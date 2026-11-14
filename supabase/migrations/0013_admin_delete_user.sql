-- Let an admin delete an account from the Users page.
--
-- One delete does the lot: auth.users cascades to profiles, and profiles
-- cascades to responses and user_prefs. Question banks are untouched — they
-- reference banks, never a user.
--
-- This is irreversible. There is no trash and no undo: the person's answers,
-- score, mistakes and flags all go.

create or replace function admin_delete_user(p_user_id uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v_username text;
  v_count    int;
begin
  if not coalesce((select p.is_admin from profiles p where p.id = auth.uid()), false) then
    raise exception 'admin only';
  end if;
  if p_user_id is null then
    raise exception 'no account given';
  end if;

  -- Deleting yourself would log you out mid-action, and if you were the only
  -- admin it would leave nobody able to import or manage accounts.
  if p_user_id = auth.uid() then
    raise exception 'you cannot delete your own account';
  end if;

  select p.username::text into v_username from profiles p where p.id = p_user_id;
  if v_username is null then
    raise exception 'no such account';
  end if;

  delete from auth.users where id = p_user_id;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'account could not be deleted';
  end if;

  return v_username;
end $fn$;

revoke all on function admin_delete_user(uuid) from public, anon;
grant execute on function admin_delete_user(uuid) to authenticated;
