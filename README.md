# Values

![Coverage: Statements](./coverage/badge-statements.svg)
![Coverage: Branches](./coverage/badge-branches.svg)
![Coverage: Functions](./coverage/badge-functions.svg)
![Coverage: Lines](./coverage/badge-lines.svg)

Values is a personal-values tracker for Android, iOS and the web, built with React
Native and Expo. You rate a deck of value cards, see where each one sits relative
to the others, and recalibrate whenever you like — so you can watch what actually
changes over months rather than trusting your memory of what mattered last year.

Then it asks the other half of the question. For the values you called very
important, a wheel of ten rings asks how far your behaviour currently matches
them: the centre is "my behaviour does not correspond to my values", the outer
edge is "I live fully in accordance with them". Each filling-in is dated, so that
list is tracked over time too.

## How it works

1. **Pick a language** — English or Russian.
2. **Pick a rating scale** — 1 to 5, 1 to 10, or three words (not important →
   very important). You can change it later; past records keep the scale they
   were taken on.
3. **Rate the deck** — 47 values, one card at a time, strongest answer at the top.
   Answers are saved as you give them, so you can stop halfway and pick up where
   you left off.
4. **Read the result** — a ranking, most important first. Point at a row (or tap
   it) to read what the value means. Share it with a friend if you like: the link
   carries the ranking itself, so there is nothing to sign up to at either end.
5. **Fill in the wheel** — one sector per value you called very important, ten
   rings deep. It is a check-in, one per day, and the previous one stays visible
   behind it as a dotted outline.
6. **Recalibrate** — whenever you want. Recalibrating on the same day overwrites
   that day's record; on a different day it becomes a new one, and the History
   screen shows what moved between them. The wheel follows the ranking: whatever
   comes out at the top is what it asks about next time.

## Features

- **Calibration deck** — all 47 values, dealt in the source checklist's own order,
  1 to 47
- **Three rating scales** — scores are stored both as given and normalised, so a
  history that spans a change of scale stays comparable
- **Results** — a ranked bar list, most important first, with each value's own
  wording a hover or a tap away
- **The alignment wheel** — a second tracked list, for the values at the top of
  the ranking only: how far behaviour matches each of them, on ten rings, dated
  and comparable with every earlier check-in
- **History** — biggest movers between the last two calibrations, and a trend
  chart for up to five values at once
- **Backup in and out** — save everything you have as one spreadsheet-readable
  file and read it back on another device; the ranking and the wheel check-ins
  travel together, and files written by older versions still import
- **Share a ranking** — a link with the whole result packed inside it, so a friend
  opens it in a browser with no app, no account and nothing uploaded
- **Your own deck** — archive the values you do not care about, so they stop
  being dealt
- **Light and dark themes**, following the system by default
- **In-app updates on Android** — the app checks its own GitHub releases, and
  downloads, verifies and installs the APK itself, since there is no store
  listing to do it

## Platforms

Android, iOS and web from one codebase. All data is stored locally on the device
— in SQLite on Android and iOS, and in the browser's origin-private file system
on the web. Nothing is sent anywhere.

Which also means nothing is backed up anywhere, so everything can be saved as one
CSV file and read back in — on the web as a download and a file dialog, on a phone
through the share sheet and a paste box. One file, both lists: the ranking and the
wheel check-ins.

The one thing that ever leaves is a link you make yourself and hand to somebody:
"Share with a friend" puts the ranking *inside* the link rather than on a server,
so it opens as a read-only page in any browser. Anyone holding that link can read
the ranking, and opening one changes nothing in the reader's own records.

Open a friend's link with a ranking of your own and the two appear side by side —
value by value, with each side's score in the words it was answered in, and the
biggest disagreements a tap away. Your check-in wheel can travel in the link too,
if you switch it on before sending; it is off by default, and off again next time.
If you have not rated the deck yet, the link waits while you do.

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
