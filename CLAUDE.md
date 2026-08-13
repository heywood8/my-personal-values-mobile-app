# Values — working notes

A personal-values tracker for Android, iOS and web. Expo + React Native, SQLite
via expo-sqlite, Drizzle for the schema, no navigation library.

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

**Every rating stores both `score` and `normalized`.** Raw score is what the user
sees; the 0..1 value is what every chart, sort and delta reads. They must always
agree — after a lossy scale conversion, recompute `normalized` from the rounded
score, never carry the old one across.

**`assessments.assessed_on` is UNIQUE, and that is the same-day rule.** Resolve
through `startAssessment()`; do not add a second path that writes an assessment.
The CSV import is not an exception — it calls `startAssessment(scale, { today:
<date from the file> })` for every record, which is what makes importing a date
you already have an overwrite rather than a duplicate.

**Most important is at the top, everywhere.** The stacked rating scale deals
"very important" first, `getRankedResults()` returns strongest-first, and the
results screen defaults to that. One direction across the whole app: if a new
surface orders values, it orders them that way unless the user flips it.

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
`value_family`. Descriptions are deck-card only and go with the value.

**The categorical slot order in `app/styles/chartPalette.js` is a safety
mechanism, not a style choice.** It was validated for colour-vision-deficiency
separation as an ordered set. Reordering the slots degrades it silently. Three
light-mode slots are below 3:1 contrast and are legal only because every surface
using them prints a visible label beside the mark.

**The CSV file is the only backup this app has.** Nothing leaves the device
otherwise, so `app/services/RecordsCsv.js` has to keep reading files older
releases wrote: change the columns by adding, never by renaming. Import trusts
`score` and `scale` and recomputes `normalized`, because the column can be edited
in a spreadsheet and the stored pair has to agree.

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
