# What difficulty would take — 2026-09-04

**The verdict in one line: the owner asked for a feature they already filed —
[#40](https://github.com/matmaxalez/lockstate/issues/40) specifies it, down to
the parameter categories and the save metadata — and the thing that makes it
expensive is not the numbers, it is that a preset chosen at prison creation
cannot reach the simulation at all today: `simulation/initialize`'s `new`
source is `.strict()` with two fields, and `restoreSimulationRuntime` passes
`createNewSimulationRuntime` nothing but a world.**

Asked because the owner, shown the measurement that a four-prisoner prison
earns +1,120 a day for ever, said:

> ewentualnie można zrobić kilka wersji gry: sandbox, łatwe, średnie, trudne,
> ekstremalnie trudne itp dodać losowe jakieś incydenty itp, zrób research i
> dodaj to jako issues

This is a **reading pass**. Nothing here was played and nothing was run except
the two gates at the end. Every claim is **VERIFIED, read** — a file was opened
at the coordinate given — or **ARITHMETIC** over values so read, and neither
tier is promoted to **MEASURED**.

**The measurements this record leans on are somebody else's**, and it repeats
none of their figures as its own:

- **What pressure there is — 2026-09-04.** The evidence base for everything
  below about what the numbers currently produce. **It is not on `main`**: it
  is a research note on the unmerged branch `measure/what-pressure-there-is`,
  so it is cited here **by title** and never by path.
  `tests/foundation/documentation-links-contract.test.ts` checks that every
  rooted path a document cites exists on disk — correctly — and a path to an
  unlanded file dangles, which is how this paragraph came to be written this
  way rather than the obvious way.
- `docs/research/2026-09-04-can-this-prison-fail.md`, which is on `main`, and
  which measured that three of four prisons cannot fail at all.

Read on `origin/main` at v0.0.467 (`36a5644c`). Every `file:line` below was
opened at that commit. **Nothing in `src/` is changed on this branch** and no
number is chosen: `AGENTS.md`'s standing mandate leaves balance with the owner
under ADR 0017 decision 5 and issue #29, and every value this record proposes
is marked as a proposal.

---

## The answer in five paragraphs

**1. The feature is #40 and #37, not a new idea.** *"[Product] Add transparent
Cozy / reduced-pressure gameplay preset"* was filed by the owner on
2026-08-22 and already asks for *"a versioned difficulty/preset definition
schema with stable IDs"*, for *"explicit parameter categories: starting
resources, income/cost multipliers, needs decay, incident/event intensity,
staff/prisoner tolerance, recovery help, objective/failure policy"*, for
*"new-prison selection, save metadata and clear indication when a
preset/customization is active"*, for *"migration/version behavior and
deterministic replay"*, and for presets to be *"immutable versioned
configuration inputs recorded in prison metadata/snapshots"* with *"no
scattered `if (cozy)` branches"*. The four groups this record was asked to
enumerate are that issue's own list. The owner's new request differs from #40
in exactly two ways: **five levels instead of two**, and **random incidents**,
which is #37 (*"Kronikarz dynamic event pacing"*, which already specifies
*"deterministic candidate scoring/selection through a dedicated named RNG
stream"*).

**2. Incidents are not random and there is no rate, probability or schedule
anywhere in them.** `grep -c rng src/simulation/incidents/*.ts` returns **0**
for all ten files in that tree. An incident opens when a weighted sum of state
crosses a threshold on twelve consecutive samples and the sector's quiet window
has expired — a pure function of the prison. So *"add random incidents"* is not
a tuning change; it is **the first thing in the incident system that draws at
all**, and the whole cost of that is one named RNG stream — a **seventh**, not a
sixth, because six are registered and `docs/DETERMINISM.md` says five (§2.1) —
plus whatever selects from it.

**3. A preset cannot reach the kernel today, and this is the load-bearing
finding.** `newSimulationSourceSchema` is `z.object({ kind, masterSeed
}).strict()` (`src/simulation/protocol/types.ts:201-206`), and the worker's
handler for it is `createNewSimulationRuntime(msg.payload.source.masterSeed)`
with no options object at all (`src/simulation/worker/state-machine.ts:935`).
`SimulationRuntimeOptions` has three fields and none of them is a preset
(`src/simulation/runtime/new-session.ts:391-412`). And `restoreSimulationRuntime`
rebuilds the runtime as `createNewSimulationRuntime(bundle.masterSeed ??
masterSeed, { world })` (`src/simulation/runtime/restore-session.ts:375`) — one
option, the world. **So a save made on "hard" replays as whatever the running
build's compiled-in constants are, and always will, because there is no field
in the bundle for a preset and no parameter on the restore path to receive one.**

**4. The envelope is the wrong place to put it, which is a correction to the
premise this record was given.** `saveEnvelopeMetadataShape` holds seven scalar
fields and no preset (`src/persistence/save-schema.ts:1423-1433`), so the gap is
real — but the worker never receives envelope metadata. `handleInitialize`
reads `snapshot.data`, the *payload*
(`src/simulation/worker/state-machine.ts:1015`). A preset recorded only in
envelope metadata would be visible to the save panel and invisible to the
simulation, which is the exact split that makes a difficulty silently change.
It has to be in the **payload**, and then it is inside `computeSaveChecksum`
(`src/persistence/checksum.ts:9`), which is the property that binds it to the
save.

**5. An ADR is needed and it amends ADR 0038.** ADR 0038 §1 is the rule that
decides what an absent preset means — *"absence is a fact about the save's age
and is honoured with the value the writing build would have held"* — and under
it, plus `docs/PERSISTENCE.md`'s *"Adding an optional field without a version
bump"* (`:70-94`), an optional preset field needs **no `SAVE_SCHEMA_VERSION`
bump and no migration step**: `migrateSaveEnvelopeV4ToV5` spreads
`...metadata` (`src/persistence/save-migrations.ts:337,361`), so every step
carries an unknown metadata field forward untouched. What ADR 0038 does *not*
cover, and what the new ADR is for, is the case its own rule cannot express: a
preset is not a section a build can or cannot *interpret*, it is a set of
values that changes what a tick computes, and ADR 0009 makes *"a recorded
command stream plus a seed **is** the run"* (quoted in
`tests/determinism/session-replay.test.ts:41-44`). Two saves with identical
seeds, identical command streams and different presets are two different runs
that the determinism harness cannot tell apart.

---

## 1. What a preset would have to vary — the inventory, by group

Every row was opened at `36a5644c`. **`readers` counts files under `src/`;
`test files` counts files under `tests/` that name the symbol** — the second
column is the one that costs money, because `AGENTS.md` forbids *"lowering a
pinned floor [or] weakening an assertion"* and several of these are pinned as
literals.

### 1.1 Economy — VERIFIED, read

| constant | value | `file:line` | src readers | test files | has a seam? |
| --- | --- | --- | --- | --- | --- |
| `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS` | `300` | `src/simulation/economy/income.ts:115` | 4 | 6 | **no** — read directly by `stateIncomeForPrisonerDayAt` |
| `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` | `0` | `src/simulation/economy/income.ts:401` | 8 | 13 | **half** — `stateIncomeForPrisonerDayAt(rate, n)` takes it as an argument (`:495`), and `stateIncomeForPrisonerDay` (`:502-504`) is the one production caller and supplies the constant |
| `STATE_INCOME_UNMET_NEED_LEVEL` | `51` | `src/simulation/economy/income.ts:318` | — | — | no |
| `TREASURY_STARTING_BALANCE_MINOR_UNITS` | `25_000` | `src/simulation/economy/treasury.ts:203` | 3 | **19** | **yes** — `Treasury`'s constructor defaults to it (`:606`) |
| `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` | `-2_500` | `src/simulation/economy/treasury.ts:295` | — | — | **partial and inconsistent** — see below |
| `INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS` | `-1_250` | `src/simulation/economy/treasury.ts:354` | — | — | no |
| `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS` | `= deliveries` | `src/simulation/economy/treasury.ts:397` | — | — | no |
| `wageBand.minPerDay` per role | guard `80`, warden `300`, … | `src/content/staff-role-catalog.ts:140,145,150,155,160,165,170,175` | — | — | **yes** — content, and `staffDailyWageForRole` (`src/simulation/economy/wages.ts:44-46`) is the one expression that reads it |

**Three findings inside that table, and each of them changes what a preset can do.**

- **`maxPerDay` is dead weight and the brief's suspicion was right.**
  `grep -rn maxPerDay src/ tests/` outside the catalogue returns exactly one
  production use — the schema refinement `maxPerDay >= minPerDay`
  (`src/content/staff-role-catalog.ts:77`) — and three test fixtures. Nothing
  bills it, nothing displays it, nothing prices against it. **VERIFIED, read.**
  A preset that wanted staff to cost more has to move `minPerDay`, and moving
  it moves the hire charge too, by construction: `staffHireCostMinorUnits`
  delegates to the same expression (`wages.ts:36-46`).
- **The overdraft floor is derived from the grant but is not read through the
  same seam.** `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` is
  `-Math.trunc(TREASURY_STARTING_BALANCE_MINOR_UNITS / 10)`
  (`treasury.ts:295`), and `createNewSimulationRuntime` applies it as
  `treasury.setOverdraftFloor(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS)`
  (`new-session.ts:778`) — the **module constant**, not anything derived from
  the balance the `Treasury` was actually constructed with (`new Treasury()`,
  `:753`). **So a preset that passed a different starting balance through the
  constructor seam would get a floor that is still one tenth of 25,000.**
  ARITHMETIC: a "hard" preset at a 10,000 grant would carry a floor of −2,500,
  a quarter of its grant rather than a tenth.
- **Four test files pin `-2_500` or the ×10 relation as literals**:
  `tests/unit/economy-treasury.test.ts:272-273`,
  `tests/integration/economy-insolvency-ladder.test.ts:222`,
  `tests/integration/economy-liquidity-hard-lock.test.ts:282`,
  `tests/unit/ui-affordability.test.ts:57`. And
  `tests/integration/economy-insolvency-ladder.test.ts:233` asserts
  `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS >
  TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS`. **ARITHMETIC: that inequality puts a
  hard floor of 12,500 under any preset's starting grant**, because at 12,500
  the derived overdraft floor is exactly −1,250 and the inequality is no longer
  strict. A preset that wants a smaller opening grant than 12,500 is not a
  number change; it is a change to how the rungs relate to the floor, which is
  the open question `treasury.ts:653-657` already marks as the owner's
  (*"ruling 19 gave three magnitudes and no ratios"*).

### 1.2 Staffing — VERIFIED, read

| constant | value | `file:line` | seam? |
| --- | --- | --- | --- |
| `DEFAULT_SECTOR_PRISONERS_PER_GUARD` | `8` | `src/simulation/security/sector-staffing.ts:147` | **no** — read inside `resolveOccupancyScaledGuardCount` (`:190`) |
| `DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT` | `1` | `src/simulation/security/default-sector.ts:113` | no |
| `SAFETY_COVERAGE_PROVISION_PER_TICK` | `0.08` | `src/simulation/prisoners/needs.ts:181` | no |
| `SAFETY_COVERAGE_PROVISION_MULTIPLIER` | per coverage rung | `src/simulation/prisoners/needs.ts:194` | no |
| `DEFAULT_GUARD_CAPACITY` | `500` | `src/simulation/runtime/new-session.ts:389` | not exported |
| `DEFAULT_PRISONER_CAPACITY` | `5_000` | `src/simulation/runtime/new-session.ts:387` | no |

`resolveOccupancyScaledGuardCount` is
`Math.max(scheduledGuardCount, Math.ceil(Math.max(0, occupantCount) / 8))`
with an empty-sector exemption in front of it (`sector-staffing.ts:161-191`),
exactly as the brief said, and 12 test files name the constant.

**The staffing group is where the difficulty actually lives, and it is not this
constant.** *What pressure there is* §5.1 measured
that the three prisons staffed to `ceil(n/8)` closed **every** incident by
lapse and the one with five idle guards closed **every** one by containment.
The mechanism is read, not measured, and it is one line: `claimableResponders`
draws from `GuardRoster.unassignedGuardIds()`, and a posted guard is not
unassigned. So a preset that varies `DEFAULT_SECTOR_PRISONERS_PER_GUARD` varies
the number the panel *asks* for and not the number that answers an incident —
which is issue #941 and #893's finding, and it means **the staffing group's
honest lever is `respondersPerSeverityPoint`, which is in the incidents group.**

### 1.3 Needs — VERIFIED, read

`NEED_DECAY_PER_TICK` (`src/simulation/prisoners/needs.ts:112-119`), in whole
levels per tick against `NEED_MAX` 255:

| need | decay/tick | ticks from full to `STATE_INCOME_UNMET_NEED_LEVEL` (51) | in-game days |
| --- | --- | --- | --- |
| bladder | `0.08` | 2,550 | 1.06 |
| hunger | `0.05` | 4,080 | 1.70 |
| safety | `0.05` | 4,080 | 1.70 |
| sleep | `0.03` | 6,800 | 2.83 |
| hygiene | `0.02` | 10,200 | 4.25 |
| recreation | `0.015` | 13,600 | 5.67 |

ARITHMETIC, `(255 − 51) / decay`, at `DAY_LENGTH_TICKS` 2,400
(`src/simulation/prisoners/regime.ts:12`).

**`NEED_SCALE` is the constraint on this group and it is a hard one.**
`NEED_SCALE` is `200` and `NEED_DECAY_SCALED_PER_TICK` is
`Math.round(decay × 200)` (`needs.ts:46,128-130`), with the module's own
docblock stating the invariant: *"Every entry is a whole number at `NEED_SCALE`
= 200, which is the property that makes `decayNeed` exact"*, and the test module
*"asserts that it never has anything else to clear."* **So a preset cannot
multiply the decays by an arbitrary factor** — `0.05 × 1.5 = 0.075` is
`15` scaled and fine, but `0.015 × 1.3 = 0.0195` is `3.9` and would be rounded,
which is the determinism-hostile case the invariant exists to forbid. A needs
preset has to author whole scaled values, or move `NEED_SCALE`, and 17 test
files name `NEED_DECAY_PER_TICK`.

### 1.4 Incidents — VERIFIED, read, and this is the cheap group

| policy / constant | value | `file:line` | seam? |
| --- | --- | --- | --- |
| `DEFAULT_SECTOR_RISK_POLICY.needsPressureWeight` | `1` | `src/simulation/incidents/sector-risk.ts:112` | **yes** |
| `…staffingShortfallWeight` | `0.3` | `:113` | yes |
| `…contrabandPressureWeight` | `0.2` | `:114` | yes |
| `…hotThreshold` | `0.65` | `:115` | yes |
| `…sustainedSamplesRequired` | `12` | `:116` | yes |
| `DEFAULT_INCIDENT_RESPONSE_POLICY.respondersPerSeverityPoint` | `0.5` | `src/simulation/incidents/response-system.ts:26` | yes |
| `…responseDeadlineTicks` | `600` | `:27` | yes |
| `DEFAULT_ASSAULT_POLICY` (4 weights, `threshold: 0.65`) | — | `src/simulation/incidents/flashpoint.ts:181-186` | yes |
| `DEFAULT_ESCAPE_ATTEMPT_POLICY` (3 weights, `threshold: 0.6`) | — | `src/simulation/incidents/flashpoint.ts:248-253` | yes |
| `ESCAPE_ATTEMPT_MINIMUM_RISK_TIER` | `3` | `src/simulation/incidents/flashpoint.ts:113` | no |
| `ASSAULT_PARTICIPANT_COUNT` | `2` | `src/simulation/incidents/flashpoint.ts:343` | no |
| `ASSAULT_SEVERITY_CEILING` | `5` | `src/simulation/incidents/flashpoint.ts:373` | no |
| `retaliationThreshold` | `0.6` | `src/simulation/incidents/trigger-system.ts:262` | **yes**, ctor default |
| `DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT` | `4_800` | `src/simulation/incidents/trigger-system.ts:84` | yes |
| `DEFAULT_SECTOR_QUIET_TICKS_AFTER_ASSAULT` | `2_400` | `:125` | yes |
| `DEFAULT_SECTOR_QUIET_TICKS_AFTER_ESCAPE_ATTEMPT` | `12_000` | `:136` | yes |
| `DEFAULT_MINIMUM_RIOT_PARTICIPANTS` | `2` | `:109` | yes |

**`IncidentTriggerSystem`'s constructor takes eight defaulted parameters**
(`trigger-system.ts:260-281`) and `SectorRiskTracker` and
`IncidentResponseSystem` take their policies as defaulted constructor
arguments (`response-system.ts:115`). **So the incidents group already has the
seam every other group lacks: a preset needs to change nothing but the
arguments `createNewSimulationRuntime` passes.** Six of those constants carry
the phrase *"Directional default, not a balance decision"* in their own
docblocks, which is the strongest available signal that varying them is in
scope and choosing the values is not.

### 1.5 The brief's severity floors are wrong, and the reason matters

The brief said *"incident severity floors (assault ≥3, escape ≥6, riot/gang ≥7,
ceiling 10)"*. **There are no severity floors.** Severity is computed at the
four `openIncident` sites as `Math.max(1, Math.min(ceiling, Math.round(score ×
ceiling)))`:

| type | expression | `file:line` | ceiling | threshold | ARITHMETIC floor |
| --- | --- | --- | --- | --- | --- |
| escape-attempt | `round(score × 10)` | `trigger-system.ts:373` | 10 | `0.6` | **6** |
| assault | `round(score × ASSAULT_SEVERITY_CEILING)` | `:444` | **5** | `0.65` | **3** (`0.65 × 5 = 3.25`) |
| riot | `round(score × 10)` | `:513` | 10 | `0.65` | **7** (`6.5`, rounded up) |
| gang-retaliation | `round(risk × 10)` | `:538` | 10 | `0.6` | **6**, not 7 |

So three of the four numbers in the brief are right and they are **consequences,
not constants** — and gang-retaliation's is 6 because its threshold is `0.6`
and not the riot's `0.65`. **That is the coupling a preset has to be designed
around:** moving a trigger threshold moves the severity of the incidents it
produces, which moves `requiredResponderCount` = `Math.max(1, Math.ceil(severity
× 0.5))` (`response-system.ts:345-346`), which moves how many free guards the
prison needs. One number in a preset moves three things, and a preset author
who does not know that will make "hard" easier by raising a threshold.

---

## 2. Random incidents — what drives them today, and what the phrase would mean

### 2.1 VERIFIED, read — nothing in the incident system draws

`grep -c "rng" src/simulation/incidents/*.ts` returns **0** for all ten files:
`escape.ts`, `flashpoint.ts`, `gangs.ts`, `incident-summary.ts`, `incident.ts`,
`index.ts`, `response-system.ts`, `riot-regime.ts`, `sector-risk.ts`,
`trigger-system.ts`. An incident opens when, and only when:

1. `scoreSectorRisk` — a clamped weighted sum of `needsPressure`,
   `staffingShortfall` and `contrabandPressure` (`sector-risk.ts:120-127`) —
   is at or above `hotThreshold`, **twelve consecutive samples** running
   (`:164`), at the trigger's 50-tick cadence, which is 600 ticks of
   continuously bad conditions; and
2. the sector's per-type quiet window since the last incident of that type has
   expired (`trigger-system.ts:84,125,136`).

`contrabandPressure`'s weight is *"still structurally zero"* by the policy's own
docblock (`sector-risk.ts:100-102`), because `IntelligenceLedger.report`'s only
`src/` caller has no caller. So in practice **two** terms decide every incident
in the game, and one of them (`needsPressure`) reaches `hotThreshold` on its own
only for a prisoner with no accommodation at all — the policy docblock's own
measured ladder, `0.4824` for a housed prison against a `0.65` line.

**A prison is therefore either always about to riot or never able to**, which is
what the measurement note observed from the other side: riots on days 10, 12 and
14 in act B, every one on the same quiet-window cadence.

### 2.2 What "add random incidents" would concretely mean

Given the above, three distinct things wear that name and they have very
different costs.

- **(a) Jitter on an existing trigger.** One draw per sampling point added to
  the score, or to `sustainedSamplesRequired`. This is the smallest change that
  makes the phrase true, and it needs **one named RNG stream**. That is a
  **seventh** stream, not a sixth: the session registers six —
  `prisoners.classification`, `prisoners.sentence`, `contraband.detection`,
  `contraband.intelligence`, `contraband.introduction`, `identity.actor-name`
  (`src/simulation/runtime/new-session.ts:440-483`), pinned longhand in
  `tests/determinism/save-rng-stream-compatibility.test.ts:74`. **Adding one is
  not a save-format change** (ADR 0038 §2, quoted at `new-session.ts:474-480`),
  and the whole cost is extending that pinned test by hand, which is that
  file's own stated purpose.
  - **`docs/DETERMINISM.md` says five and there are six. VERIFIED, read.** The
    sentence *"A session registers five: `contraband.detection`,
    `contraband.intelligence`, `contraband.introduction`, `identity.actor-name`
    and `prisoners.classification`"* was written at `5b99b869` (2026-08-28) and
    became false at `89da98f4` (2026-08-29), *"Draw a sentence at admission
    instead of hard-coding one (ADR 0069) (#541)"*, which added
    `prisoners.sentence`. One day. The same sentence goes on to say *"adding a
    sixth has to fail there before it can ship"* — which is exactly what
    happened, and the document was not updated. Recorded because anyone
    designing a random-incident stream will read that paragraph first.
- **(b) A separate class of event that is not a consequence of the prison at
  all** — an inspection, a transfer, a power cut. This is #37's Kronikarz and it
  is a subsystem, not a constant: a director with eligibility predicates,
  cooldowns, category fatigue and its own persisted state. #37 already
  specifies all of it.
- **(c) Making an incident type that exists actually happen.** There is one
  already built and unreachable, and it is the cheapest item on this whole list.

### 2.3 VERIFIED, read — gang-retaliation cannot fire, and there are three gaps not one

The brief said `GangRegistry.register` has no `src/` caller and `addMember`'s
only caller is `loadSnapshot`. **Both are true and there is a third gap that is
more decisive.** `grep -rn "addGrudge" src/` returns exactly one hit: the method
declaration itself, `src/simulation/incidents/gangs.ts:86`. And
`resolveRetaliationRisk` opens with `if (grudge === 0) return 0`
(`gangs.ts:140`).

**So even a session that seeded gangs and assigned every prisoner to one would
open no retaliation, because nothing in the game can create a grudge.** The
three missing links, in the order they would have to be built:

| link | method | callers in `src/` | `file:line` |
| --- | --- | --- | --- |
| a gang exists | `GangRegistry.register` | none (only `loadSnapshot`, `:123`) | `gangs.ts:26` |
| a prisoner is in one | `GangRegistry.addMember` | none (only `loadSnapshot`, `:124`) | `gangs.ts:37` |
| **one gang has wronged another** | `GangRegistry.addGrudge` | **none at all** | `gangs.ts:86` |

Everything downstream is built and wired: `trigger-system.ts:525-551` walks
`allGrudges()`, sizes the incident, records two `causeFactors`, clears the
grudge; `IncidentLog` persists the type (`save-schema.ts:939`); the protocol
carries the event (`protocol/types.ts:1691,1942`); the locale has the sentence
*"Two gangs are settling a score."* (`default-locale-en.ts:1149`); the HUD
grades it `'danger'` and says why, in a docblock that already states the
unreachability in its own words (`src/ui/simulation-events.ts:107-114`). The
save schema and the incident projection both enumerate all four types.

**This is a whole incident type, a whole player-facing sentence and a whole
severity band that no player can ever see, and the missing part is three
writers.** It is also the only place in this record where a difficulty preset
would have something *new* to vary rather than a number to move.

---

## 3. Determinism and persistence — the four questions, answered

### 3.1 Do these constants feed the replication hash or the determinism fingerprint? **No — and that is the problem, not the reassurance.**

`deterministicStateHash` is FNV-1a over `canonicalJson` of a `JsonValue`
(`src/simulation/determinism/canonical.ts:17-24`). It hashes **state**. The
determinism harness hashes a live runtime's snapshot surfaces
(`tests/helpers/determinism-state.ts`), and `computeSaveChecksum` hashes the
save **payload** and nothing else (`src/persistence/checksum.ts:9`, called at
`save-schema.ts:1765` with `payload` alone). **No constant in §1 appears in any
hash in this repository.**

The consequence, stated as ADR 0009 states it and
`tests/determinism/session-replay.test.ts:41-44` quotes it: *"a recorded command
stream plus a seed **is** the run; re-executing it must reproduce the same state
hash, or determinism itself is broken."* **That identity is false the moment a
preset exists.** Two prisons with the same seed and the same command stream and
different presets produce different states, and nothing in the repository can
tell you which preset produced which — because the thing that varies is not in
the hash and not in the save.

**And the field for it already exists, unused.** `challengeDefinitionSchema`
carries `scenarioId` and `configHash`, the latter documented as *"Hash of the
simulation configuration the scenario runs under"*
(`src/services/challenges/challenge.ts:63,72`), and
`src/services/challenges/verification.ts:176` rejects a submission whose
evidence `configHash` differs. **Nothing in `src/` computes one.**
`grep -rn configHash src/` returns three hits: the schema field, the evidence
field (`evidence.ts:56`) and that comparison. ADR 0009 designed the slot for a
simulation-configuration hash and no producer was ever written, because until
now there was one configuration.

### 3.2 Does the envelope have anywhere to record which preset a prison was created under? **No, and the envelope is the wrong place anyway.**

`saveEnvelopeMetadataShape` (`src/persistence/save-schema.ts:1423-1433`) is
seven fields: `saveSchemaVersion`, `gameVersion`, `prisonId`, `revision`,
`createdAt`, `updatedAt`, `checksum`. All five envelope schemas are `.strict()`
(`:1444-1471`) and all five are built from that one shared helper, whose own
docblock says *"only the version field differs between them, so the remaining
six rules cannot drift apart across versions"*.

`gameVersion` is the closest thing and it does not do this job. It is
`lockstate-<version>-<commit>` (`src/shared/build-identity.ts:76-88`), and
`src/main.ts:129-134` states its status in its own words: *"`gameVersion` is
validated by `identifierSchema` and is **never compared for equality on load** —
nothing in `src/persistence/**` reads it back to decide whether a save is
loadable."* It records which build wrote the save and gates nothing.

**But the decisive fact is the one the brief did not have: the worker never sees
envelope metadata.** `handleInitialize` restores from
`msg.payload.source.snapshot.data` — the payload
(`src/simulation/worker/state-machine.ts:944,1015`) — and the metadata stays on
the main thread. So a preset in envelope metadata would show correctly in the
save panel and have **zero** effect on the simulation, which is a worse failure
than not recording it at all.

**Where it has to go, and what each placement costs:**

| placement | worker sees it? | in the checksum? | `SAVE_SCHEMA_VERSION` bump? | migration edits |
| --- | --- | --- | --- | --- |
| envelope metadata only | **no** | no | no | **0** (`...metadata` is spread by every step: `save-migrations.ts:337,361`) |
| payload, optional section | **yes** | **yes** | **no**, under `docs/PERSISTENCE.md:70-94` if absent means the shipped constants | 0 |
| payload, required | yes | yes | **yes** | one step, and every fixture |

**Recommendation: an optional payload section, plus the envelope metadata field
as a *derived copy* for the save panel to read without decoding a payload** —
which is exactly the reason `saveEnvelopeMetadataShape` exists as a separate
schema in the first place (its docblock: *"re-walking a multi-megabyte payload
only to check seven scalar metadata fields was measured as roughly a third of a
save (#49)"*). The payload copy is authoritative; the metadata copy is a label.
Whether they may disagree is a decision for the ADR.

### 3.3 Is there any existing notion of a scenario or preset? **A name, a field and a telemetry row — no concept.**

- **`gameplay.scenario-completed`** is a registered telemetry event whose
  purpose reads *"Aggregate completion rates for scenario/tutorial design"*
  (`src/services/telemetry/events.ts:121-123`). `grep -rn scenario-completed
  src/` returns that definition and nothing else. **No emitter.**
- **`scenarioId` and `configHash`** are real Zod fields on the challenge
  definition (§3.1). No producer.
- **The word "scenario" appears in about forty `src/` docblocks as a
  hypothetical future author** — *"session/scenario setup re-registers the
  instances"*, *"a scenario running its own catalog"*, *"a future scenario
  author"*. The sharpest of them is `src/simulation/runtime/new-session.ts:1066`,
  which puts default content in `src/` *"instead of waiting for a scenario
  format that does not exist."* **That is the repository saying so in its own
  words.**
- **The one real precedent is `loanTerms`, and it is a warning.**
  `SimulationRuntimeOptions.loanTerms` (`new-session.ts:403-411`) is exactly the
  shape a preset would take — an optional bundle of balance parameters, whose
  docblock says *"Omitted everywhere in `src/`: no magnitude for any of the
  three has been chosen, and choosing one is #29's under ADR 0017 decision 5."*
  And `grep -rn "loanTerms" src/persistence/ src/simulation/runtime/restore-session.ts`
  returns **nothing**: it is not persisted and `restoreSimulationRuntime` does
  not pass it. **The one existing per-session balance parameter already has the
  exact bug a difficulty preset would inherit**, and it is invisible today only
  because nothing supplies it.
- **"Sandbox" is already taken.** Issue #41 track B uses it to mean the base
  mode — *"how this coexists with unlimited sandbox prisons"*, and *"Replacing
  sandbox mode with seasons"* is listed out of scope. The owner's "sandbox" as
  a difficulty level collides with that, and the naming is theirs to settle.

### 3.4 Does `tests/migrations/` tell you what adding a field to the envelope costs? **Yes: almost nothing for metadata, and the real cost is elsewhere.**

`tests/migrations/` is seven files, 2,000 lines, covering v1→v2→v3→v4→v5 and the
full chain. What it shows:

- Each `migrateSaveEnvelopeVnToVn+1` destructures
  `{ saveSchemaVersion: _v, checksum: _c, payload, ...metadata }` and returns
  `{ saveSchemaVersion: n+1, ...metadata, checksum: computeSaveChecksum(payload),
  payload }` (`src/persistence/save-migrations.ts:337,359-364`). **An unknown
  metadata field rides through untouched, with no edit to any step.**
- `checksum` is recomputed from the payload only, so a metadata field is
  checksum-neutral and no fixture's checksum moves.
- Adding an *optional* field to the shared `saveEnvelopeMetadataShape` adds it
  to all five versions at once, including V1. That is odd but harmless under
  `.strict()`; making it V5-only means breaking the shared helper the
  repository deliberately built to stop the versions drifting.

**So the migration cost is near zero and the brief's framing of this as "the
load-bearing gap" is half right.** The load-bearing gap is not the envelope
field; it is the **three call sites that would have to receive it**:
`newSimulationSourceSchema` (`protocol/types.ts:201-206`, `.strict()`),
`handleInitialize`'s `new` branch (`state-machine.ts:935`), and
`restoreSimulationRuntime` (`restore-session.ts:375`). Two of those are the
worker protocol boundary, which `CLAUDE.md` names explicitly.

---

## 4. Once or mid-game — the technical answer, and a recommendation

**The technical fact, stated plainly: nothing breaks the replication hash,
because no constant is in it (§3.1). What a mid-game change breaks is the
*meaning* of the prison's history.**

A save records the state a prison reached, not the rules it reached it under.
Change a constant at tick 40,000 and the save is still internally consistent,
still checksums, still restores — and the treasury balance in it was earned
under one rule while every later boundary is priced under another, with nothing
in the file recording where the seam is. For ADR 0009's replay verification the
consequence is sharper: a run's evidence is a seed plus a command stream, and a
mid-game preset change is neither, so **a replay of that stream cannot
reproduce that run at all** unless the change is itself a command in the stream.

Which gives the answer:

- **Chosen once at creation** is the cheap option and the honest one. The preset
  becomes part of what identifies the prison, `configHash` gets its producer,
  and a replay is reproducible.
- **Changeable mid-game** is only correct if the change is a **command** —
  submitted through the kernel's command queue with an `executeAtTick`,
  recorded in the stream, replayed in order. That is not a large amount of
  code (it is a fourteenth gesture) but it is a real design commitment: every
  system that reads a preset value has to read it live rather than capture it at
  construction, which is the opposite of how `IncidentTriggerSystem`'s eight
  constructor parameters work today.

**Recommendation: chosen once at prison creation, with the mid-game change
deferred and named.** Not because mid-game is impossible, but because the
constructor-injection seam that makes the incidents group cheap (§1.4) is
exactly the seam a mid-game change invalidates, and doing both at once means
doing the expensive one. **This is a recommendation and not a decision: it is
product design and it is the owner's.**

---

## 5. Sandbox deserves its own paragraph, and it is the hardest of the five

The brief asked whether sandbox is the easiest to ship or the hardest. **Read,
it is the hardest, and the reason is one guard clause.**

- **`Treasury.credit` throws `RangeError` if `balance + amount` leaves the safe
  integer range** (`src/simulation/economy/treasury.ts:744-746`). A sandbox
  that opened at or near `Number.MAX_SAFE_INTEGER` would fault at the **first
  day boundary**, when `StateIncomeSystem` credits — and out of a system tick
  that is an `internal-error` worker fault, i.e. the session is over.
- **`Treasury`'s constructor refuses a non-safe-integer balance**
  (`:607-609`), so `Infinity` is not expressible. "Unlimited funds" cannot be a
  number.
- **`setOverdraftFloor` refuses anything that is not a non-positive safe
  integer** (`:628-631`), so `-Infinity` is not expressible either.
- **The insolvency rungs do not scale with the floor, deliberately.**
  `rungFloorMinorUnits` is `Math.max(rungs[spendClass], overdraftFloor)`
  (`:566-570`), and the docblock says what that means: *"What the clamp
  deliberately does not do is **scale** the rungs with the floor. That is the
  amendment's open question, marked there as the owner's."* So a sandbox with a
  deep floor still hits `-1,250` construction and delivery rungs.

**So "unlimited funds" has to be a behaviour, not a value** — either
`canAfford` returning `true` unconditionally for a sandbox preset, or a
`StateIncomeSystem` that tops the balance up rather than crediting. Both are
new code paths in the one class the whole economy's single comparison lives in
(`canAfford` is *"the one bound the whole economy was written against"*,
`:635-641`), and both are exactly the *"scattered `if (cozy)` branches"* #40
forbids by name.

**The cheap half of sandbox is real and worth separating.** "No penalty, no
wages" *is* just constants: `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS`
at `0` — which is where it is **today** — and `wageBand.minPerDay` at `0` for
every role, which `staffDailyWageForRole` would return and `PayrollSystem` would
bill as nothing. `wageBandSchema` is `z.number().int().nonnegative()`
(`staff-role-catalog.ts:73-74`), so zero is already legal. A "no bills"
sandbox needs no new code at all. **An "infinite money" sandbox needs a new
concept in `Treasury`.** Those are two different features sharing one name, and
the issue set below splits them.

---

## 6. What is the owner's, what is ours

Separated as `AGENTS.md`'s standing mandate requires.

**The owner's, and this record chooses none of them:**

- **Every number, at every level.** ADR 0017 decision 5 and issue #29 hold
  balance, and six of the incident constants say *"Directional default, not a
  balance decision"* in their own docblocks. §7 below proposes a starting point
  and marks it as one.
- **How many levels and what they are called.** The owner named five. #40 named
  two (`standard`, `cozy`). #41 already uses "sandbox" for the base mode. Which
  set ships, and whether `cozy` and `easy` are the same level, is product design.
- **Whether a preset is a promise to the player.** A level called "extremely
  hard" that a prison cannot actually lose in is `AGENTS.md`'s fourth
  exclusion — a player-visible promise the code does not keep — and
  `docs/research/2026-09-04-can-this-prison-fail.md` measured that three of four
  prisons cannot fail. **The hardest level is the one that has to be measured
  before it can be named.**
- **Whether the preset is chosen once or changeable** (§4 recommends once).

**Ours to decide after research, and what the ADR would record:**

- Where a preset lives (a content module beside `staff-role-catalog.ts`, or a
  a new difficulty-catalogue module under `src/content/`), and whether it is a `ContentRegistry`
  entry like every other catalogue.
- How a save carries it (§3.2 recommends an optional payload section with a
  derived metadata label).
- How the kernel reads it — construction-time injection into the seams that
  exist, and new seams for the four groups that lack them.
- Whether `configHash` finally gets a producer, which is the smallest change
  that makes ADR 0009's replay verification honest again.
- Whether a preset field the running build does not recognise is refused or
  ignored. **ADR 0038 §1 says refused** — *"a value the build cannot interpret
  is a fact about the blob and is refused"* — and that is the answer this record
  recommends, because the alternative is a save silently downgrading.

**Nothing in this record decides anything.** The one place it came close is §4's
recommendation and §3.2's, and both are marked.

---

## 7. A proposed starting point — A PROPOSAL, NOT A DECISION

**Every number below is the owner's and none of them is chosen here.** They are
offered so the owner has something to argue with rather than a blank table, and
each one says what it is derived from. `docs/research/README.md`'s rule about
inventing figures applies: no value here is presented as measured.

The proposal is that a preset varies **four fields, one per group**, and not
forty. A preset with one knob per group is testable; a preset with forty is a
second balance surface.

| group | the one field | shipped | proposed sandbox | easy | medium | hard | extreme |
| --- | --- | --- | --- | --- | --- | --- | --- |
| economy | `withheldPerUnmetNeed` | `0` | `0` | `20` | **`40`** | `60` | `80` |
| staffing | `prisonersPerGuard` | `8` | `16` | `12` | **`8`** | `6` | `4` |
| needs | scaled-decay multiplier | ×1 | ×0.5 | ×0.75 | **×1** | ×1.5 | ×2 |
| incidents | `sustainedSamplesRequired` | `12` | `24` | `18` | **`12`** | `8` | `6` |

**What each column is derived from, stated so it can be checked:**

- **`medium` is the shipped tree with the penalty restored to `40`.** That is
  the owner's own ruling of 2026-09-04, taken after the fifty-prisoner
  measurement, so medium is not a new balance — it is the balance already
  decided. Every other column is a departure from it.
- **`withheldPerUnmetNeed` at 40 is measured, once.** `40` is the value ADR 0064
  shipped and *What pressure there is* §2 measured
  the whole schedule of: `[300, 260, 220, 180, 140, 100, 60]`. `80` is the
  largest value at which the `Math.max(0, …)` clamp still never binds for a
  prison with a guard, because the staffed floor is five unmet needs and
  `300 − 80 × 5 = −100` **does** bind — so **`80` is past the boundary and
  `60` is the last safe value** (ARITHMETIC; `income.ts:488` and §4 of that
  note, which measured `safety` full in every act). The `extreme` cell is
  therefore flagged rather than proposed: at `80` a five-unmet prisoner earns
  nothing and the clamp the docblock says *"never binds (pinned by test)"*
  starts binding. **That pinned test is what an extreme preset would have to
  answer to.**
- **`prisonersPerGuard` is bounded above by capacity.** `sector-staffing.ts:143`
  states the bound: at `DEFAULT_PRISONER_CAPACITY` 5,000 a value of 8 asks for
  625 guards against `DEFAULT_GUARD_CAPACITY` 500. ARITHMETIC: at 4 it asks for
  1,250, two and a half times the roster ceiling. **So the `extreme` column
  needs `DEFAULT_GUARD_CAPACITY` raised or it is unreachable at scale**, which
  is a fifth thing a preset varies and is why it is proposed as the group's one
  field rather than as free.
- **The needs multiplier is proposed as a factor on the *scaled* values rather
  than the authored ones, and three of its four cells do not work.** §1.3's
  invariant is that every entry of `NEED_DECAY_SCALED_PER_TICK` is whole at
  `NEED_SCALE` 200. The six scaled decays are therefore
  `hunger 10, sleep 6, hygiene 4, bladder 16, safety 10, recreation 3`
  (ARITHMETIC, `NEED_DECAY_PER_TICK × 200`). Against those:

  | factor | fails for | why |
  | --- | --- | --- |
  | ×0.5 | `recreation` | `3 × 0.5 = 1.5` |
  | ×0.75 | `hunger`, `sleep`, `safety`, `recreation` | `10 × 0.75 = 7.5`, `6 × 0.75 = 4.5`, `3 × 0.75 = 2.25` |
  | ×1.5 | `recreation` | `3 × 1.5 = 4.5` |
  | ×2 | — | every entry doubles cleanly |

  **So ×2 is the only one of the four that keeps the invariant, and the needs
  group cannot be a multiplier at all** unless `NEED_SCALE` moves,
  `recreation`'s `0.015` is re-authored, or a preset authors six whole scaled
  values per level instead of one factor. Left in the table with the failure
  named rather than quietly rounded, because `Math.round` in
  `NEED_DECAY_SCALED_PER_TICK` (`needs.ts:128-130`) would swallow all three
  silently and the module's docblock says its test *"asserts that it never has
  anything else to clear."*
- **`sustainedSamplesRequired` is a window in ticks and reads as time.** 12
  samples at the 50-tick cadence is 600 ticks, a quarter of an in-game day
  (`sector-risk.ts:106-109`). 24 is half a day; 6 is an eighth. This is the
  most legible of the four to a player and the least likely to interact.

**Three of the twenty cells above do not work and this record says so rather
than shipping a plausible table:** the economy row's `extreme` (`80` makes the
income clamp bind, which a test pins as never binding), the staffing row's
`extreme` (`4` asks for 1,250 guards against a roster ceiling of 500), and
**three of the four needs factors** (only ×2 keeps `NEED_SCALE`'s invariant).

That is the point of proposing it. The owner should see that *"just multiply
the constants"* does not survive contact with `NEED_SCALE`, with the income
clamp or with `DEFAULT_GUARD_CAPACITY`, **before** anyone builds a preset
schema that assumes a multiplier is a legal thing to put in it. A schema that
accepts factors and rounds them is the determinism hazard `needs.ts`'s own
docblock exists to prevent, and it would pass every test in the repository.

---

## 8. The weakest claim here, and what would refute it

**The weakest claim is §1.4's — that the incidents group is cheap because
`IncidentTriggerSystem`, `SectorRiskTracker` and `IncidentResponseSystem` all
take their policies as constructor arguments.** It is a claim about a *seam*
read off three constructor signatures, and a seam is not a working preset. What
it does not establish:

- that the values are actually *reachable* from `createNewSimulationRuntime` —
  this record read the constructors, not every call site's argument list, and
  `trigger-system.ts:255-258` says there are *"four in the repository"*;
- that varying them produces a different game rather than a differently-scored
  one that plays identically, which §1.2's finding about the responder pool
  suggests is a live risk: if no free guard ever answers, changing incident
  frequency changes how often the prison is told about something it cannot
  affect;
- that any of it survives a restore, since `restoreSimulationRuntime` passes
  only `{ world }`.

**What would refute it:** a single run that constructs a session with
`hotThreshold` at 0.4 and one at 0.9 and compares the incident counts. If they
are the same, the seam is decorative. That is a two-hour integration test and
this record did not write it, because writing one is implementation and this was
a reading pass.

**A second, smaller weak claim:** §2.1's *"nothing in the incident system
draws"* rests on `grep -c "rng"` over one directory. A draw reached through an
injected collaborator whose parameter is not called `rng` would not appear. What
would refute it: `IncidentTriggerSystem`'s constructor taking a stream by
another name — read at `trigger-system.ts:238-278` and it does not, but the
grep alone would not have told me.

**And a claim this record deliberately does not make:** that any preset would
make the game better. *What pressure there is*'s §8
raises the possibility that the settled five-of-six-unmet composition every act
reached is produced by the **incident system** rather than by the player's
neglect — a riot forbids every need-serving action but recreation — and if that
is right, a difficulty preset that varies incident frequency is varying the
needs group too, through a path nobody has measured. **That inference is theirs,
it is untested, and it is the single thing most likely to make this whole
inventory the wrong shape.**

---

## 9. The gates this branch was held to

Run in this worktree, on this branch, with nothing else running:

```
$ node /workspace/lockstate/node_modules/typescript/bin/tsc -b --pretty false
$ echo $?
0

$ node /workspace/lockstate/node_modules/vitest/vitest.mjs run tests/foundation
 Test Files  52 passed (52)
      Tests  475 passed (475)
   Duration  17.61s
```

**One of them caught a real defect in this document and it is worth recording,
because it is the mechanism `docs/AGENT_WORKFLOW.md` §4 exists for.** The first
run of `tests/foundation` was **1 failed | 474 passed**:
`documentation-links-contract.test.ts` reported five dangling rooted paths, all
from this file — four citations of the measurement note this record leans on,
which lives on an **unmerged** branch and therefore is not on disk, and one
citation of a module that does not exist yet — a `difficulty-catalog.ts` under
`src/content/`, named as a *possible* home for a preset catalogue rather than
as a file anybody has written. Both classes are exactly what that contract is for: a research note
citing a file nobody can open. Fixed by citing the unmerged note **by title**
and by naming the directory rather than a file that has not been written.

**And Git LFS content is present in this worktree**, so the caution some briefs
carry about `verify:assets` in a worktree does not apply here:

```
$ file public/assets/actors/actor.guard.base.idle.png
public/assets/actors/actor.guard.base.idle.png: PNG image data, 260 x 3104, 8-bit/color RGBA, non-interlaced
```

Nothing in this record depends on that — no pixel was read and no browser was
run — and it is recorded only so the next agent in this worktree does not
re-derive it.
