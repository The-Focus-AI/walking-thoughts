# Drain Captures through one foreground sync cycle

Client synchronization is a single outbox cycle — media upload, then Capture
metadata, then Enrichment — owned by `runSyncCycle` and kept alive by
`SyncRuntime` on authenticated product screens (home, Map Journal, Threads,
Thread view) while open and online. Abandoned `syncing` Captures re-enter the
outbox; transport throws mark them `needs_attention` instead of wedging forever;
Captures that still hold unsynced local media wait until media upload succeeds
before metadata push. Background work while the app is closed remains
best-effort (ADR 0002); local commit before remote work remains mandatory
(ADR 0003).
