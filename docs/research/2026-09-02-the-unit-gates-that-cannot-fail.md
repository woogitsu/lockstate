# The unit gates that cannot fail

**Date:** 2026-09-02
**Branch:** `docs/audit-the-unit-gates-that-cannot-fail`, cut from `origin/main` at `c2755012`
(v0.0.376) in a worktree with `node_modules` symlinked to the main checkout.
**Subject:** `tests/unit/` (218 files) and `tests/integration/` (71 files) — **289 files, 3,567
tests** — the two subtrees `docs/research/2026-09-02-the-gates-that-cannot-fail.md` (`tests/foundation/`
and `tests/determinism/`, 75 files) did not touch.
**Instrument:** `./node_modules/.bin/vitest run <file>` per file, never the whole suite while
mutating. Every mutation restored **by hand** — a deleted probe file/directory, or lines removed
with `head -n -N` / a targeted string replace — and every restoration verified with `sha256sum -c`
against a checksum taken before the mutation, or (where nothing tracked was touched) `git status
--porcelain` returning empty. No `git checkout`, `git stash` or `git restore` was used anywhere in
this branch.

**Four gates demonstrated unable to fail on the defect they name, all four fixed on this branch,
all four re-proven closed by re-running the exact mutation that had survived.** One is structural
(a mathematical tautology, no execution needed to establish it). Beyond those four, this pass leans
harder on structural reading than the prior one and says so in §5 rather than padding the mutation
count.

---

## 0. Two corrections to the brief, and one to the prior note, before anything else

**The brief's premise that unit/integration tests would look like the foundation contracts was
mostly wrong, and that is itself the finding worth stating first.** Of 289 files, only **eleven**
walk a real filesystem directory the way every `tests/foundation/` contract does (§6 lists them);
the rest exercise `src/` through direct function and class calls against literal fixtures, and the
sample read for this note (see §5) found that discipline to be unusually strong — dozens of these
files carry docblocks that name `docs/TESTING.md`'s "fixture supplies both sides" anti-pattern by
name and explain in the file why *this* fixture avoids it (`restore-refusal-reasons.test.ts:10-16`,
`tests/integration/session-save-round-trip.test.ts:38-40`, `tests/unit/hud-projections.test.ts:1367`
among them). **All four findings below live inside the eleven file-walking tests**, which is exactly
where the prior note's method predicted risk would cluster and exactly where it clustered.

**The prior note's own count needs a footnote.** Its title says 75 contracts; `tests/foundation/`
and `tests/determinism/` are read-only architecture, and this note's subject — `tests/unit/` and
`tests/integration/` — is the behavioural half of the suite. `pnpm test` collects five directories
(`docs/AGENT_WORKFLOW.md`, "What the 2026-08-27 session cost", the `vitest run` bullet); together
the two notes now cover
four of them, 364 files. `tests/migrations/` remains unaudited by either.

---

## 1. The four gates, each with the surviving mutation, the fix, and the re-proof

### 1a. `tests/unit/navigation-no-phaser.test.ts` — a walk that never recurses

**Before**, at `origin/main` `c2755012` lines 1–18: `readdirSync(NAVIGATION_DIR).filter((name) =>
name.endsWith('.ts'))` — **not recursive** — with a floor of `files.length > 0` (line 10) against
15 real files.

**Measured.** Baseline: `1 passed (1)`. A new file, `src/simulation/navigation/browser/adapter.ts`,
containing:

```ts
import 'phaser';
export function touchDom(): void {
  document.title = 'probe';
  window.alert('probe');
}
```

— a real offender, sitting one level below `NAVIGATION_DIR` in a subdirectory the flat
`readdirSync` cannot see:

```
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

**Green**, with a file importing Phaser and writing to `document`/`window` inside the tree the
test's own title claims to guard. The same file placed directly in `NAVIGATION_DIR` (no
subdirectory) *is* caught — `1 failed (1)` at line 15 — so the walk's shape, not the regex, is the
hole. Directory restored by deleting it; `git status --porcelain` empty before and after.

**Fixed.** The walk is now the recursive `collectTypeScriptFiles` idiom every sibling boundary test
in this repository already uses (`services-layer-boundaries.test.ts`,
`rendering-module-boundaries.test.ts`, `ui-hud-messages.test.ts`), and the floor moved from `> 0` to
`> 10` against the measured 15. `src/simulation/navigation/` has no subdirectories today, so this
changes behaviour only on the day one is added — which is the day the old version would have
stopped protecting anything.

**Re-proven.** The identical mutation (same file, same content) against the fixed test:

```
 ❯ tests/unit/navigation-no-phaser.test.ts:41:60
   must not touch the DOM
 Tests  1 failed (1)
```

Red at the "must not touch the DOM" assertion. Probe directory deleted again; `git status
--porcelain` empty.

### 1b. `tests/unit/services-layer-boundaries.test.ts` — a floor that survives losing a whole subtree

**Before**, at `origin/main` `c2755012` lines 16–41: `collectTypeScriptFiles` **does** recurse, but
the only anti-vacuity guard on `serviceFiles` (36 real files across four subtrees — `challenges` 5,
`entitlements` 7, `localization` 8, `telemetry` 15 wide) is `serviceFiles.length).toBeGreaterThan(10)`
at line 39.

**Measured**, in two steps, both restored by hand and verified with `sha256sum -c`.

1. Baseline with a real offender appended to `src/services/challenges/evidence.ts`
   (`import 'phaser';` + `document.title = 'probe';`), walk unmutated: **caught**, `1 failed | 12
   passed (13)` at the "must not touch the DOM" assertion.
2. Same offender, walk given one line — `if (entry === 'challenges') continue;` inside
   `collectTypeScriptFiles` — simulating the subtree the walk never enters (five files, dropping the
   corpus from 36 to 31, still comfortably above the `> 10` floor):

   ```
   Test Files  1 passed (1)
        Tests  13 passed (13)
   ```

   **Green**, with the Phaser/DOM offender sitting in the one subtree the walk no longer reaches, and
   every other assertion in the file — the manifest-honesty checks, the I/O allow-list — passing
   because none of them reads `challenges/` either once it is skipped.

**Fixed.** Added a per-subtree anchor (`services/challenges/`, `services/entitlements/`,
`services/localization/`, `services/telemetry/`), each asserted present by `.some()` — the "anchor
inside the corpus" idiom `tests/unit/module-boundary-rules.test.ts:469-470` already uses for
`src/simulation/`. This closes exactly the demonstrated hole without touching the existing floor,
which stays as the coarser first check.

**Re-proven.** Identical two-step mutation against the fixed test:

```
 × reaches every subtree of src/services/, not just enough files to clear the floor above
 AssertionError: src/services/challenges/ is empty or was not reached by this scan
 Tests  1 failed | 13 passed (14)
```

Red, naming the exact subtree the mutation hid. Both files restored by hand (`git status
--porcelain` empty for the test file's probe line removed by string replace; `sha256sum -c OK` for
`evidence.ts`, restored with `head -n -3`).

### 1c. `tests/unit/ui-hud-messages.test.ts` — the same shape, at the architectural boundary it matters most for

**Before**, at `origin/main` `c2755012` lines 357–360: `collectTypeScriptFiles` recurses (both
`src/ui/hud/` and `src/ui/primitives/` are flat today, so recursion is moot in practice), but the
only guards are `hudFiles.length).toBeGreaterThan(4)` (real: 16) and
`primitiveFiles.length).toBeGreaterThan(8)` (real: 18).

**Measured**, same two-step method as 1b, against the highest-stakes rule this pass found: the "HUD
must not import the simulation" test (`AGENTS.md` boundary 1, the rule the whole architecture rests
on — "rendering is not simulation").

1. `import { createNewSimulationRuntime } from '../../simulation/runtime/new-session';` appended to
   `src/ui/hud/status-strip.ts`, walk unmutated: **caught**, `1 failed | 11 passed (12)` at "must not
   import the simulation".
2. Same offender, walk given `if (entry > 'l') continue;` (drops 9 of 16 HUD files including
   `status-strip.ts` itself, plus part of `primitives/`; both counts stay above their floors):

   ```
   Test Files  1 passed (1)
        Tests  12 passed (12)
   ```

   **Green.** A HUD module directly constructing a live simulation runtime — the exact defect
   `AGENTS.md` boundary 1 and #206 (cited in this file's own docblock, line 25) exist to forbid —
   passes the file that is supposed to be this repository's executable statement of that boundary.

**Fixed.** Same idiom as `tests/unit/ui-save-panel-status.test.ts:299-302` (already in this
repository, for the top-level `src/ui/` modules): both directories' module names are now written out
as literals (`HUD_MODULE_NAMES`, `PRIMITIVE_MODULE_NAMES`) and `hudFiles`/`primitiveFiles` are
asserted to match those lists **exactly** (sorted basenames, `toEqual`), which catches losing *or*
gaining any file, not just the specific subtree this mutation happened to drop.

**Re-proven.** Identical two-step mutation against the fixed test:

```
 ❯ tests/unit/ui-hud-messages.test.ts:415:59
   - "label-parameters.ts", "messages.ts", "projection.ts", "regime-panel.ts",
   - "rooms-panel.ts", "staff-panel.ts", "status-strip.ts", "tool-arming.ts", "view-model.ts",
 Tests  1 failed | 12 passed (13)
```

Red, naming every one of the nine files the shrunk walk dropped, `status-strip.ts` among them. Both
files restored by hand and verified: `sha256sum -c OK` for `status-strip.ts` (removed with
`head -n -2`), test file's probe line removed by string replace, `git status --porcelain` empty.

### 1d. `tests/unit/ui-orchestration-boundaries.test.ts:587` — a tautology, proven without touching the repository

**Before**, at `origin/main` `c2755012` line 587:

```ts
expect(allUiFiles.length).toBe(orchestrationFiles.length + allUiFiles.filter((entry) => subtreeOf(entry) !== undefined).length);
```

`orchestrationFiles` is defined two lines earlier (line 129 of the file) as
`allUiFiles.filter((entry) => subtreeOf(entry) === undefined)` — the exact complement of the
predicate on the right-hand side of this line. **Partitioning any array by a boolean predicate and
summing the two parts always equals the whole array's length, for every array, including an empty
one.** This needs no mutation to establish; it is arithmetic:

```js
node -e "
const arr = [];
const pred = x => x.subtree === undefined;
console.log(arr.length === arr.filter(pred).length + arr.filter(e => !pred(e)).length); // true
const arr2 = Array.from({length: 66}, (_, i) => ({subtree: i % 3 === 0 ? undefined : 'x'}));
console.log(arr2.length === arr2.filter(pred).length + arr2.filter(e => !pred(e)).length); // true
"
```

Both print `true`. No offender, no mutation and no shrinkage of the real `src/ui/` tree can ever
make this assertion fail — it holds of every possible value `allUiFiles` could take, which is the
brief's "assertion on a value the test itself wrote with no independent derivation" archetype in its
purest form: `allUiFiles` is the test's own data, split by the test's own predicate, summed back to
itself.

**It costs the file nothing beyond the line itself.** The real coverage checks in the same `it`
block — `ungated.toEqual([])` (line 577, every file not accounted for by a named subtree) and the
per-subtree floor (`GATED_ELSEWHERE`, line 585) — are independent and load-bearing; the `account`
subtree (`GATED_HERE`) has its own real floor further down the file (`byFile.length,
'the account subtree is empty or was renamed').toBeGreaterThan(3)`, line 630). This one assertion is
dead weight inside an otherwise sound test, not a hole in the file's actual coverage.

**Fixed.** Replaced with a real, independently-derived floor on the corpus itself:
`expect(allUiFiles.length, '…').toBeGreaterThan(50)` against the measured 66, with a comment
recording why the old line was removed rather than merely reworded.

**Re-proven** in the sense a tautology can be: the replacement floor is not a partition of its own
input, so it is a real assertion — confirmed by the fact that `find src/ui -name "*.ts" | wc -l`
(66) and the floor (50) are two independently obtained numbers, unlike before.

---

## 2. Verification, this branch, after all four fixes

`git status --porcelain` on this branch touches exactly four files, all in `tests/unit/`, no
`src/` change:

```
 tests/unit/navigation-no-phaser.test.ts        | 34 +++++++++++++--
 tests/unit/services-layer-boundaries.test.ts   | 19 +++++++++
 tests/unit/ui-hud-messages.test.ts             | 58 +++++++++++++++++++++++++-
 tests/unit/ui-orchestration-boundaries.test.ts |  9 +++-
 4 files changed, 114 insertions(+), 6 deletions(-)
```

Full suite, idle box, run once as `tests/unit tests/integration` together (never mixed with a
mutation run):

```
 Test Files  289 passed (289)
      Tests  3569 passed (3569)
```

(3,567 at the start of this pass, +2 for the two new `it` blocks §1b and §1c added.) Both typecheck
projects clean: `tsc -b --pretty false` and `tsc -b tsconfig.tools.json --pretty false`, exit 0,
zero output.

**One contention false-red, diagnosed rather than waved through**, exactly as
`docs/AGENT_WORKFLOW.md` requires. An earlier full-suite run (while this session was also running
mutation probes) reported:

```
 FAIL  tests/integration/contended-shower-fairness.test.ts … Error: Test timed out in 5000ms.
 FAIL  tests/unit/prisoners-sentence.test.ts … Error: Test timed out in 5000ms.
 Test Files  2 failed | 287 passed (289)
```

`ps -eo etime,args | grep -E "[p]laywright/test/cli|[v]itest" | grep -v "bash -c"` returned nothing
(no contending suite), and both files pass alone: `prisoners-sentence.test.ts` — `7 passed (7)`,
3.05s; `contended-shower-fairness.test.ts` — `4 passed (4)`, 9.81s. `prisoners-sentence.test.ts` is
one of the three canaries the brief names; `contended-shower-fairness.test.ts` is not on that list
and is added here as a fourth data point for the same shape — a fixed-scenario concurrency test with
a real clock, timed out by this session's own mutation runs competing for CPU, not by an assertion.

---

## 3. What the earlier audit's method looked like when the corpus doesn't do directory walks

`docs/research/2026-09-02-the-gates-that-cannot-fail.md` names two archetypes as central:
self-referential controls and vacuous walks. Reading 289 files that mostly do not walk a directory
at all sharpened what those two mean here, restated from what was actually found rather than from
the brief's hypothesis:

- **The self-referential-control archetype was hunted hard and found once, and it was already
  closed.** `docs/TESTING.md:519` documents `tests/unit/hud-projections.test.ts` asserting
  `riot.requiredResponders` against `runtime.incidentResponseSystem.requiredResponderCount(8)` — the
  exact method the projection calls internally — as vacuous, fixed to a literal `4` at what is now
  `hud-projections.test.ts:1375` with the comment `// A literal, not
  runtime.incidentResponseSystem.requiredResponderCount(8)` naming what it used to be. The
  nearby-looking case in the same file (`strip.counts.activeIncidents` against
  `runtime.incidents.openIncidents().length`, `hud-projections.test.ts:213`) is a different shape —
  the actual comes from a projection function, the expected bypasses it and reads the source
  directly, which is a real plumbing cross-check, not a comparison of a function against itself
  (traced against `src/simulation/presentation/status-strip-projection.ts:815,876`; full grep for
  the general shape, and how far it was traced, is §6).
- **The vacuous-walk archetype is exactly where it was in `tests/foundation/`, for the same
  structural reason.** Every one of §1's four findings is a directory scan; every well-engineered
  scan in this corpus (`module-boundary-rules.test.ts`, `input-module-boundaries.test.ts`,
  `simulation-message-keys.test.ts`, `ui-save-panel-status.test.ts`) uses one of the two closing
  moves the prior note names — an anchor naming a specific real file or subtree, or an exact-set
  comparison — and the four that did not are exactly the four this note fixes.
- **A form the prior note did not have room to name: a detector that only matches one valid syntax
  of the thing it forbids.** `rendering-module-boundaries.test.ts:82`'s
  `/from ['"]phaser['"]/i` (shared, near-verbatim, by `services-layer-boundaries.test.ts:64`,
  `navigation-no-phaser.test.ts:40` (post-fix line; the rule itself, not this pass's walk fix, is
  what carries the gap) and `ui-hud-messages.test.ts:428`) matches `import Phaser from
  'phaser'` and misses a bare `import 'phaser';` — measured on `rendering-module-boundaries.test.ts`:
  appending `import 'phaser';` (no binding) to `src/rendering/assets/direction.ts` left the file
  `3 passed (3)`; the same file with `import Phaser from 'phaser';` instead failed at line 82.
  Restored by hand both times (`head -n -2`; `sha256sum -c OK`). **Reported, not fixed**: it is
  narrower than §1 (a side-effect-only Phaser import is an unusual thing to write, and every real
  offender used in this pass's other mutations used the `from` form and was caught), it recurs in
  four files rather than one, and widening a shared regex is exactly the kind of assertion-strength
  change `docs/AGENT_WORKFLOW.md` §3 says to make as a decision rather than a drive-by. The fix, if
  taken, is one pattern — `/(?:^|[^.\w])import\s+(?:type\s+)?(?:['"]phaser['"]|[\s\S]*?from\s+['"]phaser['"])/i`
  or simpler, splitting the "any import of the literal specifier `'phaser'`" check from an import
  statement parser already present in `tests/helpers/module-boundaries.ts` (`findImports`), which
  `module-boundary-rules.test.ts` already uses for cross-tree dependencies and does not have this
  gap.

---

## 4. The eleven file-walking tests, all examined

| test | walk shape | anti-vacuity guard | verdict |
| --- | --- | --- | --- |
| `navigation-no-phaser` | flat, non-recursive | `length > 0` (15 real) | **VACUOUS-WALK, mut, FIXED** §1a |
| `services-layer-boundaries` | recursive | `length > 10` (36 real, `services`); same for `simulation` (178 real) | **VACUOUS-WALK, mut, FIXED** (`services` only) §1b |
| `ui-hud-messages` | recursive (flat trees today) | `length > 4` / `> 8` (16 / 18 real) | **VACUOUS-WALK, mut, FIXED** §1c |
| `ui-orchestration-boundaries` | recursive | `ungated.toEqual([])` (real, independent) + per-subtree floor (real) + the tautology | **TAUTOLOGY at :587, proven, FIXED**; rest of file SOUND |
| `rendering-module-boundaries` | recursive | `construction.scannedFiles === sources.length` (identity, real) + `sources.length > 10` (37 real) | SOUND (**mut**, identity guard holds); regex gap §3, not fixed |
| `input-module-boundaries` | flat (10 real, no subdirs) | `construction.scannedFiles === inputFiles.length` (identity) + `length > 8` (10 real) + set cross-check (`report.unlisted`/`stale`/`mismatched`) | SOUND (**read**) — floor near-measured, model tier |
| `module-boundary-rules` | recursive | `length > 50` (191 real) + two named-path anchors (`runtime/new-session.ts`, `runtime/restore-session.ts`) + construction-site positive control | SOUND (**read**) — the anchor idiom §1b now borrows |
| `ui-save-panel-status` | flat top-level `src/ui/` | exact `toEqual([...MODULES].sort())` against a literal list | SOUND (**read**) — model tier, no floor at all |
| `ui-design-tokens` | recursive (CSS) | `length >= 3` (5 real stylesheets) + `BADGE_TONES.length >= 6` real constant, own vacuity comment | SOUND (**read**) |
| `simulation-message-keys` | recursive, two roots | floor **at the measured value when written** (`>= 141` vs 191 today) + stripper-fidelity floors + own docblock naming the exact risk | SOUND (**read**) — will loosen with corpus growth, flagged in its own comments already |
| `services-telemetry-transport` | flat (`.github/workflows/`, genuinely flat by convention) | `length > 0`, explicit `'no workflows were scanned; this would pass vacuously'` comment | SOUND (**read**) — no subdirectory risk exists for this root |

Four of eleven fixed. Six read SOUND with a real guard identified in each case (an identity check, a
set cross-check, an exact list, or a floor within single digits of the measured corpus). One
(`simulation-message-keys`) is sound today and will drift the way `docs/AGENT_WORKFLOW.md` §4
predicts prose tallies drift — not fixed, because raising a floor to the current count is a policy
call about how much slack CI should have, not a vacuity fix, and the file's own docblock already
names the risk in words.

---

## 5. Coverage outside the eleven, and what was not mutation-tested

**289 files total. Eleven were mutation-tested** (§1, §3, §4's `rendering-module-boundaries` row).
**Roughly 30 more were read in full** against the brief's four shapes, chosen for blast radius —
determinism and persistence format (`canonical-json`, `entity-id-unsigned`, `entity-liveness-codec`,
`run-length-codec-unification`, `world-projection`, `persistence-save-schema`,
`persistence-save-schema-aliasing`, `xoshiro128starstar`, `session-save-round-trip`,
`session-restore-failure`), player-visible refusals and economic invariants
(`restore-refusal-reasons`, `simulation-refusals`, `economy-money-conservation`,
`economy-liquidity-hard-lock`, `economy-insolvency-ladder`, `incident-trigger-reachability`), and a
handful the automated triage below flagged as loose-ratio outliers (`contraband-intelligence`,
`navigation-work-budget-and-cache`, `laundry-work-and-empty-blocks`). None of the ~30 showed a shape
from the brief's list; several explicitly cite `docs/TESTING.md`'s anti-patterns by name in their own
docblocks and reason about why they avoid them. **These are READ verdicts, not MEASURED ones** — no
mutation was run against production code for any of them, in the same sense the prior note's §6
marks its `read` rows weaker than its `mut` rows.

**The triage method for the remaining ~248 files was structural, not exhaustive reading.** A script
counted, per file, occurrences of loose assertions (`toBeGreaterThan`, `toBeLessThan`, `toBeTruthy`,
`toBeDefined`, `toBeCloseTo`) against exact ones (`toEqual`, `toBe`, `toStrictEqual`,
`toMatchObject`) and ranked all 289 by the ratio; the top two
(`contraband-intelligence.test.ts`, `incident-trigger-reachability.test.ts`) were read individually
and are the two named in the "~30 read in full" list above, not a separate batch — the ranking was
used to prioritise which files got the full read in §5's first paragraph rather than as a pass of
its own. Targeted greps ran across the full 289 for two specific shapes named in the brief — a bound computed from the
same variable it is compared against (`toBeGreaterThan\([a-zA-Z_.]+\.length` and the `- N` epsilon
form) and a partition-sums-to-total tautology (§1d's exact pattern, grepped for siblings and found
none) — both returned only the instances already discussed above. **This does not establish that the
remaining ~248 files are clean; it establishes that the specific shapes named in the brief, searched
for by pattern, did not turn up elsewhere.** A file that hides a self-referential control behind
variable renaming or an extra layer of indirection would not be caught by either grep, only by
reading — and reading all 289 in the depth §1 needed was not done.

**`tests/integration/economy-money-conservation.test.ts` (154 expects, 1,600+ lines) was read but
not exhaustively re-derived**, on the judgment that its own docblock (quoting balance ledgers to the
minor unit at every step, e.g. `session start: balance=25000 … total=25000`) and its practice of
comparing `getTopEdge()` — a real world query, independent of whatever computed the wall — rather
than a flag the test itself set, put it in the same tier as `session-save-round-trip.test.ts`. That
is a read judgment, weaker than a mutation, and it is the largest file in either directory this note
did not mutation-test.

---

## 6. My weakest claim, and what would change my mind

**The weakest claim in this note is §5's structural sweep of the ~248 files neither mutated nor read
in full.** It is real evidence — two targeted greps across the whole corpus, a loose-ratio ranking,
and thirty files read for the brief's shapes with zero hits — but it is not a mutation, and the prior
note's own §2 exists precisely because two files that read clean on inspection failed a mutation.
**I would expect at most one or two more findings among the ~248**, and the place I would look first
is any test whose "expected" side calls into the same runtime object its "actual" side was built
from. A grep for that literal shape (`\.toBe\(\s*\w+\.\w+\.\w+\(` and the `toEqual` variant) returned
34 hits across 16 files. Three files carrying most of the weight were individually traced back to
their production source and found to be real cross-source checks rather than a comparison of a
function against itself: `hud-projections.test.ts` (six hits — `strip.counts.activeIncidents` is
compared against a *direct* call to `runtime.incidents.openIncidents()`, bypassing the projection
under test, not the same call site the projection itself uses internally, confirmed against
`src/simulation/presentation/status-strip-projection.ts:815` (the source call) and `:876` (where it
lands in the published counts)); `session-save-round-trip.test.ts`
(nine hits, all `restored.X` against `runtime.X`, which is a real save/load round trip through
`saveAndLoad()`'s JSON serialize-then-`restoreSimulationRuntime` — not the same object — and the
file's own docblock at lines 38-40 names the vacuous form and says why this file avoids it); and
`incident-trigger-reachability.test.ts` (one hit, `second.incidents.all()` against
`first.incidents.all()`, two separately-run scenarios rather than one scenario compared to itself).
**The other twelve files carrying this shape were not individually traced**, including seven with
exactly one hit each in the list above (`navigation-region-graph`, `actor-identity`,
`prisoners-safety-coverage-system`, `prisoner-release-completeness`, `prisoners-intake-system`,
`contraband-search-duty` has two, `furnished-cell-loop`, `object-removal-loop`,
`incident-response-restore`, `security-default-sector`, `object-placement-loop` has two) — of these,
`staff-dismissal.test.ts:219` and `contended-canteen-substitution-cost.test.ts:327-328` are the two
I would look at first, on no stronger basis than that they were not gotten to.

**What would change my mind about the eleven-file scope claim in §0**: a `readFileSync`/`readdirSync`
pair inside a file whose name gives no hint of scanning a directory, found by neither `grep -rl
"readdirSync"` (run, eleven hits, all listed in §4) nor by the word "walk" (also run, but that grep
returns dozens of false positives from prose like "the actor walks" and was not usable as a filter,
only as a first pass that was then read past).

**What would not change my mind**: a green suite, which is what all eleven files gave before this
pass touched them, and the entire subject of both notes.
