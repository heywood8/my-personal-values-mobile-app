# Development

## Requirements

- **Bun** — the package manager CI uses. `npm` works too, but `bun.lock` is what
  is committed.
- **Node 20+** for the helper scripts under `scripts/`.
- **Java 17** and the Android SDK for a native Android build; **Xcode** for iOS.
  Neither is needed to run the web target or the test suite.

## Getting started

```bash
bun install
bun run start        # Metro; press a / i / w for Android, iOS, web
bun run web          # web only
```

## Everyday commands

| Command | What it does |
|---|---|
| `bun run test` | Jest suite |
| `bun run test:coverage` | Suite with coverage, then regenerates the README badges |
| `bun run lint` | ESLint |
| `bun run lint:ci` | ESLint with `--max-warnings 0` — what CI runs |
| `bun run build:web` | Static web export into `dist/` |
| `bun run db:generate` | Regenerates migrations after a schema change (see below) |
| `bun run android` / `bun run ios` | Native debug builds |

## Layout

```
app/
  AppProviders.js     the provider stack, shared by App.js and the tests
  components/         reusable UI; components/charts/ holds the three charts
  contexts/           localisation, theme, dialogs, catalogue, assessments
  db/schema.js        Drizzle schema — the source migrations are generated from
  defaults/           the shipped value catalogue
  hooks/              cross-component hooks
  navigation/         the three-tab shell
  screens/            one file per screen
  services/           database access; one module per table plus db.js
  styles/             design tokens, semantic colours, the chart palette
  utils/              scales, dates, name resolution, language tables
assets/i18n/          one flat key/value JSON per language
drizzle/              generated migrations (do not hand-edit)
test-utils/           provider wrappers for tests
```

## Things worth knowing before you change something

### The database layer is async-only, on purpose

`app/services/db.js` never calls a `*Sync` method and does not use Drizzle's
migrator. On the web, expo-sqlite runs through wa-sqlite in a Web Worker; the
async API works there with no server configuration, but every synchronous call
needs `SharedArrayBuffer`, which needs COOP/COEP response headers that GitHub
Pages cannot send. A single sync call would break the web build only, and only at
runtime.

### Scores are stored twice

Every rating keeps the raw score the user chose *and* that score normalised to
0..1. The raw score is what gets shown back to them; the normalised value is what
every chart, sort and delta reads. Without it, a history spanning a change of
rating scale would rank 4-out-of-5 below 6-out-of-10.

### One record per calendar day

`assessments.assessed_on` is UNIQUE, and `startAssessment()` resolves through it.
That single constraint is the whole "same day overwrites, another day is a new
record" rule — no caller has to remember it.

### The web target breaks in ways tests do not catch

Two real bugs found by opening the export in a browser, neither of which any
render test would have caught:

- Paper's `ProgressBar` ignores the height given to it on react-native-web and
  stretches to fill the column, covering the screen and eating every tap.
- A Paper `Portal` mounted above its `PaperProvider` throws on first render. The
  provider order now lives in one file (`app/AppProviders.js`) that both the app
  and the tests use, so the two cannot drift.

If you touch layout, portals or storage, run `bun run build:web` and actually
open `dist/index.html` before calling it done. CI runs the export on every PR,
which catches build failures but not layout ones.

## Changing the database schema

1. Edit `app/db/schema.js`.
2. Run `bun run db:generate`. That runs drizzle-kit — which writes a new
   `drizzle/<timestamp>_<name>/` directory and updates its snapshot — and then
   `scripts/build-migrations.js`, which inlines the SQL into
   `drizzle/migrations.generated.js` for Metro and Jest to import.
3. Commit **both** the drizzle-kit output and the generated module. The snapshots
   are what let the next generate emit a diff instead of a second full schema.
4. `__tests__/db/schema.test.js` compares the declared schema against the
   generated SQL and against the database the app builds. Forgetting step 2 fails
   there.

## Adding a value to the catalogue

Add it to `app/defaults/defaultValues.json`, then add `value_<key>` and
`value_<key>_desc` to **both** files in `assets/i18n/`. Seeding is additive and
idempotent, so an existing install picks the new value up on next launch without
disturbing any rating, archive choice or custom value.

## Adding a language

1. Add a loader to `i18nLoaders` in `app/contexts/LocalizationContext.js`.
2. Add `assets/i18n/<code>.json`, translating every key in `en.json`.
3. Add the code to the three tables in `app/utils/languages.js`.

`__tests__/i18n/translationKeyParity.test.js` fails by name on a missing key, a
duplicate, a blank string, or an interpolation placeholder that does not match
English.

## Charts and colour

`app/styles/chartPalette.js` holds two palettes and explains which is for what.
Both were checked with a palette validator against this app's exact surfaces, not
chosen by eye. The categorical slot **order** is the colour-vision-deficiency
safety mechanism, so reordering the groups silently degrades it; three light-mode
slots sit below 3:1 contrast and are only legal because every surface that uses
them prints a visible label next to the mark.

## Tests

The expo-sqlite mock in `jest.setup.js` is a thin async adapter over Node 22's
built-in `node:sqlite`, so tests run real SQL against a real in-memory database:
real migrations, real UNIQUE constraints, real cascades.

Two things to remember when writing a test that renders:

- `render` from React Native Testing Library 14 is **async**. Forgetting the
  `await` fails later at the first query with "`render` function has not been
  called".
- A state update caused by `fireEvent` is not guaranteed to be committed by the
  next line under React 19. Wrap the event in `await act(async () => { … })`.

Use the wrappers in `test-utils/renderWithProviders.js` rather than assembling
providers by hand.

## CI

| Workflow | When | What |
|---|---|---|
| `npm-test.yml` | every PR | lint, tests + coverage, and a web export |
| `pr-title-check.yml` | every PR | PR title must be a Conventional Commit |
| `ossar.yml` | PRs to main, weekly | static analysis into the Security tab |
| `release-please.yml` | push to main | maintains the release PR and changelog |
| `deploy-web.yml` | push to main | publishes the web export to GitHub Pages |
| `auto-retry.yml` | on failure | re-runs a failed run's jobs once, for flakes |

`deploy-web.yml` needs **Settings → Pages → Source** set to "GitHub Actions"
once; it needs no secrets. `release-please.yml` works with the default token and
additionally auto-merges its release PR when a `RELEASE_TOKEN` secret exists.

There are no EAS or Sentry workflows yet. Adding them means adding the
corresponding secrets (`EXPO_TOKEN`, the `MYAPP_UPLOAD_*` keystore set,
`SENTRY_*`) and listing the new workflow names in `auto-retry.yml`.
