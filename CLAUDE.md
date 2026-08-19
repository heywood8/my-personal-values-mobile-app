# Values — working notes

A personal-values tracker for Android, iOS and web. Expo + React Native, SQLite
via expo-sqlite, Drizzle for the schema, no navigation library.

Two lists are tracked, not one: how much each value matters (the deck, ranked)
and — for the values that matter most — how far behaviour currently matches them
(the wheel, ten rings). They are separate tables, separate screens and separate
CSV files, and the notes below say where each of those separations is
load-bearing.

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

**The first run's other exit is a CSV file.** Every other door to the import is in
Settings, which is behind the tab shell, which a first run does not reach until it
has produced a record — so restoring a backup used to mean answering all 47 cards
and throwing the result away. `DeckImportPanel` puts the ranking import on the
first card, and only while `canExit` is false; afterwards it would be a second
door beside a door. Records landing that way end the run, and
`handleImportedRecords()` in `AppInitializer` does two things about it: it marks
onboarding complete, so deleting every record later lands on an empty results
screen rather than back in a deck with no way out, and it **drops the open
session**, which was dealt before those rows existed and would otherwise be handed
straight back to the next recalibration — blank, and calling today a new record
when the file may well have contained today. Only the ranking is offered there:
the wheel's sectors are derived from a completed ranking, so check-ins imported
first would have nothing to attach to.

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
The CSV import is not an exception — it calls `startAssessment(scale, { today:
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
fails on a leftover `group_*` string. A custom value needs only a name.

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

**The CSV files are the only backup this app has.** Nothing leaves the device
otherwise, so `app/services/RecordsCsv.js` has to keep reading files older
releases wrote: change the columns by adding, never by renaming. Import trusts
`score` and `scale` and recomputes `normalized`, because the column can be edited
in a spreadsheet and the stored pair has to agree.

There are **two** files, and they must stay two: the ranking and the check-ins
(`app/services/AlignmentCsv.js`). Alignment scores appended to a records file
would be read by every already-shipped release as *importance* ratings for that
date, replacing the record they were meant to sit beside. The cost of the split is
that "back up my data" is now two actions, so both ends are joined by hand:
`writePreUpdateSnapshot()` in `ApkInstaller.js` writes both files before an APK
install (each pruned under its own prefix, or three updates leave mismatched
halves), and the settings panel offers both. The check-ins file carries a `rings`
column purely so it is self-describing — a database row can be migrated when the
instrument changes and a file on somebody's phone cannot.

**A shared link is a reading, not a record.** `app/services/ResultsShare.js` packs
the latest ranking into the URL itself — `?r=<fingerprint>.<body>` — because there
is no server to put it on and there is not going to be one. Three things about it
are load-bearing. It travels as *keys*, so the app that opens it names each value
in its own reader's language and only a custom value carries text. It lands
**read-only**: `SharedResultsScreen` writes nothing, because an import would
resolve the sender's date through `startAssessment()` and overwrite the reader's
own record for that day — the CSV import is the door for records that are meant
to land. And the header row carries `SHARE_FORMAT`, because the link lives in
somebody's chat history and the app that finally opens it may be older or newer
than the one that wrote it; a code from a newer format is refused by name rather
than half-read.

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
