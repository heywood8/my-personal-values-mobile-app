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
  components/         reusable UI; components/charts/ holds the charts
  contexts/           localisation, theme, dialogs, catalogue, assessments, alignment
  db/schema.js        Drizzle schema — the source migrations are generated from
  defaults/           the shipped value catalogue
  hooks/              cross-component hooks
  navigation/         the four-tab shell
  screens/            one file per screen
  services/           database access; one module per table plus db.js
  styles/             design tokens, semantic colours, the chart palette
  utils/              scales, dates, name resolution, language tables, wheel
                      geometry, file and link transfer
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

### Importance scores are stored twice

Every rating keeps the raw score the user chose *and* that score normalised to
0..1. The raw score is what gets shown back to them; the normalised value is what
every chart, sort and delta reads. Without it, a history spanning a change of
rating scale would rank 4-out-of-5 below 6-out-of-10.

The reason is that the *scale* is a per-assessment fact the reader can change.
Alignment check-ins have no such freedom — the wheel has ten rings and always
will — so `alignment_ratings` stores the raw score only, and derives the 0..1
reading in `app/utils/alignment.js` when a chart needs one. That is the escape
condition for the rule, and the only case that meets it.

### One record per calendar day

`assessments.assessed_on` is UNIQUE, and `startAssessment()` resolves through it.
That single constraint is the whole "same day overwrites, another day is a new
record" rule — no caller has to remember it.

`alignment_checkins.checked_on` repeats it exactly, resolved through
`startCheckin()`. Both CSV imports go through those two functions rather than
around them, which is what makes importing a date you already have an overwrite
instead of a duplicate.

### The second list

The deck answers "how much does this matter". The wheel answers the other half of
the same instrument: for the values that came out at the top, how far does
behaviour currently match them. It is ten rings, one sector per very important
value, filled from the centre out — the centre reading "my behaviour does not
correspond to my values" and the rim "I live fully in accordance with them".

| file | what it does |
| --- | --- |
| `app/utils/alignment.js` | the ten rings, and what counts as very important |
| `app/utils/wheelGeometry.js` | the arcs, as pure numbers — see below |
| `app/services/AlignmentDB.js` | check-ins and their scores; the same-day rule again |
| `app/services/AlignmentCsv.js` | the second backup file, and why it is a second one |
| `app/contexts/AlignmentContext.js` | today's scores, and any past date's |
| `app/components/charts/AlignmentWheel.js` | the drawing |
| `app/screens/AlignmentScreen.js` | the tab |

Membership is derived rather than chosen: the latest completed assessment's top
priority band (`core`), minus whatever the catalogue currently has archived, plus
anything today already carries a score for. Neither qualifier is tidiness. The
archived set comes from the catalogue rather than the ranking because the ranking
is a snapshot, so a rule read off it would drop an archived value and never
restore a restored one. And reopening a calibration clears `completed_at`, so an
abandoned recalibration would otherwise empty a wheel that is sitting there fully
answered. A *past* check-in is drawn from its own stored rows instead, because the
ranking moves and its record must not.

`AlignmentContext` folds every write into its `history` copy as it lands, rather
than waiting for the next `reload()`. Everything reads that copy — the coverage
counts, the previous check-in, the rows a past wheel is drawn from — and a
snapshot taken at mount is missing this whole session. A repair keyed on the
provider re-rendering is not enough: opening a record is state inside the screen
and never re-renders the provider.

The wheel's maths lives in `app/utils/wheelGeometry.js`, away from the component,
because that is the half no render test can see: under jest an SVG element accepts
a negative radius and a `d` full of `NaN` without a murmur, and only a browser
refuses to draw them. Assert the arithmetic as numbers there, assert structure in
the component test, and open the web export for the rest.

### The web target breaks in ways tests do not catch

Three ways this target behaves differently, none of which any render test would
have caught. The first two were found the hard way, by opening the export in a
browser; the third is the same class of problem, caught while writing the wheel:

- Paper's `ProgressBar` ignores the height given to it on react-native-web and
  stretches to fill the column, covering the screen and eating every tap.
- A Paper `Portal` mounted above its `PaperProvider` throws on first render. The
  provider order now lives in one file (`app/AppProviders.js`) that both the app
  and the tests use, so the two cannot drift.
- An `<Svg>` given an explicit pixel width and no `viewBox` cannot shrink into a
  narrower column, and react-native-web only reports a layout after the first
  paint — so the alignment wheel overflowed its column for a frame on a 320px
  viewport. The `viewBox` is what lets it scale instead.

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
them prints a visible label next to the mark — on the overlay trend chart, the
grid of cards that does so is also the selector.

### The history screen is two layers, and the split is the palette

`app/components/charts/TrendGrid.js` is the default reading: one small multiple
per tracked value, on the axis `app/utils/trendScale.js` builds over *every*
calibration date and on an absolute 0..1 y range. Because each card is framed and
named, identity is never carried by hue, so the grid can show ten or twenty
values — which is what `defaultTrackedIds()` in `app/utils/history.js` opens it
on: the current top ten, or the whole current core band, whichever is longer.

`app/components/charts/TrendChart.js` is the second layer, for the one question a
grid cannot answer — did these two cross, and when. It is capped at
`MAX_TRACKED_SERIES`, because there a line's identity *is* its hue. Tapping a
card promotes it, and the card then takes that line's categorical colour and
marker glyph; an unfocused card takes the ordinal priority step instead, the same
ramp the ranked results use. That is why the overlay needs no legend of its own.

Before the second calibration there is no line to draw, so a card carries a level
bar rather than a sparkline: a 44px box cannot separate 100% from 75% at a
glance, and a bar across the card can.

## Records as CSV files

`app/services/RecordsCsv.js` is the export and the import;
`app/utils/fileTransfer.js` is the platform half. On the web a save is a real
download and a load is a real file dialog, written against the DOM directly. A
phone has neither without a native picker, so a save goes to the share sheet and a
load is a paste — the UI asks `canPickFile()` rather than branching on `Platform`,
so a screen never has to know which is which.

There are two files: the ranking and the alignment check-ins. They are separate
because appending alignment rows to a records file would make every already-shipped
release read them as importance ratings and overwrite the record for that date.
Both contracts, and why each import writes through the app's own resolver, are in
[DATABASE.md](./DATABASE.md).

The controls are one component, `app/components/CsvTransferSection.js`, mounted
three times: twice in the settings panel, once per file, and once on the first
card of the deck. That third mount is the only import a first run can reach — the
settings screen is behind results that do not exist yet — so it offers the ranking
alone, and records arriving through it end the run: see the first-run notes in
[../CLAUDE.md](../CLAUDE.md) for what `AppInitializer` has to do about the
calibration the reader was in the middle of.

Because a complete backup is now two files, both ends are joined deliberately:
`writePreUpdateSnapshot()` writes both before an in-app APK install and prunes
each prefix separately, and the settings screen offers both exports. A change that
adds a third record type has to do the same, or it ships a backup with a hole in
it.

## Sharing a result as a link

The results screen can hand the ranking to somebody else. There is no server to
put it on, so the link carries the reading itself:

```
https://heywood8.github.io/my-personal-values-mobile-app/?r=1a0mjed.MSoyMDI2LTA4...
```

| file | what it does |
| --- | --- |
| `app/services/ResultsShare.js` | the format: what goes in a code, and how it is read back |
| `app/utils/linkSharing.js` | the platform: where a link points, how it is sent, how it arrives |
| `app/hooks/useResultsShare.js` | the flow, and what is said about each outcome |
| `app/screens/SharedResultsScreen.js` | what the friend sees |

Inside the parameter is a base36 fingerprint, a dot, and a base64url body holding
the date, the scale and one `key,score` pair per rated value. A full 47-value deck
comes to about 900 characters with the URL in front of it.

Four properties are worth knowing before changing any of it:

- **It is an encoding, not encryption.** Anyone with the link can read it, and the
  screen that offers the link says exactly that. The fingerprint is a checksum
  against a link that arrived in half — the failure that actually happens, when a
  chat client wraps a long URL and only the first line gets copied. It is not a
  signature and proves nothing about who made the link.
- **Values travel as keys.** `love`, not "Love" — so a ranking shared in Russian
  reads in English on the other side, resolved by the app that opens it. Only a
  custom value travels as text, because no other install can name it.
- **Nothing is written on arrival.** The shared screen renders and closes; it
  never touches the database. An import would resolve the sender's date through
  `startAssessment()` and overwrite the reader's own record for that day, and a
  friend's ranking is not a backup of yours. That is what the CSV import is for.
- **Sending is universal; receiving is the web's.** A phone hands the link to the
  system share sheet, a browser to its own share sheet or the clipboard. Nothing
  reads a link on a phone: that would need a deep link registered against
  `com.heywood8.values://`, which only opens for somebody who already has the app
  — the opposite of sharing with a friend. So every link points at the published
  web export, which opens in any browser. A copy of the app running on the web
  shares *itself*, so a fork's deployment and a local export both produce links
  that work; `EXPO_SHARE_URL` overrides the fallback for native builds.

The format's header row carries `SHARE_FORMAT`. A link outlives the release that
wrote it, so a code from a newer format is reported as needing a newer app rather
than read with the columns this build happens to know. Adding a trailing column is
not a format change — a reader takes the columns it knows and ignores the rest.

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
`values-v<version>.apk` — the tag with its `values-` prefix counted once, not
twice, which is what v0.3.0 shipped as `values-values-v0.3.0.apk` before the
duplicate was stripped. It is a reusable workflow, reached two ways: `release-please`
calls it as a job once it has published a release, and **Actions → Release APK →
Run workflow** re-runs it for any tag that already exists. Give that box the tag
in full — `values-v0.3.0`, with the component prefix release-please puts there,
not `v0.3.0`. A tag that does not resolve fails in the checkout with a bare `git
failed with exit code 1`, which reads like a network fault and is not one.

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

The workflow also runs `sha256sum` over the APK and uploads the result beside it
as `values-<tag>.apk.sha256`. The in-app updater below reads that file; a release
without one still installs, on a weaker check.

## In-app updates

There is no store listing, so an install already on a phone learns about a new
release by asking GitHub. Four pieces:

| file | what it does |
| --- | --- |
| `app/services/AppUpdateService.js` | version comparison and the `/releases` call. Pure `fetch` — runs and is tested everywhere |
| `app/services/ApkInstaller.js` | the filesystem and the `ACTION_VIEW` intent. Android only |
| `app/hooks/useAppUpdateCheck.js` | when to check, and when to keep quiet about what it found |
| `app/components/UpdatePanel.js`, `UpdatePrompt.js` | the settings section and the prompt |

**Android only, by predicate.** `canInstallUpdates()` is `Platform.OS ===
'android'`, and both the settings section and the background check are absent
elsewhere rather than disabled — on web the app updates by being reloaded and on
iOS there is no sideloading, so the check would find a release it could do
nothing with.

**`ApkInstaller.js` is never imported statically.** `AppUpdateService` reaches it
with `await import()` from behind that predicate. A static import would pull
expo-intent-launcher, which has no web implementation, into the web bundle's
module graph and evaluate it on load. Metro splits it into its own async chunk,
which is visible in `bun run build:web` output — if `ApkInstaller` stops
appearing there as a separate bundle, something started importing it eagerly.

**Checks are events, not a timer.** The app checks when it opens and when it
returns to the foreground, throttled to once an hour by
`PREF_KEYS.UPDATE_LAST_CHECK_AT`. Unauthenticated GitHub allows sixty requests an
hour *per address* — shared with everyone else behind the same router — and a
one-minute poll would spend that on an app people open for a minute a day. The
timestamp is written even when the check fails, so a rate limit is not hammered.

**A downloaded APK is verified twice before it is offered.** Against the
release's `.sha256` when there is one, and otherwise against the ZIP structure —
an APK must open with a local file header and close with an End Of Central
Directory record inside its last 64KB. A truncated download has the first and not
the second, and is exactly what Android rejects, after the user has tapped
through the installer, as "There's a problem with the app file". A file that
fails either check is deleted so the panel offers a fresh download instead of a
broken install.

**"Later" is persisted.** `UPDATE_SNOOZED_VERSION` and `UPDATE_SNOOZE_UNTIL` keep
a deferred version quiet for a day across restarts. A session-only dismissal
would re-ask on the next launch, which for a once-a-day app is nearly every
launch. A *newer* version carries a different number and prompts as normal.

**Nothing is asked in front of the deck** — including this. `useAppUpdateCheck`
takes `enabled`, and `AppInitializer` passes false while a calibration is open.

**The install writes a CSV snapshot first**, to
`values-pre-update-<timestamp>.csv` in the documents directory, keeping three. It
is the same export the settings screen writes, built without a name resolver so
it carries value keys — which is what import matches on anyway. It can never
block an install: a snapshot that fails is logged and the update proceeds.
