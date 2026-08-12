import uuid from 'react-native-uuid';
import { queryAll, queryFirst, executeQuery, withTransaction } from './db';
import { PREF_KEYS, getJsonPreference, setJsonPreference } from './PreferencesDB';
import catalogue from '../defaults/defaultValues.json';

/**
 * The order cards are dealt in: the order defaultValues.json lists them, which is
 * the source checklist's own numbering, 1 through 47.
 *
 * This deck used to be dealt round-robin across the eight groups it once had, so
 * that no two consecutive cards shared one. That guards against a real effect — a
 * run of cards on one theme invites the reader to rate the *theme* once and then
 * coast — but it is a reordering of someone else's instrument, and the checklist
 * is meant to be worked through as printed. Fidelity to the source won; the deck
 * therefore does have short same-theme runs in it (2. Приключения next to
 * 3. Ассертивность, 5. Забота next to 6. Сострадание).
 *
 * Deterministic either way, and that part is not negotiable: a recalibration has
 * to present the same sequence as the first run, or a "this moved" reading is
 * confounded by the order having changed underneath it.
 */
export const DECK_ORDER = catalogue.values.map((entry) => entry.key);

const rowToValue = (row) => ({
  id: row.id,
  key: row.key,
  isCustom: row.is_custom === 1,
  customName: row.custom_name ?? null,
  displayOrder: row.display_order,
  archived: row.archived === 1,
});

/**
 * Insert any catalogue entry the database does not have yet.
 *
 * Idempotent and additive: an entry's id IS its catalogue key, so re-running this
 * touches nothing that exists. That matters on upgrade — shipping new values in a
 * later release must not disturb a user's ratings, their archive choices, or
 * their custom values.
 */
export async function seedDefaultValues() {
  const existing = await queryAll('SELECT id FROM personal_values');
  const known = new Set(existing.map((row) => row.id));

  const missing = catalogue.values
    .map((entry, index) => ({ ...entry, displayOrder: index }))
    .filter((entry) => !known.has(entry.key));

  if (missing.length === 0) return 0;

  const now = new Date().toISOString();
  await withTransaction(async () => {
    for (const entry of missing) {
      await executeQuery(
        `INSERT INTO personal_values
           (id, key, is_custom, custom_name, display_order, archived, created_at, updated_at)
         VALUES (?, ?, 0, NULL, ?, 0, ?, ?)`,
        [entry.key, entry.key, entry.displayOrder, now, now],
      );
    }
  });

  return missing.length;
}

/**
 * Renumber shipped rows to their position in the catalogue.
 *
 * Seeding only assigns `display_order` to rows it inserts, so on an install that
 * already has the deck, changing the order in defaultValues.json would otherwise
 * change nothing at all — the rows keep whatever numbering the release that
 * first seeded them handed out. This is what makes the checklist order actually
 * reach an upgrading user rather than only a fresh install.
 *
 * Only `display_order` moves. Ratings key off `value_id`, so renumbering cannot
 * touch a score, and archived rows are renumbered too so restoring one puts it
 * back where the checklist has it.
 *
 * Custom values are left alone. They are numbered from the end of the deck when
 * added, which keeps them after the catalogue's 0..n-1 either way.
 */
export async function alignCatalogueOrder() {
  const target = new Map(catalogue.values.map((entry, index) => [entry.key, index]));
  const rows = await queryAll(
    'SELECT id, display_order FROM personal_values WHERE is_custom = 0',
  );
  const misplaced = rows.filter(
    (row) => target.has(row.id) && row.display_order !== target.get(row.id),
  );
  if (misplaced.length === 0) return 0;

  const now = new Date().toISOString();
  await withTransaction(async () => {
    for (const row of misplaced) {
      await executeQuery(
        'UPDATE personal_values SET display_order = ?, updated_at = ? WHERE id = ?',
        [target.get(row.id), now, row.id],
      );
    }
  });

  return misplaced.length;
}

/**
 * Archive shipped values a later release has dropped from the catalogue.
 *
 * Seeding alone is additive, so replacing the catalogue would otherwise leave an
 * upgrading user holding both decks at once. Archiving rather than deleting is
 * the same bargain `setValueArchived` makes: the rows stay, so a history chart
 * that reaches back past the change is still complete, and only new assessments
 * stop offering them.
 *
 * Every dropped key is recorded, including one the user had already archived
 * themselves. That record — not the `archived` flag — is what makes this a
 * one-time step per key: without it, restoring a retired value by hand would
 * last exactly until the next launch re-archived it.
 *
 * Custom values are never touched. They are not ours to retire.
 */
export async function retireRemovedValues() {
  const shipped = new Set(catalogue.values.map((entry) => entry.key));
  const handled = new Set(await getJsonPreference(PREF_KEYS.RETIRED_VALUES, []));

  const rows = await queryAll('SELECT id, archived FROM personal_values WHERE is_custom = 0');
  const dropped = rows.filter((row) => !shipped.has(row.id) && !handled.has(row.id));
  if (dropped.length === 0) return 0;

  const toArchive = dropped.filter((row) => row.archived === 0);
  if (toArchive.length > 0) {
    const now = new Date().toISOString();
    await withTransaction(async () => {
      for (const row of toArchive) {
        await executeQuery(
          'UPDATE personal_values SET archived = 1, updated_at = ? WHERE id = ?',
          [now, row.id],
        );
      }
    });
  }

  await setJsonPreference(
    PREF_KEYS.RETIRED_VALUES,
    [...handled, ...dropped.map((row) => row.id)],
  );

  return toArchive.length;
}

/** Every value, archived ones included, in deck order. */
export async function getAllValues() {
  const rows = await queryAll(
    'SELECT * FROM personal_values ORDER BY display_order ASC, key ASC',
  );
  return rows.map(rowToValue);
}

/** The values a new assessment should offer — everything not archived. */
export async function getActiveValues() {
  const rows = await queryAll(
    'SELECT * FROM personal_values WHERE archived = 0 ORDER BY display_order ASC, key ASC',
  );
  return rows.map(rowToValue);
}

export async function getValueById(id) {
  const row = await queryFirst('SELECT * FROM personal_values WHERE id = ?', [id]);
  return row ? rowToValue(row) : null;
}

/**
 * Add a value of the user's own. It goes to the end of the deck, and its name is
 * stored verbatim rather than as an i18n key — it is the user's words, and there
 * is nothing to translate it into.
 *
 * A name is the whole of it. The deck used to sort every value into one of eight
 * groups, which made adding one a two-part decision; the groups are gone, and a
 * custom value is now just a card like any other.
 */
export async function addCustomValue({ name }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('A custom value needs a name');

  const id = String(uuid.v4());
  const now = new Date().toISOString();
  const row = await queryFirst('SELECT MAX(display_order) AS max_order FROM personal_values');
  const displayOrder = (row?.max_order ?? -1) + 1;

  await executeQuery(
    `INSERT INTO personal_values
       (id, key, is_custom, custom_name, display_order, archived, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?, 0, ?, ?)`,
    [id, id, trimmed, displayOrder, now, now],
  );

  return id;
}

/**
 * Archive or restore a value. Archiving is deliberately not deletion: the
 * ratings a value already collected stay queryable, so a history chart covering
 * the months before it was archived is still complete.
 */
export async function setValueArchived(id, archived) {
  await executeQuery(
    'UPDATE personal_values SET archived = ?, updated_at = ? WHERE id = ?',
    [archived ? 1 : 0, new Date().toISOString(), id],
  );
}

/** Rename a custom value. No-op for catalogue entries, whose names are translated. */
export async function renameCustomValue(id, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('A custom value needs a name');
  await executeQuery(
    'UPDATE personal_values SET custom_name = ?, updated_at = ? WHERE id = ? AND is_custom = 1',
    [trimmed, new Date().toISOString(), id],
  );
}

/**
 * Delete a custom value outright, and with it (via ON DELETE CASCADE) every
 * rating it ever collected. Offered only for custom values: a catalogue entry
 * archives instead, so a future release re-seeding it cannot resurrect it.
 */
export async function deleteCustomValue(id) {
  await executeQuery('DELETE FROM personal_values WHERE id = ? AND is_custom = 1', [id]);
}
