import uuid from 'react-native-uuid';
import { queryAll, queryFirst, executeQuery, withTransaction } from './db';
import catalogue from '../defaults/defaultValues.json';

export const VALUE_GROUPS = catalogue.groups;

/**
 * The order cards are dealt in.
 *
 * defaultValues.json lists the catalogue grouped, which is how it stays readable
 * and how a missing entry is easy to spot. Dealing it in that order would be a
 * different thing entirely: six consecutive cards about family, then six about
 * money, invites the reader to rate the *group* once and then coast, and anchors
 * every card on the one before it. Round-robin across the groups breaks both —
 * consecutive cards are unrelated, so each one is judged on itself.
 *
 * Deterministic rather than shuffled, on purpose: a recalibration should present
 * the same sequence as the first run, or a "this moved" reading is confounded by
 * the order having changed underneath it.
 */
export function interleaveByGroup(values, groups = VALUE_GROUPS) {
  const byGroup = new Map(groups.map((group) => [group, []]));
  const ungrouped = [];
  for (const value of values) {
    const bucket = byGroup.get(value.group ?? value.groupKey);
    if (bucket) bucket.push(value);
    else ungrouped.push(value);
  }

  const ordered = [];
  const longest = Math.max(0, ...[...byGroup.values()].map((b) => b.length));
  for (let round = 0; round < longest; round++) {
    for (const group of groups) {
      const bucket = byGroup.get(group);
      if (round < bucket.length) ordered.push(bucket[round]);
    }
  }
  // Anything belonging to a group the catalogue does not declare still ships,
  // just at the end, rather than vanishing from the deck.
  return [...ordered, ...ungrouped];
}

const rowToValue = (row) => ({
  id: row.id,
  key: row.key,
  groupKey: row.group_key,
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

  const ordered = interleaveByGroup(catalogue.values);
  const missing = ordered
    .map((entry, index) => ({ ...entry, displayOrder: index }))
    .filter((entry) => !known.has(entry.key));

  if (missing.length === 0) return 0;

  const now = new Date().toISOString();
  await withTransaction(async () => {
    for (const entry of missing) {
      await executeQuery(
        `INSERT INTO personal_values
           (id, key, group_key, is_custom, custom_name, display_order, archived, created_at, updated_at)
         VALUES (?, ?, ?, 0, NULL, ?, 0, ?, ?)`,
        [entry.key, entry.key, entry.group, entry.displayOrder, now, now],
      );
    }
  });

  return missing.length;
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
 */
export async function addCustomValue({ name, groupKey }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('A custom value needs a name');
  if (!VALUE_GROUPS.includes(groupKey)) {
    throw new Error(`Unknown value group: ${groupKey}`);
  }

  const id = String(uuid.v4());
  const now = new Date().toISOString();
  const row = await queryFirst('SELECT MAX(display_order) AS max_order FROM personal_values');
  const displayOrder = (row?.max_order ?? -1) + 1;

  await executeQuery(
    `INSERT INTO personal_values
       (id, key, group_key, is_custom, custom_name, display_order, archived, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, 0, ?, ?)`,
    [id, id, groupKey, trimmed, displayOrder, now, now],
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
