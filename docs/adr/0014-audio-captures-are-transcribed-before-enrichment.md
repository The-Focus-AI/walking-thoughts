# Audio Captures are transcribed before Enrichment, not sent as audio

The mic on the Capture screen is push-to-talk: hold it, speak, release, and
the recording commits as its own Thread. That makes audio the cheapest way to
Capture on the trail — and it collided with the Enrichment model. The default
gateway model, `anthropic/claude-sonnet-5`, reads text and images only, so
every audio Capture failed its job with `model_..._unsupported_media_audio`
(a permanent failure by design: ADR 0004 says we respect each model's real
capabilities rather than pretending). Only a model swap could recover it.

So the enrichment job runs speech-to-text first, through its own gateway
transcription model (`AI_TRANSCRIPTION_MODEL`, default
`openai/gpt-4o-mini-transcribe`, via the AI SDK's `transcribe`). The words go
into the prompt under the Capture they belong to, and audio the transcriber
already handled is dropped from the media parts when the Enrichment model
cannot decode it. A model that *does* read audio still receives the original
recording alongside the transcript.

We considered pointing `AI_GATEWAY_MODEL` at an audio-capable model instead
(Gemini reads audio and video), and rejected it: that makes hearing a walker
speak depend on one global model choice, and it leaves nothing durable behind.
Transcribing separately keeps model choice free and produces an artifact worth
keeping.

## Consequences

- Transcripts are retained on the Enrichment (`transcripts`, one row per audio
  attachment, with the model that heard them) and shown above the report, so
  the walker's own words survive even when the recording is later purged.
- A transcription outage fails the job as `transcription_unavailable_<id>`,
  which is retryable — a held thought is never silently reduced to a filename.
- Audio Captures cost two model calls: one to hear, one to think.
- The transcription model is a second gateway dependency to configure; without
  gateway credentials the fake transcriber keeps local dev and tests offline,
  the same seam the Enrichment gateway uses.
