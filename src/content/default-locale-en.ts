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
  // (ADR 0011). No money, funds or cost keys exist -- there is no economy
  // system yet, and a string is where a fake number starts.
  // ---------------------------------------------------------------
  'hud.status.title': 'Prison status',
  'hud.status.prisoners': 'Prisoners',
  'hud.status.staff': 'Staff',
  'hud.status.rooms': 'Rooms',
  'hud.status.incidents': 'Incidents',
  'hud.status.contraband': 'Contraband',
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

  'hud.minimap.title': 'Minimap',
  'hud.minimap.placeholder': 'Minimap is not available yet',
  'hud.alerts.title': 'Alerts',
  'hud.alerts.empty': 'No active alerts',

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
  'hud.build.buildable.wall-brick': 'Brick wall',
  'hud.build.buildable.door-wooden': 'Wooden door',

  // What a refused control says (issue #207). Four comments in `src/` claimed
  // the HUD reported a refusal "on the control that was pressed" while the
  // only consumer of the failure was a `console.warn`, so a "Place order" with
  // no session left the HUD byte-identical. Neither sentence names a cause:
  // the same refusal is raised for no worker, no session and a session whose
  // command sequence has not been reported yet, and only the outcome is
  // common to all three. The cause travels to the host as the thrown `Error`,
  // which is English diagnostic text and therefore must not reach the screen.
  'hud.refusal.set-clock': 'The clock did not change — the request was refused.',
  'hud.refusal.place-build-order': 'The build order was not placed — the request was refused.',

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

  'save.failure.create': 'Creating the prison failed: {detail}',
  'save.failure.save': 'Saving failed: {detail}',
  'save.failure.load': 'Loading failed: {detail}',
  'save.failure.delete': 'Deleting failed: {detail}',
  'save.failure.export': 'Exporting failed: {detail}',
  'save.failure.unknown': 'The action failed: {detail}',

  // `{restored}` and `{notCarried}` are lists of scope identifiers joined by
  // `src/ui/save-panel.ts`. They are English prose owned by
  // `src/simulation/runtime/restore-session.ts` and are **not** localized --
  // see `describeRestoredScope`, which records why that is a separate change.
  'save.detail.restored-scope': 'Restored: {restored}. Not carried by this save version: {notCarried}.',

  // Semantic input actions (`src/input/actions.ts`). `ActionDefinition.descriptionKey`
  // is typed `input.action.${ActionId}`, so the *shape* was guaranteed and the
  // existence was not: all nine keys were declared and none was authored
  // anywhere, which is what issue #139's wider completeness gate found. No
  // keybinding or help UI reads them yet -- these are the labels it will read.
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
  // is -- and today `package.json` is at `0.0.0` with no tags in the
  // repository, so the commit is the half that identifies anything.
  'brand.build': 'v{version} · {commit}',
  // The whole badge as one sentence, for a screen reader. The visible fragments
  // are `aria-hidden`, because "PRE-ALPHA", "v0.0.0" and seven hex characters
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
