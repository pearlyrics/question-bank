# Question Bank

True/false question bank with accounts, flags, mistakes, resizable sets, and
weekly bulk uploads. React + Vite + Tailwind v4 + Supabase.

## Setup

**1. Create the schema.** Open your Supabase project → SQL Editor → New query,
paste each file in `supabase/migrations/` in order (`0001_init.sql`,
`0002_chapter_progress.sql`, `0003_drop_current_bank.sql`) and run it. This is the
only step that can't be done from the app.

**2. Turn off email confirmation.** Authentication → Sign In / Providers →
Email → turn **Confirm email** off. Accounts here are username-only, and the
synthesised addresses never receive mail.

**3. Add your keys** to `.env` (already done if `.env` has both values):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**4. Run it.**

```
npm install
npm run dev
```

**5. Make yourself an admin.** Create your account in the app, then run this
once in the SQL editor — only admins see the Import tab:

```sql
update profiles set is_admin = true where username = 'your-username';
```

## Loading your existing 300 questions

```
npm run convert-legacy -- muscle-bank-2.html data/muscle-tissue-ii.json
```

Then open **Import**, drop `data/muscle-tissue-ii.json` in, check the batch, and
import it.

## Pages

| URL | Page |
|---|---|
| `/chapters` | Every chapter with your results for it — bank-wide |
| `/<chapter-slug>` | The questions for that chapter, e.g. `/nerve-tissue-bank` |
| `/import` | Bulk upload (admins only) |
| `/` | Redirects to `/chapters` |

Chapter slugs are the URL, so a few words are reserved (`chapters`, `import`,
`login`, `logout`, `api`, `assets`, `static`). The importer refuses them — a
chapter at `/import` could never be opened.

Each chapter keeps its own score, mistakes, flags, questions-per-set, and even
which tab and sheet you were last on. A freshly imported chapter appears in the
list straight away and the app opens it — no page reload needed.

New chapters start at **100 questions per set**. Change it for one chapter and
the others are untouched: muscle at 40 and nerve at 100 is a normal state.

Because the app uses real URLs, a static host needs a rewrite so every path
serves `index.html`. `public/_redirects` covers Netlify; on Vercel add a
`vercel.json` rewrite of `/(.*)` to `/index.html`. The Vite dev server already
does this.

To remove a chapter entirely (questions and everyone's progress for it, via
cascade), run in the SQL editor:

```sql
delete from banks where slug = 'the-slug';
```

## Adding ~400 questions each week

Generate a file in this shape and import it the same way:

```json
{
  "bank": {
    "slug": "w05-nerve-tissue",
    "title": "Week 5 · Nerve tissue",
    "source": "Junqueira's Basic Histology, 15th ed. · Ch. 11"
  },
  "topics": [{ "code": "OV", "label": "Overview & terminology" }],
  "questions": [
    {
      "topic": "OV",
      "answer": true,
      "statement": "Neurons are the functional unit of nervous tissue.",
      "explanation": "True. Neurons receive, process and transmit signals.",
      "page": 221
    }
  ]
}
```

Notes:

- The legacy array form `["OV", 1, "statement", "explanation", 193]` is accepted too.
- A `slug` that already exists adds to that bank; a new one creates a new bank.
- Re-importing the same statement **updates** it rather than duplicating it, so
  re-running a file is safe.
- `topics` is optional — any topic code used gets an entry, labelled by its code.
- The Check step reports counts, true/false balance per topic, duplicates and
  the exact line of anything malformed, before anything is written.

## How scoring works

Every question stores your **first** answer permanently, in write-once columns
that `record_answer()` will not overwrite. The score on screen is
`correct-on-first-try / first-answered` across whatever you're looking at.

Redoing mistakes or flagged questions updates the mistake list, the flag list
and the separate **all attempts** accuracy. It cannot move the score — not
because the UI avoids recalculating it, but because the first-attempt data is
immutable in the database.

Answers you give stay on screen when you switch tabs or sets and come back — a
pass in progress is never thrown away. To take a list again, press **Redo these**
(it appears at the top of the sheet once every row is answered, and always in the
footer). That hides the revealed answers without touching your score, and scrolls
the sheet back to its first question so you can start straight away.

`Reset this bank` offers two things:

- **Start a fresh pass** — clears revealed answers so you can go through again.
  Score, mistakes and flags survive.
- **Erase everything** — deletes this bank's rows, score included. The only
  path that clears a score.

## Sets, mistakes and flags

Mistakes and Flagged are scoped to the set you have selected, so they line up
with the set stats above them. Switching sets keeps the tab you're on — you can
work Set 1's mistakes, then Set 2's, without leaving the tab.

## Sets and the slider

Each question has a stable `position` in its bank, assigned at import by a
round-robin interleave across topics alternating true/false — so any slice stays
balanced. A set is just a slice of that order, which is why the slider can
re-cut 400 questions into sets of any size instantly, and why your progress is
unaffected by the size you pick. Sheets of 10 page within a set.

## Offline and multi-device

Answers render immediately, are written to `localStorage`, then queued to
Supabase with retries. Closing the tab mid-send loses nothing — the queue
replays on next load, and `record_answer()` is idempotent per attempt, so a
replayed write can't inflate your counts. Other tabs update through `storage`
events; other devices refresh when the tab regains focus.

## Theme and screen sizes

The **Auto / Light / Dark** control sits in the top bar, alongside the
Chapters and Import links (and on the login screen). Auto follows the device; Light and Dark pin it and are remembered per
browser. A small script in `index.html` applies a pinned theme before first
paint, so there's no flash of the wrong one on load — it reads the same key as
`src/lib/theme.js`, so keep those in sync.

The layout is built for three shapes:

- **Phone** — the statement takes the full width with YES / NO / Flag on their
  own row beneath it, tab labels shorten (Sheets, Topic), buttons stretch to
  full width, and every control is at least a 44px touch target. Layout reaches
  into the safe area on notched iPhones without putting content under the notch.
- **iPad** — the full three-column ruled sheet (No. | Statement | Yes / No) with
  complete tab labels, at any orientation.
- **Desktop** — as above, capped at 960px.

The set buttons use auto-fitting columns rather than fixed breakpoints, so
dropping the slider to 10 per set (30 sets) stays readable at every width.

## Results are per user

One row per `(user_id, question_id)`, and four things keep them apart:

- row-level security restricts every read and write to `user_id = auth.uid()`
- `record_answer()` takes the user from `auth.uid()`; there is no argument for
  it, so you cannot write an answer for anyone else
- `chapter_progress()` joins responses on `auth.uid()`
- local caches are keyed by user id, so two accounts on one browser never read
  each other's

Signing in also clears cached rows and preferences belonging to other accounts
on that browser. A *queue* belonging to another account is the exception: it can
hold answers that never reached the server, so a non-empty one is left for its
owner to come back to.

## Tests

```
npm test
```

Covers the first-attempt immutability rule, queue durability and replay safety,
set slicing and resize clamping, view paging, and import validation.
