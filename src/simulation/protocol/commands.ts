import { z } from 'zod';
import type { JsonValue } from '../../shared/json';
import { BUILD_EDGES } from '../construction/build-order';
import { MAX_PURCHASE_QUANTITY } from '../economy';
import { MAX_PRIOR_INCIDENTS, MAX_SENTENCE_LENGTH_TICKS } from '../prisoners/components';
import { MAX_ZONE_DIMENSION_TILES } from '../rooms/zoning';
import { identifierSchema, sequenceSchema, type VersionedPayload } from './types';

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
 *
 * ## Why `definitionId` is `.min(1)` and still not `identifierSchema`
 *
 * `.min(1)` because the *save* boundary already requires exactly that of the
 * same value, and a disagreement between the two boundaries is not a stricter
 * check -- it is a window, which is the argument `PurchaseMaterials` records
 * below. `save-schema.ts`'s `buildOrderSchema` types an order's `definitionId`
 * as `z.string().min(1)` and `createSaveEnvelope` parses and throws, so while
 * this was a bare `z.string()` the following was reachable and measured: a
 * command carrying `definitionId: ''` decoded cleanly, the kernel dispatched
 * it, `ConstructionSystem.submitOrder` refused it (an empty id names no
 * buildable) and **stored the refused order anyway** -- `submitOrder` keeps a
 * failed order so it can be read back -- and the next save attempt then threw
 * at `construction.orders.0.definitionId` on a path the player cannot connect
 * to anything. The two boundaries now say the same thing, so a value one
 * accepts the other can always write.
 *
 * **Not** `identifierSchema`, for the reason `PlaceObject.definitionId` gives:
 * a buildable id is not a content id, and `wall-brick` would fail a
 * dotted-identifier rule. And deliberately no *existence* check here either --
 * an id no catalogue declares is refused by `ConstructionSystem.submitOrder`
 * with `unknown-buildable`, which is a **refusal the player is told about**,
 * where a schema rejection makes `unpackCommand` answer `null` and the command
 * vanish silently. Shape belongs to the schema; existence belongs to the system
 * that owns the catalogue. That division is what every other command here
 * already follows -- `HireStaff.staffRoleId` is `identifierSchema` and its
 * catalogue miss is `hire.unknown-role`, `PurchaseMaterials.itemId` likewise
 * against `purchase.unknown-material`.
 */
export const placeBuildOrderSchema = z.object({
  type: z.literal('PlaceBuildOrder'),
  orderId: z.string(),
  definitionId: z.string().min(1),
  x: z.number().int(),
  y: z.number().int(),
  edge: z.enum(BUILD_EDGES).optional(),
  transactionId: z.string().optional(),
}).strict();

export const cancelBuildOrderSchema = z.object({
  type: z.literal('CancelBuildOrder'),
  orderId: z.string(),
  /**
   * The order's own revision counter (`ConstructionSystem.revisionOf`) as it
   * read when the row that produced this press was painted.
   *
   * ADR 0107: `ConstructionSystem` bumps a private, unpersisted counter on
   * every `order.state` write, so a value that no longer matches the order's
   * current one means the order has transitioned since the row was read --
   * deterministically, in the ~2 seconds of simulation time a running-clock
   * command's lead can cost (Context §3). The handler refuses rather than
   * cancelling on a mismatch, leaving the order untouched.
   */
  expectedRevision: z.number().int().nonnegative(),
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
 * out is whatever is there. `RoomZoningService.unzone` resolves each covered
 * zoned tile to the room *instance* containing it and clears that instance's
 * whole rectangle, and its own comment states both consequences of that. It
 * used to grow the tile into its connected same-type *run* instead, which is
 * why removing one of two touching cells removed both (issue #337).
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
 * Cancel a purchase whose delivery has not landed, refunding what was paid
 * (#285).
 *
 * ## Why this is a command of its own and not a `CancelBuildOrder`
 *
 * Because the two name different records, and the ids are independent by
 * construction. `PurchaseMaterials` mints a *purchase* id per press and buys
 * stock; `PlaceBuildOrder` mints an *order* id and touches no treasury on any
 * path. So a build order is never paid for, there is nothing for
 * `ConstructionSystem.cancelOrder` to refund even in principle, and a refund
 * wired to undo would credit the money while `cancelOrder` also released the
 * materials -- value created out of a keystroke, measured on #285 as mutation
 * M2 of `tests/integration/economy-money-conservation.test.ts`.
 *
 * What this reaches instead is `ProcurementSystem.cancel`, which was a
 * complete, tested, idempotent credit path that **nothing in the application
 * could call**: `grep -rn "procurement\.cancel" src/` found nothing at all, and
 * the only caller in the repository was a test. That is the same shape
 * `CancelBuildOrder` was in before #367, one system over.
 *
 * ## What it carries
 *
 * `orderId`, and nothing else. It is `identifierSchema` for the reason
 * `PurchaseMaterials.orderId` is: the save boundary types a pending delivery's
 * id that way (`economySectionSchema`), and the two boundaries disagreeing is a
 * window rather than a stricter check. The id is minted by
 * `PurchaseMaterials`'s producer, travels out on `hud/pending-deliveries` and
 * comes back unchanged -- nothing on this side of the wire invents one.
 *
 * **No quantity and no item id.** A cancellation names a delivery, not an
 * amount of a material: partial cancellation would be a second purchase at a
 * price nobody agreed, and which material it was is a property of the record
 * this id already names.
 */
export const cancelMaterialPurchaseSchema = z.object({
  type: z.literal('CancelMaterialPurchase'),
  orderId: identifierSchema,
}).strict();

/**
 * Sell stock back to the depot at a loss
 * ([ADR 0075](../../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
 * decision 3, invoked by
 * [ADR 0096](../../../docs/adr/0096-what-a-way-back-is-and-what-guarantees-one.md)
 * decision 3(b)). `ProcurementSystem.sellStock` had the arithmetic and the
 * container mutation since #1127; this is the command that reaches it,
 * closing the gap that method's own docblock named -- "no `SellMaterials` (or
 * similarly named) entry in `simulationCommandSchema`".
 *
 * ## Why it is a command of its own and not a negative `PurchaseMaterials`
 *
 * Because the two name different treasury directions and different container
 * operations -- `purchase` spends and queues a delivery, `sellStock` withdraws
 * through `reserve`/`withdrawReserved` and credits at once, no delivery and no
 * delay -- and folding them into one schema keyed by the sign of a field would
 * be exactly the ambiguity `PurchaseSpendClass` exists to keep out of
 * `Treasury`, one layer up. `hud.alert.refusal.sell.*` also has to be a
 * namespace of its own against `purchase.*` for the reason every such pair in
 * this file is: buying and selling are opposite gestures on the same
 * material, and somebody who pressed Sell must not read that a delivery was
 * not ordered.
 *
 * ## What it carries, and what it deliberately does not
 *
 * `itemId` and `quantity`, and nothing else.
 *
 * `itemId` is `identifierSchema` rather than `z.string()`, matching
 * `PurchaseMaterials.itemId`: a malformed id refused here never reaches the
 * kernel, which is the only place a fix can sit next to its cause. There is no
 * save-side counterpart to disagree with -- a sale writes nothing to a save,
 * unlike a purchase's pending delivery -- so this is a plain adoption of the
 * sibling command's convention rather than the closing of a window.
 *
 * `quantity` is bounded by `MAX_PURCHASE_QUANTITY`, the same ceiling
 * `PurchaseMaterials.quantity` uses: it is `ProcurementSystem`'s own overflow
 * guard against `unitPriceMinorUnits * quantity`, and that arithmetic runs
 * whichever direction the money moves.
 *
 * **No `orderId`, unlike `PurchaseMaterials`.** A purchase mints one because
 * something downstream is keyed by it: `ProcurementSystem.purchase` refuses a
 * duplicate, and `CancelMaterialPurchase` names the pending delivery to
 * reverse. A sale creates no pending record for a later command to name or a
 * replay to duplicate -- `sellStock` withdraws from the container and credits
 * the treasury in the same tick, nothing is queued, and two identical sales in
 * a row are simply two sales, not a duplicate of one. An id here would be a
 * field with no reader, the same argument `AdmitPrisoner`'s own comment makes
 * for carrying none.
 */
export const sellMaterialsSchema = z.object({
  type: z.literal('SellMaterials'),
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
 * ## The sentence is optional, and that is the whole of #535 decision 5's wire
 *
 * **Omitted, the simulation draws one** -- at the `classification` stage, from
 * the `prisoners.sentence` stream, exactly where the tier and the name are
 * drawn and for the reason stated one paragraph above. That is what
 * `src/main.ts` now sends, because a composition root has no business deciding
 * how long anybody is held for and could not do it reproducibly if it tried.
 *
 * **Present, it is used exactly as given and never redrawn.** Every fixture in
 * `tests/` that names a length keeps its exact behaviour, and so does a queued
 * `AdmitPrisoner` restored from a save written before this field became
 * optional -- which is why this is a widening rather than a removal.
 * `queuedCommandSchema` carries a command payload as an opaque `jsonValue`
 * (`src/persistence/save-schema.ts`) and this schema is what re-validates it on
 * the way out, so an old save's queued admission has to keep parsing here or it
 * would fault a restore. It does: making a required field optional accepts
 * every payload the required version accepted.
 *
 * The reverse is not true and is worth stating rather than discovering: a save
 * written *after* this change may carry a queued admission with no
 * `sentenceLengthTicks`, and a build predating it would refuse that payload.
 * That is [ADR 0065](../../../docs/adr/0065-what-happens-to-a-save-this-build-cannot-read.md)'s
 * case and needs no version bump of its own -- `SAVE_SCHEMA_VERSION` names the
 * *shape* of the envelope, which has not moved, and a pending command has
 * always been a payload the current build's own schemas judge.
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
  sentenceLengthTicks: z.number().int().positive().max(MAX_SENTENCE_LENGTH_TICKS).optional(),
  priorIncidents: z.number().int().min(0).max(MAX_PRIOR_INCIDENTS),
  x: z.number().int(),
  y: z.number().int(),
}).strict();

/**
 * Hire a staff member ([ADR 0025](../../../docs/adr/0025-guard-hiring-surface.md)).
 *
 * `staffRoleId` is a stable `staff-role.*` id from
 * `src/content/staff-role-catalog.ts`, never a message key and never an
 * instance id -- `GuardRoster` records the role a staff member was hired into
 * and there is no separate employment record to name.
 *
 * `identifierSchema` rather than `z.string()`, for the reason
 * `PurchaseMaterials.itemId` is: a malformed id refused here never reaches the
 * kernel, which is the only place a fix can sit next to its cause. Unlike the
 * purchase case there is no save-side counterpart to disagree with -- a hire
 * writes a `GuardRecord`, whose `staffRoleId` the save schema already carries
 * -- so this is the stricter of the two boundaries rather than the looser.
 *
 * `x` and `y` are the tile the new staff member first stands on.
 * `GuardRoster.hire` takes one and nothing in the simulation can derive one:
 * no session instantiates a reception, a gate or a staff room. ADR 0025
 * decision 4 records that the producer supplies it and that this is a
 * placeholder tied to `buildCatalogue()`'s existing one, so that when a room a
 * staff member belongs in exists, the change is to the producer alone and
 * neither this schema nor any save moves.
 *
 * No `transactionId`. A hire writes no construction order, so
 * `ConstructionSystem.registerTransactionOrder` has nothing to group; whether
 * hiring should be undoable at all is left open by ADR 0025, exactly as
 * zoning's is by ADR 0022, and it should be answered once for both.
 */
export const hireStaffSchema = z.object({
  type: z.literal('HireStaff'),
  staffRoleId: identifierSchema,
  x: z.number().int(),
  y: z.number().int(),
}).strict();

/**
 * Place one object on one tile ([ADR 0028](../../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
 * phase 1).
 *
 * ## Why it is not a `PlaceBuildOrder`
 *
 * Because both halves of that command are wrong for an object. `edge` answers
 * "which of the two stored tile edges did you mean", which a thing standing on
 * a tile never asks; and a wall order is validated against one tile, while a
 * placement is validated against a whole footprint and can be refused for
 * reasons a wall has no concept of -- a tile another object already covers, a
 * tile in no room. Reusing the command would have every existing producer
 * carry a field it does not use and would leave the footprint rules inside a
 * handler whose name says nothing about them.
 *
 * It still *becomes* a build order: `ObjectPlacementService` submits one, so an
 * object waits for procured materials and advances on `ConstructionSystem`'s
 * schedule exactly as a wall does (ADR 0028 decision 4). What this command
 * decides is only whether the placement is legal.
 *
 * ## What it carries
 *
 * `definitionId` is a `BUILDABLE_REGISTRY` id (`bed-wooden`), spelled the way
 * `PlaceBuildOrder.definitionId` is and for the same reason: the buildable is
 * what carries the material requirement and the work, and it names the object
 * it places. `z.string()` rather than `identifierSchema`, matching
 * `PlaceBuildOrder`, because a buildable id is not a content id -- `wall-brick`
 * would fail a dotted-identifier rule.
 *
 * `orderId` is the caller's, exactly like `PlaceBuildOrder`'s: the main thread
 * mints it so a refusal can be matched to the press that caused it, and so a
 * command replayed from a restored queue cannot submit the same order twice --
 * `ObjectPlacementService` refuses a duplicate id rather than letting
 * `submitOrder` throw out of a command dispatch.
 *
 * `x`/`y` are the anchor tile: the footprint's top-left corner, in the same
 * shape `ZoneRoom`, `PlaceBuildOrder` and `AdmitPrisoner` all carry a tile.
 *
 * ## No orientation, and no `transactionId`
 *
 * **No `orientation`, deliberately.** `PlacedObject` carries one and the save
 * carries it at full range, so a rotated bed needs no format change -- but
 * nothing in the application can *express* a rotation: the gesture is one press
 * (ADR 0028 decision 5) and the rotate half of that decision needs a new
 * `ACTION_IDS` member, a default binding and a description key, none of which
 * phase 1 ships. A field on the wire that no producer sets and no consumer
 * varies would be exactly the dead vocabulary
 * `tests/foundation/unconsumed-command-contract.test.ts` exists to catch, one
 * level down. It arrives with the control.
 *
 * **No `transactionId`.** An object placement *does* write a construction
 * order, so unlike `ZoneRoom` there is something for
 * `registerTransactionOrder` to group -- and `ObjectPlacementService` groups it,
 * under the **order id**, so one press is one undo step. What a field here
 * would buy is grouping several placements into one step, which needs a gesture
 * that places several; the drag that would do it is refused by decision 5 as
 * needing a fill rule, a per-object orientation and a per-tile overlap policy.
 * So there is nothing for a producer to group, and sending an id nothing groups
 * by would be inventing a grouping to explain -- the argument `ZoneRoom` records
 * for the same absence.
 */
export const placeObjectSchema = z.object({
  type: z.literal('PlaceObject'),
  orderId: z.string(),
  definitionId: z.string(),
  x: z.number().int(),
  y: z.number().int(),
}).strict();

/**
 * Take away the object standing on one tile
 * ([ADR 0028](../../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
 * phase 3).
 *
 * ## Why it is a command of its own rather than a `CancelBuildOrder`
 *
 * Because the player is aiming at a *thing in the world*, not at a record in an
 * order list. `CancelBuildOrder` needs the id of the order that built the
 * object, and it would still be wrong for an object restored from a save, whose
 * order is not in the session at all. A tile is what the player pressed and a
 * tile is what the tile index can answer, so a tile is what this carries.
 *
 * This paragraph used to open with a stronger claim -- that an order id is
 * something "nothing on screen shows and no snapshot carries", so the main thread
 * would have had to keep a tile-to-order map for the life of the session. **The
 * first half of that is no longer true and the conclusion is unchanged.**
 * `hud/build-queue` shows the ids of the orders that are still *pending*, which
 * is what gave this command's sibling `CancelBuildOrder` a producer at last. It
 * shows nothing about an object that is already standing, because such an order
 * has left the queue -- and a standing object is exactly what this command is
 * aimed at. So the reason is now the second one alone: a finished object's order
 * is not something the interface can name, and after a restore it does not exist.
 *
 * ## What it carries: one tile, and deliberately nothing else
 *
 * **No `placedObjectId`.** The id is a pure function of the *anchor* tile, and
 * the tile a player presses is usually not the anchor -- a bed is 1x2, so half
 * of it answers to a different id. Computing it in the producer would mean the
 * main thread holding the footprint of every object in the prison.
 *
 * **No `definitionId` and no `objectId`.** A removal names no object type: what
 * comes out is whatever is standing there. That is the same asymmetry
 * `UnzoneRoom` has against `ZoneRoom`, and `RoomTool`'s own comment gives the
 * reason -- requiring a selection before the player could undo a mistake would
 * be a rule with nothing behind it, and it would bite hardest in exactly the
 * case removal exists for.
 *
 * **No `orderId`.** A removal mints no construction order, so there is no id for
 * a producer to allocate and nothing for `submitOrder` to refuse as a duplicate.
 * The one order id a removal can touch belongs to an order that already exists
 * (a placement still in flight, cancelled rather than left claiming a tile
 * nothing can use), and that id is found from the tile.
 *
 * **No `transactionId`.** One press is one object, exactly as for `PlaceObject`,
 * so there is nothing to group. Removing a standing object writes no order and
 * therefore nothing `Undo` can reverse -- which is stated here because it is the
 * honest cost of this shape: a removal is not itself undoable, and the object
 * has to be built again. Making it undoable means a removal writing something to
 * the undo stack, which is `EditHistoryPort`'s question and not this command's.
 */
export const removeObjectSchema = z.object({
  type: z.literal('RemoveObject'),
  x: z.number().int(),
  y: z.number().int(),
}).strict();

/**
 * Take down whatever a world press on the removal gesture resolves to: the
 * object standing on the pressed tile, the object order still building one
 * there, or -- new here -- the completed wall or door claiming the tile edge
 * the press landed nearest
 * ([ADR 0106](../../../docs/adr/0106-how-a-finished-wall-comes-down-without-a-keyboard.md)).
 *
 * ## Why a sibling command rather than a wider `RemoveObject`
 *
 * Because a wall is not an object. `RemoveObject` reaches
 * `ObjectPlacementService.remove`, whose whole contract is a *tile-to-object*
 * lookup (`placedObjects.objectAt`, `orderBuildingObjectAt`); a wall is
 * written by `ConstructionSystem.writeEdge` and reversed only by
 * `revertConstruction`, which `ObjectPlacementService` does not import and
 * must not start importing -- doing so would mean a service whose contract is
 * about objects also holding a copy of the edge model, or reaching into
 * `ConstructionSystem` for it, and either weakens a boundary
 * `session-commands.ts`'s own routing comment states on purpose. ADR 0106 §4
 * carries the argument in full.
 *
 * ## What it carries, and why it is a superset of `RemoveObject`'s shape
 * rather than a second, edge-only command
 *
 * `x`/`y`/`edge`, where `RemoveObject` carries only `x`/`y`. **This command's
 * own session-command branch tries the object arm first, calling
 * `ObjectPlacementService.remove` unchanged, and falls to the edge arm only
 * when that answers `nothing-to-remove`.** The alternative -- sending
 * `RemoveObject` and `RemoveWall` as two independent commands from one press
 * -- was rejected: neither this thread nor the world press can know whether
 * the pressed tile holds an object (`src/main.ts` holds no copy of the placed
 * objects, exactly as `RemoveObject`'s own comment says), so firing both
 * unconditionally would, on a bed built against its own cell's wall, remove
 * the bed **and** cancel the neighbouring wall from one press -- destroying
 * two things the player meant to press once. Trying the object arm first and
 * falling through only on its refusal is what keeps one press one outcome.
 *
 * `edge` is `BuildEdge` (`'north' | 'west'`), required rather than optional:
 * every press this command is built for has a resolved edge --
 * `pickEdgeAtWorld` (`src/rendering/build/edge-picking.ts`) always answers one
 * for a finite point, tying towards north then west -- and a command with no
 * edge to fall back on would have nothing for the wall arm to try. The
 * numeric Build panel route stays on plain `RemoveObject`: a typed tile has no
 * sub-tile position for `pickEdgeAtWorld` to resolve, and `edgeChooserShown`
 * already hides the edge control while removing for exactly that reason.
 *
 * ## Scope, deliberately narrow
 *
 * Only a **completed** order claiming the edge is eligible
 * (`ConstructionSystem.completedOrderClaimingEdge`). A wall or door still
 * being built already has a pointer route -- the queue's per-row cancel,
 * since `PENDING_BUILD_ORDER_STATES` excludes only `'completed'` -- so this
 * command does not widen that gesture's reach; it closes the one gap
 * boundary 10 names, a **finished** wall with no way back but `Undo`.
 *
 * No `orderId` and no `transactionId`, for `RemoveObject`'s own reasons: the
 * order id is found from the tile and the edge rather than named on the wire,
 * and cancelling it is not itself undoable -- `ConstructionSystem.cancelOrder`
 * is called directly, exactly as `RemoveObject`'s pending-order arm already
 * calls it, and neither push a transaction onto the undo stack.
 */
export const removeWallSchema = z.object({
  type: z.literal('RemoveWall'),
  x: z.number().int(),
  y: z.number().int(),
  edge: z.enum(BUILD_EDGES),
}).strict();

/**
 * Release one guard from whatever is holding it
 * ([ADR 0034](../../../docs/adr/0034-releasing-a-claimed-guard.md), answering
 * [ADR 0033](../../../docs/adr/0033-releasing-an-interrupted-incident-response-at-runtime.md)
 * open question 3).
 *
 * ## Why one command and not one per claimant
 *
 * Because a guard is one thing and a player is looking at one guard. Three
 * commands -- release-from-search, release-from-response, release-from-post --
 * would put the resolution of "what is holding this?" on the *main thread*,
 * which cannot answer it: `'on-search'` is a shared phase and telling a
 * responder from a searcher needs both claimants asked live, inside the
 * simulation, at the tick the release happens (ADR 0033 decision 4 is the whole
 * argument). A command that named the claimant would be the main thread guessing
 * with a stale projection, and it would be wrong exactly in the race this
 * command's `not-held` refusal exists for.
 *
 * So the command names the *guard* and the simulation resolves the claim.
 * `GuardReleaseService.claimOf` is that resolution and the accepted outcome
 * reports which kind it found.
 *
 * ## What it carries
 *
 * `guardId`, and nothing else. A staff `EntityId`, so `z.number().int()` rather
 * than `identifierSchema` -- the id space is `EntityStore`'s, not a content
 * catalogue's, and it is the same shape `ProjectionTarget`'s `'entity'` kind
 * carries. Non-negative because `EntityStore` mints from zero upward.
 *
 * **No claimant, no sector, no incident id and no search order id.** Every one
 * of those is a property of the record this guard id already reaches, and every
 * one of them would be a second thing the wire could get wrong. **No "and
 * re-deploy to" either**: releasing is one act and assigning is another, and
 * `DeploymentSystem` already fills a shortage from the pool on its next cycle.
 *
 * ## Not a dismissal
 *
 * The guard stays hired. What is released is the claim, not the employment --
 * firing destroys an entity, which is ADR 0026's subject and needs its own
 * decision about id reuse. `ReleaseGuardAssignment` rather than `DismissGuard`
 * for exactly that reason: ADR 0033's open question 3 asks for a
 * *"dismiss/fire command"* and the narrower half of it is the half that closes
 * the defect.
 */
export const releaseGuardAssignmentSchema = z.object({
  type: z.literal('ReleaseGuardAssignment'),
  guardId: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict();

/**
 * Dismiss one staff member
 * ([ADR 0070](../../../docs/adr/0070-dismissing-a-staff-member.md) decision 2,
 * issue #533, the owner's decision on issue #535 decision 4).
 *
 * ## Why this is a separate command from `ReleaseGuardAssignment`
 *
 * Because `ReleaseGuardAssignment`'s own comment says it has to be: *"Not a
 * dismissal. The guard stays hired. What is released is the claim, not the
 * employment -- firing destroys an entity, which is ADR 0026's subject and
 * needs its own decision about id reuse. `ReleaseGuardAssignment` rather than
 * `DismissGuard` for exactly that reason: ADR 0033's open question 3 asks for a
 * dismiss/fire command and the narrower half of it is the half that closes the
 * defect."* This is the other half, and the two are complements rather than
 * alternatives -- a release hands a guard back to the pool and
 * `DeploymentSystem` may post them again on its next cycle, which is a
 * re-shuffle; this ends the employment, and with it the payroll line
 * `PayrollSystem` bills at every in-game day boundary.
 *
 * ## What it carries
 *
 * `staffId`, and nothing else. A staff `EntityId`, so `z.number().int()` rather
 * than `identifierSchema` -- the id space is `EntityStore`'s, not a content
 * catalogue's -- with exactly the bounds `ReleaseGuardAssignment.guardId`
 * carries, because it is the same id read from the same roster.
 *
 * `staffId` rather than `guardId`, and the difference is not cosmetic: a
 * dismissal applies to every role `GuardRoster` holds, including the ones
 * ADR 0053 refuses a *post* to, while `ReleaseGuardAssignment` is about a
 * security claim and its parameter is named for what it releases. A prison that
 * hired an administrator before ADR 0053's gate existed can carry one in a
 * save, and this is the command that gets rid of them.
 *
 * **No role id, no sector, no "and refund" and no severance figure.** The role
 * is a property of the record this id already reaches, and would be a second
 * thing the wire could get wrong. Money is deliberately absent rather than set
 * to zero: `src/simulation/staff/dismissal.ts` explains why a dismissal moves
 * no money and why the amount, if there is ever to be one, is the owner's.
 *
 * No `transactionId`, for `HireStaff`'s reason: a dismissal writes no
 * construction order, and whether hiring and firing should be undoable at all
 * is the question ADR 0025 left open for hiring and ADR 0022 left open for
 * zoning. It should be answered once for all three rather than three times.
 */
export const dismissStaffSchema = z.object({
  type: z.literal('DismissStaff'),
  staffId: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict();

/**
 * Retire one row of the alerts log, because the player has read it (the
 * owner's decision 3 of 2026-09-01 on
 * [ADR 0084](../../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md)).
 *
 * ## Why this crosses the wire at all
 *
 * Because the row has to stay gone. `src/ui/simulation-alerts.ts` predicted
 * the shape exactly -- *"that would be a main-to-worker message and a piece of
 * simulation state to hold it"* -- and the reason it is not a purely
 * client-side suppression is the owner's other decision of the same day: the
 * log survives a reload, and what a reload rebuilds from is
 * `SimulationEventLog`'s buffer inside the save. A dismissal the worker never
 * heard about would be undone by the next load, so decisions 3 and 4 would
 * fight. The main thread removes the row the moment the player presses
 * (`hudAlertsWithoutRow`); this is what makes that still true tomorrow.
 *
 * ## What it carries
 *
 * Two ordinals, and no row id. `fromSequence` is the arrival the row began
 * with and `throughSequence` is the newest arrival the player had seen. The
 * *identity* of the run -- what makes two arrivals the same row -- is
 * resolved inside the simulation from the record `fromSequence` names, exactly
 * as `ReleaseGuardAssignment` names a guard and lets the simulation resolve
 * what is holding it: a row id is a main-thread rendering concept, and a
 * command that carried one would be this thread asserting a grouping the
 * worker would then have to trust.
 *
 * The far end is the field that makes the recurrence rule work rather than a
 * convenience. See `SimulationEventLog.dismiss`, which states what it buys: an
 * arrival that lands between the press and the tick is above it and survives,
 * so the same fact happening again is a new row rather than a silently
 * re-dismissed one.
 *
 * `sequenceSchema`'s bounds are the wire's own for an ordinal. The pair is
 * deliberately **not** cross-validated here: this schema is a member of a
 * discriminated union whose options every consumer reads `.shape.type` off
 * (`tests/foundation/unconsumed-command-contract.test.ts`), and a `.refine`
 * would make this one a different kind of schema than its sixteen siblings
 * for a rule that costs nothing anyway -- a `throughSequence` below its
 * `fromSequence` names an empty range, so `SimulationEventLog.dismiss` marks
 * nothing and reports it, which is the same outcome the check would have
 * produced.
 *
 * **No refusal reason, and that is a decision.** A dismissal naming a record
 * the log no longer retains marks nothing and is still a success: the player
 * asked for a row to be gone and it is. `SimulationEventLog.dismiss` carries
 * the argument in full.
 */
export const dismissAlertSchema = z.object({
  type: z.literal('DismissAlert'),
  fromSequence: sequenceSchema,
  throughSequence: sequenceSchema,
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
  cancelMaterialPurchaseSchema,
  sellMaterialsSchema,
  admitPrisonerSchema,
  hireStaffSchema,
  placeObjectSchema,
  removeObjectSchema,
  removeWallSchema,
  releaseGuardAssignmentSchema,
  dismissStaffSchema,
  dismissAlertSchema,
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
      return { type: command.type, orderId: command.orderId, expectedRevision: command.expectedRevision };

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

    case 'CancelMaterialPurchase':
      return { type: command.type, orderId: command.orderId };

    case 'SellMaterials':
      return { type: command.type, itemId: command.itemId, quantity: command.quantity };

    case 'AdmitPrisoner':
      return {
        type: command.type,
        // Conditionally, in `ZoneRoom.transactionId`'s shape above and for the
        // same reason: `exactOptionalPropertyTypes` distinguishes an absent
        // key from one holding `undefined`, and an admission that leaves the
        // sentence to the simulation must not put a `sentenceLengthTicks:
        // undefined` on the wire for `.strict()` to judge.
        ...(command.sentenceLengthTicks === undefined ? {} : { sentenceLengthTicks: command.sentenceLengthTicks }),
        priorIncidents: command.priorIncidents,
        x: command.x,
        y: command.y,
      };
    case 'HireStaff':
      return { type: command.type, staffRoleId: command.staffRoleId, x: command.x, y: command.y };

    case 'PlaceObject':
      return {
        type: command.type,
        orderId: command.orderId,
        definitionId: command.definitionId,
        x: command.x,
        y: command.y,
      };

    case 'RemoveObject':
      return { type: command.type, x: command.x, y: command.y };

    case 'RemoveWall':
      return { type: command.type, x: command.x, y: command.y, edge: command.edge };

    case 'ReleaseGuardAssignment':
      return { type: command.type, guardId: command.guardId };

    case 'DismissStaff':
      return { type: command.type, staffId: command.staffId };

    case 'DismissAlert':
      return { type: command.type, fromSequence: command.fromSequence, throughSequence: command.throughSequence };

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
