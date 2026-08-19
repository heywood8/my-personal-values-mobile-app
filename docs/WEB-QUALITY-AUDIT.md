# Web quality audit — 2026-08-19

Audit of the web export (`bun run build:web`) against the
[web-quality-audit skill](https://github.com/addyosmani/web-quality-skills#web-quality-audit)
— Lighthouse's four categories: performance, accessibility, SEO, best practices.

## How it was run

```bash
bun run build:web
cd dist && python3 -m http.server 8099
CHROME_PATH=<chromium> npx lighthouse@12 http://localhost:8099/ \
  --only-categories=performance,accessibility,seo,best-practices \
  --chrome-flags="--headless=new --no-sandbox"
# repeated with --preset=desktop
```

Lighthouse 12.8.2, bundle `index-05fce1a27d7ba02520da62b4ee000e46.js` — the same
hash that is live on `values.heywood8.com`, so the numbers describe the published
site. Header-level findings (compression, cache lifetimes) were re-checked
against the real GitHub Pages response rather than the local static server,
which sends neither.

| Category | Mobile | Desktop |
|---|---|---|
| Performance | **38** | 72 |
| Accessibility | **89** | 89 |
| Best practices | **100** | 100 |
| SEO | **90** | 90 |

| Metric (mobile / desktop) | Value | Budget |
|---|---|---|
| FCP | 0.6 s / 0.2 s | < 1.8 s ✅ |
| LCP | **21.7 s** / 3.5 s | < 2.5 s ❌ |
| CLS | 0.01 / 0.01 | < 0.1 ✅ |
| TBT | **2,670 ms** / 170 ms | < 200 ms ❌ |
| TTI | 23.2 s / 3.6 s | — |

**What Lighthouse could see.** A run only ever reaches the first deck card, which
is the first-run screen and the only one reachable without answering 47 values.
The results, history, wheel and settings screens are unaudited — the
accessibility findings below are what the entry screen alone contains, not a
clean bill for the rest.

## Audit results

### High priority (3 found)

**[Accessibility] `role="radio"` is announced without its checked state.**
`app/components/ScaleInput.js:50`, `app/components/SegmentedToggle.js:31`

Both pass `accessibilityState={{ selected }}`. React Native Web maps `selected`
to `aria-selected` and `checked` to `aria-checked`; ARIA requires `aria-checked`
on `role="radio"`, so the attribute is simply absent. Lighthouse flags four nodes
on the first card alone (both language chips, both scale chips).

- **Impact:** A screen reader reads the rating buttons as an unlabelled radio
  group with nothing selected — on `ScaleInput`, which is the app's primary
  control, repeated 47 times per run. The user cannot hear which answer they gave.
- **Fix:** `accessibilityState={{ checked: selected }}` in both files
  (`ScaleInput` keeps `disabled`). `TrendGrid.js:99` and `HistoryScreen.js:362`
  already use `checked` — these two are the outliers, not the convention.

**[Performance] LCP is 21.7 s on mobile, and 98% of it is render delay.**

TTFB is 451 ms and the LCP element loads nothing of its own; the remaining
21.3 s is the browser parsing and executing 2.5 MB of JavaScript before any
text exists. The LCP element is the first card's description paragraph.

- **Impact:** Fails Core Web Vitals outright on a mid-tier phone over 4G.
  Desktop (3.5 s) also misses the 2.5 s budget.
- **Fix:** Three moves, in order of return:
  1. **Subset the icon font** (below) — 580 KB gzip off the critical path.
  2. **Split the bundle.** 1,669 KiB of the 2,535 KiB bundle (67%) is unused at
     first paint. `ApkInstaller` is already a separate chunk via `await import()`;
     the same treatment for the chart layer (`react-native-svg`, `TrendGrid`,
     `AlignmentWheel`) and `SettingsScreen` would keep the deck's first card off
     everything the tab shell needs.
  3. **Render something before the bundle parses.** The template's `#root` is
     empty, so there is no text on screen until React mounts. Static markup in
     `public/index.html` (a title and a line of copy, styled inline) would give
     LCP an element at ~600 ms instead of ~21 s.

**[Performance] 2,670 ms of total blocking time; 5.1 s of main-thread work.**

3.6 s of that is script evaluation. Same root cause as LCP, same fixes — but
worth listing separately because it is what makes the first tap feel dead, and
INP is the metric a card-by-card deck lives or dies on.

- **Fix:** The code splitting above is the lever. Also `MaterialCommunityIcons`
  is imported at module scope in `SimpleTabs.js`, `EmptyState.js`,
  `HistoryScreen.js` and `TrendGrid.js`, which pulls the font module into the
  entry chunk.

### Medium priority (4 found)

**[Performance] The icon font is 1.3 MB for sixteen glyphs.**
`dist/assets/.../MaterialCommunityIcons.*.ttf` — 593 KB gzipped on the wire, and
Lighthouse's network dependency tree shows it as the longest critical chain
(2,180 ms).

The app uses 16 distinct glyph names: `arrow-left`, `cards-outline`,
`chart-line-variant`, `chevron-right`, `close`, `cloud-download-outline`,
`file-download-outline`, `file-upload-outline`, `open-in-new`, `package-down`,
`package-variant-closed`, `restore`, `scale-balance`, `share-variant`, `target`,
`trash-can-outline`. The shipped face carries roughly seven thousand.

- **Impact:** The single largest asset on the site, larger than the gzipped
  JavaScript bundle, downloaded on every cold visit for 0.2% of its contents.
- **Fix:** Subset to the used glyphs at build time (`fonttools pyftsubset`
  against the codepoints in `MaterialCommunityIcons.json`), or replace the 16
  with inline `react-native-svg` paths — the app already depends on
  `react-native-svg` for every chart. Either drops ~580 KB from the critical path.

**[SEO] No meta description.** `dist/index.html`

Lighthouse's one SEO failure. Expo's default template has no description and the
project does not override it.

- **Impact:** Search results and every link preview — including the "share with a
  friend" links the app exists to hand out — show whatever the crawler scrapes,
  which for a client-rendered SPA with an empty `#root` is nothing.
- **Fix:** `npx expo customize index.html` writes `public/index.html`, which
  `createTemplateHtmlFromExpoConfigAsync` prefers over its built-in template.
  Add `<meta name="description">`, Open Graph and `theme-color` there. Same file
  fixes the two items below.

**[Accessibility] The deck's progress bar has no accessible name.**
`app/screens/AssessmentScreen.js:159`

The `View` carries `accessibilityRole="progressbar"` and `accessibilityValue`,
but no label, so it is announced as "progress bar, 12" with no noun.

- **Fix:** `accessibilityLabel={t('assessment_progress', { current: session.index + 1, total })}`
  — the string already exists and is already rendered above the bar.

**[Accessibility/SEO] `<html lang>` is hard-coded `en` in a bilingual app.**

The template ships `lang="en"` and nothing updates it when the reader picks
Русский on the first card.

- **Impact:** A screen reader pronounces Russian value names with English
  phonetics — the deck is 47 of them.
- **Fix:** Set `document.documentElement.lang` from the i18n language, behind the
  same predicate style the codebase uses for other web-only capabilities.

### Low priority (3 found)

**[Best practices] `httpEquiv` is not an HTML attribute.** `dist/index.html:5`

Expo's template emits `<meta httpEquiv="X-UA-Compatible" content="IE=edge" />` —
the JSX prop name, not the HTML attribute `http-equiv`. The tag is inert. It
also targets IE, which is gone. Drop it in `public/index.html`.

**[Performance] The icon font has no `font-display`.** Est. 20 ms of invisible
text. `font-display: swap` in the template's inline style block.

**[Best practices] No source maps deployed.** Lighthouse's only best-practices
finding (the category still scores 100). Production debugging is guesswork
without them; `expo export --source-maps` and a `.nojekyll`-safe upload would fix
it, at the cost of publishing readable source.

### Checked and not a problem

- **Text compression.** Lighthouse reports 1,901 KiB of savings, measured
  against the local `python3 -m http.server`. GitHub Pages returns
  `content-encoding: gzip` on the bundle, the font and the wasm — verified
  against the live site. Not a real finding.
- **CLS 0.01.** The measured-height work in `DeckCardText` is holding.
- **Console errors, mixed content, HTTPS, deprecated APIs, charset, doctype,
  viewport, tap-target sizes, crawlability:** all pass.
- **Cache lifetimes.** Lighthouse asks for long TTLs on the hashed assets;
  GitHub Pages sends `cache-control: max-age=600` and does not let a project
  change it. Not fixable without leaving Pages, and not worth leaving Pages for.

## Summary

| Category | Issues | High |
|---|---|---|
| Performance | 4 | 2 |
| Accessibility | 3 | 1 |
| SEO | 2 | 0 |
| Best practices | 2 | 0 |

## Recommended order

1. **`accessibilityState={{ checked }}` in `ScaleInput` and `SegmentedToggle`.**
   Two words, and it is the app's main control being unusable by screen reader.
2. **`public/index.html`.** One new file clears the meta description, the
   `httpEquiv` nit, `font-display`, and gives the static-markup LCP fix somewhere
   to live.
3. **Subset the icon font.** Biggest single byte win, no behaviour change.
4. **Split the chart layer and settings out of the entry chunk.** The largest
   remaining performance item, and the one that needs real care — `ApkInstaller`
   is the pattern to copy, and the web build has to be opened in a browser after,
   per the note at the end of `CLAUDE.md`.
5. **`document.documentElement.lang` from i18n.**

Nothing here touches the invariants in `CLAUDE.md`: no database call, no
preference route, no change to what is asked in front of the deck.
