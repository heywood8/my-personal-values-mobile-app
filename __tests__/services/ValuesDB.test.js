import {
  seedDefaultValues,
  getAllValues,
  getActiveValues,
  getValueById,
  addCustomValue,
  setValueArchived,
  renameCustomValue,
  deleteCustomValue,
  interleaveByGroup,
  VALUE_GROUPS,
} from '../../app/services/ValuesDB';
import { __resetDatabaseHandleForTests } from '../../app/services/db';
import catalogue from '../../app/defaults/defaultValues.json';

beforeEach(() => {
  __resetDatabaseHandleForTests();
});

describe('interleaveByGroup', () => {
  it('never places two values from the same group next to each other', () => {
    const ordered = interleaveByGroup(catalogue.values);
    for (let i = 1; i < ordered.length; i++) {
      // With eight equally-sized groups, round-robin guarantees this. It is the
      // property the deck order exists for: consecutive cards must be unrelated
      // so each is judged on itself rather than against the one before.
      expect(ordered[i].group).not.toBe(ordered[i - 1].group);
    }
  });

  it('keeps every value exactly once', () => {
    const ordered = interleaveByGroup(catalogue.values);
    expect(ordered).toHaveLength(catalogue.values.length);
    expect(new Set(ordered.map((v) => v.key)).size).toBe(catalogue.values.length);
  });

  it('is deterministic', () => {
    // A recalibration must deal the same sequence as the first run, or a
    // "this moved" reading is confounded by the order having changed.
    expect(interleaveByGroup(catalogue.values).map((v) => v.key))
      .toEqual(interleaveByGroup(catalogue.values).map((v) => v.key));
  });

  it('appends values whose group is not declared rather than dropping them', () => {
    const ordered = interleaveByGroup([
      ...catalogue.values,
      { key: 'orphan', group: 'not_a_group' },
    ]);
    expect(ordered).toHaveLength(catalogue.values.length + 1);
    expect(ordered[ordered.length - 1].key).toBe('orphan');
  });
});

describe('the value catalogue', () => {
  it('seeds all 74 values across 8 groups', async () => {
    const inserted = await seedDefaultValues();
    expect(inserted).toBe(74);

    const values = await getAllValues();
    expect(values).toHaveLength(74);
    expect(new Set(values.map((v) => v.groupKey)).size).toBe(8);
    expect(VALUE_GROUPS).toHaveLength(8);
  });

  it('is idempotent — re-seeding inserts nothing', async () => {
    await seedDefaultValues();
    expect(await seedDefaultValues()).toBe(0);
    expect(await getAllValues()).toHaveLength(74);
  });

  it('seeds in deck order', async () => {
    await seedDefaultValues();
    const values = await getAllValues();
    const expected = interleaveByGroup(catalogue.values).map((v) => v.key);
    expect(values.map((v) => v.key)).toEqual(expected);
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

describe('archiving', () => {
  beforeEach(async () => {
    await seedDefaultValues();
  });

  it('removes a value from the deck without deleting it', async () => {
    await setValueArchived('family', true);

    const active = await getActiveValues();
    expect(active.find((v) => v.id === 'family')).toBeUndefined();
    // Still present, so past records that reference it still resolve a name.
    expect(await getValueById('family')).toMatchObject({ id: 'family', archived: true });
    expect(await getAllValues()).toHaveLength(74);
  });

  it('restores an archived value to the deck', async () => {
    await setValueArchived('family', true);
    await setValueArchived('family', false);
    expect((await getActiveValues()).find((v) => v.id === 'family')).toBeDefined();
  });
});

describe('custom values', () => {
  beforeEach(async () => {
    await seedDefaultValues();
  });

  it('adds one at the end of the deck', async () => {
    const id = await addCustomValue({ name: '  Sailing  ', groupKey: 'autonomy' });
    const value = await getValueById(id);

    expect(value).toMatchObject({
      isCustom: true,
      customName: 'Sailing', // trimmed
      groupKey: 'autonomy',
      archived: false,
    });

    const active = await getActiveValues();
    expect(active[active.length - 1].id).toBe(id);
  });

  it('rejects a blank name and an unknown group', async () => {
    await expect(addCustomValue({ name: '   ', groupKey: 'autonomy' })).rejects.toThrow();
    await expect(addCustomValue({ name: 'X', groupKey: 'nope' })).rejects.toThrow();
  });

  it('renames only custom values', async () => {
    const id = await addCustomValue({ name: 'Sailing', groupKey: 'autonomy' });
    await renameCustomValue(id, 'Boats');
    expect((await getValueById(id)).customName).toBe('Boats');

    // A catalogue entry's name is a translation key, so there is nothing to rename.
    await renameCustomValue('learning', 'Something else');
    expect((await getValueById('learning')).customName).toBeNull();
  });

  it('deletes only custom values', async () => {
    const id = await addCustomValue({ name: 'Sailing', groupKey: 'autonomy' });
    await deleteCustomValue(id);
    expect(await getValueById(id)).toBeNull();

    // A catalogue entry must archive instead — deleting it would let a future
    // release re-seed and resurrect it.
    await deleteCustomValue('learning');
    expect(await getValueById('learning')).not.toBeNull();
  });
});
