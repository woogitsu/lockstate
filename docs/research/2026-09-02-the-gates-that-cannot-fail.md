# The gates that cannot fail

**Date:** 2026-09-02
**Branch:** `docs/audit-the-gates-that-cannot-fail`, cut from `origin/main` at `9b8c8e85`
(v0.0.358 (`9b8c8e85`)) in a worktree with `node_modules` symlinked to the main checkout.
**Subject:** every file in `tests/foundation/` (48) and `tests/determinism/` (27) — 75 in all — read for
assertions that are vacuous, tautological or self-referential — the class three of whose
instances were found sideways earlier the same day.
**Instrument:** `./node_modules/.bin/vitest run <file>` per file, never the whole suite. Eight
mutations, each restored **by hand** and each restoration verified with `sha256sum -c` before the
next. No `git checkout`, `git stash` or `git restore` was used at any point; `git status
--porcelain` was empty after every restore.

**Contention state.** `/proc/loadavg` read 2.79 before the first run and 4.67 before the last, so
this box was **not** idle: other agents were running suites throughout. Every figure below is
therefore a *pass/fail* result and not a timing claim, with one exception — §5 is about timing, and
it says what the load was when it was taken. Nothing here concludes anything from a timeout.

**Claim tiers.** Every result in §§2–4 is **MEASURED**: a mutation was applied, a named test file
was run, and the output is quoted. Every verdict in §6 marked *read* is **structural** — the file's
assertions and guards were read and reasoned about, and no mutation was run against it. The
distinction is kept per row because the brief that commissioned this pass is right that a gate
nobody has watched fail is a gate nobody knows works, and that applies to an auditor's verdict too.

**Nothing under `src/` is changed by this branch.** The `src/` mutations below were probes. The
commit beside this note changes six comments in `tests/` and no assertion.

---

## Three corrections to the brief, before anything else

The brief asked to be distrusted on every load-bearing point. It was right twice, wrong once, and
overtaken once.

**Instance 1 is fixed, and I watched the fix work.** `hud-refresh-cadence-contract.test.ts` on
`origin/main` at `9b8c8e85` writes the interval out first, at line 326, before bounding the gap
with it at line 330. Setting `CLOCK_STATE_PUBLISH_INTERVAL_MS` from 250 to 200 in
`src/simulation/worker/state-machine.ts:64` — the mutation the brief reports leaving `main` **5
passed (5)** before #805 — now gives:

```
× refreshes the pulled readouts on the clock heartbeat regardless, at better than a quarter-second
AssertionError: this file's docblock states a worst gap of 255 ms, which is ceil(250 / 15) * 15 …
  expected 200 to be 250
 Tests  1 failed | 4 passed (5)
```

failing at `tests/foundation/hud-refresh-cadence-contract.test.ts:326`. Baseline before the
mutation: **5 passed (5)**. Restored by hand; `sha256sum -c` OK.

**Instance 2 is real and understated.** `PROTECTED_BY_DECISION` in
`tests/foundation/unconsumed-content-contract.test.ts:105` holds one entry, `room.storage-room`,
while the docblock above it (line 80) said *"Two entries, not three"* and *"Both survivors are **rooms**"*.
The brief did not say that the *file* docblock carries the same rot at line 26 — *"**Two of those
three are still here; the dock door graduated.**"* — and that a **second foundation contract
repeats it**: `room-routing-contract.test.ts:21` says `room.delivery-bay` and `room.storage-room`
*"sit in its `PROTECTED_BY_DECISION` list"*. All three rotted at the same commit, `71617799`
(2026-08-30, *"An occupied place means a bed that currently exists…"* (#610)), which gave
`room.delivery-bay` a test consumer and graduated it out of **both** of that file's lists. The
brief's date and commit are exactly right; the blast radius is three sentences in two files, not
one.

**Instance 3 is not fixed.** `src/ui/simulation-events.ts` still carries both denials, at line 238
— *"the one of that ADR's four decisions the owner did not take on 2026-09-01, and it is still
open"* — and at line 635 — *"which is ADR 0084's decision 4 -- a dwell floor -- and that decision
is not taken."* `EVENT_BAND_DWELL_FLOOR_MS = 600` is at `src/ui/hud/event-band-dwell.ts:52` and is
read at lines 129, 149 and 211 of that file; ADR 0084 carries **"Amendment, 2026-09-01: decision 4
is taken"** at its own line 678 and already marks both directions in its Status clause (*"That last
sentence stopped being true later the same day"*). The same module's line 15 cites *"the owner's
ruling on ADR 0084 decision 4"* as settled, so the file contradicts **itself** two hundred lines
apart. `src/` is out of bounds for this branch: **reported, not repaired.**

---

## 1. The class, restated from what it actually looks like here

The brief names the archetype as a self-referential bound. That is one instance of something
narrower and more common, and after 75 files the honest statement of the class is this:

> **An emptiness claim over a corpus is defended against the corpus vanishing and undefended
> against the corpus shrinking.**

Every walking gate in these two directories carries a floor, and several carry four. The floors are
uniformly and deliberately loose — `comment-symbol-existence-contract.test.ts:110` says so in
words: *"The floors move with the corpus and are deliberately loose -- they are 'the scan still
works' and not 'the corpus is this size'."* That is a defensible trade and it is stated, not
hidden. But its consequence is not stated anywhere: **a floor set at a third of the live corpus is
an all-or-nothing detector.** A walk that loses one directory, one extension or one root satisfies
it, and every `toEqual([])` under it then holds of a smaller world.

What separates the sound gates from the exposed ones is therefore **not** the floor. It is whether
the file also compares two sets read from *independent* sources. Where it does, a shrunken walk
produces phantoms on one side and fails loudly (§3). Where it does not, the floor is the whole
defence and the floor cannot see it (§2).

Three shapes turn out to be safe by accident and are worth naming, because they are what most of
this corpus relies on:

- **Failing in the safe direction.** `unconsumed-content-`, `unconsumed-command-`,
  `unconsumed-action-`, `fault-code-`, `message-kind-` and `challenge-rejection-code-` contracts
  all scan for *consumers*. Losing part of that walk makes more ids look unconsumed, which is a
  loud failure against a written-out list. The gate cannot be quietened by shrinking its corpus,
  only made noisier.
- **An anchor inside the corpus.** `ambient-nondeterminism-contract.test.ts:171-174` asserts four
  named files are in the import closure; `canonical-iteration-contract.test.ts:210` asserts
  `src/persistence/save-schema.ts` is in the scan; `times-sign-contract.test.ts:348` asserts one
  authored sentence survived the lex. An anchor only defends the directory it names.
- **A floor at the measured value rather than below it.**
  `canonical-iteration-contract.test.ts:230` pins `REPORT.siteCount >= 52` and its comment argues
  the case better than I can: *"`toBeGreaterThan(40)` against 53 sites admitted the loss of a
  quarter of the corpus without a word. #278 was exactly that loss."*
  `localization-key-completeness.test.ts:98-110` makes the same argument at length and names the
  measurement behind it: its floor *"was `toBeGreaterThan(50)` against 74 declarations, i.e.
  satisfied with **one** declaration of margin once anything reduced coverage: #193 measured that
  an over-stripping scanner takes the count to 51, which the old guard admitted."* This is the only
  form in either directory that closes the hole §2 demonstrates, and it is used in exactly those
  two files.

**So this class is already known here, and closed twice.** #193 and #198 found it, argued it and
fixed it in `localization-key-completeness` and `canonical-iteration-contract`, and the reasoning
is written into both files at length. What §2 reports is not a new idea. It is that the fix was
applied to the two files where the class was discovered and to no others — the fix-the-class rule
in `docs/AGENT_WORKFLOW.md` §3 run as far as the instance and stopped. Every other walking gate
here still carries a round-number floor a long way under its corpus.

---

## 2. The two gates that cannot fail on the thing they name

Both were found by looking for absence claims whose guards are floors alone, and both were then
demonstrated with a two-part mutation: plant a real offender, watch the gate catch it, then shrink
the walk and watch the same offender become invisible.

### 2a. `documentation-claims-contract.test.ts` — and its own positive control is the tautology

This file's docblock is the most careful account of the vacuity problem in the repository. Lines
51-63 set out that *"every substantive assertion in this file is `toEqual([])`, so the whole gate
is a set of 'found nothing' claims"*, note that *"The file-count guard inside
`sourceFilesMatching` does not close that: it counts files **walked**, not content **surviving**"*,
and add a second control for the gap. That control is line 218:

```ts
expect(
  seeing.length,
  'the scanner no longer sees `export` in almost every module under src/ …',
).toBeGreaterThan(walked.length - 10);
```

**The expected value is recomputed from the same walk as the actual.** `seeing` is
`sourceFilesMatching(/\bexport\b/u)` and `walked` is a second call to `collectSourceFiles` over the
same root, so both shrink together and the control holds for any corpus size — including zero,
where `0 > -10`. It closes exactly the direction its docblock claims (a stripper that blanks
content) and cannot close the other one (a walk that loses files), which the same docblock is about.

Measured, in three steps.

1. Baseline: **14 passed (14)**.
2. A real offender planted — `export function compressPayloadProbe(): string { return "gzip"; }`
   appended to `src/simulation/economy/income.ts`:

   ```
   × compresses nothing, as the topology and the persistence section both now say
   AssertionError: something under src/ now compresses …
     expected [ 'src/simulation/economy/income.ts' ] to deeply equal []
    Tests  1 failed | 13 passed (14)
   ```

   The gate works.
3. Offender left in place, and `collectSourceFiles` given one line — `if (entry.name ===
   'simulation') continue;`. The walk falls from **372** `.ts` files under `src/` to **194**; the
   vacuity guard at line 71 is `toBeGreaterThan(100)` and is satisfied. Result:

   ```
   ✓ compresses nothing, as the topology and the persistence section both now say
   ✓ reads surviving code and not whitespace, so a scanner that strips too much cannot pass
   × names every thing that credits the treasury, as the HUD projections gap list claims
   × names every module outside operations/ that deposits into a container …
    Tests  2 failed | 12 passed (14)
   ```

   **The test the offender belongs to went green, and so did the positive control.** The file went
   red — but on two *other* tests, and for a reason nobody designed: both enumerate
   `src/simulation/**` paths on the **expected** side of a `toEqual`, so the vanished directory
   showed up as a missing expectation. That is a genuine defence and it is entirely incidental. Had
   the skipped directory been `src/rendering/` or `src/input/`, which no expectation in the file
   names, all fourteen would have passed with a compressor sitting in the tree.

Both mutations restored by hand; `sha256sum -c` OK on both files.

### 2b. `times-sign-contract.test.ts` — the same hole with no incidental defence at all

Same method, cleaner result, because this file's expectations name no path.

- Walk given `if (entry === 'ui') continue;`, no offender: **31 passed (31)**.
- Offender planted with the walk still shrunk — `export const ZZ_PROBE_LABEL = 'Speed 4x now';`
  appended to `src/ui/simulation-clock.ts`: **31 passed (31)**. Still green.
- Walk restored, offender kept:

  ```
  × finds every literal that spells one, and each is on the list
  AssertionError: a hard-coded string literal uses an ASCII x as a multiplication sign …
  +   "src/ui/simulation-clock.ts: \"Speed 4x now\""
   Tests  1 failed | 30 passed (31)
  ```

`src/ui/` holds **66** of the 372 `.ts` files under `src/`; 306 remain, and the two floors at
`times-sign-contract.test.ts:342-343` are `sourceFiles.length > 200` and `sourceLiterals.length >
4000`. Both hold comfortably. The anchor at line 348 — *"an ordinary authored sentence is still
there"* — checks for `'Designate {width} × {height}'`, which lives in `src/content/`, so it does
not notice `src/ui/` leaving either.

This is the ranking-relevant one. The owner's ruling of 2026-09-01 that a player-facing multiplier
is spelled `×` is enforced **only** for the directories this walk reaches, and the gate has no way
to say when it stops reaching one. Restored by hand; `sha256sum -c` OK.

---

## 3. The gates I tried to break and could not

A gate that survives a mutation is a result, and four of the six mutations I ran to break something
failed to break it. They are here in full because they are what makes §2 a finding about two files
rather than a suspicion about seventy-five.

**`adr-numbering-contract.test.ts` — the model answer to §2.** Its floor is the weakest in either
directory relative to its corpus: `toBeGreaterThan(10)` at line 205 against **87** ADR files. I
shrank the walk to 46 of them (`&& entry < '0050'` on the filter at line 186). The floor passed.
The file did not:

```
× indexes exactly the ADRs the directory holds
× states a next free number no ADR on disk has taken
 Tests  2 failed | 10 passed (12)
```

Because the test at line 272 reads the ADR set **twice, from two places** — the directory and
`docs/adr/README.md` — and a missing file becomes a *phantom row*. Its own docblock argues for that
shape over a count: *"a count says nothing at all when one row is added and another dropped in the
same edit."* It is right, and it is also what makes the loose floor harmless here. **A set
cross-check is worth more than a tight floor, and this file is the proof.**

**`unreachable-invariant-contract.test.ts` — 22 emptiness claims, and it caught it.** Walk given
`if (entry === "simulation") continue;`: **4 failed**, including *"scans the whole of src/ and
tests/, and finds the enforcers it claims to scan"* and *"keeps its allow-list honest in both
directions"* — the allow-list entries must resolve to files inside the scan, so removing a
directory that holds one is loud.

**`comment-symbol-existence-contract.test.ts` — caught, noisily, with the wrong diagnosis.** Walk
given `if (entry.name === 'rendering') continue;` (37 files of **877**, against a floor of
`> 600`), plus a real offender: a comment citing `` `ZzProbeThing.zzMember` `` in
`src/rendering/world/environment-art.ts`. Result **1 failed | 2 passed (3)** — but the eight names
in the failure are all *other* files:

```
+ "src/simulation/protocol/render-actors-payload.ts:175 cites `RenderActor.id`, and `RenderActor` is declared nowhere in the repository"
+ "tests/browser/camera-coordinates.spec.ts:77 cites `CAMERA_ORIGIN_RATIO`, and `CAMERA_ORIGIN_RATIO` is declared nowhere …"
… six more
```

The planted offender is **not** in the list. What happened is that the same walk builds the
*vocabulary*, so the skipped tree's declarations left with it and eight unrelated citations became
unresolvable. So this gate does not fail silently on a partial walk — it fails loudly and points at
eight innocent files. That coupling is an accidental cross-check of exactly the kind §3 is about,
and it is worth knowing it exists, because a reader who hits that red will spend the afternoon on
`RenderActor`.

**`deployment-phase-producer-contract.test.ts` and `room-routing-contract.test.ts` — plain
production mutations, both red.** `'on-search'` → `'on-post'` at
`src/simulation/incidents/response-system.ts:493`: **2 failed | 2 passed (4)**. A routed room
changed at `src/simulation/prisoners/actions.ts:153` (`'room.yard'` → `'room.staff-room'`): **2
failed | 3 passed (5)**. Both files write every expectation out by hand, which is why.

**One incidental discovery from the probe rig, worth recording.** Getting `ZzProbeThing` to be seen
took three attempts, and the first two are the finding: an *un-backticked*
`NoSuchThing.doesNotExist` in a comment in `src/`, in `scripts/*.mjs` and in `benchmarks/*.mjs`
produced **3 passed** — `citationsIn` at line 293 reads backticked spans only, which is documented.
Backticked, the same probe in all three places produced exactly **one** failure, the `src/` one:
`scanCorpus` filters comment scanning to `src` and `tests` (line quoted in the file:
`if (!relative.startsWith('src') && !relative.startsWith('tests')) continue;`), which the test's
own title states. Both behaviours are by design. **What is not by design** is at line 395:

```ts
...(await collectFiles(path.join(repositoryRoot, 'benchmarks'), ['.ts'])),
```

`benchmarks/` holds **12 files, every one of them `.mjs`**, so this fourth root of the vocabulary
walk contributes **zero files** — while the `scripts/` root one line above correctly lists
`['.ts', '.mjs', '.js']`. A glob that matches nothing, undetectable by any of the file's four
floors. The direction is benign: it can only make the gate stricter (a comment citing a
benchmark-only symbol would be reported), never blinder. Reported rather than repaired, because
adding `.mjs` there widens the vocabulary and that is a change to what CI enforces.

---

## 4. Rotted tallies and drifted pins

These are the cheap ones, and they are last on purpose: a stale count misleads a reader, while §2
misleads CI. Everything in this section is fixed on this branch, in both directions and dated, and
all four affected files run green **before and after** — which is the point. `4 passed (4) / 38
tests` with three false counts in them.

**`unconsumed-content-contract.test.ts`** — *"Two entries, not three"* (line 80) and *"Both survivors are
**rooms**"* (line 82) and *"Two of those three are still here"* (line 26). One entry since
`71617799`. **Why nothing caught it:** the exact assertion at line 508 pins `{declared: 62,
unconsumedBySrcAndTests: 4, unconsumedBySrcOnly: 29}`, and `unconsumedBySrcAndTests` counts the two
lists **together** — `PROTECTED_BY_DECISION` (1) plus `AWAITING_CONSUMER` (3). An id moving between
them, or out of both with the measured set, moves nothing the file asserts. The docblock tally was
unguarded by construction.

**`room-routing-contract.test.ts:21`** — `room.delivery-bay` placed in
`PROTECTED_BY_DECISION`; it is in neither list. **The six-room count and the argument are
unaffected** and the correction says so: all six still read as consumed one directory over and none
is anywhere a prisoner can go, which is the whole claim.

**`trusted-tier-reachability-contract.test.ts:62`** — *"Three trees remain parked and all three
still have a live server half"*. `PARKED_TREES` at line 155 holds **four**
(`src/persistence/cloud/`, `src/services/challenges/`, `src/services/entitlements/`,
`src/ui/account/`), and lines 143 and 151 of the **same file** already read *"The four trees"* and
*"three of these four have a **live server half**"*. It rotted in `e876245f` — *"Re-measure #378,
track src/ui/account/ in the reachability gate, correct two stale claims (#512)"* — the commit that
corrected the other two paragraphs and left this one. No assertion in the file counts the trees.
This is `docs/AGENT_WORKFLOW.md` §4's *"reading a file's own headings against each other is a
different check from any diff"* paying for itself: the contradiction is visible without leaving the
file.

**`content-vocabulary-contract.test.ts:24` — DRIFTED PIN, and stale in the commit that wrote it.**
The mutation record pins *"`src/content/object-catalog.ts:82`'s `object.desk` row"*. Tracked
through history: the row was at line 82 at `489b0611` (2026-08-26), where the mutation was run, and
at line **103** at `bccdf58c` (2026-08-27), **the commit that added this test file**. It is still
at 103. Today line 82 is inside a docblock about `capabilities`, so the pin lands somewhere
plausible and wrong — the exact failure mode `documentation-source-anchor-contract.test.ts`'s
header describes as *"a line number is a fact about every insertion above it"*. Corrected in both
directions: the old number is where the measurement was taken, the new one is where the row is, and
the note beside it says to grep `object.desk` rather than trust either.

**`content-vocabulary-contract.test.ts:350` — a correction chain that itself rotted.** The census
docblock says, present tense, *"152 of the 172 derived labels, across 38 of the 42 namespaces"* and
*"Four namespaces have one"*, then corrects itself twice — by one, then by 25, landing at *"152
unreachable labels became 127 and four namespaces with a call site became nine"*. The `toEqual` at
line 464 asserts **176** labels, **114** unreachable, **30** namespaces without a call site and
**12** with one. So all three prose figures are behind the tree, including both corrections. This
is `docs/AGENT_WORKFLOW.md` §4's *"a correction is no more durable than the claim it corrected"*
with three layers on it. Marked rather than rewritten, with one sentence pointing the reader at the
assertion.

**`account-metadata-boundaries.test.ts:37` — a pin that never drifted because it was wrong when
written.** It quotes *"`src/services/entitlements/products.ts:16` says of `BASE_SAVE_SLOTS`"*. The
quoted sentence opens at line 14 and `BASE_SAVE_SLOTS` is declared at line 24; `products.ts` has
not changed since `cfdf6153`, which predates the test's own commit `fee61155`. Reported as what it
is — a mis-pin, not drift — and corrected. This one is trivial and is here only because the corpus
convention is to say which direction a correction runs.

**`second-locale-contract.test.ts:355`** — *"366 `.ts` files under `src/`"* is **372**. Corrected
with the observation that it will be wrong again next week, and that neither of the case's two
floors counts `src/` as a whole. The right fix for a sentence like that is to delete the tally, and
that is a judgement about somebody else's comment rather than a correction, so it is not made here.

**One I did not fix, and the reason.** `save-rng-stream-compatibility.test.ts:42` says *"The four
names and the words they derive to are literals here"*; `REGISTERED_STREAMS` holds **six**. The
very next paragraph opens *"**It has done exactly that, twice, on purpose.** ADR 0061 added a fifth
stream and #535 decision 5 added a sixth"* — so the file corrects itself before a reader can be
misled, and adding a third marker to a paragraph that is already a both-directions record makes it
worse, not better. Recorded here instead.

---

## 5. A timeout is a gate that cannot fail, and this is what the margins are

The brief's point deserves stating plainly: `testTimeout` in `vitest.config.ts` is `5_000`, and a
test that hits it reports `Error: Test timed out in 5000ms` **before its assertions run**. A
`toEqual([])` that never executed is indistinguishable, in a log, from one that executed and found
nothing — and worse, the failure reads as infrastructure, which is what invites the word the
workflow document forbids.

Measured on this container, single file, under the load stated:

| file | load average when run | file duration | worst single test |
| --- | --- | --- | --- |
| `comment-symbol-existence-contract.test.ts` | 2.79 | 2.64s | ~2.3s |
| `adr-status-reference-contract.test.ts` | 4.67 | 1.92s | 737ms |
| `documentation-claims-contract.test.ts` | not recorded | 3.07s | 417ms |

So the margin on the worst of them is about **2.2×** against the per-test budget, on a box that was
not idle. That is consistent with the brief's 5.2s measurement under three concurrent suites
without needing to invoke flakiness: the budget is per test, the heaviest test here is a single
repository-wide scan, and 2.3s of scan under one competing agent becomes more than 5s under three.
**I did not reproduce a timeout and I am not claiming one.** What I am claiming is the structural
half: if it does time out, the gate has not run, and no output distinguishes that from a green.
`adr-status-reference-contract` at 1.92s is comfortable and the brief's 2–4s is a whole-file figure
rather than a per-test one.

**And one gate in these directories does not run at all, by design and in the open.**
`tests/determinism/` reports `181 passed | 1 skipped (182)`, and the skip is
`art-pipeline-determinism.test.ts`'s `it.skipIf(!canRunLive)` — the half that actually builds the
pipeline twice and compares digests. Its docblock is explicit that *"It needs Blender, which CI does
not have, so it skips when Blender is absent"*, and that the static half *"is not a substitute for
the live check and does not pretend to be"*. That is the honest form of an unrunnable gate and I am
not reporting it as a defect. It is here because it is the same fact as the timeout, stated
deliberately instead of accidentally: **in CI, the determinism contract for the art pipeline is four
`grep`s over Python source and nothing else** — which is exactly why the fifth item in §7 matters
more than its size suggests, since those four `grep`s are floored only by `entryPoints.length > 0`.

---

## 6. Every contract examined

`mut` marks a row where a mutation was applied and the result quoted above. `read` marks a
structural verdict from reading the assertions and guards — weaker, and marked so.

| contract | verdict | evidence |
| --- | --- | --- |
| `foundation/hud-refresh-cadence-contract` | SOUND (was TAUTOLOGICAL, fixed #805) | **mut**: interval 250→200 → 1 failed at :326 |
| `foundation/documentation-claims-contract` | **VACUOUS-RISK / TAUTOLOGICAL** (:218) | **mut**: offender in a skipped dir → its test green; walk 372→194 under a floor of 100 |
| `foundation/times-sign-contract` | **VACUOUS-RISK** | **mut**: `src/ui/` dropped → 31 passed with a planted offender; restored → 1 failed |
| `foundation/comment-symbol-existence-contract` | SOUND, with a no-op walk root (:395) | **mut**: partial walk → red, wrong diagnosis; `benchmarks/` × `['.ts']` = 0 files |
| `foundation/adr-numbering-contract` | SOUND (set cross-check, not the floor) | **mut**: 87→46 ADRs → 2 failed |
| `foundation/unreachable-invariant-contract` | SOUND | **mut**: `src/simulation/` dropped → 4 failed |
| `foundation/deployment-phase-producer-contract` | SOUND | **mut**: `'on-search'`→`'on-post'` → 2 failed |
| `foundation/room-routing-contract` | SOUND + **ROTTED-PROSE** (:20) | **mut**: routed room changed → 2 failed; green with false prose |
| `foundation/unconsumed-content-contract` | SOUND + **ROTTED-PROSE** (:26, :74) | green while the tally was false; membership is pinned, sizes are not |
| `foundation/trusted-tier-reachability-contract` | SOUND + **ROTTED-PROSE** (:62) | green; contradicted by :130 and :138 of the same file |
| `foundation/content-vocabulary-contract` | SOUND + **DRIFTED-PIN** (:24) + **ROTTED-PROSE** (:341) | pin tracked through `489b0611`→`bccdf58c`; census three moves behind its own `toEqual` |
| `foundation/account-metadata-boundaries` | SOUND + **DRIFTED-PIN** (:37, never drifted) | quoted sentence opens at `products.ts:14` |
| `foundation/second-locale-contract` | SOUND + **ROTTED-PROSE** (:354) | 366 → 372; exact location-set cross-check on `ASSEMBLED_SENTENCES` is strong |
| `determinism/save-rng-stream-compatibility` | SOUND + ROTTED-PROSE (:42, self-corrected) | four → six streams, corrected in the next paragraph |
| `foundation/adr-quotation-verbatim-contract` | SOUND (**read**) | `MINIMUM_QUOTATIONS = 15` + eight recorded mutations incl. the vacuity and walk cases |
| `foundation/adr-status-queue-anchor-contract` | SOUND (**read**) | budget written out at :89 with *"do not raise … to make this pass"* |
| `foundation/adr-status-reference-contract` | SOUND (**read**) | floors 20/300/15 + a false-claim positive control |
| `foundation/rpc-status-vocabulary-contract` | SOUND (**read**) | both sides read from independent sources; `> 1` floors on each |
| `foundation/typecheck-coverage-contract` | SOUND (**read**) | floor 700 vs 902 tracked files, plus `include.length >= 5` |
| `foundation/buildable-category-contract` | SOUND (**read**) | 21 rows and 7 categories written out; counts verified against the tree |
| `foundation/object-buildable-cost-contract` | SOUND (**read**) | 19/21/17/18 written out and asserted |
| `foundation/ci-configuration-contract` | SOUND (**read**); the workflow-walk floor is `> 0` | flat-scan vs structural-parse agreement on the same files is the real guard; several other floors here are tight (400, 10, 3) |
| `foundation/documentation-commit-citation-contract` | SOUND (**read**) | allowlist honest in both directions; floors 20/50/60/500 |
| `foundation/documentation-links-contract` | SOUND (**read**) | floors 10/20/500/400/200 + absent-by-design list checked both ways |
| `foundation/documentation-source-anchor-contract` | SOUND (**read**) — model | positive control asserts three *known-broken* anchors, verified: `coordinates.ts` is 127 lines |
| `foundation/documentation-version-claim-contract` | SOUND (**read**) | floors 15/5 + written-out shapes |
| `foundation/browser-network-changed-retry-contract` | SOUND (**read**) — model | `names.length > 10` with the reason in the comment |
| `foundation/browser-network-changed-signature` | SOUND (**read**) | pure, both directions, no corpus |
| `foundation/browser-suite-partition-contract` | SOUND (**read**) | historical CI transcript at `:29-35` is a record, not a live pin |
| `foundation/browser-suite-selection` | SOUND (**read**) | closed set, uniqueness asserted |
| `foundation/benchmark-scenario-kind-contract` | SOUND (**read**) | has an explicit *"cannot become vacuous"* case |
| `foundation/build-commit-identity-contract` | SOUND (**read**) | precedence asserted in both directions |
| `foundation/challenge-rejection-code-reachability-contract` | SOUND (**read**) | 24 codes pinned; fails in the safe direction |
| `foundation/cloud-prison-id-domain-contract` | SOUND (**read**) | *"refuses the scheme that shipped, so the oracle above is not vacuous"* |
| `foundation/comment-stripping-contract` | SOUND (**read**) | fixture-driven both ways; floors 473/20k/50k |
| `foundation/composition-root-contract` | SOUND (**read**) | textual pins, bounded claims stated |
| `foundation/content-validation-reachability-contract` | SOUND (**read**) | synthetic module graphs in both directions |
| `foundation/deploy-blocked-announcement-contract` | SOUND (**read**) | written-out guard text |
| `foundation/deploy-secret-gate-contract` | SOUND (**read**) | written-out names |
| `foundation/fault-code-reachability-contract` | SOUND (**read**) | 12 codes, 11 emitted, both pinned |
| `foundation/localization-key-completeness` | SOUND (**read**) | floor **at** the measured value (74) + field-set equality |
| `foundation/message-kind-reachability-contract` | SOUND (**read**) | 8/12/18/2/16 all written out |
| `foundation/navigation-deferred-status-contract` | SOUND (**read**) | absence of two accessors + six named consumers |
| `foundation/projection-reachability-contract` | SOUND (**read**) | `entries.length` pinned to `PROJECTION_IDS.length` as an explicit anti-vacuity check |
| `foundation/pseudo-locale-contract` | SOUND (**read**), weak key-set arm | key equality is input-vs-output of one map, meaningful only because the map can drop keys |
| `foundation/repository-contract` | SOUND (**read**) | pins written out; include list checked against disk |
| `foundation/unconsumed-action-contract` | SOUND (**read**) | 11 ids, 2 unread, both written out |
| `foundation/unconsumed-command-contract` | SOUND (**read**) | 15 types written out |
| `foundation/art-catalog-generator-contract` | SOUND (**read**) | ordering assertion plus real pointer/content fixtures |
| `determinism/ambient-nondeterminism-contract` | SOUND (**read**) — model | *"the patterns are not dead regexes"* case + four in-closure anchors |
| `determinism/canonical-iteration-contract` | SOUND (**read**) — model | floor at the measured value; records replacing a tautological tally with an identity set |
| `determinism/art-pipeline-determinism` | VACUOUS-RISK (**read**), low stakes | only `entryPoints.length > 0` (:99) against 5 entry points; a script renamed off `.py` leaves silently |
| `determinism/loan-ledger-restore-boundary` | SOUND (**read**) | the load-bearing assertions are `canAfford` true-then-false, not the constant |
| `determinism/rng-stream-isolation` | SOUND (**read**) | derivation properties asserted separately from the wiring |
| `determinism/projection-request` | SOUND (**read**) | reply count bounded by `TICKS × PROJECTION_IDS.length`, which is the requested set |
| `determinism/kernel-system-order` | SOUND (**read**) | pin at `:396` → `challenge.ts:69-70` verified, holds |
| `determinism/clock-transport` | SOUND (**read**) | two-run equality with a written-out tick budget |
| `determinism/command-queue-admission` | SOUND (**read**) | records withdrawing an earlier wrong bound |
| `determinism/command-submission-monotonicity` | SOUND (**read**) | monotonic chain over an explicit gesture list |
| `determinism/contended-scan-order` | SOUND (**read**) | fixed four-prisoner scenario, written out |
| `determinism/intelligence-id-allocation` | SOUND (**read**) | ids written out |
| `determinism/iteration-order` | SOUND (**read**) | two independent worlds compared |
| `determinism/job-performing-restart-bound` | SOUND (**read**) | tick lists written out |
| `determinism/kernel-static-restore-boundary` | SOUND (**read**) | floor 200 on the scanned payload |
| `determinism/navigation-cache-agreement` | SOUND (**read**) | eviction counter compared before/after |
| `determinism/navigation-search-tie-breaks` | SOUND (**read**) | fixed door sets |
| `determinism/navigation-shared-plan-equivalence` | SOUND (**read**) | all 256 pairs enumerated |
| `determinism/projection-ordering` | SOUND (**read**) | two-run equality |
| `determinism/protocol-fault-recovery` | SOUND (**read**) | written-out undecodable payloads |
| `determinism/render-delta-publication` | SOUND (**read**) | two-run equality |
| `determinism/room-occupant-ordering` | SOUND (**read**) | written-out orders |
| `determinism/session-replay` | SOUND (**read**) | hash properties both directions |
| `determinism/session-restore-rng-ownership` | SOUND (**read**) | ownership asserted after restore |
| `determinism/snapshot-restore-fidelity` | SOUND (**read**) | eight floors plus round-trip equality |
| `determinism/status-counts-publication` | SOUND (**read**) | publication count bounded by written-out ticks |

**Counts.** 75 examined — the 48 files in `tests/foundation/` and the 27 in `tests/determinism/`. **2 VACUOUS-RISK demonstrated by mutation** (`documentation-claims-`,
`times-sign-`), one of which is also **TAUTOLOGICAL** in its positive control. **1 VACUOUS-RISK by
reading** (`art-pipeline-determinism`, low stakes). **1 walk root that matches nothing**
(`comment-symbol-existence-`, benign direction). **6 ROTTED-PROSE** sites across five files. **2
DRIFTED-PIN** (one of which never drifted). **0 TAUTOLOGICAL** in the sense of instance 1 —
`hud-refresh-cadence-` was the only one and #805 closed it, verified here. Eight mutations run;
**six of the eight gates I tried to break went red**, and the two that did not are §2.

---

## 7. What I changed, and what I only reported

**Changed** (comments only, no assertion, nothing under `src/`): the six rotted tallies and pins in
§4, each keeping the sentence that was believed and stating what is true now beside it, dated.
Verified on this branch after merging `origin/main` at `34f32ed1` (v0.0.359): `tests/foundation/`
**48 passed (48), 457 tests**, `tests/determinism/` **27 passed (27), 181 passed | 1 skipped**, and
both typecheck projects clean — `tsc -b` and `tsc -b tsconfig.tools.json`.

**Reported and deliberately not repaired**, because each changes what CI enforces or lives outside
this branch's surface:

1. `documentation-claims-contract.test.ts:218` — the self-referential positive control, and the
   `> 100` floor beneath it. The fix is a floor at the measured value in
   `canonical-iteration-contract`'s idiom, which is a decision about what CI enforces.
2. `times-sign-contract.test.ts:342` — same, and the more consequential of the two.
3. `comment-symbol-existence-contract.test.ts:395` — `benchmarks/` walked for `['.ts']`. Adding
   `.mjs` widens the vocabulary; that is an assertion-strength change.
4. `src/ui/simulation-events.ts:238` and `:635` — the two comments denying ADR 0084 decision 4.
   `src/` is out of bounds here. Handing this over: it is a two-line comment fix and it is the
   third instance of the same class found in one day, so it should not wait for a sweep.
5. `art-pipeline-determinism.test.ts:99` — `entryPoints.length > 0` against the 5 Blender entry
   points `tooling/blender/` holds.

---

## 8. My weakest claim, and what would change my mind

**The weakest claim in this note is the fifty-odd rows in §6 marked `read`.** They are structural
verdicts: I read every assertion line in all 75 files and read about 35 of them in full, and for
the rest I reasoned from four properties — whether the file makes an emptiness claim, whether it
floors its corpus, whether it compares two independently-read sets, and whether it carries a
fixture that exercises the detector in both directions. That is a real argument and it is not a
measurement, and §2 exists precisely because two files passed that reading and failed the mutation.
**I would expect at least one more VACUOUS-RISK among the `read` rows**, and the shape to look for
is the one both §2 files share: an absence claim over a directory walk, a floor well below the live
corpus, and no expectation that names a path inside the corpus. On that test the next candidates
are `documentation-links-contract`, `documentation-commit-citation-contract` and the workflow half
of `ci-configuration-contract`, in that order.

What would change my mind about §2: an argument that the incidental defences are not incidental —
that `documentation-claims-contract`'s two path-naming expectations were placed to cover the walk,
or that the owner's `×` ruling was never meant to reach beyond the directories `times-sign-contract`
happens to walk. Neither file says so, and I did not find a commit message that does.

What would **not** change my mind: a green suite. That is the whole subject of this note.

**One thing I could not establish.** Whether any of these gates has ever been red in CI for the
reason it names, as opposed to for a fixture drift. That is in Actions run history, not in git, and
`docs/AGENT_WORKFLOW.md` §3's rule about state this repository cannot read applies: it is a
question, not a finding.

**A correlation I reached for and then had to withdraw.** I wanted to close with "the gates that
document their own mutations are the gates that survive being mutated", and my own results falsify
it: 27 of the 75 files mention a mutation, four carry a full *"Watched going red"* section, and
`times-sign-contract.test.ts:88-105` is one of the four **and** is §2b. Its three recorded
mutations are a literal, a spacing and the `MASK` — all content-side, none touching the walk — and
the third is described as *"the detector's own worst failure mode, a scan that quietly stops
finding things, caught by its own gate."* It caught the *lexer* half of that failure mode. The walk
half is what §2b demonstrates. `documentation-claims-contract` is the same story: the mutation it
records is `stripComments = () => ''`, and its docblock reasons carefully that the file-count guard
*"does not close that"* before adding a control that does not close the other direction either.

So the statement that survives contact with the evidence is narrower and, I think, more useful:

> **One file in seventy-five records having mutated its own walk.**
> `adr-quotation-verbatim-contract.test.ts:161` — *"`docs/` dropped from the file walk: **2
> failed**"*. Every other mutation recorded anywhere in these two directories edits the *content*
> the scan reads, never the *set of files* it reads.

That is the blind spot, and it explains why the two exposed gates are the ones with the most
carefully written vacuity reasoning in the directory rather than the least. They mutated what they
were thinking about. Nobody has thought about the walk except once.
