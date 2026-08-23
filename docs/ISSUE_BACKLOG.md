# Lockstate issue backlog

GitHub Issues are the executable backlog for Lockstate. This document records
the source-of-truth order between repository documents, and the dependency
order of the foundation phases; it does not replace issue acceptance
criteria, comments, or accepted ADRs.

## Source-of-truth order

1. `AGENTS.md` and accepted ADRs define non-negotiable engineering contracts.
2. `docs/ARCHITECTURE.md` defines the current product architecture.
3. GitHub Issues define scoped implementation work and acceptance criteria.
4. `docs/ROADMAP.md` and this file define intended sequencing.
5. Research records are advisory until their decisions are incorporated into
   an issue or ADR.

## Delivery sequence

| Phase | Area | Primary issues |
| --- | --- | --- |
| 1 | Rendering shell, input, camera and accessibility | #6, #10, #11 |
| 2 | Sparse world, chunks, terrain and land | #12, #13 |
| 3 | Deterministic kernel and entity storage | #5, #14 |
| 4 | Construction and topology | #15, #16, #17 |
| 5 | Persistence and cloud synchronization | #18, #19, #20 |
| 6 | Hierarchical navigation and performance | #21, #22 |
| 7 | Content, needs, jobs and operations | #23, #24, #25, #26 |

The table stops at phase 7 and has not been extended as later work was filed.
`docs/ROADMAP.md` defines phases 8–11, and everything sequenced after phase 7 —
including the prisoner-depth work and the open defects — lives in GitHub Issues
rather than here. It records the order in which those foundation phases were
intended to be built, not what is still open: check each issue's state in
GitHub. Whether the table should be extended through current work or reduced to
the source-of-truth order above is an open decision (issue #121).

The issue sequence may be refined only when its dependencies remain explicit.
No issue may assume a missing local specification: requirements that affect a
contract belong in the issue body, an ADR, or a repository document.
