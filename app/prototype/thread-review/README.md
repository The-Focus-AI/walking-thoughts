# PROTOTYPE — Thread review UI

Throwaway variants answering:

> After the walk, what makes the Thread page good for **going back over the
> notes and photos** — seeing what I wrote, what research came back, and what
> the follow-ups are?

Not production. Fixture data only. Switcher hidden when `NODE_ENV=production`.

## Run

```bash
mise run dev
```

Open:

- `/prototype` — hub with **Mobile** and **Desktop** links for every variant
- `/prototype/thread-review?viewport=mobile&area=review&variant=A`

| Control | Action |
| --- | --- |
| Mobile / Desktop tabs | Pixel frame (390×844) vs desktop shell (1280×900) |
| Review / Enrich tabs | Switch problem area |
| ← → (or keyboard arrows) | Cycle A → B → C within the area |

## Variants

### Review — the Thread page as a review surface

| Key | Name | Idea |
| --- | --- | --- |
| A | Field ledger | Dense journal; your words primary; annotations fold open per Capture; time gutter |
| B | Split lanes | My words vs annotations as parallel lanes; filter chips (Everything / My words / Annotations / Follow-ups) |
| C | Recap first | Photo grid + aggregated follow-up checklist up top; full transcript below with jump links |

All three replace the chat bubbles with review-density layouts, and all three
demote the chat composer: **a new Capture starts its own Thread by default**,
with "Reply in this Thread" as the explicit secondary action.

### Enrich — how one Enrichment reads

| Key | Name | Idea |
| --- | --- | --- |
| A | Annotation card | Markdown body under your words; sources as chips; research trace folded in a `<details>` |
| B | Margin notes | Answer decomposed into short notes pinned to phrases of the Capture (numbered highlights) |
| C | Research dossier | The work shown first — tool timeline (search → read → annotate), then findings, sources, follow-ups |

## What this implies for the real Enrichment pipeline

The prototypes assume Enrichment = **remember + annotate**, which needs three
production changes (out of scope here, sketched for discussion):

1. **Research tools.** `lib/enrichment/search.ts` already has a pluggable
   `WebSearchClient` (Tavily today). An Exa client is the same shape
   (`search(query) → results`). Firecrawl adds a second capability — *read a
   page in full* (`scrape(url) → markdown`) — so the gateway prompt loop can
   search, pick, and read before answering. The trace shown in the prototypes
   (`Searched … / Read …`) is the log of those calls, stored on the
   Enrichment alongside `sources`.
2. **Markdown.** Enrichment `text` should be treated as markdown and rendered
   (the prototype ships a toy renderer; production wants `react-markdown` or
   similar, sanitized). Today `ThreadChat` renders it as a plain `<p>`.
3. **Follow-ups as data.** The model should return follow-ups as a structured
   list (like it returns `title`), so the review surface can aggregate an
   open-questions checklist per walk and offer one-tap "Ask" to spawn the
   research as a follow-up Capture.
