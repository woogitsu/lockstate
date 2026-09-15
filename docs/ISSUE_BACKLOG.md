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

> **The grounds clause in that paragraph stopped being true on the day it was
> written, and the paragraph is kept as it stands rather than rewritten**
> (`docs/AGENT_WORKFLOW.md` §4: mark both directions). ADR 0112's `## Status`
> block now opens *"**Accepted by the owner on 2026-09-13, in five rulings, two
> of which went against this document's recommendation.**"*, so the reason given
> above for the level-5 placement — that the delivery is not an accepted ADR —
> no longer holds of ADR 0112. The rulings landed in `a0ffd01b`, *"docs: record
> the owner's five rulings on ADR 0112, two of them against the
> recommendation"*, which edited this section in the same commit: the paragraph
> below beginning **"The owner ruled on ADR 0112"** is that edit, and it is the
> current reading of what may be built from these documents.
>
> **The line number moved with the status and is corrected here rather than in
> place.** The `Proposed, 2026-09-13. Not self-approved.` line was not deleted —
> that ADR keeps it, explicitly labelled as the state of the document before the
> rulings — but it is no longer that file's status statement, and it is no
> longer at the anchor quoted above. `:19` is now the opening line of the
> acceptance; the older line reads
> `docs/adr/0112-what-the-2026-09-13-identity-delivery-decides.md:65` today, and
> the durable citation is the quoted sentence rather than either number.
>
> **What this correction does not settle, and is not an agent's to settle.** An
> accepted ADR 0112 moves the ADR; it does not by itself decide which rung
> `docs/VISUAL_IDENTITY.md` and `docs/IDENTITY_V5_ROLLOUT.md` occupy, since
> neither is an ADR and neither is `docs/ARCHITECTURE.md`, and the list above
> has no rung for "the repository's reading of an accepted ADR". The tension a
> later reader should see rather than resolve: `AGENTS.md` names
> `docs/VISUAL_IDENTITY.md` as one of the three documents to open instead of the
> delivery, and `.agents/rules/lockstate.md` requires reading it before touching
> `src/ui/`, which is a stronger obligation than level 5 describes. **Where
> these two documents sit is the owner's to rule on, and is recorded here as
> open rather than decided.**

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

**The owner ruled on ADR 0112 on 2026-09-13, accepting all five decisions**, so
the paragraph above describes where these documents sit *as documents* and no
longer describes what may be built from them: the direction is settled to the
extent the Status block of that ADR records, and the twenty-article
constitution is now a product contract subordinate to `AGENTS.md`. What has not
changed is the ranking — a question the ADR does not answer is still settled in
an issue at level 3, and the delivery is still advisory on everything its
rulings do not reach.

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
