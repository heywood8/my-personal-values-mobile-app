import { getTableConfig } from 'drizzle-orm/sqlite-core';
import {
  appMetadata, personalValues, assessments, ratings, alignmentCheckins, alignmentRatings,
} from '../../app/db/schema';
import migrations from '../../drizzle/migrations.generated';
import { queryAll, __resetDatabaseHandleForTests } from '../../app/services/db';

/**
 * Guards the seam between the Drizzle schema and the SQL that actually runs.
 *
 * Nothing imports app/db/schema.js at runtime — the app talks to SQLite through
 * plain async SQL (see app/services/db.js, which cannot use Drizzle's migrator
 * because that API is synchronous and sync SQLite is unavailable on web). Drizzle
 * is the schema's *source*, and drizzle-kit turns it into the migrations the app
 * applies.
 *
 * That split has one failure mode: editing schema.js and forgetting to run
 * `npm run db:generate`. The schema would look right, the app would run the old
 * SQL, and nothing would complain until a query hit a column that was never
 * created. These tests compare the declared schema against both the generated SQL
 * and the database the app actually builds from it.
 */

// Every table, and it has to stay every table: the drift check below only sees
// what is listed here, so a new table left out of this object is a new table
// with no guard at all.
const declaredTables = {
  appMetadata, personalValues, assessments, ratings, alignmentCheckins, alignmentRatings,
};

const allSql = migrations.entries.flatMap((entry) => entry.statements).join('\n');

describe('the declared schema', () => {
  it('declares the six tables the app uses', () => {
    const names = Object.values(declaredTables).map((table) => getTableConfig(table).name).sort();
    expect(names).toEqual([
      'alignment_checkins',
      'alignment_ratings',
      'app_metadata',
      'assessments',
      'personal_values',
      'ratings',
    ]);
  });

  it('has a generated migration for every declared table', () => {
    for (const table of Object.values(declaredTables)) {
      const { name } = getTableConfig(table);
      expect(allSql).toContain(`CREATE TABLE \`${name}\``);
    }
  });

  it('has generated SQL for every declared column', () => {
    // The drift check: a column added to schema.js without regenerating fails here.
    const missing = [];
    for (const table of Object.values(declaredTables)) {
      const { name, columns } = getTableConfig(table);
      for (const column of columns) {
        if (!allSql.includes(`\`${column.name}\``)) missing.push(`${name}.${column.name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('the migrated database', () => {
  beforeEach(() => {
    __resetDatabaseHandleForTests();
  });

  it('creates every declared table with every declared column', async () => {
    for (const table of Object.values(declaredTables)) {
      const { name, columns } = getTableConfig(table);
      const actual = (await queryAll(`PRAGMA table_info(\`${name}\`)`)).map((row) => row.name).sort();
      const declared = columns.map((column) => column.name).sort();
      expect({ table: name, columns: actual }).toEqual({ table: name, columns: declared });
    }
  });

  it('enforces one assessment per calendar day', async () => {
    // The app's central rule, and it lives in the schema rather than in code.
    const indexes = await queryAll('PRAGMA index_list(`assessments`)');
    const unique = indexes.filter((index) => index.unique === 1);
    const columns = [];
    for (const index of unique) {
      const info = await queryAll(`PRAGMA index_info(\`${index.name}\`)`);
      columns.push(...info.map((row) => row.name));
    }
    expect(columns).toContain('assessed_on');
  });

  it('enforces one rating per (assessment, value)', async () => {
    const indexes = await queryAll('PRAGMA index_list(`ratings`)');
    const unique = indexes.filter((index) => index.unique === 1);
    const pairs = [];
    for (const index of unique) {
      const info = await queryAll(`PRAGMA index_info(\`${index.name}\`)`);
      pairs.push(info.map((row) => row.name).sort().join(','));
    }
    expect(pairs).toContain('assessment_id,value_id');
  });

  it('cascades rating deletes from both parents', async () => {
    const keys = await queryAll('PRAGMA foreign_key_list(`ratings`)');
    expect(keys.map((k) => k.table).sort()).toEqual(['assessments', 'personal_values']);
    keys.forEach((key) => expect(key.on_delete).toBe('CASCADE'));
  });

  it('enforces one check-in per calendar day', async () => {
    // The same-day rule, the second time: `checked_on` is to a check-in what
    // `assessed_on` is to a calibration, and startCheckin() resolves through it.
    const indexes = await queryAll('PRAGMA index_list(`alignment_checkins`)');
    const unique = indexes.filter((index) => index.unique === 1);
    const columns = [];
    for (const index of unique) {
      const info = await queryAll(`PRAGMA index_info(\`${index.name}\`)`);
      columns.push(...info.map((row) => row.name));
    }
    expect(columns).toContain('checked_on');
  });

  it('enforces one alignment score per (check-in, value)', async () => {
    const indexes = await queryAll('PRAGMA index_list(`alignment_ratings`)');
    const unique = indexes.filter((index) => index.unique === 1);
    const pairs = [];
    for (const index of unique) {
      const info = await queryAll(`PRAGMA index_info(\`${index.name}\`)`);
      pairs.push(info.map((row) => row.name).sort().join(','));
    }
    expect(pairs).toContain('checkin_id,value_id');
  });

  it('cascades alignment score deletes from both parents', async () => {
    const keys = await queryAll('PRAGMA foreign_key_list(`alignment_ratings`)');
    expect(keys.map((k) => k.table).sort()).toEqual(['alignment_checkins', 'personal_values']);
    keys.forEach((key) => expect(key.on_delete).toBe('CASCADE'));
  });

  it('keeps no normalised copy of an alignment score', async () => {
    // Deliberate, and the reason is that alignment has ONE scale — ten rings,
    // for good — so the raw score is already comparable across every check-in.
    // `ratings.normalized` exists because the importance scale is a
    // per-assessment fact the reader can change. A column added here would be a
    // second number to keep in agreement with no reader for it.
    const columns = (await queryAll('PRAGMA table_info(`alignment_ratings`)')).map((r) => r.name);
    expect(columns).not.toContain('normalized');
    expect(columns).toContain('score');
  });

  it('stamps the schema version so migrations are applied once', async () => {
    const [{ user_version: version }] = await queryAll('PRAGMA user_version');
    expect(version).toBe(migrations.entries.length);
  });
});
