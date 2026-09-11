# Drafted standards-corpus guides

These documents are written for The-Focus-AI/standards `best-practices/`,
in that repository's guide format (STD-001, STD-006), and validated against
its renderer (`mise run standard:render`) and document validator
(`mise run docs:validate`). They live here because agent tokens cannot push
to the standards repository.

To adopt them, copy the files verbatim into that repository's
`best-practices/` directory (STD-006 §3.9 — migration copies, it does not
paraphrase):

- `GDE-014-progressive-web-apps.md` — installability, service worker,
  weak-signal navigation, device capabilities, mobile layout.
- `GDE-015-offline-first-applications.md` — local commit, sync cycle and
  outbox, idempotency, retry discipline, multi-device convergence,
  pre-downloaded data.

`014` and `015` were the next free GDE numbers when these were drafted
(2026-08-29); renumber per STD-006 §3.10/§3.11 if the sequence has moved on.
Both are distilled from this repository's full history — each claim cites
the walking-thoughts commit, PR, or ADR that taught it.
