/**
 * How a value is named on screen.
 *
 * Catalogue entries are translated (`value_learning`); custom values carry the
 * user's own words and are shown verbatim, because there is nothing to translate
 * them into. Both shapes flow through the same charts and lists, so every call
 * site resolves the name here rather than branching on `isCustom` itself.
 */

export function valueName(value, t) {
  if (!value) return '';
  if (value.isCustom) return value.customName || value.key;
  return t(`value_${value.key}`);
}

export function valueDescription(value, t) {
  if (!value || value.isCustom) return null;
  const key = `value_${value.key}_desc`;
  const text = t(key);
  // t() returns the key itself when a string is missing; showing "value_x_desc"
  // under a card would be worse than showing nothing.
  return text === key ? null : text;
}
