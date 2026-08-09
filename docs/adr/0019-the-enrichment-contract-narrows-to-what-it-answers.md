# The Enrichment contract narrows to what it actually answers

Every report was asked for eleven fields and four of them came back empty or
useless, measured across the walker's whole corpus of 171 reports
(`scripts/what-it-knows.mjs`, 2026-08-09): **Topics** produced 438 distinct
slugs of which 405 occur exactly once — 92% name a single Thread and
therefore group it with nothing; **Mentions** were emitted by 14 reports out
of 171 at all, 37 of their 38 distinct nouns occurring once; **Suggested
questions** came back empty from 165 of 171; **draft-worthy** has never once
been true. The four are removed from the contract, from the prompt, from
storage on new writes, and from the surfaces that displayed them. Title,
Kind, Project/Propose, sources and research stay — those work: every report
titles itself, 82% classify, proposals accrue Threads, and 136 of 171 did
real research.

This is not a claim that the ideas were bad. It is the observation that a
walker holds the whole vocabulary in their head whether or not the machine
fills it in, and four empty columns read as a system that is organizing when
it is not — the specific complaint that opened this ("it feels like it's too
complicated"). The cost of each field is not only its tokens: Topics owned a
Lens, Mentions owned a facet group, and both taught the desk to offer
groupings that resolve to one Thread each. Cutting them removes a Lens, a
facet group, four output fields, and two vocabularies the walker was
carrying.

Mentions carried one real dependency and it is retired with them: retrieval's
"same noun first" path, which put earlier Threads into the prompt when they
named the same thing (ADR 0012's neighbourhood, extended by the mention
index). It is retired because the same measurement shows it cannot have been
firing — 14 reports with any mention at all against 150 of 155 Threads
carrying an embedding, so the vector path was doing all of the retrieval and
the exact-link path was decorative. `retrievePriorThreads` keeps its
signature and its best-effort posture; only the mention half is gone, and the
prompt a report sees is unchanged wherever retrieval was already working.

Two alternatives were rejected. Keeping the fields and prompting harder for
them assumes the model was underperforming, but a 92%-singleton topic set is
not a model that tried and missed — it is a field with no natural answer,
since a walk's thought genuinely is about one thing most days. Keeping them
as hidden internals costs the tokens without the walker ever seeing the
result, which is the worst of both. The accepted costs, recorded so nobody
rediscovers them: the desk loses its Topics Lens and Mention rail group,
which were shipped surfaces; similarity narrows to embeddings alone, so a
corpus whose pgvector extension is unavailable now retrieves nothing rather
than falling back to shared nouns; and the existing columns are left in place
holding their history rather than dropped, so the data survives a change of
mind while nothing new is written to it.

Grouping is not lost, because it was never being done by these. It stays with
Projects — the one grouping the walker owns and the only one the corpus shows
accruing (Umwelten 6 Threads, Walking Thoughts App 4, Cornwall Market Site
Agent 3). Making Projects settle rather than accumulate proposals is a
separate decision, taken separately.
