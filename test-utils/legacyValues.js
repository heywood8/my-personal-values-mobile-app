import { executeQuery } from '../app/services/db';

/**
 * A value the reader added on a release that still let them.
 *
 * Nothing in the app creates one any more — the deck is the shipped catalogue —
 * but the rows are on people's phones, with ratings and check-ins hanging off
 * them, and every read path still has to carry the name they hold rather than
 * printing a uuid. Written straight into the table, because that is the only way
 * one exists now.
 *
 * @returns {Promise<string>} the value's id, which is also its key.
 */
export async function insertOwnValue(id, name, { displayOrder = 999 } = {}) {
  const now = new Date().toISOString();
  await executeQuery(
    `INSERT INTO personal_values
       (id, key, is_custom, custom_name, display_order, archived, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?, 0, ?, ?)`,
    [id, id, name, displayOrder, now, now],
  );
  return id;
}

export default insertOwnValue;
