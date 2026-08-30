# Research records

Dated evidence gathered to answer a specific open decision, kept because the
decision cites it.

These are **not** architecture decisions and they are not documentation of how
the code works. An ADR records what was decided; a file here records what was
known at the time it was decided, including what could not be established. They
are read-only history: when the code moves on, a record here does not become
wrong, it becomes older. Do not update one to match current `main` — write a new
one and let the ADR cite that instead.

## What makes a record trustworthy here

Each report labels every factual claim with how it was obtained, and the tiers
are not decoration:

- **VERIFIED** — a source was opened and read. In this repository's network
  environment that mostly means a shipped game data file or decompilation
  mirrored on `raw.githubusercontent.com`, which is reachable, and quoted
  verbatim.
- **SEARCH-SUMMARY** — a real page exists and a search tool summarised it, but
  the page itself was never opened. Weaker than VERIFIED and deliberately kept
  as its own tier rather than folded into it.
- **FROM MEMORY** — believed, not checked. Useful, and honest about being the
  weakest kind of claim.
- **UNKNOWN** — could not be established.

The tiers exist because of a specific failure. An earlier research round
produced roughly two hundred citations, and spot-checking twelve of the specific
factual claims found: two refuted outright (a keybinding attributed to a base
game that belongs to a mod, and one that does not exist at all), a starting
balance wrong by more than an order of magnitude, a currency range that silently
depended on a DLC nobody mentioned, and **a design opinion attributed by name to
a real developer that could not be sourced anywhere**. The claims that failed
were disproportionately the confidently precise ones.

So the standing rules for anything added here:

- Never invent a patch number, version, date, price or quote.
- Never average two figures you are unsure of into a range described as version
  variance. Say you are unsure of both.
- A forum post, a video tutorial or a search snippet is not a source for what a
  designer intended.
- Currency figures from other games are unusable for balancing this one unless
  genuinely sourced. Derive from this game's own costs instead.
- Name your own weakest claim, and say what would change your mind.

## Records

| Record | Question it answered | Decision it fed |
| --- | --- | --- |
| [2026-08-25 room zoning gesture](./2026-08-25-room-zoning-gesture.md) | What gesture designates a room, and where does the control live? | ADR 0022 |
| [2026-08-25 room occupancy](./2026-08-25-room-occupancy.md) | Where does a room's occupancy capacity come from? | ADR 0023 |
| [2026-08-25 economy rate](./2026-08-25-economy-rate.md) | What does the state pay per prisoner-day, on what cadence, from what balance? | [#29](https://github.com/matmaxalez/lockstate/issues/29), within ADR 0017 |
| [2026-08-26 failure modes](./2026-08-26-failure-modes.md) | What should failing look like, and what is the cheapest honest route to it from what already exists? | None yet — it states two shapes and declines to pick. **§3's mutual-exclusion finding is corrected in place** (#396): an *unhoused* arrival's `safety` does decay to zero, so overcrowding is the reachable pressure and a riot fires at tick 15,600 |
| [2026-08-26 repository audit](./2026-08-26-repository-audit.md) | Across every discipline at once, what is wrong with this repository at v0.0.108, and what should be done first? | None yet — it ranks work and names the decisions that need an ADR |
| [2026-08-28 risk tier and income](./2026-08-28-risk-tier-and-income.md) | Does a prisoner's `riskTier` change what the state pays, or what the prison spends? | None — it refutes an audit finding and proposes no change. ADR 0017 decision 6 stands |
| [2026-08-28 navigation tick budget](./2026-08-28-navigation-tick-budget.md) | What does a navigation tick cost, and may its budget be a wall clock? | **ADR 0066.** This cell read *"None yet — it carries an ADR draft awaiting a centrally assigned number"* and had been false since that number was assigned: the draft landed as `docs/adr/0066-what-a-navigation-tick-may-cost.md`, which the record's own §6 already links. Corrected here rather than left, and marked rather than overwritten, because a row that keeps saying "awaiting a number" after the number arrives is how this directory stops being readable. ADR 0009 stands unamended |
| [2026-08-29 sentence length at admission](./2026-08-29-sentence-length-at-admission.md) | Where does a sentence length come from — which thread, which RNG stream — and how long should it be? | [#535](https://github.com/matmaxalez/lockstate/issues/535) decision 5, and **ADR 0069**, whose draft this record carried and which has since landed with that number assigned centrally. The range itself is a proposal for the owner, not a settled call; §5's `priorIncidents` finding fed [#540](https://github.com/matmaxalez/lockstate/issues/540) |
| [2026-08-29 playtest: ordering and the second room](./2026-08-29-playtest-ordering-and-the-second-room.md) | Is *ordering* — walls before zoning — the wall a new player hits, and what is on the route past it? | None yet. It proposes no change. Its §7 is a finding with a measured mechanism and is handed to whoever owns `src/ui/**` and `src/rendering/**`; §2 is a product question for the owner; §3, §5 and the trackpad question are empty categories with the numbers behind them |
| [2026-08-29 coverage provisions the safety need](./2026-08-29-coverage-provisions-the-safety-need.md) | Should guard coverage provision `safety`, at what rates, and does coverage actually suppress incidents? | [#588](https://github.com/matmaxalez/lockstate/issues/588), under the owner's ruling on [#599](https://github.com/matmaxalez/lockstate/issues/599). **ADR 0078.** This cell read *"None yet as an ADR — it carries a draft decision awaiting a centrally assigned number"* until the number was assigned; the draft landed as `docs/adr/0078-what-keeps-a-prisoner-safe.md` in the same commit as its index row, and the cell is corrected here rather than left, for the reason the navigation-tick row above gives — a row that keeps saying "awaiting a number" after the number arrives is how this directory stops being readable |
| [2026-08-28 drawing guards](./2026-08-28-drawing-guards.md) | Should a guard be drawn while `GuardRecord` still teleports, the question ADR 0059 open question 4 left open? | Answers that open question in place, within ADR 0040 slice 2 (issue #414's surviving half); no new ADR number taken |
| [2026-08-29 what a day actually pays](./2026-08-29-what-a-day-actually-pays.md) | What was the brief's *"a neglected twelve-prisoner prison earns about 150/day"* actually measuring? | **[#601](https://github.com/matmaxalez/lockstate/issues/601)**, which deliberately declined to choose between three readings. Measured by playing: roster 12, residents 3, credited **900** at each of two day boundaries. Reading 1 is true about the prison and reading 3 about the number; #601's own arithmetic — 150 between `2 x 60` and `3 x 60` — assumed a floor that never applies, because a housed prisoner's needs stay met. With three guards the loop nets **+660/day**, not the −90 the brief's *"closes tightly"* implies. The reproduction stays unmerged on `agent/playtest-mouse-2`; it is a harness, not a gate |
| [2026-08-29 mouse playtest](./2026-08-29-mouse-playtest.md) | Playing with the mouse only, where does a new player stop being told what the game wants? | **None — [#569](https://github.com/matmaxalez/lockstate/issues/569) should be closed as not-a-defect.** The record originally concluded that a refused designation's explanation never reaches the player; §1 carries the correction, by the author, hours later: it reaches `.hud__refusal`, measured at 1440x32 and 900x32 with `role="status"`, which is #220's fix for the very 0x0 alerts row this re-derived. The measurements stand, the inference did not. The reproduction stays unmerged on `agent/playtest-mouse-route`; it is a harness, not a gate |
| [2026-08-30 the naive route](./2026-08-30-the-naive-route.md) | Is *ordering* — walls and bricks before zoning — why the owner could not build a prison? | **None. It eliminates the candidate rather than proposing a change.** [#569](https://github.com/matmaxalez/lockstate/issues/569)'s retraction left ordering as the last evidence-backed candidate; played naively on `9c453be`, the route **works**: a zone-first `ZoneRoom` is refused for 0 money, twenty-four wall orders are *accepted* against an empty stock, buying sixty bricks at tick 5,300 drains the queue by tick 7,321, and one Designate press then takes `ROOMS` 0 → 1. What the pass found instead is §3 — the game never states that a Brick wall needs two bricks (`src/simulation/construction/definition.ts:89`), so the obvious guess of one brick per wall builds **exactly half** a perimeter and stalls at `12 waiting · 0 being built` for two in-game days with `/material/i` false across the whole visible HUD and 24,040 still in the treasury. That is a product question and the copy is the owner's under `AGENTS.md`, so it is reported and stopped. §6 corrects this pass's own instrumentation in place |
| [2026-08-29 a prison that cannot buy its first bed](./2026-08-29-a-prison-that-cannot-buy-its-first-bed.md) | Can a legal purchase end a session, and can one plank pay for more than one resident? | **ADR 0075 and ADR 0076**, whose drafts this record carried (§5 and §6) and which landed with both numbers assigned centrally in one pass after a sweep across every remote head. **The owner ruled on 2026-08-29 and the ADRs are not the drafts**: on 0075 they took three decisions together — **development grants at population thresholds**, a shape the record's option list did not contain; the ADR 0017 degradation ladder with an explicit refusal of bankruptcy (*"Bez bankructwa, tylko minus i pożyczki"*, which is a decision not to overturn ADR 0017 decision 8, with loans as the exit); and sell-back at a loss — leaving out the starting plank grant the record recommends first, because of §2's payroll measurement. On 0076 they took full materials by both routes, which the record recommends no option on, and **relocate**, where the record recommends revalidating the payment; the ADR writes those two as one decision in two parts rather than as a reversal, because the record's argument is the reason the invariant cannot be dropped. §5 and §6 are kept unchanged as what was known and recommended *before* the ruling, marked rather than overwritten. This cell read *"None yet — it carries two ADR drafts awaiting centrally assigned numbers"* and is corrected here rather than left, for the reason the navigation-tick-budget row records: a cell that keeps saying "awaiting a number" after the number arrives is how this table stops being readable. §8 hands the two `docs/adr/STATUS-QUEUE.md` §2 entries over as text rather than filing them, because an unmerged branch is moving the same four counts. Both audit findings reproduce on `main` at `ec10451` (v0.0.206): 625 bricks at 40 spends the whole 25,000 and no command sequence earns a minor unit afterwards; and place-admit-undo turns one 65 plank into three residents earning 4,380 against a control's 1,460. Amends nothing yet; the second draft would narrow **ADR 0028** decision 2 |
| [2026-08-30 authored content with no producer](./2026-08-30-authored-content-with-no-producer.md) | [#642](https://github.com/matmaxalez/lockstate/issues/642): is `gang-retaliation` a missing producer or a leftover of a design change that removed gangs — and what else of that class is in the tree? | **None. It settles the question and proposes nothing**, because both routes out of #642 are the owner's under `AGENTS.md`. **Settled: a producer is missing; gangs were never removed.** Both halves — the `IncidentType` member and `GangRegistry` — arrived in one commit, `31c51ef` (2026-08-23, #28), whose own message says the registry was wired *"with no fabricated content (asserted directly)"*; the assertion still runs at `tests/unit/new-session-runtime.test.ts:123`. #28's dependency list deferred the population to [#39](https://github.com/matmaxalez/lockstate/issues/39), which is open and unstarted, and ADR 0061 decision 5 names the same gap. **The sweep found six further items and one correction.** New: `TunnelRegistry`, `resolveEscapeOpportunity`, `summarizeIncidents`, **both `UtilityNetwork`s** (`addNode`, `connect`, `setFailed` and `evaluate` have no caller in `src/` in any commit on any branch, yet both are snapshotted and restored) and **the whole parcel land-purchase economy** (`setParcelOwned`, `canPurchaseParcel`, `getParcelPrice` uncalled; `registerParcel` reached only from `fromSnapshot`), plus the ungated `'medical-supply'` capability. Correction: `hud.build.note` is the **opposite** shape to `gang-retaliation` — its renderer was deleted (`67e366e`), so #642's *"same class"* is right and its implied same-shape is not. #642's own two citations are corrected in §1: `trigger-system.ts:211-214` is the docblock admitting the gap, not the gate (which is `:510`), and the key is at `messages.ts:157`. Enum pass returned empty across all 42 `SIMULATION_ENUM_GROUPS`, backed by the numbers. Does not overlap `agent/632-unreachable-thresholds` — that record is about values no input can reach, this one about content nothing creates |
| [2026-08-30 what the game never says](./2026-08-30-what-the-game-never-says.md) | [#629](https://github.com/matmaxalez/lockstate/issues/629): what does Lockstate require the player to know, that it never tells them? Swept **by playing**, not by reading. | **None. It reports and stops**, because every route out needs player-facing copy, which `AGENTS.md` reserves to the owner. Two findings, ranked by how early a player meets them. **§1, second zero:** a new session's clock is constructed paused (`src/simulation/worker/state-machine.ts:216`) and no word on screen says so — the whole sighted clock readout is `Day 1 / 0% / ×1`, and `×1` is what a *running* clock prints too; ADR 0051 makes every command answer during the pause, so 2,400 leaves the treasury for sixty bricks the delivery block calls *"ON THE WAY"* and twenty-four wall orders sit at `24 waiting · 0 being built` indefinitely. The one shipped sentence that ties building to the clock, `hud.build.note`, has had **no renderer since 2026-08-23** (`67e366e` deleted the Build panel footer it lived in). **§2, minute one:** `PayrollSystem` re-charges a guard's 80 at every in-game day boundary while `hud.security.hire-hint` says *"Taken from the treasury **on hire**"*; measured 25,000 → 24,920 → 24,840 → 24,760, with `/wage/i`, `/per day/i` and `/daily/i` all false across the whole HUD, and the only sentence implying a continuing wage inside the `ON THE PAYROLL` fold, which starts shut and carries no trailing count. **Three candidates are FINE with evidence** and should not be re-checked: #538's *"nothing says so"* is refuted at `e5f597f` (the Intake panel reads `3 waiting with no bed to sleep in`, unfolded, on every press), an unpayable payday reaches a full-width 1440x32 `role="status"` band, and the Rooms panel states every room requirement before Designate. §7 and §8 each correct this pass's own reading in place — §8 because Run 1 supported an interface criticism that Run 2, differing only in when it sampled, refuted |
| [2026-08-30 what a classification can reach](./2026-08-30-what-a-classification-can-reach.md) | [#632](https://github.com/matmaxalez/lockstate/issues/632): does [#540](https://github.com/matmaxalez/lockstate/issues/540) collapse into it, and what is dead if neither threshold moves? | **None. It measures and stops** — ADR 0017 decision 5 puts every value it names with [#29](https://github.com/matmaxalez/lockstate/issues/29), and no source file was touched. **They do not collapse: three independent gates, and no one fix reaches two of them.** #632's arithmetic is confirmed at every cited line. #540's front door is confirmed (`src/main.ts:867` sends `priorIncidents: 0`, so intake tiers are `[0, 1]` and tier 3 needs 2) — and lifting #632's 200,000 threshold would still only reach tier 2, so it cannot be #540's cause. **#540's headline is refuted**: `room.solitary-cell` is reached two ways from a HUD admission, by sanction (10 relocations measured) and by the accommodation branch after a review promotes a prisoner *still queued for a bed* (9 placements in a bed-short prison, 0 in an adequately-bedded one) — the second route was known to neither issue. #540 comment 3's *"no sentence in the shipped range reaches a first review"* is the `r = 0` row generalised to all 24,000 phases; the correction was already in the tree at `src/simulation/contraband/introduction.ts:126-136` since `cfda696`. **Measured: 14.0% of prisoners are reviewed** (11.8% observed over 119 admissions and 120 in-game days, 0 per-prisoner mismatches against the model), 0% below 10 days, and every reviewed prisoner in a neglected prison reached high risk while none did in a well-run one. Two further unreachable balance values are found and unreported anywhere: **no prisoner can ever receive a second review**, and **`MAX_CLEAN_CONDUCT_CREDIT = 2` can only ever hold 0 or 1**. Its §9.1 records this directory hitting a contract of its own: a harness committed as a `.ts` beside the record was refused by `tests/foundation/typecheck-coverage-contract.test.ts`, and the two contracts — *"every module file `git` knows about has to fall inside one project's `include`"* against this file's *"a record here does not become wrong, it becomes older"* — are incompatible for a `.ts` in `docs/research/`. The harness is a fenced code block in §12 instead |
| [2026-08-30 a wall that buys itself](./2026-08-30-a-wall-that-buys-itself.md) | On `agent/627-just-in-time-materials` (PR #640): does a wall actually get built with no procurement press, what stops the player next, and how close does an ordinary session get to ADR 0075's lock? Played four times, never once opening the Buy fold. | **None on `src/`. It confirms the fix works, corrects issue [#641](https://github.com/matmaxalez/lockstate/issues/641)'s framing, and reports three gaps whose remedy is copy or plumbing the owner owns.** **§1, the answer to #627:** one drag lays six wall segments, 25,000 → 24,520 at the press (exactly 6 × 80), and all six stand by tick 879 with nothing else pressed; the whole route — 24-segment perimeter, `Designate`, bed, toilet, two admissions, one guard — completes with no `Buy` and costs **2,105 of 25,000**, identical in all four runs. **§2:** nothing stopped the player, and that is the finding; four slower-or-quieter things are ranked instead, of which the sharpest is §2b — the purchase the game makes on the player's behalf is announced **only inside the procurement fold**, the exact fold #627 exists so the player never has to find (`deliveriesBlock` is the last child of `buyRow`, `src/ui/hud/build-panel.ts:1293-1311`, and `buyRow.hidden = true`). **§2b is written in both directions on purpose:** it first read *"the block never shows a just-in-time delivery"* on four runs of evidence, and a clock-stopped experiment refuted that — with the fold open the row is there, with its own `Cancel`, and the run spent 80 rather than 480 because it netted off ten bricks the player had bought, which is ADR 0017 decision 7 measured. **§3:** `purchase.insufficient-funds` is reachable, at 1440x32, and reads *"The materials were not ordered — there are not enough funds."*; it names no wall, no tile and no number, and it stands unchanged for four minutes while eighty-one walls go up behind it, because `src/simulation/construction/system.ts:699` discards the scheduled-tick report. The shortfall figure the projection computes reaches no pixel: `HudBuildQueueViewModel` has no field for it. **§4:** #641's arithmetic is confirmed to the segment — 313 ordered, 312 funded, **40 left** — but its *"a single sustained drag reaches it"* is refuted: one drag is at most 20 segments, one screenful is 116, and 313 took 24 drags over six and a half minutes. **§7 corrects the shared harness in place:** `waitForQueueEmpty`'s unanchored regex matched `10 waiting · 0 being built`, and every playtest here inherited it |
| [2026-08-30 two subsystems with no entrance](./2026-08-30-two-subsystems-with-no-entrance.md) | [#648](https://github.com/matmaxalez/lockstate/issues/648) and [#649](https://github.com/matmaxalez/lockstate/issues/649), settled the way [#642](https://github.com/matmaxalez/lockstate/issues/642) was: for the two `UtilityNetwork`s and for the parcel land-purchase economy, is a producer missing or was the feature abandoned? | **None. It settles both and proposes nothing**, because building either producer, deleting either subsystem and setting any price are all the owner's under `AGENTS.md`. **Neither was abandoned — on 630 refs no producer, consumer or command for either has ever existed, and neither file has ever been deleted.** **#648: the missing half is a producer**, and the record adds a second absence the issue does not claim — **the consumer is missing too**, `evaluate()` has no caller, so a producer alone would light up nothing (the opposite of #642, whose consumer runs every tick). `2da9cb3` (#25) settles it in its own message: *"empty electricity/water UtilityNetworks, with no fabricated default content"* and *"this code is not wired into main.ts"*; `new-session.ts:688-691` still says *"Empty until a session/scenario places real generators/consumers"*; `ROADMAP.md` Phase 7 still lists *utilities*. **No test asserts the emptiness** — unlike #642's — and the one test that touches them fills them, because #375 measured deleting both `loadSnapshot` calls as a 217-file/2,463-test survivor. `ObjectDefinition` authors no capacity or demand figure and no catalogue object is a producer. **#649: the missing half is a command**, `PurchaseParcel`, plus a one-line producer. **#642's method does not reach it and the record says so**: `a71c955` is the owner's own bare one-line commit from before the issue workflow. The intent is in `ROADMAP.md` Phase 2 instead — *purchased parcel model*, *world expansion pricing hooks* — written **4h45m before the code**, which delivers those two lines and no others (`git merge-base --is-ancestor f326407 a71c955`). ADRs **0019**, **0045** and **0047** each re-state the gap, two naming `PurchaseParcel`; ADR 0019 plans for *"the first content module that defines parcels"*. Unlike #648 the **consumer half is live**: `isTileOwned` gates build, zoning and object placement, the renderer outlines owned land, and three shipped strings tell the player *"you do not own that land"* — with one 32×32 chunk and `setOwned` called once, ever. **For [#641](https://github.com/matmaxalez/lockstate/issues/641)**: `Treasury.spend` has exactly three callers, so land would be the game's fourth money sink and the only one that converts money into playable area; `basePrice` and both pricing hooks already exist with no value ever chosen. Deleting differs in cost — the utility fields are **required** in every save, the parcel fields are `.optional()` |

### Findings from the first four records that changed a decision

Recorded here because each contradicted something the project believed, and a
reader who only sees the resulting ADR will not know the belief was ever held.

**The first seven bullets were true on 2026-08-25 and the last three on
2026-08-26, and all of them are written in the present tense, which is a trap
this index laid for itself.** Each bullet belongs to the record it came from and
the table above says which; this sentence has to be re-read whenever a record is
added, which is the habit `docs/adr/STATUS-QUEUE.md` asks of its anchor line, for
the same reason and with the same failure available if nobody does. The rule
above — *"a record here does not
become wrong, it becomes older"* — protects the dated files, and it cannot
protect a summary that says "currently" and "today" in the index. So the bullets
keep what was found, because that is the point of the section, and each one that
the code has since overtaken says so inline. Adding a finding here means writing
it the same way.

Re-read on **2026-08-26** when the repository-audit record was added. That record fed no
decision and contributed no bullet, so the ten below still belong to the four records this
heading now names explicitly — the count moved out of the heading rather than being left to
drift, which is the failure the paragraph above describes.

Re-read again on **2026-08-28** when the risk-tier-and-income record was added. It fed no
decision and contributes no bullet either, so the ten below still belong to the same four
records. One bullet was checked against it specifically and survives: *"'Running out of
money' is not a failure mode either"* was written on 2026-08-26 and is still true on
`317f487` — the two `Treasury.spend` callers are both one-off and player-initiated, and
nothing debits on a schedule. That is expected to be overtaken by the recurring payroll
debit in progress on `agent/0042-step3-recurring-debit`; whoever lands it should mark this
bullet overtaken rather than deleting it, the way the two above it are marked.

Re-read again on **2026-08-30** when the record above, *what a classification can
reach*, was added. It fed no decision and contributes no bullet, so the ten below
still belong to the same four records. One bullet was checked against it and is
**overtaken in its first half and re-found in its second**: *"No incident can
fire in any session a player can start"* was written on 2026-08-26 and is false
on `a1d5591` -- the new record measured 58 riots and 17 assaults in one
120-in-game-day prison built only from player commands, and
`tests/integration/incident-trigger-reachability.test.ts` is the shipped gate
for that. What survives is that record's *shape* of argument -- a chain of gates
each of which alone closes the loop -- which the new record found again in a
different system; one of the gates it names,
`ESCAPE_ATTEMPT_MINIMUM_RISK_TIER = 3` against an intake tier of 0 or 1, is why
`escape-attempt` measured **zero** across four of those runs while the same
prison at `priorIncidents: 2` produced thirteen.

- **Authoring one occupancy number per room type is a no-op.** `findAvailable`
  gates on capacity *and* on a `'sleep-surface'` capability, so a capacity
  number alone unblocks nothing. The minimum content change is two fields, not
  one.
- **Four of six comparable games have no room-capacity concept at all.**
  Prison Architect is the exception, and it uses a *different rule per
  designation* rather than one model.
- **"Prisoners would starve in an abstract box" is false.** Accommodation
  actions never check capability, so five of six needs become serviceable
  without any object; only hygiene requires one.
- **No game in the sample designates a nameless area and labels it later** —
  the shape the zoning question implicitly floated is genre-unattested. The
  real split is purpose-first painting versus fully derived rooms.
- **A mis-drag is currently permanent.** No command removes a zone, `Undo`
  reaches only the construction system, and re-zoning is blocked by
  `overlaps-existing-room` — so one stray drag creates unremovable room for the
  session, with no recovery at all on touch, where there is no undo key.
  **Overtaken:** this is the finding the Rooms tab was built to answer.
  `UnzoneRoom` is a command with a producer (#312, and #317 for the touch half),
  so a stray drag is recoverable with the same gesture that made it. The
  `overlaps-existing-room` refusal and the reach of `Undo` are both unchanged;
  what changed is that removal no longer has to go through either.
- **"Pack the prison" is not the reachable failure mode.** Occupancy is
  hard-gated, so overcrowding is unrepresentable; the strategy the economy has
  to price against is sprawl.
- **Construction is effectively instantaneous** — a wall completes in about
  2.5 seconds, with no labour cap and every order in parallel. Money, not
  time, is the only constraint on building today.
  **Overtaken in its second half (#348).** A single wall still finishes on the
  same tick it always did, so "a wall completes in about 2.5 seconds" survives
  unchanged. Orders are no longer parallel: one order holds the crew at a time
  and a waiting order takes it in the canonical ascending-id sequence, so a
  twelve-wall perimeter finishes at tick 730 rather than at 70. Money is
  therefore no longer the only constraint on building, which is the half of
  this finding an economy memo would have leaned on.

**Added 2026-08-26**, from the failure-mode record. The first two extend the
"pack the prison" bullet above rather than replacing it: that bullet is right,
and it stopped one step short of its own consequence.

- **"Running out of money" is not a failure mode either — it is not even
  representable.** `Treasury.spend` refuses rather than overdrawing, the balance
  is validated non-negative in four places, and nothing debits it on a schedule,
  so a running prison's balance is monotonically non-decreasing. The premise that
  money was the *one* failure mode understated the gap: there were none. Measured
  over ten in-game days with one housed prisoner, the balance closes at 27,935
  from an opening 25,000.
- **No incident can fire in any session a player can start, and the missing
  producer is not the reason.** `IncidentTriggerSystem` iterates a watched-sector
  array that only the restore path ever writes, and none of the eleven protocol
  commands creates a sector — but wiring one by hand does not help. Contraband
  pressure has no producer, so the risk score cannot exceed
  `0.5 x needsPressure + 0.3`; `needsPressure` reads the `safety` need alone; and
  `safety` is raised twenty times faster than it decays by the sleep action,
  which requires the very bed `AdmitPrisoner` refuses an arrival without.
  **The hard gate on occupancy and the riot trigger are wired in mutual
  exclusion.** Measured fully wired, with zero guards against a four-guard
  schedule: 0.32 against a 0.6 threshold, and no incident in 25 in-game days.
- **"Until a session/scenario registers them" defers to a caller that has never
  been written.** There is no scenario type, class or module under `src/` at all.
  The same deferral leaves the escape-opportunity resolver, the incident
  summariser, the incident alert projection and the whole tunnel registry with no
  caller in `src/` — the same class as issue #287's two uncalled capabilities,
  three layers deeper.
