# Batch C — mechanism extraction

Sources read in full:
- `deepseek_markdown_20260829_e2ce03.md`
- `Lockstate #U2014 model faucet & sink dla fazy 3.md` (Polish)
- `Lockstate_economy_and_progression_design_search.md`
- `lockstate-economy-progression-design.md`

Short source labels used below: **DS** = deepseek_markdown_20260829_e2ce03.md; **FAZA3** = Lockstate — model faucet & sink dla fazy 3.md; **SEARCH** = Lockstate_economy_and_progression_design_search.md; **LEPD** = lockstate-economy-progression-design.md.

---

## Part 1 — the mechanisms

## C1. Pay per-diem by risk tier
- **Source:** DS — "1. Risk-based per-diem funding"; SEARCH — "3. Risk-tier contracts"; LEPD — "2. Risk-tier contracts". (FAZA3's version is kept separate as C21 because it pays a capped flat premium rather than a tier rate.)
- **Mechanic:** The state's per-prisoner-day payment varies by the risk tier already assigned at admission: low-risk **200/day**, medium-risk **300/day** (today's baseline), high-risk **450/day**. The multiplier goes inside the existing per-prisoner per-diem loop, after (or before) the 40-per-unmet-need withholding. The tier is surfaced in the intake queue so the player can accept or reject an individual arrival on the basis of it.
- **Reuses:** Risk tiers (assigned at admission, stored per prisoner, currently read by almost nothing); the per-prisoner-day income line and its existing per-prisoner loop; classification review; the status strip.
- **Player now optimises:** Risk mix rather than headcount. "How many can I pack" becomes "what kind of prison am I running" — a high-risk intake pays 1.5× but draws more incidents, more contraband and more guard wage; low-risk is stable but grows slowly.
- **Accepted cost:** Stated by DS: high-risk-only prisons get more incidents, contraband and staff cost; low-risk-only prisons grow slower. Not stated, and worth naming: an intake *reject* button is a new command surface and needs a refusal path, and if rejection is free the player simply farms high-risk arrivals until the incident system bites.
- **Build size:** Small — one multiplier in an existing loop plus a tier column in the intake UI; DS estimates 1–2 days and "no new systems."
- **Status:** NEW
- **Where the sources differ:** DS pays a *daily rate* by tier (200/300/450). SEARCH pays **a one-off intake payment**, or lets a high-risk prisoner **count more strongly toward a designated threshold grant**, rather than changing the daily rate at all. LEPD pays **both** a one-off bonus and a daily rate, displays "an estimated security burden beside each offer", and adds a **clawback**: the higher tier pays only while its required coverage and incident rate stay within contract limits, and a breach either claws the bonus back or expires the contract. SEARCH warns the bands must "trade cash against predictable operational burden rather than label one band better"; LEPD names the same failure as "a dominant high-risk strategy if the premium is too generous". LEPD sizes it at 2–4 days, SEARCH at low-to-medium.

## C2. Workshop production sold to a market
- **Source:** DS — "2. Workshop production income"
- **Mechanic:** A new `workshop` room type (zoned with the existing room system) where prisoners routed by the `work` regime block generate one "production unit" per tick worked. Units accumulate in the room, are carried by the job system to a `delivery-bay`, and are sold in batches. Price moves on "a simple sine wave or random walk" visible to the player.
- **Reuses:** The entire job system — job board, workers, containers, carry legs, reservations, pathfinding — by finally binding a room instance to a container; the `work` regime block; `delivery-bay` and `storage-room` become logistics nodes.
- **Player now optimises:** Throughput against security, and floor layout — placing storage and delivery near the workshop to cut travel time. Also creates the second income line decision 3 says should exist.
- **Accepted cost:** Workshop time is time not spent on needs, so need decay bites harder; productive prisoners become extortion/theft targets; market fluctuation makes the income non-guaranteed.
- **Build size:** Medium-to-large — DS says 3–4 days: new room type, room→container binding, production accumulator, price model, job hookup. The room→container binding is the load-bearing part and is the thing nobody has done yet.
- **Status:** NEW

## C3. Composite prison reputation score
- **Source:** DS — "3. External reputation score"
- **Mechanic:** A 0–100 reputation recomputed at the existing day boundary from incidents (negative), contraband outcomes (positive if searched and destroyed, negative if smuggled in), need satisfaction (positive), deaths (negative), escapes (negative). Reputation then modulates funding rates, grant availability, prisoner behaviour and incident probability. HUD shows the score plus its breakdown.
- **Reuses:** Incident records (which already carry an entity id), the contraband and sweep system, the six needs, the day boundary where wages are already billed, the status strip's existing incident and contraband counters.
- **Player now optimises:** Quality as a separate axis from quantity — a meta-resource that is slow to build and fast to lose ("one riot can wipe out weeks"). But note: the document gives no weights, no curve, and no numbers at all for how reputation converts into funding, so as written it is a scaffold, not a mechanism.
- **Accepted cost:** Reputation forces continuous investment in security, needs and contraband control, all of which cost money and staff time.
- **Build size:** Medium — DS says 2–3 days for an accumulator, an Overview display, and hooks into funding and grant eligibility. The unbounded part is every system it then modulates.
- **Status:** NEW

## C4. Route admissions through the reception room
- **Source:** DS — "4. Reception processing"; SEARCH — "5. Reception as admission bottleneck and intake buffer"
- **Mechanic:** New arrivals land in `reception` and must be processed before cell assignment. Processing time is proportional to prisoner count and reception staffing; processing quality modifies the prisoner's initial need states and the existing 10–20% contraband chance. No reception, or an under-staffed one, means arrivals start with worse needs and more contraband.
- **Reuses:** `reception`, one of the nine dead rooms; the admission pipeline; the contraband-at-admission roll; the job system to move prisoners through.
- **Player now optimises:** Throughput against thoroughness — a fast, thin reception admits quickly but with contraband risk; a thorough one costs staff and lets needs decay in the queue. Backlogs become a visible cause of later incidents.
- **Accepted cost:** Reception costs space, staff and time; prisoners waiting decay; a backlog produces incidents later.
- **Build size:** Medium — DS says 2–3 days: a processing state on arrival, routing, a per-prisoner timer, and modifiers on contraband and starting needs. SEARCH says medium: "route admissions through a queue plus simple processing commands."
- **Status:** NEW
- **Where the sources differ:** SEARCH is much sharper about the economics — arrivals land in `reception` **or `holding-cell`** and **generate no occupied-place payment at all until processed, classified, searched and assigned**, and a staffed reception processes a bounded number per day while a growing queue raises contraband and incident risk. That makes intake a throughput decision with a direct income consequence rather than a needs modifier. SEARCH also names the onboarding hazard DS misses: the starting map must include a tiny valid reception path or the first intake needs a grace period.

## C5. Infirmary treats incident injuries
- **Source:** DS — "5. Infirmary health treatment" (SEARCH's deliberately smaller variant is C59)
- **Mechanic:** Prisoners injured in assault, riot or escape-attempt incidents acquire a health state and are carried to the `infirmary`, where treatment consumes time and medical supplies held by `medicine-cabinet` objects. Untreated injuries worsen toward death or long-term debilitation; treated prisoners recover faster and "are less likely to re-offend."
- **Reuses:** `infirmary`, `medical-bed`, `medicine-cabinet` and the unread `medical-treatment` capability; the incident system's already-recorded injured entity id; the job system for carrying; the needs system (DS offers either the existing hygiene need or a new health need — it does not choose).
- **Player now optimises:** Healthcare capacity against incident rate — how many medical beds and how much medicine to hold against a riot every two days. Deaths become an economic event, not just a text line.
- **Accepted cost:** Space, staff and a new purchasable material; over-investing is dead money in a well-run prison; untreated injuries cost income and reputation.
- **Build size:** Large — DS says 4–5 days. NEW SUBSYSTEM: a prisoner health/injury model, which the brief states does not exist in any form. Everything else is reuse.
- **Status:** NEW

## C6. Recycle waste into brick and plank
- **Source:** DS — "6. Garbage recycling" (SEARCH's non-recycling variant is C55)
- **Mechanic:** The prison generates waste at a rate proportional to prisoner count; waste accumulates in the `garbage-room`; prisoners assigned there via the job system convert it at roughly **10 waste → 1 brick, 15 waste → 1 plank**. The conversion rate is visible and "can be upgraded through investment" (the upgrade path is not specified).
- **Reuses:** `garbage-room` (dead room), the `waste-disposal` capability nothing reads, `waste-bin`, the job system, the brick/plank material inventory, and the decided sell-back so recycled material has cash value.
- **Player now optimises:** Whether to spend prisoner labour and floor space on recycling or simply buy at 40/65. Adds a second, population-scaled materials faucet — and, usefully, ties an ongoing *cost* to population (waste that must be handled) which is a candidate overcrowding punishment.
- **Accepted cost:** Recycling consumes prisoner work time and space, and the conversion rate is deliberately inefficient enough that buying is sometimes correct.
- **Build size:** Medium — DS says 2–3 days: waste generation per prisoner-day, processing in the room, conversion, inventory hookup.
- **Status:** NEW

## C7. Storage rooms raise inventory cap and cut delivery time
- **Source:** DS — "7. Storage logistics"; LEPD — "17. Facility commissioning milestones" (storage-room role)
- **Mechanic:** Each `storage-room` raises the maximum material inventory and shortens the 100-tick delivery time; bulk orders become available (cheaper per unit) only with enough storage. Without storage, inventory is capped and deliveries are slow.
- **Reuses:** `storage-room` (dead room), the `item-storage` capability, the purchase/delivery pipeline with its 100-tick lead time, the job system for delivery-bay→storage→site carries.
- **Player now optimises:** Supply chain depth — how much capital to sink into storage against material unit price and construction delay. It also indirectly patches the "625 bricks bankrupts you" defect by capping how much material a player can hold at once.
- **Accepted cost:** Storage costs space and construction, does not earn, and stored material is only refundable at a loss under the decided sell-back.
- **Build size:** Medium — DS says 2–3 days.
- **Status:** NEW

## C8. Utility rooms slow need decay by coverage
- **Source:** DS — "8. Utility management" (the throughput-budget alternative from SEARCH and LEPD is C54)
- **Mechanic:** Each `utility-room` projects "utility coverage" over nearby rooms; covered rooms decay hygiene and bladder (and any future temperature need) more slowly. No coverage means faster decay.
- **Reuses:** `utility-room` (dead room), the `utility-control` capability nothing reads, the per-tick need decay rates, room zoning for the coverage area, and a HUD overlay.
- **Player now optimises:** Infrastructure against population — utilities become a hard gate on how large a prison can be run at a given need-satisfaction level, which is a direct route to punishing overcrowding.
- **Accepted cost:** Utility rooms cost space and construction and earn nothing directly; skipping them is cheap but raises incidents.
- **Build size:** Medium-to-large — DS says 3–4 days, and the coverage-area computation plus an overlay is the expensive half. Note the proposal names no coverage radius and no decay multiplier, so the numbers are absent.
- **Status:** NEW

## C9. Delivery bays gate order size and speed
- **Source:** DS — "9. Delivery bay efficiency"
- **Mechanic:** Each `delivery-bay` raises the maximum order size and lowers delivery time. With no bay, only small orders (DS's example: 100 units) are possible and they arrive slowly; several bays allow larger, faster deliveries.
- **Reuses:** `delivery-bay` (dead room), the `delivery-access` capability and `loading-dock-door` object, the 100-tick delivery timer, the purchase UI.
- **Player now optimises:** How much logistics capital to hold against growth rate. Like C7, this is also a structural fix for the 625-brick suicide purchase: with no bay you physically cannot spend the whole treasury in one order.
- **Accepted cost:** Bays cost space and construction and earn nothing; too few bays throttle growth.
- **Build size:** Small — DS says 1–2 days. Substantially overlaps C7; they should be designed as one logistics layer, not two.
- **Status:** NEW

## C10. Make classification review move the risk tier
- **Source:** DS — "10. Classification review bonuses"; SEARCH — "4. Classification review as capacity-conversion event"; LEPD — "15. Classification review as a capacity valve"
- **Mechanic:** The already-scheduled classification review reads the prisoner's behaviour and moves the tier: improved behaviour lowers the tier (lower funding, lower incident risk, "unlocks rehabilitation bonuses" — unspecified), worsened behaviour raises it (higher funding, higher incident risk). The player can also request a review, which costs staff time.
- **Reuses:** Classification review (scheduled globally, eligible per record) and risk tiers; the incident system as the behaviour signal; whatever pays out per tier — this is a dependency on C1, without which the tier change has no economic meaning.
- **Player now optimises:** Rehabilitation against income — deliberately keeping a prisoner high-risk for the money, or reviewing them down for a quieter prison.
- **Accepted cost:** Reviews cost staff time; the outcome cuts one way or the other and the player must choose which they want.
- **Build size:** Medium — DS says 2–3 days; SEARCH says low "after defining review criteria"; LEPD says 2–5 days.
- **Status:** NEW
- **Where the sources differ:** DS treats it as an income lever. SEARCH makes a successful review reduce the prisoner's **sector load for incident weighting** and possibly pay a placement bonus — a capacity conversion, not a rate change. LEPD makes it free **a high-security place** for reuse. All three notice what DS did not: SEARCH says the eight-of-fifteen unreviewable sentence lengths become "highly visible" and calls that "good diagnostic pressure, but it must be corrected or surfaced as a deliberate short-sentence rule"; LEPD is blunter — show "not eligible" so the player can plan around it, because "hidden non-interaction makes risk tiers look like decoration".

## C11. Sell seized contraband instead of destroying it
- **Source:** DS — "11. Contraband black market" (also DS's own least-sure-most-interesting pick)
- **Mechanic:** Each seized contraband item offers two actions: destroy (safe, no income) or sell (income, raises gang-retaliation probability and costs reputation if discovered). Contraband carries a per-type value. A "contraband sales" statistic tracks the income.
- **Reuses:** Contraband introduced at admission at 10–20%, the recent search/sweep duty, gang-retaliation as an existing incident type, and the reputation score from C3 if it exists.
- **Player now optimises:** Contraband stops being a binary nuisance and becomes a priced resource: "is this one worth selling?" — with the perverse and interesting consequence that the player may start *wanting* contraband to arrive.
- **Accepted cost:** DS names it plainly, including the risk that the mechanic is tonally wrong for the genre and that it trivialises contraband by making the player want more of it.
- **Build size:** Small — DS says 1–2 days: a sell action, per-type values, a retaliation probability term, a reputation penalty.
- **Status:** NEW

## C12. One-off grant on education completion
- **Source:** DS — "12. Education completion grants"
- **Mechanic:** A prisoner who completes an education programme in the `classroom` triggers a one-off grant, larger for longer programmes. Requires a classroom, an `education` regime block, and prisoner attendance; completion is tracked per prisoner.
- **Reuses:** `classroom` (already routed), the `education` regime category, and the threshold-grant payment machinery once it exists.
- **Player now optimises:** Education against work capacity, since both compete for the same ~1,000 ticks of work/education time per day. This is the clearest use the batch offers for the `education` category, which currently routes prisoners somewhere that pays nothing.
- **Accepted cost:** Education time is time not earning work income; classrooms cost space; the payment is lumpy rather than a steady line.
- **Build size:** Medium — DS says 2–3 days. DS gives no programme length and no grant size, so the balance is entirely undefined.
- **Status:** NEW

## C13. Work release for prisoners with a clean work record
- **Source:** DS — "13. Work release bonuses"
- **Mechanic:** A prisoner who works productively for a run of days (DS's example: **10 consecutive work days with no incidents**) becomes eligible for work release. The player approves or denies each application. Approved prisoners earn income from their labour and have their sentence shortened, so they leave early and free the cell.
- **Reuses:** Work regime blocks, the job system, per-prisoner sentence length, classification review as the eligibility carrier.
- **Player now optimises:** Prisoners become assets with a record, not interchangeable revenue units — and the player faces a genuinely two-sided choice, because approving release trades per-diem income for a freed place and labour income.
- **Accepted cost:** Named: releases shorten sentences and therefore cut per-diem income, and more freedom raises incident risk; approve too many and the prison empties.
- **Build size:** Medium-to-large — DS says 3–4 days. Depends on a labour-income line existing first (C2), otherwise "income from their labour" has nothing to read.
- **Status:** NEW

## C14. Score recreation quality from objects present
- **Source:** DS — "14. Recreation quality investment"
- **Mechanic:** Each `common-room` gets a recreation-quality score derived from the objects in it (bench, bookshelf, dining-table, chair) and its area; a higher score slows recreation-need decay more. The score is shown per room.
- **Reuses:** `common-room`, the recreation need (one of the three that cannot be satisfied inside a normal sentence), the twenty objects, the room-zoning capacity derivation, the `recreation` regime block.
- **Player now optimises:** Furniture density per prisoner rather than just room existence — the first thing in the batch that gives the object list a reason to have more than one entry per function. It is also the cheapest lever against the "recreation needs 13,600 ticks" problem.
- **Accepted cost:** Objects cost materials; over-furnishing may not pay off if prisoners rarely reach the room.
- **Build size:** Small — DS says 1–2 days: a per-room score, a decay multiplier, a display.
- **Status:** NEW

## C15. Player-drawn guard patrol routes
- **Source:** DS — "15. Patrol routes as security" (SEARCH's decision-respecting variant is C48)
- **Mechanic:** The player draws patrol routes across the prison and assigns guards to them; patrolled areas carry a lower incident probability, and coverage is shown on the security map. Guards on patrol are unavailable for other duties. DS explicitly proposes to "remove the skip on the default security sector."
- **Reuses:** The security sector system with its deployment, coverage and post assignment; the existing HUD reading `0 of 2 / Unguarded` → `2 of 2 / Covered`; the patrol system that already exists but skips the derived default sector; pathfinding.
- **Player now optimises:** Coverage per guard — where guards physically are, not just how many were hired. Against a prison that riots every two days even at full coverage, this is the only lever in the batch that gives coverage a spatial meaning.
- **Accepted cost:** Patrolling consumes guard time that response and searches would otherwise get.
- **Build size:** Medium — DS says 2–3 days, but the route-drawing UI is new surface and DS underestimates it.
- **Status:** CONTRADICTS DECISION (unnumbered) — the brief states the derived default security sector carrying no patrol route is "a deliberate consequence of an accepted decision, not an oversight." DS proposes removing exactly that skip without acknowledging the decision exists.

## C16. Gate threshold grants on quality conditions
- **Source:** DS — "16. Capacity bonuses with quality requirements"; SEARCH — "1. Accredited capacity grants"
- **Mechanic:** The decided threshold grants (10, 25, 50, 100 …) pay only if quality conditions hold at the moment of crossing: DS's examples are every prisoner at **at least 4 of 6 needs satisfied**, **no incidents in the last 3 days**, and contraband below a threshold.
- **Reuses:** The decided threshold grant as the base; the six needs; the incident log; the contraband counter.
- **Player now optimises:** Growth that is sustainable rather than growth per se — packing without meeting needs forfeits the payment, which is a direct answer to decision 1's unmet consequence.
- **Accepted cost:** Stated: strict conditions mean a fast grower simply misses the money. Not stated, and it matters: this collides with the owner's ruling that the **first threshold be very low so the payment arrives before a new player can strand themselves** — a quality gate on the first threshold is precisely the case where a struggling player fails the gate and gets nothing. The gate should start above the first threshold if built at all.
- **Build size:** Small — DS says 1–2 days: condition checks plus a requirements/progress panel. SEARCH says low-to-medium: "an eligibility predicate plus alert text."
- **Status:** NEW (a rider on the decided threshold grant; partially conflicts with the "first threshold very low" intent)
- **Where the sources differ:** SEARCH's conditions are structural rather than statistical — the crossed threshold must be supported by **accredited capacity**: every resident has a valid bed, the relevant security sector is covered, and there are no unresolved active incidents. It also solves the objection I raised against DS's version by exempting the start explicitly: "the first low threshold remains a rescue payment; later thresholds require an operating prison, not just assigned records." SEARCH names the cost DS does not: players "can feel cheated when a riot or uncovered sector delays a grant they believed they had earned", so the HUD must show which accreditation condition failed.

## C17. Pay a bonus when a sentence completes well
- **Source:** DS — "17. Sentence length completion bonuses"
- **Mechanic:** A prisoner who serves out their sentence generates a completion bonus scaled by sentence length and by need satisfaction at release. A long sentence (the existing **200,000-tick** long-sentence threshold) served with needs met pays a large bonus; an early exit or an unmet-needs release pays nothing.
- **Reuses:** Per-prisoner drawn sentence lengths and the 200,000-tick classification threshold; the six needs; the existing release path; the day-boundary payment machinery.
- **Player now optimises:** Retention quality — an incentive orthogonal to both per-diem (pays for headcount) and threshold grants (pay for growth). It is the only proposal in the batch that pays for the *end* of a prisoner's stay.
- **Accepted cost:** Keeping needs met costs money continuously, and long sentences occupy capacity; the bonus has to be large enough to beat simply churning bodies. DS gives no bonus figure, so whether it beats churn is undetermined.
- **Build size:** Medium — DS says 2–3 days.
- **Status:** NEW

## C18. Appease gangs with rooms and objects
- **Source:** DS — "18. Gang appeasement system"
- **Mechanic:** Gangs (implied by the existing gang-retaliation incident) can be appeased by providing certain rooms or objects — a `common-room` with a `dining-table`, a `yard` with recreation equipment, or a dedicated new "gang room". Appeased gangs cause fewer incidents and "may provide information about contraband"; displeased gangs retaliate more.
- **Reuses:** The gang-retaliation incident type, `common-room`, `yard`, existing objects, room zoning.
- **Player now optimises:** Appeasement spend against suppression spend. But the proposal is vague where it matters: there is no gang entity in the brief, no membership, no per-gang state, and DS does not define what a gang *is* — so "gang appeasement tracking" is doing all the work in a single phrase.
- **Accepted cost:** Appeasement costs space and earns nothing; over-appeasement "may attract more gang members" (mechanism unspecified).
- **Build size:** Large — DS says 3–4 days, which is optimistic. NEW SUBSYSTEM: gang identity and membership, which does not exist.
- **Status:** NEW (vague as written)

## C19. Give `free-association` something to fulfil
- **Source:** DS — "19. Free-association as a need-satisfaction tool"
- **Mechanic:** `free-association` stops fulfilling nothing: it satisfies a social need (either a new need or an extension of recreation — DS does not choose) and reduces tension, so prisoners with free-association time have fewer incidents and are more productive in work and education blocks. Common rooms and yards provide the space.
- **Reuses:** The `free-association` regime category and its existing routing; `common-room` and `yard`; the per-tick decay rates; the regime editor tab.
- **Player now optimises:** The regime schedule itself becomes a real allocation problem — free time against work/education income — where today the block is dead space filling 40% of a prisoner's day.
- **Accepted cost:** Free-association time is income time given up; too much is inefficient, too little is unstable.
- **Build size:** Small — DS says 1–2 days if it extends recreation; adding a seventh need is larger because it touches the 300/260/220/… withholding schedule, which DS does not mention.
- **Status:** NEW

## C20. Make construction wait on carried materials
- **Source:** DS — "20. Logistics as a constraint"; SEARCH — "6. Delivery-bay material custody"
- **Mechanic:** Purchased material stops teleporting into the global inventory. It lands at the `delivery-bay`, is carried by worker prisoners to `storage-room`, and from storage to the build site. Construction speed becomes a function of how many prisoners are on logistics jobs and how far storage sits from the site; with no logistics workers, material piles up at the bay and construction stalls.
- **Reuses:** The whole built-and-tested job system — job board, workers, containers, carry legs, reservations, pathfinding — by binding room instances to containers; `delivery-bay` and `storage-room`; the build-order queue with its cancel and refund.
- **Player now optimises:** Labour allocation across logistics, workshop, education and free time, and the physical layout of the prison, because distance is now a cost.
- **Accepted cost:** Every prisoner on logistics is a prisoner not doing something else; too few stalls construction.
- **Build size:** Medium-to-large — DS says 3–4 days; SEARCH says medium, "the job system exists but rooms need binding to containers".
- **Status:** NEW
- **Where the sources differ:** SEARCH proposes a **graceful fallback instead of a hard gate**: a prison with no reachable delivery bay still receives the current global-inventory teleport, but **at a surcharge or after a delay**; once a bay exists, normal terms apply. That converts a potentially game-breaking change into a priced choice and is the better first version. SEARCH also names the risk DS does not — "logistics can turn basic building into waiting" — and answers it with generous early throughput plus surfacing the job queue in the existing alerts/status UI.

---

> **Note on FAZA3 before its entries.** "Faza 3" in this document means *implementation phase 3 of a single-player build*, not a live-service phase. I checked for the off-brief signatures the task warned about — multiple players, trading, a shared market, a server, accounts — and **there are none anywhere in the document**. Every faucet and sink is an income line or a cost line inside one prison. Nothing in it is OFF-BRIEF on those grounds.
>
> It does, however, assume machinery introduced in its own sibling documents ("fazy 1 i 2", which are in the folder but not in this batch): a **certified capacity `K`** with payment only on `P = min(O,K)` certified places, a **capacity upkeep of 15 per place per day**, and **work contracts** paying cash for job-system labour. Where an entry below depends on those, I say so. The document never gives build estimates, so every "Build size" below is my reading, marked as such.

## C21. Attach a risk contract to each admitted prisoner
- **Source:** FAZA3 — §2 "Kontrakt ryzyka", §4 "Faucet: przychód z kontraktu ryzyka", §23 "Rekomendowany profil startowy"
- **Mechanic:** Admission opens a per-prisoner contract record (`contractId, prisonerId, riskTier, baseRateModifier, riskPremium, minimumCoverage, specialRequirements, liabilityClass, startTick, endTick, settlementState`). The contract does **not** change the existing risk tier; it attaches economic terms to an already-classified prisoner. Income becomes `r_i + p_t`, where `r_i = max(60, 300 - 40*u_i)` is exactly today's schedule and `p_t` is a **flat cash premium — 0 low / 20 medium / 45 high** — explicitly recommended as a flat addition rather than a percentage multiplier, because a multiplier over-rewards a prisoner who is simultaneously well-served and high-risk. The premium is hard-capped at `p_t ≤ min(80, 0.35 * r_i)`, so at `r_i = 60` a high-risk premium falls from 45 to 21.
- **Reuses:** Risk tiers; the per-prisoner-day income line and its exact 300/260/…/60 withholding schedule, untouched; the day boundary; certified places and coverage from the earlier phases.
- **Player now optimises:** Population composition as a portfolio. The document's framing question is the mechanism: *"does the premium for this population cover the extra guarding, handling, incident risk, lost capacity and rebuild cost?"* Its own worked table at `r_avg=180` gives net-before-liability of **180 low / 190 medium / 200 high** — deliberately only 20 apart — so the choice is decided by incident cost, not by the premium.
- **Accepted cost:** Named in §22: if the premium exceeds expected costs and incidents are too rare or too cheap, "always take high-risk" wins; if severity is too high, high-risk becomes unplayable and one incident produces several days of negative balance with no recovery.
- **Build size:** Medium (my reading; the source gives no estimate) — a new per-prisoner record that must survive save/load deterministically, plus one additive term in the existing income calculation.
- **Status:** NEW (same core idea as C1, but paid as a capped flat premium rather than a tier multiplier, and gated on coverage — see C22)

## C22. Suspend the risk premium when coverage fails
- **Source:** FAZA3 — §4.3 "Warunek wypłaty", §16.2 "Wymagania coverage", §19 "Mechanizm ochrony przed dominacją high-risk"
- **Mechanic:** The premium is not paid for holding a tier. It requires `premiumEligible_i = c_i * coveragePass_i * contractActive_i * notInRefusalState_i` — a certified place, a sector meeting the tier's minimum coverage, an active contract, and no refusal state. Minimums by tier: low needs standard, medium needs `1 of 2` and not `Understaffed` for more than one day, high needs `2 of 2` or a full post assignment. When coverage fails, high-risk premium is **suspended immediately**, medium after a grace period. Crucially the premium is suspended, never made negative: "high-risk loses the premium but does not start generating negative income," which stops a security lapse from instantly manufacturing a large debt.
- **Reuses:** Security sectors with deployment, coverage and post assignment; the HUD band that already reads `0 of 2 / Unguarded` → `1 of 2 / Understaffed` → `2 of 2 / Covered`; the refusal band that already reports why a command was refused.
- **Player now optimises:** Guard deployment stops being a background hygiene task and becomes an income gate the player can read off a HUD element that already exists. This is the batch's cleanest example of the brief's "visible feedback loop on a HUD that already exists".
- **Accepted cost:** Stated in §22 Risk 3 — if the premium is not tied to coverage and concentration, the risk tier degenerates into a pure money multiplier and the player never has to change sectors, regime or assignments.
- **Build size:** Small — an eligibility predicate read at the existing day-boundary settlement, plus a HUD reason string.
- **Status:** NEW
- **Note:** §16.2 states explicitly: *"Do not make high-risk depend on patrolling, since the patrol system does not function as an active mechanism. The requirement should use what exists: deployment, coverage and post assignment."* That is a direct rejection of C15's approach.

## C23. Per-sector risk budget that gates high-risk admissions
- **Source:** FAZA3 — §3.2, §5.3 "Koszt koncentracji", §14 "Dynamiczne risk budget"
- **Mechanic:** Each sector carries a risk budget derived from what already exists: `RiskBudget_s = baseCoverage_s * safetyFactor_s`, against `RiskUsed_s = Σ riskWeight_t` over prisoners in that sector, with tier weights **1.0 / 1.5 / 2.25**. An admission is permitted when `RiskUsed_s + riskWeight_candidate ≤ RiskBudget_s`. Over budget, the player has exactly three options: refuse the contract, buy more coverage, or accept it anyway and carry increased expected liability and degradation risk. A concentration index `riskLoad_s / max(1, certifiedCapacity_s)` compared to a threshold `θ_s` drives it; max share in one sector is 100% low / **75% medium / 50% high**.
- **Reuses:** Security sectors and their coverage; certified capacity; the incident system's existing pressure model (the document insists the multipliers modulate existing incident pressure and must **not** add a second independent generator alongside the deterministic RNG streams).
- **Player now optimises:** Where prisoners are placed, not just how many. It also makes multi-sector layout matter for the first time, and it is a real overcrowding punishment: packing one sector costs premium and raises liability.
- **Accepted cost:** For the MVP the document deliberately recommends **not** charging cash for concentration — use the index to block further high-risk offers, raise the required coverage, or raise expected liability instead, and only add a cash sink once the player demonstrably understands the cause.
- **Build size:** Medium — a per-sector weighted sum plus an admission gate; no new spatial system is required since sectors already exist.
- **Status:** NEW

## C24. Make the risk premium diminish with concentration
- **Source:** FAZA3 — §19 "Mechanizm ochrony przed dominacją high-risk"
- **Mechanic:** Rather than nerfing the premium globally, make the *marginal* premium fall: `p_effective_t = p_t * max(0, 1 - concentrationPenalty_s)` with `concentrationPenalty_s = clamp((RiskUsed_s - θ_s) / RiskBudget_s, 0, 0.75)`. Below the threshold there is no reduction; above it the premium decays (to at most a 75% cut) while liability rises. The first high-risk contracts in a well-prepared prison are worth taking; the tenth in the same sector is not.
- **Reuses:** C23's risk load and budget; the premium from C21.
- **Player now optimises:** The point at which to stop taking the profitable option — a genuine diminishing-returns curve rather than a cap. This is the document's named answer to the failure mode "always accept high-risk".
- **Accepted cost:** Not stated as a cost by the source, which presents this as pure safety mechanism. My reading: a formula whose output the player cannot see is indistinguishable from arbitrary nerfing, so this only works if the HUD shows current `RiskUsed_s` against `RiskBudget_s` and the effective premium — the document does provide both in its ledger (C30), so the fix exists but must be built with it.
- **Build size:** Small — one clamp applied to the premium already being computed.
- **Status:** NEW

## C25. Freeze a security reserve per high-risk prisoner rather than burning cash
- **Source:** FAZA3 — §12 "Dodanie stress reserve", §15.1 "Security reserve", §20 "Ledger fazy 3"
- **Mechanic:** Each prisoner locks a daily reserve by tier — **0 low / 5 medium / 15 high** per prisoner per day (`S_reserve = Σ N_t * reserveRate_t`; twelve high-risk prisoners lock 180/day). The money is **frozen, not spent**: on an incident it pays part of the repair and liability, and after a period with no incident it is released at 50–100%, but deliberately not instantly, so the player cannot flip to high-risk only on the payout day. The HUD must show `availableTreasury = treasuryEnd - lockedReserve` alongside `totalTreasury`.
- **Reuses:** The `Treasury`; the day boundary; the loan system once built (the document notes that if a loan draw funds the reserve, the ledger must still show the contract was not funded from operating cash flow).
- **Player now optimises:** Liquidity as distinct from wealth. This is the only proposal in the batch that separates "money you have" from "money you can spend", and it directly interacts with the decided loan mechanic and with the 625-brick liquidity defect.
- **Accepted cost:** Stated: if the reserve is never recoverable it degenerates into a plain tax on high-risk; the diagnostic table flags `reserve / treasury > 25%` as "the reserve freezes too much liquidity".
- **Build size:** Medium — a second treasury bucket touching every affordability check, the save format, and the HUD.
- **Status:** NEW

## C26. Settle each incident once, as a single itemised event
- **Source:** FAZA3 — §5.2, §15.4 "Liability settlement", §22 Risk 4 "podwójne karanie incydentem"
- **Mechanic:** A real incident produces one settlement: `S_incident = repairCost + externalLiability + emergencyResponseCost`. Lost income must **not** be charged as a separate cash penalty when the place has already stopped being certified — otherwise the same riot reduces the result twice, once through absent income and again through a fine for the absent income. Where the frozen reserve pays part of the bill, the ledger still records the full `S_incident` as a cost and `reserveDraw` as its funding source, "so the player can see that protection does not remove the risk, it moves the expenditure."
- **Reuses:** The incident system (assault, riot, escape attempt, gang retaliation) and its records; the treasury; the reserve from C25.
- **Player now optimises:** Nothing directly — this is an accounting discipline, not a player decision. Its value is that it makes every other risk mechanism in this document legible and prevents the balance from being accidentally brutal. By rule 3 it is not a mechanic; it is the correctness rule the mechanics need.
- **Accepted cost:** Not stated by the source as a cost. My reading: a single settlement means one big visible number at incident time, which reads as punishing even when the arithmetic is fairer than a drip of small penalties.
- **Build size:** Small — an incident-settlement function and a ledger line.
- **Status:** NEW (infrastructure, not a mechanic)

## C27. Charge a transfer fee to relieve concentration
- **Source:** FAZA3 — §15.3 "Transfer i exit fee", §17 Scenariusz F
- **Mechanic:** A prisoner can be transferred out to relieve sector concentration, at `S_transfer = baseTransferFee + riskWeight_t * transferMultiplier` (multiplier **1.00 low / 1.25 medium / 1.75 high**), with a delay and a frequency limit. The scenario condition is explicit: transfer must be an expensive management option, not a free cancellation of a contract, and after a transfer there must be a window in which the player loses the place's income or pays to prepare a new assignment. The diagnostic threshold flags "transfer used after more than 50% of incidents" as transfers being too cheap.
- **Reuses:** The prisoner release path; the treasury; C23's risk load.
- **Player now optimises:** An exit from a bad position at a price — the first thing in the batch that lets a player *undo* a population mistake, which matters because "insolvency is a state, not a loss condition" means the player has to be able to dig out.
- **Accepted cost:** Stated: without a fee, delay and frequency limit, transfer becomes a way to export every consequence.
- **Build size:** Small — a command, a fee, a cooldown; the release path already exists.
- **Status:** NEW

## C28. Give each risk tier a different work-efficiency profile
- **Source:** FAZA3 — §13 "Work contracts a risk-weighted contracts"
- **Mechanic:** Task effectiveness varies by tier via `L_i,j = baseWorkTicks_i * taskModifier_t,j`. The proposed table (low / medium / high): material transfer **1.00 / 0.90 / 0.70**; meal prep **1.00 / 1.00 / 0.85**; laundry **1.00 / 1.00 / 0.90**; waste disposal **1.00 / 1.10 / 1.15**; supervised high-value job **0.80 / 1.00 / 1.20**. The modifier affects effective availability or safety, not an uncapped cash reward.
- **Reuses:** Risk tiers; the job system's task types; `kitchen` and `laundry`, which are already routed rooms; a waste-disposal job would need C6's garbage loop or equivalent.
- **Player now optimises:** *Which* prisoner goes to *which* job — the brief's complaint "there is no reason to prefer one prisoner over another" answered directly, and answered without making one tier simply good and another simply bad. A high-risk prisoner is the right choice for supervised high-value work and the wrong choice for carrying materials.
- **Accepted cost:** Not stated by the source. My reading: it needs a work-assignment UI that does not exist — today the regime routes prisoners by block, not by person to task — so the mechanic is only as good as the assignment surface built with it.
- **Build size:** Medium — the multiplier is trivial; the per-prisoner job assignment it presupposes is not.
- **Status:** NEW

## C29. Cap the combined risk-premium and work-cash faucet
- **Source:** FAZA3 — §6 "Przepływ wartości z kontraktów i pracy", §23
- **Mechanic:** Per prisoner, `F_total_i = F_base_i + F_riskPremium_i + F_workCash_i`, subject to `F_riskPremium_i + F_workCash_i ≤ max(60, 0.35 * r_i)`. High-risk prisoners are not barred from working; they simply cannot make risk and labour into two unbounded faucets on the same person. Non-cash work output — a faster delivery, say — sits outside the cap, but must produce a real output and must not also be paid in cash. The diagnostic threshold flags `high-risk + work cash / base rate > 35%` as a cap violation.
- **Reuses:** The per-prisoner income line; whatever work-cash line exists (from the sibling phase-2 document, or from C2 here).
- **Player now optimises:** Not a decision so much as a guard rail — it stops the optimal play from being "stack every bonus on one prisoner". It does create a real choice at the margin: once a high-risk prisoner is at the cap, the next unit of work value is worth more from a low-risk one.
- **Accepted cost:** Not stated as a cost. My reading: a cap the player runs into without being told why reads as a bug; it needs a line in the per-prisoner breakdown.
- **Build size:** Small — one min() at settlement.
- **Status:** NEW

## C30. Write a per-day economy ledger with faucet and sink attribution
- **Source:** FAZA3 — §20 "Ledger fazy 3", §18 "Progi diagnostyczne"
- **Mechanic:** Each day boundary writes a record with every line separated: `treasuryStart`, `occupiedPlaces`, `certifiedPlaces`, counts per tier, `basePrisonerIncome`, `riskPremiumIncome`, `workContractCash`, `thresholdGrants`, `guardWages`, `capacityUpkeep`, `riskSecurityCost`, `riskReserveLocked`, `repairFees`, `incidentLiability`, `loanInterest`, `materialPurchases`, `operatingNet`, `cashChange`, `treasuryEnd`, `riskLoadBySector`, `riskBudgetBySector`, `premiumSuspensions`. `Net_operating_d = F_d - S_d` is kept separate from cash change, because "a high-risk contract can show positive operating net for many days and still be a bad choice if one sequence of incidents causes a long loss of certification and an impossible rebuild." The document pairs it with eleven diagnostic thresholds, e.g. `EV_high / EV_low > 1.25` across a full scenario means the premium or the costs are mis-calibrated; recovery after a riot under 2 days means the incident does not balance the premium, over 8 days means high-risk is effectively unplayable.
- **Reuses:** The day boundary where wages are already billed; the deterministic kernel, which makes a replayable ledger meaningful; the Overview tab.
- **Player now optimises:** As a player-facing screen, it is the only thing that would let someone answer "why did I lose money today", which currently nothing does. As a developer instrument it is the calibration harness for everything else in this document. It is not itself a decision.
- **Accepted cost:** Not stated. My reading: it is a persistence-format commitment — a per-day record accumulating in an IndexedDB save — and the brief flags persistence format as an area needing architectural care.
- **Build size:** Small to medium — the numbers all exist at the day boundary; the cost is the save-format decision and the UI.
- **Status:** NEW (instrument, not a mechanic)

## C31. Make the degradation ladder cut the risk premium first
- **Source:** FAZA3 — §21 "Integracja z insolvency i loans"
- **Mechanic:** A state table crossing treasury/coverage state against tier. Treasury positive with full coverage: all tiers get the full premium. Treasury positive with reduced coverage: low unchanged, medium gets a grace period, high is suspended. Insolvency with wages current: low unchanged, medium gets reduced offer quality, **no new high-risk offers**. Insolvency plus unpaid wages: new offers restricted, admissions restricted, high-risk contracts suspended or transfer-only. Degradation stage "construction halted": population persists, medium keeps the premium only if coverage holds, no new high-risk admissions. A loan may finance entry into high-risk but must not remove its risk.
- **Reuses:** The decided-but-unbuilt degradation ladder (deliveries refused → construction halted → staff unpaid) and the decided loans; the arrears that already persist through saves; the risk premium from C21.
- **Player now optimises:** The order in which a failing prison loses things — and specifically, insolvency now closes off the highest-margin option rather than leaving it available as a gamble, which makes digging out a matter of stabilising rather than doubling down.
- **Accepted cost:** Not stated. My reading: it makes recovery from insolvency strictly harder by removing the best faucet exactly when the player needs it, which cuts against decision 2's stated purpose that "the interesting part is digging out". This one deserves an explicit call before it is built.
- **Build size:** Small — a state table read at settlement, once the ladder exists.
- **Status:** NEW (a rider on the decided degradation ladder and loans)

## C32. Separate expected liability from actual incident cost
- **Source:** FAZA3 — §5.2, §8 "Model expected value kontraktu", §11 "Tabela oczekiwanej liability"
- **Mechanic:** Because the kernel is deterministic, no random value is booked. `E_liability_d = Σ [N_t * λ_t * severityCost_t * q_failure]` is computed as a **planning display only**; actual cash moves only when an incident really happens. Calibration profile: incident base cost **160 minor units**, `λ_base = 0.01` incidents per prisoner-day, tier frequencies **0.0075 / 0.0125 / 0.0200** and severity **0.75 / 1.00 / 1.50**, giving expected liability per prisoner per day of **0.90 / 2.00 / 4.80**. The document then says these are far too small against a premium of 45 and must not be used as-is; `λ` must be calibrated from a real incident ledger — `λ_observed = incidents_in_window / prisoner_days_in_window` — and not back-derived from the premium. Contract acceptance needs two conditions, not one: `EV_t ≥ 0` **and** `cashFlowStress_t ≤ recoveryCapacity`.
- **Reuses:** The deterministic kernel and named RNG streams; the incident system and its measured behaviour (a riot roughly every two in-game days even at full coverage); the ledger from C30.
- **Player now optimises:** If surfaced, it shows the player the price of the bet before they take it — "I am buying a higher margin and I know which crisis I have to survive", which is the document's own closing test. If left as an internal planning number it changes nothing the player does.
- **Accepted cost:** The document is candid that its own numbers do not work: with a riot every two days at full coverage, `λ_base = 0.01` per prisoner-day is not the observed rate, and the entire table is a shape to be re-fitted rather than a balance.
- **Build size:** Small as a display; the calibration work behind it is the real cost.
- **Status:** NEW

## C33. Settle contracts from a day-boundary snapshot
- **Source:** FAZA3 — §22 Risk 5 "gracz manipuluje tierem"
- **Mechanic:** Anti-exploit rule. A contract becomes active at an explicit `startTick`; settlement happens once per day from a snapshot of that moment; reclassification stays deterministic and bounded by the existing classification-review schedule. This blocks admitting a high-risk prisoner just before the day boundary, collecting the premium, and forcing a reclassification afterwards.
- **Reuses:** The day boundary; the existing classification-review schedule; the deterministic kernel.
- **Player now optimises:** Nothing — it closes an exploit. Recorded because it is the same class of defect as the brief's own "one plank can pay for three prisoners" (remove a bed, keep the revenue-bearing resident), and the same fix shape applies.
- **Accepted cost:** Not stated. My reading: snapshot settlement means a prisoner admitted at 09:00 and one admitted at 23:00 are paid identically for the day, which is slightly wrong but far cheaper than pro-rating.
- **Build size:** Small.
- **Status:** NEW (exploit-closing rule)

---

## C34. Pay for certified places, and pay overflow less
- **Source:** LEPD — "1. Capacity-certification payments" (the same certification is assumed throughout FAZA3 as `c_i` and `P = min(O,K)`)
- **Mechanic:** At each day boundary, compute *certified* occupied places — residents with a **valid bed**, not merely assigned to a room. Pay a bonus for each certified place, and reduce or suspend that bonus when occupancy exceeds certified capacity. Overflow is still permitted: the prison can accept more people than it can certify, but they earn less and add incident pressure.
- **Reuses:** The per-occupied-place income line, bed-derived room capacity, the day boundary where wages are already billed, incidents, the status strip.
- **Player now optimises:** Beds against admissions, and whether to expand *before* accepting. It is also the direct fix for the brief's own measured exploit — "one plank can pay for three prisoners", where a resident stays revenue-bearing after the bed is removed — because certification reads current capacity rather than assignment state.
- **Accepted cost:** Stated: a second capacity calculation, and a risk of making beds too dominant a consideration.
- **Build size:** Small — LEPD says "small income-rule change plus HUD fields; roughly 1–2 implementation days."
- **Status:** NEW (and it is a defect fix as much as a mechanic — it is the invariant that C16, C35, C44 and C56 all need)

## C35. Overcrowd a sector and its incidents scale
- **Source:** SEARCH — "2. Overcrowding as sector load multiplier"
- **Mechanic:** Each sector shows a load ratio: assigned residents ÷ valid bed capacity. Above 100%, each excess prisoner raises the incident roll weight in that sector; in higher bands, safety decay accelerates and `state income` is capped at a lower need-payment tier. Explicitly **no new abstract "overcrowding stat"** — the existing incidents, the safety need and the existing 300/260/…/60 withholding schedule do the work.
- **Reuses:** Occupancy and bed-derived capacity, sector coverage, the incident system, the safety need, the income withholding schedule, the status strip.
- **Player now optimises:** Where the population sits and whether beds are maintained, rather than total headcount. This is the batch's most direct answer to decision 1's unmet accepted consequence — "overcrowding must be punished elsewhere or the optimum is to pack the prison".
- **Accepted cost:** Stated: a sharp negative spiral after demolishing a bed or a fire-sale, so the multiplier should ramp over a day boundary rather than instantly.
- **Build size:** Small — SEARCH says low, "both occupancy/capacity and incident systems already exist."
- **Status:** NEW

## C36. Withhold a behaviour bond and settle it at discharge
- **Source:** LEPD — "3. Behaviour bond"
- **Mechanic:** A small bond is withheld from each admission and released at discharge if the prison kept that prisoner below a defined incident threshold and met a minimum needs score. Partial forfeitures go to the treasury. The player sees the bond amount at admission and its running status.
- **Reuses:** Prisoner records, the six needs, incidents, the discharge path, the daily income line, `Treasury`.
- **Player now optimises:** Prevention against cheap containment, how high-risk prisoners are treated, and **whether to accept short sentences at all** — a bond settles sooner on a short sentence but earns less per bond. It creates a per-prisoner P&L that closes only when they leave.
- **Accepted cost:** Stated: deferred income worsens early insolvency, and the mechanism punishes the player for incidents they did not cause unless attribution is carefully defined.
- **Build size:** Medium — LEPD says 2–3 days: an escrow field, a daily evaluation, a discharge settlement.
- **Status:** NEW

## C37. Run an announced inspection on a deterministic cadence
- **Source:** SEARCH — "19. Inspection windows and conditional grants"; LEPD — "4. Service-level inspections"
- **Mechanic:** On a known, announced cadence, take a deterministic snapshot of things already visible to the player: unmet-need count, bed accreditation, sector coverage, active incidents, contraband backlog, wage-arrears stage. Both documents insist there is **no inspector actor** — it is a snapshot, not an NPC. Passing pays a conditional grant or preserves a contract. On failure, SEARCH deliberately imposes **no fine**: it locks the next threshold-grant multiplier until a later pass. LEPD instead gives a visible remediation deadline followed by a deduction.
- **Reuses:** The deterministic clock; every HUD value that already exists; threshold grants; needs; coverage; incidents; contraband; arrears; day-boundary processing.
- **Player now optimises:** Readiness at a known future point — it gives the player a reason to tidy a messy prison even while state income still flows, and it creates a rhythm the deterministic kernel can guarantee.
- **Accepted cost:** SEARCH names the sharpest one itself: this "risks becoming the rejected 'survive until date' block grant", and only works if the payment rewards measurable operating quality and stays secondary to growth grants. LEPD adds that it "can feel arbitrary unless every scored item is visible before the inspection".
- **Build size:** Small — SEARCH says low; LEPD says 2–4 days for score function, timer, alert and payment.
- **Status:** NEW, but sits on the edge of **CONTRADICTS DECISION 1** — the brief records that a scheduled block grant was rejected by name for "paying for surviving to a date". A scheduled inspection that pays on a date is that shape unless the passing condition is strict enough to be the real cost.

## C38. Rotating needs targets that pay once
- **Source:** LEPD — "5. Needs portfolio bonuses"
- **Mechanic:** Alongside occupancy income, offer rotating service targets — for example, keep average hygiene above a threshold for three days, or keep every prisoner below two unmet needs. Completing a target pays once; failing simply ends the run toward that target, with no penalty.
- **Reuses:** Need decay and provision, the daily income accounting, the deterministic day boundary, the alerts band.
- **Player now optimises:** Which need to fix first, and the regime timing and facility placement that follow from it. Today the six needs are undifferentiated — every unmet need withholds the same 40 — so nothing makes hygiene a different problem from sleep. This makes them individually worth attacking.
- **Accepted cost:** Stated, and it is the right one: the three needs that cannot be satisfied inside a normal sentence (hygiene 10,200 ticks, recreation 13,600, safety 20,400) "must not become impossible requirements"; use rolling averages and achievable thresholds.
- **Build size:** Small — LEPD says 1–3 days: target definitions, counters, payment hooks.
- **Status:** NEW

## C39. Pay a dividend for regime blocks actually served
- **Source:** SEARCH — "17. Regime compliance dividend"; LEPD — "6. Regime-efficiency rebates"
- **Mechanic:** At each day boundary, measure the share of eligible work/education blocks in which prisoners were actually routed into a productive room instead of falling through to `free-association`. Clear a transparent threshold and receive a programme dividend scaled to the number of compliant prisoner-blocks, hard-capped below state income. LEPD's variant pays when a scheduled block has enough eligible room capacity for the prisoners assigned to it, and states plainly that "free-association generates no rebate and remains a real opportunity cost".
- **Reuses:** Regime blocks and the seven action categories, room routing and room capacity, the day boundary, `Treasury`, and specifically the ~1,000 work/education ticks a day that currently go nowhere. `classroom`, `kitchen` and `laundry` become producers of useful occupied time.
- **Player now optimises:** The regime editor becomes an economic instrument — schedule design and productive-room capacity, priced. This is the cheapest way in the batch to make the existing `education` and `work` categories pay, and it needs no new room and no market.
- **Accepted cost:** SEARCH: pressure to eliminate all unstructured time, damaging recreation and safety — so a qualifying day should also require a minimum recreation block. LEPD: players will build pathological regimes purely to claim rebates, so require actual attendance or action completion, not merely a scheduled block.
- **Build size:** Small — SEARCH says low; LEPD says 2–4 days for block-level counters and a payment modifier.
- **Status:** NEW

## C40. Pay prison labour in operational credit, never cash
- **Source:** SEARCH — "18. Prison labour as deferred build credit"; LEPD — "7. Employment as a cost converter"
- **Mechanic:** Each completed `work` action in kitchen, laundry or logistics generates a bounded credit that can **only** reduce labour time on queued repair and build orders, or make one small batch of sell-back less lossy. It can never become cash directly. LEPD generalises: a job consumes work time and produces "a material credit, waste reduction, laundry throughput or meal-preparation efficiency rather than abstract money", and the output is credited **only when the job container completes its carry legs** — so the job system's carry machinery is what gates the payout.
- **Reuses:** Work regime blocks, `kitchen` and `laundry` (both already routed), the full job system with containers and carry legs, build queues, materials, and the decided sell-back.
- **Player now optimises:** Programme capacity and labour allocation against prisoner free time and staffing — and it does so without creating a money printer, which is the specific failure mode both documents are steering around. It is the direct alternative to C2's cash market.
- **Accepted cost:** Both state it: labour risks becoming a mandatory money engine. SEARCH's answer is to cap accumulation, make credits decay, and keep the effect operational rather than monetary. LEPD's is to cap throughput by room capacity, needs and risk tier.
- **Build size:** Medium — SEARCH says medium; LEPD says 3–7 days including binding room instances to job containers and adding 2–3 job recipes.
- **Status:** NEW — and note it partly satisfies decision 3's "prison labour as a secondary line" without adding a second currency.

## C41. Pay a bonus for a material order delivered on time to its destination
- **Source:** LEPD — "8. Delivery throughput contracts"
- **Mechanic:** A completion bonus is paid when a material order actually reaches its intended storage or build site inside a time window. Cancelled orders forfeit the bonus. A late delivery still works — it simply pays nothing extra.
- **Reuses:** Purchase orders and the 100-tick delivery delay, cancellation and refund, the global inventory, the unused logistics jobs, pathfinding, the refusal/alert band.
- **Player now optimises:** Order batching, storage placement, construction sequencing and cash timing — a spatial optimisation that is not population. It is a lighter way into the job system than C20, because the bonus is optional and nothing breaks if the carry fails.
- **Accepted cost:** Stated: the bonus rewards logistics competence but is frustrating when pathfinding fails, so the active route and deadline must be shown in the existing refusal/alert band.
- **Build size:** Medium — LEPD says 2–5 days: connect purchase to delivery containers, add deadline state and payment.
- **Status:** NEW

## C42. Sell material back at 50% before delivery and 35% after
- **Source:** LEPD — "9. Materials resale as a liquidity decision"
- **Mechanic:** The decided sell-back gets a two-rate structure: material sells for **50% before delivery** and **35% after delivery**. Material tied to an active build order cannot be sold unless that order is cancelled first.
- **Reuses:** The material inventory, the queued build orders with their existing cancel-and-refund, `Treasury`, the 100-tick delivery window in which a purchase can already be cancelled.
- **Player now optimises:** Liquidity and speculative purchasing — the difference between the two rates makes the 100-tick pre-delivery window a real decision window rather than a technicality, and it is exactly the window the brief's 625-brick dead-end sits on the wrong side of.
- **Accepted cost:** Stated: it weakens the irreversible-dead-end pressure, so the loss must stay meaningful.
- **Build size:** Small — LEPD says 1–2 days.
- **Status:** ALREADY DECIDED (sell-back) — the numbers and the two-rate split are the new content

## C43. Attach a covenant to every loan
- **Source:** SEARCH — "20. Graduated loan covenants"; LEPD — "10. Debt covenants"
- **Mechanic:** A loan carries principal, daily interest, a repayment date and **one visible covenant**. LEPD's examples: maintain at least 80% certified occupancy, or keep arrears below a limit; breach raises interest or suspends new borrowing, but never ends the session. SEARCH's version makes the covenant a progression gate instead: a temporary daily repayment is drawn before discretionary spend, and while the loan is outstanding the prison may take ordinary admissions but **cannot claim the highest tier of accredited threshold grant**; a smaller loan is available early and a larger one only after a demonstrated population or repayment history.
- **Reuses:** The soon-to-be-negative `Treasury`, arrears that already persist through saves, day-boundary billing, occupancy, threshold grants, the planned degradation ladder.
- **Player now optimises:** Recovery trajectory and debt timing — and specifically whether to borrow now and forfeit the top grant tier, or grind out of the hole slowly and keep it. That is a real choice; an unconditional loan is not.
- **Accepted cost:** Both name it: debt can trap a weak prison permanently. SEARCH's guard is that repayment must pause at a defined low-cash floor and sell-back must be available before debt becomes punitive; LEPD's is to prohibit new loans while a covenant is breached, so refinancing cannot become a permanent subsidy.
- **Build size:** Small-to-medium — SEARCH says low-to-medium; LEPD says 2–4 days on top of the decided loan foundation.
- **Status:** ALREADY DECIDED (loans) — the covenant structure and the grant-tier lock are the new content

## C44. Give each degradation stage exactly one escape action
- **Source:** LEPD — "11. Degradation as an operating market"
- **Mechanic:** Build the decided ladder — delivery refusal, construction halt, wage arrears, then raised incident probability and staff loss — but make each stage a visible trade by allowing **one emergency action per stage**: cancel an order, sell material, borrow, or dismiss staff. Recovery stays possible and stays expensive.
- **Reuses:** `Treasury`, delivery refusal, the build queue, wages and arrears, morale and incident hooks, the alerts band.
- **Player now optimises:** Which obligation to miss and when — the player chooses the order in which the prison fails, which is exactly what decision 2 says the interesting part is ("digging out").
- **Accepted cost:** Stated: insolvency becomes stressful and readable instead of a silent stall, and tuning must avoid a death spiral.
- **Build size:** Medium — LEPD says 3–5 days on already-named architecture.
- **Status:** ALREADY DECIDED (degradation ladder) — the one-action-per-stage structure is the new content

## C45. Unpaid wages degrade guards in stages, not all at once
- **Source:** SEARCH — "13. Wage arrears as labour reliability"
- **Mechanic:** With wages unpaid, guards keep their entity and their wage debt but lose reliability in ordered stages: **first** they can no longer take optional duties (sweep, patrol, carry), **then** coverage assignment degrades, **then** incident mitigation weakens. Paying the arrears restores reliability over a day boundary, not instantly.
- **Reuses:** Staff and the 80-per-guard-per-day wage, arrears that already accrue and persist through saves, duties including the recent sweep, sector coverage, incidents, the day boundary.
- **Player now optimises:** Liquidity and debt servicing rather than nominal staff count — and the staged order tells the player which capability they are about to lose, so a lean prison can deliberately trade sweeps for solvency.
- **Accepted cost:** Stated, and stated as a sequencing requirement: this is "a very harsh compounding failure loop; loans and sell-back must arrive first", and the HUD must distinguish "employed", "unpaid" and "unreliable".
- **Build size:** Small — SEARCH says low once arrears are exposed per guard or as a global wage state.
- **Status:** ALREADY DECIDED (degradation ladder — "staff unpaid with morale and incident consequences" is named in it) — the three-stage reliability ordering is the new content

## C46. Give each covered sector one posture
- **Source:** LEPD — "12. Security-post specialization"
- **Mechanic:** A covered sector picks one posture from **admission, escort, sweep, response, watch**. The same guards cannot count fully for every posture at once. Each posture modifies an existing probability or throughput: admission reduces contraband entry, sweep finds contraband, response reduces incident severity, watch reduces escape attempts.
- **Reuses:** Sectors, deployment, post assignment, the sweep duty, contraband, the four incident types, the coverage HUD.
- **Player now optimises:** Where guards stand and which risk to accept — explicitly **without requiring patrol AI**, which makes this the cheapest way to give the security tab a decision, and one that does not touch the accepted patrol decision at all.
- **Accepted cost:** Stated: specialisation can make unspecialised coverage feel useless, so a basic coverage benefit must remain.
- **Build size:** Small-to-medium — LEPD says 2–4 days: a posture enum, sector effects, HUD display.
- **Status:** NEW

## C47. Let a security office manage exactly one sector
- **Source:** SEARCH — "9. Security-office command radius"
- **Mechanic:** A `security-office` containing a `security-console` grants a visible "managed sector" bonus to **one** adjacent or selected sector — one of: an additional effective guard post for coverage accounting, a faster sweep cadence, or a reduced contraband-to-incident conversion. SEARCH is explicit that it "must not create an invisible universal security buff".
- **Reuses:** `security-office` and `security-console` (both dead), the unread `surveillance` capability, sectors, posts, coverage, contraband, the sweep duty.
- **Player now optimises:** Where to place one high-value security hub, and which sector deserves it. It gives a dead room and a capability-less object a single narrow reader.
- **Accepted cost:** Stated: a dominant central-office layout if the radius is too broad — hence strictly local, one office managing one sector at a time.
- **Build size:** Small — SEARCH says low.
- **Status:** NEW

## C48. Author patrol posts from a security console, without overturning the decision
- **Source:** SEARCH — "11. Patrol posts as a deliberate sector service"
- **Mechanic:** SEARCH opens by refusing to overturn the recorded decision: "Do not overturn the decision that default sectors do not magically patrol." Instead, a `security-console` in a `security-office` creates a **selectable patrol-post assignment** for guards in that sector. A patrolling guard periodically visits defined sector anchors and reduces the duration or chance of unresolved incidents, and is explicitly **not** simultaneously counted as a stationary coverage post.
- **Reuses:** The existing patrol system that currently skips the derived default sector, `security-office`, `security-console`, sectors, guards, coverage, incidents, pathfinding.
- **Player now optimises:** Guard role allocation and sector geometry — the same target as C15, reached by giving the patrol system an explicit authoring path rather than by removing the skip.
- **Accepted cost:** Stated: patrols feel unreliable next to static coverage, so the UI must show the route, the next target, and **which post loses coverage while a guard patrols**.
- **Build size:** Medium — SEARCH says medium: "connecting existing but skipped patrol machinery to an explicit authoring path."
- **Status:** NEW — and this is the version to prefer over C15, because it delivers patrolling without contradicting the accepted decision. The two documents reached opposite conclusions on the same fact, and SEARCH is the one that read the constraint.

## C49. Score coverage across the regime day, not as a single state
- **Source:** LEPD — "13. Guard fatigue through rota coverage"
- **Mechanic:** Explicitly **do not model individual fatigue**. Instead compute whether a post is continuously covered across the blocks of the regime day. Gaps raise incident probability; staffing every block wastes wages. The player chooses a lean rota or constant coverage.
- **Reuses:** Guard wages at 80/day, sector coverage, the regime day's named blocks, incident scheduling.
- **Player now optimises:** Staffing *hours* rather than staffing *count* — the first proposal in the batch that makes the regime's time structure and the security system interact, and it turns the single 80/day wage into a coverage-shape decision.
- **Accepted cost:** Stated: it creates a time-varying interpretation of coverage and may make the current `Covered` HUD reading ambiguous.
- **Build size:** Medium — LEPD says 3–5 days: coverage-by-block calculation plus a rota UI.
- **Status:** NEW

## C50. Make seized contraband travel to secure storage
- **Source:** SEARCH — "10. Contraband evidence chain"
- **Mechanic:** A successful sweep finds contraband, but the item is only removed from prison state once it has been **carried and deposited** in a `security-office` or a secure `storage-room`. Until then the guard is occupied and the item is "in transit"; an interrupted handoff can produce a retaliation incident.
- **Reuses:** Contraband, the sweep duty, job-style carrying, containers, pathfinding, guards, `security-office`, `storage-room`.
- **Player now optimises:** Sweep timing, the distance from cell block to secure storage, and guard allocation — layout again becomes a security variable.
- **Accepted cost:** Stated, with its own mitigation: a simple sweep becomes more complex, so begin with **one abstract evidence token per sweep, not per physical item**.
- **Build size:** Medium — SEARCH says medium.
- **Status:** NEW

## C51. Give contraband a provenance and a weekly sweep target
- **Source:** LEPD — "14. Contraband chain audits"
- **Mechanic:** Every detected contraband item records where it came from: admission, delivery, storage, room or prisoner. Meeting a weekly sweep target pays a small amount; repeated failures raise a **specific** incident probability rather than applying a generic punishment.
- **Reuses:** The 10–20% contraband-at-admission roll, the sweep duty, inventory, delivery jobs, incident records.
- **Player now optimises:** Admission security, logistics routes and sweep timing — provenance tells the player *which* entry point to harden, which is a decision they cannot currently make because contraband has no origin.
- **Accepted cost:** Stated: the tracing must stay deterministic and explainable, "otherwise players see punishment without agency."
- **Build size:** Medium — LEPD says 3–6 days: a provenance field, a sweep counter, a targeted modifier.
- **Status:** NEW (complementary to C50 — custody versus origin; they are not the same mechanism)

## C52. Sell solitary capacity as a priced promise
- **Source:** LEPD — "16. Segregation as a priced promise"
- **Mechanic:** A `solitary-cell` can be enrolled in one of two promises. **Protection** pays only if the prisoner remains safe for the term. **Discipline** pays only if incidents cease for a fixed period. Solitary capacity thereby becomes a scarce priced service rather than another kind of room.
- **Reuses:** `solitary-cell` (one of the nine routed rooms and currently the least differentiated), bed-derived capacity, risk tiers, incidents, needs.
- **Player now optimises:** Who receives scarce isolation, and whether that floor area is worth more as a promise than as ordinary revenue-bearing occupancy — a direct opportunity-cost decision against the per-diem line.
- **Accepted cost:** Stated: solitary becomes over-used for profit, so it needs a needs penalty and a maximum consecutive duration.
- **Build size:** Small-to-medium — LEPD says 2–4 days: a room-purpose flag, a timer, a contract settlement.
- **Status:** NEW

## C53. Commission each dead room for exactly one narrow effect
- **Source:** LEPD — "17. Facility commissioning milestones"
- **Mechanic:** A framework rather than a single mechanic. Each dead room gets **one** narrow operational role, unlocked by a one-off commissioning payment in material, and no new subsystem. LEPD's examples: `storage-room` increases the material buffer; `delivery-bay` reduces delivery delay; `security-office` exposes sector posture; `staff-room` reduces wage-arrears growth; `infirmary` converts incident injuries into a temporary recovery state. One effect per room, measurable, no more.
- **Reuses:** The nine inert rooms costing 9,945 of the starting 25,000; the objects and their unread capabilities; construction orders; the delivery system; security; incidents.
- **Player now optimises:** Which operational room to build first, and whether that room's opportunity cost beats beds or walls — which is precisely the decision the brief says does not exist, since all nine currently return nothing.
- **Accepted cost:** Stated, and it is the honest one: "this is the largest proposal because it turns dead authored content into systems; effects must stay narrow to avoid a room-tech tree." It is also the proposal that most directly disagrees with the brief's deliberate refusal to fill the operational room categories.
- **Build size:** Large in aggregate — LEPD says 1–2 days per first role and 5–10 days for a useful initial set. It is genuinely a policy, not a feature.
- **Status:** NEW — and note it does **not** violate rule 4: a commissioning payment gates a named, measurable effect, not access to a room the player can already build. `staff-room` is the one case where the named effect (reducing arrears growth) has no stated mechanism behind it.

## C54. Give utilities a load budget instead of a decay modifier
- **Source:** SEARCH — "14. Utility-room operating limit"; LEPD — "18. Utility load and controlled reliability" (LEPD's own least-certain pick)
- **Mechanic:** A `utility-panel` in a `utility-room` provides a throughput budget; each active service object consumes a fixed slot — SEARCH names `stove`, `shower-head`, `washing-machine` and possibly `medical-bed`; LEPD adds beds. Over budget, **rooms do not shut down randomly**: they operate more slowly or are serviced in a visible priority order, with LEPD specifying **deterministic overload windows rather than random outages**, which the fixed-step kernel makes exactly reproducible.
- **Reuses:** `utility-panel`, `utility-room`, the unread `utility-control` capability, the existing service objects, the needs system, room action capacity, the deterministic tick.
- **Player now optimises:** Expansion order and service density — whether to buy infrastructure before beds. It is a genuine second axis: every expansion raises service demand, so population growth has an engineering cost that is not wages.
- **Accepted cost:** SEARCH: "introducing a second hidden bottleneck" — prevented by showing demand ÷ capacity in the existing status strip and by letting the starter panel cover a small starter prison. LEPD: it "can feel artificial unless the HUD clearly shows load and consequences", and admits the project may simply not want utilities to be a core concern.
- **Build size:** Medium — SEARCH says low-to-medium; LEPD says 3–6 days: load accounting, threshold effects, one HUD meter.
- **Status:** NEW (prefer this over C8: a priority-ordered throughput budget is legible and deterministic; a hidden decay multiplier is neither)

## C55. Let waste cap the effectiveness of hygiene provision
- **Source:** SEARCH — "15. Garbage-room sanitation spillover"
- **Mechanic:** Each canteen, kitchen, laundry and shower action produces an abstract waste unit. A `garbage-room` with `waste-bin` objects absorbs waste up to a capacity; when it is full or absent, **hygiene provision becomes less effective** and a visible sanitation warning appears. Explicitly no vermin, no disease, no hauling economy in the first version — SEARCH recommends automatic daily clearance so only room capacity and layout matter, precisely to avoid an "empty the bin" chore.
- **Reuses:** The unread `waste-disposal` capability, `garbage-room` (dead), `waste-bin`, the hygiene need, and the canteen/kitchen/laundry/shower actions that already run.
- **Player now optimises:** Maintenance capacity relative to food, laundry and shower throughput — a service-side constraint on scale that costs nothing to compute.
- **Accepted cost:** Stated: the chore risk, answered by automatic clearance.
- **Build size:** Small — SEARCH says low.
- **Status:** NEW (this is the cheaper half of C6: C6 converts waste into materials, this one only lets waste bite; they can ship in that order)

## C56. Make a released prisoner's bed need a laundry cycle
- **Source:** SEARCH — "16. Laundry as bed turnover and sentence throughput" (SEARCH's own least-certain, most-interesting pick)
- **Mechanic:** A released prisoner vacates their bed immediately but leaves it **uncleared** until a laundry cycle processes the bedding. An uncleared bed still physically exists but does not count toward accredited capacity and cannot take a new admission. A `laundry` with washing machines sets the turnover rate.
- **Reuses:** Drawn sentence lengths and the release path, beds and residency, `laundry` and `washing-machine` (a routed room that currently produces nothing economic), work regime time, and the accreditation/certification invariant from C34.
- **Player now optimises:** Release turnover and service capacity rather than bed count — and, as SEARCH puts it, expansion planned "around sentence churn, not just population peaks". It gives short sentences an operational meaning for the first time: high churn is now expensive.
- **Accepted cost:** Stated: the first few releases become surprisingly punitive, so a small default hand-cleaning rate must exist so laundry improves scale rather than gating the start.
- **Build size:** Small-to-medium — SEARCH says low-to-medium; it needs only a bed state transition plus existing laundry throughput, "not a new market, staff class, or simulation domain".
- **Status:** NEW

## C57. Treat unfinished build sites as security-sensitive
- **Source:** SEARCH — "8. Build-site security duty"
- **Mechanic:** An unfinished construction site becomes a temporary security-sensitive area. An uncovered site modestly raises escape-attempt weighting and can delay a worker job after an incident; assigning sufficient sector coverage lets the existing job pipeline run normally.
- **Reuses:** Build orders and job destinations, sectors and coverage, guards, pathfinding, the escape-attempt incident type.
- **Player now optimises:** Whether to concentrate expansion inside one coverable zone or spread it across the map — construction becomes a spatial security decision instead of a pure cash decision.
- **Accepted cost:** Stated, with mitigations: early building gets harder, so only large or unfinished exterior-facing work should count and the first starter build should be exempt.
- **Build size:** Small-to-medium — SEARCH says low-to-medium: "a site flag feeding existing coverage and incident checks."
- **Status:** NEW

## C58. Material above storage capacity sits exposed and can be lost
- **Source:** SEARCH — "7. Storage capacity and exposed-material loss"
- **Mechanic:** `storage-room` and `storage-rack` define secure material capacity. Material beyond that capacity stays in the delivery bay or exposed on site, where an incident can consume it, scatter it, or make part of it temporarily unavailable. Construction must **reserve physically stored or delivered material** rather than drawing on infinite global stock.
- **Reuses:** Materials, containers and reservations (already built in the job system), delivery, `storage-room` and `storage-rack`, incidents, build orders.
- **Player now optimises:** How much cash to tie up in material, how much of it is protected, and the sequence of purchases against build orders. It puts a real risk on buying ahead — which is the behaviour behind the brief's 625-brick dead end.
- **Accepted cost:** Stated: additional failure states for a player who buys too far ahead, so orders must show material location and reservation state "otherwise this becomes invisible punishment".
- **Build size:** Medium — SEARCH says medium, adjacent to delivery-bay custody (C20).
- **Status:** NEW

## C59. Set an `awaiting-treatment` flag, and stop there
- **Source:** SEARCH — "12. Medical triage, not health simulation"
- **Mechanic:** When an incident records an injured entity id, set a simple temporary `awaiting-treatment` flag. A reachable `infirmary` with a `medical-bed` and a `medicine-cabinet` clears it after a fixed treatment job. An untreated injured prisoner counts as **one extra unmet safety need** — so the existing 40-per-unmet-need withholding does the punishing — and modestly raises retaliation risk. Explicitly: "No disease, diagnoses, doctors, or new health progression loop."
- **Reuses:** The injured entity id incidents already record, the unread `medical-treatment` capability, `infirmary`, `medical-bed`, `medicine-cabinet`, the job system, the safety need, the income withholding schedule.
- **Player now optimises:** Whether an infirmary is worth building to cut the long tail of security failures — a single, priced question rather than a healthcare subsystem.
- **Accepted cost:** Stated: a new operational obligation after every serious incident, so treatment needs a grace window "so a single injury does not instantly collapse income".
- **Build size:** Small-to-medium — SEARCH says low-to-medium.
- **Status:** NEW — and this is the version to prefer over C5. It fills the same hole with a boolean and one need, adds no new resource, and reuses the withholding schedule as the penalty. C5 asks for a health model the brief says does not exist; this asks for a flag.

## C60. Persist a few local milestones and grant a small next-run modifier
- **Source:** LEPD — "19. Session milestones and prison rating"
- **Mechanic:** Persist a small local-only record across saves — largest certified population, longest solvent run, lowest incident rate, best needs score. Reaching a milestone grants a one-off starting modifier in a **new** prison, e.g. **+500 starting funds** or a first-delivery discount.
- **Reuses:** The local IndexedDB save the game already has, the metrics that already exist, and the threshold-grant logic for the milestone check.
- **Player now optimises:** Long-run specialisation and self-set challenge goals beyond raw population — it is the batch's only answer to the brief's own thinness note 7, "nothing persists across a session. Each prison starts identical."
- **Accepted cost:** Stated: "persistence can reduce the clean identical-start design and may become mandatory grinding. Keep bonuses modest and offer a fresh-run reset."
- **Build size:** Small — LEPD says 2–4 days: two to four persistent counters and a milestone screen.
- **Status:** NEW — and explicitly **on-brief**: LEPD keeps it local-only and names no account, server or other player. This is a meta-progression that fits a single-player game with IndexedDB saves.

## C61. Pick one operating standard at each milestone
- **Source:** LEPD — "20. Prison-to-prison standards exchange"
- **Mechanic:** At a milestone the player chooses one of three deterministic standards — **low-cost, humane, or security-first** — and each changes a pair of existing modifiers (wages/needs, income/incidents, or construction/delivery) until the next milestone.
- **Reuses:** C60's milestones, needs, incidents, wages, income, construction, delivery. LEPD is explicit that this works "without adding an external world or accounts".
- **Player now optimises:** A strategic identity that changes mid-run, and adaptation to whatever constraint is currently binding. It is the closest thing in the batch to progression that is not scale, and it is not a research tree — nothing is unlocked, a pair of modifiers is swapped.
- **Accepted cost:** Stated: the modifier bundles can produce a dominant stance, so each should be strong in one phase and weak in another.
- **Build size:** Small — LEPD says 2–3 days: one enum, three modifier bundles, a milestone choice UI.
- **Status:** NEW — despite the name, this involves **no other prison and no other player**. "Prison-to-prison" is a misnomer for a per-run stance choice; it is single-player and on-brief.

---

# Part 2 — the meta

## Build-first orderings

**DS — "The three I would build first, and the order":**
1. **Risk-based per-diem funding** — "the cheapest, highest-impact idea on the list… Build it in 1–2 days and the game instantly becomes more strategic."
2. **Free-association as a need-satisfaction tool** — "This is a 'use what exists' fix: the regime block already exists, the routing already exists, the needs system already exists."
3. **Workshop production income** — "it unlocks an entire unused system… Doing it after the first two means the game already has risk management and regime scheduling as meaningful systems."
Reason for the order, verbatim: *"Risk-based funding is the foundation — it makes prisoners different from each other. Free-association is the quick fix — it makes the regime system work. Workshop production is the expansion… Each builds on the previous."*

**SEARCH — "What to build first":**
1. **Fix capacity integrity, then implement accredited threshold grants** — "any growth reward built on the current assignment state rewards an exploit, and every later capacity, admission, laundry, and overcrowding mechanism needs the same invariant. It is the smallest foundation that directly changes the dominant optimisation from 'assigned records' to usable prison capacity."
2. **Sector-load overcrowding with visible incident scaling** — "This honors the explicit accepted consequence of per-prisoner-day state income: more population must also mean more trouble. It prevents threshold grants from simply becoming a stronger version of 'pack beds and hire nothing.'"
3. **Delivery-bay custody plus storage-room binding** — "It should follow the first two because logistics should enhance a stable core loop, not obscure whether the basic growth-and-security economics work."

**LEPD — "Build first":**
1. **Degradation ladder plus sell-back** — "the game currently contains a legal permanent dead end and the owner has already decided both remedies… It also costs the least because most refusal, arrears, order and refund machinery already exists."
2. **Capacity certification plus service-level inspections** — "they correct the central contradiction: population income currently rewards packing, while the design explicitly says overcrowding must be punished… They should precede new income lines so the economy is not expanded on top of an unbounded occupancy exploit."
3. **Employment through the existing job system** — "the highest leverage unused mechanism… It should follow the capacity work so labour cannot simply compensate for infinite overcrowding."
LEPD also gives a six-step sequence beyond the three: sell-back and ladder → capacity-safe income and certified-capacity display → inspections → bind rooms to job containers and ship one labour recipe → risk-tier contracts *only after incident and capacity feedback is readable* → commission one operational room, "preferably `storage-room` or `delivery-bay`", before any broad room framework.

**FAZA3 — none.** The document was not asked, or did not answer, this question: it has no build-first ordering. The nearest equivalent is §24 "Definicja gotowości fazy 3" [definition of phase-3 readiness], a thirteen-point checklist of what must be true before the risk-contract system may be tested — e.g. "security cost and guard wages are not double-counted", "expected liability is separated from actual incident settlement", "save/load reproduces contracts, reserves, eligibility and the settlement day deterministically" — and §23, a recommended starting parameter block.

## Challenges to the decided list

**DS — against decision 1 (per prisoner-day), though it concedes the decision itself:**
> "My argument is not that this decision is *wrong* — it is the correct decision for the reasons stated. The problem is the accepted consequence… That punishment **does not exist yet**, and until it does, the per-prisoner-day model is dangerous… **Until it is, the per-prisoner-day model is a bug, not a feature.** The game actively rewards packing prisoners with no downside. The threshold grant (already decided) actually *exacerbates* this — it pays for growth, making overcrowding even more attractive."
DS's prescription: build the overcrowding punishment immediately after its three, "immediate, visible, and painful: a reputation penalty, an incident multiplier, and a need-decay acceleration for overcrowded cells. The player should feel it in the first 10 prisoners, not at 50."

**SEARCH — three challenges:**
- *Against raw population thresholds for the decided grant:* "I would reject **raw assigned-prisoner thresholds** as the final implementation. The game currently has an exploit in which residents remain revenue-bearing after bed capacity has been removed, so raw assignment would institutionalise the wrong state as the progression metric. The grant should use accredited, valid occupancy and perhaps require a sector to be covered at the instant the threshold is crossed."
- *Against loans as the only escape:* "If deliveries are refused, construction is halted, and guards become unreliable while the prison lacks valid capacity, debt merely postpones a stall. A minimal recovery path must remain available: sell-back after delivery, a low-capacity emergency admission/reception path, and a small hand-operated baseline for critical services such as bed turnover. Otherwise the player has 'a way out' only on paper."
- *Against leaving the unreachable needs undecided:* "the player is perpetually punished by the `state income` withholding schedule for goals they cannot achieve." Its proposal is not to change the decay numbers globally but to "make long-term completion matter for classification review, inspection, or risk reduction, while state-income withholding is calculated from a short rolling window or capped at a level reachable in an ordinary sentence."

**LEPD — five challenges:**
- *Per-prisoner-day income as the sole foundation:* "The principle is sound, but 'per occupied place' is currently too exploitable… Certification must therefore be based on current valid capacity, not assignment state. Otherwise the accepted architecture directly rewards destroying beds after admission."
- *The refusal to fill the operational room categories:* "the conclusion has become too strong. The existing capabilities — `delivery-access`, `item-storage`, `waste-disposal`, `utility-control`, `medical-treatment` and `surveillance` — are already contracts waiting for readers. Commissioning only one narrow effect per dead room is cheaper and more coherent than leaving 40% of starting capital as nonfunctional authored content." *(This is the batch's only direct challenge to the brief's stated deliberate refusal to fill that gap.)*
- *That a block grant is categorically wrong:* "A scheduled survival grant is wrong for this project, but milestone payments are not the same thing… **The broader lesson is to reject passive calendar income, not every non-recurring payment.**"
- *Unreviewable sentence lengths:* "Either make eligibility visible and intentional, or fix the schedule. Hidden non-interaction makes risk tiers look like decoration."
- *Loans as the default escape:* "a loan alone may turn insolvency into painless refinancing. Pair it with covenants and a rising cost of debt. The debt should buy time, not erase the consequence of earlier decisions."

**FAZA3 — no challenge section, but three positions worth recording as challenges in substance:**
- Against building anything on patrol: "Nie należy uzależniać high-risk od patrolingu, skoro patrol system nie działa jako aktywny mechanizm" — *do not make high-risk depend on patrolling, since the patrol system does not function as an active mechanism; the requirement should use what exists: deployment, coverage and post assignment* (§16.2). This is the opposite conclusion to DS's C15 on the same fact.
- Against calibrating from design intent: its own expected-liability table (0.90 / 2.00 / 4.80 per prisoner-day) is declared unusable — "te wartości są niskie w porównaniu z premią 45, więc **nie mogą być użyte bez dodatkowych kosztów incydentów**" — and it insists `λ` be re-derived from an observed incident ledger, noting that a riot every two days at full coverage is nothing like its assumed `λ_base = 0.01` per prisoner-day.
- Against the degradation ladder being tier-blind (§21): it wants insolvency to close the high-risk faucet specifically. As noted at C31, that cuts against decision 2's premise that digging out is the interesting part, and deserves an explicit ruling.

## Least-sure-but-most-interesting

**DS — the contraband black market (C11).** "I am least sure about it because it introduces a moral ambiguity that may not fit the genre tone… It also risks trivialising contraband: if contraband is a source of income, the player may want more contraband, which is the opposite of the intended mechanic." Its case for it: contraband becomes a valued resource rather than a binary; it creates a real moral choice; it drives the existing gang-retaliation incident; it needs no new rooms; and "instead of 'find and destroy contraband,' the optimisation becomes 'find and evaluate contraband — is it worth selling?'"

**SEARCH — release-driven laundry turnover (C56).** "It transforms the existing short sentences from a background timer into a spatial-operational rhythm: cells are not merely capacity objects; they need a turnover service before they become accredited capacity again. That creates a novel reason to place laundry near cell blocks, use the regime's work time, and plan expansion around sentence churn — not just population peaks. It is also unusually cheap because it needs only a bed state transition and existing laundry throughput, not a new market, staff class, or simulation domain."

**LEPD — utility load and controlled reliability (C54).** "It may introduce an artificial engineering layer into a prison simulation, and the project may not want utilities to be a core concern. It is nevertheless interesting because it turns inert utility objects and rooms into a second axis that competes directly with beds: every expansion increases service demand, and the player must decide whether to enlarge population, improve reliability or accept visible needs failures. Because the kernel is deterministic, overloads can be scheduled and explained rather than presented as opaque randomness."

**FAZA3 — none offered.** The document has no least-sure section. Its §25 closing position is a statement of conviction, not of doubt: risk-weighted contracts are worth it only if high-risk simultaneously means a bigger faucet, a higher required coverage, a larger frozen reserve, higher expected liability, greater concentration sensitivity, a different work profile, and a costlier exit — "jeżeli gracz może tylko powiedzieć: 'ta opcja ma większą liczbę', model jest jeszcze faucetem, nie zaawansowaną gospodarką" [*if the player can only say "this option has a bigger number", the model is still a faucet, not an advanced economy*].

## Quality note

**SEARCH (`Lockstate_economy_and_progression_design_search.md`) and LEPD (`lockstate-economy-progression-design.md`) actually engaged with the brief.** Both work almost entirely inside existing machinery, name a real cost with a mitigation for every entry, and — the tell — both independently refuse to build a growth reward on top of the bed-removal exploit and say so before proposing anything else. SEARCH is the more disciplined of the two: it explicitly declines to overturn the patrol decision and routes around it instead (C48), it exempts the first threshold from its own accreditation gate, and it repeatedly proposes the cheap first version rather than the complete one ("one abstract evidence token per sweep, not per physical item"; "no new vermin, disease, or hauling economy"). LEPD is the strongest on the decided list, challenging five recorded decisions with reasons, and it is the only document in the batch that addresses cross-session persistence at all.

**DS (`deepseek_markdown_20260829_e2ce03.md`) is the generic one.** Roughly half its twenty entries are a prison-game feature list of the form "dead room X now does plausible thing Y" with no numbers, no coverage radius, no decay multiplier, no grant size — C3, C8, C12, C17 and C18 all name a system and leave the mechanism to be invented later. It also misread two of the brief's own constraints: it proposes removing the patrol skip that the brief calls a deliberate consequence of an accepted decision, and it builds a whole mechanism on classification review without noticing the brief's statement that eight of fifteen sentence lengths can never be reviewed. Its first two build-first picks (C1, C19) are nevertheless genuinely good and genuinely cheap.

**FAZA3 (`Lockstate — model faucet & sink dla fazy 3.md`) answered a question nobody asked, and answered it very well.** It is not a mechanism search: it is a balance and calibration specification for a single mechanism — risk-weighted admission contracts — complete with parameter profiles (Soft/Target/Hard), six named test scenarios with pass conditions, eleven diagnostic thresholds, a ledger schema, and five named balance failure modes. It supplies none of the three things the brief asked for separately (no build-first ordering, no challenge to the decided list, no least-sure idea) and it assumes concepts introduced in its own sibling "faza 1/2" documents. But it is the only document in the batch that is honest about its own numbers being wrong, and its structural ideas — premium suspension rather than negative income, frozen reserve rather than burned cash, one settlement per incident, diminishing marginal premium under concentration — are the parts worth keeping. **Nothing in it is off-brief: there is no multiplayer, no trading, no shared market, no server and no account anywhere in the document.** The word "faza" is about build order, not about a live-service phase.
