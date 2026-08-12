import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { appMetadata, personalValues, assessments, ratings } from '../../app/db/schema';
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

const declaredTables = { appMetadata, personalValues, assessments, ratings };

const allSql = migrations.entries.flatMap((entry) => entry.statements).join('\n');

describe('the declared schema', () => {
  it('declares the four tables the app uses', () => {
    const names = Object.values(declaredTables).map((table) => getTableConfig(table).name).sort();
    expect(names).toEqual(['app_metadata', 'assessments', 'personal_values', 'ratings']);
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

  it('stamps the schema version so migrations are applied once', async () => {
    const [{ user_version: version }] = await queryAll('PRAGMA user_version');
    expect(version).toBe(migrations.entries.length);
  });
});
