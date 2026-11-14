# Question Bank

True/false question bank with accounts, flags, mistakes, resizable sets, and
weekly bulk uploads. React + Vite + Tailwind v4 + Supabase.

## Setup

**1. Create the schema.** Open your Supabase project → SQL Editor → New query,
paste each file in `supabase/migrations/` in order and run it. Re-running one
is safe; they are written to be idempotent. This is the
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
| `/users` | Everyone with an account, and their progress per chapter (admins only) |
| `/` | Redirects to `/chapters` |

Chapter slugs are the URL, so a few words are reserved (`chapters`, `import`,
`users`, `login`, `logout`, `api`, `assets`, `static`). The importer refuses them — a
chapter at `/import` could never be opened.

Each chapter keeps its own score, mistakes, flags, questions-per-set, and even
which tab and sheet you were last on. A freshly imported chapter appears in the
list straight away and the app opens it — no page reload needed.

New chapters start at **100 questions per set**. Change it for one chapter and
the others are untouched: muscle at 40 and nerve at 100 is a normal state.

Because the app uses real URLs, a static host needs a rewrite so every path
serves `index.html`, or refreshing `/chapters` 404s. `vercel.json` covers
Vercel and `public/_redirects` covers Netlify; both are in the repo. The Vite
dev server already does this.

## Deploying

Supabase credentials are read when the app is **built**, not when it runs —
Vite replaces `import.meta.env.VITE_*` with literal strings and they end up
inside the JS bundle. Two consequences:

- Adding environment variables to a hosting dashboard does nothing to a build
  that already happened. **Redeploy** after adding them.
- The variables must apply to the **Production** environment, not only Preview
  or Development, and must keep the `VITE_` prefix — Vite exposes no others.

If a deployed copy shows the "Almost there" screen, that is this and nothing
else: the bundle was built without the values.

To remove a chapter entirely (questions and everyone's progress for it, via
cascade), run in the SQL editor:

```sql
delete from banks where slug = 'the-slug';
```

## Reordering chapters

The Import page lists every chapter with up and down arrows. Moving one saves
immediately — there is no separate save button — and the new order is what
everyone sees on `/chapters`.

Order is `banks.sort_order`. A newly imported chapter goes to the end, set by a
trigger so the importer itself didn't need to change.

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

Scrolling a chapter takes the title, slider and set buttons away, then the
tabs, the sheet numbers and the sheet's control bar pin to the top of the
window and the questions scroll beneath them — so the score and the Redo /
Next buttons stay in reach however far down the sheet you are.

Each tab keeps its own pass. A question can appear under Exam sheets, By topic
and Mistakes at once, and answering or pressing Redo in one of them leaves the
others untouched — `responses.active` is a small map keyed by section rather
than a single value. Opening Mistakes or Flagged for the first time shows every
row unanswered; work through half, go elsewhere and come back, and the half you
did is still there.

**Only Exam sheets scores.** `first_choice`/`first_correct`/`first_at` are
written once *and* only when the answer comes from Exam sheets, so working
through By topic, Mistakes or Flagged can never establish a first run or move
your score — not even for a question you had never answered before. The attempt and wrong counts do still update from any section, so "missed 3×"
stays honest.

**Mistakes owns its own list.** A question becomes a mistake when it is
answered wrong anywhere, and stops being one only when it is answered
correctly *in the Mistakes tab*. Redoing it in Exam sheets — right or wrong —
leaves the Mistakes list alone. Flagged already worked this way, a flag being
set and cleared by hand.

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
with the set stats above them. Chapter-wide totals live on `/chapters`, not on
the chapter page. Switching sets keeps the tab you're on — you can
work Set 1's mistakes, then Set 2's, without leaving the tab.

## Sets and the slider

Each question has a stable `position` in its bank, assigned at import by a
deterministic shuffle (md5 of its id). The order has no relation to topic,
answer or import sequence, so a sheet is a genuine mix with no true/false
pattern to spot — but it is the same order every time, so re-importing a bank
doesn't reshuffle what people are working through. A set is just a slice of that order, which is why the slider can
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

## Who can see what

Signed out, every URL redirects to `/` and shows the login form — `/chapters`,
`/<slug>` and `/import` all mount behind the session check, so no page
component ever renders without one, and the address bar never sits on a page
you can't see. The redirect replaces the history entry, so Back doesn't return
to the protected URL. Verified by visiting each while signed out.

A deep link still works once you're signed in: the redirect waits for the
session check to finish, so `/nerve-tissue-bank` in a fresh tab opens that
chapter rather than bouncing you to the chapter list.

That is only the visible half. The database is the half that matters:

- every table policy is `to authenticated`, so a signed-out request returns
  nothing even when made directly against the API
- `import_questions()` checks `is_admin` itself, so a signed-in non-admin
  calling it directly is refused
- the `security definer` functions have EXECUTE revoked from `public` (not just
  `anon` — `anon` inherits from `public`, which is why the first attempt at
  this in 0002 did nothing) and granted to `authenticated`
- `chapter_progress()` also checks `auth.uid()` itself rather than trusting
  grants alone

## Seeing how the class is doing

**Users** in the top bar (admins only) lists everyone with an account with
their totals. Open a name to see that person's progress chapter by chapter —
seen, score, mistakes and flags.

Row-level security still stops anyone reading another person's profile or
responses; it is unchanged. `admin_list_users()` and `admin_user_progress()`
are `security definer` and check `is_admin` themselves, so ordinary accounts
are as sealed as they were — a non-admin calling either is refused by the
database, not merely hidden in the interface.

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

## Starting everyone over

`supabase/maintenance/reset-all-users.sql` deletes every account and all
progress while keeping the question banks. It is deliberately **not** a
migration — paste it into the SQL editor by hand.

It relies on the cascade from `auth.users` to `profiles` to `responses` and
`user_prefs`. Content tables reference `banks`, never a user, so questions are
untouched.

Afterwards no accounts exist, including the admin one. Sign up again and
re-grant admin, or importing is impossible:

```sql
update profiles set is_admin = true where username = 'your-username';
```

To clear just one chapter's progress for yourself instead, use **Reset this
bank** in the app.

## Tests

```
npm test
```

Covers the first-attempt immutability rule, queue durability and replay safety,
set slicing and resize clamping, view paging, and import validation.
