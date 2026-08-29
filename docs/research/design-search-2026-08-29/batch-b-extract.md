# Batch B extract — mechanisms from five design-search responses

Sources read in full (paths relative to `/tmp/claude-0/-workspace-lockstate/4ce06045-59df-5454-8f9c-d57846358c5a/scratchpad/design/`):

- `grok economy propo.md` (22 mechanisms + build order + decision challenges + least-sure)
- `lockstate-economy-progression-design (2).md` (20 mechanisms)
- `lockstate-economy-progression-mechanisms (1).md` (22 mechanisms)
- `lockstate-economy-progression-design (1).md` (20 mechanisms)
- `Lockstate_Economy_Progression_Design_Response.md` (20 mechanisms)

Deduplicated across the batch. Where several documents propose the same mechanism, all are listed under **Source** and the numeric disagreements are noted.

**Note on OFF-BRIEF:** none of these five documents proposes multiplayer, player-to-player trading, clans, auctions, live-service seasons, or a server-authoritative economy. The only single-player-boundary pressure in the batch is cross-save persistence (B61, B60), which stays inside local IndexedDB and is therefore not off-brief — though `grok economy propo.md` argues explicitly against building it yet. The `OFF-BRIEF` status is used below only where an idea sits outside what the brief asked for in some other way.

---

# Part 1 — the mechanisms

## Capacity, overcrowding, and the occupied place

## B1. Deduct state income above bed capacity
- **Source:** `lockstate-economy-progression-design (2).md` — "1. Capacity compliance band"; `lockstate-economy-progression-design (1).md` — "1. Capacity licence bands"; `Lockstate_Economy_Progression_Design_Response.md` — "8. Overcrowding Costs"
- **Mechanic:** At the day boundary compute occupied places against bed-derived capacity and apply an escalating deduction to the per-prisoner-day line. `design (2)` gives the band explicitly: 0–100% pays the normal rate, 101–110% takes a compliance deduction, above 110% the state withholds a larger share and incident pressure rises; it is shown beside prisoners/rooms/incidents on the status strip. `design (1)` frames the same thing as a "licensed capacity" derived from completed beds *and basic sanitary capacity*, where excess occupancy raises the probability and severity of inspections, incidents or payment withholding, and where crossing the licensed target can also fire a one-off expansion grant. `Response` proposes the crudest version: −20/day per prisoner above 100% occupancy.
- **Reuses:** the per-prisoner-day income line, bed-derived room capacity (and toilets, in `design (1)`), the unmet-need withholding schedule, the day-boundary accounting, the status strip, the incident system.
- **Player now optimises:** safe occupancy margin — whether the next intake is worth its income after the crowding penalty — rather than raw headcount. `design (1)` adds: build sanitary capacity first, or keep a margin.
- **Accepted cost:** `design (2)`: over-capacity play stays viable as an emergency option but becomes visibly and financially painful. `design (1)`: rejecting prisoners slows income, exceeding capacity risks withheld income and incidents. `Response`: "lower profit from overcrowding, but more realistic".
- **Build size:** small — one population/capacity aggregate, one daily modifier, one HUD field, a few deterministic incident modifiers.
- **Status:** NEW (it is the missing "elsewhere" that Decision 1 explicitly requires; `grok economy propo.md` argues against it as a *new* tax — see B3/B6).

## B2. Multiply incident rate by the overcrowding ratio
- **Source:** `lockstate-economy-progression-mechanisms (1).md` — "1. Occupancy-pressure incident multiplier"
- **Mechanic:** At the day boundary compute `occupied_places / capacity` across accommodation rooms. If the ratio exceeds 1.0, multiply the existing incident spawn rate by `(1 + excess)`, clamped so a 2× overcrowded prison roughly doubles riot/assault chance. No new incident types. A single status-strip warning ("Over capacity ×1.4") is enough.
- **Reuses:** the incident system, bed-derived room capacity, the day-boundary accounting that already bills wages and pays the grant, the existing status strip.
- **Player now optimises:** cell density against expansion speed — packing becomes visibly costly instead of free income.
- **Accepted cost:** early overcrowding can cascade into more incidents before the player has cash for walls and beds; "the loop closes tighter".
- **Build size:** small — one day-boundary calculation plus an existing incident-rate modifier.
- **Status:** NEW. (Distinct from B1: it punishes through incidents, not through the income line. Note `grok economy propo.md` warns the incident rate is already saturated at roughly one riot per two days, which would make a multiplier inaudible until coverage can suppress incidents.)

## B3. Make the holding-cell the overflow place, and delay the rest of intake
- **Source:** `grok economy propo.md` — "2. Holding-cell is the overflow place, and it pays through withholds"; `lockstate-economy-progression-mechanisms (1).md` — "10. Holding-cell overflow buffer"
- **Mechanic:** Intake that would exceed bed capacity is assigned to a `holding-cell` if one exists. Holding assignments still count as occupied places, but sleep cannot be provisioned there and safety decays faster, so they walk down the existing 300/260/…/60 schedule, typically to the floor. If no holding-cell exists, intake is **delayed, not refused**: the prisoner is not yet an occupied place, and a queue of delayed intake raises incident chance at the gate (queue length is an alert). Empty beds never cost money — vacancy is explicitly not a tax. `grok` insists holding must have no bed by construction, or a bed there confers no residency. `mechanisms (1)` frames the same room as a deliberately inferior overflow that makes the "remove the bed, keep the revenue" exploit explicit and costly.
- **Reuses:** `holding-cell` (one of the nine dead rooms), bed-as-residency, the occupied-place income line, the six needs, admission, incidents, the alert band.
- **Player now optimises:** when to build overflow versus beds versus stopping intake. Packing still pays; packing without beds and without holding pays much less and riots more.
- **Accepted cost:** the delayed-intake queue is new state. If holding is too cheap it becomes "a dorm with a worse name". Threshold-grant counting must decide whether delayed intake counts toward crossing 10 — `grok` says it should not.
- **Build size:** medium-small — an assignment policy plus a queue. Fixes the bedless-still-pays bug as a side effect.
- **Status:** NEW.

## B4. Define an occupied place as a bed that currently exists
- **Source:** `grok economy propo.md` — "3. Occupied place means a bed that currently exists"
- **Mechanic:** `occupied place := a prisoner assigned to a bed that currently exists`. Undoing a completed bed build reassigns the resident to holding or the intake queue **before** the plank is refunded. Remove a bed, lose the 300. This is the one-plank-three-prisoners exploit restated as a residency rule.
- **Reuses:** bed-as-residency, build-order undo, refund-of-allocated-materials, the holding-cell overflow from B3.
- **Player now optimises:** "Nothing they should have been optimising. It deletes a false optimum that every grant, labour payment and release bonus below will otherwise multiply."
- **Accepted cost:** anyone using the exploit as a dorm feels nerfed — accept it, and do not add a "hot-bunking" room that restores it under a flag.
- **Build size:** small, and the document argues it must come first because it is the foundation the rest stands on; threshold grants must not ship while the exploit still pays.
- **Status:** NEW (a bugfix stated as a rule, and the only entry in the batch that is a precondition for the already-decided threshold grants).

## B5. Pay a one-off for keeping spare capacity
- **Source:** `lockstate-economy-progression-design (2).md` — "2. Capacity reserve bonus"
- **Mechanic:** Pay a small bonus or unlock a one-off grant when the prison stays below a chosen reserve — for example 10% empty capacity sustained for a full day or week. Explicitly a threshold achievement, not a per-day subsidy, so it does not revive the rejected scheduled block grant.
- **Reuses:** the threshold-grant payment path, bed capacity, occupied places, day-boundary accounting.
- **Player now optimises:** headroom before accepting prisoners — trading immediate income for resilience and future intake capacity.
- **Accepted cost:** "it can reward timid play; cap the reward and make it compete with growth thresholds."
- **Build size:** small — a rolling occupancy counter, a reserve threshold, a grant event, HUD feedback.
- **Status:** NEW. (Tension worth flagging: `grok economy propo.md` says explicitly "Do not add a vacancy penalty" and "Empty beds do not cost money"; this pays for the same thing from the other side and risks becoming a slow drip that pays for existing.)

## Safety, coverage, and guards

## B6. Provision the safety need from sector coverage state
- **Source:** `grok economy propo.md` — "1. Coverage is safety provision"
- **Mechanic:** Each tick a prisoner spends in a sector, safety is provisioned if and only if that sector's HUD state is `Covered`; `Understaffed` provisions at half rate; `Unguarded` provisions nothing. Drop or retune the 20,400-tick safety requirement, which is what currently makes safety a constant rather than a decision. The existing 40-per-unmet-need withhold then fires on unguarded population through a need the payment line already reads. Stated arithmetic: a guard covering three prisoners prevents 120/day of withhold against 80/day of wage; a guard covering one prisoner does not pay for themselves on this line alone. Surface `Covered N / Understaffed N / Unguarded N` on the status strip so the 40s are attributable.
- **Reuses:** the sector HUD states (`0 of 2 / Unguarded` → `1 of 2 / Understaffed` → `2 of 2 / Covered`), the safety need, the 300/40/60 schedule, guard wages, deployment and post assignment.
- **Player now optimises:** guards per occupied place and *where they stand*, rather than "enough bodies that the riot timer looks quieter". Makes coverage the safety half of Decision 1, which currently has no reader.
- **Accepted cost:** short-sentence prisoners can now be "safe", which they never could; the 20,400 number is discarded or demoted to a long-stay accumulator. If incidents still fire every two days under full coverage the player is punished twice for a rate they cannot move — so this mechanic *requires* coverage to actually suppress incidents. "Do not also add an incident fine on top in the same pass."
- **Build size:** small — one reader from sector state into the need provisioner.
- **Status:** NEW. Strongest single entry in the batch: it is a reader, not a subsystem, and it wires the half of Decision 1 that was never wired.

## B7. Make the security console the information the no-patrol decision removed
- **Source:** `grok economy propo.md` — "14. Security-console is the information the no-patrol decision removed"
- **Mechanic:** Guards still never patrol; that decision stands. A `security-office` containing a `security-console` (the unread `surveillance` capability) does exactly two things: the Security HUD shows contraband-in-sector counts without a sweep, and the alert band fires one regime block earlier on an incident that is about to start. Without a console the HUD stays coarse and contraband is found only by sweep, riots only when they start.
- **Reuses:** `security-office`, `security-console`, `surveillance`, sweep duty, the alert band, the sector HUD, the accepted no-patrol decision.
- **Player now optimises:** information versus guard-time-on-sweep versus insurance — a reason to build an administration-category room before the 40th cell, without drawing a patrol route.
- **Accepted cost:** if the default HUD is taught to show everything, the console becomes decoration again; keep the default coarse. The console must not suppress incidents — that is coverage's job.
- **Build size:** small — HUD readers and an earlier alert. No new simulation.
- **Status:** NEW.

## B8. Make the security office a passive coverage multiplier
- **Source:** `lockstate-economy-progression-mechanisms (1).md` — "8. Security-office + surveillance console coverage bonus"
- **Mechanic:** A `security-office` containing a `security-console` grants a passive coverage multiplier to its assigned sectors: the existing HUD coverage states improve one step earlier, or incident detection radius increases. Guards still do not patrol; the office makes existing static coverage more effective.
- **Reuses:** `security-office`, `security-console` + `surveillance`, sector deployment/coverage/post assignment, the incident system.
- **Player now optimises:** whether to invest in an operations-category room that currently does nothing, instead of hiring another guard.
- **Accepted cost:** another specialised room consuming floor space and materials; without it the player is stuck at the current "full coverage still riots every two days" baseline.
- **Build size:** small — a capability reader plus a sector multiplier.
- **Status:** NEW. (Direct alternative to B7 — same room and object, opposite reading: B7 gives information and refuses to touch incident rate, B8 buffs coverage itself. `grok economy propo.md` explicitly warns against the B8 shape.)

## B9. Give each guard post a mode: static, escort, or response reserve
- **Source:** `lockstate-economy-progression-design (1).md` — "12. Guard post trade-offs"
- **Mechanic:** Each security post gains a mode. Static coverage improves sector coverage as now; response reserve reduces incident duration but leaves its sector marked understaffed; escort improves delivery or prisoner movement but removes a guard from coverage.
- **Reuses:** guard hiring and wages, sector deployment, post assignment, the coverage HUD, incidents, pathfinding, logistics.
- **Player now optimises:** placement and mode of the same guards rather than only how many are hired.
- **Accepted cost:** every mode gives up another benefit — the player must choose between visible coverage and latent response capacity.
- **Build size:** medium — guards already have posts and actor movement; add modes and an incident-response selection.
- **Status:** NEW.

## B10. Sell patrol routes as an opt-in, paid upgrade
- **Source:** `lockstate-economy-progression-design (1).md` — "13. Patrol routes as a security investment"; `lockstate-economy-progression-mechanisms (1).md` — "17. Guard patrol route as optional sector upgrade"; `lockstate-economy-progression-design (2).md` — "14. Guard post versus patrol allocation"
- **Mechanic:** The player designates a route and pays a setup or recurring scheduling cost. A patrolled route reduces contraband persistence and escape-attempt probability (`design (1)`) or reduces incident chance along the route and raises contraband detection (`mechanisms (1)`), but consumes guard time and leaves coverage gaps. `design (2)` states the trade explicitly as an allocation: static coverage preserves the sector HUD, patrol consumes coverage capacity — and calls this "a deliberate contradiction … an optional reversal, not a hidden fix".
- **Reuses:** the existing patrol system, security sectors, post assignment, hierarchical/budgeted/cached pathfinding, contraband, escape attempts, incidents.
- **Player now optimises:** which corridors deserve protection, and whether patrol time is worth losing from fixed posts.
- **Accepted cost:** patrols create coverage gaps and cost guard allocation; a route covering everything is expensive. `mechanisms (1)`: adds a micro-management surface many players will ignore, "which is fine — the default behaviour stays as decided".
- **Build size:** medium — the patrol mechanism exists; the missing work is giving the default sector a route and connecting patrol presence to existing incidents. All three note it is technically cheap and design-expensive.
- **Status:** CONTRADICTS DECISION (unnumbered) — the brief's "Guards never patrol … a deliberate consequence of an accepted decision". All three documents know they are doing it: `design (2)` and `mechanisms (1)` keep no-patrol as the *default* and make patrol opt-in; `design (2)` then argues in its own challenges section against building it in the first three.

## B11. Give guards a fatigue counter that the staff-room clears
- **Source:** `grok economy propo.md` — "15. Staff-room is how unpaid wages become incidents"; `lockstate-economy-progression-mechanisms (1).md` — "5. Staff-room morale / wage efficiency"
- **Mechanic:** Each guard carries a fatigue integer. `grok` gives the numbers: +1 per worked day, +2 if wage arrears are outstanding, −2 at the day boundary if a `staff-room` with at least one `chair` exists, −0.5 if not; fatigue above 5 multiplies incident chance in that guard's posted sector. No guard pathing in v1 — the room's *existence* is the reader. `mechanisms (1)` proposes the variant where guards who spend off-duty time in the staff-room gain a "rested" flag that lowers incident probability or slightly reduces effective wage cost for the day.
- **Reuses:** `staff-room`, `chair`, wage arrears that already persist through saves, the named degradation ladder, incident chance, sector posts, the coverage HUD.
- **Player now optimises:** whether to take the loan to clear arrears, whether to build the staff-room before the next guard, and whether insolvency is a state they can sit in. Gives Decision 2 a room and a number.
- **Accepted cost:** existence-as-reader is admittedly dumb (v1); guard pathing to rest needs a guard regime that does not exist. If incident chance is already saturated, a multiplier is inaudible — same pairing dependency as B6.
- **Build size:** small — a counter, a multiplier, a HUD pip on the staff count. `grok` says it should land *with* the degradation ladder, not after.
- **Status:** NEW — and it is the concrete implementation of the already-decided ladder's "staff unpaid → morale → incidents" rung.

## B12. Pay to train guards
- **Source:** `Lockstate_Economy_Progression_Design_Response.md` — "9. Guard Training Programs"
- **Mechanic:** The player pays roughly 200 per guard to train them; trained guards reduce incident rate by some unspecified percentage.
- **Reuses:** the guard system, incidents, wages.
- **Player now optimises:** guard quality against guard quantity — one more way to spend cash on the incident rate.
- **Accepted cost:** stated as "training is expensive and doesn't guarantee success" — no mechanism given for the uncertainty.
- **Build size:** medium — a "trained" state on the guard entity, per the source.
- **Status:** NEW, but thin: the percentage is unspecified and the mechanism is a flat cash-for-safety conversion with no spatial or scheduling decision attached.

## B13. Grant a bonus for sustained full sector coverage
- **Source:** `Lockstate_Economy_Progression_Design_Response.md` — "18. Security Goal Grants"
- **Mechanic:** If the player maintains full security-sector coverage for X days (X unspecified), pay a grant.
- **Reuses:** security sectors, coverage states, post assignment.
- **Player now optimises:** hiring to full coverage rather than minimum staffing — but only if the grant exceeds the wages, which the source states as its own balance condition ("guards are expensive, so grant must exceed their cost").
- **Accepted cost:** NOT STATED BY SOURCE beyond that balance note. My reading: if the grant must exceed the wage cost of full coverage, it is a subsidy for a fixed staffing level and stops being a decision the moment it is tuned to pay.
- **Build size:** small — coverage is already measured; add a streak counter and a payout.
- **Status:** NEW, weak. Compare B6, which makes coverage pay through a line that already exists rather than adding a bonus on top.

## Incidents, injury, and stability

## B14. Turn the recorded injured entity id into a bounded injury state
- **Source:** `grok economy propo.md` — "7. Infirmary reads the injured id the incident already wrote"; `lockstate-economy-progression-mechanisms (1).md` — "9. Infirmary + medical-bed injury state"; `lockstate-economy-progression-design (1).md` — "15. Health as a short-lived injury state"; `lockstate-economy-progression-design (2).md` — "16. Injury state as a temporary operating loss"; `Lockstate_Economy_Progression_Design_Response.md` — "19. Medical Needs Penalties"
- **Mechanic:** When an incident records an injured entity id, set `injured = true` on that prisoner. `grok` is the most specific: injured prisoners generate no labour credits, path at half speed, and receive no recreation or sleep provision; clearing the flag takes 2,400 ticks on a `medical-bed` in an `infirmary` (the unread `medical-treatment` capability); a `medicine-cabinet` present makes treatment ticks count double; there is no medic staff type — prisoners path there during `free-association` or `hygiene`, or a guard duty cloned from sweep escorts them; untreated injury does not kill, and only on a **riot** are untreated injured transferred out (occupied place lost, no release grant). `design (1)` adds severity and recovery time and says an infirmary with medical-bed and medicine-cabinet shortens recovery. `design (2)` keeps it to a fixed tick timer with an optional later staff role. `Response` proposes only the penalty half: a fine if an injured prisoner exists and the infirmary is unused.
- **Reuses:** the injured-entity id incidents already record, `infirmary`, `medical-bed`, `medicine-cabinet`, `medical-treatment`, pathfinding, sweep duty as a template, the needs system, labour credits (B20).
- **Player now optimises:** whether the infirmary lands before the next cell; incident rate becomes a population-quality tax rather than a log line.
- **Accepted cost:** `grok` states it hardest — at the current incident frequency an infirmary will fill immediately and then start transferring people out of a twelve-prisoner prison, so injury-and-treatment must ship before riot-transfer, and only after coverage actually suppresses riots. "Do not add a medic. Do not add a health need — a boolean is the whole model." `design (2)`: risk of a frustrating snowball; keep it temporary, deterministic and bounded.
- **Build size:** medium — a boolean, a provisioner skip, a routing rule, a duty. All object capabilities are already authored.
- **Status:** NEW. Highest agreement in the batch: all five documents propose it.

## B15. Make solitary the incident sink, and its absence an escalation
- **Source:** `grok economy propo.md` — "8. Solitary is the incident sink"
- **Mechanic:** `assault` and `gang retaliation` produce a `segregate` duty (cloned from sweep duty) that assigns the aggressor to a `solitary-cell` for 2,400 ticks. They remain an occupied place and keep being paid for, but cannot work, and every need except hunger and bladder goes unmet — so they walk toward the 60 floor for that day. **If no vacant solitary-cell exists, the next incident in that sector is upgraded to `riot`.**
- **Reuses:** `solitary-cell` (already a routable accommodation room), sweep duty as a template, the reachable incident types, the occupied-place line, the withhold schedule.
- **Player now optimises:** solitary capacity as an incident buffer — building solitary is insurance, not housing. A full solitary wing is a visible "the next one is a riot" warning on the alert band.
- **Accepted cost:** if withholds are not harsh, solitary becomes a 300/day box to farm grants with. Payment must not stop during solitary (that would fight Decision 1); the punishment runs through needs, which Decision 1 already names.
- **Build size:** medium-small — a duty, an assignment, and an upgrade rule on the next incident.
- **Status:** NEW.

## B16. Pay a streak bonus for days without a serious incident
- **Source:** `lockstate-economy-progression-mechanisms (1).md` — "15. Days-without-major-incident streak bonus"; `lockstate-economy-progression-design (1).md` — "5. Clean-days reserve"; `Lockstate_Economy_Progression_Design_Response.md` — "1. Incident Reduction Bonuses"
- **Mechanic:** Count consecutive days without riot/escape/assault. `mechanisms (1)`: pay a one-time or small recurring bonus at 3 / 7 / 14 days, shown on the status strip, resetting on any qualifying incident. `design (1)` instead accrues a *reserve credit* per clean day that can only be cashed at a population or construction milestone, or is spent automatically to soften the next incident; a serious incident resets part of the streak. `Response` uses a fixed window instead of a streak: every 10 in-game days, if incidents were fewer than 3, pay 500 / 1000 / 1500 by prison size.
- **Reuses:** the incident system, day-boundary accounting, the treasury, the status strip, the threshold-grant payment path (`design (1)` explicitly ties the payout to a threshold so it is not a scheduled grant).
- **Player now optimises:** stability as a second currency alongside population; stabilising before expanding rather than maximising occupancy immediately.
- **Accepted cost:** the bonus must stay modest or players turtle (`mechanisms (1)`); cash is delayed and a player who expands too soon loses the accumulated buffer (`design (1)`); the bonus must be smaller than the cost of the guards it encourages (`Response`).
- **Build size:** small to very small — one integer counter, one threshold table, one progress bar.
- **Status:** NEW, but read the shape carefully: `Response`'s fixed-window version pays on a calendar, which is close to the block-grant shape rejected by name. `mechanisms (1)` argues in its own challenges section that a stability streak is *not* the same as paying for surviving to a date, and that the original rejection may have been too broad.

## B17. Sell incident insurance with a premium and a deductible
- **Source:** `lockstate-economy-progression-design (1).md` — "4. Incident insurance with deductible"
- **Mechanic:** The prison may pay a recurring premium. After an assault, riot, escape attempt or gang retaliation, insurance pays a capped repair or wage bridge, but only if the player pays a deductible. Premiums rise after incidents and fall after a clean streak.
- **Reuses:** the four incident types, the day boundary, the treasury, arrears, deterministic counters.
- **Player now optimises:** cash-flow stability against long-run cost, and whether a small prison should self-insure.
- **Accepted cost:** premiums drain a tight budget; repeated incidents become progressively more expensive.
- **Build size:** small — a policy record and a settlement handler; no new incident machinery.
- **Status:** NEW. Worth noting it presupposes incidents have a *cash* cost to insure against, which today they do not — so it needs B14 or B15 or an incident fine underneath it to insure anything.

## B18. Fine every successful escape
- **Source:** `Lockstate_Economy_Progression_Design_Response.md` — "16. Escape Penalties"
- **Mechanic:** Each successful escape costs −500 and reduces reputation (see B59).
- **Reuses:** the incident system's escape-attempt type, security sectors.
- **Player now optimises:** spending on security rather than pure profit.
- **Accepted cost:** "escapes can be hard to predict" — i.e. the source concedes the player may not be able to move the rate.
- **Build size:** small — escapes are already recorded.
- **Status:** NEW, and directly disputed inside this batch: `grok economy propo.md` lists incident fines under "what not to build", because "they double-punish a rate the player currently cannot move".

## B19. Lock a refundable safety bond at every admission
- **Source:** `lockstate-economy-progression-design (1).md` — "2. Safety-bond deposits"
- **Mechanic:** Every admission temporarily locks a bond in the treasury. The bond is returned when the prisoner leaves if the prison stayed below an incident or unmet-need limit; otherwise part is forfeited. High-risk admissions require a larger bond. The document's own safer prototype: make bonds small, refundable, and visible only as "reserved funds", then check whether players actually change admission choices — and remove it if they do not.
- **Reuses:** admission, risk tiers, incidents, needs, the treasury, the sentence-exit path, arrears.
- **Player now optimises:** prisoner selection, cash reserve, and whether to accept a risky population during a cash crisis. Gives loans a concrete use rather than a generic "borrow when short" button.
- **Accepted cost:** the bond is unavailable working capital and incidents convert directly into financial loss; a safe prison earns less immediate liquidity. The document's own risk: admissions start to feel like a financial transaction rather than custodial management, and high-risk prisoners may become mathematically rejected every time.
- **Build size:** small to medium — a per-prisoner ledger entry and settlement at release.
- **Status:** NEW. This is `design (1)`'s nominated least-sure-most-interesting idea.

## Prison labour: turning the 1,000-tick work window into a producer

## B20. Pay labour credits at the day boundary for work/education ticks
- **Source:** `grok economy propo.md` — "4. Labour credits at the day boundary"; `lockstate-economy-progression-mechanisms (1).md` — "6. Laundry / kitchen / workshop labour output as secondary income" and "16. Regime-block education / work completion grants"; `Lockstate_Economy_Progression_Design_Response.md` — "12. Time Efficiency Bonuses"
- **Mechanic:** `grok` gives the implementable version: each prisoner who spent at least **400 ticks** of the day's work/education blocks inside a room permitting `work` or `education` (`kitchen`, `laundry`, `classroom`) generates one labour credit; credits pay a second income line at the day boundary at a rate **R in the 25–40 band** (far below 300); ticks spent in `free-association` during a work-scheduled block generate zero; the status strip shows `employed N / idle N` at the end of each work block, and an alert fires if a work block elapsed with idle > 0 and no work room in reach. `mechanisms (1)` #6 varies it: output (uniforms cleaned, meals beyond need, simple goods) is sold automatically at the day boundary, quantity scaling with successful work ticks and capped by object-derived room capacity. `mechanisms (1)` #16 is the smallest variant: a tiny credit for completing an uninterrupted work or education block. `Response` #12 pays a bonus if prisoners spend more than X% of time in work/education rooms instead of `free-association`.
- **Reuses:** the regime blocks and the `work` / `education` / `free-association` categories, `kitchen` / `laundry` / `classroom` (already routable), the day-boundary ledger, Decision 3's named-but-unbuilt prison-labour line, alerts, the status strip.
- **Player now optimises:** the 1,000-tick work window against meal/hygiene/recreation time, and whether a prison without work rooms is worth running. Employment rate becomes a second visible axis on the same day.
- **Accepted cost:** `grok`: "more working prisoners" is still a child of "more prisoners", so R must be low enough that skipping a shower block to farm labour is a question and not a policy; kitchen will double-dip once B21 exists, so kitchen should pay lower or pay in portions rather than cash. `mechanisms (1)`: labour income stays small and never replaces the per-prisoner-day grant; incidents that interrupt work still hurt.
- **Build size:** small — a per-prisoner tick counter, one ledger line, one HUD number. `grok` explicitly says to do the cheap counter and *not* the job-system bind for the first version (but see B26).
- **Status:** NEW in implementation; the *line* itself is ALREADY DECIDED (Decision 3 names prison labour as a secondary line that does not exist).

## B21. Make kitchen labour produce the meal portions the canteen consumes
- **Source:** `grok economy propo.md` — "9. Kitchen labour feeds the meal block"
- **Mechanic:** Each **50 prisoner-ticks at a `stove`** during a work block produces one meal-portion, stored as an integer on the `fridge` in that kitchen (no job-system carry needed). A `meal` block in a `canteen` satisfies hunger **only by consuming a portion**. Portions left at the day boundary spoil and increment filth (B45). Soft landing so a new player is not in a silent famine: a meal block with zero portions satisfies hunger at half rate. Worked example given: twelve prisoners need 12 portions ≈ 600 stove-ticks, which fits inside the 1,000-tick window with room for laundry, but does not fit if everyone is also in a classroom.
- **Reuses:** `kitchen`, `stove`, `fridge` (and `item-storage` as a flag on it), `canteen`, the `meal` regime block, the hunger need, day-boundary accounting.
- **Player now optimises:** the work window as a *provider of a different need* rather than only as cash — kitchen versus laundry versus classroom becomes a real pie.
- **Accepted cost:** a new counter and a new way to fail hunger that looks like a bug unless the HUD says `portions 0`. Explicitly: do not add a purchased food material — "prisoner labour *is* the food supply".
- **Build size:** small-medium — a counter, consume-on-meal, spoil-at-boundary, one status number. No physical trays.
- **Status:** NEW.

## B22. Make laundry produce clean-kits that halve hygiene decay
- **Source:** `grok economy propo.md` — "10. Laundry slows the hygiene a short sentence cannot finish"
- **Mechanic:** Each **80 prisoner-ticks at a `washing-machine`** during a work block produces one clean-kit. A clean-kit assigned to a prisoner **halves hygiene decay for that day** — a rate change, not a fill. Short-sentence prisoners still cannot max hygiene (the 10,200-tick requirement stands), but a laundry prison withholds less and a long-sentence prisoner can actually reach contentment. No kit: decay as today.
- **Reuses:** `laundry`, `washing-machine`, the hygiene need and its 10,200-tick provision requirement, work blocks.
- **Player now optimises:** whether work time buys hygiene-competence, kitchen portions, classroom eligibility, or cash — and it makes long-stay prisoners a different asset from short-stay ones.
- **Accepted cost:** if the rate change is too strong, laundry becomes a 40/day withhold-avoider you always build at twelve prisoners. Keep it half-decay, never a full provision, and never let laundry satisfy hygiene during the work block itself or the hygiene regime block goes dead.
- **Build size:** small — a counter and a decay modifier.
- **Status:** NEW. Also takes an explicit position on the brief's undecided question: unmeetable hygiene is the point *without* laundry.

## B23. Gate work rooms by risk tier unless the sector is covered
- **Source:** `grok economy propo.md` — "5. Work rooms consume risk"
- **Mechanic:** `kitchen` and `laundry` accept prisoners only at or below a risk threshold unless the room's sector reads `Covered`. A high-risk prisoner in an uncovered kitchen zeroes that room's labour credits for the day and rolls an extra contraband chance (stoves). `classroom` accepts any risk. Each work room carries a single toggle, default "low-risk only", readable on the Build/Security tab.
- **Reuses:** risk tiers, sector coverage, contraband-at-admission and sweep duty, `kitchen`/`laundry`/`classroom`, labour credits (B20).
- **Player now optimises:** who goes into which work room, and whether a work room is worth a guard post. The document calls it "the first reason to prefer one prisoner over another that is not a one-off payment".
- **Accepted cost:** without the toggle, prisoners path into the kitchen themselves and the rule is an invisible gotcha — so the toggle is new chrome. If risk tiers do nothing else, high-risk prisoners become people you warehouse and refuse at intake, which is only acceptable if B35 and B37 exist to make refusal a decision rather than a default.
- **Build size:** medium — a room flag plus a check in the router; the cost is the toggle UI, not the logic.
- **Status:** NEW. One of the few entries in the batch that consumes risk tiers *continuously* rather than paying a one-off at admission.

## B24. Sign timed production contracts against the work blocks
- **Source:** `Lockstate_Economy_Progression_Design_Response.md` — "2. Prison Labour Contracts"; `lockstate-economy-progression-design (1).md` — "9. Work throughput and delivery contracts"
- **Mechanic:** `Response`: the player signs a contract such as "produce 100 units in 5 days"; production runs on the existing `work` regime blocks in existing rooms; completion pays. `design (1)` makes the physical version: bind rooms to the existing job containers, represent a workshop initially by designating a `classroom` or `common-room` for work, have prisoners carry containers to a delivery bay, and pay a modest amount (or a future material discount) per completed batch.
- **Reuses:** the `work`/`education` regime blocks, `kitchen`/`laundry`/`classroom`/`common-room`, the complete job system (board, workers, containers, carry legs, reservations, pathfinding), `delivery-bay`, the global inventory.
- **Player now optimises:** `Response`: organising efficient labour rather than merely holding prisoners. `design (1)`: physical layout, route length, worker allocation, and whether work time buys income or stability.
- **Accepted cost:** `Response`: contracts can fail when prisoners are unavailable through incidents or riots. `design (1)`: work competes with education and recreation, and bad layouts produce visible throughput loss and delivery congestion.
- **Build size:** medium — `Response` says contract UI plus a progress counter; `design (1)` says the job system is already tested and the real work is binding room instances and defining one batch recipe.
- **Status:** NEW. Overlaps B20 (the credit version) and B26/B48 (the bind); a contract deadline is the distinct part.

## B25. Turn kitchen and laundry into reliability obligations, not income
- **Source:** `lockstate-economy-progression-design (2).md` — "18. Laundry and kitchen reliability contracts"
- **Mechanic:** Rather than a new income source, a contract requires meals delivered or clean clothing available over a rolling period; failure increases payment withholding or cancels the next premium. Kitchen/stove and laundry/washing-machine capacity become meaningful bottlenecks. Use coarse daily aggregates rather than item-level simulation initially.
- **Reuses:** `kitchen`, `stove`, `canteen`, `laundry`, `washing-machine`, object-derived room capacity, needs, the regime, the withholding schedule.
- **Player now optimises:** service throughput per room footprint — whether to build redundant capacity or run a fragile operation.
- **Accepted cost:** more bookkeeping, and the risk of turning room capacity into busywork.
- **Build size:** small-medium — two counters, capacity checks, contract conditions.
- **Status:** NEW. It is B21/B22 stated as an obligation instead of a production chain; cheaper, and less interesting, because nothing physical is produced.

## B26. Make prisoners in work blocks the workers the job system already has
- **Source:** `grok economy propo.md` — "The idea I am least sure about and think is most interesting"
- **Mechanic:** Bind the finished job system to live rooms and let a prisoner in a work block *be* a worker. Kitchen portions (B21) become a job against a stove; clean-kits (B22) a job against a washing-machine; filth (B45) a carry from canteen to `garbage-room`; a plank (B48 rung B) a carry from `delivery-bay` to `storage-room`; classroom time (B39) a job producing a classification-eligibility token. The 1,000 ticks become a labour *budget* for the institution rather than a boolean "was employed today". Explicitly: B20 should then be implemented **as job completion**, not as a tick-in-room boolean, so the fake producer is not built and thrown away.
- **Reuses:** essentially everything the brief lists as unused — the job board, workers, containers, carry legs, reservations, pathfinding, the nine operations rooms as sources and sinks, the regime pie, named RNG only where a job fails.
- **Player now optimises:** "the day they published versus the day that actually happened" — who was in the kitchen when the portions needed doing, who was carrying a plank when the bed was queued, who was in `free-association` because no job was in reach.
- **Accepted cost:** binding a job system tested on fake rooms to live room instances "will surface every reservation, pathfinding and 'why is that plank in a wall' bug the teleport inventory has been concealing". Construction and feeding will both feel slow. A stuck job can strand a new player in a new way. It can also collapse into a workshop min-max that is Prison Architect's labour layer with a different coat — the failure the brief asked to avoid.
- **Build size:** large — and the document says explicitly it is the wrong thing to build first and the right thing to build toward; fallback is B20's counter plus B48 rung A.
- **Status:** NEW.

## B27. Tax idleness during work-scheduled free-association
- **Source:** `lockstate-economy-progression-mechanisms (1).md` — "3. Free-association → low-value labour sink"
- **Mechanic:** During `free-association` blocks, prisoners with no assigned work room incur a small "idle tax" deducted from the daily grant — **10–20 minor units per idle prisoner**. Alternative or addition offered: free-association slowly raises a new "boredom" need that feeds the existing 40-per-unmet-need withholding schedule.
- **Reuses:** regime blocks and action categories, the unmet-need withholding schedule (300 → 60 floor), day-boundary income.
- **Player now optimises:** filling the work/education windows that already exist instead of letting prisoners idle.
- **Accepted cost:** it punishes the current default path — a player who has not yet built a work room simply loses income.
- **Build size:** small — the regime already knows the block type and whether a prisoner has a work target.
- **Status:** NEW. Note the "boredom need" variant adds a seventh need, which contradicts the batch's own advice elsewhere (`grok`: "Do not add a health need — a boolean is the whole model") and would change the withhold arithmetic the brief documents.

## Regime and needs

## B28. Make free-association a measurable social buffer against incidents
- **Source:** `lockstate-economy-progression-design (2).md` — "7. Free-association as a measurable social buffer"; `lockstate-economy-progression-design (1).md` — "8. Free-association as a controlled outlet"
- **Mechanic:** `free-association` reduces a short-lived tension / incident-pressure value rather than satisfying any need — implemented either as a direct incident-probability modifier or as a minimal stress accumulator the incident system consumes. `design (1)` conditions it on access to a `common-room`, `yard` or suitable object, and adds that excessive free-association without work or education raises idleness-related incident pressure. A prison that converts all work blocks to free-association gets safety and no output.
- **Reuses:** the existing `free-association` regime category, room routing, `common-room`, `yard`, objects, incidents, named RNG streams, the HUD incident count.
- **Player now optimises:** work output against social stability — regime balance becomes a real choice instead of a schedule with a dead slot.
- **Accepted cost:** if tuned too strongly, free-association becomes a mandatory safety valve and dominates work time; the mitigation offered is to limit its effect, let crowding reduce its efficiency, and expose the trade-off on the HUD.
- **Build size:** small — one counter or modifier, one regime hook, one deterministic adjustment to the incident calculation.
- **Status:** NEW. This is `design (2)`'s nominated least-sure-most-interesting idea.

## B29. Roll for visits during free-association
- **Source:** `grok economy propo.md` — "16. Visits happen in `free-association` or they do not happen"; `lockstate-economy-progression-mechanisms (1).md` — "21. Family / external pressure via 'visit' regime block (light)"
- **Mechanic:** During `free-association` blocks, each prisoner in a `common-room` or `yard` with spare capacity rolls once on a named RNG stream for a visit. A visit provisions a burst of recreation and a small burst of safety — enough to matter for a short sentence, not enough to replace a `recreation` block for a long one. Visit chance is halved if any incident fired in the last two days, and halved again if no `reception` exists. An all-work regime, or a lockdown that cancels free-association, means zero visits. `mechanisms (1)`'s version makes it a rare special day where a fraction of prisoners become visit-eligible, satisfied in a common-room or yard with enough benches, and a failed visit adds a short-term mood penalty feeding incidents.
- **Reuses:** `free-association`, `common-room`, `yard`, `reception`, benches, the recreation and safety needs, incidents, named RNG streams, Decision 5's area-derived yard capacity.
- **Player now optimises:** the regime pie — free-association becomes the short-sentence prisoner's only realistic route to recreation. "Work-camp (labour cash, no visits) versus visit-camp (withholds down, labour down)" is a second axis that is not headcount.
- **Accepted cost:** if the burst is too large, free-association strictly dominates the `recreation` block and the yard becomes a visit farm. Explicitly: do not spawn family NPCs, do not add a visit room — the roll is the whole mechanic. `grok` notes it deliberately leaks the unmeetable-recreation wall without demolishing it.
- **Build size:** small — a roll at block start, a provision burst, a chance modifier. (`mechanisms (1)` rates its variant medium.)
- **Status:** NEW. Depends on Decision 5 (yard capacity from floor area); `grok` adds "do not put a bench requirement on the yard", which directly contradicts `mechanisms (1)`'s bench requirement.

## B30. Ship named regime templates that state their trade-off
- **Source:** `lockstate-economy-progression-design (1).md` — "18. Regime templates with measurable trade-offs"; `lockstate-economy-progression-design (2).md` — "6. Regime as a service-level choice"
- **Mechanic:** Two or three presets that only rearrange existing blocks: production/economy (more of the existing window to `work`), rehabilitation/recovery (more hygiene, recreation, sleep), stability/security (controlled free-association or sweep windows). Each preset displays its predicted effects — work hours, education access, likely need fulfilment, incident pressure — and `design (2)` attaches a measurable state-payment modifier or contract-eligibility requirement to each. Custom schedules remain available.
- **Reuses:** regime blocks, the seven action categories, the six needs, the existing Regime tab, income withholding, incidents, `classroom`.
- **Player now optimises:** a coherent operating philosophy instead of editing isolated blocks with no feedback.
- **Accepted cost:** every template worsens something and says so — production loses leisure and need recovery, stability loses work, rehabilitation consumes scarce classroom time.
- **Build size:** very small — UI presets plus the existing regime evaluation; no new pathfinding.
- **Status:** NEW, but on rule 3 it is only a decision if some other mechanism gives the blocks consequences (B20, B27, B28, B29). On its own it is a preset menu over a schedule where `free-association` fulfils nothing.

## B31. Pay a rolling bonus for sustained need service (accreditation)
- **Source:** `lockstate-economy-progression-design (1).md` — "6. Per-needs quality bonus"; `lockstate-economy-progression-design (2).md` — "8. Need-service accreditation"
- **Mechanic:** Keep the 300 income and the 40-per-need withholding exactly as they are, and add a payment for *sustained* prison-wide average need fulfilment measured on a rolling window — `design (1)` pays it monthly or at a threshold; `design (2)` instead awards a visible daily accreditation status which gates better intake contracts and occasional quality grants, while failed accreditation raises inspection and incident pressure. Both insist the target must be attainable given that hygiene, recreation and safety cannot be maxed inside a normal sentence.
- **Reuses:** the six needs and their existing aggregation, the withholding calculation, the day boundary, the threshold-grant path, the Overview HUD, contracts.
- **Player now optimises:** reliable service quality and regime design rather than merely avoiding the 60 floor.
- **Accepted cost:** chasing the bonus may need rooms and staff whose wages exceed the reward, so the player must decide how much quality is economically rational (`design (1)`); it may turn needs into a checklist (`design (2)`, mitigated by a rolling score and competing regime templates).
- **Build size:** small — reuse existing need aggregation plus a rolling window and two statuses.
- **Status:** NEW.

## B32. Give partial credit for provision on the three unmeetable needs
- **Source:** `lockstate-economy-progression-mechanisms (1).md` — "7. Hygiene / recreation / safety 'long-need' partial credit"
- **Mechanic:** Hygiene (10,200 ticks), recreation (13,600) and safety (20,400) keep decaying and keep contributing to the withhold, but every continuous provision tick above a low threshold awards a tiny "compliance credit" that reduces the next day's withholding or slightly raises that prisoner's effective grant floor. Partial satisfaction acquires an economic signal instead of being pure futility.
- **Reuses:** the six needs, the 300 → 60 withholding schedule, day accounting.
- **Player now optimises:** whether to build shower-room / yard / common-room early even though full satisfaction is impossible.
- **Accepted cost:** the credit must stay small or players chase perfect long-need coverage at the expense of cells; the original tension ("three needs cannot be met") is preserved but stops being pure loss.
- **Build size:** small — the per-prisoner need accumulator already exists; add one scalar to the withholding calculation.
- **Status:** NEW. Directly answers the brief's open question ("nobody has decided whether that is a bug or the point") with "the point, but it should not be silent".

## B33. Add a second penalty when most of the population is badly neglected
- **Source:** `Lockstate_Economy_Progression_Design_Response.md` — "3. Unmet Needs Penalties (Enhanced)"
- **Mechanic:** On top of the existing 300 − 40-per-unmet-need line, apply an additional penalty of about −50/day if more than 50% of prisoners have more than 3 unmet needs.
- **Reuses:** the six needs, already measured per prisoner; the day-boundary income calculation.
- **Player now optimises:** population count against care quality.
- **Accepted cost:** "lower profit, but more realistic simulation" — the source gives no design cost.
- **Build size:** small — needs are already counted; add a multiplier.
- **Status:** NEW, but note it partly defeats the 60 floor that Decision 2's recovery story leans on. `design (2)` reaches the opposite conclusion about the same floor — see the challenges section.

## B34. Draw short-term need objectives the player can accept
- **Source:** `lockstate-economy-progression-design (1).md` — "7. Needs-specialisation contracts"; `Lockstate_Economy_Progression_Design_Response.md` — "5. Weekly Goal Grants"
- **Mechanic:** `design (1)`: optional state objectives such as "maintain hygiene for 90% of prisoners for three days" or "keep recreation unmet for fewer than two prisoner-days"; rewards pay only on success, and failure merely reduces the next offer rather than triggering any loss. `Response`: every five game days a goal is drawn — "0 incidents", ">80% prisoners with <2 unmet needs", "100% occupancy" — and completion pays a grant.
- **Reuses:** the six needs, regime blocks, `shower-room` / `common-room` / `yard`, the incident and occupancy counters, the threshold-grant path, alerts.
- **Player now optimises:** which need to prioritise when rooms, time and cash are all short; planning a week ahead rather than reacting.
- **Accepted cost:** specialising in one need worsens another, and an objective can tempt a player into building before they can afford it (`design (1)`); goals get harder at large populations (`Response`).
- **Build size:** small to medium — objective evaluation plus a contract/goal display.
- **Status:** NEW, with a caution: `Response`'s "100% occupancy" goal pays for exactly the packing behaviour Decision 1 says must be punished.

## Prisoner composition: making risk tiers and sentence length matter

## B35. Show the intake queue and let the player accept or delay
- **Source:** `grok economy propo.md` — "17. Intake is a choice, shown before it becomes an occupied place"
- **Mechanic:** Each day a queue of 1–3 candidate prisoners is visible with risk tier, sentence length, and whether contraband already rolled. Two commands: accept, delay. Accepted prisoners go to reception processing (B44) or straight to a bed/holding. Delayed candidates expire after 2 days. Empty beds cost nothing. Threshold grants count accepted occupied places, never expired candidates.
- **Reuses:** risk tiers, the per-prisoner sentence draw, contraband-at-admission, `reception`, the threshold-grant path, alerts, the refusal band for a full queue.
- **Player now optimises:** who to take. "'Prefer one prisoner over another' becomes a button" — a high-risk long sentence is a labour/incident project, a low-risk short sentence is a grant-chaser who will never be content.
- **Accepted cost:** new chrome on a UI that does not have much. If a player can wait indefinitely for low-risk, they will — unless high-risk carries a bounty (B37), the queue dries up, or a threshold grant is one prisoner away. Cap the delay, never cap accept, and **do not add a vacancy penalty** because it would fight Decision 1 and restore packing as the fix.
- **Build size:** medium, entirely because of UI — the data is already on the record at admission.
- **Status:** NEW. Prerequisite for most of the "prefer one prisoner over another" family in this batch.

## B36. Attach contract variants to individual intakes
- **Source:** `lockstate-economy-progression-design (2).md` — "3. Prisoner intake contracts"; `lockstate-economy-progression-design (1).md` — "3. Risk-adjusted contracts"
- **Mechanic:** At each intake opportunity, offer a small deterministic set of contract variants attached to the incoming prisoner — standard, urgent high-risk, short-term overflow, rehabilitation placement — each altering the **intake payment** and its obligations (inspection burden, incident exposure, minimum service expectation, deadline). The daily per-place payment is untouched. `design (1)`'s version is a visible queue of state contracts that expire after a short window: low-risk pays less with predictable needs, high-risk pays more with security and incident exposure.
- **Reuses:** risk tiers, sentence lengths, classification records, contraband-at-admission, incidents, security coverage, the threshold-grant path, the existing refusal band.
- **Player now optimises:** population *composition* and timing rather than bed count — comparing expected payment against guard wages and risk.
- **Accepted cost:** decision complexity and the risk of a dominant contract; offers must be bounded by current capacity with an explicit downside (`design (2)`). Attractive contracts can destabilise an otherwise safe prison, while refusing them leaves capacity idle (`design (1)`).
- **Build size:** medium — contract data, intake UI, deterministic offer selection, contract fields on the prisoner record, a day-boundary settlement check.
- **Status:** NEW. B35 is the free half of this (a queue with accept/delay); B36 adds the payment terms.

## B37. Pay a small one-off admission bounty scaled by risk tier
- **Source:** `grok economy propo.md` — "18. Admission bounty by risk, one-off, small"; `lockstate-economy-progression-mechanisms (1).md` — "2. Risk-tier intake premium + classification review reward"; `lockstate-economy-progression-design (2).md` — "4. Risk-tier service premiums"
- **Mechanic:** On the tick a prisoner becomes an occupied place, pay a one-off scaled by risk: high-risk large (the state is unloading them), low-risk near zero, using the same payment path as threshold grants. `grok` sets the ceiling explicitly at **two or three days of 300 for the most dangerous tier**, never a fourth income line. `mechanisms (1)` adds a second small bonus when a scheduled classification review raises or confirms a tier. `design (2)` makes the premium **conditional**: it pays only if the player meets a security-service condition such as full sector coverage plus a completed sweep duty, and failure converts the premium into a penalty or cancels it.
- **Reuses:** the occupied-place event, risk tiers, the global classification-review schedule, security deployment and coverage states, sweep duty, the grant payment path, Decision 3.
- **Player now optimises:** risk-adjusted margin — taking the dangerous prisoner is cash now against an incident later. It also counterweights B35's cherry-picking.
- **Accepted cost:** `grok` is blunt — packing high-risk becomes the optimum unless B6, B14 and B15 have first made incidents and unguarded safety cost money, so **do not ship this before those**; and two one-offs at intake (bounty plus threshold grant) can feel like "the state pays you to exist", so keep it small enough that it changes *which* prisoner, not *whether*. `mechanisms (1)`: the premium must not fully compensate the trouble or the optimum collapses to "only max tier". `design (2)`: risk tiers become economically legible and can tempt dangerous escalation.
- **Build size:** tiny once the grant path exists (`grok`, `mechanisms (1)`: "almost free"); `design (2)`'s conditional version adds a tier-to-premium table and a condition evaluator.
- **Status:** NEW.

## B38. Band intake offers by sentence length
- **Source:** `lockstate-economy-progression-design (2).md` — "5. Sentence-duration planning"
- **Mechanic:** Group intake offers into short-stay, standard and long-stay. Short-stay gives faster turnover and eligibility for recurring intake thresholds; long-stay gives stable occupancy but ties up beds and accumulates larger need pressure. No new population income rule is added.
- **Reuses:** sentence ticks, the 200,000-tick long-sentence classification threshold, occupied places, threshold grants, the global classification-review scheduler.
- **Player now optimises:** turnover against stability — including whether to keep a bed free for a lucrative threshold or fill it with reliable occupancy.
- **Accepted cost:** players may simply reject long sentences and lose the intended scale fantasy, so long-stay offers need a modest, visible stability advantage.
- **Build size:** small — sentence bands, intake labels, a few offer modifiers.
- **Status:** NEW. Note it presupposes B35/B36 (there is no intake choice today).

## B39. Let classroom time buy the classification review most sentences never reach
- **Source:** `grok economy propo.md` — "6. Education buys the classification review eight of fifteen sentences never see"; `lockstate-economy-progression-design (2).md` — "17. Education as a sentence-timed investment"; `Lockstate_Economy_Progression_Design_Response.md` — "15. Rehabilitation Programs"
- **Mechanic:** `grok`: a prisoner who accumulates **5,000 ticks in a `classroom` during `education` blocks** (~5 days of actually using the window) becomes eligible for classification review regardless of sentence length. A review that *lowers* risk pays a one-off on the grant path — kept "in the region of one or two days of 300" — and changes what B23 will let them do; a review that does not lower risk pays nothing and reschedules. `design (2)`: classroom attendance produces a qualification progress counter; a prisoner released before completion yields nothing, and completion improves the next intake offer, reduces a service obligation, or grants a one-off — explicitly *not* an increase to daily income. `Response`: pay a fee to run an education or therapy programme and receive a bonus on release if the prisoner completes it.
- **Reuses:** `classroom`, the `education` category, the classification-review scheduler and its per-record eligibility, risk tiers, the grant payment path being built for threshold grants, sentence ticks.
- **Player now optimises:** education versus work in the 1,000-tick window, and short versus long sentences — a short sentence can be educated into a review it would never reach on the global clock. Also: which prisoners get scarce classroom capacity.
- **Accepted cost:** if the one-off is large, `classroom` becomes a money room and labour dies (`grok`); if reviews have no other consumer, this is "a lock on an open door with a gift attached", so it must be paired with B23 or B6. `design (2)`: exploitable by parking prisoners in classrooms, so require attendance time and a completion threshold.
- **Build size:** small-medium — a tick accumulator hooked into the existing eligibility check. No new scheduler.
- **Status:** NEW. This is the batch's answer to the brief's "eight of fifteen drawable sentence lengths can never be reviewed at all".

## B40. Pay a release score when a sentence ends
- **Source:** `grok economy propo.md` — "20. Release score is a one-off that makes the unmeetable needs a long-stay project"; `lockstate-economy-progression-design (1).md` — "19. Cohort release bonuses"; `Lockstate_Economy_Progression_Design_Response.md` — "7. Clean Release Bonuses"
- **Mechanic:** `grok`: at sentence end compute a one-off grant (or nothing — **never a fine**) from how many of the six needs are currently met. A short-sentence prisoner with hygiene, recreation and safety dark gets a token or nothing; a long-sentence prisoner who went through coverage, laundry, visits and a classroom can leave with four or five met and pay something in the region of a small threshold grant. `design (1)` pays it per cohort against a quality record (low incident exposure, acceptable needs, completed education or work participation), settled at release rather than admission. `Response` pays a flat **50–100** when a prisoner completes their sentence without involvement in any incident.
- **Reuses:** the sentence-end/release path, the six needs and their 10,200 / 13,600 / 20,400 provision numbers, incidents, education and work participation, the grant payment path.
- **Player now optimises:** long-stay as a craft against short-stay as a volume business; sentence length — a number almost nothing consumes — becomes a preference. `design (1)`: prisoner outcomes and record management rather than merely keeping people alive until departure.
- **Accepted cost:** if the grant is large the player refuses short sentences and the early game (all short) never sees it, so keep it a bonus nobody budgets around (`grok`). The reward is delayed and one late incident can erase it after the costs were already paid (`design (1)`). `Response`: keep it small or players hoard "good" prisoners. `grok` adds two hard rules: the one-plank exploit would farm this so B4 must exist first, and a *fine* on a bad release is a tax on time passing — the block-grant shape rejected by name.
- **Build size:** small — one number on the existing release path in the day-boundary ledger.
- **Status:** NEW.

## B41. Offer parole: take the money now, lose the annuity
- **Source:** `grok economy propo.md` — "21. Parole is a classification review you can take the money on"
- **Mechanic:** A classification review on a prisoner past 50% of their sentence may offer parole: they leave immediately, the release score (B40) pays at once, and the remaining occupied-place income is gone. Implemented as a prison-wide policy with three values — `parole eligible`, `never`, `low-risk only` — defaulting to `never`, so a player who never touches it has exactly the game they have now.
- **Reuses:** the classification-review scheduler, sentence length, risk tiers, the release path, B40, and B39 for the sentences that would otherwise never review.
- **Player now optimises:** cash now against 300/day later — a treasury decision, especially under loans and a negative balance. "The first time 'this prisoner' is a financial instrument."
- **Accepted cost:** another policy control; and if B39 is unbuilt, parole is rare because eight of fifteen sentence lengths never review — which the document treats as an argument to build B39 first, not to skip parole. The `never` default is load-bearing: without it every review becomes a pop-up.
- **Build size:** small, given B39 and B40 — a policy enum and a branch on the review outcome.
- **Status:** NEW.

## B42. Let the player request a prisoner transfer for a fee
- **Source:** `lockstate-economy-progression-design (1).md` — "17. Prisoner transfers as risk management"
- **Mechanic:** The player can request transfer of one prisoner or a small group, subject to a cooldown and a fee. It removes a problematic risk profile or frees a scarce bed. A transfer can also be granted as a reward for strong inspection performance.
- **Reuses:** the admission and release pathways, risk tiers, occupied places, contracts, the treasury, incident records.
- **Player now optimises:** roster composition, and the value of a bed occupied by a difficult prisoner.
- **Accepted cost:** the fee plus the lost income makes it a real decision; transferring too often prevents stable growth.
- **Build size:** medium — reuse admission/release bookkeeping with a new command and a cooldown.
- **Status:** NEW.

## B43. Grant a bonus for a mixed-risk roster
- **Source:** `Lockstate_Economy_Progression_Design_Response.md` — "14. Prisoner Diversity Grants"
- **Mechanic:** If the prison holds prisoners across different risk categories (low, medium, high), pay a grant.
- **Reuses:** the risk-tier classification system.
- **Player now optimises:** in principle, not accepting only "easy" prisoners — but there is no accept/refuse mechanism in the simulation today, so without B35/B36 underneath it this optimises nothing the player controls. Closer to decoration than to a decision as written.
- **Accepted cost:** stated only as "high-risk prisoners generate more incidents", which is a property of the world rather than a cost of the mechanic.
- **Build size:** small — classification already exists.
- **Status:** NEW, weak — and dependent on an intake-choice mechanism that does not exist.

## The nine dead rooms, read rather than redesigned

## B44. Make reception the intake clock before a prisoner earns
- **Source:** `grok economy propo.md` — "19. Reception is the intake clock, with a tutorial hole"; `lockstate-economy-progression-mechanisms (1).md` — "11. Reception intake processing delay"
- **Mechanic:** New accepted prisoners spawn unprocessed at `reception` (or at the map edge, more slowly, if none exists). They are **not occupied places** until a guard spends **100 ticks** there — the same constant as delivery delay, on a duty cloned from sweep. Unprocessed prisoners decay needs and can start incidents. A `desk` in reception halves the ticks. Crucially, **the first 5 prisoners of a new prison auto-process**, so the very low first threshold grant is not gated on a room a new player has not built. `mechanisms (1)`'s variant makes the contraband search forced during this window and applies a one-day grant penalty (or higher initial unmet needs) if no reception exists.
- **Reuses:** `reception`, `desk`, sweep duty as a template, the occupied-place definition, admission contraband chance (10–20%), incidents, threshold grants' "first threshold very low".
- **Player now optimises:** guard time split between coverage and throughput. Growth stops being free — it costs a post. Reception stops being an ornament that eats part of the 9,945.
- **Accepted cost:** a new player without the tutorial hole never crosses 10, so **the hole is load-bearing**. 100 ticks at 20 Hz is 5 real seconds per prisoner, which is nothing individually and a lot if ten arrive the same day — so intake cadence must stay small (B35). `mechanisms (1)`: a throughput bottleneck on intake; large arrival waves back up.
- **Build size:** medium — a duty, a flag on the prisoner record, the five-prisoner exemption.
- **Status:** NEW.

## B45. Accumulate filth that only a garbage-room resets
- **Source:** `grok economy propo.md` — "11. Garbage-room is the spoil sink"; `lockstate-economy-progression-mechanisms (1).md` — "12. Garbage-room / waste-bin sanitation pressure"
- **Mechanic:** Kitchen spoil (B21), laundry and canteen use increment a filth integer on those rooms. At the day boundary: if a `garbage-room` with a `waste-bin` (`waste-disposal`) exists, filth resets; if not, filth increments. Filth above zero applies one extra unmet-need-equivalent withhold (hygiene) to every prisoner who used that room that day. `grok` gives two rungs explicitly: ship the cheap boolean first (existence of the bin resets everything, no carry), and upgrade later so that a prisoner-work or job-system **carry** from kitchen to garbage-room is what resets it. `mechanisms (1)` proposes the same accumulator raising hygiene decay rate or adding an unmet-need point, cleared by a job or a guard action.
- **Reuses:** `garbage-room`, `waste-bin`, `waste-disposal`, `kitchen`/`canteen`/`laundry`, the hygiene need, the withholding schedule, optionally the job system.
- **Player now optimises:** an operations room against another cell — "the `operations` / `logistics` category finally taxes you for ignoring it, on the line the player already watches".
- **Accepted cost:** filth is a new accumulator; the cheap boolean is admittedly dumb ("one bin somewhere in the prison launders all sin") and that is accepted for a first reader; the carry version must not gate the boolean. `mechanisms (1)`: another maintenance loop that can read as busywork.
- **Build size:** cheap version tiny; carry version large (it is the job-system bind, B48 rung B).
- **Status:** NEW. This is `mechanisms (1)`'s nominated least-sure-most-interesting idea, in its carry form.

## B46. Power provisioning objects from utility panels, per N, not by radius
- **Source:** `grok economy propo.md` — "13. Utility-panel powers provision objects, per N, not by radius"; `lockstate-economy-progression-mechanisms (1).md` — "13. Utility-room / utility-panel power or water soft constraint"
- **Mechanic:** Objects that provision needs (shower-head, stove, washing-machine, security-console) draw from a power pool. Each `utility-panel` in a `utility-room` (`utility-control`) powers **8** such objects; objects beyond the pool operate at half provision rate; with no panel at all, everything that provisions runs at half. No radius maths, no cable drawing, no new spatial system — expansion itself demands another panel. `mechanisms (1)`'s cheaper variant: above a low threshold of rooms or prisoners, apply a mild efficiency penalty unless a utility-room with a panel exists — a binary "utilities online" flag.
- **Reuses:** `utility-room`, `utility-panel`, `utility-control`, the provisioning objects, the half-rate pattern used in B6 and B21.
- **Player now optimises:** when the operations spine is worth a cell's budget — ignorable at 12 prisoners, a stack of 40s at 40 prisoners.
- **Accepted cost:** `grok` names the failure mode of the cheap version precisely: one panel powering the world is a binary flag that becomes decoration the moment the first closet is built, so per-N is the version that keeps asking. Radius coverage would reuse sector maths and look nicer, but it is a new spatial system "and this project deletes those when a counter would have done". `mechanisms (1)`: a soft constraint invisible until scale, so early players can ignore it.
- **Build size:** small — a count of panels against a count of provision objects, and a half-rate flag on the provisioner.
- **Status:** NEW.

## B47. Give each operations room one narrow modifier, not a new function
- **Source:** `lockstate-economy-progression-design (2).md` — "13. Operations rooms as production modifiers"
- **Mechanic:** One narrow, non-cloning function per dead room, modifying existing processes rather than adding minigames: a `storage-room` raises the usable buffer for purchased materials; a `delivery-bay` raises concurrent job throughput; a `staff-room` improves wage-arrears tolerance or reduces fatigue-related incident pressure; a `utility-room` makes `utility-control` objects affect room operating cost.
- **Reuses:** the dead rooms, the `item-storage` / `delivery-access` / `utility-control` object capabilities, job queues, wages.
- **Player now optimises:** which bottleneck to remove, rather than automatically building every room.
- **Accepted cost:** opportunity cost in floor area and construction materials.
- **Build size:** small-medium — "capability readers, room modifiers and HUD explanations; four readers are already implied by the object data".
- **Status:** NEW. This is the same programme as B45/B46/B11/B48 stated once and generically; `grok economy propo.md` supplies the specific numbers this entry leaves open.

## B48. Cap deliveries at a gate, then let the job system carry (two rungs)
- **Source:** `grok economy propo.md` — "12. Delivery-bay is a gate, storage-room is a cap — then the job system carries"; `lockstate-economy-progression-mechanisms (1).md` — "4. Job-system material deliveries (finally bind containers)"; `lockstate-economy-progression-design (2).md` — "12. Logistics throughput as a capacity axis"; `lockstate-economy-progression-design (1).md` — "10. Material handling efficiency"; `Lockstate_Economy_Progression_Design_Response.md` — "17. Logistics Utilization Bonuses"
- **Mechanic:** **Rung A (no carry, `grok`):** purchases still complete in 100 ticks, but without a `delivery-bay` they land in a gate pile **capped at 20 units** and overflow purchases are refused through the existing refusal band; without a `storage-room` the gate pile *is* the warehouse; each `storage-rack` (`item-storage`) raises the cap; sell-back pulls from this pool. A 625-brick purchase stops being a legal way to end the game **because 625 will not fit**. **Rung B (carry):** a purchase creates a container at the `delivery-bay` (`loading-dock-door` = `delivery-access`); the existing job system carries it to a `storage-room`; build orders cannot consume material that has not physically arrived; stuck jobs raise an alert. `mechanisms (1)` and `design (2)` propose rung B directly; `design (1)` adds a finite daily handling capacity at the bay with a queue, raised by a staffed or prisoner-operated logistics job; `Response` inverts it into a carrot — using the job system for transport gives a −10% build-cost bonus.
- **Reuses:** the entire tested job system (board, workers, containers, carry legs, reservations, pathfinding), `delivery-bay`, `loading-dock-door`, `storage-room`, `storage-rack`, `delivery-access`, `item-storage`, the 100-tick delivery, cancellable purchases, sell-back, alerts, the refusal band.
- **Player now optimises:** logistics footprint against build speed and against the 9,945 it costs to stand the operations rooms up; order timing and storage placement; construction scale becomes a layout problem, which it is not today.
- **Accepted cost:** rung B "will surface every pathfinding and reservation bug the teleport inventory has been sitting on"; construction that feels instant will feel slow; a plank stuck on a job can strand a new player in a new way. **`grok`: do not start with B.** Rung A carries none of that cost and already kills the 625-brick trap. `design (1)`: the global-inventory convenience disappears and poor planning delays beds into a cash-flow crisis. `Response` concedes players may not bother if teleporting is easier.
- **Build size:** rung A small (an integer cap and a refusal, shipping alongside sell-back); rung B large (`mechanisms (1)`: "binding room instances to containers … everything else is already tested end-to-end").
- **Status:** NEW. Rung A also partially addresses the recorded defect "a legal purchase can end the game". `Response`'s version is this batch's weakest form and is its own nominated least-sure idea.

## B49. Require storage-room space to be reserved by build orders
- **Source:** `lockstate-economy-progression-mechanisms (1).md` — "14. Storage-room reservation for build orders"
- **Mechanic:** Build orders that require materials reserve space in a `storage-room`. If no storage capacity is free, the order is refused or delayed until space frees. The storage-room becomes the buffer between delivery bay and construction.
- **Reuses:** `storage-room`, `storage-rack` + `item-storage`, the existing build-order material allocation/cancellation path, the job system for the later physical move.
- **Player now optimises:** storage capacity planning.
- **Accepted cost:** another room that must exist before large builds; the current global-inventory free-for-all ends.
- **Build size:** small once containers are bound (B48).
- **Status:** NEW; essentially rung A of B48 expressed as a reservation rather than a cap.

## B50. Price sell-back by material state, and allow scrapping placed objects
- **Source:** `lockstate-economy-progression-design (2).md` — "11. Material resale with delivery risk"; `lockstate-economy-progression-mechanisms (1).md` — "18. Sell-back of excess materials at a loss (already decided) + emergency scrap"; `lockstate-economy-progression-design (1).md` — "11. Sell-back loss tied to storage"
- **Mechanic:** Sell-back is already decided; these three refine the pricing. `design (2)`: delivered stock sells at a loss immediately, a queued delivery cancelled before arrival refunds better, and a completed construction can never return full material value; add a transaction delay if needed; enforce monotonic loss and deterministic fees. `mechanisms (1)`: additionally allow **scrapping placed objects** (beds, toilets) for a fraction of material cost, returning materials to inventory or to the delivery bay for sale — an exit from the 625-brick soft-lock without bankruptcy. `design (1)`: make the loss vary with storage age or congestion, so material in a proper storage room loses less value than material sitting in an exposed delivery queue.
- **Reuses:** material prices (brick 40, plank 65), the 100-tick delivery, cancellable orders, build-order refunds, the global inventory, the delivery queue, `storage-room` / `storage-rack`, the treasury.
- **Player now optimises:** just-in-time purchasing, cash liquidity against stock certainty (especially before wages or a threshold), and whether storage is worth building to protect liquidity.
- **Accepted cost:** exploit risk — repeated buy/sell loops and construction reversal — mitigated by monotonic loss and deterministic fees; the player should recover from a mistake, not arbitrage every build order. `mechanisms (1)`: sell-back at a loss means the mistake is still felt; it is not a free undo.
- **Build size:** small — two ledger paths, a sell command, validation, HUD inventory values; scrap is a small extension of the existing build-order void/refund path.
- **Status:** ALREADY DECIDED (sell-back of materials at a loss) — the state-dependent pricing, storage-age loss, and object scrapping are the new parts.

## B51. Pay a grant for putting the dead rooms to use
- **Source:** `Lockstate_Economy_Progression_Design_Response.md` — "10. Dead Room Utilization Grants"
- **Mechanic:** If the player uses dead rooms (`infirmary`, `security-office`, `storage-room`) "for new functions", pay a grant. The source's own build note concedes the prerequisite: "must add functions to dead rooms".
- **Reuses:** the nine rooms that currently do nothing.
- **Player now optimises:** nothing on its own — it is a payment conditioned on functions that do not exist yet. The document identifies the hole correctly and then proposes a grant instead of a function.
- **Accepted cost:** "grants are one-off, but encourage building" — not a cost.
- **Build size:** medium, entirely because the actual functions must be written first.
- **Status:** NEW but circular: it prices a solution rather than being one. Contrast B45/B46/B7/B44, which give those rooms readers.

## B52. Tax rooms that are built but unused
- **Source:** `Lockstate_Economy_Progression_Design_Response.md` — "13. Unused Room Taxes"
- **Mechanic:** A room built but unused (for example a `classroom` with no prisoners in it) costs about −5/day.
- **Reuses:** the room system and a usage counter.
- **Player now optimises:** not building speculatively.
- **Accepted cost:** "lower profit from inefficient buildings."
- **Build size:** small.
- **Status:** NEW, and structurally the same shape `grok economy propo.md` rejects for beds ("Do not add a vacancy penalty. It fights Decision 1 and restores packing as the fix"): a tax on unused capacity pushes toward filling every room, which is the packing optimum.

## B53. Bonus for a balanced mix of room types
- **Source:** `Lockstate_Economy_Progression_Design_Response.md` — "20. Balanced Growth Bonuses"
- **Mechanic:** If the prison is developed evenly — a similar count of each room type — pay a bonus.
- **Reuses:** the room system and a type counter.
- **Player now optimises:** nothing legible. "A similar count of each room type" is not a prison-management goal; with nine rooms that do nothing, it pays for building nine things that do nothing.
- **Accepted cost:** "bonus must be less than cost of additional rooms" — which, if true, means nobody takes it.
- **Build size:** small.
- **Status:** NEW, decoration by the brief's rule 3.

## Money, debt, and the decided-but-unbuilt list

## B54. Constrain loans so debt stays a bridge
- **Source:** `lockstate-economy-progression-design (2).md` — "10. Loans tied to a recovery plan"; `lockstate-economy-progression-mechanisms (1).md` — "20. Loan interest as soft degradation signal"; `lockstate-economy-progression-design (1).md` — "Decisions I would challenge / Loans"; `grok economy propo.md` — "What in the decided list looks wrong"
- **Mechanic:** Loans exist as offers with principal, fixed repayment and maturity. `design (2)` adds a purpose condition: the money is spent freely, but repayment increases if the prison stays over capacity or misses service accreditation. `design (1)` specifies fixed principal, interest charged at the day boundary, and a **maximum debt-service share** — exceeding it triggers the already-decided degradation ladder. `mechanisms (1)` adds a small daily interest charge on outstanding principal shown on the status strip, itself feeding the ladder. `grok` is the most restrictive: **cap concurrent loans at one**; step interest with recent incidents and with arrears so that "the quiet week is when you borrow (a decision) and the riot week is when you cannot (a decision)"; a missed payment *is* the first rung of the ladder (deliveries refused), which is already named; and do not add a second, friendlier way out.
- **Reuses:** the treasury (about to permit a negative balance), day-boundary accounting, wage arrears, the named degradation ladder, capacity compliance (B1), the status strip.
- **Player now optimises:** when to borrow versus sell material or contract the prison, and whether an expansion generates enough safe future cash flow to repay.
- **Accepted cost:** debt servicing and a possible spiral; no-game-over remains intact only if arrears visibly worsen operations. `grok`: an uncapped loan "is a block grant you repay".
- **Build size:** small — a loan record, a repayment schedule, a ledger line, a HUD arrears field.
- **Status:** ALREADY DECIDED (loans) — the caps, the interest schedule, and the tie to the ladder are the new parts.

## B55. Build the degradation ladder as a readable operating state
- **Source:** `lockstate-economy-progression-design (2).md` — "9. Service degradation ladder with a visible operating score"; `lockstate-economy-progression-design (1).md` — "Decisions I would challenge / Degradation ladder"; `Lockstate_Economy_Progression_Design_Response.md` — "11. Wage Arrears Penalties"
- **Mechanic:** Implement the already-named ladder — cash below zero reduces logistics priority or refuses new deliveries, deeper arrears halt construction, unpaid wages raise incident pressure — and show the current rung and the next trigger **in the existing refusal band**. `design (1)` adds that each rung must be actionable and reversible: "deliveries refused" should state the exact arrears and the recovery condition; "construction halted" must preserve cancellation and sell-back; unpaid staff should degrade coverage or response quality *before* producing a sudden incident spike. `Response` supplies one concrete number for the wages rung: −10/day per 100 of arrears, or an increased incident rate.
- **Reuses:** the negative treasury, delivery refusal, construction queues, staff wages and persisting arrears, incidents, saves, alerts, the refusal band.
- **Player now optimises:** liquidity and recovery timing — expand, sell materials, borrow, or wait for income.
- **Accepted cost:** harshness — a bad day can compound into a spiral; loans and sell-back are what keep it recoverable (`design (2)`). Higher bankruptcy risk (`Response`).
- **Build size:** small-medium — thresholds, HUD/alert text, deterministic modifiers.
- **Status:** ALREADY DECIDED (the degradation ladder) — "each rung actionable and reversible", the refusal-band surfacing, and B11's fatigue counter as the morale rung are the new parts.

## B56. Gate threshold grants on licensed, serviced capacity
- **Source:** `lockstate-economy-progression-design (1).md` — "Decisions I would challenge / Threshold grants"; `lockstate-economy-progression-mechanisms (1).md` — "19. Threshold grants (owner proposal) — confirm & extend"
- **Mechanic:** Keep threshold grants, but do not let raw prisoner count be the only trigger. `design (1)`: the grant should require crossing a **licensed, occupied, adequately serviced** threshold — a grant at 10 prisoners should require that the prison can legally house ten and has survived a short clean interval — "otherwise the player can rush admissions, collect the money, and leave the simulation to absorb the consequences". `mechanisms (1)`: keep the pure population version as the primary growth reward, and extend the same threshold table to fire on stable days or on rooms of type X built, but only where those reuse existing counters.
- **Reuses:** the prisoner count already on the status strip, the treasury, bed capacity, the incident streak, the room counters.
- **Player now optimises:** growth that the prison can actually hold, rather than a headcount spike timed to a payout.
- **Accepted cost:** `mechanisms (1)` states the honest one: threshold grants still pay for growth rather than competence, so overcrowding pressure (B1/B2) and a stability signal (B16) are the necessary counterweights.
- **Build size:** trivial — a threshold table plus one-time flags; the gate is one extra predicate.
- **Status:** ALREADY DECIDED (threshold grants) — the licensing/service gate is the challenge. Note `grok economy propo.md` reaches the same destination by a different route: it says the grant "does not need redesign, it needs (3) and (2) in front of it" (B4 and B3).

## B57. Make the grant ladder a missing-room consequence table
- **Source:** `grok economy propo.md` — "22. Scale consequences, not locks — the nine rooms as a table on the grant ladder"
- **Mechanic:** No research tree. The threshold-grant population numbers (10, 25, 50, …) double as a consequence table keyed by `(population threshold × room present)`. At each threshold: without `reception`, intake processing slows (B44); without `infirmary`, injury duration doubles (B14); without `security-office`, sectors cannot read `Covered` and cap at `Understaffed`, so safety provision (B6) caps at half; without `staff-room`, guard fatigue floors higher (B11); without `garbage-room`, filth cannot reset (B45); without `utility-room`, everything provisions at half (B46); without `delivery-bay`/`storage-room`, the delivery cap stays at the gate-pile 20 (B48); without `holding-cell`, overflow is delay-and-incident only (B3). Every one of these rooms is buildable from minute one. Nothing is locked; what changes at a threshold is the cost of *not* having built it. A single status-strip alert reads "at this scale, missing: infirmary, garbage".
- **Reuses:** the nine dead rooms, the threshold-grant table (one table, two readers), mechanisms B3–B46, the status strip.
- **Player now optimises:** build order of operations rooms against cells, on the same ladder they already watch for grants. "Progression beyond scale *is* scale, with a different spend."
- **Accepted cost:** stated sharply — if every missing room is a hard tax, the 9,945 becomes a hidden price of the 25-prisoner grant and "this *is* a tech tree with extra steps". So every consequence must stay partial (half-rate, slower, longer — never off, never refused), no room is ever hidden or gated, and the failure mode to watch is making the door *feel* locked.
- **Build size:** small **once the underlying readers exist** — explicitly a late binding, not a first one; do not ship a bundle of modifiers pointing at systems that have no readers yet.
- **Status:** NEW. The batch's only direct answer to brief thinness #4 ("no progression beyond scale") that does not smuggle in a research tree.

## External pressure, reputation, and replay

## B58. Run periodic inspections whose score sets the next offer
- **Source:** `lockstate-economy-progression-design (1).md` — "16. Inspection score and reputation"; `lockstate-economy-progression-design (2).md` — "19. Inspection windows and evidence trails"; `Lockstate_Economy_Progression_Design_Response.md` — "6. Paid Inspections"
- **Mechanic:** At fixed, deterministic intervals compute a **transparent** score from occupancy, unmet needs, incidents, contraband control, treatment backlog and staffing coverage. `design (1)`: the score changes the next state offer — better prisoners or higher rates when strong, harsher risk or reduced income when weak. `design (2)`: passing unlocks a better contract pool or a one-off threshold-style grant, failing produces a visible corrective order and a temporary payment hold; the schedule is known and a named RNG stream is used only for event selection, preserving replayability. `Response` proposes the crude version: an inspector arrives every X days, pays a bonus if more than 70% of needs are met and fewer than 2 incidents occurred, and levies a penalty otherwise.
- **Reuses:** existing metrics (needs, incidents, coverage, contraband, staffing), risk tiers, the threshold-grant path, alerts and the refusal band, the existing global classification-review scheduler as the interval mechanism (`design (2)`).
- **Player now optimises:** sustained performance across several axes and readiness at a deadline — "a second time axis besides day-to-day occupancy" — with a reason not to exploit a single day.
- **Accepted cost:** delayed consequences mean a player can be punished after the original mistake and feels less in control (`design (1)`); deadline anxiety and possible save-scumming, mitigated by deriving outcomes from recorded state and deterministic timing (`design (2)`); unpredictability increases risk (`Response`).
- **Build size:** small to medium — aggregate existing values, one evaluator, two outcomes, a UI panel.
- **Status:** NEW.

## B59. Keep a hidden 0–100 reputation score
- **Source:** `Lockstate_Economy_Progression_Design_Response.md` — "4. Prison Reputation System"
- **Mechanic:** A **hidden** score from 0 to 100 rises when prisoners are content and falls on incidents. High reputation unlocks better contracts, grants and lower penalties.
- **Reuses:** the needs system, incidents, prisoner classification.
- **Player now optimises:** long-term reputation over short-term profit — though the source makes it hidden, which removes the visible feedback loop the brief asks for and makes it hard for a player to attribute any of it.
- **Accepted cost:** "reputation is hard to raise, easy to lose."
- **Build size:** medium — a reputation counter linked to existing systems.
- **Status:** NEW, but weaker than B58, which is the same idea made transparent and tied to a schedule. `design (1)` explicitly names its inspection score "transparent"; this one is explicitly hidden.

## B60. Set milestones on axes other than population
- **Source:** `lockstate-economy-progression-design (2).md` — "20. Campaign milestones based on operating identity"
- **Mechanic:** Milestones requiring achievements that are not headcount: maintain 90% capacity compliance for ten days; complete a long-stay education programme; recover from negative cash; operate a logistics route with no blocked delivery; survive a high-risk contract without a riot. Rewards are threshold grants, contract unlocks, cosmetic labels, or a starting modifier for a future session. Keep only a few active goals visible, and make some mutually exclusive within a campaign.
- **Reuses:** every major existing counter plus the decided threshold grants; the existing Overview area for a small goals panel.
- **Player now optimises:** a chosen operating identity, and gets a reason to replay a prison rather than only scale it.
- **Accepted cost:** milestone rewards can become a checklist.
- **Build size:** medium — generic milestone predicates, progress storage, reward dispatch, a small goals panel.
- **Status:** NEW. On rule 4: the "contract unlocks" part gates contract pools (B36), which is named, so it is not a lock on an open door — but the cross-session part shares B61's caveat.

## B61. Choose a deterministic scenario modifier per save, with cross-save unlocks
- **Source:** `lockstate-economy-progression-design (1).md` — "20. Scenario modifiers and persistent unlocks"
- **Mechanic:** At save creation, pick a deterministic scenario modifier — high-risk intake, expensive materials, short sentences, or inspection-sensitive funding. Completing its objective unlocks a starting policy, a contract type, or a cosmetic rule for future saves, explicitly **not** raw permanent power.
- **Reuses:** named RNG streams, sentence generation, risk tiers, material prices, the threshold-reward path, local IndexedDB saves.
- **Player now optimises:** adaptation and replay planning — each new prison asks a different question while the kernel stays deterministic.
- **Accepted cost:** scenario variance can feel unfair early if modifiers are not clearly previewed, and persistent rewards undermine the identical-start premise.
- **Build size:** medium — seed parameters, scenario definitions, a small local progression record.
- **Status:** NEW, and contested inside the batch: `grok economy propo.md` says "Do not persist anything across sessions yet … it should not become one until the deterministic kernel is no longer how you tell whether a change is a change." Single-player and local-save only, so not off-brief.

## B62. Give seized contraband a provenance trace
- **Source:** `lockstate-economy-progression-design (1).md` — "14. Contraband trace market"
- **Mechanic:** Each successful sweep yields either seized contraband or a **trace**. A trace identifies an admission route, a sector, or a prisoner risk tier for a limited time. Acting on a trace reduces future contraband; ignoring it keeps guards free for other duties.
- **Reuses:** the 10–20% contraband-at-admission chance, the recently added sweep duty, security sectors, risk tiers, guards, alerts.
- **Player now optimises:** targeted searches and the value of information, instead of sweeping everywhere.
- **Accepted cost:** searches consume guard time and can disrupt work or provoke tension; false or stale traces waste effort.
- **Build size:** small to medium — provenance metadata and temporary alerts.
- **Status:** NEW.

## B63. Pay a small compliance credit for contraband actually found
- **Source:** `lockstate-economy-progression-design (2).md` — "15. Contraband economy without a market"
- **Mechanic:** Each contraband item found during a sweep yields evidence and a small one-off state credit or progress against a contract's compliance requirement; missed contraband raises incident pressure. **No buying or selling of contraband** — the reward is for detection and control.
- **Reuses:** admission contraband chance, sweep duty, incidents, the status strip, named RNG streams.
- **Player now optimises:** search frequency and staffing against the risk of missing a discovery.
- **Accepted cost:** it can make routine sweeps mandatory; mitigate with diminishing returns on repeated sweeps and by making sweeps consume existing work or free-association blocks.
- **Build size:** small — a discovery counter, a compliance modifier, one HUD line.
- **Status:** NEW.

## B64. Let the player sell confiscated contraband at the price of corruption
- **Source:** `lockstate-economy-progression-mechanisms (1).md` — "22. Contraband market as double-edged income"
- **Mechanic:** Confiscated contraband can be sold for a small credit or destroyed. Selling raises a hidden "corruption" counter that slightly increases future contraband introduction chance or incident severity. Destroying is clean and pays nothing.
- **Reuses:** contraband introduction and the sweep/search duty, the treasury.
- **Player now optimises:** short-term cash against long-term cleanliness.
- **Accepted cost:** it creates a temptation that can destabilise a stable prison.
- **Build size:** small — a sell/destroy choice on confiscated items plus one counter.
- **Status:** NEW. Note it is the direct opposite of `design (2)`'s explicit "do not add buying/selling contraband" (B63) — the batch disagrees with itself here. The counter being hidden repeats B59's visibility problem.

## B65. End the session after prolonged insolvency
- **Source:** `Lockstate_Economy_Progression_Design_Response.md` — "What might be wrong in 'decided'"
- **Mechanic:** As proposed: "adding a soft 'game over' (e.g. after X days insolvent, player loses reputation and must restart)".
- **Reuses:** the treasury, the day counter, and the reputation score of B59.
- **Player now optimises:** avoiding a terminal state — which is precisely what the recorded decision removed, on the grounds that "a session that ends removes the interesting part, which is digging out".
- **Accepted cost:** NOT STATED BY SOURCE. My reading: it deletes the dig-out gameplay that the degradation ladder, loans and sell-back were all decided in order to support, and it takes the three unbuilt decisions with it.
- **Build size:** small to build, large to unwind.
- **Status:** CONTRADICTS DECISION 2 ("Insolvency is a state, not a loss condition"). The source's stated reason is "without a clear end the game can become boring", which does not engage with the recorded reason.

## B66. Add a second primary resource beside money
- **Source:** `Lockstate_Economy_Progression_Design_Response.md` — "What might be wrong in 'decided'"
- **Mechanic:** As proposed: money-as-primary "limits design", so add a second resource — "reputation or 'social capacity'" — that the player must balance against profit. No conversion rules, sources, sinks or numbers are given.
- **Reuses:** unspecified.
- **Player now optimises:** unspecified — the proposal names the resource and stops.
- **Accepted cost:** NOT STATED BY SOURCE. My reading: a second primary resource means a second ledger, a second HUD line, and a second balance pass, against a game whose first resource has only one income line and one cost line.
- **Build size:** large, and unbounded as written.
- **Status:** CONTRADICTS DECISION 3 ("Money is the primary resource, with grants and prison labour as secondary lines"). Too vague to implement — recorded here as vague, which is the finding. Compare `grok economy propo.md`, which reads the same decision as a *budget*: "Two secondaries. Not bounties *and* release scores *and* inspection stipends *and* family money *and* labour."

---

# Part 2 — the meta

## Build-first orderings

**`grok economy propo.md`** — "The order is the reason, not the ideas."
1. *(3) residency = existing bed, then (2) holding as overflow* (B4, B3), with sell-back and the delivery gate cap (B48 rung A) in the same pass. Reason: "Threshold grants, labour credits, bounties and release scores all multiply the one-plank exploit and the pack-the-prison optimum if those still pay… This pass is the one that stops the existing ledger from lying. It is not the most interesting pass. It is the one without which the interesting pass cements the wrong game."
2. *(1) coverage is safety provision* (B6). Reason: Decision 1 accepted that trouble scales with population "and then left the trouble half unwired. This is the cheapest wiring: a reader from a HUD state that already exists into a need that already withholds." It also makes fatigue (B11) and injury (B14) audible later, because those multiply an incident rate that is currently saturated.
3. *(4) labour credits from work/education ticks* (B20). Reason: Decision 3 already named the line, the 1,000 ticks currently buy nothing, three existing rooms become producers with no new rooms, and `free-association` becomes a visible opportunity cost the same day. "Do the cheap counter, not the job-system bind."
   Explicit negatives: "Why not infirmary first: incidents are too frequent; you would be building a hospital for a warzone. Why not the job-system bind first: it is the expensive one, it will slip, and you will have nothing playable. Why not threshold grants first: they are already decided, and they will pay for the false optimum if (3) and (2) are not in."

**`lockstate-economy-progression-design (2).md`**
1. *Capacity compliance and reserve* (B1, B5). "The current per-occupied-place income explicitly requires an external overcrowding punishment, and the brief reports that overcrowding currently wins… It also gives loans, threshold grants and service accreditation something to react to."
2. *Intake contracts with risk and sentence terms* (B36, B38). "It adds population composition as the next axis only after population volume has a cost… It should be balanced against the first system, not before it."
3. *Operational jobs/logistics plus narrow dead-room readers* (B48, B47). "It is the largest implementation step and should be attached to a stable economic decision surface… Building it first would risk producing an elaborate logistics toy before the game knows why a player should care about throughput."

**`lockstate-economy-progression-mechanisms (1).md`**
1. *Occupancy-pressure incident multiplier* (B2). "Directly answers the accepted decision that 'overcrowding must be punished elsewhere or the optimum is to pack'… Unlocks honest use of threshold grants."
2. *Job-system material deliveries* (B48). "Turns the largest piece of finished-but-unused code into a real constraint… Highest leverage on 'use what exists'."
3. *Risk-tier intake premium + free-association idle tax* (B37 + B27). "Two tiny changes that together give a second axis (risk mix) and make the existing work-regime windows economically relevant… immediately change what a player builds in the first 30 minutes."
   Order rationale, verbatim: "punish the known failure mode first, then activate the biggest dormant system, then add the cheapest second-axis signals."

**`lockstate-economy-progression-design (1).md`**
1. *Capacity licence bands* (B1). "It repairs the explicit contradiction in the accepted income decision: population currently increases income and trouble, but trouble has no economic counterweight… It is also easy to tune before adding new systems."
2. *Clean-days reserve plus inspection score* (B16 + B58), built together "as a thin performance layer… They should follow capacity rules because their values need a population-pressure model to evaluate."
3. *Bind logistics to rooms and add one work contract* (B48 + B24). "It is more engineering-heavy, so it belongs after the economy has guardrails and visible performance feedback."

**`Lockstate_Economy_Progression_Design_Response.md`**
1. *Incident Reduction Bonuses* (B16). "Simplest to build (incident counter exists), immediately changes optimisation… low bug risk."
2. *Overcrowding Costs* (B1). "Directly addresses identified problem ('nothing punishes overcrowding'), uses existing capacity system, easy to balance."
3. *Dead Room Utilization Grants* (B51). "Addresses the biggest hole in the project (9 of 18 rooms do nothing), encourages experimentation, low implementation cost." — note the internal contradiction: the same entry's build note says the dead rooms' functions must be written first, which is not low cost.

**Convergence:** four of five put an overcrowding counterweight first (B1 or B2 or B4/B3). Three of five put the job-system/logistics bind third and give the same reason — it is the largest build and needs a stable economic surface underneath it. Only `grok` puts a bugfix pass first, and only `grok` argues explicitly that shipping the already-decided threshold grants before that pass pays for the exploit.

## Challenges to the decided list

**Decision 1 (per-prisoner-day, per occupied place)**
- `grok economy propo.md`: "**Decision 1 is right. Its implementation is not.**… The accepted consequence — overcrowding must be punished elsewhere or the optimum is to pack — has no elsewhere. That is not an argument against the decision. It is an argument that (2) and (1) *are* the decision, and they are unbuilt. **Do not add a new overcrowding tax. The 40-withhold is the tax. Give it something to read.**"
- `lockstate-economy-progression-design (2).md`: "Capacity compliance should be considered part of the income model, not an optional later punishment. Otherwise the architecture rewards the exact behaviour it says must be punished elsewhere."
- `lockstate-economy-progression-design (1).md`: explicitly declines to overturn it — "It is the right base line because it connects capacity and safe occupancy. I would add the capacity licence and performance modifiers rather than replace the line."

**The 40-per-unmet-need schedule and the 60 floor**
- `lockstate-economy-progression-design (2).md`: "The floor at 60 means six unmet needs still generate meaningful income… I would not remove the floor; I would make persistent low service block premium contracts and increase incident pressure."
- `Lockstate_Economy_Progression_Design_Response.md` goes the other way with B33 (an extra −50/day when most of the population has more than three unmet needs), which erodes the floor.

**The rejection of the block grant**
- `lockstate-economy-progression-mechanisms (1).md`: "**Block grant rejected solely because it 'pays for surviving to a date'.** Threshold grants are better, but a small recurring competence grant (days-without-incident streak) is not the same as a pure survival payment. The original rejection may have been too broad; a stability reward is still compatible with 'capacity and competence pay through the same line'."
- `grok economy propo.md` disagrees: "A block grant was correctly rejected. Nothing below revives it," and warns that a *fine* on a bad release would be "a tax on time passing", i.e. the same shape.

**Threshold grants (decided but unbuilt)**
- `lockstate-economy-progression-design (1).md`: "Keep them, but do not make raw prisoner count the only trigger… or the grant will pay for the exact overcrowding exploit the income decision warns about… Otherwise the player can rush admissions, collect the money, and leave the simulation to absorb the consequences."
- `grok economy propo.md`: "**Threshold grants are right, and the unbuilt order around them is wrong.**… Shipping them while bedless assignment still pays, and while packing is unpunished, means the grant pays for the exploit and for the optimum the decision already named as a failure. The grant does not need redesign. It needs (3) and (2) in front of it."

**Decision 2 (insolvency is a state, not a loss condition)**
- `Lockstate_Economy_Progression_Design_Response.md` contradicts it outright: "this is risky because without a clear end the game can become boring. I propose adding a soft 'game over' (e.g. after X days insolvent, player loses reputation and must restart)." (B65.)
- `grok economy propo.md` upholds it and attacks the loan instead: "Decision 2 is right, and loans-without-a-cap will make it a slogan again… an uncapped loan is a block grant you repay. Cap concurrent loans at one. Interest steps with recent incidents and with arrears… Missed payment *is* the first rung of the ladder… Do not add a second, friendlier way out."
- `lockstate-economy-progression-design (1).md`: loans are "correct only if they are a bridge with a repayment pressure, not an infinite treasury extension… If debt service exceeds that share, trigger the already-decided degradation ladder."
- `lockstate-economy-progression-design (2).md`: "Loans… should not be the first response to an invalid purchase. Sell-back and delivery cancellation should provide a small liquidity valve, while loans should require a plausible repayment path."

**Decision 3 (money primary, grants and labour secondary)**
- `Lockstate_Economy_Progression_Design_Response.md` contradicts it: "this limits design. I propose adding a second resource (e.g. reputation or 'social capacity')." (B66.)
- `grok economy propo.md` reads it as a hard budget: "**Decision 3 is right, and it is a budget, not a floor.**… Two secondaries. Not bounties *and* release scores *and* inspection stipends *and* family money *and* labour. (18) and (20) piggyback the grant path as one-offs. If they grow into lines, cut them."

**Decision 4 (prices are provisional)**
- `grok economy propo.md`: "**'Prices are provisional' is being asked to do too much.** The 300 / 40-withhold / 80-wage *numbers* can move. The *ratios* are already the game… A later balance pass that moves these without retuning (1), (4) and (9) will silently invert every tradeoff in this document. **Stop calling the ratios provisional. Call the numbers tunable against named invariants** ('a Covered guard covering three pays for themselves on safety withhold alone')." This is the only challenge in the batch to Decision 4.

**Decision 5 (a room with no objects is bounded by its own ground)**
- `grok economy propo.md`: "Decision 5 (yard capacity from area) is right and (16) depends on it. Do not put a bench requirement on the yard." `lockstate-economy-progression-mechanisms (1).md`'s visit mechanic does require benches — a small direct conflict inside the batch.

**"Guards never patrol"**
- `lockstate-economy-progression-mechanisms (1).md`: "The decision is coherent with current sector derivation, but the observed result ('full coverage still riots every two days') suggests the static coverage model is under-powered… Leaving patrol permanently impossible may be the wrong long-term call if incidents remain the dominant failure mode."
- `lockstate-economy-progression-design (2).md` reverses its own mechanism: "I would not reverse it in the first three builds… First use static coverage, free-association and service quality as the security levers. Revisit patrols only if the incident model remains spatially unsatisfying."
- `grok economy propo.md`: "The no-patrol decision is right, *if* (1) and (14) exist. Coverage is the verb; the console is the information the patrol would have been. If neither ships, no-patrol is just an empty Security tab and the decision should be reopened. Do not reopen it first."

**Global classification-review eligibility (eight of fifteen sentences never reviewable)**
- `lockstate-economy-progression-design (2).md`: "classification review is not a progression axis for most prisoners. Either make the eligibility rule visible and intentional, or repurpose the review scheduler for contract eligibility and service audits. **Do not build economy around a hidden review system that most records cannot enter.**"
- `grok economy propo.md` answers it with a mechanism instead (B39: education buys eligibility).

**The nine dead rooms**
- `grok economy propo.md`: "The nine dead rooms were correctly not filled with clones… The hole was not 'we cannot think of a room action'. The hole was 'there is no reader'. **Fill with readers.**"

**The three needs that cannot be met inside a normal sentence (the brief's open question)**
- `grok economy propo.md` demands a ruling and gives one: "**Safety is a bug.** Guards exist, sectors exist, the HUD already names `Unguarded`. If safety cannot be provisioned by coverage, Decision 1's 'safely' half has no instrument and the 20,400-tick requirement makes 40 of the withhold a constant. **Hygiene and recreation are the point.** A short sentence should not be able to finish them. Laundry (10) and visits (16) are leaks, not demolitions… If you make all six needs finishable in a few thousand ticks, every prisoner is the same again."
- `lockstate-economy-progression-mechanisms (1).md`: "If this is intentional… it needs a stronger positive signal for partial provision. If it is accidental, the tick thresholds should be lowered. Currently it reads as a silent tax with no counter-play."

**Cross-session persistence (brief thinness #7, not a recorded decision)**
- `grok economy propo.md`: "**Do not persist anything across sessions yet**, even though thinness #7 lists it… it should not become one until the deterministic kernel is no longer how you tell whether a change is a change." `design (1)` (B61) and `design (2)` (B60) both propose exactly that persistence.

**Sell-back**
- `lockstate-economy-progression-design (1).md`: "available only after delivery and at a visible loss. Also add a small transaction delay or handling fee so players cannot use materials as a perfect zero-cost cash account. The player should be able to recover from a mistake, not arbitrage every build order."

**The degradation ladder**
- `lockstate-economy-progression-design (1).md`: "Build it, but make each rung actionable and reversible… Because there is no game-over, the ladder is the game's debt gameplay and must be readable."

## Least-sure-but-most-interesting

- **`grok economy propo.md`** — *Prisoners, during work blocks, are the workers the job system already has* (B26). "The bind is: a prisoner in a work block *is* a worker… The 1,000 ticks are a labour *budget* for the institution, not a boolean 'was employed today'." Why unsure: it will surface every concealed reservation and pathfinding bug, construction and feeding will both feel slow, a stuck job can strand a new player, "and it can also collapse the game into a workshop min-max that is just Prison Architect's labour layer with a different coat, which is the failure the brief asked us not to have." Why the register is right: "The threshold grant was 'pay for growth, not for existing', using a payment path that was already going to exist. This is 'spend the work block on the job system, not on a boolean', using a job system that already exists." Explicitly the wrong thing to build first and the right thing to build toward.
- **`lockstate-economy-progression-design (1).md`** — *Safety-bond deposits* (B19). "It could make admissions feel like a financial transaction rather than custodial management, and high-risk prisoners might become mathematically rejected too often. But it is interesting because it converts the already-existing risk tiers and injured/incident records into a forward-looking decision… It also gives loans a concrete use without turning them into a generic 'borrow whenever short' button." Proposed test: small, refundable, shown only as "reserved funds" — "If [players do not change admission choices], remove it rather than adding more complexity."
- **`lockstate-economy-progression-design (2).md`** — *Free-association as a social buffer* (B28). "The brief says it fulfils nothing, so it is currently dead schedule time; turning it into a safety input would make regime design unusually legible without adding a new room or need. It is also dangerous: if its incident reduction is too strong, the optimal prison may simply convert all work time into free association, while if it is too weak, players will ignore it." Proposed test: a narrow bounded modifier displayed as incident pressure, with crowding reducing its effect.
- **`lockstate-economy-progression-mechanisms (1).md`** — *Garbage-room / waste-bin sanitation pressure combined with the job system* (B45). "It is the purest activation of a completely dead room + unread capability + the unused job system in one loop. Filth is a second resource that is generated by the same population that generates income, travels through the logistics machinery that already exists, and feeds back into the unmet-need withholding schedule the player already watches." Uncertainty: "whether players will find the maintenance satisfying or merely annoying. If the numbers are wrong it becomes busywork; if they are right it makes the logistics category feel inevitable rather than decorative. That is exactly the register the threshold grant came from."
- **`Lockstate_Economy_Progression_Design_Response.md`** — *Logistics Utilization Bonuses* (B48, its weakest form). "Using the existing but unused job system for material transport… could create a unique mechanic no other prison simulator has. Risk: players may not understand why to do it if teleportation is easier." Note the shape: it pays a −10% build-cost bonus for opting into logistics rather than making logistics the way materials move.

## Quality note

`grok economy propo.md` is in a different class from the rest of this batch. It reasons from the brief's own arithmetic (a Covered guard covering three prisoners prevents 120/day of withhold against an 80/day wage; twelve prisoners need ~600 stove-ticks inside a 1,000-tick window), it gives tick counts and rates for nearly every mechanism, it maintains an explicit "what not to build" list, it names which of its own ideas must not ship before which others, and it is the only document that treats the one-plank exploit and the 625-brick soft-lock as design preconditions rather than as separate bugs. `lockstate-economy-progression-mechanisms (1).md` is the next most useful — concrete, correctly scoped, and it consistently names the specific dead room or unread capability each mechanism gives a reader to. `lockstate-economy-progression-design (1).md` and `(2).md` are genuine engagements, slightly more abstract: both understand Decision 1's unbuilt consequence and both structure their answer around it, but they lean on the words "contract", "score" and "compliance" where a number would have been more use, and several of their entries are the same capacity idea restated.

`Lockstate_Economy_Progression_Design_Response.md` is a generic prison-game feature list. Eighteen of its twenty entries are the same shape — "check a metric at an interval, pay a bonus or a penalty" — the numbers are placeholders where they exist at all ("bonus scaling with prison size", "reduce incident rate by X%"), several entries optimise nothing the player can control (B43 needs an intake choice that does not exist; B53 pays for a balanced room count), one entry proposes a grant for using rooms whose functions it admits still have to be written (B51), and its two challenges to the decided list contradict Decisions 2 and 3 without engaging with the reasons recorded against them. Its only genuinely useful contribution is that it independently picked the same first two priorities as everyone else, which is weak corroboration of B1 and B16.
