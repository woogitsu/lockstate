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
`- Status:` bullet and others a `## Status` section, and every ADR in the table
above carries `Accepted` in some form, several with a qualifier the ADR itself
carries.

**Every ADR in this directory is accepted.** Eight decisions were approved on
2026-08-26: 0031, 0032, 0033, ADR 0007's amendment, then 0034, 0035 and 0036
within the same few hours, and 0037 the same evening — which is the rate this
corpus actually moves at.

**This paragraph was corrected twice on 2026-08-26, in opposite directions, and
both edits are marked rather than overwritten.** 0037 arrived Proposed, which
falsified "every ADR is accepted"; it was approved by delegation one commit
later, which falsified the "all but one row" wording written to replace it. A
sentence asserting an absence — "every", "none outstanding", "the only" — is the
shape `docs/HANDOVER-2026-08-26.md` names as rotting most reliably, because
adding the thing it denies never touches the sentence. What this instance adds is
that **the same sentence can rot back**: a correction is not more durable than
the claim it corrected, and nothing mechanical caught either direction.
`adr-numbering-contract.test.ts` compares each row's status keyword to its own
ADR's, so it passes a table whose surrounding prose flatly contradicts one of
its rows — in either direction.

While 0037 stood Proposed, the two paragraphs that then stood above were
deliberately worded so that **its number never appeared in the same sentence as
the word `Accepted`**, because `adr-status-reference-contract.test.ts` matches
on the status word and cannot tell "every row *except* this one is accepted"
from "this one is accepted". That constraint is recorded here rather than
deleted, because the next Proposed row will need it again, and the paragraph
further down carries an awkward phrasing for exactly the same reason. Do not
"fix" that one.

**0034, 0035, 0036 and 0037 were accepted by the owner's delegation rather than
by the owner reading them.** Each Status says so, and says what the owner was
and was not told. That is a weaker warrant than the other four carry and it is
recorded as weaker on purpose — a reader who disagrees with any of the four
should treat it as open, not as settled by someone who weighed the text. Four of
eight decisions in one day resting on delegation is itself worth noticing by
whoever reads this next: it is what a day of this pace costs in review depth.

Two of those carry a qualifier the row alone will not tell you, and both are worth
reading before treating the decision as settled:

- **0031** was approved with its open question 4 promoted to *blocking*. ADR 0028
  phase 4 took `BUILDABLE_REGISTRY` from four rows to twenty-one, so the price its
  decision 3 pays is several times what the document argues for; the catalogue
  needs a surface of its own before more rows arrive (#390).
- **0033** was approved with its open question 1 *commissioned* rather than left
  open: the owner asked for the incident's outcome recovered as well as its
  resources, so a restored session mounting a fresh response is being built
  against that document.

One structural note that outlives all four. An **amendment** to an accepted ADR
has no `Status` line of its own, so it gets no row in the table below and no
mechanical gate in this repository can see it — `adr-numbering-contract.test.ts`
counts documents by their `Status` line. While 0007's amendment was pending, the
§2 queue entry was the only record that a decision was outstanding; now that it is
accepted and the entry is deleted, the amendment's own opening paragraph is the
only record it ever was. If a future amendment needs to be visible, §2 is the only
place that can do it.

A note on how this paragraph is worded, because it matters to a test:
`tests/foundation/adr-status-reference-contract.test.ts` scans for a sentence
naming an ADR next to a status the ADR does not hold, and it matches on the
status word rather than parsing the claim. **It cannot tell an assertion from a
denial** — so a sentence saying no ADR holds a status trips it exactly as a
false claim would. Where this paragraph needs to say that nothing is
outstanding, it says "every ADR is accepted" rather than negating the other
status; teaching the scanner to read negation would be the alternative, and is
not obviously worth it.

This paragraph has now read six things in two days — none outstanding, then
0029, then none again, then 0031, then 0037 outstanding, and now none again — and
the churn is the point rather than noise. The last two arrived within one commit
of each other.
What it records is that the count is *tracked*: a row awaiting approval is a
signal on its own rather than one of a crowd, so one row reads as a request
addressed to the owner. 0029 was accepted on 2026-08-26, and the thing worth
carrying forward from it is that it sat outstanding on `main` while its own
implementing code was already shipping — the fragile case
[`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §2 names, met in practice, and now met a
second time by 0031.

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
| [0027](./0027-cell-sharing-assessment.md) | Cell-sharing assessment — what is recorded, who may override, and how a cell-scoped risk reaches a sector-scoped trigger | Accepted, 2026-08-25 — as the mechanism; its three questions stay open, and its subject became reachable when 0028 shipped (measured 2026-08-26) |
| [0028](./0028-object-placement-and-derived-room-capacity.md) | What a placed object is, and how a room's capacity comes from it | Accepted, 2026-08-25 |
| [0029](./0029-concurrent-room-use-claims.md) | What a concurrent-use claim on a room is — when it is taken, when it ends, and who waits | Accepted, 2026-08-26 |
| [0031](./0031-build-queue-cancellation-surface.md) | Withdrawing one queued build order — where a player aims, and what a long queue looks like | Accepted, 2026-08-26 — with open question 4 promoted to blocking |
| [0032](./0032-incident-consequences-and-classification-review.md) | What an incident costs the prisoner who was in it, and how a classification tier moves | Accepted, 2026-08-26 |
| [0033](./0033-releasing-an-interrupted-incident-response-at-runtime.md) | A restored session abandons an incident response and returns what it claimed | Accepted, 2026-08-26 — **amended in place**: its open question 1 was commissioned and is now answered (a restored session re-dispatches) |
| [0034](./0034-releasing-a-claimed-guard.md) | Releasing a claimed guard — one command, every claimant | Accepted, 2026-08-26 — by delegation |
| [0035](./0035-buildable-catalogue-category-filter.md) | Choosing what to build out of twenty-one rows — filtering the catalogue by the categories content already authors | Accepted, 2026-08-26 — by delegation; it narrows #390's claim rather than closing it |
| [0036](./0036-a-derived-default-security-sector.md) | A default security sector, derived from the world rather than authored | Accepted, 2026-08-26 — by delegation; it answers ADR 0034 decision 9 |
| [0037](./0037-goods-in-a-carriers-hands-when-a-carry-job-dies.md) | Where goods go when a carry job dies with them in a carrier's hands | Accepted, 2026-08-26 — by delegation; the owner approved *that* someone decide, not the option chosen |

**Next free number: 0038.** 0037 is this table's newest row and **0030 is still
held by an unmerged branch** — the incident-response restore change, which
allocated it in the same hour it was stated free here. It is listed nowhere above
because nothing is merged under that number yet, which is precisely the gap a
stated next-free cannot see: enumerate the open pull requests before taking 0038.

**0037 was taken from an unpushed worktree and its author could not run that
enumeration at all**, which is the window this paragraph describes rather than an
exception to it — four agents were working in parallel and a number is not held
until something is pushed. ADR 0037 therefore pre-commits in its own Status to
renumbering without argument if another branch has taken it, which
`docs/HANDOVER-2026-08-26.md` records as the only thing that has kept three such
collisions from becoming arguments.

**0036's author ran that enumeration and it came back with exactly one open pull
request**, **#355** (no ADR), so 0036 was free — and unlike the three collisions
below, the stated next-free and the enumeration agreed *and* the number that was
free was the one the table stated, because 0035 had merged by then. 0036 answers
0034's **decision 9** — the ship/don't-ship judgement 0034 put to the owner
explicitly — and its **open question 5**, *"What registers a security sector in a
new session?"*. It is a separate document rather than an amendment to 0034 because
0034's own decision 9 point 3 asked for it as its own issue: *"the real blocker is
one registration, and it is not this document's."* That issue is #396. 0036
pre-commits in its own Status to renumbering if a branch turns up holding it.

**0034's author ran that enumeration and it came back with two open pull
requests**, **#393** (documentation only: it accepts 0033 and amends 0007, and its
`docs/adr/` listing adds no new number) and **#355** (no ADR), so 0034 was free.
0034 answers 0033's own **open question 3** — that the absence of a release
command *"is what made this defect terminal rather than merely slow"* — and it is
a separate document rather than a second amendment because that question names
itself a gameplay-surface decision. 0033's **open question 1** was answered in
0033 itself, as an amendment section, for the mirror-image reason: it is that
document's own restore semantics.

**0035's author ran the same enumeration in the same hour and got the same
answer, and 0034 was taken anyway — the third collision this week.** Both authors
read the stated next-free correctly, both enumerated the open pull requests
correctly, and neither could see the other: the branch holding 0034 had not opened
its pull request when 0035's author enumerated, and opened it minutes later. So
this is not a case of the enumeration being skipped, which is what 0024 through
0027 were; it is the enumeration running and being **correct and insufficient**,
which is what 0031 met and what 0030 is still an instance of.

The generalisable part, since three collisions in a week is a pattern rather than
bad luck: **an enumeration of open pull requests is a claim about one instant,
and a number is not held until something is pushed.** The only thing that has
actually prevented an argument in any of the three is the pre-commitment — each
of 0031, 0034 and 0035 states in its own Status that it is the document which
renumbers if a branch turns up holding its number, so a collision costs a
`git mv` rather than a negotiation. 0035 renumbered from 0034 on exactly that
pre-commitment, and its `### The number` section records the collision it
predicted.

**0033's author ran that enumeration and it came back with two open pull
requests**, #355 (no ADR) and #361 (holding 0030), so 0033 was free. 0033 is the
counter-proposal to the document on #361's branch: it decides the same question
— what a restored session owes an incident response a save interrupted — by
releasing the claim at runtime rather than by bumping the save schema, so the two
are alternatives and not a sequence. If both were somehow accepted, the runtime
release becomes redundant and should be removed rather than layered.

**0032's author ran that enumeration and it came back with three open pull
requests, one of them holding 0030 and neither of the other two carrying an ADR
at all** — so 0032 was free and the ceiling and the free number were the same
thing again. That is a fact about one hour, not a reason to stop checking. 0032
pre-commits in its own Status to renumbering if a branch turns up holding it,
which is the habit the two previous collisions taught.

**One row is outstanding: 0033.** It arrived with the change that implements it
— the shape [`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §2 names as fragile — and
**its queue entry is owed rather than written**, for a stated reason rather than
a collision: the brief that change was done under names `STATUS-QUEUE.md` as a
file it may not touch, so the entry is quoted in its pull request instead. That
is the precedent 0032 set an hour earlier, and 0032's own debt was paid in the
commit that accepted it. This one is the next edit to that file to clear.

0031 and 0032 arrived the same way and are now Accepted. 0031's entry was in the
same commit, per §2's rule, and was deleted on acceptance; 0032's was never
written at all, and §2 records that as its own rule failing rather than tidying
it away — the rule assumes one writer and is unsatisfiable when two changes are
in flight.

0029 was the previous outstanding row and was accepted on 2026-08-26; it *did* sit
outstanding on `main` for a day while its code shipped, which is exactly the cost
§2 predicted, and its queue entry was removed in the same commit as its
acceptance.

**0031 was allocated as 0030, and renumbered because the collision it warned
about actually happened.** The number was taken on this table's stated next-free
without the open-pull-request enumeration 0029's author ran — `gh` is not
installed on the machine that wrote it — and the document said so, and
pre-committed to renumbering if an unmerged branch held 0030. One did: the
incident-response restore change allocated `0030` for
`0030-restoring-an-interrupted-incident-response.md` in the same hour. The
pre-commitment is why that cost a rename rather than an argument.

**The lesson for the next allocation**, since this is the second time these
numbers have collided: a stated next-free is a claim about *merged* history, so
two branches can both read it correctly in the same hour and still collide. Only
the enumeration catches it, and it has to be run by whoever can actually see the
open pull requests — when the author cannot, the number is provisional until
someone else checks.

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

**0029's author did that check, and it came back empty.** `gh pr list --state
open` returned no open pull requests on this repository, so no unmerged branch
was holding the stated next-free number and 0029 was taken without a collision
— the first time since this section was written that the ceiling and the free
number were the same thing. That is a fact about one day, not a reason to stop
checking.

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
