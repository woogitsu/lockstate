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

**Where the 2026-09-13 identity delivery sits in this order.**
`docs/VISUAL_IDENTITY.md`, `docs/IDENTITY_V5_ROLLOUT.md` and the vendored tree
under `docs/design/2026-09-13-identity-v5/` sit at level 5, alongside research
records: advisory until their decisions are incorporated into an issue or an
accepted ADR. They are neither of the two things above them — not an accepted
ADR, since
[ADR 0112](./adr/0112-what-the-2026-09-13-identity-delivery-decides.md) states
its own status as "**Proposed, 2026-09-13. Not self-approved.**"
(`docs/adr/0112-what-the-2026-09-13-identity-delivery-decides.md:19`), and not
`docs/ARCHITECTURE.md`.

The delivery itself agrees with this placement rather than contradicting it.
`docs/design/2026-09-13-identity-v5/DOKUMENTACJA/01-BRIEF-I-DECYZJE.md`'s own
"Hierarchia źródeł" section ranks its sources as "Aktualny brief właściciela →
aktualne reguły docelowego repo → najnowsza dokumentacja audytu i iteracji →
źródła aktualnego prototypu → historyczne makiety" ("Current owner brief →
current rules of the target repo → latest audit and iteration documentation →
current prototype sources → historical mockups") — putting this repository's
own rules second, above the delivery's own audit, prototype and history. That
hierarchy resolves conflicts *inside* the delivery's bundle (its brief against
its audit, its prototype, its old mockups); it says nothing about GitHub
Issues, `docs/ROADMAP.md` or this file, so it cannot be read onto the list
above without inventing a rung. Folding the two lists together — reading the
delivery's top rank as outranking `AGENTS.md` and accepted ADRs here — would be
exactly the silent promotion this section exists to rule out, and the
delivery's own second rank (repo rules above its own supporting documents)
does not ask for that either.

Until the owner rules on ADR 0112 (in whole or in part, per its own "Consequences"
section), no HUD, token or navigation change may cite the delivery or these
two documents as settling a design question on its own; it can only motivate
an issue, which then carries the decision at level 3.

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
