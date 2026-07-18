# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

Claim / concurrency (not a triage role; orthogonal to the table above):

| Label in our tracker | Meaning |
| -------------------- | ------- |
| `in-progress`        | Claimed by an agent or human; excluded from the frontier |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table. Claiming uses `in-progress` via `mise run issue:claim` — see `docs/agents/issue-workflow.md`.

Edit the right-hand column to match whatever vocabulary you actually use.
