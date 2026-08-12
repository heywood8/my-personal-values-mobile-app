import {
  seedDefaultValues,
  retireRemovedValues,
  getAllValues,
  getActiveValues,
  getValueById,
  addCustomValue,
  setValueArchived,
  renameCustomValue,
  deleteCustomValue,
  alignCatalogueOrder,
  DECK_ORDER,
} from '../../app/services/ValuesDB';
import { __resetDatabaseHandleForTests, executeQuery } from '../../app/services/db';
import catalogue from '../../app/defaults/defaultValues.json';

beforeEach(() => {
  __resetDatabaseHandleForTests();
});

describe('DECK_ORDER', () => {
  // The order the source checklist prints, 1..47. Written out rather than
  // derived, so that reordering defaultValues.json has to be a deliberate edit
  // here too instead of silently redefining "correct".
  const CHECKLIST = [
    'acceptance', 'adventure', 'assertiveness', 'authenticity', 'caring',
    'compassion', 'connection', 'generosity', 'cooperation', 'courage',
    'creativity', 'curiosity', 'encouragement', 'honesty', 'health',
    'adaptability', 'freedom', 'friendliness', 'forgiveness', 'gratitude',
    'humour', 'diligence', 'intimacy', 'kindness', 'love', 'mindfulness',
    'order', 'persistence', 'respect', 'responsibility', 'safety', 'sensuality',
    'sexuality', 'mastery', 'helping', 'conformity', 'equality', 'excitement',
    'trustworthiness', 'humility', 'open_mindedness', 'patience', 'reciprocity',
    'self_awareness', 'learning', 'self_control', 'spirituality',
  ];

  it('deals the checklist in its printed order', () => {
    expect(DECK_ORDER).toEqual(CHECKLIST);
  });

  it('keeps every value exactly once', () => {
    expect(DECK_ORDER).toHaveLength(catalogue.values.length);
    expect(new Set(DECK_ORDER).size).toBe(catalogue.values.length);
  });
});

describe('the value catalogue', () => {
  it('seeds all 47 values', async () => {
    const inserted = await seedDefaultValues();
    expect(inserted).toBe(47);

    const values = await getAllValues();
    expect(values).toHaveLength(47);
    expect(new Set(values.map((v) => v.key)).size).toBe(47);
  });

  it('is idempotent — re-seeding inserts nothing', async () => {
    await seedDefaultValues();
    expect(await seedDefaultValues()).toBe(0);
    expect(await getAllValues()).toHaveLength(47);
  });

  it('seeds in deck order', async () => {
    await seedDefaultValues();
    const values = await getAllValues();
    expect(values.map((v) => v.key)).toEqual(DECK_ORDER);
  });

  it('deals the whole deck in checklist order', async () => {
    await seedDefaultValues();
    const active = await getActiveValues();
    // getActiveValues is what the calibration screen deals from, so this is the
    // sequence a user actually walks card by card.
    expect(active.map((v) => v.key)).toEqual(DECK_ORDER);
  });

  it('leaves existing rows untouched when new catalogue entries arrive', async () => {
    await seedDefaultValues();
    await setValueArchived('learning', true);

    // Simulates a later release adding a value: seeding again must not undo the
    // user's archive choice or renumber anything they have already rated.
    expect(await seedDefaultValues()).toBe(0);
    expect((await getValueById('learning')).archived).toBe(true);
  });
});

describe('retiring values the catalogue no longer ships', () => {
  // Stands in for a row seeded by an earlier release whose key has since been
  // dropped — exactly what an upgrading install is holding.
  const seedStaleRow = async (id, { archived = 0, isCustom = 0 } = {}) => {
    const now = new Date().toISOString();
    await executeQuery(
      `INSERT INTO personal_values
         (id, key, is_custom, custom_name, display_order, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, 999, ?, ?, ?)`,
      [id, id, isCustom, isCustom ? id : null, archived, now, now],
    );
  };

  beforeEach(async () => {
    await seedDefaultValues();
  });

  it('archives a shipped value that has left the catalogue', async () => {
    await seedStaleRow('prosperity');

    expect(await retireRemovedValues()).toBe(1);
    expect((await getValueById('prosperity')).archived).toBe(true);
    // Archived, never deleted: the row has to stay so a history chart reaching
    // back past the change still resolves a name for it.
    expect(await getValueById('prosperity')).not.toBeNull();
  });

  it('leaves every value still in the catalogue alone', async () => {
    await seedStaleRow('prosperity');
    await retireRemovedValues();

    const active = await getActiveValues();
    expect(active).toHaveLength(catalogue.values.length);
    expect(active.map((v) => v.id).sort())
      .toEqual(catalogue.values.map((v) => v.key).sort());
  });

  it('never touches a custom value', async () => {
    const id = await addCustomValue({ name: 'Sailing' });

    expect(await retireRemovedValues()).toBe(0);
    expect((await getValueById(id)).archived).toBe(false);
  });

  it('is idempotent — a second run retires nothing', async () => {
    await seedStaleRow('prosperity');
    expect(await retireRemovedValues()).toBe(1);
    expect(await retireRemovedValues()).toBe(0);
  });

  it('does not re-archive a retired value the user restored by hand', async () => {
    await seedStaleRow('prosperity');
    await retireRemovedValues();

    // Someone digs it out of the archive in Settings. Retirement already ran for
    // this key, so the next launch has to respect that choice rather than
    // silently undoing it every time the app opens.
    await setValueArchived('prosperity', false);
    expect(await retireRemovedValues()).toBe(0);
    expect((await getValueById('prosperity')).archived).toBe(false);
  });

  it('remembers a dropped value the user had already archived themselves', async () => {
    await seedStaleRow('prosperity', { archived: 1 });

    // Nothing to change, so nothing is reported — but the key still has to be
    // recorded, or restoring it later would put it right back in the archive.
    expect(await retireRemovedValues()).toBe(0);
    await setValueArchived('prosperity', false);
    expect(await retireRemovedValues()).toBe(0);
    expect((await getValueById('prosperity')).archived).toBe(false);
  });
});

describe('alignCatalogueOrder', () => {
  beforeEach(async () => {
    await seedDefaultValues();
  });

  it('renumbers a deck an earlier release ordered differently', async () => {
    // What an upgrading install looks like: the rows are all present, but
    // numbered by whatever order the release that seeded them used.
    const now = new Date().toISOString();
    for (const [index, key] of [...DECK_ORDER].reverse().entries()) {
      await executeQuery(
        'UPDATE personal_values SET display_order = ?, updated_at = ? WHERE id = ?',
        [index, now, key],
      );
    }
    expect((await getActiveValues()).map((v) => v.key)).not.toEqual(DECK_ORDER);

    // Every row but the middle one — reversing an odd-length list leaves the
    // centre where it was, and the count is of rows actually moved.
    expect(await alignCatalogueOrder()).toBe(DECK_ORDER.length - 1);
    expect((await getActiveValues()).map((v) => v.key)).toEqual(DECK_ORDER);
  });

  it('is idempotent — a freshly seeded deck needs no renumbering', async () => {
    expect(await alignCatalogueOrder()).toBe(0);
  });

  it('renumbers archived rows too, so restoring one lands it in place', async () => {
    await setValueArchived('mastery', true);
    await executeQuery("UPDATE personal_values SET display_order = 900 WHERE id = 'mastery'");

    expect(await alignCatalogueOrder()).toBe(1);
    await setValueArchived('mastery', false);
    expect((await getActiveValues()).map((v) => v.key)).toEqual(DECK_ORDER);
  });

  it('leaves custom values after the catalogue', async () => {
    const id = await addCustomValue({ name: 'Sailing' });
    await alignCatalogueOrder();

    const active = await getActiveValues();
    expect(active[active.length - 1].id).toBe(id);
    expect(active.map((v) => v.key).slice(0, -1)).toEqual(DECK_ORDER);
  });
});

describe('archiving', () => {
  beforeEach(async () => {
    await seedDefaultValues();
  });

  it('removes a value from the deck without deleting it', async () => {
    await setValueArchived('love', true);

    const active = await getActiveValues();
    expect(active.find((v) => v.id === 'love')).toBeUndefined();
    // Still present, so past records that reference it still resolve a name.
    expect(await getValueById('love')).toMatchObject({ id: 'love', archived: true });
    expect(await getAllValues()).toHaveLength(47);
  });

  it('restores an archived value to the deck', async () => {
    await setValueArchived('love', true);
    await setValueArchived('love', false);
    expect((await getActiveValues()).find((v) => v.id === 'love')).toBeDefined();
  });
});

describe('custom values', () => {
  beforeEach(async () => {
    await seedDefaultValues();
  });

  it('adds one at the end of the deck', async () => {
    const id = await addCustomValue({ name: '  Sailing  ' });
    const value = await getValueById(id);

    expect(value).toMatchObject({
      isCustom: true,
      customName: 'Sailing', // trimmed
      archived: false,
    });

    const active = await getActiveValues();
    expect(active[active.length - 1].id).toBe(id);
  });

  it('rejects a blank name', async () => {
    // A name is the whole of a custom value now that groups are gone, so it is
    // also the only thing there is to reject.
    await expect(addCustomValue({ name: '   ' })).rejects.toThrow();
    await expect(addCustomValue({ name: null })).rejects.toThrow();
  });

  it('renames only custom values', async () => {
    const id = await addCustomValue({ name: 'Sailing' });
    await renameCustomValue(id, 'Boats');
    expect((await getValueById(id)).customName).toBe('Boats');

    // A catalogue entry's name is a translation key, so there is nothing to rename.
    await renameCustomValue('learning', 'Something else');
    expect((await getValueById('learning')).customName).toBeNull();
  });

  it('deletes only custom values', async () => {
    const id = await addCustomValue({ name: 'Sailing' });
    await deleteCustomValue(id);
    expect(await getValueById(id)).toBeNull();

    // A catalogue entry must archive instead — deleting it would let a future
    // release re-seed and resurrect it.
    await deleteCustomValue('learning');
    expect(await getValueById('learning')).not.toBeNull();
  });
});
