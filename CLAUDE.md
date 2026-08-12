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

**Every rating stores both `score` and `normalized`.** Raw score is what the user
sees; the 0..1 value is what every chart, sort and delta reads. They must always
agree — after a lossy scale conversion, recompute `normalized` from the rounded
score, never carry the old one across.

**`assessments.assessed_on` is UNIQUE, and that is the same-day rule.** Resolve
through `startAssessment()`; do not add a second path that writes an assessment.

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

**A value dropped from the catalogue keeps its `value_<key>` name in both
locales**, listed under `retired` in `defaultValues.json`. Its ratings survive,
so old records still render it — delete the string and that history prints
`value_family`. Descriptions are deck-card only and go with the value.

**The categorical slot order in `app/styles/chartPalette.js` is a safety
mechanism, not a style choice.** It was validated for colour-vision-deficiency
separation as an ordered set. Reordering the groups degrades it silently. Three
light-mode slots are below 3:1 contrast and are legal only because every surface
using them prints a visible label beside the mark.

## Conventions

- New user-facing strings go in **both** `assets/i18n/*.json`. The parity test
  fails by name otherwise, including on mismatched `{{placeholders}}`.
- `value_*` keys are reserved for catalogue entries. Deck UI strings use `deck_*`.
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
