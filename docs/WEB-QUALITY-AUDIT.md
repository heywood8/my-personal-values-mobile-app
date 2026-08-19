# Web quality audit — 2026-08-19

Audit of the web export against the
[web-quality-audit skill](https://github.com/addyosmani/web-quality-skills#web-quality-audit)
— Lighthouse's four categories: performance, accessibility, SEO, best practices.

The accessibility, SEO and best-practices findings are **fixed**; they are kept
below with what the fix was, because two of them were wrong in a way that is easy
to reintroduce. The performance findings are **open**, and the last section says
why they were not taken in the same change.

## How it was run

```bash
bun run build:web
cd dist && python3 -m http.server 8099
CHROME_PATH=<chromium> npx lighthouse@12 http://localhost:8099/ \
  --only-categories=performance,accessibility,seo,best-practices \
  --chrome-flags="--headless=new --no-sandbox"
# repeated with --preset=desktop
```

Lighthouse 12.8.2, against the built `dist/` — the first run used the same bundle
hash that was live on `values.heywood8.com`, so the "before" column describes the
published site. Header-level findings (compression, cache lifetimes) were
re-checked against the real GitHub Pages response rather than the local static
server, which sends neither.

| Category | Before (mobile) | After (mobile) | Desktop (before) |
|---|---|---|---|
| Performance | 38 | 48 | 72 |
| Accessibility | 89 | **100** | 89 |
| Best practices | 100 | **100** | 100 |
| SEO | 90 | **100** | 90 |

Performance moved inside its run-to-run spread and nothing in this change was
aimed at it — read it as unchanged.

| Metric (mobile) | Value | Budget |
|---|---|---|
| FCP | 0.6 s | < 1.8 s ✅ |
| LCP | **21.0 s** | < 2.5 s ❌ |
| CLS | 0.02 | < 0.1 ✅ |
| TBT | **750 ms** (2,670 ms on the first run) | < 200 ms ❌ |

**What Lighthouse could see.** A run only ever reaches the first deck card, which
is the first-run screen and the only one reachable without answering 47 values.
The results, history, wheel and settings screens were never loaded — the
accessibility findings below are what the entry screen alone contained. The fixes
were applied to every matching call site, not only the ones the audit reached.

## Fixed

### `accessibilityState` reaches no DOM on react-native-web

**Was:** every state flag in the app — `checked`, `selected`, `expanded` — was
written as `accessibilityState={{ … }}`. react-native-web 0.21 reads the
`aria-*` props and consults `accessibilityState` only to decide whether an
element is disabled; the ARIA attribute was never written. On the deck's rating
buttons this was not a quiet omission but an axe failure, because `role="radio"`
*requires* `aria-checked`: ten nodes on the entry screen alone, including all
five buttons of the 1–5 scale.

**Impact:** a screen reader announced the app's primary control — repeated 47
times per run — as a radio group with no answer given. The reader could not hear
what they had just answered.

**Fix:** the state is written as an `aria-*` prop at every call site. React
Native folds those back into `accessibilityState` for native assistive tech (the
tests assert the native side, through `toBeChecked()`), so it is one prop for
both platforms rather than two spellings to keep in agreement.

- `app/components/ScaleInput.js`, `app/components/SegmentedToggle.js` — `aria-checked`
- `app/components/charts/TrendGrid.js`, `app/screens/HistoryScreen.js` — `aria-checked`
- `app/navigation/SimpleTabs.js` — `aria-selected`
- `app/components/charts/RankedValueBars.js`, `app/screens/HistoryScreen.js`,
  `app/screens/AlignmentScreen.js` — `aria-expanded`

`AlignmentScreen` had already found this from the other end: its record rows say
"open" inside the accessible *name* because the flag was observed not to reach
the browser. That workaround is left in place — a date and a coverage count is a
thin thing to identify a row by — but the comment explaining it no longer claims
the flag is impossible.

### The deck's progress bar had no accessible name

`app/screens/AssessmentScreen.js` — the bar carried `role="progressbar"` and a
value but no label, so it was announced as "progress bar, 12" with no noun.
Labelled from a new string, `assessment_progress_label`, in both locales; the
existing `assessment_progress` is the visible "12 of 47" and reads poorly as a
name.

### No meta description

The one SEO failure. `expo.web.description` and `expo.web.themeColor` in
`app.config.js` become `<meta>` tags in the export —
`createTemplateHtmlFromExpoConfigAsync` reads them off the config, so neither
needs a forked HTML template.

It matters more here than the score suggests: the site renders client-side into
an empty `#root`, so a crawler or a link preview has nothing else to quote — and
the links being previewed are the "share with a friend" links the app exists to
hand out.

### `<html lang>` was hard-coded `en` in a bilingual app

The template ships `lang="en"` and nothing updated it when the reader picked
Русский on the first card, so a screen reader pronounced 47 Russian value names
with English phonetics. `applyDocumentLanguage()` in `app/utils/languages.js`
labels the document, called from `LocalizationProvider` whenever the language
changes — asked by predicate rather than by branching on `Platform`, since native
has no document to label.

## Open — performance

Nothing below is fixed. All three are the same root cause seen from different
angles: everything the app can do arrives before anything is on screen.

**LCP is 21 s on mobile, and 98% of it is render delay.** TTFB is 451 ms and the
LCP element loads nothing of its own; the rest is the browser parsing and
executing 2.5 MB of JavaScript before any text exists. Desktop (3.5 s) also
misses the 2.5 s budget.

**The icon font is 1.3 MB for sixteen glyphs.** 593 KB gzipped on the wire —
larger than the gzipped JavaScript bundle — and Lighthouse's network dependency
tree shows it as the longest critical chain at 2,180 ms. The app names 16 icons;
the shipped face carries roughly seven thousand.

**1,669 KiB of the 2,535 KiB entry chunk is unused at first paint.**
`ApkInstaller` is already split out behind an `await import()`; the chart layer
(`react-native-svg`, `TrendGrid`, `AlignmentWheel`) and `SettingsScreen` are the
obvious next candidates, and `MaterialCommunityIcons` is imported at module scope
in four files, which pulls the font module into the entry chunk.

### Why they are not in this change

The two big wins are both riskier than they look, and neither is verifiable by
the test suite:

- **Subsetting the font** silently blanks an icon on all three platforms if the
  glyph set misses one. That set cannot be derived from `app/` alone: names are
  written as literals in ternaries as well as attributes, and react-native-paper
  draws its own icons by name from inside `node_modules`. It needs a generated
  manifest, a test that fails when a name is used that the subset does not carry,
  and a pass over every screen in a browser.
- **Splitting the chart layer** changes what is on screen during a lazy chunk's
  load on every platform, not just the web.

Both are worth doing. Both want their own change, with the browser sweep the note
at the end of `CLAUDE.md` asks for.

## Checked and not a problem

- **Text compression.** Lighthouse reports 1,901 KiB of savings, measured against
  the local `python3 -m http.server`. GitHub Pages returns
  `content-encoding: gzip` on the bundle, the font and the wasm — verified
  against the live site. Not a real finding.
- **CLS 0.02.** The measured-height work in `DeckCardText` is holding.
- **Cache lifetimes.** Lighthouse asks for long TTLs on the hashed assets; GitHub
  Pages sends `cache-control: max-age=600` and does not let a project change it.
  Not fixable without leaving Pages, and not worth leaving Pages for.
- **Source maps.** Lighthouse's one remaining best-practices note (the category
  still scores 100). Deploying them would mean publishing readable source; that
  is a choice, not a defect.
- **`<meta httpEquiv="X-UA-Compatible">`.** Expo's own template emits the JSX
  prop name rather than the HTML attribute `http-equiv`, so the tag is inert. It
  targets IE, which is gone. Forking the whole HTML template to delete a dead tag
  costs more than it saves; it belongs upstream.
- **Console errors, mixed content, HTTPS, deprecated APIs, charset, doctype,
  viewport, tap-target sizes, crawlability:** all pass.
