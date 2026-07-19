# PROTOTYPE — trail cleanup UI

Throwaway variants answering:

> For **density**, **sync glanceability**, and **map findability** — what
> should the trail surface look like?

Not production. Fixture data only. Switcher hidden when `NODE_ENV=production`.

## Run

```bash
mise run dev
# then
mise run prototype:trail-cleanup
```

Open:

`http://127.0.0.1:3000/prototype/trail-cleanup?area=density&variant=A`

| Control | Action |
| --- | --- |
| Density / Sync / Map tabs | Switch problem area |
| ← → (or keyboard arrows) | Cycle A → B → C within the area |

## Variants

### Density

| Key | Name | Idea |
| --- | --- | --- |
| A | Sticky dock trail | No hero; timeline is the page; Capture dock sticky |
| B | Composer-first sheet | Capture owns the viewport; Thread is a pull-up peek |
| C | Day strip rail | Horizontal days + side rail; inline Capture |

### Sync

| Key | Name | Idea |
| --- | --- | --- |
| A | Queue chip strip | `N local · N syncing · …` chips + attention badge |
| B | Status swimlanes | Status is the primary axis (kanban) |
| C | Pulse gutter + footer | Fat per-row gutter + sticky “Working on X of Y” |

### Map

| Key | Name | Idea |
| --- | --- | --- |
| A | Map as home hero | Offline Region map is the first plane |
| B | Peer bottom tabs | Trail \| Map \| Threads thumb bar |
| C | Place strip + thumbnail | Compact Map Journal CTA with mini map |
