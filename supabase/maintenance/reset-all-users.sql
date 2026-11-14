-- DESTRUCTIVE AND IRREVERSIBLE. Not a migration — never run this as part of
-- the migration sequence. Paste it into the Supabase SQL editor by hand.
--
-- Deletes every account and everything attached to one:
--   auth.users  -> profiles     (cascade)
--               -> responses    (cascade)  every answer, score, mistake, flag
--               -> user_prefs   (cascade)  set sizes, last tab
--
-- Keeps all content: banks, topics and questions reference banks, never users.
--
-- Afterwards there are no accounts at all, including yours and the admin
-- flag on it. Sign up again, then re-grant admin or you cannot import:
--
--   update profiles set is_admin = true where username = 'your-username';

-- What is about to go (run this first if you want to see the damage):
--   select
--     (select count(*) from auth.users)  as accounts,
--     (select count(*) from responses)   as answers,
--     (select count(*) from questions)   as questions_kept,
--     (select count(*) from banks)       as chapters_kept;

delete from auth.users;

-- Confirm: accounts and answers are 0, chapters and questions unchanged.
select
  (select count(*) from auth.users) as accounts,
  (select count(*) from responses)  as answers,
  (select count(*) from user_prefs) as prefs,
  (select count(*) from banks)      as chapters_kept,
  (select count(*) from questions)  as questions_kept;
