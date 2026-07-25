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

**Day**:
One walk, addressed as a whole: every Thread whose first Capture landed on that civil day, plus what the day amounts to and an ongoing conversation with all of it. The unit of work at the desk — Threads are reached through the day they were walked, not through a flat list.
_Avoid_: Session, entry, log, feed

**Project**:
A named bucket the walker files Threads into — an effort, a client, a build. A Thread belongs to at most one. The Enrichment may guess a Project, but only from the list the walker has already made, and its guess is never final: filing at the desk settles it.
_Avoid_: Folder, tag, category, workspace

**Filing**:
What the walker does at the desk to settle a Thread: confirm the kind the Enrichment guessed, put it in a Project, or simply mark that they read the report. Any of those makes the Thread Reviewed and clears it from the queue; the sitting-down-afterwards is done when nothing is left there.
_Avoid_: Triage, sorting, processing

**Reviewed**:
A Thread state set when the walker has processed it back at the desk. Threads start new and sit in the review queue until marked Reviewed.
_Avoid_: Archived, done, read

**Memory**:
One durable fact about the walker (who they are, where they walk, what they know, what draws their attention) injected into every Enrichment as a walker profile. Learned in the Interview or by an Enrichment as it works, and materialized from the Memory Patch log rather than stored directly.
_Avoid_: Preference, setting, profile field

**Memory Patch**:
One append-only entry in the log that is the primary record of what the system believes about the walker: an add, update, or remove of a single Memory, carrying its source and diff. Always visible in the Changes timeline and revertible by appending its inverse — never rewritten or hard-deleted.
_Avoid_: Edit, migration, sync

**Interview**:
A short guided conversation where Walking Thoughts asks the walker questions — seed questions first, then follow-ups grounded in earlier answers — and distills each answer into Memories that tailor future Enrichments.
_Avoid_: Onboarding, survey, questionnaire

**Offline Region**:
A user-selected geographic area whose trail-first topographic data is downloaded in advance and retained for use without connectivity. It prioritizes walkable trails and paths alongside contours, hillshade, water, roads, land cover, place names, and elevation labels.
_Avoid_: Cache, viewed area, map session
