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
  'hud.status.incidents': 'Incidents',
  'hud.status.coverage': 'Coverage',
  'hud.status.contraband': 'Contraband',
  // The treasury balance (#96). "Funds" names no currency on purpose: #96
  // settled that money is primary and did not name a unit, and the number is
  // shown as a plain count of the units the simulation holds it in rather
  // than converted into a major unit nobody has chosen yet.
  'hud.status.funds': 'Funds',
  // How much of the standing overdraft is left, under the balance while it is
  // negative (the owner's ruling 18 of 2026-08-31, in the owner's own words).
  // No unit and no currency, for the same reason the label above names none:
  // the number is in the minor units the simulation holds, and the chip's own
  // figure is beside it in the same units.
  'hud.status.funds-remaining': '{remaining} left',
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
  'hud.clock.speed': 'Speed {speed}x',
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

  'hud.minimap.title': 'Minimap',
  'hud.minimap.placeholder': 'Minimap is not available yet',
  'hud.alerts.title': 'Alerts',
  'hud.alerts.empty': 'No active alerts',

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
  'hud.alert.refusal.hire.insufficient-funds': 'Nobody was hired — that would go past what the state will carry.',
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
  'hud.alert.refusal.purchase.insufficient-funds': 'Nothing was bought — that would go past what the state will carry.',
  'hud.alert.refusal.purchase.invalid-quantity': 'The materials were not ordered — that quantity cannot be bought.',
  'hud.alert.refusal.purchase.unknown-material': 'The materials were not ordered — that material is not for sale.',
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
  // anyway. The band exists because a browser that cannot start a worker has
  // no simulation to log events from at all, which is a stronger reason than
  // the fold ever was: an empty list, open or shut, says nothing.
  'hud.unavailable.simulation': 'Simulation unavailable — this browser could not start it, so nothing can run or be saved',

  'hud.panel.collapse': 'Collapse',
  'hud.panel.expand': 'Expand',

  'hud.build.title': 'Build',
  'hud.build.catalogue': 'What to build',
  'hud.build.catalogue-empty': 'Nothing is available to build',
  'hud.build.selected': 'Selected',
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
   * **`remove-hint` IS FALSE AS OF 2026-08-31 AND NO REPLACEMENT IS WRITTEN
   * HERE, BECAUSE COPY IS THE OWNER'S** (`AGENTS.md`'s fourth exclusion). The
   * owner's ruling 20 -- *"Anulowanie zwraca pieniądze zamiast cegieł"* and
   * *"Pieniądze dopóki ekipa nie zaczęła"*, recorded in
   * [ADR 0076](../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)'s
   * amendment of that date -- makes a cancelled order give back **money**
   * rather than materials, and give back **nothing** once the crew has started
   * it. So *"its materials come back"* names the wrong currency, and the
   * sentence has no clause at all for the case where nothing comes back. The
   * second half, *"a finished one is not refunded"*, is still true.
   *
   * It is left standing rather than deleted for the reason a wrong sentence
   * beats no sentence on a control that takes something away: removing it would
   * leave the *Remove* tool with nothing said about it at all. Reported to the
   * owner with the branch that made it false.
   */
  'hud.build.remove': 'Remove',
  'hud.build.remove-active': 'Stop removing',
  'hud.build.remove-hint': 'Press any tile of an object to take it away. One still being built is cancelled and its materials come back; a finished one is not refunded.',
  'hud.build.remove-submit': 'Remove object here',
  'hud.build.disarm': 'Stop placing',
  'hud.build.arm-hint': 'Click a tile edge to place a wall. Drag along it to lay a run. Two fingers, the middle button or the arrow keys still move the camera.',
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
   * player to do something. `{total}` is what the queue could not buy, in the
   * same minor units as `hud.status.funds`, so the two numbers on screen read
   * against each other with nobody having chosen a currency.
   *
   * **Authored by the owner, 2026-08-30, and verbatim.** The words on this line
   * are not an agent's: the sentence #640 needed did not exist, the gap was
   * reported rather than filled, and this is the answer that came back. It
   * names no material on purpose, which is why the view model that feeds it
   * carries two scalars and not the projection's per-item list.
   */
  'hud.build.queue': 'Queued',
  'hud.build.queue-count': '{count} waiting · {started} being built',
  'hud.build.queue-order': '{buildable} · {x}, {y} · {edge}',
  'hud.build.queue-cancel': 'Cancel',
  'hud.build.queue-unnamed': 'Unnamed order',
  'hud.build.queue-more': 'and {count} more behind these — undo takes back a whole run.',
  'hud.build.queue-shortfall': 'Waiting for {total} to buy materials.',
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
  'hud.security.hire-hint': 'Costs {total} now and {wage} a day in wages.',
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
  'hud.security.coverage-met-hint': 'This prison has the guards it asks for.',
  'hud.security.coverage-short': 'Understaffed',
  'hud.security.coverage-short-hint': 'Hire {count} more to cover this population.',
  'hud.security.coverage-unguarded': 'Unguarded',
  'hud.security.coverage-unguarded-hint': 'Nobody is on duty. Hire {count} to cover this population.',

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
  // Not "No prisoners": an empty prison is the state every new game starts in
  // and the Overview tab has the control that ends it, so the line says where
  // to go rather than restating the count above it.
  'hud.regime.roster-empty': 'Nobody has been admitted yet.',

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
  'hud.refusal.purchase-materials-past-floor': 'Nothing was bought — that would go past what the state will carry.',
  'hud.refusal.hire-staff-past-floor': 'Nobody was hired — that would go past what the state will carry.',
  'hud.refusal.undo': 'Nothing was undone — the request was refused.',
  'hud.refusal.redo': 'Nothing was redone — the request was refused.',
  'hud.refusal.zone-room': 'The room was not designated — the request was refused.',
  'hud.refusal.unzone-room': 'Nothing was removed — the request was refused.',
  'hud.refusal.admit-prisoner': 'Nobody was admitted — the request was refused.',
  'hud.refusal.cancel-build-order': 'The order is still queued — the request was refused.',
  // The money is the point, so the sentence leads with it: this line is painted
  // when the host refuses before submitting, which for a cancellation means
  // there is no session at all. The delivery-has-landed case is the
  // simulation's own refusal and reads differently
  // (`hud.alert.refusal.cancel-purchase.not-pending`).
  'hud.refusal.cancel-material-purchase': 'Nothing was refunded — the request was refused and the delivery is still on its way.',
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
  'hud.rooms.enclosure-sealed': 'Walled in on every side',
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
