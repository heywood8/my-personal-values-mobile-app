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

Three tests hard-code the catalogue size — `ValuesDB.test.js`,
`CalibrationFlow.test.js` and `translationKeyParity.test.js` — so the count in
each has to move with it. That is deliberate: a value silently dropped from the
deck is otherwise invisible.

A shipped value must not restate one that already exists. Ratings are compared
across months, and two cards meaning the same thing split the signal between
them; the parity suite only catches an identical *name*, not an identical idea.

The order entries appear in `defaultValues.json` **is** the order cards are
dealt — it mirrors the source checklist's numbering, so the file is not free to
be reshuffled for readability. `alignCatalogueOrder()` renumbers existing rows to
match on every load; without it, changing the order in the JSON would only ever
reach a fresh install, since seeding numbers just the rows it inserts.

## Removing a value from the catalogue

Dropping the entry from `defaultValues.json` is only half of it. Seeding never
deletes, so on an upgrading install the row survives and the user is dealt a card
that no longer exists in the catalogue. `retireRemovedValues()` in
`app/services/ValuesDB.js` is the other half: it archives shipped rows that are
no longer listed, and `ValuesContext` runs it right after seeding.

Two things about it are load-bearing:

- It **archives, never deletes**, for the same reason `setValueArchived` does —
  the ratings a value collected stay queryable, so a history chart spanning the
  removal is still complete and old records still resolve a name.
- It records every key it has handled in the `retired_catalogue_values`
  preference, *including* one the user had already archived. That record, not
  the `archived` flag, is what makes it a one-time step. Keying off `archived`
  instead would re-archive a value the user deliberately restored, on every
  launch, forever.

A key that stays in the catalogue but changes meaning is a different operation
and needs no retirement — the row and its ratings carry over, which is what you
want when the wording is being sharpened rather than the value replaced. Because
`key` is also the i18n suffix, a key can outlive the name it was originally
chosen for; `learning` currently renders as "Self-development". The alternative
is minting a new key, which is a new card with no history.

Whichever you do, drop the retired entry's `value_*` and `value_*_desc` strings
from both locale files. `translationKeyParity.test.js` reserves that namespace
for live catalogue entries and fails on the leftovers.

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
| `release-apk.yml` | on release, or by hand | builds the APK on EAS, attaches it to the release |
| `deploy-web.yml` | push to main | publishes the web export to GitHub Pages |
| `auto-retry.yml` | on failure | re-runs a failed run's jobs once, for flakes |

`deploy-web.yml` needs **Settings → Pages → Source** set to "GitHub Actions"
once; it needs no secrets. `release-please.yml` works with the default token and
additionally auto-merges its release PR when a `RELEASE_TOKEN` secret exists.

## Releasing the Android APK

`release-apk.yml` builds an APK on EAS and uploads it to the GitHub release as
`values-<tag>.apk`. It is a reusable workflow, reached two ways: `release-please`
calls it as a job once it has published a release, and **Actions → Release APK →
Run workflow** re-runs it for any tag that already exists.

It is called from inside `release-please.yml` rather than triggered by
`on: release`, because a release created with the default `GITHUB_TOKEN` raises
no event that can start another workflow. Give release-please a `RELEASE_TOKEN`
and that stops being true, but the direct call works either way, so it is the one
path.

Two things have to be in place before the first release:

- **`EXPO_TOKEN`** — a token from expo.dev → **Settings → Access tokens**, stored
  under **Settings → Secrets and variables → Actions**. The job fails with an
  explicit message when it is missing rather than deep inside eas-cli.
- **A linked EAS project** — run `eas init` once locally and commit the
  `extra.eas.projectId` it writes into `app.config.js`. `eas.json` sets
  `appVersionSource: "remote"`, so without the link there is no project whose
  `versionCode` can be read or incremented, and the build never starts.

The build uses the `release` profile: an APK, like `preview`, but with no
`APP_VARIANT` set, so `app.config.js` filters no architectures out and the
artifact installs on arm64 phones, older armeabi-v7a devices and x86_64 emulators
alike. `preview` is arm64-only on purpose and is the wrong thing to hand a
stranger. Signing is EAS-managed — `eas credentials` holds the keystore, and
nothing about it lives in this repository.

Moving the build onto the runner instead is what would introduce keystore secrets
(the `MYAPP_UPLOAD_*` set) and a signing step; nothing else here would change.
There is no Sentry workflow yet either — adding one means its `SENTRY_*` secrets
and a new name in `auto-retry.yml`.
