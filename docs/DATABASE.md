# Database

SQLite on every platform, through `expo-sqlite`. Schema is declared with Drizzle
in `app/db/schema.js`; queries are plain async SQL in `app/services/*DB.js`.

## Why Drizzle declares the schema but does not run it

Drizzle is the schema's source and drizzle-kit generates the migrations, but the
app applies them itself (`runMigrations` in `app/services/db.js`). Drizzle's
Expo migrator is synchronous, and synchronous SQLite is unavailable in a browser
without COOP/COEP headers — see the async-only note in
[DEVELOPMENT.md](./DEVELOPMENT.md). The app's own migrator is a loop over the
generated SQL, tracking progress in `PRAGMA user_version`.

`__tests__/db/schema.test.js` compares the declared schema against the generated
SQL and against the live database, so the two halves cannot drift apart.

## Tables

### `app_metadata`

Key/value preferences, behind `app/services/PreferencesDB.js`: language, theme,
rating scale, onboarding state, the results screen's view and sort toggles, and
the name of the reader's backup spreadsheet in Google Drive.

| column | type | notes |
|---|---|---|
| `key` | text | primary key |
| `value` | text | always stored as a string |
| `updated_at` | text | ISO timestamp |

This is the one table that is also kept outside the database — see
[the mirror](#the-localstorage-mirror) below.

One of its keys is an onboarding *step* rather than a setting:
`onboarding_complete` says the first calibration finished, which is what decides
between opening on the deck and opening on the tabs. There is only one such key
because there is only one step — nothing is asked in front of the deck, so
"started the app" and "started the first run" are the same moment. A `1` here and
no records at all is the normal state of an install whose database the web target
lost; it keeps that person out of a second first run.

An earlier release also stored `onboarding_scale_chosen`, marking the answered
scale question. The question is gone — the scale switch sits on the first card of
the deck — and so is the key. Upgrading installs are left with the row; nothing
reads it.

### `personal_values`

The value catalogue. Named `personal_values` because `VALUES` is reserved in
SQLite's grammar. Seeded from `app/defaults/defaultValues.json` on first launch;
seeding is additive and idempotent, so a release that ships new values adds them
without touching anything the user has already rated.

| column | type | notes |
|---|---|---|
| `id` | text | primary key; equals the catalogue key |
| `key` | text | unique; i18n suffix — the name renders as `t('value_' + key)` |
| `is_custom` | integer | 1 for a value the user added on a release that allowed it; nothing writes it any more |
| `custom_name` | text | that value's own wording; null for catalogue values |
| `display_order` | integer | deck order — the source checklist's numbering, 1..47 |
| `archived` | integer | archived values stay in past records but are not dealt |

The table used to carry a `group_key`, sorting every value into one of eight
groups. The groups are gone — the source checklist is a flat list — and the
column went with them in `20260812134435_steep_apocalypse`. Nothing was lost with
it: no rating or archive choice ever depended on the group.

Values of the user's own are the other thing this table no longer gains. The deck
is the shipped catalogue: nothing adds, renames or deletes a row, and the panel in
Settings offers archiving alone. The two columns above stay because installs that
predate the change still hold such rows, with ratings and check-ins hanging off
them — the name lives in `custom_name` rather than in a locale file, and every
read path still carries it or a record prints a uuid.

### `assessments`

One calibration run.

| column | type | notes |
|---|---|---|
| `id` | text | primary key |
| `assessed_on` | text | local `YYYY-MM-DD`, **UNIQUE** |
| `scale` | text | `numeric5` \| `numeric10` \| `qualitative` |
| `completed_at` | text | null while the run is in progress |

The UNIQUE constraint on `assessed_on` is the same-day rule. `startAssessment()`
either finds today's row — and overwrites into it — or creates one. Nothing else
in the app has to know about the rule.

The scale is stored per assessment, not globally, so changing the preference
later cannot retroactively reinterpret old scores. The one exception is a run
reopened the same day, whose existing scores are re-expressed in the new scale so
a single day's record never mixes two.

### `ratings`

One value's score within one assessment.

| column | type | notes |
|---|---|---|
| `id` | text | primary key |
| `assessment_id` | text | → `assessments.id`, ON DELETE CASCADE |
| `value_id` | text | → `personal_values.id`, ON DELETE CASCADE |
| `score` | integer | the raw score, in this assessment's scale |
| `normalized` | real | the same score mapped to 0..1 |

Unique on `(assessment_id, value_id)`, so re-rating a card during a run replaces
the earlier answer rather than stacking a second.

`normalized` is denormalised data, deliberately. It is what every chart, sort and
over-time comparison reads; without it a history spanning a scale change would be
comparing 4-out-of-5 against 4-out-of-10. When a score is converted between
scales, `normalized` is recomputed from the **rounded** result so the stored pair
always agrees with the number shown on screen.

Cascades depend on `PRAGMA foreign_keys = ON`, which `db.js` sets per connection
— SQLite has foreign keys off by default.

### `alignment_checkins`

One filling-in of the wheel — the second trackable list. Where `assessments` asks
how much each value matters, this asks, for the values that matter most, how far
behaviour currently matches them.

| column | type | notes |
|---|---|---|
| `id` | text | primary key |
| `checked_on` | text | local `YYYY-MM-DD`, **UNIQUE** |

Same constraint, same rule, same shape of resolver: `startCheckin()` either finds
today's row or creates one, and nothing else writes here.

There is no `completed_at`. An assessment has one because the deck is a guided run
of 47 cards with a finish button at the end; a check-in is a short list — as many
rows as the reader called very important — edited in place, and a partly filled
wheel is a legible answer rather than an unfinished one. The job that flag was
also doing, keeping an empty record out of every list, is done by `getCheckins()`
instead: it returns only check-ins that have at least one score. *A check-in
exists* means *a check-in has at least one score*. The empty row itself is kept,
for the same reason an abandoned calibration is — the next score given that day
belongs in it.

`updated_at` is written by the row's score writers rather than by the row itself,
which has no state of its own to change.

### `alignment_ratings`

One value's alignment within one check-in.

| column | type | notes |
|---|---|---|
| `id` | text | primary key |
| `checkin_id` | text | → `alignment_checkins.id`, ON DELETE CASCADE |
| `value_id` | text | → `personal_values.id`, ON DELETE CASCADE |
| `score` | integer | 1..10 — which ring out of ten behaviour reaches |

Unique on `(checkin_id, value_id)`, so changing an answer during the day replaces
it rather than stacking a second.

**No `normalized` column, on purpose.** `ratings` carries one because
`assessments.scale` is a per-assessment fact the reader can change, so a raw 4
means different things in different records. The wheel has ten rings and always
will — one scale, so the raw score is already comparable across every check-in,
and a stored 0..1 copy would be a second number to keep in agreement with nothing
reading it. `app/utils/alignment.js` derives the fraction on demand for the chart.

Which values a check-in covers is **not** stored. It does not need to be: the rows
themselves are the record of what was on the wheel that day, which is what lets a
past check-in be redrawn exactly as it was filled in, however the ranking has moved
since. What *is* derived, and only for today, is the current membership — the
latest completed assessment's top priority band, minus anything archived.

## Getting the data out, and back in

`app/services/BackupCsv.js` writes everything the app holds as one file and reads
the same shape back. It is the only backup this app has — nothing leaves the
device otherwise — so the columns are additive: a later release may add one, never
rename one, or a file written by an earlier version stops importing.

```
kind,date,scale,value_key,value_name,score,normalized,rings
importance,2026-08-12,numeric5,love,Love,5,1,
alignment,2026-08-12,,love,Love,7,,10
```

`kind` says which of the two lists a row belongs to, and each row carries only the
columns its kind has. An importance row names the `scale` it was taken on,
because a raw 4 means different things on 1..5 and 1..10, and carries a
`normalized` reading so the file is legible beside a ranking. An alignment row
carries `rings` instead: the denominator, here rather than only in the database
because a database row can be migrated when an instrument changes and a file saved
to somebody's phone last year cannot — a 7 means nothing without the 10 beside it.
A file written before that column existed is a ten-ring file by definition; a file
naming any other denominator has its rows skipped and counted, because rescaling
would restate an answer nobody gave.

Import writes through the same two functions the app itself uses. Every ranking
resolves through `startAssessment(scale, { today: <the file's date> })` and every
check-in through `startCheckin({ today: <the file's date> })`, so a date that
already has one is reopened rather than duplicated — the same-day rule, unchanged
— and its existing answers are cleared first, so importing a file twice leaves the
same database as importing it once. `normalized` is recomputed from `score`, never
read from the file: the column is editable in a spreadsheet, and the stored pair
has to agree. Check-ins are **not** filtered against current membership: a backup
restored months later names the values that mattered then, which is the situation
the file exists for.

A value is matched by `value_key`, then by `value_name`. Anything still unmatched
is skipped and counted — the deck is the shipped catalogue, so a row naming a
value this install does not have is a row it cannot express. A date whose every
row is unmatched is left alone entirely rather than cleared, because clearing is
how an import replaces a date and there would be nothing to put in its place.

### Why it is one file, and what makes that safe

It used to be two, a records file and a check-ins file, and the reason was real:
every already-shipped release reads a records file by column name and would take
alignment rows as *importance* ratings against that date, replacing through
`startAssessment` the very record they were meant to sit beside. The cost was that
"back up my data" was two actions somebody could do half of.

What makes one file safe is the header. This file names no column an older release
looks for — `kind` and `date` where the records file had `assessed_on` and the
check-ins file had `checked_on` — so such a release refuses it whole ("that is not
a records file") rather than half-reading it. Both older shapes still import here,
because they are sitting on people's phones; each is recognised by its own date
column, and every row in it is of one kind by definition.

Either list may be missing, in the file and in the database, and none of that is
an error: a backup taken before the reader ever filled in the wheel has no
check-ins, and a reader restoring one gets told what actually landed rather than a
line claiming zero of what was never there. `writePreUpdateSnapshot()` writes the
same one file before an in-app APK install, rotating the newest three.

### The same table, in a spreadsheet

The file is not the only carrier. `app/services/GoogleSheets.js` puts the very
same rows — header included — into a spreadsheet in the reader's own Google
Drive, and reads them back the same way. `BackupCsv.js` builds and parses *rows*;
the CSV serialiser sits on top of that, so a column added for the file is a
column the sheet gets, and a sheet downloaded as CSV imports through the file
door without anything having to agree twice.

Nothing about the rules above changes for that route. A sheet is loaded through
the same confirmation, resolves each date through `startAssessment` /
`startCheckin`, recomputes `normalized`, and counts the rows it could not match.
What is different is only where the rows came from and that it needs a Google
account: which spreadsheet is decided by name (`google_sheet_name` in
`app_metadata`, default `my-personal-values.xlsx`), the app can only see the file
it created itself, and the access token is never stored anywhere — see
[DEVELOPMENT.md](./DEVELOPMENT.md#the-google-sheets-backup).

### The share link, and why it never comes back in

There is a third way data leaves the device, and it is not a backup.
`app/services/ResultsShare.js` packs the latest ranking into a link —
`?r=<fingerprint>.<body>`, holding the date, the scale and one four-bit score per
catalogue slot — which the reader hands to somebody else. Nothing is uploaded:
the reading *is* the string, which is what lets a static export with no server
behind it show a friend's results.

It has no import path, deliberately. Writing it would mean resolving the sender's
date through `startAssessment()`, which is the same-day rule, which means
overwriting the reader's own record for that day with somebody else's answers.
The backup file is how records travel between installs that mean to keep them;
a link is a reading, and `SharedResultsScreen` renders it without touching the
database at all.

Values travel as identity for the same reason the backup file matches on
`value_key` — a name is not stable across installs and languages — with one
difference: a link does not spell the key out either. It carries a *slot* in
`app/services/shareIndex.js`, a frozen append-only list, because the deck is the
shipped catalogue and both ends of a link already know it; the app that opens the
link resolves the slot to a key and names it in its own reader's language. A value
with no slot — one the reader added on an older release, or a catalogue entry from
a newer one — travels as text instead, which is also why two values added by hand
on two different phones never match when two rankings are compared: their keys are
uuids minted separately.

The wheel can go along, when the sender switches it on — one alignment score per
slot and the check-in's date, in a section of its own. That is the one place the
two lists share a carrier, and it is allowed for the reason the CSV files are not:
a reader steps over a section it has never heard of by the length written in front
of it, whereas alignment scores appended to a records file would be read as
importance ratings for that date. None of it comes back in either — a comparison
is drawn on screen and nothing about it is written.

## Storage locations

| Platform | Where |
|---|---|
| Android / iOS | app sandbox, `values.db` |
| Web | the origin-private file system, via wa-sqlite in a Web Worker |

If the browser cannot provide OPFS — a private-browsing mode, or a non-secure
context — `db.js` falls back to an in-memory database so the app still runs, and
Settings shows a warning that the session will not be kept.

### The localStorage mirror

`app_metadata`, and nothing else, is mirrored into `localStorage` by
`app/services/preferenceMirror.js`, under `values.pref.*`. It exists for the case
above: a web reload that comes back to an empty database would otherwise be a
first launch, and the reader would answer the language question, the scale
question and 47 cards again — every visit.

| | |
|---|---|
| written | beside every `setPreference()` / `deletePreference()`, before the database write, which cannot make it fail |
| read | when the database opens (`restoreMirroredPreferences`), and when a preference read throws |
| precedence | `INSERT OR IGNORE`: a key the database already has wins, so this only fills gaps |
| cleared | by `resetDatabase()`, or the reset would hand everything straight back |
| availability | probed with a real write — Safari's private mode has the API and throws from the setter. React Native has no `localStorage`, so on a phone this is inert and the database is simply the only copy |

The mirror keeps preferences, not data. A browser that cannot persist the
database still loses every rating on reload; what it no longer loses is the
answer to "which language" and "which scale".
