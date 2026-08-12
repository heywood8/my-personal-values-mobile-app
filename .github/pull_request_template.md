<!--
  PR title = changelog entry. It MUST follow Conventional Commits — the
  "PR Title Check" workflow enforces it, and release-please turns the squashed
  title into the release notes. Pick one type:
    feat | fix | docs | style | refactor | perf | test | build | ci | chore | revert
  Scope is optional. Common scopes: (calibration) (results) (history) (settings)
  (values) (i18n) (web) (db).
  Example:  fix(history): keep a trend line intact across a scale change
-->

## Summary

<!-- What changed and why, in 1–3 sentences.
     Bug fix? Lead with the problem and its root cause. -->

## Changes

<!-- File-keyed bullets describing what you actually changed, e.g.
- **app/screens/ResultsScreen.js** — remember the sort direction between launches.
- **assets/i18n/*.json** — add `results_sort_asc` in both locales. -->

-

## Testing

<!-- Required. Paste the exact command(s) and the result, e.g.
     `bun run test` — 12 suites / 96 tests pass.
     Add any manual steps you ran, and on which platforms. -->

-

## Checklist

- [ ] Title follows Conventional Commits (`type(scope): subject`)
- [ ] `bun run test` is green (all suites pass)
- [ ] `bun run lint:ci` is clean (it fails on warnings too)
- [ ] User-facing strings added to **both** `assets/i18n/*.json` files — or n/a
- [ ] Checked on web as well as native if the change touches storage or layout — or n/a
- [ ] Linked the related issue with `Closes #NNN` below — or n/a

Closes #
