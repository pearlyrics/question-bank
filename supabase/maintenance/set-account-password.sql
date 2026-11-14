-- Give an account a password of its own, instead of the one derived from its
-- username. Intended for admin accounts: once this is set, the app asks for
-- the password when that username signs in, and nobody can get in by typing
-- the username alone.
--
-- Paste into the Supabase SQL editor, with your own values. Do not commit the
-- password anywhere — this file deliberately carries placeholders.
--
-- The address is <username>@<VITE_AUTH_EMAIL_DOMAIN>, qbank.local by default.

update auth.users
set encrypted_password = crypt('<new-password>', gen_salt('bf')),
    updated_at = now()
where email = '<username>@qbank.local';

-- Expect: UPDATE 1. If it says UPDATE 0, check the address:
--   select email from auth.users order by created_at;

-- To undo, set it back to what the app would derive — the username itself,
-- padded to six characters if shorter (see passwordFor in src/lib/username.js).
