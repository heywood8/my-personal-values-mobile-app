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

### Preferences are stored twice, too

The database is the store of record, but on the web it lives in the
origin-private file system — which a browser is free not to provide, and which
`db.js` then substitutes with an in-memory database that lasts until the tab is
reloaded. Losing a few ratings that way is a disappointment; losing the language,
the rating scale and the onboarding flag means being re-dealt all 47 cards in the
wrong language on every single visit, which is what actually drove people away.

So `app/services/preferenceMirror.js` keeps a copy of `app_metadata` — that table
only — in `localStorage`. Every write through `PreferencesDB` updates it, and
`db.js` folds it back in when the database opens, filling gaps and never
overriding. Anything writing a preference by some other route is invisible to it;
go through `setPreference()`.

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

### Everything reads strongest-first

The stacked rating scale puts "very important" at the top of the card,
`getRankedResults()` returns most-important first, and the results screen opens
that way. One direction across the app: the top of anything is what matters most.
The results screen can flip to lowest-first, and that end is worth reading — it is
where the things you keep saying yes to but do not actually value collect — but it
is the reader's choice, not the default.

The numeric scales are left in their own order, 1 on the left. A row has no top
and bottom to be consistent with, and "10 9 8 …" is a scale printed backwards.

### There are no value groups

The deck used to sort each value into one of eight groups, which coloured the
cards, sectioned the deck panel and drove a second reading of the results screen.
They are gone: the source checklist is a flat list of 47 values, and the app is
now too. `group_key`, `VALUE_GROUPS`, `groupName()`, `groupColor()`, the group
breakdown chart and every `group_*` string went with them, and
`translationKeyParity.test.js` fails on a leftover. A custom value takes a name
and nothing else.

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
safety mechanism, so reordering the slots silently degrades it; three light-mode
slots sit below 3:1 contrast and are only legal because every surface that uses
them prints a visible label next to the mark — on the trend chart, the legend that
does so is also the selector.

## Records as a CSV file

`app/services/RecordsCsv.js` is the export and the import;
`app/utils/fileTransfer.js` is the platform half. On the web a save is a real
download and a load is a real file dialog, written against the DOM directly. A
phone has neither without a native picker, so a save goes to the share sheet and a
load is a paste — the UI asks `canPickFile()` rather than branching on `Platform`,
so a screen never has to know which is which.

The file's contract, and why import writes through `startAssessment`, is in
[DATABASE.md](./DATABASE.md).

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
once; it needs no secrets.

`release-please.yml` opens a pull request, and a repository may forbid that:
**Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to
create and approve pull requests"** has to be ticked before the default
`GITHUB_TOKEN` is allowed to. Untick it and the job pushes its release branch,
then dies on `GitHub Actions is not permitted to create or approve pull
requests` — the branch survives, so re-running the workflow after ticking the
box picks up where it stopped. A `RELEASE_TOKEN` secret (a PAT with `repo`
scope) sidesteps the setting entirely, and the auto-merge step needs that secret
regardless: it merges the release PR only when the PAT exists, because a
`GITHUB_TOKEN`-authored PR starts no further workflows.

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
- **A linked EAS project** — `eas.json` sets `appVersionSource: "remote"`, so
  without the link there is no project whose `versionCode` can be read or
  incremented, and the build never starts.

  Linking is two halves, and only the first is automatic. Run `eas init` once
  locally: it creates `@<account>/values` on EAS, prints the project ID, and then
  exits with `Cannot automatically write to dynamic config`. That failure is
  expected and not fatal — the project exists, and eas-cli refuses only because
  `app.config.js` is a script it cannot rewrite. A static `app.json` is the only
  config it edits itself.

  With no eas-cli to hand, `bunx eas-cli@latest init --account <name>
  --non-interactive` needs no install, and the browser does it too: create the
  project on expo.dev under the right account with the slug `values`, and copy
  the ID off its page. Nothing about the CLI is required — the ID is the only
  thing that has to arrive.

  Carry the ID across by hand, either way round:

  - set it as the **`EAS_PROJECT_ID`** repository variable under **Settings →
    Secrets and variables → Actions → Variables** — `release-apk.yml` passes it
    to the build, and the ID stays out of the repository, so a fork builds under
    its own account without a diff; or
  - paste it as the `EAS_PROJECT_ID` fallback in `app.config.js` and commit it. A
    project ID is not a secret — it ships inside every build.

  The workflow checks the resolved value before it installs anything, so a
  missing link fails in seconds with an actionable message rather than deep
  inside eas-cli. The `owner` and `slug` fields in `app.config.js` have to keep
  matching the linked project: eas-cli compares all three and refuses a build on
  any mismatch.

The build uses the `release` profile: an APK, like `preview`, but with no
`APP_VARIANT` set, so `app.config.js` filters no architectures out and the
artifact installs on arm64 phones, older armeabi-v7a devices and x86_64 emulators
alike. `preview` is arm64-only on purpose and is the wrong thing to hand a
stranger. Signing is EAS-managed — `eas credentials` holds the keystore, and
nothing about it lives in this repository.

Expect it to be slow, and mostly not for compiling. `eas build --wait` submits in
about ten seconds and then holds the runner in a queue whose length is not ours to
control; the first release build spent a full hour in it without starting, and the
job was killed still waiting on a build EAS ran to completion afterwards. Hence
`timeout-minutes: 180`. When a run does hit that ceiling the build is not lost —
eas-cli prints its URL before it starts waiting, and the finished APK can be
downloaded from that page and attached to the release by hand. Re-running the
workflow submits a *new* build instead of picking that one up, which costs another
build against the account's monthly allowance.

Moving the build onto the runner instead is what would introduce keystore secrets
(the `MYAPP_UPLOAD_*` set) and a signing step; nothing else here would change.
There is no Sentry workflow yet either — adding one means its `SENTRY_*` secrets
and a new name in `auto-retry.yml`.
