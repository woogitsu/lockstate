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
  'hud.alerts.simulation-unavailable': 'Simulation unavailable — this browser could not start it, so nothing can run or be saved',

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

  'hud.severity.info': 'Info',
  'hud.severity.warning': 'Warning',
  'hud.severity.danger': 'Critical',

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
