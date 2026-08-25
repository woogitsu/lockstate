import { z } from 'zod';
import type { JsonValue } from '../../shared/json';
import { BUILD_EDGES } from '../construction/build-order';
import { MAX_PURCHASE_QUANTITY } from '../economy';
import { MAX_PRIOR_INCIDENTS, MAX_SENTENCE_LENGTH_TICKS } from '../prisoners/components';
import { MAX_ZONE_DIMENSION_TILES } from '../rooms/zoning';
import { identifierSchema, type VersionedPayload } from './types';

/**
 * `edge` is optional, and stays optional.
 *
 * Two reasons, and both are about not breaking something already written
 * down. A pending `PlaceBuildOrder` is part of the kernel's command queue,
 * which a session snapshot carries verbatim -- so a save taken before this
 * field existed can hold a queued command without it, and a required field
 * would make that save unrestorable. And the field is read through
 * `resolveBuildEdge`, whose default is documented on `DEFAULT_BUILD_EDGE`.
 *
 * Optional is not lax: `z.enum` rejects any value that is not one of the two
 * canonical edges, so a malformed orientation fails
 * `simulationCommandSchema` and `unpackCommand` returns `null` rather than
 * letting a nonsense string reach the construction system.
 */
export const placeBuildOrderSchema = z.object({
  type: z.literal('PlaceBuildOrder'),
  orderId: z.string(),
  definitionId: z.string(),
  x: z.number().int(),
  y: z.number().int(),
  edge: z.enum(BUILD_EDGES).optional(),
  transactionId: z.string().optional(),
}).strict();

export const cancelBuildOrderSchema = z.object({
  type: z.literal('CancelBuildOrder'),
  orderId: z.string(),
}).strict();

export const zoneRoomSchema = z.object({
  type: z.literal('ZoneRoom'),
  roomId: z.string(),
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
  transactionId: z.string().optional(),
}).strict();

/**
 * Clear the room designations a rectangle touches (#261's removal half).
 *
 * A rectangle and no room id, because removal names no room type: what comes
 * out is whatever is there. `RoomZoningService.unzone` grows each covered
 * zoned tile into its connected same-type run before clearing, and its own
 * comment states both consequences of that.
 *
 * It carries no `transactionId`, where `ZoneRoom` has an optional one. Neither
 * command produces a construction order, so `ConstructionSystem` has nothing
 * to group either of them under and `Undo` cannot reach either -- which is
 * exactly why removal is a command of its own rather than a use of undo. The
 * field is on `ZoneRoom` because it was declared before any of that was
 * settled, and a queued command in an existing save may carry it; adding a
 * second unread field would be inventing a second one to explain.
 *
 * Both dimensions are bounded here as well as in the service, for the reason
 * `PurchaseMaterials.quantity` is: this schema stops a malformed message
 * reaching the system, and the service stops one arriving from a restored
 * save's queue that never passed through this schema again. `ZoneRoom` bounds
 * neither and is left as it is -- tightening it would change what an existing
 * queued command decodes to, which is a save-compatibility change rather than
 * a validation fix.
 */
export const unzoneRoomSchema = z.object({
  type: z.literal('UnzoneRoom'),
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive().max(MAX_ZONE_DIMENSION_TILES),
  height: z.number().int().positive().max(MAX_ZONE_DIMENSION_TILES),
}).strict();

/**
 * Buy materials (#96, #89).
 *
 * `orderId` is the caller's, like `PlaceBuildOrder`'s: the main thread mints
 * it so a refusal can be matched to the request that caused it, and so a
 * command replayed from a restored queue cannot buy the same delivery twice --
 * `ProcurementSystem.purchase` refuses a duplicate id.
 *
 * `quantity` is bounded here as well as in the system. The system's bound
 * stops an overflow; this one stops a malformed message reaching it at all,
 * which is the decode-side half `decode.ts` exists for. Neither is redundant:
 * a command can arrive from a restored save's queue without passing through
 * this schema again.
 *
 * ## Why `orderId` and `itemId` are `identifierSchema` and not `z.string()`
 *
 * Because the *save* boundary already requires it of the same two values, and
 * a disagreement between the two boundaries is not a stricter check -- it is a
 * window. `save-schema.ts`'s `economySectionSchema` types a pending delivery's
 * `orderId` and `itemId` as `identifierSchema`, and `createSaveEnvelope`
 * parses and throws. So while these were `z.string()`, this sequence was
 * reachable: a command carrying `orderId: '_bad id'` decoded cleanly, the
 * kernel dispatched it, the delivery entered the procurement queue, and the
 * next save attempt threw on a path the player has no way to connect to
 * anything -- and then started working again by itself once the delivery
 * landed and left the queue. An intermittent unreproducible save failure,
 * from a validation gap.
 *
 * Refusing the id here means it never reaches the queue, which is the only
 * place a fix can put the failure next to its cause. It also costs no
 * existing save: no code in `src/` mints a purchase command at all yet
 * (#89), and any session that had accepted a loose id could not have been
 * saved anyway.
 *
 * `PlaceBuildOrder.orderId` is deliberately left as `z.string()`. Its
 * save-side counterpart (`buildOrderSchema`) is `z.string().min(1)`, which is
 * looser than this schema rather than stricter, so there is no disagreement
 * there to close and tightening it would be a change with no defect behind
 * it.
 */
export const purchaseMaterialsSchema = z.object({
  type: z.literal('PurchaseMaterials'),
  orderId: identifierSchema,
  itemId: identifierSchema,
  quantity: z.number().int().positive().max(MAX_PURCHASE_QUANTITY),
}).strict();

/**
 * Admit one prisoner (#261 step 4).
 *
 * ## What it carries, and what it deliberately does not
 *
 * `sentenceLengthTicks` and `priorIncidents` are `ClassificationInput`
 * (`src/simulation/prisoners/classification.ts`) and nothing else: the two
 * figures `classifyPrisoner` reads. The risk tier, the classification group
 * and the prisoner's name are **not** here and must never be -- they are
 * drawn inside the simulation from the `prisoners.classification` and
 * `identity.actor-name` streams at the intake stages that own them, so the
 * same command at the same tick of the same seed produces the same prisoner.
 * A command that carried a name or a tier would be the main thread deciding
 * simulation state, and `crypto.randomUUID()` is not a seeded stream.
 *
 * `x`/`y` are the tile the arrival stands on, in the same shape `ZoneRoom`
 * and `PlaceBuildOrder` carry a tile. The composition root supplies the
 * middle of the one owned chunk -- the same origin the Build panel's numeric
 * fields start at -- because nothing in `PrisonerOperationsRuntime` derives a
 * reception point and inventing one here would be a simulation decision made
 * in a schema.
 *
 * ## No id, unlike `PlaceBuildOrder` and `PurchaseMaterials`
 *
 * Both of those mint one because something downstream is *keyed* by it: an
 * order id names the order a later command cancels, and a purchase id is
 * what `ProcurementSystem.purchase` refuses a duplicate of, so a replayed
 * command must not buy the same delivery twice. Nothing is keyed by an
 * admission. `EntityStore.spawn` allocates the identity, and a queued
 * `AdmitPrisoner` restored from a save *should* admit when it is dispatched
 * -- it had not run yet. An id here would be a field with no reader.
 *
 * ## The bounds are the components', not a taste
 *
 * `sentenceLengthTicks` is written into a `Uint32Array`
 * (`PrisonerRecordComponent.sentenceLengthTicks`) and added to `context.tick`
 * to form `sentenceEndTick` in another, so it is bounded here at the same
 * ceiling the save's own `tickSchema` uses rather than left to wrap.
 * `priorIncidents` is a `Uint8Array` slot and `submitIntake` already clamps
 * it with `Math.min(255, ...)`; refusing an out-of-range value at the
 * boundary means the clamp never has to silently rewrite what a player asked
 * for.
 */
export const admitPrisonerSchema = z.object({
  type: z.literal('AdmitPrisoner'),
  sentenceLengthTicks: z.number().int().positive().max(MAX_SENTENCE_LENGTH_TICKS),
  priorIncidents: z.number().int().min(0).max(MAX_PRIOR_INCIDENTS),
  x: z.number().int(),
  y: z.number().int(),
}).strict();

export const undoCommandSchema = z.object({
  type: z.literal('Undo'),
}).strict();

export const redoCommandSchema = z.object({
  type: z.literal('Redo'),
}).strict();

export const simulationCommandSchema = z.discriminatedUnion('type', [
  placeBuildOrderSchema,
  cancelBuildOrderSchema,
  zoneRoomSchema,
  unzoneRoomSchema,
  purchaseMaterialsSchema,
  admitPrisonerSchema,
  undoCommandSchema,
  redoCommandSchema,
]);

export type SimulationCommand = z.infer<typeof simulationCommandSchema>;

function commandJson(command: SimulationCommand): JsonValue {
  switch (command.type) {
    case 'PlaceBuildOrder':
      return {
        type: command.type,
        orderId: command.orderId,
        definitionId: command.definitionId,
        x: command.x,
        y: command.y,
        ...(command.edge === undefined ? {} : { edge: command.edge }),
        ...(command.transactionId === undefined
          ? {}
          : { transactionId: command.transactionId }),
      };

    case 'CancelBuildOrder':
      return { type: command.type, orderId: command.orderId };

    case 'ZoneRoom':
      return {
        type: command.type,
        roomId: command.roomId,
        x: command.x,
        y: command.y,
        width: command.width,
        height: command.height,
        ...(command.transactionId === undefined
          ? {}
          : { transactionId: command.transactionId }),
      };

    case 'UnzoneRoom':
      return {
        type: command.type,
        x: command.x,
        y: command.y,
        width: command.width,
        height: command.height,
      };

    case 'PurchaseMaterials':
      return {
        type: command.type,
        orderId: command.orderId,
        itemId: command.itemId,
        quantity: command.quantity,
      };

    case 'AdmitPrisoner':
      return {
        type: command.type,
        sentenceLengthTicks: command.sentenceLengthTicks,
        priorIncidents: command.priorIncidents,
        x: command.x,
        y: command.y,
      };

    case 'Undo':
    case 'Redo':
      return { type: command.type };
  }
}

export function packCommand(command: SimulationCommand): VersionedPayload {
  const parsed = simulationCommandSchema.parse(command);

  return {
    schemaId: 'lockstate.simulation.command',
    schemaVersion: 1,
    transport: 'structured-clone',
    data: commandJson(parsed),
  };
}

export function unpackCommand(payload: VersionedPayload): SimulationCommand | null {
  if (payload.schemaId !== 'lockstate.simulation.command') return null;
  const result = simulationCommandSchema.safeParse(payload.data);
  return result.success ? result.data : null;
}
