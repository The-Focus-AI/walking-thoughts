# Verdict — desk inbox (desktop processing) prototype

**Picked:** **D + H** — the Lens desk's grouped, keyboard-driven, expandable
list with the **Facet rail** as its filtering affordance.

| Round | Question | Winner | Keep |
| --- | --- | --- | --- |
| 1 (A–C) | What shape is the processing surface? | A's keyboard, C's detail | `j`/`k`/`r`/`n`/`x` filing that auto-advances; the full per-Thread detail (words, enrichment, media, similar, filing) — but not C's table density |
| 2 (D–E) | Grouping and back-and-forth | **D** (Lens desk) | Group-by lenses (Days / Topics / Kind / Media / Reports); expandable rows at calm density. E's dialogue is not dropped — see below |
| 3 (F–H) | How do you zoom in? | **H** (Facet rail) | Sidebar facets with live counts (State / Kind / Topic / Media / History); selections combine; counts recompute; zero-count facets disable |

## Why H

The counts answer "which ones are questions, which are tasks, which are
open" **before any click** — the rail is both the filter and a summary of
the queue's shape. F's explicit bar and G's token omnibox filter equally
well but tell you nothing until you act. G's token language (`kind:question
is:open`) remains a good future keyboard accelerator on top of H, not a
competing surface.

## Production intent

One desk processing surface, built from the pieces the rounds validated:

1. **Layout** — H's facet rail on the left; D's grouped expandable rows as
   the list; facets filter, the Group-by lens arranges what remains.
2. **Keyboard** — A's keys throughout: `j`/`k` move, `r` keep research &
   done, `n` just done, `x` dismiss & done; filing auto-advances. `g`
   cycles the lens.
3. **State model** — Thread `reviewed` and a per-Enrichment research
   verdict (`kept` / `dismissed`) are separate fields. `ThreadFiling`
   (lib/sync/review-client.ts) grows the verdict alongside
   `reviewed`/`kind`/`projectId`; kept reports are the Artifact candidates.
4. **Opened Thread = dialogue** — E's conversation view is the natural
   detail surface when a row needs more than filing: ask into the Thread,
   answers append as Enrichments. (Second phase; the expandable row ships
   first.)
5. **Similarity** — "N prior" on rows and the similar-Threads list need a
   real index: pgvector on Capture + Enrichment text embedded at
   enrichment time, plus structured `mentions[]` returned by the gateway
   like `title`; exact mention links first, embedding fallback second.
6. **Facet counts** — computed over the walker's Threads with the other
   facet groups applied (as the prototype does); Topic facet = Project or
   leading mention, which also surfaces Proposed Projects accruing.

## Primary source

All eight throwaway variants live under `/prototype/desk-inbox` on branch
`claude/prototype-skill-review-5vdcsc`: A Triage rail · B Light table ·
C Batch ledger · D Lens desk · E Dialogue desk · F Filter bar ·
G Command desk · H Facet rail. Fixture data only; similarity scores are
precomputed stand-ins for an embedding index.
