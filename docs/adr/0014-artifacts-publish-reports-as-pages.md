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

**A page is never thinner than the report it publishes.** The first
release got this backwards in production: pages came back as tidy
summaries, and the walker lost detail by opening the nicer-looking thing.
Four things caused it, and all four are fixed. The brief was almost
entirely markup rules with one buried line about fidelity, so it read as
"reformat compactly" — completeness leads now, stated as a test the model
can apply ("if a detail appears in the report and not on your page, the
page has failed"), with the tag list demoted to the end. Nothing set
`maxOutputTokens`, so the SDK's 4,096 Anthropic default truncated long
pages — publishing asks for 100,000, inside the 128K output ceiling of
the models this app runs on. The press saw only the newest
Enrichment, so it now gets the Thread's earlier reports, the research
trace (dead ends included), and the open question. And nothing checked the
result: `checkArtifactCompleteness` compares the page's readable length to
the report's, and a page under 90% is asked again with the failure named.

**If both passes lose the report, the walker gets the report.** A page
that still comes back thin falls back to the Enrichment's own markdown,
converted and laid out on the sheet. Length is a blunt proxy for
substance, but it catches the failure that actually happened and never
rejects a page for being too thorough — and the fallback means the worst
case is the Thread's own words on a survey sheet, not a summary of them.

**A report waiting is what a day amounts to.** Threads with an unread
report sort first inside the day and carry the Annotation's own mark —
a 2px sky left rule over a 7% sky tint — rather than a badge, per
DESIGN.md's rule that weight comes from a tinted fill and not from chips
inside the sheet. Clay still outranks sky: a stuck Thread reads as stuck
whether or not it also has a page. Filing takes the mark off; the page
stays. The row prints the report's standfirst so the walker knows whether
to open it without opening it, the day sheet gains a **To read**
instrument, and the day list says "2 reports to read" ahead of the
vaguer "2 waiting" — but behind "1 needs a word", because a Thread stuck
on a question outranks one merely unread.

**At the desk the report opens over the day, not in a new tab.** The
desktop is the processing room, so above the 960px split-view breakpoint
the Artifact reads in a lightbox; the phone is the field instrument,
where a report framed in a 412px column is worse than the page, so there
the link navigates. The lightbox frames the page rather than inlining it:
an Artifact's markup and the app's stylesheet never share a document, and
the frame is sandboxed on top of its CSP — `allow-same-origin` only so
the sheet's self-hosted display font resolves, `allow-popups` so source
citations still open, and no `allow-scripts` in either layer. That is why
`frame-ancestors` is `'self'` rather than `'none'`, with a matching
`X-Frame-Options: SAMEORIGIN` on this one path to override the app-wide
`DENY`.

## Consequences

- New `artifacts` table, keyed by `user_id`, with the artifact id derived
  from the Enrichment id — publishing the same report twice returns the
  page already stored rather than a second one.
- The desk asks `/api/artifacts` once per load, not once per Thread, and
  retains the list, so a Thread that has a page still says so offline.
  That request runs beside the per-Thread Enrichment refresh rather than
  after it: which Threads have a report is the first thing a day needs,
  and must not queue behind a slow Enrichment fetch.
- `summarizeDay` takes the Threads with a page as an argument rather than
  reading them, so the day sheet stays a pure function of local state.
- Reports cost a second gateway call, and a thin first pass costs a third.
  Only Enrichments that were reports pay it, and only once each — the
  retry is the price of not publishing a summary.
- Pages published under an older brief keep it until rebuilt.
  `saveArtifact` takes a `replace` option and `POST /api/artifacts/publish`
  takes `republish`, surfaced as **Rebuild** in the Thread toolbar.
- The page is private: `noindex`, `no-store`, no referrer, and behind the
  same fail-closed Clerk boundary as every other Thread surface. It is a
  desk reading surface, not a share link — DESIGN.md's rule against
  social shapes still holds.
- `ARTIFACT_PUBLISH_INSTRUCTION` overrides the built-in brief, matching
  `ENRICHMENT_SYSTEM_INSTRUCTION`.
- The design tokens live in `lib/artifacts/design-system.ts` because a
  serverless function cannot read DESIGN.md at run time; a test parses
  DESIGN.md's front matter and fails if the two disagree.
- Both publish seams say what they did. The completeness floor, the retry,
  and the report fallback all change a page silently, and both seams
  swallow their failures on purpose, so `lib/artifacts/log.ts` writes one
  prefixed line per publish — `artifact.publish` with the outcome and the
  completeness ratio, `artifact.publish.failed` with the reason and the
  error. Hosted logs capture request paths, not response bodies, so the
  `outcome` returned to the client answered nobody in production: without
  these lines there is no way to tell a page that was laid out from one
  that was salvaged, or to learn why the queue's pages went missing.
