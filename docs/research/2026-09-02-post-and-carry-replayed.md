# Post, route and carry: replaying the two 2026-09-02 surfaces on a fresh worktree

Dated evidence for the brief that asked whether a player can see (1) a guard
walk after ADR 0088/0092's ground and (2) the two-authorities incoherence
ADR 0093 was written to settle. Neither question is new today — both were
already answered, exhaustively, by
[`2026-09-02-playing-what-landed-today.md`](./2026-09-02-playing-what-landed-today.md)
and [`2026-09-02-where-a-guard-stands.md`](./2026-09-02-where-a-guard-stands.md)
for (1) — so this record does not repeat their acts. It does two things those
do not: it independently re-runs one of their acts on a separate worktree cut
from `origin/main` (v0.0.372, `b2941064`) to confirm the finding still holds,
and it plays the carry side, which neither existing record does.

Tiers follow `docs/research/README.md`: **VERIFIED** (opened and read/run),
**REASONED** (derived from VERIFIED facts), **UNKNOWN**.

## 1. Guard walking — independently re-run, VERIFIED, matches the existing record exactly

`tests/browser/playtest-2026-09-02-what-landed-today.playtest.ts`'s "act 1" was
run standalone on this worktree, checked out fresh from `origin/main`, not
edited:

```
LOCKSTATE_BROWSER_TEST_PORT=5341 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-02-what-landed-today.playtest.ts -g "act 1"
```

Result: `1 passed (57.6s)`. Four guards hired from the Staff panel (Security
tab → Hire), roster sampled for 400 ticks (270→679, 90 row reads), render
delta sampled in parallel (330 publications):

```
[act1] phases seen: [["Unassigned",{"count":90,"firstTick":270,"lastTick":659}]]
[act1] guard 0: 278 delta sample(s), 0 with a non-zero velocity, 0 not on a tile centre
[act1] guard 1: 263 delta sample(s), 0 with a non-zero velocity, 0 not on a tile centre
[act1] guard 2: 248 delta sample(s), 0 with a non-zero velocity, 0 not on a tile centre
[act1] guard 3: 234 delta sample(s), 0 with a non-zero velocity, 0 not on a tile centre
[act1] every distinct tile any guard was ever published on: ["16,16"]
```

Matches the merged record's act 1 (zero velocity, one tile, `Unassigned` the
whole window) to the sample. **Confirmed rather than assumed: hiring a guard
today produces no motion a player can see**, for the reason both existing
records already give — every hire lands exactly on the derived post tile
(`src/main.ts:618`'s `(16,16)` and `deriveDefaultSecuritySectorPostTile`
agree, ADR 0036 decision 2's deliberate coincidence), so `beginDeployment`'s
`isAtPost` fast path never requests a route.

**One question the brief asked that neither existing record states this
plainly: does the Staff panel say why?** Read off the same run, the full panel
text a player sees after four hires:

```
STAFF
GUARD COVERAGE
0 of 0
Covered
This prison has the guards it asks for.
WHO TO HIRE
Guard
Selected
Hire Guard · 80
Costs 80 now and 80 a day in wages.
A new guard starts unassigned.
ON DUTY
0 held · 4 free
Nobody is assigned right now.
A released guard stays hired and goes back to the pool.
ON THE PAYROLL
320 a day
Guard · Unassigned  [Dismiss] (×3, "and 1 more")
```

No sentence anywhere on the panel mentions a post, a location, a route or
movement. **No, nothing says why** — the panel's vocabulary for a guard's
state is entirely about duty (`Unassigned`/`On Post`/`On Search`/`Held`), never
about place. A player who watches nothing happen has no in-game text that
would tell them a guard is, in fact, standing exactly where the game intends.
This is consistent with ADR 0092 §10 owed-sentence list, none of which is
about idle standing specifically — it is a gap the existing corpus did not
name in these words.

Nothing above is new evidence; it is the same finding, reproduced on a
separate checkout to satisfy this session's own brief to play rather than
read. **Both existing records are trustworthy**: the two independently
measured — `2026-09-02-where-a-guard-stands.md` in a synthetic session that
hand-authors a `patrolRoute` (2,392/3,000 ticks walking, 74 on-time loops) and
`2026-09-02-playing-what-landed-today.md` in ordinary play (zero walks across
7,945 guard records) — agree with each other and with this pass. **No HUD
tool to set a post or route exists** (confirmed again: the Security tab has no
control besides Hire/Dismiss/Release; ADR 0092 is entirely `Proposed`, nothing
in it is implemented, `git log --oneline -- src/ | head` on this worktree
shows no commit citing #815 or "sector redefine").

## 2. The carry incoherence — played for the first time, and it cannot be reached

ADR 0093 and `tests/foundation/two-authorities-one-prisoner-contract.test.ts`
describe a real incoherence: a prisoner mid-shift in a real kitchen, handed one
carry job, ends up teleported to the drop-off tile while `prisoners.actions`
still records them as `performing` the kitchen job, holding its seat, and
being fed by it. The brief asked whether a player can see this happen from
their side of the screen — a prisoner visibly jumping, or being in two places
at once on two panels.

**VERIFIED, by grep and by running the pinned test rather than by reading the
ADR's own claim on trust:**

```
$ grep -rn "submitCarryItem\|jobWorkers.register\|JobWorkerPool" src/ --include=*.ts | grep -v '\.test\.'
src/simulation/runtime/new-session.ts:45:  … JobBoard, JobSystem, JobWorkerPool …
src/simulation/runtime/new-session.ts:272:  readonly jobWorkers: JobWorkerPool;
src/simulation/runtime/new-session.ts:520:  const jobWorkers = new JobWorkerPool();
src/simulation/operations/job-system.ts:24:export class JobWorkerPool {
src/simulation/operations/job-system.ts:87:    private readonly workers: JobWorkerPool,
src/simulation/operations/job.ts:106:  public submitCarryItem(input: SubmitCarryItemJobInput, ...
src/simulation/prisoners/job-worker-adapter.ts:12: * … `JobWorkerPool.register` …
src/simulation/prisoners/release.ts:32:/** Dropping a departing prisoner from the job labour pool. …
```

Every hit is a declaration, a wiring point inside `createNewSimulationRuntime`
(which builds a `JobSystem`, an empty `JobBoard` and an empty `JobWorkerPool`
into every session unconditionally — `new-session.ts:860`), or a comment.
**Zero occurrences of `jobWorkers.register(` or `jobs.submitCarryItem(` outside
`tests/`.** No command handler in `src/main.ts`, no button, no UI control, no
save-restore path and no other system ever puts a prisoner into the pool or a
job on the board. `JobSystem` runs at order 260 in every real session (its
constructor call is unconditional) and does nothing every tick, forever,
because there is never anything for it to do — a live system with no possible
input in the shape of any session a player can produce through the app.

`tests/foundation/two-authorities-one-prisoner-contract.test.ts` reaches the
incoherence only by calling `runtime.jobWorkers.register(...)` and
`runtime.jobs.submitCarryItem(...)` directly against the `SimulationRuntime`
object — APIs a test file can reach because it holds the runtime instance, and
a player cannot, because nothing in the shipped app exposes them. Re-ran the
test standalone to confirm current status: `1 passed` (3.63s,
`tests/foundation/two-authorities-one-prisoner-contract.test.ts`), unedited.

**So: the defect ADR 0093 was written to fix is real in the engine and
provably absent from every session a player can start.** This corrects the
implicit premise in the brief that a player might be able to witness it —
tried, and the honest answer is that there is no gesture, sequence of panel
presses, or save file a player produces through ordinary play that can put a
prisoner into `JobWorkerPool` or a job onto `JobBoard`. This matches, and is
re-confirmed on today's `main`, what
[`2026-08-30-two-subsystems-with-no-entrance.md`](./2026-08-30-two-subsystems-with-no-entrance.md)
already established about the whole operations/jobs substrate before ADR 0093
existed: `#25`'s own introducing commit calls it *"a substrate, not a
feature"*, and nothing shipped since has changed that for the carry job kind
specifically. ADR 0093 §"Ground truth" makes the identical claim
(`submitCarryItem` "one occurrence under `src/`, its declaration") for v0.0.364;
this pass re-verifies it for v0.0.372 (`b2941064`), three releases later, unchanged.

**What this means for the brief's request to look for a visible jump or a
two-panel contradiction**: there is currently no fixture reachable through the
Staff, Rooms, Regime or Build panels, at any tick, that puts a prisoner in
this state. Nothing to look at. Not a negative result about ADR 0093 — the ADR
says as much about itself (*"Proposed... nothing below is implemented"*) — but
a positive, played result about today's build: **a player cannot currently
witness the incoherence the contract test pins**, only an agent with direct
runtime access can produce it. That is worth recording plainly because a
future reader of ADR 0093 might otherwise wonder whether the bug it fixes is
one players are hitting today; they are not, and cannot.

## 3. Weakest claim, and what would change my mind

**§2's claim rests on a grep plus one test run, not an exhaustive audit of
every panel gesture and every save-restore path.** A hidden trigger — a
debug/cheat command, a migration from an old save format that once wrote
`jobWorkers`, or a locale/dev-only control gated out of the production build —
would falsify it. Checked and found none: `grep -rn "jobWorkers" src/save
src/ui` returns nothing, and `save-schema.ts`'s own carry-job fields (noted in
`job.ts`'s docblock) exist for forward-compatibility, not because anything
writes them today. What would change my mind: a `git log -S'jobWorkers.register'
-- src/` hit outside this pass's grep window, or a save-migration test that
seeds a non-empty `JobWorkerPool` from an old snapshot. Neither was found;
named as the check that would overturn this, not performed exhaustively.

## What was not reached

- Whether *any* future HUD control for carries (there is none yet) would make
  §2 reachable — out of scope, nothing to play.
- ADR 0092's restore bug (a hand-edited save's `postTile`/`patrolRoute` reverts
  silently) was not re-played here: it needs a save file mutated by hand, and
  there is no HUD control that could produce that state through play either,
  so it is exactly as unreachable by a player as §2's finding, for the same
  underlying reason (no producer). Already measured by
  `2026-09-02-where-a-guard-stands.md`; not re-run.
- A run that gets a spare guard genuinely off-post and then presses Release in
  the same session (§9's own named weakest claim in
  `2026-09-02-playing-what-landed-today.md`) — not attempted here either; it is
  that record's open item, not this pass's.

## Reproduction

Worktree `/workspace/wt-playtest2`, branch
`playtest/2026-09-02-post-and-carry`, cut from `origin/main` at `b2941064`
(v0.0.372). `git lfs checkout` run before any browser act. §1's command is
above, verbatim; §2's grep and test invocation are both quoted verbatim above.
