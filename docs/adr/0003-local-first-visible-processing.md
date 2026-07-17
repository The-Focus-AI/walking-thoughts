# Commit locally and expose processing state

Every Capture is durably committed on the device before synchronization begins. Synchronization and automatic Enrichment are retryable and idempotent, and each Capture visibly reports whether it is saved locally, syncing, enriching, complete, or needs attention. Starting or failing remote work never deletes the local content; this makes successful capture independently verifiable instead of asking the user to trust an opaque messaging workflow.
