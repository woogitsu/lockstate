import { z } from 'zod';
import { identifierSchema } from '../simulation/protocol/types';
import { defaultObjectRegistry } from './object-catalog';
import { buildContentRegistry, type ContentRegistry, type ContentRegistryError } from './registry';
import { validateRoomObjectReferences } from './validate-catalog';

export const ROOM_CATALOG_SCHEMA_VERSION = 1 as const;

export const roomCategorySchema = z.enum([
  'housing',
  'security',
  'operations',
  'food',
  'hygiene',
  'recreation',
  'education',
  'medical',
  'administration',
  'logistics',
  'utility',
]);
export type RoomCategory = z.infer<typeof roomCategorySchema>;

/**
 * Shape-compatible with `src/simulation/rooms/definition.ts`'s existing
 * `RoomRequirement` (issue #17) -- deliberately the same requirement kinds
 * and fields, so `roomDefinitionFromCatalog`
 * (`src/simulation/rooms/definition.ts`) can convert one into the other
 * without reinterpreting what a requirement means. `objectId` is validated
 * against the real object catalog at load time (see `validate-catalog.ts`)
 * instead of being an untyped string, unlike #17's original.
 */
export const roomRequirementSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('enclosed') }).strict(),
  z.object({ type: z.literal('outdoors') }).strict(),
  z
    .object({
      type: z.literal('minimum-size'),
      minWidth: z.number().int().min(1).max(64),
      minHeight: z.number().int().min(1).max(64),
      minTiles: z.number().int().min(1).max(4_096),
    })
    .strict(),
  z
    .object({
      type: z.literal('object'),
      objectId: identifierSchema,
      minQuantity: z.number().int().min(1).max(64),
    })
    .strict(),
]);
export type RoomRequirementDefinition = z.infer<typeof roomRequirementSchema>;

export const roomDefinitionSchema = z
  .object({
    schemaVersion: z.literal(ROOM_CATALOG_SCHEMA_VERSION),
    id: identifierSchema,
    numericId: z.number().int().min(1).max(255), // zoning storage is a Uint8Array (see rooms/definition.ts)
    nameKey: identifierSchema,
    category: roomCategorySchema,
    /**
     * **An open area: a room whose activity is people spread over its ground
     * rather than people at its furniture.**
     *
     * The owner's ruling of 2026-08-29 on issue #585, which amends
     * [ADR 0071](../../docs/adr/0071-what-bounds-a-room-whose-activity-consumes-no-object.md):
     * capacity derived from a room's own floor area applies *only* to room
     * types tagged here, and the three tagged are `room.yard`,
     * `room.holding-cell` and `room.delivery-bay`. Every other room type
     * derives **0** for an action that consumes no object, rather than
     * `max(1, floor(tiles / 16))`.
     *
     * Authored here and nowhere else, and read through `isOpenAreaRoom`.
     * `RoomInstanceRegistry` may not import a catalogue (ADR 0071 decision 4:
     * the rule "reads only the instance"), so the tag is carried onto the
     * instance at registration -- `RoomInstance.openArea` -- rather than
     * looked up where it is used.
     *
     * Optional, and absent means **not** an open area. "Explicitly tagged" is
     * the owner's own word for the test, and a default of `true` would make
     * every room type added in future an open area by omission -- which is the
     * direction the ruling exists to close.
     */
    openArea: z.boolean().optional(),
    /**
     * **The most prisoners who may *live* in one instance of this room type,
     * whatever it is furnished with.**
     *
     * The owner's ruling of 2026-09-17 on
     * [issue #961](https://github.com/woogitsu/lockstate/issues/961), choosing
     * *"Sufit mieszkańców na typ pomieszczenia w katalogu"* ("a resident
     * ceiling per room type in the catalogue") over a tiles-per-occupant term
     * and over leaving the game a dormitory. It amends
     * [ADR 0028](../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
     * decision 2's `residentCapacity(R)` line, and nothing else in it: the
     * per-capability concurrent-use ceilings, the orientation-blindness, the
     * event-driven resolver and the "nobody is evicted" answer are untouched.
     *
     * ```
     * residentCapacity(R) = min( Σ footprint.width over the sleep surfaces in R,
     *                            maxResidents(type of R) )      -- when authored
     *                     = Σ footprint.width over the sleep surfaces in R
     *                                                           -- when absent
     * ```
     *
     * **What #961 measured, and why a ceiling is the answer to it.** Nothing
     * bounded a room's residents but the beds standing in it, so twelve
     * prisoners went into the starter 6x6 cell with `rooms` still 1 and the
     * rectangle deriving room for about seventeen. A second cell bought the
     * player nothing, which took the only growth decision out of the mid-game.
     *
     * **Each number is read off this file rather than chosen.** The ceiling of
     * a housing type is how many sleep surfaces its own authored
     * `minimum-size` rectangle holds beside the other objects it requires --
     * `object.bed` is 1x2 (two tiles), `object.toilet` 1x1:
     *
     * | type | authored minimum | required besides beds | beds that fit | ceiling |
     * | --- | --- | --- | --- | --- |
     * | `room.cell` | 2x3, 6 tiles | 1 toilet, 1 tile | `floor(5 / 2)` = 2 | **2** |
     * | `room.solitary-cell` | 2x2, 4 tiles | 1 toilet, 1 tile | `floor(3 / 2)` = 1 | **1** |
     *
     * So `room.cell` keeps the pairing `rateCellSharing`
     * (`src/simulation/prisoners/cell-sharing.ts`) exists to rate -- a ceiling
     * of 1 would make that whole module unreachable -- and
     * `room.solitary-cell` keeps the word it is named for, which
     * `PrisonerOperationsRuntime.isServingSolitarySanction` asserts of anybody
     * housed there.
     *
     * **Optional, and absent means no ceiling**, for the reason `openArea`
     * above is optional: a default would author a balance decision for every
     * room type added later by omission. Only the two types an
     * `AccommodationPolicy` houses into carry one
     * (`DEFAULT_ACCOMMODATION_POLICY`, `src/simulation/prisoners/intake-system.ts`);
     * `room.infirmary`'s medical beds reach no arrival, so a ceiling there
     * would move a HUD total and no gameplay, and that is a balance decision
     * with no measurement behind it.
     *
     * Read through the room registry by `RoomCapacityResolver.deriveFor` and
     * authored here and nowhere else. **Not persisted** -- capacity has been
     * derived at restore since ADR 0028 decision 6, so `SAVE_SCHEMA_VERSION`
     * does not move for this and a save written before it loads into the
     * ceiling this build declares.
     */
    maxResidents: z.number().int().min(1).max(64).optional(),
    requirements: z.array(roomRequirementSchema).max(32),
  })
  .strict();

export type RoomCatalogDefinition = z.infer<typeof roomDefinitionSchema>;

const rawRoomDefinitions: readonly RoomCatalogDefinition[] = [
  { schemaVersion: 1, id: 'room.cell', numericId: 1, nameKey: 'room.cell.name', category: 'housing', maxResidents: 2, requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 2, minHeight: 3, minTiles: 6 },
    { type: 'object', objectId: 'object.bed', minQuantity: 1 },
    { type: 'object', objectId: 'object.toilet', minQuantity: 1 },
  ] },
  { schemaVersion: 1, id: 'room.holding-cell', numericId: 2, nameKey: 'room.holding-cell.name', category: 'housing', openArea: true, requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 2, minHeight: 2, minTiles: 4 },
    { type: 'object', objectId: 'object.bench', minQuantity: 1 },
  ] },
  { schemaVersion: 1, id: 'room.solitary-cell', numericId: 3, nameKey: 'room.solitary-cell.name', category: 'security', maxResidents: 1, requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 2, minHeight: 2, minTiles: 4 },
    { type: 'object', objectId: 'object.bed', minQuantity: 1 },
    { type: 'object', objectId: 'object.toilet', minQuantity: 1 },
  ] },
  { schemaVersion: 1, id: 'room.reception', numericId: 4, nameKey: 'room.reception.name', category: 'operations', requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 4, minHeight: 4, minTiles: 16 },
    { type: 'object', objectId: 'object.desk', minQuantity: 1 },
    { type: 'object', objectId: 'object.chair', minQuantity: 2 },
  ] },
  { schemaVersion: 1, id: 'room.kitchen', numericId: 5, nameKey: 'room.kitchen.name', category: 'food', requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 4, minHeight: 4, minTiles: 16 },
    { type: 'object', objectId: 'object.stove', minQuantity: 1 },
    { type: 'object', objectId: 'object.prep-counter', minQuantity: 1 },
    { type: 'object', objectId: 'object.fridge', minQuantity: 1 },
  ] },
  { schemaVersion: 1, id: 'room.canteen', numericId: 6, nameKey: 'room.canteen.name', category: 'food', requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 6, minHeight: 6, minTiles: 36 },
    { type: 'object', objectId: 'object.dining-table', minQuantity: 2 },
    { type: 'object', objectId: 'object.bench', minQuantity: 4 },
  ] },
  { schemaVersion: 1, id: 'room.shower-room', numericId: 7, nameKey: 'room.shower-room.name', category: 'hygiene', requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 3, minHeight: 3, minTiles: 9 },
    { type: 'object', objectId: 'object.shower-head', minQuantity: 2 },
  ] },
  { schemaVersion: 1, id: 'room.laundry', numericId: 8, nameKey: 'room.laundry.name', category: 'hygiene', requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 3, minHeight: 3, minTiles: 9 },
    { type: 'object', objectId: 'object.washing-machine', minQuantity: 2 },
  ] },
  { schemaVersion: 1, id: 'room.yard', numericId: 9, nameKey: 'room.yard.name', category: 'recreation', openArea: true, requirements: [
    { type: 'outdoors' },
    { type: 'minimum-size', minWidth: 8, minHeight: 8, minTiles: 64 },
  ] },
  { schemaVersion: 1, id: 'room.common-room', numericId: 10, nameKey: 'room.common-room.name', category: 'recreation', requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 5, minHeight: 5, minTiles: 25 },
    { type: 'object', objectId: 'object.bench', minQuantity: 2 },
  ] },
  { schemaVersion: 1, id: 'room.classroom', numericId: 11, nameKey: 'room.classroom.name', category: 'education', requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 5, minHeight: 5, minTiles: 25 },
    { type: 'object', objectId: 'object.bookshelf', minQuantity: 1 },
    { type: 'object', objectId: 'object.chair', minQuantity: 4 },
  ] },
  { schemaVersion: 1, id: 'room.infirmary', numericId: 12, nameKey: 'room.infirmary.name', category: 'medical', requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 4, minHeight: 4, minTiles: 16 },
    { type: 'object', objectId: 'object.medical-bed', minQuantity: 1 },
    { type: 'object', objectId: 'object.medicine-cabinet', minQuantity: 1 },
  ] },
  { schemaVersion: 1, id: 'room.security-office', numericId: 13, nameKey: 'room.security-office.name', category: 'security', requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 3, minHeight: 3, minTiles: 9 },
    { type: 'object', objectId: 'object.security-console', minQuantity: 1 },
  ] },
  { schemaVersion: 1, id: 'room.staff-room', numericId: 14, nameKey: 'room.staff-room.name', category: 'administration', requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 3, minHeight: 3, minTiles: 9 },
    { type: 'object', objectId: 'object.desk', minQuantity: 1 },
    { type: 'object', objectId: 'object.chair', minQuantity: 2 },
  ] },
  { schemaVersion: 1, id: 'room.storage-room', numericId: 15, nameKey: 'room.storage-room.name', category: 'logistics', requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 3, minHeight: 3, minTiles: 9 },
    { type: 'object', objectId: 'object.storage-rack', minQuantity: 2 },
  ] },
  { schemaVersion: 1, id: 'room.delivery-bay', numericId: 16, nameKey: 'room.delivery-bay.name', category: 'logistics', openArea: true, requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 4, minHeight: 4, minTiles: 16 },
    { type: 'object', objectId: 'object.loading-dock-door', minQuantity: 1 },
  ] },
  { schemaVersion: 1, id: 'room.garbage-room', numericId: 17, nameKey: 'room.garbage-room.name', category: 'logistics', requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 2, minHeight: 2, minTiles: 4 },
    { type: 'object', objectId: 'object.waste-bin', minQuantity: 2 },
  ] },
  { schemaVersion: 1, id: 'room.utility-room', numericId: 18, nameKey: 'room.utility-room.name', category: 'utility', requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 2, minHeight: 2, minTiles: 4 },
    { type: 'object', objectId: 'object.utility-panel', minQuantity: 1 },
  ] },
];

export function loadRoomCatalog(
  entries: readonly unknown[] = rawRoomDefinitions,
): { readonly registry: ContentRegistry<RoomCatalogDefinition>; readonly errors: readonly (ContentRegistryError | { readonly kind: 'schema'; readonly index: number; readonly issues: readonly string[] })[] } {
  const parsed: RoomCatalogDefinition[] = [];
  const schemaErrors: { readonly kind: 'schema'; readonly index: number; readonly issues: readonly string[] }[] = [];

  entries.forEach((raw, index) => {
    const result = roomDefinitionSchema.safeParse(raw);
    if (result.success) {
      parsed.push(result.data);
    } else {
      schemaErrors.push({ kind: 'schema', index, issues: result.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`) });
    }
  });

  const { registry, errors: registryErrors } = buildContentRegistry(parsed);
  return { registry, errors: [...schemaErrors, ...registryErrors] };
}

export const defaultRoomCatalog = loadRoomCatalog();

if (defaultRoomCatalog.errors.length > 0) {
  throw new Error(`Default room catalog failed validation: ${JSON.stringify(defaultRoomCatalog.errors)}`);
}

export const defaultRoomContentRegistry = defaultRoomCatalog.registry;

/**
 * The room type a newcomer is first told to build (#935).
 *
 * `hud.regime.roster-empty` -- the only instruction a prison with nobody in it
 * draws -- says *"Build a cell"*, and
 * `tests/foundation/cell-instruction-requirement-contract.test.ts` pins that
 * sentence against **this** definition's authored requirements. The Rooms
 * panel opens on the same id (`HudRoomsViewModel.initialRoomId`, set by
 * `roomCatalogue()` in `src/main.ts`), so the requirement block a player reads
 * first is the one for the room the instruction names -- and not, as #921 and
 * #935 measured, *Staff Room*'s desk and chairs, which is what the panel's
 * `(category, id)` order put first.
 *
 * One declaration read by both the contract test and the composition root, so
 * the room the sentence is checked against and the room the panel opens on
 * cannot name two different types. The contract test also requires that this
 * id is declared in the shipped catalogue.
 */
export const FIRST_CELL_ROOM_ID = 'room.cell';

/**
 * Whether `roomCatalogId` names a room type the owner tagged as an open area
 * (see `roomDefinitionSchema.openArea`).
 *
 * One function rather than the same `?.openArea === true` at each registration
 * site, so the two places that carry the tag onto a `RoomInstance` --
 * `RoomZoningService.zone` for a live zoning and `restoreSessionSystems` for a
 * save -- cannot come to disagree about what the tag means. An unknown id is
 * not an open area, for the same reason an absent tag is not: a row that names
 * a room type this build does not declare can only come from a save, and
 * inventing floor-area capacity for one would be asserting a room nobody can
 * see.
 */
export function isOpenAreaRoom(roomCatalogId: string): boolean {
  return defaultRoomContentRegistry.getById(roomCatalogId)?.openArea === true;
}

/**
 * The cross-catalog half of the same import-time check, next to the registry
 * it validates rather than in the barrel `src/content/index.ts`, which is
 * where it lived until #315.
 *
 * `validate-catalog.ts` says what the check is and what a dangling
 * room-to-object reference costs. What #315 established is *where it has to
 * run*. In the barrel it did not run in the shipped build at all: the barrel
 * has one importer under `src/` (`src/simulation/rooms/definition.ts`), whose
 * own only importer is a test, so the module never entered the production
 * graph and the bundler dropped it. Measured in the artefact before this
 * moved -- `dist/assets/index-*.js` carried each catalog's own
 * "Default room catalog failed validation" / "Default object catalog failed
 * validation" throw and not one occurrence of "cross-reference validation".
 * The guarantee two sentences claimed was absent exactly where it mattered:
 * a build with a dangling reference booted and broke later.
 *
 * Here it cannot be dropped or bypassed, because every reader of
 * `defaultRoomContentRegistry` imports this module -- the same arrangement
 * `src/simulation/construction/definition.ts` uses for its
 * buildable-to-object and buildable-to-item checks, which are in the bundle
 * for that reason. Measured cost of running it in production, rather than
 * assumed: 26 object requirements across 18 rooms against 20 objects,
 * 0.12-0.18 ms for the first, cold, un-warmed call in each of five fresh
 * processes, and +327 bytes minified / +108 gzipped on the client chunk, plus
 * the same again on the simulation worker chunk, which imports this module too
 * (+326 / +93). Deltas rather than absolute chunk sizes, because those go
 * stale within a release; the PR for #315 records both against its merge base.
 */
const defaultCrossReferenceErrors = validateRoomObjectReferences(defaultRoomContentRegistry, defaultObjectRegistry);

if (defaultCrossReferenceErrors.length > 0) {
  throw new Error(`Default content catalogs failed cross-reference validation: ${JSON.stringify(defaultCrossReferenceErrors)}`);
}
