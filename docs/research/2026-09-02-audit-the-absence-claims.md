# 2026-09-02 — Auditing the repository's absence claims

**Question.** `docs/AGENT_WORKFLOW.md` §4 names the failure mode: *"a sentence
asserting an absence or a count rots first."* This is a sweep for such
sentences across the repository — ADRs, `docs/*.md`, `docs/research/`, and
comments/docblocks in `src/` and `tests/` — each checked mechanically against
the code rather than read and trusted. It is not itself a decision record; it
feeds no ADR. It exists because `docs/research/README.md` is where dated,
tiered evidence belongs, and this sweep's findings are exactly that shape.

Worked on `docs/audit-the-absence-claims`, cut from `origin/main` at
v0.0.380 (`1eb1b5b6`).

**Evidence tiers used below.** `docs/research/README.md`'s own tiers
(VERIFIED / SEARCH-SUMMARY / FROM MEMORY / UNKNOWN) are for sourcing claims
about the *outside world*; this sweep is entirely about claims inside this
repository, so it uses the two the brief for this task asked for instead:
**MEASURED** — a command was run against the tree and its output is quoted or
described exactly; and **READ** — the claim was read and reasoned about but
not independently re-derived by a command. Every MEASURED claim below names
the command. READ is explicitly weaker and is marked as such inline; nothing
below is asserted at a tier stronger than what was actually done.

## Candidate set and coverage

**Candidates found, by bounded search:** the sweep was bounded to three
areas rather than attempted as an unbounded grep of the whole corpus, because
a keyword sweep for "no/nothing/never/only/exactly" over `*.md` and `*.ts`
matches **826 files** in this repository (MEASURED:
`grep -rEcIf <pattern-file> -l` over `src/`, `tests/` and `docs/`) — most of them
correct uses of those words, and a large fraction already self-policed by a
dedicated contract test (see below). The three bounded areas, each swept to
completion:

1. **Every ADR's own `## Status` section, all 89 files under `docs/adr/`**,
   grepped for `implement` inside the status block specifically (`awk` window
   of the first ~7 lines after the heading), then each Proposed ADR whose
   status claims an absence checked against `src/`/`tests/` and against the
   git history since the ADR was drafted. **9 candidates found** (0066, 0076,
   0084, 0091, 0092, 0093, plus three false positives from the loose `awk`
   window that turned out to be `README.md`/`STATUS-QUEUE.md` matches, not
   ADR files). All 9 verified.
2. **`docs/adr/README.md`'s own row for every Proposed ADR** — the same
   status-claim question, asked of the index rather than the document. Swept
   together with (1) since the two are meant to agree
   (`tests/foundation/adr-numbering-contract.test.ts` polices the status
   *word*, not the prose around it).
3. **A grep for absence-claim phrases (`has no caller`, `no reader`, `nothing
   calls`, `never reached`, `has no producer`, etc.) across `src/` and
   `tests/`**, which returned roughly **150 lines**. Of these, the large
   majority are the subject of a dedicated, currently-passing contract test
   (`unconsumed-content-contract`, `unconsumed-command-contract`,
   `unreachable-invariant-contract`, `projection-reachability-contract`,
   `job-production-contract`, `room-routing-contract`,
   `trusted-tier-reachability-contract`, `message-kind-reachability-contract`,
   `fault-code-reachability-contract`, `composition-root-contract`, and
   others) that re-derives the claim from `src/` on every run and fails if it
   goes stale — this repository has built exactly the guard §4 recommends for
   its highest-traffic absence claims. **12 of these were spot-checked by
   independent grep** rather than by trusting the contract test's own green
   run (a gate can itself be wrong about what it gates — see the
   `adr-status-reference-contract` case below); all 12 held.
4. `STATUS-QUEUE.md` (10,290 lines) was **read, not swept** — it is itself a
   chronicle of exactly this defect, already carries more self-corrections of
   this kind than the rest of the repository combined, and its own header
   says a document under active edit is the least durable thing to cite by
   `file:line`. One specific claim from it is checked below (§2's "is the
   only one" sentence) because the task brief named it by number; the rest of
   the file is READ, not MEASURED, and is not separately reported.
   `docs/research/*.md` (dated, historical, exempt from correction by that
   directory's own stated rule) and the `AGENT_WORKFLOW.md`/`AGENTS.md`
   contract files themselves were read for context, not swept as candidates.

**Coverage stated honestly: candidates found and disposed of in areas 1-2 is
9/9 (100% of that bounded set). Area 3 is 12 spot-checks out of ~150 grep
hits — a bounded partial sweep, not a claim of completeness.** Everything
outside these three areas (the remaining ~650 files the loose keyword grep
matched, all of `docs/*.md` beyond the spot checks named below, all of
`docs/research/`, and `STATUS-QUEUE.md`'s interior) was not swept by this
pass. That is the honest boundary of this sweep, not a claim that nothing
there rots.

## Falsified — ranked by authority

### 1. `docs/adr/0092-who-decides-where-a-guard-stands.md:5` and `docs/adr/README.md:250` — one half fixed independently mid-sweep, the other still open

**Claim (verbatim, ADR, as it read at v0.0.380 when this sweep started):**
*"Proposed, 2026-09-02. Not self-approved. Nothing below is implemented and
no code on this branch does any of it; the branch carries this document, the
research record it rests on, and one contract test that pins the absences the
document is about."*

**Claim (verbatim, index row — unchanged, still on `main` at v0.0.381
(`838a8e4f`), the version this correction ships against):** *"Proposed,
2026-09-02. Not self-approved, and nothing in it is implemented — the branch carries the
document, `docs/research/2026-09-02-where-a-guard-stands.md`, and one contract
test pinning the absences it is about."*

**MEASURED, disproved by:**

```
git log --oneline --all -- src/simulation/runtime/session-systems.ts | head
# 4a53d292 fix(security): the save wins over the derivation for a sector definition (#825)

git show --stat 4a53d292 | grep -i adr
# (no docs/adr/ path in the diff — the commit never opens ADR 0092)

grep -n "public redefine(" src/simulation/security/sector.ts
# 115:  public redefine(
```

The commit that implements ADR 0092 decision 3 — *"the save payload is
authoritative for a sector definition it carries"* — is `4a53d292`
(`fix(security): the save wins over the derivation for a sector definition`,
merged as **#825**, not #829 as the assignment brief that dispatched this
sweep named it; see "Corrections to the brief" below — #829 turned out to be
a *different* commit, see next paragraph). It adds
`SecuritySectorRegistry.redefine` and makes `restoreSessionSystems` call it on
a sector id the runtime already holds — exactly decision 2's narrow mutator
and decision 3's rule — and cites "ADR 0092 decision 3" by name, in prose, in
both its commit message and the comment block it leaves in
`src/simulation/runtime/session-systems.ts` (`:703-745` at this tree). It
never touches any file under `docs/adr/`. So the ADR's own Status line and the
index's summary of it were **both false the moment that commit merged**,
while neither the ADR nor the index moved — exactly the shape §4 warns about,
and it sat inside the ADR's own status line, the one sentence in the corpus
whose entire job is to say what is and is not implemented.

**Race condition, caught live.** This sweep found the ADR's own Status line
stale (MEASURED, as above) while working on `origin/main` at v0.0.380
(`1eb1b5b6`) and drafted a correction for it, following the same reasoning as
below. Before that correction was pushed, `git fetch origin main` (run
immediately before merging into this worktree, per this task's own
instructions) turned up **`origin/main` had already moved to v0.0.381**, via
`2e1f0225` — *"docs: ADR 0092's status said no code implements it, and one
decision had shipped (#829)"* — a commit that fixes exactly this half of the
finding, independently, the same day, crediting the same discovery
(`docs/adr/STATUS-QUEUE.md`'s v0.0.377 anchor caught it and handed it back,
per that commit's own message). **This sweep's own draft fix to the ADR file
is therefore withdrawn as redundant** rather than pushed as a competing
edit — `docs/AGENT_WORKFLOW.md`'s "already fixed, here are the numbers" is the
right response to finding your own finding has landed first, not a duplicate
commit. The withdrawn draft is not reproduced here since `2e1f0225` covers the
same ground more completely (it also states, correctly, that 7 of 8 decisions
remain unimplemented — this sweep's draft did not go that far).

**What #829 did not touch, and is still false on `main` at v0.0.381: the
index row.** `docs/adr/README.md:250` still opens *"and nothing in it is
implemented"* after `2e1f0225` — that commit's diff is scoped to
`docs/adr/0092-who-decides-where-a-guard-stands.md` alone (MEASURED:
`git show --stat 2e1f0225`, one file). So the exact defect `2e1f0225`'s own
commit message names — *"an ADR that says 'nothing here is implemented' ...
is the one claim in an ADR that a pull request can invalidate without
touching the ADR at all, and no gate in this repository re-reads it when a
decision ships"* — reproduced itself one file over, inside the very commit
that diagnosed it, because the index row makes the identical claim in
different words and was not in scope for that fix. **This is the standing
finding of this sweep**, corrected below.

**Why the existing gates did not catch either half.**
`tests/foundation/adr-status-reference-contract.test.ts` matches a **status
word** (`Proposed`/`Accepted`/…) in predicative position; "nothing is
implemented" carries no status word and is invisible to it by the gate's own
stated design (`tests/foundation/adr-status-reference-contract.test.ts:36-51`
enumerates exactly this class of claim it does not catch, under "an ADR
narrating its own history"). `tests/foundation/adr-numbering-contract.test.ts`
checks that the ADR and the index **agree with each other**, not that either
is true about `main` — the two disagreed after `2e1f0225` (one corrected, one
not) and neither gate reads deeply enough to say so.

**Corrected in place**, this pass, for the surviving half only (both
directions marked, status word left untouched — `docs/AGENT_WORKFLOW.md` §3
reserves `Proposed → Accepted` for the owner and forbids self-approval): see
the `docs/adr/README.md` row for 0092. `./node_modules/.bin/tsc -b` and
`./node_modules/.bin/tsc -b tsconfig.tools.json` both clean after the edit;
`tests/foundation/adr-numbering-contract.test.ts`,
`tests/foundation/adr-status-reference-contract.test.ts` and
`tests/foundation/adr-status-queue-anchor-contract.test.ts` re-run together
after the edit: **20/20 passed** (2.57s), on top of `origin/main`'s v0.0.381
(`838a8e4f`). The correction does not flip `Proposed` to `Accepted` and does not touch any
of the seven decisions the owner has not ruled on beyond decision 3.

**What this is not.** ADR 0092's own body, further down, already correctly
documents that the owner ruled on five of its seven questions on 2026-09-02
and that decision 3 was one of them (*"The owner ruled on five of these"*
section, `:52-158`) — that section is accurate and was not touched. Only the
index row, written before decision 3 shipped and never revisited when it did,
had gone stale.

## Verified as still TRUE (what makes this sweep trustworthy)

Each of these was an absence/count claim that looked, on first read, exactly
like the shape this sweep was hunting — and each held under a command.

- **`docs/adr/0093-a-carry-is-an-action.md:3-6`**, the identical boilerplate
  ("Nothing below is implemented and no code on this branch does any of it")
  for a different ADR. MEASURED: `grep -rln "ADR 0093\|0093-a-carry-is-an-action" src/ tests/`
  returns only the one contract test that *pins the incoherence* (does not
  implement a fix), and `grep -rn "submitCarryItem\|jobWorkers\.register\b" src/`
  returns only the definitions, no callers. Still true.
- **`src/ui/simulation-events.ts:110-112`** and
  **`src/simulation/incidents/trigger-system.ts:212-213`**, both claiming
  *"nothing in `src/` seeds a gang"* / *"`GangRegistry` entries nothing in
  `src/` writes"*. MEASURED: `grep -rn "addMember\|addGrudge\|\.register(" `
  against `GangRegistry`'s call sites across `src/` finds only `gangs.ts`'s
  own `loadSnapshot` calling its own `addMember`/`register` — no other file
  registers a gang definition, adds a member, or adds a grudge. Still true.
- **`docs/HUD_PROJECTIONS.md:830`** and its twin in
  `tests/foundation/projection-reachability-contract.test.ts:79,325-327`,
  listing `hud/security` and `hud/incidents` among six projections with **no
  reader**. MEASURED: `grep -rl "'hud/security'" src/ui/` and
  `grep -rl "'hud/incidents'" src/ui/` both return nothing; the ids exist only
  in `protocol/types.ts` and `worker/projection-catalog.ts`, never on the read
  side. Still true.
- **`docs/adr/0091-what-clears-the-refusal-band.md`**, Status line claiming
  decision 1 *"is already implemented on this branch."* MEASURED:
  `zoneAreaSupersessionKey` and `zoneRefusalSupersessionKey` both exist in
  `src/simulation/refusals/refusal-log.ts` and are both imported and called
  from `src/simulation/runtime/session-commands.ts:26-27,164-191`. True.
- **`tests/foundation/unconsumed-content-contract.test.ts:76-107`**'s
  docblock, which the task brief flagged by name (*"Two entries, not
  three"*): this is **already correctly self-corrected** in the file — the
  original ("Two entries...") is kept as a quoted historical claim, followed
  by a dated correction ("One entry, and the sentence above it used to say
  two") that matches the current `PROTECTED_BY_DECISION` object's single key.
  READ, cross-checked against the object literal in the same file (one key,
  `room.storage-room`) — MEASURED via `grep -c` on the object body. Not a live
  defect; an example of §4 done right, left untouched.
- **`src/ui/simulation-events.ts:233-260`**'s docblock on `applyEventNotice`
  arbitration: also already self-corrected in place, with the superseded
  claim quoted and a dated note that `EVENT_BAND_DWELL_FLOOR_MS` in
  `hud/event-band-dwell.ts` closed it. READ; not independently re-derived
  beyond confirming the file exists and is imported (MEASURED:
  `grep -n "EVENT_BAND_DWELL_FLOOR_MS" src/ui/hud/event-band-dwell.ts`).
- **`docs/adr/STATUS-QUEUE.md`'s own §2 "is the only one" sentence**, the
  second instance the task brief named by number (*"there are 39"*).
  MEASURED: `grep -cE '^\|.*\| *\*{0,2}Proposed' docs/adr/README.md` returns
  **39** at this tree's tip, v0.0.380 (`1eb1b5b6`), and `STATUS-QUEUE.md`
  already carries
  this exact correction, dated to the v0.0.372 anchor (`b2941064`), stating
  the same number (39 Proposed, 48 Accepted, 87 rows) with both directions
  marked. Re-measured 8 releases later at the current tip: the count has not
  moved, so the existing correction is still current. This is not a new
  finding — it is confirmation that a real instance of the exact failure the
  brief described was already caught and correctly fixed, in place, before
  this sweep began.

## Corrections to the brief this sweep was given

- **PR #829 exists and is real, but it is not the commit the brief described.**
  At the moment this sweep started (`origin/main` @ v0.0.380, `1eb1b5b6`), no
  `(#829)` was reachable by `git log --oneline --all` and the commit that
  *implements* ADR 0092 decision 3 — `fix(security): the save wins over the
  derivation for a sector definition` — is `4a53d292`, merged as **#825**.
  While this sweep was in progress, `origin/main` advanced to v0.0.381 via
  `2e1f0225`, which *is* PR #829, and *is* the exact correction this sweep
  was drafting for the ADR's own Status line — filed, per its own message, by
  a `STATUS-QUEUE.md` anchor pass that caught the same defect independently.
  So the brief's account merged two real things into one number: #825 broke
  the sentence, #829 partially fixed it, and only #829 carries that number.
  The substance was exactly right throughout — same ADR, same claim, same
  failure of one pull request to open the document the other implements.
- **The `STATUS-QUEUE.md` §2 "only one" / "39" example was already fixed on
  `main` before this sweep started**, as shown above. It is real (the brief
  was right that it happened), and it is not still-outstanding work — worth
  saying because the brief's phrasing ("today this principle paid out…") could
  be read either way.

## What would change my mind

- A wider sweep of `docs/*.md` beyond the files spot-checked above (this pass
  read `PERSISTENCE.md`, `CLOUD_SAVE.md`, `SECURITY.md`, `INCIDENTS.md`,
  `NAVIGATION.md`, `CONTENT.md`, `OPERATIONS.md`, `PRISONER_OPERATIONS.md`,
  `ROADMAP.md`, `ISSUE_BACKLOG.md` for the same keyword set but did not
  independently re-derive every hit) could surface more instances of this
  same shape; none of the hits read in those files looked live-false, but
  "looked fine on read" is the weaker tier this note is explicit about.
- The ~138 grep hits in area 3 not individually spot-checked are presumed
  sound because they sit behind a passing, code-deriving contract test — that
  presumption would break if one of those contract tests were itself found to
  be checking the wrong thing (as `adr-status-reference-contract.test.ts` was
  shown above to check status *words* and not implementation-status prose).
  A next pass could target contract-test *design* gaps of that shape
  specifically, rather than the comments they guard.
