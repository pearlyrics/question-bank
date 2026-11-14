-- Shuffle is gone from the app, so the flag it left in each chapter's
-- display state is dead weight.

update user_prefs
set prefs = coalesce(
  (
    select jsonb_object_agg(
             entry.key,
             case
               when jsonb_typeof(entry.value) = 'object' then entry.value - 'shuffle'
               else entry.value
             end
           )
    from jsonb_each(prefs) as entry
  ),
  prefs
)
where prefs <> '{}'::jsonb;
