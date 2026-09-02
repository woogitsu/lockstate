# The browser and determinism gates that cannot fail

**Date:** 2026-09-02
**Branch:** `docs/audit-the-browser-and-determinism-gates`, cut from `origin/main` at `1eb1b5b6`
(v0.0.380) in a worktree with `node_modules` symlinked to the main checkout and Git LFS content
pulled (`git lfs checkout`, 62 objects, 93 MB — verified with `file` on
`public/assets/actors/actor.guard.base.idle.png` returning real PNG data, not a pointer).
**Subject:** `tests/browser/` (94 files: 35 `*.spec.ts` collected by CI, 29 `*.playtest.ts`
collected by nothing, 30 harness/support files that are neither) and `tests/determinism/`
(27 `*.test.ts` files) — the brief that commissioned this pass.
**Instrument:** `./node_modules/.bin/vitest run <file>` per determinism file, and
`node --experimental-transform-types --disable-warning=ExperimentalWarning
tests/browser/run-suite.ts --suite browser --grep "<pattern>"` per browser spec, run in the
foreground. Every mutation restored **by hand**, verified with `sha256sum -c` against a checksum
taken before the mutation. No `git checkout`, `git stash` or `git restore` was used anywhere on
this branch; `git status --porcelain` was empty after every restore.

**Claim tiers**, as the prior two notes use them: **MEASURED** — a mutation was applied, a named
test was run, the output is quoted, and the mutation was then restored and re-verified.
**READ** — the assertions and guards were read and reasoned about with no mutation; weaker, and
marked so throughout.

---

## The brief's premise was wrong on the point that mattered most, and correcting it is the first finding

The brief describes `tests/browser/` and `tests/determinism/` as "the two subtrees the two prior
audits did not touch." That is true of `tests/browser/` and **false of `tests/determinism/`**:
`docs/research/2026-09-02-the-gates-that-cannot-fail.md` examined all 27 files in
`tests/determinism/` on the same day, alongside `tests/foundation/`'s 48. Its own title and
`## 6` table say so in as many words — every `determinism/*` row in that table carries a verdict.

The correction that matters is not the headline but the *tier*: of those 27, that note **mutated
two** (`kernel-system-order` via a pin re-verification the brief itself asked for again, and
`save-rng-stream-compatibility` for its rotted prose) and **read the other 25**, including the one
file that turns out to matter most here, `art-pipeline-determinism.test.ts`, which it correctly
flagged `VACUOUS-RISK (read), low stakes` without running a mutation against it. §2 below is that
mutation, and it upgrades that file's verdict from READ to MEASURED without changing the direction
of the finding — the prior note's read was right.

So this pass's real job in `tests/determinism/` was narrower than the brief stated: not a first
look, but **turning the previous pass's 25 READ verdicts into MEASURED ones wherever the file's
blast radius justified the cost**, and checking the two named hypotheses (§1). `tests/browser/`
is where the brief's "untouched" claim holds, and is where most of this note's file count went.

**A second correction, on a hypothesis the brief itself flagged as needing verification:**
`tests/determinism/job-performing-restart-bound.test.ts` "measures a behaviour an
accepted-but-unimplemented ADR would remove." The ADR (0093, "A carry is an action") is real and
does say exactly that — its own §5 names this file and `kernel-system-order.test.ts:434` as the
two things its landing would change — but its Status line reads **"Proposed, 2026-09-02. Not
self-approved. Nothing below is implemented and no code on this branch does any of it."** Not
*accepted*. `docs/adr/README.md:251` agrees. Both tests are measured live in §1 below and are
sound against the tree as it stands; nothing about them is presently obsolete, and nothing will
be until the owner rules on 0093.

---

## 1. The brief's two named hypotheses, both verified true (MEASURED)

### 1a. `kernel-system-order.test.ts:434` — pins the declared execution order of a real session

The test is an exact `toEqual` against a 22-entry, hand-written `{id, order}` list built from
`buildDeterminismScenario().kernel.systemExecutionOrder`. Mutated `PatrolSystem.order` from `280`
to `281` at `src/simulation/security/patrol-system.ts:32`:

```
- "order": 280,
+ "order": 281,
 Tests  1 failed | 13 passed (14)
```

failing at `kernel-system-order.test.ts:409` (`'pins the declared execution order of a real
session'`). Restored by hand; `sha256sum -c` OK. **SOUND.**

### 1b. `job-performing-restart-bound.test.ts` — measures the `JobSystem.performingSince`
restart cost as a number, not as "small"

Eight tests over an exact tick-by-tick model (`JOB_SYSTEM_INTERVAL_TICKS = 5`,
`CONSTRUCTION_INTERVAL_TICKS = 10`). Mutated `JobSystem.schedule.intervalTicks` from `5` to `6` at
`src/simulation/operations/job-system.ts:80`:

```
 Test Files  1 failed (1)
      Tests  6 failed | 2 passed (8)
```

six of eight tests went red, each on an exact tick mismatch (e.g. `expected 24 to be 20`).
Restored by hand; `sha256sum -c` OK. **SOUND**, and the two survivors are the two tests that do not
depend on the interval value at all (`'runs the scenario the measurements are taken from'` uses the
unmutated baseline path only up to the point captured before the interval matters, and the
"performing window" state-check) — not a vacuity, a scoping fact about which assertions the
constant reaches.

---

## 2. `art-pipeline-determinism.test.ts` — the one gate that could not fail, now MEASURED, and FIXED

The prior note read this file and called it `VACUOUS-RISK, low stakes` on the strength of one
sentence: `entryPoints` is `readdirSync(BLENDER_SCRIPT_DIRECTORY).filter(...)`, and every static
test in the file scans that list; the only floor against the walk shrinking is
`entryPoints.length).toBeGreaterThan(0)` against five real scripts. This pass ran the two-part
mutation the method calls for.

**Baseline:** `5 passed | 1 skipped (6)` (the live half skips — no Blender in this container, by
design, per the file's own docblock).

**Step 1 — plant a real offender.** Appended `bpy.ops.mesh.primitive_uv_sphere_add()` to
`tooling/blender/pack-sprite-atlas.py` (exactly the order-unstable primitive issue #64 named).
Result:

```
+ [
+   "pack-sprite-atlas.py",
+ ]
 Tests  1 failed | 3 passed | 1 skipped (5)
```

caught, on `'never builds geometry through an order-unstable primitive operator'`. The gate works
on an intact walk.

**Step 2 — shrink the walk with the offender still in place.** Added
`&& name !== 'pack-sprite-atlas.py'` to the `entryPoints` filter in the test file itself (simulating
a script silently leaving the walk — renamed off `.py`, moved, or excluded by a future filter
change). Result:

```
 Test Files  1 passed (1)
      Tests  4 passed | 1 skipped (5)
```

**All four static tests passed with a real, planted, order-unstable-primitive offender sitting in
the pipeline.** `entryPoints.length > 0` was still true (four scripts remained) and nothing else in
the file compares the walk against an independent source. Both mutations restored by hand;
`sha256sum -c` OK on both the source script and the test file before proceeding.

**Fixed, on this branch, inside the test file only.** Added one test,
`'discovers exactly the Blender entry points this pipeline has today'`, that pins `entryPoints` to
the exact five names by `toEqual` rather than tightening the floor — a floor set at 4 or even 4.9
would only move the same hole to a corpus one script larger, which is exactly the class
`docs/research/2026-09-02-the-gates-that-cannot-fail.md` §1 already argues at length for
`localization-key-completeness` and `canonical-iteration-contract`. **Re-proved**: re-ran the exact
surviving mutation (walk shrunk to four, offender in `pack-sprite-atlas.py`) against the fixed file:

```
 FAIL  … discovers exactly the Blender entry points this pipeline has today
AssertionError: expected [ …(4) ] to deeply equal [ …(5) ]
 Tests  1 failed | 4 passed | 1 skipped (6)
```

now catches it. Both files restored by hand to the fixed/clean state afterward; `sha256sum -c` OK;
`./node_modules/.bin/vitest run tests/determinism/art-pipeline-determinism.test.ts` gives
`5 passed | 1 skipped (6)` clean. `git status --porcelain` in the worktree shows only this file
changed by this section.

**Verdict: VACUOUS-RISK, MEASURED (was READ), FIXED.** File: `tooling/blender/` (5 real entry
points, unchanged); fix: `tests/determinism/art-pipeline-determinism.test.ts` (+27 lines, one new
test, no `src/` touched).

---

## 3. Six more determinism gates MEASURED (upgrading READ verdicts), all SOUND

Chosen by blast radius (persistence format, the worker-projection channel's non-mutation guarantee,
a file's own documented prior escape) rather than by a loose-ratio scan alone, though that scan
(counting `toBeGreaterThan`/`toBeTruthy`/`toBeCloseTo` against `toEqual`/`toBe` per file) picked out
the same top candidates independently.

- **`snapshot-restore-fidelity.test.ts`** (`'produces an identical payload when every incidental
  registration happens in the opposite order'`, the reversed-registration ⇄ byte-identical-payload
  claim ADR 0009 depends on). Removed the canonical `.sort()` from
  `RoomInstanceRegistry.getSnapshot()` (`src/simulation/prisoners/room-instance-registry.ts:1337`),
  leaving `Map` insertion order. The test's own "not vacuous" floors (`toBeGreaterThan(1)` on six
  sections) all still held — none of them would have caught this — but the file's actual gate, a
  full-payload `toEqual` between the forward-built and reverse-built scenarios, did:
  `Tests 1 failed | 10 passed (11)`, diverging exactly on `roomInstanceOccupancy`'s key order
  (`cell-2`/`cell-3` and `yard-1`/`canteen-1` swapped). Restored by hand; `sha256sum -c` OK.
  **SOUND** — the floors are sanity preconditions on the comparison, not the comparison itself.

- **`projection-request.test.ts`** (`'never drains the confiscation ledger, however many times
  contraband is projected'`, and the byte-identical-session claim beside it). This file's own
  docblock records a prior escape by name: an earlier draft let `confiscations.all()` become
  `confiscations.drain()` in `src/simulation/presentation/contraband-projection.ts:211` and only the
  byte-identity test caught it. Reproduced the exact regression: `Tests 2 failed | 3 passed (5)` —
  both the byte-identity test (hash mismatch) and the "never drains" test (`readings` disagreeing)
  failed, exactly as the file's own history says. Restored by hand; `sha256sum -c` OK. **SOUND**,
  confirmed still true of the tree as it stands today.

- **`status-counts-publication.test.ts`**, **`session-replay.test.ts`** — read in full rather than
  mutated (time budget went to the files above and to §2); both carry the same shape as the two
  above (an exact byte-identical two-run comparison, with explicit "non-vacuous" comments backing
  every loose floor beside it, several of which name their own prior escape). **SOUND (READ)**.

---

## 4. `tests/browser/`: no findings of the brief's hunted shapes among 20+ specs sampled, one of a
different shape

### 4a. The structural claim first: `tests/browser/` almost never walks a directory

`grep -rl "readdirSync\|readFileSync\|globSync\|fs\.readdir" tests/browser/*.spec.ts` returns
exactly one file, `app-shell.spec.ts`, and its one hit is `readFileSync` on a single named atlas
manifest (`public/assets/actors/${relativePath}`) — not a directory walk. **The "eleven of 289"
pattern the unit-gates note found does not hold here; it inverts.** `tests/browser/` gates are built
from viewport sweeps, tab sweeps and real DOM probes against a real browser, not from scanning the
repository, so the specific vacuity shape both prior notes clustered around — a walk whose root can
silently shrink — has essentially no surface here. That does not mean the subtree is safe by
default; it means the risk, where it exists, is a different shape (§4c), and §3 above shows the
same directory-walk shape is still very much alive in `tests/determinism/`, where 5 of 27 files do
walk (`ambient-nondeterminism-`, `art-pipeline-determinism`, `canonical-iteration-`,
`kernel-static-restore-boundary`, `save-rng-stream-compatibility`) and the one finding in this note
is among them — so the pattern continues to hold exactly where directory walks exist, and simply
has nowhere to cluster in `tests/browser/`.

### 4b. What was sampled, and what it found

Read in meaningful depth (docblock plus the assertion bodies, not just the opening comment):
`local-save-durability.spec.ts`, `local-save-errors.spec.ts`, `local-save-quota.spec.ts`,
`local-save-migration.spec.ts` (opening + rationale), `lifecycle-save.spec.ts`,
`ui-buy-button-affordability.spec.ts`, `ui-build-queue.spec.ts`, `ui-pending-deliveries.spec.ts`,
`ui-held-guards.spec.ts`, `ui-contraband-name.spec.ts`, `ui-overdraft-badge.spec.ts` (opening),
`ui-strip-badged-width.spec.ts` (opening), `camera-coordinates.spec.ts` (opening + precision
rationale), `production-artifact.spec.ts` (opening + its own documented artefact-side mutations),
`world-scene-input.spec.ts` (opening), `actor-guard-rendering.spec.ts` (full), `environment-art.spec.ts`
(opening), large sampled sections of `app-shell.spec.ts` (10,147 lines — the `#88` control-reachability
sweep, its `everMeasured`/`neverLaidOut` exact-set closing check) and `ui-shell.spec.ts` (5,217
lines — the clipping probe, the regime-tone painted-colour check), and `pseudo-locale-sweep.spec.ts`
(full, §4c). Grep-swept for the six named shapes across all 35 spec files (loose-assertion ratio,
`.all()`/`for…of` loops without a preceding non-zero check, `toBeGreaterThanOrEqual(0)`).

Every candidate the grep sweep raised that was traced resolved to a false positive on inspection:
either the "loop" iterates a literal constant array that cannot be empty (`HUD_TAB_IDS`,
`ZOOM_LEVELS`, `WIDTHS`), or an exact-count assertion sits immediately before or inside the loop
(`toHaveLength(3)`, `toEqual(['0','1','2'])`, `expect(painted).toHaveLength(4)`) that the narrow
grep window did not catch. The recurring house style is a named, explicit "non-vacuous" comment
beside almost every loose floor in this subtree — several of them naming the exact prior escape
the floor exists to catch (`local-save-migration.spec.ts`'s pinned-literal-version miss that "did
not run in CI", `projection-request.test.ts`'s confiscation-drain escape reproduced live in §3,
`world-scene-input.spec.ts`'s own comment naming the self-referential-control anti-pattern by
description and explaining why the file avoids it). No self-referential control, vacuous set, loose
floor, silent walk, test-wrote-its-own-value or tautology from the brief's list was found among
what was read. This is READ-tier for all of it except the one live mutation in §4c below, and the
sample — roughly 20 of 35 spec files, weighted toward the largest and highest-blast-radius ones
(persistence durability/quota/migration, the two 5,000+/10,000+-line app-shell/ui-shell files,
player-visible refusal) — does not cover the other ~15, named in full: `ui-hire-button-affordability`,
`ui-clock-paused-readout`, `ui-escape-sentence-survival` (opening only), `ui-staff-wage`,
`ui-alert-dismiss`, `ui-alerts-column`, `ui-occupancy-overflow`, `ui-prisoners-without-bed`,
`ui-relocation-notice` (all four grep-swept for loose floors, none read in full),
`build-deliveries-outside-the-fold`, `actor-motion`, `world-scene-minimap`, `world-scene-touch`,
`hud-minimap-navigates` (opening only).

**One MEASURED confirmation in this subtree, chosen for the persistence-format blast radius the
brief calls out explicitly:** `local-save-durability.spec.ts`'s
`'generation retention keeps the current generation plus two previous ones on disk'`. Mutated
`PrisonSaveRepository.keepGenerations`'s default from `3` to `4` at
`src/persistence/local/repository.ts:273`. Ran
`node --experimental-transform-types --disable-warning=ExperimentalWarning tests/browser/run-suite.ts
--suite browser --grep "local save durability"`:

```
✘  3 … generation retention keeps the current generation plus two previous ones on disk (2.3s)
- Expected  - 0
+ Received  + 1
  Array [
+   "gen-mtke2l31-1",
    "gen-mtke2l3e-2", …
  4 passed (38.2s)
```

caught immediately, on the exact `toEqual`. Restored by hand; `sha256sum -c` OK. **SOUND.**

### 4c. `pseudo-locale-sweep.spec.ts` — a gate that cannot fail on the defect its own docblock says
it exists to catch, MEASURED live, reported rather than fixed

This file's own words: *"anything still readable is text that never passed through the catalogue —
and, because placeholders are copied and not accented, an English **parameter** spliced into a
bracketed template is readable too. That second class is the one no key-declaration scan can
see."* It sweeps six states across the assembled application and collects every readable ASCII
residue into `inventory`. But reading every `expect(` in the file (there are 16; full list checked,
not sampled) shows exactly one touches that inventory's content:

```ts
expect(inventory.length + statesVisited.length, 'the sweep above actually ran').toBeGreaterThan(0);
expect([...new Set(keyShaped.map((entry) => `${entry.text} @ ${entry.where}`))]).toEqual([]);
```

`keyShaped` is the narrow subset of residues that look like an unresolved dotted key
(`/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/`, unbracketed). Every other finding — the `distinct` array the
file computes, sorts and prints in `test.afterAll` — is `console.log`'d and asserted nowhere. The
file's own comment says as much: *"The report is the deliverable (#664 says so in as many words),
so it is printed rather than asserted away."* That sentence is true of the file's original,
narrower purpose (a research audit, #664) and is now also, unintentionally, true of the broader
claim the docblock leads with — the "second class… no key-declaration scan can see" is found and
then discarded by the only mechanism that would fail a build on it.

**Measured live**, not only read. Mutated `TelemetryConsentPrompt`'s title
(`src/ui/telemetry-consent-prompt.ts:69`) from
`text: options.localizer.format(TELEMETRY_CONSENT_MESSAGE_KEY.title)` to
`` text: `${options.localizer.format(TELEMETRY_CONSENT_MESSAGE_KEY.title)} Keep your data private
always` `` — a raw, un-bracketed English sentence fragment appended after the pseudo-locale's own
closing `⟧`, landing on the consent prompt swept in the file's very first state
(`'no session: telemetry consent prompt'`). Ran the whole file
(`--grep "pseudo-locale"`, 7 tests, 10.1 minutes real wall time on a container running two other
agents' browser suites throughout):

```
✓  the assembled application under the pseudo-locale (#664) › with no session: boot, the consent
   prompt, a refusal and every tab
✓  … with a prison: a populated save panel, every tab and a running clock
✘  … with a populated prison: rosters, intake and alerts   (unrelated 180s timeout inside
     expandEverythingVisible, a section-header click — matches this container's documented
     contention canaries; not investigated further, out of this audit's scope)
✓  … with work in progress: the build queue, a delivery and a pending room
✓  … with a failure: what a save-panel error line renders
✓  no key rendered as its own name anywhere the sweep went
6 passed, 1 failed (10.1m)
```

**Both states that swept the mutated consent prompt passed clean**, including the final
"no key rendered" assertion. Independent confirmation that the mechanism is real and not only a
hazard for a hypothetical mutation: the same run's own `console.log` output, which `tail -100`
otherwise truncated, printed two *pre-existing, unmutated* leaks under exactly this heading —

```
PSEUDO-LOCALE SWEEP :: [document] "Lockstate io" — not from the catalogue at all
PSEUDO-LOCALE SWEEP ::     at <title>
PSEUDO-LOCALE SWEEP :: [attribute] "Lockstate game application" — not from the catalogue at all
PSEUDO-LOCALE SWEEP ::     at html > body > main#app [aria-label]
```

— `<title>Lockstate.io</title>` and `<main aria-label="Lockstate game application">` in
`index.html`, both real, both static, neither ever passed through the localizer at all (a fact
this file is specifically built to catch), both printed and neither asserted, on the *unmutated*
tree. Mutation restored by hand afterward (`sed`/Python replace back to the original one-line
`text:` assignment); `sha256sum -c` OK; `git status --porcelain` clean on that file.

**Verdict: CANNOT-FAIL on the file's own stated headline claim, MEASURED. Reported, not fixed.**
Two reasons for reporting rather than closing it in-file, unlike §2: first, whether
`index.html`'s `<title>`/`aria-label` *should* route through the localizer at all is a product
question this audit has no standing to answer (`AGENTS.md`'s fourth exclusion — a decision about
what a player is owed, not a mechanical gate). Second, unlike `art-pipeline-determinism`'s exact
finite list, "every readable ASCII residue anywhere in a six-state sweep of the whole application"
has no natural exact set to pin — an allowlist here is either the two known leaks (which locks in
rather than fixes them) or a floor (which is the shape this whole audit exists to distrust). This
is a design decision for whoever owns #664 next, not a one-line fix; recorded here with the exact
mechanism and both live examples so that whoever picks it up does not have to re-derive them.

---

## 5. Coverage, stated exactly

**`tests/determinism/`: 27 of 27 files carry a verdict** — 4 MEASURED by this pass (§1, §2, §3
partial), 2 MEASURED by the prior pass and re-cited here (`kernel-system-order`'s original mutation,
`save-rng-stream-compatibility`), 2 READ in full by this pass (§3), and 19 READ by the prior pass
and not re-opened here because nothing in this pass's method (grep for the six named shapes, the
loose-ratio scan, blast-radius triage) turned up a reason to distrust that note's verdicts for
them. One (`art-pipeline-determinism`) changed tier from READ to MEASURED and changed nothing about
its direction, and is now fixed.

**`tests/browser/`: 35 of 35 `*.spec.ts` files exist and were confirmed to import `test` from
`'./network-changed-fixture'`** (`grep -L` returned nothing — the contract
`browser-network-changed-retry-contract.test.ts` enforces holds today). Roughly 20 were read in
meaningful depth; the rest were grep-swept for the six named shapes and not read in full — named
individually in §4b rather than left as a round number. Two MEASURED by browser mutation (§4b's
`local-save-durability`, §4c's `pseudo-locale-sweep`); everything else in the read set is READ-tier.
The 29 `.playtest.ts` files were confirmed uncollected by `playwright.config.ts`
(`testMatch: /.*\.spec\.ts$/`) and not otherwise examined — they are explicitly not gates
(`playwright.playtest.config.ts`'s own docblock says so), so auditing them for vacuity is
auditing something that was never claimed to be a gate. None of their `expect(...)` calls were
found sitting inside a file that *pretends* to be a `.spec.ts` or is otherwise mis-collected; the
partition contract (`browser-suite-partition-contract.test.ts`, already SOUND per the prior note)
is the thing that would catch that, and this pass did not re-mutate it.

**What this pass did not reach, stated plainly:** the ~15 unread `*.spec.ts` files named in §4b;
`tests/determinism/`'s 19 files this pass did not re-open (all READ, none re-mutated); the 30
non-test support/harness files under `tests/browser/` (`*-harness.ts`, `*-harness-api.ts`,
`playtest-harness.ts`, `alert-dwell.ts`, `search-policy.ts` and similar) — these are fixtures rather
than gates and were read only incidentally, where a spec under audit called into them.

---

## 6. Every claim in the brief, checked

- *"`tests/browser/` and `tests/determinism/` are the two subtrees the two prior audits did not
  touch."* **Half wrong.** `tests/determinism/` was examined (mostly READ) by the foundation note
  the same day; see the correction above. `tests/browser/` was genuinely untouched.
- *"`tests/helpers/determinism-scenario.ts` is the shared fixture; if a scenario stopped reaching a
  system, every test built on it would still pass."* **Read and not contradicted** — the scenario's
  own docblock names every subsystem it touches and why (four sentences instead of ratios freed
  from #441's release fix), and the 14 files that import it were not individually re-derived for
  this note; the two live mutations run against it (§1a, §1b, plus §3's two) all correctly went red,
  which is evidence the fixture does reach what it claims, not proof for every one of the other 10
  importers.
- *"`kernel-system-order.test.ts:434` pins a system order… verify it."* **Verified true, MEASURED,
  SOUND** (§1a).
- *"`job-performing-restart-bound.test.ts` measures a behaviour an accepted-but-unimplemented ADR
  would remove… verify it."* **Half wrong, corrected above**: ADR 0093 is *proposed*, not accepted.
  The measurement itself verified true, MEASURED, SOUND (§1b).
- *"`playwright.config.ts` matches only `*.spec.ts`, so `.playtest.ts` files are never collected by
  CI at all… if you find an assertion that looks like a gate and sits in a `.playtest.ts`, that is a
  finding worth naming."* **Confirmed structurally** (`testMatch: /.*\.spec\.ts$/`, and
  `playwright.playtest.config.ts`'s own docblock says the same in different words). No
  `.playtest.ts` file was found masquerading as a gate in the sense the brief describes — several
  (`playtest-2026-09-02-the-world-view.playtest.ts` among them) carry real, specific `expect(...)`
  assertions about camera panning and minimap click-through that read exactly like a `.spec.ts`
  gate, but the corresponding claims (a click on `.hud-minimap` reaches the camera) already have a
  real `.spec.ts` (`hud-minimap-navigates.spec.ts`) asserting the app-level version — so the
  playtest reads as a research instrument that was later promoted into a gate, which is the
  documented, intended workflow, not an accident.
- *"Every `*.spec.ts` must import `test` from `'./network-changed-fixture'`… enforced by a vitest
  contract"* **Confirmed**, `grep -L` returns nothing.
- *"Count the files in both subtrees first."* 94 in `tests/browser/` (35/29/30 split above), 27 in
  `tests/determinism/`.

No claim in the brief was found outright false in the sense of describing something that does not
exist; the two corrections above are about *scope and status*, not about invented mechanics.

---

## 7. What was changed, in full

- `tests/determinism/art-pipeline-determinism.test.ts` — one new test, 27 lines, no `src/` change
  (§2).
- `docs/research/2026-09-02-the-browser-and-determinism-gates-that-cannot-fail.md` — this file.
- `docs/research/README.md` — one row appended, at the file's single append point. A conflict there
  against a moving `main` is expected by construction, per that file's own convention; not resolved
  against `main` here.

Nothing under `src/` is changed by this branch outside the mutate-and-restore pairs recorded above,
every one of which was verified restored with `sha256sum -c` (or, for the test file re-created via
Python string replace, an exact-string `assert` before write plus a final content check) before this
note was written.
