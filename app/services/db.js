import * as SQLite from 'expo-sqlite';
import migrations from '../../drizzle/migrations.generated';
import { readAllMirroredPreferences, clearMirroredPreferences } from './preferenceMirror';

const DB_NAME = 'values.db';

/**
 * How many migrations this build ships. Derived from the generated module rather
 * than hand-maintained: adding a migration adds an entry, which raises this
 * number automatically, so a pending migration can never be skipped by the
 * already-migrated fast path below.
 */
const SCHEMA_VERSION = migrations.entries.length;

let dbPromise = null;
/**
 * Set when the platform gave us a non-persistent database (see openDatabase).
 * The UI reads it to warn that this session's calibration will not survive a
 * reload, which is a thing the user must be told rather than discover.
 */
let usingMemoryFallback = false;

/**
 * ASYNC-ONLY, DELIBERATELY.
 *
 * expo-sqlite runs on web through wa-sqlite compiled to WebAssembly, driven from
 * a Web Worker and persisted in OPFS. That path supports the whole async API with
 * no special server configuration — but every *synchronous* call (execSync,
 * getFirstSync, and drizzle's expo migrator, which is sync internally) needs
 * SharedArrayBuffer, and SharedArrayBuffer needs COOP/COEP response headers that
 * GitHub Pages cannot send.
 *
 * So this module never calls a *Sync method and never uses drizzle's migrator; it
 * applies the drizzle-kit-generated SQL itself, below. Drizzle still owns the
 * schema (app/db/schema.js) and still generates the migrations — it just does not
 * run them. Introducing a single sync call here would break the web build only,
 * and only at runtime.
 */
async function openDatabase() {
  try {
    return await SQLite.openDatabaseAsync(DB_NAME);
  } catch (error) {
    // OPFS needs a secure context and is unavailable in some private-browsing
    // modes. Rather than showing a dead app, fall back to an in-memory database:
    // everything works for the session and is lost on reload.
    console.warn('[db] Persistent database unavailable, falling back to memory:', error);
    usingMemoryFallback = true;
    return SQLite.openDatabaseAsync(':memory:');
  }
}

/** Read the persisted schema fingerprint. */
async function getStoredSchemaVersion(db) {
  try {
    const row = await db.getFirstAsync('PRAGMA user_version');
    return row?.user_version ?? 0;
  } catch (error) {
    console.warn('[db] Could not read user_version:', error);
    return 0;
  }
}

/**
 * Apply every migration the database has not seen yet.
 *
 * `user_version` holds the count of applied migrations, so an install that has
 * run N of them resumes at index N. Each migration runs inside a transaction, so
 * a statement that fails leaves the database on the previous version rather than
 * half-migrated.
 */
async function runMigrations(db) {
  const applied = await getStoredSchemaVersion(db);
  if (applied >= SCHEMA_VERSION) return;

  for (let index = applied; index < SCHEMA_VERSION; index++) {
    const { tag, statements } = migrations.entries[index];
    await db.withTransactionAsync(async () => {
      for (const statement of statements) {
        await db.execAsync(statement);
      }
    });
    // Stamped per migration, not once at the end, so an interrupted upgrade
    // resumes at the first unapplied one instead of replaying the whole chain.
    await db.execAsync(`PRAGMA user_version = ${index + 1}`);
    console.log(`[db] Applied migration ${tag}`);
  }
}

/**
 * Fold the browser-local preference mirror back into a database that is missing
 * it (see app/services/preferenceMirror.js).
 *
 * On web an open can hand back an empty database — the memory fallback above, or
 * an OPFS the browser has since cleared — and this is what stops that from also
 * being a lost language, scale and onboarding state. Rows already present win:
 * `INSERT OR IGNORE`, so the database stays the store of record and the mirror
 * only ever fills gaps.
 *
 * Runs on every open, once, before any query the app makes; a failure here is
 * logged rather than raised, because a mirror that cannot be restored is a worse
 * startup, not a broken one.
 */
async function restoreMirroredPreferences(db) {
  const mirrored = readAllMirroredPreferences();
  const keys = Object.keys(mirrored);
  if (keys.length === 0) return;

  try {
    const now = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      for (const key of keys) {
        await db.runAsync(
          `INSERT OR IGNORE INTO app_metadata (key, value, updated_at)
           VALUES (?, ?, ?)`,
          [key, mirrored[key], now],
        );
      }
    });
  } catch (error) {
    console.warn('[db] Could not restore the mirrored preferences:', error);
  }
}

/**
 * Open the database, applying migrations once. Every caller awaits the same
 * promise, so concurrent callers on startup cannot race two migration runs.
 */
export function getDatabase() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await openDatabase();
      // Cascade deletes from assessments to ratings depend on this; SQLite has
      // foreign keys off by default and the setting is per-connection.
      await db.execAsync('PRAGMA foreign_keys = ON');
      await runMigrations(db);
      await restoreMirroredPreferences(db);
      return db;
    })().catch((error) => {
      // Do not cache a rejected promise — a transient failure would otherwise
      // wedge the app until it is force-quit.
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

/** True when the database is in-memory and this session's data will not persist. */
export function isUsingMemoryFallback() {
  return usingMemoryFallback;
}

/** Run a statement that returns no rows. */
export async function executeQuery(sql, params = []) {
  const db = await getDatabase();
  return db.runAsync(sql, params);
}

/** Run a query and return every row. */
export async function queryAll(sql, params = []) {
  const db = await getDatabase();
  return db.getAllAsync(sql, params);
}

/** Run a query and return the first row, or null. */
export async function queryFirst(sql, params = []) {
  const db = await getDatabase();
  const row = await db.getFirstAsync(sql, params);
  return row ?? null;
}

/** Run `work` inside a transaction. */
export async function withTransaction(work) {
  const db = await getDatabase();
  return db.withTransactionAsync(work);
}

/**
 * Drop every row from every table and re-stamp the schema version, leaving the
 * database in the state a fresh install starts from. Used by the "reset" action
 * in settings; the caller is responsible for re-seeding the catalogue.
 */
export async function resetDatabase() {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    // Order matters even with cascades on: both rating tables reference
    // personal_values, so the leaves go first and the catalogue last.
    await db.execAsync('DELETE FROM ratings');
    await db.execAsync('DELETE FROM assessments');
    await db.execAsync('DELETE FROM alignment_ratings');
    await db.execAsync('DELETE FROM alignment_checkins');
    await db.execAsync('DELETE FROM personal_values');
    await db.execAsync('DELETE FROM app_metadata');
  });
  // Or the next open would hand the language and the onboarding flag straight
  // back, and a reset would not have reset anything the user can see.
  clearMirroredPreferences();
}

/** Test seam: forget the cached connection so the next call re-opens. */
export function __resetDatabaseHandleForTests() {
  dbPromise = null;
  usingMemoryFallback = false;
}
