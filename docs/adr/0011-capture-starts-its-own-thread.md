# Every Capture starts its own Thread; the Inbox is retired

Field use showed captured thoughts are almost always independent — only
occasionally does one refer to something previous, and never as the main
point. So capture-time routing (the Inbox holding "unassigned" Captures for
later Thread assignment) solved a problem we don't have, at the cost of a
holding place, an assignment step, and a second lifecycle for Captures.
Instead, committing a Capture immediately creates its own Thread, offline,
untitled until its first Enrichment names it; adding to an existing Thread
remains possible but only as a deliberate action from that Thread's page.
The rare "this relates to that walk last week" case is handled at review
time, not at capture time.

## Consequences

- The Threads list is the only holding place; "not yet enriched" is a
  Thread status, not a separate place.
- The capture surface never asks where a Capture goes.
