# Capture and Days — the two-surface split

The app has two working surfaces and they do not overlap. Everything else
(Map, You) is support.

## Capture — the trail instrument (`/`, `/offline`)

One job: get the thought out of the walker's head and onto the phone,
one-handed, in sunlight, without signal.

What is on it, in order down the sheet:

1. Topbar — brand, offline-readiness pill, account button.
2. Masthead (`WALKING THOUGHTS · PROVISIONAL SURVEY` / `TRAIL LOG` / date),
   compact on phones so the map and the composer keep the height.
3. Instrument strip — position and weather, only when measured.
4. The Offline Region map, the ground the walking happens on.
5. The composer: text, audio, video, photo, attach, **Capture**.
6. The scale-bar footer: the sync promise, the day's tally in the canonical
   status labels (`3 Captures today · 2 Enriching · 1 Complete`), device
   storage when known, and one link to Days.

The whole surface fits one phone screen. What is deliberately **not** here:

- The day's Captures or Threads as entries. The tally is the whole report.
- Per-attachment storage controls ("Remove from device"), which are a desk
  decision and live on the Thread.
- Account, export, and data-handling disclosures, which live on You.
- Filter chips, search, queues.

The one thing the desk says to the trail is a single line on the Days link:
`2 reports ready`, `1 Thread needs a word`, `2 Threads need attention` — the
most pressing first, and nothing at all when nothing is waiting
(`lib/desk/summary.ts`). It is a count and a place to go, never a badge.

## Days — the desk (`/days`, `/days/[dayKey]`, `/threads/[threadId]`)

The walk is over and the unit of work is a **Day**. The workspace lives in
the `(desk)` route group's layout so the list stays mounted while the walker
moves between a day and a Thread; the selection comes from the route.

- **`/days`** — one ruled row per walk: `Today` / `Fri, Jul 24`, what it
  holds (`5 Threads · 12 Captures · 3 media`), and what it still wants
  (`3 waiting`, `2 need a word`, `All filed`). Search cuts across every day
  and is the one way past the day-by-day frame.
- **`/days/[dayKey]`** — the day itself: its sheet (counts, kinds, whether a
  Thread wants a word), then its Threads with filing, kind, and status on
  each row, then an ongoing chat with the whole day. Unfiled Threads sort
  first; filed ones settle back but stay readable.
- **`/threads/[threadId]`** — one Thread: the Capture hero, its Enrichment
  as a report, the conversation, filing, media retention. Filing advances to
  the next unfiled Thread **from the same day**, then back to the day.

Phones swap panes on selection; desktop (≥960px) shows the day list and the
detail side by side. Horizontal swipes across the detail pane step between
Threads in display order.

## What this replaced

The trail home used to carry the full Today log — every Capture with its
attachments, retry buttons, and per-file storage controls — under the map,
plus an account/data-handling disclosure block and a page footer. `/threads`
was a flat queue with five stacked filter strips (New/All, search, kind,
project, day) above day sections. Both surfaces were doing the other's job.
