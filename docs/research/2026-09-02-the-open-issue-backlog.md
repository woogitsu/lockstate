# Triaging the open issue backlog: 85 issues read against the code, 25 of them already fixed

**Date:** 2026-09-02
**Tree:** branch `docs/triage-the-open-issue-backlog`, cut from `origin/main` at `af999415`
(v0.0.350); `origin/main` at `03ad071e` (v0.0.352) merged in afterwards. Every verdict and
every `file:line` below was taken at `af999415`. **Two commits arrived while this pass ran
and both were re-checked against it**: `75a3797b` (#798, for the out-of-scope #788) adds
ADR 0090 and `src/simulation/prisoners/classification-early-warning-system.ts`, and
`e0ca2bd5` (#803) adds five mechanical traps to `docs/AGENT_WORKFLOW.md` — see §7 for the
inference this record drew from the second one and then had to withdraw. **Exactly one
citation below moved under them and is stated here rather than silently rewritten:**
`src/simulation/prisoners/classification-review-system.ts:237`, cited in §1 for #593's
re-ranging, is at `:253` on the branch tip; the line at `:237` now discusses the tick-47,999
run instead. Nothing else in this record reads differently at either commit — the ADR index
figures in §4 are explicitly dated to `af999415`, and ADR 0090 makes them 36 / 48 / 84 at
`03ad071e`.
**Corpus:** every open issue as of 2026-09-02, read from the REST API (`state=open`,
two pages, 98 issues and 4 pull requests), less thirteen the owner reserved: #772, #777,
#780, #788, #791, #793 and #794 (in flight in #798/#799/#800), and #584, #599, #604,
#629, #639 and #703 (owner rulings and umbrellas). **85 issues examined.**

**Why this pass exists.** On 2026-09-02 the owner checked two open issues at random and
both were already fixed on `main`, in full, with the corrections marked in both
directions — #608 (a STATUS-QUEUE §2 entry holding a pre-fix measurement in the present
tense) and #760 (ADR 0081's index row contradicting its own body). Neither had been
closed. A stale open issue is not inert here: it is handed to an agent as a brief, and
the agent then re-fixes what is fixed or reverts the correction that fixed it.

**The result, in one line: 25 of 85 are already fixed and 11 more rest on a premise that
has rotted, so 42% of the open backlog cannot be worked as written.**

---

## 0. How to read this record, and what it is not

Following `docs/research/README.md`'s tiers, narrowed to what this pass could actually
obtain:

- **VERIFIED** — the file was opened at the cited line and the text is quoted or
  paraphrased from what was on the screen. Every `file:line` below is VERIFIED unless
  the sentence says otherwise.
- **TEST-RUN** — a test was executed in this worktree and its output pasted. Fourteen test files were executed in this worktree; each is named where it is used, and
  their names are `hud-refresh-cadence-contract`, `adr-status-queue-anchor-contract`,
  `kernel-system-order`, `security-deployment`, `prisoners-cell-sharing`,
  `prisoners-classification`, `ui-hud-alert-row-label`, `ui-simulation-events`,
  `economy-insolvency-rung-system`, `economy-money-conservation`, `economy-loan-recovery`,
  `economy-liquidity-hard-lock`, `needs-state-grant-loop` and
  `risk-tier-neglect-reachability`.
- **TEST-READ** — a test file was opened and its assertions read, but **not run**. Every
  browser (Playwright) citation is this tier and §8 says why.
- **UNKNOWN** — could not be established here.

**Two things this record deliberately does not do.** It does not close anything — that
is the owner's, and the verdicts below are proposals. And it does not walk the
Definition-of-Done checklist of the twelve roadmap epics (#9, #20, #29–#41); for those
it establishes only whether the named deliverable exists in the tree, which is enough to
rule out "already fixed" and not enough to close them. §6 says so again where it
matters.

**The rule this pass held to, because it is the one the corpus paid for.** No verdict of
ALREADY FIXED was taken from a commit message, a pull-request body or an ADR saying it
was fixed. In every case the code was opened. That rule earned its keep twice: once in
§4's #274 spot-check, where a grep for the words an issue *proposed* found nothing and
the fix was there under different words; and once in §3's #291, where the issue's own
verification method has stopped working and the answer had to be reached another way.

---

## 1. The verdicts

| # | Verdict | The one load-bearing citation |
| --- | --- | --- |
| 9 | **B** still open | Roadmap umbrella; its unticked dependency is #20, and §6 confirms #20's own blocker stands |
| 20 | **B** still open | `src/persistence/cloud/supabase-client.ts` exists and **nothing in `src/main.ts` constructs it** — `grep -rn "createSyncEngine\|SupabaseCloudClient" src/main.ts src/ui/` is empty, which is the issue's own stated blocker |
| 29 | **B** still open | No ledger: `src/simulation/economy/` holds nine files and none of them is one (`income.ts`, `insolvency-rung-system.ts`, `just-in-time-materials.ts`, `loans.ts`, `payroll.ts`, `procurement.ts`, `treasury.ts`, `wages.ts`, `index.ts`) |
| 30 | **B** still open | No progression graph and no program system: `src/simulation/` holds no directory for either (`ls src/simulation/` lists 26, none of them progression), and `grep -rl "unlock" src/simulation/` finds no node graph |
| 31 | **B** still open | `parole` appears once in `src/`, in a comment at `src/simulation/prisoners/prisoner-operations-runtime.ts`; there is no parole case record, hearing or reoffending model |
| 32 | **C** partly fixed | **Both named halves exist:** the Blender step at `tooling/blender/pack-sprite-atlas.py` and the eight-direction contract at `assets/contracts/character-8-direction.contract.json`, consumed at `src/rendering/actors/actor-pose.ts:16`. The epic's remaining scope was not walked |
| 33 | **B** still open | No audio at all: `grep -rlE "Howler\|AudioContext\|playSound" src/` is empty; `weather` appears nowhere in `src/` |
| 34 | **B** still open | Save slots exist in the SQL tier (`src/persistence/cloud/supabase-client.ts:129`), account upgrade does not; `grep -rn "upgradeAccount" src/` is empty |
| 35 | **B** still open | `grep -rlE "photoMode\|inspector-link\|shareUrl" src/` is empty |
| 36 | **C** partly fixed | All four service modules exist — `src/services/{challenges,entitlements,telemetry,localization}` — and **ADR 0008 states the other half itself** at `docs/adr/0008-trusted-service-boundary.md:634`: *"the deployment units are still not created, exactly as this"* |
| 37 | **B** still open | `grep -rlE "Kronikarz\|eventPacing" src/` is empty |
| 38 | **B** still open | `grep -rlE "Regulamin\|dilemma" src/` is empty |
| 39 | **C** partly fixed | Gangs exist (`src/simulation/incidents/gangs.ts`) and are read by cell allocation (`src/simulation/prisoners/cell-sharing.ts:37`); traits and memorable-character history do not exist |
| 40 | **B** still open | `grep -rlE "cozy\|Cozy\|reducedPressure" src/` is empty |
| 41 | **B** still open | `grep -rlE "seasons\|escapeMode" src/` is empty |
| 78 | **A** already fixed | The scored tier is at `src/simulation/prisoners/classification.ts:216` (`{ factors, score, riskTier, … }`) and the periodic review at `src/simulation/prisoners/classification-review-system.ts:103`. §2 explains why the binary the issue quotes survives |
| 79 | **A** already fixed | `src/simulation/prisoners/cell-sharing.ts` answers it by name at `:28` and `:37`, and `src/simulation/prisoners/intake-system.ts:552` hands the current occupants to it: *"`findBestAvailable` hands the current occupants to a rating"*. TEST-RUN: `tests/unit/prisoners-cell-sharing.test.ts`, 14 passed with `prisoners-classification.test.ts` |
| 81 | **B** still open | Intake still completes in the tick it starts: `src/simulation/prisoners/intake-system.ts` advances the five stages with no dwell, and no stage carries a duration |
| 95 | **D** stale premise | §5. Its lead claim — *"`https://lockstate.io` is live and serves the game"* — is contradicted by `docs/DEPLOYMENT.md:361`: *"**Not in force on 2026-08-27** — the owner has the domain's deploy switched off"* |
| 99 | **B** still open | Not stale, and this one was checked because it looked stale: `docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md:863-864` says *"salvage remains the open mechanic it was before B"* and that a built object's value *"returns as **nothing at all today**"* |
| 116 | **D** stale premise | §5. A continuation prompt written against a 21-ADR corpus; there are 83 rows now (§4) |
| 121 | **B** still open | Its item 5 is the only live one and is undischarged: `docs/ISSUE_BACKLOG.md:29-35` still says the table stops at phase 7 and points at #121 for the decision |
| 274 | **C** partly fixed | §4. Two spot-checks both discharged — ADR 0016 is now **Accepted** (`docs/adr/README.md:172`) and X4's clause landed verbatim at `docs/adr/0003-…:563` — but ~30 findings were not re-walked |
| 280 | **B** still open | Durable record; its owner-gated half stands, because `supabase/migrations/` is exclusion 2 and the two RPC defects it neighbours (#340, #343) are still there |
| 288 | **D** stale premise | §5. *"Eleven of thirteen registered systems iterate permanently empty collections"* — there are **23** registered systems now (16 in `src/simulation/runtime/new-session.ts`, 7 in `src/simulation/prisoners/prisoner-operations-runtime.ts`) and several of the eleven have producers |
| 291 | **A** already fixed | §3. **0 of the 101 branch names in its body still exist on the remote**, checked against `git ls-remote --refs --heads origin` |
| 292 | **D** stale premise | §3. Its counts (124 branches, 22 unmerged) are now 435 heads, and the `git merge-base --is-ancestor` test both it and #291 rest on has stopped meaning "merged" |
| 340 | **B** still open | `supabase/migrations/20260822190300_create_save_version_rpc.sql:95-106` still raises `'prison % does not exist'` and `'not authorized for prison %'` as two distinguishable exceptions, and **no later migration replaces the function** (`grep -l "create or replace function public.create_save_version" supabase/migrations/*.sql` returns that file alone) |
| 342 | **B** still open | §7. Both halves are still on `main`: `docs/DEPLOYMENT.md:203` (*"automatically, on every merge to `main`, through Supabase's own GitHub integration"*, gate column **none**) against `docs/DEPLOYMENT.md:465` (*"Everything dated after `20260823100000` is not applied there yet"*) |
| 343 | **B** still open | `supabase/migrations/20260823100000_bound_free_tier_capacity.sql:273` still declares `status text, -- 'created' \| 'at_slot_limit' \| 'slot_taken'` with no fourth member, and it is the last definition of `create_prison` in the tree |
| 347 | **B** still open | Coverage record; accurate because three of the findings it companions (#340, #342, #343) are verified still open above |
| 424 | **A** already fixed | `.github/workflows/deploy.yml:435` — the `staging-blocked` job, whose guard is the `staging` guard with `conclusion != 'success'` negated, and which **fails** so a blocked deploy concludes `failure` instead of `skipped`. TEST-READ: `tests/foundation/deploy-blocked-announcement-contract.test.ts` |
| 428 | **D** stale premise | §5. Continuation prompt, "nine decisions await a call" — dated 2026-08-26 |
| 446 | **D** stale premise | §5. Continuation prompt, dated 2026-08-27 |
| 449 | **B** still open | `tests/foundation/adr-status-queue-anchor-contract.test.ts:89` is still `const ANCHOR_STALENESS_BUDGET_RELEASES = 10` — the unit the issue argues against is unchanged. TEST-RUN: 4 passed, so the gate still reports headroom, which is the issue's point |
| 477 | **A** already fixed | §2. `src/simulation/incidents/flashpoint.ts:173-180` answers it by name and puts the cost on the income line instead of the riot model. TEST-RUN: `tests/integration/needs-state-grant-loop.test.ts`, 7 passed, including the describe block *"the riot model is untouched, which is the point of putting the cost on the income line"* and *"is worth 3,200 more over ten days than the same prison without the two rooms"* |
| 503 | **C** partly fixed | Finding 2 landed whole (`src/simulation/events/event-log.ts:322` `recordDischarge`, sentence at `src/content/default-locale-en.ts:777`). Finding 1 has a surface — `src/ui/hud/regime-panel.ts:86`, *"the bar's `warning` tone means the state is withholding for this need"* — and the same docblock reserves the rest: *"the player-facing 'your prisoners are unhappy' line — the owner's"* |
| 506 | **A** already fixed | Both named defects. Finding 1: `src/ui/hud/regime-panel.ts:647` — `rosterEmpty.hidden = shown.length > 0 \|\| roster.everAdmitted;` — so a prison emptied by discharge draws no sentence rather than a false one. Finding 2: `src/ui/hud/projection.ts:883` reads `counts.activeIncidentTypeLabelKey`, so the tile names the kind |
| 517 | **B** still open | `src/ui/hud/build-panel.ts:510` still returns the bare `hud.build.target-none` (*"Point at the world"*, `src/content/default-locale-en.ts:1038`) with no viewport-conditional cue. §9: authoring that cue is exclusion 4, so this stays open pending the owner rather than being an agent's to fix |
| 535 | **A** already fixed | Record rather than defect, and its queue is discharged: decision 1's event channel is `src/simulation/events/event-log.ts` with sentences at `src/content/default-locale-en.ts:777-849`, decision 5's sentence range at `src/simulation/prisoners/sentence.ts:200-201` |
| 537 | **D** stale premise | §5. Continuation prompt, dated 2026-08-29, and it says so itself: *"Every fact below may be stale"* |
| 538 | **A** already fixed | The counter the issue proved had no reader now has two: the strip chip's badge `'{count} with no bed'` (`src/content/default-locale-en.ts:167`, projected at `src/ui/hud/projection.ts:708`) and the Intake panel's `hud.intake.no-place` (`src/ui/hud/intake-panel.ts:182-187`). Both sentences are the owner's own — the locale comment at `:159` says *"The owner's wording, approved before it was built"* |
| 540 | **D** stale premise | §5, and it is the most important one. Half the title is still true and the conclusion is refuted: tier 3 **is** reached, at tick 47,999, with `priorIncidents` pinned at 0 throughout. TEST-RUN: `tests/integration/risk-tier-neglect-reachability.test.ts`, 2 passed |
| 553 | **D** stale premise | §5. Standing continuation issue anchored at v0.0.189 and superseded by #604 |
| 557 | **B** still open | The warning it files is still live and unviolated: `src/simulation/security/patrol-system.ts:77` is still `if (sector.patrolRoute === undefined \|\| sector.patrolRoute.length === 0) continue;`, and the only `patrol` hit under `src/ui/` is still the comment at `src/ui/simulation-staff-coverage.ts:39` |
| 565 | **A** already fixed | The setup now does exactly what the issue's "fix shape" asked: place, buy, poll, **then** move the clock. `tests/browser/app-shell.spec.ts:2722-2757` argues it — *"the order of this block is therefore the fix: place, buy, poll, and only then let the clock move at all"* — and `:2761` re-asserts `data-pending === '9'` after the beat |
| 573 | **B** still open | `src/simulation/contraband/informants.ts:73` `reportInformantTip` still has no caller, and `src/simulation/runtime/new-session.ts:1007` says so in the tree's own words: *"finds exactly one line, inside `reportInformantTip`, which itself has no"* |
| 576 | **B** still open | All three halves. The feed still marks dirty on the command's *scheduled* tick and never on a construction completion (`src/rendering/feed/simulation-snapshot-feed.ts:298-320`), the false clause is still in its header at `:41-46`, `DEFAULT_POLL_INTERVAL_SECONDS = 30` is still at `:107`, and the two sentences the issue asked to be corrected in both directions are still at `src/ui/hud/rooms-panel.ts:1267-1276` |
| 582 | **B** still open | RED-001 reproduces exactly as described: `src/persistence/session/session-controller.ts:515-518` is `if (this.session?.prisonId === prisonId) this.closeSession(); await this.repository.delete(prisonId);` and `closeSession()` (`:542-545`) disposes autosave and clears the field without stopping the runtime host |
| 586 | **B** still open | No implementation: no `#586` reference anywhere under `src/` or `tests/` |
| 587 | **B** still open | No delivery-gate cap: no `#587` reference under `src/` or `tests/` |
| 588 | **A** already fixed | `src/simulation/prisoners/safety-coverage-system.ts:103` (`export class SafetyCoverageSystem`), registered in `src/simulation/runtime/new-session.ts`, with `safety` removed from the sleep action for it (`src/simulation/prisoners/actions.ts:76`, *"`safety` is no longer one of this action's effects (issue #588)"*) and the census on the strip (`src/ui/hud/projection.ts:402`) |
| 589 | **B** still open | No injury flag: no `#589` reference under `src/` or `tests/` |
| 590 | **B** still open | No holding-cell overflow: no `#590` reference under `src/` or `tests/` |
| 591 | **B** still open | No labour income line: `grep -rn "labourIncome\|labour credit" src/simulation/economy/` is empty |
| 592 | **B** still open | No meal portions and no clean kits: `grep -rn "portion\|clean-kit" src/simulation/` finds only unrelated uses of *proportional* |
| 593 | **A** already fixed | The owner ruled and it shipped: `src/simulation/prisoners/sentence.ts:200-201` is `MIN_SENTENCE_DAYS = 14` / `MAX_SENTENCE_DAYS = 90`, and `src/simulation/prisoners/classification-review-system.ts:237` records the re-ranging by number |
| 594 | **B** still open | No intake queue control and no bounty: no `#594` reference under `src/` or `tests/` |
| 595 | **B** still open | No new room readers: no `#595` reference under `src/` or `tests/` |
| 596 | **B** still open | ADR 0075 decision 1's threshold grants do not exist, and `src/simulation/economy/income.ts:683` says so: *"Decision 1's threshold grants and any later contract reward are the two inflows the ruling names that do not exist yet"* |
| 597 | **B** still open | No `#597` reference under `src/` or `tests/` |
| 600 | **B** still open | No `#600` reference under `src/` or `tests/`; the job system is registered but not bound to room instances |
| 632 | **A** already fixed | §2. Both thresholds are now reachable and were made so on purpose: `src/simulation/prisoners/sentence.ts:200-201` gives 33,600–216,000 ticks against `LONG_SENTENCE_THRESHOLD_TICKS = 200_000` (`src/simulation/prisoners/classification.ts:41`) and `CLASSIFICATION_REVIEW_INTERVAL_TICKS = 24_000` (`:105`) |
| 641 | **D** stale premise | §5. *"ADR 0075 has three Accepted decisions and none of them is built"* is false — decision 2 is built — and the arithmetic moved. TEST-RUN: `tests/integration/economy-liquidity-hard-lock.test.ts`, 6 passed, whose case is now *"spends the grant and the starter rung on 654 bricks, and the ECON-002 lock stays shut since the owner`s second ruling on #771"* |
| 657 | **C** partly fixed | ADR 0087 decision 2 shipped — `PRISON_CONDITIONS` at `src/simulation/protocol/types.ts:668-674`, four members, recomputed per publication and in no snapshot — and `docs/adr/README.md:243` reserves the rest: *"Proposed, 2026-09-01, for decisions 1, 3 and 4. Not self-approved"* |
| 661 | **B** still open | No `pl` catalogue: `src/content/` holds `default-locale-en.ts` and no sibling. §9: translation is exclusion 4 |
| 662 | **C** partly fixed | The issue's literal grep is now false — `src/services/localization/chunk-catalog-loader.ts:41` is `export interface ChunkCatalogLoader extends MessageCatalogLoader` — and its title claim still holds, because `:6` says so: *"PROTOTYPE (#662). Nothing in `src/main.ts` uses this yet"* |
| 663 | **B** still open | No picker: `grep -rn "locale" src/ui/display-scale.ts` is empty and nothing in `src/main.ts` selects a locale |
| 664 | **A** already fixed | Both gates. Gate 1 is `tests/helpers/locale-catalog-audit.ts` driven by `tests/unit/locale-catalog-audit.test.ts:65` (*"auditing a non-default locale catalogue (#664)"*); gate 2 is the pseudo-locale marking at `src/services/localization/pseudo.ts:13` and the sweep at `tests/browser/pseudo-locale-sweep.spec.ts:242` |
| 667 | **B** still open | `docs/AGENT_WORKFLOW.md` at `af999415` has no such paragraph: `grep -n "false reds\|start and throughout" docs/AGENT_WORKFLOW.md` is empty, and the contention bullet it would extend is at `:179-196`. §7: it is being edited in the owner's checkout right now, so it is very likely in flight |
| 692 | **A** already fixed | ADR 0075 decision 2 is built: `src/simulation/economy/loans.ts`, the floor set at `src/simulation/runtime/new-session.ts:738`, and the ladder at `src/simulation/economy/insolvency-rung-system.ts`. TEST-RUN: `tests/integration/economy-loan-recovery.test.ts`, 5 passed, including *"funds its own tail out of the standing overdraft and is not locked at all"* |
| 700 | **A** already fixed | `src/ui/hud/event-band-dwell.ts:52` — `export const EVENT_BAND_DWELL_FLOOR_MS = 600` — whose docblock names the defect: *"which is exactly what the escape sentence did not do: written three times, painted zero times"*. TEST-READ: `tests/browser/ui-escape-sentence-survival.spec.ts` |
| 717 | **A** already fixed | `src/simulation/construction/system.ts:764` calling `refundSurplusOf` (`:820`), written for exactly the state the issue reproduced: *"an order cancelled soon after it is placed is holding **nothing** … while its money sits in a delivery on the road"*. TEST-RUN: `tests/integration/economy-money-conservation.test.ts`, 24 of the 29 passing cases, including *"refunds the money for an approved order, in the same tick it was placed"* |
| 718 | **D** stale premise | §5. The pull layer's binding cadence was never the counts channel. `src/main.ts:1164-1180` states the correction and `:1796-1803` is the six-way predicate that carries the clock into the refresh block. TEST-RUN: `tests/foundation/hud-refresh-cadence-contract.test.ts`, 5 passed, including *"would freeze for the whole window if the clock left that predicate, which is the mutation this file kills"* |
| 719 | **B** still open | ADR 0085's own index row settles it: `docs/adr/README.md:241` — *"**Decision 1's direction shipped in `src/` on 2026-09-01, decision 2 has not.**"* Decision 2 is the strip, which is this issue. §9: it is a copy decision, so it stays the owner's |
| 739 | **A** already fixed | `src/ui/hud/hud.css:461` — *"**DONE, 2026-09-01, FOR #739.** `.hud-minimap`'s width moved from 224px to"* — the widening the issue's four cures were weighed against. TEST-READ: `tests/browser/ui-alerts-column.spec.ts`, which pins the *property* (`MAX_LINE_BOXES = 4` at five viewports) rather than the 396px |
| 740 | **C** partly fixed | Part 1 fixed: the snap is gone, `src/simulation/security/deployment-system.ts:254` is `if (this.guards.locomotion.beginWalk(guardId, routeWaypoints(outcome.result.route)))`, and `setTile` no longer appears in the file. TEST-RUN: `tests/unit/security-deployment.test.ts`, 6 passed, including `:76` *"a deployed guard walks tile-by-tile to its post rather than being snapped there (#740)"*. Part 2 is explicitly **not** fixed: `docs/adr/README.md:244` says *"`Travelling` stays a rarely-seen state even now … how often a player should see a guard walking is left undecided"* |
| 741 | **A** already fixed | All three of D10 and D11's asks, as one shape. Count and day: `src/ui/hud/alert-row-label.ts:42`. Dismissal: `src/ui/hud/hud.ts:1964` and `:2003`. Reload survival: `src/persistence/save-schema.ts:622` and `:1256` (`alerts: alertsSectionSchema.optional()`). TEST-RUN: `tests/unit/ui-hud-alert-row-label.test.ts` with two siblings, 60 passed |
| 749 | **A** already fixed | All four controls now speak, in the owner's own words: `src/content/default-locale-en.ts:871-876` carries `construction.order-cancelled`, `order-cancelled-underway`, `undone`, `redone` and `economy.delivery-cancelled`, read at `src/ui/simulation-events.ts:885-890`. The issue's *"`hud.build.queue-cancel` is the bare word `Cancel`"* aside is answered too — `:838` gives the cancellation `{total}` |
| 760 | **A** already fixed | `docs/adr/README.md:236` now carries *"**FOUR OF THIS ROW'S CLAIMS WERE TRUE WHEN IT WAS WRITTEN AND ARE NOT TRUE NOW, and they are corrected here rather than overwritten**"*, naming #760 and dating it. §2 records the drift the fix itself introduced |
| 764 | **A** already fixed | `src/ui/hud/hud.ts:2001` — `row.setAction(dismissAction)` is now **outside** the create/reuse branch, with `dismissible` computed at `:1964` and the docblock at `:1927-1963` naming the issue. TEST-READ: `tests/browser/ui-alert-dismiss.spec.ts:160` *"a reused row that gains occurrences grows the dismiss control"* |
| 765 | **A** already fixed | All eight sites, and the ADR amendment the issue also asked for. `src/main.ts:1194-1206` carries the correction and `:1942`, `:1956`, `:1975`, `:1982`, `:1990`, `:1998` all read *"~300ms in a browser"* with the harness figure named beside them; `docs/HUD_PROJECTIONS.md:560-567` matches; and `docs/adr/0086-…:563` marks its own bound *"**FALSIFIED**"* |
| 767 | **A** already fixed | The owner went further than ADR 0087 recommended and both halves shipped: the standing conditions `treasury.deliveries-refused` / `treasury.construction-refused` (`src/simulation/protocol/types.ts:668-674`) **and** the crossing notice (`src/simulation/economy/insolvency-rung-system.ts:164` → `src/simulation/events/event-log.ts:495`), with sentences at `src/content/default-locale-en.ts:815-816`. TEST-RUN: `tests/unit/economy-insolvency-rung-system.test.ts` |
| 768 | **A** already fixed | The owner took **both** of the issue's first two options: `danger` re-pointed at the deliveries rung and a third tone added. `src/ui/hud/projection.ts:620` (`overdraftTone`, whose docblock at `:525-560` argues the third tone) and `src/ui/primitives/status-badge.ts:11` (*"`'critical'` was added for issue #768's ruling of 2026-09-01"*) |
| 771 | **A** already fixed | Both findings. Finding 1: the rungs are equalised at −1,250, `src/simulation/economy/treasury.ts:427-440`, which quotes the issue's own *"ten wall segments, 800 spent, all went through silently"*. Finding 2: `nextOrderShortfallMinorUnits`, `src/simulation/presentation/construction-projection.ts:142-152`, read at `src/ui/hud/build-panel.ts:1912` |

**Counts: A 25, B 41, C 8, D 11 — 85.**

---

## 2. Four fixes whose own citations have drifted, and one that drifted inside the fix

`docs/AGENT_WORKFLOW.md` §4 says a `file:line` into a document under active edit is the
least durable citation in this repository. That is true of issue bodies too, and the
practical consequence for a triage pass is worth stating: **an issue whose cited line no
longer says what it said is not thereby wrong.** Four cases here, and in every one the
function stayed exactly where the issue described it while the line number moved.

- **#632** cites `src/simulation/prisoners/sentence.ts:120-146` for the draw. The draw is
  at `:225-226` now — about 100 lines of drift — and it is the same function,
  `drawSentenceLengthTicks`. Its sibling citation, `classification.ts:40-45` for the
  threshold, is still right to within one line (`:41`). The issue is nonetheless
  **already fixed**, because the numbers changed: `[2, 16]` days became `[14, 90]`, so
  33,600–216,000 ticks now straddles both thresholds the issue proved unreachable, and
  `sentence.ts:119-129` argues that the 90 was chosen *because* 200,000 had to be
  crossed.
- **#576** cites `src/ui/hud/rooms-panel.ts:1164-1190` for the accepted false negative.
  It is at `:1267-1276` now, and both sentences the issue asked to have corrected in both
  directions are still there, unamended: *"which can go stale for as long as the session
  stays paused"* and *"costs confusion for one press and no more"*. The issue measured a
  running prison at ×2 and a ~16-second window. **Still open**, and the drift is drift.
- **#740** cites `deployment-system.ts:202` and quotes two lines of `setTile`. That code
  does not exist any more — `grep -n setTile src/simulation/security/deployment-system.ts`
  returns nothing — which is the fix rather than the citation rotting.
- **#788**'s citations, by contrast, were re-opened by another pass and *held* exactly:
  `docs/research/2026-09-01-are-the-risk-tiers-reachable.md` §1 tabulates them. Worth
  recording as the control case: drift is common here, not universal, and the only way to
  tell is to open the line.

**And the drift that is inside a fix.** #760 is **already fixed** — `docs/adr/README.md:236`
now carries a four-claim correction naming the issue. But that correction cites
`src/simulation/runtime/new-session.ts:728` for the `setOverdraftFloor` call, and the call
is at **`:738`**. The correction was right about the fact and ten lines out about where to
find it, on the day it was written. This is `docs/AGENT_WORKFLOW.md` §4's rule biting the
paragraph written to obey it, and it is why that rule prefers a quoted sentence to a line
number. **Handing this over rather than fixing it: `docs/adr/README.md` is the owner's and
two other passes are in it.**

**One more of this shape, and it is a live contradiction rather than a drift.** #78 is
already fixed, and the line it quotes as the defect —
`riskTier >= 3 ? 'high-risk' : 'general-population'` — is *still there*, at
`src/simulation/prisoners/classification.ts:59`. It survives because ADR 0032 decision 3
answered #78's own question (*"decide whether person-classification and room-grade are the
same axis or two, and say which"*) with **two**, so the binary is now the housing group and
the scored tier is the other axis. An agent handed #78 as a brief would find the quoted
line, "fix" it, and undo a decision.

---

## 3. #291 and #292: the work was done, and the method that proved it has stopped working

These two are the clearest case in the corpus of a verdict that could not be reached by
the issue's own instrument.

**#291 is already fixed, and not by a little.** It enumerates 100 branches (101 names
appear in its body) as fully merged and deletable. Extracting every ``code``-quoted
`owner/name` token from the body and checking each against the real remote:

```
$ git ls-remote --refs --heads origin | wc -l
435
$ comm -12 <(sort heads.txt) <(sort b291.txt) | wc -l
0
```

**Zero of 101 survive.** The deletions happened. Deleting branches is the owner's call
(`docs/AGENT_WORKFLOW.md` §1), so this is a record of work already taken rather than work
to take.

**#292 is a stale premise, and so is the test both issues rest on.** Its headline count
(92 unmerged, corrected in its own body to 22 of 124) is now 435 heads. More importantly,
its verification method has quietly stopped meaning what it meant:

```
$ 435 heads checked with git merge-base --is-ancestor <head> origin/main
merged=3 unmerged=432
```

Three. That is not because 432 branches are unmerged; it is because `main` is now built by
**squash merge**. `git log --oneline -20 origin/main` is linear, every non-release commit
ends in `(#NNN)`, and `git log --merges -5` reaches back past #452 to find one. A squashed
branch's tip is never an ancestor of `main`, so `--is-ancestor` — which #291 and #292 both
used, correctly, and which #291 was *corrected* into using after a shallow clone misled it
— now answers "unmerged" for branches whose content shipped. **Anyone re-running this
triage needs a content test (`git cherry`, or a patch-id comparison), not an ancestry
test.** That is the finding worth keeping out of these two issues.

The general problem is meanwhile four times worse than when #291 was filed: 124 heads then,
435 now.

---

## 4. The ADR index, counted the way the brief said to count it

The commissioning brief warned that `grep -c` over `docs/adr/README.md`'s status column
over-counts, because status cells quote words like *"Proposed"* while narrating their own
history, and gave figures to verify rather than trust. Verified, and both halves of the
warning hold:

| method | Proposed | Accepted |
| --- | --- | --- |
| `grep -c` (lines containing the word) | 53 | 57 |
| `grep -o \| wc -l` (occurrences) | 54 | 57 |
| **leading word of each status cell** | **35** | **48** |

83 index rows, and 83 numbered files on disk — they agree. The brief's figures were
34 / 47 / 81; they are **35 / 48 / 83** at `af999415` (v0.0.350), the difference being
ADR 0089 arriving Proposed and ADR 0088 flipping to Accepted. So the brief was right and
one release out of date, which is the ordinary state of a count in this repository and
the reason §5's category exists.

Six numbers have no file — 0018, 0030, 0055, 0058, 0060, 0072 — and the index describes
them as withdrawn rather than missing, so number hygiene (one of #274's five subjects) is
intact.

**The spot-checks of #274 that made it a (C) rather than a (D).** Two of its findings were
re-opened. Q1/X3 — *"is the Supabase GitHub integration approved?"*, filed as the only
Proposed ADR whose subject can destroy data — is discharged: `docs/adr/README.md:172`'s ADR 0016 row now ends in a bare `Accepted`. X4 — ADR 0003's
`SharedArrayBuffer` paragraph needing a clause about ADR 0021 — is discharged too, and
**this is where the "open the code" rule earned its keep**: a grep for the words #274
proposed (*"cross-origin isolation was subsequently delivered"*) returns nothing, and the
fix is at `docs/adr/0003-…:563` in different words — *"One of those three has since been
delivered and this paragraph should not be read as though it had not"*. A grep-only pass
would have reported a false STILL OPEN.

Two discharged findings out of roughly thirty do not license closing #274. **What this pass
did not reach: the other ~28.**

---

## 5. The eleven rotted premises, and why they are their own category

Category (D) is not a softer (A). An issue is (D) when the *reasoning* in it no longer
holds, so the issue cannot be acted on as written even if something in its neighbourhood
is still wrong. #608 — the correction that prompted this whole pass — was exactly that
shape. Three kinds of rot appear here, and the third is the dangerous one.

### (a) A session snapshot outliving its session — #95, #116, #428, #446, #537, #553

Six issues are dated handovers or continuation prompts. They are stale by construction and
some of them say so (#537: *"Every fact below may be stale. Verify against `origin/main`
before acting on any of it. That instruction is not boilerplate: this exact brief's
ancestors caused real errors twice today by being believed."*). What makes them worth
naming rather than waving at is that at least one is now **affirmatively false** in a way a
reader would act on: #95 leads with *"`https://lockstate.io` is live and serves the game"*
and `docs/DEPLOYMENT.md:361` records the opposite — *"**Not in force on 2026-08-27** — the
owner has the domain's deploy switched off"*. #604 is the live handover and is out of scope;
these six are its ancestors.

### (b) A count that has moved — #288, #292

#288's whole argument runs off *"eleven of thirteen registered systems iterate permanently
empty collections"*. There are 23 registered systems now — enumerable by
`grep -rn "registerSystem(" src/simulation/`, 16 in `new-session.ts` and 7 in
`prisoner-operations-runtime.ts` — and the dormancy claim has been falsified piecemeal
(`sectorSearchDuty` and `searchSystem` have a producer; `safetyCoverage` and
`insolvencyRungs` did not exist). Its *conclusions* — don't prune, navigation is the real
cost, removing a save section costs a schema bump — may all still be right; it is the
premise that cannot be re-derived. `docs/AGENT_WORKFLOW.md` §4 predicted this exact failure:
*"a sentence asserting an absence or a count rots first"*.

### (c) A conclusion refuted while its measurement stayed true — #540, #641, #718, #477's near-miss

This is the shape worth reading carefully, because the issue still *reads* correct.

**#540 is the sharpest example in the corpus.** Its title is *"No admission a player can
make has ever produced a high-risk prisoner, so solitary is unreachable"*. The first clause
is still exactly true — `src/main.ts:918` is still
`const ADMISSION_REQUEST = { priorIncidents: 0 } as const;` — and `src/main.ts:884-890`
confirms the margin only narrowed. The second clause is **false**, and the thing that
falsifies it is on `main`:

```
$ ./node_modules/.bin/vitest run tests/integration/risk-tier-neglect-reachability.test.ts
 ✓ a neglected, unguarded prison reaches High risk from disciplinary findings alone,
   with priorIncidents pinned at 0 throughout            1438ms
 ✓ a well-run, staffed prison produces no incidents and settles every tier at Minimal,
   over the same window                                  1190ms
      Tests  2 passed (2)
```

Tier 3 arrives at tick 47,999 through `ClassificationReviewSystem` folding disciplinary
findings, a mechanism #540 never considered. #540 itself named this as the next thing to
measure — *"whether a classification review actually fires often enough to reach tier 3 in
ordinary play becomes the next thing to measure — nobody has seen it happen"* — and it has
now been measured. An agent handed #540 as written would set out to make solitary reachable
and would be building a second route to somewhere the game already goes.

**#641** says *"ADR 0075 has three Accepted decisions and none of them is built"*. Decision
2 is built (§1, #692), and its arithmetic — 312 walls leaving 40 — is now
`tests/integration/economy-liquidity-hard-lock.test.ts`'s *"spends the grant and the starter
rung on 654 bricks, and the ECON-002 lock stays shut"*. **The class is still live**: the test
name says the lock stays shut. Only the issue's route to it is gone.

**#718** asked *"what cadence should a pulled readout have when the thing it depends on is
not what makes the counts move?"* and measured *"a roster frozen at the moment of the last
admission, for a full 30-second poll"*. ADR 0086 established that the premise was never the
tree's behaviour, and `src/main.ts:1164-1180` now says so in the one place the file states
it: the listener *"computes six translations and returns early only when all six say nothing"*,
`hudClockFromWorkerMessage` has no nothing-changed arm, and the binding cadence is the clock
heartbeat. The gate is on `main` and green:

```
$ ./node_modules/.bin/vitest run tests/foundation/hud-refresh-cadence-contract.test.ts
 ✓ leaves the counts channel silent in a prison with nobody housed, which is the premise
   #718 got right
 ✓ refreshes the pulled readouts on the clock heartbeat regardless, at better than a
   quarter-second
 ✓ would freeze for the whole window if the clock left that predicate, which is the
   mutation this file kills
      Tests  5 passed (5)
```

Note the first case's name. The issue was right about the counts channel and wrong about
what that implied — which is what (D) is for. What remains of #718 is ADR 0086's acceptance,
and that is the owner's.

**#477 was nearly filed as (D) and is (A).** Its measurement is still exactly true — the
integration suite reproduces the staffed row at peak 0.4742 against a 0.65 threshold — and
its *conclusion*, "neglect costs a staffed prison nothing", is refuted by name in the tree:
`src/simulation/incidents/flashpoint.ts:173-180` reads *"Read down the 'staffed' column,
that is the answer to issue #477 … It costs it something now, in two places and neither of
them is the riot model"*. The difference from #540 is that the answer was built rather than
merely measured, and the test file's own describe block states the design: *"the riot model
is untouched, which is the point of putting the cost on the income line"*.

---

## 6. Where the (B)s actually are, and why 41 of them is not bad news

41 STILL OPEN sounds like a backlog. Read by kind it is mostly not a defect list:

| kind | count | issues |
| --- | --- | --- |
| Unbuilt feature epics from the original roadmap | 12 | 9, 20, 29, 30, 31, 33, 34, 35, 37, 38, 40, 41 (the other three, #32/#36/#39, are (C)) |
| #584 design-search children awaiting the owner's call | 11 | 586, 587, 589, 590, 591, 592, 594, 595, 596, 597, 600 |
| Owner-reserved by an exclusion (copy, SQL, the gate's own budget) | 8 | 340, 342, 343, 449, 517, 661, 663, 719 |
| Durable audit or coverage records | 3 | 121, 280, 347 |
| Mechanics decided and not built | 2 | 81, 99 |
| **Genuine, locatable, unreserved defects** | **5** | **557, 573, 576, 582, 667** |

41 exactly. The last row is the only one an agent could pick up tomorrow without a decision, and
`src/persistence/session/session-controller.ts:515-518` (#582's RED-001) is the one with the
worst failure mode in it: deleting the active prison stops the autosave and leaves the
worker running the authoritative simulation, which `AGENTS.md` boundary 4 makes the session
boundary. It reproduces exactly as filed, three days after filing, and nothing in the tree
argues it is deliberate.

**The epics deserve their own sentence, because "still open" is doing less work there than
it looks.** For each of #9, #20, #29–#41 this pass established only whether the named
deliverable exists in `src/` — nine of twelve have nothing at all, three have half (#32's
atlas pipeline and direction contract; #36's four service modules without ADR 0008's
deployment units; #39's gangs without traits). **Their Definition-of-Done checklists were
not walked.** None of them is a candidate for closing on this evidence; the point of
including them is that they are not candidates for *fixing* either, and an agent given one
as a brief is being given a quarter of a game.

---

## 7. Two open issues that disagree, and one document that disagrees with itself

The brief asked for contradictions. There are three, and they are three different kinds.

### #540 and #788 are the same defect, filed twice, ten days apart

Both rest on `src/main.ts:918`. #540 (2026-08-29): *"Every admission the HUD can make sends
`priorIncidents: 0` — it is hard-coded beside the sentence in `src/main.ts`'s
`ADMISSION_REQUEST`"*. #788 (2026-09-01): *"`priorIncidents` is hard-coded to `0` at
`src/main.ts:918`, so only `Minimal` and `Low` arise through ordinary admission"*. #788 is
in flight (#798 landed at `0e2eb7fb`, v0.0.351) and #540 is not. Whatever is decided about
one decides the other, and #540's remaining live content — *"whether an admission should
ever carry priors, and if so how they are chosen, is balance and therefore the owner's"* —
is the better statement of the question. **Recommendation: fold #540 into #788 rather than
closing it as fixed, because the balance question in it is real even though its
"unreachable" conclusion is not.**

### `src/ui/simulation-events.ts` says ADR 0084 decision 4 is untaken; `src/ui/hud/event-band-dwell.ts` implements it

Two source files on the same `main`, about the same decision, in the same feature:

- `src/ui/simulation-events.ts:237-241` — *"the one of that ADR's four decisions the owner
  did **not** take on 2026-09-01, and it is still open. No dwell or priority rule is
  invented here"*.
- `src/ui/simulation-events.ts:634-636` — *"[the band] still replaces whatever it holds
  without arbitration, which is ADR 0084's decision 4 — a dwell floor — and that decision is
  not taken."*
- `src/ui/hud/event-band-dwell.ts:52` — `export const EVENT_BAND_DWELL_FLOOR_MS = 600`, with
  a docblock deriving the 600 from two measured bounds, and `src/ui/hud/hud.ts:1105-1134`
  holding the state.

`docs/adr/README.md:239` records how this happened and is the authority: decision 4 *"is
taken too, by a separate ruling put to the owner after this ADR had already been accepted on
the strength of the other three"*. So the two `simulation-events.ts` comments were true when
written and were overtaken within the day. They are exactly the shape
`docs/AGENT_WORKFLOW.md` §4 warns about — a sentence asserting an absence — and they now
misdirect a reader of the producer towards inventing a rule that exists one module over.
**Handing this over rather than fixing it: this pass's write scope is two files under
`docs/research/`.** It is a comment-only edit at two sites and it belongs to whoever next
touches that file, alongside #765's already-landed sweep of the same kind.

### `docs/DEPLOYMENT.md` contradicts itself about the hosted database — #342, still

This one is not stale; it is #342 verbatim, in one file, at `af999415` (v0.0.350):

- `:203` — *"Migrations → Supabase **staging** | automatically, on every merge to `main`,
  through Supabase's own GitHub integration"*, with the gate column reading **none**.
- `:465` — *"**Everything dated after `20260823100000` is not applied there yet.**"*

Fourteen migrations postdate that boundary (`ls supabase/migrations/ | awk 'substr($0,1,14) > "20260823100000"' | wc -l` → 14, which is the derivation `docs/DEPLOYMENT.md:465` itself asks the reader to run) and all are on `main`; **698 commits have landed on `main` since the last of them** (`git rev-list --count 9b17e1ad..origin/main`). Under the mechanism `:203` states, `:465` cannot be true. `docs/CLOUD_SAVE.md:126-127`
carries the same second half. Which is false depends on whether the Supabase GitHub
integration is actually connected, and **that is state this repository cannot read** —
`docs/DEPLOYMENT.md` already says of the domain binding that it is *"not reproducible from
this repository"*, and `docs/AGENT_WORKFLOW.md` §3 turns that into a rule: when a finding
depends on unreadable state, the finding is a question. So #342 stays open **as a question
for the owner**, not as an edit for an agent.

### And one that is probably being fixed as this is written

#667 asks for a paragraph in `docs/AGENT_WORKFLOW.md` about `ps` checks. At `af999415`
(v0.0.350) it is not there. During this pass the harness reported
`docs/AGENT_WORKFLOW.md` modified in `/workspace/lockstate` — the owner's own checkout,
`git status --short` showing ` M docs/AGENT_WORKFLOW.md` — and this record's first draft
inferred from that that #667 was in flight.

**That inference was wrong and is corrected here rather than deleted, because it is the
same mistake this whole record is about.** The edit landed as `e0ca2bd5` (#803, v0.0.352),
*"Five traps that cost a red CI today, written into the operating method"*, and it is a
different subject: the five things it adds are the Playwright config location, `vitest`
4.1.11's dead `--reporter=line`, the browser runner, uncollected tests and a reporter
distinction — none of them `ps`. Checked rather than assumed:
`git show origin/main:docs/AGENT_WORKFLOW.md | grep -n "false reds\|start and throughout"`
is still empty at `03ad071e` (v0.0.352). **#667 is (B) on `main` today**, and "a file I saw
being edited is being edited for the reason I have in mind" is exactly the shape of
unevidenced cause `docs/AGENT_WORKFLOW.md` §3 forbids.

---

## 8. What this pass did not do, and the one thing it refused to do

**No browser suite was run, deliberately.** Four of the (A) verdicts rest on Playwright
specs — #700 (`ui-escape-sentence-survival.spec.ts`), #739 (`ui-alerts-column.spec.ts`),
#764 (`ui-alert-dismiss.spec.ts`) and #424's contract — and all four are marked TEST-READ
rather than TEST-RUN. The reason is the check `docs/AGENT_WORKFLOW.md` §2 requires before
any claim about a browser run:

```
$ ps -eo etime,args | grep -E "[p]laywright/test/cli|[v]itest" | grep -v "bash -c"
      03:30 … @playwright/test/cli.js test --config tests/browser/playwright.config.ts
      02:58 … vitest.mjs run
      00:16 … vitest.mjs run tests/foundation/
      (+ six vitest fork workers)
```

Another agent's browser suite and two vitest runs were live. §2 says not to run a suite
beside another agent's, and that a failure under contention establishes nothing on either
tree. Rather than take a measurement that could not be believed, this pass read the specs
and says so. In all four cases the *code* citation is independent of the spec, so no verdict
rests on the untaken run — but the strongest available evidence for those four is one tier
weaker than for the eleven backed by a `vitest` run, and that difference should be visible
when spot-checking.

**One gate result worth recording rather than passing over, because it is the same failure
mode this record keeps finding.** `./node_modules/.bin/vitest run tests/foundation/` on this
branch reported `1 failed | 456 passed`, the failure being
`comment-symbol-existence-contract.test.ts` → *"Test timed out in 5000ms"* at a load average
of 16.4. Run alone: `3 passed (3.08s)`. Reproduced three times on this branch, at load
averages of 16.4, 11.9 and once after merging `origin/main` — the same file each time, and
alone each time `3 passed`, most recently in 3.98 s against the 5 s timeout. This branch's whole diff is two markdown files under
`docs/research/`, and that test reads only `.ts` under `src/` and `tests/`, so the blast
radius rules it out before the re-run does — which is `docs/AGENT_WORKFLOW.md` §2's own
arithmetic applied to a foundation suite rather than to a browser one. `tsc -b` and
`tsc -b tsconfig.tools.json` both exit 0, and the four documentation gates
(`documentation-version-claim`, `documentation-links`, `documentation-claims`,
`adr-numbering`) pass together: `41 passed`.

**Also not reached:** #274's remaining ~28 findings; #280's 26 findings, which needed a
Postgres run this pass did not take; the Definition-of-Done checklists of the twelve epics
(§6); and the *content* of every issue comment thread — bodies and code were read, and while
`comments` counts were collected, only the threads on #641, #703-adjacent issues and the
handovers were opened. A comment saying "fixed in #NNN" on an issue I marked (B) would
change that verdict, and this pass cannot rule that out for all 41.

---

## 9. Where the rules put a verdict that the code alone would not

Three of the brief's constraints changed a verdict, and each is worth recording because the
next pass will meet them again.

**Player-facing copy that does not exist is (B), never (A).** `AGENTS.md`'s fourth exclusion
makes authoring it the owner's, so an issue asking for a sentence the game does not have is
open *pending the owner* rather than fixed or fixable. That is #517 (the phone hint), #661
(the Polish catalogue), #663 (the language picker) and #719 (the strip's chip copy). It is
also why #749 is (A) and not (B): the four sentences it asked for exist, and
`src/content/default-locale-en.ts:871-876` shows they were authored rather than invented —
the same pattern `docs/adr/README.md:239` describes for ADR 0084, where *"the mechanism was
built with the keys declared and the catalog deliberately empty so the suite failed by name
until the words existed"*.

**`supabase/migrations/` is exclusion 2, so a SQL defect cannot be an agent's (A).** #340
and #343 are both real, both verified at their cited lines, and both need a new migration,
which is history the moment it applies. They stay open under the owner regardless of how
obvious the fix looks.

**Deleting branches is the owner's**, which is why §3 reports #291 as work already taken
rather than as a task, and why the 435-head figure is offered as information rather than a
proposal.

---

## 10. The four things worth acting on first

1. **Close the 25 (A)s.** Each has a `file:line` in §1, and six of the twenty-five carry a `vitest` run I pasted (#79,
   #477, #692, #717, #741, #767); the rest rest on the code alone, or on a spec read and not
   run (§8). The
   value is not tidiness: five of them (#717, #741, #749, #767, #771) describe economy and
   alerts behaviour that has since been *decided by the owner in the opposite direction*, so
   an agent handed one would revert a ruling.
2. **Do not close the 11 (D)s — rewrite two of them and close the rest.** #540's balance
   question should move into #788 (§7); #641's class survives its arithmetic and belongs
   restated against `economy-liquidity-hard-lock.test.ts`'s current 654-brick figure. The six
   handovers and #288 and #292 and #718 are records whose moment has passed.
3. **#582's RED-001 is the one unreserved defect with a bad failure mode**, at
   `src/persistence/session/session-controller.ts:515-518`, and it is three days old.
4. **Fix the two comments in `src/ui/simulation-events.ts` that deny a shipped decision**
   (§7). It is the cheapest correction in this record and the one most likely to mislead an
   agent, because it lives in the producer a reader would arrive at first.

---

## 11. The weakest claim in this record, and what would change my mind

**The weakest claim is every (B) that rests on an absence.** Twenty-eight of the 41 STILL OPEN
verdicts are of that form — the twelve epics, the eleven design-search children, and #557,
#573, #661, #663 and #667, each of them some version of *"grep finds no implementation"*, and `docs/AGENT_WORKFLOW.md` §4
says precisely this sentence rots first — the #274/X4 spot-check in §4 is a worked example of
an absence claim being wrong because the fix used other words. For the design-search children
(#586–#600) I searched for the issue number and for the mechanism's vocabulary, which is two
independent handles, but a feature implemented under a third name would read as absent to me.
**One `file:line` implementing any of them refutes that row.**

The second weakest is **#503**, **#506** and **#274**'s split between (A) and (C). Each has a
finding whose remaining half is a copy or acceptance decision, and where I drew the line
between "the defect is gone" and "half of it is" is a judgement rather than a measurement. I
put #506 at (A) because its own *"what this issue is asking for"* section names finding 1, and
#503 at (C) because `regime-panel.ts:86`'s docblock explicitly reserves the sentence half. A
reader who reads those two sections the other way should swap the verdicts, and nothing else
in this record moves.

The third is the **untaken browser runs** (§8), already stated.

What would **not** change my mind: a commit message, a pull-request body or an ADR saying an
issue was fixed. Every (A) above was reached by opening the code, because *"passing because
the world moved is not the same as being true"* is a lesson this corpus paid for on the day
this pass ran.
