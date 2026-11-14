-- The source line repeated the chapter name the title already gives:
--
--   Nerve Tissue Bank
--   Junqueira's Basic Histology, 15th ed. · Chapter 9: Nerve Tissue & the Nervous System
--
-- Everything from the colon after the chapter number goes, leaving
-- "… · Chapter 9". Ranges keep their form: "Chapters 7–8" stays as it is,
-- only losing ": Cartilage & Bone".
--
-- Scoped to a colon that follows "Chapter"/"Chapters" and a number, so a book
-- title containing a colon is left alone.

update banks
set source = btrim(regexp_replace(source, '(Chapters?[[:space:]]+[0-9–—-]+)[[:space:]]*:.*$', '\1'))
where source ~* 'Chapters?[[:space:]]+[0-9–—-]+[[:space:]]*:';

-- New imports get the same treatment, so a pasted JSON file can keep carrying
-- the long form.
create or replace function banks_trim_source()
returns trigger language plpgsql set search_path = public as $fn$
begin
  if new.source is not null then
    new.source := btrim(
      regexp_replace(new.source, '(Chapters?[[:space:]]+[0-9–—-]+)[[:space:]]*:.*$', '\1')
    );
  end if;
  return new;
end $fn$;

drop trigger if exists banks_trim_source_trg on banks;
create trigger banks_trim_source_trg
  before insert or update of source on banks
  for each row execute function banks_trim_source();

-- Check: every source should now end at the chapter number.
--   select title, source from banks order by sort_order;
