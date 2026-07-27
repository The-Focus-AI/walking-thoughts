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
`openai/gpt-realtime-whisper`, via the AI SDK's `transcribe`). The words go
into the prompt under the Capture they belong to, and audio the transcriber
already handled is dropped from the media parts when the Enrichment model
cannot decode it. A model that *does* read audio would still receive the
original recording alongside the transcript.

We considered pointing `AI_GATEWAY_MODEL` at an audio-capable model instead,
and found there is no such model to point at. The gateway publishes
`modalities.input` per model at `/v1/models`: on 2026-07-26 all 204 of its
language models accept text, 122 accept image, 94 accept pdf, and none accept
audio or video. Two of that table's own entries claimed to read audio, and both
were wrong — 2025-era models, since dropped along with everything else released
before 2026. Transcription is not the convenient route to a report for a spoken
Capture; it is the only one.

The gateway offers five transcription models, and newest is not the same as
callable. We defaulted to `openai/gpt-realtime-whisper` (2026-05-07) and it
failed every audio Capture in production: it is tagged `websocket-realtime`
and streams transcript deltas from live audio, while Enrichment runs long
after the walk, on a file, over the batch endpoint. The default is
`xai/grok-stt` (2026-03-16), which advertises "batch and streaming modes" and
costs a tenth as much per second. When choosing a transcription model, read
the tags: `websocket-transcription` alone is not enough.

## Consequences

- Transcripts are retained on the Enrichment (`transcripts`, one row per audio
  attachment, with the model that heard them) and shown above the report, so
  the walker's own words survive even when the recording is later purged.
- A transcription outage fails the job as
  `transcription_unavailable_<model>_<id>`, which is retryable — a held thought
  is never silently reduced to a filename. The model is named because a wrong
  one fails identically forever, and naming it lets the queue offer the Thread
  one fresh job when `AI_TRANSCRIPTION_MODEL` changes, exactly as a permanent
  media refusal already does. The underlying gateway error is logged rather
  than swallowed.
- Audio Captures cost two model calls: one to hear, one to think.
- Which model heard a Capture is recorded on its transcript, so switching
  `AI_TRANSCRIPTION_MODEL` later leaves the record of what produced each one.
- Video Captures remain unenrichable: nothing on the gateway reads them, and
  unlike audio they have no transcription equivalent yet.
- The transcription model is a second gateway dependency to configure; without
  gateway credentials the fake transcriber keeps local dev and tests offline,
  the same seam the Enrichment gateway uses.
