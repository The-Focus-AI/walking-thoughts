# PROTOTYPE — offline sync and Enrichment state

This throwaway logic prototype asks: **Can an append-only Thread synchronize and
Enrich automatically without losing earlier context when Captures arrive during
remote work, jobs fail, or multiple Threads process independently?** It models
local-first Captures, idempotent upload and Enrichment jobs, frozen history points,
visible Capture states, retries, and duplicate delivery. Everything is in memory.

Run it with:

```sh
mise run prototype:sync
```

Useful commands inside the prototype:

- `c trail A barred owl near the creek` — append a Capture to `trail`
- `on` / `off` — change connectivity
- `s` — advance one queued/running job by one phase
- `d` — drain all runnable work
- `f enrich` — make the next Enrichment completion fail
- `r all` — retry failed work
- `p during` — load the “Capture during Enrichment” scenario
- `p parallel` / `p failure` — load other hard cases
- `show` — re-render; `q` — quit

The portable state machine is in `machine.mjs`; `cli.mjs` is only a disposable
terminal shell.
