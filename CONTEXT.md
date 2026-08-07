# Walking Thoughts

Walking Thoughts captures observations and questions when connectivity is unavailable, then supports deeper work when the user returns online.

## Language

**Capture**:
A user-authored entry containing text, images, recorded audio, or video plus its available time and location context. It commits locally first, remains available without connectivity, and starts its own Thread unless deliberately added to an existing one.
_Avoid_: Note, message, thought

**Thread**:
A durable, chronological, append-only stream beginning with a single Capture, holding that Capture's Enrichments and any deliberate later additions. Untitled until its first Enrichment names it.
_Avoid_: Chat, conversation, folder, inbox

**Enrichment**:
An AI-generated Thread entry based on that Thread's complete history at a recorded point, retaining which gateway model produced it. Examples include identification, explanation, transcription lookup, or research.
_Avoid_: Sync, processing, response

**Artifact**:
One Enrichment published as a page: the report laid out as a survey sheet, browsable on its own URL, kept whole. Only Enrichments that were reports earn one — a question researched or an idea sharpened — and the queue publishes them as it enriches, so the page is waiting at the desk. The Enrichment stays the Thread entry; the Artifact is the readable form of it. A dismissed Research Verdict retracts the page; keeping the research again restores it at the same address.
_Avoid_: Document, export, share link, post

**Day**:
One walk, addressed as a whole: every Thread whose first Capture landed on that civil day, plus what the day amounts to and an ongoing conversation with all of it. The default arrangement at the desk — Threads arrive stacked by the day they were walked, though a Lens may re-stack the same pile another way.
_Avoid_: Session, entry, log, feed

**Lens**:
How the desk stacks the unreviewed pile: by Day (the default), Topic, Kind, Media, or Reports. A Lens only re-groups — it never changes which Threads are in the pile, and it is not a filter.
_Avoid_: View, tab, sort, mode

**Kind**:
What a Thread turns out to be — question, idea, task, observation, place, media, or noise. A property the Enrichment reads off the Thread, not a thing in its own right: an idea is a Thread that is an idea, never a record of its own.
_Avoid_: Type, class, bucket, label

**Project**:
A named bucket the walker files Threads into — an effort, a client, a build. A Thread belongs to at most one, whatever its Kind. The Enrichment may guess a Project, but only from the list the walker has already made, and its guess is never final: filing at the desk settles it.
_Avoid_: Folder, tag, category, workspace

**Proposed Project**:
A name the Enrichment has floated for an effort it keeps seeing, carried in the prompt beside the walker's real Projects so a later Thread joins it rather than coining a rival name for the same thing. It accrues Threads in silence and becomes a Project only when the walker names it in the Interview.
_Avoid_: Candidate, suggestion, draft project, cluster

**Filing**:
What the walker does at the desk to settle a Thread: confirm or redirect the Route the Enrichment proposed, adjusting the Kind, Project, or Research Verdict along the way. Settling the Route makes the Thread Reviewed and clears it from the queue; the sitting-down-afterwards is done when the Day is Dispatched.
_Avoid_: Triage, sorting, processing

**Route**:
Where a Thread goes when the walker settles it — Spec, To-do, Journal, Timeline, or Drop. Proposed by the Enrichment beside Kind and Project, settled at the desk, and final once the walker sets it. Kind is what a Thread is; Route is what the walker does with it.
_Avoid_: Destination, bucket, action, category

**Dispatch**:
Committing a Day's settled Routes so each Thread actually leaves — the issue drafted, the task listed, the notebook page filed, the frame added, the noise buried. Until Dispatch every Route is undoable; after it, the destination owns the object.
_Avoid_: Send, export, sync, publish

**Research Verdict**:
What the walker settled about a Thread's research while Filing: kept (worth returning to), dismissed (read and let go), or unset. One verdict per Thread, separate from Reviewed — a Thread is processed either way; the verdict says whether its research stays in reach.
_Avoid_: Rating, like, star, archive

**Reviewed**:
A Thread state set when the walker has processed it back at the desk. Threads start new and sit in the review queue until marked Reviewed.
_Avoid_: Archived, done, read

**Memory**:
One durable fact about the walker — true whether or not they ever act on it — injected into every Enrichment as a walker profile: who they are, where they walk, what they know, what draws their attention. Anything naming an effort, a build, a client, or a product is a Project instead. Learned by an Enrichment as it works, and materialized from the Memory Patch log rather than stored directly.
_Avoid_: Preference, setting, profile field

**Memory Patch**:
One append-only entry in the log that is the primary record of what the system believes about the walker: an add, update, or remove of a single Memory, carrying its source and diff. Always visible in the Changes timeline and revertible by appending its inverse — never rewritten or hard-deleted.
_Avoid_: Edit, migration, sync

**Interview**:
The one conversation that sees across Threads. Walking Thoughts brings a Proposed Project that has recurred often enough to be real, shows the Threads it rests on, and asks the walker whether it is a Project and what they call it. It writes Projects, never Memories, and has nothing to say until Threads accrue.
_Avoid_: Onboarding, survey, questionnaire

**Offline Region**:
A user-selected geographic area whose trail-first topographic data is downloaded in advance and retained for use without connectivity. It prioritizes walkable trails and paths alongside contours, hillshade, water, roads, land cover, place names, and elevation labels.
_Avoid_: Cache, viewed area, map session
