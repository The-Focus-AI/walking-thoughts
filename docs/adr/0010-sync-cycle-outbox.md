# Drain Captures through one foreground sync cycle

Client synchronization is a single cycle owned by `runSyncCycle` and kept alive
by `SyncRuntime` on authenticated product screens (home, Map Journal, Threads,
Thread view) while open and online:

1. **Hydrate** — pull server Threads and import Captures missing locally so
   phone and desktop converge (local unsynced Captures stay authoritative).
2. **Recover** — abandoned / stale local Completes re-enter sync or Enrichment.
3. **Outbox** — media upload, then Capture metadata, then Enrichment.

Transport throws mark Captures `needs_attention` instead of wedging forever;
Captures that still hold unsynced local media wait until media upload succeeds
before metadata push. Background work while the app is closed remains
best-effort (ADR 0002); local commit before remote work remains mandatory
(ADR 0003).
