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
rating scale, onboarding state, and the results screen's view and sort toggles.

| column | type | notes |
|---|---|---|
| `key` | text | primary key |
| `value` | text | always stored as a string |
| `updated_at` | text | ISO timestamp |

### `personal_values`

The value catalogue. Named `personal_values` because `VALUES` is reserved in
SQLite's grammar. Seeded from `app/defaults/defaultValues.json` on first launch;
seeding is additive and idempotent, so a release that ships new values adds them
without touching anything the user has already rated.

| column | type | notes |
|---|---|---|
| `id` | text | primary key; equals the catalogue key for shipped values, a UUID for custom ones |
| `key` | text | unique; i18n suffix — the name renders as `t('value_' + key)` |
| `group_key` | text | one of the eight groups |
| `is_custom` | integer | 1 for a value the user added |
| `custom_name` | text | the user's own wording; null for catalogue values |
| `display_order` | integer | deck order, round-robin across groups |
| `archived` | integer | archived values stay in past records but are not dealt |

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

## Storage locations

| Platform | Where |
|---|---|
| Android / iOS | app sandbox, `values.db` |
| Web | the origin-private file system, via wa-sqlite in a Web Worker |

If the browser cannot provide OPFS — a private-browsing mode, or a non-secure
context — `db.js` falls back to an in-memory database so the app still runs, and
Settings shows a warning that the session will not be kept.
