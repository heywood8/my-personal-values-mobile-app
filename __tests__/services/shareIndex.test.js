import { SHARE_INDEX, SHARE_SLOTS, shareIndexOf, shareKeyAt } from '../../app/services/shareIndex';
import catalogue from '../../app/defaults/defaultValues.json';

/**
 * The slot list is a promise made to links that have already been sent, and the
 * two ways to break it are silent: shipping a value that has no slot costs it
 * nothing but length, while moving a slot renames a value in every link ever
 * written. So one test says "everything shipped is in here" and the other says
 * "and in this order".
 */

const fingerprint = (text) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(36);
};

describe('the slots values travel in', () => {
  it('has one for every card in the shipped deck', () => {
    // A key with no slot still shares — as text, in the code's tail — so this
    // never breaks a link. It just quietly makes every link longer, which is
    // exactly the kind of thing only a test notices.
    for (const value of catalogue.values) {
      expect(shareIndexOf(value.key)).toBeGreaterThanOrEqual(0);
    }
  });

  it('has one for every value the catalogue has retired', () => {
    // `getRankedResults` does not filter archived values — a record is a record —
    // so a ranking from an install that predates a removal still carries it.
    for (const key of catalogue.retired) {
      expect(shareIndexOf(key)).toBeGreaterThanOrEqual(0);
    }
  });

  it('names each slot once', () => {
    expect(new Set(SHARE_INDEX).size).toBe(SHARE_SLOTS);
  });

  it('is the same list it was when the first link was sent', () => {
    // If this fails, something reordered or removed a slot rather than appending
    // one, and every link already in somebody's chat history now reads as a
    // ranking of different values. Append to the end of SHARE_INDEX, and update
    // the two numbers here in the same commit.
    expect(SHARE_SLOTS).toBe(74);
    expect(fingerprint(SHARE_INDEX.join(','))).toBe('14l2pcm');
  });

  it('answers both ways round', () => {
    expect(shareKeyAt(shareIndexOf('love'))).toBe('love');
    expect(shareIndexOf('not-a-value')).toBe(-1);
    expect(shareKeyAt(SHARE_SLOTS)).toBeNull();
  });
});
