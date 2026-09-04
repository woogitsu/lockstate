# What this project should do next, and why the readiness audit is answering a different question

**Date:** 2026-09-04
**Tree:** worktree `research/what-to-do-next-for-a-beta`, cut from `origin/main`
at `c9e3e279` (v0.0.459). `git lfs` smudge active, so the actor atlases in this
worktree are real image data rather than pointers (§2.8).
**Question put:** the external readiness audit *"Audyt gotowości LOCKSTATE do
grywalnej bety"* (2026-09-04, taken at `main` @ `c9e3e279`, v0.0.459)
recommends freezing scope for one sprint and stabilising. Does that follow from
the evidence in this repository, or is it advice that would fit any project?

Nothing in `src/` was changed. No player-visible sentence is authored here;
strings are quoted only as evidence, from the tree, to establish what a reader
would find. Recommendations that fall inside the owner's four exclusions are
labelled as the owner's in §4 and nowhere acted on.

---

## 1. The verdict, in one paragraph

**The audit's central recommendation does not follow from this repository's
evidence, and I recommend against adopting it as stated.** It is not wrong
about anything important being unfinished; it is wrong about *which* thing, and
the error is systematic rather than incidental. Every one of its headline gates
is an *engineering-hygiene* gate — crash, save corruption, migration coverage,
determinism, performance budgets, keyboard reachability, protected `main`,
clean branches. **This repository is already unusually strong on exactly that
axis and unusually weak on the axis the audit never measures.** It carries 396
test files, 27 dedicated determinism tests including session replay and
snapshot-restore fidelity, a tested `v1 → v5` save-migration chain, 250- and
1,000-actor navigation benchmarks, and foundation contracts that gate the CI
configuration itself against its own known failure modes (§2). Meanwhile the
repository's own playtesting — not mine, the record in issue #604 and the
2026-09-03 play-driven research note — measured that a correct prison banks
money monotonically, that full staffing costs **3.3 %** of the income it
protects at the wage-band floor, that **all eighteen event types are bad news,
undo, or recovery** so nothing a player does right is ever acknowledged, and
that a cell with no doorway is accepted, counted, reported complete, and dead
while the one sentence a player gets is identical either way. **Those are not
stability defects. Freezing scope does not fix any of them, and a sprint spent
on the audit's gate list would leave the game exactly as unfun as it is now,
with a greener dashboard.**

**What the evidence supports instead:** the next sprint should close the
**truthfulness and acknowledgement gap in what the game already does** — which
is a subset of the audit's item 4 and its single genuinely load-bearing
recommendation — and then answer **one balance question the owner has to
answer**, namely whether the prison is ever allowed to be in trouble. The
audit's own diagnosis contains this sentence: *"The project needs stabilisation
of the existing game, not more systems."* **I agree with that sentence and
disagree with its implementation.** Stabilising the existing game here means
making the existing game *legible and honest*, not making the pipeline greener.

**The sharpest single reason to distrust the audit's calibration:** three of
its factual premises are checkably wrong or already closed, and it recommends
action inside three of the owner's four reserved areas without noting that any
reservation exists (§2, §4). An audit that mis-states the branch inventory,
misses fifteen merges, and does not know which of its P0 items are already in
flight is not a document to set a sprint by. **It is, however, a good defect
list, and §5 keeps three of its items.**

### Is it generic consulting advice?

**Yes, and this is testable rather than a matter of tone.** Take the audit's
headline gate list and ask of each item whether it was derived from something
only visible in *this* repository. Zero of nine are. "No known P0/P1 for
crash / data loss / save corruption / hardlock", "migration-tested saves",
"performance budgets", "keyboard-only core loop", "protected `main` with
required checks", "fresh-clone build on a clean runner" — that list is
transferable verbatim to any browser game, and it *was* transferable, because
the audit did not open the tree far enough to find that six of the nine already
have machinery. By contrast the four findings that actually distinguish this
project — the 3.3 % staffing cost, the eighteen bad-news event types, the
doorless room, the four answered-but-unread `hud/*` routes — appear nowhere in
the audit and all four came out of *playing the game*. **The repository's own
method (`docs/AGENT_WORKFLOW.md`, and the standing directive to find defects by
playing) has outperformed the audit on its own subject.** That is the finding.

**Where the audit is right, and it matters:** its *class* argument about
command feedback (§3) identifies a real, recurring, expensive seam, and it
identified it from the issue titles alone. Its instinct is good. Its proposed
cure is the part to refuse.

---

## 2. The load-bearing claims, re-checked

Only the claims the direction depends on. Each was opened, run, or measured in
this worktree at `c9e3e279` (v0.0.459).

| # | Claim | Verdict |
| --- | --- | --- |
| 2.1 | Audit: *"over 100 and at most 200 branches"* | **CONFIRMED — and the brief that corrected it was wrong** |
| 2.2 | Brief: *"~348 branches held by the citation guard"* | **REFUTED** |
| 2.3 | Brief: *"branch GC is blocked by the proxy and needs the owner's machine"* | **REFUTED — it ran four times on 2026-09-03** |
| 2.4 | Brief: no linter or formatter exists | **CONFIRMED** |
| 2.5 | Brief: three CI jobs share a fork guard; a skipped required check counts as satisfied | **CONFIRMED, and sharper than stated** |
| 2.6 | Audit: `main` is unprotected | **UNVERIFIABLE HERE** |
| 2.7 | Audit: stability gates (migrations, determinism, perf) are open | **REFUTED as stated — six of nine have machinery** |
| 2.8 | Brief: LFS smudge is configured, worktrees get real bytes | **CONFIRMED** |
| 2.9 | Brief: #950 landed | **REFUTED — open** |
| 2.10 | #604: economy applies no pressure | **CONFIRMED** |
| 2.11 | #604: a doorless room is accepted and says the same sentence | **CONFIRMED (one citation has drifted)** |

### 2.1 / 2.2 — the branch inventory: the audit is right, my brief is not

`git ls-remote --refs --heads origin` returns **158** heads. The audit's range
(*"over 100 and at most 200"*) contains that number. **The audit is correct and
the correction I was given is not.**

The `~348` figure is real but it is **not a branch count**. It is the
`DELETE-SAFE` bucket from
[`./2026-09-02-classifying-475-branches.md`](./2026-09-02-classifying-475-branches.md),
whose §2 table reads `475 = 41 KEEP + 348 DELETE-SAFE + 86 REVIEW` — 348 is the
number of branches that were **provably safe to delete** out of 475 then
present. It was carried into the brief as the number *held*, which inverts it.

**And 158 overstates the human backlog.** By prefix:

```
80 wip     21 agent   15 claude   13 fix    9 docs
 6 feat     5 playtest  4 measure   1 each: test research rescue main chore
```

The 80 `wip/*` refs are machine snapshots pushed every three minutes by
`scripts/wip-sweep.sh` (the mechanism `AGENTS.md` requires so a dying session
loses nothing). They are a safety net, not clutter. **The real named-branch
inventory is 78, of which 6 are open pull requests.** "Clean the branches" is
close to done, and what remains is small enough not to be a sprint item.

### 2.3 — branch GC is not blocked; it has already run

`.github/workflows/branch-gc.yml` exists on `main` at `c9e3e279`, and its
header documents why it had to be written: this repository squash-merges, so
the older `delete-branches.yml` reachability test *"no longer finds anything"* —
measured in that file's own comment at v0.0.388 as `ancestors of origin/main: 2`
against `head of a merged pull request, tip unmoved since the merge: 363`.

The GitHub Actions API reports **four completed `workflow_dispatch` runs of
Branch GC, all `conclusion: success`, all triggered by the owner on
2026-09-03** — runs 1 and 2 at 01:07 and 01:08 (`f36148d7`, v0.0.393), run 3 at
03:28 (`2e4e61a6`, v0.0.397), run 4 at 06:46–06:53 (`d0957d6b`, v0.0.401). Run
4 took **6 min 52 s**, which is the shape of a run that deleted a great many
refs.

**475 heads on 2026-09-02 → 158 today is that work, and it is finished.** Not
blocked, not needing the owner's machine, not a sprint item. The audit's
"clean branches" recommendation and my brief's blocker are **both stale in the
same direction.**

### 2.4 — no linter, no formatter

No `.eslintrc*`, `.prettierrc*`, `biome.json`, `oxlint`, or `dprint` config
exists at the repository root, and `package.json`'s `scripts` block contains no
`lint` or `format` entry. `docs/ROADMAP.md`'s Phase 0 line says so in the tree's
own words: *"toolchain, strict typing, test/build CI (there is no linter or
formatter in this repository)"*. **CONFIRMED.** It is a deliberate recorded
absence, not an oversight, which changes what adding one would mean.

### 2.5 — the fork guard, and why "turn on required checks" is worse than useless naively

**Confirmed, and the repository knows more about this than the audit does.**

All three jobs in `.github/workflows/ci.yml` carry the identical guard —
`verify` at `:73`, `assets` at `:315`, `browser` at `:444`:

```yaml
if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository
```

and they chain `assets: needs: verify` (`:318`) and `browser: needs: assets`
(`:455`). So a fork pull request produces **three skipped jobs**. GitHub treats
a skipped required status check as satisfied. **Therefore switching on required
checks over these three job names, on its own, converts the fork guard from a
protection into a bypass: a fork PR would show three green-equivalent required
checks having run nothing.** My brief's suspicion is correct.

Two refinements the brief did not have, both of which matter to the
recommendation:

- **The deploy path is already independently defended.** `ci.yml:56-66` says in
  its own comment that skipping every job *"does NOT establish that such a run
  cannot deploy: that depends on what GitHub reports as the run's `conclusion`
  when all of its jobs were skipped, which nothing in this repository
  establishes"* — and so `deploy.yml`'s `staging` job tests
  `workflow_run.event` and `workflow_run.head_repository.full_name` itself.
  `tests/foundation/ci-configuration-contract.test.ts:1607` and `:1614` gate
  that requirement with a failure message spelling out the whole chain. So the
  exposure is **not** "a fork can publish to lockstate.io". It is narrower:
  "required checks, if enabled naively, would report a fork's PR as verified".
- **The guard is contract-enforced per job, and the contract knows its own
  parser can lie.** `ci-configuration-contract.test.ts:1698` is a
  `describe('fork pull request execution contract')` requiring the exact `if:`
  line on every job, and `:1769` records that a job header spelled unusually
  would be appended to the previous job's block and *"this contract stays green
  about it, which is the whole failure mode the pattern above records measuring
  three times."*

**Consequence for the direction.** The audit's "protect `main` with required
checks" is the one deploy-configuration item worth doing, **and it must not be
done as stated.** Required checks here need a job that cannot skip — a
non-`needs` gate job with `if: always()` that fails when its dependencies were
skipped on a fork — or the protection must require review rather than checks.
Choosing between those is the owner's (§4), and it is decision **O-2** in the
summary.

### 2.6 — `main` protection status

**UNVERIFIABLE HERE.** Reading `GET /repos/{owner}/{repo}/branches/main/protection`
requires admin scope on a private repository and I have no evidence this
session's token carries it; I did not attempt a write. The claim that
protection is off is recorded in the #116 triage carried into issue #604 and I
have no reason to doubt it, but I did not obtain it and I am not reporting it as
obtained.

### 2.7 — the stability gates are largely already built

This is the check that moves the verdict, so it is itemised. Counted in this
worktree at `c9e3e279`:

- **396 test files** (`find tests -name '*.test.ts' | wc -l`).
- **`tests/determinism/` holds 27 tests**, including `session-replay.test.ts`,
  `snapshot-restore-fidelity.test.ts`, `kernel-static-restore-boundary.test.ts`,
  `save-rng-stream-compatibility.test.ts`, `rng-stream-isolation.test.ts`,
  `canonical-iteration-contract.test.ts` and
  `ambient-nondeterminism-contract.test.ts`.
- **`tests/migrations/` holds 7 tests** covering every step and the full chain:
  `save-v1-to-v2`, `save-v2-to-v3`, `save-v3-to-v4`, `save-v4-to-v5`,
  `save-v1-to-v5-chain`, plus `save-v4-room-bounds` and
  `save-v5-negative-balance`. `src/persistence/save-schema.ts:36` declares
  `SAVE_SCHEMA_VERSION = 5`.
- **Actor-tier benchmarks exist at the audit's own numbers.**
  `benchmarks/scenarios/navigation-production.mjs:337` records *"(1.45 s of game
  time) at 250 actors and 114 (5.7 s) at 1,000"*, and
  `benchmarks/scenarios/navigation-actor-tiers.mjs:307` sets the smoke tier at
  `operationsPerIteration: 250`.
- **CI runs a real browser suite and separately runs the built client**
  (`ci.yml:602` *"Run the real-browser suite"*, `:656` *"Build the production
  client"*, `:672` *"Run the built client in a browser"*), and the `assets` job
  fetches LFS art and asserts it decoded (`:373` *"Confirm the runtime art is
  image data, not LFS pointers"*, `:516` *"Assert the environment sheets
  decoded"*).

**So of the audit's nine headline gates, six already have the machinery they
ask for** — migration-tested saves, determinism, the two actor budgets, the
fresh-clone/LFS/asset validation on a runner, and the built-artifact browser
run. What is genuinely open is: the persistence UI matrix (in flight as #950,
§2.9), UI truthfulness on destructive actions (in flight as #951/#952, §3),
keyboard-only reachability (#928 records that a finished wall is keyboard-only
in the *other* direction — the mouse cannot remove it), and protected `main`
(§2.5, §4). **REFUTED as stated**, and the residue is four items rather than
nine — which is a sprint's worth of finishing, not a sprint's worth of freeze.

### 2.8 — Git LFS

**CONFIRMED exactly as the brief states.** `git-lfs/3.4.1` is installed;
`filter.lfs.smudge` is `git-lfs smudge -- %f`. In this worktree
`public/assets/actors/actor.cook.base.idle.png` is **444,053 bytes** of image
data; the same path in the primary checkout `/workspace/lockstate` is **131
bytes** beginning `version https://git-lfs.github.com/spec/`. The audit's
reading is right about the primary checkout and stale about worktrees.

### 2.9 — today's wave: which of the audit's P0 items have moved

**#950, #951 and #952 are all OPEN, not landed.** `list_pull_requests` returns
exactly six open pull requests at the time of writing: **#952** (`#942`, a run
of presses is a run), **#951** (`#945`, removing a standing object says the
money is gone), **#950** (`#943`, a new prison keeps the old one), **#949**
(playtest: every money mistake has a route back), and the two long-standing
drafts **#812** and **#355**. My brief lists #950 among what landed; it has
not. **REFUTED**, and it matters, because #950 is the audit's persistence-matrix
P0 and its status is "in review", not "closed".

What *has* landed since v0.0.451 (`0e614c71`), by merge commit on `main`:
**#931** (`5bf5f232`), **#929** (`0c82ca33`), **#932** (`bbe2d063`), **#939**
(`c47e2f1f`), **#940** (`72684714`), **#946** (`fc1dc018`), **#947**
(`984c32fa`), **#948** (`e33d4cb7`). So the audit, taken at v0.0.459
(`c9e3e279`), post-dates all eight and reflects none of them in its defect
list — including **#932**, which is one of the three issues its central
refactor argument is built on (§3).

### 2.10 — the economy applies no pressure

**CONFIRMED by arithmetic, from the constants.**

- `src/simulation/economy/income.ts:115` —
  `export const STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS = 300;`
- `src/simulation/security/sector-staffing.ts:147` —
  `export const DEFAULT_SECTOR_PRISONERS_PER_GUARD = 8;`
- `src/content/staff-role-catalog.ts:150` —
  `wageBand: { minPerDay: 80, maxPerDay: 140 }`

Eight prisoners gross `8 × 300 = 2,400` per day and require one guard at
`80`–`140` per day. **Full staffing is 3.3 % of the income it protects at the
band floor and 5.8 % at its ceiling.** Issue #604's most recent comment records
that wages are the only recurring cost of four `SpendClass` members and that
*"the treasury rose monotonically in every measurement including through five
uncontained assaults."* I did not re-run that measurement; the arithmetic that
explains it is confirmed above and is sufficient to establish the direction.

**One correction to the handover on this point:** it states the figure as
3.3 % without noting it is the *floor* of a band. At the ceiling it is 5.8 %.
The conclusion is unchanged and the range is worth carrying.

### 2.11 — the doorless room

**CONFIRMED, with one drifted citation.** `src/simulation/rooms/enclosure.ts:76`
reads *"So a `'sealed'` answer no longer implies \"no way in\""*, and
`src/simulation/navigation/traversal.ts` states in the same docblock that *"any
non-zero value with no registered door is an impassable wall"*. The single
player-visible string is
`'hud.rooms.enclosure-sealed': 'Walled in on every side'` — **at
`src/content/default-locale-en.ts:2022`**, not `:1792` as issue #604 records it.
The fact holds; the line moved, because that file grew today. This is exactly
the rot the corpus already has a name for (*"pinning does not stop rot, it makes
rot diagnosable"*), and it is the reason I re-opened rather than quoted.

---

## 3. The `CommandOutcome` refactor: right about the problem, wrong about the cure, and not now

The audit proposes one typed outcome and one translator:

```ts
type CommandOutcome =
  | { kind: "applied"; effects: PlayerVisibleEffect[] }
  | { kind: "refused"; reason: RefusalReason }
  | { kind: "no-op";   reason: NoOpReason };
```

on the grounds that #927, #932 and #945 are the same class.

**My recommendation: do not adopt this. Adopt the third of it that is missing,
by extending a mechanism the repository already has, and do not draft an ADR
for it until #951 and #952 have merged.** Reasons, in descending weight.

### 3.1 Two of its three arms already exist, and one of them exists in a better form

**`refused` is built, and the audit's version is a regression.** The protocol
already exports `RefusalReason` and `SimulationRefusal`
(`src/simulation/protocol/index.ts:33`, `:35`). `REFUSAL_REASONS` in
`src/simulation/protocol/types.ts` holds **41 members**, and its docblock at
`:1206` states the design:

> Declared in ascending code-unit order, and namespaced by the command the
> refusal answers, so the twelve vocabularies behind it cannot collide

and then explains why a flat union would be wrong:

> `out-of-bounds` and `unowned-land` are members of *two* of those domain
> vocabularies, `insufficient-funds` and `invalid-area` are each a member of two
> others, and `duplicate-order` is a member of *three* (`build.*`,
> `place-object.*` and `purchase.*`), and each means something different to a
> player depending on which command it answers, so one flat id per spelling
> would put one sentence on several.

**The audit's `reason: RefusalReason` is precisely the flat union that comment
exists to refuse.** Adopting it would put one sentence on several commands —
which is a *new* instance of the exact defect class the audit is trying to
close.

**And the translator it asks for is already there and already exhaustive.**
`src/simulation/refusals/refusal-log.ts` declares **twelve**
`Readonly<Record<DomainRefusalReason, RefusalReason>>` tables —
`BUILD_REFUSAL_REASONS:195`, `CONSTRUCTION_FUNDING_REFUSAL_REASONS:223`,
`ADMIT_REFUSAL_REASONS:239`, `HIRE_REFUSAL_REASONS:254`,
`PLACE_OBJECT_REFUSAL_REASONS:278`, `REMOVE_OBJECT_REFUSAL_REASONS:305`,
`PURCHASE_REFUSAL_REASONS:310`, `PURCHASE_CANCEL_REFUSAL_REASONS:340`,
`RELEASE_GUARD_REFUSAL_REASONS:368`, `DISMISS_STAFF_REFUSAL_REASONS:399`,
`ZONE_REFUSAL_REASONS:419`, `UNZONE_REFUSAL_REASONS:440`. Because each is a
total `Record`, **a reason added to any of the twelve fails to compile until it
is named in the protocol vocabulary**, and
`tests/unit/simulation-refusals.test.ts` asserts the twelve tables cover the
41-member list exactly in both directions — so a member produced by nothing
fails too.

**That is the audit's "one translator to events and UI", already built, already
compile-enforced, on the refusal half.** The lesson to take from it is the
*enforcement shape*, not the union shape.

**And the per-command outcome union already exists twelve times over.**
`grep 'export type [A-Za-z]*Outcome' src/simulation/` returns twelve:
`RemoveObjectOutcome` and `PlaceObjectOutcome`
(`src/simulation/objects/object-placement-service.ts:273`, `:284`),
`ZoneRoomOutcome`/`UnzoneRoomOutcome` (`src/simulation/rooms/zoning.ts:266`,
`:315`), `PurchaseOutcome`/`PurchaseCancelOutcome`
(`src/simulation/economy/procurement.ts:98`, `:127`), `ConstructionUndoOutcome`
(`src/simulation/construction/system.ts:107`), `StaffDismissOutcome`
(`src/simulation/staff/dismissal.ts:249`), `StaffHireOutcome`
(`src/simulation/staff/hiring.ts:101`), `AdmitPrisonerOutcome`
(`src/simulation/prisoners/prisoner-operations-runtime.ts:58`),
`GuardReleaseOutcome` (`src/simulation/security/guard-release.ts:68`), plus
`ConstructionUndoSpendOutcome` (`src/simulation/events/event-log.ts:49`).

`RemoveObjectOutcome` is already a **three-arm** union with a `kind`
discriminant — `RemoveObjectRemoved | RemoveObjectOrderCancelled |
RemoveObjectRefusal` — and its arms carry domain payload the audit's generic
`PlayerVisibleEffect[]` cannot type: `RemoveObjectOrderCancelled:267` declares
`orderId`, `objectId` and `anchorTile`. **The audit proposes replacing twelve
precisely-typed unions with one loosely-typed one. That is a net loss of
compile-time information, and the information it loses is the information the
refusal tables use to stay exhaustive.**

### 3.2 The `applied` arm is real, and the union is not what would fix it

The audit's genuine finding is that **success is silent** — and that half is
under-built. It also has a name in the tree already:
`tests/integration/command-success-notices.test.ts` exists, and its header
attributes it to issue #749 and the owner's ruling of 2026-09-01, quoting the
measurement: *"Cancel on a queued build order, Cancel on a delivery, Undo and
Redo all say nothing when they succeed. The only feedback was a row vanishing
from a fold that starts collapsed. The money was exactly right; the player had
no way to know that without doing the arithmetic themselves."*

**But the mechanism of the recurrence is route coverage, not type shape, and
#951 says so in its own words.** #951's new `recordObjectRemoved` docblock
(`src/simulation/events/event-log.ts`, branch
`fix/945-removing-a-standing-object-says-so`) states why #932 did not already
fix it:

> It survived #932, which made `Undo` and `CancelBuildOrder` state-aware,
> because a standing object reaches neither: `ObjectPlacementService.remove`'s
> first arm goes to `PlacedObjectRegistry.remove` and never to
> `ConstructionSystem.cancelOrder`.

**That is a missing call on a third route, not a missing type.** A
`CommandOutcome` union does not prevent it: a route that forgets to return an
outcome is exactly as silent as a route that forgets to record an event. What
prevents it is the property `refusal-log.ts` already has — *a total mapping that
does not compile until the new case is named.*

**#951 also argues explicitly against unifying these arms**, and it is the best
evidence available because it is the author of the third fix reasoning about the
second:

> **No discriminator, unlike `recordConstructionUndone` above, and that is a
> fact about the route rather than a simplification.** That method splits two
> sentences because an undo reverses orders in states that differ in whether
> money comes back. This one has nothing to split […] A future removal that gave
> something back would be a second event type […] and not a second arm here.

So #932 needed a discriminator (`ConstructionUndoSpendOutcome =
'nothing-destroyed' | 'spend-destroyed'`, `event-log.ts:49`) and #951 needed
none, **because the two routes differ in what is true of them.** The audit's
claim that the three issues are "the same class" is right about the *symptom*
(silence on success) and wrong about the *cause* (three distinct call routes
with three distinct truths). A single union would have to carry the union of
all their payloads and would be checked at no site.

### 3.3 ADR 0003 decision 9 blocks the `applied` arm where the audit puts it

`src/simulation/protocol/types.ts` already has a `commandResultMessageSchema`
(`:527`) whose payload is a two-arm discriminated union: `queued` (`:509`) and
`rejected` (`:518`). The docblock above `REFUSAL_REASONS` explains that this is
deliberate:

> `SimulationWorkerStateMachine.handleSubmitCommand` has already answered
> `status: 'queued'` by then, and ADR 0003 decision 9 is explicit that the
> queued acknowledgement "never reports a command as applied": this vocabulary
> is what the simulation says instead.

**So `applied` cannot join the command-result message without overturning ADR
0003 decision 9**, because the ack is sent at submission and application
happens later, at the command's tick, inside the worker. The audit's union
implicitly assumes a synchronous outcome the architecture does not have. That is
not a detail — it is the reason the success channel is the *event log* rather
than the ack, which is where #932 and #951 both correctly put their fixes.

### 3.4 Is it right *now*? No — and there is a cheap reason

**#951 and #952 are open.** Refactoring the seam three fixes went through, while
two of the three are unmerged, guarantees a conflict on files both touch. #932
and #951 already overlap on **five files**: `src/content/default-locale-en.ts`,
`src/simulation/events/event-log.ts`, `src/simulation/protocol/types.ts`,
`src/ui/simulation-events.ts`, `tests/integration/command-success-notices.test.ts`.
A third change rewriting those is the worst possible third change to have open.

**And there is a free measurement waiting.** The recurring-five-file pattern is
the audit's best evidence, and it currently has n = 2 landed plus 2 in flight.
Merging #951 and #952 costs nothing extra and turns n = 2 into n = 4 — including
#952, whose own title says its author's *"diagnosis of the trigger was wrong"*,
which is precisely the kind of datum that decides whether the class is one
abstraction or four routes. **Deciding after that evidence arrives is cheaper
and better than deciding now, and it is what the mandate's "decide after
research" actually asks for.**

### 3.5 What I recommend instead, and what it would cost

**Do not build `CommandOutcome`. Build the success half of what
`refusal-log.ts` already is:** a closed, namespaced vocabulary of
*player-visible success facts*, with one total `Record` per producing domain, so
that a new command route — or a new arm on an existing `*Outcome` — **fails to
compile until it has declared what it tells the player, including declaring
that it tells them nothing.** That is the property that would have caught #945
before a player found it, and it is the only property in the audit's proposal
that is actually load-bearing.

**Cost.** Medium and mostly mechanical: one vocabulary beside `REFUSAL_REASONS`
in `src/simulation/protocol/types.ts`; one module beside
`src/simulation/refusals/refusal-log.ts`; twelve total `Record`s, most of whose
entries are an explicit "silent, and here is why"; one mirror test on
`tests/unit/simulation-refusals.test.ts`'s pattern; and no change to any
`*Outcome` union, no change to `commandResultMessageSchema`, and no change to
ADR 0003. **What it would break:** nothing at runtime — it adds a compile
obligation rather than moving a value. The real cost is that every existing
route must be classified once, and a route whose truth is unclear stops the
build until somebody opens it. **That is the cost being bought, not a side
effect.**

**Does it need an ADR? Yes.** It closes a vocabulary that the protocol layer
owns, it takes a position against a proposal an external audit made, and ADR
0087 already governs the neighbouring question of whether a refusal is an event
or a condition — so this decision has to say how it relates to 0087 rather than
drift beside it. **I recommend the ADR be drafted after #951 and #952 merge, not
before**, for the n = 4 reason in §3.4. **I am not drafting it, I am not
numbering it, and no status word in this note is an approval:** a number is
reserved only by a row in `docs/adr/README.md`, and acceptance is the owner's.

---

## 4. What is not ours to decide

Listed explicitly, and separated. `AGENTS.md` reserves four things; **the audit
recommends action inside three of them and does not mention that any
reservation exists.**

### Reserved to the owner — recommend only, never act

| # | The audit's item | Which reservation | Status |
| --- | --- | --- | --- |
| 1 | Branch protection on `main`; required status checks | **3 — deploy configuration** | **THE OWNER'S.** And §2.5 shows the naive form is a bypass, so this needs a design choice, not a switch. Decision **O-2**. |
| 2 | The CSP change and rate limiting | **3 — deploy configuration** (`public/_headers`) | **THE OWNER'S.** Nothing in this repository can read back what the Cloudflare dashboard holds, so a change there cannot be verified here. |
| 3 | Artifact promotion between environments | **3 — deploy configuration** (`.github/workflows/deploy.yml`) | **THE OWNER'S.** |
| 4 | Migration testing and failure injection against the database | **2 — `supabase/migrations/`** | **THE OWNER'S.** Note `tests/migrations/` already covers the *save* schema `v1 → v5` (§2.7); the reserved surface is the Supabase migrations, which is a different thing the audit conflates with it. |
| 5 | Any second server route or server behaviour beyond ADR 0046's telemetry ingest | **1 — server-side execution surface** | **THE OWNER'S.** The 2026-09-03 release covers one `main` and one Worker module carrying that ingest and nothing else. The ingest still cannot store anything until the `telemetry_events` table, its insert function and its least-privilege role land under reservation 2. |
| 6 | Whether the prison is ever allowed to be in trouble (§2.10) | **not a reservation — a product decision** | **THE OWNER'S by kind, not by rule.** Balance is a design choice the mandate's "decide after research" does not reach, because there is no correct answer to research. Decision **O-1**. |

### Ours to decide, under the standing mandate

- **Whether to adopt `CommandOutcome`** (§3) — an architecture question with a
  researchable answer. Decided above: no, and here is the alternative. It needs
  an ADR, which is *drafted* by us and *accepted* by the owner.
- **The wording of every sentence in §5's work** — released 2026-09-04, *"the
  choice of words is ours now; the requirement that a sentence be TRUE is not."*
  So: verify, then write; record each string in the commit and the pull request
  body so the owner's later harmonising pass is one reading.
- **Which of the audit's residual gates to close, and in what order** (§5).
- **Whether to add a linter** (§2.4) — ours, and my answer is **not now**: it is
  a recorded deliberate absence, it would touch every file in the tree, and
  three agents are live. It is the cheapest possible thing to do and the least
  valuable, which is the combination that makes it attractive for the wrong
  reasons.

**Explicitly not decided by me anywhere in this note:** no ADR status word
moved, no ADR number claimed, no branch deleted, no pull request opened, no
player-visible string authored.

---

## 5. What to do next, in order, and why each precedes the next

**On estimates: I agree with the brief and disagree with the audit.** The audit
offers *"6–10 weeks with 2–3 people, 12–18 solo"*. This repository has no
velocity history anyone can honestly estimate from — its work is done by agents
in parallel bursts, thirteen merges landed in one day on 2026-09-04, and the one
measured datum about capacity in the corpus is a *concurrency cap* (two agents
per workflow on a four-CPU container), not a throughput. **The audit's hour and
week figures are its own assumption imported from human team norms, and I would
not repeat them.** The list below is ordered by dependency, not by duration.

1. **Merge #950, #951 and #952.** *First because everything else in this list
   either conflicts with them or is evidence-starved without them.* #950 is the
   audit's own persistence P0. #951 and #952 sit on the five-file seam §3.4
   describes, and merging them is what turns the `CommandOutcome` question from
   n = 2 into n = 4.
2. **Then, and only then, draft the success-vocabulary ADR** (§3.5). *Second
   because §3.4's measurement has to exist first, and because the ADR's whole
   job is to say why the audit's union was refused — an argument that is weaker
   without #952's "my diagnosis was wrong" datum in it.*
3. **Then fix the doorless room (#938).** *Third because it is the one confirmed
   defect where the code tells the player something false* — `'Walled in on
   every side'` renders identically for a reachable room and a dead one
   (§2.11) — *and because reservation 4's release makes the sentence ours to
   write now, so it is unblocked for the first time.* It is also the cheapest
   large gain in truthfulness: the diagnostic already exists
   (`ActionMetrics.unmetDemandCycles`) and has no projection.
4. **Then answer decision O-1 — is the prison ever allowed to be in trouble?**
   *Fourth because it is the owner's and it gates everything after it.* At
   3.3–5.8 % staffing cost (§2.10) no amount of UI work makes a monotonically
   rising treasury interesting. **Nothing below this line is worth starting
   until it is answered**, which is the real argument against the audit's
   sprint: the audit would spend that sprint without ever asking this.
5. **Then close the acknowledgement gap** — all eighteen event types are bad
   news, undo, or recovery, so nothing a player does right is ever
   acknowledged. *Fifth because step 2 gives it the vocabulary to be built
   against and step 4 decides what is worth acknowledging.*
6. **Then, separately and in parallel, put decision O-2 to the owner** —
   protected `main`, in a form that is not the bypass §2.5 measures. *Parallel
   because it touches no source file and blocks nothing above it.*

**Deliberately not on this list, and why:** freezing scope (nothing in §2 shows
scope-widening is what is hurting); a linter (§4); cleaning branches (already
done, §2.3); building migration or determinism harnesses (already exist, §2.7);
the `CommandOutcome` refactor as proposed (§3).

---

## 6. My weakest claim, and what would change it

**The weakest claim is §1's central inversion — that this project's binding
constraint is playability rather than stability — because I did not play the
game.** Every playability finding I rely on (the monotonic treasury, the
eighteen bad-news event types, the doorless room's behaviour, the four unread
`hud/*` routes) is *someone else's measurement*, taken from issue #604's most
recent comment and the 2026-09-03 play-driven note. I confirmed the **constants
and the strings** those findings rest on — the 300, the 8, the 80–140 band, the
two enclosure docblocks, the single locale key — and that is enough to establish
that the arithmetic permits the conclusion. **It is not the same as having
watched a treasury rise.** I also did not re-run the incident measurement, and
§2.11 already shows one citation in that source had drifted a line, which is a
reminder that the source is a session note rather than a gate.

**What would change it:** one playtest of an hour of game time, at
`c9e3e279` (v0.0.459) or later, that shows a prison **losing** — treasury
falling, or a fail state reached without deliberately sabotaging the prison.
If that exists, the economy already applies pressure, item 4 of §5 collapses,
and the audit's stability-first ordering becomes much more defensible, because
the thing I claim is missing would be present and the thing it claims is missing
would be all that is left. The 2026-09-03 play-driven note — which lives on branch
`research/what-to-build-next` and is **not yet on `main`**, so it is named here
rather than linked — reports the opposite in its §6 (+1,640 per day for four
consecutive days), but that was measured at `ab0bab5b` (v0.0.426) and thirty-odd
releases have landed since.

**A second, smaller weakness:** §2.6 is unverified. If `main` turns out to be
protected already, the audit is wrong about one more thing and item 6 of §5
disappears — but nothing above it moves.

---

## 7. Where the brief I was given was wrong

Recorded because `AGENTS.md` says correcting the brief is the job.

1. **"~348 branches held by the citation guard" — wrong, and it made the audit
   look wrong when the audit was right.** 348 is the `DELETE-SAFE` bucket of a
   475-branch classification, not a count of branches held. The live count is
   **158**, which is inside the audit's stated range (§2.1, §2.2).
2. **"Branch GC is blocked by the proxy and needs the owner's machine" —
   wrong.** `branch-gc.yml` ran four times on 2026-09-03, owner-dispatched, all
   green, and the branch inventory fell from 475 to 158 as a result (§2.3).
3. **"#950 (a new prison keeps the old one)" listed among what landed —
   wrong.** #950 is open, together with #951 and #952 (§2.9).
4. **The fork-guard trap was understated in one direction and overstated in
   another.** It is real for required checks (worse than the brief says, because
   the guard is contract-enforced per job so all three *will* skip together),
   but the *deploy* path it implies is already independently defended in
   `deploy.yml` and gated by `ci-configuration-contract.test.ts:1607`/`:1614`
   (§2.5).
5. **Confirmed as given, with thanks:** no linter or formatter (§2.4); the LFS
   framing (§2.8); that today's wave is not in the audit (§2.9); and that the
   audit recommends action inside three reservations (§4).

---

*Method note: `git ls-remote`, the Actions API and `find`/`grep` counts were run
in this worktree at `c9e3e279` (v0.0.459); every `file:line` above was opened.
Where a number came from someone else's session it is attributed in place and
marked as not re-obtained (§2.10, §6).*
