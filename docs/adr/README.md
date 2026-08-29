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
`- Status:` bullet and others a `## Status` section.

**This sentence used to end "and every ADR in the table above carries
`Accepted` in some form" — true when written, false since the next morning,
and left corrected rather than deleted because the failure is the finding.**
`git blame` puts that clause at `64cd3799`, 2026-08-26 21:22, the evening
eight decisions (then eleven, with 0038-0040) were accepted by delegation and
nothing on disk was `Proposed`. `c78908b`, the next morning at 09:12, landed
ADR 0042 `Proposed` — the first of what the table below now shows as
twenty-two `Proposed` rows plus 0013's split §§5-6 — and no edit to this
paragraph followed. Nothing mechanical caught it:
`tests/foundation/adr-status-reference-contract.test.ts` checks a sentence
that names an ADR number against that ADR's status, and this sentence names
none — its own docstring lists "a claim that names no ADR" as a shape it
deliberately cannot catch, and this is that shape. Read the table for the
true count; it is a status column checked against its documents in both
directions by `adr-numbering-contract.test.ts`, which is not a claim that
can go stale the way a sentence can.

**"Every ADR in this directory is accepted" was the next sentence, and it
rotted for the identical reason at the identical hour.** The table above is
the count, and this paragraph deliberately no longer carries one. It used to
read *"Eight decisions were approved on 2026-08-26"* and enumerate them;
three more were approved the same evening — 0038, 0039 and 0040, all under
the same delegation — which made the sentence wrong again without anything
touching it. **A tally in prose beside a table that computes the same tally
is this corpus's most reliably rotting shape**, and it had already rotted
here three ways in one day before the fourth: an ADR arriving Proposed, that
ADR being accepted, three more arriving at all, and then — the next
morning — the *absence* of any `Proposed` row stopped being true too, for as
long as this corpus has had one since. What the day is evidence of is
unchanged and is the part worth keeping: this corpus moves at several
decisions an evening (and, since 2026-08-27, several afternoons in a row),
so a sentence that enumerates or denies them is stale before it is read.
The durable statement is the one the table already makes without prose
beside it: some ADRs here are `Proposed`, each says so in its own `Status`,
and [`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §5 records that most of them are
`Proposed` deliberately — decided under the owner's standing mandate and
left unapproved on purpose, the way [0054](./0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)
is — rather than left outstanding by accident.

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
| [0026](./0026-entity-id-lifetime.md) | The lifetime of `EntityId`-keyed state — generation exhaustion, release, and re-intake | Accepted, 2026-08-25 — as the framing and the tripwire; its three questions stay open. **Two no longer do**: question 2 was answered by ADR 0050 / #441 (2026-08-28), and question 1 was answered 2026-08-29 (#169) — `EntityStore` retires a slot rather than recycling it past generation 4,095. Question 3 (`submitIntake` re-intake) remains open |
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
| [0050](./0050-when-a-sentence-ends.md) | When a sentence ends | Proposed, 2026-08-28 — closes #441, the owner's own issue, by giving `sentenceEndTick` the reader it never had: a prisoner whose sentence the clock has passed leaves and everything they held is given back. It takes [ADR 0026](./0026-entity-id-lifetime.md) question 2 and answers it with option C plus a reflection gate over the real session graph; ~~it deliberately does not answer question 1 (generation exhaustion), which this change makes reachable for the first time~~ — **question 1 was answered separately, 2026-08-29 (#169, ADR 0026 option A)**, and builds no part of Phase 9 |
| [0051](./0051-what-a-player-sees-for-an-order-given-while-the-clock-is-paused.md) | What a player sees for an order given while the clock is paused | Proposed, 2026-08-28 — a command that is *already due* is dispatched when it is submitted, even while the clock is paused, so all thirteen gestures that reach the simulation answer instead of only the clock. It amends ADR 0020's "Ordered Command Queue" and changes what *paused* means to a player, so it is deliberately not self-approved. Its sharpest open question is whether a purchase should spend money during a pause |
| [0052](./0052-drawing-the-world-with-the-source-art-sheets.md) | Drawing the world with the source-art sheets | Proposed, 2026-08-28 — answers ADR 0014's open question "should `public/game-content/source-art/` be published at all" with **yes, and the renderer now reads it**: a reviewed extraction manifest, crops cut and resampled in the browser with `createImageBitmap`, one packed texture, and a mapping keyed by **zoning rather than terrain** because nothing paints terrain. Costs a measured 4.40 MiB against the 16.43 MiB of actor atlases the page already fetches; names the offline packer as the deferred better answer |
| [0053](./0053-who-may-stand-a-security-post.md) | Who may stand a security post | Proposed, 2026-08-28 — closes #456, split out of #442: the four authored staff `department` values decide something for the first time, and only the `security` ones may be claimed for a sector post, an incident response or a contraband search. **It corrects the issue's framing** — the rule already existed, in `src/main.ts`'s `HIREABLE_STAFF_ROLE_IDS`, which is a gameplay rule in the renderer — and it **rejects the competence scalar with arithmetic**: five of the seven non-guard roles cost more than a guard, so a weight below 1 is a strictly dominated choice until a non-security role has a duty to be pulled away from. Measured: an administrator, a nurse, a doctor, a cook and a warden contained all four riots in 30,000 ticks with nobody injured |
| [0054](./0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md) | What a prisoner's day is made of when the prison is empty | Proposed, 2026-08-28 — answers #440 and #436 together, and **measures two of #440's clauses false first**: `free-association` gained an action on 2026-08-27 and the riot half is closed, while the empty `work` category costs zero ticks because no block allows `work` alone. What empties the day is room-gating, so `'free-association'` becomes legal in the four blocks whose every category needed a zoned room (1,442 → 610 idle ticks a day in a cell-only prison, 560 → 0 unmet cycles) and `work` is authored as `action.laundry-work` in the `room.laundry` nothing had ever read. **`hygiene` and `recreation` stay room-gated by design**, because ADR 0048 turned an unmet need into a riot and a cell-side route would delete it — a ruling that depends on HUD_PROJECTIONS gap 7, which is the owner's. **Amended 2026-08-28 on #436's re-verification pass, in two directions**: the "it is enforced" leg holds only where the prison is *also* understaffed — two needs at zero peak at `needsPressure` 0.4824 against a 0.65 threshold and riot **zero** times with one guard on post, 0.7981 and three times with none (**0.7979 until [ADR 0059](./0059-how-an-actor-gets-from-one-tile-to-the-next.md) gave an actor a walk; corrected by #443**, which also found that the fixture's window is **ten** in-game days and not the twenty this row's sources called it) — while the cell-side sibling that looks like the repair is measured to delete the unguarded prison's riot at a quarter *and* at a sixteenth of a shower's rate, so the ruling stands and the gap it leaves belongs to #442/#80 rather than to the action catalogue |
| [0056](./0056-keeping-a-players-orders-in-the-order-they-gave-them.md) | Keeping a player's orders in the order they gave them | Proposed, 2026-08-28 — closes #437, the owner's own issue, and **re-measures it against [ADR 0051](./0051-what-a-player-sees-for-an-order-given-while-the-clock-is-paused.md) first**: the defect survived that ADR with every reported value unchanged, by a different route, because the cause was never the dispatch comparator but a `projectExecuteTick` that collapses backwards on a pause. The sender's projection gains a floor of the highest tick already submitted — seeded from a restored save's own pending queue, which is the half ADR 0020 said a sender-side fix would be incomplete without — so `Undo` can no longer be dispatched ahead of the order it was aimed at. **It narrows ADR 0051's immediacy promise** for orders given during a pause that began within one second of the previous order, and records that two of ADR 0020's four grounds for adding no kernel-side refusal are overtaken by it |
| [0057](./0057-what-a-riot-does-to-a-prisoners-day.md) | What a riot does to a prisoner's day | Proposed, 2026-08-28 — answers [ADR 0048](./0048-what-a-sectors-occupants-are.md) open question 1. A riot replaced nobody's timetable: `applyRiotRegimeOverride` had no caller in `src/` and `ActionSystem.regimeSchedules` had no setter, so a rioting prison and the same prison with two guards produced byte-identical action censuses over the day a riot ran. `ActionSystem` gains an injected `PrisonerRegimeOverrideResolver` asked per idle prisoner, and `createRiotRegimeOverride` answers it from `IncidentLog`'s participant lists — **derived, never stored**, so a save taken mid-riot restores onto the riot regime with no schema bump and no migration, and there is no lift step to forget. `applyRiotRegimeOverride` is deleted rather than wired: it swapped whole classification groups, which is the wrong set the moment a second sector exists |
| [0059](./0059-how-an-actor-gets-from-one-tile-to-the-next.md) | How an actor gets from one tile to the next | Proposed, 2026-08-28 — answers [ADR 0040](./0040-the-shape-of-the-render-delta-channel.md) open question 1, which is what #414's *"actors teleport"* actually needs: the delta channel has been live at a 100 ms ceiling since slice 1, and `ActionSystem.continueTravelling` was still writing the destination anchor in the statement that resolved the route, so an actor's position changed **twice per errand**. A resolved route's waypoints — discarded one line earlier — are walked at one tile per two kernel ticks, with sub-tile progress in a transient store **no save carries**, and the render payload goes to layout 2 with a sub-tile position, a velocity per wall-clock second and a heading. **It meets [ADR 0029](./0029-concurrent-room-use-claims.md)'s own revisit condition** — measured, two of six prisoners starved when a lost race at the canteen door cost a whole walk — and mitigates it with one line rather than the reservation-with-expiry that ADR names, which is left open. Thirty-five assertions across fifteen integration files were re-measured, and **[ADR 0062](./0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md)'s exact-equality result did not survive** — six cells at six distances give six slightly different hunger floors, so the spread is asserted as bounded and *not tracking scan position* instead, which is what #434 was about. The speed is bounded below by starvation, measured twice: one prison starved its prisoner at 2.5 tiles/s and a second, larger one starved at 5, because a journey outlasted the 100-tick regime block that sent them on it — and the fact that a speed had to be raised twice is a statement about `DAY_LENGTH_TICKS` |
| [0061](./0061-what-the-prison-produces-on-its-own.md) | What the prison produces on its own | Proposed, 2026-08-28 — closes #442's remaining children and takes #27's introduction route. Three of four `IncidentType` members had no producer in `src/` and `ContrabandRegistry.introduce` had no caller at all, so a prison could riot and that was the whole of what could ever happen in one. Contraband now enters at the `classification` stage on the arrivals the player admits — banded by `RiskTier` against the catalogue's own `severity`, so only a high-risk arrival can bring a weapon — and leaves with them as a third `ContrabandState`, `'departed'`. `'assault'` reads one prisoner's own deficit where the riot reads the sector mean, at the sector's own weights and line, and defers to it **structurally**: no assault opens while the hot streak is running, because with the same numbers it front-ran the riot every time. `'escape-attempt'` is gated on the high-risk classification *and* on concealing something, and a lapsed one removes the prisoner through `releasePrisoner` — `escaped: true` had been in `lapse` since #28 and had never been true in a running prison. **No weight in `DEFAULT_SECTOR_RISK_POLICY` moved**: #477's 0.4824/0.7981 split (written 0.7979 before #443 re-measured it) and every riot count are unchanged, and decision 7 declines ADR 0048 open question 5 rather than re-tuning the riot model sideways while #477 is open |
| [0062](./0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md) | Who gets the room when more prisoners want it than it seats | Proposed, 2026-08-28 — closes #434 and takes [ADR 0041](./0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md) decision 2, which is the fairness half of [ADR 0029](./0029-concurrent-room-use-claims.md) decision 5. The contended scan is ordered by need urgency — the score of the highest-ranked candidate *the prison can provide*, rejecting [ADR 0048](./0048-what-a-sectors-occupants-are.md)'s `needsPressure` aggregate because four moderate deficits must not outrank one crisis — at **both** gates, ties by ascending entity index, nothing stored and no save version moved. Ordering the selections alone was measured to fix nothing: the two highest-index prisoners stayed on **zero** showers across 40,000 ticks, because ADR 0029 decision 2 takes the claim on arrival. After both sorts, zero prisoners never wash and the worst hygiene anyone touches goes 0.0 → 96.8. **It does not fix the canteen, and says so**: 24 prisoners against a six-seat canteen sit at exactly `36300` stored hunger units when each meal block opens, so prisoners 12-23 enter it zero times before *and* after — left as open question 1 with option C and a tick-derived rotation costed and neither taken |
| [0063](./0063-what-a-refused-restore-says-and-whose-fault-it-is.md) | What a refused restore says, and whose fault it is | Proposed, 2026-08-28 — closes #431 (#403 mitigation (a)) and takes the classification [ADR 0038](./0038-what-makes-a-save-compatible.md) deferred by name to it. **Three reasons, not two and not four**: `unsupported-by-this-build` (coherent payload, wrong build — another build reads the bytes), `damaged-payload` (the content contradicts itself), and `restore-code-fault`, which is deliberately *not* a member of the refusal enum because nothing judged the save. Four was rejected because shape and checksum are refused a boundary earlier by `decodeSaveEnvelope` and an arm for them would be permanently unreachable; two was rejected because it makes a save a newer build wrote indistinguishable from a corrupt one, which is the distinction #432's quarantine must make. The reason is decided at the check that refused and read by one `instanceof` — no message is parsed in either direction, pinned by a falsifiable pair in `tests/unit/restore-refusal-reasons.test.ts`. A code fault is a **separate error class**, so "must not enter the demotion path" is held by the type system rather than by a conditional; it continues the recovery walk and retires nothing. The reason crosses the worker boundary in `protocol/error`'s already-declared `details`, so no fault code, protocol version or save-schema version moves. **Reads [ADR 0024](./0024-protocol-fault-recoverability.md) §1 more narrowly than its prose**: a code fault is `internal-error` *and recoverable*, because §1's test is whether simulation state was reached and `restoreSimulationRuntime` is a factory that cannot — and because a `faulted` worker answers the walk's next attempt `already-initialized`, which would silently cost the player the recovery. No locale key is added; whether a player should be told which save-side reason applied is open question 1 and is the owner's |
| [0064](./0064-what-an-unmet-need-costs-a-prison.md) | What an unmet need costs a prison | Proposed, 2026-08-28 — answers #477 and the second half of #443, and **measures both halves of #443's title stale first**: payroll has been a recurring debit since #455, and all six needs have had readers since [ADR 0048](./0048-what-a-sectors-occupants-are.md) decision 2 and [ADR 0061](./0061-what-the-prison-produces-on-its-own.md) decision 3. What survives is #477's: every reader is deaf to a prison that is merely *staffed* — eight prisoners with `hygiene` and `recreation` on the floor peak at 0.4824 against a 0.65 threshold and produce **zero incidents of any type**, for ever. The cost goes on the **income line**, not the riot roll: the state's prisoner-day grant is paid per occupied place at 300 less 40 for each of that occupant's six needs at or below a fifth of `NEED_MAX`, floored at 60 and never averaged. Measured, ten in-game days: 20,800 against 24,000 for the same eight cells with a shower room and a yard, and the served prison's balance series is bit-identical to before. **`DEFAULT_SECTOR_RISK_POLICY` is untouched and now doubly pinned** — the same trap [ADR 0061](./0061-what-the-prison-produces-on-its-own.md) declined for `contrabandPressure`. No new state, no `SAVE_SCHEMA_VERSION` bump, no RNG stream, and no new player-facing promise: the "earned today" chip already exists and had to be moved onto the same walk so it could not promise money the boundary declines to pay. **What a player is told is deliberately unfinished and the ADR says so** — "a correct consequence with an incomplete explanation" — and names the three things the owner would have to decide |

| [0065](./0065-what-happens-to-a-save-this-build-cannot-read.md) | What happens to a save this build cannot read | Proposed, 2026-08-28 — closes #432 (#403 mitigation (c)) and answers [ADR 0063](./0063-what-a-refused-restore-says-and-whose-fault-it-is.md) open question 2, *"the one place this taxonomy currently declares a save readable and then deletes it anyway"*. **Verified live first**: `SessionController.loadPrison` demoted every refusal without reading `error.reason` at all, so the reason ADR 0063 had landed the day before was declared, carried across the worker boundary and then ignored by the one decision it existed for. A generation refused `unsupported-by-this-build` is now **quarantined** — kept on disk, outside the retention budget — while `damaged-payload` is still deleted. The asymmetry is evidence, not certainty: for the first, a build that reads the bytes is known to exist because it wrote them; for the second, recovery needs someone to write a relaxation against a check saying the content contradicts itself — and **the slot is one slot**, so keeping both costs the demonstrated case to serve the hypothesised one. The decision names its own reversal: an over-strict `damaged-payload` check is fixed by moving that throw site, one line, where ADR 0063 §2 already put the decision. **The mark lives in the generation id, and that is a constraint rather than a preference**: `prisonSlotMetadataSchema` is `.strict()`, so a new field would make an older build's `list()` refuse the player's *whole prison list*, including prisons the marked save has nothing to do with — while `generationIds` has been `z.array(z.string().min(1))` at every schema version, so a downgrade behaves exactly as it did before. No `SAVE_SCHEMA_VERSION` bump ([ADR 0038](./0038-what-makes-a-save-compatible.md)), no slot-schema change, no migration. **Exemption from the retention budget is the decision, and the number is 90 seconds** — `keep` autosaves at the 30 s cadence is what a quarantine that merely escaped deletion would be worth, against a fix measured in weeks. Bounded at **one per prison**, held by the newest candidate; what the bound sacrifices is stated — of two saves this build cannot read, the older one goes. **It declines #432's own acceptance criterion 4 explicitly**: `loadCurrent` still offers a quarantined generation, because it is the newest and staying in the walk *is* the recovery AC 2 requires, where hiding it would need a second route and a route the player must be told about is the owner's. Termination is unchanged and still rests on `LoadCurrentOptions.skip`. Quarantine is invisible to the player by design, and ADR 0063 open question 1's precondition is **discharged** — what remains is the sentence's content, which is the owner's |

| [0066](./0066-what-a-navigation-tick-may-cost.md) | What a navigation tick may cost | Proposed, 2026-08-28 — answers #413 and **withdraws the sharp fact the issue was framed around**. #413 said the shipped budget is set too high; that came from a cost model dividing a whole scenario run by expansions, so a lazy `buildNavigationGraph` and an O(pending) `processTick` prelude were both charged to the search loop. Timing `NavigationSystem.update()` alone puts the same two scenarios at **2.57–2.97 ms** on 2,005 expansions, inside the ~3 ms allowance rather than at twice it — on `meal-rush` full about two thirds of what the quotient charged to expansions was not expansions (3.43 µs reported, ~1.28 µs marginal). What survives is a different and larger finding: **a tick is four terms and the budget bounds one**. Measured on one open 64×64 region at budget 2,000: a graph rebuild costing 10.11 / 10.01 ms once and 0.018 / 0.026 ms thereafter; an O(pending) prelude costing 0.42 ms at 250 pending and 3.15 ms at 5,000, of which the flow-field group scan (2.23–3.24 ms) is larger than the whole search loop; the budgeted search; and overshoot, because `path-request-queue.ts:174` tests the budget *before* a request and never inside one. Two steady ticks with **identical counted work 2.7 ms apart** is the shape of the problem. **The unit stays counted work and ADR 0009 is unamended** — a wall clock is rejected twice over, once because `processTick` decides which routes resolve and a clock-driven budget makes every honest challenge submission fail `checkpoint-hash-mismatch`, and independently because a clock read where the counter is read today would bound term 3 and leave 1, 2 and 4 untouched. **The constant stays 2,000**: a 4× cut buys 8–32% off the worst tick and costs 2–4× the latency. Weighting the unit is rejected on measurement — post-heap it moves 2.2× over a 66× range, against 7.0× before. The decision is about the budget's **scope**: a search that exhausts the tick **suspends** its frontier heap and resumes next tick, which [ADR 0007](./0007-navigation-work-budgets-and-flow-fields.md)'s objection does not reach because that objection is about truncation and a suspended search emits nothing. That turns the bound from `budget + one whole request` into `budget + 1`, and takes `tickOvershootRatio` 2.042 / 2.455 to ~1.0. **Decided and deliberately not implemented** — the branch changed no file under `src/`; suspend-and-resume touches five modules and needs its own pass. One question is the owner's and is stated as open: what share of a 50 ms tick navigation may have, and on what reference hardware. `docs/ARCHITECTURE.md:139` says exact budgets will be set once representative benchmark scenarios exist, and they now do |

| [0067](./0067-what-an-assault-costs-its-instigator.md) | What an assault costs its instigator | Proposed, 2026-08-28 — closes the sanction half of issue #80, which [ADR 0032](./0032-incident-consequences-and-classification-review.md) named and left unbuilt ("nothing moves an already-placed prisoner anywhere") and [ADR 0061](./0061-what-the-prison-produces-on-its-own.md) open question 3 declined to answer ("an assault charges both participants... issue #80 owns adjudication"). **The sanction charges one participant, not both**: `IncidentRecord` gains an optional `instigatorId`, set only by the assault trigger to the flashpoint its own ranking scored worst — the one entity the data supports a reason for, not a struck-first determination — and ADR 0032's disciplinary-point crediting stays symmetric and untouched. `PrisonerOperationsRuntime.imposeSolitarySanction`, called from a new `onAssaultAdjudicated` port at either terminal transition, writes one persisted field (`solitarySanctionEndTick = max(existing, tick) + solitaryTermTicks`, no RNG); a new `SanctionSystem` physically relocates the instigator into `room.solitary-cell` (retrying as a backlog, exactly like `IntakeSystem`'s own accommodation-assignment) and reverses it at term end through the same accommodation-target question intake already asks. **The regime restriction — and so the cost — applies only while the prisoner is physically confined, not the instant the sanction is recorded**: an earlier, ungated version of this branch retroactively broke four pre-existing, unrelated, heavily-measured fixtures (`riot-regime-loop`, both `contended-canteen-*` files and `contended-shower-fairness`) that already produce assaults today but never build a solitary cell; gating on physical confinement fixed all four unedited and is the more honest design besides — a sanction a prison built nowhere to enforce costs nothing. Measured on a real, command-built prison driven for real ticks: an organic assault's instigator loses the ADR 0064 grant on their place from 300 to 220 a day while confined, and a second organic assault later re-names the same instigator and extends the term — an emergent re-offense loop, pinned rather than hidden. #477's protected numbers (`room-gated-needs.test.ts`, `needs-state-grant-loop.test.ts`) are unmoved. One optional field each on `IncidentRecord` and the persisted prisoner-components payload ([ADR 0038](./0038-what-makes-a-save-compatible.md) §1); `SAVE_SCHEMA_VERSION` stays 5; no new RNG stream (#479/#415 read first). Which participant was sanctioned and why, that a prisoner can run a different timetable than their classification-group label says, and that a sanction was recorded but never enforced are all named as open and left to the owner, `AGENTS.md`'s fourth exclusion |
| [0068](./0068-classifying-a-pending-rooms-enclosure-on-the-client.md) | Classifying a pending room's enclosure on the client, not the worker | Proposed, 2026-08-28 — answers issue #493: a player could drag a rectangle, be offered an enabled "Designate N × M", press it, and be refused for being unenclosed with nothing between the drag and the press saying so. **No message crosses the worker boundary for this at all** — the panel may not import the simulation, but the renderer's `WorldRenderView` already decodes the same two edge layers a wall is painted from, on the render-snapshot cadence that already exists, so `roomPerimeterEnclosure` (retyped from `SparseWorld` to a two-method `RoomEdgeReader` port both sides satisfy) runs against it on the client with no new round trip, no new message kind and no cost to any simulation tick. `RoomTool` — the composition root, handed the newest `WorldRenderView` once per rendered frame — answers a new synchronous `classifyArea` query both producers of a rectangle call (a world drag and the panel's typed-coordinates form), so #411's parity guarantee extends to this fact too. The pre-confirm note reuses the existing `hud.rooms.enclosure-open` sentence rather than drafting new copy, and the confirm control is disabled exactly as the too-small warning already disables it, too-small taking precedence when both apply. **Naming which side is open is costed as free and left undecided**: the scan already knows it, but the sentence is new player-facing copy and `AGENTS.md`'s fourth exclusion reserves that to the owner, so this document drafts the wording and does not ship it |
| [0069](./0069-how-long-a-prisoner-is-held-for.md) | How long a prisoner is held for | Proposed, 2026-08-29 — implements [issue #535](https://github.com/matmaxalez/lockstate/issues/535) decision 5 (*"sentences are drawn from a range at admission, with some clearly longer than 13,600 ticks"*) and decides the three things that decision left open: which stream, which side of the worker boundary, and what a save must carry. **A whole mechanic had no reachable case.** `src/main.ts` sent `sentenceLengthTicks: 10_000` with every admission; the two needs [ADR 0054](./0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md) decision 1 rules room-gated first read at or below `STATE_INCOME_UNMET_NEED_LEVEL` at ticks **10,180** (`hygiene`) and **13,570** (`recreation`) — measured through the real `decayNeed` at `NeedsDecaySystem`'s ten-tick cadence, where the figures usually quoted, 10,200 and 13,600, are `204 / rate` and 20 and 30 ticks high — and because `StateIncomeSystem` samples once a day the first boundaries that can charge are **11,999** and **14,399**, so [ADR 0064](./0064-what-an-unmet-need-costs-a-prison.md)'s withholding schedule could never fire from the Intake panel. `AdmitPrisoner.sentenceLengthTicks` becomes **optional** — a widening, so every existing fixture and every queued admission in an existing save keeps its own length and is never redrawn — and an omitted one is drawn **inside the worker**, at `IntakeSystem`'s `classification` stage, inside `EntityQuery.execute()`'s ascending-entity-id walk beside the actor name and the risk tier. Not on the main thread, and `main.ts`'s own comment had already proved why — an argument that rules out a *seeded* main-thread draw too, because `masterSeed` lives in the worker and [ADR 0009](./0009-challenge-verification-strategy.md) replays a command stream **from a seed**. Not in the command handler either, which does have `context.rng`: a draw there advances the stream in command-dispatch order, a fact about input, where the stage advances it in an order derived from state. **A sixth named stream, `prisoners.sentence`**, never `prisoners.classification` — an extra draw there would shift every risk tier every seed has ever produced — so with the range entirely below `LONG_SENTENCE_THRESHOLD_TICKS` every classification outcome of every existing seed is bit-identical (`tests/determinism/` 175 passed, every canonical hash unmoved). No [ADR 0038](./0038-what-makes-a-save-compatible.md) §2 format change and `SAVE_SCHEMA_VERSION` stays 5; the newer-save-on-older-build direction is [ADR 0065](./0065-what-happens-to-a-save-this-build-cannot-read.md)'s case and is named rather than discovered. The range itself — uniform over whole in-game days in `[2, 16]` — is **data, not architecture** (ADR 0017 decision 5) and is a **proposal for the owner**, measured end to end: on one furnished cell with no shower room and no yard, seed 535 draws 19,200 ticks and the day's grant falls 300 → 260 → 220 at ticks 11,999 and 14,399. `priorIncidents` deliberately stays 0, and the measurement that it has to is the more valuable half: reachable tiers at 0 are `[0, 1]` and `classificationGroupIdForTier` answers `'high-risk'` only at tier 3, so **no admission a player can make has ever produced a high-risk prisoner** and `room.solitary-cell` is unreachable through admission — filed as #540, its own decision, and holding it at 0 is what buys the bit-identical-tiers property. No new player-facing copy: nothing in `src/ui/` renders a sentence. ADR 0050's 200,000-tick population harness was **not** re-run at the new range and that is named as the largest gap rather than filled with an assumption |
| [0070](./0070-dismissing-a-staff-member.md) | Dismissing a staff member, and what an empty sector asks for | Proposed, 2026-08-29 — implements the owner's decision on [issue #535](https://github.com/matmaxalez/lockstate/issues/535) decision 4 and [issue #533](https://github.com/matmaxalez/lockstate/issues/533), which asked for **both** halves explicitly and rejected either alone. **A hire was a payroll line no session could end.** `src/simulation/staff/hiring.ts` said so in its own words — *"nothing in `src/` ever removes a staff member from it"* — while `PayrollSystem` bills every id the roster holds at every in-game day boundary, and an empty prison read `Guard coverage · 0 of 1 · Unguarded` with `Nobody is on duty. Hire 1 to cover this population.`, so obeying cost 80 at the click plus 80 at the boundary against no income. Decision 1 makes an empty sector require nobody — an explicit amendment to [ADR 0048](./0048-what-a-sectors-occupants-are.md) decision 3's *"it only ever raises"*, **gated on `sectorOccupantCountIsComplete`** because `resolveSectorOccupants` counts the whole prison only for the derived sector and the post tile for any other: an undercount that is harmless while occupancy can only raise a requirement and silently withdraws an authored schedule if it can lower one. The first cut did exactly that and three scenario fixtures caught it, recorded rather than quietly fixed. It needs **no locale key**: `describeStaffCoverage` already maps `required: 0` onto the branch authored for the save-carried exemption. Decision 2 routes `DismissStaff` through `GuardReleaseService` rather than around it, for [ADR 0034](./0034-releasing-a-claimed-guard.md)'s reason applied to somebody who no longer exists, and reads the path request **before** `unassign` clears it so both `cancelRequest` and `clearResult` are called — `NavigationSystem.cancelRequest` had exactly one caller in all of `src/`, so no guard's route had ever been cancelled by anything and a dismissal that skipped it would strand one request per travelling guard for the life of the save. Decision 3 moves **no money**: a refund pays for a day already worked and interacts with the measured double charge, a severance taxes the player whose whole problem is having none, and both are balance. Decision 4 needs **no `SAVE_SCHEMA_VERSION` bump and no migration** — a dismissal shortens a record list and marks a slot dead, both of which `entity-codec.ts` has always encoded, so the newer-save-on-older-build direction is [ADR 0065](./0065-what-happens-to-a-save-this-build-cannot-read.md)'s case and adds no refusal for it to catch. Decision 5 is the one the brief expected to be hardest and is not: [ADR 0026](./0026-entity-id-lifetime.md) question 1 was already answered (#169), so `EntityStore.destroy` retires a slot at generation 4,095 and no id comes back. **What retirement did move is a real defect** — `roster-full` compared a live headcount against capacity, so a retired-out store passes the gate and `spawn()` throws *out of the kernel's command handler*, a crashed tick rather than a refusal; it is now `EntityStore.canSpawn`, gated by a test that drives one index through all 4,096 lives. Completeness is executable, on ADR 0050's method pointed at the staff store. Four locale strings are drafted and **flagged for the owner**; the roster block's *expanded* fold height was **not** measured — no browser in the authoring environment — and the claim made is the narrow one the collapse supports |
| [0071](./0071-what-bounds-a-room-whose-activity-consumes-no-object.md) | What bounds a room whose activity consumes no object | Proposed, 2026-08-29 — implements [issue #535](https://github.com/matmaxalez/lockstate/issues/535) decision 3 and [issue #532](https://github.com/matmaxalez/lockstate/issues/532), whose mechanism the owner decided in both halves: the kitchen gets an action **and** the yard is weakened so the common room has a state in which it wins. **One room in the game had no concurrent-use ceiling of any kind.** [ADR 0028](./0028-object-placement-and-derived-room-capacity.md) decision 2 as amended by #326 answers `Number.POSITIVE_INFINITY` when an action names no capability, on the correct reading that a rule summing object footprints has no domain over a use that consumes no object — and `room.yard` is the only room type requiring no object, `action.yard-recreation` the only `room-catalog-id` action naming no capability. Because `score(yard) − score(common) = d_recreation + 0.1·d_safety` and a deficit is never negative, the yard scores at least as high **in every state a prisoner can be in**, equal only when both deficits are exactly zero — where the ascending-id tie-break then takes `action.common-room-recreation`. So the common room was reachable on merit in precisely the one state where winning is worth nothing, and a yard that never fills never falls through to it. Measured in a second worktree checked out at `feefbc4` (v0.0.189) with nothing applied, six prisoners and five in-game days: **6,952 yard ticks against 96**, six of six in the yard at once. **A score change cannot fix this and that is provable rather than argued** — the difference is a linear form on two non-negative deficits, so it flips only by giving the common room a *safety* advantage, into a corner (`d_safety > 10·d_recreation`) no player can cause; raising the common room from 2 to 4 is the specific form an audit named. `concurrentUseCapacityFor` case 1 therefore answers `max(1, floor(width × height / TILES_PER_OPEN_GROUND_PLACE))`, **16 tiles a place** — still derived, still authored nowhere per room, an instance with no rectangle (a V4 save) keeping the unbounded answer, and clamped below at 1 because `floor(6/16)` would make a 2×3 cell admit nobody, which is the pre-#326 defect one room size down. No save format moves. Result: **5,872 against 1,248**, the yard still the larger share. **A 16×8 yard reproduces the unmodified tree to the tick** (7,208 / 336 either way), so a yard sized for its population costs nothing and the whole change is what happens to an undersized one — the narrowest blast radius a balance figure can have. The figure is data (ADR 0017 decision 5) and stays open to re-measurement; the mechanism above it is not. Weakest claim, stated in the ADR: land is free, so this bounds the *current* yard and not the yard as a concept — if players zone one enormous yard and never build a common room, the next lever is a cost on ground, **not** a tighter figure. **Numbered 0071 and not 0070**: three numbers were assigned in one pass — 0070 to the staff-dismissal ADR already on `agent/533-dismiss-staff` (#547, `7db68a5`), 0071 here, 0072 to the events-persistence decision on `agent/507-event-channel` — so the three above this line are a sequence handed out together rather than gaps to infer. This draft was assigned 0070 first, on a branch sweep that had been stated as run and had not been; see its own preamble, which records both directions |
| [0073](./0073-who-orders-a-contraband-search.md) | Who orders a contraband search | Proposed, 2026-08-29 — answers [issue #552](https://github.com/matmaxalez/lockstate/issues/552): the status strip's **Contraband** figure can never move in a player's game. Measured in play — twelve admissions, sixteen in-game days, `"Contraband":"0"` on every sample. The machinery is **complete and good**: `SearchSystem` queues an order until enough unassigned guards exist, travels through the real `NavigationSystem`, dwells per target, draws detection against a **named RNG stream** through the pure `resolveDetectionProbability`, records confiscations naming the finding guard, and sorts `activeJobsInCanonicalOrder` by order id precisely so a save/restore round trip cannot re-order the draws ([ADR 0009](./0009-challenge-verification-strategy.md)). Exactly two things are missing: `new-session.ts:749` is `const searchPolicies: SearchPolicyDefinition[] = []` and nothing pushes to it, so `findPolicy` would **throw** on the first search ever ordered; and `SearchSystem.submitOrder` has **no caller anywhere in `src/`**. **A correction to #552 is made here rather than inherited**: its suggestion that an `'on-search'` deployment phase is *"waiting for a producer"* is withdrawn — `'on-search'` is the phase a guard is *in while searching*, an effect the search system produces, not a schedule slot that triggers one, so **no existing scheduling hook exists** and every option needs new wiring. Part 1 ships four default policies from `new-session.ts` (the place `SearchPolicyDefinition`'s own docblock names, beside `DeploymentSchedule`) and is **not optional under any option** — an empty list makes a documented public method throw. Part 2 asks who orders one: **A** a standing guard duty (no UI, no copy, no panel height — which matters, `.hud-rooms` had 0px of spare height at 900×600 and the last block added put it 54px outside its own box), **B** a player-ordered targeted search, or **C** both. Recommended **A first, then B**: A alone closes #552 and is the cheapest way to find out whether six tuning numbers per scope that nobody has ever watched run are any good, and B needs measurements only A produces. The balance coupling is **stated rather than discovered** — `staffingShortfallWeight` is 0.3, so a guard away searching is a guard not suppressing riot pressure, and one guard against none in an eight-prisoner prison measured 0.4824 against 0.7979 on a 0.65 threshold. No save-format change: `save-schema.ts:797` already carries the policy array. Does **not** widen the reachable contraband set — `main.ts` pins `priorIncidents: 0`, so tiers `[0,1]` keep drugs (tier 2) and weapons (tier 3) out of reach, which is a separate question |
| [0074](./0074-what-a-restored-room-that-recorded-no-rectangle-is.md) | What a restored room that recorded no rectangle is | Proposed, 2026-08-29 — answers [issue #559](https://github.com/matmaxalez/lockstate/issues/559) and **amends [ADR 0071](./0071-what-bounds-a-room-whose-activity-consumes-no-object.md) decision 2**. 0071 gave an objectless room a ceiling from its own ground and left `POSITIVE_INFINITY` where there is no rectangle, naming *a V4 save* as that case. Measured through the real path — `decodeSaveEnvelope` → migration chain → `restoreSimulationRuntime`, on a save **v0.0.61 actually wrote** (`tests/fixtures/persistence/save-v4-yard.json`, captured from `94adf1c` in a detached worktree) — a restored 8×8 yard answers **`Infinity`** where the same yard zoned by this build answers **4**. So #554’s balance change does not reach a restored prison, and nothing tells the player. **The rectangle was never lost, only unread**: `RoomZoningService.zone` paints the room type’s `numericId` over every tile it designates, that plane is persisted in the world section, and the fixture’s plane holds exactly 64 tiles at `x 4..11, y 4..11`. So the restore recovers it (`src/simulation/rooms/bounds-recovery.ts`) and **no save format moves**: `SAVE_SCHEMA_VERSION` stays 5, no migration is added, nothing is written to any file, and the recovery is recomputed on every load — ADR 0033’s shape rather than ADR 0030’s, for the reason [#391](https://github.com/matmaxalez/lockstate/pull/391) established. **A migration could not have done it**, and that is measured rather than argued: restore the V4 payload, run it, capture it, and the envelope declares version 5, decodes with `migrated: false`, and still carries the boundless row — so the class of save needing repair was never “V4 saves”. **The recovery is exact, not a heuristic**, and decision 4 carries the proof: anchors walked ascending y-then-x, runs stopping at unpainted paint, at a claimed tile, or at another instance’s anchor, with the whole rectangle verified before it is taken. A row the plane cannot support keeps its absent bounds and 0071’s unbounded answer, **pinned by a test** so nobody later turns it into a silent guess. Two false sentences in `save-migrations.ts` are corrected with it: the *“hard case is unreachable in practice”* claim (twelve tagged releases, v0.0.49..v0.0.61, shipped a Rooms tab and `room.yard` at V4) and *“its capacity stays 0”* (it became `Infinity` at #554). **No player-facing string is added or changed.** Weakest claim, stated in the ADR: the exactness proof holds for planes `zone` wrote and not for stray same-type paint a hand-edited save could hold |
| [0075](./0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md) | What a prison that cannot afford its first bed is owed | Proposed, 2026-08-29 — answers economy-audit finding **ECON-002**, raised against `4c18bc4` (v0.0.203) and **reproduced by running it** against `ec10451` (v0.0.206) in `tests/integration/economy-liquidity-hard-lock.test.ts`. **It proposes no new policy: it discharges an accepted one whose cost was written down and never paid.** [ADR 0017](./0017-money-primary-resource-model.md)'s insolvency answer (its decision 8) reads *"insolvency is a state, not a loss condition… **No game-over, no silent stall**"* and names its own price: *"**degradation has to be authored and surfaced**, or insolvency becomes the same invisible stall as #89."* **ECON-002 is that invisible stall.** A prison whose treasury falls below **65** with no `item.wood-plank` in stock and nothing plank-built to reverse can never earn another minor unit: income is paid per occupied place, an occupied place needs a standing `sleep-surface` object, and both buildables that place one are priced in planks. **The audit's framing is corrected.** It raised a reckless purchase (625 `item.brick` at 40 spending exactly the opening 25,000 in one press), which invites *"then do not let them press that"*. **624 bricks leaves 40** — a positive balance the status strip shows, and the identical trap, because the threshold is a plank's price and not zero — and the same state is reached **with no such press at all**: 616 bricks (308 ordinary wall segments), one guard hired, then nothing pressed again while payroll bills 80 a day — 360 → 280 → **40** after three in-game days, then 0 with unpaid wages climbing. So **the class is "the treasury drains below the price of a plank", not "the player spent it all at once"**, and every remedy that only defends a press is incomplete by construction. **The owner ruled on 2026-08-29**, so this is three decisions in build order rather than a choice. **(1) Development grants at population thresholds** — their own shape, not one of the four offered: one-off per threshold, thresholds continuing indefinitely, first threshold very low. It **pays for growth rather than for existing**, so it escapes what ADR 0017 decision 1 rejected by name — *"a block grant pays for surviving to a date, which is the timer the audit warns about"* — and serves that decision's goal that *"expansion and competence are not separate currencies"*; one-off is what stops it being milked. **The ADR says the very low first threshold is a starting grant in disguise and does not close the class on its own.** **(2) The balance may go negative, the ladder runs on it, loans are the way out, and nothing ends the session.** The owner was asked whether bankruptcy should follow N days in the red and **refused** — *"Bez bankructwa, tylko minus i pożyczki"* — which is a decision **not** to overturn ADR 0017 decision 8, so that decision stays in force and the ADR says so with the quote, because a negative balance otherwise reads as a loss state. **The loan is load-bearing, not a nice-to-have**: with no floor and no terminal state a prison can reach a position from which recovery is arithmetically impossible — a slower hard-lock — and borrowing is the only exit. `Treasury`'s own docblock argues its non-negative validators are load-bearing *for* decision 8 and is **owed a correction, not a deletion**: they defended it by preventing the debt; it is now defended by the loan instead. **(3) Sell-back at a loss** — the general answer to a prison that is illiquid rather than poor. Not taken and recorded with reasons: prison labour (ADR 0017 decision 3's other unbuilt secondary line, and **flagged as the natural next one** — [ADR 0054](./0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md) measured `action.classroom-education` already filling 9,000 of 10,000 work-and-education ticks), a flat daily subsidy, a threshold backstop keyed to a plank's price, a one-off starting stock, a liquidity floor (now in direct conflict with decision 2), a spend-it-all warning, and an explicit stuck state. Rates, thresholds and loan terms stay #29's per ADR 0017 decision 5. **Save format:** decisions 1 and 2 both need checking — a loan's outstanding principal and the crossed-threshold set must persist, or a reload pays every grant again. Fingerprints move under all three; decisions 2 and 3 add player-facing strings. Weakest claim, stated in the ADR: **the class is closed only if the first threshold beats the wage bill and the loan terms make recovery possible from any reachable position — neither number is in this ADR** |
| [0076](./0076-what-happens-to-a-resident-whose-bed-is-taken-away.md) | What happens to a resident whose bed is taken away | Proposed, 2026-08-29 — answers economy-audit finding **ECON-003** and **amends [ADR 0028](./0028-object-placement-and-derived-room-capacity.md) decision 2**, whose eviction subsection reads *"Nobody is evicted. Occupancy above capacity is a legal, named state"* and *"Removing the last bed from an occupied cell does not homeless anybody."* **Neither sentence is withdrawn**; both survive narrowly and the narrowing is written out — a resident may now be **moved** when there is somewhere to move them, and the over-capacity state becomes the no-vacancy branch's specifically rather than the general outcome. **The sharpest evidence is a written invariant the code stopped honouring**: `src/simulation/economy/income.ts:112` argues the paid count *"can never exceed the capacity the prison has actually furnished"* — the argument the whole per-occupied-place income model rests on — while a cell whose only bed was removed reads occupancy **1** against capacity **0** and is still paid for. **The residency half was already decided and is not the finding**: `tests/integration/object-removal-loop.test.ts` already pins that cell, its save round trip and the sentence *"the state still pays for the place they occupy"*. **Two commands disagree about what a finished object un-builds into** — `RemoveObject` refunds nothing (*"the plank became a bed"*), `Undo` refunds in full via `cancelOrder` releasing an allocation completion never clears — and measured here, `Remove` **then** `Undo` already returns the plank today. In `tests/integration/economy-bed-recycling.test.ts`, against a control playing the same prison without the undo, same seed and same single 65 plank: **3 residents and 4,380 of state income against 1 and 1,460**, ending on one standing bed. **The audit's word "unbounded" is withdrawn**: the loop needs a fresh cell each time, so the ceiling is zonable land, **not counted and not guessed**. **Both questions ruled on by the owner on 2026-08-29. B: a finished object un-builds into its full materials by either route** — `RemoveObject` starts refunding — with the cost that dismantling becomes free and early material pressure goes put in front of them and **accepted rather than argued away**; it supersedes for object removal ADR 0017's expectation that #99's salvage would return value *"as carried salvage, not as cash"*. Its named hazard: the allocation is what a refund draws from and `RemoveObject` does not clear it, so a refund leaving it populated is refunded a **second** time by a later `Undo` — **one refund per order, allocation emptied in the same step, with a conservation test over `Remove` → `Undo` and `Undo` → `Remove` as the gate**. **A: relocate the resident, and pay only for furnished places when relocation cannot** — one decision in two parts, the behaviour and the invariant. **A(i)** gives `PrisonerOperationsRuntime.relocateResidentsOutOf` (`src/simulation/prisoners/prisoner-operations-runtime.ts:500`, atomic, deterministic, built for [#478](https://github.com/matmaxalez/lockstate/issues/478) and until now called only by `UnzoneRoom`) its second caller: a resident moved to a bed that exists beats one silently living in a bedless room. **A(ii)** pays `min(occupancy, residentCapacity)`, and it is what makes A(i) safe rather than a second way of being wrong — **A(i) does not close the leak and A(ii) does**, because after a relocation the resident occupies a real bed and *should* be paid for, so relocation's correctness rests entirely on the `'no-vacancy'` branch, where the state is exactly today's. **Shipping relocation alone leaves the leak open in precisely the branch that matters**, since a player exploiting the loop has no spare furnished bed by construction. Refusing the removal is rejected for #478's reason. **All three parts ship in the same release**: B without A makes the recycling one press instead of two, and A(i) without A(ii) is the same mistake one layer down. Three assertions in `object-removal-loop.test.ts` go red and each is a sentence that must be rewritten by hand. **No save format moves**; a determinism fingerprint moves only for prisons in the affected state and **no pinned fingerprint is re-baselined**; **no player-facing string** is added, though A(i) arguably creates one it does not owe — a prisoner who changes cell unasked is something the player should be told, flagged rather than decided |
| [0077](./0077-when-a-route-stops-being-valid.md) | When a route stops being valid | Proposed, 2026-08-29 — answers **SIM-001** (HIGH/HIGH) from the 2026-08-29 audit pass against `4c18bc4` and **RED-002**, the red-team pass that reached the same code and called it an *audit gap* rather than a defect for want of a producer-side proof. That proof is here: driven through the real `PlaceBuildOrder` command path, seed `0x0b1ec7`, a prisoner's walk begins at tick 1,541, the wall completes and `topEdge(28, 31)` becomes brick at tick **1,621** with the prisoner at `(15, 27)` and still walking — **thirteen tiles short** — and it crosses that edge at tick **1,657**, finishing inside a cell nothing in the prison can reach. `beginWalk` validated only the *shape* of a waypoint list and held no geometry version, door version or route-dependency token; `advance` wrote reached waypoints without re-asking. Navigation's invalidation is correct and cannot reach it — the route has already left the subsystem and become locomotion state — and `ConstructionSystem` (100) runs before `LocomotionSystem` (200), so the wall is standing when the walk steps. The rule: **no actor may traverse an edge that is non-traversable at the tick on which the edge is crossed**, asked once per *tile crossed* rather than per tick. **Measured cost: 35–71 ns per walker per tick, 0.13% of a 50 ms tick at 1,000 simultaneous walkers, upper bounds on a contended machine** — which is what rejects the route-validity-token alternative, since a token is compared per walker per *tick*, invalidates every walk in a chunk on one wall completion (an unbudgeted re-planning burst against `AGENTS.md` boundary 9), and would be a save-format field. **No save-format change, no determinism fingerprint moved, no player-facing string.** **A correction to the brief is recorded as a finding rather than a footnote**: guards do *not* share locomotion mechanics — `LocomotionStore` is instantiated exactly once, guards teleport (`deployment-system.ts:202`, `patrol-system.ts:141`) and so do job carriers (`job-system.ts:187`) — which ADR 0059 records deliberately, with its open question 4 asking whether guards should walk at all. So the stronger fault is already decided, and what this ADR owes that population is a *mechanism*: the predicate is a **required** parameter, turning five call sites into compile errors, so the question cannot be skipped by omission when guards are converted. **Decision 6 is the reversible one and says so**: doors are inside the rule, so a lockdown now confines walkers, on negative evidence only; the narrower alternative — geometry re-validated, door state trusted from plan time — is one line in `isEdgeTraversable` and is argued in advance so nobody re-derives it under pressure |
| [0078](./0078-what-keeps-a-prisoner-safe.md) | What keeps a prisoner safe | Proposed, 2026-08-29 — implements the owner's ruling on [#599](https://github.com/matmaxalez/lockstate/issues/599) through [#588](https://github.com/matmaxalez/lockstate/issues/588). Guard coverage provisions the `safety` need: `covered` at 0.08 a tick, `understaffed` at half, `unguarded` at nothing, against a decay raised from 0.01 to 0.05 — so the 20,400-tick figure is **discarded** for the unguarded prison (which now crosses in 4,080 ticks, inside the 4,800-tick minimum sentence) and **preserved exactly** as the long-stay accumulator for the understaffed one. Hygiene's 10,200 and recreation's 13,600 stand. `action.sleep` and `action.yard-recreation` both stop restoring `safety`; no action does. **It corrects the premise both issues were argued from**: the old rate did not withhold 40 permanently, it withheld **zero** — a bed returned about +240 a day against −120 of decay, so the state never charged for `safety` in any prison that had built a cell. The sequencing constraint #588 calls load-bearing is measured and met: a fully covered over-capacity prison rioted twice in ten in-game days before and riots **zero** times now, before against `05640b6` in a separate worktree. No incident fine and no new income term. Evidence: [2026-08-29 coverage provisions the safety need](../research/2026-08-29-coverage-provisions-the-safety-need.md) |

**Next free number: 0079.** **0078 has since landed** — the prisoner-safety ADR ([#588](https://github.com/matmaxalez/lockstate/issues/588), under the owner's ruling on [#599](https://github.com/matmaxalez/lockstate/issues/599)) — and moved this line from 0078 to 0079, for the same reason 0063 through 0069, 0073, 0074 and 0077 each moved it: it was the new maximum on disk. Its case adds nothing new to this paragraph and that is worth saying rather than inventing a lesson from it. The draft declined a number while the work was in flight, as 0065, 0066, 0069, 0070 and 0077 each did; the integrator performed the sweep across every remote head and handed the output over to be re-verified rather than trusted; the agent merged current `main`, re-ran the sweep itself and recomputed `max + 1` off disk. **All three answers agreed at 0078**, which had not happened since 0074 — 0077 is the entry immediately before this one and is in the history precisely because its three answers *disagreed*. **0072 is still held**, so this line moves to 0079 over a hold that is now six numbers below the ceiling. 0055 and 0058 were held by parallel drafts when this sentence was written — *0058's draft was never written and the number is a gap; see the correction later in this paragraph, which is the one to believe* — and 0056 and 0057 were assigned to the command-ordering ADR and the riot-regime ADR in the same 2026-08-28 pass, so this line is a ceiling over a gap rather than the next gap — read the table. 0049 through 0054 were all assigned in the 2026-08-28 integration pass, before their drafts existed, which is the change that stopped them colliding: 0049 to the payroll-arrears ADR, 0050 to the sentence-end ADR, 0051 to the paused-clock ADR, 0052 to the source-art ADR and 0053 to the post-eligibility ADR. **This line read "Next free number: 0058" until 2026-08-28**, when 0062 was assigned to the contention-fairness ADR and became the highest number on disk; the contract is `max + 1`, so the line moved to 0063 rather than to the lowest gap. 0058 and 0060 were handed out that day and returned unused — the keyboard work and the needs work each correctly declined to write an ADR rather than manufacture one. **0059 and 0061 have both since landed** — the locomotion ADR and the incident-producer ADR — and each is a row above rather than a number held; **neither moved this line**, because both are below 0062, which was already the highest on disk. That is the arithmetic worth remembering: a number lands without moving the ceiling whenever it is below the maximum, so three drafts in flight can all correctly write the same next-free value. So 0055, 0058 and 0060 are gaps rather than the next number. **0063 has since landed too** — the restore-refusal-taxonomy ADR — and unlike 0059 and 0061 it *did* move this line, from 0063 to 0064, because it is the first of the three that was not below the maximum. That is the same arithmetic seen from the other side, and it is why the three drafts had to land in that order: the two below the ceiling in any order, the one that raises it last. **0064 has since landed** — the needs-grant ADR — and moved this line from 0064 to 0065 for the same reason 0063 did: it was the new maximum. It is also the first number in this paragraph's history that was **handed out before the draft existed and then used**, which is what `docs/AGENT_WORKFLOW.md` says central assignment means; the agent holding it recomputed `max + 1` off disk at commit time rather than trusting the number it was given, and got the same answer. **0065 has since landed** — the save-quarantine ADR — and moved this line from 0065 to 0066, again because it was the new maximum. It is the first one in this history whose agent **declined to take a number at all** while a higher one was in flight on an unmerged branch: 0064 was unmerged when that draft returned, so `max + 1` computed off `main` would have been 0064 and would have collided the moment #488 merged. The draft came back unnumbered with the arithmetic written out, the number was assigned once 0064 was on disk, and the agent recomputed at commit time and got 0065. That is the failure mode this paragraph has been tracking since 0004, caught one step earlier than usual — not by an index check, but by a draft refusing to guess. **0066 has since landed** — the navigation-tick-budget ADR — and moved this line from 0066 to 0067, for the same reason 0063, 0064 and 0065 each moved it: it was the new maximum. Its draft declined a number for the same reason 0065's did, and the two cases are worth reading together because the *risk* differed while the *behaviour* did not: 0065's agent declined while a higher number was genuinely unmerged, and 0066's declined while nothing above it was in flight at all. The second one turned out to be unnecessary — 0066 recomputed off disk at commit time is 0066, exactly the number a guess would have taken. That is the point rather than an argument against the practice: the agent could not know which of the two cases it was in, because "is a higher number in flight" is a fact about branches it cannot see, and a rule that only holds when you already know the answer is not a rule. **0067 has since landed** — the assault-sanction ADR (issue #80) — and moved this line from 0067 to 0068 for the same reason each number above it did: it was the new maximum. **This paragraph's own previous sentence was wrong by the time it was read**, and is corrected here rather than silently dropped: it reserved 0067 for issue #493's HUD-projection decision, and 0067 was assigned to this ADR instead. That reservation moved to **0068**, which was reserved for issue #493's own branch (`agent/493-preconfirm-enclosure`). Whether the mismatch was a stale note that outlived a re-assignment or two branches genuinely both reaching for 0067 is not something this file can settle from disk alone; it is recorded as found, not explained away. **0068 has since landed** — the pre-confirm room-enclosure ADR (issue #493) — and moved this line from 0068 to 0069, for the same reason each number above it did: it was the new maximum, and the reservation the previous sentence names is now a row rather than a hold. **0069 has since landed** — the sentence-length ADR (#535 decision 5) — and moved this line from 0069 to 0070, for the same reason 0063 through 0068 each moved it: it was the new maximum. Its draft declined a number for the reason 0065's and 0066's did, and this time the check the decline exists for was actually *performed*: the integrator enumerated `docs/adr/` across every unmerged remote `agent/*` branch before assigning, found nothing above 0068, and the agent recomputed `max + 1` off disk at commit time and got 0069 anyway. Both halves matter — the recomputation is what this paragraph has been asking for since 0004, and the branch sweep is the half no worktree can do for itself. **0071 has since landed** — the open-ground-ceiling ADR (#535 decision 3, #532) — and moved this line from 0071 to 0072, because it was the new maximum on disk once #547's 0070 is counted. **Its case is the first in this history where the error was the integrator's rather than a draft's, and where it happened twice in opposite directions.** The agent was first told *"ADR 0070 landed today, recompute `max + 1`"* — which would have made 0071 the honest answer — and declined to take any number, because whether a higher number is in flight on an unmerged branch is a fact about branches a worktree cannot see. It was then assigned **0070**, on the stated grounds that `docs/adr/` had been swept across `main` and every unmerged remote `agent/*` branch with nothing found above 0069, and that the "0070 landed today" had been *this very line* relayed as though it were a landed number. That last part was true. **The sweep had not been run.** Run properly it finds `agent/533-dismiss-staff` (PR #547) holding 0070 since before any of it, in `0070-dismissing-a-staff-member.md` at `7db68a5` — so taking the assignment would have put 0070 on two branches and surfaced the collision at merge, in the file that exists to prevent it. The agent re-verified the corrected sweep itself rather than accepting it on trust, and got the same three answers: `main` 0069, `agent/533-dismiss-staff` and `wip/533-dismiss-staff` 0070, nothing above 0070 on any remote head. **And `max + 1` recomputed off disk at commit time gives 0070, not 0071** — the one case here where the recomputation is *not* the authority, because disk sees only what has merged and central assignment exists for what has not. Both halves of this paragraph's usual lesson therefore survive with their subjects swapped: the recomputation is still the check that catches a stale number, and the branch sweep is still the half no worktree can do for itself — but the sweep has to be *performed* rather than asserted, by whoever claims it. **Three numbers were assigned in that one pass**: 0070 to the staff-dismissal ADR on `agent/533-dismiss-staff`, 0071 to the open-ground-ceiling ADR, and 0072 to the events-persistence decision on `agent/507-event-channel`, which the owner has just ruled on. None can collide with another, and 0070 is a row on a branch rather than a gap. Read the table. The gaps this paragraph used to record are gone: **0073 has since landed** — the contraband-search ADR (issue #552) — and moved this line from 0072 to 0074 rather than to 0073, which is the first time in this paragraph's history that the line has skipped a number. It is deliberate and it is the same lesson as 0065's and 0069's, learned from the other side: 0072 is **held** for the events-persistence decision the owner ruled on, and 0070 and 0071 were both held on unmerged branches when 0073 was assigned, so `max + 1` off `main` was 0070 and would have collided with two of them. The integrator had, earlier that same day, told an agent the branch sweep had been run when only `main` had been read — a second 0070 was one commit from landing — so for 0073 the sweep was **performed** and the number chosen above every held one instead. That is the case this paragraph had never recorded: not a draft guessing, but the assigner asserting a check it had not made, and the correction is that `max + 1` is the authority only once the sweep says nothing is in flight. **0070 has since landed** — the staff-dismissal ADR (#533, #535 decision 4) — and, unlike 0063 through 0069, it did **not** move this line: 0073 was already the maximum on disk when it merged, so the ceiling had passed it before it arrived, exactly as 0059 and 0061 passed under 0062. Its own draft is the fourth in a row to have declined a number, and **that account was written into this paragraph on its branch and is kept here rather than dropped in favour of the fuller one above**, because the two are about different halves of the same assignment — the branch's is about the draft declining, the paragraph above is about the assigner asserting a sweep it had not run. The branch's read: when that draft returned, `main` was `a6b262e` (v0.0.186) with 0068 the highest on disk, so a guess would have taken 0069 — the number 0069's own branch was holding, unmerged and invisible; by the time 0070 was assigned, 0069 had landed, `main` was `feefbc4` (v0.0.189), and `max + 1` recomputed off disk was 0070. **0072 is still held** for the events-persistence decision, so it remains a hold rather than a gap, and this line stays at 0074. **0074 has since landed** — the restored-room-rectangle ADR (#559) — and moved this line from 0074 to 0075, for the same reason 0063 through 0069 and 0073 each moved it: it was the new maximum on disk. Its case adds nothing new to this paragraph and that is worth saying rather than inventing a lesson: the sweep was performed across every remote head, `main` and every `agent/*` and `wip/*` head maxed at 0073, 0072 was still held, and `max + 1` off disk and the stated next-free agreed at 0074 — the first time since 0069 that the two agreed *and* the branch sweep found nothing in flight. **0072 is still held**, so the line moves to 0075 over a hold that is now two numbers below the ceiling. **0075 and 0076 have since landed together** — the first-bed-affordability ADR and the resident-whose-bed-is-taken-away ADR, both from the economy audit's ECON-002 and ECON-003 — and moved this line from 0075 to **0077**, two numbers in one commit for the same reason each single one above moved it: they are the new maximum on disk. **Two numbers assigned in one pass to one agent is new in this paragraph's history**, and it is the shape the 2026-08-28 lesson prescribes rather than an exception to it: the integrator performed the sweep across every remote head before either draft existed, found nothing above 0074, and handed out both at once so the second could not be computed off the first. The drafting agent recomputed `max + 1` off disk at commit time anyway and got 0075 — the fourth consecutive time the recomputation and the stated next-free have agreed, and, as with 0074, the agreement is worth recording precisely because whether they agree is a fact about branches a worktree cannot see. **0072 is still held**, now three numbers below the ceiling. **0077 has since landed** — this ADR, the traversal-time route-validity decision (SIM-001/RED-002) — and moved this line to 0078 — **this clause read "from 0075 to 0078, skipping two numbers" when it was written, and the merge that landed it falsified the skip**: 0075 and 0076 reached `main` first, so the line had already moved to 0077 and this is an ordinary single step. The skipping account is kept because it is true about the tree the sentence was written on, and the arithmetic it explains is the reason the number is 0077 rather than 0075, which is the second time in this paragraph's history that the line has skipped and the first time it has skipped by more than one. The reason is the one 0073's case established and is worth reading beside it: `max + 1` recomputed off disk at commit time was **0075**, and that answer was wrong because `agent/econ-hardlock-and-recycling` was holding **0075 and 0076**, unmerged and invisible from disk, for the two economy decisions the owner had just ruled on. The integrator performed the sweep across every remote head before assigning, and the drafting agent recomputed off disk, got 0075, **reported the disagreement rather than taking the lower number**, and re-ran the branch sweep itself rather than accepting the assignment on trust — finding the same three answers: `main` and every `wip/*` head at 0074, `agent/econ-hardlock-and-recycling` and its `wip/` shadow at 0076, nothing anywhere above 0076. So this is the first case here where the recomputation and the assignment *disagreed* and the recomputation was the wrong one, which is exactly what it is for: it surfaces the question rather than settling it. **0072 is still held**, and 0075 and 0076 are now **rows** rather than the holds this sentence found them as — so the line at 0078 is a ceiling over three holds. Read the table.
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
