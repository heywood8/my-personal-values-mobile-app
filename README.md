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
3. **Rate the deck** — 47 values, one card at a time, strongest answer at the top.
   Answers are saved as you give them, so you can stop halfway and pick up where
   you left off.
4. **Read the result** — a ranking, most important first. Point at a row (or tap
   it) to read what the value means.
5. **Recalibrate** — whenever you want. Recalibrating on the same day overwrites
   that day's record; on a different day it becomes a new one, and the History
   screen shows what moved between them.

## Features

- **Calibration deck** — all 47 values, dealt in the source checklist's own order,
  1 to 47
- **Three rating scales** — scores are stored both as given and normalised, so a
  history that spans a change of scale stays comparable
- **Results** — a ranked bar list, most important first, with each value's own
  wording a hover or a tap away
- **History** — biggest movers between the last two calibrations, and a trend
  chart for up to five values at once
- **CSV in and out** — save every record as a spreadsheet-readable file and read
  it back on another device
- **Your own values** — add values the catalogue does not have, archive the ones
  you do not care about
- **Light and dark themes**, following the system by default

## Platforms

Android, iOS and web from one codebase. All data is stored locally on the device
— in SQLite on Android and iOS, and in the browser's origin-private file system
on the web. Nothing is sent anywhere.

Which also means nothing is backed up anywhere, so records can be saved as a CSV
file and read back in — on the web as a download and a file dialog, on a phone
through the share sheet and a paste box.

## The value catalogue

The deck **is** the values checklist from Russ Harris's *The Confidence Gap*
(Penguin Group Australia, 2010), an Acceptance and Commitment Therapy staple —
all 47 entries, named and described in the checklist's own words rather than
paraphrased. English follows Harris's original wording; Russian follows the
translation published by «Школа Здорового Взрослого».

Cards are dealt in the checklist's own numbering, 1 to 47, so working through
the deck is working through the document. An earlier version of this deck was
dealt round-robin across eight groups, so that no two consecutive cards shared
one — a guard against rating a whole theme once and then coasting. That guard
lost to fidelity: the checklist is meant to be taken as printed, and reordering
someone else's instrument is a change to it.

Those eight groups were this app's own, and they are gone as well. The checklist
is a flat list of 47 values; sorting them into areas of life added a second thing
to read on every screen, and it was never Harris's. What is left is the values
themselves.

## Internationalisation

English and Russian. Adding a language means adding a loader in
`app/contexts/LocalizationContext.js`, a locale file under `assets/i18n/`, and an
entry in the three tables in `app/utils/languages.js` — the test suite fails by
name if any of them is missed.

## Contributing & development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for setup, build and test
instructions, and [docs/DATABASE.md](docs/DATABASE.md) for the data model and how
migrations are generated.
