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
  // key, and no rate, budget or forecast key, because nothing *debits* the
  // treasury on a schedule and nothing projects forward --
  // `tests/unit/ui-hud-messages.test.ts` is the gate that keeps it that way.
  // ---------------------------------------------------------------
  'hud.status.title': 'Prison status',
  'hud.status.prisoners': 'Prisoners',
  'hud.status.staff': 'Staff',
  'hud.status.rooms': 'Rooms',
  'hud.status.incidents': 'Incidents',
  'hud.status.contraband': 'Contraband',
  // The treasury balance (#96). "Funds" names no currency on purpose: #96
  // settled that money is primary and did not name a unit, and the number is
  // shown as a plain count of the units the simulation holds it in rather
  // than converted into a major unit nobody has chosen yet.
  'hud.status.funds': 'Funds',
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
  'hud.alert.refusal.build.out-of-bounds': 'The build order failed — that tile is outside the map.',
  'hud.alert.refusal.build.unbuildable': 'The build order failed — nothing can be built on that tile.',
  'hud.alert.refusal.build.unbuildable-terrain': 'The build order failed — the ground there cannot be built on.',
  'hud.alert.refusal.build.unowned-land': 'The build order failed — you do not own that land.',
  'hud.alert.refusal.build.water-blocked': 'The build order failed — there is water on that tile.',
  'hud.alert.refusal.purchase.duplicate-order': 'The materials were not ordered — that order already exists.',
  'hud.alert.refusal.purchase.insufficient-funds': 'The materials were not ordered — there are not enough funds.',
  'hud.alert.refusal.purchase.invalid-quantity': 'The materials were not ordered — that quantity cannot be bought.',
  'hud.alert.refusal.purchase.unknown-material': 'The materials were not ordered — that material is not for sale.',
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

  // A browser that cannot start a Worker gets a page with no simulation
  // behind it. Saying so is the whole point: the failure was previously
  // reported to the console only, so the player saw an empty world and had
  // no way to learn why (issue #82).
  //
  // Namespaced `hud.unavailable.*` rather than `hud.alerts.*`, because it is
  // not rendered in the alerts list: it goes to the HUD's own always-laid-out
  // band, `.hud__unavailable` (issue #220). In the alerts list it was in the
  // DOM and painted at no viewport, because that section starts folded.
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
  'hud.build.disarm': 'Stop placing',
  'hud.build.arm-hint': 'Click a tile edge to place a wall. Drag along it to lay a run. Two fingers, the middle button or the arrow keys still move the camera.',
  'hud.build.target-none': 'Point at the world',
  'hud.build.target-value': '{x}, {y} · {edge}',
  'hud.build.target-run': '{count} × {edge} from {x}, {y}',
  'hud.build.coordinates': 'Enter coordinates',
  'hud.build.coordinates-hint': 'The keyboard route. Pointing at the map is quicker.',
  'hud.build.buy': 'Buy',
  'hud.build.buy-quantity': 'Quantity',
  'hud.build.buy-submit': 'Buy {count} × {material} · {total}',
  'hud.build.buy-hint': 'Arrives while the clock runs, into the stock a build draws from.',
  'hud.build.buildable.wall-brick': 'Brick wall',
  'hud.build.buildable.door-wooden': 'Wooden door',

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
  'hud.refusal.undo': 'Nothing was undone — the request was refused.',
  'hud.refusal.redo': 'Nothing was redone — the request was refused.',
  'hud.refusal.zone-room': 'The room was not designated — the request was refused.',
  'hud.refusal.unzone-room': 'Nothing was removed — the request was refused.',

  'hud.rooms.title': 'Rooms',
  'hud.rooms.catalogue': 'Room type',
  'hud.rooms.catalogue-empty': 'No room types are available',
  'hud.rooms.selected': 'Selected',
  'hud.rooms.arm': 'Draw on map',
  'hud.rooms.disarm': 'Stop drawing',
  'hud.rooms.arm-hint': 'Drag a rectangle across the tiles this room should cover.',
  'hud.rooms.remove': 'Remove rooms',
  'hud.rooms.remove-active': 'Stop removing',
  // Says what a removal drag actually does, because it is not "clear the tiles
  // you dragged over": each covered tile is grown into its whole connected
  // same-type run before anything is cleared, so clipping a corner off a
  // canteen takes the whole canteen. Telling the player that up front is the
  // difference between a rule and a surprise.
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
  // The one combination worth flagging rather than merely reporting: the room
  // asked to be enclosed and its perimeter is not walled. It is not a refusal,
  // and the sentence must not read as one -- the check is narrower than
  // enclosure and a door cannot currently seal anything, so a room that is
  // genuinely indoors can read open here.
  'hud.rooms.enclosure-open-required': 'This room should be enclosed, and the area you drew is open on at least one side.',
  'hud.rooms.requirement-enclosed': 'Must be enclosed',
  'hud.rooms.requirement-outdoors': 'Must be outdoors',
  'hud.rooms.requirement-none': 'No enclosure rule',

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
