// GENERATED FILE — do not edit.
// Produced by scripts/build-migrations.js from drizzle-kit's output.
// Regenerate with `npm run db:generate`.
//
// Each entry is one migration, already split on drizzle's statement breakpoints
// because expo-sqlite's execAsync takes a single statement at a time. The array
// order is the apply order, and an entry's index is its migration number — which
// is what app/services/db.js stamps into PRAGMA user_version.

export default {
  entries: [
  {
    tag: '20260812093004_init',
    statements: [
    `CREATE TABLE \`app_metadata\` (
	\`key\` text PRIMARY KEY,
	\`value\` text NOT NULL,
	\`updated_at\` text NOT NULL
);`,
    `CREATE TABLE \`assessments\` (
	\`id\` text PRIMARY KEY,
	\`assessed_on\` text NOT NULL CONSTRAINT \`idx_assessments_date\` UNIQUE,
	\`scale\` text NOT NULL,
	\`completed_at\` text,
	\`created_at\` text NOT NULL,
	\`updated_at\` text NOT NULL
);`,
    `CREATE TABLE \`personal_values\` (
	\`id\` text PRIMARY KEY,
	\`key\` text NOT NULL CONSTRAINT \`idx_personal_values_key\` UNIQUE,
	\`group_key\` text NOT NULL,
	\`is_custom\` integer DEFAULT 0 NOT NULL,
	\`custom_name\` text,
	\`display_order\` integer DEFAULT 0 NOT NULL,
	\`archived\` integer DEFAULT 0 NOT NULL,
	\`created_at\` text NOT NULL,
	\`updated_at\` text NOT NULL
);`,
    `CREATE TABLE \`ratings\` (
	\`id\` text PRIMARY KEY,
	\`assessment_id\` text NOT NULL,
	\`value_id\` text NOT NULL,
	\`score\` integer NOT NULL,
	\`normalized\` real NOT NULL,
	\`created_at\` text NOT NULL,
	\`updated_at\` text NOT NULL,
	CONSTRAINT \`fk_ratings_assessment_id_assessments_id_fk\` FOREIGN KEY (\`assessment_id\`) REFERENCES \`assessments\`(\`id\`) ON DELETE CASCADE,
	CONSTRAINT \`fk_ratings_value_id_personal_values_id_fk\` FOREIGN KEY (\`value_id\`) REFERENCES \`personal_values\`(\`id\`) ON DELETE CASCADE,
	CONSTRAINT \`idx_ratings_assessment_value\` UNIQUE(\`assessment_id\`,\`value_id\`)
);`,
    `CREATE INDEX \`idx_personal_values_group\` ON \`personal_values\` (\`group_key\`);`,
    `CREATE INDEX \`idx_personal_values_order\` ON \`personal_values\` (\`display_order\`);`,
    `CREATE INDEX \`idx_ratings_assessment\` ON \`ratings\` (\`assessment_id\`);`,
    `CREATE INDEX \`idx_ratings_value\` ON \`ratings\` (\`value_id\`);`,
    ],
  },
  ],
};
