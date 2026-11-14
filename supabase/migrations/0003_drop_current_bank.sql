-- Which chapter you are on is the URL's job since /chapters and /<slug>
-- landed. current_bank_id was still being written on every preferences save
-- and read by nothing.

alter table user_prefs drop column if exists current_bank_id;
