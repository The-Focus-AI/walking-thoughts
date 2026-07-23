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

**Reviewed**:
A Thread state set when the walker has processed it back at the desk. Threads start new and sit in the review queue until marked Reviewed.
_Avoid_: Archived, done, read

**Offline Region**:
A user-selected geographic area whose trail-first topographic data is downloaded in advance and retained for use without connectivity. It prioritizes walkable trails and paths alongside contours, hillshade, water, roads, land cover, place names, and elevation labels.
_Avoid_: Cache, viewed area, map session
