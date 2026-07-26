# Reports are published as Artifacts — pages of their own, laid out from DESIGN.md

A researched Enrichment is a page's worth of work read through a chat
transcript. The Thread is the right home for the *record* — append-only,
chronological, every Capture and Annotation in order (ADR 0001) — and the
wrong shape for the *reading*: a 2,400-character cited report on Catskill
bluestone arrives as one long markdown blob between a Capture and a reply
box, in the same visual register as "hm".

We add the **Artifact**: one Enrichment published as a page, on its own
URL, browsable whole. The Enrichment stays exactly what it was; the
Artifact is its readable form.

**Only reports earn one.** The Enrichment registers
(`lib/enrichment/system-instruction.ts`) are deliberately unequal — a
question earns a full cited report, an idea a sharpened write-up, a task
three sentences, noise one line. `earnsArtifact` publishes for `question`
and `idea` above a length floor, for unclassified Enrichments only when
they are plainly long enough to be reports anyway, and never for the
kinds that were never reports. A "REPORT" masthead over "Call the stone
yard" would be the conceit producing fake data, which DESIGN.md forbids.

**Publishing is automatic, at Enrichment time.** The walker sits down and
the page is already waiting; they do not ask for it. It is a second,
narrower gateway pass over a finished report — no search, no memory, no
media, because the research is already done and frozen. A publish failure
never fails the Enrichment: the Thread already holds the answer, and the
page is only the readable form of it. `POST /api/artifacts/publish` is
the manual fallback, for a Thread the queue judged too slight or one
whose page was lost to a gateway outage.

**The model writes the body; the app prints the sheet.** Asking a model
for a whole styled document makes design a per-page lottery. Instead the
publish instruction hands it DESIGN.md's Quadrangle rules and the class
vocabulary the Artifact stylesheet defines
(`artifact-lede`, `artifact-key`, `capture-words`, `instrument-strip`,
`artifact-note`, `artifact-open`), and the masthead, marginalia, source
citations, and scale-bar footer are printed around it from the app's own
record. The sheet is rendered on read rather than stored, so a DESIGN.md
change reaches every published page at once, and no Artifact can invent a
source or a date.

**Model HTML is re-emitted, never passed through.** The body is served
from this origin to the walker's authenticated session, so
`sanitizeArtifactHtml` rewrites it from a tag/attribute allowlist —
escaping text, unwrapping unknown tags, dropping script-bearing elements
with their contents, and admitting only `http(s)`/`mailto` hrefs. The
route sets an independent `default-src 'none'` CSP with inline styles and
same-origin fonts, so neither layer is trusted alone.

## Consequences

- New `artifacts` table, keyed by `user_id`, with the artifact id derived
  from the Enrichment id — publishing the same report twice returns the
  page already stored rather than a second one.
- The desk asks `/api/artifacts` once per load, not once per Thread, and
  retains the list, so a Thread that has a page still says so offline.
- Reports cost a second gateway call. Only Enrichments that were reports
  pay it, and only once each.
- The page is private: `noindex`, `no-store`, no referrer, and behind the
  same fail-closed Clerk boundary as every other Thread surface. It is a
  desk reading surface, not a share link — DESIGN.md's rule against
  social shapes still holds.
- `ARTIFACT_PUBLISH_INSTRUCTION` overrides the built-in brief, matching
  `ENRICHMENT_SYSTEM_INSTRUCTION`.
- The design tokens live in `lib/artifacts/design-system.ts` because a
  serverless function cannot read DESIGN.md at run time; a test parses
  DESIGN.md's front matter and fails if the two disagree.
