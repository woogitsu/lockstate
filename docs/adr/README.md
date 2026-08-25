# Architecture Decision Records

This file is the index of every ADR in this directory, and the only recorded
statement of which numbers are taken. Adding an ADR means adding its row here
in the same commit — the number is not reserved until it appears below.

`tests/foundation/adr-numbering-contract.test.ts` enforces the mechanical part
of that: filenames are `NNNN-kebab-case.md`, each four-digit prefix is unique,
the number in the filename matches the number in the `# ADR…` heading, every
ADR has a parseable `Status`, and every relative link to an ADR from `docs/`
resolves to a file that exists. Since #118's follow-up it also checks this
table, in both directions: the set of rows must be the set of ADR files, each
row must link to the file its number names, each row's **Title** must be the
one the ADR's heading carries, each row's status keyword must equal the one the
ADR itself carries — so a status edit that does not update the row here fails —
and the stated next free number must be one past the highest number on disk. It
additionally refuses a link whose label names one ADR while pointing at
another.

Two things in this directory are outside those checks and are maintained by
hand: the `0018` row, which has no link because it has no file, and the prose
sections below the table. `README.md` and `STATUS-QUEUE.md` are the directory's
only non-ADR documents, and the test names them explicitly — anything else in
`docs/adr/` must be a well-formed ADR.

[`STATUS-QUEUE.md`](./STATUS-QUEUE.md) is the owner-facing companion to this
table. This index reports what each ADR *says*; that file records where what an
ADR says contradicts what the code *does*, and what the owner would have to
change to settle it. It changes no status either.

## Status values in this table

The `Status` column reproduces what each ADR's own document says, not a
normalised judgement. Two heading styles are in use — some ADRs carry a
`- Status:` bullet and others a `## Status` section — and every ADR in the table
above is now `Accepted` in some form, several with a qualifier the ADR itself
carries.

**No ADR in this directory is `Proposed`, as of 2026-08-25.** The definition is
kept because the next ADR drafted against `main` will need it: a `Proposed` ADR
is one awaiting the owner's approval, and is not binding whether or not code
already implements it. What has changed is what such a row *means* — it is now a
signal on its own rather than one of a crowd, and the count of ADRs awaiting
approval is zero rather than a number nobody tracks.

Promoting the statuses that had drifted was open issue #118's subject and is
done for every document on disk. Where an *accepted* decision and the code
disagree is [`STATUS-QUEUE.md`](./STATUS-QUEUE.md)'s, and it lists those gaps.
Nothing here changes a status; this table only reports them.

| # | Title | Status |
| --- | --- | --- |
| [0001](./0001-core-platform.md) | Core platform and runtime boundaries | Accepted |
| [0002](./0002-cloudflare-static-assets.md) | Cloudflare Workers Static Assets delivery | Accepted |
| [0003](./0003-simulation-worker-protocol.md) | Versioned simulation worker protocol | Accepted |
| [0004](./0004-chunk-size-selection.md) | Chunk size selection and parcel decoupling | Accepted |
| [0005](./0005-entity-storage-model.md) | Entity Storage Model | Accepted |
| [0006](./0006-simulation-worker-adapter.md) | Simulation Worker Adapter Lifecycle | Accepted |
| [0007](./0007-navigation-work-budgets-and-flow-fields.md) | Navigation Work Budgets, Request Fairness and Flow-Field Sharing | Accepted |
| [0008](./0008-trusted-service-boundary.md) | Trusted Service Boundary and Threat Model for Product Features | Accepted |
| [0009](./0009-challenge-verification-strategy.md) | Bounded Verification Strategy for Challenges and Leaderboards | Accepted — implementation gated |
| [0010](./0010-telemetry-and-diagnostics-privacy.md) | Privacy-Controlled Telemetry and Crash Diagnostics | Accepted |
| [0011](./0011-localization-architecture.md) | Localization Architecture and Stable-ID Separation | Accepted |
| [0012](./0012-derived-identifier-reproducibility.md) | Reproducibility of Derived Simulation Identifiers | Accepted |
| [0013](./0013-free-tier-cloud-save-capacity.md) | Free-tier cloud-save capacity and where it is enforced | Accepted — §§5-6 still proposed |
| [0014](./0014-art-storage-and-runtime-asset-delivery.md) | Art storage, generated-versus-source policy and runtime asset delivery | Accepted |
| [0015](./0015-actor-identity-allocation.md) | Actor Identity Is Allocated, Not Derived | Accepted |
| [0016](./0016-migration-delivery-mechanism.md) | Which mechanism applies migrations, and to which project | Accepted |
| [0017](./0017-money-primary-resource-model.md) | Money Is the Primary Resource; Materials Are Procured | Accepted |
| 0018 | *Free — released when PR #91 was closed as superseded* | — |
| [0019](./0019-tile-ownership-under-overlapping-parcels.md) | What "owned" means for a tile under overlapping parcels | Accepted |
| [0020](./0020-deterministic-kernel.md) | Deterministic Kernel and Scheduler | Accepted |
| [0021](./0021-http-response-security-headers.md) | HTTP response security headers for the static-asset deployment | Accepted |
| [0022](./0022-room-zoning-surface.md) | Where a player zones a room, and with what gesture | Accepted, 2026-08-25 — as amended (the owner chose the Rooms tab; Decision §1 is superseded by that amendment) |
| [0023](./0023-room-occupancy-authority.md) | Where a room's occupancy comes from | Accepted, 2026-08-25 — as amended (a capacity-only fallback is a no-op); not superseded by 0028 |
| [0024](./0024-protocol-fault-recoverability.md) | Which protocol faults end a session, and who is told | Accepted, 2026-08-25 |
| [0025](./0025-guard-hiring-surface.md) | Where a player hires a guard, and what the hire costs | Accepted, 2026-08-25 |
| [0026](./0026-entity-id-lifetime.md) | The lifetime of `EntityId`-keyed state — generation exhaustion, release, and re-intake | Accepted, 2026-08-25 — as the framing and the tripwire; its three questions stay open |
| [0027](./0027-cell-sharing-assessment.md) | Cell-sharing assessment — what is recorded, who may override, and how a cell-scoped risk reaches a sector-scoped trigger | Accepted, 2026-08-25 — as the mechanism; its three questions stay open, and its subject is unreachable until 0028 ships |
| [0028](./0028-object-placement-and-derived-room-capacity.md) | What a placed object is, and how a room's capacity comes from it | Accepted, 2026-08-25 |

**Next free number: 0029.**

## Why nothing between 0024 and 0028 is missing any more, and 0028 was allocated out of band

**Every number from 0019 to 0028 now has a document in this directory**, which
it did not for most of the week and which is the outcome the previous versions
of this section were describing in advance. `0018` is the only absent number
left, and it is absent for an unrelated reason recorded below.

The gap that used to be here is worth keeping the account of, because the
mechanism that produced it has not gone anywhere. This file says of itself that
"the number is not reserved until it appears below", which is true and is also
the trap: three agents collided over 0024 and 0025 before 0028 was taken,
because each read the stated next-free number on `main` and each was right. An
open pull request's ADR is invisible to this table — which is a statement about
`main` and can never be anything else — so the stated next free number is a
ceiling rather than a reservation.

Both halves of that collision cost a renumber, and both were resolved the same
way. 0025's own document was written as 0024 and renumbered before review, on
the discovery that what is now 0024 above had already claimed that number. PR
#299 wrote what are now 0026 and 0027 as 0024 and 0025, on the same reading of
the same stated next-free number, and renumbered once 0024 had merged and 0025
was claimed — two files, two headings and seven citations across `docs/`, `src/`
comments and `tests/`, none of which any assertion would have reported as
*wrong* had they been left pointing at somebody else's ADR. Both followed the
same rule, which is the one recorded further down for the kernel ADR: **take the
lowest number free without coordinating with unmerged or held work.** 0028 was
then allocated out of band — by the owner, across the open branches — and `0029`
is stated above because
`tests/foundation/adr-numbering-contract.test.ts` derives the next free number
from the highest number on disk rather than from the lowest unused one.

Two consequences worth stating rather than leaving to be rediscovered. **A gap
closes from below as those PRs merge**, and each merge is a row added here, not a
renumbering — the renumbering happens on the branch, before the merge, and it is
the open branch's cost rather than this file's. And **the stated next-free number
is still a ceiling**: whoever writes the ADR after 0028 should check the open
pull requests before taking 0029, exactly as 0028's author had to, and exactly
as the two authors who did not are the reason this section exists.

## 0018, and why it is free again

0018 is the one number with no file in this directory, and it is still listed
above so that computing the next free number from `ls docs/adr/` alone does not
quietly skip it.

It was reserved by PR #91, which added `docs/adr/0018-construction-material-supply.md`
and was held by an explicit owner decision. That PR has been **closed as
superseded by #249** — its `startingStock` proposal was replaced by a money
opening balance, which is ADR 0017 decision 1 — so this table releases the
number, exactly as the previous version of this section said it should on that
outcome.

**0018 is therefore available.** It is not the next free number (0029 is), and
it should not be reached for preferentially: a gap in the sequence is easier to
read than a number reused years apart. Take it only if a future ADR is a direct
successor to what #91 proposed, where sharing the number would be
informative rather than confusing.

## Why 0004 appears once and the kernel ADR is 0020

Two ADRs were both numbered 0004: the chunk-size ADR (added in `cfa2b44`) and
the deterministic-kernel ADR (added in `aae2fbc`, 23 minutes later). Issue #117
records the collision, and that citations of "ADR 0004" elsewhere in the
repository had already split between the two documents depending on where they
were written.

The later-authored ADR moved, following the precedent set by `2edb75c`
("Renumber the art-storage ADR to 0014 after 0012 and 0013 were taken"). The
kernel ADR became 0020 rather than 0017 or 0018 because both were claimed *at
the time*: 0017 by PR #137 (open when the rename was made, merged since) and
0018 by PR #91 (held then, closed as superseded since). 0020 was the lowest
number free without coordinating with unmerged or held work. Both claims have
resolved, which does not make the choice wrong — it was correct on the
information available, and renumbering an Accepted ADR to close a gap would
break every citation of it. `0004` now means chunk-size only.
