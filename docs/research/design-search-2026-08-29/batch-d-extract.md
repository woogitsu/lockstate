# Batch D — mechanism extraction

Source documents (all read in full):

1. `Lockstate #U2014 faza 1 wdro#U017cenia i kontrola inflacji waluty.md` (Polish, author line: "Manus AI") — hereafter **FAZA1**
2. `Lockstate #U2014 model faucet & sink dla fazy 1.md` (Polish, "Manus AI") — hereafter **FAUCET1**
3. `Lockstate #U2014 system klanowy i aukcje graczy a stabilno#U015b#U0107 inflacyjna fazy 3.md` (Polish) — hereafter **KLAN3**
4. `lockstate_economy_proposals.md` (English) — hereafter **PROPOSALS**
5. `Lockstate_economy_progression_mechanisms (1).md` (English) — hereafter **MECH1**

Note on two of these: FAZA1 and FAUCET1 are not answers to the brief. They are follow-up documents that assume an earlier answer ("phase 1 = capacity certification") was already accepted and elaborate it into a sprint plan. They therefore contain few distinct mechanisms and a great deal of process. Extracted anyway; see the quality note.

---

## Part 1 — mechanisms

## D1. Certify each residency place before it can earn
- **Source:** FAZA1 — "2. Proponowany model certyfikacji" / "2.2 Minimalny kontrakt certyfikowanego miejsca"; FAUCET1 — "3.2. Certyfikacja i płatne miejsca"
- **Mechanic:** Every residency place (one prisoner's worth of `cell` or `solitary-cell` capacity, still derived from beds as today) carries a `capacityStatus` of `certified` / `restricted` / `suspended`. A place is `certified` at the day boundary only if: the prisoner has a valid assignment and the room has an active bed; the room still satisfies the enclosure requirement and is routable; the prisoner has access to the required `sleep` and `meal` regime blocks with working paths to the infrastructure; no critical security block (configurable); and no unresolved suspension from incident, damage or over-capacity. Income becomes `certified_income(place, prisoner) = need_adjusted_rate(prisoner)` if certified, else `0` — the certification test runs *before* the 300/260/…/60 need schedule, which is explicitly left unchanged in the same release so the two effects can be told apart. The document recommends the MVP be binary (`certified` / not) and that `restricted` (50% of rate, or full rate with a warning) be shipped as a display state only, or not at all.
- **Reuses:** The per-prisoner-day income line and its need-withholding schedule; room enclosure requirement; object-derived capacity (bed = residency); regime blocks (`sleep`, `meal`); pathfinding/routability; the day boundary as the only settlement moment; the incident system as an input.
- **Player now optimises:** Whether an existing place is *serviceable* rather than merely built. Adding a bed stops being an unconditional income increase; the player must weigh a new place against keeping current places routable, fed, and un-suspended. This is the document's stated second axis: "rozbudowa konkuruje z utrzymaniem" [expansion competes with upkeep].
- **Accepted cost:** Stated: it risks being read as a second tax or a punishment for building, and the safety condition must be configurable because the brief says full guard coverage does not prevent riots — "nie należy więc udawać, że sama liczba strażników gwarantuje bezpieczeństwo" [we must not pretend the guard count guarantees safety]. Also stated: incident-driven decertification must not be automatic for all incidents, or a riot cascades into no income → no wages → more incidents.
- **Build size:** Medium — a pure evaluator function plus a state field, HUD reason codes, and a save migration; the document budgets four weeks with a four-person team, which is its own estimate, not mine.
- **Status:** NEW

## D2. Pay only min(occupied, certified) places
- **Source:** FAUCET1 — "3.2. Certyfikacja i płatne miejsca", "6.4. Przepełnienie"; FAZA1 — "3. Zasady zachowania w sytuacjach brzegowych / Przepełnienie"
- **Mechanic:** `payableOccupiedPlaces P = min(O, K)` where `O` is occupied places and `K` is certified capacity. Prisoners beyond certified capacity are housed and cause load but generate no income at all. FAZA1 gives a deterministic assignment order for which occupied places count as payable when population exceeds `K`: first places with a valid assignment and active bed, then oldest assignments, then higher-risk places requiring stronger infrastructure — and insists the order be shown to the player and covered by a determinism test, never left to implicit id iteration order. FAUCET1's worked table (`K=12`, `r_avg=180`, `G=3`, upkeep 20): occupancy 12, 15 and 18 all yield the same 2,160 gross and 1,680 net.
- **Reuses:** The per-prisoner-day income line, occupancy accounting, the day boundary, the deterministic kernel requirement.
- **Player now optimises:** Population against certified capacity rather than population alone — this is a direct answer to the brief's "nothing punishes overcrowding". Admitting the 13th prisoner into a 12-place prison is now pure cost.
- **Accepted cost:** Stated bluntly by FAUCET1: `P = min(O,K)` "zatrzymuje dodatkowy faucet, ale nie zatrzymuje ryzyka" [stops the extra faucet but does not stop the risk] — surplus prisoners are free pressure with no economic cost until a disaster happens, so it must be paired with something that makes them expensive (see D3).
- **Build size:** Small — one clamp plus a deterministic ordering rule, on top of D1.
- **Status:** NEW

## D3. Make prisoners above certified capacity cost something
- **Source:** FAUCET1 — "6.4. Przepełnienie"; diagnostic threshold in "9. Progi diagnostyczne"
- **Mechanic:** The document states the requirement but not the mechanism: surplus prisoners "powinni zwiększać potrzeby, incydenty, liability albo koszty przywracania" [should increase needs, incidents, liability or recovery costs], otherwise overcrowding is a free increase of pressure. The only concrete artefact is a diagnostic warning threshold: `O/K ≥ 1.25` sustained for three days with no consequence means overcrowding is too cheap. Scenario C prescribes running `K=12, O=18, G=3` for five days and measuring income, incidents, unpaid wages and recovery time.
- **Reuses:** The six needs, the incident system, the certification state from D1.
- **Player now optimises:** In principle, whether to accept intake at all. In practice nothing yet — the document does not say which of the four levers to pull or by how much.
- **Accepted cost:** NOT STATED BY SOURCE. My reading: whichever lever is chosen, it stacks on top of D2's income clamp, so overcrowding gets punished twice and the tuning problem doubles.
- **Build size:** Unknowable as written — this is a requirement, not a design.
- **Status:** NEW (but record it as vague; it is a hole the author left open, not a mechanism)

## D4. Suspend the place when the bed is removed
- **Source:** FAZA1 — "3. Zasady zachowania w sytuacjach brzegowych / Usunięcie albo cofnięcie łóżka"; acceptance criterion "Usunięcie albo cofnięcie łóżka nie pozostawia płacącego przypisania bez miejsca"
- **Mechanic:** Removing a bed must not silently leave a revenue-bearing assignment behind. The place transitions to `suspended`, the prisoner is flagged as improperly accommodated, and reassignment is left to the existing allocation system. Undoing a completed build order must produce neither a negative nor a doubled financial effect. Purchased material does not affect certification until physically consumed by a completed object, which keeps liquidity, stock and capacity separate.
- **Reuses:** Build orders and their undo/refund path, room capacity derivation, the assignment system, the certification state.
- **Player now optimises:** Nothing new — this closes the brief's measured exploit ("one plank can pay for three prisoners", 3 residents and 4,380 earned against a control's 1 and 1,460). It removes a dominant strategy rather than adding a decision.
- **Accepted cost:** NOT STATED BY SOURCE. My reading: none worth naming; it is a defect fix that D1 makes cheap to express.
- **Build size:** Small — falls out of D1 if the evaluator is authoritative.
- **Status:** NEW

## D5. Write one auditable income transaction per day
- **Source:** FAZA1 — "4.3. Księgowanie i audyt"; FAUCET1 — "11. Format telemetrycznego ledgeru"
- **Mechanic:** Each day boundary emits a single deterministic transaction broken into `occupiedPlaces`, `certifiedOccupiedPlaces`, `uncertifiedOccupiedPlaces`, `needRateSubtotal`, `certificationAdjustment`, `finalIncome`. FAUCET1 extends this to a full daily ledger record (JSON example given) that additionally separates `thresholdGrants`, `guardWages`, `certifiedOccupiedUpkeep`, `certifiedEmptyUpkeep`, `repairFees`, `materialPurchases`, `loanDraw`, `operatingNet` and `cashChange`. The stated purpose of the split is that treasury growth alone cannot distinguish a healthy prison from one accumulating materials or masking a deficit with a loan: `Cash_change = Net_operating - C_materials + L`.
- **Reuses:** Treasury, the day boundary, the existing status strip and Overview tab.
- **Player now optimises:** Directly, nothing — it is instrumentation. But FAZA1's UX criterion is player-facing: "gracz może zrozumieć, dlaczego dzisiejsza wypłata jest niższa od oczekiwanej" [the player can understand why today's payment is lower than expected], and Overview must show `occupied` / `declared` / `certified` / `payable` plus projected daily income with reason codes in the alert/refusal band.
- **Accepted cost:** NOT STATED BY SOURCE. My reading: a HUD that reports six subtotals is a HUD that has to be balanced for legibility, and none of it is a decision.
- **Build size:** Small — a struct and an Overview panel; the reason-code enum (`missing_bed`, `room_not_enclosed`, `unroutable_room`, `missing_meal_access`, `missing_sleep_access`, `critical_incident`, `over_capacity`, `manual_suspension`) is specified as typed codes, never pre-rendered UI text.
- **Status:** NEW

## D6. Key threshold grants to certified capacity, not to beds
- **Source:** FAUCET1 — "3.3. Threshold grants i inne dopływy"; MECH1 — "Decyzje, które warto zakwestionować / Threshold grants powinny mieć warunek jakości"
- **Mechanic:** Threshold grants are booked as an event faucet reported separately from operating income (`F_total = F_prisoner + F_grants + F_other`) and must never be folded into daily profitability. The design constraint: the threshold should key off **certified** capacity, or at minimum not reward suspended places — "jeżeli threshold grant płaci za samo `D` [declared capacity], certyfikacja traci część sensu". A diagnostic threshold flags grants exceeding 25% of total faucet in the first ten days as a sign the grant is replacing the operating economy rather than seeding it. MECH1 proposes a different qualifier for the same worry: keep the headcount threshold as the headline, but pay the full amount only at roughly 90% capacity utilisation and with a limited number of incidents in the last two days — otherwise the grant "może premiować dokładnie tę strategię, której projekt chce uniknąć" [may reward exactly the strategy the design wants to avoid].
- **Reuses:** The decided threshold-grant mechanism; certified capacity from D1.
- **Player now optimises:** The grant now pays for *serviceable* growth rather than for placing beds — which closes the obvious degenerate reading of the decided grant (build 25 beds in an unroutable shed, collect).
- **Accepted cost:** NOT STATED BY SOURCE. My reading: it delays the grant for a player whose prison is briefly non-compliant, which fights the owner's own rule that the first threshold be very low so the payment arrives before a new player strands themselves.
- **Build size:** Small — a predicate swap on a mechanism not yet built.
- **Status:** ALREADY DECIDED (threshold grants) — this is a refinement of the decided item, not a new one.

## D7. Charge a small daily upkeep per certified place
- **Source:** FAZA1 — "Sink 1: utrzymanie certyfikowanej pojemności"; FAUCET1 — "4.2. Sinki fazy 1", "6.2", "7.1"; MECH1 — "14. Czynsz za pustą pojemność"
- **Mechanic:** `S_upkeep = k_u_occ * P + k_u_empty * max(0, K - O)` — a daily charge per certified occupied place and a smaller one per certified but empty place, covering wear, cleaning and administration. Recommended starting values: `k_u_occ = 15` (test range 0/10/15/20/30), `k_u_empty = 2` (test range 0/2/5/10), with three named balance profiles Soft (10 / 0), Target (15 / 2) and Hard (25 / 5). FAUCET1's table at 12 places and 3 guards shows `k_u = 40` zeroes the margin at the 60 need-floor rate and `k_u = 60` makes it −240/day, so 60 is rejected as a global cost. The charge is explicitly per *place*, not per wall or per object, so that decorative construction is not billed. MECH1 proposes the empty-capacity half alone as a standalone mechanic ("czynsz za pustą pojemność"), with the first few places exempt and the charge applying only to completed cell capacity, so that the player cannot build endless empty wings as a free hedge — its stated cost is that it "uderza w ostrożnego gracza" [hits the cautious player] and may be too harsh on expensive, not-yet-populated cells.
- **Reuses:** The day-boundary billing path already used for the 80/guard/day wage; certified capacity from D1.
- **Player now optimises:** Whether to keep empty certified capacity standing between intakes, and whether the marginal place pays for itself at the need-satisfaction level the prison actually achieves. Empty capacity stops being free.
- **Accepted cost:** Stated: if upkeep scales with income at the same proportion, every expansion becomes mathematically neutral and the growth decision disappears — "koszt powinien być łagodny i służyć jako stabilizator, nie jako drugi podatek". Also stated: `k_u = 10–20` probably will not absorb a large surplus at high service quality.
- **Build size:** Small — one more line item in the day-boundary billing.
- **Status:** NEW

## D8. Charge a fee to bring a suspended place back
- **Source:** FAZA1 — "Sink 3: kontrakty naprawcze i odbudowa po incydencie"; FAUCET1 — "4.2. Sinki fazy 1" (cost table)
- **Mechanic:** When an incident damages a room, suspends a place or creates a liability, the player pays a one-off recovery fee to clear it and restore certification. Costs are keyed to the class of problem, not to a random multiplier: a missing bed or plain configuration error costs 0 (the player fixes it by building), a local post-incident suspension costs 80–160 (recommended 120), a serious wing-level suspension costs 240–480 (recommended 360) — "koszt odpowiada kilku dniom płac jednego strażnika". Money may shorten recovery or pay for the service but must never buy certification for a place that does not physically satisfy the conditions. The fee is voluntary in timing; paying it accelerates return to revenue.
- **Reuses:** The incident system (assault, riot, escape attempt, gang retaliation — which the brief says fires every two in-game days even under full coverage), the certification state, Treasury.
- **Player now optimises:** Whether to pay now to restore income, or ride out the suspension and spend the money on wages or materials. It gives incidents a price, which they currently do not have.
- **Accepted cost:** Stated: if repair is always cheaper than the consequence, incidents stop mattering; the price must scale with damage and with the delay to payout.
- **Build size:** Medium — needs incidents to actually mark a place or sector as suspended, which does not exist today (incidents record an injured entity id and nothing else).
- **Status:** NEW

## D9. Sell a daily risk-service premium for high-risk placements
- **Source:** FAZA1 — "Sink 2: premium za ochronę i obsługę ryzyka"
- **Mechanic:** Risky contracts, or places in high-risk sectors, require a daily protection budget that funds extra posts, incident response, or the protection of a specialist wing. If the player does not fund the premium, the place stays physically present but loses certification or accrues liability. The document is explicit that the spend must lower risk or lower the cost of consequences, never guarantee the absence of incidents, because full coverage demonstrably does not.
- **Reuses:** Security sectors, coverage and post assignment, the `0 of 2 / 1 of 2 / 2 of 2` HUD readout, guard wages, the incident system, and (unread today) risk tiers — this is one of the few proposals in the batch that gives risk tiers a consumer.
- **Player now optimises:** Whether to accept high-risk population at all, since the premium prices the difference between a low-risk and a high-risk prisoner-day. Population stops being homogeneous.
- **Accepted cost:** Stated as above — the premium must not be sold as safety insurance. Depends on a "risk-weighted contracts" system the document assumes exists elsewhere and does not specify here.
- **Build size:** Medium — the sector-level charge is cheap, but the risk-weighted intake it prices is not described in this document.
- **Status:** NEW

## D10. Sell paid inspections and expedited recertification
- **Source:** FAZA1 — "Sink 4: płatne przeglądy i odnowienie certyfikacji"
- **Mechanic:** Certification is automatic and free at small scale, but a larger facility can pay for a formal review that restores a suspended place faster or grants a temporary derogation [czasowe odstępstwo]. Framed explicitly as buying an operational option, not as a research node: "To nie jest klasyczny research tree; jest to zakup operacyjnej opcji."
- **Reuses:** Certification state, Treasury, the alert band. Gestures at the brief's "no relationship with anything outside itself" gap without building an inspection subsystem.
- **Player now optimises:** Time-versus-money on recovery — the same axis as D8, at a different scale.
- **Accepted cost:** Stated: the player may read it as paying for permission to play; the document recommends it be an optional accelerator or a one-off protection, never a mandatory recurring fee.
- **Build size:** Small if it is only a fee on D8's path; large if anyone builds a real inspection system behind it.
- **Status:** NEW

## D11. Price loans as disclosed total repayment with a rate cap
- **Source:** FAZA1 — "Sink 5: kredyt i odsetki jako kontrolowany odpływ"; FAUCET1 — "2. Jednostka czasu i konwencja księgowania", "10. Nie traktować jako sinka"; MECH1 — "Decyzje, które warto zakwestionować / Loans nie powinny być automatycznym ratunkiem"
- **Mechanic:** Loans carry interest or an administration fee, but their function stays liquidity rescue, not income. The minimum rule: total repayment cost is known at drawdown and every instalment reduces principal and interest with no hidden charges outside the HUD. A loan draw `L_d` is reported separately from operating income and is explicitly not a faucet — "pożyczka zwiększa płynność, ale nie powinna być raportowana jako zdrowy faucet". Because there is no game over and no floor, interest on a negative balance can escalate without limit, so the design needs a cap on the rate of accrual plus a restructuring mechanism that is painful but available. MECH1 adds three specifics: a loan must have a start day, interest accrued at the day boundary, and repayment deducted from the existing prisoner-day income line rather than from a separate pot — while the instalment must never cause a soft game over without a visible forecast in the HUD. Without a repayment schedule the loan is just a button labelled "turn a cash problem into more cash".
- **Reuses:** Treasury going negative (decided), wage arrears accrual as the existing precedent for a persisting liability.
- **Player now optimises:** Whether the loan buys a route out or merely postpones the diagnosis — the ledger split (`operatingNet` negative while `cashChange` positive = "pożyczka maskująca deficyt") is designed to make the player see the difference.
- **Accepted cost:** Stated: unbounded interest against a balance with no floor; hence the cap and the restructuring path.
- **Build size:** Small-to-medium on top of the decided loan feature.
- **Status:** ALREADY DECIDED (loans) — the accrual cap and the mandatory restructuring path are the parts the decided item does not yet cover.

## D12. Sell delivery priority and throughput
- **Source:** FAZA1 — "Sink 6: priorytetowe dostawy i przepustowość delivery-bay"; priority table row 3
- **Mechanic:** Standard delivery stays free beyond the material cost, but the player can pay for a priority delivery, for greater throughput, or to unblock a stalled order. Explicitly aimed at the dormant job system and the unread `delivery-access` capability. The document places it third in its sink priority order and conditions it on the job system first being bound to real room containers.
- **Reuses:** The complete-but-unused job system (job board, workers, containers, carry legs, reservations), the `delivery-bay` room (one of the nine dead rooms), the `loading-dock-door` object's `delivery-access` capability, the existing 100-tick delivery delay.
- **Player now optimises:** Money buys time rather than objects — "pieniądze kupują czas, a nie tylko obiekty". A player against a deadline pays for the delivery and gives up wages or repairs.
- **Accepted cost:** Stated: if delivery speed is always the best purchase, the sink becomes compulsory; the option has to be worth it mainly in crises.
- **Build size:** Large — the fee is trivial, but it is worthless until room instances are bound to containers so that deliveries physically travel, which the brief says has never been done.
- **Status:** NEW

## D13. Let the player fund an incident reserve
- **Source:** FAZA1 — "Sink 7: rezerwa incydentowa"
- **Mechanic:** The player may set aside a daily amount into a reserve that reduces the sudden liability cost of an incident. The money is frozen rather than destroyed; with no incidents it can be released after a notice period. The player can reduce the reserve before a payout at the cost of losing the protection.
- **Reuses:** Treasury, the incident system, the day boundary. No new currency.
- **Player now optimises:** Variance versus liquidity — pre-paying against a hazard the brief says arrives roughly every two in-game days.
- **Accepted cost:** Stated: the reserve can degenerate into a flat tax; its benefit has to be proportional to actual uncertainty, and the withdrawal path must exist.
- **Build size:** Small — an escrow field and a release timer.
- **Status:** NEW

## D14. Buy sector-level guard training instead of more guards
- **Source:** FAZA1 — "Sink 8: szkolenie i utrzymanie personelu"
- **Mechanic:** An optional training purchase that raises post effectiveness, shortens response, or lowers the cost of selected incidents. Explicitly *not* per-guard experience modelling: the investment attaches to a sector level or a policy profile, limited to a few tiers.
- **Reuses:** Security sectors, post assignment, guard wages, the incident system.
- **Player now optimises:** More guards at 80/day each versus a better-prepared team — a genuine second shape for the same money.
- **Accepted cost:** Stated: it risks becoming a mandatory purchase before every scale-up; hence "ograniczyć go do kilku poziomów".
- **Build size:** Medium — needs incident resolution to read a sector-level modifier, which nothing does today.
- **Status:** NEW — but note it sits close to the brief's rule 4. The document does say what it gates (response speed, incident cost), so it is not a lock on an open door; it is, however, the thin end of a research tree.

## D15. Clan system: shared coordination, dues and projects
- **Source:** KLAN3 — "2. System klanowy: możliwe funkcje ekonomiczne", "4. Sinki klanowe", "15. Rekomendowany model MVP"
- **Mechanic:** Players form clans that coordinate risk-contract intake, co-fund projects, share limited bonuses to coverage/logistics/recovery, and hold rank or reputation. Three ownership models are compared — individual treasuries with clan coordination only (recommended MVP), a shared clan treasury (permitted only as a purpose-bound escrow with limits, a log and permissions), and clan-owned assets. Membership dues are `S_membership = baseFee + activeMemberFee * activeMembers`, Target profile `40 + 5 * activeMembers` per day, charged only against accounts that actually accepted or completed a contract in the billing period, with a minimum activity threshold of 3 (Hard: 5). Rule 1 of the MVP: "Klan nie otrzymuje pieniędzy za członkostwo ani liczbę więźniów."
- **Reuses:** Nothing in Lockstate. Requires accounts, identity, a server, shared state, and an anti-fraud posture the document itself admits cannot be assumed — "W środowisku bez zewnętrznego systemu antyfraud nie należy budować ekonomii, która wymaga wykrywania wszystkich altów."
- **Player now optimises:** In a multiplayer game: whether to specialise in high-risk contracts under shared reserve, or stay independent. In Lockstate: nothing, because there is one player.
- **Accepted cost:** Stated at length — alt-account farming, wealth concentration (top-1-clan share over 25% is the warning threshold), collusion, capital-concentration spirals.
- **Build size:** Large, and mostly outside the game — accounts, a server, a shared economy, moderation.
- **Status:** OFF-BRIEF — Lockstate is single-player with local IndexedDB saves, no accounts and no server. Extract the single-player cores below (D18, D20, D21) instead.

## D16. Player-to-player auction house with escrow and commission
- **Source:** KLAN3 — "5. Aukcje graczy", "7. Model aukcyjny", "13. Reguły anty-exploitowe"
- **Mechanic:** A player-to-player market for existing assets. Settlement is `buyerDebit = price + listingFee + buyerFee`, `sellerCredit = price * (1 - commissionRate)`, `auctionSink = listingFee + buyerFee + price * commissionRate`. Target fee profile: 10 listing fee, 5% seller commission, 2% buyer fee, 20 relisting fee, 1–3% bid deposit [kaucja], minimum auction duration one day. Bids sit in deterministic escrow written to the save state: `availableTreasury_buyer = totalTreasury - lockedBids - lockedClanReserve`; losing bids are released at a single finalisation. Safe to list: surplus brick/plank, prepaid unused logistics items, limited operational contracts, priority delivery slot rights, transferable projects with non-zero upkeep. Never listable: money transfers, prisoner contracts as tradeable future income, high-risk premium rights, future threshold grants, free capacity certificates.
- **Reuses:** Nothing in Lockstate. The brick/plank stock and the material purchase path are the only touch points, and they need a counterparty that does not exist.
- **Player now optimises:** Whether to hold or liquidate surplus material at market price rather than at a fixed sell-back rate.
- **Accepted cost:** Stated: transfer laundering (A sells B a worthless item at a huge price), bid inflation to fake a price index for collateral, concentration spirals. The document's own mitigations are detection-based, i.e. they need a server.
- **Build size:** Large, and outside the game.
- **Status:** OFF-BRIEF — assumes multiple players trading with each other on a shared market. The valuable residue is D19 and D22.

## D17. Three money-creating group mechanisms the document rejects outright
- **Source:** KLAN3 — "14. Wpływ na stabilność inflacyjną — ocena syntetyczna", "20. Decyzja końcowa"
- **Mechanic:** Recorded as rejections, not proposals: (a) cash rewards for clan membership or headcount — "Odrzucić", because they scale with the number of accounts and are farmable by alts; (b) auctioning future income — selling prisoner contracts, risk premiums or future threshold grants — rated "Bardzo wysokie" concentration risk and rejected in MVP, because it turns a prisoner into a bond and lets the wealthy buy further income sources; (c) unlimited system-supplied auctions of productive assets, because a zero-production-cost item lets the player buy value with no matching sink.
- **Reuses:** N/A.
- **Player now optimises:** N/A.
- **Accepted cost:** N/A — these are the document's own rejections.
- **Build size:** N/A.
- **Status:** OFF-BRIEF — but rejection (b) has a single-player analogue worth keeping on file: **do not let the player capitalise future income**, i.e. no mechanism that converts the coming stream of threshold grants or prisoner-day income into cash now. That is a live risk once loans exist, and it is the same shape as a loan secured against projected occupancy.

## D18. [Single-player core] Sell capital projects: big up-front, daily upkeep, hard per-prison cap
- **Source:** KLAN3 — "4.3. Projekty klanowe" and "10. Klan jako sink ryzyka, nie faucet" (project cost table)
- **Mechanic:** Extracting the single-player core of the clan-projects table: one-off facility purchases with a real price, a daily upkeep, a hard instance limit, and effects that improve *information, throughput or recovery* but never the base prisoner-day rate. The document's own five, with its numbers: Shared logistics desk — 1,000 up front, 20/day, +10% priority-transfer limit, 1 per clan; Risk audit office — 1,500, 30/day, better expected-liability preview, 1; Recovery reserve fund — 2,000, 0/day, reserve covers up to 25% of repair cost, 1; Coverage coordination — 2,500, 50/day, one extra sector allocation option, 2; Auction exchange — 3,000, 60/day, lower listing fee, 1. The governing rule is explicit: "Efekty mają zwiększać jakość decyzji, nie przychód wprost" [effects should raise decision quality, not income directly] and a project must never raise a prisoner's base rate without a proportional increase in risk cost.
- **Reuses:** Treasury, the day-boundary billing path, security sectors and post allocation (Coverage coordination), the incident system (Recovery reserve), the job system and `delivery-bay` (logistics desk). Read singleplayer, four of the five map onto the dead rooms — a `security-office` that hosts coverage coordination, an `administration` room that hosts the risk audit, a `delivery-bay` that hosts the logistics desk.
- **Player now optimises:** A large lump sum against a permanent daily bill, for an option rather than for income. This is a second axis to population: 2,500 buys either 31 guard-days or one permanent sector option.
- **Accepted cost:** Stated for the multiplayer case (concentration spiral: throughput bought with wealth generates more wealth) with the mitigation being diminishing returns, per-owner limits and upkeep. Single-player cost: a purchase that is always correct at some treasury size is not a decision, it is a delay.
- **Build size:** Medium — the purchase and upkeep are trivial; each project's effect is a separate small feature, and two of the five effects (priority transfer, sector allocation option) do not exist yet.
- **Status:** NEW (single-player core extracted from an OFF-BRIEF proposal)

## D19. [Single-player core] Limited, priced supply for system-sold goods
- **Source:** KLAN3 — "12.1. Cena minimalna i maksymalna", "12.2. Malejąca dostępność"
- **Mechanic:** Where the *system* sells to the player, supply is finite and priced with a floor and a ceiling: `systemFloorPrice = acquisitionCost + minimumSink`, `systemCeilingPrice = referenceValue * 3`, and `supply = min(systemBudget, externalContractOutput)`. The stated rule is that there must be no infinite supply of anything that raises risk capacity, certified capacity or work throughput. The price ceiling applies only to system offers, never to a private transaction, because a hard global cap destroys price discovery.
- **Reuses:** The two purchasable materials (brick 40, plank 65), the purchase-and-100-tick-delivery path, cancellation before landing.
- **Player now optimises:** Stockpiling. If brick supply per day is finite and the price moves inside a band, buying early and holding stock becomes a decision with a cost, which FAZA1 §7.1 names as a current gap — "Gracz nie ponosi kosztu zmienności ani decyzji o zapasie" [the player bears no cost of volatility or of the stocking decision].
- **Accepted cost:** NOT STATED BY SOURCE for the single-player case. My reading: a supply cap can hard-block a build the player has already committed to, and a moving price is one more number to read on a HUD that does not show materials prominently today.
- **Build size:** Small — a per-day supply counter and a price band on an existing purchase path. It is the only part of the auction document that needs no second player at all.
- **Status:** NEW (single-player core extracted from an OFF-BRIEF proposal)

## D20. [Single-player core] Cap a contract payout by verified output
- **Source:** KLAN3 — "3.2. Nagrody za wspólne kontrakty"; anti-exploit rule "Farmienie pustych kontraktów: Nagroda dopiero po zweryfikowanym output"
- **Mechanic:** An external contract pays a reward, but the reward is capped: `F_contract ≤ verifiedOutputValue`, where `verifiedOutputValue = min(completedWorkValue, certifiedCapacityValue, externalContractBudget)`. Payment lands only after verified output, never on acceptance. In the multiplayer framing the split is by actual contribution to work, funding or risk rather than equal shares; single-player, the split disappears and the cap remains.
- **Reuses:** The job system (as the source of `completedWorkValue` — this is the closest thing in the batch to a producer for the built-and-unused job system), certified capacity from D1, the per-prisoner-day line as the fallback.
- **Player now optimises:** Whether the prison can actually deliver before accepting the contract — a prison that accepts a large contract and cannot staff the work rooms gets the smaller of the three terms. It also makes work rooms matter, which addresses `free-association` fulfilling nothing during the ~1,000 work ticks a day.
- **Accepted cost:** NOT STATED BY SOURCE beyond the anti-farming intent. My reading: a payout that is the min of three terms is a payout the player cannot forecast, and the brief's own bar is a visible feedback loop; the HUD would have to show which term is binding.
- **Build size:** Medium — needs a contract entity and a definition of `completedWorkValue`, neither of which exists; the cap itself is arithmetic.
- **Status:** NEW (single-player core extracted from an OFF-BRIEF proposal)

## D21. [Single-player core] Lock a reserve proportional to the risk you took on
- **Source:** KLAN3 — "4.2. Klanowy escrow ryzyka"; "7.3. Aukcja zamknięta i escrow"
- **Mechanic:** `reserve = reserveRate * riskLoad` — accepting high-risk population obliges the player to freeze cash proportional to the risk carried. The money is locked, not burned; it is released against a real repair, liability or transfer. Spendable money becomes `availableTreasury = totalTreasury - lockedReserves`, and the lock must be deterministic and written into the save. A warning threshold is given: locked reserves above 30% of total wealth means liquidity is over-frozen.
- **Reuses:** Risk tiers (finally consumed), Treasury, save state, the incident system as the release trigger. Extends D13 by scaling the reserve with the population's actual risk profile instead of a flat opt-in amount.
- **Player now optimises:** The composition of the population, not just its size. A high-risk intake pays more per prisoner-day (assuming a risk-weighted rate) but sterilises working capital that would otherwise buy bricks — a direct trade between income rate and build speed.
- **Accepted cost:** Stated in the multiplayer framing: over-freezing liquidity. Single-player it is sharper — a forced lock on a treasury that already cannot go negative would have blocked construction outright, so it depends on the decided change that permits a negative balance.
- **Build size:** Small-to-medium — a locked-funds field and one HUD number, plus a risk-weighted intake to drive `riskLoad`, which does not exist.
- **Status:** NEW (single-player core extracted from an OFF-BRIEF proposal)

## D22. [Single-player core] Guardrails for sell-back: no selling what is committed
- **Source:** KLAN3 — "13. Reguły anty-exploitowe" (rows "Sprzedaż przedmiotu w użyciu", "Dublowanie przedmiotu", "Transfer bez aktywa"); "12.1" floor price; FAZA1 — "7.1" (sell-back listed as an inflation source); MECH1 — "Decyzje, które warto zakwestionować / Sell-back materiałów wymaga strat i opóźnienia"
- **Mechanic:** An asset that is active, reserved, or currently certifying cannot be put up for sale; ownership transfers atomically with payment, so nothing can be duplicated. Applied to the decided sell-back-at-a-loss feature: material allocated to a queued build order or reserved by a job cannot be sold, and the sale price must sit at or below `acquisitionCost - minimumSink` so that the buy-then-sell round trip is never a safe arbitrage. FAZA1 states the failure mode directly: "Zbyt mała strata tworzy bezpieczny arbitraż zakup–sprzedaż" [too small a loss creates a safe buy-sell arbitrage]. MECH1 adds a second guardrail: sell-back must also carry a *delay*, because an instant refund straight after purchase lets the player spam orders with impunity — delivered material should require a separate sell job, or at least a small operating cost, on top of a price below what was paid.
- **Reuses:** The build-order reservation and refund path, the global material inventory, the job system's reservation concept.
- **Player now optimises:** Nothing new — it stops sell-back from becoming a free undo and stops it interacting with build-order refunds the way the bed exploit already does.
- **Accepted cost:** NOT STATED BY SOURCE. My reading: a sell-back the player cannot use on committed material will read as a refusal, so the refusal band has to explain it.
- **Build size:** Small.
- **Status:** ALREADY DECIDED (sell-back) — this is the guardrail the decided item does not yet specify.

## D23. [Single-player core] Classify every money movement in the ledger
- **Source:** KLAN3 — "17. Telemetria" (ledger classification block)
- **Mechanic:** Every movement is recorded as exactly one of `new_currency_created`, `currency_transferred`, `currency_burned`, `currency_locked`, `currency_unlocked`. The stated reason: without the distinction, a large transfer looks like a faucet and the economy is misdiagnosed. Single-player, "transferred" mostly collapses, but created / burned / locked / unlocked is exactly the distinction FAUCET1 needs to tell an investment from a sink from a loan draw.
- **Reuses:** Treasury, the day-boundary transaction from D5.
- **Player now optimises:** Nothing — instrumentation. Its value is to whoever balances the game.
- **Accepted cost:** NOT STATED BY SOURCE. My reading: none; it is a tag on an existing write.
- **Build size:** Small.
- **Status:** NEW (developer-facing; by rule 3 it is decoration to the player and should be judged as tooling, not as a mechanism)

## D24. Pay a bonus for holding occupancy incident-free for N days
- **Source:** MECH1 — "1. Premia za bezpiecznie utrzymaną pojemność" and "3. Kontrakt na niski poziom incydentów" (two framings of the same payout)
- **Mechanic:** Two variants of one idea. (a) State bonus: the state pays a one-off bonus for holding a given share of occupied places with no serious incident for a period — the worked example is 80% occupancy and zero riot/escape-attempt for 3 days. Thresholds continue indefinitely, but each further threshold demands a longer period or a better result. (b) Voluntary contract: the HUD offers an opt-in target — zero riots for 2 days, then zero assaults for 4 days, escalating payout — which is forfeited the moment the named event fires and cannot be activated retroactively.
- **Reuses:** Occupied places and capacity, the incident system, the day counter and day boundary, the status strip and alert band, Treasury. Nothing new.
- **Player now optimises:** *When* to take the next intake instead of always maximising population. Under variant (b) it also creates a reason not to build or admit at a critical moment — the first mechanism in the batch that makes waiting a strategy.
- **Accepted cost:** Stated: it delays income and can force the player to keep beds empty.
- **Build size:** Small — a period counter, an incident predicate, one payout.
- **Status:** NEW

## D25. Hold part of the admission payment as a returnable deposit
- **Source:** MECH1 — "2. Depozyt za przyjęcie więźnia"
- **Mechanic:** On admission the state pays a deposit, but part of it is only released at the prisoner's release, and only if their six needs never exceeded a defined level and they had no serious incident. Explicitly framed not as a penalty for every failure but as a buffer against the cost of a difficult case.
- **Reuses:** Admission, the six needs, sentence end, incident records, the existing per-prisoner-day payout path.
- **Player now optimises:** Which prisoner to keep in a payable condition, and when to admit — the first mechanism here that makes an *individual* prisoner worth caring about, which is directly the brief's "there is no reason to prefer one prisoner over another".
- **Accepted cost:** Stated: it reduces immediate liquidity, so the player may prefer to hold a cash buffer.
- **Build size:** Small-to-medium — a balance field on the prisoner record and a settlement at departure.
- **Status:** NEW

## D26. Pay for average need stability, not for zero unmet needs
- **Source:** MECH1 — "4. Próg stabilności potrzeb"
- **Mechanic:** Instead of only withholding 40 per unmet need, the state pays a bonus for holding the *average* need level below a threshold across a day. A second, harder threshold requires that no single need crosses a red level for, say, 400 ticks.
- **Reuses:** The six needs, the existing withholding schedule, regime blocks, the day boundary. No new data.
- **Player now optimises:** The order of regime blocks, and — the important part — investment in the three needs that are currently unprofitable because they cannot be satisfied inside a normal sentence (hygiene 10,200 ticks, recreation 13,600, safety 20,400). A payout for *level* rather than *satisfaction* makes partial provision worth money for the first time.
- **Accepted cost:** Stated: full stability may demand more floor area, longer walking routes and lower occupancy.
- **Build size:** Small — aggregate values that already exist, plus a payout condition.
- **Status:** NEW

## D27. Pay the prison for prisoner work actually performed
- **Source:** MECH1 — "5. Program »pracujące 1,000 ticków«"; PROPOSALS — "3. Prison Labour: Work-Unit Industry"
- **Mechanic:** Both propose paying for worked time rather than for existing. MECH1: a prisoner is credited only for time effectively worked inside the existing work blocks; `free-association` produces nothing; the payout may have a per-prisoner daily cap. PROPOSALS gives the concrete rates: work in `kitchen` yields 1 Work Unit per 50 ticks at 2 cash, `laundry` 1 per 60 ticks at 3 cash, `classroom` 1 per 80 ticks at 5 cash (requires a `bookshelf`); Work Units are credited only if the prisoner's Safety need was above 50% at the start of the block; the job system is bound to room instances so a work order is created per room, prisoners reserve it, and room capacity equals the number of usable objects (`prep-counter`, `washing-machine`, `desk`); billed at the day boundary.
- **Reuses:** The regime `work` blocks (~1,000 ticks a day), the job system with its board, reservations and workers, `kitchen`/`laundry`/`classroom`, `prep-counter`/`washing-machine`/`desk`/`bookshelf`, the six needs (Safety as the gate), pathfinding.
- **Player now optimises:** How to spend the ~1,000 daily work ticks across three different cash-per-tick profiles, and where to put the work rooms so prisoners can reach them. This is Decision 3's "prison labour" secondary line, which the brief says does not exist.
- **Accepted cost:** MECH1: work raises fatigue and may raise safety pressure or incident risk if the player gives every free block to work. PROPOSALS: work blocks stop being hidden free time, so a prisoner with no work room now genuinely idles and earns nothing, and the early game is tighter because the default regime assumes work rooms exist.
- **Build size:** Medium — the arithmetic is trivial; binding room instances to the job system is not, and the brief says no room instance has ever been bound to a container.
- **Status:** NEW. Note the two sources disagree on framing: MECH1 pays per *tick worked* with a daily cap, PROPOSALS pays per *unit produced* with a needs gate. The unit version prices rooms differently from each other; the tick version does not.

## D28. Charge for regime capacity the prison failed to use
- **Source:** MECH1 — "6. Opłata za niewykorzystany potencjał regime"
- **Mechanic:** At day end, a report shows the share of `work`/`education`/`free-association` blocks in which prisoners did nothing. A high figure costs the player part of the potential population bonus, or an administrative fee. Explicitly framed as a cost of *empty throughput*, not as another needs penalty.
- **Reuses:** `free-association`, regime blocks and action categories, the existing HUD.
- **Player now optimises:** Whether to start work or education, versus leaving the time free for needs. It puts a price on the brief's own observation that a prisoner without a work room idles through 40% of the day.
- **Accepted cost:** Stated: the player may be forced to build an expensive room purely to avoid a loss — which is close to being a fine for not owning a building.
- **Build size:** Small — a completion statistic and a financial modifier.
- **Status:** NEW

## D29. Offer contracts with a risk-tier composition, not a headcount
- **Source:** MECH1 — "7. Ocena ryzyka jako mnożnik kontraktu"
- **Mechanic:** A risk tier does not automatically pay more. Instead contracts carry a profile — "10 low-risk", "5 high-risk with no riot", "mixed custody" — and the high-risk payout rises with risk, along with danger and security requirements.
- **Reuses:** Risk-tier classification at admission (currently consumed by almost nothing), the incident system, security sectors, the grant/contract path.
- **Player now optimises:** The *mix* of the population rather than its size. This is the batch's cleanest answer to "there is no reason to prefer one prisoner over another".
- **Accepted cost:** Stated: rewarding high-risk intake can make a small mistake catastrophic.
- **Build size:** Small-to-medium — filters on records that already exist plus contract rules.
- **Status:** NEW

## D30. Make classification review earnable and make it pay
- **Source:** MECH1 — "8. Awans klasyfikacji za dowody stabilności"; PROPOSALS — "17. Classification Review as Rehab Grant"
- **Mechanic:** MECH1: after a set number of days without a given incident, a prisoner becomes eligible for classification review; a successful review moves them to a lower risk tier, but requires a free slot and cannot happen during an alarm. PROPOSALS: every review pays or charges on the tier change — High→Medium 400, Medium→Low 250, Low→Medium 150 (as written in the source), Medium→High 0, and an *upgrade* costs a Security Penalty of 200; ineligible reviews simply do not fire.
- **Reuses:** The global classification-review schedule and its per-record eligibility, risk tiers, sentence-length eligibility, the incident log, Treasury.
- **Player now optimises:** Keeping prisoners calm and incident-free long enough to be reviewed down a tier — which turns the brief's dead statistic ("eight of fifteen drawable sentence lengths can never be reviewed at all") into a thing the player watches.
- **Accepted cost:** MECH1: a downgrade lowers the value of a risky contract and consumes administrative capacity. PROPOSALS: a violent prison loses money at review time.
- **Build size:** Small — a lookup at review time plus one eligibility predicate. Note the sources conflict: PROPOSALS' Low→Medium = 150 pays for an *upgrade* to a worse tier, which reads as an error against its own Security Penalty rule.
- **Status:** NEW

## D31. Pay a bonus for keeping risk profiles segregated
- **Source:** MECH1 — "9. Premia za skuteczną segregację"
- **Mechanic:** The player may take a contract requiring that a given risk-tier profile not share sectors or key rooms with another profile for a day. The payout depends on measured compliance, not on owning a room.
- **Reuses:** Security sectors, room zones, routing, risk tiers, the coverage status readout.
- **Player now optimises:** The layout of sectors and passages, rather than the guard count — a spatial decision the brief has no other producer for.
- **Accepted cost:** Stated: segregation duplicates infrastructure and can strand part of the capacity unused.
- **Build size:** Medium — co-presence checking per sector plus a contract profile.
- **Status:** NEW

## D32. Pay on coverage-time, not on coverage-now
- **Source:** MECH1 — "10. Strażnik jako koszt zasięgu"
- **Mechanic:** Full coverage remains the baseline, but a security contract's bonus depends on the *time* a sector was actually covered across the day. Wages for the second post do not rise; only the contract payout rises, and only when every required sector was covered.
- **Reuses:** Deployment, post assignment, the `0 of 2 / 1 of 2 / 2 of 2` coverage HUD, wages, the incident system.
- **Player now optimises:** Where guards stand and which sectors take priority, on an integral rather than an instant — a guard shuffled between sectors no longer looks the same as a guard who held one.
- **Accepted cost:** Stated: it encourages keeping guards in expensive, apparently empty sectors.
- **Build size:** Small — a coverage-time aggregate on top of existing sector state.
- **Status:** NEW

## D33. Make patrol a paid service with a real opportunity cost
- **Source:** MECH1 — "11. Patrol jako płatna usługa, nie bezpłatny buff"
- **Mechanic:** Once a real patrol route is assigned, a sector can earn a security bonus, but every patrol costs time: the guard is not holding a post while patrolling. The bonus depends on the *regularity of visits*, not on a guard being present somewhere.
- **Reuses:** Pathfinding, the existing patrol system, guards, sectors, incident risk. Directly targets the brief's "Guards never patrol — the default security sector is derived and carries no patrol route, so the patrol system skips it."
- **Player now optimises:** Route, rhythm, and the patrol-versus-post trade.
- **Accepted cost:** Stated: patrolling temporarily weakens static coverage.
- **Build size:** Medium — the source is candid that it requires "naprawa producenta route" [fixing the producer of the route], plus a last-visit counter. The brief calls the missing route a deliberate consequence of an accepted decision, so this one is not free.
- **Status:** NEW — and note it pushes against a decision the brief describes as deliberate; whoever files it should check that ADR first.

## D34. Make the contraband sweep cost guard time and pay on a find
- **Source:** MECH1 — "12. Sweep jako ubezpieczenie przeciw depozytowi"; PROPOSALS — "8. Contraband Sweep Economy"
- **Mechanic:** The recently added sweep duty stops being free. PROPOSALS: a sweep takes 120 ticks during which the guard leaves sector coverage; if coverage falls below 100% in any sector during the sweep, that sector's incident probability rises sharply; a successful find pays a Confiscation Grant of 50 cash; a prisoner caught with contraband is routed to `solitary-cell` for 2,000 ticks and generates 0 income while there. MECH1 adds a cooldown, requires available guard time, notes that a find can itself create tension or consume the evidence item, and ties the sweep to protecting the admission deposit (D25) or satisfying a contract condition.
- **Reuses:** Contraband introduced at admission (10–20% chance), the new sweep duty, guard coverage, `solitary-cell` (which finally does something), routing, Treasury.
- **Player now optimises:** When and where to sweep. Sweeping too often leaves sectors uncovered; never sweeping lets contraband accumulate and raise the incident base rate.
- **Accepted cost:** Stated: solitary removes a revenue-bearing prisoner from the population — aggressive security is profitable but shrinks the tax base.
- **Build size:** Small — a guard lockout, a treasury credit, a solitary routing rule.
- **Status:** NEW

## D35. Make overcrowding a curve, not a cliff
- **Source:** MECH1 — "13. Koszt przeludnienia jako krzywa, nie próg"
- **Mechanic:** Above 100% occupancy, both the unmet-need withholding and the incident probability grow non-linearly: 110% is uncomfortable, 140% is a sharp spike. Capacity must be computed from current room capacity, not from a historically recorded bed count.
- **Reuses:** Occupied places, room capacity, the existing need-withholding schedule, the incident scheduler. One shared modifier on calculations that already run.
- **Player now optimises:** A safe occupancy level — a genuine second axis, and the source names it as the precondition for threshold grants not degenerating into "pack the prison".
- **Accepted cost:** Stated: a miscalculation before an intake can turn a profitable day into an arrears spiral.
- **Build size:** Small.
- **Status:** NEW. Contrast with D2: FAUCET1 clamps payment at certified capacity (a hard cliff), MECH1 degrades continuously. They solve the same accepted-consequence gap in Decision 1 by opposite means and should not both ship.

## D36. Pay contracts for a state transition, not for a state
- **Source:** MECH1 — "15. Kontrakty zależne od przebudowy"
- **Mechanic:** A contract pays for changing the existing structure — e.g. raise places by 5, add 2 beds, and hold zero arrears for one day. It never pays for merely owning a finished facility; it pays for the move from state A to state B, validated against a snapshot of the starting condition.
- **Reuses:** Build orders, capacity, beds, Treasury, thresholds, the save state.
- **Player now optimises:** The timing and order of investment. This is the closest thing in the batch to the threshold grant's own logic — pay for growth, not for existing — applied to structure rather than headcount.
- **Accepted cost:** Stated: it can reward pointless rebuilding, so contracts must be restricted to changes that raise real throughput.
- **Build size:** Small-to-medium — an initial-condition snapshot and a validator.
- **Status:** NEW

## D37. Make materials physically travel: bind the job system to rooms
- **Source:** MECH1 — "16. Dostawa jako przepustowość ekonomiczna"; PROPOSALS — "15. Storage-Room as Inventory Anchor" (also PROPOSALS' own "least certain but most interesting" pick)
- **Mechanic:** Materials stop teleporting into one global inventory. MECH1: logistics throughput derives from `delivery-bay`, `loading-dock-door`, `storage-rack` and the available carry legs; insufficient throughput *delays* a build rather than rejecting the order outright. PROPOSALS is more specific: the global inventory splits into local ones, every `storage-room` with a `storage-rack` adds 50 units of capacity, purchases land in `delivery-bay` and a haul job moves them to a `storage-room`, and only material in a storage-room within 15 tiles of a construction site may be consumed by it; with no storage-room, material piles up in the delivery bay and cannot be used.
- **Reuses:** The entire job system — job board, workers, containers, carry legs, reservations — hierarchical pathfinding, `delivery-bay`, `storage-room`, `storage-rack`, `loading-dock-door`, the `item-storage` and `delivery-access` capabilities, build orders. It is the single biggest reuse proposed anywhere in this batch.
- **Player now optimises:** Physical layout — where the delivery bay sits, where storage sits, how far the build site is, how much to order and when. Construction time becomes a function of geometry.
- **Accepted cost:** Stated: logistics becomes a real bottleneck and the player can lose time despite having money; building far from storage is paid for in time and labour.
- **Build size:** Large — PROPOSALS rates it "High" and is explicit that binding containers to room instances, creating haul jobs and enforcing proximity are all non-trivial. It is also the precondition for D12 (delivery priority fee) and D38.
- **Status:** NEW

## D38. Pay a small bonus for material delivered and consumed quickly
- **Source:** MECH1 — "17. Premia za lokalny łańcuch dostaw"
- **Mechanic:** If material is delivered and consumed without exceeding a storage-time limit, the build contract pays a small bonus. Long-stored material is not destroyed but occupies storage capacity and may raise the cost of the next delivery.
- **Reuses:** Deliveries, containers, `storage-rack`, delivery timing, build orders — all of which presuppose D37.
- **Player now optimises:** Build queue planning and order size — it prices just-in-time purchasing.
- **Accepted cost:** Stated: it pushes the player toward just-in-time ordering, which is risky when a delivery is delayed.
- **Build size:** Medium, and only after D37.
- **Status:** NEW

## D39. Give objects a condition value and repair jobs
- **Source:** MECH1 — "18. Serwis budynku zamiast nowych obiektów"
- **Mechanic:** Objects wear out, expressed as a single "sprawność" [serviceability] value rather than a new model. A low value on `washing-machine`, `shower-head`, `stove`, `toilet` or `security-console` reduces the effectiveness of the corresponding action. Repair consumes existing materials and runs through the job system.
- **Reuses:** The twenty objects and their unread capabilities, brick/plank, the job board and workers, the six needs, room-object binding. Gives `utility-panel`'s `utility-control` and the console's `surveillance` a reason to be read.
- **Player now optimises:** The order of repairs, and the choice between a new wing and maintaining the old one — a recurring material drain rather than a recurring cash drain, which is a different shape from every other sink in the batch.
- **Accepted cost:** Stated: it adds a recurring material drain and can cause a failure at the worst possible moment.
- **Build size:** Medium — a durability value, a repair job, and one capability reader.
- **Status:** NEW

## D40. Give injuries a state, a recovery time and a room
- **Source:** MECH1 — "19. Zdrowie jako stan incydentu"; PROPOSALS — "11. Medical Health State (Infirmary)"
- **Mechanic:** MECH1 keeps it minimal: the `injured entity id` an incident already records receives a simple injury state with a recovery time; `medical-bed` and `medicine-cabinet` provide treatment through a job/action; untreated injury raises safety pressure and lowers the ability to work, but never kills. PROPOSALS goes further: three states Healthy / Injured / Critical, Injured moves at 50% speed and cannot work, Critical cannot leave the bed and earns 0, auto-routing to `infirmary` if a `medical-bed` is free, a new `medic` staff type at 100/day (or a guard on medic duty) healing one state per 4,000 ticks, halved by a `medicine-cabinet`, and death after 10,000 ticks Critical without an infirmary costing −2,000 cash and +50% incident probability for two days, with `Injured: N` / `Critical: N` on the status strip.
- **Reuses:** The incident system's existing injury logging, the `medical-treatment` capability that has no reader, `infirmary`, `medical-bed`, `medicine-cabinet`, routing, staff hire/dismiss, the status strip, the work system.
- **Player now optimises:** Guard coverage to prevent injuries against medic staffing to heal them, and infirmary space against cell space. It gives incidents a lasting economic price, which they currently do not have.
- **Accepted cost:** MECH1: an incident acquires a permanent economic price and can disable a worker; treatment competes for space and logistics. PROPOSALS: a medic costs more than a guard and provides no coverage; infirmary objects are costly; the death penalty is severe.
- **Build size:** Medium. MECH1's version is markedly cheaper and its own recommendation is explicit — do not wait for a full medical system, a minimal injury state plus recovery time plus one reader is enough.
- **Status:** NEW. The two versions differ sharply on one point: MECH1 says a prisoner never dies; PROPOSALS adds death with a −2,000 penalty. Death is a player-visible promise about what the simulation does and is not a small choice.

## D41. Track institutional reputation as a streak, not a bar
- **Source:** MECH1 — "20. Reputacja instytucji jako seria, nie pasek"
- **Mechanic:** Every completed contract, stability threshold and day without arrears extends a reputation streak. Breaking the streak does not reset everything; it lowers the level of the *next* contract offered. The level governs what offers are available — larger capacity contracts, risk-tier profiles, logistics — but never access to basic rooms.
- **Reuses:** Thresholds, contracts, incident history, wage arrears, the status strip, the save state.
- **Player now optimises:** Consistency over maximum one-off profit, and choosing a safe contract over a lucrative one.
- **Accepted cost:** Stated: a late-streak failure hurts more, and the player may feel one incident undid their progress.
- **Build size:** Medium — a persistent progression record plus a contract offer table.
- **Status:** NEW — and note it satisfies the brief's rule 4 precisely because it gates *offers*, never rooms: "Poziom wpływa na dostępne oferty… nie na podstawowe rooms." Any version that gated rooms would be a lock on an open door.

## D42. Derive a cell quality score from its objects and drive need decay from it
- **Source:** PROPOSALS — "1. Cell Quality Rating (the invisible overcrowding penalty)"
- **Mechanic:** Every `cell` and `solitary-cell` computes a Quality Score from the objects inside it — `bed` +2, `toilet` +1, `sink` +1, `bookshelf` +1 — and every prisoner in that cell gets a global need-decay multiplier: 1.0 at quality 0, 0.85 at quality 2, 0.70 at quality 4 or more. A cell with no bed still has floor-area capacity under Decision 5, but quality 0 means needs decay at full speed, the prisoner rapidly accumulates unmet needs, and their income falls toward the 60 floor. A bed alone is not enough: you want a toilet and a sink to keep the prisoner calm.
- **Reuses:** `cell`, `solitary-cell`, `bed`, `toilet`, `sink`, `bookshelf`, the six needs and their decay, the existing 300/260/…/60 schedule. No new UI — the Build tab already lists the objects.
- **Player now optimises:** Quality per prisoner alongside headcount. Overcrowding becomes expensive not by capping population but by eroding revenue per head, and the 1-plank-3-prisoners exploit dies because the unbedded residents tank their own income.
- **Accepted cost:** Stated: early expansion is slower, because a minimally viable cell costs more than a bed on bare ground.
- **Build size:** Small — a quality lookup at room initialisation and one multiplier in the need-decay tick. PROPOSALS rates it "Very low" and picks it as the first thing to build.
- **Status:** NEW — its source also challenges Decision 5 as the root cause of the exploit; see Part 2.

## D43. Give free-association a real, place-dependent effect
- **Source:** PROPOSALS — "2. Free-Association as a Social Safety Valve"
- **Mechanic:** `free-association` currently fulfils nothing. It now provides Safety and Recreation at 30% of a dedicated room's rate, but only if the prisoner is in a `yard` or `common-room` — in a `cell` it still gives nothing. In `common-room` it also reduces gang-retaliation probability for each participating high-risk prisoner by a stacking 5% per tick, capped at 25%. In `yard` it provides Recreation but raises assault risk whenever guard coverage is below 100%.
- **Reuses:** The `free-association` regime block, `yard`, `common-room`, `cell`, the assault and gang-retaliation incidents, guard coverage sectors, risk tiers.
- **Player now optimises:** The shape of the day and where prisoners are routed during free blocks. A prison with no work rooms stops idling through 40% of the day, but must provide guarded common space to get anything from it.
- **Accepted cost:** Stated: yard free-association without guards is dangerous, so guard deployment now trades against work-room construction.
- **Build size:** Small — a provision source on the free-association router, one incident modifier in common-room, one risk check in yard.
- **Status:** NEW

## D44. Pay a one-off admission premium by risk tier
- **Source:** PROPOSALS — "4. Risk-Tier Admission Premium"
- **Mechanic:** Every incoming prisoner pays a one-off premium on arrival — Low 200, Medium 400, High 700 — added to the day-boundary income batch. High-risk prisoners also raise base incident probability by a flat 0.3% per tick each (stacking, soft-capped); Medium raises it 0.1%.
- **Reuses:** Risk tiers classified at admission, the incident probability system, the income accrual loop.
- **Player now optimises:** Intake composition deliberately. The player can rush cash by taking high-risk prisoners early but must spend the premium immediately on coverage or riot — a risk-versus-reward axis orthogonal to population, and it composes with the decided threshold grant (take three high-risk to reach the next threshold, then survive them).
- **Accepted cost:** Stated: early-game difficulty spikes if the player takes three high-risk prisoners with no guards; front-loaded money tempts reckless expansion.
- **Build size:** Small — a lookup table at admission, one additive incident term, one credit. PROPOSALS rates it "Very low" and picks it third.
- **Status:** NEW

## D45. Make holding-cell a cheap, self-punishing overflow room
- **Source:** PROPOSALS — "5. Holding-Cell Overflow Revenue"
- **Mechanic:** `holding-cell`, one of the nine dead rooms, becomes emergency accommodation that accepts prisoners once all `cell`/`solitary-cell` capacity is full. It pays 150/day per prisoner instead of 300, needs decay 20% faster, and incident probability doubles. Capacity is floor-area only under Decision 5, so a 6×4 holding-cell holds 24 prisoners in squalor. It is authored deliberately as a debt trap: cheap to build, tempting to overuse, and it destroys the income it generates through unmet needs.
- **Reuses:** `holding-cell`, the floor-area capacity rule (Decision 5), the income schedule, need decay, the incident system.
- **Player now optimises:** Proper cells (slow, expensive) versus a holding barn (fast, self-punishing) — overcrowding gets a visible, player-chosen consequence rather than an abstract penalty.
- **Accepted cost:** Stated: a player who leans on holding-cells enters a death spiral — low revenue, high incidents, high wages, no cash for real cells.
- **Build size:** Small — a routing fallback, an income modifier, a decay multiplier.
- **Status:** NEW

## D46. Require a utility-room within range or the room is unpowered
- **Source:** PROPOSALS — "6. Utility-Room as Infrastructure Backbone"
- **Mechanic:** A `utility-room` containing a `utility-panel` must lie within 20 tiles (Manhattan) of any `shower-room`, `kitchen` or `canteen`. Outside that radius the room is unpowered: showers give 0 hygiene, kitchens cannot prepare meals, canteens cannot serve. More utility-rooms extend the grid; overlap is allowed but wasteful. A utility-panel costs 1 plank + 2 bricks.
- **Reuses:** `utility-room` and `utility-panel` (both dead), the unread `utility-control` capability, the existing distance/adjacency logic already used for enclosure checks, `shower-room`, `kitchen`, `canteen`.
- **Player now optimises:** Layout. A central utility hub or several small closets — logistics becomes topology rather than decoration. It is the cheapest proposal in the batch that gives a dead room a reason to exist.
- **Accepted cost:** Stated: a sprawling prison needs several utility-rooms, eating space that could hold cells, and an early layout mistake is expensive to retrofit.
- **Build size:** Small — a distance check at room activation and a `powered` boolean.
- **Status:** NEW

## D47. Give guards morale that decays away from a staff-room
- **Source:** PROPOSALS — "7. Staff-Room Morale Multiplier"
- **Mechanic:** Guards carry a hidden Morale value 0–100 that decays 5 per day and recovers 10 per day while working within 10 tiles of a `staff-room` containing at least one `chair` and one `desk`. Morale drives incident response time: baseline at 100, +20% slower at 50, +50% slower at 0 with a 5% daily chance the guard quits without warning and no refund of the hire cost. A guard who has not been near a staff-room for 3 days becomes Disgruntled and flashes a warning in the status strip.
- **Reuses:** `staff-room` (dead), `chair`, `desk`, guard entity state, hiring which already charges a day up front, incident response timing, the status strip.
- **Player now optimises:** Guard deployment against guard rest. Posting guards at the far end of the prison with no staff-room nearby costs incident control — a spatial cost on a staffing decision that is currently pure arithmetic.
- **Accepted cost:** Stated: staff-rooms consume buildable area and objects that could have been cells, so the compact guard-efficient layout stops being optimal.
- **Build size:** Small — one float per guard, a proximity check, a multiplier on the response cooldown.
- **Status:** NEW

## D48. Chain laundry work into achievable hygiene
- **Source:** PROPOSALS — "9. Laundry Hygiene Chain"
- **Mechanic:** A `laundry` with a `washing-machine` grants a Clean Clothes buff to any prisoner who spent at least 200 ticks working there within the last 2,400 ticks. The buff slows `hygiene` decay by 40%, which is what finally lets a prisoner with the buff plus a `shower-room` actually reach full hygiene over a long sentence. The laundry must be staffed by a prisoner in a work block, or a guard on laundry duty.
- **Reuses:** `laundry`, `washing-machine`, the `work` regime block, the `hygiene` need, the job system.
- **Player now optimises:** Whether to spend scarce work-block time on laundry rather than on cash-earning kitchen or classroom work. It answers one of the brief's open questions directly — hygiene needs 10,200 ticks of provision and cannot be satisfied in a normal sentence; this makes it reachable through a *chain* of rooms rather than a single shower, which is a design answer to "nobody has decided whether that is a bug or the point".
- **Accepted cost:** Stated: laundry work earns no direct cash, so the player trades revenue for welfare.
- **Build size:** Small — a buff timer, a decay modifier, a work-block eligibility check.
- **Status:** NEW

## D49. Make meals a produced good with quality tiers
- **Source:** PROPOSALS — "10. Kitchen & Meal Quality"
- **Mechanic:** A `kitchen` needs a working `fridge` and `prep-counter` to produce Meals, one per prisoner per day, consumed during `meal` blocks in the `canteen`. No fridge → Cold meals satisfying 60% of hunger decay for 4,800 ticks; no prep-counter → Unprepared, 40%; both → Standard, 100%; adding a `stove` → Hot, 120% satisfaction plus 20% slower safety decay for 2,400 ticks. Meals are prepared by prisoners assigned to the kitchen during `work` blocks, 40 ticks per meal. Insufficient meals means prisoners leave the canteen hungry.
- **Reuses:** `kitchen`, `canteen`, `fridge`, `prep-counter`, `stove`, the `meal` regime block, the `hunger` and `safety` needs, the job system.
- **Player now optimises:** Kitchen size, object mix and how many prisoners to assign to cooking, against hunger — kitchen labour competes with laundry and classroom labour for the same ~1,000 ticks.
- **Accepted cost:** Stated: kitchen objects are expensive, kitchen workers earn no direct cash, and ignoring kitchen logistics spirals into unmet hunger and an income penalty.
- **Build size:** Medium — a meal inventory per kitchen, a consumption check in the canteen, a satiety value on the prisoner.
- **Status:** NEW

## D50. Trade a guard for early warning from the security-office
- **Source:** PROPOSALS — "12. Security-Office Surveillance Intel"
- **Mechanic:** A guard posted in a `security-office` containing a `security-console` gives Surveillance Coverage to every sector within 30 tiles. It does not replace guard coverage in the income or incident maths; it grants Intel — every 2,400 ticks, a 600-tick early warning of the next incident, e.g. "Riot likely in Sector 4", delivered through the existing alert band. Remove the guard and intel pauses. A sector with both guard coverage and surveillance gets a 10% incident probability reduction, soft-capped.
- **Reuses:** `security-office` and `security-console` (both dead), the unread `surveillance` capability, guard deployment, the sector system, the alert band, incident probability.
- **Player now optimises:** A guard in the office predicting, versus a guard in a sector suppressing — reactive capacity traded for information, on a prison that riots every two days.
- **Accepted cost:** Stated: a guard in the office is a guard not in a sector.
- **Build size:** Small — a distance check, a timer, an alert injection, one probability modifier.
- **Status:** NEW

## D51. Make yard recreation depend on guard coverage
- **Source:** PROPOSALS — "13. Yard Recreation with Guard Dependency"
- **Mechanic:** A prisoner in the `yard` during `recreation` or `free-association` gains recreation at the normal rate only if the sector's guard coverage is at least 100%. At 50–99% coverage the gain halves and assault probability rises 2% per tick; below 50% the gain is zero and assault probability rises 5% per tick. Yard capacity remains floor-area under Decision 5, so packing it is tempting but demands guards.
- **Reuses:** `yard`, the `recreation` need, the `free-association` block, guard coverage, the assault incident, Decision 5's floor-area rule.
- **Player now optimises:** How many prisoners go to the yard at once, which then dictates guard allocation. Cheap space becomes expensive to secure.
- **Accepted cost:** Stated: yard time becomes guard-intensive, so a player using the yard as cheap recreation pays wages instead of build cost.
- **Build size:** Small — a coverage check in the yard provision tick plus an assault modifier.
- **Status:** NEW

## D52. Turn education into parole and pay for the ticks saved
- **Source:** PROPOSALS — "14. Education as Sentence Reduction / Parole"
- **Mechanic:** A prisoner who spends at least 600 ticks in a `classroom` during `education` blocks within one week gets a Parole Eligibility flag. At their next scheduled classification review, if they hold the flag and their incident count is zero, their remaining sentence is cut by 20%. When they leave early the player receives a Rehabilitation Grant of 10 × the ticks saved — saving 10,000 ticks pays 100 cash. If they leave with incidents on record there is no grant.
- **Reuses:** `classroom`, `bookshelf`, `desk`, the `education` regime block, the classification review system, the sentence timer, the incident log.
- **Player now optimises:** Whether to run education blocks that produce no labour cash, in order to accelerate parole and free beds for new threshold-grant prisoners. Prisoner *quality* (incident-free) becomes valuable, not just quantity, and the classification review finally has a consumer.
- **Accepted cost:** Stated: education time is time not spent on work blocks, and a prisoner who leaves early stops paying daily income.
- **Build size:** Small — a flag, a check at review, sentence arithmetic, a credit.
- **Status:** NEW — and it interacts with the decided threshold grants in a way worth checking: if grants key on population, paroling prisoners out can push the player back below a threshold.

## D53. Accumulate waste and make the garbage-room clear it
- **Source:** PROPOSALS — "16. Garbage-Room Sanitation Loop"
- **Mechanic:** Every `meal` block and every kitchen `work` block generates Waste, 1 unit per prisoner per day. Waste accumulates invisibly until it exceeds `prisoner count × 2`, at which point every prisoner gets a Squalor debuff: hygiene decay +30%, safety decay +10%. A `garbage-room` with a `waste-bin` accepts waste; a prisoner working there (or a guard on sanitation duty) processes 1 unit per 50 ticks, doubled if the bin's currently unread `waste-disposal` capability is honoured. Clear the waste for 2,400 ticks and the debuff lifts. Uncleared waste also raises base riot probability by 0.1% per tick per 10 units.
- **Reuses:** `garbage-room` and `waste-bin` (both dead), the unread `waste-disposal` capability, the `work` regime block, the job system, hygiene and safety decay, riot probability.
- **Player now optimises:** Whether to give work-block time and a room to sanitation, or let squalor erode both income and safety. The garbage room has to be reachable for work routing, so it matters spatially.
- **Accepted cost:** Stated: garbage work earns no cash, and a large prison needs a large sanitation workforce or eats the penalty repeatedly.
- **Build size:** Small — a waste counter, a debuff flag, a processing rule, a decay modifier.
- **Status:** NEW

## D54. Add a brick bed so the two materials compete
- **Source:** PROPOSALS — "18. Wooden vs. Brick Bed Comfort"
- **Mechanic:** The existing `bed` (1 plank, 65) becomes the Wooden Bed. A Brick Bed (2 bricks, 80) gives 25% faster sleep provision and 15% slower sleep decay during non-sleep blocks, so its occupant needs less sleep and has more usable daytime. Same one tile.
- **Reuses:** `bed`, brick and plank and their 40/65 prices, the `sleep` need, `cell`.
- **Player now optimises:** Material allocation in the early build — wood is cheaper and also makes doors, brick also makes walls and toilets. It gives the 40-versus-65 price a consequence beyond wall aesthetics.
- **Accepted cost:** Stated: brick diverted to beds delays perimeter construction.
- **Build size:** Small — a second bed object type with two modifiers.
- **Status:** NEW — but weigh it against rule 3. As written it is a strictly better bed for a higher price with no ongoing decision after the purchase; the interesting part is only the material contention during the first build.

## D55. Process new arrivals through reception before they count
- **Source:** PROPOSALS — "19. Reception Throughput Gate"
- **Mechanic:** Prisoners no longer appear instantly. They arrive at `reception` into a Processing Queue; each needs 400 ticks of processing by a guard on a new reception duty, and only then are they routed to a `cell` or `holding-cell`. With no guard on reception they queue indefinitely. Queue length shows in the status strip (`Queue: 3`), and intake can be toggled on or off. A queue over 5 pauses new admissions, and queued prisoners earn nothing because they are not yet occupied places.
- **Reuses:** `reception` (dead) and `holding-cell`, the guard duty system, routing, the status strip, the occupied-place income logic.
- **Player now optimises:** Intake speed against guard labour — and it hands the player an intake valve, which is the direct lever the brief's Decision-1 consequence is missing. A player in trouble can shut intake off.
- **Accepted cost:** Stated: a guard on reception duty is not on sector coverage, so fast expansion is paid for in security.
- **Build size:** Medium — a queue entity, a processing timer, a duty flag, an intake toggle, a HUD element.
- **Status:** NEW

## D56. Make the common-room a gang pressure valve that breaks when crowded
- **Source:** PROPOSALS — "20. Common-Room Gang Mitigation"
- **Mechanic:** A `common-room` holding at least one `chair`, one table and one `bookshelf` provides Structured Recreation. High-risk prisoners in it during `recreation` or `free-association` have gang-retaliation probability cut by 20% multiplicatively. But if more than 8 prisoners are inside at once the benefit is nullified and assault probability rises 1% per tick for each prisoner over 8.
- **Reuses:** `common-room`, `chair`, `dining-table`/table, `bookshelf`, the `recreation` and `free-association` blocks, the gang-retaliation and assault incidents, risk tiers.
- **Player now optimises:** How many high-risk prisoners to let into recreation at once, and whether to build several small common rooms or one large one — gang risk becomes an architectural problem rather than a guard-count problem.
- **Accepted cost:** Stated: common rooms compete with cells for space and objects, and several small rooms are less space-efficient.
- **Build size:** Small — a capacity check, an incident modifier, a room-object check.
- **Status:** NEW

## D57. Give every rung of the degradation ladder a paired way out
- **Source:** MECH1 — "Decyzje, które warto zakwestionować / Degradation ladder powinna wpływać na wybory, nie tylko odbierać akcje"
- **Mechanic:** Refused deliveries, halted construction and unpaid staff are logical rungs, but as a pure sequence of blocks they only convert a crisis into idleness. Each rung must also open a cheap route back: selling materials, cutting posts, abandoning a contract, or taking a loan. Otherwise "digging out" stays a description rather than a strategy.
- **Reuses:** The named degradation ladder, wage arrears, the decided sell-back and loans, guard dismissal.
- **Player now optimises:** Which capability to give up first while insolvent — an actual decision at the bottom of the curve, where today there is none.
- **Accepted cost:** NOT STATED BY SOURCE. My reading: every escape hatch makes insolvency less frightening, and the whole point of Decision 2 is that the bottom must still be somewhere the player does not want to be.
- **Build size:** Small on top of the ladder itself — mostly a matter of which commands stay legal at each rung.
- **Status:** ALREADY DECIDED (degradation ladder) — this is a shape requirement on the decided item, and the sharpest one in the batch.

---

# Part 2 — the meta

## Build-first orderings

**PROPOSALS** is the only document in the batch that answers the question as asked, with the reason being the order:

> **1. Cell Quality Rating.** "It costs almost nothing, kills the 1-plank-3-prisoner exploit immediately, and creates the *quality-vs-quantity* axis the brief explicitly asks for… It is the foundation on which every other mechanic sits, because it finally makes the `cell` room economically differentiated."
> **2. Prison Labour: Work-Unit Industry.** "It is the second income line… It justifies the sunk cost of the complete job system… It must come after Cell Quality because work blocks compete with sleep and free-association; the player needs to care about cell quality before they care about work-block efficiency."
> **3. Risk-Tier Admission Premium.** "It is the cheapest possible way to make risk tiers matter (a single lookup table)… It should come after the first two because the player needs to understand quality and labour before they can evaluate whether a high-risk premium is worth the guard wages."

**MECH1** also answers it directly ("Trzy pierwsze wdrożenia"):

> **1. Overcrowding curve.** "It is the first step because it is a necessary condition for everything that pays for growth to make sense. Without it, threshold grants reward the strategy 'cram in as many places as possible', even though the architectural decision itself says capacity and safe upkeep should go together."
> **2. Needs- and incident-stability contracts.** "The second step should use signals that already work reliably: needs and the incident scheduler… It is also easy to test deterministically: the same state, the same days and the same incident history give an identical result."
> **3. Starting the job system through delivery logistics.** "Only as a third step should the largest ready-but-unused system be plugged in. Logistics will change the physical layout of the prison, the order of expansion and purchasing decisions; it will not just be another payout modifier. It requires more integration work than the two preceding mechanisms, but it unlocks dead rooms, containers, storage-rack and delivery-access at once."

**FAZA1** does not answer the question — it was written after the ordering was already assumed. Its nearest equivalents are §12 "Recommended scope of the first release" — (1) certified-capacity evaluator, (2) `payableOccupiedPlaces` settled at the day boundary, (3) HUD with occupied/certified/payable plus reason codes, (4) deterministic behaviour on bed removal and overcrowding, (5) an audit income transaction, (6) optionally one simple sink, the cost of restoring a suspended place after an incident — and §10, its sink priority order: 1 repair/recertification cost, 2 mild certified-capacity upkeep, 3 paid delivery throughput, 4 risk-service cost, 5 incident reserve, 6 prestige/training/inspection sinks last, "because they are optional and can easily become decoration or a compulsory tax".

**FAUCET1** likewise gives an include/defer list rather than an ordering (§10). Include: `P = min(O,K)`, day-boundary settlement, a ledger separating need withholding from certification adjustment, upkeep per certified occupied place at the Target profile, one legible one-off repair sink, and telemetry separating faucet, sink, material purchases and loans. Defer: full per-object upkeep, inspection/reputation/training fees, dynamic material prices, a new operating currency, variable interest, and shipping every sink at once.

**KLAN3** gives a seven-step order (§19) for its own multiplayer subject, of which the first three are: (1) player-to-player auctions of existing materials/assets, "easiest to verify transfer versus sink without new faucets"; (2) escrow, commission and the auction ledger, "without correct accounting one should not add clans"; (3) clans with no shared balance — "first roles, contracts and shared information, without transfers".

## Challenges to the decided list

**PROPOSALS, against Decision 5** (a room with no objects to consume is bounded by its own ground) — the sharpest challenge in the batch:

> "This is correct for `yard` and `holding-cell`, but it is the direct cause of the 1-plank-3-prisoners exploit in `cell`. A `cell` without a bed should not have floor-area capacity for prisoners; it should have capacity 0. Floor-area capacity should be restricted to room types explicitly tagged `open-area` (yard, holding-cell, delivery-bay). Otherwise the player is rewarded for building bedless cells, which contradicts every other design signal… The brief notes this as a measured exploit; it should be patched, not designed around."

**PROPOSALS, against Decision 2** (insolvency is a state, not a loss condition) — accepts the decision, attacks the sequencing:

> "the degradation ladder (refused deliveries → halted construction → unpaid staff → incidents) is not optional; it is load-bearing for Decision 2 to be meaningful. It should be built *before* loans and sell-back, because without visible degradation the player cannot make an informed choice to take a loan."

**PROPOSALS, against Decision 1** (per prisoner-day, per occupied place) — a completeness challenge, not a reversal: "the decision is incomplete without an enforcement mechanism", and its Cell Quality Rating and Holding-Cell Overflow "should be treated as part of the same architectural record, not as economy add-ons".

**MECH1, against threshold grants:** the headcount threshold alone "może premiować dokładnie tę strategię, której projekt chce uniknąć" [may reward exactly the strategy the design wants to avoid] without an overcrowding curve and without an "occupied places held without a serious incident" condition. Its proposal: keep the threshold as the headline, pay the full amount only at roughly 90% capacity with a limited incident count in the last two days.

**MECH1, against loans:** "Pożyczka bez harmonogramu spłaty stanie się przyciskiem »zamień problem gotówki na większą gotówkę«" [a loan with no repayment schedule becomes a button labelled 'turn a cash problem into more cash']. Requires a start day, interest accrued at the day boundary, repayment deducted from the existing prisoner-day income, and a visible HUD forecast so the instalment cannot cause a soft game over.

**MECH1, against sell-back:** good as insurance against an irreversible state, but "natychmiastowy zwrot po zakupie może pozwolić na bezkarne spamowanie zamówień" [an instant refund after purchase would let the player spam orders with impunity]. Needs a price below cost *and* a delay — a separate sell job, or a small operating cost.

**MECH1, against the degradation ladder:** the named rungs "jako sama sekwencja blokad może tylko zamienić kryzys w bezczynność" [as a bare sequence of blocks can only turn a crisis into idleness]. Every rung must also open a cheap route back — selling materials, cutting posts, dropping a contract, taking a loan — "Inaczej »digging out« pozostanie opisem, a nie strategią."

**MECH1, against waiting on a health model:** "Nie należy czekać z health modelem na pełny system medyczny" — a minimal injury state, a recovery time and one reader for `medical-treatment` is enough; full diagnoses, diseases and medical staff can wait, because today "incident z injured entity id nie ma ekonomicznego następstwa, więc incydenty są zbyt tanie względem dochodu z populacji" [an incident with an injured entity id has no economic consequence, so incidents are too cheap relative to population income].

**FAUCET1, against the brief's own measurement** — not a decision, but the most concrete factual challenge in the batch and the one most likely to matter before any balancing happens. The brief says a neglected twelve-prisoner prison earns about 150/day against 240/day of guard wages. But the stated schedule has a floor of 60 per prisoner, so twelve occupied places cannot earn less than 720 gross, i.e. 480 net of three guards. If "150/day" is the net figure, the implied average rate is `(150 + 240) / 12 = 32.5`, below the stated floor of 60. FAUCET1 lists five possible explanations — 12 is a prisoner count rather than twelve occupied places; the measurement included other outflows; 150 was a short-window treasury delta rather than a full daily ledger; needs are charged differently than described; some places were not payable — and refuses to tune any sink until it is resolved: "Bez jej rozwiązania nie wolno dobierać `k_u` na podstawie samego przykładu, ponieważ można dodać sink do gospodarki, która już ma nieopisany koszt."

**FAZA1 and FAUCET1, implicitly against Decision 1's shape:** both insert a gate between "occupied place" and "paid place". They never say they are amending the decision, and they should be read as amending it — Decision 1's own text is that capacity and the ability to keep people in it safely pay through the same line; certification splits that line into a condition and a payment.

**FAZA1, on the whole decided-but-unbuilt list:** its inflation table names threshold grants, loans and sell-back as three of the six sources of oversupply — grants because they can fund the very bed-building that triggers the next grant, loans because money arrives before its repayment cost, sell-back because too small a loss creates a safe arbitrage. It does not ask for any of them to be dropped; it asks for them to be shipped after certification, not before.

**Note on D33 (patrol):** the brief states that guards never patrolling is a deliberate consequence of an accepted decision. MECH1 proposes fixing the route producer so patrol works and can be paid for. That is a challenge to a decision the brief mentions but does not number; whoever files it needs to read that ADR first.

## Least-sure-but-most-interesting

**MECH1:** the 1,000-tick work contract (its mechanism 5).

> "It may activate the existing work blocks and give `free-association` meaning, but there is a risk it turns every day into mechanically shoving every prisoner into work. It is still a good experiment, because it has a clear hypothesis: an interesting economy does not have to pay for owning a prisoner; it can pay for converting time, space and safety into productive throughput. If the test shows players ignore needs and give the whole day to work, it should be weakened by a quality contract: full payout only when needs and incidents stay below thresholds."

**PROPOSALS:** physical logistics — Storage-Room as Inventory Anchor (its mechanism 15).

> "This is the idea I am least sure can be built cheaply, but it is the most interesting because it **justifies an entire unused subsystem**… That is not a missing feature; it is a **sunk system crying for a producer**. Making materials physical would transform Lockstate from a spreadsheet optimiser into a spatial logistics game… It is the only idea on this list that turns the simulation's biggest unused asset into its defining second axis."

**FAZA1, FAUCET1, KLAN3:** none of the three answers this question. They close with a "Decyzja końcowa" [final decision] instead — respectively that certification is "warstwa prawdy ekonomicznej" [a layer of economic truth] rather than a penalty and must precede grants/contracts/loans; that the goal of faucet & sink is not to zero the treasury but to keep every subsequent economic decision meaningful; and that clans and auctions must create coordination, specialisation and a risk market rather than another money-based progression line.

## Phase framing

Neither the brief nor anything in it defines phases. The phase numbering in this batch is the authors' own, carried between their documents, and it is asserted rather than derived.

- **"Faza 1" (FAZA1, FAUCET1)** = **capacity certification**. Both documents open by stating this was "the first recommended implementation phase" from an earlier document, which is not in my batch. Its content is fixed and narrow: separate physical capacity from payable capacity, settle `payableOccupiedPlaces` at the day boundary, add reason codes to the HUD, keep the 300/40/60 schedule unchanged so the effect is isolated, and add at most one or two sinks (per-place upkeep, post-incident repair). FAZA1 sizes it as a four-week plan for one gameplay programmer, one UI programmer, one technical/economy designer and part-time QA, with a named backlog (ECON-001…ECON-010, UI-001, UI-002, QA-001, QA-002). The governing line is "nie każde zbudowane łóżko jest automatycznie płatnym miejscem" [not every bed built is automatically a paid place].
- **"Faza 3" (KLAN3)** = **risk-weighted contracts**, i.e. an economy that already has several faucets and several sinks. Its day equation is `B+1 = B + F_base + F_risk + F_work + F_grants − S_wages − S_upkeep − S_security − S_repairs − S_liability − S_loans − C_assets`, so by phase 3 the author assumes base income, risk-premium income, prison-labour income and grants all exist, alongside upkeep, security, repair, liability and loan costs. The clan and auction systems are proposed as a layer *on top of* that, not as phase 3 itself.
- **"Faza 2" is never defined anywhere in my batch.** KLAN3 refers to "wcześniejszych modeli fazy 1–3" [earlier phase 1–3 models], so a phase 2 exists in the authors' shared roadmap, but no document I read says what it is. The sibling file `Lockstate — model faucet & sink dla fazy 3.md` (another agent's batch) is the likely place to look.
- **Bearing on the real roadmap:** none. The brief's "Decided but unbuilt" list is threshold grants, the degradation ladder, loans and sell-back — none of which is capacity certification, and all four of which FAZA1 wants scheduled *after* its phase 1. Treat "faza 1/3" as a proposal about ordering, not as a description of anything already agreed, and do not let the phase labels carry into issue titles.

## Quality note

**PROPOSALS and MECH1 answered the brief; FAZA1, FAUCET1 and KLAN3 answered a question nobody asked.** PROPOSALS is the strongest document in the batch — twenty mechanisms, every one naming specific existing rooms, objects and capabilities, most of them costing a lookup table and a multiplier, and it reaches seven of the nine dead rooms and four of the six unread object capabilities. MECH1 is close behind and better on the economy's shape (the overcrowding curve, transition contracts, reputation-as-streak, and the sharpest challenges to the decided list), though it is thinner on implementable detail — several of its twenty are one paragraph of intent with no numbers.

FAZA1 and FAUCET1 are competent and careful, and both are follow-ups to a decision that has not been made: they elaborate "capacity certification" into a sprint plan, an acceptance-criteria list, a telemetry schema and a JIRA-shaped backlog, when the brief asked for range over depth and said explicitly that it would do the feasibility work. What they contribute that nothing else does is the honest arithmetic — the `k_u` tables, the profiles, and above all the catch that the brief's own 150/day measurement is impossible against the brief's own 60 floor. That single paragraph is worth more than the rest of both documents.

KLAN3 is the outlier: a careful, genuinely well-reasoned economic analysis of a multiplayer system that this game does not have and, being single-player with local-only saves, cannot have. It is not sloppy — its rejections (no pay for membership, no auctioning of future income, no infinite system supply) are exactly right for the game it imagines. It is simply about a different game. Six of its ideas survive translation (D18–D23), and one of those — capital projects priced as up-front cost plus permanent daily upkeep, buying options rather than income — is a better answer to "a second axis against population" than anything in FAZA1 or FAUCET1.
