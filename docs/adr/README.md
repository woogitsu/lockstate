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

**Every ADR in this directory is accepted.** The table above is the count, and
this paragraph deliberately no longer carries one. It used to read *"Eight
decisions were approved on 2026-08-26"* and enumerate them; three more were
approved the same evening — 0038, 0039 and 0040, all under the same delegation —
which made the sentence wrong again without anything touching it. **A tally in
prose beside a table that computes the same tally is this corpus's most reliably
rotting shape**, and it has now rotted here three ways in one day: an ADR
arriving Proposed, that ADR being accepted, and three more arriving at all. What
the day is evidence of is unchanged and is the part worth keeping: this corpus
moves at several decisions an evening, so a sentence that enumerates them is
stale before it is read.

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
only record it ever was. What form an amendment takes, and when it needs a §2
row, is settled below in *"An amendment to an accepted ADR"* — that section is
the rule and this paragraph is the defect it was written for.

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
| [0038](./0038-what-makes-a-save-compatible.md) | What makes a save compatible | Accepted, 2026-08-26 — by delegation; it settles #415 and #412's sentence, and the owner did not read it |
| [0039](./0039-a-keyboard-route-to-room-zoning.md) | A keyboard route to room zoning | Accepted, 2026-08-26 — by delegation; #411, a route the game is unfinishable without |
| [0040](./0040-the-shape-of-the-render-delta-channel.md) | The shape of the render delta channel | Accepted, 2026-08-26 — by delegation; it decides the channel and explicitly does **not** decide simulation-side locomotion |
| [0041](./0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md) | What happens when a prisoner's chosen action has nowhere to go | Accepted, 2026-08-26 — by delegation; it takes the fallback and leaves ADR 0029 decision 5's fairness half open as its tracked successor |
| [0042](./0042-attaching-consequences-to-the-simulation-loop.md) | The consequence chain is built and has no producer a player can reach | Proposed, 2026-08-27 — the ordering of a whole product loop, deliberately not self-approved; it corrects #446's "no consequences attached" to name the real gap, and #440–#443 are its evidence |
| [0043](./0043-account-session-states-and-what-they-may-do-to-local-data.md) | Account session states, and what each may do to local data | Proposed, 2026-08-27 — the client identity model #34 needs and did not have; every transition records whether local data is preserved or discarded, and it is deliberately not self-approved |
| [0045](./0045-must-a-zoned-room-be-enclosed.md) | Must a zoned room be enclosed | Accepted, 2026-08-27 — on decisions 1 and 8 only, both the owner's own: `zone` refuses an open room, and `enclosed` means the room's own boundary is closed rather than topologically indoors. Decisions 2–7 are the author's and stay open. Its edge-of-owned-land consequence is superseded by a successor ADR on buildings, not answered |
| [0046](./0046-shipping-the-telemetry-pipeline.md) | Shipping the telemetry pipeline, and what shipping it obliges | Proposed, 2026-08-27 — the owner ruled that telemetry ships, after an audit rather than in the dark; the pipeline is built and sends nothing, because no ingestion destination is configured in any build. **It cannot be deployed until ADR 0008 §3.1's "No unauthenticated mutation endpoint exists" is reconciled with an unauthenticated ingest**, which is the owner's and is not decided here |
| [0047](./0047-raising-a-building-on-open-ground.md) | Raising a building on open ground | Proposed, 2026-08-27 — the owner asked for a building layer so that rooms live inside a structure rather than on bare land. **Its headline finding is a refusal**: the building layer does *not* dissolve ADR 0045's edge-of-owned-land consequence, because a building has a south boundary for the same reason a room does. The real cause is an asymmetric ownership predicate on edge orders, and slice 0 fixes that on its own |
| [0044](./0044-what-happens-to-a-service-tier-nothing-calls.md) | What happens to a service tier nothing calls | Accepted, 2026-08-27 — by delegation; #378, and it keeps all four trees on stated terms rather than deleting any of them. The owner did not read it, and its two product questions (does cloud save ship, does Lockstate collect telemetry) are recorded open |
| [0048](./0048-what-a-sectors-occupants-are.md) | What a sector's occupants are, and what it takes for a prison to riot | Proposed, 2026-08-27 — takes ADR 0042 decision 2 and answers its open questions 1 and 2: the derived sector is the prison, so its occupants are every prisoner standing on owned land, `needsPressure` is the mean deficit over all six needs, and `requiredGuardCount` scales with occupancy. It corrects ADR 0042 in two places — a riot *was* reachable in one degenerate prison, and occupancy alone would have made the trigger harder to reach rather than easier |
| [0049](./0049-what-a-prison-that-cannot-make-payroll-owes.md) | What a prison that cannot make payroll owes | Proposed, 2026-08-28 — answers ADR 0042 open question 3, which ADR 0017 answer 3's *"None of that is licensed to be decided in implementation code"* forbids answering in a docblock. The treasury stays floored at zero and the unpaid part of a wage bill becomes **arrears**, a second non-negative integer beside the balance: a treasury that could overdraw would pay the wages out of debt and ADR 0017's ladder would never reach its bottom rung. Measured over 30 in-game days, the debit costs one part in thirty of income at the staffing the game asks for, and break-even needs thirty times it |
| [0050](./0050-when-a-sentence-ends.md) | When a sentence ends | Proposed, 2026-08-28 — closes #441, the owner's own issue, by giving `sentenceEndTick` the reader it never had: a prisoner whose sentence the clock has passed leaves and everything they held is given back. It takes [ADR 0026](./0026-entity-id-lifetime.md) question 2 and answers it with option C plus a reflection gate over the real session graph; **it deliberately does not answer question 1 (generation exhaustion), which this change makes reachable for the first time**, and builds no part of Phase 9 |
| [0051](./0051-what-a-player-sees-for-an-order-given-while-the-clock-is-paused.md) | What a player sees for an order given while the clock is paused | Proposed, 2026-08-28 — a command that is *already due* is dispatched when it is submitted, even while the clock is paused, so all thirteen gestures that reach the simulation answer instead of only the clock. It amends ADR 0020's "Ordered Command Queue" and changes what *paused* means to a player, so it is deliberately not self-approved. Its sharpest open question is whether a purchase should spend money during a pause |
| [0052](./0052-drawing-the-world-with-the-source-art-sheets.md) | Drawing the world with the source-art sheets | Proposed, 2026-08-28 — answers ADR 0014's open question "should `public/game-content/source-art/` be published at all" with **yes, and the renderer now reads it**: a reviewed extraction manifest, crops cut and resampled in the browser with `createImageBitmap`, one packed texture, and a mapping keyed by **zoning rather than terrain** because nothing paints terrain. Costs a measured 4.40 MiB against the 16.43 MiB of actor atlases the page already fetches; names the offline packer as the deferred better answer |
| [0053](./0053-who-may-stand-a-security-post.md) | Who may stand a security post | Proposed, 2026-08-28 — closes #456, split out of #442: the four authored staff `department` values decide something for the first time, and only the `security` ones may be claimed for a sector post, an incident response or a contraband search. **It corrects the issue's framing** — the rule already existed, in `src/main.ts`'s `HIREABLE_STAFF_ROLE_IDS`, which is a gameplay rule in the renderer — and it **rejects the competence scalar with arithmetic**: five of the seven non-guard roles cost more than a guard, so a weight below 1 is a strictly dominated choice until a non-security role has a duty to be pulled away from. Measured: an administrator, a nurse, a doctor, a cook and a warden contained all four riots in 30,000 ticks with nobody injured |

**Next free number: 0054.** 0049 through 0053 were all assigned in the 2026-08-28 integration pass, before their drafts existed, which is the change that stopped them colliding: 0049 to the payroll-arrears ADR, 0050 to the sentence-end ADR, 0051 to the paused-clock ADR, 0052 to the source-art ADR and 0053 to the post-eligibility ADR. The gaps this paragraph used to record are gone:
0042 and 0043 were held for parallel drafts that had not merged, and both were
taken in the 2026-08-27 integration pass — 0042 by the consequence-loop ADR,
0043 by the account-session ADR — with 0045 going to the third draft in the same
pass. **Both directions are marked rather than overwritten**, because the reason
those gaps existed is the durable part: the stated number is `max(on disk) + 1`,
which is what `tests/foundation/adr-numbering-contract.test.ts` asserts, so an
out-of-order assignment turns this line into a ceiling rather than the next gap,
and a reader must still read the table rather than this line. The sentence here
used to read "There is no gap below 0045 today; the next out-of-order assignment
recreates one" — and the very next assignment did. **0049 is a gap in this table
and is not free**: it was taken on `agent/0042-step3-recurring-debit` while the
2026-08-28 pass was running, and 0051 was assigned to a third branch in the same
pass, so this line's `max(on disk) + 1` skips over one taken number and stops
short of another. Both directions are marked rather than overwritten, because
the mechanism is the durable part and it has now demonstrated itself twice.
0041 is this table's newest *contiguous* row and **0030 is still
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

**This paragraph said "One row is outstanding: 0033" and it is withdrawn: 0033
was accepted on 2026-08-26 and its row above says so.** Kept as a correction
rather than deleted, because it is another instance of the shape this file's
*"Status values in this table"* section names — a sentence asserting a count,
going false when the count moved, and nothing mechanical noticing.
`adr-numbering-contract.test.ts` compares 0033's row to 0033's own status and
both say `Accepted`, so the tree stayed green while this sentence contradicted
the table.

What was true of 0033 and is worth carrying: it arrived with the change that
implements it — the shape [`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §2 names as
fragile — and **its queue entry was owed rather than written**, for a stated
reason rather than a collision: the brief that change was done under named
`STATUS-QUEUE.md` as a file it may not touch, so the entry was quoted in its pull
request instead. That is the precedent 0032 set an hour earlier, and 0032's own
debt was paid in the commit that accepted it. 0033's never was, and it is now
moot rather than paid — one of the four cases §2 counts under *"Four ADRs have now
been accepted without ever appearing in this queue"*, and the reason §2 calls the
rule unsatisfiable rather than under-obeyed.

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

## An amendment to an accepted ADR: what form it takes, and when it needs a queue row

**Decided 2026-08-27. This section is the rule, and like the rest of this file it
changes no status.** The question it settles was filed in
[`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §5 as the owner's rather than as a defect
that file could close: *"whether 'applies an accepted decision' and 'amends an
accepted decision' are distinguishable by anything a reader can check"*, and if
not, whether the §2 queue rule should cover both.

**The owner delegated the call, and this is an approval of the judgement
delegated rather than of the text below** — the instruction was *"Z tym ci.yml to
nie wiem, żrob by było dobrze z tymi ADR tak samo, zrób dobrze"* ("About that
ci.yml I don't know, do it so that it's right — same with those ADRs, do it
right"). It is recorded as a weaker warrant on purpose, the way 0034 through 0037
record theirs: **a reader who disagrees with any ruling in this section should
treat the decision as open, not as settled by someone who weighed it with the
owner.** What was delegated is which rule to write; what was not delegated, and
what nobody has approved, is the substance of the two rulings in
[ADR 0008](./0008-trusted-service-boundary.md) §2 that raised the question — see
ruling 3.

### 1. The distinction does not exist, and no rule here turns on it

**"Applies" and "amends" are not distinguishable by anything a reader can check,
and the reason is structural rather than a matter of drafting.** The test a
reader would have to run is *"does the ADR as it stood already entail this?"*,
which is a re-derivation from the old text. An ADR exists to spare the next
reader exactly that derivation, so a rule whose trigger is the derivation's
outcome cannot be applied by the reader the rule is written for. What is left is
the editor's account of their own reasoning, and an account is not a check.

The corpus supplies the demonstration rather than the principle. Both rulings
#382 added to [ADR 0008](./0008-trusted-service-boundary.md) §2 change what that
section requires of future work:

- Before, §2 ruled on `TRUNCATE` and argued the case from what `TRUNCATE` alone
  reaches past — row level security, row triggers. After, it states that *"a
  Data API role holds exactly the DML privileges its zone needs on a table, and
  nothing else"* and that *"a new relation in `public` starts closed, and its
  migration opens exactly what it means to open"*. A migration author asking
  whether §2 forbids handing `REFERENCES` to `authenticated` on a new table gets
  no answer from the first text and a plain no from the second.
- The second ruling **says so in its own words**: it is *"the one ruling in this
  section that narrows the row above rather than the one below it"*. Carving
  `created_at`/`updated_at` out of §2's *"Prison simulation state, saves,
  settings — Z0/Z1 (client-authoritative, RLS-scoped)"* row narrows that row, and
  narrowing an accepted classification is amending it whatever account the editor
  gives of it.

That both edits are also faithful *applications* of §2's zone taxonomy is very
likely true, and it does not help: the two categories are not exclusive, which is
the whole reason the line cannot be drawn. #382's stated reason — *"the question
is asked again by every table that gets a timestamp"* — is a good reason to
record the rule and no evidence at all about which side of a line it falls on.
**So no rule in this repository distinguishes the two, and the rest of this
section is written not to need the distinction.**

### 2. What is checkable is form, and the corpus already follows it

**The rule: an amendment to an ADR is a section whose heading begins
`Amendment` or `Addendum` and carries the date it was written.** Not a bold
sentence inside a Decision section, not an edit folded into surrounding prose.
That is checkable by grep, by a reader, and by a test, and it asks nothing about
what the editor meant.

Measured over `docs/adr/` at `54418b6` (v0.0.121) — 35 ADRs — there are **15 such sections
across nine documents** (0003 ×4, 0006, 0007 ×2, 0022, 0023, 0026, 0028 ×3,
0031, 0033) and **14 of the 15 already carry the date in the heading**. So this
rule is the convention the corpus already keeps, written down; it is not a new
demand.

**Those two numbers are anchored to `54418b6` because that is where they were
counted, and the branch this section lands on is already past it.** Re-run on
this tree: **39 ADRs, 24 such sections, 23 of them dated**, the one undated
heading still being 0033's. The nine additional sections are 0014, 0015, 0017,
0019 and 0020 (five ADRs re-read against the code and amended), 0029's, and ADR
0008's three — two of which are the rulings this section gives headings to. The
ratio the argument rests on did not move: it went from 14 of 15 to 23 of 24, and
the single exception is the same document. Stated as two counts rather than one
because a count with no commit beside it is the shape this whole section exists
to stop, and quietly restating the first number against a different tree would
have been that shape. Two additions on disk do not satisfy it, and they are the whole
exception set:

- **[ADR 0008](./0008-trusted-service-boundary.md) §2's two dated rulings**,
  which had no heading and no section at all. They are the only unsectioned
  dated rulings anywhere in `docs/adr/`. Corrected in the same commit as this
  section: both paragraphs are **left word for word** and stay in §2 beside the
  `TRUNCATE` ruling they generalise, each now opened by a dated `Amendment`
  heading, because the fix a reader needs is a name and a date rather than a
  relocation.
- **[ADR 0033](./0033-releasing-an-interrupted-incident-response-at-runtime.md)'s
  amendment heading**, which names no date. Left as it is on purpose: a body is
  amended in its own commit and by whoever takes the decision, which is the
  ground [`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §5 already states for leaving
  other ADR bodies verbatim. It is one word owed by that document's next editor.

**A rule that turns the existing corpus red on the day it lands is a bad rule.**
This one leaves 14 of 15 sections untouched and names its two exceptions, which
is the argument for it over the three alternatives in ruling 4 — each of which
condemns most of the corpus.

### 3. The queue trigger does not change; what changes is that it can be read

§2 of [`STATUS-QUEUE.md`](./STATUS-QUEUE.md) triggers on an **outstanding**
decision. **That stays the trigger, and it is not extended to amendments as a
class.** What this section adds is the half that made it unreadable: **an
amendment states in its own opening whether it has been approved and by whom, so
that whether it is outstanding is something a reader can see instead of
reconstruct.**

That is why #380 was right to queue its ADR 0007 amendment — it declined to
self-approve and marked its heading *"(awaiting approval)"* — and it is right for
a reason that has nothing to do with applying versus amending. Ten of the 17
post-hoc additions on disk are covered today, by their own opening (0006,
0007 ×2, 0028 ×3, 0033), by their ADR's `Status` (0022, 0023, 0031), or by both.
**Seven are not: 0003's four amendments, 0026's addendum, and ADR 0008's two
rulings.** This section does **not** condemn the first five; they are named as a
backlog for whoever edits those documents next, and the count is what asserting
this half mechanically would cost.

**And an approval sentence can itself rot, which is the limit of this half.**
0033's amendment opens *"Status of this section: `Proposed`, with the rest of
this document"* — true when it was written, stale since 0033 was accepted, and
**deliberately outside every gate**, because
`adr-status-reference-contract.test.ts` blanks `Amendment` sections precisely so
that a historical status inside one is not reported as a false claim. So the
requirement is that an amendment *state* its approval position, not that the
statement stay current; keeping it current is the same habit as moving a status,
and nothing mechanical will ever hold it.

**ADR 0008's two are different, and they have a §2 row as of this commit.** Not
because a class rule forces one, but on the instance: they state a rule *"for
every future table"* in `public`, so they bind every migration written after
them; nothing in the corpus records that anyone approved them; and the owner has
never been shown them. ADR 0008's own `Status` keyword does not move, no row in
the table above changes its status, and the substance of neither ruling is
disturbed by this — what changes is that the owner can see the two decisions and
say yes or no to them.

### 4. The alternatives, and what each would have condemned

- **Extend the §2 rule to every post-acceptance edit.** Condemns **16 of the 17**
  post-hoc additions on disk: exactly one of them — 0007's second amendment — ever
  had a row, and [`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §2 records that the row it
  did have was *"the only thing that says it exists"*. It also adds surface to a
  rule that same section already diagnoses as *"unsatisfiable under concurrency"*
  and as having failed more often than it worked. Rejected: a rule already being
  routed around does not get widened.
- **Keep the applies/amends line and write the test for it.** There is no test to
  write; see ruling 1. Rejected as unimplementable rather than as unattractive.
- **Require each ADR's `## Status` to name every amendment it carries.**
  Checkable, and it is the shape 0022, 0023, 0031 and 0033 already use — but only
  those four of the nine amended documents do. It condemns **11 of the 15
  sections** across five ADRs — 0003's four, 0006's, 0007's two, 0026's addendum
  and 0028's three are invisible from a `Status` that reads `Accepted` and
  nothing else. Rejected: it would make five documents this decision has no
  business editing fail on the day it landed, which is the shape of rule that
  gets deleted rather than obeyed.
- **A new ADR for this.** Rejected: this file already states the directory's
  conventions — the filename form, the numbering rule, the next free number, the
  amendment gap itself — so a rule about how `docs/adr/` records things belongs
  here. `CLAUDE.md` forbids inventing replacement architecture where a governing
  document exists, and the parallel process
  [`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §2 actually needs (one queue file per
  entry, so two commits stop colliding) is a different job with its own cost and
  is still owed.

### 5. Which half a gate can hold, and which half it cannot

Said plainly, because the rulings above would otherwise read as enforced. **None
of this section is asserted by any test today.**

**The checkable half, and it is not landed here.** Two predicates, both greppable
off disk in the shape `adr-numbering-contract.test.ts` already uses for filenames
and headings:

```
1. every heading matching /^#{2,6}\s+[*_`]*(Amendment|Addendum)\b/i
   also matches /\b20\d\d-\d\d-\d\d\b/
2. no paragraph outside such a section matches a decision verb
   (decided|settled|generalised|ruled|narrowed) within ~60 characters
   of a /\b20\d\d-\d\d-\d\d\b/ date
```

Two implementation notes, because both were found by running the predicates
rather than by reading:

- **Match the *opener*, not the word.** A heading merely *containing*
  "amendment" catches sub-headings inside an amendment — ADR 0007's *"The
  decision this amendment adds…"*, ADR 0022's *"Open questions this amendment
  does not answer"* — and reports them as undated amendments. At `54418b6`,
  anchoring on the first word instead takes the count from 17 to 15.
- **A section ends at the next heading of the same or shallower level**, not at
  the next heading of any level.
  `adr-status-reference-contract.test.ts`'s `withoutAmendmentSections` uses the
  any-level rule, which is correct for what *it* does and wrong for predicate 2:
  under the any-level rule ADR 0007's *"### The gate"* falls outside its own
  amendment and its back-reference to *"the deferred-status decision amended on
  2026-08-25"* reads as a loose dated ruling.

**Counted after this commit: 24 amendment sections, 23 of them dated** — the two
ADR 0008 rulings are inside that count rather than beside it, which is the whole
point of giving them headings. So
predicate 1 has exactly one failure on disk (0033's heading) and predicate 2 has
none — both stated because they were run, not guessed at. **This sentence read
"17 amendment sections, 16 of them dated" when it was written and that was true
of `54418b6`; it is corrected rather than amended away, because it went stale
between being measured and being merged, which is a shorter half-life than any
claim this section warns about.** They are
**not** in `tests/foundation/` yet: that directory was held by concurrent work
when this landed, which is the same contention
[`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §2 records as the reason its own rule
keeps failing. A stated debt is the honest record; a section describing itself as
gated when it is not would be the worse outcome.

**The half nothing can hold.** Whether an amendment's substance was approved;
whether an *"approved by the owner"* sentence is true; and whether an edit was an
application or an amendment. The first two are what
[`STATUS-QUEUE.md`](./STATUS-QUEUE.md) exists for and they are answered by a
human reading evidence. The third is answered in ruling 1 by not asking it.

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
was the number stated above **at the time**, because
`tests/foundation/adr-numbering-contract.test.ts` derives the next free number
from the highest number on disk rather than from the lowest unused one — which
is still how it works, and is why the bolded line above has since moved well
past 0029. **This sentence named 0029 in the present tense and went stale the
next time that line moved**; it is the mechanism that matters here, not the
number, so the number is no longer restated.

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

**0018 is therefore available.** It is not the next free number — the bolded
**Next free number** line above is the only place that says which is, and this
parenthetical used to name one and contradict it — and 0018
should not be reached for preferentially: a gap in the sequence is easier to
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
