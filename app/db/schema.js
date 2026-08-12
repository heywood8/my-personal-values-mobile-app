import { sqliteTable, text, integer, real, index, unique } from 'drizzle-orm/sqlite-core';

/**
 * App metadata — the key/value store behind PreferencesDB (language, theme,
 * chosen scale, onboarding state).
 */
export const appMetadata = sqliteTable('app_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/**
 * The value catalogue.
 *
 * Named `personal_values` rather than `values`: VALUES is a reserved word in
 * SQLite's grammar, and while Drizzle always emits it backticked, every piece of
 * hand-written SQL would have to remember to. The table is seeded from
 * app/defaults/defaultValues.json on first launch and is writable afterwards, so
 * a user can archive a value they do not care about or add one of their own.
 */
export const personalValues = sqliteTable('personal_values', {
  // For catalogue entries this IS the catalogue key ('learning'), which makes the
  // seed idempotent without a lookup. Custom values get a UUID.
  id: text('id').primaryKey(),
  // i18n suffix: the name renders as t(`value_${key}`). Equal to `id` for
  // catalogue entries; for custom values the key is unused and customName wins.
  key: text('key').notNull(),
  isCustom: integer('is_custom').notNull().default(0),
  // Only set for custom values — user-typed, so it is stored verbatim rather
  // than translated.
  customName: text('custom_name'),
  displayOrder: integer('display_order').notNull().default(0),
  // Archived values keep their historical ratings but are not offered in new
  // assessments, so a recalibration never silently drops past data.
  archived: integer('archived').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  keyIdx: unique('idx_personal_values_key').on(table.key),
  orderIdx: index('idx_personal_values_order').on(table.displayOrder),
}));

/**
 * One calibration run.
 *
 * `assessedOn` is a local calendar date ('YYYY-MM-DD') and is UNIQUE. That single
 * constraint is the whole same-day rule: recalibrating on a day that already has
 * an assessment resolves to the existing row and overwrites its ratings, while
 * the next day resolves to nothing and starts a new one.
 */
export const assessments = sqliteTable('assessments', {
  id: text('id').primaryKey(),
  assessedOn: text('assessed_on').notNull(),
  // Which scale the raw scores below are expressed in ('numeric5' | 'numeric10'
  // | 'qualitative'). Stored per assessment, not globally, so changing the scale
  // preference later cannot retroactively reinterpret old scores.
  scale: text('scale').notNull(),
  // NULL while the run is still in progress; set when the last card is rated.
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  dateIdx: unique('idx_assessments_date').on(table.assessedOn),
}));

/**
 * A single value's score within one assessment.
 */
export const ratings = sqliteTable('ratings', {
  id: text('id').primaryKey(),
  assessmentId: text('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  valueId: text('value_id').notNull().references(() => personalValues.id, { onDelete: 'cascade' }),
  // The raw score as the user gave it, in this assessment's scale.
  score: integer('score').notNull(),
  // The same score mapped to 0..1. Denormalised on purpose: it is what every
  // chart and every over-time comparison reads, and without it a history view
  // spanning a scale change would be comparing 4-out-of-5 with 4-out-of-10.
  normalized: real('normalized').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  pairIdx: unique('idx_ratings_assessment_value').on(table.assessmentId, table.valueId),
  assessmentIdx: index('idx_ratings_assessment').on(table.assessmentId),
  valueIdx: index('idx_ratings_value').on(table.valueId),
}));
