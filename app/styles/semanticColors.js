/**
 * Scheme-keyed semantic colours, as plain values.
 *
 * A leaf module — it imports nothing. ThemeColorsContext builds its palettes from
 * it, and the few consumers that cannot read a React context import it directly:
 * ErrorBoundary (which renders *because* the tree below it threw, so it must not
 * depend on a provider inside that tree) and StyleSheets built at module scope,
 * which run before any provider mounts.
 */

/** The one red: errors, destructive actions, validation. */
export const DESTRUCTIVE = {
  light: '#d9534f',
  dark: '#ff6b6b',
};

// Chart and group colour lives in styles/chartPalette.js — it is mode-dependent
// and validated as a set, which is a different kind of thing from the two
// scheme-keyed constants above.
