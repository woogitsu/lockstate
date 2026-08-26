# Lockstate — Product / Feature-Completeness / Roadmap Audit

**Auditor role:** product & delivery view (10/10 in a multidisciplinary audit)
**Target:** `/workspace/lockstate` @ `fcecad2` (v0.0.108)
**Method:** read-only. Every claim below is cited to `path:line` or `doc:section` and was read from disk in this session.
**Scale measured:** 56,493 LOC TypeScript in `src/` (54.2% of source *characters* are comments), 80,737 LOC in `tests/`, 1.67 MB / ~222k words of Markdown in `docs/`.

---

## 0. Verdict up front

**It is not a game yet. It is a simulation library with a construction toy attached.**

There is a real, working, tested loop — buy bricks, draw walls, zone a room, furnish it, admit a prisoner, watch them walk to a shower and use it — and that loop is genuinely more solid than most prototypes at this stage. But four of the five systems a prison-management game is *about* (security deployment, incidents, contraband, prisoner labour) are structurally unreachable in any session a player can start, not because they are unfinished but because **nothing in production ever populates the collections they iterate**. They are complete, tested, snapshotted, documented — and permanently empty.

The single biggest gap is named in §2 as PRD-01. It is not a missing feature; it is a missing *scenario/world-seeding layer*, and it is roughly one focused change away from converting ~4,100 LOC of dormant simulation into playable content.

---

## (a) Feature inventory matrix

Legend: **Sim** = implemented in `src/simulation` (or equivalent tier) · **HUD** = projected to a player-visible surface · **Play** = a player can actually cause or change it in a running session · **Test** = has dedicated tests
✅ yes · ⚠️ partial · ❌ no

| # | System | Sim | HUD | Play | Test | Evidence / note |
|---|---|---|---|---|---|---|
| 1 | Clock, fixed-step, speed 1/2/4, pause | ✅ | ✅ | ✅ | ✅ | `src/simulation/clock/fixed-step-clock.ts`; transport in `src/ui/hud/status-strip.ts`; starts paused (`state-machine.ts:165`) |
| 2 | Deterministic kernel + RNG streams | ✅ | n/a | n/a | ✅ | `src/simulation/kernel/`, `rng/`, 18 determinism tests |
| 3 | Worker protocol (commands, projections, faults) | ✅ | ✅ | ✅ | ✅ | `src/simulation/protocol/` (1,818 LOC), 9 contract tests |
| 4 | Sparse chunked world / terrain | ✅ | ✅ | ⚠️ | ✅ | One 32×32 chunk owned at session start (`runtime/new-session.ts:243`) |
| 5 | Land parcels / world expansion | ⚠️ | ❌ | ❌ | ⚠️ | `canPurchaseParcel`/`getParcelPrice` (`world/sparse-world.ts:580,589`) have **no production caller**; only `registerParcel` call site outside tests is snapshot restore (`:721`) |
| 6 | Construction (walls, doors, orders, queue, cancel) | ✅ | ✅ | ✅ | ✅ | `construction/system.ts`; Build panel + queue rows; one "mock crew" of one (`system.ts:176`) |
| 7 | Undo / redo | ✅ | ✅ | ✅ | ✅ | `Undo`/`Redo` commands; `KeyZ`/`KeyY`; HUD intents |
| 8 | Room zoning / topology / enclosure | ✅ | ✅ | ✅ | ✅ | Rooms tab (ADR 0022), 18 room types offered |
| 9 | Object placement / derived room capacity | ✅ | ✅ | ✅ | ✅ | ADR 0028; 21 buildables; object tool + numeric fields |
| 10 | Economy — money in | ✅ | ✅ | ⚠️ | ✅ | £250 start (`economy/treasury.ts:62`), £3/prisoner/day (`income.ts:101`) |
| 11 | Economy — money out | ⚠️ | ✅ | ✅ | ✅ | Only two one-off sinks: materials, hire. **No recurring cost exists** — `Treasury.spend` has no payroll/utilities/upkeep caller |
| 12 | Procurement / deliveries / refunds | ✅ | ✅ | ✅ | ✅ | Only 2 procurable items: brick, wood-plank (`content/procurement-catalog.ts:89-90`) |
| 13 | Inventory / containers | ✅ | ❌ | ⚠️ | ✅ | One well-known construction container; no player surface |
| 14 | Prisoner intake / classification | ✅ | ⚠️ | ⚠️ | ✅ | One button, one hard-coded prisoner archetype (`src/main.ts:684`) |
| 15 | Needs (6) + decay | ✅ | ⚠️ | ❌ | ✅ | Only aggregated via room-needs readout; no per-prisoner need surface |
| 16 | Utility AI + action system | ✅ | ❌ | ❌ | ✅ | 8 actions (`prisoners/actions.ts:42`); no surface shows what anyone is doing |
| 17 | Regime / schedules | ✅ | ❌ | ❌ | ✅ | **Hard-coded** (`prisoners/regime.ts:63-88`); `regime` tab renders nothing |
| 18 | Classification review / disciplinary record | ✅ | ❌ | ❌ | ✅ | ADR 0032; no reader, and its trigger (incidents) is unreachable |
| 19 | Cell sharing assessment | ✅ | ❌ | ❌ | ✅ | ADR 0027 |
| 20 | Navigation (hierarchical, budgeted, doors) | ✅ | ⚠️ | ✅ | ✅ | 2,039 LOC, ADR 0007; drives real walking in integration tests |
| 21 | Staff hiring | ✅ | ✅ | ✅ | ✅ | Guard only (`src/main.ts:648`); 5 of 8 roles unconsumed |
| 22 | Staff roster / firing / wages / skills | ❌ | ❌ | ❌ | — | `HUD_PROJECTIONS.md` gaps 19–21; Staff panel states "it is not a roster" |
| 23 | Security sectors / access control | ✅ | ❌ | ❌ | ✅ | `securitySectors` empty; nothing registers a sector |
| 24 | Guard deployment | ✅ | ❌ | ❌ | ✅ | `securitySchedules: [] ` (`new-session.ts:421`) — never pushed to |
| 25 | Patrol | ✅ | ❌ | ❌ | ✅ | Iterates sectors → empty forever |
| 26 | Guard release (unstick a claim) | ✅ | ✅ | ✅ | ✅ | ADR 0034; panel can only ever say "nobody is assigned" (see PRD-01) |
| 27 | Incidents (riot, gang retaliation) | ✅ | ⚠️ | ❌ | ✅ | Count only on strip; `incidentSectorIds: []` (`new-session.ts:478`) → **no incident can fire** |
| 28 | Incidents (assault, escape-attempt) | ❌ | ❌ | ❌ | — | Declared, never triggered (`HUD_PROJECTIONS.md` gap 29) |
| 29 | Incident response system | ✅ | ❌ | ❌ | ✅ | Fully automatic; no player command for lockdown/deploy/respond |
| 30 | Escape tunnels | ⚠️ | ❌ | ❌ | ⚠️ | `TunnelRegistry` exists, no discovery model (gap 31) |
| 31 | Gangs | ⚠️ | ❌ | ❌ | ⚠️ | `GangRegistry` empty in every session |
| 32 | Contraband / intelligence / informants / search | ✅ | ❌ | ❌ | ✅ | 920 LOC; `searchPolicies: []` (`new-session.ts:437`), no contraband ever registered |
| 33 | Jobs / prisoner labour | ✅ | ❌ | ❌ | ✅ | `JobBoard` created empty (`new-session.ts:398`); nothing in `src/` ever submits a job |
| 34 | Utility network (power/water) | ✅ | ❌ | ❌ | ✅ | Both networks empty (`new-session.ts:405-406`) |
| 35 | Local save / load / delete / export / import | ✅ | ✅ | ✅ | ✅ | `src/ui/save-panel.ts`; autosave wired; generation retention; migration tests |
| 36 | Cloud save / conflict UI / slots | ✅ | ❌ | ❌ | ✅ | `SupabaseCloudSaveClient`, `PrisonSyncEngine` — **no `new` in `src/`**, tests only |
| 37 | Entitlements / paid slots | ✅ | ❌ | ❌ | ✅ | `SupabaseEntitlementsReadClient` has zero references outside its own module |
| 38 | Challenges / leaderboards | ✅ | ❌ | ❌ | ✅ | No production instantiation |
| 39 | Telemetry / consent | ✅ | ❌ | ❌ | ✅ | `TelemetryRecorder`, `BatchingTelemetrySink` — tests only |
| 40 | Localization | ✅ | ✅ | ⚠️ | ✅ | ADR 0011; **one locale** (`en`) + a pseudo-locale test tool; no language picker |
| 41 | Input remapping / QWERTY-AZERTY | ✅ | ❌ | ❌ | ✅ | `src/input/settings.ts` loads bindings from storage; **no settings UI exists** |
| 42 | Camera pan / zoom / touch gestures | ✅ | ✅ | ✅ | ✅ | 6 camera actions consumed by `world-scene.ts` |
| 43 | Selection / inspect an entity | ❌ | ❌ | ❌ | — | `selection.primary` in `AWAITING_CONSUMER`: *"there is no selection state, no highlight and no inspector"* |
| 44 | Minimap | ❌ | ⚠️ | ❌ | ⚠️ | Literal placeholder string `hud.minimap.placeholder` (`hud.ts:1107`) |
| 45 | Actor rendering | ⚠️ | ⚠️ | n/a | ✅ | Prisoners only; guards not decoded; every actor drawn idle, positions refresh on a **2 s snapshot poll** |
| 46 | Environment art | ❌ | ❌ | n/a | ⚠️ | 23 authored PNGs in `assets/source/generated/` — **none referenced by `src/rendering/`**; world is flat tints |
| 47 | Audio / music / ambience | ❌ | ❌ | ❌ | — | No audio code anywhere in `src/` |
| 48 | Tutorial / onboarding | ❌ | ❌ | ❌ | — | Nothing |
| 49 | Statistics / graphs / reports | ❌ | ❌ | ❌ | — | Nothing beyond 7 strip counters |
| 50 | Difficulty / sandbox / campaign / scenarios | ❌ | ❌ | ❌ | — | No scenario layer at all (see PRD-01) |

**Headline counts.**
- Player command vocabulary: **13 commands total** (`src/simulation/protocol/commands.ts:25,35,40,74,122,164,212,248,316,375,425,430,434`). Every one is about construction, zoning, procurement, one admission, one hire, one release, undo/redo. **Not one is about running a prison** — no regime edit, no cell assignment, no job assignment, no patrol route, no lockdown, no search order, no release of a prisoner, no firing of staff, no land purchase.
- Read models: **15 catalogued, 5 read.** The project asserts this against itself: `tests/foundation/projection-reachability-contract.test.ts:65` — *"ten of the fifteen catalogued read models have a route and no reader."* The five readers are enumerated at `:160`.
- HUD tabs: **5, one of which renders nothing.** `HUD_TAB_IDS = ['overview','build','rooms','security','regime']` (`src/ui/hud/hud-state.ts:34`); `paintState` binds panels to four of them and `regime` gets none (`src/ui/hud/hud.ts:1513-1519`). `hud-state.ts:19` records that **a sixth tab is foreclosed** at 375×812.

---

## (b) The player-loop trace, and where it breaks

Traced through `src/main.ts` → `src/ui/hud/*` → `src/simulation/protocol/commands.ts` → `src/simulation/runtime/new-session.ts` → `session-commands.ts`.

```
1. Open page                       → canvas + HUD mount (main.ts:2152)          ✅
2. Save panel: "Create"            → new prison, IndexedDB slot                 ✅
3. World appears                   → ONE owned 32×32 chunk, flat tints          ⚠️ BREAK A
4. Press play                      → clock runs at ×1                           ✅
5. Build tab → buy 100 bricks      → PurchaseMaterials, 100-tick delivery        ✅
6. Drag walls in the world         → PlaceBuildOrder, queue, one-at-a-time crew  ✅
7. Rooms tab → drag a cell         → ZoneRoom, minimum size enforced             ✅
8. Build tab → place bed + toilet  → PlaceObject, capacity derived               ✅
9. Overview tab → "Admit"          → AdmitPrisoner, identity minted, cell given  ⚠️ BREAK B
10. Prisoner exists                → sprite appears, teleports every 2 s, idle   ⚠️ BREAK C
11. Needs decay; utility AI picks  → walks to shower/canteen, need refills       ✅ (invisible)
12. Money accrues £3/prisoner/day  → strip counters move                         ✅
13. Security tab → "Hire guard"    → HireStaff, £ spent, guard in roster         ❌ BREAK D
14. An incident happens            → never                                       ❌ BREAK E
15. Contraband appears / a search  → never                                       ❌ BREAK E
16. Prisoners work / haul / cook   → never                                       ❌ BREAK E
17. Set the regime                 → no surface, no command                      ❌ BREAK F
18. Inspect a prisoner             → no selection, no inspector                  ❌ BREAK G
19. Expand the prison (buy land)   → no surface, no command                      ❌ BREAK H
20. Lose / win / be graded         → no failure state, no objective              ❌ BREAK I
```

**BREAK A — the world is one chunk and cannot grow.** `createNewSimulationRuntime` loads and owns exactly `{0,0}` at 32 tiles (`src/simulation/runtime/new-session.ts:237-244`). The parcel purchase hooks exist but are called only from `tests/unit/sparse-world.test.ts:174-179`. `README.md` promises "expand a prison across a chunked world by purchasing additional land" and "very large prisons ... up to several thousand active actors"; the shipped game gives 1,024 tiles with no route to a 1,025th.

**BREAK B — one prisoner archetype, forever.** `ADMISSION_REQUEST = { sentenceLengthTicks: 10_000, priorIncidents: 0 }` (`src/main.ts:684`) is a module constant. Every prisoner the player will ever admit is identical on input; only the classification RNG differentiates them. There is no intake queue, no pressure from the state, no choice to refuse, no transfer, no release.

**BREAK C — actors teleport and never animate.** `SimulationSnapshotFeed` polls a **full session bundle** every 2 seconds (`src/rendering/feed/simulation-snapshot-feed.ts:62`), because no render-delta channel exists (`:20`, "nothing emits a delta"). `actorsFromSnapshot` writes `deltaX: 0, deltaY: 0` and omits `facing` by design (`src/rendering/feed/actors-from-snapshot.ts:33-44,95-98`), so `selectActorPose` picks the idle clip for everyone. `HUD_PROJECTIONS.md` gap 10 says the simulation itself only moves a prisoner on arrival. Net effect: a prisoner stands still at tile A for two seconds, then stands still at tile B. Guards are not decoded at all (`actors-from-snapshot.ts:48-52`). Walls also only appear on the next poll.

**BREAK D — a hired guard is a pure money sink with no effect and no body.** The only production caller of `GuardRoster.assignToSector` is `DeploymentSystem` (`src/simulation/security/deployment-system.ts:117`), which reads `securitySchedules` — created empty at `new-session.ts:421` and pushed to only by the *restore* path (`session-systems.ts:658-659`). `PatrolSystem` iterates sectors; there are none. `IncidentResponseSystem` and `SearchSystem` claim from `unassignedGuardIds()` only when an incident or a search job exists; neither can exist. So a guard is hired, is invisible on the map, and does nothing for the rest of the session. The brand-new held-guards block (ADR 0034, v0.0.106) can therefore only ever render its empty state.

**BREAK E — the emergent half of the game cannot start.** All of these are created empty in `createNewSimulationRuntime` with the comment *"until a session/scenario places/registers them"* — and **there is no scenario layer**:

| Collection | Line | Consequence |
|---|---|---|
| `jobs = new JobBoard()` | `new-session.ts:398` | no job is ever submitted in `src/` → no prisoner labour, no haulage |
| `electricity` / `water` | `:405-406` | no power, no water, no utility failure |
| `securitySchedules: []` | `:421` | no deployment (BREAK D) |
| `searchPolicies: []` | `:437` | no searches → contraband system idle |
| `contraband = new ContrabandRegistry()` | `:434` | no contraband ever exists |
| `gangs = new GangRegistry()` | `:476` | no gangs |
| `incidentSectorIds: []` | `:478` | `IncidentTriggerSystem.update` loops over an empty array (`incidents/trigger-system.ts:63`) → **no incident of any type can ever fire** |

That is ~4,100 LOC (`security` 1,022 + `contraband` 920 + `incidents` 1,468 + `operations` 696) plus their projections, snapshots and tests, unreachable by construction.

**BREAK F — the regime is content, not a control.** `GENERAL_POPULATION_REGIME` and `HIGH_RISK_REGIME` are frozen literals (`src/simulation/prisoners/regime.ts:63-88`). No command edits them; the `regime` tab has no panel. Worse, two of the seven `ACTION_CATEGORIES` — `work` and `free-association` — have **no action defined for them** (`prisoners/actions.ts:42-75` lists 8 actions covering sleep/meal/hygiene/recreation/education only), so during the two work blocks (ticks 500–1000 and 1300–1800, a third of the day) the only legal action is classroom education.

**BREAK G — nothing can be selected or inspected.** `tests/foundation/unconsumed-action-contract.test.ts` `AWAITING_CONSUMER['selection.primary']`: *"Nothing in the repository selects anything yet — there is no selection state, no highlight and no inspector."* That is why `hud/prisoner-roster`, `hud/prisoner-detail`, `hud/incident-detail`, `hud/staff`, `hud/security` and `hud/contraband` all have a route and no reader.

**BREAK I — no failure and no goal.** Nothing in `src/` mentions bankruptcy, game-over, an objective, a score or a grade. `Treasury.credit` has two callers (income, refund) and `spend` refuses rather than overdrawing (`economy/treasury.ts:86-97,110-125`), and there is no recurring outflow at all. The economy is monotonically inflationary: money can only go up over time. There is nothing to lose and nothing to win.

**The single biggest gap.** Not any one feature — it is the **absence of a session-seeding / scenario layer** between "a new prison" and "the systems that make it a prison". Every dormant system in BREAK D/E is waiting on data that a ten-line seeding step would supply (one sector over the starting chunk, one deployment schedule, one search policy, one starting job). The architecture anticipated this layer in comments seven times and never built it. Everything else on this list is downstream of it.

---

## (c) Gap table — missing table-stakes features

Importance is genre-relative (a prison-management sim). Effort is S / M / L / XL relative to this codebase's demonstrated per-change size (~1,300 net insertions per feature commit).

| Missing feature | Exists? | Genre importance | Effort | Recommended timing |
|---|---|---|---|---|
| Scenario / world-seeding layer (sectors, schedules, jobs, contraband, utilities) | ❌ | **Critical** | M | **Now — blocks 4 systems** |
| Render-delta channel (so actors walk instead of teleporting) | ❌ | **Critical** | L | **Now — the game is unreadable without it** |
| Selection + inspector (click a prisoner/room/guard) | ❌ | **Critical** | M | **Now — unblocks 6 read models** |
| Incident notification + response controls (lockdown, deploy, dismiss) | ⚠️ sim only | **Critical** | M | Immediately after seeding |
| Regime editor (the genre's signature screen) | ⚠️ sim only | **Critical** | L | Next quarter |
| Recurring costs / payroll → a losable economy | ❌ | **Critical** | S | Next quarter (cheap, high impact) |
| Staff roster surface (who did I hire, where are they) | ❌ | High | S | Next quarter |
| Per-prisoner needs surface + thresholds (gaps 7, 8) | ⚠️ | High | M | Next quarter |
| Land purchase / world expansion | ⚠️ hooks only | High | M | Next quarter — it is a README promise |
| Food chain (kitchen → cook → ration → canteen) | ❌ | High | L | After regime; `item.food-ration` and `room.kitchen` already authored |
| Laundry / work programmes (uses `work` category) | ❌ | High | L | After food; closes BREAK F's empty categories |
| Notifications / alert feed for game events (not just refusals) | ❌ | High | S | Next quarter |
| Pause-on-alert | ❌ | Medium | S | With notifications |
| Environment art wired to the renderer (23 PNGs unused) | ⚠️ | High | M | Next quarter — biggest perceived-quality win per hour |
| Guard sprites on the map | ❌ | High | S | With the render-delta work |
| Tutorial / onboarding | ❌ | High (pre-release gate) | L | Before any public build |
| Settings UI (remapping, locale, accessibility) | ⚠️ model only | High | M | Before any public build; `AGENTS.md` boundary 10 is half-met |
| Audio / music / ambience | ❌ | Medium | L | Phase 10, fine for now |
| Statistics / graphs / reports | ❌ | Medium | M | After the loop closes |
| Minimap (real, not a placeholder) | ❌ | Medium | M | After render-delta |
| Cloud save wiring (code exists, unused) | ⚠️ | Medium | S–M | When there is a game worth syncing |
| Difficulty settings / sandbox vs campaign | ❌ | Medium | M | Falls out of the scenario layer |
| Camera bookmarks / follow | ❌ | Low | S | Fine for now |
| Research / progression unlocks | ❌ | Medium | L | Roadmap phase 9, fine for now |
| Visitation, parole, reoffending, reputation, inspectors | ❌ | Medium | XL | Roadmap phase 9, fine for now |
| Assault + escape-attempt incidents | ❌ | Medium | M | With the incident work |
| Health / injury / infirmary | ❌ | Medium | M | Fine for now (gap 9) |
| Multi-language content | ⚠️ 1 locale | Low pre-release | M | Fine for now |
| Telemetry / entitlements / challenges wiring | ⚠️ | Low | S | Fine for now — deliberately gated |

**"Missing and fine for now":** audio, research, parole/reputation/visitation, camera bookmarks, additional locales, leaderboards, telemetry. These are honestly deferred and the roadmap says so.
**"Missing and needed soon":** everything in the top third of that table. The distinguishing property is that each one is *blocking already-written code from being playable*, which is a much better return than new systems.

---

## (d) Findings

### PRD-01 — No scenario/seeding layer, so seven simulation subsystems are unreachable in play
**Severity: Critical · Priority: P0**
**Evidence:** `src/simulation/runtime/new-session.ts:398` (`jobs`), `:405-406` (utilities), `:421` (`securitySchedules`), `:434-437` (contraband, `searchPolicies`), `:476` (`gangs`), `:478` (`incidentSectorIds`). Each is created empty with a comment saying "until a session/scenario …". The only production writers are the restore path (`runtime/session-systems.ts:587,626,658-659,693-694`), which can only restore what was never created. `IncidentTriggerSystem.update` iterates `this.sectorIds` (`src/simulation/incidents/trigger-system.ts:63`).
**Impact:** No incident, no patrol, no deployment, no search, no contraband, no gang, no job, no utility state can occur in any session a player can start. ~4,100 LOC of simulation plus 6 read models and 3 recent ADRs (0032, 0033, 0034) describe behaviour a player will never see.
**Recommendation:** Add a `seedNewSession` step in the composition of a *new* prison (not restore) that registers: one security sector covering the starting chunk, one `constantDeploymentSchedule` for it, one sector id in `incidentSectorIds`, one search policy, and the starting chunk's utility producers. Gate it behind a `ScenarioDefinition` so difficulty/sandbox/campaign can vary it later. This is the highest-leverage change available to this project and it is small.

### PRD-02 — Ten of fifteen read models have no reader; six player-facing panels do not exist
**Severity: Critical · Priority: P0**
**Evidence:** `tests/foundation/projection-reachability-contract.test.ts:65` — *"ten of the fifteen catalogued read models have a route and no reader"*; `PAINTERS` at `:160` lists the five that do. Unread: `hud/status-strip` (superseded by the counts publication), `hud/prisoner-roster`, `hud/prisoner-detail`, `hud/staff`, `hud/security`, `hud/contraband`, `hud/incidents`, `hud/incident-detail`, `world/render-snapshot` (read via the snapshot feed instead).
**Impact:** The player cannot see a prisoner, a guard, an incident, a sector or a confiscation. The strip's `activeIncidents` counter is the *only* evidence of the entire incidents subsystem.
**Recommendation:** Selection + a single generic inspector panel would light up four of these at once. Prefer one inspector over four tabs — the tab bar is full (PRD-05).

### PRD-03 — No render-delta channel: actors teleport on a 2-second full-bundle poll and never animate
**Severity: Critical · Priority: P0**
**Evidence:** `src/rendering/feed/simulation-snapshot-feed.ts:20` (*"nothing emits a delta — so a snapshot request is the only way world geometry can legally reach the renderer"*), `:62` (`DEFAULT_POLL_INTERVAL_SECONDS = 2`); `src/rendering/feed/actors-from-snapshot.ts:33-44` (deltas hard-zeroed, facing omitted by design), `:95-98`; `docs/HUD_PROJECTIONS.md` gap 10 (the simulation only writes position on arrival).
**Impact:** This is the difference between "a prison" and "a spreadsheet with a canvas". Every prisoner stands still, faces south, and jumps between tiles twice a second-and-a-half. Walls appear late. It also means each poll captures the *entire* session bundle for rendering — the same work an autosave does.
**Recommendation:** An ADR and a delta channel: per-tick actor position/velocity/facing at a render cadence, geometry deltas on commit. `ActorPose`/`sprite-placement` and the 8-direction walk atlases are already built and tested for this; they are waiting on the data.

### PRD-04 — The `regime` tab is empty and the regime is not editable
**Severity: High · Priority: P1**
**Evidence:** `src/ui/hud/hud-state.ts:34` declares the tab; `src/ui/hud/hud.ts:1513-1519` binds panels to `build`/`rooms`/`security`/`overview` and nothing to `regime`; `src/ui/hud/intake-panel.ts:35-37` states it plainly (*"`overview` and `regime` are the two tabs bound to no panel"*). Schedules are literals at `src/simulation/prisoners/regime.ts:63-88`; no command in `commands.ts` touches them.
**Impact:** The tab is a visible dead end — worse than a missing tab, because a player will press it. And the regime grid is the signature interaction of this genre.
**Recommendation:** Short term, hide the tab rather than ship a dead one. Medium term, a `SetRegimeBlock` command and a regime grid; it also gives the two empty action categories (`work`, `free-association`) a reason to be filled.

### PRD-05 — The HUD has a hard structural ceiling of five tabs
**Severity: High · Priority: P1**
**Evidence:** `src/ui/hud/hud-state.ts:15-21` — ADR 0022 measured `.hud-tabs__inner` at 1.8…373.2 on a 375-wide viewport, so *"a sixth tab is foreclosed"*; repeated at `intake-panel.ts:27-33` and `rooms-panel.ts:35`. Four surfaces (Build, Rooms, Staff, Intake) already share one `.hud__side` box because the conditions are mutually exclusive.
**Impact:** Every future surface — prisoners, logistics, finance, reports, research, staff roster — has nowhere to go. The intake control was pushed onto the Overview tab for exactly this reason. This is an architectural product constraint, not a styling detail, and it will be paid for repeatedly.
**Recommendation:** Decide the navigation model now, in an ADR, before more panels are written: a scrollable/overflowing tab rail, a two-level rail, or a context-driven inspector plus a small fixed rail. Retrofitting this after ten panels exist is far more expensive.

### PRD-06 — Hiring a guard has no effect and no visual presence
**Severity: High · Priority: P1**
**Evidence:** only `DeploymentSystem` assigns (`src/simulation/security/deployment-system.ts:117`) and it reads the empty `securitySchedules`; `actorsFromSnapshot` deliberately decodes prisoners only (`src/rendering/feed/actors-from-snapshot.ts:48-52`); the Staff panel is explicitly *"not a roster"* (`src/ui/hud/staff-panel.ts:37`). Four of five actor atlases in `public/assets/actors/` (guard, cook, medic, staff) are referenced by nothing in `src/`.
**Impact:** The player spends money on an invisible, inert entity, and the only feedback is a counter. This is the clearest instance of the project's characteristic failure mode: a correct mechanism with no consequence.
**Recommendation:** Falls out of PRD-01 + PRD-03. Decode guards into the render feed and give the Staff panel a roster; both are small.

### PRD-07 — No recurring costs, therefore no failure state and no economic game
**Severity: High · Priority: P1**
**Evidence:** `src/simulation/economy/treasury.ts:110-125` enumerates its two credit callers and there is no third; `spend` is called only by procurement and hiring. `HUD_PROJECTIONS.md` gap 21: *"`wageBand` is read once, at hire, and there is still no payroll."* No `bankrupt`/`game-over`/`objective` token exists in `src/`.
**Impact:** Money accumulates monotonically. After a few in-game days the economy stops constraining anything, which removes the only pressure the game currently has.
**Recommendation:** Daily payroll from `wageBand` (the data is already there) plus a per-room upkeep line. This is a genuinely small change with an outsized effect on whether the loop feels like a game.

### PRD-08 — Cloud save, entitlements, challenges and telemetry are complete and entirely unwired
**Severity: Medium · Priority: P2**
**Evidence:** `grep` for `new SupabaseCloudSaveClient|new PrisonSyncEngine|new SupabaseEntitlementsReadClient|new TelemetryRecorder|new BatchingTelemetrySink` across `src/` returns nothing; the only references are the defining modules and tests. `src/ui/save-panel.ts:328` says so out loud: *"It was latent only because nothing constructs a `SupabaseCloudSaveClient` yet."*
**Impact:** ~2,000 LOC plus `docs/CLOUD_SAVE.md` (100 KB) and `docs/TRUSTED_SERVICES.md` (36 KB) describe a product tier no player can reach. Latent defects hide there — #338's non-UUID prison id shipped and was only found by inspection, precisely because nothing exercised the path.
**Impact assessment is not "delete it":** the ADRs gate it deliberately (0009 "Accepted — implementation gated"). But the docs-to-reachable-code ratio here is the project's worst.
**Recommendation:** Either wire anonymous Supabase auth + one cloud slot behind a build flag so the path is exercised, or add a `README.md`/`ROADMAP.md` line stating plainly that phase 11 is written-but-dark. Do not leave a reader to discover it.

### PRD-09 — 23 authored environment sprites are unused; the world renders as flat tints
**Severity: Medium · Priority: P2**
**Evidence:** `assets/source/generated/` holds 23 PNGs (walls, floors, doors, fences, watchtowers, furniture, security fixtures); no id from them appears in `src/rendering/`. `src/rendering/world/appearance.ts:40-219` is a table of hex colours, grid lines and outlines. `README.md` promises "high-quality semi-realistic top-down visuals with visible object sides".
**Impact:** The largest available gain in perceived quality is sitting unused on disk. It also means `ART_PIPELINE.md` (16 KB) and ADR 0014 describe a pipeline whose *output* is half-consumed.
**Recommendation:** Wire floors and wall modules first (the two highest-coverage assets). This is the cheapest way to make the project look like the game it describes.

### PRD-10 — Land expansion is a README headline with no implementation path
**Severity: Medium · Priority: P2**
**Evidence:** `src/simulation/world/sparse-world.ts:580,589` (`canPurchaseParcel`, `getParcelPrice`) — callers only in `tests/unit/sparse-world.test.ts:174-179`. Production `registerParcel` exists only in snapshot decode (`:721`). A new session owns one 32×32 chunk (`runtime/new-session.ts:243`).
**Recommendation:** One `PurchaseParcel` command + a seeded parcel grid. It also directly serves the benchmark story ("several thousand active actors"), which cannot be reached inside 1,024 tiles.

### PRD-11 — Two of seven action categories have no action; several room types and staff roles have no consumer
**Severity: Medium · Priority: P2**
**Evidence:** `ACTION_CATEGORIES` (`src/simulation/prisoners/regime.ts:1`) includes `work` and `free-association`; `DEFAULT_ACTIONS` (`prisoners/actions.ts:42-75`) covers neither. `tests/foundation/unconsumed-content-contract.test.ts:95-166` records 8 unconsumed rooms (garbage-room, infirmary, kitchen, laundry, reception, security-office, staff-room, utility-room), 1 unconsumed object (sink — required by no room), and 5 unconsumed staff roles (administrator, doctor, kitchen-staff, maintenance-worker, security-chief).
**Impact:** A third of the in-game day is a regime block whose only legal action is classroom education. Eight of eighteen room types are offered to the player in the Rooms panel and do nothing when zoned — that is a promise the UI makes and the simulation does not keep.
**Recommendation:** Either give the offered rooms a consumer or filter the Rooms catalogue to the rooms that work, the same way ADR 0035 just filtered the buildable catalogue. The precedent is fresh and directly applicable.

### PRD-12 — `docs/ISSUE_BACKLOG.md` is knowingly stale
**Severity: Medium · Priority: P2**
**Evidence:** the file's own text: *"The table stops at phase 7 and has not been extended as later work was filed… Whether the table should be extended through current work or reduced to the source-of-truth order above is an open decision (issue #121)."* Its issue numbers are #5–#26; the repository is referencing #390–#397.
**Impact:** A returning maintainer opening the file named "issue backlog" gets a two-hundred-issue-old snapshot. It is honest about being stale, which is better than lying, but it is not useful.
**Recommendation:** Reduce it to the source-of-truth ordering (its own §1) and delete the delivery-sequence table. Close #121 by deletion rather than by extension.

### PRD-13 — `docs/ROADMAP.md` does not reflect where the project actually is
**Severity: Medium · Priority: P2**
**Evidence:** `docs/ROADMAP.md` phases 0–11 with no status markers, no dates, no "current phase" pointer. Measured against the code: phases 0–6 are substantially done; phase 7 is half done (intake ✅, cells ✅, hiring ✅, regime ⚠️ non-interactive, needs ✅, jobs ❌ unreachable, food ❌, utilities ❌ unreachable); phase 8 is *written and unreachable*; phase 9 is absent; phase 10 is 2 of 6; phase 11 is written and dark. `README.md` still says "Pre-alpha foundation… before gameplay systems are allowed to accumulate dependencies" — but ADRs 0022–0035 are all gameplay-system decisions, so that sentence is a phase behind.
**Recommendation:** Add a status column and a "you are here" line. The roadmap's *order* has held up remarkably well; only its reporting is missing.

### PRD-14 — Essentially zero TODO/FIXME debt markers, and that is a real (and rare) strength
**Severity: Informational**
**Evidence:** exactly **one** TODO/FIXME/HACK/XXX in `src/` (`src/simulation/construction/materials-provider.ts:17`, and it is a comment *about* a historical TODO), one in `tests/`, zero in `docs/`.
**Note:** debt is instead recorded structurally — in `tests/foundation/*` allow-lists that fail when they go stale, and in numbered doc gap lists. That is a materially better mechanism than comment litter, and it is why this audit could be evidence-based so quickly. Worth protecting.

### PRD-15 — 34 numbered simulation gaps in `HUD_PROJECTIONS.md`, 4 closed
**Severity: Informational (but the list is the roadmap)**
**Evidence:** `docs/HUD_PROJECTIONS.md:529-1030`, items 1–34; items 1, 2, 6 and part of 11/13/14 marked closed. Highest-value open ones: 7/8 (no need thresholds or trend), 9 (no health/injury), 10 (position on arrival only — PRD-03), 12 (no release date in player units), 19–21 (no employment/skill/payroll), 23 (no sector membership), 29 (assault/escape never triggered), 31 (no tunnel discovery), 34 (a refusal cannot be dismissed and has no location).
**Note:** this document is the most useful product artefact in the repository. It should be linked from `ROADMAP.md`.

---

## (e) The ADR / STATUS-QUEUE process — an honest assessment

### What it is
`docs/adr/README.md` is a mechanically-checked index (35 ADRs; `tests/foundation/adr-numbering-contract.test.ts` verifies filenames, numbering, headings, statuses, table rows in both directions, and link targets). `docs/adr/STATUS-QUEUE.md` is an owner-facing companion whose stated job is the thing the index cannot do: record where an ADR's *status* and the *code* disagree, and hold a queue of decisions awaiting the owner's approval. Its rule: **any commit adding a `Proposed` ADR adds a queue entry in the same commit.**

### What is failing
The document says so itself, at `docs/adr/STATUS-QUEUE.md:339`:

> **Four ADRs have now been accepted without ever appearing in this queue.** 0032, 0033, **0034 and 0035**. All four the same way, and the rule has now failed more often than it has worked, so the count is the finding rather than any one instance.

and diagnoses the cause correctly at `:353-361`:

> the rule's cost is paid by whoever holds the file, and its benefit accrues to a reader who may never arrive. A rule with that shape is not obeyed less carefully over time — it is obeyed until the first collision and then routed around, correctly, by people doing the right thing. **The fix is structural and it is now overdue**: one file per entry in a directory.

That diagnosis is right and I have nothing to add to it. What I can add are three things the document cannot see about itself.

**1. The file has become the largest single artefact in the repository's governance tier, and it is now self-contradictory.** 87 KB / 1,318 lines. Three claims about the same fact coexist in it today:
- the H1 title (`:1`): *"One decision is awaiting approval"*
- §2's heading (`:254`): *"The queue is empty"* — and its body says empty "for the third time"
- §5's opening (`:561`): *"**The queue is not empty** — §2 holds **two** entries — so that premise is withdrawn"*

All three were true at different points on 2026-08-26 and all three are still on disk. A file that exists to keep a report honest cannot be trusted to be honest about itself at this size and this edit rate.

**2. Two of the last twenty-four substantive commits were spent re-anchoring it, and nothing else.** `518e58c` (*"re-read STATUS-QUEUE §§3-6 against main and re-anchor at v0.0.88"*, +328/−115) and `f98330c` (*"re-anchor STATUS-QUEUE at v0.0.98 from the delta"*, +326/−85). That is ~8% of the day's feature-commit budget spent maintaining a status-tracking document, at a point where the game has no incidents, no selection, no regime editor and no animation. The document even institutionalises this with a section titled *"How to extend this anchor cheaply, and what it costs to be allowed to"* (`:75`) — a maintenance protocol for a maintenance document.

**3. The costed thing is metadata, not decisions.** The queue tracks whether a `Status:` line matches `main`. The *decisions* themselves are excellent: I read ADRs 0017 (money primary), 0019 (tile ownership), 0022 (zoning surface), 0028 (object placement), 0034 (guard release), 0035 (catalogue filter), and each one settles a real, narrow, contested question with evidence. The ADR *practice* is working. The ADR *bookkeeping* has grown a second bookkeeping layer, and that layer is what is failing.

### Is it helping, or is it overhead?
**The ADRs: helping, clearly.** 35 decisions in ~100 releases is high but not absurd for a project this contract-heavy, and the decisions are small and specific rather than grandiose. Crucially, ADRs here reliably *ship with their implementing code* — which is the property most ADR practices never achieve.

**STATUS-QUEUE.md: now net overhead.** It was created to solve a real problem (four `Proposed` ADRs invisible on `main`). That problem is solved — every ADR on disk is `Accepted`. What remains is 87 KB of prose whose queue function has failed 4 of 6 times, whose §5 duplicates what `HUD_PROJECTIONS.md`'s gap list and the `tests/foundation/*` allow-lists already assert mechanically, and which costs two re-anchoring commits per ten releases.

**Recommendations, in order:**
1. **Do the structural fix the file itself prescribes**: `docs/adr/queue/NNNN-….md`, one file per pending decision, deleted on acceptance. Two commits can then append without contention, and "the file was held" stops being a valid reason. This is cheap and closes the actual failure.
2. **Split §5 out and shrink it.** "Where an accepted decision and the code disagree" is a genuinely valuable list, but it is the same *kind* of thing as `HUD_PROJECTIONS.md`'s gaps and the reachability allow-lists — and those are enforced by tests, so they cannot rot. Move §5's entries into either the gap list or a foundation test, and let the ones that cannot be mechanised live in a short file.
3. **Delete §1 and §6 outright.** §1 is a changelog of status flips (git has this). §6 is the residue of a stale-sentence sweep that the file itself says *"is now asserted by a test"* — so it is documentation of a solved problem.
4. **Cap the file.** A governance document that needs a documented protocol for cheaply re-verifying its own claims has passed the point where it pays for itself.
5. **Leave the ADR practice alone.** It is the best thing about this project.

---

## (f) Recommended next-3-months priority list

Sequenced so each item unblocks the next, and biased hard toward *making written code reachable* over writing new code.

**Month 1 — make the prison run (P0).**
1. **Scenario / session-seeding layer** (PRD-01). One `ScenarioDefinition` consumed by new-session only: one security sector over the starting chunk, one deployment schedule, one watched sector id, one search policy, utility producers, one starting job. Unblocks incidents, patrol, deployment, search, contraband, gangs, jobs, utilities in one change. **Needs an ADR** — it is a new authority over session state.
2. **Render-delta channel** (PRD-03). Per-frame actor position/velocity/facing plus geometry deltas, replacing the 2-second full-bundle poll. Also decode guards. **Needs an ADR.** Without this, everything item 1 unblocks is still invisible.
3. **Recurring costs** (PRD-07). Daily payroll from the existing `wageBand`, plus per-room upkeep. Half a day's work; it is what makes money mean something.

**Month 2 — let the player see and respond (P0/P1).**
4. **Selection + one generic inspector panel** (PRD-02, PRD-05). Consume `selection.primary`, and put `hud/prisoner-detail`, `hud/room-detail`, `hud/incident-detail` and `hud/staff` behind it. Decide the navigation model in the same ADR, because the tab bar is full.
5. **Incident notification + response controls.** Incidents on the alerts feed (today it carries only refusals and protocol faults — `src/ui/simulation-alerts.ts:198-240`), plus `hud/incidents`, plus pause-on-alert. Then `hud/contraband` and `hud/security`.
6. **Staff roster surface** (PRD-06). Small, and it closes the "I hired someone and nothing happened" hole.

**Month 3 — make it look and read like a game (P1/P2).**
7. **Wire the environment art** (PRD-09). Floors and wall modules first. Highest perceived-quality return in the whole list.
8. **Regime editor + a `work` action** (PRD-04, PRD-11). The genre's signature screen, and it fills the two empty action categories. Retire or repurpose the dead `regime` tab either way — do not ship a tab that renders nothing.
9. **Land purchase** (PRD-10). Delivers a README promise and unlocks the benchmark story.
10. **Housekeeping, timeboxed to one day:** the STATUS-QUEUE structural fix (§e.1–3); `ROADMAP.md` status column; reduce `ISSUE_BACKLOG.md` to its source-of-truth section; add the "what is written but dark" paragraph for phase 11.

**Explicitly deferred:** audio, research/progression, parole/reputation/visitation, cloud-save wiring, additional locales, statistics/graphs, minimap. All correctly parked by the existing roadmap.

**Biggest delivery risk over the next 3 months.** Not capability — the team ships 1,300-line, fully-tested, fully-documented features in an hour. The risk is **continuing to add correct, unreachable mechanisms.** The last five feature commits (`8dc95eb` delivery cancellation, `a44280d`/`e44bcb9` incident-response recovery, `489b061` catalogue filter, `1dcee50`) are all high-quality work on systems the player cannot reach, and two of them (incident-response recovery, guard release) are *repair work on a subsystem that cannot execute at all*. There is no mechanism in the process that asks "can a player reach this?" before work starts — the reachability gates in `tests/foundation/` ask it *afterwards*, and they are satisfied by "a route exists", not "a player uses it". Add that question to the definition of done in `AGENTS.md`: **a feature is not done until a player in a fresh session can cause it.** That one sentence would have redirected most of the last day's work.

**Is ADR-per-decision sustainable at this rate?** At 35 ADRs / 108 releases, the ADRs themselves are fine — they are short, specific, and land with their code. What is not sustainable is the *meta*-tier: 1.67 MB of docs, 54% comment density in source, and a governance document that needs its own maintenance protocol. Total prose in this repository (docs + code comments) is roughly 3.0 MB against ~1.2 MB of actual code — about 2.6:1. That ratio is why the project is so auditable, and also why it can spend a whole commit re-anchoring a status file. Keep the ADRs; cap the meta.

---

## (g) What is genuinely impressive here

This section is not a courtesy. Several things in this repository are better than I have seen in shipped commercial projects.

1. **The reachability-contract test family is a genuinely original engineering idea, and it works.** `tests/foundation/unconsumed-action-contract.test.ts`, `unconsumed-command-contract.test.ts`, `unconsumed-content-contract.test.ts`, `projection-reachability-contract.test.ts`, `unreachable-invariant-contract.test.ts`, `fault-code-reachability-contract.test.ts`, `message-kind-reachability-contract.test.ts` — seven gates that fail when declared vocabulary has no consumer, **and fail in the other direction when a recorded exception goes stale**. That bidirectionality is the part almost nobody gets right: a record of unreachability cannot outlive the fact. It is why this audit could establish "13 commands, 5 of 15 read models, 8 dead rooms, 5 dead staff roles, 2 dead input actions" from the tests themselves rather than by guessing. Most of my critical findings are things the project already knows and has written down precisely.

2. **The debt is documented instead of littered.** One TODO in 56,000 lines. Instead: 34 numbered gaps in `HUD_PROJECTIONS.md`, each stating what is *verifiably true today* and explicitly forbidden from stating a plan (the "invented-consequence defect this repository spends the most effort on"). That distinction — record the fact, not the roadmap — is unusually disciplined and it is why the docs are still trustworthy at this volume.

3. **Refusing to fake things.** `src/ui/hud/projection.ts:44-52` declines to render a 24-hour clock face because "a time no system produces… is the same class of lie as a money counter with no economy behind it". `actorsFromSnapshot` omits `facing` rather than defaulting it, because "an omitted field says 'no facing was published'; a written one would say the simulation chose south". `roomCatalogue()` drops nothing for want of a label so it "cannot silently show a shorter list than the catalogue holds". A demo actor feed exists but is opt-in behind `?actors=demo` and explicitly never merged with real actors. This project consistently prefers a visible absence to a plausible fabrication, which is exactly backwards from how most game prototypes are built — and it is why the gaps I found are *real* gaps rather than illusions I had to see through.

4. **The integration tests prove the loop on the real path.** `tests/integration/furnished-prison-loop.test.ts` drives real commands through the real kernel, real construction, real navigation and real action system: build a shower room, place a shower head, admit a prisoner, and assert the prisoner *walks there and showers*. `furnished-cell-loop.test.ts`, `economy-build-loop.test.ts`, `prisoner-admission-loop.test.ts`, `room-zoning-loop.test.ts` do the same for their slices. And every expected value is a measured literal, never computed by the code under test — with a note recording that three instances of that mistake were found in one day. The working part of this game is *provably* working.

5. **The browser suite measures things nobody measures.** `tests/browser/app-shell.spec.ts` (5,263 lines) checks that every HUD control is a real tap target, that every control can actually be pressed *on every tab at every viewport*, that a panel's last block is inside its fold, that the alerts list repaints in view-model order rather than first-seen order, and that a click in the centre of the screen reaches the world and not the HUD. The finding that "a fifth tab leaves 1.8px of margin at 375×812, so a sixth is foreclosed" came from a real browser measurement, not an opinion. Accessibility and touch were treated as contracts from the start.

6. **Persistence is the most finished tier, and it is genuinely hard.** Versioned envelopes, checksums, generation retention with corrupt-generation fallback, a real V1→V2 migration tested against real IndexedDB after a real navigation, quota exhaustion that fails without destroying the last good generation, per-session workers so "load" means what a player expects, and a dirty-driven autosave. Most games get this wrong forever.

7. **The architecture boundaries are real and enforced.** The HUD imports nothing from `src/simulation/**` and a test proves it. The simulation has no ambient nondeterminism and a test walks the import closure to prove it. Iteration order is canonical everywhere that feeds state, with a test per instance. Rendering never owns truth. These are the boundaries that decide whether a simulation game is still workable at year three, and they are held.

8. **The velocity is extraordinary and the quality did not drop to get it.** 24 substantive commits and 23 releases in 7 hours 19 minutes (11:42→19:01 on 2026-08-26), averaging ~1,300 net insertions, each with tests, docs, and often an ADR. There is no sign of corner-cutting in the diffs I read. The problem is not that the work is bad — it is that the work is aimed at correctness in systems the player cannot yet reach.

**The honest summary of this project:** it has built the hard 70% that most prison-sim attempts never survive — determinism, chunked world, budgeted navigation, versioned persistence, a clean worker boundary, a real content pipeline — and it has built it to a standard that will still be workable in three years. What it has not built is the thin, unglamorous layer that turns those systems into a session a person can play: seed the world, show what is happening, let the player respond. That layer is small. It is the whole difference between where this is and a playable game.
