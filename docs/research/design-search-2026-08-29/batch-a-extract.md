# Batch A — mechanism extract

Sources read in full (five files):

- **D1** = `lockstate_economy_progression_mechanism_design.md` — 30 numbered mechanisms, XS/S/M/L build sizing
- **D2** = `lockstate_economy_progression_mechanisms.md` — 20 numbered mechanisms
- **D3** = `lockstate-economy-progression-mechanisms.md` — 20 numbered mechanisms
- **D4** = `lockstate_mechanism_design.md` — 6 mechanisms, short
- **D5** = `Lockstate_economy_progression_proposals.md` — 20 mechanisms, one paragraph each, written in Polish

Entries are deduplicated across the batch. Where several documents propose the same mechanism, all sources are listed and numeric disagreements are called out. Build size uses small/medium/large; where D1 gave its own XS/S/M/L that is quoted.

---

## Part 1 — the mechanisms

## A1. Redefine "occupied place" as currently-valid place
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "2. Explicit overcrowding pressure based on current valid places"; supported by `Lockstate_economy_progression_proposals.md` — "2. Kara za przeludnienie"
- **Mechanic:** Certified residency capacity is recomputed whenever a cell, solitary cell, bed, enclosure or assignment changes, rather than being read off a historical resident assignment. Any prisoner above current valid capacity becomes `overflow` and is **not funded as an occupied place**. Overflow produces visible pressure bands — `strained`, `severe`, `critical` — which raise safety-need decay and incident pressure. D1 argues no separate cash fine is needed because lower need satisfaction already feeds the existing withholding formula. D5 states the same idea in one line: when headcount exceeds bed or key-room capacity, income loss and incident chance both rise.
- **Reuses:** cells, solitary cells, beds, room validity, resident assignment, the six needs, incident generation, the per-prisoner-day income line, the status strip.
- **Player now optimises:** spare capacity and admission timing — whether one more prisoner is worth the safety and incident load, instead of packing until the treasury objects. Also closes the measured one-plank/three-residents exploit at its source, because removing a bed drops capacity and therefore payment immediately.
- **Accepted cost:** D1 — early mistakes get harsher and a room going invalid causes a sudden state change; the transition must be surfaced at once and the first growth grant must arrive early enough to fund recovery. D5 — slower growth.
- **Build size:** small — D1 rates it **XS–S**: capacity semantics, one derived overflow state, modifiers inside existing need/incident maths, one HUD band.
- **Status:** NEW (refines decision 1's definition of "occupied place" rather than replacing the income line; D1 says explicitly "keep the decision, change the definition")

## A2. Pay the full rate only up to safe/licensed capacity
- **Source:** `lockstate_economy_progression_mechanisms.md` — "1. Occupancy reserve and safe-capacity bonus"; `lockstate-economy-progression-mechanisms.md` — "1. Capacity licence bands"
- **Mechanic:** Every prison has two capacities: physical capacity from beds, and **safe capacity** from beds plus usable sanitation, dining, shower, recreation capacity and security coverage. The 300 per occupied place is paid in full only up to safe capacity; places above it still pay a reduced floor amount but each excess place adds incident pressure and response burden (D2). D3's variant makes it a *licensed* band: income normal up to licence, escalating deductions or a daily "compliance debt" above it, and the licence only rises after the player has the beds, food capacity, sanitation and coverage to support the next band.
- **Reuses:** room-derived capacity, occupied-place state income, six needs, security-sector coverage, incident system, status strip, alerts, the planned degradation ladder (D3).
- **Player now optimises:** the ratio of beds to supporting capacity. A cell block without enough toilets or yard becomes a bad expansion even though it raises headline population. D3: "usable licensed capacity, not raw beds".
- **Accepted cost:** D2 — revenue becomes less predictable and the per-place rule is modified; the player may deliberately run over safe capacity for short-term cash, which is a debt-like risk. D3 — a second population axis that risks feeling bureaucratic; keep the first band generous and expose the exact next requirement.
- **Build size:** small-to-medium — D3 says "low-medium": a capacity calculation, a daily modifier, a HUD meter and refusal text; no new room or actor.
- **Status:** NEW (this one does modify decision 1's payment rule, unlike A1; both documents argue the decision's own accepted consequence demands it)

## A3. Charge for room congestion during regime blocks
- **Source:** `lockstate-economy-progression-mechanisms.md` — "16. Regime congestion pricing"; `lockstate_mechanism_design.md` — "4. Density-Driven Decay (Punishing Overcrowding)"; `Lockstate_economy_progression_proposals.md` — "14. Wolny czas jako zasób"
- **Mechanic:** Rooms record attempted versus successful action occupancy each regime block. If canteen, shower-room, yard or classroom is over capacity, the affected needs decay faster or income withholding increases; the player may add rooms, enlarge ground area, or stagger the regime (D3). D4's narrower version applies only to area-bounded rooms during `free-association`: if headcount in `yard`/`common-room` exceeds the floor-area capacity, apply a **2x or 3x multiplier to the safety need delta** for everyone inside.
- **Reuses:** room-derived capacity, the area-capacity rule for yards (decision 5), regime blocks, six needs, income withholding, routing, incident system.
- **Player now optimises:** scheduling and room capacity rather than furniture count — and, in D4's version, is forced to spend real estate on large non-revenue spaces to hold a large population without the two-day riot cycle.
- **Accepted cost:** D3 — can punish the player for pathfinding or timing artefacts; count only demand that actually reached the room and show failed-service counts in Overview. D4 — the player will feel forced to build "empty" space, slowing cell expansion.
- **Build size:** small — D3 says "low-medium": per-room demand counters plus need/income modifiers.
- **Status:** NEW

## A4. Derive kitchen/laundry service capacity from object counts
- **Source:** `lockstate_economy_progression_mechanisms.md` — "14. Kitchen and laundry service capacity"
- **Mechanic:** Turn stove and washing-machine counts into an explicit daily service capacity. If meal or clean-clothing demand exceeds capacity, hunger- and hygiene-related unmet needs rise and the existing income withholding follows. Underused capacity means the player overbuilt.
- **Reuses:** stove-derived kitchen capacity, washing-machine, meal/hygiene needs, the 40-per-unmet-need withholding, room objects.
- **Player now optimises:** service objects per prisoner instead of treating rooms as binary unlocks — beds can be expanded first, but the prison pays for it if service lags.
- **Accepted cost:** stated — may make the three already-unfinishable needs harder still unless decay/provision values are recalibrated; the purpose is not perfection but turning support rooms into a measurable bottleneck.
- **Build size:** small — capacity counters and need-service checks, no new actor.
- **Status:** NEW

## A5. Audit beds at the sleep-block boundary
- **Source:** `lockstate_mechanism_design.md` — "6. The 'Sleep Audit' (Exploit Fix & Consequence)"
- **Mechanic:** At the transition into the `sleep` block, assert `cell.resident_count <= cell.bed_count`. If a prisoner arrives at their assigned cell and finds no bed (because the player refunded the plank), their `safety` and `sleep` needs instantly bottom out and an escape-attempt or assault incident fires immediately for the un-bedded residents.
- **Reuses:** `sleep` regime block, room capacity, `bed` object, incident triggers.
- **Player now optimises:** committing to construction — it kills the one-plank/three-prisoners exploit without continuous-validation logic.
- **Accepted cost:** stated — punishes a player who genuinely makes a mistake and moves a bed at the wrong time of day.
- **Build size:** small — one assertion at one block transition plus an incident call.
- **Status:** NEW (a cheaper alternative to A1 for the same exploit; A1 fixes it in the payment line, A5 fixes it with a punishment event)

## A6. Pay a different daily rate per risk tier
- **Source:** `Lockstate_economy_progression_proposals.md` — "1. Kontrakty ryzyka"; `lockstate_mechanism_design.md` — "3. Risk-Tiered Income & The Medical Pause"; `lockstate-economy-progression-mechanisms.md` — "4. Risk-weighted population value"
- **Mechanic:** The state pays more for higher risk tiers. **D5 gives 300 low / 380 medium / 500 high per day; D4 gives 200 low / 300 medium / 500 high** — note D4 *lowers* the low-risk rate below today's 300 while D5 keeps 300 as the floor. D5 adds that income is partly forfeited after incidents. D3's variant is more conditional: the higher rate is a "handling allowance" paid **only if the prison meets that tier's security requirement**; otherwise the high-risk prisoner instead raises an incident multiplier and withholding exposure.
- **Reuses:** classification risk tiers at admission, the per-prisoner-day income line, incident system, security coverage (D3).
- **Player now optimises:** population composition, not just population size — a low-risk high-volume facility versus a high-risk tightly-secured one.
- **Accepted cost:** D5 — "balance becomes harder". D3 — it can reduce high-risk prisoners to an economic commodity; the coefficient should mainly cover risk rather than make high risk strictly better. D4 — high income variance; a riot becomes a severe financial shock.
- **Build size:** small — a tier-to-rate table plus, in D3's version, a security-requirement check and a HUD forecast.
- **Status:** NEW

## A7. Derive required guard posts from risk mix
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "4. Risk-weighted security demand, not a fixed two-post answer"
- **Mechanic:** Each security sector's required post count is computed from its prisoner population and risk-tier mix via a deterministic risk-point total feeding small demand bands. Incident pressure then responds continuously to the ratio of effective coverage to required coverage — `2 of 2 / Covered` must produce a materially different incident rate from `1 of 2 / Understaffed`, "otherwise the displayed choice is false". Patrols are not required.
- **Reuses:** risk tiers, prisoner-to-sector membership, sector post assignment, the existing `0 of 2` / `1 of 2` / `2 of 2` HUD, incident generation.
- **Player now optimises:** where high-risk prisoners are housed and where scarce guards go; risk tier becomes an operational property rather than admission metadata, and a lower-risk intake can be preferable even at lower headline revenue.
- **Accepted cost:** stated — required staffing can jump when a single prisoner is admitted or reclassified; use bands with hysteresis and show the next demand threshold.
- **Build size:** small — D1 rates it **S**: derived demand formula, incident-weight adjustment, HUD wording, tests around risk-mix transitions.
- **Status:** NEW

## A8. Offer deterministic intake contracts instead of undifferentiated admissions
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "5. Deterministic intake contracts"; `lockstate_economy_progression_mechanisms.md` — "3. Risk-tier contracts"
- **Mechanic:** Periodic offers each carrying a prisoner count, risk distribution, sentence band, arrival delay and compensation terms. A low-risk short-sentence batch pays little but turns over fast; a high-risk long-sentence batch carries a conditional risk premium; a mixed batch is the safe default. Offers are drawn from named RNG streams, stored in the save, and expire at a stated deterministic time; the player accepts one or declines the window (D1). D2's lighter version is a per-admission choice between a low-risk prisoner at a smaller daily payment and low incident weight, or a higher tier at a larger payment with a larger incident/contraband multiplier.
- **Reuses:** admission, risk-tier and sentence draws, named RNG streams, prisoner count, current capacity, Treasury, commands, alerts, the Overview tab.
- **Player now optimises:** the prisoner portfolio — capacity, regime, coverage, sentence turnover and service capability all now bear on which intake is desirable.
- **Accepted cost:** D1 — offer selection can become a solved expected-value table, or encourage waiting for an ideal batch; use few offers, meaningful arrival timing, limited decline frequency, no rerolls. D2 — tiers must not become universally dominant and the incident multiplier must be visible.
- **Build size:** medium — D1 rates it **M**: offer generation and state, accept/decline commands, admission scheduling, save migration, intake UI.
- **Status:** NEW

## A9. Make classification review economically consequential, on an evidence clock
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "7. Classification review driven by accumulated evidence"; `lockstate_economy_progression_mechanisms.md` — "4. Classification review as a capacity upgrade"
- **Mechanic:** D1 replaces the global-date eligibility trap with an **evidence clock**: a prisoner becomes reviewable after accumulating enough observed prison time, scaled to sentence length, so that no drawable sentence is structurally unable to qualify. The review scores existing evidence — incident involvement, contraband status, case-plan progress, need trajectory, time under effective coverage — and moves the tier up or down. D2 keeps the current schedule and eligibility unchanged but makes the *outcome* matter: a tier change alters security burden, safe-capacity usage or contract rate.
- **Reuses:** existing classification records, risk tiers, sentence length, incidents, contraband, regime/action history, the global review scheduler, security sectors, state income.
- **Player now optimises:** conditions that produce lower-risk classifications, and whether to invest in stabilising specific prisoners rather than treating every record as permanent. D2 adds: whether to build a prison that can safely accept a tier before chasing that tier's revenue.
- **Accepted cost:** D1 — the scoring model can become opaque or gameable through permanent lockdown; use few inspectable evidence categories and cap the benefit of passive confinement. D2 — leaving eligibility unfixed makes the existing defect visible and the system feel arbitrary, since some prisoners can never be reviewed.
- **Build size:** medium — D1 rates it **M**: eligibility rewrite, evidence counters, deterministic scoring, explanation UI, save migration. D2's version is small (one outcome hook).
- **Status:** NEW

## A10. Make the security office the producer of classification reviews
- **Source:** `lockstate-economy-progression-mechanisms.md` — "5. Classification as a saleable service"
- **Mechanic:** A `security-office` conducts classification reviews with a daily office capacity or a required guard assignment. Each completed review converts a prisoner from an uncertain tier to a reviewed tier, lowering incident probability for correctly assigned sectors and paying a small administrative allowance. The document states the eight unreviewable sentence lengths remain a bug unless eligibility is corrected.
- **Reuses:** `security-office` room, `security-console` / `surveillance` capability, the existing review scheduler, risk tiers, incidents.
- **Player now optimises:** scarce review capacity, and whether to spend early on information rather than beds or guards.
- **Accepted cost:** stated — it adds a staff-like abstract service with no staff type behind it, and if reviews stay automatic the room is decorative; hence the requirement for a guard assignment or explicit daily capacity.
- **Build size:** medium — bind the room/object capability to the review producer, add queue and capacity, add the reward modifier.
- **Status:** NEW

## A11. Make `free-association` low-efficiency self-directed care
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "3. `free-association` as low-efficiency self-directed care"
- **Mechanic:** During a `free-association` block a prisoner picks the highest-priority currently reachable non-work, non-education, non-sleep action that can reduce an unmet need. Provision is deliberately less efficient than a dedicated block — **60 percent of the normal rate** is the figure given. Meals stay schedule-bound so the regime system is not erased. If no useful action is reachable the prisoner genuinely idles and the reason is inspectable.
- **Reuses:** the existing regime category, need priorities, routeable rooms, action selection, pathfinding, provision rates. No new room or need provider.
- **Player now optimises:** room mix and regime precision — the ~1,000 ticks a day of structurally empty time become a real scheduling choice, and broad flexible time can absorb local shortages while dedicated blocks stay more efficient.
- **Accepted cost:** stated — flexible blocks make behaviour less predictable and can conceal a badly designed regime by partially repairing it; the reduced rate and a clear action breakdown keep it from dominating dedicated scheduling.
- **Build size:** small — D1 rates it **XS**: extend the action eligibility check, expose the chosen action and reason in existing inspection UI.
- **Status:** NEW

## A12. Make `free-association` a social-pressure valve instead of a need provider
- **Source:** `lockstate_economy_progression_mechanisms.md` — "5. Free-association as a paid social-pressure valve"; `lockstate-economy-progression-mechanisms.md` — "17. Free-association as a social risk budget"; `Lockstate_economy_progression_proposals.md` — "14. Wolny czas jako zasób"
- **Mechanic:** `free-association` does not satisfy a named need. Instead, successful free association lowers a short-lived **social pressure** meter, and high pressure raises incident weight (D2). D3's variant is narrower: the benefit applies only in a room with bench, bookshelf or common-room capacity; overuse without structure raises contraband-exchange probability, while scheduled association in small groups reduces it. D5 states only that free-association should lower tension in `common-room` and `yard` and nowhere else.
- **Reuses:** regime blocks, action categories, common-room/yard routing, bench/bookshelf objects, needs, contraband, incidents.
- **Player now optimises:** regime allocation versus room access — a common room becomes a way to buy stability with time, and replacing it with work raises labour or build throughput at the price of incident risk.
- **Accepted cost:** D2 — a new derived meter, an existing regime category made less deterministic, and possibly the exposure of an absent social model; D2 itself flags the risk that it becomes "a disguised 'counter that needs to move'". D3 — risks turning furniture into a mandatory happiness tax.
- **Build size:** small — one pressure accumulator, an action success hook, an incident modifier.
- **Status:** NEW (D2 recommends deriving pressure from existing unmet needs, incident history and recent association access rather than adding a permanent prisoner attribute, and deleting it if it predicts no decision)

## A13. Give each prisoner one deterministic preference tag
- **Source:** `lockstate-economy-progression-mechanisms.md` — "18. Prisoner preference matching"
- **Mechanic:** At admission each prisoner receives one deterministic preference drawn from the existing action categories — work, education, recreation, hygiene or quiet. Meeting it reduces one unmet-need withholding increment; ignoring it slightly increases incident and escape risk. The preference becomes visible after classification.
- **Reuses:** risk/admission records, regime categories, rooms, needs, incidents, the withholding schedule.
- **Player now optimises:** which population mix to admit, and configuring the regime around the actual cohort rather than treating all prisoners identically.
- **Accepted cost:** stated — it adds identity data without a personality system; limit it to one tag and avoid bespoke schedules.
- **Build size:** small — deterministic tag, matching reader, HUD indicator.
- **Status:** NEW

## A14. Gate admission through a staffed reception
- **Source:** `lockstate_mechanism_design.md` — "2. The Processing Choke-point (Safe vs. Fast Income)"; `lockstate_economy_progression_mechanism_design.md` — "12. Reception as an intake-processing service"; `Lockstate_economy_progression_proposals.md` — "7. Reception jako źródło kontrabandy"
- **Mechanic:** D4 is the concrete version: contraband introduction drops from 10–20% to **1%** if and only if the prisoner passes through a staffed `reception`; processing takes **600 ticks** (stated as "30 in-game minutes"); until processed the prisoner waits in a `holding-cell` and **does not generate the 300 state income**. D1's version adds an `unprocessed` prisoner state, an intake job serviced by reception whose throughput comes from valid room/object capacity through the job queue, and — critically — a slow emergency fallback that auto-processes without the search benefit so the game cannot hard-lock. D5 states only the direction: a good reception lowers contraband chance.
- **Reuses:** admission, the admission contraband roll, sweep/search duty, `reception` and `holding-cell` rooms, room validity and capacity, routing, jobs, alerts, the per-prisoner-day income line.
- **Player now optimises:** intake speed versus screening quality. D4: a player can dump 50 prisoners straight into cells to spike income and be guaranteed a riot at 20% contraband, or build the reception/holding bottleneck, delay cashflow and stay stable.
- **Accepted cost:** D4 — a waiting period before new prisoners become profitable, tightening the early game. D1 — intake friction is dangerous in the opening minutes and can strand a player who did not know reception mattered; the slow fallback and a visible projected throughput are mandatory.
- **Build size:** medium — D1 rates it **M**: prisoner status, intake jobs, one routing target, search integration, snapshot fields, UI status. D4's non-job version is smaller.
- **Status:** NEW

## A15. Make the holding cell a time-limited buffer, not a cheap dormitory
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "13. Holding cell as a time-limited buffer, not a cheaper cell"; `Lockstate_economy_progression_proposals.md` — "6. Holding Cell jako bufor przyjęć"
- **Mechanic:** `holding-cell` receives unprocessed arrivals, temporarily displaced residents and prisoners awaiting a valid cell. It does **not** count as a normal occupied place for full state payment or threshold certification. The first short period is tolerable; after a full in-game day, safety and sleep pressure rises in visible bands and incident risk escalates. Capacity comes from the room's authored rule, and a `time in holding` clock keeps it from becoming invisible permanent housing. D5's line: too long in holding lowers payments.
- **Reuses:** the existing holding-cell room, accommodation routing, room capacity, needs, incidents, state income, status strip.
- **Player now optimises:** buffer size and cell-construction timing — holding capacity lets you accept a batch or survive a temporarily invalid room, but permanent use is economically and operationally inferior.
- **Accepted cost:** stated — too weak and holding becomes the optimal cheap dormitory; too strong and one construction mistake becomes a riot spiral. Requires a grace period, escalating bands, and no one-tick cliff.
- **Build size:** medium — D1 rates it **M**: routing/state transition, holding duration, funding eligibility rule, need and incident modifiers.
- **Status:** NEW

## A16. Make purchased material physically arrive at a delivery bay
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "14. Delivery bay as real material ingress"; `lockstate_mechanism_design.md` — "1. Physical Logistics as an Expansion Cost"; `Lockstate_economy_progression_proposals.md` — "5. Logistyka dostaw materiałów"; `lockstate-economy-progression-mechanisms.md` — "7. Delivery fees and inventory friction"
- **Mechanic:** A purchase still lands after 100 ticks, but at a physical ingress point rather than a global inventory. A valid `delivery-bay` with `delivery-access` controls the number of concurrent unload slots; **before the player builds one, a default exterior curb container accepts one delivery at a time**, so the opening game still works but slowly (D1). Delivered material becomes usable only after unload and reservation. D4 states the same and routes carries to a `storage-room` or straight to a build site using the existing job system.
- **Reuses:** purchases, the 100-tick delay, delivery cancellation, `delivery-bay`, `loading-dock-door`, the `delivery-access` capability, the complete job system (containers, carry legs, reservations), pathfinding, alerts.
- **Player now optimises:** spatial layout and order timing. D4: "expanding the prison is no longer just a cash check; it is a time-and-throughput check", and the distance from the bay to the cell block becomes real economic friction.
- **Accepted cost:** D1 — a blocked path or full bay can halt construction, so the exterior fallback, clear queue positions and a deterministic timeout/recovery rule are required. D4 — building feels slower and staff must scale with infrastructure. D3 — "it can turn building into waiting"; keep the base fee small and preserve cancellation before landing.
- **Build size:** medium-to-large — D1 rates it **M–L**: the delivery event must create physical inventory and jobs, and the inventory view must distinguish ordered / arrived / in transit / reserved / available.
- **Status:** NEW

## A17. Sell delivery throughput as an optional logistics investment
- **Source:** `lockstate_economy_progression_mechanisms.md` — "7. Delivery-bay throughput contracts"; `lockstate-economy-progression-mechanisms.md` — "7. Delivery fees and inventory friction"
- **Mechanic:** The cheap version of A16 that does not make material physical. A valid bay with a loading-dock door increases simultaneous delivery capacity or shortens the 100-tick delay; without it deliveries still arrive through the current global fallback, only slower or less reliably (D2). D3 adds a delivery **charge** scaled by order size and by distance from the bay to the destination, with bulk orders lowering unit cost but increasing cash lock-up and theft exposure.
- **Reuses:** `delivery-bay`, `loading-dock-door`, material orders, the 100-tick delivery timing, cancellation/refund logic, room/object capability reads.
- **Player now optimises:** construction sequencing and cash timing — a large project justifies a bay, a compact prison keeps the cash for beds and guards; and with D3's fee, order batching and storage placement.
- **Accepted cost:** D2 — punishes a player who builds the bay too early, and advantages large expansion plans, which "is appropriate but must be capped".
- **Build size:** small — read existing room/object capabilities and modify delivery scheduling; no new logistics model.
- **Status:** NEW

## A18. Bind storage rooms and racks to real containers
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "15. Storage room and racks as physical inventory capacity"; `lockstate_economy_progression_mechanisms.md` — "8. Storage as liquidity insurance"; `Lockstate_economy_progression_proposals.md` — "15. Magazynowanie materiałów"
- **Mechanic:** D1: storage racks become real containers; the global inventory becomes an accounting sum over containers, carry legs and reservations rather than the place every build consumes from. Build orders reserve accessible stock, preferably from the nearest eligible container, and create carry legs to the build site. A default exterior curb holds a small amount so storage is advantageous, not immediately mandatory. D2's cheaper variant keeps the global inventory but makes stored material *protected*: material outside storage carries a small incident-loss chance, stored material does not, and storage creates neither materials nor income. D5 says unstored materials can be stolen or destroyed.
- **Reuses:** `storage-room`, `storage-rack`, the `item-storage` capability, job containers, reservations, carry legs, pathfinding, build orders, material counts, purchase cancellation, incident records.
- **Player now optimises:** warehouse location, rack capacity, project staging and corridor access (D1); or inventory size versus liquidity — a bulk order is only attractive if you can protect it (D2).
- **Accepted cost:** D1 — physical inventory increases save size, pathfinding work and the number of ways construction can stall; use stack counts, aggregate carry jobs, surface reservation ownership. D2 — random loss is harsh and can feel unfair; use the named RNG streams, show exposure on the HUD, or make exposure incident-based rather than per-tick.
- **Build size:** large — D1 rates it **L**, "the largest logistics wiring task but uses the already tested job/reservation/pathfinding machinery". D2's protection-only version is small.
- **Status:** NEW

## A19. Let prisoners haul materials as a work action
- **Source:** `lockstate_economy_progression_mechanisms.md` — "6. Work as construction acceleration, not prisoner wages"
- **Mechanic:** During `work` blocks, prisoners perform a bounded construction-support job: carrying delivered material from the global inventory or delivery bay to build-order containers. They do not build walls. Each successful carry leg reduces a build order's remaining delivery delay or labour clock. Work time replaces another permitted activity, so the speed is not free.
- **Reuses:** job board, workers, containers, carry legs, reservations, pathfinding, build-order queue, delivery timing, work regime blocks.
- **Player now optimises:** whether to allocate guards and regime time to enable work, whether to build a delivery bay, and whether faster construction is worth less recreation or education time.
- **Accepted cost:** stated — prisoners moving materials create security and contraband opportunities, and construction becomes dependent on a functioning regime.
- **Build size:** medium — bind room/build containers to the existing worker job, add one job type and a build-progress modifier.
- **Status:** NEW

## A20. Make deconstruction produce a physical salvage stack
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "27. Physical relocation and salvage instead of teleporting refunds"
- **Mechanic:** Undoing or deconstructing a completed object invalidates the room's capacity *immediately* and creates a physical salvage stack on that tile. The material is unavailable until a carry job moves the stack to storage or the exterior fallback. A moved bed therefore cannot keep funding its former resident, appear instantly in another cell, and be reused again. Sell-back can consume the same stack.
- **Reuses:** completed build orders, cancellation/undo, material refunds, room capacity, job containers, carry legs, storage, pathfinding, sell-back.
- **Player now optimises:** whether to relocate, rebuild, or live with an imperfect layout — remodelling now has a logistics cost even when the material is recoverable.
- **Accepted cost:** stated — a blocked salvage stack can trap scarce material and make correction frustrating; allow a deterministic emergency recovery command after a long timeout at a fixed loss, with a clear warning.
- **Build size:** medium — change refund timing, create salvage containers and jobs, update room capacity before payment, expose stuck salvage.
- **Status:** NEW (a third independent fix for the one-plank exploit, alongside A1 and A5)

## A21. Build one institutional service queue as the back-office spine
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "11. An institutional service queue as the back-office spine"
- **Mechanic:** Turn prison events into typed service jobs and turn the inert room capabilities into job destinations. Each job needs only a source event, a location, a required capability, a priority, a deadline and a completion effect. Admissions create intake work, purchases create unload/carry work, incidents create security and medical work, occupied rooms create waste, active objects create maintenance. **Bind actual room instances to the container/job system instead of using container IDs that merely resemble rooms.** A small service backlog by category appears in the status strip or Overview.
- **Reuses:** the complete job board, workers, containers, carry legs, reservations, pathfinding, room instances, object capabilities, deterministic event order, existing HUD and alert surfaces.
- **Player now optimises:** throughput, layout, spare operational capacity and job priority — a remote storage room, an overloaded reception or a blocked corridor now has an economic consequence.
- **Accepted cost:** stated — it can turn a prison game into a chores-and-hauling game, increase pathfinding load, and create cascading stalls; jobs must be aggregated, priorities automatic by default, and every stalled job must report a precise reason.
- **Build size:** large — D1 rates it **L** and says the expensive part is not inventing a job engine but binding real rooms and actors to the one already present and carrying state through snapshots and saves.
- **Status:** NEW (this is the common substrate under A14, A16, A18, A24, A26, A31, A38, A47)

## A22. Sell material back at a fixed discount by state
- **Source:** `lockstate_economy_progression_mechanisms.md` — "9. Sell-back as a deliberate loss, not a refund exploit"
- **Mechanic:** Price sell-back by time and condition: **unopened materials at 70%, materials in a cancelled order at 60%, nothing at full value**, plus a small transaction fee or one-day delay on large sales. The loss must appear as a loss in the transaction log.
- **Reuses:** Treasury, material inventory, order cancellation and refund paths, delivery state.
- **Player now optimises:** liquidity versus commitment — buying ahead has a time discount but a real loss if the plan changes.
- **Accepted cost:** stated — too gentle a loss erases the intended consequence of bad purchasing; it must not become a money printer.
- **Build size:** small — price function plus a sell command, "largely covered by the decided work".
- **Status:** ALREADY DECIDED (sell-back) — contributes only the specific 70/60 spread and the fee/delay

## A23. Implement sell-back as reverse logistics with an emergency fallback
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "16. Sell-back as reverse logistics"
- **Mechanic:** A sell-back command reserves unallocated material at a fixed deterministic discount, but **cash is credited only once the material reaches a delivery bay or the exterior fallback**. The order can be cancelled while the goods have not left, mirroring purchase cancellation. During insolvency, an emergency pickup from the exterior fallback is allowed at a worse fixed rate so the recovery tool cannot itself be hard-locked by missing logistics.
- **Reuses:** the decided sell-back, inventory reservations, delivery bay, carry jobs, order cancellation, Treasury, refusal reasons.
- **Player now optimises:** liquidity versus future construction, plus the *time* cost of moving stock out; material location matters and sell-back stops being an instant undo.
- **Accepted cost:** stated — reverse logistics can delay a rescue that was meant to prevent a stall; the emergency fallback and a precise estimated payout time are necessary.
- **Build size:** small with a global inventory (D1 rates **S**), medium once physical inventory (A16/A18) is live.
- **Status:** ALREADY DECIDED (sell-back) — adds the physical-delivery condition and the insolvency emergency rate

## A24. Turn occupancy into a waste backlog serviced by the garbage room
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "17. Waste as an aggregate service backlog"; `lockstate-economy-progression-mechanisms.md` — "8. Waste as a capacity tax"
- **Mechanic:** Occupancy and meal actions generate **aggregate** waste units into nearby waste bins — explicitly not individual rubbish entities. A `waste-disposal` job moves batches to a `garbage-room`, which clears them at a fixed service rate. Full local bins cut hygiene provision in that room or accelerate hygiene decay; a critical global backlog raises incident pressure. The player sees `generated`, `stored`, `overdue` totals. D3 adds that laundry and unmet bladder/hygiene needs also generate waste, and that overflow withholds state income.
- **Reuses:** `waste-bin`, `garbage-room`, the `waste-disposal` capability, occupancy, meal actions, hygiene need, incidents, the job system, containers, pathfinding.
- **Player now optimises:** bin placement, disposal throughput, and the size and location of the garbage room — population now produces an operational cost that scales differently from wages, and it activates a dead room plus a dead object capability.
- **Accepted cost:** D1 — waste is a classic maintenance chore and can become busywork; generation must be aggregate and predictable, default priorities automatic, and the penalty must emerge from backlog rather than random mess events. D3 — it adds a failure cascade to already tight early finances; start with generous first-bin capacity.
- **Build size:** medium — one aggregate resource, a job producer and consumer, a need modifier, a HUD or room overlay.
- **Status:** NEW

## A25. Give utility panels a finite daily service budget
- **Source:** `lockstate-economy-progression-mechanisms.md` — "9. Utility load and rationing"
- **Mechanic:** Utility panels define a finite daily service budget consumed by showers, laundry, kitchen and (later) medical treatment. The player either builds more panels or rations service by regime priority; rationing raises the relevant unmet needs but preserves cash. One load number only, with clear room-level consumers and a visible outage consequence.
- **Reuses:** `utility-room`, `utility-panel`, the `utility-control` capability, existing rooms, the six needs, regime blocks.
- **Player now optimises:** service reliability and infrastructure placement rather than only beds and guards.
- **Accepted cost:** stated — "a new abstract resource can become spreadsheet noise".
- **Build size:** medium — capability reader, daily budget, consumption hooks, HUD meter.
- **Status:** NEW

## A26. Make utility panels retire a deterministic maintenance backlog
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "18. Utility maintenance as deterministic capacity degradation"
- **Mechanic:** Active objects generate a small deterministic maintenance load at each day boundary; `utility-panel` capacity retires maintenance jobs. When backlog crosses visible thresholds, affected rooms lose a percentage of effective object capacity; at a higher threshold selected objects go offline **in stable object-ID order** until serviced. Explicitly no random breakdowns and no power network.
- **Reuses:** `utility-room`, `utility-panel`, `utility-control`, object IDs, room capacities, day boundaries, jobs, alerts.
- **Player now optimises:** expansion pace versus support capacity — a prison full of beds, stoves, showers and consoles needs proportional maintenance, which is a second scaling cost that is not another wage line.
- **Accepted cost:** stated — another recurring tax that can cascade if the utility room itself degrades; exempt the minimum recovery capability, degrade gradually, and show the exact overdue load.
- **Build size:** medium-to-large — D1 rates it **M–L**; counters are easy, integrating every capability's effective capacity is the work.
- **Status:** NEW (differs from A25: A25 rations a daily service budget, A26 clears a debt that otherwise disables objects)

## A27. Accrue maintenance debt against built assets
- **Source:** `lockstate_economy_progression_mechanisms.md` — "20. Room commissioning and maintenance debt"; `lockstate-economy-progression-mechanisms.md` — "19. Structural maintenance debt"
- **Mechanic:** D2: a newly built room becomes "commissioned" only after its required objects are installed and a short operating test succeeds; each commissioned room then accrues maintenance debt from use, and unpaid debt cuts its capacity or service rate until a job services it. D3's variant accrues the obligation per completed construction order from wall, door and object counts, deferred maintenance raising delivery/build failure probability and incident severity, cleared by spending materials through a maintenance job.
- **Reuses:** room zoning and validation, object-derived capacity, build orders, materials, cancellation/refund, the job system, wage/arrears degradation, the refusal band, insolvency degradation.
- **Player now optimises:** expansion timing against a maintenance reserve — building a classroom or laundry is not enough, operating it reliably competes with the next construction project; D3: "a real cost to endless scale".
- **Accepted cost:** D2 — creates a maintenance subsystem and risks busywork; keep it to one numeric debt per room cleared by one existing job type. D3 — "it can feel like a tax on success"; use a grace period and let efficient layouts reduce it.
- **Build size:** medium — room state, a debt accumulator, one maintenance job using existing workers and containers.
- **Status:** NEW

## A28. Give incidents an injury state the infirmary clears
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "19. Infirmary as incident recovery, initially without a medic role"; `lockstate-economy-progression-mechanisms.md` — "14. Medical triage as a temporary capacity modifier"; `Lockstate_economy_progression_proposals.md` — "10. Infirmary bez zdrowia"
- **Mechanic:** The injured entity ID an incident already records becomes a saved injury state. D1 uses a small severity band: injury reduces movement or action efficiency and can temporarily block work; a `medical-bed` plus `medicine-cabinet` provides `medical-treatment` over time and clears it; **no medic actor in the first version**, and lack of an infirmary falls back to very slow passive recovery so nothing deadlocks. D3 uses three states — untreated, stabilised, recovered — where untreated injured prisoners *reduce effective occupied capacity* and raise incident risk, and treatment restores capacity after a deterministic duration. D5 states the minimal form: incidents create unresolved injury markers and the infirmary removes them.
- **Reuses:** incident injured entity IDs, `infirmary`, `medical-bed`, `medicine-cabinet`, the `medical-treatment` capability, room routing, room capacity, actor action rates, alerts.
- **Player now optimises:** prevention versus recovery capacity — full security stops being the only answer to incidents; a smaller guard force backed by treatment becomes viable, or prevention to avoid lost labour and room time.
- **Accepted cost:** D1 — this is the beginning of a health model and can expand without limit; keep to a few severity bands, one treatment action, no diseases, no medicine inventory, no staff profession. D3 — it may make the infirmary mandatory; keep effects bounded and let untreated cases eventually resolve at a cost rather than death.
- **Build size:** medium — injury state, modifiers, routing and treatment action, save migration, prisoner/incident UI.
- **Status:** NEW

## A29. Suspend daily income for injured prisoners
- **Source:** `lockstate_mechanism_design.md` — "3. Risk-Tiered Income & The Medical Pause"
- **Mechanic:** On an incident, set an `injured` flag on the victim, **suspend their income accrual entirely**, route them to an infirmary bed and tick down a recovery timer. Combined in the source with tier-differentiated rates (A6), so that a riot in a high-tier prison zeroes the most valuable part of the income stream.
- **Reuses:** incident injured entity IDs, `infirmary`, `medical-bed`, the per-prisoner-day income line, the daily income schedule.
- **Player now optimises:** whether to build an infirmary early — "if your prison lacks an infirmary to heal them quickly, a riot doesn't just damage morale, it immediately zeroes out your income stream".
- **Accepted cost:** stated — high income variance; a riot becomes a severe financial shock.
- **Build size:** small on top of A28 — one flag consulted by the income calculation.
- **Status:** NEW

## A30. Give every incident a claim record with a financial tail
- **Source:** `lockstate-economy-progression-mechanisms.md` — "13. Incident claims"
- **Mechanic:** Each incident opens a claim record. A prison with no unresolved claim backlog receives a small reliability allowance; assaults, riots and escapes create escalating claim costs. Fast response and adequate treatment reduce the final cost. Severity is calculated initially from incident type, response delay and coverage — explicitly not from diagnosed injuries.
- **Reuses:** incident records, injured entity IDs, guards, the planned negative treasury and degradation system, `medical-bed` and `medicine-cabinet` capabilities.
- **Player now optimises:** prevention and response time, because incidents now have durable financial consequences rather than a log entry.
- **Accepted cost:** stated — without a health model the claim system could feel arbitrary.
- **Build size:** small — claim ledger and severity formula; medical effects added later.
- **Status:** NEW

## A31. Give every incident a bounded aftermath job package
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "21. Incident aftermath as a bounded recovery queue"
- **Mechanic:** Every assault, riot, escape attempt or gang retaliation creates a small deterministic recovery package: secure the sector, search the involved locations, escort injured entities, clear the incident state. Until that work completes the sector shows `recovering`, temporarily requires one additional effective guard post, and suspends work and free-association for the directly involved prisoners. Packages are capped and merged so repeated incidents cannot spawn thousands of jobs.
- **Reuses:** incidents, sectors, guards, sweep duty, injured IDs, the job system, routing, regime categories, alerts.
- **Player now optimises:** spare response capacity and recovery speed rather than only the probability of the first incident — a prison staffed at exactly 100% is efficient on quiet days and brittle after a riot.
- **Accepted cost:** stated — recovery work can create a feedback loop where one incident causes understaffing and then more incidents; cap the extra demand, merge concurrent packages, and provide a timeout that degrades to a known penalty rather than an endless lock.
- **Build size:** medium — incident-to-job mapping, sector recovery state, temporary demand modifier, UI.
- **Status:** NEW

## A32. Give guards duty fatigue that the staff room clears
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "22. Guard duty fatigue that makes the staff room real"; `lockstate-economy-progression-mechanisms.md` — "12. Guard fatigue without patrol routes"; `Lockstate_economy_progression_proposals.md` — "9. Staff Room i morale"
- **Mechanic:** Guards accumulate duty ticks while assigned to posts or recovery work; unassigned guards recover slowly and a valid `staff-room` with free capacity accelerates recovery. Fatigue cuts **effective** coverage in visible bands rather than secretly weakening a nominal `2 of 2`. D1 ties wage arrears into it: arrears accelerate fatigue or slow recovery, connecting the decided insolvency consequences to an existing room. D3 sources load from incidents, sweeps and uncovered posts, and proposes rotating assignments as coverage-for-resilience. D5's line: unpaid guards lose effectiveness more slowly if a staff-room exists.
- **Reuses:** guards, post assignments, sector deployment, wage arrears, the coverage HUD, `staff-room`, room capacity, day/time, incidents, sweep duty.
- **Player now optimises:** staffing slack, rotation and staff-room capacity — hiring the bare minimum is cheaper but fragile, and extra staff plus rest space buy resilience. D3: not merely chasing the HUD target `2 of 2 / Covered`.
- **Accepted cost:** D1 — fatigue can become a staffing tax and add roster micromanagement; rotation must be automatic and the HUD must show effective versus nominal coverage. D3 — another hidden state, so surface each guard's load in the Security tab; D3 also notes it touches the deliberate no-patrol decision "only minimally: it models duty load, not movement".
- **Build size:** medium-to-large — D1 rates **M–L**: guard state, automatic rotation, staff-room routing, coverage integration, arrears interaction, save migration.
- **Status:** NEW

## A33. Make wage arrears degrade coverage rather than nothing
- **Source:** `lockstate_economy_progression_mechanisms.md` — "10. Wage arrears as a staffing credit line"
- **Mechanic:** When wages go unpaid, guards stay temporarily but their effective coverage falls and incident response delay grows as arrears accumulate. A guard paid late returns to full effectiveness only after one day boundary. The effectiveness penalty must begin immediately or after a small, explicitly stated grace period.
- **Reuses:** wage billing at the day boundary, persistent arrears, staff hiring/dismissal, deployment and coverage, incidents, the degradation ladder.
- **Player now optimises:** staff count against cash runway — three guards may prevent an incident but push the prison into arrears, making a smaller staff with a better layout preferable.
- **Accepted cost:** stated — a short-term exploit exists if players can keep full coverage during insolvency.
- **Build size:** small — an arrears-to-effectiveness curve and one HUD warning.
- **Status:** ALREADY DECIDED (degradation ladder) — supplies the "staff unpaid with morale and incident consequences" rung with a concrete curve

## A34. Let the player choose which obligations to pay during insolvency
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "23. Player-directed arrears triage"
- **Mechanic:** Once negative balances are allowed, unpaid obligations become explicit arrears entries instead of invisible failed effects. The player picks a standing policy — `protect payroll`, `protect deliveries`, or `balanced` — and at each cash inflow and day boundary the policy allocates money across wages, pending delivery release, construction commitments and loan service. The Overview tab shows each arrears category and its next consequence; refusal messages name the blocking arrears item.
- **Reuses:** Treasury, wage arrears, delivery refusal, construction halt, day boundary, alerts, the refusal band, the planned degradation ladder.
- **Player now optimises:** which part of the prison stays functional while insolvent — protect guards to stop riots and accept construction delay, or release a critical delivery while wages keep accruing.
- **Accepted cost:** stated — one policy may dominate, and per-invoice control would be tedious; start with three automatic policies and make consequences predictable rather than adding an accounting screen.
- **Build size:** small-to-medium — D1 rates **S–M**: obligation categories, a policy command, consequence hooks, save migration, Overview UI.
- **Status:** ALREADY DECIDED (degradation ladder) — turns the fixed ladder into a player-chosen ordering, which is the genuinely new part

## A35. Make coverage change incident severity, not incident existence
- **Source:** `lockstate_economy_progression_mechanisms.md` — "16. Security coverage as a variable cost, not a binary label"
- **Mechanic:** Keep the `0 of 2 / Unguarded`, `1 of 2 / Understaffed`, `2 of 2 / Covered` states, but make them alter incident **severity and response cost**. Full coverage should not eliminate riots — the document notes the brief says riots still happen at full coverage — it should reduce spread, duration or follow-on damage.
- **Reuses:** sector deployment, post assignment, the coverage HUD, incidents, guard wages.
- **Player now optimises:** partial versus full coverage per sector — a small prison can leave a low-value area understaffed while protecting the canteen and cell block.
- **Accepted cost:** stated — guards become more valuable and may worsen the already-tight loop; balance through layout and sector priority, not one guard per prisoner.
- **Build size:** small — incident modifiers keyed to the existing coverage state and sector location.
- **Status:** NEW

## A36. Let the player assign patrol routes as a trade-off
- **Source:** `lockstate_economy_progression_mechanisms.md` — "17. Patrol routes as a risk-investment choice"
- **Mechanic:** Guards still do not patrol automatically. The player may assign a route to an existing security sector; the assigned guard consumes time walking and creates coverage gaps while doing so. Patrol lowers contraband and escape probability along the route but may delay response elsewhere. A perimeter route helps escape risk, a cell-block route helps contraband and assault detection.
- **Reuses:** the existing hierarchical pathfinding, the existing patrol system that is currently skipped, derived security sectors, guards, contraband and escape incidents.
- **Player now optimises:** static posts versus mobile prevention.
- **Accepted cost:** stated — patrol becomes mandatory if its benefit is too high; the assigned guard must not simultaneously be a fixed post.
- **Build size:** small-to-medium — make a security sector carry a route, then connect the existing patrol traversal to incident modifiers.
- **Status:** NEW (it revisits the brief's note that the derived default sector carries no patrol route "as a deliberate consequence of an accepted decision"; the document does not acknowledge that it is doing so)

## A37. Track contraband as a heat meter with sweeps and amnesty
- **Source:** `lockstate-economy-progression-mechanisms.md` — "11. Contraband heat and amnesty"; `lockstate_economy_progression_mechanisms.md` — "18. Contraband chain and sweep trade-off"
- **Mechanic:** Contraband feeds a prison-wide heat meter. Sweeps reduce heat but consume guard time and can disrupt work; an **amnesty period** reduces heat faster but temporarily lowers security. High heat raises gang-retaliation and escape-attempt probability (D3). D2's version: each successful search creates a small temporary reduction in contraband risk but consumes guard time and causes a short-term unrest increase, while undetected contraband raises incident severity over time.
- **Reuses:** the admission contraband roll, the sweep duty, guards, security sectors, incidents, alerts, the refusal band.
- **Player now optimises:** sweep frequency and timing — sweeping after every admission is safe but expensive and disruptive; sweeping only on a signal is cheaper but riskier.
- **Accepted cost:** D3 — a single meter can become an obvious cooldown; tie heat to risk tier, room traffic and recent sweep patterns so timing and layout matter. D2 — unrest as a side effect is confusing unless "security pressure" and the next sweep effect are exposed.
- **Build size:** small — D3 says "low-medium": a meter, decay and reduction rules, incident modifiers.
- **Status:** NEW

## A38. Make the security office target sweeps by suspicion
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "20. Security office as a targeting advantage for sweeps"
- **Mechanic:** A functional `security-office` with a `security-console` consumes the `surveillance` capability. It does not reveal contraband. Instead, admission searches, prior sweep results, incidents and sector coverage produce a coarse **suspicion level per sector**, and the office lets the player issue a targeted sweep at the highest-suspicion sector; without it, sweeps stay broad and slower. The office prioritises the existing sweep duty.
- **Reuses:** `security-office`, `security-console`, the `surveillance` capability, sectors, contraband, admission, incidents, sweep duty, jobs, coverage.
- **Player now optimises:** information versus brute-force searching — spending room and material cost to stop wasting guard time on low-value sweeps, which matters more as the prison grows.
- **Accepted cost:** stated — suspicion can feel like a fake hidden-number system; keep few bands, show the evidence that moved them, never present false exact certainty.
- **Build size:** small-to-medium — D1 rates **S–M**: aggregate sector evidence, a targeted-sweep command, a console capability check, a UI list.
- **Status:** NEW

## A39. Let a manned security console suppress need decay in covered sectors
- **Source:** `lockstate_mechanism_design.md` — "5. Administrative Suppression"; `Lockstate_economy_progression_proposals.md` — "8. Security Office jako mnożnik pokrycia"
- **Mechanic:** If a `security-office` exists and contains a `security-console`, guards assigned to sectors gain a "suppress" state. A suppressing guard **pauses `safety` and `recreation` need decay** for all prisoners currently in that sector. D5's weaker version: the console simply raises the effectiveness of assigned guards.
- **Reuses:** `security-office`, `security-console`, security sectors, staff assignment, need decay schedules, coverage state.
- **Player now optimises:** paying the 80/day wage to buy time on the needs clock — D4's stated aim is to make the three unsatisfiable needs survivable for longer sentences.
- **Accepted cost:** stated — guards locked in suppression are not available for escort or contraband sweeps.
- **Build size:** small — an area-of-effect need-decay modifier applied to sectors whose status is `Covered`.
- **Status:** NEW (note: it makes a need *stop decaying* rather than be provided, which sidesteps rather than answers the "three needs cannot be met" question the brief flags as undecided)

## A40. Pay a milestone reserve for consecutive incident-free days
- **Source:** `lockstate_economy_progression_mechanisms.md` — "2. Days-without-incident reserve"; `Lockstate_economy_progression_proposals.md` — "17. Premie za ciągi bezpieczeństwa"
- **Mechanic:** A rolling reserve grows each incident-free day and pays out only at milestones — **2, 5, 10 and 20 clean days** in D2. A new incident resets the streak and can consume an outstanding reserve. D2 is emphatic this is not a calendar grant: the reward is earned by maintaining a condition, and it must not become a second passive salary. D5's variant is a multiplier on rewards that grows per clean day and resets on incident.
- **Reuses:** the deterministic day boundary, incident records, Treasury, the threshold-grant payout path, existing status alerts.
- **Player now optimises:** stability and timing — the player may delay admissions, hire a guard or spend on needs to protect a valuable streak instead of maximising occupancy.
- **Accepted cost:** D2 — a riot erases progress and the system pressures conservative play after a near-success. D5 — snowball effect.
- **Build size:** small — one streak counter, a milestone table, a reset hook, a HUD indicator.
- **Status:** NEW (it is close to the block grant rejected under decision 1, but pays for a maintained condition rather than for surviving to a date; D2 makes that distinction explicitly)

## A41. Run periodic state inspections that score existing facts
- **Source:** `lockstate_economy_progression_mechanisms.md` — "11. Inspection score and conditional capital"; `lockstate-economy-progression-mechanisms.md` — "10. Inspection windows"; `Lockstate_economy_progression_proposals.md` — "3. Inspekcje państwowe"
- **Mechanic:** A periodic inspection scores the prison from facts it already tracks — the unmet-needs schedule, safe-capacity ratio, incidents, contraband, coverage, overdue wages. D2 pays the score as a **one-off capital award or a temporary borrowing limit, explicitly not permanent income**. D3's variant checks a *deterministic sample* of cells and rooms rather than aggregates, granting a temporary rate bonus or a higher licensed-capacity band on a pass and starting a visible compliance countdown plus penalty on a fail; the next window is seeded visibly and sampling is deterministic **so reloads cannot change the result**.
- **Reuses:** six needs and withholding, incident history, contraband, coverage HUD state, arrears, Treasury, loans, named RNG streams, alerts.
- **Player now optimises:** a legible operating standard rather than raw growth — postponing a risky expansion before an inspection, or investing in hygiene and security to qualify for capital. D3 adds: maintaining the hidden corners rather than gaming aggregate averages.
- **Accepted cost:** D2 — external pressure that feels artificial if the timing is opaque; show the next window and the score components. D3 — a sudden audit can feel arbitrary.
- **Build size:** medium — a deterministic score, an inspection schedule, an award or loan-limit hook, a dashboard card.
- **Status:** NEW

## A42. Split threshold grants into an immediate part and a certified part
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "1. Certified growth grants rather than raw population grants"
- **Mechanic:** Keep the decided threshold grants. The first threshold stays immediate. Later thresholds pay a small immediate portion on crossing, and the remainder only after the prison **holds the threshold for one full in-game day** with enough currently valid residency capacity, no overflow prisoners, and no occupied security sector at `Unguarded`. A threshold pays once, permanently marked. The HUD shows `reached` / `awaiting certification` / `paid`, plus the exact failed condition.
- **Reuses:** prisoner count, bed-derived room capacity, the day boundary, security-sector coverage, Treasury, alerts, the existing refusal and status surfaces.
- **Player now optimises:** the order of expansion — beds and minimum security must lead intake instead of buying prisoners and repairing the damage afterwards. The immediate part still performs the owner's anti-stranding role.
- **Accepted cost:** stated — a grant can feel unfairly withheld once the headline threshold has been crossed, so the certification condition must be visible and stable; too many conditions turn a simple growth reward into an inspection minigame.
- **Build size:** small — D1 rates **S**: one threshold-state record, day-boundary certification, a few state queries, save migration, one Overview panel.
- **Status:** ALREADY DECIDED (threshold grants) — the certification gate and the sublinear-threshold argument are the additions

## A43. Pay specialisation thresholds, not only population thresholds
- **Source:** `Lockstate_economy_progression_proposals.md` — "12. Granty specjalizacyjne"
- **Mechanic:** One-off bonuses for reaching stated levels of a particular function — the document's examples are "largest laundry" and "largest school". Stated in one line; no numbers, no thresholds, no definition of "largest" (absolute capacity, or capacity per prisoner) is given.
- **Reuses:** the decided threshold-grant payout path, room capacities.
- **Player now optimises:** specialising the prison rather than only growing it — though as written the target is undefined, so it is not implementable without deciding what is being measured.
- **Accepted cost:** stated — "risk of a dominant strategy".
- **Build size:** small — a second threshold table keyed on room capacity instead of population.
- **Status:** ALREADY DECIDED (threshold grants) — a variant axis for the same machinery; vague as written

## A44. Pay a commissioning grant the first time a capability actually does something
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "10. Capability commissioning grants"
- **Mechanic:** Pay a one-off grant when a capability performs its **first real function**, never when a room is merely zoned: `medical-treatment` pays after an injury is treated, `waste-disposal` after waste is cleared, `delivery-access` after a delivery is unloaded, `surveillance` after a targeted sweep completes. Existing active rooms use equivalent first-action milestones. The capability must remain operational through the next day boundary before final payment.
- **Reuses:** room categories, object capabilities, action and job completion events, threshold-grant bookkeeping, day boundaries, Treasury.
- **Player now optimises:** which operational capability to bring online next — a lightweight progression path through systems that already exist, without pretending the room was locked by research.
- **Accepted cost:** stated — players may build purely to claim the grant then demolish; prevented by delayed certification, one grant per capability rather than per room, and a payment smaller than the setup cost.
- **Build size:** small — D1 rates **S**, once the capability has a producer and consumer; one generic milestone record serves all capabilities.
- **Status:** NEW (this is the batch's most direct answer to the nine dead rooms, and it explicitly satisfies rule 4 by gating nothing)

## A45. Award three reversible operating certifications
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "9. Operating certifications as progression without a research tree"
- **Mechanic:** Three visible, reversible grades earned from rolling multi-day evidence — `Custody` (coverage, incidents, escapes, contraband), `Care` (need trajectories, case-plan outcomes), `Operations` (service backlog, delivery handling, maintenance, once those exist). Higher grades unlock harder intake contracts, larger outcome contracts or additional grant choices. They explicitly **do not unlock rooms that are already buildable**.
- **Reuses:** existing HUD metrics, incidents, contraband, needs, security coverage, day boundaries, service jobs when wired; the grades live in the Overview tab.
- **Player now optimises:** sustained quality over several days — population stops being the only progression axis and a small well-run prison can advance without expanding.
- **Accepted cost:** stated — certifications can snowball, since success unlocks better offers which fund more success; use narrow benefits, hysteresis and temporary probation rather than instant grade loss, and never hide the contributing metrics.
- **Build size:** medium — D1 rates **M**: rolling score state, grade thresholds, contract gating, Overview UI, save migration.
- **Status:** NEW (this is progression-as-gating, and it does say what it gates: contract difficulty and grant choice, not rooms)

## A46. Let the player pick a weekly service-level contract
- **Source:** `lockstate-economy-progression-mechanisms.md` — "3. Service-level contracts"
- **Mechanic:** At the start of each in-game week the player chooses one of three contracts — **minimum safety, rehabilitation, or throughput**. Each defines a measurable target built from existing needs, education/work blocks, incidents and releases. Meeting it grants a bonus; failing creates a temporary penalty or "scrutiny debt".
- **Reuses:** regime blocks, needs, incidents, classroom, work and free-association blocks, admissions and releases, the planned threshold-grant display.
- **Player now optimises:** configuring the same prison differently week to week — more work and education for rehabilitation, more safety capacity for safety, more beds and logistics for throughput.
- **Accepted cost:** stated — the choice becomes a dominant strategy if one contract is always easiest; each needs a distinct reward and targets that depend on the chosen risk mix.
- **Build size:** medium — contract data, weekly evaluation, three HUD cards, treasury effects.
- **Status:** NEW

## A47. Offer back-office service-level contracts once the queue exists
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "26. Service-level contracts for back-office performance"
- **Mechanic:** Short contracts that pay for a measurable operational result: process every arrival within a time limit, clear all incident recovery work before the next day, end the day with no overdue waste, keep delivery turnaround below a threshold. **Payment is for completed service, never for owning the room.** Harder versions unlock at higher operating certification (A45).
- **Reuses:** the service job queue (A21), deadlines, reception, delivery, waste, incident recovery, the day boundary, certifications, Treasury, alerts.
- **Player now optimises:** spare throughput and reliability — a second loading point or more storage becomes worth building because a contract makes the bottleneck economically valuable, "not because a counter needs to rise".
- **Accepted cost:** stated — these can become checklist chores or pay for work the player would do anyway; limit active contracts, make failure cost only the missed reward, and generate offers from genuinely observed capacity.
- **Build size:** small — D1 rates **S**, but only after A21 exposes reliable completion and deadline events.
- **Status:** NEW

## A48. Offer fixed-deliverable prison-labour shift contracts
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "25. Fixed-deliverable prison-labour shift contracts"
- **Mechanic:** At the start of a day, offer a small set of work contracts — e.g. complete a specified number of valid `work` action ticks in the kitchen or laundry before the next day boundary. The player accepts at most one. **Payment is fixed and arrives only on completion; there is no passive per-prisoner payment and no per-tick income.** Contract size scales from current room capacity and population so impossible offers are never generated.
- **Reuses:** work regime blocks, `kitchen`, `laundry`, prisoner routing and actions, the day boundary, named RNG for offer selection, Treasury, the Overview tab.
- **Player now optimises:** regime time, work-room capacity, prisoner allocation, and whether income is worth sacrificing care or education time.
- **Accepted cost:** stated — counting abstract work ticks can feel artificial and one room may become the mathematically dominant factory; rotate contract types, cap daily value, show expected feasible progress before acceptance.
- **Build size:** small-to-medium — D1 rates **S–M**: contract offer and state, action-event progress, payment, compact UI.
- **Status:** NEW (this is decision 3's unbuilt "prison labour" secondary line, given a shape that avoids being another population subsidy)

## A49. Credit prison labour continuously against operating cost
- **Source:** `Lockstate_economy_progression_proposals.md` — "4. Produktywna pralnia" and "16. Kontrakty pracy więźniów"; `lockstate_economy_progression_mechanisms.md` — "13. Prisoner labour exchange"
- **Mechanic:** Each prisoner working in `laundry` (D5 #4), or in laundry/kitchen/logistics (D5 #16), produces a small income or reduces state costs during work blocks. D2's version converts work ticks into "a small reduction in operating cost or a small daily credit", explicitly **not** paying prisoners directly — an institutional service credit, capped, with a need or incident penalty if work access is excessive or mismatched.
- **Reuses:** work regime blocks, `laundry` and `kitchen` rooms, the job system, needs, the state income/cost ledger.
- **Player now optimises:** whether scarce work blocks go to labour or to education and free-association — the cheapest workforce acquires an opportunity cost.
- **Accepted cost:** D2 — unpaid labour risks flattening the design into "always work". D5 — it may weaken the significance of grants.
- **Build size:** small-to-medium — a job-completion credit and one cost line; no market or inventory economy required.
- **Status:** NEW — but note D1 argues against exactly this shape: "A passive amount per working prisoner would be another population subsidy", preferring A48's completed-deliverable form

## A50. Make work rooms produce goods through the container system
- **Source:** `lockstate-economy-progression-mechanisms.md` — "6. The missing prisoner work loop"
- **Mechanic:** Bind `work` regime blocks to a job-board job type produced by `laundry`, `kitchen` or `storage-room` objects. A worker carries an input container, performs a timed job, and deposits an output container. Outputs reduce a recurring purchase or create a modest sell-back value. Cap job hours, require safe risk tiers, and let failed jobs create waste or delay rather than free money.
- **Reuses:** the complete job board, workers, containers, carry legs, reservations, pathfinding, laundry/kitchen/storage-room, work regime, global inventory.
- **Player now optimises:** prisoner labour against meal, hygiene and security coverage — workrooms become throughput investments and route layout affects production.
- **Accepted cost:** stated — labour competes directly with rehabilitation and can increase contraband or incidents.
- **Build size:** medium-to-large, but the document argues it is "unusually cheap for its payoff because the logistics machinery already exists; the main work is room-container binding and two or three recipes".
- **Status:** NEW

## A51. Score care by need trajectory instead of absolute satisfaction
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "8. Need trajectory scoring instead of impossible absolute satisfaction"
- **Mechanic:** For grants, case plans, certification and release outcomes, evaluate care by improvement and provision opportunity rather than by reaching an absolute contentment threshold. Track the proportion of eligible regime time actually provisioned, net need change since admission, and days without a critical need, scaled to sentence duration. The six needs themselves are unchanged; this is a new way to score what the prison achieved.
- **Reuses:** existing need values, provision ticks, admission and release times, regime blocks, day-boundary snapshots.
- **Player now optimises:** marginal improvement — a shower room or common room becomes worth building even when a short sentence makes full satisfaction mathematically impossible.
- **Accepted cost:** stated — relative scoring is less intuitive than a full/empty bar and can reward a prison that admits people in terrible condition; anchor the score to both improvement and a minimum absolute floor.
- **Build size:** small — D1 rates **S**: a few rolling counters and a visible care summary, then reused by other mechanics.
- **Status:** NEW (this is the batch's direct answer to the brief's open question about the three unsatisfiable needs: treat the long horizon as intended and score the gradient)

## A52. Use rolling need averages as income insurance
- **Source:** `lockstate_economy_progression_mechanisms.md` — "15. Hygiene and recreation as income insurance"
- **Mechanic:** Instead of making the three long-horizon needs satisfiable, grant a small bonus to retained state income while their rolling average stays below a threshold, and apply a sharper withholding penalty when it exceeds it. Display the rolling averages and the effect on the next payment.
- **Reuses:** the existing withholding schedule (300 down to the 60 floor), the six needs, `shower-room`, `common-room`, `yard`, regime blocks, the per-prisoner-day income line.
- **Player now optimises:** the cheapest marginal improvement to population quality — a yard expansion can beat another cell even though it produces no occupancy.
- **Accepted cost:** stated — a second-order income calculation, and players may chase averages rather than visible individual outcomes.
- **Build size:** small — rolling aggregates plus an income modifier; no new room.
- **Status:** NEW (modifies decision 1's withholding schedule at the edges)

## A53. Give each prisoner a small case plan that pays on release
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "6. Sentence-scaled case plans with release payments"
- **Mechanic:** Each prisoner gets a small deterministic case plan at admission, scaled to sentence length and risk tier: complete N classroom ticks, complete N valid work ticks, reach release with no contraband, avoid involvement in an incident during the final day, improve a selected need trajectory. On release the state pays a one-off outcome amount for completed objectives. Two or three objectives maximum; partial completion visible but payment discrete enough that choices matter.
- **Reuses:** prisoner records, sentence length, risk tier, regime actions, classrooms and work rooms, contraband, incidents, needs, release, Treasury, existing event handling.
- **Player now optimises:** which prisoners get scarce room time and how the regime is allocated — "individual prisoners finally differ in economically relevant ways"; a short sentence is attractive for quick outcomes, a long one supports a bigger plan but ties up a place.
- **Accepted cost:** stated — per-prisoner tracking that can feel like a task list; derive objectives from existing events and never require a room the prison could not plausibly build in time.
- **Build size:** medium — D1 rates **M**: plan generation, event counters, release evaluation, save migration, prisoner-detail panel.
- **Status:** NEW

## A54. Pay a large release grant for a prisoner who leaves with no unmet needs
- **Source:** `lockstate_mechanism_design.md` — "The Release Grant (A Second Axis to Scale)" (offered as its least-sure/most-interesting idea)
- **Mechanic:** When a sentence completes, if the prisoner leaves the map with **zero unmet needs**, the prison receives a lump sum — **e.g. 5,000 minor units**. The document's stated ambition: it turns the three hard-to-satisfy needs from a bug into a high-score target and makes a tiny "boutique" prison of five perfectly-rehabilitated prisoners a viable alternative to a large facility on the 300/day drip.
- **Reuses:** sentence completion and release, the six needs, Treasury, the threshold-grant payout path.
- **Player now optimises:** whether to run few prisoners well or many prisoners cheaply — a genuine second axis against population.
- **Accepted cost:** stated — "it requires players to care about individual prisoners leaving, which might clash with the macro-management feel of threshold grants and scale". **My reading:** zero unmet needs at release is close to unreachable given the brief's own numbers (hygiene 10,200, recreation 13,600, safety 20,400 ticks of provision against sentences that are often a few thousand ticks), so at a strict threshold the grant would almost never pay; it needs A51's trajectory scoring or a much looser condition to function at all.
- **Build size:** small — a release-time check and a payment.
- **Status:** NEW

## A55. Offer earned remission for well-kept prisoners
- **Source:** `lockstate-economy-progression-mechanisms.md` — "15. Release timing and earned remission"
- **Mechanic:** A prisoner with sustained low unmet needs and no recent incidents becomes eligible for accelerated release. The player can support remission through education and work. Release removes the daily income but may unlock a completion bonus or reduce claim/compliance exposure.
- **Reuses:** sentence lengths, needs, incidents, `classroom`, work blocks, the prisoner exit flow.
- **Player now optimises:** maximum occupancy versus faster turnover with lower risk and a freed admission slot.
- **Accepted cost:** stated — it conflicts directly with per-place income if the bonus is too high; keep the bonus modest so release is not always optimal.
- **Build size:** medium — an eligibility accumulator, an exit reason, a small settlement.
- **Status:** NEW

## A56. Post a refundable state bond per prisoner, settled at exit
- **Source:** `lockstate-economy-progression-mechanisms.md` — "2. Need-compliance bonds" (its least-sure/most-interesting idea)
- **Mechanic:** On admission each prisoner creates a refundable state bond. It is repaid when the prisoner leaves, with deductions for accumulated unmet-need bands, unresolved incidents and a missing classification review. The existing per-need withholding is unchanged. Capped deductions; the bond is a state accounting device, not a profit source. The document recommends prototyping it as a **report-only ledger with no treasury effect first**, then measuring whether it creates decisions before making it monetary.
- **Reuses:** the six needs, admission and exit, incident records, risk tiers, Treasury transactions.
- **Player now optimises:** fast throughput versus retaining prisoners whose needs can be stabilised — "a prisoner is no longer just a unit of daily income; their eventual liability matters".
- **Accepted cost:** stated — it makes release financially painful and could encourage exploitative detention; humane play may come to feel like financial liability.
- **Build size:** medium — a per-prisoner ledger, exit settlement, a compact report. No new simulation subsystem.
- **Status:** NEW

## A57. Pay the prison to keep beds deliberately empty
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "29. Emergency reserve-capacity contracts" (its least-sure/most-interesting idea)
- **Mechanic:** The state occasionally offers a short contract to keep a stated number of valid beds **empty** and their security sector at least adequately covered for a fixed window, representing emergency transfer capacity. Payment comes at the end, only if the places stayed empty and valid. Using a reserved place forfeits the reward; it does not add a fine. Contract value must sit between the foregone low-risk income and the expected cost of overexpansion so the choice is real.
- **Reuses:** valid bed capacity, occupancy, security sectors, coverage, day and tick timing, contract records, Treasury, the HUD.
- **Player now optimises:** deliberate slack — "a direct second axis against the current incentive to fill every bed: empty capacity can be valuable, but only when the player accepts a time-bounded opportunity cost".
- **Accepted cost:** stated — it may feel administratively artificial and can collapse into an obvious yes/no expected-value calculation; offers must be occasional, visible well in advance, and varied by duration and sector. The document adds a full failure analysis: below normal income nobody takes it, above normal income the solved strategy is warehouses of empty beds.
- **Build size:** small — D1 rates **S**: contract state, reserved-place counting, validation, payment, one Overview card.
- **Status:** NEW

## A58. Open periodic prisoner transfer windows
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "30. Limited prisoner transfer windows"
- **Mechanic:** At periodic deterministic windows the state offers to transfer one prisoner or a small batch out, or asks the prison to accept a named risk/sentence profile. Sending a prisoner out may cost a fee or surrender their pending case-plan payment; accepting an unwanted transfer pays a signing amount. Injured prisoners and prisoners in an active incident cannot be exported, and outbound transfers are quota-limited.
- **Reuses:** prisoner records, risk tiers, sentence length, admission/release movement, incidents, injuries if built, Treasury, named RNG, contract UI.
- **Player now optimises:** population composition and recovery from a bad intake mix — a controlled way to trade future revenue for immediate safety or capacity.
- **Accepted cost:** stated — it encourages dumping every difficult prisoner and weakens continuity; quotas, transfer fees, crisis ineligibility and loss of pending rewards keep it a correction rather than an erase button.
- **Build size:** medium — transfer offer and state, eligibility checks, removal/arrival path, financial settlement, UI.
- **Status:** NEW

## A59. Choose a prison charter at new game
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "28. A prison charter that changes starting incentives, not available rooms"
- **Mechanic:** One charter chosen at new game. `Growth` weights threshold grants more heavily but applies stricter overcrowding certification; `Care` increases case-plan and release rewards and the value of care certification; `Secure Custody` offers more high-risk intake contracts and stronger risk premiums but higher coverage requirements. **The charter changes formulas and offer weights only; every room stays buildable.** Show concrete modifiers, provide a neutral default, allow one early change before the first major threshold.
- **Reuses:** new-game state, threshold grants, intake offers, risk tiers, case plans, certifications, existing economy formulas.
- **Player now optimises:** a coherent strategy across a whole run — "sessions stop being identical without adding a meta-currency or research tree".
- **Accepted cost:** stated — one charter can become objectively best, or lock a new player into a choice they did not understand.
- **Build size:** small-to-medium — D1 rates **S–M**, and only after the affected mechanics exist; the record is trivial, the balance and explanation are the work.
- **Status:** NEW (answers the brief's "each prison starts identical" without persistence or unlocks)

## A60. Repay loans as a share of future positive income
- **Source:** `lockstate_economy_progression_mechanism_design.md` — "24. Loans repaid as a share of future positive income"
- **Mechanic:** A loan pays cash immediately and is repaid by diverting a **fixed percentage of positive incoming state payments, grants and contract rewards** until principal plus a fixed fee is cleared. It deliberately creates no fixed daily payment that could push an already insolvent prison deeper. Limit to one ordinary loan plus one clearly expensive emergency refinance. Show remaining principal, total fee, and the fraction of the next payment that will be diverted.
- **Reuses:** Treasury, state-payment events, grants, the day boundary, the decided loan system, the status strip.
- **Player now optimises:** timing and size — borrowing early accelerates expansion but permanently taxes the income that expansion creates; borrowing late preserves cash flow but may allow degradation first.
- **Accepted cost:** stated — revenue-share debt feels nearly free when income is low and can linger a long time; use a fixed fee, a maximum duration after which the diversion rate rises, and no compounding formula that hides the cost.
- **Build size:** small — D1 rates **S**: loan record, inflow interception, command and UI, save migration.
- **Status:** ALREADY DECIDED (loans) — the contribution is the repayment *shape*, argued as the only one that does not recreate a loss condition by arithmetic

## A61. Set loan terms and limits from operating quality or asset value
- **Source:** `lockstate_economy_progression_mechanisms.md` — "12. Loan terms based on operating quality"; `Lockstate_economy_progression_proposals.md` — "19. Pożyczki zabezpieczone infrastrukturą"; `lockstate-economy-progression-mechanisms.md` — "Loans should be offered in tiers" (in its decisions section)
- **Mechanic:** Loan principal and interest depend on the recent incident rate, occupancy versus safe capacity, and wage arrears: a stable prison gets cheap credit, a chaotic one expensive credit or no offer at all. Repayment is a fixed daily deduction, with arrears if unpaid (D2). D5's variant sets the **debt ceiling from the value of built infrastructure**. D3 proposes tiers: a small emergency facility first, gated on beds, recent state income and no severe compliance failure, larger loans only on a stable operating record.
- **Reuses:** the negative-treasury state, wage arrears, incidents, capacity, day-boundary billing, build costs, the decided loan mechanism.
- **Player now optimises:** when to borrow and whether to stabilise before borrowing — loans become a recovery tool rather than a way to accelerate every build.
- **Accepted cost:** D2 — variable rates can create a death spiral; protect recovery with a small emergency loan at a high but bounded rate and prevent repeated refinancing. D5 — more financial complication.
- **Build size:** medium — offer calculation, repayment ledger, HUD debt line.
- **Status:** ALREADY DECIDED (loans) — note the direct conflict with A60: D2's fixed daily deduction is exactly the amortisation shape D1 argues recreates a loss condition

## A62. Replace loans with a state bailout that permanently caps income
- **Source:** `lockstate_mechanism_design.md` — "3. Contradicting a 'Decided' Constraint"
- **Mechanic:** Instead of a loan, the state clears the negative balance and delivers emergency planks, but the prison's state income is **permanently capped at 250 instead of 300 for that save file**. It gets the player unstuck and leaves a permanent, visible scar on their progression.
- **Reuses:** Treasury, the per-prisoner-day income rate, material delivery.
- **Player now optimises:** avoiding the bailout at all — and, after taking one, running a permanently less profitable prison, which the document treats as the interesting state.
- **Accepted cost:** NOT STATED BY SOURCE. **My reading:** a permanent rate cap is irreversible progression damage in a game with no loss condition, so a player who takes two bailouts early may be better off restarting — which reintroduces by the back door the session-ending the "insolvency is a state" decision exists to prevent.
- **Build size:** small — a per-save income multiplier, a bailout command, one alert.
- **Status:** NEW — explicitly offered as a *replacement* for the decided loans (see Part 2, challenges)

## A63. Let classroom time reduce future incident probability
- **Source:** `Lockstate_economy_progression_proposals.md` — "11. Edukacyjne redukcje ryzyka"
- **Mechanic:** Time spent in the `classroom` during education blocks lowers the chance of future incidents for that prisoner. Stated in two lines; no rate, threshold or decay is given.
- **Reuses:** `classroom`, regime education blocks, the incident system.
- **Player now optimises:** whether to spend the ~1,000 daily work/education ticks on education (stability later) or work (income now) — a real trade-off, but the document gives no numbers, so as written it is a direction rather than a mechanism.
- **Accepted cost:** stated — "the effect is deferred", so the player cannot read the feedback loop immediately.
- **Build size:** small — a per-prisoner education counter feeding the incident weight.
- **Status:** NEW (vague as written)

## A64. Give the unread object capabilities narrow local effects
- **Source:** `lockstate_economy_progression_mechanisms.md` — "19. Capability contracts for inert objects"
- **Mechanic:** Attach narrow, measurable effects to the authored-but-unread capabilities: `security-console` improves incident detection in its room; `utility-panel` reduces delivery or build failure during outages; `medicine-cabinet` stores treatment supplies even before health simulation; `waste-bin` increases garbage capacity. Effects apply only when the corresponding dead room is active.
- **Reuses:** the `surveillance`, `utility-control`, `waste-disposal`, `medical-treatment` capabilities, room categories, object placement, HUD status.
- **Player now optimises:** which inert room/object pair to activate for the current bottleneck — the same 25,000 starting treasury can back security, logistics or operations rather than only beds and walls.
- **Accepted cost:** stated, and unusually candid — "capability effects without a full underlying system can feel like arbitrary modifiers"; limit it to bottlenecks that already have readers, and "do not pretend to model medicine without injuries".
- **Build size:** small — capability readers plus a small set of room-local modifiers.
- **Status:** NEW — but by the brief's rule 3 this is the weakest entry in the batch: as a set of unconditional local modifiers it changes a purchase decision only if the underlying systems in A24/A26/A28/A38 exist, at which point those entries already cover it

## A65. Carry a legacy mark or small bonus between prisons
- **Source:** `lockstate-economy-progression-mechanisms.md` — "20. Legacy objectives between prisons"; `Lockstate_economy_progression_proposals.md` — "20. Sieć więzień"
- **Mechanic:** A completed or abandoned prison records one deterministic legacy mark — maximum safe occupancy, lowest incident rate, fastest rehabilitation, or best material efficiency — and a new prison starts with one small modifier tied to the chosen legacy, explicitly **not direct money** (D3). D5's version is a small starting bonus derived from earlier successes. D3 offers a fallback: if persistence is unwanted, keep it as a local profile-only scoreboard with no mechanical bonus.
- **Reuses:** local IndexedDB saves, existing metrics and status data, the deterministic kernel, the future threshold/progression display.
- **Player now optimises:** pursuing different prison archetypes and replaying, rather than only making one prison larger.
- **Accepted cost:** D3 states it directly — "it creates meta-progression outside the stated 'nothing persists' decision". D5 — a partial departure from the full reset.
- **Build size:** small — end-state metric capture and profile display; the mechanical bonus is optional.
- **Status:** NEW (single-player and local-only, so on-brief; it answers thinness point 7, which the brief lists as a gap rather than a decision)

## A66. Give the prison a reputation that shapes the intake mix
- **Source:** `Lockstate_economy_progression_proposals.md` — "13. Reputacja więzienia"
- **Mechanic:** A hidden or visible indicator, driven by incidents, needs and classifications, that influences the inflow of prisoners of different types. Three lines total; no formula, no scale, no statement of which way the influence runs.
- **Reuses:** incidents, needs, classification, admission.
- **Player now optimises:** "quality versus scale", per the document — but with no stated direction of effect, this is a direction rather than a mechanism. A8's intake contracts are the implementable version of the same instinct.
- **Accepted cost:** stated — "another value to track".
- **Build size:** medium as scoped by the source; unimplementable as written.
- **Status:** NEW (vague as written)

## A67. Generate short operational objectives
- **Source:** `Lockstate_economy_progression_proposals.md` — "18. Regionalne cele operacyjne"
- **Mechanic:** Generated goals of the form "hold 20 medium-risk prisoners for 5 days", built from metrics the game already tracks. One line; no reward is stated.
- **Reuses:** existing metrics, risk tiers, the day boundary.
- **Player now optimises:** playing toward assigned tasks rather than open sandbox — but with no reward specified, the source does not establish that anything changes.
- **Accepted cost:** stated — "possible ignoring of the sandbox".
- **Build size:** small — a goal table plus an evaluator.
- **Status:** NEW (vague as written; A46 and A47 are the same idea with a defined reward and target)

---

## Part 2 — the meta

### Build-first orderings

**`lockstate_economy_progression_mechanism_design.md`** — 1. *Explicit overcrowding pressure and current-valid-place semantics*, "because every other population mechanic depends on the game telling the truth about capacity… Building any grant or contract on top of sticky resident assignments would institutionalise the exploit." 2. *Certified growth grants*, "because the economy currently has a demonstrated legal hard-lock and the owner has already selected threshold grants as the intended early escape"; once valid capacity is correct, certification can reward real expansion. 3. *The institutional service queue, delivered as one vertical slice* — "Do not attempt all nine rooms at once. Ship one end-to-end slice first: `arrival -> reception job -> holding/cell assignment`… Then add `purchase -> delivery bay -> storage -> build`", after which infirmary, waste, security office and utility become producers and consumers of a proven backbone "rather than six bespoke systems". It adds that `free-association` self-directed care is an independent XS change to run in parallel, not a dependency.

**`lockstate_economy_progression_mechanisms.md`** — 1. *Safe-capacity bonus and overcrowding pressure*, "because the accepted income decision explicitly requires an overcrowding counterweight, and the game already has every input… without adding a new UI family or economic resource." 2. *Construction-support work plus delivery-bay throughput*, "because it activates the most valuable complete dead mechanism: the tested job and logistics stack." 3. *Risk-tier contracts plus classification review* — "It should follow safe capacity so the game first teaches 'how many can I safely house?' before asking 'which prisoners should I accept?'"

**`lockstate-economy-progression-mechanisms.md`** — 1. *Regime congestion pricing*, "because it is the smallest mechanism that fixes the central economic contradiction: the state pays per occupied place while rooms and regimes can silently fail to serve those places." 2. *Delivery/logistics friction plus the prisoner work loop*, built together — "The project already owns the expensive machinery… but it currently has no reason for it to exist… It follows congestion pricing because production and logistics should not be added before room service has a meaningful constraint." 3. *Overcrowding through capacity licences and degradation*, "because it gives the accepted income model its missing counterforce and makes insolvency legible rather than terminal", with the degradation ladder implemented alongside.

**`lockstate_mechanism_design.md`** — 1. *The Processing Choke-point (Reception)*, "because it immediately solves 'nine rooms do nothing' by giving two of them a critical economic function… and costs almost nothing to build since admission and contraband systems already exist." 2. *Risk-Tiered Income & The Medical Pause (Infirmary)*, because it gives meaning to risk tiers, activates the infirmary, and financially punishes the incidents the simulation already produces. 3. *Physical Logistics (Delivery/Storage)* — "listed third only because integrating pathfinding with the global economy might surface edge-case bugs, whereas the first two are pure state-logic changes."

**`Lockstate_economy_progression_proposals.md`** — 1. *Overcrowding penalty*, "solves the problem identified in the ADR and immediately changes the optimum." 2. *Risk contracts*, "gives meaning to the existing risk tiers." 3. *Productive laundry*, "creates a second economic line with almost no new systems."

The orderings agree on a strong majority position: **fix the truth about capacity first** (four of five put an overcrowding/capacity/congestion mechanic first, D4 being the exception), then either activate the job system or make risk tiers pay. Only D1 puts the decided threshold grant in the top three, and it does so as a rescue-capital argument rather than a design one.

### Challenges to the decided list

**Decision 1 — per-prisoner-day, per occupied place.** All five challenge its boundary, none challenge its principle.
- D1: "keep the decision, change the definition of an occupied place… It must mean a prisoner currently backed by valid residency capacity at the payment calculation. Any risk premium should be a separate conditional line so the base formula remains legible."
- D2: "paying identically for every occupied place while needs withholding bottoms out at 60 means overcrowding can remain profitable even when the prison is visibly failing. Safe capacity or an incident-free reserve is not a betrayal of the decision; it is the missing consequence the decision itself calls for."
- D3: "paying for occupied places while three needs are physically impossible to satisfy and overcrowding has no penalty guarantees a scale-first optimum. Do not replace the line; add a service-quality multiplier or licensed-capacity rule."
- D5: "income purely per prisoner-day may remain the dominant strategy without strong overcrowding penalties."

**Threshold grants (decided, unbuilt).**
- D1: "directionally right, but not as unconditional evenly spaced payments. Indefinite raw thresholds eventually become a delayed per-head subsidy… Later thresholds should widen, grow sublinearly, or require stronger certification. The first threshold should remain very low and immediate because it has a different job."
- D3: "population-only thresholds can reward the exact overcrowding strategy the design says must be punished. Make later grants depend on *safe occupied capacity* or a recent compliance window… never pay a grant for a population count that is currently generating unresolved overcrowding debt."
- D5: "threshold grants are good, but on their own they do not create a lasting second axis of optimisation."

**The degradation ladder (decided, unbuilt).**
- D1 challenges its ordering directly: "`Deliveries refused -> construction halted -> staff unpaid` is dangerous if delivery refusal happens before the player can obtain the bed, door, or storage capacity needed to restore income. Degradation should distinguish optional new purchases from already-paid essential deliveries, and sell-back, loan access, and a minimal recovery path must remain available in every stage. Consequences should be explicit arrears categories, not a hidden global phase."
- D3: "The degradation ladder should begin before the player borrows."

**Loans (decided, unbuilt).**
- D4 rejects loans outright: "If the economy is tightly closed… and a player stalls with 0 cash and 0 planks, a loan does not 'keep insolvency honest' — it just delays the game-over by masking the player's negative cash flow. If they couldn't balance the books before, they won't balance them with a loan repayment attached." Its replacement is A62, the state bailout with a permanent 250 income cap.
- D1 accepts the decision but rejects the obvious implementation: "a conventional fixed payment recreates a loss condition by arithmetic. Revenue-share repayment preserves the stated design intent."
- D2: "The loan decision is correct only if loans are a recovery bridge. If stable prisons can borrow cheaply to accelerate expansion, the player's best strategy may become debt-funded growth."
- D3: "loans risk converting every bad decision into a painless bridge… A single unlimited loan is dangerous. Offer a small emergency facility first."

**Sell-back (decided, unbuilt).**
- D1: "instant global liquidation would undercut logistics… sell-back should be reverse logistics with an emergency fallback, not a teleporting cash button."
- D2 makes a timing point the others miss: "a safety valve that appears only after insolvency is too late. The player needs to understand liquidity risk before a legal purchase strands the prison. Show sell value in the purchase UI and include projected post-order cash."
- D3: "if every material can be liquidated immediately, construction becomes reversible and planning loses weight. Apply a delivery/restocking fee, a time delay, or a daily sell-back limit."

**Decision 3 — money primary, grants and prison labour secondary.** D1 qualifies it: "prison labour should pay for a completed choice, not existence. A passive amount per working prisoner would be another population subsidy."

**Decision 4 — prices are provisional.** D1 is the only document to push back: "acceptable for tuning, not for safety invariants. Exact prices can wait, but several inequalities cannot. The first grant must arrive before a plausible legal opening can hard-lock; a commissioning grant must pay less than the cost of farming it; a high-risk premium must not exceed the expected additional guard and incident burden by a wide margin; and sell-back plus loans must always leave at least one recovery route. Those are design invariants, not a later balance pass."

**Decision 5 — yard capacity from ground area.** D1: "no objection", with the follow-up that area-based capacity must participate in the same visible capacity and service-pressure calculations as object-based rooms. No other document mentions it.

**The undecided question the brief flags — three needs unsatisfiable within a sentence.** D2 demands a ruling: "If this is intentional, the game should reward reducing their rolling levels rather than demand full satisfaction. If it is a bug, any economy built on their withholding will encode the bug. I would not use individual contentment as a hard gate; use rolling averages." D1 answers it with A51 (trajectory scoring); D4 answers it the opposite way with A54 (a large payout for zero unmet needs at release).

**The classification-review eligibility defect.** D2: "If eight of fifteen sentence lengths can never be reviewed, classification review is not a strategic system but a partly random decoration… I would fix eligibility before adding complex review rewards." D1 makes the same fix a component of A9; D3 notes the eight "remain a bug unless review eligibility is corrected".

### Least-sure-but-most-interesting

- **D1 (`lockstate_economy_progression_mechanism_design.md`): emergency reserve-capacity contracts (A57)** — "the most interesting uncertain idea because it pays the player for doing the opposite of the game's dominant action: deliberately leaving valid, covered beds empty." It then argues against itself: "If the payment is below normal prisoner income, nobody takes it. If it is above normal income, the solved strategy is to build empty warehouses of beds and wait for contracts." Test as one rare, fixed-duration, non-rerollable contract with no refusal penalty. "The question is not whether it is realistic; the question is whether deliberate slack becomes a readable, tense alternative to permanent occupancy."
- **D2 (`lockstate_economy_progression_mechanisms.md`): free-association as a social-pressure valve (A12)** — "It gives a currently empty regime category a reason to exist and creates a real trade-off between work, education, and stability without requiring a full relationship or personality simulation. I am least sure because the brief contains no social-state model, and adding a new pressure meter could become a disguised 'counter that needs to move'." Safer version: derive pressure from existing unmet needs, incident history and recent association access. "If the resulting number predicts no meaningful decision, remove it."
- **D3 (`lockstate-economy-progression-mechanisms.md`): need-compliance bonds (A56)** — "They turn the existing 'unmet needs withhold income' rule into a temporal contract: the prison must eventually hand back a person in an acceptable state, so current occupancy income creates a future obligation… but it could also make humane play feel like financial liability. Prototype it as a report-only ledger first, without changing treasury, then measure whether it creates decisions before making it monetary."
- **D4 (`lockstate_mechanism_design.md`): the release grant (A54)** — a 5,000 lump sum for a prisoner leaving with zero unmet needs. "It turns those difficult needs from a bug into a high-score target… a player could build a tiny, hyper-luxurious 'boutique' prison that makes its money entirely off perfectly rehabilitating 5 prisoners at a time." Uncertain "because it requires players to care about individual prisoners leaving, which might clash with the macro-management feel of threshold grants and scale."
- **D5 (`Lockstate_economy_progression_proposals.md`): physical material logistics (A16)** — "The game already has a complete work and transport system that currently handles nothing. Once storage-room and delivery-bay are connected it could suddenly become a game about operational flows rather than only about building rooms. That is the biggest risk, but also the biggest chance of making the project distinctive."

### Quality note

Two of the five genuinely engaged with the brief. **`lockstate_economy_progression_mechanism_design.md` (D1) is the strongest document in the batch by a wide margin** — it sized every mechanism on its own XS/S/M/L scale, named a specific accepted cost for each, argued the ordering as a dependency chain rather than a preference list, challenged four of the five recorded decisions with reasons that engage the decisions' own stated rationale, and was the only document to reject "prices are provisional" and to catch that the decided degradation ladder's ordering can remove the tools needed for recovery. **`lockstate_economy_progression_mechanisms.md` (D2) and `lockstate-economy-progression-mechanisms.md` (D3) are both solid** — twenty mechanisms each, real accepted costs, and both independently converged on safe-capacity/licensed-capacity as the missing counterweight to decision 1; D2's insistence that sell-back must be visible in the purchase UI *before* insolvency, and D3's demand that inspection sampling be deterministic so reloads cannot change the outcome, are the kind of details that show the brief was actually read.

**`lockstate_mechanism_design.md` (D4) is short but not generic** — six mechanisms, and its reception choke-point (1% contraband, 600 ticks, no income until processed) and sleep audit are among the most concretely implementable things in the batch; its weakness is that it states no downside for its own loan replacement and its release grant is arithmetically near-impossible against the brief's own tick numbers. **`Lockstate_economy_progression_proposals.md` (D5) is the generic one.** It is twenty three-line stubs in the shape of the requested format, with most of the shape and none of the substance: "reputation of the prison — a hidden or visible indicator", "regional operational goals", "staff room and morale" with no rate, threshold or direction of effect. It does contribute two usable numbers (the 300/380/500 risk ladder) and one genuinely good instinct in its least-sure answer, but roughly two-thirds of it is a prison-game feature list that could have been written without reading the brief at all.

### On OFF-BRIEF

**Zero entries in this batch are off-brief.** No document in batch A proposes multiplayer, player-to-player trading, clans, auctions, live-service seasons, accounts, or a server-authoritative economy. The closest approach is A65 (legacy marks carried between prisons), which is single-player and satisfied entirely by local IndexedDB, and which the brief itself invites under thinness point 7. D2 cites external prison-management games as precedent (`[web:4][web:6][web:10]`) but explicitly warns against copying their feature list.
