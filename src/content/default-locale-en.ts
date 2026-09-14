import { buildLocalizationCatalog } from './localization';
import { simulationEnumMessages } from './simulation-message-keys';

/**
 * Default (`en`) resolved labels for every `nameKey` in the default
 * room/object/staff-role catalogs, plus the HUD's own message keys and the
 * semantic input actions' descriptions. This is
 * the bundled default locale (ADR 0011): it must be complete, because the
 * game has to have text offline and every other locale falls back to it per
 * key. Not a real i18n pipeline on its own -- see localization.ts, and
 * `src/services/localization/` for the runtime that consumes this.
 *
 * The keys authored below all belong to values that own a definition object
 * (a room, an object, a staff role, an input action) or to the HUD's own
 * chrome. Keys owned by the trusted-services layer -- product names,
 * entitlement and challenge strings -- are authored in
 * `src/services/localization/default-catalog.ts` instead and merged on top of
 * this catalog, so this file is not the whole default locale. The
 * simulation's *enumerations* have no definition object, so their keys are
 * derived rather than written: `simulationEnumMessages()` computes them from
 * the id, and they are merged in below. Authoring them here as literals
 * would put the id in one file and the key in another, which is exactly the
 * drift `simulation-message-keys.ts` exists to make impossible.
 */
const authoredMessages: Readonly<Record<string, string>> = {
  'room.cell.name': 'Cell',
  'room.holding-cell.name': 'Holding Cell',
  'room.solitary-cell.name': 'Solitary Cell',
  'room.reception.name': 'Reception',
  'room.kitchen.name': 'Kitchen',
  'room.canteen.name': 'Canteen',
  'room.shower-room.name': 'Shower Room',
  'room.laundry.name': 'Laundry',
  'room.yard.name': 'Yard',
  'room.common-room.name': 'Common Room',
  'room.classroom.name': 'Classroom',
  'room.infirmary.name': 'Infirmary',
  'room.security-office.name': 'Security Office',
  'room.staff-room.name': 'Staff Room',
  'room.storage-room.name': 'Storage Room',
  'room.delivery-bay.name': 'Delivery Bay',
  'room.garbage-room.name': 'Garbage Room',
  'room.utility-room.name': 'Utility Room',

  'object.bed.name': 'Bed',
  'object.medical-bed.name': 'Medical Bed',
  'object.toilet.name': 'Toilet',
  'object.sink.name': 'Sink',
  'object.shower-head.name': 'Shower Head',
  'object.washing-machine.name': 'Washing Machine',
  'object.desk.name': 'Desk',
  'object.chair.name': 'Chair',
  'object.stove.name': 'Stove',
  'object.prep-counter.name': 'Prep Counter',
  'object.fridge.name': 'Fridge',
  'object.dining-table.name': 'Dining Table',
  'object.bench.name': 'Bench',
  'object.bookshelf.name': 'Bookshelf',
  'object.medicine-cabinet.name': 'Medicine Cabinet',
  'object.security-console.name': 'Security Console',
  'object.storage-rack.name': 'Storage Rack',
  'object.loading-dock-door.name': 'Loading Dock Door',
  'object.waste-bin.name': 'Waste Bin',
  'object.utility-panel.name': 'Utility Panel',

  // The seven authored object categories, named for the first time so the
  // Build panel's catalogue can be filtered by one (#390, ADR 0035).
  //
  // Five are the schema id title-cased, because for those the id already is the
  // word a player would scan an option list for. Two are not, and both times
  // the id names the *domain* while the option has to name the things in it:
  // `sanitation` reads "Plumbing", because a player hunting a shower head or a
  // sink is looking for plumbing rather than for sanitation; `food-service`
  // reads "Catering", because a stove and a fridge are what a kitchen is
  // catered with. Neither id moves -- an id is not a label (ADR 0011).
  //
  // `OBJECT_CATEGORY_NAME_KEYS` in `src/content/object-catalog.ts` holds the
  // keys, and its type is what fails the build if an eighth category arrives
  // without one.
  //
  // **The sentence this comment used to open with -- that the seven were being
  // "named for the first time" -- was false the day it was written.** The
  // `object-category` group in `simulation-message-keys.ts` had already
  // derived `object-category.<id>.name` for the same seven ids from the same
  // `objectCategorySchema`, and authored English for all of them. So there
  // were two families, differing by a dot where the other has a hyphen, and
  // two of the seven carried *different words*: this file's "Plumbing" and
  // "Catering" against that table's "Sanitation" and "Food Service". Both
  // families were in the assembled catalog at once, because the collision
  // check compares exact keys and these keys are not equal.
  //
  // That table's two labels now match these, because this is the family with
  // a consumer (`src/main.ts:461`) and the family ADR 0035 §7 decided on;
  // `tests/foundation/content-vocabulary-contract.test.ts` fails on any
  // future pair that diverges. The copy above is unchanged and remains the
  // authority for it.
  'object.category.furniture.name': 'Furniture',
  'object.category.sanitation.name': 'Plumbing',
  'object.category.food-service.name': 'Catering',
  'object.category.security.name': 'Security',
  'object.category.storage.name': 'Storage',
  'object.category.utility.name': 'Utility',
  'object.category.medical.name': 'Medical',

  'staff-role.warden.name': 'Warden',
  'staff-role.administrator.name': 'Administrator',
  'staff-role.guard.name': 'Guard',
  'staff-role.security-chief.name': 'Security Chief',
  'staff-role.nurse.name': 'Nurse',
  'staff-role.doctor.name': 'Doctor',
  'staff-role.maintenance-worker.name': 'Maintenance Worker',
  'staff-role.kitchen-staff.name': 'Kitchen Staff',

  'item.brick.name': 'Brick',
  'item.wood-plank.name': 'Wood Plank',
  'item.food-ration.name': 'Food Ration',
  'item.dirty-linen.name': 'Dirty Linen',
  'item.clean-linen.name': 'Clean Linen',
  'item.waste.name': 'Waste',

  'grade.general.name': 'General',
  'grade.medical.name': 'Medical',
  'grade.high-security.name': 'High Security',
  'grade.staff-only.name': 'Staff Only',
  'grade.administrative.name': 'Administrative',

  'contraband.weapon.name': 'Weapon',
  'contraband.drug.name': 'Drugs',
  'contraband.phone.name': 'Phone',
  'contraband.currency.name': 'Currency',
  'contraband.tool.name': 'Tool',

  // ---------------------------------------------------------------
  // HUD shell. Keys, never source text: `hud.status.prisoners` stays
  // stable while "Prisoners" is free to change per locale and release
  // (ADR 0011).
  //
  // The money keys arrived with the controls that needed them, one release
  // apart, which is the rule this block follows rather than an accident: a
  // string is where a fake number gets its first place to sit, so a label is
  // authored when something produces the figure it names and not before.
  // `hud.status.funds` came with the strip's balance readout (#96/#250);
  // `hud.build.buy*` below came with the purchase control that spends it
  // (#89); `hud.status.earned-today` came with the state's per-prisoner-day
  // payment that credits it (#29). There is still no payroll or running-cost
  // key, and no rate, budget or forecast key -- but **the reason has changed**,
  // and it is worth writing down rather than leaving the sentence to be read
  // the old way. It used to be that "nothing *debits* the treasury on a
  // schedule and nothing projects forward". Since ADR 0042 step 3 something
  // does: `PayrollSystem` bills every employee's wage at the end of every
  // in-game day, and `simulation/status-counts` carries both what that costs
  // and what has gone unpaid. What is missing is the *panel*, and the rule
  // above is what keeps the key waiting for it -- a label authored before
  // something renders the figure it names is `AGENTS.md`'s fourth exclusion,
  // not a head start. `tests/unit/ui-hud-messages.test.ts` is still the gate.
  // ---------------------------------------------------------------
  'hud.status.title': 'Prison status',
  'hud.status.prisoners': 'Prisoners',
  // How many prisoners have no bed (#609). The owner's wording, approved
  // before it was built, and it counts what is missing rather than what is
  // fine: "9 housed" was the rejected alternative, because a player reads
  // past a number that is already fine. It is the short form of the Intake
  // panel's `hud.intake.no-place` below -- "{count} waiting with no bed to
  // sleep in" -- on purpose, so the same fact reads the same way in both
  // places; the strip's is the wider count of the two, since a prisoner whose
  // bed was removed under them is not waiting for anything.
  'hud.status.prisoners-without-bed': '{count} with no bed',
  'hud.status.staff': 'Staff',
  'hud.status.rooms': 'Rooms',
  /*
   * How many of the rooms the chip above counts are not ready
   * ([#1006](https://github.com/matmaxalez/lockstate/issues/1006) finding 1),
   * or nothing when they all are.
   *
   * **Authored under `AGENTS.md` reservation 4's partial release of
   * 2026-09-04** -- *"the CHOICE OF WORDS is ours now; the requirement that a
   * sentence be TRUE is not"* -- so each half is proved against the code that
   * renders it rather than reasoned about.
   *
   * **`{count}`.** `HudRoomNeedsViewModel.unfinishedRooms`, and nothing derived
   * from it: `roomNeedsFromProjections` (`src/ui/simulation-room-needs.ts`)
   * increments it once per row whose `shortfallOf` is above zero, which is
   * `requirementSummary.missingCapability + (access === 'no-way-in' ? 1 : 0)`
   * -- the projection's own verdicts, read and not recomputed. It is therefore
   * the same figure the Rooms panel's header prints as `hud.rooms.needs-count`'s
   * `{unfinished}`, off the same view model, so the strip and the panel cannot
   * disagree about it.
   *
   * **"not ready".** `hud.rooms.needs` below is *"Not ready"*, the words this
   * repository already chose for a room that exists and cannot yet do the job it
   * was designated for. The same words for the same fact, because this badge's
   * whole purpose is to send a player to the panel that says more -- and a
   * synonym on the way there would read as a second condition.
   *
   * **What it does not say, and that is the load-bearing part.** Not *why*: a
   * missing bed and a missing door are both counted here and only the panel
   * tells them apart. Not that the rest of the prison is fine -- the count is
   * taken over the projection's default window of a hundred rooms
   * (`HudRoomNeedsViewModel`'s own comment), so in a larger prison it can
   * understate and can never overstate. And it is absent rather than `0`
   * whenever nothing has been asked, because "nobody asked" and "every room is
   * ready" are different facts; `roomsNotReadyBadge`
   * (`src/ui/hud/projection.ts`) is where that is enforced.
   */
  'hud.status.rooms-not-ready': '{count} not ready',
  'hud.status.incidents': 'Incidents',
  'hud.status.coverage': 'Coverage',
  'hud.status.contraband': 'Contraband',
  // The treasury balance (#96). "Funds" names no currency on purpose: #96
  // settled that money is primary and did not name a unit, and the number is
  // shown as a plain count of the units the simulation holds it in rather
  // than converted into a major unit nobody has chosen yet.
  'hud.status.funds': 'Funds',
  // How much is left before deliveries stop, under the balance while it is
  // negative (the owner's ruling 18 of 2026-08-31, in the owner's own words).
  // No unit and no currency, for the same reason the label above names none:
  // the number is in the minor units the simulation holds, and the chip's own
  // figure is beside it in the same units.
  //
  // **The number under it was re-based on 2026-09-01 and these words were not,
  // and that is a measurement rather than a preference.** Ruling 19 made
  // `balance - overdraftFloor` an offer of room no press can spend, so
  // `overdraftRemaining` (`src/ui/hud/projection.ts`) now states the room to
  // the `'deliveries'` rung; the owner chose *"{remaining} left before
  // deliveries stop"* for the words that go with it, on the condition that the
  // badge was measured first, because no measurement of it had ever existed.
  // It was measured, in `tests/browser/ui-overdraft-badge.spec.ts`, and it does
  // not fit: the sentence never wraps and is never clipped, but it costs the
  // FUNDS chip **+133px**, which pushes that chip off the visible edge of
  // `.hud-strip__metrics` at 1280x800 whenever the remainder has four digits --
  // a container whose scrollbar `hud.css` suppresses, so the badge is present
  // in the DOM and visible to nobody, which #629 says does not count. The
  // incumbent words keep the chip on screen at that viewport.
  //
  // **The owner ruled on those numbers on 2026-09-01 and the paragraph above
  // is kept rather than overwritten**, because the measurement it records is
  // still the reason this key reads the way it does. The ruling: *"the chip
  // keeps the short wording, because it fits; the name of the threshold is
  // said elsewhere, where there is room for a full sentence -- in the hover
  // tooltip on the chip, and in the alert. Nothing is to disappear from the
  // screen."* So this key is unchanged, and the sentence that was going to be
  // crammed into it now lives at `hud.status.funds-before-deliveries-stop`
  // and `hud.status.funds-deliveries-stopped` below, plus the refusal alert
  // at `hud.alert.refusal.purchase.insufficient-funds`.
  'hud.status.funds-remaining': '{remaining} left',
  /*
   * What `{remaining} left` is a remainder *of*, said in full where there is
   * room for a full sentence: the `FUNDS` chip's `title` and its screen-reader
   * text (`createStatChip`), which cost the row no width at all.
   *
   * **A tooltip is not where a rule may only live**, which is why this is one
   * of two places the threshold is named rather than the only one -- the
   * refusal alert below says it again when the refusal actually happens, and
   * `tests/unit/ui-hud-funds-threshold-named.test.ts` fails if either stops.
   * A player who never hovers still meets the sentence.
   *
   * "Materials" rather than "anything": a payday can still spend to -2,500,
   * so a sentence saying *nothing* can be bought would be false about the
   * prison even while it is true about every press the player can make. And
   * *"until the prison earns the money"* is the tail every sibling refusal
   * sentence shares, so the chip and the alert read as one rule rather than
   * two.
   *
   * **The tail used to read *"until the state pays what it owes"* and that
   * was measured false, which is why it is gone from all eight sentences that
   * carried it** (`docs/research/2026-09-04-can-this-prison-fail.md` finding
   * 1, issue #913). The state does not carry a debt to the prison: income is
   * `StateIncomeSystem`, which credits
   * `stateIncomeForCompletedDay(source)` at the last tick of each in-game day
   * and returns before crediting anything when that sum is zero
   * (`src/simulation/economy/income.ts`). The sum folds over
   * `RoomInstanceRegistry.residentIdsWithExistingPlace()` -- prisoners holding
   * a unit of residency capacity that currently exists -- so a prison with no
   * furnished bed accrues nothing, is owed nothing, and waits for a payment
   * that is not coming. Measured: `stateIncomeAccruedTodayMinorUnits` was `0`
   * at all 29 samples of a floored prison holding nobody.
   *
   * So the tail now names the only thing that actually lifts the balance --
   * the prison earning -- and this chip's second sentence says how earning
   * works, because the tooltip is where there is room to say it.
   *
   * **This paragraph also named the build queue as spending past this rung,
   * to -2,000, and that stopped being true on 2026-09-01.** The owner's
   * ruling on #771 (ADR 0017's equalisation amendment) moved
   * `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS` onto the same -1,250 a
   * Buy press already stops at, so the build queue is no longer a second
   * example here -- the payday alone is what still makes "materials" the
   * right word instead of "anything".
   */
  'hud.status.funds-before-deliveries-stop':
    '{remaining} left before deliveries stop — past that, no materials can be ordered until the prison earns the money. The state pays at the end of each day, for prisoners who have a bed.',
  /*
   * The same sentence once the remainder is nothing, in the tense that is then
   * true. `overdraftTone` paints the chip red at exactly this point and
   * `judgeAffordability` refuses the Buy press at exactly this point, so all
   * three say one thing.
   *
   * "Have stopped" is about ordering, not about deliveries already in flight:
   * a delivery bought before the rung was reached still lands, and
   * `ProcurementSystem` does not cancel it. The second clause is what makes
   * that unambiguous, and it is the same clause the warning above and the
   * refusal alert below carry.
   *
   * Same tail and same closing sentence as the warning above, for the reason
   * given there: the state holds no debt to the prison, so what lifts this is
   * the prison earning, and this is one of the two places with room to say
   * what earning takes.
   */
  'hud.status.funds-deliveries-stopped':
    'Deliveries have stopped — no materials can be ordered until the prison earns the money. The state pays at the end of each day, for prisoners who have a bed.',
  /*
   * The chip's tooltip at the treasury floor itself -- `critical`, the ruling
   * on issue #768's third tone, one step past everything the sentence above
   * says.
   *
   * **Written to answer the two questions a player at this balance has, and
   * nothing else**: that no further spending of *any* kind is possible right
   * now (not deliveries alone -- the sentence above already says that -- but
   * construction, hiring and even the wage payment the deliveries rung still
   * lets through), and what lifts it.
   *
   * **This sentence was measured to be false and is rewritten, which is the
   * one change here that was not a matter of taste** (issue #913,
   * `docs/research/2026-09-04-can-this-prison-fail.md` finding 1). It read
   * *"The treasury is exhausted -- nothing can be spent at all until the state
   * pays what it owes."* Sixty guards hired on day 1 pins a prison at this
   * floor by day 4, and it was held there across twelve samples and four
   * paydays with `stateIncomeAccruedTodayMinorUnits: 0` at all 29 readings.
   * The state owed that prison nothing, and the sentence named waiting as the
   * way out when waiting is the one thing that cannot work.
   *
   * **What the three clauses now claim, and where each is true.**
   *  - *"at its floor -- nothing can be spent at all"*: this key is chosen on
   *    `atTreasuryFloor` (`src/ui/hud/projection.ts`), and at
   *    `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` every rung of
   *    `INSOLVENCY_RUNG_FLOORS_MINOR_UNITS` refuses -- including `'wages'`,
   *    the deepest, so even the payday that spends past the deliveries rung
   *    pays nothing here (`src/simulation/economy/treasury.ts`).
   *  - *"until the prison earns the money"*: `StateIncomeSystem.update` is the
   *    prison's only positive inflow, in its own comment's words, and a
   *    refund of a cancelled delivery is the prison's own money coming back
   *    rather than income (`src/simulation/economy/income.ts`). `LoanBook`
   *    exists and is not wired -- nothing in `src/` passes `loanTerms` -- so
   *    there is no borrowing to name either.
   *  - *"at the end of each day and only for prisoners who have a bed"*: the
   *    day is paid on its last tick (`schedule.phaseTicks = DAY_LENGTH_TICKS
   *    - 1`), and `stateIncomeForOccupiedPlaces` folds over
   *    `residentIdsWithExistingPlace()`, which is a prisoner holding a unit of
   *    residency capacity **that currently exists**. Residency capacity comes
   *    only from an object declaring `'sleep-surface'` -- `object.bed` and
   *    `object.medical-bed` (`src/simulation/objects/room-capacity.ts`) -- so
   *    "has a bed" is the rule and not a paraphrase of it: an arrival still in
   *    intake, a resident whose bed was taken away, and the second of two
   *    residents over one bed are each unpaid.
   *  - *"a prison housing nobody earns nothing"*: `update` returns without
   *    crediting when the fold is zero, which is the state act A measured for
   *    ten days with twenty-four prisoners in intake.
   *
   * No amount is quoted, deliberately: what a place pays is
   * `stateIncomeForPrisonerDay`, which withholds per unmet need, and a figure
   * in this sentence would go stale the day
   * `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` moves off zero.
   *
   * Authored by an agent under the owner's release of 2026-09-04
   * (*"Sam decyduj zawsze, jak zacznę grać to ujednolicimy"*), so the voice is
   * open to a unifying pass; the facts above are not.
   */
  'hud.status.funds-treasury-floor-exhausted':
    'The treasury is at its floor — nothing can be spent at all until the prison earns the money. The state pays at the end of each day and only for prisoners who have a bed, so a prison housing nobody earns nothing.',
  // What this in-game day has earned so far (#29). The state pays per
  // prisoner-day at the end of the day, so this is the day's accrual and the
  // wording says so: "Earned today", never "Income" -- there is no rate, no
  // budget and no forecast behind it, and the same minor units as `funds`
  // above so the two chips can be read against each other.
  'hud.status.earned-today': 'Earned today',
  'hud.status.occupancy': 'Cell occupancy',
  'hud.status.occupancy-value': '{value} of {capacity}',
  'hud.status.incidents-clear': 'Clear',
  'hud.status.incidents-active': 'Active',

  'hud.clock.title': 'Time controls',
  // Not "Time": the simulation has no hour-of-day, so the strip reports how
  // far through the in-game day it is (docs/HUD_PROJECTIONS.md, gap 5).
  'hud.clock.day-progress': 'Through the day',
  'hud.clock.day': 'Day',
  /*
   * The sign is U+00D7 MULTIPLICATION SIGN, as it is everywhere else in this
   * catalogue, under the owner's ruling of 2026-09-01: **one multiplication
   * sign, and it is `×`.** This entry spelled it `Speed {speed}x` with an
   * ASCII letter until then and was the last player-facing sentence in the
   * game that did; the divergence is described, from the other side, in
   * `hud.alert.occurrences` below, which is where it was first written down.
   *
   * **What this sentence is, and it is not the readout.** Nothing paints it on
   * screen: `status-strip.ts` writes the *visible* speed itself as
   * `×${formatNumber(speed)}` -- U+00D7 since #639 -- and passes this key to a
   * `.ui-sr-only` span, so `Speed 1×` is what a screen reader says and only a
   * screen reader. The ruling is a typography ruling and typography is not
   * what a synthesiser reads, so the change here is about the catalogue being
   * one convention rather than about anything a sighted player can see; what a
   * reader announces for U+00D7 is the host's symbol dictionary, not ours, and
   * this repository has measured no synthesiser. `tests/foundation/times-sign-contract.test.ts`
   * is the gate that keeps the ASCII spelling from coming back.
   */
  'hud.clock.speed': 'Speed {speed}×',
  // Uppercase in the string rather than by `text-transform`, because the
  // readout it replaces is `×1` -- a value, not an eyebrow -- and the strip's
  // value styling carries no case transform. The word is the owner's, ruled on
  // 2026-08-30 (#639); nothing here may pick a different one.
  'hud.clock.paused': 'PAUSED',
  'hud.transport.pause': 'Pause',
  'hud.transport.play': 'Play at normal speed',
  'hud.transport.fast-forward': 'Fast forward',

  'hud.tabs.title': 'Prison sections',
  'hud.tab.overview': 'Overview',
  'hud.tab.build': 'Build',
  'hud.tab.security': 'Security',
  'hud.tab.regime': 'Regime',
  // Six characters. ADR 0022 measured the tab bar at 375x812 spanning
  // x = 1.8 .. 373.2 with a fifth tab injected -- 1.8px of margin per side --
  // so a nine-character label such as "Logistics" would put the bar at
  // x = -9.5 and fail the assertions in `tests/browser/ui-shell.spec.ts`.
  'hud.tab.rooms': 'Rooms',

  /*
   * The Layout menu and the three collapse arrows (#1159, stage 3).
   *
   * Fifteen strings, and the reservation they are written under is
   * `AGENTS.md`'s fourth: the owner released the CHOICE of words on
   * 2026-09-04 and did not release the requirement that each sentence be true
   * of the code that renders it. So each is recorded here against what was
   * opened to establish it.
   *
   * - `hud.layout.title` names the group and is the visible legend on the menu
   *   button, in the same arrangement `hud.zoom.title` and `INTERFACE SCALE`
   *   use. "Layout" rather than "View": nothing here moves the camera, and
   *   this game already has a camera zoom two controls away that does.
   * - `hud.layout.menu` is the button's `title`, and says what pressing it
   *   does -- it opens a menu -- rather than naming the menu a second time.
   * - The two width sliders and the one height slider are named for the thing
   *   they move, and each is `<input type="range">` with `min`/`max` taken
   *   from the same `SeparatorRange` the drag and the arrow keys are clamped
   *   to (`src/ui/hud/hud-layout.ts`), so "width" is literally the property
   *   being set and the three cannot disagree about their limits.
   *   `hud.layout.inspector-height` exists because on a phone the same region
   *   is a bottom sheet and the drag is vertical; naming it "width" there
   *   would be a sentence the layout contradicts.
   * - `hud.layout.reset` -- "Reset layout" and not "Reset settings": it clears
   *   `lockstate.settings.layout` and nothing else, so the player's interface
   *   scale, theme and keyboard remap survive it. That is constitution article
   *   13's "niezależny reset" and it is the whole reason the key is separate.
   * - `hud.layout.map-only` names a mode rather than promising an empty
   *   screen: it folds all three regions at once, and constitution article 16
   *   requires each folded region to leave a handle behind, so three small
   *   controls remain. The alternative wording -- "Hide all panels" -- was
   *   rejected because it says the same thing less clearly and is no more
   *   literally true.
   * - The three hide/show pairs each name **what disappears**, verified
   *   against `applyLayout` in `src/ui/hud/layout-shell.ts`:
   *   `hidden` goes on `.hud-tabs__inner` (the five tab buttons), on
   *   `.hud__rail`'s panel column (the aside slot and the five tab panels),
   *   and on the strip's metrics row, clock and transport group. So
   *   "the counters and the clock" is the metric strip's content listed rather
   *   than the strip named -- the strip element itself stays, because it is
   *   what carries the arrow that brings the content back.
   * - The two separator labels are the full sentence a screen reader
   *   announces beside `aria-valuenow`. "Resize" and not "Drag": the control
   *   answers arrows, Shift+arrows, Home, End and a double-click as well as a
   *   drag, and a player reaching it with a keyboard would be told to do the
   *   one thing they cannot.
   */
  'hud.layout.title': 'Layout',
  'hud.layout.menu': 'Open the layout menu',
  'hud.layout.navigation-width': 'Navigation width',
  'hud.layout.inspector-width': 'Panel width',
  'hud.layout.inspector-height': 'Panel height',
  'hud.layout.reset': 'Reset layout',
  'hud.layout.map-only': 'Map only',
  'hud.layout.hide-navigation': 'Hide the sections',
  'hud.layout.show-navigation': 'Show the sections',
  'hud.layout.hide-inspector': 'Hide the panels',
  'hud.layout.show-inspector': 'Show the panels',
  'hud.layout.hide-metrics': 'Hide the counters and the clock',
  'hud.layout.show-metrics': 'Show the counters and the clock',
  'hud.layout.resize-navigation': 'Resize the sections',
  'hud.layout.resize-inspector': 'Resize the panels',

  /*
   * The camera zoom, said out loud at last (issue #1023).
   *
   * `WorldScene` has zoomed on the wheel, on a pinch and on `+`/`-` since it
   * was written, over a deliberate fifteen-fold range
   * (`src/rendering/scene/world-scene.ts:68`, `ZOOM_BOUNDS = { min: 0.2, max: 3 }`,
   * with the docblock above it naming the intent: *"far enough out to plan a
   * wing, close enough in to see which way a prisoner is facing"*). Nothing on
   * screen said so: measured on the assembled page at 1280x800 on `main` at
   * `bd6fa32`, the string `zoom` did not occur anywhere in `document.body.innerHTML`,
   * and the only sentence about moving the view is `hud.build.arm-hint`'s
   * *"Two fingers, the middle button or the arrow keys still move the camera"*
   * -- which names panning, is Build-tab only, and says nothing about zoom.
   * The owner's standing brief is a game with no hidden features; a
   * fifteen-fold zoom nobody is told about is one.
   *
   * **These three strings are authored here under `AGENTS.md` reservation 4 as
   * partly released on 2026-09-04 -- the wording is ours, the truth is not --
   * and each was checked against the code that renders it rather than assumed:**
   *
   * - `hud.zoom.in` / `hud.zoom.out` name what the two buttons do. The press
   *   reaches `WorldScene.stepCameraZoom` (`src/rendering/scene/world-scene.ts`),
   *   which calls the same `stepZoom` the keyboard does with
   *   `KEYBOARD_ZOOM_STEP` (1.25) one way and its reciprocal the other, so "in"
   *   raises `camera.zoom` and "out" lowers it. Neither string promises a
   *   *range*, a step size or a key, because a control at the clamp
   *   (`clampZoom`, `src/rendering/camera/coordinates.ts:88`) changes nothing
   *   and a sentence claiming otherwise would be the false-promise defect the
   *   reservation exists for. No key is named for a second reason: the bindings
   *   are `Equal` and `Minus` by *code* (`src/input/bindings.ts:34-35`), which
   *   is a different physical key on an AZERTY keyboard, and `AGENTS.md`
   *   boundary 10 says this game supports both.
   * - `hud.zoom.title` names the group and is the visible legend above the
   *   pair, in the same arrangement `INTERFACE SCALE` uses one panel over
   *   (`src/ui/display-scale.ts`) and for the reason that control records: a
   *   bare glyph beside a game that has both an interface scale and a camera
   *   zoom needs to say which one it is. "Zoom" is the camera's, and the
   *   display-scale control already took "interface".
   */
  'hud.zoom.title': 'Zoom',
  'hud.zoom.in': 'Zoom in',
  'hud.zoom.out': 'Zoom out',

  'hud.minimap.title': 'Minimap',
  /*
   * **THIS WORDING WAS OWNER-PENDING FROM #782 UNTIL 2026-09-04, AND THAT
   * MARKING IS KEPT RATHER THAN DELETED (`docs/AGENT_WORKFLOW.md` §4: mark
   * both directions, do not overwrite).** The comment on `hud.minimap.navigable`
   * below is the one that used to carry the owner-pending notice and the
   * reasoning behind it; this key inherited the same status because the two
   * sentences are two views of one surface. `AGENTS.md`'s fourth exclusion
   * released the CHOICE OF WORDS on that date -- *"Sam decyduj zawsze"* /
   * *"Wybierz sam"* -- and names issue #903 explicitly as one of the four
   * sentences waiting when the release came. What the release did NOT touch is
   * the requirement that follows it: **verify, then write**. The words below
   * are chosen, not the owner's, and each is true of the code cited beside it,
   * in `hud.minimap.navigable`'s comment.
   *
   * **THE DEFECT ISSUE #903 FOUND WAS NOT IN THIS KEY ON ITS OWN -- IT WAS
   * THAT THIS SENTENCE AND `hud.minimap.navigable` CONTRADICTED EACH OTHER.**
   * On arrival the surface used to read *"Minimap is not available yet"*, and
   * the only way a player ever learned that was false was to do the one thing
   * that sentence said could not be done -- and a keyboard player could not
   * even do that, because the surface was not reachable by keyboard at all.
   * Both halves are fixed together below: the sentence and the surface's own
   * operability.
   */
  'hud.minimap.placeholder': 'No map is drawn here yet — pressing may move the camera',
  /*
   * **Both minimap sentences, chosen under the 2026-09-04 release, verified
   * against the code rather than assumed, and recorded here per the release's
   * own condition -- quoted verbatim beside the `file:line` that proves each
   * true, so the owner's promised harmonising pass is one reading rather than
   * an excavation.**
   *
   * *"No map is drawn here yet — pressing may move the camera"*
   * (`hud.minimap.placeholder`, above) is what a player reads before any press
   * on the surface has succeeded, including on a page where no world has ever
   * loaded (`tests/browser/hud-minimap-navigates.spec.ts`'s pre-session test
   * asserts the placeholder is on screen there, unclicked). Both halves are
   * true in every one of those states. "No map is drawn" is true of the
   * renderer's own placeholder frame regardless of session state (`hud.ts`'s
   * comment on `.hud-minimap__surface`, below: *"Rendering is still a
   * placeholder ... minimap rendering belongs to the renderer ... and does
   * not exist yet"*). "Pressing MAY move the camera" is hedged rather than
   * asserted because `WorldScene.navigateToMinimapPoint`
   * (`src/rendering/scene/world-scene.ts:1426`) returns `false` -- moves
   * nothing -- exactly when no world has ever loaded
   * (`this.lastLoadedBounds === undefined`), which is a real, reachable,
   * on-screen state (`hud-minimap-navigates.spec.ts`'s *"a click that finds no
   * loaded world..."* test, unchanged by this issue). Asserting the stronger
   * claim `hud.minimap.navigable` carries below would be false precisely
   * there, which is the honest answer to issue #903's own question -- *"the
   * second sentence already conveys both halves ... so why is it not the
   * first one?"* -- the first sentence cannot yet claim what has not been
   * proven, and this is the shortest wording found that says so without
   * dropping either half.
   *
   * *"No map is drawn here yet — press to jump the camera there"* is what
   * replaces it, and ONLY the word *press* is new for issue #903: it read
   * *click* until this issue made the surface keyboard-operable (`hud.ts`'s
   * `minimapSurface`, now a real `<button>` rather than a `div`), and *click*
   * would have quietly kept describing one input method after the code
   * stopped being limited to it (`AGENTS.md` boundary 10). *Press* is true of
   * a mouse click, a touch tap and an Enter/Space key alike -- all three reach
   * this sentence through the one `click` listener `hud.ts` attaches, because
   * a native `<button>` dispatches its own `click` event for a keyboard
   * activation exactly as it does for a pointer one. The swap itself is
   * unchanged and still gated on `navigated`, i.e. on `onMinimapNavigate`
   * returning `true` -- see `src/ui/hud/messages.ts`'s `minimapNavigable` for
   * why that never reverts, and `WorldScene.navigateToMinimapPoint` for what
   * the surface represents.
   */
  'hud.minimap.navigable': 'No map is drawn here yet — press to jump the camera there',
  'hud.alerts.title': 'Alerts',
  'hud.alerts.empty': 'No active alerts',

  /*
   * How many times the prison has said the same thing, and when it last said
   * it (the owner's decisions 1 and 2 of 2026-09-01 on
   * [ADR 0084](../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md),
   * with the two sentences supplied by the owner on the same day).
   *
   * **`{count}×` and not `×{count}` or `{count} times`**, chosen by the owner
   * against both. The reason to prefer either short form over the long one is
   * the column: `.ui-row__label` in the alerts log measures **88px** in the
   * fixed 224px rail (#720's measurement, kept in `primitives.css`), which is
   * about ten characters a line, so the multiplier is digits and a sign and
   * nothing else.
   *
   * **The sign is U+00D7, and it is now the only times sign in the game.**
   * **This paragraph recorded the opposite for one merge and is marked rather
   * than overwritten** (`docs/AGENT_WORKFLOW.md` section 4). It read: *"The
   * sign is U+00D7, and `hud.clock.speed` beside it spells its multiplier with
   * an ASCII `x` (`'Speed {speed}x'`). That is a real divergence rather than a
   * typo here: the owner supplied this sentence with the typographic sign, and
   * the speed readout's `x` predates it and was never ruled on. Two spellings
   * of one convention is the kind of thing that reads as a defect on screen,
   * so it is recorded rather than quietly harmonised in either direction --
   * changing the speed readout is a player-visible wording change and is the
   * owner's."* Every clause of that was true when it was written; the last one
   * is what resolved it. The owner ruled on 2026-09-01 that the typographic
   * sign is the one, so `hud.clock.speed` moved and this entry did not.
   * `tests/foundation/times-sign-contract.test.ts` is the gate that keeps the
   * ASCII spelling from returning to either of them.
   *
   * **`Day {day}` and not `Day {day}, {progress}%`.** The owner was shown the
   * two-figure form and rejected it: a percentage of a day is a strange unit to
   * put in front of a player. **`{progress}` is still produced and is
   * deliberately not rendered** -- `HudAlertTimeViewModel.progressPercent`
   * carries it, `hudAlertRowLabel` passes it, and this sentence declines it, so
   * a locale that has a use for it has it and the next pass does not have to
   * re-derive it from the tick. `interpolate` substitutes only the placeholders
   * a sentence names, so an unused parameter costs nothing and reaches nobody.
   *
   * **What tells two events on the same day apart is the count beside them**,
   * which is the owner's own answer to that gap rather than a property this
   * sentence claims. Two arrivals of one sentence on day 3 are one row reading
   * `2× Day 3`; two *different* sentences on day 3 are two rows, each naming
   * itself.
   */
  'hud.alert.occurrences': '{count}×',
  'hud.alert.time': 'Day {day}',

  /*
   * What the control on a dismissable alert row is called (the owner's
   * decision 3 of 2026-09-01 on ADR 0084, with this sentence supplied by them
   * on the same day).
   *
   * The control is an `×`, so this is not a caption -- it is the whole of what
   * the control is called to anybody not looking at the glyph.
   * `createIconButton` renders it as screen-reader text and as a `title`,
   * because a button whose only content is a glyph reaches a screen reader as
   * nothing at all.
   *
   * **"Clear this alert" and not "Dismiss this notice"**, and the reason is
   * exactly the near miss that made a word necessary in the first place.
   * `hud.security.roster-dismiss` is "Dismiss" and it ends a staff member's
   * employment -- its own hint says *"a dismissed staff member leaves the
   * prison for good, and their wage stops"*. Reusing that key here would have
   * made one key mean both "sack this person" and "I have read this notice",
   * which is two answers to one question; and authoring a *second* sentence
   * around the same verb would have left the word **dismiss** meaning two
   * different things in one interface, which is the same defect one step
   * further on. So the sentence avoids the verb rather than reusing it.
   *
   * **"this alert" rather than "the alert"**: there is one control per row and
   * several rows, so the word has to say *which*, and the demonstrative is what
   * a player pressing one of eight rows needs. No parameter: the row's own
   * sentence is beside it and the accessible name does not repeat it.
   */
  'hud.alert.dismiss': 'Clear this alert',

  // What the simulation refused, in the alerts list (issue #261).
  //
  // A command the worker accepted and a system then refused on its content:
  // the order was queued, dispatched at its tick, and the prison declined to
  // carry it out. Each sentence says what did not happen and why, in that
  // order, because the player already knows what they asked for and needs the
  // reason to decide what to do differently.
  //
  // Namespaced `hud.alert.refusal.*` and not `hud.refusal.*`: the two keys in
  // that older namespace label the always-laid-out band under the status
  // strip, which reports a *control's* action being refused on this thread
  // and is bound to the control that was pressed. These are rows in the
  // alerts list about something the simulation decided later, with no control
  // to attach to.
  // `admit.no-accommodation` is the sentence an admission into a prison with
  // no accommodation room gets, and it says the thing the player can act on
  // rather than the thing that is technically true. "There is no room instance of an accommodation target"
  // is the condition; "nowhere to put them" is what to do about it. Refusing
  // here is deliberate: with no room, `IntakeSystem` marks the arrival
  // terminally `'failed'`, and a permanent inert record counted on the strip
  // as a prisoner would be a worse answer than a sentence
  // (`src/simulation/prisoners/prisoner-operations-runtime.ts`).
  'hud.alert.refusal.admit.no-accommodation': 'Nobody was admitted — there is no room to put a prisoner in yet.',
  'hud.alert.refusal.admit.population-full': 'Nobody was admitted — this prison is holding as many people as it can.',
  /*
   * `build.duplicate-order` (issue #514). Not new copy: the `build.*` prefix
   * ("The build order failed — ...") is every other sentence in this
   * namespace's own convention, and the tail is transcribed verbatim from
   * `place-object.duplicate-order` and `purchase.duplicate-order` below,
   * which already say "that order already exists" for the identical fact on
   * their own commands. Mechanically combining the two rather than authoring
   * a third phrase for one condition three commands already have a sentence
   * for.
   */
  'hud.alert.refusal.build.duplicate-order': 'The build order failed — that order already exists.',
  'hud.alert.refusal.build.out-of-bounds': 'The build order failed — that tile is outside the map.',
  'hud.alert.refusal.build.unbuildable': 'The build order failed — nothing can be built on that tile.',
  'hud.alert.refusal.build.unbuildable-terrain': 'The build order failed — the ground there cannot be built on.',
  /*
   * The one `build.*` sentence that is not about a tile.
   *
   * Worded almost exactly like `place-object.unknown-buildable` below, and
   * differing only in what did not happen -- "the build order failed" against
   * "the object was not placed" -- because the condition really is identical:
   * both commands carry a `BUILDABLE_REGISTRY` id and neither can do anything
   * with one the registry does not hold. What the player needs from the two is
   * which control they pressed, which is the half that differs.
   *
   * No id in the sentence. The refusal channel carries no coordinates, order id
   * or definition id (`RefusalLog`), so there is nothing to interpolate, and a
   * stable content id is not player-facing text under any circumstances
   * (ADR 0011).
   */
  'hud.alert.refusal.build.unknown-buildable': 'The build order failed — that is not something this prison knows how to build.',
  'hud.alert.refusal.build.unowned-land': 'The build order failed — you do not own that land.',
  'hud.alert.refusal.build.water-blocked': 'The build order failed — there is water on that tile.',
  /*
   * The one `cancel-build-order.*` sentence (ADR 0107).
   *
   * "Nothing was refunded — …" first, matching `cancel-purchase.not-pending`'s
   * own opening clause below for the same family of refusal (ADR 0107 Context
   * §8): the balance did not move, and that is the fact the press was aimed
   * at changing. Deliberately generic across every `order.state =` transition
   * a revision mismatch could represent (Decision §3's eleven sites), not
   * only `'assigned'` -> `'in-progress'` -- a sentence naming "the crew" would
   * be false of a press caught between, say, `'approved'` and
   * `'materials-pending'`, where no crew is involved yet.
   *
   * The second sentence answers ADR 0107 Context §7's own frequency finding: a
   * control that refuses seven presses in ten (pre-fix; see this repository's
   * measurement of the post-fix rate) owes the player somewhere to look, and
   * the row's own next publication is exactly that -- it already reads the
   * order's honest current state and honest current refund figure by the
   * time this sentence is read.
   */
  'hud.alert.refusal.cancel-build-order.stale-cancellation':
    'Nothing was refunded — this order moved on before the cancellation reached it. Press Cancel again to see what it pays now.',
  /*
   * The one `cancel-purchase.*` sentence (#285).
   *
   * It says the money did not come back *first*, because that is the fact the
   * player pressed the control to change and the only one they can act on: the
   * balance did not move, and the materials are theirs. Deliberately not "that
   * delivery has already arrived": `ProcurementSystem.cancel` cannot tell a
   * delivery that landed from an id it never held, so the sentence names what is
   * true of both -- the delivery is not on its way any more.
   *
   * The likeliest way to meet it is not a mistake. The list of deliveries is a
   * projection on a cadence, so one can land in the half-second between the
   * publication and the press, and then the button the player aimed correctly
   * refunds nothing.
   */
  'hud.alert.refusal.cancel-purchase.not-pending': 'Nothing was refunded — that delivery is not on its way any more.',
  /*
   * The one `construction.*` sentence, and ADR 0017 decision 8's **second
   * rung** finally saying something of its own (the owner's ruling of
   * 2026-09-01).
   *
   * Until that ruling a stalled build queue reported
   * `hud.alert.refusal.purchase.insufficient-funds` -- rung 1's sentence on
   * rung 2's event, which ADR 0017's "Amendment, 2026-09-01" §5 named as owed
   * in exactly those words. A prison at -1,800 read that deliveries were
   * refused; what had stopped was construction, at a different threshold, and
   * the two rungs being distinguishable is the whole of what makes the ladder
   * an order rather than a single wall.
   *
   * **Why the subject is the queue and not the order.** `RefusalLog` carries a
   * reason and a tick and nothing else -- no order id, no definition id, no
   * coordinates -- which is the same constraint
   * `hud.alert.refusal.build.unknown-buildable` states above. There is nothing
   * to interpolate, so the sentence names what a player can go and look at.
   * "Stalled" rather than "failed" for a second reason that is not about the
   * channel: `ConstructionSystem` keeps the order and retries it on every
   * construction tick, so the wall the player drew is still theirs and a
   * sentence saying it failed would be false.
   *
   * **Why it shares the other four's tail.** *"Until the prison earns the
   * money"* is the same clause `hud.alert.refusal.purchase.insufficient-funds`
   * and `hud.alert.refusal.hire.insufficient-funds` carry, so the three rungs
   * read as one ladder with three things stopping on it rather than as three
   * unrelated rules that happen to be about money. And no number: the rung is
   * -2,000 today and a sentence spelling that out would be a second copy of
   * `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS` with nothing tying the
   * prose to it, which is the argument written out in full at
   * `hud.alert.refusal.hire.insufficient-funds` below.
   *
   * **Corrected 2026-09-01, and kept above rather than rewritten because it
   * is the record of why this sentence exists at all.** The owner's ruling on
   * #771 (ADR 0017's equalisation amendment) retired the rung this sentence
   * used to name a *different threshold* for: `construction` now reads
   * `INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS`, the same −1,250 a Buy
   * press stops at, not −2,000. This sentence still fires at a different
   * *moment* than the four Buy/Hire sentences do -- it answers a queued
   * order the construction system is retrying, they answer a press -- so it
   * still earns its own key and this comment's "why the subject is the
   * queue" and "why it shares the tail" sections both still hold. What no
   * longer holds is "at a different threshold": a prison whose queue stalls
   * has, from this ruling on, always also had its last Buy press refused,
   * because the two now fire together.
   */
  'hud.alert.refusal.construction.materials-unfunded':
    'The build queue is stalled — no more materials until the prison earns the money.',
  // `hire.insufficient-funds` describes the same condition as
  // `purchase.insufficient-funds` below and gets its own sentence, for the
  // reason the `zone.*` pair further down does: the treasury refuses a hire
  // and a purchase alike, and somebody who pressed Hire must not be told the
  // materials were not ordered.
  //
  // **Both of these said "not enough funds" for a refusal that is, since #703
  // ruling A, always the overdraft floor** -- and that was recorded here rather
  // than fixed. `GuardRoster.hire` refuses at `src/simulation/staff/hiring.ts:199`
  // and `ProcurementSystem.purchase` at `src/simulation/economy/procurement.ts:195`,
  // both on a `Treasury.spend` that is one `canAfford` comparison against the
  // floor, so the worker-side sentence carried exactly the conflation the
  // owner's ruling 18 of 2026-08-31 removed from the *host* side
  // (`hud.refusal.purchase-materials-past-floor` and its hire twin). Ruling 18
  // authored two sentences and these were not them, and a replacement is
  // player-facing copy -- `AGENTS.md`'s fourth exclusion -- so the two halves of
  // one refusal read differently depending on which side of `sender.submit`
  // decided it.
  //
  // **The owner's ruling 23 of 2026-08-31 closed it: *"Te same słowa co host"*
  // -- the worker says the same words as the host.** The two sentences below
  // are ruling 18's own, transcribed from `hud.refusal.hire-staff-past-floor`
  // and `hud.refusal.purchase-materials-past-floor`; no third wording was
  // authored here, so the fourth exclusion is satisfied by the owner having
  // written both halves rather than bypassed. The paragraph above is kept
  // because it is the record of what the sentences used to say and why nobody
  // was allowed to change them until now.
  //
  // **Still four keys, and not two worker keys pointing at the host's.** Four
  // call sites, and two vocabularies that ADR 0011 keeps apart at
  // `REFUSAL_LABEL_KEYS` (`src/ui/simulation-alerts.ts`): a `RefusalReason` the
  // worker put on the wire is turned into exactly one authored
  // `hud.alert.refusal.<command>.*` sentence per reason -- the rule the
  // refusal-reason exemptions in `tests/unit/simulation-message-keys.test.ts`
  // state in those words, repeated for every command union that has one --
  // while `hud.refusal.*` is what a control on *this* thread says when it
  // refuses before submitting. Making one table's value a member of the other
  // namespace would put a host key on the wire's side of that line. The repository's own precedent is the same
  // direction and is not thin: `hud.build.queue-cancel` and
  // `hud.build.delivery-cancel` are both "Cancel", `hud.build.step-up` and
  // `hud.rooms.step-up` are both "Increase {field}", `hud.status.staff` and
  // `hud.security.staff` are both "Staff" -- this file has always let distinct
  // keys carry identical text, because a key here is a *call site* and never a
  // string pool. What keeps identical text identical is a test, not a shared key:
  // `tests/unit/ui-simulation-alerts.test.ts` pins each of these two against
  // the host key it now quotes.
  //
  // **The owner's ruling 19 of 2026-08-31 made the tail of both sentences
  // false for most of the range they cover, and the paragraph that recorded
  // that is kept below rather than deleted.** It read: *"Ruling 19 -- 'Dać
  // szczeblom własne progi wewnątrz debetu' -- gives ADR 0017 decision 8's
  // rungs their own thresholds inside the overdraft, so a hire is refused
  // below -1,250 and a purchase below -1,250 as well, while 'what the state
  // will carry' is -2,500. At -1,300 the state will carry 1,200 more and the
  // sentence says it will not. Ruling 18 authored these words for a single
  // floor and there is no ruling behind a replacement, so both keys are left
  // **byte-for-byte** ... the amendment drafted at
  // `docs/adr/0017-money-primary-resource-model.md` ('Amendment, 2026-09-01')
  // lists all four keys as owed a sentence per rung."*
  //
  // **The owner ruled on 2026-09-01 and the four keys now name what stops
  // rather than the number they stop at.** The shape chosen was *"deliveries
  // are refused until the state pays what it owes"* over *"the state will not
  // pay past -1,250"*, and it is the shape rather than the digits that is
  // load-bearing: a sentence spelling out -1,250 would be a second copy of
  // `INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS`
  // (`src/simulation/economy/treasury.ts`) with nothing tying the prose to the
  // constant, so a later ruling that moved the rung would leave the sentence
  // silently stale -- which is the failure mode ruling 19 exists to correct,
  // rebuilt one layer up. Naming what stops is true at every threshold and
  // needs no maintenance when one moves.
  //
  // **The hire sentence says "hiring", not "deliveries", and that is
  // deliberate.** Hiring is *not* one of ruling 19's three rungs: ADR 0017's
  // amendment §3c gives it the shallowest rung's threshold by construction
  // (`INSOLVENCY_RUNG_FLOORS_MINOR_UNITS.hiring =
  // INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS`) and §4 marks a rung of its
  // own as the owner's. A hire sentence saying deliveries are refused would
  // name a rung hiring is not on, and one saying *"the deliveries threshold"*
  // would be false the day hiring gets its own. "Hiring is refused" is true
  // either way.
  //
  // The rung-2 sentence that pairs with these -- a build queue stalled -- is
  // `hud.alert.refusal.construction.materials-unfunded` above, and it
  // deliberately shares this one's *"until the prison earns the money"*
  // tail so the ladder reads as one thing rather than unrelated rules. It
  // stalled at -2,000 under ruling 19; the owner's ruling on #771
  // (2026-09-01, ADR 0017's equalisation amendment) moved it to the same
  // -1,250 a hire or a purchase already stops at, which is exactly why
  // naming what stops rather than the number was the right call two
  // paragraphs up -- this sentence needed no edit when the number under it
  // moved.
  //
  // **The tail moved on 2026-09-04, and the ruling above is what says it
  // could.** Ruling 19's requirement is *name what stops, not the number it
  // stops at*, and the words that carried it -- *"until the state pays what
  // it owes"* -- were measured false: the state holds no debt to a prison
  // that is not earning, because `StateIncomeSystem` credits nothing at all
  // when `stateIncomeForCompletedDay` is zero, and that sum is a fold over
  // prisoners holding a furnished bed
  // (`src/simulation/economy/income.ts`; issue #913 and
  // `docs/research/2026-09-04-can-this-prison-fail.md` finding 1, where a
  // floored prison read `stateIncomeAccruedTodayMinorUnits: 0` at all 29
  // samples). *"Until the prison earns the money"* names the same stop with
  // no number in it and is true whether or not anybody is housed; the two
  // chip tooltips at `hud.status.funds-*` above are where there is room to
  // say what earning takes. Authored by an agent under the owner's release of
  // 2026-09-04 (*"Wybierz sam a potem się ujednolici sposób pisania"*), so
  // the wording is open to a unifying pass and the fact it rests on is not.
  'hud.alert.refusal.hire.insufficient-funds': 'Nobody was hired — hiring is refused until the prison earns the money.',
  // ADR 0053: the only work a staff member can be sent to do today is a
  // security duty, so a role outside the security department is a wage with
  // nothing behind it. The sentence names the rule rather than the department
  // of the role that tripped it, because the refusal channel carries an id and
  // no parameters (`SimulationRefusal` is sequence, tick and reason).
  'hud.alert.refusal.hire.no-duty-for-role': 'Nobody was hired — only security staff can hold a post, and this prison has no other work for that role.',
  'hud.alert.refusal.hire.roster-full': 'Nobody was hired — this prison cannot hold any more staff.',
  'hud.alert.refusal.hire.unknown-role': 'Nobody was hired — that is not a role this prison knows.',
  // The seven `place-object.*` sentences (ADR 0028 phase 1). Three of them name
  // a condition the `build.*` and `purchase.*` rows also name, and each says
  // "the bed was not placed" instead, for the reason the ids are namespaced: a
  // player who pressed the object row and read that the materials were not
  // ordered would go and look at the wrong control. They say "object" rather
  // than "bed" because the same seven sentences serve every object phase 4 adds.
  'hud.alert.refusal.place-object.duplicate-order': 'The object was not placed — that order already exists.',
  'hud.alert.refusal.place-object.not-a-placeable-object': 'The object was not placed — that is not something built by placing it on a tile.',
  'hud.alert.refusal.place-object.out-of-bounds': 'The object was not placed — part of it would be outside the map.',
  'hud.alert.refusal.place-object.outside-room': 'The object was not placed — it has to stand in a room you have zoned.',
  'hud.alert.refusal.place-object.tile-occupied': 'The object was not placed — something is already standing there.',
  'hud.alert.refusal.place-object.unknown-buildable': 'The object was not placed — that is not something this prison knows how to build.',
  'hud.alert.refusal.place-object.unowned-land': 'The object was not placed — you do not own all of that land.',
  /*
   * The one `remove-object.*` sentence (ADR 0028 phase 3).
   *
   * It says what the press did *not* find rather than what the player did
   * wrong, because a removal cannot be aimed wrongly -- there is nothing to
   * select and no rule to break. Deliberately not "there is no object there":
   * an object still being built is removed by this gesture too, so the honest
   * sentence names both populations without listing them.
   */
  'hud.alert.refusal.remove-object.nothing-to-remove': 'Nothing was removed — there is no object on that tile, and none being built there.',
  /*
   * The one `remove-wall.*` sentence
   * (ADR 0106, authored under `AGENTS.md`'s 2026-09-04 release of
   * reservation 4).
   *
   * It is the terminal refusal of a world press armed to remove: this
   * command's own session-command branch tries the object arm first, so this
   * sentence is only ever what the player reads when that arm *also* found
   * nothing -- which is why it names all three things checked rather than
   * only the wall. "None being built there" is carried over from
   * `remove-object.*`'s own sentence rather than repeated as a separate
   * clause, and "no finished wall there either" is deliberately not "no
   * wall": a wall still being built answers `nothing-to-remove` here too
   * (`ConstructionSystem.completedOrderClaimingEdge` only ever matches a
   * `'completed'` order), and a sentence that said "no wall" would be false
   * of that case.
   */
  'hud.alert.refusal.remove-wall.nothing-to-remove':
    'Nothing was removed — there is no object on that tile, none being built there, and no finished wall there either.',
  'hud.alert.refusal.purchase.duplicate-order': 'The materials were not ordered — that order already exists.',
  // Ruling 23's other half -- see `hire.insufficient-funds` above for the
  // whole argument, and note that this key has a second producer:
  // `reportMaterialsFunding` (`src/simulation/construction/handler.ts`)
  // records it for a build order the just-in-time pass could not fund. That
  // path is the floor too -- `JustInTimeMaterialsService` puts a line in
  // `unfunded` only behind `Treasury.canAfford`, and routes every non-money
  // refusal to `unprocurable` instead, *"because the prison is not short of
  // money for them and telling the player it is would be a sentence that is
  // false"* -- so the tail of this sentence is true on both routes.
  'hud.alert.refusal.purchase.insufficient-funds': 'Nothing was bought — deliveries are refused until the prison earns the money.',
  'hud.alert.refusal.purchase.invalid-quantity': 'The materials were not ordered — that quantity cannot be bought.',
  'hud.alert.refusal.purchase.unknown-material': 'The materials were not ordered — that material is not for sale.',
  /*
   * `sell.*`, the third namespace beside `purchase.*` and `cancel-purchase.*`
   * on the same treasury (ADR 0075 decision 3, invoked by ADR 0096 decision
   * 3(b)) -- verified against `ProcurementSystem.sellStock`
   * (`src/simulation/economy/procurement.ts`) before being written, per
   * `AGENTS.md`'s reservation-4 release: the choice of words is ours, the
   * truth of the sentence is not.
   *
   * `unknown-material` and `invalid-quantity` read `procurableMaterial(itemId)
   * === undefined` and `!Number.isSafeInteger(quantity) || quantity <= 0` --
   * the same two guards `purchase.*`'s own sentences answer, for the same
   * catalogue and the same integer check, in the other direction of money.
   * `insufficient-stock` reads `this.destination.availableOf(itemId) <
   * quantity`, the container's *unreserved* balance, so "does not have that
   * much in store" is exact rather than approximate: a quantity already
   * reserved by a pending allocation is not double-counted as sellable.
   */
  'hud.alert.refusal.sell.insufficient-stock': 'Nothing was sold — the prison does not have that much in store.',
  'hud.alert.refusal.sell.invalid-quantity': 'Nothing was sold — that quantity cannot be sold.',
  'hud.alert.refusal.sell.unknown-material': 'Nothing was sold — that material has no buyer.',
  /*
   * ADR 0034's two. `not-held` is the one a player provokes by pressing a row
   * the list had already stopped being true about -- a response that closed or a
   * search that finished between the publication and the press -- so it says the
   * guard is free rather than implying a mistake. `unknown-guard` is not
   * reachable from the panel and is worded for the case that does reach it: a
   * command naming somebody who is not on the roster.
   */
  /*
   * **Drafted for issue #533 and flagged for the owner's review.** It is the
   * one new player-facing sentence that change adds, and it exists because
   * `REFUSAL_LABEL_KEYS` is a `Record` over the closed `RefusalReason` union: a
   * reason with no key does not compile, so `dismiss.unknown-staff` could not
   * ship without a sentence. It is modelled on
   * `hud.alert.refusal.release-guard.unknown-guard` below, which is the same
   * absence read off the same roster, and it says what did not happen before it
   * says why -- the shape every refusal in this block follows.
   */
  'hud.alert.refusal.dismiss.unknown-staff': 'Nobody was dismissed — that staff member is not on the roster.',
  /*
   * The two `edit-regime-block.*` sentences
   * ([ADR 0113](../../docs/adr/0113-how-a-regime-is-edited-and-whose-day-it-is.md)
   * §3), on the same shape as `dismiss.unknown-staff` above: what did not
   * happen, then why.
   *
   * **Both are true of the code that produces them**, which is the half of
   * `AGENTS.md`'s fourth reservation the 2026-09-04 release did not touch.
   * `RegimeScheduleRegistry.editBlock` returns `{ kind: 'refused' }` from a
   * `findIndex` miss **before** it builds any replacement schedule and before
   * it assigns `this.schedules`, so "nothing changed" is the state of the
   * registry rather than a reassurance: no block moved, no category list was
   * rewritten, and the next `hud/status-strip` read reports exactly the day it
   * reported before the press.
   *
   * "Timetable" rather than "regime" or "schedule" because it is the word a
   * player can act on without knowing the simulation's vocabulary, and neither
   * sentence names a tick: the coordinate the command carries is a tick of the
   * day, which is not a number any surface shows.
   */
  'hud.alert.refusal.edit-regime-block.unknown-block': 'Nothing was changed — that part of the day is not a block on this timetable.',
  'hud.alert.refusal.edit-regime-block.unknown-group': 'Nothing was changed — this prison has no timetable for that group.',
  'hud.alert.refusal.release-guard.not-held': 'Nothing was released — that guard is already off duty.',
  'hud.alert.refusal.release-guard.unknown-guard': 'Nothing was released — that guard is not on the roster.',
  // `zone.out-of-bounds` and `zone.unowned-land` describe the same condition
  // as their `build.*` neighbours and get their own sentence, because the
  // player asked for a room rather than for a wall and a message that named
  // the wrong thing would send them to look at the wrong control.
  'hud.alert.refusal.zone.duplicate-instance-id': 'The room was not zoned — a room is already recorded on that tile.',
  'hud.alert.refusal.zone.invalid-area': 'The room was not zoned — that area is not a valid rectangle.',
  'hud.alert.refusal.zone.out-of-bounds': 'The room was not zoned — part of that area is outside the map.',
  'hud.alert.refusal.zone.overlaps-existing-room': 'The room was not zoned — it overlaps a room that is already there.',
  'hud.alert.refusal.zone.unknown-room-type': 'The room was not zoned — that is not a room type this prison knows.',
  'hud.alert.refusal.zone.unowned-land': 'The room was not zoned — you do not own all of that land.',
  // The authored minimum, refused for the first time. Every one of the 18 room
  // definitions carries a `minimum-size` requirement -- a cell is 2x3, a
  // canteen 6x6, a yard 8x8 -- and until the Rooms panel existed nothing read
  // one, so a 1x1 canteen was a legal room. The sentence names the rule rather
  // than the numbers, because the numbers are per room type and the panel
  // shows the selected room's own pair beside the drag.
  'hud.alert.refusal.zone.below-minimum-size': 'The room was not zoned — that area is smaller than this room type allows.',
  // The authored `enclosed` requirement, refused for the first time. This
  // sentence is not new text: it is `hud.rooms.enclosure-open-required`, which
  // was a Rooms-panel warning shown *after* an open room was accepted, moved
  // into the refusal namespace and reworded into this namespace's house style
  // now that `zone` refuses instead of warning. Its old key is deleted with the
  // branch that read it -- see the ADR "Must a zoned room be enclosed".
  //
  // It names the rule and not the gap. `ZoneRoomRefusal` carries the first
  // gap's tile and edge for diagnosis, but `RefusalLog` deliberately holds no
  // coordinates, so nothing on this channel could render them.
  'hud.alert.refusal.zone.not-enclosed': 'The room was not zoned — this room type must be enclosed, and the area you drew is open on at least one side.',
  // Removal's own namespace. `unzone.invalid-area` is the same *condition* as
  // `zone.invalid-area` and a different *sentence*: a player told "the room was
  // not zoned" after asking to remove one would go and look at the wrong
  // control.
  'hud.alert.refusal.unzone.invalid-area': 'Nothing was removed — that area is not a valid rectangle.',
  'hud.alert.refusal.unzone.nothing-to-remove': 'Nothing was removed — there is no room in that area.',
  'hud.alert.refusal.unzone.room-occupied': 'Nothing was removed — somebody is using that room.',

  // A protocol fault nobody else reads, in the alerts list (#187).
  //
  // Two producers on opposite sides of the boundary raise these: the worker
  // rejecting a message the interface sent, and the interface rejecting a
  // message the worker sent. Each sentence is written to be true of both --
  // it says which message was rejected and why, never which end rejected it
  // -- because the direction is not something a player can act on and the
  // severity of the row already carries the part that is. See
  // `PROTOCOL_FAULT_LABEL_KEYS` in `src/ui/simulation-alerts.ts`.
  //
  // Namespaced `hud.alert.fault.*` beside `hud.alert.refusal.*` and not under
  // it: a refusal is the prison declining to carry out an order it received,
  // a fault is the order never arriving intact, and the two are different
  // things to be told even when they follow the same button press.
  //
  // Every one of the twelve `ProtocolFaultCode` members has an entry, because
  // the table that reads them is exhaustive over the enum. Not all twelve can
  // reach this list today -- a fault that answers a request is reported by
  // the caller that made it and is deliberately not painted here -- and the
  // entries exist anyway rather than being trimmed to the reachable set: a
  // code that gains an uncorrelated emitter would otherwise ship as its own
  // raw dotted key, which is precisely the failure ADR 0011 and
  // `tests/foundation/localization-key-completeness.test.ts` exist to stop.
  'hud.alert.fault.invalid-message': 'A simulation message was rejected — it was not a message this game understands.',
  'hud.alert.fault.unsupported-protocol-version': 'A simulation message was rejected — it was written for a different version of the game.',
  'hud.alert.fault.unknown-message-kind': 'A simulation message was rejected — this build does not know that kind of message.',
  'hud.alert.fault.invalid-payload': 'A simulation message was rejected — its contents were not what that message must carry.',
  'hud.alert.fault.not-initialized': 'A simulation request was refused — no prison is loaded yet.',
  'hud.alert.fault.already-initialized': 'A simulation request was refused — this session already has a prison loaded.',
  'hud.alert.fault.duplicate-message': 'A command was refused — it had already been sent.',
  'hud.alert.fault.sequence-gap': 'A command was refused — a command sent before it never arrived.',
  'hud.alert.fault.invalid-state': 'A simulation request was refused — the simulation cannot do that right now.',
  'hud.alert.fault.snapshot-incompatible': 'The save could not be loaded — this build does not understand its format.',
  'hud.alert.fault.shutting-down': 'A simulation request was refused — the session is shutting down.',
  'hud.alert.fault.internal-error': 'The simulation hit an internal error.',

  // The events channel (issue #507). Namespaced `hud.alert.event.*` beside the
  // refusal and fault families for the same reason those two are namespaced:
  // all three are rendered by the alerts list and by a band, and the namespace
  // is what keeps "the prison did something" from being read as "the prison
  // refused something".
  //
  // Both sentences are written in the same voice as the refusals above -- what
  // happened first, then why or how much after an em dash -- and neither names
  // a control, because unlike a refusal neither is about anything the player
  // just pressed.
  //
  // `{count}` and `{total}` are substituted from `HudAlertViewModel.
  // labelParameters`, which these are the first producer of. `{total}` is a
  // number of minor units formatted by the localizer, exactly as the Build and
  // Staff panels format a price.
  'hud.alert.event.prisoners.discharged': '{count} released — their sentences are served.',
  'hud.alert.event.economy.wages-unpaid': 'Payday went unpaid — your staff are owed {total}.',
  // The owner's ruling of 2026-09-01 on issue #767 (ADR 0087 decision 2's
  // amendment): a one-off notice at the moment the treasury crosses a rung,
  // beside the standing `treasury.deliveries-refused` /
  // `treasury.construction-refused` conditions that keep saying so
  // afterward. **Owner-pending**: written to be the clearest sentence
  // available rather than a settled answer -- see `InsolvencyRungSystem`
  // (`src/simulation/economy/insolvency-rung-system.ts`) for the mechanism
  // and `docs/adr/0087-whether-a-refusal-is-an-event-or-a-condition.md`'s
  // amendment for the ruling this implements.
  'hud.alert.event.economy.deliveries-refused': 'Deliveries refused — the treasury cannot cover a purchase right now.',
  'hud.alert.event.economy.construction-refused': 'Construction halted — the treasury cannot fund the build queue right now.',

  /*
   * The recovery half of the two sentences directly above, which never had
   * one ([#966](https://github.com/matmaxalez/lockstate/issues/966) site 1) --
   * authored under `AGENTS.md` reservation 4's partial release of 2026-09-04:
   * the choice of words is ours, the requirement that the sentence be TRUE is
   * not.
   *
   * **What is verified before either word was chosen.**
   * `InsolvencyRungSystem`'s `else` arm (`src/simulation/economy/insolvency-rung-system.ts`)
   * fires `SimulationEventLog.recordInsolvencyRungCleared` on exactly the tick
   * `this.treasury.balanceMinorUnits` is measured back above
   * `rungFloorMinorUnits(rung, ...)` -- the same comparison the refused
   * sentence's own crossing reads, run in reverse. That is a fact about the
   * *floor*, not about any purchase: `Treasury.canAfford` refuses every
   * positive amount while `balance <= floor`, which is why "cannot cover a
   * purchase right now" is exactly true of the crossing, and clearing the
   * floor by one minor unit only affords a purchase of one minor unit. A
   * sentence claiming "you can afford it now" would say more than the crossing
   * knows -- exactly the shape of false promise reservation 4's release warns
   * against -- so both sentences below name only the floor, the same fact the
   * standing `treasury.deliveries-refused` / `treasury.construction-refused`
   * conditions keep answering in more precise terms afterward.
   *
   * **Kept under the twelve-word ceiling `EVENT_BAND_HOLD_CEILING_MS`
   * (`src/ui/hud/event-band-dwell.ts`) is derived against**, so this pair adds
   * no sentence longer than the ones that ceiling was sized to read: nine
   * words each, against `economy.construction-refused`'s twelve.
   */
  'hud.alert.event.economy.deliveries-restored': 'The treasury has climbed back above the deliveries floor.',
  'hud.alert.event.economy.construction-restored': 'The treasury has climbed back above the construction floor.',

  /*
   * What a control says when it *works* (issue #749, the owner's ruling of
   * 2026-09-01).
   *
   * These are the first sentences on this channel about something the
   * *player* did, and they exist because four controls said nothing at all when
   * they succeeded: `docs/research/2026-09-01-what-act-six-never-reached.md` D2
   * measured Cancel on a queued build order, Cancel on a delivery, Undo and
   * Redo, and found the only feedback was a row vanishing from a fold that
   * starts collapsed. The money was exactly right; the player had no way to
   * know that without doing the arithmetic.
   *
   * **The wordings are the owner's, taken from
   * `docs/research/2026-09-01-copy-variants-for-the-owner.md` §5.** CD1 for the
   * delivery, UR3 for the two history sentences. The build-order **pair** is
   * the one place that document tabled no verbatim candidate -- its §5c
   * offers a state-aware pair as *"a fourth option not tabled as a single
   * candidate, because it is a different shape of answer"* -- so the two below
   * are assembled from that section's own clauses rather than newly written:
   * CO2's *"the money it cost is refunded"* with its hedge *"where any is
   * still recoverable"* dropped, because the state check makes the hedge
   * unnecessary, and CO3's second sentence verbatim for the case the hedge was
   * hedging about. Nothing here is an improvement on a candidate; where a
   * candidate was false against the code it was reported rather than edited.
   *
   * **Two sentences for one control, which is ruling 2**: before the crew
   * started, the money comes back; after, ruling 20 of 2026-08-31 destroys the
   * materials on purpose. The owner's reasoning is *"silence about a loss is
   * the worst option"*, and it is why the second sentence exists at all rather
   * than the first being stretched to cover both.
   *
   * **Only the delivery names a figure, and that is deliberate.**
   * `ProcurementSystem.cancel` already answers `refundedMinorUnits`, so
   * `{total}` is nearly free; `ConstructionSystem.cancelOrder` answers `void`,
   * so the two order sentences cannot name an amount without plumbing the
   * ruling declines -- and `PlacedObjectRegistry.remove` answers `boolean`, so
   * #945's removal sentence at the end of this family cannot either.
   * `{total}` is minor units, unconverted, exactly as the
   * unpaid-payday sentence above -- and it is the same word the Build panel's
   * own delivery row already uses for the same money (`hud.build.delivery`,
   * "{total} back").
   *
   * **No history sentence names a count**, which is ruling 4: Undo and
   * Redo each reverse a whole transaction, so a sentence naming one order would
   * be a small lie whenever a run of several moved. "The last change" is what
   * UR3 says instead, and it is true of a run of one and of twelve. That
   * applies to #927's third history sentence below as well as to the two UR3
   * gave.
   *
   * **A cancelled order that had already finished got no sentence here until
   * [#927](https://github.com/matmaxalez/lockstate/issues/927), and the
   * paragraph that withheld it is kept below rather than deleted -- it is why
   * the defect survived.** It read:
   *
   * > A cancelled order that had already **finished** gets no sentence here.
   * > Neither of the two below is true of it -- the money did not come back and
   * > the materials are not gone, they went into the container (ADR 0076
   * > decision B) -- no control can reach that press, and inventing a third
   * > sentence for it would be exactly the promise-the-code-does-not-keep that
   * > `AGENTS.md`'s fourth exclusion reserves. Recorded as owed at
   * > `SimulationEventLog.recordBuildOrderCancelled`.
   *
   * Both of its premises were dead when it was found:
   *
   * - **The materials are gone.** The owner's ruling of 2026-09-01 -- *"Taking
   *   a finished object away returns nothing. Not its materials, not its
   *   money."*, ADR 0076's amendment of that date -- withdrew decision B, and
   *   `ConstructionSystem.cancelOrder` has followed it since: its
   *   `destroysSpendOnCancel` arm drops a `'completed'` order's allocation
   *   unreleased and unpaid.
   * - **A control reaches that press.** It is `Z`.
   *   `ConstructionSystem.undo()` cancels every order in the transaction
   *   *"including a `completed` one"*, in its own comment. What is true is the
   *   narrower claim about the queue *list*: `PENDING_BUILD_ORDER_STATES`
   *   excludes `'completed'`, so no Build-panel row names a finished order.
   *
   * So the second sentence below **is** true of a finished order -- the money
   * did not come back and the materials were destroyed, which is what *"anything
   * already spent past the point of no return stays spent"* says -- and
   * `recordBuildOrderCancelled` now records it for `'completed'` as well as for
   * `'in-progress'`. Under the owner's own reasoning, *"silence about a loss is
   * the worst option"*, the larger loss was the one getting no mention.
   *
   * **`undone-spend-destroyed` is the third sentence, and it is authored here
   * rather than reused, under the 2026-09-04 release of `AGENTS.md`'s
   * reservation 4** (*"the choice of words is ours; the requirement that a
   * sentence be TRUE is not"*). Two things make it a new string rather than the
   * one above raised on the Undo channel:
   *
   * - **The band shows one sentence.** `admitToEventBand`
   *   (`src/ui/hud/event-band-dwell.ts`) gives an arriving `'warning'` the line
   *   at once and *discards* the `'info'` it displaces, so raising both
   *   `construction.undone` and `order-cancelled-underway` on one tick would
   *   have painted only *"The order was cancelled…"*.
   * - **"The order" is the singular the no-count ruling warns about.** An undo
   *   reverses a whole transaction, so a drag of twelve walls is not *"the
   *   order"*. *"The last change to the build queue"* is the phrase ruling 4
   *   chose for exactly that reason, and this sentence keeps it.
   *
   * It is assembled from two clauses already approved rather than newly
   * written, the way the pair above was assembled from the candidates in
   * `docs/research/2026-09-01-copy-variants-for-the-owner.md` §5c: UR3's *"The
   * last change to the build queue was undone"* joined by this family's em dash
   * to CO3's *"anything already spent past the point of no return stays
   * spent"*. **Verified true, not merely plausible**: the first clause is
   * recorded only when `ConstructionSystem.undo()` answers `reversed: true`
   * (`createConstructionCommandHandler`, the `Undo` branch), and the second only
   * when that same answer carries `spendDestroyed`, which `undo()` sets from
   * `destroysSpendOnCancel` over each order's state *before* `cancelOrder` runs
   * -- the two states for which `cancelOrder` neither releases the allocation
   * nor calls `refundSurplusOf`. The clause's hedge is what makes it true of a
   * mixed transaction: what was *not* past that point still comes back.
   *
   * **It names no count and no figure**, which is both rulings kept:
   * `ConstructionUndoSpendOutcome` is one bit, and `cancelOrder` still answers
   * `void` so no amount is reachable here either.
   */
  'hud.alert.event.construction.order-cancelled': 'The order was cancelled — the money it cost is refunded.',
  'hud.alert.event.construction.order-cancelled-underway':
    'The order was cancelled. Anything already spent past the point of no return stays spent.',
  /*
   * **Authored here on 2026-09-09, and quoted verbatim in the commit message
   * and the pull request body beside the code that proves it true**, which is
   * what `AGENTS.md`'s fourth reservation requires of a string this side of the
   * 2026-09-04 release: the choice of words is ours, the requirement that the
   * sentence be TRUE is not waived.
   *
   * What makes each clause true, at the code that decides it:
   *
   * - *"Nothing was undone"* -- `ConstructionSystem.undo()` returns
   *   `{ reversed: false, refusedBecause: 'a-newer-action-came-after-it' }`
   *   before it flushes the open gesture or pops anything, so the history is
   *   left exactly as the press found it.
   * - *"Undo takes back a change to the build queue"* -- the stack holds
   *   nothing else. `registerTransactionOrder` has two producers in all of
   *   `src/`, a `PlaceBuildOrder` and a `PlaceObject`.
   * - *"and something else has happened since the last one"* -- the flag this
   *   sentence reports is set by `noteActionThatDoesNotWriteTheUndoStack`,
   *   called for every accepted command outside those two and the two history
   *   controls, and by `restore()`. It is cleared by a stack write and by a
   *   successful redo. So it is set if and only if that clause is true.
   *
   * The sentence deliberately does not say *which* thing happened, and not
   * because it could not: naming it would be a fact about a command this
   * channel does not otherwise carry, and the no-count ruling on #749 is about
   * exactly this kind of helpful addition to a sentence whose job is to say
   * that a press did nothing and why.
   */
  'hud.alert.event.construction.undo-refused-newer-action':
    'Nothing was undone — Undo takes back a change to the build queue, and something else has happened since the last one.',
  'hud.alert.event.construction.undone': 'The last change to the build queue was undone.',
  'hud.alert.event.construction.undone-spend-destroyed':
    'The last change to the build queue was undone — anything already spent past the point of no return stays spent.',
  'hud.alert.event.construction.redone': 'The last change to the build queue was redone.',
  'hud.alert.event.economy.delivery-cancelled': 'The delivery was cancelled — {total} back.',

  /*
   * **A standing object taken away, and the money it cost gone with it**
   * ([#945](https://github.com/matmaxalez/lockstate/issues/945)).
   *
   * The seventh sentence in this family and the first that is not about a build
   * *order*. It exists because #945 measured `RemoveObject` on a finished bed
   * destroying its 65 (`25,000 -> 24,935` on placement, `24,935 -> 24,935` on
   * removal) with the sentence band **`hidden`** -- an absence rather than a
   * collision -- and because #932, which made `Undo` and `CancelBuildOrder`
   * state-aware about exactly this loss, does not reach this press:
   * `ObjectPlacementService.remove`'s standing-object arm goes to
   * `PlacedObjectRegistry.remove` and never to `ConstructionSystem.cancelOrder`.
   *
   * **Authored here rather than reused, under the owner's release of
   * `AGENTS.md` reservation 4 on 2026-09-04** (*"the choice of words is ours;
   * the requirement that a sentence be TRUE is not"*). The near-miss it was
   * nearly built as is `hud.alert.event.construction.order-cancelled-underway`
   * above -- *"The order was cancelled. Anything already spent past the point of
   * no return stays spent."* -- and the reason it is a near-miss is the first
   * clause and not the second: **a standing bed is not an order any more.** No
   * order changed state at this press, `cancelOrder` was not called, and the
   * order that built the bed stays `'completed'` (asserted in
   * `tests/integration/object-removal-loop.test.ts`, *"refuses a second press on
   * a tile whose object has already gone"*). Saying *"the order was cancelled"*
   * would name a thing the player did not do -- the same singular-subject
   * objection #927's weakest claim raised against reuse on the Undo channel.
   *
   * **Verified true, not merely plausible.** Both halves were opened:
   *
   * - *"The object was removed"* -- `createSessionCommandHandler`'s
   *   `RemoveObject` branch records this only for
   *   `RemoveObjectOutcome.kind === 'removed'`, the arm that has already dropped
   *   the row from `PlacedObjectRegistry`. The `'order-cancelled'` arm, which
   *   refunds, does not raise this key.
   *
   *   **That clause read *"records nothing here"* until
   *   [#988](https://github.com/matmaxalez/lockstate/issues/988), and the
   *   correction is to the word rather than to the proof.** It was written
   *   about *this* key and is still true of it, but the arm it describes
   *   recorded nothing **anywhere**, and on a band that holds one sentence a
   *   press that says nothing keeps the last press's -- so this sentence,
   *   true of its own press, stood over a refund and claimed its money was
   *   destroyed. That arm now raises `construction.order-cancelled` above,
   *   which leaves the proof of *this* sentence exactly as it was and takes
   *   the false reading of it away.
   * - *"the money it cost does not come back"* -- that arm removes the registry
   *   row, re-derives the room's capacity and relocates whoever lost a place. It
   *   holds no treasury and no container reference and writes to neither, which
   *   is the owner's ruling of 2026-09-01: *"Taking a finished object away
   *   returns nothing. Not its materials, not its money."* (ADR 0076's amendment
   *   of that date). `tests/integration/economy-bed-recycling.test.ts` measures
   *   it from the other side -- the next bed is bought at 65 like anybody
   *   else's, and recycling is now strictly worse than playing it straight.
   *
   *   It is *"the money"* and not *"the materials"* because money is what the
   *   player watches move: the object was built out of materials some deliveries
   *   ago, and what the FUNDS badge showed leaving was 65. Neither comes back,
   *   so the sentence is true of both readings and legible in only one.
   *
   * **It names no figure**, which is the ruling of 2026-09-01 kept on a third
   * route. `PlacedObjectRegistry.remove` answers `boolean` and `PlacedObject`
   * carries no price, so the amount is not reachable at the call site any more
   * than it is through `cancelOrder`; a sentence saying *that* the money is gone
   * without saying how much is within what exists. **And no count**, vacuously
   * rather than by suppression: a removal is one press on one tile taking one
   * object, so unlike Undo there is no transaction size to leak.
   *
   * **Why not the em dash plus *"stays spent"* the two loss sentences above
   * use.** Those two are about a *cancellation*, where the hedge -- *"anything
   * already spent past the point of no return"* -- is load-bearing, because some
   * of what a mixed transaction spent does come back. Nothing about a standing
   * object is hedged: all of it is past that point and none of it returns, so
   * the plain inverse of `order-cancelled`'s *"the money it cost is refunded"*
   * says more with less. The two read as a pair on purpose.
   *
   * It also matches the vocabulary the Build panel already uses for this exact
   * press: `hud.build.remove-hint` says *"nothing comes back once the crew has
   * started it. A finished one is not refunded."*, and *"the object"* is what
   * every `hud.alert.refusal.place-object.*` and
   * `hud.alert.refusal.remove-object.*` sentence calls the thing.
   */
  'hud.alert.event.objects.removed-spend-destroyed': 'The object was removed — the money it cost does not come back.',

  // ADR 0076 decision A(i)'s notice: a prisoner whose bed was taken away has
  // been moved to one that exists.
  //
  // **This sentence is the owner's, approved on 2026-08-30, and is reproduced
  // exactly.** ADR 0076's Status reserved it -- *"a prisoner who changes cell
  // unasked is something the player should be told, flagged rather than
  // decided"*, and *"whoever implements relocation must put the question
  // rather than invent the string"* -- so the question was put and this is the
  // answer that came back. It is deliberately *not* edited into the em-dash
  // voice the two above share.
  //
  // Both placeholders are filled by `HudMessageParameterViewModel`s rather
  // than by plain `labelParameters`, because both are text only a localizer
  // can produce: `{room}` is the room catalog's own `nameKey`, and `{name}` is
  // two halves of state assembled through `hud.regime.roster-name`, whose
  // order is a locale decision. See `eventParameterMessages` in
  // `src/ui/simulation-events.ts`.
  //
  // There is no sentence for the other half of decision A(i) -- a resident the
  // prison had nowhere to move -- and there must not be one until the owner
  // writes it.
  'hud.alert.event.prisoners.relocated': '{name} had nowhere to sleep and moved to {room}.',

  /*
   * The housing mirror of the sentence directly above -- an arrival who had
   * nowhere to sleep gets a place for the first time, rather than an
   * already-housed resident losing one ([#966](https://github.com/matmaxalez/lockstate/issues/966)
   * site 3). Authored under `AGENTS.md` reservation 4's partial release of
   * 2026-09-04: the choice of words is ours, the requirement that the sentence
   * be TRUE is not.
   *
   * **What is verified before either clause was chosen.** `IntakeSystem`'s
   * `'accommodation-assignment'` stage (`src/simulation/prisoners/intake-system.ts`)
   * reaches `createIntakeHousedNotice`'s adapter
   * (`src/simulation/events/intake-housed-notice.ts`) only on the tick
   * `RoomInstanceRegistry.assign` succeeds, which cannot happen unless a unit
   * of `residentCapacity` matching the target's `requiredObjectCapability`
   * genuinely exists in that instance right now. "Has a place" is exactly
   * that fact and no more: not that the room satisfies the catalog's full
   * requirement list ([#933](https://github.com/matmaxalez/lockstate/issues/933)
   * is the record of that exact conflation), not that it is reachable, not
   * that it is permanent.
   *
   * **AND NOT "FINALLY", WHICH THIS SENTENCE CARRIED UNTIL THE INTEGRATOR
   * CHECKED IT AGAINST THE CALL SITE.** It read *"{name} finally has a place
   * in {room}."* The paragraph above verifies "has a place" with care and
   * says nothing at all about "finally" -- and "finally" is a claim about a
   * wait. The notice fires on **every** assignment the accommodation stage
   * makes, including the first attempt, where `accommodationBacklogTicks` was
   * never incremented and the arrival waited nothing at all. There is no
   * per-entity wait signal to gate it on: that counter is aggregate. So the
   * word claimed something the computation does not know, which is exactly
   * what the fourth reservation's released half does not cover -- the choice
   * of words is ours, the requirement that the sentence be true is not.
   *
   * Kept as a correction rather than a silent edit because the shape is the
   * one this repository keeps paying for: the verification was real and
   * careful, and it was performed on the words the author was thinking about
   * rather than on every word they wrote.
   *
   * **Not `prisoners.relocated`'s own "had nowhere to sleep and moved to",
   * even though that is exactly this prisoner's situation too.** Both
   * placeholders can each expand to two words, and the twelve-word ceiling
   * below leaves less room for literal text once two placeholders share it,
   * so this key spends five literal words rather than that sentence's eight.
   *
   * **Kept under the twelve-word ceiling `EVENT_BAND_HOLD_CEILING_MS`
   * (`src/ui/hud/event-band-dwell.ts`) is derived against**, at its fullest
   * expansion: a two-word given-and-family name, four literal words and a
   * two-word room type total eight, four under the ceiling's own twelve-word
   * reference -- this read "five literal words" and "total nine" while
   * "finally" was in the sentence, and both were right then (measured against `economy.construction-refused`, that
   * reference's own docblock).
   */
  'hud.alert.event.prisoners.housed': '{name} has a place in {room}.',

  /*
   * The first thing this game says when a player gets something right (issue
   * #966 site 2, from the acknowledgement census that issue and #960 carry:
   * twenty event types, nineteen reachable, nine bad news, six undos, two
   * recoveries, and no acknowledgement of anything anybody did).
   *
   * **Authored here rather than asked for, under `AGENTS.md` reservation 4's
   * partial release of 2026-09-04** -- *"the CHOICE OF WORDS is ours now; the
   * requirement that a sentence be TRUE is not"* -- so what follows is the
   * proof of each clause against the code that renders it, which is what that
   * release asks for in exchange.
   *
   * **`{room}`.** The room *type* that was designated, resolved from the room
   * catalog's own `nameKey` -- `ZoneRoomAccepted.roomNameKey`, read in
   * `RoomZoningService.zone` from the very definition that decided the
   * request, and the same field `prisoners.relocated`'s `{room}` above
   * resolves. It renders as "Cell", "Yard", "Canteen": the eighteen
   * `room.*.name` entries at the top of this file. The instance the world
   * registered carries `roomCatalogId: definition.id`, so the word and the
   * type cannot disagree.
   *
   * **"designated".** The verb of the control the player pressed --
   * `hud.rooms.confirm` is *"Designate {width} × {height}"* -- and the word
   * this panel already uses for a room that exists but is not yet ready (see
   * `hud.rooms.needs`: *"a room the player already designated"*). It is true
   * at the moment this event is recorded: `zone` reaches its accepted outcome
   * only after `SparseWorld.setZoning` has painted every tile of the rectangle
   * with the definition's `numericId` and `RoomInstanceRegistry.register` has
   * taken the instance, and the command handler records the event on that
   * outcome.
   *
   * **And the full stop, which is the load-bearing part.** Two things the
   * accepted outcome *knows* and this sentence must not say, both of them paid
   * for already:
   *
   * - **Not that anybody can get in.** `ZoneRoomAccepted.enclosure` may read
   *   `'sealed'` for a room with no doorway at all, which is
   *   [#938](https://github.com/matmaxalez/lockstate/issues/938): the Rooms
   *   panel's *"Walled in on every side"* renders identically for a reachable
   *   room and a sealed box, and a prisoner in a doorless shower room measured
   *   hygiene 0 of 255 with 162 route failures. So no clause here implies the
   *   room will be *used*.
   * - **Not that it works.** A registered instance has `residentCapacity: 0`
   *   until an object stands in it, and every room type but `room.yard`
   *   authors an `object` requirement -- which is why the needs readout
   *   (`hud.rooms.needs-room`) exists at all. So no clause here promises
   *   *function*, and none names what is still missing either: that is one
   *   readout's job and it is already done.
   *
   * What is left is the narrow claim, which is also the one the player
   * currently gets no word about: this designation was accepted and the world
   * now holds this room.
   */
  'hud.alert.event.rooms.zoned': '{room} designated.',

  /*
   * **Authored under `AGENTS.md` reservation 4's partial release of
   * 2026-09-04** -- the choice of words is ours, the requirement that the
   * sentence be TRUE is not -- and this one exists to fix a *silence*, which
   * is #1006 finding 3's own framing of the defect: the Rooms panel's
   * `NOT READY` block simply disappears when a room stops being short of
   * something, nothing replaces it, and the bands either side of the repair
   * are byte-identical. `src/ui/hud/messages.ts` (`hud.rooms.needs`'s own
   * docblock) argues at length why the panel itself must not grow an
   * "every room is ready" line -- a 7.9px height budget (ADR 0022) -- and
   * #1006 accepts that argument for the *panel* and says it is not an
   * argument against a *one-off alert* in the column that already carries
   * `hud.alert.event.rooms.zoned` above.
   *
   * **What "short of something" means, established before a word was chosen,
   * per `AGENTS.md`'s "verify, then write".** `roomNeedsFromProjections`
   * (`src/ui/simulation-room-needs.ts`) computes `shortfallOf(row)` as
   * `row.requirementSummary.missingCapability + (row.access === 'no-way-in'
   * ? 1 : 0)` -- every `object` requirement the room's own definition asks
   * for and does not yet hold enough of, counted against its authored
   * `minQuantity`, plus one more if the room's perimeter holds no doorway at
   * all. `RoomNeedsClearedNoticeSystem`
   * (`src/simulation/rooms/room-needs-cleared-notice.ts`) fires this event
   * the tick that same sum, computed the same way from the same two fields,
   * is measured going from above zero to exactly zero for one room instance.
   * So the sentence below is true of *exactly* the rooms the panel's own
   * `NOT READY` block would have stopped counting, no wider and no
   * narrower -- neither module recomputes the other's arithmetic; the
   * system restates it because a tick system may not import a HUD module to
   * borrow the reducer (`AGENTS.md` boundary 3).
   *
   * **Why this is not the false promise #1006 is about, and this is the
   * clause that had to survive contact with the code before anything else
   * was written.** `row.access` reads `'doorway'` for a door found in the
   * room's perimeter, whether or not that door leads anywhere --
   * `roomPerimeterAccess` (`src/simulation/rooms/enclosure.ts:288`) "returns
   * `'doorway'` on the first door found in the perimeter and never asks
   * whether anything can reach that door", which is the issue's own
   * comment's exact finding, and #938 already measured a doorless-from-
   * outside cell reading complete at hygiene 0 of 255 with 162 route
   * failures. So `shortfallOf(row) === 0` asserts that the panel's own
   * checklist is clear; it does not assert, and this sentence must not
   * claim, that a prisoner can reach the room. Whether `roomPerimeterAccess`
   * ought to answer about reachability instead of edge adjacency is the
   * issue's own reserved decision ("Decyzja właściciela, na ADR ... Nie
   * rozstrzygać tego w kodzie implementacji.") and nothing here decides it
   * or works around it.
   *
   * **The sentence, clause by clause:**
   *
   * - **"{room}"** -- the same catalog `nameKey` `hud.alert.event.rooms.zoned`
   *   above resolves, read by `RoomNeedsClearedNoticeSystem` off the same
   *   projection row the crossing was measured on, the tick it was measured,
   *   rather than cached from the room's own zoning moment.
   * - **"is no longer short anything the Rooms panel checks for"** -- states
   *   the transition (`shortfallOf` crossed from positive to zero) in the
   *   panel's own words for the underlying concept: `hud.rooms.needs` is
   *   *"Not ready"* and `hud.rooms.needs-room` is *"{room} at {x}, {y} is
   *   missing"*; "short" and "checks for" name the same fact those two
   *   already name, without repeating either string verbatim into a new
   *   context where a translator would have to keep three in sync.
   * - **"— that is not a claim anyone can get in."** -- the explicit
   *   disclaimer the paragraph above establishes is necessary, in
   *   `hud.rooms.needs-doorway`'s own words turned around: that line reads
   *   *"a door — nobody can get in"* for the state this event's own trigger
   *   cannot distinguish from a working doorway. Removing this clause would
   *   make the sentence exactly the false promise the issue is about; it
   *   stays no matter how the first clause is ever reworded.
   *
   * **No coordinates, no count, for `hud.alert.event.rooms.zoned`'s own two
   * reasons.** A player who fixed a room already knows which one, and
   * carrying the rectangle would give every repair its own row where the
   * room type alone lets a run of same-type repairs collapse into one
   * counted row (`simulationEventIdentity`). One event per instance, exactly
   * as `hud.alert.event.prisoners.relocated` is one per resident rather than
   * a batch total.
   */
  'hud.alert.event.rooms.needs-cleared':
    '{room} is no longer short anything the Rooms panel checks for — that is not a claim anyone can get in.',

  /*
   * **Authored under the same release, the mirror of the two entries above
   * on the command that undoes a designation** ([#1006](https://github.com/matmaxalez/lockstate/issues/1006)
   * finding 5). Before this key existed, a room zoned and immediately
   * removed left `hud.alert.event.rooms.zoned`'s *"{room} designated."*
   * standing in this same column with the status strip already reading
   * `0 ROOMS` -- a lifecycle event for the room's start and none for its
   * end, which reads as a stale record rather than as history.
   *
   * **"{room} removed."** Deliberately the same shape as *"{room}
   * designated."* two entries above -- same tense, same terseness, no
   * second clause -- because the fact it reports is exactly as narrow: a
   * `RoomZoningService.unzone` outcome whose `kind` is `'unzoned'` has
   * already cleared every tile of this instance's rectangle on the zoning
   * plane (`SparseWorld.setZoning(tile, 0)`) and unregistered the instance
   * (`RoomInstanceRegistry.unregister`), so "removed" is true of the world
   * at the moment this fires and asserts nothing beyond it. "Remove" is
   * also this control's own established verb -- `hud.rooms.remove`,
   * `hud.rooms.remove-hint`, `hud.rooms.confirm-remove` all use it -- so
   * this reuses the word the player already pressed rather than choosing a
   * synonym.
   *
   * **`{room}`** resolves the same catalog `nameKey` the two entries above
   * do, one per `UnzoneRoomAccepted.removedRoomNameKeys` entry -- read by
   * `RoomZoningService.unzone` from the definition it looked up to find each
   * removed instance, before that instance was unregistered, because
   * nothing can be re-derived from a registry entry that no longer exists.
   *
   * **No coordinates, no count, for the same two reasons the entry above
   * gives.** A player who dragged the removal already knows where it was,
   * and one event per removed instance (not per command) is the same grain
   * `hud.alert.event.prisoners.relocated` uses for the same reason: a drag
   * that clears several rooms removed several distinct facts.
   */
  'hud.alert.event.rooms.unzoned': '{room} removed.',

  // The incident sentences (issue #555). Same family, same voice, written
  // against two constraints the two above did not have.
  //
  // **They must not repeat the status strip.** Issue #506 finding 2 already
  // put the open incident's *kind* on the strip's badge -- "Riot", "Assault",
  // "Escape Attempt", "Gang Retaliation", the `incident-type.*.name` labels
  // reused as-is -- so a sentence here whose whole content was the kind would
  // be the same word twice on one screen. Each of these says what a badge
  // cannot: that it started *just now*, and what it means for the prison.
  //
  // **They must not promise a response.** Whether guards reach an incident
  // depends on how many are free, whether a route exists, and whether the
  // deadline passes first -- `IncidentResponseSystem` can and does let one
  // lapse -- so "guards are on their way" would be exactly the promise the
  // code does not keep that `AGENTS.md` reserves to the owner. None of these
  // says what happens next.
  //
  // `{count}` is a riot's participant count and the only figure in the five,
  // because it is the only one always at least two
  // (`DEFAULT_MINIMUM_RIOT_PARTICIPANTS`) -- this localizer has no plural
  // rules, so a figure that can be 1 would read "1 prisoners".
  'hud.alert.event.incidents.riot-opened': 'A riot has broken out — {count} prisoners have stopped taking orders.',
  'hud.alert.event.incidents.assault-opened': 'A fight has broken out between two prisoners.',
  'hud.alert.event.incidents.escape-attempt-opened': 'A prisoner is trying to break out.',
  'hud.alert.event.incidents.gang-retaliation-opened': 'Two gangs are settling a score.',
  'hud.alert.event.incidents.all-clear': 'The prison is under control again — no incident is still open.',
  /*
   * The same return to calm when the last thing to close **expired** rather
   * than being handled -- issue #914's finding 4, and the row the sentence
   * above was saying for both endings.
   *
   * **Measured, and it is why this key exists.**
   * `docs/research/2026-09-04-does-anyone-answer-an-incident.md` played one
   * prison shape twice. With six guards, **15 incidents out of 15** ended
   * `'resolved'` with **zero injuries**. With none, **19 out of 19** ended
   * `'lapsed'` with **114 prisoner-injuries and three escapes**. Both alert
   * columns held the same rows, in the same order, saying *"The prison is
   * under control again -- no incident is still open."* -- byte for byte,
   * with the same `0 INCIDENTS Clear` chip beside them. The sentence is true
   * about the incident *list* and it told the second prison it was fine.
   *
   * **Every clause is a property of the transition rather than a judgement.**
   *  - *"No incident is still open"*: `reportAllClearIfCalm` emits only when
   *    `IncidentLog.openIncidentCount` is zero, which is the same guard the
   *    sentence above rides (`src/simulation/incidents/response-system.ts`).
   *  - *"the last one"*: at most one row is emitted per return to calm, and it
   *    is the terminal transition that emptied the log -- so two incidents
   *    closing together produce one sentence, about that one.
   *  - *"ran out of time instead of being contained"*: `lapse` is reached from
   *    `tryDispatch` and from `advanceResponse` only through
   *    `isPastDeadline`, i.e. `tick - startedAtTick > responseDeadlineTicks`.
   *    It deliberately does **not** say nobody was sent: a `'notified'`
   *    incident whose responders were still walking lapses too, which the
   *    research reached in one press of Release, so *"no guard answered"*
   *    would be false in a state a player can cause.
   *  - *"everyone caught in it was hurt"*: `lapse` writes
   *    `injuredEntityIds: [...incident.participantIds]` with no condition and
   *    no roll, while the containment branch writes `[]`. Quantified over the
   *    participants rather than counted because this localizer has no plural
   *    rules -- the note at `hud.alert.event.incidents.riot-opened` above
   *    states the rule -- and a lapsed escape attempt injures exactly one.
   *
   * **What it still does not say, and why that is not this key's to fix.** How
   * many were hurt, who, and what was damaged: `IncidentOutcome` carries all
   * three and the `hud/incidents` projection already renders them, but nothing
   * under `src/ui/` requests that projection
   * (`tests/foundation/projection-reachability-contract.test.ts` names it in
   * `UNPAINTED_PROJECTION_IDS`), so there is no surface for a per-incident
   * accounting to appear on. That is finding 2 of the same record and it is a
   * panel rather than a sentence.
   *
   * Authored by an agent under the owner's release of 2026-09-04
   * (*"Wybierz sam a potem się ujednolici sposób pisania"*): the voice is open
   * to their unifying pass, and each clause above is pinned to the code that
   * makes it true.
   */
  'hud.alert.event.incidents.all-clear-after-lapse':
    'No incident is still open — but the last one ran out of time instead of being contained, and everyone caught in it was hurt.',

  // The one sentence in this family about an incident *ending*, and the one
  // the five above made necessary: a successful escape and a contained attempt
  // produced the same two rows, so the failure the whole security half of the
  // game exists to prevent reached the player as nothing
  // ([#683](https://github.com/matmaxalez/lockstate/issues/683)).
  //
  // **This sentence is the owner's, ruled on 2026-08-30, and is reproduced
  // exactly.** It was chosen over two alternatives for a stated reason -- it
  // names the escapee *and* it teaches the cause, where one alternative named
  // without teaching and the other did neither -- so neither half of it is
  // decoration to be trimmed.
  //
  // **The causal clause is true by mechanism, and that is what licenses it.**
  // `IncidentResponseSystem.lapse` is the only route to `escaped: true`, and
  // lapsing is what an incident does when it times out without sufficient
  // responders; the resolved branch writes `false`. The rule this sentence
  // therefore depends on is written where a change would meet it, at that
  // write site, and not only here -- see the comment on `escaped` in
  // `src/simulation/incidents/response-system.ts`. It is also the reason this
  // one may promise what the opening sentences may not: they must not say
  // guards are coming, because the code cannot keep that; this says only that
  // none arrived, which is the condition that produced the event.
  //
  // `{name}` is filled by a `HudMessageParameterViewModel` rather than by
  // plain `labelParameters`, on exactly the reasoning the relocation notice
  // above gives: two halves of state assembled through
  // `hud.regime.roster-name`, whose order is a locale decision made once. No
  // second key is authored for it.
  //
  // **`them` is deliberate.** `src/simulation/identity/name-pool.ts` records
  // that there is no gender model anywhere in the simulation, so a gendered
  // pronoun would be a guess about a person the prison never assigned one. A
  // future translator should read the singular `they` as "this person, gender
  // unmodelled" rather than as a style choice.
  'hud.alert.event.incidents.escape-succeeded': '{name} broke out — no guard reached them in time.',

  // What a search found, named (the owner's **ruling 13** on issue #703,
  // 2026-08-31). Until this key the alerts list said nothing at all about a
  // search: `SIMULATION_EVENT_TYPES` carried no contraband member at all, so a
  // sweep that turned up a phone posted nothing to the log the player reads,
  // and the only sign of it was the status chip's figure moving by one.
  //
  // **This sentence is the owner's, ruled on 2026-08-31, and is reproduced
  // exactly** -- including the colon, which none of the ten sentences above
  // uses. The others are written in an em-dash voice ("what happened — why or
  // how much"); this one is a label and its subject, and it is deliberately not
  // edited into that voice, for the same reason ADR 0076's relocation notice
  // above is not.
  //
  // **`{item}` is the whole of the ruling's point.** #707 authored the five
  // `contraband.*.name` labels a reader on the status chip's badge, and that
  // chip can only name a category while *every* confiscation is the same one
  // (`soleDiscoveredContrabandNameKey`), so a prison that has found a phone and
  // a knife renders the bare figure `2`. This row is per discovery, so each is
  // named. The placeholder is filled by a `HudMessageParameterViewModel` rather
  // than by plain `labelParameters`, exactly as `{room}` is above: the word
  // lives in the catalog under a `nameKey` and only a localizer can produce it.
  //
  // **The same severity for every category, `'warning'`, and that is the second
  // half of the ruling rather than an oversight**: a weapon sits in the same
  // band as a phone. The argument is in `EVENT_PRESENTATION`
  // (`src/ui/simulation-events.ts`); what matters here is that no second
  // sentence is authored for a weapon and none may be added without the owner.
  //
  // **It promises nothing about what happens next**, which is the constraint
  // the five incident sentences above state. The item is already confiscated
  // when this is recorded -- `SearchSystem` writes the ledger first -- so the
  // sentence is about a completed fact and says nothing about punishment, which
  // no system in this repository administers.
  'hud.alert.event.contraband.discovered': 'Contraband found: {item}.',

  // A browser that cannot start a Worker gets a page with no simulation
  // behind it. Saying so is the whole point: the failure was previously
  // reported to the console only, so the player saw an empty world and had
  // no way to learn why (issue #82).
  //
  // Namespaced `hud.unavailable.*` rather than `hud.alerts.*`, because it is
  // not rendered in the alerts list: it goes to the HUD's own always-laid-out
  // band, `.hud__unavailable` (issue #220). In the alerts list it was in the
  // DOM and painted at no viewport, because that section starts folded.
  //
  // That section starts OPEN as of 2026-08-31 (#703, rulings 1 and 5), and the
  // corner holding it is no longer hidden below 720px -- so the past tense
  // above is now the only correct tense, and this key keeps its namespace
  // anyway.
  //
  // **THE CORNER CLAUSE IS FALSE and is corrected here rather than deleted
  // (#1117).** `.hud__corner { display: none; }` sits inside
  // `@media (max-width: 720px)` in `hud.css`, measured `display: none` at
  // 375x812. So on a phone the alerts list is NOT on screen, the fold is not
  // the only thing that would have hidden a row there, and the past tense
  // above is half right rather than wholly. The key keeps its namespace for
  // the reason the next sentence gives, which never depended on either. The band exists because a browser that cannot start a worker has
  // no simulation to log events from at all, which is a stronger reason than
  // the fold ever was: an empty list, open or shut, says nothing.
  'hud.unavailable.simulation': 'Simulation unavailable — this browser could not start it, so nothing can run or be saved',

  'hud.panel.collapse': 'Collapse',
  'hud.panel.expand': 'Expand',

  'hud.build.title': 'Build',
  'hud.build.catalogue': 'What to build',
  'hud.build.catalogue-empty': 'Nothing is available to build',
  'hud.build.selected': 'Selected',
  /**
   * The catalogue row's own price (issue #901), authored under `AGENTS.md`'s
   * fourth reservation as partly released on 2026-09-04: the wording is ours,
   * the truth of it is not, and this comment is the verification the release
   * asks for -- opened beside the code it quotes rather than left to the
   * commit message alone.
   *
   * `'{buildable} · {total}'` copies the shape `hud.security.hire` shipped
   * for the Security tab, `'Hire {role} · {total}'` -- a price folded into a
   * row's own label -- minus the verb: this row's press *selects* it, the
   * spend happens at a placement press (issue #640), so there is nothing to
   * put in front of the name.
   *
   * **What makes the number true, read off the code rather than assumed.**
   * `purchasableMaterialFor` (`src/main.ts:751`) puts
   * `unitPriceMinorUnits * quantityPerPlacement` within reach as
   * `HudBuildMaterialViewModel`'s two fields; `build-panel.ts`'s row-mount
   * loop multiplies them once, at the same place `paintBuyTotal` multiplies
   * `unitPriceMinorUnits * quantity` for the buy button
   * (`hud.build.buy-submit`, below) -- one formula, read twice. Two rows
   * checked against `src/content/procurement-catalog.ts:100-101` (`item.brick`
   * 40, `item.wood-plank` 65) and `src/simulation/construction/definition.ts`:
   * `wall-brick` (`:89`, 2 brick) renders "Brick wall · 80"; `bed-wooden`
   * (`:180`, 1 plank) renders "Bed · 65". All 21 rows carry exactly one
   * `materialsRequired` entry and both items it can name are in
   * `PROCURABLE_MATERIALS`, so every row gets a price -- `total` is only ever
   * `undefined`, and this key only ever skipped, for a future buildable made
   * of something #29 has not priced yet.
   *
   * This key is for the **nineteen** rows whose press places one discrete
   * object (`buildable.placesObject === true`): `ObjectTool.place`
   * (`src/ui/object-tool.ts:198`) is one press, one tile, one command, so the
   * quoted total is what that one press spends, full stop, every time.
   */
  'hud.build.catalogue-row-price': '{buildable} · {total}',
  /**
   * The per-segment twin of the key above, for the **two** rows a flat price
   * would misstate: `wall-brick` and `door-wooden`, the only two rows
   * answering `false` to `placesObject`. Both occupy a tile edge and both
   * reach `BuildTool.place` (`src/ui/build-tool.ts:235`) through the
   * `place-build-order` route `hud.ts` sends for `placesObject === false`
   * (searched: `dispatchCommand({ kind: 'place-build-order', ...order })`,
   * fed by `BuildTool.attachOrders`, which takes "the whole run" as one call)
   * -- so a drag across several tile edges places several segments in one
   * gesture, and `ProcurementSystem`/the treasury charge once per segment.
   *
   * `wall-brick` costs 80 a segment (`unitPriceMinorUnits: 40` ×
   * `quantity: 2`, `definition.ts:89`): a drag of seven is 560, not 80, and
   * `'{buildable} · {total}'` alone would have promised the smaller number for
   * the larger charge -- exactly the false promise reservation 4 exists to
   * stop. Naming the unit is the whole fix: `'{buildable} · {total} per
   * segment'` stays true of a one-tap door (`door-wooden`, 65) and of a
   * sixty-segment wall alike, because it never claims to be the total, only
   * the rate.
   */
  'hud.build.catalogue-row-price-segment': '{buildable} · {total} per segment',
  'hud.build.placement': 'Where',
  'hud.build.tile-x': 'Tile X',
  'hud.build.tile-y': 'Tile Y',
  'hud.build.step-down': 'Decrease {field}',
  'hud.build.step-up': 'Increase {field}',
  'hud.build.edge': 'Edge',
  'hud.build.submit': 'Place order',
  'hud.build.note': 'An order is queued now and built while the clock runs.',
  'hud.build.arm': 'Place on map',
  /*
   * The removal mode (ADR 0028 phase 3). One word on the button, because
   * `.hud-build__actions` already holds two and ADR 0022 measured a third
   * overflowing that row by 37.9px with a longer label.
   *
   * The hint names both populations a press can take away -- a standing object
   * and one still being built -- because they are one gesture with two outcomes,
   * and the refund only applies to the second: a thing already built out of the
   * materials does not give them back.
   *
   * **`remove-hint` WAS FALSE FROM 2026-08-31 TO 2026-09-02, AND THE OWNER HAS
   * NOW WRITTEN THE REPLACEMENT.** The sentence in place names all three
   * outcomes the code actually has: money back before the crew starts, nothing
   * back after, and nothing for a finished object.
   *
   * > **The account of the falsehood is kept, because the two days are the
   * > finding.** It read: *"`remove-hint` IS FALSE AS OF 2026-08-31 AND NO
   * > REPLACEMENT IS WRITTEN HERE, BECAUSE COPY IS THE OWNER'S"*, and it was
   * > right on both counts. The owner's ruling 20 -- *"Anulowanie zwraca
   * > pieniądze zamiast cegieł"* and *"Pieniądze dopóki ekipa nie zaczęła"*,
   * > recorded in [ADR 0076](../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)'s
   * > amendment of that date -- had made a cancelled order give back **money**
   * > rather than materials, and **nothing** once the crew had started it. So
   * > *"its materials come back"* named the wrong currency and the sentence had
   * > no clause at all for the case where nothing comes back. Only the second
   * > half, *"a finished one is not refunded"*, was true, and it survives into
   * > the replacement unchanged.
   * >
   * > **What the two days cost, and what to do differently.** The wrong
   * > sentence was left standing deliberately, on the reasoning that a wrong
   * > sentence beats no sentence on a control that takes something away -- and
   * > that reasoning is still defensible. What was missing is that being
   * > *reported* is not being *asked*: the note said "Reported to the owner
   * > with the branch that made it false" and no one put the replacement to
   * > them as a decision to make. A playtest re-measured it live on 2026-09-02
   * > (cancelling an `In Progress` order moved the treasury 23,400 -> 23,400,
   * > exactly zero), it was put to the owner as a choice between three
   * > wordings, and it was answered the same hour. **A false player-facing
   * > sentence needs a question, not a record.**
   */
  'hud.build.remove': 'Remove',
  'hud.build.remove-active': 'Stop removing',
  /*
   * **Amended under `AGENTS.md`'s 2026-09-04 release of reservation 4**
   * (ADR 0106): the choice of words is ours, the requirement that the sentence
   * be true is not. The one clause added is *"or a finished wall"* in the
   * first sentence; the rest is unchanged, including the closing sentence,
   * which was already true of both kinds and needed no edit -- see below.
   *
   * **"or a finished wall"** is true against
   * `src/simulation/runtime/session-commands.ts`'s `RemoveWall` branch: a
   * world press armed to remove now falls through to
   * `ConstructionSystem.completedOrderClaimingEdge` when the pressed tile
   * holds no object, and that resolver only ever matches a `'completed'`
   * order -- a wall still being built is not reached by this control at all,
   * which is why the clause says *"finished"* and not merely *"wall"*.
   *
   * **"A finished one is not refunded."** was written for an object and is
   * kept byte-for-byte, because it is *also* true of a wall now: `cancelOrder`
   * runs `destroysSpendOnCancel(stateAtCancellation)` before releasing or
   * refunding anything, that predicate answers `true` for `'completed'`
   * regardless of what the order builds, and the wall arm's own resolver
   * never returns any other state. So "a finished one" reads, correctly, as
   * either kind the first sentence just introduced.
   */
  'hud.build.remove-hint': 'Press any tile of an object, or a finished wall, to take it away. One still being built is cancelled and refunds its money — but nothing comes back once the crew has started it. A finished one is not refunded.',
  'hud.build.remove-submit': 'Remove object here',
  'hud.build.disarm': 'Stop placing',
  'hud.build.arm-hint': 'Click a tile edge to place a wall. Drag along it to lay a run. Two fingers, the middle button or the arrow keys still move the camera.',
  /*
   * The same hint for a buildable that stands on a **tile** rather than on an
   * edge (issue #904).
   *
   * **The sentence above was shown for every row, and for two thirds of the
   * catalogue it described the wrong gesture**: arming a Bed, a Toilet or a
   * Storage Rack told the player to click a tile *edge* and to drag a *run*,
   * and neither is how one is placed. `ObjectTool.place` is *"one press, one
   * tile, one command"* -- it reports a single anchor tile and there is no drag
   * route for it at all, the dragged-run producer being `BuildTool.attachOrders`
   * and walls only (`src/ui/object-tool.ts`, `src/ui/hud/hud.ts`).
   *
   * **"Inside a designated room" is a refusal reason and not advice.**
   * `ObjectPlacementService` asks `roomInstanceContaining` of the anchor tile
   * and answers `'outside-room'` when there is none
   * (`src/simulation/objects/object-placement-service.ts`), so a press on bare
   * land is refused however good the tile looks. Containment is asked of the
   * **anchor** only, which is why the sentence names the tile the player
   * presses rather than the whole footprint: a bed whose second tile pokes out
   * of the cell is legal, and a hint saying the object must fit inside the room
   * would be false in exactly that case.
   *
   * "Designated" is the word `hud.rooms.arm-hint` and `hud.refusal.zone-room`
   * already use for what the Rooms panel does, rather than a second verb for
   * the same act.
   *
   * The camera clause is repeated verbatim from the sentence above rather than
   * factored out: it is the same fact about the same armed pointer, and one
   * sentence per armed state is what `paintArmed` renders -- see
   * `src/ui/hud/build-panel.ts`, where the hint is one line either way so that
   * the controls under it do not move.
   *
   * Authored by an agent under the owner's release of 2026-09-04
   * (*"Sam decyduj zawsze, jak zacznę grać to ujednolicimy"*).
   */
  'hud.build.arm-hint-object':
    'Click a tile inside a designated room to place it. One press, one object. Two fingers, the middle button or the arrow keys still move the camera.',
  'hud.build.target-none': 'Point at the world',
  'hud.build.target-value': '{x}, {y} · {edge}',
  'hud.build.target-run': '{count} × {edge} from {x}, {y}',
  'hud.build.target-tile': '{x}, {y}',
  'hud.build.coordinates': 'Enter coordinates',
  'hud.build.coordinates-hint': 'The keyboard route. Pointing at the map is quicker.',
  'hud.build.buy': 'Buy',
  'hud.build.buy-quantity': 'Quantity',
  'hud.build.buy-submit': 'Buy {count} × {material} · {total}',
  'hud.build.buy-hint': 'Arrives while the clock runs, into the stock a build draws from.',
  /*
   * The Sell control (ADR 0075 decision 3, invoked by ADR 0096 decision
   * 3(b)), beside Buy in the same disclosure and sharing its quantity
   * stepper: selling belongs next to buying because both name the same
   * material, the same stock, and the same treasury.
   *
   * `hud.build.sell` is `sellSubmit`'s placeholder label, on `hud.build.buy`'s
   * own pattern -- overwritten the moment a material is selected, so a player
   * never reads the bare word.
   *
   * `hud.build.sell-submit` states the quantity, the material and what it
   * would credit, in `hud.build.buy-submit`'s own shape and for the same
   * reason: no currency symbol (#96 named none) and the same figure the
   * balance on the status strip is counted in. Verified against
   * `sellBackUnitPriceMinorUnits` (`src/simulation/economy/procurement.ts`),
   * the one formula both `ProcurementSystem.previewSellStock` and this
   * control's own arithmetic derive from -- see
   * `src/ui/hud/build-panel.ts`'s `paintSellTotal`. The ratio itself
   * (`SELL_BACK_RATIO_NUMERATOR / SELL_BACK_RATIO_DENOMINATOR` = 1/2) is the
   * owner's ruling of 2026-09-11 (the clickable option "50% — zostaw jak
   * jest"), recorded in ADR 0096 and in `procurement.ts`'s own docblock.
   *
   * **No third, hint, key naming the ratio in words, unlike
   * `hud.build.buy-hint`.** One was authored and removed in the same pass
   * that put Sell beside Buy rather than under it (see `messages.ts`'s
   * `buildSell` entry): a stacked second row pushed the deliveries block's
   * third Cancel control outside the panel's visible box at 900x600,
   * measured by `tests/browser/app-shell.spec.ts`'s "a pending delivery is
   * on the panel with the fold shut … (#285, #703)". Saying "half" in prose
   * was also imprecise for an odd price -- `Math.floor` loses the half unit
   * (a 65 plank credits 32, not 32.5) -- where the button's own total, which
   * this key states, is always exact. Removing the hint fixed the layout and
   * removed the imprecision in the same stroke.
   */
  'hud.build.sell': 'Sell',
  'hud.build.sell-submit': 'Sell {count} × {material} · {total}',
  /*
   * **The sentence a refused Buy press shows, and it is the owner's own.**
   *
   * Authored 2026-09-03. It was put to the owner as a clickable choice among
   * four candidate wordings, and they chose this one; the value below is their
   * chosen string verbatim, em dash included. No agent authored, shortened or
   * re-punctuated any part of it -- `AGENTS.md`'s fourth exclusion reserves a
   * player-facing sentence to the owner, and issue #772 reserved *this*
   * sentence in those words: *"the half that is a decision, and so is not an
   * agent's to take: what the control says"*.
   *
   * It closes the wording half of #772 on both controls that spend money. The
   * mechanical half shipped in PR #799 (Buy) and PR #807 (Hire) and said so in
   * its own comments -- *"this is the mechanical half only ... naming what
   * stops and what would lift it is new player-facing copy"* -- so from this
   * ruling the control both advises against the press *and* says what would
   * lift it, which is the pair #772 asked for.
   *
   * `{amount}` is the **shortfall**: how much more money the prison needs
   * before this press goes through, `charge - (balance - floor)`, from
   * `AffordabilityVerdict.shortfallMinorUnits` (`src/ui/affordability.ts`).
   * Deliberately not the price -- `hud.build.buy-submit` one line up already
   * states that -- and not the balance, which `hud.status.funds` states. The
   * three are three different numbers in the state a player meets this
   * sentence in, which is what `tests/browser/ui-refusal-shortfall.spec.ts`
   * measures rather than assumes.
   *
   * No currency, on `hud.build.buy-submit`'s own terms (#96 named none), and
   * formatted through the same `formatNumber` every other money figure on this
   * HUD goes through -- there is no second formatter.
   *
   * **`hud.security.hire-shortfall` carries this exact text**, because the
   * owner ruled one sentence and there are two controls that spend money. Two
   * keys and not one, on this file's standing rule for that -- *"a key here is
   * a call site and never a string pool"*, argued at the four insolvency
   * refusals below, with `hud.build.step-up` / `hud.rooms.step-up` as the
   * precedent. `tests/unit/ui-hud-refusal-shortfall.test.ts` is what keeps the
   * two identical.
   */
  'hud.build.buy-shortfall': 'Not enough money — you need {amount} more.',
  /*
   * The queue (#348, and the surface that finally gives `CancelBuildOrder` a
   * producer).
   *
   * `queue-count` counts the whole queue and says how much of it is moving,
   * because "one of twelve" is the fact #348 created and nothing on screen
   * carried: the crew builds one order at a time, so eleven of a twelve-segment
   * run are waiting.
   *
   * `queue-order` is the row, and the order of the words is the order a player
   * needs them in: *what* it is, *where* it is, and *what it is waiting for*.
   * The edge and the state both arrive already translated, from
   * `build-edge` and `build-order-state` in the simulation enum table -- there is
   * no second spelling of either here.
   *
   * `queue-more` says what is behind the last row and deliberately offers no way
   * to reach it: those orders are not the ones about to happen, and taking a
   * whole run back is Undo's job.
   *
   * `queue-shortfall` is the queue's only sentence about money, and the one
   * thing on this surface a player must be told rather than discover (#629).
   * Since a build order buys its own materials (ADR 0017 decision 7),
   * *"Awaiting Materials"* means two things a row cannot separate -- the lorry
   * is coming, or the prison could not pay -- and only the second needs the
   * player to do something. `{total}` is the same minor units as
   * `hud.status.funds`, so the two numbers on screen read against each other
   * with nobody having chosen a currency.
   *
   * **`{total}` changed subject under the owner's ruling on issue #771 of
   * 2026-09-01, and this line's wording is a proposal pending that same
   * ruling, not a signed sentence.** It used to be, and the paragraph below
   * records verbatim, `shortfallMinorUnits` -- the sum of every order the
   * queue could not fund, "what the queue still needs, whole". ADR 0081
   * decision 2 funds one whole order at a time and
   * `JustInTimeMaterialsService`'s rule 2 lets a later, cheaper order through
   * while an earlier, pricier one waits, so a player who saved the sum could
   * still see nothing move. `{total}` is now
   * `BuildQueueMaterialsFundingViewModel.nextOrderShortfallMinorUnits`: what
   * unblocks the order at the front of the queue, which is also the front of
   * the list on screen (ADR 0082). The wording change from "buy materials" to
   * "unblock the next order" is this agent's best attempt at the clearest
   * sentence for the new subject, offered for the owner to sign, adjust or
   * replace -- `AGENTS.md`'s fourth exclusion reserves new player-facing copy,
   * and only the number's *source* was this agent's to fix.
   *
   * **The paragraph the ruling replaces, kept for its own record.**
   * *"Authored by the owner, 2026-08-30, and verbatim. The words on this line
   * are not an agent's: the sentence #640 needed did not exist, the gap was
   * reported rather than filled, and this is the answer that came back. It
   * names no material on purpose, which is why the view model that feeds it
   * carries two scalars and not the projection's per-item list."* The view
   * model now carries three scalars for the reason above; the rest is
   * unaffected -- no material is named and the words are still not this
   * agent's own idea of the *subject*, only of the phrasing.
   *
   * **`queue-order` gained `· {total} back`, the owner's decision of
   * 2026-09-02, in the same pattern `hud.build.delivery` already uses three
   * lines below for the same money ("{count} × {material} · {total} back").**
   * This is the whole of that decision's copy: no other wording changed, and
   * `{total}` reads `0 back` when cancelling would give back nothing --
   * deliberately, per the ruling, rather than hiding the row or the figure in
   * that state. What `{total}` *is* -- `HudBuildOrderViewModel.cancelRefundMinorUnits`,
   * read off `ConstructionSystem.previewCancelRefundMinorUnits` on the exact
   * code path `CancelBuildOrder` pays through -- is argued at that method, not
   * here; this comment is only the copy decision.
   */
  'hud.build.queue': 'Queued',
  'hud.build.queue-count': '{count} waiting · {started} being built',
  'hud.build.queue-order': '{buildable} · {x}, {y} · {edge} · {total} back',
  'hud.build.queue-cancel': 'Cancel',
  'hud.build.queue-unnamed': 'Unnamed order',
  'hud.build.queue-more': 'and {count} more behind these — undo takes back a whole run.',
  'hud.build.queue-shortfall': 'Waiting for {total} to unblock the next order.',
  /*
   * What has been bought and has not arrived (#285), inside the buy disclosure
   * and beside the control that spent the money.
   *
   * Corrected 2026-08-31 (issue #703 ruling 2): the block is out of that
   * disclosure and laid out on the panel. **No sentence below changed**, and
   * that is worth saying in a locale file -- the ruling moved authored copy into
   * view, it did not ask for new copy, and none was written.
   *
   * `deliveries-count` carries the figure this whole surface exists for: what a
   * cancellation would give back. The strip's Funds readout says what is left,
   * and until this existed nothing said what was out — so money spent on a
   * delivery a player had changed their mind about was gone with no affordance
   * that explained it and none that recovered it.
   *
   * `delivery` is the row, in the order a player needs the words: how much of
   * what, and then what cancelling it returns. "back" rather than "refund"
   * because the row is next to a Cancel button and the sentence has to survive
   * being read at a glance on a phone.
   *
   * `deliveries-more` names no other control, unlike `queue-more`: there is no
   * Undo for a purchase. It says what really happens to the rest — the rows are
   * the deliveries landing soonest, and the ones behind them come into view as
   * those arrive, which is also the moment their own refunds stop being
   * available.
   */
  'hud.build.deliveries': 'On the way',
  'hud.build.deliveries-count': '{count} bought · {total} back if cancelled',
  'hud.build.delivery': '{count} × {material} · {total} back',
  'hud.build.delivery-cancel': 'Cancel',
  'hud.build.delivery-unnamed': 'Unnamed material',
  'hud.build.deliveries-more': 'and {count} more on the way — these arrive first, and the rest come into view as they land.',
  'hud.build.buildable.wall-brick': 'Brick wall',
  'hud.build.buildable.door-wooden': 'Wooden door',

  // The catalogue's category filter (#390, ADR 0035). Three keys and not
  // eight: the seven object categories are named in the content namespace
  // above, because they are content. These three are the panel's own
  // vocabulary -- the control's accessible name, the option that filters
  // nothing, and the group for the two buildables that place no object and
  // therefore belong to no object category.
  //
  // "Walls and doors" names its two members rather than abstracting over them
  // ("Structure", "Building"): the group exists because those two rows have no
  // authored category, so a name that describes the rows is honest where a
  // name that implies a taxonomy is not.
  'hud.build.category': 'Category',
  'hud.build.category-all': 'Everything',
  'hud.build.category.structure': 'Walls and doors',

  // The intake surface (#261 step 4). The hint states the prison's actual
  // situation rather than a feature disclaimer, because it *is* the prison's
  // situation.
  //
  // It used to read "A prisoner can only be admitted into a prison that has a
  // room to hold them", and that sentence was **false about the shipped game**
  // (issue #549): `IntakeSystem.hasAccommodationTarget` asks whether the prison
  // holds an instance of a housing room type and never whether a place in one
  // is free, so a cell with one bed in it accepted twelve admissions. It is
  // replaced rather than softened, and both halves of what the control really
  // does are stated -- what makes a press refused, and what a press costs when
  // the prison is full -- because a player who reads only this sentence must
  // not come away believing the prison protects them from over-admitting.
  //
  // "a cell" and not "a room": every accommodation target
  // `DEFAULT_ACCOMMODATION_POLICY` names is one, and a canteen or a yard has
  // never made an admission possible.
  'hud.intake.title': 'Intake',
  'hud.intake.admit': 'Admit a prisoner',
  'hud.intake.hint': 'A prison needs a cell before it can admit anyone. It does not need a free bed: an arrival with none waits until a bed is free.',
  // The warning beside the control, and the only toned figure on this panel.
  // "no bed" and not "no cell": a zoned cell with nothing in it houses nobody,
  // because `deriveRoomCapacity` credits residency to sleep surfaces and not to
  // rooms (ADR 0028), so a player told to build a cell they have already built
  // would be told to do the wrong thing. It states the prison's condition and
  // promises no remedy -- placing a bed is one, and so is waiting for a
  // sentence to end.
  'hud.intake.no-place': '{count} waiting with no bed to sleep in',
  // Where the arrivals already admitted are. "In intake" rather than "Queue":
  // the pipeline is what the simulation calls this and the stage named
  // `queued` is only its first step, so a header saying "queue" would name one
  // stage while counting four.
  'hud.intake.pipeline': 'In intake',
  'hud.intake.pipeline-count': '{waiting} of {total}',
  'hud.intake.pipeline-stage': '{count} at {stage}',
  // The terminal stage, in the words that say what a player can do about it:
  // nothing. `IntakeSystem` reaches it only when the prison holds no room of
  // any type the arrival's classification may be housed in, and no branch of
  // the stage machine leaves it again -- so this must not read like a wait.
  'hud.intake.pipeline-failed': '{count} cannot be housed at all',

  // The Staff panel on the Security tab (ADR 0025). `hud.security.hire` names
  // the role and states what the press will spend in one sentence, so the
  // figure is a statement about the button rather than a price list the HUD
  // keeps -- the same shape, and the same reason, as `hud.build.buy-submit`.
  // The number is the role's own wage band read as the treasury's minor units
  // and divided by nothing: #96 named no currency.
  'hud.security.staff': 'Staff',
  'hud.security.roles': 'Who to hire',
  'hud.security.roles-empty': 'Nobody can be hired yet.',
  'hud.security.selected': 'Selected',
  'hud.security.hire': 'Hire {role} · {total}',
  /*
   * What a hire costs, both halves of it (issue #639 ruling 2, the owner's
   * approved wording).
   *
   * **This key used to say *"Taken from the treasury on hire. A new guard
   * starts unassigned."* and the first sentence was false.** `PayrollSystem`
   * bills the same figure again at every in-game day boundary the guard is on
   * the roster for (`src/simulation/economy/payroll.ts`), so a player reading
   * *on hire* was told a recurring charge was a one-off fee. Measured while
   * playing (#636): `25,000 -> 24,920 -> 24,840 -> 24,760`, with `/wage/i`,
   * `/per day/i` and `/daily/i` all false across the whole HUD at every
   * observation. `AGENTS.md` reserves *"any player-visible promise the code
   * does not keep"* to the owner, and this is that category met head-on, so
   * the replacement sentence is theirs and is reproduced verbatim.
   *
   * **Both figures are placeholders, and that is the point.** A hard-coded
   * `80` in a locale string would be a second authority on a price, which
   * ADR 0017 decision 5 puts with #29 -- and it would be a *silent* one, since
   * moving `wageBand.minPerDay` would move the button, the button's charge and
   * the payroll while leaving this sentence quoting the old number. `{total}`
   * is the same value the `hud.security.hire` button above renders, and
   * `{wage}` is `staffDailyWageMinorUnits` for the same role. They are two
   * parameters rather than one because they answer two questions; that they
   * hold one number today is `src/simulation/economy/wages.ts`'s doing and is
   * that module's to change.
   *
   * **"wages" is the word the payroll block uses**, and it is here so a player
   * meets the category once with a price on it and again on the `On the
   * payroll` header, rather than meeting two vocabularies for one thing.
   *
   * **What this no longer says**: *"A new guard starts unassigned."* It was
   * displaced rather than judged unwanted -- and `.hud-staff__note` is clamped
   * to a single line at any viewport 700px tall or shorter
   * (`src/ui/hud/hud.css`), which is why the two sentences could not simply be
   * run together.
   *
   * **That paragraph used to end "see the report on #639" for the displaced
   * sentence's fate, and the fate is now settled**: the owner ruled on
   * 2026-08-30 that it returns as a line of its own, and it is
   * `hud.security.hire-unassigned` immediately below. The clamp sentence above
   * is left standing because it is still why the two are two keys.
   */
  /*
   * **"including today" is the owner's ruling of 2026-09-03, and it exists
   * because this sentence was false on the first press of a new game.**
   * `src/simulation/staff/hiring.ts` says in its own words that "a guard
   * engaged at any point during a day costs two days' wage for that day",
   * so hiring one guard cost 160 on day one -- measured, 25,000 -> 24,920 at
   * the press and -> 24,840 at tick 2,408, with `DAY_LENGTH_TICKS` 2,400 and
   * no other command sent (issue #868). The sentence read as 80 today and 80
   * tomorrow.
   *
   * Put to the owner as three shapes: pro-rate the charge so the old sentence
   * becomes true, replace the sentence, or add the two words that make it
   * true. They chose the third, which leaves the mechanic alone -- so this is
   * a wording change and not a balance one, deliberately.
   */
  'hud.security.hire-hint': 'Costs {total} now and {wage} a day in wages, including today.',
  /*
   * The same sentence, on the other control that spends money, and byte-identical
   * to `hud.build.buy-shortfall` above -- see that entry for the ruling, the date,
   * and why there are two keys for one authored sentence.
   *
   * `{amount}` is the shortfall against what **one press** costs: the engagement
   * fee `staffHireCostMinorUnits` charges, which is what `src/main.ts` judges a
   * `hire-staff` press by. Not the daily wage the line above prices, and not the
   * two added together -- a sentence that named tomorrow's bill would be telling
   * the player they are short of money for a press the simulation accepts.
   */
  'hud.security.hire-shortfall': 'Not enough money — you need {amount} more.',
  /*
   * The half of the old hint that the owner's approved sentence displaced, back
   * as a key and a line of its own (issue #639 ruling 2, approved 2026-08-30).
   *
   * **It is a restoration, not a new string.** `hud.security.hire-hint` read
   * *"Taken from the treasury on hire. A new guard starts unassigned."* until
   * the ruling above replaced its first sentence, which was false; the second
   * sentence was never wrong and was never judged unwanted. It could not simply
   * be run on after the replacement, because `.hud-staff__note` is clamped to a
   * single line at any viewport 700px tall or shorter -- run together, the two
   * sentences measured `scrollHeight` 26 against `clientHeight` 13 at 900x600
   * and the player read half of them. So it returns as its own note, exempted
   * from that clamp in `src/ui/hud/hud.css`, which is what
   * `hud.build.note` does one panel over for the same reason.
   *
   * It quotes no figure and takes no parameter: what a hire spends is the
   * sentence above's job, and this one says what a player gets for it -- a
   * guard who is hired and posted nowhere, which is the state
   * `deployment-phase.unassigned.name` names on the roster and the reason
   * `hud.security.coverage` can still read *"Unguarded"* the tick after a
   * successful hire.
   */
  'hud.security.hire-unassigned': 'A new guard starts unassigned.',

  // The Staff panel's held-guards list (ADR 0034). `hud.security.held-row` says
  // who and what is holding them in one line, so the claim is a statement about
  // the guard rather than a badge the reader has to pair up with a name.
  // `hud.security.held-release` names no claim: releasing a searcher, a
  // responder and a posted guard is one gesture, which is the decision ADR 0034
  // records, and three verbs would contradict it on screen.
  'hud.security.held': 'On duty',
  'hud.security.held-summary': '{held} held · {unassigned} free',
  'hud.security.held-empty': 'Nobody is assigned right now.',
  'hud.security.held-row': '{name} · {claim}',
  'hud.security.held-row-unnamed': 'Guard {id} · {claim}',
  'hud.security.held-release': 'Release',
  'hud.security.held-more': 'and {count} more',
  'hud.security.held-hint': 'A released guard stays hired and goes back to the pool.',

  /*
   * The Staff panel's roster block (issue #533).
   *
   * **All three are drafted and flagged for the owner's review**, together with
   * `hud.alert.refusal.dismiss.unknown-staff` above. They are the whole of what
   * this change adds to what a player reads, and they are three rather than
   * seven because the block reuses `hud.security.held-row`,
   * `hud.security.held-row-unnamed` and `hud.security.held-more` -- see
   * `securityRosterTitle` in `src/ui/hud/messages.ts` for what that reuse costs
   * and why it is taken.
   *
   * `hud.security.roster-hint` says the consequence rather than the mechanism,
   * and it says the *money* half because that is the half a player pressing this
   * is acting on: `hud.security.hire-hint` two blocks up already priced the
   * wage, and `PayrollSystem` goes on taking it every in-game day until this
   * control is pressed. It deliberately does not promise a refund or a
   * severance, because there is neither.
   *
   * **That sentence used to end "already told them the wage is taken on hire",
   * and it was describing a hint that was wrong** -- *"Taken from the treasury
   * on hire"* said once and the system charged daily, which is the defect issue
   * #639 ruling 2 corrected. Both directions are marked rather than
   * overwritten, because the reason this hint says the money half has not
   * changed; only the sentence it leans on has.
   *
   * Since the same ruling, `hud.security.roster` is also a header with a figure
   * beside it: the whole roster's standing daily bill, as a trailing element on
   * the section, which is collapsed.
   *
   * **That figure was bare for one revision and this paragraph used to say so**
   * -- it called the shared word *wage* "what ties that bare figure to a
   * category the player has already met with a price on it". It is not bare any
   * more: `hud.security.roster-wage-bill` below states the period on the badge
   * itself, because a bare number beside a header naming people reads as a
   * headcount. The shared vocabulary still matters; it is no longer the only
   * thing carrying the figure's meaning.
   */
  'hud.security.roster': 'On the payroll',
  /*
   * The figure beside that header, with the word that says what kind of figure
   * it is (issue #639 ruling 2, the owner's approved wording, 2026-08-30).
   *
   * **The badge shipped for one revision as a bare `4,800`, and that was the
   * gap this key closes.** Beside a header naming *people*, a bare number reads
   * as a headcount as readily as as money, and no test can tell the two
   * readings apart -- they render identical characters. The Build panel's own
   * collapsed-header badge was never bare for this reason:
   * `hud.build.queue-count` is *"{count} waiting · {started} being built"*.
   *
   * `{total}` and no currency, on `hud.security.hire`'s terms: #96 named no
   * currency and the figure is the treasury's own minor units. The word is
   * carried here rather than concatenated at the call site so a locale can move
   * it -- "a day" precedes the figure in more languages than it follows it.
   *
   * *"a day"* rather than *"per day"* or *"daily"* because it is the phrasing
   * the hire hint two blocks up already uses for the same period, and one
   * vocabulary for one thing is the point of the pair.
   */
  'hud.security.roster-wage-bill': '{total} a day',
  'hud.security.roster-dismiss': 'Dismiss',
  /*
   * The confirmation the armed dismiss control asks for (the owner's ruling of
   * 2026-09-03 on issue #877, in their words and unedited).
   *
   * The ruling that supplied it also settled the mechanism, and it settled it
   * with **both** options rather than one: asked whether a dismissal should get
   * a settle window on the row or a confirmation step, the owner answered
   * *"Jedno i drugie"* -- one and the other. So the row cannot be re-pointed
   * under the player *and* the press that sacks somebody is the second one.
   *
   * **It does not fit the 900x600 clamp, and the box gives way rather than the
   * sentence.** `@media (max-height: 700px)` in `src/ui/hud/hud.css` gives every
   * `.hud-staff__note` `-webkit-line-clamp: 1`, and at that viewport this
   * sentence is two lines -- the clause the clamp would cut is *"and they do not
   * come back"*, which is the half that makes it a warning rather than a
   * restatement of the button. `.hud-staff__dismiss-confirm` is exempted there,
   * on exactly the terms `.hud-staff__hire-note` was exempted on when the same
   * thing happened to the owner's hire sentence (issue #884): a whole clause or
   * nothing, and the sentence is never the thing that is shortened to fit.
   *
   * `{name}` is filled with the row's own label, verbatim -- what the player
   * read on the row they pressed. It is not a personal name, because a staff
   * member has none: `HudStaffRosterRowViewModel` carries an entity id, a role
   * key and a status key, so two guards doing the same thing render the same
   * row and this sentence names them the same way. That is a real limit of the
   * read model rather than of this string, it is reported as one, and no wording
   * is invented here to paper over it.
   */
  'hud.security.roster-dismiss-confirm': 'Dismiss {name}? Their wage stops and they do not come back.',
  'hud.security.roster-hint': 'A dismissed staff member leaves the prison for good, and their wage stops.',

  // The Staff panel's coverage block (ADR 0048). `hud.security.coverage-summary`
  // is assigned against required, in the shape `hud.status.occupancy-value` set
  // for a figure with a ceiling. The three badge words name three different
  // prisons rather than three shades of one, and the two hints that follow a
  // shortage name the action instead of restating the diagnosis -- the hire
  // control is the next block down. `{count}` is the shortage, so it is the
  // number of presses; both sentences are worded to read correctly at one as
  // well as at several.
  'hud.security.coverage': 'Guard coverage',
  'hud.security.coverage-summary': '{assigned} of {required}',
  'hud.security.coverage-met': 'Covered',
  /*
   * **The sentence the block says once its figures are level, and it no longer
   * says the prison is finished hiring** (issue #941, authored here under the
   * owner's partial release of `AGENTS.md` reservation 4 on 2026-09-04 -- the
   * choice of words is ours, the requirement that it be true is not).
   *
   * **What it said until now, quoted rather than overwritten**
   * (`docs/AGENT_WORKFLOW.md` §4): *"This prison has the guards it asks for."*
   * That sentence was **true** and is the whole of why it had to go. The
   * figures beside it are `assigned` against `required`, and `required` is
   * `DeploymentSystem.requiredGuardCountFor` -- the posts a sector asks a
   * player to fill. `DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT`'s own
   * docblock (`src/simulation/security/default-sector.ts`) says in words what
   * that number leaves out: *"a prison of `n` prisoners needs `ceil(n / 8)`
   * guards posted **plus** a reserve for `IncidentResponseSystem` to claim,
   * and a player who hires exactly the requirement will watch every incident
   * lapse."* So the badge, the pair of figures and that sentence all reported
   * a met requirement, and nothing on the tab said the requirement is not the
   * whole bill. Measured in the five-tester round of 2026-09-04: 17 residents,
   * 4 guards, `3 of 3 / Covered / This prison has the guards it asks for.`
   * beside `3 held · 1 free`, and 7 fights over in-game days 10-15 of which
   * **7 lapsed and 0 were contained**.
   *
   * ## What makes the replacement true, opened rather than assumed
   *
   * `IncidentResponseSystem.claimableResponders`
   * (`src/simulation/incidents/response-system.ts:499`) is the only path that
   * puts a guard on an incident, and it draws from
   * `claimableGuardIds(this.guards)` --
   * `src/simulation/security/post-eligibility.ts:103`, which is
   * `GuardRoster.unassignedGuardIds()` filtered to post-eligible roles. A
   * guard `DeploymentSystem` has posted is `'travelling'` or `'on-post'`
   * rather than `'unassigned'` (`src/simulation/security/guard-roster.ts:236`),
   * so it is **never** in that pool. Hence *only* -- the exclusion is the half
   * of this sentence that corrects the reading, and it holds in both
   * directions: a held guard is never claimed, and the pool is exactly the
   * free post-eligible ones.
   *
   * *"guards"* rather than *"staff"*, and that is a truth constraint rather
   * than a register choice. The `{unassigned}` figure in
   * `hud.security.held-summary` below is `hired - held` over the whole roster
   * (`projectHeldGuards`, `src/simulation/presentation/guard-release-projection.ts:213`),
   * so it counts a free nurse -- and `post-eligibility.ts` says so itself:
   * *"A prison whose roster holds a nurse and no guard should read three
   * staff, one of them unassigned, and nobody available to guard."* A sentence
   * about *free staff* answering an incident would therefore be false; one
   * about free **guards** is not.
   *
   * ## Why it quotes no number, which is the part a balance pass may want to change
   *
   * Because the number is not one number, and because choosing what to
   * recommend is balance and `AGENTS.md` reserves that to the owner.
   * `requiredResponderCount` is `max(1, ceil(severity * 0.5))`
   * (`response-system.ts:345`), and every incident a session can currently
   * open is severity 3 or worse: an assault is scaled into `1..5` and fires
   * only at or above `DEFAULT_ASSAULT_POLICY.threshold` 0.65, so its floor is
   * `round(0.65 * 5) = 3` and it asks for **two** -- which
   * `ASSAULT_SEVERITY_CEILING`'s docblock states outright, *"A
   * threshold-grazing assault is severity 3 and asks for two guards; the worst
   * possible one is severity 5 and asks for three."* A riot or a gang
   * retaliation fires at the same 0.65 on the full 0-10 scale, so severity 7
   * and four responders, and an escape attempt at 0.6 wants three. So the
   * honest reserve is between two and five and depends on what happens; a
   * sentence naming one figure would be a promise for some prisons and a lie
   * for others. This one states the **rule** the player cannot otherwise see,
   * and leaves the size of the reserve to the requirement itself, which is
   * issue #941's option 1 and the owner's to take.
   *
   * ## What it deliberately does not say
   *
   * Nothing about an outcome. `describeStaffCoverage`'s docblock refuses "a
   * riot is coming" on measured grounds and PR #854 refused an owner's earlier
   * wording for asserting that guards stop incidents -- guard presence is an
   * amplifier and not a gate. This says who is *claimed* when an incident
   * opens, which is a fact about the dispatch path, and it promises no
   * containment: `claimableResponders` returning a set is not
   * `advanceResponse` reaching `'resolved'`.
   *
   * Rendered with no parameter, exactly as its predecessor was: the covered
   * rung's `hireCount` is `0`, so `paintCoverage` formats this key with no
   * arguments and it must declare no placeholder.
   *
   * It is 34 characters against the 39 the sentence it replaces occupied, and
   * that matters at one viewport: `.hud-staff__note` is clamped to a single
   * line below `max-height: 700px`, where the box is 238px wide. Measured at
   * 900x600, the old sentence was one 13px line in a 13px box and this one is
   * shorter, so the clamp cuts neither -- `tests/browser/ui-staff-coverage-reserve.spec.ts`
   * is where that is held at all five shipped viewports rather than argued.
   *
   * ## Widened on 2026-09-05, issue #989 -- everything above is kept as it
   * stood, because it is the sentence that was replaced
   *
   * **It read *"Only free guards answer incidents."*, it was true, and it is
   * still true. What retired it is that it named ONE consumer of the free pool
   * and there are TWO.** `SearchSystem.assignQueuedOrders`
   * (`src/simulation/contraband/search-system.ts`, by symbol for the reason
   * two paragraphs down) staffs a contraband search from the same roster, and
   * `SectorSearchDutySystem.update`
   * (`src/simulation/contraband/sector-search-duty.ts`) will not even *order*
   * a sweep unless that pool already holds `policy.requiredGuardCount` (`1`
   * for `'sector'`, `DEFAULT_SEARCH_POLICY_BY_SCOPE` in
   * `src/simulation/contraband/default-search-policies.ts`).
   *
   * **Both of those calls said `claimableGuardIds(this.guards)` -- *"the same
   * call, on the same roster, as the responder claim"* -- until 2026-09-05,
   * and issue #996 made that clause false while leaving the sentence on screen
   * true.** They now read `claimableSearchGuardIds`, which is that pool less
   * `INCIDENT_RESPONSE_GUARD_RESERVE`, so a search still needs free guards --
   * it needs *more* of them than it did, one more than a response does. The
   * enumeration this hint makes is untouched: two duties draw on the free
   * pool, and the change is which slice of it one of them may take. The retired
   * clause is left visible rather than overwritten because the rewritten
   * sentence is the one a reader will check against the code. **Both of those
   * are cited by symbol and not by line, and the second one is why**: this
   * paragraph first read `sector-search-duty.ts:126`, and the docblock this
   * change added to that same file moved the line to `:139` before the commit
   * was written -- `docs/AGENT_WORKFLOW.md` §4's rot, inside one edit, by the
   * hand making it. So a prison at
   * exactly its posted requirement orders no sweep at all, and that system's
   * own docblock says so in words: *"a prison that hires exactly its posted
   * requirement never searches, and the first guard hired past that
   * requirement is what makes contraband findable."* Measured over ~9 in-game
   * days on one seed: 1 guard 0 discoveries, 2 guards (`2 of 2 · Covered`) 0
   * discoveries, 3 guards finds.
   *
   * ## What makes the replacement true, clause by clause
   *
   * - ***"Incidents ... need free guards."*** `claimableResponders` above is
   *   the only path onto an incident and returns `undefined` when
   *   `claimableGuardIds` is shorter than `requiredResponderCount`, which is
   *   `max(1, …)` and therefore never `0`.
   * - ***"... and searches ..."*** the two call sites in the paragraph above.
   *   The word is the one this game already puts on screen for it: the Staff
   *   panel's own held-guards rows label a claim `Contraband Search` and a
   *   phase `On Search` (`guard-claim` and `deployment-phase` in
   *   `src/content/simulation-message-keys.ts`), so it is in the player's
   *   vocabulary before this sentence uses it.
   * - ***"... free guards."*** unchanged from #941 and proved there: a posted
   *   guard is `'travelling'` or `'on-post'`, never `'unassigned'`, so it is
   *   never in the pool; and *guards* rather than *staff* because
   *   `claimableGuardIds` filters by post-eligible role.
   * - **Plural, and indefinite.** *"need free guards"* is the generic plural
   *   and promises no count, which the section above establishes is a truth
   *   requirement rather than a style: the honest reserve runs from two (a
   *   threshold-grazing assault) to five (a severity-10 riot) for incidents
   *   and is one for a sector sweep, so *"need a free guard"* would be false
   *   for most incidents this build can open.
   *
   * **What it gives up is the word *"only"*, and that is a real loss stated
   * rather than glossed.** #941 argued that *"only"* is the half of its
   * sentence that corrects the reading, and it was right. The exclusion now
   * rides on *"free"* instead -- the requirement is stated as one a *free*
   * guard satisfies, beside an `On duty` block printing `{held} held ·
   * {unassigned} free` -- which says the same thing forwards and buys the room
   * the second duty needs. It still promises no outcome: it says what a duty
   * *draws on*, not that a response contains anything or that a sweep finds
   * anything.
   *
   * **It is 40 characters against that sentence's 34, and the clamp was
   * measured rather than estimated.** At 900x600, the one shipped viewport
   * inside `hud.css`'s `-webkit-line-clamp: 1` band, the hint's box is 238px
   * and this sentence renders at 227.7px in the resolved font (500 11px /
   * 13.2px system-ui) -- so it fits on the one line, with less room to spare
   * than its predecessor's 191.7px. The four wider viewports resolve
   * `line-clamp: none` and are not the constraint. (The paragraph above says
   * *"one 13px line in a 13px box"*: the box is 13.19px because the
   * *line-height* is 13.2px; the font is 11px. Corrected here rather than
   * above, because the sentence it is about is the retired one.)
   * `tests/browser/ui-staff-coverage-reserve.spec.ts` holds the geometry at
   * all five viewports and is what goes red if a later widening is authored
   * without re-measuring.
   */
  'hud.security.coverage-met-hint': 'Incidents and searches need free guards.',
  'hud.security.coverage-short': 'Understaffed',
  'hud.security.coverage-short-hint': 'Hire {count} more to cover this population.',
  'hud.security.coverage-unguarded': 'Unguarded',
  'hud.security.coverage-unguarded-hint': 'Nobody is on duty. Hire {count} to cover this population.',
  /*
   * The owner's chosen wording of 2026-09-03, verbatim, and it is on the
   * unguarded rung only.
   *
   * **What makes it true, checked against the code rather than against the
   * brief that asked for it.** `SAFETY_COVERAGE_PROVISION_MULTIPLIER` in
   * `src/simulation/prisoners/needs.ts` is `{ covered: 1, understaffed: 0.5,
   * unguarded: 0 }`, so `SafetyCoverageSystem` provisions **nothing** to
   * every occupant of a sector on this rung while `NeedsDecaySystem` goes on
   * subtracting `safety`'s 0.05 a tick from them -- a net -0.05, which is
   * 4,080 ticks from full to `STATE_INCOME_UNMET_NEED_LEVEL` (255 - 51, over
   * 0.05). Nothing else in `src/` puts `safety` back: `action.sleep` carried
   * `safety: 0.2` and `action.yard-recreation` `safety: 0.1` and both were
   * removed (issue #588) precisely so that coverage would be the only
   * instrument. So "nobody ... is kept safe" is the whole of what an empty
   * post does, stated at the granularity the simulation works at:
   * `SafetyCoverageSystem.walk` resolves the rung **per sector** and
   * provisions each of that sector's occupants at it.
   *
   * **What it deliberately does not say, and why that is not a hedge.** An
   * earlier wording of the owner's -- *"so nothing stops an incident in this
   * sector"* -- was refused with the measurements in #848 and PR #854, and
   * the refusal is the reason this sentence is about safety and not about
   * incidents. Guard presence is an **amplifier**, not a gate:
   * `staffingShortfall` carries weight `0.3` against a `hotThreshold` of
   * `0.65` and "a furnished prison sits at `0.164` at its worst and is still
   * below the line with no guards at all"
   * (`src/simulation/incidents/sector-risk.ts`), and
   * `IncidentResponseSystem.claimableResponders` draws from a **prison-wide**
   * pool with no sector term in the dispatch path at all. This sentence
   * therefore stays inside what `describeStaffCoverage`'s own docblock
   * refuses under the heading *"What it deliberately does not say"* -- it
   * names a need that stops being provisioned, not a riot that is coming.
   *
   * **"this sector" is the simulation's noun and today it denotes the whole
   * prison**, which is worth writing down here because it is the half of
   * this sentence a player cannot yet check. Every session a player can start
   * has exactly one sector, derived rather than drawn:
   * `DEFAULT_SECURITY_SECTOR_ID` is `'security-sector.prison'` and its grade
   * docblock calls `grade.general` *"the only defensible grade for a sector
   * that covers the whole prison"*. So the sentence's extent and the prison's
   * extent are the same tiles, and the sentence becomes *more* precise -- not
   * less true -- on the day a player can draw a second sector. What it will
   * need then is a per-sector readout to sit on; this block's figures are
   * summed across sectors (`src/ui/simulation-staff-coverage.ts` argues why),
   * and the rung it renders is reached only when nobody is posted anywhere.
   */
  'hud.security.coverage-unguarded-consequence': 'No guard is posted here, so nobody in this sector is kept safe.',

  // The Regime panel on the fifth tab (issue #451). Two blocks: what each
  // classification group's day allows at this tick, and who is in the prison.
  //
  // "Today's blocks" rather than "Schedule" or a time: there is no hour-of-day
  // anywhere in this simulation (`docs/HUD_PROJECTIONS.md` gap 5) and a
  // schedule readout that implied one would be the `07:45` the status strip
  // already had to withdraw. A block's *bounds* are quoted in ticks and are
  // deliberately not rendered for the same reason; how far through it is, is a
  // share and renders honestly as one.
  //
  // "Allows" is the verb because that is exactly what a regime block does --
  // `ActionSystem` filters the candidate actions to the block's categories --
  // and because a bare list of category names would not say whether the group
  // may do them or is doing them.
  'hud.regime.title': 'Regime',
  'hud.regime.blocks': "Today's blocks",
  'hud.regime.block-allows': 'Allows {categories}',
  'hud.regime.block-progress': '{percent}% through',
  // A list separator, which is vocabulary rather than punctuation: it is `، `
  // in Arabic and `、` in Japanese.
  'hud.regime.category-separator': ', ',
  // #958: remaining ticks at the detail reply divided by the published day
  // length; a duration, not a real-world date or a promise of discharge now.
  'hud.regime.sentence-remaining': 'Sentence remaining (in-game days): {days}',
  // The roster. `{shown} of {total}` in the shape `hud.status.occupancy-value`
  // set, because the panel draws a window and the prison is the ceiling.
  //
  // A name is two halves in the order this locale puts them (ADR 0015): the
  // halves are state and are never translated, and only their order is a
  // locale decision. An arrival who has not reached the stage that mints a
  // name is still a row, and is named by the id a future selection would
  // carry.
  //
  // "Heading to" is the only wrapper around an activity, and only when the
  // prisoner is walking to one the simulation has named. What they are doing
  // once they arrive is the action's own word.
  'hud.regime.roster': 'Prisoners',
  'hud.regime.roster-count': '{shown} of {total}',
  'hud.regime.roster-name': '{given} {family}',
  'hud.regime.roster-unnamed': 'Prisoner {id}',
  'hud.regime.roster-heading': 'Heading to {activity}',
  'hud.regime.roster-more': 'and {count} more',
  // **The owner ruled this sentence on 2026-09-03**, shown it among candidates
  // and choosing it in their own words: *"No prisoners yet. Build a cell with a
  // bed to take somebody in."* Two sentences in one string, as ruled -- the
  // state, then the one thing a player can do about it -- and the same voice as
  // `hud.security.coverage-unguarded-consequence` above, which that key's own
  // comment records as *"the owner's chosen wording of 2026-09-03"* too.
  //
  // **This read "Nobody has been admitted yet." until that ruling, and the
  // argument it carried is kept rather than overwritten**
  // (`docs/AGENT_WORKFLOW.md` §4). It read: *"Not \"No prisoners\": an empty
  // prison is the state every new game starts in and the Overview tab has the
  // control that ends it, so the line says where to go rather than restating
  // the count above it."* The ruling overrules its first half -- the sentence
  // now opens on the exact words that argument refused -- and keeps its second:
  // it still says where to go, and says it as an instruction rather than by
  // naming a tab.
  //
  // **The state this sentence is not true of is a prison that emptied out**,
  // and it does not have to be: `regime-panel.ts` draws this line only while
  // `everAdmitted` is false (issue #506), so a prison that admitted people and
  // has since discharged all of them draws no sentence here at all. That
  // second state still has none, and authoring one is the owner's under
  // `AGENTS.md`'s fourth exclusion -- the concern was put to them inside this
  // option's own description before they chose it, and they chose it.
  //
  // **That second state now has its own sentence, ruled by the owner later the
  // same day**: `hud.regime.roster-emptied` below. The paragraph above is kept
  // rather than rewritten (`docs/AGENT_WORKFLOW.md` §4) because what it
  // records is still exactly right about *this* key -- this sentence is true of
  // one state only, and the fix was a second sentence rather than a wider
  // claim in this one.
  'hud.regime.roster-empty': 'No prisoners yet. Build a cell with a bed to take somebody in.',
  // **The owner ruled this sentence on 2026-09-03**, shown it among candidates
  // and choosing it in their own words: *"This prison is empty. Take somebody
  // in to start again."* It is the sentence the key above has never been able
  // to carry: a prison that admitted people and discharged all of them drew
  // **no line at all** before this, because `regime-panel.ts` gated the box on
  // `everAdmitted` being false and there was no true thing to put there.
  //
  // Same two-part shape as the key above, as ruled -- the state, then the one
  // thing a player can do about it -- and it deliberately does *not* say
  // "build a cell": in this state the cells already exist, which is the whole
  // reason the other sentence could not be reused.
  //
  // **What the second half promises, and what makes the promise good.** "Take
  // somebody in" is the Admit control, and two things had to be true before
  // this sentence could ship. It has to exist wherever the player goes looking:
  // it is on the **Overview** tab, which `hud-state.ts` makes the default, and
  // `intake-panel.ts`'s own header records that placement as chosen so that
  // "the control is the first thing a player sees rather than something to go
  // looking for". And a press that cannot succeed has to *say so* rather than
  // do nothing: since #869 it does -- `hud.refusal.admit-prisoner-no-room`
  // reads *"Nobody was admitted -- this prison has no room to hold anybody."*
  // Without that refusal this sentence would have been an instruction that can
  // silently fail, which is precisely the class `AGENTS.md`'s fourth exclusion
  // reserves to the owner, so it is recorded here as a dependency and not as a
  // coincidence.
  //
  // **One thing this sentence does not solve, recorded rather than hidden.**
  // The sentence is drawn on the **Regime** tab and the control it names is on
  // **Overview**, so a player reads the instruction on one tab and carries it
  // out on another. That is not new and not this ruling's doing -- the key
  // above has the same shape, and the cell it tells a player to build is on the
  // **Build** tab -- but under the owner's standing directive that the game be
  // easy to play rather than a set of hidden features, a sentence that points
  // at a control the player cannot see while reading it is worth naming. Filed
  // rather than fixed here: fixing it means either moving a control or naming a
  // tab in copy, and both are the owner's.
  'hud.regime.roster-emptied': 'This prison is empty. Take somebody in to start again.',

  // What a refused control says (issue #207). Four comments in `src/` claimed
  // the HUD reported a refusal "on the control that was pressed" while the
  // only consumer of the failure was a `console.warn`, so a "Place order" with
  // no session left the HUD byte-identical. No sentence here names a cause:
  // the same refusal is raised for no worker, no session and a session whose
  // command sequence has not been reported yet, and only the outcome is
  // common to all three. The cause travels to the host as the thrown `Error`,
  // which is English diagnostic text and therefore must not reach the screen.
  //
  // One sentence per command and not one generic line, for the reason
  // `HUD_MESSAGE_KEY` gives: each leaves the prison in a different state, and
  // a player who is told "that was refused" without being told *what* was
  // refused has to guess whether their wall is still queued.
  'hud.refusal.set-clock': 'The clock did not change — the request was refused.',
  'hud.refusal.place-build-order': 'The build order was not placed — the request was refused.',
  'hud.refusal.purchase-materials': 'Nothing was bought — the purchase was refused and no money was spent.',
  'hud.refusal.hire-staff': 'Nobody was hired — the request was refused and no money was spent.',
  // The owner's ruling 18 of 2026-08-31, in the owner's own words. Every prison
  // has a standing overdraft (#703 ruling A), so a charge this thread refuses
  // on money has reached the end of what the state will carry rather than run
  // the prison out of money -- and the two sentences above cannot say which,
  // because they are chosen from the control that was pressed.
  //
  // **Ruling 19 of 2026-08-31 made the tail of both of these false below
  // -1,250, and the owner's ruling of 2026-09-01 replaced them.** The
  // paragraph that recorded the defect is kept rather than overwritten: it
  // read *"they are left byte-for-byte ... `judgeAffordability` now refuses at
  // the 'deliveries' rung (`src/ui/affordability.ts`,
  // `HOST_PRESS_FLOOR_MINOR_UNITS`), so the press these sentences answer is
  // refused at -1,250 while the sentence names -2,500. Replacing them is the
  // owner's copy."* It was, and they did.
  //
  // These two are the *host* half of the four keys ruling 19 broke, and they
  // are byte-for-byte identical to the worker half at
  // `hud.alert.refusal.purchase.insufficient-funds` and
  // `hud.alert.refusal.hire.insufficient-funds` above -- ruling 23, *"Te same
  // słowa co host"* -- which is where the whole argument for the new wording
  // is written. `tests/unit/ui-simulation-alerts.test.ts` pins both the
  // equality and the words.
  'hud.refusal.purchase-materials-past-floor': 'Nothing was bought — deliveries are refused until the prison earns the money.',
  'hud.refusal.hire-staff-past-floor': 'Nobody was hired — hiring is refused until the prison earns the money.',
  'hud.refusal.undo': 'Nothing was undone — the request was refused.',
  'hud.refusal.redo': 'Nothing was redone — the request was refused.',
  'hud.refusal.zone-room': 'The room was not designated — the request was refused.',
  'hud.refusal.unzone-room': 'Nothing was removed — the request was refused.',
  'hud.refusal.admit-prisoner': 'Nobody was admitted — the request was refused.',
  /*
   * **The owner's ruling of 2026-09-03.** Until it, a refused Admit said only
   * the generic line above while the real reason went to `console.warn` --
   * `src/main.ts` threw a plain `Error` whose message is diagnostic English
   * that ADR 0011 says deliberately never reaches a player, so nothing on
   * screen named the missing thing (issue #869, whose first filing prescribed
   * the wrong fix and was corrected).
   *
   * Chosen over "there is no bed to put anybody in" and over "build a cell
   * with a bed first": the first names the object rather than the state, and
   * the second is an instruction where every other refusal here describes a
   * state. **The em dash is this file's own punctuation for a refusal** and
   * matches every sibling; the ruling was written with a hyphen only because
   * the question that carried it was.
   */
  'hud.refusal.admit-prisoner-no-room': 'Nobody was admitted — this prison has no room to hold anybody.',
  'hud.refusal.cancel-build-order': 'The order is still queued — the request was refused.',
  // The money is the point, so the sentence leads with it: this line is painted
  // when the host refuses before submitting, which for a cancellation means
  // there is no session at all. The delivery-has-landed case is the
  // simulation's own refusal and reads differently
  // (`hud.alert.refusal.cancel-purchase.not-pending`).
  'hud.refusal.cancel-material-purchase': 'Nothing was refunded — the request was refused and the delivery is still on its way.',
  // This line is painted when the host refuses before submitting, which for a
  // sale means there is no session at all -- `SellMaterials` has no
  // pre-flight check of its own, for `cancel-material-purchase`'s reason
  // above: there is no live stock projection this thread could honestly check
  // a quantity against. A refusal the simulation itself makes reads
  // differently (`hud.alert.refusal.sell.*`).
  'hud.refusal.sell-materials': 'Nothing was sold — the request was refused and nothing was taken from stock.',
  'hud.refusal.release-guard': 'Nobody was released — the request was refused and the guard is still assigned.',

  'hud.rooms.title': 'Rooms',
  // Names both halves of the section it heads: the room-type list, and the
  // coordinate form folded away at its foot (#411). It read "Room type" while
  // the list was all there was.
  'hud.rooms.catalogue': 'Room type and area',
  'hud.rooms.catalogue-empty': 'No room types are available',
  'hud.rooms.selected': 'Selected',
  'hud.rooms.arm': 'Draw on map',
  'hud.rooms.disarm': 'Stop drawing',
  'hud.rooms.arm-hint': 'Drag a rectangle across the tiles this room should cover.',
  'hud.rooms.remove': 'Remove rooms',
  'hud.rooms.remove-active': 'Stop removing',
  // Says what a removal drag actually does, because it is not "clear the tiles
  // you dragged over": each covered tile is resolved to the room containing it
  // and that whole room is cleared, so clipping a corner off a canteen takes
  // the whole canteen. Telling the player that up front is the difference
  // between a rule and a surprise. The sentence is unchanged by issue #337 and
  // the mechanism above is not: removal used to take the connected same-type
  // *run*, which meant "all of it" could reach a second room the player never
  // dragged over -- the one case where this string was a lie.
  'hud.rooms.remove-hint': 'Drag across any part of a room to remove all of it.',
  'hud.rooms.area': 'Area',
  'hud.rooms.area-none': 'Nothing selected',
  'hud.rooms.area-value': '{width} × {height} tiles at {x}, {y}',
  'hud.rooms.confirm': 'Designate {width} × {height}',
  // Its own sentence, because a removal confirm reading "Designate" would name
  // the opposite of what pressing it does.
  'hud.rooms.confirm-remove': 'Remove {width} × {height}',
  'hud.rooms.cancel': 'Discard',
  'hud.rooms.minimum': 'Needs at least {width} × {height} tiles',
  'hud.rooms.minimum-none': 'No minimum size',
  'hud.rooms.too-small': 'Too small — this room needs at least {width} × {height} tiles.',
  'hud.rooms.enclosure': 'Enclosure',
  'hud.rooms.enclosure-none': 'Not evaluated yet',
  /*
   * What `roomPerimeterEnclosure` actually found, and the scope of it
   * ([#1006](https://github.com/matmaxalez/lockstate/issues/1006) finding 2).
   *
   * **This read `'Walled in on every side'` and the words alone were the
   * defect.** They are the pass half of a pass/fail pair, they sit two lines
   * under `MUST BE ENCLOSED`, and a play-test on 2026-09-05 read the three
   * together as "this room is finished" while the block directly above them
   * said *"a door — nobody can get in"*. The clause the comment on
   * `hud.alert.event.rooms.zoned` already carried -- that the panel's *"Walled
   * in on every side"* renders identically for a reachable room and a sealed
   * box (#938) -- was written down and shipped anyway, which is what makes this
   * a rewrite rather than a note.
   *
   * **Authored under `AGENTS.md` reservation 4's partial release of
   * 2026-09-04**, so each half is proved against the code that produces the
   * value being rendered:
   *
   * - *"Walled in"* -- `RoomEnclosure`'s own definition
   *   (`src/simulation/rooms/enclosure.ts`): *"`'sealed'` -- every perimeter
   *   edge holds edge geometry"*, decided in `2 * (width + height)` edge reads
   *   over the rectangle's own boundary. Unchanged in meaning from the sentence
   *   this replaces.
   * - *"not a door check"* -- `roomPerimeterEnclosure` reads
   *   `RoomEdgeReader.getTopEdge`/`getLeftEdge` and **never** the door
   *   registry. That is why `roomPerimeterAccess` beside it exists at all, and
   *   that module says so in its own words: *"a `'sealed'` answer no longer
   *   implies \"no way in\""*, because a completed door order writes
   *   `DOOR_EDGE_NUMERIC_ID` into the same edge slot a wall order writes into.
   *   So this line cannot tell a doorway from a wall, and now says so instead
   *   of leaving the player to infer it.
   *
   * It deliberately does **not** say whether the room has a door. That answer
   * is `hud.rooms.needs-doorway`'s, it is drawn in the block above this one,
   * and it comes from a different function on a different signal -- putting a
   * second copy of it here would be two verdicts to drift.
   *
   * MEASUREMENT PENDING -- see the browser case
   * *"the enclosure readout is drawn whole rather than clipped"* in
   * `tests/browser/ui-shell.spec.ts`, which is what actually holds this to the
   * panel's width.
   */
  'hud.rooms.enclosure-sealed': 'Walled in — not a door check',
  'hud.rooms.enclosure-open': 'Open on at least one side',
  'hud.rooms.requirement-enclosed': 'Must be enclosed',
  'hud.rooms.requirement-outdoors': 'Must be outdoors',
  'hud.rooms.requirement-none': 'No enclosure rule',
  // What the selected room type will need standing in it, before anything is
  // zoned (#529). Deliberately the same opening verb as `hud.rooms.minimum`
  // above, and the same `×` between a count and a thing, so the rule block
  // reads as one series rather than as two kinds of statement stacked. "Needs"
  // and not "Requires": the size line already chose that word, and one block
  // should not ask a player to hold two synonyms for one idea.
  'hud.rooms.requires-object': 'Needs {count} × {object}',
  // `room.yard` authors no object requirement at all. Said out loud for the
  // reason `hud.rooms.minimum-none` is: once every other room type lists its
  // objects, silence reads as a panel that failed rather than as a room that
  // needs nothing.
  'hud.rooms.requires-none': 'No objects needed',
  // The typed route to a rectangle (#411). The wording mirrors the Build
  // panel's own fallback deliberately: the same two sentences answer the same
  // two questions, and a player who has met one has met the other.
  'hud.rooms.coordinates': 'Enter coordinates',
  'hud.rooms.coordinates-hint': 'The keyboard route. Dragging on the map is quicker.',
  // What pressing it does, and it is not "designate": it produces the same
  // rectangle a released drag produces, and the confirm control below still
  // has to be pressed. Naming it "Designate" would promise a designation that
  // the too-small rule may refuse to let happen.
  'hud.rooms.coordinates-submit': 'Use these tiles',
  'hud.rooms.tile-x': 'Tile X',
  'hud.rooms.tile-y': 'Tile Y',
  'hud.rooms.width': 'Width',
  'hud.rooms.height': 'Height',
  'hud.rooms.step-down': 'Decrease {field}',
  'hud.rooms.step-up': 'Increase {field}',
  // What a room the player already designated is still missing. "Not ready"
  // rather than "Incomplete" or "Invalid": the room exists, it is painted on
  // the map and it counts in the status strip -- what it cannot yet do is the
  // job it was designated for.
  'hud.rooms.needs': 'Not ready',
  'hud.rooms.needs-count': '{unfinished} of {total}',
  // Which room the lines under it are about. "is missing" and not "needs",
  // which is `hud.rooms.requires-object`'s word for the room *type*: this is a
  // statement about one rectangle the player actually drew, and the two blocks
  // must not sound like the same claim.
  'hud.rooms.needs-room': '{room} at {x}, {y} is missing',
  // One line per object that room is short, and `{count}` is the SHORTFALL --
  // what is left to build, not what the room asks for in total. A canteen
  // authored for four benches and holding three says "1 × Bench".
  'hud.rooms.needs-object': '{count} × {object}',
  // The same line for the state where the simulation was handed nothing to
  // count with, so no numeral may be shown. See `roomsNeedsObjectUncounted` in
  // `src/ui/hud/messages.ts`: a number here would dress an uncounted answer as
  // a counted one.
  'hud.rooms.needs-object-uncounted': '{object}',
  // Content authored deeper than the panel may draw. Unreachable with the
  // shipped catalogue -- the deepest room is three object requirements -- and
  // present so that a room balanced upward tomorrow truncates honestly instead
  // of silently.
  'hud.rooms.needs-item-more': 'and {count} more',
  // The object catalogue defines nothing under the id this requirement names,
  // which is why the requirement counts as unmet. Substituted where the
  // object's own name would go, so the sentence still ends somewhere.
  'hud.rooms.needs-object-unknown': 'something this build cannot name',
  /*
   * **Authored under the owner's 2026-09-04 release of `AGENTS.md`
   * reservation 4** (issue #938), and every clause of it was proved against
   * code opened for the purpose rather than reasoned about:
   *
   * - *"a door"* -- the projection publishes `access: 'no-way-in'` only from
   *   `roomPerimeterAccess` (`src/simulation/rooms/enclosure.ts`), which
   *   answers it only when every edge on the room's perimeter holds geometry
   *   *and* `DoorRegistry.getByEdge` answers `undefined` for every one of
   *   them. So there is no door in the wall line, and one is what the room is
   *   short.
   * - *"nobody can get in"* -- `src/simulation/navigation/traversal.ts`
   *   states the rule: *"any non-zero value with no registered door is an
   *   impassable wall"*, and *"a registered door decides the edge, whatever
   *   value the edge layer holds ... that is the only reason a doorway is not
   *   a wall"*. `buildNavigationGraph` (`src/simulation/navigation/region-graph.ts`)
   *   applies it in both of its passes -- it `continue`s past such an edge
   *   when flood-filling a region and records no portal for it -- so no route
   *   this repository can produce crosses that boundary, in either direction.
   *
   * What it deliberately does **not** say is that the room is reachable once
   * a door exists: a doorway can open onto a corridor that is itself sealed,
   * which is a region question this signal does not answer.
   * `RoomPerimeterAccess`' own comment records that asymmetry, and it is why
   * this sentence is only ever shown for `'no-way-in'`.
   */
  'hud.rooms.needs-doorway': 'a door — nobody can get in',
  /*
   * **Authored under the owner's 2026-09-04 release of `AGENTS.md`
   * reservation 4** (ADR 0108, issue #1006), and every clause was proved
   * against code opened for the purpose rather than reasoned about. It is the
   * sentence for the state this readout was **silent** in until ADR 0108: a
   * room with a door that nothing can get to. #1001 measured the same seed with
   * and without a way through -- 11,000 against 13,000 income a day, 0 yard
   * ticks, `recreation` 0 permille for 50 of 50 days, and **11,558 route
   * failures against 0** -- so the silence was not a small mis-statement.
   *
   * - *"a way in"* -- what the room is short, and not "a door", which it has.
   *   `roomAccess` (`src/simulation/rooms/reachability.ts`) answers
   *   `'unreachable'` only after `roomPerimeterEnclosure` has called the
   *   perimeter sealed *and* `roomPerimeterHoldsDoor` has found a registered
   *   door on it. A room with no door is `'no-way-in'` and draws
   *   `hud.rooms.needs-doorway` above instead, which is the whole reason these
   *   are two sentences.
   * - *"nothing outside can reach its door"* -- `RoomReachability.reaches`
   *   answered `false`, which means no tile of this room lies in a region the
   *   exterior walk reached. A perimeter door is a `Portal` joining the room's
   *   own region to the region beyond it (`buildNavigationGraph` records one
   *   for every registered door "regardless of its current lock state"), and
   *   `walkPortals` is transitive over `regionPortals` -- so an exterior region
   *   that could reach the far side of that door would have entered the room's
   *   region in the same walk. `false` therefore says exactly that nothing
   *   outside reaches the door, and not merely that the room is awkward.
   *
   * **"Outside" is the exterior ADR 0108 decision 1 defines as amended**: the
   * regions with an open crossing out of the loaded chunk area, falling back to
   * the boundary ring minus every zoned room's rectangle when nothing escapes.
   * It is not a claim about a world beyond the loaded chunks, which this game
   * does not stream; `reachability.ts` carries the two frontier states that
   * definition cannot answer, and neither of them can make this line appear for
   * a room that is in fact reachable -- both fail the other way, towards
   * `'doorway'`.
   *
   * No placeholder, for `hud.rooms.needs-doorway`'s own reason: there is one
   * way in to be short of, and no count makes the sentence more actionable. It
   * sits under the same `hud.rooms.needs-room` header -- "{room} at {x}, {y} is
   * missing" -- so the line completes that sentence.
   */
  'hud.rooms.needs-unreachable': 'a way in — nothing outside can reach its door',
  /*
   * **Authored under the owner's 2026-09-04 release of `AGENTS.md`
   * reservation 4** (ADR 0028 phase 5; issues #997 and #1003). Four strings,
   * and every clause of each was proved against code opened for the purpose:
   *
   * - *"At capacity"* -- the block is drawn with this header only for rooms the
   *   HUD received in `HudRoomNeedsViewModel.atCapacity`, which
   *   `src/ui/simulation-room-needs.ts`'s `fullestUseOf` fills only where a
   *   capability has `inUse >= capacity` and `capacity > 0`. In that state
   *   `RoomInstanceRegistry.claimUse` refuses the next claim -- *"if
   *   (this.useOccupancyOf(instanceId, capability) >= ceiling) return false;"*
   *   -- and `findAvailableForUse` skips the instance on the same comparison.
   *   So the room is at a real ceiling that a real gate enforces, and not at a
   *   readout's idea of one.
   * - *"{room} at {x}, {y} is full"* -- `{room}` is the room type's own
   *   `nameKey` and `{x}, {y}` its `anchorTile`, both the projection's, the
   *   same pair `hud.rooms.needs-room` above already names a room by. *"is
   *   full"* is a claim about a use prisoners are actually making, and that is
   *   provable rather than assumed: the only writers of a use claim are
   *   `claimUse` and `reinstateUseClaim`, both called by `ActionSystem` with
   *   `action.requiredObjectCapability`, so a capability with a non-zero
   *   `inUse` is one some action consumes -- and `inUse >= capacity >= 1`
   *   makes `inUse` non-zero. A room reported here therefore has somebody in
   *   it, doing the thing it is full for.
   * - *"places in use: {inUse} of {capacity}"* -- `{capacity}` is
   *   `RoomInstanceRegistry.concurrentUseCapacityFor`, which is the number
   *   `claimUse` compares against, and `{inUse}` is `useOccupancyOf` scoped to
   *   the same capability, which is the number it compares. Neither is
   *   recomputed on this side of the boundary. *"places"* is this repository's
   *   own word for the quantity (`residentsWithExistingPlace`,
   *   `TILES_PER_OPEN_GROUND_PLACE`, and `src/simulation/economy/income.ts`
   *   paying "per occupied place").
   * - *"{full} of {total}"* -- `{full}` counts the rooms in the projected page
   *   that are in the state above and `{total}` is
   *   `RoomListViewModel.totals.instances`, every registered instance whatever
   *   window was asked for. Exactly the mixture `hud.rooms.needs-count` above
   *   already carries, for the same reason, and `HudRoomNeedsViewModel` states
   *   it.
   *
   * What these deliberately do **not** say:
   *
   * - **Not that the room is full for everything.** A canteen's dining places
   *   and its bench seating are separate ceilings, so *"is full"* is about the
   *   one named on the line below and not about every use of the room. The
   *   sentence names no use, rather than naming one: object capabilities are
   *   simulation ids with no player-facing English anywhere in this tree, and
   *   authoring twelve of them is a content decision this change does not take.
   * - **Not that building more will help, and not how much more.** How many
   *   shower heads fifty prisoners need is balance, reserved to the owner at
   *   #997, and whether a room-served need should have a hard ceiling at all
   *   rather than a queue with a visible wait is #1003 point 4's open question.
   *   These four sentences report the ceiling; they recommend nothing.
   * - **Not that this is why a need is unmet.** Nothing in the simulation
   *   records a per-room refusal -- `ActionMetrics.unmetDemandCycles` and
   *   `contendedSubstitutionCycles` are prison-wide and per-prisoner
   *   respectively, and neither is projected anywhere -- so a sentence
   *   asserting the causal link would be a claim this repository cannot
   *   support. The player is given the two facts and draws it themselves.
   */
  'hud.rooms.at-capacity': 'At capacity',
  'hud.rooms.at-capacity-count': '{full} of {total}',
  'hud.rooms.at-capacity-room': '{room} at {x}, {y} is full',
  'hud.rooms.at-capacity-places': 'places in use: {inUse} of {capacity}',

  'hud.severity.info': 'Info',
  'hud.severity.warning': 'Warning',
  'hud.severity.danger': 'Critical',

  // ---------------------------------------------------------------
  // Save/load panel (`src/ui/save-panel.ts`, registry in
  // `src/ui/save-panel-messages.ts`). Its own namespace rather than `hud.`:
  // the HUD lays the panel out and owns none of it. Every one of these was a
  // hard-coded English literal in the panel until issue #208 -- the one
  // player-facing UI module that no localization gate collected.
  //
  // `{detail}` is a diagnostic, never player copy: it carries an `Error`
  // message thrown in `src/persistence/**`, which is English and untranslated.
  // ADR 0011's separation is what makes that honest -- the sentence around it
  // is translatable, the spliced fragment is not, and a key with a
  // placeholder says so instead of pretending the whole line is copy.
  // ---------------------------------------------------------------
  'save.panel.region': 'Prison saves',
  'save.panel.title': 'Prisons',

  'save.action.create': 'New prison',
  'save.action.save': 'Save now',
  'save.action.export': 'Export',
  'save.action.import': 'Import',
  'save.action.load': 'Load',
  'save.action.delete': 'Delete',
  // The confirmation step's two controls (#1142). They are rendered only
  // while a deletion is armed, so neither is on the page in the panel's
  // resting state.
  'save.action.delete-confirm': 'Delete permanently',
  'save.action.delete-cancel': 'Keep',

  'save.list.empty': 'No prisons yet.',
  'save.list.item': '{name} ({count} gen)',

  'save.status.idle': 'Local saves only — no network required.',
  'save.status.saved': 'Saved (generation {generation}).',
  // Issue #19: quota, private-mode and transaction-abort are distinct
  // recoverable states, so each gets its own advice and neither collapses
  // into "save failed". Both promise that the previous save survived, which
  // is a guarantee `PrisonSaveRepository.save` genuinely provides.
  'save.status.quota-exceeded':
    'Storage is full. Delete an old prison or export and remove saves to free space. Your previous save is intact.',
  'save.status.transaction-aborted':
    'The browser interrupted the save. Your previous save is intact — try saving again.',
  // ADR 0109 Decision 5, ruled by the owner on 2026-09-11 over a warmer
  // alternative. The rejected candidate read "That save is out of date — the
  // game is open somewhere else. Your progress here is safe; try again.", and
  // the half that disqualified it is "your progress here is safe": that is a
  // promise about the player's *memory*, and nothing on the save path
  // verifies it. This sentence makes no claim the code does not keep. It says
  // only what the refusing transaction actually established -- that the slot's
  // durable revision is not the one this session last wrote, i.e. that
  // something else wrote to this prison -- and it is reached only after the
  // single retry of ADR 0109 Decision 4 has already been tried and refused.
  // See `PrisonSaveRepository.writeGeneration`'s comparison and
  // `SessionController.submitSave`.
  'save.status.changed-elsewhere': 'Could not save: this prison was changed elsewhere.',
  'save.status.save-failed': 'Save failed: {detail}',
  // Two different causes reach this line -- storage being unusable at all and
  // a slot record that fails validation -- so the wording names the outcome
  // the player has rather than asserting one of them.
  'save.status.list-unreadable':
    'Could not read the local prison list (private browsing or an unreadable slot record can cause this): {detail}',
  'save.status.creating': 'Creating prison…',
  'save.status.create-failed': 'Could not create a prison: {detail}',
  'save.status.no-active-prison': 'No active prison — create or load one first.',
  'save.status.saving': 'Saving…',
  'save.status.loading': 'Loading…',
  'save.status.not-found': 'That prison no longer exists.',
  'save.status.no-readable-generation':
    'No readable save generation remains for this prison. Every retained copy failed validation.',
  'save.status.recovered': 'The most recent save was unreadable — recovered an earlier verified generation.',
  'save.status.loaded': 'Loaded.',
  'save.status.deleted': 'Prison deleted.',
  // Backing out of the confirmation. It says only what happened, because
  // nothing else did: `pressDeleteConfirmation` never reached `'deletes'`, so
  // `SessionController.deletePrison` was never called.
  'save.status.delete-kept': 'Nothing was deleted.',
  'save.status.nothing-to-export': 'Nothing to export — no valid active save.',
  'save.status.exported': 'Exported the current save.',

  // Import (#287). Five outcomes and five sentences, because the action a
  // player should take differs in each: pick a different file, update the
  // game, or accept that this copy of the save is damaged. `importSave`
  // reports the four refusals apart (`SaveImportResult.rejected`), so
  // flattening them here would discard a distinction the layer below makes.
  'save.status.importing': 'Reading the save file…',
  'save.status.imported': 'Imported the save file into this prison (generation {generation}).',
  'save.status.imported-migrated':
    'Imported a save from an older version of Lockstate and brought it up to date (generation {generation}).',
  'save.status.import-not-a-save': 'That file is not a Lockstate save — choose a file exported from this game.',
  'save.status.import-unsupported-version':
    'That save was written by a newer version of Lockstate than this one. Update the game, then import it again.',
  'save.status.import-corrupt':
    'That save does not match its own checksum — it was damaged or edited after it was exported, so it was not imported.',
  'save.status.import-invalid': 'That save file could not be read: {detail}',

  'save.failure.create': 'Creating the prison failed: {detail}',
  'save.failure.save': 'Saving failed: {detail}',
  'save.failure.load': 'Loading failed: {detail}',
  'save.failure.delete': 'Deleting failed: {detail}',
  'save.failure.export': 'Exporting failed: {detail}',
  'save.failure.import': 'Importing failed: {detail}',
  'save.failure.unknown': 'The action failed: {detail}',

  // `{restored}` and `{notCarried}` are the `save.scope.*` lines below,
  // resolved and joined with `', '` by `describeRestoredScope`
  // (`src/ui/save-panel.ts`). Sentence frame and list items are both catalog
  // entries since #226; before that the frame was localized and the items were
  // English prose spliced in from the simulation.
  'save.detail.restored-scope': 'Restored: {restored}. Not carried by this save version: {notCarried}.',

  // The delete confirmation (#1142), and what makes each clause true.
  //
  // "Every saved copy of this prison goes" -- `PrisonSaveRepository.delete`
  // (`src/persistence/local/repository.ts:467-476`) walks `generationIds` and
  // deletes every generation, then deletes the slot record, in one
  // `readwrite` transaction. Nothing is retained and there is no second copy
  // anywhere: the cloud tier is unreachable from the production import graph
  // (`tests/foundation/trusted-tier-reachability-contract.test.ts`).
  //
  // "this cannot be undone" -- true of this tree as it stands. There is no
  // undo mechanism for a deletion anywhere in `src/`, and the ADR that would
  // decide where a held copy lives has not been written. The day an undo
  // window ships, this clause is the one that becomes false and has to be
  // rewritten in the same change.
  //
  // "Its saves last changed {age}" -- `PrisonSlotMetadata.updatedAt`, which
  // is not the same fact as "last saved"; `describeSaveAge` in
  // `src/ui/save-panel-delete.ts` names the six writers of that field and why
  // the weaker word is the true one.
  'save.delete.confirm':
    'Delete {name}? Every saved copy of this prison goes, and this cannot be undone. Its saves last changed {age}.',
  // `{age}`'s four forms. Abbreviated units, because
  // `src/content/default-locale-en.ts` cannot carry plural forms at all and an
  // abbreviated unit symbol does not inflect for number.
  'save.delete.age.moments': 'less than a minute ago',
  'save.delete.age.minutes': '{count} min ago',
  'save.delete.age.hours': '{count} h ago',
  'save.delete.age.days': '{count} d ago',

  // The thirteen lines a restore report is built from. `CURRENT_SAVE_RESTORED_SCOPE`
  // (`src/simulation/runtime/restore-session.ts`) held these as English prose
  // until #226 and now holds only the keys: ADR 0011 says the simulation tier
  // is the one place translated text may never live.
  //
  // Message keys with no content id behind them, exactly like `save.status.*`.
  // A restore scope describes the save format rather than game content, so
  // `docs/CONTENT.md`'s vocabulary gains nothing here and no id is persisted.
  //
  // **Each string is the one that stood in `restore-session.ts`, character for
  // character.** The owner's decision on #226 was one key per existing string:
  // the wording, and the granularity it implies -- `save.scope.operations` is
  // three subsystems on one line, `save.scope.names` is one -- was moved, not
  // chosen. Regrouping what a restore reports is a product change with its own
  // evidence, deliberately kept separable from this compliance fix. Do not
  // "improve" these sentences here; change the report, if it should change, as
  // its own decision.
  'save.scope.kernel': 'kernel tick and command queue',
  'save.scope.rng-streams': 'RNG stream states',
  'save.scope.world': 'world terrain and ownership',
  'save.scope.construction': 'construction orders and undo/redo',
  'save.scope.entity-liveness': 'entity id liveness',
  'save.scope.prisoners': 'prisoners, needs, actions and cell assignments',
  'save.scope.operations': 'jobs, containers and utility networks',
  'save.scope.security': 'doors, security sectors, guards and patrols',
  'save.scope.contraband': 'contraband, intelligence and searches',
  'save.scope.incidents': 'incidents, gangs and tunnels',
  'save.scope.names': 'prisoner and staff names',
  // The two right-hand entries. Each carries its own parenthetical
  // reassurance, which #226 noted "wants splitting into a label and a
  // reassurance" -- that split is a copy decision and is deliberately not made
  // here: the sentence moves whole.
  'save.scope.room-caches': 'room and topology caches (recomputed from the world)',
  'save.scope.navigation-caches': 'navigation caches and in-flight path requests (re-issued on the next tick)',

  // Semantic input actions (`src/input/actions.ts`). `ActionDefinition.descriptionKey`
  // is typed `input.action.${ActionId}`, so the *shape* was guaranteed and the
  // existence was not: all nine keys that existed then were declared and none
  // was authored anywhere, which is what issue #139's wider completeness gate
  // found. No keybinding or help UI reads them yet -- these are the labels it
  // will read.
  'input.action.camera.up': 'Pan camera up',
  'input.action.camera.down': 'Pan camera down',
  'input.action.camera.left': 'Pan camera left',
  'input.action.camera.right': 'Pan camera right',
  'input.action.camera.zoom.in': 'Zoom in',
  'input.action.camera.zoom.out': 'Zoom out',
  'input.action.selection.primary': 'Select',
  'input.action.build.confirm': 'Confirm placement',
  // Bound in the world, construction and modal contexts, so it is a general
  // cancel rather than a build-specific one.
  'input.action.build.cancel': 'Cancel',
  // `Z` and `Y` (#261). The only handler of the commands these produce is
  // `ConstructionSystem`, so what they reverse today is a build gesture -- but
  // the label says what the key does, not which subsystem happens to answer.
  'input.action.edit.undo': 'Undo',
  'input.action.edit.redo': 'Redo',

  // The brand badge in the top-left corner (`src/ui/brand-badge.ts`). Page
  // chrome rather than a projection of prison state, which is why the namespace
  // is `brand.` and not `hud.`.
  'brand.region': 'Lockstate build',
  // The wordmark, in the catalog rather than as a literal in the DOM builder,
  // for the reason `src/ui/brand-messages.ts` gives.
  'brand.wordmark': 'LockState.io',
  // **Authored, and the only entry here that a build cannot verify.** Nothing in
  // the repository declares a release stage: `docs/TESTING.md` says "during the
  // pre-alpha foundation" and `docs/ROADMAP.md` counts phases without naming
  // one, so this sentence is the claim rather than a reading of one. It has to
  // be changed by hand when the stage changes -- `docs/DEPLOYMENT.md`'s "Build
  // identity" section says so where an operator will see it, next to the two
  // values beside it that cannot go stale this way.
  'brand.stage': 'PRE-ALPHA',
  // `v{version}` and the commit, separated by a middle dot. Both, because the
  // version says what the build claims to be and the commit says which build it
  // is. The version half moves now: `.github/workflows/version.yml` bumps the
  // patch on every merge to `main` and tags the commit `v0.0.N`, which is why
  // the `v` is here -- the tag list and this line spell it the same way, so a
  // bug report can quote either. It did not always: `package.json` sat at
  // `0.0.0` with no tags in the repository, and the commit was the only half
  // that identified anything.
  'brand.build': 'v{version} · {commit}',
  // The whole badge as one sentence, for a screen reader. The visible fragments
  // are `aria-hidden`, because "PRE-ALPHA", "v0.0.7" and seven hex characters
  // read out in sequence name nothing.
  'brand.description': 'Lockstate, {stage} build, version {version}, commit {commit}.',

  // The interface-scale control in the status strip (`src/ui/display-scale.ts`,
  // #545). Page chrome like the brand badge above, hence `display.` and not
  // `hud.`: it changes a browser preference, not anything the simulation has an
  // opinion about.
  //
  // Two entries and no third. What the control shows is the scale itself, and
  // a percentage is a number -- it goes through `formatNumber` with
  // `style: 'percent'`, so the sign, its spacing and the digits follow the
  // player's locale instead of being assembled from an English literal here.
  //
  // "Interface", explicitly, in both. This game also has a camera zoom bound
  // to `+`/`-`, so a name that said only "scale" or "zoom" would leave a
  // player -- and a screen reader -- unable to tell which of the two a control
  // in the status strip changes.
  'display.scale.region': 'Interface scale',
  'display.scale.cycle': 'Change the interface scale',

  // The theme control beside it (`src/ui/theme.ts`, #1157). Same `display.`
  // namespace and the same reason: it changes a browser preference.
  //
  // **"Light" and "Dark" rather than "Day" and "Night"**, although the owner's
  // delivery names the two palettes Day and Night and `docs/VISUAL_IDENTITY.md`
  // follows it. Constitution article 19 says a theme does not change the
  // simulated time of day, and offering a player "Day" while the prison clock
  // reads 23:40 would be the interface claiming something about the world that
  // the code does not do. The palettes keep their names where the reader is a
  // developer and the claim is about colour.
  //
  // "System" is a claim too, and it is kept true by `resolveSystemThemeQuery`:
  // the control follows `prefers-color-scheme` and keeps following it while
  // this option is the selected one.
  'display.theme.region': 'Theme',
  'display.theme.system': 'System',
  'display.theme.light': 'Light',
  'display.theme.dark': 'Dark',
  'display.theme.cycle': 'Change the interface theme',

  // The accessible name of `<main id="app">` -- the whole application, not one
  // region of it, which is why the namespace is `app.` and not `hud.` or
  // `brand.`. It used to be `aria-label="Lockstate game application"` baked
  // into `index.html` itself: correct text, wrong home, because the HTML shell
  // loads before any `Localizer` exists and that string never passed through
  // this catalogue or the pseudo-locale sweep that checks it. `src/main.ts`
  // now sets it here, on the same element, as soon as the localizer is built.
  // The wording is carried across unchanged; see `src/ui/app-shell-messages.ts`.
  'app.shell.label': 'Lockstate game application',
};

/**
 * A derived enum key colliding with an authored one would silently replace a
 * label with another value's text -- the kind of failure that reads as a
 * translation mistake rather than as a bug. Both namespaces are flat, so the
 * only defence is checking, and checking at import time makes it a startup
 * error exactly like the catalogs' own duplicate checks.
 */
const derivedMessages = simulationEnumMessages();
const collidingKeys = Object.keys(derivedMessages).filter((key) => Object.hasOwn(authoredMessages, key));

if (collidingKeys.length > 0) {
  throw new Error(`Derived simulation enum message keys collide with authored default-locale keys: ${collidingKeys.join(', ')}`);
}

export const defaultLocaleEnCatalog = buildLocalizationCatalog({ ...authoredMessages, ...derivedMessages });
