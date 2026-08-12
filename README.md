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
3. **Rate the deck** — 47 values across 8 groups, one card at a time. Answers are
   saved as you give them, so you can stop halfway and pick up where you left off.
4. **Read the result** — as a ranking from least to most important, or grouped by
   area of life.
5. **Recalibrate** — whenever you want. Recalibrating on the same day overwrites
   that day's record; on a different day it becomes a new one, and the History
   screen shows what moved between them.

## Features

- **Calibration deck** — 47 values in 8 groups, dealt in the source checklist's
  own order, 1 to 47
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

## The value catalogue

The deck **is** the values checklist from Russ Harris's *The Confidence Gap*
(Penguin Group Australia, 2010), an Acceptance and Commitment Therapy staple —
all 47 entries, named and described in the checklist's own words rather than
paraphrased. English follows Harris's original wording; Russian follows the
translation published by «Школа Здорового Взрослого».

Cards are dealt in the checklist's own numbering, 1 to 47, so working through
the deck is working through the document. An earlier version of this deck was
dealt round-robin across the groups, so that no two consecutive cards shared
one — a guard against rating a whole theme once and then coasting. That guard
lost to fidelity: the checklist is meant to be taken as printed, and reordering
someone else's instrument is a change to it.

The eight groups are this app's own. The checklist is a flat list, and the deck
needs groups for the breakdown on the results screen and for the chart palette.
Group sizes are uneven because the checklist's own emphasis is uneven — it
carries three entries about achievement and nine about self-directed growth, and
evening that out would mean inventing values Harris did not list.

## Internationalisation

English and Russian. Adding a language means adding a loader in
`app/contexts/LocalizationContext.js`, a locale file under `assets/i18n/`, and an
entry in the three tables in `app/utils/languages.js` — the test suite fails by
name if any of them is missed.

## Contributing & development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for setup, build and test
instructions, and [docs/DATABASE.md](docs/DATABASE.md) for the data model and how
migrations are generated.
