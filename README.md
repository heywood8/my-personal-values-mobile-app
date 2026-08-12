# Values

![Coverage: Statements](./coverage/badge-statements.svg)
![Coverage: Branches](./coverage/badge-branches.svg)
![Coverage: Functions](./coverage/badge-functions.svg)
![Coverage: Lines](./coverage/badge-lines.svg)

Values is a personal-values tracker for Android, iOS and the web, built with React
Native and Expo. You rate a deck of value cards, see where each one sits relative
to the others, and recalibrate whenever you like — so you can watch what actually
changes over months rather than trusting your memory of what mattered last year.

## How it works

1. **Pick a language** — English or Russian.
2. **Pick a rating scale** — 1 to 5, 1 to 10, or three words (not important →
   very important). You can change it later; past records keep the scale they
   were taken on.
3. **Rate the deck** — 48 values across 8 groups, one card at a time. Answers are
   saved as you give them, so you can stop halfway and pick up where you left off.
4. **Read the result** — as a ranking from least to most important, or grouped by
   area of life.
5. **Recalibrate** — whenever you want. Recalibrating on the same day overwrites
   that day's record; on a different day it becomes a new one, and the History
   screen shows what moved between them.

## Features

- **Calibration deck** — 48 values in 8 groups, dealt so that no two consecutive
  cards come from the same group
- **Three rating scales** — scores are stored both as given and normalised, so a
  history that spans a change of scale stays comparable
- **Results** — a ranked bar list (lowest first by default) and a group breakdown
- **History** — biggest movers between the last two calibrations, and a trend
  chart for up to five values at once
- **Your own values** — add values the catalogue does not have, archive the ones
  you do not care about
- **Light and dark themes**, following the system by default

## Platforms

Android, iOS and web from one codebase. All data is stored locally on the device
— in SQLite on Android and iOS, and in the browser's origin-private file system
on the web. Nothing is sent anywhere.

## Internationalisation

English and Russian. Adding a language means adding a loader in
`app/contexts/LocalizationContext.js`, a locale file under `assets/i18n/`, and an
entry in the three tables in `app/utils/languages.js` — the test suite fails by
name if any of them is missed.

## Contributing & development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for setup, build and test
instructions, and [docs/DATABASE.md](docs/DATABASE.md) for the data model and how
migrations are generated.
