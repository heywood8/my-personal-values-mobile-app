/**
 * The order values travel in inside a share code, frozen forever.
 *
 * A shared link carries a ranking as one score per catalogue slot, in this
 * order and nothing else — no keys, because the deck is the shipped catalogue
 * and both ends already know every card in it (see ResultsShare). That is what
 * turns nine and a half characters of `assertiveness` per row into four bits,
 * and it only works while the two ends agree on which slot is which.
 *
 * So this list is **append-only, and never reordered**. Three things follow, and
 * all three are the reason it is a literal here rather than something derived
 * from `defaultValues.json` at runtime:
 *
 * - **It is not the catalogue's order.** `alignCatalogueOrder()` renumbers the
 *   deck to match `defaultValues.json` on every launch, so the catalogue's order
 *   is free to change for the sake of the deck. This one is not: a link sent
 *   last month is still being opened today.
 * - **Retired values are in it.** They are listed after the shipped deck, and
 *   they are here because `getRankedResults()` deliberately does not filter
 *   archived values — a record is a record, and a ranking from an install that
 *   predates a removal still carries the value that was removed.
 * - **A removal never takes a slot back.** Dropping a key from `defaultValues`
 *   moves it to `retired` there; here it does not move at all. Deleting a line
 *   in this file, or inserting one anywhere but the end, silently renames every
 *   value after it in every link ever sent.
 *
 * A key that is not in this list is not a disaster — a value from a newer
 * catalogue, or one of the custom values old installs still hold — it simply
 * travels as text in the code's tail section instead, which costs its own length
 * and nothing else. The parity test is what keeps that from happening by
 * accident to a shipped value.
 */
export const SHARE_INDEX = Object.freeze([
  'acceptance', 'adventure', 'assertiveness', 'authenticity', 'caring', 'compassion',
  'connection', 'generosity', 'cooperation', 'courage', 'creativity', 'curiosity',
  'encouragement', 'honesty', 'health', 'adaptability', 'freedom', 'friendliness',
  'forgiveness', 'gratitude', 'humour', 'diligence', 'intimacy', 'kindness',
  'love', 'mindfulness', 'order', 'persistence', 'respect', 'responsibility',
  'safety', 'sensuality', 'sexuality', 'mastery', 'helping', 'conformity', 'equality',
  'excitement', 'trustworthiness', 'humility', 'open_mindedness', 'patience',
  'reciprocity', 'self_awareness', 'learning', 'self_control', 'spirituality',
  'family', 'friendship', 'community', 'loyalty', 'belonging', 'achievement',
  'ambition', 'recognition', 'excellence', 'leadership', 'prosperity', 'balance',
  'calm', 'joy', 'rest', 'justice', 'stewardship', 'mentorship', 'independence',
  'spontaneity', 'exploration', 'self_expression', 'stability', 'tradition',
  'purpose', 'beauty', 'wisdom',
]);

/** How many slots a packed block holds. */
export const SHARE_SLOTS = SHARE_INDEX.length;

const POSITIONS = new Map(SHARE_INDEX.map((key, index) => [key, index]));

/** The slot a key travels in, or -1 for a key this format cannot place. */
export const shareIndexOf = (key) => (POSITIONS.has(key) ? POSITIONS.get(key) : -1);

/** The key a slot holds, or null for a slot beyond the end of the list. */
export const shareKeyAt = (index) => SHARE_INDEX[index] ?? null;
