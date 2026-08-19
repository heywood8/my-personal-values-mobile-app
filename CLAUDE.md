# Values — working notes

A personal-values tracker for Android, iOS and web. Expo + React Native, SQLite
via expo-sqlite, Drizzle for the schema, no navigation library.

Two lists are tracked, not one: how much each value matters (the deck, ranked)
and — for the values that matter most — how far behaviour currently matches them
(the wheel, ten rings). They are separate tables, separate screens and separate
rows in the one backup file, and the notes below say where each of those
separations is load-bearing.

Read [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for commands and layout and
[docs/DATABASE.md](docs/DATABASE.md) for the data model. This file is the short
list of things that are easy to break.

## Commands

```bash
bun run test          # jest
bun run lint:ci       # eslint, fails on warnings — what CI runs
bun run build:web     # web export into dist/
bun run db:generate   # after any change to app/db/schema.js
```

## Invariants

**The database layer is async-only.** `app/services/db.js` never calls a `*Sync`
method and never uses Drizzle's migrator. Synchronous SQLite needs
`SharedArrayBuffer`, which needs COOP/COEP headers GitHub Pages cannot send. One
sync call breaks the web build only, and only at runtime.

**Preferences are mirrored into `localStorage`, and only through
`setPreference()`.** `app/services/preferenceMirror.js` keeps a copy of
`app_metadata` — that table only — because a web reload can come back to an empty
database, and a lost language plus a lost onboarding flag means being re-dealt all
47 cards in the wrong language on every visit. Writes go through `PreferencesDB`;
`db.js` folds the mirror back in when the database opens (gaps only, the database
wins) and clears it in `resetDatabase()`. A new preference written by any other
route is invisible to it, and a reset that forgets to clear it un-resets the app
on the next launch.

**Nothing is asked in front of the deck.** A first run opens on the first card,
and the language and scale switches are on that card — `CalibrationSettings`,
rendered only at `session.index === 0`. There were two full screens here once, a
language picker and a scale picker, asked before the reader had seen anything
either applied to; both settings have a working default, so neither was ever a
question that had to be answered. `onboarding_complete` is the one step marker
left, because "opened the app" and "started the first run" are now the same
moment. A new setting does not get a screen in front of the deck.

**The first run has no way out, on purpose.** There are no results yet, so there
is no screen to close onto — `AppInitializer` passes `canExit` false and the deck
hides its close button. Restoring one without somewhere to land strands the app on
a spinner: `cancelCalibration()` clears the session, and the screen's start guard
will not deal a second one.

The one first run that *can* be left is the one started from a friend's link:
the shared screen is still held behind it, so there is somewhere to land. That
is the whole of the exception — `canExit` asks "is there a screen behind this",
and a held share code is one.

**The first run's other exit is the backup file.** Every other door to the import
is in Settings, which is behind the tab shell, which a first run does not reach
until it has produced a record — so restoring a backup used to mean answering all
47 cards and throwing the result away. `DeckImportPanel` puts the import on the
first card, and only while `canImport` is true — that is, while this reader has no
records at all; afterwards it would be a second door beside a door. It is asked
separately from `canExit` because the two stopped meaning the same thing when a
deck could be opened from a shared link: that run has somewhere to land and still
no records behind it. Records landing that way end the run, and
`handleImportedRecords()` in `AppInitializer` does two things about it: it marks
onboarding complete, so deleting every record later lands on an empty results
screen rather than back in a deck with no way out, and it **drops the open
session**, which was dealt before those rows existed and would otherwise be handed
straight back to the next recalibration — blank, and calling today a new record
when the file may well have contained today. The whole file lands here, check-ins
included — they are applied after the ranking they hang off, so their sectors
exist by the time they are written — but the run ends only when a *ranking* comes
out of it: a file of check-ins alone leaves nothing to show, so the hook does not
call `onImported` at all.

**The rating buttons do not move between cards.** Descriptions run one line to
four, so a self-sizing card walks the buttons up and down the screen and the
answer under the thumb changes from card to card. `DeckCardText` lays the whole
deck out once in a hidden zero-height layer and reserves the tallest result plus
one line as a `minHeight` — measured, not guessed, because line count depends on
width, language and font scale. Rendering the name and description straight into
the card again brings the jumping back.

**Every *importance* rating stores both `score` and `normalized`.** Raw score is
what the user sees; the 0..1 value is what every chart, sort and delta reads. They
must always agree — after a lossy scale conversion, recompute `normalized` from
the rounded score, never carry the old one across.

The rule exists because `assessments.scale` is a per-assessment fact the reader
can change, so a raw 4 means different things in different records. A rating table
may omit `normalized` only where its scale is fixed for all time and is not a
per-record fact. `alignment_ratings` is the one such case — the wheel has ten
rings and always will — and it derives the 0..1 reading on demand in
`app/utils/alignment.js`. Adding the column there would be a second number to keep
in agreement with no reader for it; adding a *scale* to that table would be worse,
because it would invite a second instrument.

**`assessments.assessed_on` is UNIQUE, and that is the same-day rule.** Resolve
through `startAssessment()`; do not add a second path that writes an assessment.
The backup import is not an exception — it calls `startAssessment(scale, { today:
<date from the file> })` for every record, which is what makes importing a date
you already have an overwrite rather than a duplicate.

The second list repeats the rule exactly: `alignment_checkins.checked_on` is
UNIQUE and everything resolves through `startCheckin()`, import included. One
difference is worth knowing — a check-in has no `completed_at`, because it is a
short list edited in place rather than a guided run with a finish button. The
sentence that flag used to carry is enforced by `getCheckins()` instead: *a
check-in exists when it has at least one score*, so a day whose only answer was
cleared stops being a record rather than becoming an entry that opens onto
nothing.

**Most important is at the top, everywhere.** The stacked rating scale deals
"very important" first, `getRankedResults()` returns strongest-first, and the
results screen defaults to that. One direction across the whole app: if a new
surface orders values, it orders them that way unless the user flips it.

**The history screen opens on the current top ten, or the whole current core
band — whichever is longer.** `defaultTrackedIds()` reads that off the latest
ranking, where the core band is a *prefix*, so both halves of the rule are one
slice. Neither half works alone: the band is the reader's own nomination and can
run past twenty, so cutting it at ten drops values they had just said matter
most; and it can be empty on a cautious 1..10 ranking that never awarded an 8,
which would open the screen on nothing at all.

Showing that many at once is what the **grid** is for — one small multiple per
value, each one framed and named, so identity is never carried by hue and the
categorical palette's ceiling never applies. The **overlay chart** stays capped at
`MAX_TRACKED_SERIES`, because there a line's identity *is* its hue; the grid is
its legend, and a card promoted into it takes that line's colour and marker
glyph. Both are drawn against the one axis `timeAxis()` builds over every
calibration date — a second copy of that mapping is exactly how a grid of small
multiples stops being a comparison and becomes twenty unrelated pictures.

**The wheel's membership is derived, and the wheel is only for the top band.**
`trackedValues()` takes the latest *completed* assessment's ranked results and
keeps what `priorityBand()` calls `core` — which on the qualitative scale is
exactly the step labelled "very important", and on 1..5 and 1..10 is the same rule
expressed in the normalised score. Two things it also does, both load-bearing:
it drops **archived** values, because the results screen shows a record and this
asks a present-tense question (and `retireRemovedValues()` archives dropped
catalogue entries in bulk on upgrade, ratings intact); and the screen adds back
anything **today already carries a score for**, because reopening a calibration
clears `completed_at` and an abandoned recalibration would otherwise empty a wheel
that is sitting there fully answered.

Which values are archived is asked of the **catalogue**, passed into
`trackedValues()`, and never read off the ranking. The ranking is a snapshot —
re-read when an assessment changes — while archiving and restoring change the
catalogue, so a rule applied to the snapshot works in one direction only: it drops
a value the moment it is archived and never brings it back when it is restored.
One source answers both.

**A past check-in is drawn from its own rows.** Never from today's membership: a
recalibration changes what the wheel asks about, so redrawing June's answers on
July's wheel would invent sectors that were never scored and hide the ones that
were. Those rows are ordered by the *current* ranking, then by deck order —
the ranking of the day it was filled in is not recoverable, and most important is
still at the top. Sector *numbers* are a legend key for the wheel currently on
screen — they are never stored, exported, or used to line a value up across two
dates. `valueId` is what does that, and it is what the dashed previous-check-in
outline matches on.

**Every alignment write is folded into `AlignmentContext`'s `history` as it
lands.** That copy is otherwise only assigned by `reload()`, which makes it a
snapshot silently missing everything answered in this session — and it is what the
coverage counts, the previous check-in and a past wheel's rows are all read from.
The day it hurts is the one that has just stopped being today: open the app across
midnight, tap yesterday's record first, and it opened onto an empty wheel, because
tapping a record row is state inside the screen and never re-renders the provider
at all. Do not add a repair that depends on the provider re-rendering; keep the
copy true continuously.

**On the wheel, "not answered" must not look like "zero".** The centre means "my
behaviour does not correspond to this value", so an unanswered sector is left
blank over a surface-coloured disc rather than filled with the track colour that
means "the rest of the range" elsewhere. Most days start with a wheel that is
almost entirely unanswered; drawing that as a picture of total failure would be a
claim the reader never made. For the same reason the previous check-in appears as
a dashed *shape* while an answer is being decided, and its number appears beside a
row only after that row is answered — the deck's refusal to prefill is the same
rule, and alignment is the more anchor-prone of the two measurements.

**A wheel sector is pointed at by geometry, not by pressing its shape.** A
sector carries a number and nothing else, so hovering one on the web or tapping
it on a phone names the value and prints its description under the wheel —
`sectorAt()` in `app/utils/wheelGeometry.js` answers which sector a point is in,
and `AlignmentWheel` lays one hit layer over the whole canvas rather than making
each wedge pressable. It has to work that way: on most days most sectors are
unanswered, and an unanswered sector puts no ink on the canvas for a press to
land on. The mark is drawn out to the rim for the same reason.

Hover is filtered to `pointerType === 'mouse'`, and that guard is load-bearing:
a finger on a web page emits pointer events too, including a `pointerleave` the
instant it lifts, which wipes the selection the tap has just made. Drop the
guard and tapping a sector stops working on exactly the platform the taps were
for.

**Provider order lives in `app/AppProviders.js` only.** Both `App.js` and the test
wrappers import it. Listing providers separately is how the app once shipped a
Paper `Portal` above its `PaperProvider` while every test passed.

**Catalogue seeding is additive and idempotent.** It runs on every launch and
must never rename or un-archive an existing row. Two companions run beside it,
also on every launch, and the deck is wrong without them: `retireRemovedValues()`
archives shipped rows the catalogue has dropped, and `alignCatalogueOrder()`
renumbers shipped rows to their catalogue position. Seeding alone touches only
rows it inserts, so on an upgrading install a removal would leave both decks in
play and a reorder would do nothing at all.

**The deck is dealt in `defaultValues.json` order, which is the source
checklist's numbering.** The file is not free to be reshuffled for readability.
This replaced a round-robin-across-groups order; the anti-anchoring property was
given up on purpose, for fidelity to the printed instrument.

**There are no value groups.** The deck was once sorted into eight of them; the
source checklist is a flat list and so is this app. Nothing in the schema, the
catalogue file, the UI or the locale files names a group, and the parity test
fails on a leftover `group_*` string.

**The deck is the shipped catalogue, and nothing else.** There is no adding,
renaming or deleting a value: `ValuesDB` writes no `personal_values` row outside
seeding, the panel in Settings offers archiving alone, and the import skips a row
it cannot match rather than inventing a value to hold it. The instrument is
somebody else's list of 47, and an app that let it be edited would be measuring
something different on every phone. `is_custom` and `custom_name` are still read,
because installs that predate the change hold such rows with ratings hanging off
them and a dropped name prints as a uuid — but nothing writes them.

**A value dropped from the catalogue keeps its `value_<key>` name in both
locales**, listed under `retired` in `defaultValues.json`. Its ratings survive,
so old records still render it — delete the string and that history prints
`value_family`. Its description goes with it: a description is printed wherever
a value is being rated or read — the deck card, the ranked list, the wheel's
rows — and all three print nothing when there is none, so a retired value keeps
its name and loses its description.

**The categorical slot order in `app/styles/chartPalette.js` is a safety
mechanism, not a style choice.** It was validated for colour-vision-deficiency
separation as an ordered set. Reordering the slots degrades it silently. Three
light-mode slots are below 3:1 contrast and are legal only because every surface
using them prints a visible label beside the mark.

**`colors.surface` is the surface those palettes were validated against, and it
does not move.** `#ffffff` on light, `#181b23` on dark — every contrast figure in
`chartPalette.js`'s header is a figure against exactly those two, so repainting
either silently invalidates the whole validation while nothing on screen looks
wrong. Two things follow. Retuning the light or dark scheme means moving
`background`, `card`, `border` and the rest *around* a fixed `surface`. And a new
chart goes **on** `surface` rather than straight onto the background: the ranked
list and the comparison bars are each wrapped in a surface card for that reason
and not for the looks.

**Depth is a token, and it is mode-dependent for a reason.** `elevation(level,
mode)` in `app/styles/designTokens.js` returns a `boxShadow` style — three levels,
1 resting, 2 chosen, 3 floating. `boxShadow` rather than the `shadow*` props,
which react-native-web 0.21 warns are deprecated and which never rendered on
Android at all; the new architecture (enabled here) draws it natively on both
platforms, so one string covers all three targets. The dark scale is deliberately
shallower: a shadow is the absence of light and reads as nothing on a near-black
page, so what separates a dark card from a dark background is that `card` is
*lighter* than `background`. Both schemes therefore keep a real gap between
`background` and `surface`/`card` — closing it takes the elevation scale with it.

**A `lineHeight` in a StyleSheet does not scale with the reader's font size.**
React Native grows a `fontSize` with the system font-size setting and leaves the
`lineHeight` beside it exactly where it was written, so at 200% the text prints on
top of itself. `LINE_HEIGHT` in the tokens is therefore a set of *multipliers*:
multiply the font size by one of them. Where the font scale is genuinely in play —
the deck card's name and description, which are also measured — multiply by
`PixelRatio.getFontScale()` as well, and put the result in an inline style rather
than the sheet (see `DeckCardText`).

**The backup file is the only backup this app has.** Nothing leaves the device
otherwise, so `app/services/BackupCsv.js` has to keep reading files older
releases wrote: change the columns by adding, never by renaming. Import trusts
`score` and `scale` and recomputes `normalized`, because the column can be edited
in a spreadsheet and the stored pair has to agree.

It is **one** file holding both lists, and what makes that safe is the header. It
was two — the ranking and the check-ins — because alignment scores appended to a
*records* file are read by every already-shipped release as importance ratings for
that date, replacing the record they were meant to sit beside. This file names no
column such a release looks for (`kind` and `date`, not `assessed_on` or
`checked_on`), so it is refused whole rather than half-read; both old shapes still
import here, recognised by their own date column. Reintroducing `assessed_on` as
a column name, in any form, is the change that breaks that. The `rings` column
rides along on alignment rows purely so the file is self-describing — a database
row can be migrated when the instrument changes and a file on somebody's phone
cannot.

**Half a backup is not an error, and the report says what landed.** Either list
may be missing from the file, from the database, or from what an import could
match; each half is written independently and counted independently, and the
dialog is built from the halves that are non-zero. A line reading "check-ins: 0"
would report a failure the file never claimed. One thing the import must not do is
clear a date it cannot refill: replacing a record starts by clearing it, so a date
whose every row names a value this deck does not have is skipped before that
happens.

**A shared link is a reading, not a record.** `app/services/ResultsShare.js` packs
the latest ranking into the URL itself — `?r=<fingerprint>.<body>` — because there
is no server to put it on and there is not going to be one. Three things about it
are load-bearing. It travels as *keys*, so the app that opens it names each value
in its own reader's language and only a value the opening app cannot name carries
text. It lands **read-only**: `SharedResultsScreen` writes nothing, because an
import would resolve the sender's date through `startAssessment()` and overwrite
the reader's own record for that day — the backup import is the door for records
that are meant to land. And the header row carries `SHARE_FORMAT`, because the link lives in
somebody's chat history and the app that finally opens it may be older or newer
than the one that wrote it; a code from a newer format is refused by name rather
than half-read.

**The wheel travels in that link too, and only when it is asked for.** It is a
fourth column on each value's row and a fourth column on the header (the check-in's
date), never a number folded into the importance score — the same separation the
backup file's `kind` column keeps. What forced the two files apart does not apply
here: a shipped
release would misread alignment scores appended to a records file as importance
ratings, while a trailing column it has never heard of is simply ignored, which is
why one link can carry both lists and `SHARE_FORMAT` is still 1. Adding a column
in front of those, or reusing one, is the change that would need the bump.

The switch is on the results screen, it starts off on every visit, and it is
deliberately **not** a stored preference: `shareResults({ includeAlignment })`
takes it as an argument. "How much this matters to me" and "how far I am from
living it" are not equally comfortable things to hand somebody, and a switch left
on would answer the second one silently the next time.

**A comparison is still a reading.** With a ranking of their own, the reader gets
the two lists side by side (`app/utils/comparison.js`, `ComparisonBars`), and the
screen stays read-only and stateless: its half of the comparison arrives as a
**prop** from `AppInitializer`, which already holds both contexts. A version that
called `useAssessment()` itself would stop rendering for the one visitor the screen
exists for — somebody who has never opened the app, whose whole data is the link.
Comparison is on the normalised score, because the two sides need not have used
the same scale, and matching is on `key`, so two values added by hand on two
different phones never match: their keys are uuids minted separately, and merging
them by name would merge two strangers' words.

The fingerprint in front of the body is a checksum — it tells a truncated link
from a whole one, and nothing else. It is not a signature, anyone holding the
link can read what is in it, and the screen offering it says so. Sending works
everywhere (`app/utils/linkSharing.js`, asked by predicate like `canPickFile()`);
*receiving* is the web's alone, since a phone would need a deep link only somebody
who already has the app can follow — which is why every link points at the
published web export.

**`app/services/ApkInstaller.js` is never imported statically.** It is the only
module touching expo-file-system and expo-intent-launcher, and the latter has no
web implementation — a static import puts it in the web bundle's module graph and
evaluates it on load. `AppUpdateService.js` reaches it with `await import()` from
behind `canInstallUpdates()`. Metro splits it into its own chunk; if
`ApkInstaller` stops appearing as a separate bundle in `bun run build:web`
output, something started importing it eagerly.

## Conventions

- New user-facing strings go in **both** `assets/i18n/*.json`. The parity test
  fails by name otherwise, including on mismatched `{{placeholders}}`.
- `value_*` keys are reserved for catalogue entries. Deck UI strings use `deck_*`.
- Web-only capabilities (a file dialog, a download) are asked for by predicate —
  `canPickFile()` in `app/utils/fileTransfer.js` — not by branching on `Platform`
  in a screen.
- Interactive surfaces use `Pressable`, not `TouchableOpacity`.
- Confirmations go through `useDialog()`, never `Alert.alert` — `Alert` is a
  silent no-op on web.
- ESLint enforces alphabetical style keys and sorted `StyleSheet` entries;
  `lint:fix` handles both.

## Testing

- `render` from RNTL 14 is **async** — `await` it, or the first query fails with
  "`render` function has not been called".
- Wrap `fireEvent` in `await act(async () => { … })`; React 19 does not guarantee
  the update is committed by the next line.
- The expo-sqlite mock is a real `node:sqlite` database, so migrations,
  constraints and cascades are genuinely exercised. Call
  `__resetDatabaseHandleForTests()` in `beforeEach`.
- Use the wrappers in `test-utils/renderWithProviders.js`.

## The web target

It breaks in ways the test suite cannot see — layout and portals, mostly. If a
change touches either, or storage, run `bun run build:web` and open
`dist/index.html` in a browser before calling it done. Known casualties so far:
Paper's `ProgressBar` (stretches to fill the column instead of honouring its
height) and Paper `Portal` ordering.
