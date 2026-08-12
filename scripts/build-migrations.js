#!/usr/bin/env node
/**
 * Turns drizzle-kit's generated migrations into a plain JS module the app can import.
 *
 * drizzle-kit writes each migration as `drizzle/<timestamp>_<name>/migration.sql`
 * plus a `snapshot.json`, and emits a `migrations.js` that does
 * `import sql from './..._init/migration.sql'`. Neither Metro nor Jest resolves a
 * `.sql` import, so that entry point is unusable inside the app — but the
 * directory layout has to stay exactly as drizzle-kit wrote it, because the
 * snapshots are what let the NEXT `drizzle-kit generate` emit a diff instead of a
 * second full CREATE TABLE.
 *
 * So: leave drizzle-kit's output alone, and derive `drizzle/migrations.generated.js`
 * from it — the same SQL, inlined as strings, already split on the statement
 * breakpoints that expo-sqlite's execAsync wants one at a time.
 *
 * Run via `npm run db:generate`, which chains this after drizzle-kit. The output is
 * committed so a fresh clone builds without a codegen step.
 */

const fs = require('fs');
const path = require('path');

const DRIZZLE_DIR = path.join(__dirname, '..', 'drizzle');
const OUTPUT = path.join(DRIZZLE_DIR, 'migrations.generated.js');
const BREAKPOINT = '--> statement-breakpoint';

// drizzle-kit names every migration directory `<unix-seconds-ish timestamp>_<name>`,
// so a lexicographic sort is also chronological — which is the order they must run in.
const dirs = fs
  .readdirSync(DRIZZLE_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => fs.existsSync(path.join(DRIZZLE_DIR, name, 'migration.sql')))
  .sort();

if (dirs.length === 0) {
  console.error('No migrations found under drizzle/. Run `drizzle-kit generate` first.');
  process.exit(1);
}

const entries = dirs.map((tag) => {
  const sql = fs.readFileSync(path.join(DRIZZLE_DIR, tag, 'migration.sql'), 'utf8');
  const statements = sql
    .split(BREAKPOINT)
    .map((statement) => statement.trim())
    .filter(Boolean);
  return { tag, statements };
});

// Backticks and ${ are the only sequences that can break out of a template literal.
const escape = (sql) => sql.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const body = entries
  .map(({ tag, statements }) => {
    const rendered = statements.map((s) => `    \`${escape(s)}\``).join(',\n');
    return `  {\n    tag: '${tag}',\n    statements: [\n${rendered},\n    ],\n  }`;
  })
  .join(',\n');

const output = `// GENERATED FILE — do not edit.
// Produced by scripts/build-migrations.js from drizzle-kit's output.
// Regenerate with \`npm run db:generate\`.
//
// Each entry is one migration, already split on drizzle's statement breakpoints
// because expo-sqlite's execAsync takes a single statement at a time. The array
// order is the apply order, and an entry's index is its migration number — which
// is what app/services/db.js stamps into PRAGMA user_version.

export default {
  entries: [
${body},
  ],
};
`;

fs.writeFileSync(OUTPUT, output);

// drizzle-kit also writes a `migrations.js` that imports the raw .sql files. Nothing
// can consume it, and leaving it next to the real entry point invites importing the
// broken one, so it goes.
const unusable = path.join(DRIZZLE_DIR, 'migrations.js');
if (fs.existsSync(unusable)) fs.rmSync(unusable);

const total = entries.reduce((sum, e) => sum + e.statements.length, 0);
console.log(`✓ drizzle/migrations.generated.js — ${entries.length} migration(s), ${total} statement(s)`);
