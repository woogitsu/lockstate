# 04 — Architecture & ADR-Compliance Audit

**Repository:** `/workspace/lockstate` @ `fcecad2` (v0.0.108)
**Scope:** AGENTS.md architectural boundaries, ADR corpus drift, boundary-enforcing tests, coupling/structure, layering, extensibility, docs↔code truth.
**Method:** read `AGENTS.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/adr/README.md`, `docs/adr/STATUS-QUEUE.md`, all 33 ADR files, the 8 named boundary tests, and verified every claim against source. Import graph computed mechanically (cycle/fan-in/fan-out, tree-level edges). Boundary + ADR gate suite executed: **12 files / 119 tests, all green**.
**Read-only:** no file under `/workspace/lockstate` was modified.

Counts: **2 High · 5 Medium · 6 Low · 2 Informational**.

---

## (a) AGENTS.md architectural boundaries — compliance table

| # | Boundary | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Rendering is not simulation; Phaser must never become the source of truth | **Upheld** | Only three trees import Phaser: `src/rendering/phaser/**`, `src/rendering/scene/**`, and `src/main.ts:1`. Every other `src/rendering` module is Phaser-free and gated (`tests/unit/rendering-module-boundaries.test.ts:78-86`). No module in `src/ui/**`, `src/input/**` or `src/rendering/**` constructs a runtime — checked against a *catalog validated against what `src/simulation/**` actually exports* (`tests/unit/module-boundary-rules.test.ts:376-402`), which closes the #206 defect where `new SimulationRuntime` named an interface and could never fire. The simulation's whole transitive import closure is scanned for Phaser/DOM/clock/locale with `ALLOWED_PACKAGES = ['zod']` and a both-directions check (`tests/determinism/ambient-nondeterminism-contract.test.ts:94,186-198`). The renderer is fed only by snapshot polling (`src/rendering/feed/simulation-snapshot-feed.ts`). **This is the best-enforced rule in the repository.** |
| 2 | Simulation state serializable, versioned, deterministic | **Upheld** | `SAVE_SCHEMA_VERSION = 5` (`src/persistence/save-schema.ts:34`); V1–V5 schemas each registered once and never edited (`:1157-1161`); checksum + forward-only chain. Determinism: `FORBIDDEN` list covers `Math.random`, `Date.now`, `new Date`, `performance.now`, crypto randomness, `Intl.*`, `toLocale*`, `localeCompare`, `navigator`, `document`, `window`, storage, `process.env`, Phaser — over the transitive closure, with a **two-entry** justified allowlist (`tests/determinism/ambient-nondeterminism-contract.test.ts:39-73`). |
| 3 | Main thread owns rendering, browser UI, input orchestration | **Partially** | Satisfied in thread terms. But the *input pipeline is owned by a Phaser scene*: `src/rendering/scene/world-scene.ts:203` constructs `TouchGestureTracker` and `:259` calls `loadInputSettings(...)` — so input orchestration lives inside the renderer rather than beside it. Consequence: no non-canvas surface can be driven by the action layer, and remapping has no host (see ARC-13). Also: `src/main.ts` — the module where "orchestration" actually lives — is covered by **no** cross-tree or construction boundary gate (ARC-01, ARC-04). |
| 4 | Simulation worker owns ticks and authoritative in-session state | **Upheld, with a dead protocol state** | Production wires `WorkerPerSessionHost` (`src/main.ts:7`, pinned by `tests/foundation/composition-root-contract.test.ts` entry "each session gets a simulation worker of its own"); `InProcessSessionHost` exists for tests/headless only. `SessionController` never owns a runtime — snapshot-in/snapshot-out (`src/persistence/session/runtime-host.ts:26-59`). **But** `'ready'` is a declared `WorkerState` (`src/simulation/worker/state-machine.ts:28`) that no `transition()` call targets (the file makes exactly four: `:455`, `:566`, `:601`, `:825`), and nothing in `src/` *sends* `protocol/handshake` — see ARC-05. |
| 5 | Persistence consumes explicit snapshots; must not reach into renderer internals | **Upheld** | Zero imports from `src/persistence/**` into `src/rendering/**` or `src/ui/**` (verified by full import-graph enumeration). The host contract is `startNew` / `startFromSnapshot` / `capture` / `stop` and nothing else (`src/persistence/session/runtime-host.ts:43-59`). `src/persistence/cloud/**` is unreachable from the app, asserted by `tests/foundation/documentation-claims-contract.test.ts:428`. |
| 6 | Content definitions in data modules, not hard-coded condition chains | **Partially** | The *shape* is right: eight registry-backed catalogs under `src/content/`, import-time cross-catalogue validation, message keys derived rather than hand-authored (`src/content/simulation-message-keys.ts`), and adding 17 buildables + 15 room types touched exactly **two** `src/` files (`b097e70`: `src/main.ts` +16, `src/simulation/construction/definition.ts` +401). Two placement problems: (i) `BUILDABLE_REGISTRY` — 21 rows of pure content — is authored in `src/simulation/construction/definition.ts:83`, not `src/content/`; (ii) all six `src/content/*-catalog.ts` files value-import `identifierSchema` from `src/simulation/protocol/types.ts:47`, making `content` a non-leaf layer in a **tree-level cycle with `simulation`** (ARC-03). |
| 7 | Every persistent format versioned with a migration strategy before release | **Upheld** | Save envelope V1–V5 with a registered forward-only chain and fixture tests (`tests/migrations/`); `INPUT_SETTINGS_VERSION` on input settings; `SESSION_SNAPSHOT_SCHEMA_ID`/`_VERSION` on the worker bundle; `HUD_VIEW_MODEL_SCHEMA_ID`/`_VERSION` on projections (`src/simulation/presentation/view-model.ts:24-26`). |
| 8 | World storage is chunked; no monolithic map matrix | **Upheld** | `SparseWorld` holds five `Map<string, Uint8Array>` keyed per chunk plus a chunk-state map and a parcel map (`src/simulation/world/sparse-world.ts:266-272`). Production chunk size 32 (`src/simulation/runtime/new-session.ts:241`), ceiling `WORLD_CHUNK_SIZE_LIMIT = 64` (`src/simulation/world/coordinates.ts:71`), settled by ADR 0004 with benchmarks. RLE terrain encoding for transport. No full-world array anywhere. |
| 9 | Pathfinding budgeted and hierarchical; no unrestricted full-map A* per agent per frame | **Upheld** | Three tiers: region/portal Dijkstra (`src/simulation/navigation/router.ts:5-6`, `region-dijkstra.ts`), `boundedLocalSearch` restricted to the regions the plan crosses (`router.ts:207-214`), and a route cache. Work-unit budget is 2,000 node expansions per tick (`src/simulation/runtime/new-session.ts:66`), accounted at `src/simulation/navigation/path-request-queue.ts:171-244` with forward-progress guarantee. Flow-field sharing for shared destinations (`path-request-queue.ts:199`). All six route producers go through `requestRoute`, never `findRoute` directly. `tests/unit/navigation-no-phaser.test.ts` pins the tree Phaser/DOM-free. |
| 10 | Input supports remapping, QWERTY/AZERTY and touch/pointer | **Partially** | Model is complete and correct: physical `KeyboardEvent.code` bindings with an explicit AZERTY note (`src/input/bindings.ts:56-61`), `getLayoutMap()` label resolution (`:96-102`), conflict detection (`:111`), versioned validated settings (`src/input/settings.ts`), pointer and touch adapters both wired into the scene. **But the remap path has no production caller:** `remapAndPersistKeyboardBinding` (`src/input/storage.ts:145`) and `resolveKeyboardLabel` (`src/input/bindings.ts:96`) are reached only from tests. No settings surface exists, so no action is remappable by a player today. |

**Verdict: 7 upheld, 3 partially upheld, 0 violated.** The three partials are reachability/placement gaps, not architectural inversions.

---

## (b) ADR drift table

33 ADR files on disk (0018 genuinely absent and documented; **0030 is absent and still held by an unmerged branch** — `docs/adr/README.md:132`). All 33 carry `Accepted` in some form; `adr-numbering-contract.test.ts` and `adr-status-reference-contract.test.ts` both pass.

| ADR | Status says | Code says | Drift class |
| --- | --- | --- | --- |
| 0003 dec. 4 | Version negotiation over `protocol/handshake` | No sender anywhere in `src/`; all nine occurrences are receiver/schema/kind-list (`state-machine.ts:472,502`). Compatibility fails closed by `protocolVersion: z.literal(...)` instead. | Accepted, unimplemented — **ADR carries an implementation note** (`0003:433`) |
| 0006 state 2 | `'ready'` is a worker state | Declared (`state-machine.ts:28`), unreachable — no `transition()` targets it | Accepted, unreachable — note at `0006:19` |
| 0009 | "Accepted — implementation gated" | All four gates genuinely shut; no port, no endpoint, no importer outside `src/services/` | **Model status.** No drift |
| 0010 | "Accepted" — plain | Whole telemetry layer inert: nothing outside `src/services/telemetry/` imports it, no consent prompt, `record()` has no caller. The ADR sentence "telemetry is fed from the main thread's orchestration layer" is false | Accepted, unimplemented, **and the status does not say so** → ARC-10 |
| 0012 | Derived-identifier reproducibility, category 2 | Eviction shipped (`rooms/topology.ts:72,99`), so the *id* rule holds — but `TopologyManager.update()` has no caller at all, so the mechanism the ADR reasons about never runs in a session | Accepted; premise runs nowhere → ARC-08 |
| 0013 | "Accepted — §§5-6 still proposed" | §§1-4 enforced in SQL; §5 (256 MiB/account) and §6 (20 revisions) absent from `supabase/migrations/**`. §6's own arithmetic is withdrawn in the ADR (20 revisions at 30 s autosave = 10 min, not "a day") | Honest partial acceptance. The **one genuinely open decision** in the corpus |
| 0016 §2 | Binding constraint: production is a separate Supabase project | Nothing enforces it; migrations reach the hosted staging project on every merge with gating "none". The ADR says so itself | Accepted, unenforceable — watch item, correctly filed |
| 0022 | "Accepted — as amended; Decision §1 superseded" | Rooms tab shipped (`src/ui/hud/rooms-panel.ts`); Decision §1 left verbatim as history | **Exemplary supersession-in-place.** Structural citations inside the body have drifted (see below) |
| 0023 / 0027 | Accepted | Both bodies still assert "object placement does not exist" (`0023:204-205`, `0027:81`). Falsified by ADR 0028 phase 1. 0027 carries a dated Update above the stale sentence; 0023 does not | Stale premise inside an Accepted body |
| 0026 / 0027 | "Accepted as the framing/mechanism; three questions stay open" | Correct. 0026's tripwire now genuinely detects what it claims (`entity-generation-wrap.test.ts:124`) | Honest. No drift |
| 0028 | Accepted | Phases 1-3, 5(half), 6 landed; phase 4 landed in `b097e70` (21 `BUILDABLE_REGISTRY` rows) | Tracked in-ADR with three amendments |
| 0031 | "Accepted — with open question 4 promoted to **blocking**" | The blocking condition ("the catalogue needs a surface before more rows arrive") was addressed by #390/#395 and settled by 0035 | Resolved; README still reads as if outstanding in places |
| 0034 / 0035 | "Accepted — **by delegation**" | Implemented (`ReleaseGuardAssignment`, category filter) | Weaker warrant than the word "Accepted" implies. Disclosed, which is the right call → ARC-06 |
| 0002 | Accepted; config matches (`wrangler.jsonc:12,20`) | `lockstate.io` is in fact served by Worker `lockstate-staging`; Worker `lockstate` has never been deployed (`docs/DEPLOYMENT.md:167,172`) | Live operational trap; warning present in ADR body `0002:31-38` |
| 0022 body | `HudIntent` "declares **seven** members" at `hud.ts:153-195` | **18** members at `src/ui/hud/hud.ts:271-536` | Structural citation drift (documented) |
| 0027 q. 2 | "the entire command surface is seven members" | **13** at `src/simulation/protocol/commands.ts:437-451` | Structural citation drift; STATUS-QUEUE's correction to "eleven" is itself now stale → ARC-07 |

### The STATUS-QUEUE process — is it being followed?

**No, and the file says so.** Its own §2 heading has read "empty / one entry / empty / one / two / one / empty" and now records that **four ADRs (0032, 0033, 0034, 0035) were accepted without ever appearing in the queue** (`docs/adr/STATUS-QUEUE.md:339-361`) — against three that did use it (0029, 0031, 0007's amendment). That is the git-log line *"the queue rule has now failed four times"* (`1dcee50`). The file's diagnosis is correct and worth quoting: the rule *"any commit that adds an outstanding ADR adds an entry here in the same commit"* **is unsatisfiable under concurrency** — one writer holds the file, a second change must either edit it or break the rule. The named structural fix — *"one file per entry in a directory, so two commits can add two entries without touching each other"* (`:356-358`) — is **not implemented**. This is a real process problem, not bookkeeping: the queue is the *only* mechanism that tells the owner a decision is pending (an amendment to an Accepted ADR changes no `Status` line and is invisible to every mechanical gate), and it is now bypassed more often than it is used. See ARC-06.

---

## (c) Findings

### ARC-01 — `src/main.ts` is an ungated 2,168-line composition root with a 1,215-line function
**Severity: High · CONFIRMED**

- `src/main.ts` is the largest file in the repository (2,168 lines; ~633 non-comment code lines — 71 % comment).
- `mountInterface` spans `src/main.ts:853-2067` — one function, ~341 code lines, containing a 13-case `onIntent` switch at `:1350-1721`.
- It is not purely wiring. It derives three HUD catalogues itself: `buildCatalogue()` `:560`, `staffRoster()` `:650`, `roomCatalogue()` `:718`, plus `buildableLabelKey()` `:403`, `buildableCategory()` `:454`, `purchasableMaterialFor()` `:528` — reading `BUILDABLE_REGISTRY`, `defaultObjectRegistry`, `defaultRoomContentRegistry`, `defaultStaffRoleRegistry`, `procurableMaterial`, `enclosureRequirement`, `minimumSizeRequirement`, `MAX_PURCHASE_QUANTITY` and `staffHireCostMinorUnits` directly (`:57-72`). Highest fan-out in the tree: 43 modules.
- **It is the only tree under `src/` that no boundary gate reaches.** `rendering-module-boundaries` covers `src/rendering`, `ui-orchestration-boundaries` covers `src/ui/*.ts`, `ui-hud-messages` covers `src/ui/hud|primitives`, `input-module-boundaries` covers `src/input`, `services-layer-boundaries` covers `src/services`, `ambient-nondeterminism-contract` covers the `src/simulation` closure. Nothing scans `src/main.ts` for construction sites. `composition-root-contract.test.ts` asserts only that ten specific wirings are *written*, and says so explicitly (`:31-40`).

**Why it matters:** the module most likely to be tempted into building a second in-process simulation (it already imports the content and simulation registries) is the one module with no construction gate. And a 1,215-line function is where reviewer attention runs out — `mountInterface` is where every new panel, reader and intent case lands, so it grows monotonically with feature count.

**Fix:** (1) add `src/main.ts` to `reportConstructionSites` coverage — a five-line addition to an existing gate, and it makes the strongest boundary in the repo actually total; (2) extract the three catalogue derivations into a new `catalogues/` tree under `src/ui/` (they are pure functions over static content and already have no simulation-state dependency), and move each intent case's body next to its reader — `onIntent` becomes a dispatch table rather than a switch.

---

### ARC-02 — Adding one player-facing command costs 16 `src/` files and four gate-test edits
**Severity: High · CONFIRMED**

Measured on `8dc95eb` (`CancelMaterialPurchase` + `hud/pending-deliveries`), 36 files / 2,954 insertions. The `src/` chain, in order:

1. `src/simulation/protocol/commands.ts` — schema + union member (`:164`, `:437-451`)
2. `src/simulation/protocol/types.ts` — `PROJECTION_IDS` entry (`:314`), refusal reason
3. `src/simulation/refusals/refusal-log.ts` + `refusals/index.ts` — reason enum
4. `src/simulation/runtime/session-commands.ts` — handler branch
5. `src/simulation/economy/procurement.ts` (+ `economy/index.ts`) — the domain call
6. `src/simulation/presentation/…-projection.ts` — the read model
7. `src/simulation/presentation/index.ts` — barrel
8. `src/simulation/worker/projection-catalog.ts` — source wiring
9. `src/ui/simulation-….ts` — main-thread translator
10. `src/ui/hud/hud.ts` — `HudIntent` member + dispatch
11. `src/ui/hud/view-model.ts` — view model
12. `src/ui/hud/….ts` — DOM
13. `src/ui/hud/messages.ts` — message keys
14. `src/ui/hud/projection.ts` — display descriptors
15. `src/ui/hud/hud.css`
16. `src/content/default-locale-en.ts` — strings
17. `src/main.ts` — `onIntent` case + reader construction + label lookup

Plus four gate lists that must be updated by hand: `tests/foundation/unconsumed-command-contract.test.ts`, `tests/foundation/projection-reachability-contract.test.ts`, the `ALLOWED_FOREIGN_TREES` manifest in `tests/unit/ui-orchestration-boundaries.test.ts`, and sometimes `composition-root-contract.test.ts`.

**Why it matters:** this is the dominant cost of every gameplay feature, and it scales with nothing — it is a fixed 16-file tax. Three of the hops (9, 10, 11) are mechanical renames of the same record, and hops 2/3/13 are three parallel string tables keyed off the same identifier.

**Fix:** the cheapest high-leverage change is to derive the plumbing from the command schema rather than hand-writing it — `src/content/simulation-message-keys.ts` already proves the pattern works (`deriveSimulationMessageKey` makes a message key a function of a namespace and an id, and the repo's own boundary manifest cites that as the reason to allow the one value dependency). Extending the same derivation to the `HudIntent` member, the refusal-reason key and the locale key would collapse hops 3, 10 and 13. Separately, a per-feature slice directory (`src/features/<name>/{projection,translator,panel}.ts`) would make the remaining hops co-located and reviewable as one diff, without weakening any tree boundary — the boundary gates key on *tree*, not on directory depth, so this needs the gates' `subtreeOf` logic extended, not relaxed.

---

### ARC-03 — `content` and `services` depend on `simulation` for two generic primitives, creating a tree-level cycle
**Severity: Medium · CONFIRMED**

- `identifierSchema` (`src/simulation/protocol/types.ts:47`) and `DeepReadonly` (`:32`) live in the simulation's protocol module. 23 files import `identifierSchema`; 13 import `DeepReadonly`.
- All six `src/content/*-catalog.ts` files value-import it (`room-catalog.ts:2`, `object-catalog.ts:2`, `item-catalog.ts:2`, `staff-role-catalog.ts:2`, `contraband-catalog.ts:2`, `security-grade-catalog.ts:2`).
- Eight `src/services/**` modules do the same (`entitlements/projection.ts:3`, `entitlements/events.ts:2`, `entitlements/products.ts:2`, `entitlements/webhook.ts:2`, `telemetry/events.ts:2`, `localization/catalog.ts:3`, `challenges/challenge.ts:3`, `challenges/evidence.ts:9`).
- Measured tree edges: `content -> simulation` value=6, `simulation -> content` value=26. **A cycle at the layer level**, even though there is no file-level runtime cycle (verified: 2 file cycles total, both type-only; **0 value cycles** across all 197 source files).
- Same root cause forces an acknowledged duplication: `filledSegments` in `src/ui/primitives/segmented-bar.ts:47` deliberately re-implements `toBoundedValue`'s rule from `src/simulation/presentation/view-model.ts` because `src/ui/primitives/**` may not import `src/simulation/**` at all (`segmented-bar.ts:30-36`). Mitigated by `tests/unit/segment-fill-agreement.test.ts`, which is the right mitigation for the wrong problem.
- `src/shared/` — the layer that should hold these — is 3 files and 224 lines.

**Why it matters:** it makes `content` non-substitutable (you cannot ship a content pack without the simulation protocol module) and it means the "trusted services run in a tab, a worker and a server function" claim in `docs/ARCHITECTURE.md` is only true because the simulation protocol module happens to be dependency-light. The next thing added to `protocol/types.ts` (998 lines, fan-in 35 — the second-highest in the tree) is inherited by `content` and `services` for free.

**Fix:** move `identifierSchema`, `DeepReadonly` and the bounded-value rule into `src/shared/` (`identifiers.ts`, `types.ts`, `bounded-value.ts`); re-export from `protocol/types.ts` for one release so no call site changes in the same commit. That deletes the `content -> simulation` edge entirely, removes 8 of 12 `services -> simulation` imports, and lets `segmented-bar.ts` import the rule instead of copying it — retiring `segment-fill-agreement.test.ts` rather than maintaining it.

---

### ARC-04 — Boundary-gate coverage is not total, and nothing asserts that it is
**Severity: Medium · CONFIRMED**

`tests/unit/ui-orchestration-boundaries.test.ts:222-243` asserts the beautiful property that *the whole of `src/ui/` is inside one of two gates* — "a `src/ui/…/` subtree that neither this file nor `ui-hud-messages.test.ts` collects fails here, rather than being discovered by the next audit." **There is no analogue one level up.** Trees with no cross-tree dependency manifest and no construction gate:

- `src/main.ts` (root) — see ARC-01
- `src/rendering/**` — value-imports 9 simulation symbols across 4 files, including `BUILDABLE_REGISTRY` at `src/rendering/world/appearance.ts:3` and `DEFAULT_TERRAIN_DEFINITIONS` at `:4`; also value-imports `src/input` (`scene/world-scene.ts:3-9`) and `src/content` (`appearance.ts:1-2`). None of it is recorded with a reason the way `src/ui`'s 28 cross-tree dependencies are. `rendering-module-boundaries.test.ts` checks only three things: no Phaser outside `phaser/`+`scene/`, no construction sites, and no literal `simulation/submit-command` — and its own comment (`:107-118`) admits the layering inversion it cannot see.
- `src/persistence/**` — 24 imports of `src/simulation/**` including `createNewSimulationRuntime` / `restoreSimulationRuntime` (`session/runtime-host.ts:1-2`). Legitimate, but unrecorded.
- `src/content/**`, `src/shared/**` — no gate at all.

**Why it matters:** #206's finding was *"two trees were outside every boundary test and no document said so."* The same shape is live one level up, and the repo has already built the exact mechanism to close it.

**Fix:** add a single `src-tree-coverage.test.ts` under `tests/unit/` that enumerates the immediate children of `src/` plus root-level `.ts` files and asserts each appears in a declared gate registry — the mirror of `covers the whole of src/ui/ between the two gates`. Then give `src/rendering/**` a `CrossTreeAllowance` manifest (the `findCrossTreeDependencies` / `reportCrossTreeViolations` helpers already exist and fail in all three directions), which would capture the input-ownership inversion in ARC-03/Boundary 3 as a reviewable line rather than folklore.

---

### ARC-05 — The dead handshake has an unrecorded consequence: the worker's build identity never reaches the main thread
**Severity: Medium · CONFIRMED**

The handshake gap itself is known and documented (`docs/adr/0003…:433`, `0006:19`, `STATUS-QUEUE.md` §5). The consequence below is not recorded anywhere:

- `workerBuildId` is carried **only** on `protocol/handshake-accepted` (`src/simulation/protocol/types.ts:428`), produced only in `handleHandshake` (`src/simulation/worker/state-machine.ts:502-513`).
- Nothing in `src/` sends `protocol/handshake`, so `handleHandshake` never runs.
- Therefore `src/simulation/worker/worker.ts:19`'s `const BUILD_ID = BUILD_IDENTITY.id` is computed, passed to the state machine and never observed. The file's own claim at `:7-15` — *"so a handshake, a save file and the screen cannot disagree about which build is running"* — is false: only two of the three paths carry it (`src/main.ts:95` → save envelope `gameVersion`, and `src/ui/brand-badge.ts:77` → the badge).

**Why it matters:** this is the diagnostic that tells you a stale worker bundle is running against a fresh page — exactly the failure a code-split worker build produces — and it is silently unavailable. It also means the `identifierSchema` validation on `workerBuildId` (`types.ts:428`) has never executed against a real value.

**Fix:** send the handshake from `SimulationWorkerChannel` before `simulation/initialize` and assert the returned `workerBuildId` equals `BUILD_IDENTITY.id`, refusing the session on mismatch — this makes `'ready'` reachable, gives ADR 0003 decision 4 its negotiation, and closes issue #274 Q4 in the direction that adds a real check. If the decision goes the other way, delete `'ready'`, the handshake pair and `workerBuildId`, and correct `worker.ts:7-15` in the same commit.

---

### ARC-06 — The ADR status-queue rule has failed 4 of 7 times; its diagnosed fix is unimplemented
**Severity: Medium · CONFIRMED**

- Rule (`docs/adr/STATUS-QUEUE.md:274-277`): any commit adding an outstanding ADR adds a queue entry in the same commit.
- Worked: 0029, 0031, 0007's amendment. Failed: **0032, 0033, 0034, 0035** (`:339-361`).
- Cause, correctly identified by the file itself: *"The rule as written is unsatisfiable under concurrency"* (`:367-376`) — a single file two changes cannot both append to.
- Named fix, not built: *"one file per entry in a directory, so two commits can add two entries without touching each other, and so 'the file is held' stops being a reason"* (`:356-358`). No such directory exists (`docs/adr/` contains only ADRs + `README.md` + `STATUS-QUEUE.md`, enforced by `adr-numbering-contract.test.ts`).
- Compounding: an **amendment** to an Accepted ADR changes no `Status` line, so it is invisible to every mechanical gate (`README.md:70-79`); the queue row was the only record it existed, and deleting the row on acceptance re-opens the gap. ADR 0008 §2 gained two dated rulings in `#382` with no queue row at all, and `STATUS-QUEUE.md` files the question of whether "applies an accepted decision" and "amends an accepted decision" are distinguishable as **undecided**.
- Related: 0034 and 0035 are Accepted **by delegation rather than by the owner reading them** — disclosed in both Statuses and in the README, which is the honest handling, but it means 2 of 33 accepted decisions carry a materially weaker warrant than the word implies.

**Why it matters:** ADR governance *is* architecture governance here — `CLAUDE.md` requires agents to treat ADRs as the source of truth and forbids deciding architecture inside implementation code. If the only signal that a decision is pending is bypassed 4 times in 7, agents will implement against unapproved decisions (which is precisely what happened with 0031: code shipped while `:5` still read "Proposed — pending human approval").

**Fix:** implement the fix the file already argues for — `docs/adr/queue/NNNN-….md`, one file per outstanding decision, with `STATUS-QUEUE.md` reduced to the anchor + §§3-6 residue. Extend `adr-numbering-contract.test.ts` to allow that directory, and add one assertion: **every ADR or amendment whose approval state is anything other than plainly accepted must have a file in that `queue/` directory** — a mechanical trigger, which is the thing the current rule lacks. Amendments become visible by giving each one its own `Status`-bearing stub, which is the only shape the existing gates can count.

---

### ARC-07 — `STATUS-QUEUE.md` contradicts itself and its code citations are stale, with the staleness gate at exactly its budget
**Severity: Medium · CONFIRMED**

Internal contradictions, all live at `fcecad2`:

| Location | Says |
| --- | --- |
| `docs/adr/STATUS-QUEUE.md:1` (title) | "**One decision is awaiting approval**" |
| `:11` | "§2 holds **the one decision awaiting approval — ADR 0031**" |
| `:254` (§2 heading) | "**The queue is empty**" |
| `:561` (§5 preamble) | "**The queue is not empty** — §2 holds **two** entries" |
| `:634` | "the queue's one pending entry is ADR 0031" |

Stale code citations in §5 (all verified against source):

| §5 claim | Reality |
| --- | --- |
| `:917` — `simulationCommandSchema` at `commands.ts:348-360` "discriminates **eleven**" | **13** members at `src/simulation/protocol/commands.ts:437-451` (`CancelMaterialPurchase`, `ReleaseGuardAssignment` added since) |
| `:870` — `HudIntent` "declares **sixteen** members", union runs `hud.ts:270-491` | **18** members, `src/ui/hud/hud.ts:271-536` |

Staleness gate: the anchor line names **v0.0.98**; `package.json` ships **0.0.108**. `ANCHOR_STALENESS_BUDGET_RELEASES = 10` (`tests/foundation/adr-status-queue-anchor-contract.test.ts:89`) and the assertion is `toBeLessThanOrEqual` — so the gate is green at exactly 10 and **the next release commit breaks it**. The file's own §§3-6 were last read against `dbe271f`; the two drifts above landed after it, which is the drift the gate is a proxy for, already measurable while the gate is still green.

**Why it matters:** this is the one document written to be the owner's decision surface. A reader hitting five mutually inconsistent statements about how many decisions are pending cannot use it for its purpose, and the two stale counts are exactly the failure mode the file itself names as *"the least durable citation this corpus has"* (`:896-900`).

**Fix:** re-anchor at `fcecad2` with the delta read that §"How to extend this anchor cheaply" prescribes — `git diff dbe271f..HEAD --name-only` intersected with the 41-file dependency set, which is the cheap path the file already designed. In the same commit: make the title and `:11` agree with `:254`, withdraw `:561`'s "two entries" premise, and replace the two counts with the symbol-plus-source-of-truth form the file already prefers (`simulationCommandSchema.options.length`, `HudIntent`'s union) rather than a hand count. Longer term the cheap gate is a test asserting that a prose count naming a schema union equals that union's length — the repo already parses `simulationCommandSchema.options` in `unconsumed-command-contract.test.ts:190`.

---

### ARC-08 — `TopologyManager` + `enclosure.ts` are instantiated, exposed on the runtime, and never driven
**Severity: Low · CONFIRMED**

- `new TopologyManager(world)` at `src/simulation/runtime/new-session.ts:246`, exposed on the runtime record at `:565`, declared on the interface at `:117`.
- `update()` — the method that does all the work (`src/simulation/rooms/topology.ts:56-77`, including `evictUnloadedTopologies` `:94-101` and `recomputeGlobalTopology`) has **no caller anywhere in `src/`**. The tree says so itself: `src/simulation/rooms/enclosure.ts:31`.
- It is not registered as a kernel system and no other module reads `runtime.topology`.
- 447 lines across the two files. ADR 0012's category-2 reproducibility argument for `GlobalTopologyId`, and ADR 0022's enclosure discussion, both reason about code that never runs in a session.

**Why it matters:** an instantiated-but-undriven subsystem reads as live to the next reader, and it is on the interface that every session-restore path must keep satisfying. The eviction fix landed in #324 against a mechanism nothing exercises.

**Fix:** either register it as a kernel system on the geometry-revision cadence (which is what `update()`'s signature expects) or remove it from `SimulationRuntime` and keep it as an unwired module with a one-line header saying so — the repo's own `AWAITING_PRODUCER` / `AWAITING_CONSUMER` idiom is the right home for the fact.

---

### ARC-09 — Nine of fifteen read models are fully built with no reader
**Severity: Low · CONFIRMED**

`PROJECTION_IDS` declares 15 (`src/simulation/protocol/types.ts:314-331`). All 15 have a projection function, a `projection-catalog.ts` source wiring and a protocol route. Only 6 have a UI reader: `hud/room-list`, `hud/room-detail`, `hud/build-queue`, `hud/pending-deliveries`, `hud/held-guards`, `hud/prisoner-population`. No reader: `hud/prisoner-roster`, `hud/prisoner-detail`, `hud/staff`, `hud/security`, `hud/contraband`, `hud/incidents`, `hud/incident-detail`, `world/render-snapshot`, and `hud/status-strip` (which arrives by publication instead). `src/simulation/presentation/` is 3,082 lines.

This is **honestly reported** in `docs/ARCHITECTURE.md` ("Ten of the fifteen read models still have a route and no reader") and gated by `tests/foundation/projection-reachability-contract.test.ts`, so it is disclosed build-ahead rather than hidden dead code. It is still ~2,000 lines that must keep compiling, keep its schema version, and keep passing determinism and ordering rules for no current consumer.

**Fix:** no code change required; the finding is that the disclosure should carry a decision. Either stop adding projections ahead of readers, or move the unread ones behind an explicit `PLANNED_PROJECTION_IDS` list so the protocol's live vocabulary is the six that are used — which also shrinks the worker's decoder surface.

---

### ARC-10 — ADR 0010 says "Accepted" plainly while its whole layer is inert
**Severity: Low · CONFIRMED**

`docs/adr/0010-telemetry-and-diagnostics-privacy.md:4` reads `Accepted`. Verified: nothing outside `src/services/telemetry/` imports it (only prose mentions in `src/main.ts:817`, `src/services/index.ts:7`, `src/input/storage.ts:23`); consent is never asked for; `record()` has no caller. The ADR's sentence "telemetry is fed from the main thread's orchestration layer" is false. Its sibling in the same layer, ADR 0009, reads `Accepted — implementation gated (see "Gates before public ranking")` and its gates are genuinely shut — the corpus's most accurate status.

**Fix:** change 0010's status to `Accepted — implementation gated` with the same "gates before first send" enumeration 0009 uses, and update its index row in `docs/adr/README.md` in the same commit (the numbering contract checks the two agree).

---

### ARC-11 — Prose counts drift in three live gate files, with nothing gating them
**Severity: Low · CONFIRMED**

| Citation | Says | Is |
| --- | --- | --- |
| `tests/unit/ui-orchestration-boundaries.test.ts:113` | "**Sixteen entries**, which is the whole cross-layer dependency surface … a reviewer can audit sixteen facts" | **28** entries in `ALLOWED_FOREIGN_TREES` |
| `tests/foundation/unconsumed-command-contract.test.ts:179` | "any of the **eleven** that do exist"; `:190` "an **eleventh** member" | **13** commands |
| `src/persistence/session/runtime-host.ts:37` | "**Two** hosts implement this" | **Three**: `InProcessSessionHost` `:71`, `WorkerPerSessionHost` `worker-per-session-host.ts:75`, `WorkerSessionHost` `worker-session-host.ts:47` |

The manifest's *mechanism* is sound — `dependencies.length === ALLOWED_FOREIGN_TREES.length` is asserted at `:414`, so the list cannot grow silently; only the sentence describing it drifted. But "a reviewer can audit sixteen facts" was the stated justification for a manifest rather than a prohibition, and at 28 entries that argument is weaker than it reads. `STATUS-QUEUE.md:896-900` already concludes that "a count in prose is the least durable citation this corpus has"; the conclusion has not been acted on.

**Fix:** replace each count with the expression that produces it (`ALLOWED_FOREIGN_TREES.length` interpolated into the failure message; `simulationCommandSchema.options.length`), and delete the numeral from the prose. Where a count really must be prose, add it to the assertion — a one-line `expect(ALLOWED_FOREIGN_TREES.length).toBe(28)` at least fails on drift instead of lying.

---

### ARC-12 — Seven barrel files have no importer anywhere
**Severity: Low · CONFIRMED**

Zero importers in `src/` or `tests/`: `src/persistence/index.ts`, `src/persistence/cloud/index.ts`, `src/persistence/session/index.ts`, `src/rendering/build/index.ts`, `src/services/index.ts`, `src/simulation/worker/index.ts`, `src/ui/primitives/index.ts`. All are `export *` re-export walls. `module-boundary-rules.test.ts:84-89` names the risk directly — *"A scan that ignored them would let a barrel file launder any import"* — and correctly counts re-exports as dependencies, so the gates are safe. The barrels themselves are unused surface: each one is a place a future cross-tree import can be added without appearing in any file a reviewer reads.

**Fix:** delete the seven unused barrels. Keep the used ones (`simulation/kernel/index.ts` 56 importers, `services/localization/index.ts` 50, `ui/hud/index.ts` 26) and prefer named re-exports over `export *` in those, so the public surface of each tree is a list rather than a wildcard.

---

### ARC-13 — Boundary 10's remapping is implemented, tested, and unreachable by a player
**Severity: Low · CONFIRMED**

`remapAndPersistKeyboardBinding` (`src/input/storage.ts:145`) and `resolveKeyboardLabel` (`src/input/bindings.ts:96`) have no caller in `src/` — only `tests/unit/input.test.ts:175,179,224`. `findBindingConflicts` is reached only from `src/input/settings.ts:45` (validation), not from a surface. The label resolver's absence of a consumer is *documented* and asserted (`tests/foundation/documentation-claims-contract.test.ts:194`), which is exemplary; the remap path's is not. Touch/pointer and physical-`code`/AZERTY halves of boundary 10 are genuinely wired.

**Fix:** either build the minimal settings surface (the panel host slot already exists — `HudHandle.asideSlot`, the same seam `SavePanel` uses), or add `remapAndPersistKeyboardBinding` to an `AWAITING_PRODUCER`-style list so the gap is a reviewed fact rather than something an audit rediscovers.

---

### ARC-14 — `ARCHITECTURE_PATTERN_AUDIT.md`: most directions honoured, one whole family unbuilt
**Severity: Informational · CONFIRMED**

Still-holding and acted on: Phaser-as-renderer-only (Boundary 1, strongly gated); no Grid Engine dependency (`ALLOWED_PACKAGES = ['zod']` in the simulation closure; the UI tier imports no package at all); topology below zoning as separate references (`src/simulation/rooms/topology.ts` vs `zoning.ts`, and `enclosure.ts:22-31` states the split); region/portal coarse routing with a bounded local solver and **deterministic work units, not milliseconds** (`workBudgetPerTick: 2_000` expansions, `path-request-queue.ts:244`); compact numeric ids and dense component storage (`src/simulation/entity/entity-store.ts`, fan-in 36).

**Not acted on:** *"introduce a serializable `ActionPlan`/`ActionRunner` and an explicit reservation model"* — no `ActionPlan` or `ActionRunner` symbol exists anywhere in `src/`. What exists is a per-container `reserve()` consumed by one caller (`src/simulation/operations/job-system.ts:114`). Job assignment is first-fit pairing of sorted jobs to idle workers with **no cost ranking and no indexed candidate lookup** (`job-system.ts:101-124`) — the document's *"cheap eligibility filtering before cost ranking and route queries"* and *"candidate lookup must be indexed"* are both unimplemented. Six independent systems now call `requestRoute` directly (`incidents/response-system.ts:329`, `operations/job-system.ts:140`, `contraband/search-system.ts:262`, `prisoners/action-system.ts:361`, `security/deployment-system.ts:128`, `security/patrol-system.ts:103`) — which is the *"separate execution engines"* the document's follow-up section (#24/#25) says should not happen. The shared action/reservation substrate is the missing abstraction those six are working around.

---

### ARC-15 — `2026-08-26-failure-modes.md`: conclusions still hold; no recommendation acted on
**Severity: Informational · CONFIRMED**

Re-verified at `fcecad2` (the record was read at v0.0.84):

- §0.1 "running out of money is not a failure mode" — still true. No recurring charge exists: grep for payroll across `src/` returns only prose saying it does not exist (`src/simulation/economy/treasury.ts:23-25`, `src/simulation/staff/hiring.ts:44`, `src/simulation/presentation/staff-projection.ts:27`, `src/ui/hud/view-model.ts:86`).
- §0.5 "no incident can fire in a session a player can start" — still true. `incidentSectorIds` is written **only** on the restore path (`src/simulation/runtime/session-systems.ts:693-694`); it is constructed empty at `new-session.ts:478`. No scenario module exists.
- §0.5's command claim has moved: 11 → **13** commands (`CancelMaterialPurchase`, `ReleaseGuardAssignment`). Neither creates a sector, a deployment schedule, a search policy, a gang, a tunnel or a contraband item, so the conclusion is unchanged and now holds over a larger surface.
- Recommendations **A** (recurring payroll charge), **B** (widen the risk sampler / give the incident pipeline a producer), **C** (consequence receiver) and **D** (warned-band authority): none implemented. What did land in the interval (0031–0035, #390–#397) is cancel/release/filter surfaces — all of them undo controls for existing spends, which move the treasury *up*, reinforcing the record's §0.1 finding rather than addressing it.

Both research records are unusually good: labelled evidence tiers, reproducible session shapes, and premises explicitly falsified rather than quietly dropped. Their conclusions have not rotted; they have simply not been acted on.

---

## (d) What is genuinely solid

This is a strong codebase, and several things here are better than typical professional practice:

1. **The determinism boundary is airtight and mechanically total.** `tests/determinism/ambient-nondeterminism-contract.test.ts` walks the *transitive* import closure from every file under `src/simulation/`, forbids 14 ambient sources, allows exactly one third-party package, and asserts the allow-list contains nothing unused. Two exceptions, each tied to one file, one pattern and a stated reason. It also asserts the closure never reaches `persistence`, `services`, `rendering` or `ui`. That is the correct design for this rule and I could not find a way around it that a reviewer would miss.

2. **Boundary tests are built to fail rather than to look good.** Every gate carries a *vacuity guard* (a denominator assertion, so a scan that read nothing cannot report compliance), fails in three directions on its allow-lists (unlisted / stale / kind-drifted), and distinguishes type-only from value dependencies — the one distinction that actually matters, since "a module permitted to name `RestoredScope` gaining the ability to call `restoreSimulationRuntime`" is one line of diff. `module-boundary-rules.test.ts` then validates the *catalogs themselves* against what `src/simulation/**` really exports, so the #206 defect (a guard pattern naming an interface, unable to ever fire) is unrepeatable rather than fixed once. Every rule is exercised against fixtures in both directions.

3. **Import-graph health is excellent.** 197 source files, **zero value-import cycles**, two type-only file cycles (both benign and deliberate). Fan-in is concentrated in the right places (`world/coordinates.ts`, `entity/entity-store.ts`, `protocol/types.ts`). No god module in the domain layers — the largest simulation file is 946 lines at 71 % comment.

4. **`src/simulation/presentation/` is a correct projection layer, not a boundary violation.** It is pure functions from authoritative state to readonly structured-clone-safe values, with three stated invariants (no mutation; deterministic iteration keyed on state, never `Map` order and never `localeCompare`; ids and message keys, never text). Crucially the projections **execute in the worker** (`worker/projection-catalog.ts`), so the main thread never re-derives state it does not own — which is the honest answer to Boundary 1, better than the more common "let the UI compute the view model".

5. **The composition-root contract is a genuinely novel and well-argued gate.** It correctly identifies that a composition root is the one module no unit test executes, cites three real defects where a component was flawless and joined to nothing (#82, #199, #146), states its own limits explicitly ("it proves a wiring is *written*, not that it works"), and keeps the list short and load-bearing — every entry names a defect that actually happened, with the measured mutation that survived.

6. **Persistence is the cleanest layer in the tree.** Zero reach into renderer or UI. A snapshot-in/snapshot-out host contract with a load-bearing error distinction (`SnapshotRestoreRejectedError` vs plain `Error`, because one demotes a save generation and the other must not). V1–V5 schemas registered once and never edited, transformations in a separate file with only `import type` crossing back to avoid a runtime cycle, forward-only migrations tested against fixtures.

7. **Content extensibility is real, measured.** Adding 17 buildables and 15 finishable room types (`b097e70`) touched exactly two `src/` files, added no locale key (labels derive from object `nameKey`), and derived both numeric fields from a stated rule that a contract test recomputes over every row. That is what boundary 6 is supposed to buy.

8. **The docs are unusually honest about their own gaps.** ADR 0009's "Accepted — implementation gated" with genuinely shut gates; ADR 0022's supersession-in-place with the original decision left verbatim as history; ADR 0002 carrying the deployment discrepancy in its own body; the `unconsumed-command` / `unconsumed-action` / `unconsumed-content` / `projection-reachability` / `fault-code-reachability` family, which turns "this capability has no caller" from something an audit discovers into something CI reports. `AWAITING_PRODUCER` is currently **empty** and that is a real achievement.

---

## (e) Prioritised top 5

1. **ARC-02 — collapse the 16-file cost of one player-facing command.** It is the dominant recurring cost of every feature and it scales with nothing. Derive the `HudIntent` member, refusal-reason key and locale key from the command schema the way `deriveSimulationMessageKey` already derives message keys; co-locate the remaining hops per feature.
2. **ARC-01 + ARC-04 — put `src/main.ts` inside a boundary gate, and assert gate coverage is total.** Two small test changes. The module most able to create a second source of truth is the one with no construction gate, and the repo already owns the exact mechanism (`covers the whole of src/ui/ between the two gates`) that would have caught it.
3. **ARC-06 — implement the queue fix the corpus already argues for.** One file per outstanding decision under a new `queue/` directory in `docs/adr/`, plus a mechanical trigger so an ADR or amendment that is not plainly accepted must have one. The current rule has failed 4 of 7 times and its failure costs nothing observable, which guarantees a fifth.
4. **ARC-07 — re-anchor and de-contradict `STATUS-QUEUE.md` before the staleness gate fires.** It is at exactly its 10-release budget and two of its §5 code counts are already wrong. The delta method the file itself prescribes makes this a bounded job, and the title/§2/§5 contradiction makes the document unusable for its one purpose until fixed.
5. **ARC-03 — move `identifierSchema`, `DeepReadonly` and the bounded-value rule into `src/shared/`.** A mechanical, low-risk change that deletes the `content → simulation` layer cycle, removes 8 of 12 `services → simulation` imports, and retires a duplication-agreement test instead of maintaining it.
