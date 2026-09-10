# Route AI operations through Mycel

Supersedes ADR 0004's Vercel AI Gateway transport choice, not its requirement
to retain model provenance or respect model capabilities. Requested in #179.

Use Mycel for Enrichments, Day digests, Artifact publishing, embeddings, and
recorded-audio transcription. Keep the AI SDK tool loop in-process (ADR 0012),
and transcribe recordings before Enrichment (ADR 0015). Mycel is the Umwelten
model exchange, not the unrelated mycelhq agent runtime.

The application uses the public OpenAI-compatible protocol directly rather
than depending on an unpublished Umwelten package. Chat and embeddings use
the AI SDK compatible provider; transcription uses multipart HTTP so the
Capture's original filename and MIME type survive. Each client is scoped to
the authenticated walker. No environment-wide end-user identity is used.

Resolve each environment's Application credential with fnox/1Password and
keep it server-only. Production fails closed without it. Isolated keyless
development and injected test clients remain supported.

Read `/v1/models` per client lifetime and enforce its declared capabilities
before sending data. Also send hard capability requirements to Mycel, which
must select a single eligible supplier. Missing offers are retryable outages,
not evidence that media can be silently discarded. Offline fake clients keep
the historic static capability fixtures; they do not govern production.

The model configuration variable names remain compatible. Stored Enrichments
and transcripts retain their original model IDs. Switching transport alone
does not rewrite history or justify comparing different embedding spaces.

Release requires live verification of all existing media paths and separate
Preview/Production Application credentials. Image/video generation UI is not
part of this migration.
