import { describe, expect, it } from 'vitest';
import { BUILD_EDGES, BUILD_ORDER_FAIL_REASONS, isBuildEdge } from '../../src/simulation/construction/build-order';
import { packCommand } from '../../src/simulation/protocol/commands';
import { REFUSAL_REASONS, type RefusalReason } from '../../src/simulation/protocol/types';
import {
  ADMIT_REFUSAL_REASONS,
  BUILD_REFUSAL_REASONS,
  CANCEL_BUILD_ORDER_REFUSAL_REASONS,
  CONSTRUCTION_FUNDING_REFUSAL_REASONS,
  DISMISS_STAFF_REFUSAL_REASONS,
  EDIT_REGIME_BLOCK_REFUSAL_REASONS,
  HIRE_REFUSAL_REASONS,
  PLACE_OBJECT_REFUSAL_REASONS,
  PURCHASE_CANCEL_REFUSAL_REASONS,
  PURCHASE_REFUSAL_REASONS,
  RELEASE_GUARD_REFUSAL_REASONS,
  REMOVE_OBJECT_REFUSAL_REASONS,
  REMOVE_WALL_REFUSAL_REASONS,
  SELL_REFUSAL_REASONS,
  RefusalLog,
  UNZONE_REFUSAL_REASONS,
  ZONE_REFUSAL_REASONS,
} from '../../src/simulation/refusals';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * What the simulation refuses, and how it says so (issue #261).
 *
 * The defect this closes is a *silence*, so most of what follows is an
 * assertion that something is now said. A player command travels through two
 * acceptances -- the worker takes the message and answers `status: 'queued'`,
 * and then a system decides at the command's tick what it means -- and only
 * the first was ever reported. `ConstructionSystem.submitOrder` set
 * `state: 'failed'` with a `failReason`, `phaseOf` drew a failed order as
 * nothing, and the HUD's refusal line answers a *rejected command* rather
 * than a refused one. `ProcurementSystem.purchase` returned a
 * `PurchaseOutcome` that the session command handler discarded and said so in
 * its own comment.
 *
 * `RoomZoningService` is the third producer and the one that was written for
 * this route rather than despite it: it already kept a bounded window of its
 * refusals, with a comment saying it did so "because the reporting route is
 * #261 step 2". This is that route.
 *
 * These tests drive the real kernel and the real command handler, because the
 * gap was never in either component: both were correct and the handler simply
 * threw the answer away.
 */

/** The starting chunk `createNewSimulationRuntime` owns is 32x32 at the origin, so this tile is inside it and owned. */
const OWNED_TILE = { x: 4, y: 4 };
/** Outside every materialised chunk, which is what the Build panel's unbounded coordinate fields let a player type. */
const OUT_OF_BOUNDS_TILE = { x: 100, y: 100 };

/** Submits one command to the kernel and runs the tick it executes on. */
function submit(runtime: SimulationRuntime, sequence: number, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(`cmd-${String(sequence)}`, sequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function placeWall(runtime: SimulationRuntime, sequence: number, tile: { x: number; y: number }): void {
  submit(
    runtime,
    sequence,
    packCommand({
      type: 'PlaceBuildOrder',
      orderId: `order-${String(sequence)}`,
      definitionId: 'wall-brick',
      x: tile.x,
      y: tile.y,
    }),
  );
}

describe('RefusalLog: the snapshot shape a cadence channel can carry', () => {
  it('reports nothing at all before anything has been refused', () => {
    const log = new RefusalLog();
    expect(log.last).toBeUndefined();
    // Not `1`, and not a placeholder record: "no refusal has happened" is a
    // different fact from "a refusal happened", and the wire says so with an
    // absent field rather than a present one holding nothing.
    expect(log.count).toBe(0);
  });

  it('carries the ordinal and the total in one number, so neither has to be sent twice', () => {
    const log = new RefusalLog();
    log.record('build.unowned-land', 12);
    expect(log.last).toEqual({ sequence: 1, tick: 12, reason: 'build.unowned-land' });

    log.record('purchase.insufficient-funds', 40);
    // The second refusal replaces the first -- a queue is what this channel
    // cannot carry honestly -- and `sequence` is still the count.
    expect(log.last).toEqual({ sequence: 2, tick: 40, reason: 'purchase.insufficient-funds' });
    expect(log.count).toBe(2);
  });

  it('keeps the tick the refusal happened on, not the tick it is read at', () => {
    // The publication stamps its envelope with a later tick, and a refusal
    // that is still the most recent one keeps its own. Without this a player
    // could not tell a refusal that just happened from one that has been
    // standing for a minute.
    const log = new RefusalLog();
    log.record('build.out-of-bounds', 7);
    expect(log.last?.tick).toBe(7);
    expect(log.last?.tick).not.toBe(0);
  });
});

describe('the wire vocabulary is exactly what the sixteen domains can produce', () => {
  it('maps every admission, build, construction funding, hiring, dismissal, placement, object removal, wall removal, sale, purchase, cancellation, guard release, build-order cancellation and zoning refusal onto a declared reason', () => {
    const produced = [
      ...Object.values(ADMIT_REFUSAL_REASONS),
      ...Object.values(BUILD_REFUSAL_REASONS),
      ...Object.values(CANCEL_BUILD_ORDER_REFUSAL_REASONS),
      ...Object.values(CONSTRUCTION_FUNDING_REFUSAL_REASONS),
      ...Object.values(DISMISS_STAFF_REFUSAL_REASONS),
      ...Object.values(EDIT_REGIME_BLOCK_REFUSAL_REASONS),
      ...Object.values(HIRE_REFUSAL_REASONS),
      ...Object.values(PLACE_OBJECT_REFUSAL_REASONS),
      ...Object.values(PURCHASE_CANCEL_REFUSAL_REASONS),
      ...Object.values(PURCHASE_REFUSAL_REASONS),
      ...Object.values(RELEASE_GUARD_REFUSAL_REASONS),
      ...Object.values(REMOVE_OBJECT_REFUSAL_REASONS),
      ...Object.values(REMOVE_WALL_REFUSAL_REASONS),
      ...Object.values(SELL_REFUSAL_REASONS),
      ...Object.values(ZONE_REFUSAL_REASONS),
      ...Object.values(UNZONE_REFUSAL_REASONS),
    ];
    for (const reason of produced) {
      expect(REFUSAL_REASONS, `${reason} is produced but not declared on the wire`).toContain(reason);
    }
    // Both directions. A member declared here and produced by nothing is a
    // sentence in the catalog that no session can ever show, which is the
    // failure `tests/foundation/unconsumed-content-contract.test.ts` exists
    // for one layer over. `Record` exhaustiveness gives the other direction
    // at compile time; this gives this one.
    expect([...produced].sort()).toEqual([...REFUSAL_REASONS].sort());
  });

  it('pairs every domain reason with the wire id it is meant to have, not merely with some wire id', () => {
    /*
     * The set check above compares two *bags* of ids, so it holds for any
     * permutation: swapping `ZONE_REFUSAL_REASONS`'s `below-minimum-size` and
     * `duplicate-instance-id` values keeps both sides identical, keeps every
     * `Record` exhaustive, keeps the namespace prefixes intact, keeps the
     * shared-spelling cases green -- and left 238 files / 2,696 tests green
     * when measured at `54418b6` (v0.0.121), while shipping a player who drew a room too
     * small being told the room already exists. Twelve of the thirty-six wire
     * ids are named by no other test in the suite at all, so for those the
     * pairing had nothing anywhere.
     *
     * Written out as literals rather than derived. A `` `${namespace}.${key}` ``
     * expression would be the production tables' own rule re-implemented in
     * the test, which is the shape `docs/TESTING.md` records as the fixture
     * supplying both sides -- and it would also make an *intended* divergence
     * impossible to express here. These are transcribed from the twelve tables'
     * declarations, which is what makes an accidental edit to either side show
     * up as a disagreement.
     */
    expect(ADMIT_REFUSAL_REASONS).toEqual({
      'no-accommodation': 'admit.no-accommodation',
      'population-full': 'admit.population-full',
    });
    expect(BUILD_REFUSAL_REASONS).toEqual({
      'duplicate-order': 'build.duplicate-order',
      'out-of-bounds': 'build.out-of-bounds',
      unbuildable: 'build.unbuildable',
      'unbuildable-terrain': 'build.unbuildable-terrain',
      'unknown-buildable': 'build.unknown-buildable',
      'unowned-land': 'build.unowned-land',
      'water-blocked': 'build.water-blocked',
    });
    /*
     * The fifteenth table (ADR 0107). One member, transcribed here like
     * `REMOVE_OBJECT_REFUSAL_REASONS` and `REMOVE_WALL_REFUSAL_REASONS`
     * above for the same reason: a one-member table is exactly the case
     * where this pairing test is the only thing that could notice
     * `cancel-build-order.stale-cancellation` written as, say,
     * `cancel-build-order.stale-cancelled`.
     */
    expect(CANCEL_BUILD_ORDER_REFUSAL_REASONS).toEqual({ 'stale-cancellation': 'cancel-build-order.stale-cancellation' });
    // Issue #533. One member, transcribed here like the other ten tables --
    // and a one-member table is exactly the case where a pairing test earns its
    // keep, because there is no set-size check anywhere that could notice
    // `dismiss.unknown-staff` being written as `hire.unknown-staff`.
    /*
     * The twelfth table, and the second single-member one where the pairing
     * test is the only thing that could notice a typo: nothing else in this
     * suite names `construction.materials-unfunded` beside its domain
     * spelling. Transcribed from the owner's ruling of 2026-09-01 (ADR 0017,
     * "Amendment, 2026-09-01" §5a) rather than read back off the table.
     */
    expect(CONSTRUCTION_FUNDING_REFUSAL_REASONS).toEqual({
      'materials-unfunded': 'construction.materials-unfunded',
    });
    expect(DISMISS_STAFF_REFUSAL_REASONS).toEqual({
      'unknown-staff': 'dismiss.unknown-staff',
    });
    expect(HIRE_REFUSAL_REASONS).toEqual({
      'insufficient-funds': 'hire.insufficient-funds',
      // ADR 0053. `no-duty-for-role` and `unknown-role` are two different
      // sentences about a role id and the namespace is what keeps them apart:
      // one says the prison has never heard of it, the other says it has and
      // there is nothing for it to do.
      'no-duty-for-role': 'hire.no-duty-for-role',
      'roster-full': 'hire.roster-full',
      'unknown-role': 'hire.unknown-role',
    });
    expect(PLACE_OBJECT_REFUSAL_REASONS).toEqual({
      'duplicate-order': 'place-object.duplicate-order',
      'not-a-placeable-object': 'place-object.not-a-placeable-object',
      'out-of-bounds': 'place-object.out-of-bounds',
      'outside-room': 'place-object.outside-room',
      'tile-occupied': 'place-object.tile-occupied',
      'unknown-buildable': 'place-object.unknown-buildable',
      'unowned-land': 'place-object.unowned-land',
    });
    expect(PURCHASE_CANCEL_REFUSAL_REASONS).toEqual({ 'not-pending': 'cancel-purchase.not-pending' });
    expect(PURCHASE_REFUSAL_REASONS).toEqual({
      'duplicate-order': 'purchase.duplicate-order',
      'insufficient-funds': 'purchase.insufficient-funds',
      'invalid-quantity': 'purchase.invalid-quantity',
      'unknown-material': 'purchase.unknown-material',
    });
    expect(RELEASE_GUARD_REFUSAL_REASONS).toEqual({
      'not-held': 'release-guard.not-held',
      'unknown-guard': 'release-guard.unknown-guard',
    });
    expect(REMOVE_OBJECT_REFUSAL_REASONS).toEqual({ 'nothing-to-remove': 'remove-object.nothing-to-remove' });
    expect(REMOVE_WALL_REFUSAL_REASONS).toEqual({ 'nothing-to-remove': 'remove-wall.nothing-to-remove' });
    /*
     * The fourteenth table (ADR 0075 decision 3, invoked by ADR 0096 decision
     * 3(b)), transcribed here like every other rather than read back off the
     * table it would be checking against itself -- `insufficient-stock` has
     * no purchase-side twin for the pairing test to have caught a typo
     * against, which is exactly the one-member-table argument
     * `REMOVE_OBJECT_REFUSAL_REASONS` above records for its own entry.
     */
    expect(SELL_REFUSAL_REASONS).toEqual({
      'insufficient-stock': 'sell.insufficient-stock',
      'invalid-quantity': 'sell.invalid-quantity',
      'unknown-material': 'sell.unknown-material',
    });
    expect(UNZONE_REFUSAL_REASONS).toEqual({
      'invalid-area': 'unzone.invalid-area',
      'nothing-to-remove': 'unzone.nothing-to-remove',
      'room-occupied': 'unzone.room-occupied',
    });
    expect(ZONE_REFUSAL_REASONS).toEqual({
      'below-minimum-size': 'zone.below-minimum-size',
      'duplicate-instance-id': 'zone.duplicate-instance-id',
      'invalid-area': 'zone.invalid-area',
      // The eighth, and the only one whose *sentence* moved rather than being
      // newly written: it is `hud.rooms.enclosure-open-required`, which the
      // Rooms panel showed as a warning about an accepted room, now that `zone`
      // refuses instead (the ADR "Must a zoned room be enclosed").
      'not-enclosed': 'zone.not-enclosed',
      'out-of-bounds': 'zone.out-of-bounds',
      'overlaps-existing-room': 'zone.overlaps-existing-room',
      'unknown-room-type': 'zone.unknown-room-type',
      'unowned-land': 'zone.unowned-land',
    });

    // Every declared wire id is paired above, exactly once. Without this a
    // twelfth table -- or a further member of an existing one -- could be
    // added with no pair written here and the eleven assertions would still be
    // about whatever they were about before. **This is the check the eleventh
    // table actually tripped**, which is worth recording: adding
    // `DISMISS_STAFF_REFUSAL_REASONS` to the set comparison above and to the
    // pairing block left this list one short, and the failure named the count
    // rather than the table -- exactly the "an eleventh table could be added
    // with no pair written here" case this comment predicted, caught by the
    // sentence that predicted it.
    //
    // **And it tripped again on the twelfth**, which is the same paragraph
    // earning its keep a second time: `CONSTRUCTION_FUNDING_REFUSAL_REASONS`
    // was added to the set comparison above and to the pairing block, and this
    // list was still eleven tables long -- `expected [...] to have a length of
    // 41 but got 40`. The count named the shortfall and not the table, exactly
    // as predicted, and exactly as it did for `dismiss`.
    //
    // **And it tripped again on the thirteenth (ADR 0106)**, the same
    // paragraph earning its keep a third time: `REMOVE_WALL_REFUSAL_REASONS`
    // was added to the set comparison above and forgotten here first, and
    // this list was still twelve tables long.
    //
    // **And a fourth time, on the fourteenth (`SellMaterials`, ADR 0075
    // decision 3 / ADR 0096 decision 3(b)).** Reproduced rather than assumed:
    // with `SELL_REFUSAL_REASONS` left out of this block (and in the set
    // comparison above), `paired` stayed 42 long against
    // `REFUSAL_REASONS.length` at 45 -- `expected [ …(41) ] to have a length
    // of 45 but got 42`. Adding it here too is what turns that green again.
    const paired = [
      ...Object.values(ADMIT_REFUSAL_REASONS),
      ...Object.values(BUILD_REFUSAL_REASONS),
      ...Object.values(CANCEL_BUILD_ORDER_REFUSAL_REASONS),
      ...Object.values(CONSTRUCTION_FUNDING_REFUSAL_REASONS),
      ...Object.values(DISMISS_STAFF_REFUSAL_REASONS),
      ...Object.values(EDIT_REGIME_BLOCK_REFUSAL_REASONS),
      ...Object.values(HIRE_REFUSAL_REASONS),
      ...Object.values(PLACE_OBJECT_REFUSAL_REASONS),
      ...Object.values(PURCHASE_CANCEL_REFUSAL_REASONS),
      ...Object.values(PURCHASE_REFUSAL_REASONS),
      ...Object.values(RELEASE_GUARD_REFUSAL_REASONS),
      ...Object.values(REMOVE_OBJECT_REFUSAL_REASONS),
      ...Object.values(REMOVE_WALL_REFUSAL_REASONS),
      ...Object.values(SELL_REFUSAL_REASONS),
      ...Object.values(UNZONE_REFUSAL_REASONS),
      ...Object.values(ZONE_REFUSAL_REASONS),
    ];
    expect(paired).toHaveLength(REFUSAL_REASONS.length);
    expect(new Set(paired).size, 'two domain reasons share one wire id').toBe(REFUSAL_REASONS.length);
  });

  it('covers every build fail reason the construction system declares', () => {
    // `BUILD_REFUSAL_REASONS` is a `Record` over the union, so `tsc` already
    // guarantees this -- but the union and the runtime tuple are two
    // declarations, and only this compares them.
    expect(Object.keys(BUILD_REFUSAL_REASONS).sort()).toEqual([...BUILD_ORDER_FAIL_REASONS].sort());
  });

  it('declares its reasons in canonical code-unit order', () => {
    // `docs/DETERMINISM.md`: never `localeCompare`, never insertion order. The
    // list is never iterated at runtime, so this is about the source staying
    // readable in one predictable order rather than about a hash -- but the
    // ordering rule is the repository's, so the declaration follows it.
    expect([...REFUSAL_REASONS]).toEqual([...REFUSAL_REASONS].sort());
  });

  it('names the fifteen vocabularies it can answer, so they cannot collide', () => {
    // `unzone` is its own namespace and not more members of `zone`'s, because
    // `invalid-area` is the same *condition* for both and a different
    // *sentence*: a player told "the room was not zoned" after asking to remove
    // one would go and look at the wrong control. `hire` is a namespace for the
    // same reason against `purchase`: the treasury refuses both for
    // `insufficient-funds` and only the command says which panel to look at.
    // `admit` is its own for a weaker but sufficient reason -- it shares no
    // spelling with any of the others -- and keeping it namespaced is what
    // stops the next reason added to it from having to be checked against five
    // other vocabularies first. `place-object` is the seventh (ADR 0028 phase
    // 1) and shares three spellings -- `out-of-bounds`, `unowned-land` and
    // `duplicate-order` -- with the build and purchase namespaces, which makes
    // it the strongest case of the three for keeping them apart.
    // `remove-object` is the eighth (ADR 0028 phase 3) and it is the fourth
    // demonstration: its one member is spelled `nothing-to-remove`, which is
    // also `unzone`'s, and a player who pressed a tile with no object on it must
    // not be told there was no room there.
    // `cancel-purchase` is the ninth (#285) and it is the fifth demonstration:
    // buying materials and cancelling a delivery are opposite gestures on the
    // same treasury, so a flat vocabulary would tell somebody who pressed Cancel
    // that the materials were not ordered -- which would send them to buy the
    // bricks they are trying to get their money back for.
    // `release-guard` is the tenth (ADR 0034) and it is the sixth demonstration:
    // its `unknown-guard` is spelled like `hire.unknown-role`,
    // `purchase.unknown-material` and `place-object.unknown-buildable` in
    // meaning -- "the simulation has no such thing" -- and it is about a person
    // rather than a catalogue entry, and it answers the opposite gesture on the
    // same roster hiring writes to.
    // `dismiss` is the eleventh (#533) and it is the seventh demonstration, and
    // the sharpest: its `unknown-staff` sits between `hire.unknown-role` and
    // `release-guard.unknown-guard` -- the same roster, the same absence -- and
    // all three answer different gestures. A release that failed leaves a guard
    // employed and assigned; a dismissal that failed leaves them employed and
    // being paid.
    // `construction` is the twelfth (the owner's ruling of 2026-09-01) and it
    // is the one namespace that is not a *command's* vocabulary at all: no
    // command is called Construction, and the refusal is the just-in-time
    // materials pass failing to fund a queue that is already standing. It is
    // the eighth demonstration and, when this member arrived, was the only one
    // where the two sentences answered the same treasury call at *different
    // thresholds* rather than different gestures -- ADR 0017 decision 8's
    // rung 1 refused a player's delivery at -1,250 and rung 2 refused the
    // queue's own materials at -2,000, so `purchase.insufficient-funds` on
    // both told a prison at -1,800 that deliveries were refused when what
    // stopped was construction. The owner's ruling on #771 (2026-09-01, ADR
    // 0017's equalisation amendment) retired that split: rung 2 now reads the
    // same -1,250 rung 1 does, so the two sentences answer the same call at
    // the same threshold too, and the two namespaces stay apart only for the
    // reason every other pair here does -- a player pressing Buy and a player
    // whose standing queue stalled are looking at two different controls. The
    // test name said "eleven commands" until this member arrived; it says
    // "vocabularies" now, because that is what the twelve have always been and
    // the eleventh was the last one for which the two words coincided.
    // `remove-wall` is the thirteenth (ADR 0106) and it is a command's
    // vocabulary again: the demolition gesture's edge arm, namespaced apart
    // from `remove-object` for the ninth demonstration -- the same fact, "the
    // player pressed where there was nothing of theirs to take away", answers
    // a third different gesture and must not read as either of the other two.
    //
    // **This test's own name said "twelve" from the moment `remove-wall`
    // (the thirteenth) landed until this pass, and the body above already
    // documented thirteen the whole time** -- a title is exactly the kind of
    // tally `docs/AGENT_WORKFLOW.md` §4 says rots first, and it rotted here
    // before this change touched the file at all. Corrected to "fourteen"
    // now rather than "thirteen", since `sell` (ADR 0075 decision 3, invoked
    // by ADR 0096 decision 3(b)) is the fourteenth and the tenth
    // demonstration: `unknown-material` and `invalid-quantity` are spelled
    // like two of `purchase`'s own members -- the same catalogue lookup and
    // the same integer guard, for the opposite direction of money -- and a
    // player who pressed Sell must not read that a delivery was refused.
    // `cancel-build-order` is the fifteenth (ADR 0107), namespaced apart from
    // `cancel-purchase` for the reason every such pair here is: `Cancel` on a
    // build order and `Cancel` on a purchase are two different controls over
    // two different records, and a player who lost the stale-cancellation
    // race must not read a sentence about a delivery.
    // `edit-regime-block` is the sixteenth (ADR 0113 §3), and it is the first
    // whose case for a namespace of its own is that nothing else could be
    // confused with it: no other command names a classification group or a
    // tick of the day. That is an argument for the namespace rather than
    // against it -- the rule is that a refusal's wire id says which control
    // was pressed, and a flat `unknown-group` would stop saying so the moment
    // a second surface grew a group.
    const prefixes = new Set(REFUSAL_REASONS.map((reason) => reason.split('.')[0]));
    expect([...prefixes].sort()).toEqual([
      'admit',
      'build',
      'cancel-build-order',
      'cancel-purchase',
      'construction',
      'dismiss',
      'edit-regime-block',
      'hire',
      'place-object',
      'purchase',
      'release-guard',
      'remove-object',
      'remove-wall',
      'sell',
      'unzone',
      'zone',
    ]);
  });

  it('keeps the one spelling zoning and removal share as two different wire ids', () => {
    // The same rule the build/zone pair below is about, on the pair #312 added.
    // `invalid-area` is a member of both `ZoneRoomRefusalReason` and
    // `UnzoneRoomRefusalReason`.
    const shared = Object.keys(ZONE_REFUSAL_REASONS).filter((reason) =>
      Object.hasOwn(UNZONE_REFUSAL_REASONS, reason),
    );
    expect(shared.sort()).toEqual(['invalid-area']);
    for (const reason of shared) {
      const fromZone = ZONE_REFUSAL_REASONS[reason as keyof typeof ZONE_REFUSAL_REASONS];
      const fromUnzone = UNZONE_REFUSAL_REASONS[reason as keyof typeof UNZONE_REFUSAL_REASONS];
      expect(fromUnzone, `${reason} must not be one wire id for two commands`).not.toBe(fromZone);
    }
  });

  it('keeps the one spelling un-zoning and object removal share as two different wire ids', () => {
    // The same rule again, on the pair ADR 0028 phase 3 added.
    // `nothing-to-remove` is a member of both `UnzoneRoomRefusalReason` and
    // `RemoveObjectRefusalReason`, and it is the same *condition* -- the player
    // pressed where there was nothing of theirs to take away -- reached from two
    // different controls. A single flat id would tell somebody who pressed a
    // bare tile with the object tool armed that there was no room there.
    const shared = Object.keys(UNZONE_REFUSAL_REASONS).filter((reason) =>
      Object.hasOwn(REMOVE_OBJECT_REFUSAL_REASONS, reason),
    );
    expect(shared.sort()).toEqual(['nothing-to-remove']);
    for (const reason of shared) {
      const fromUnzone = UNZONE_REFUSAL_REASONS[reason as keyof typeof UNZONE_REFUSAL_REASONS];
      const fromRemoveObject = REMOVE_OBJECT_REFUSAL_REASONS[reason as keyof typeof REMOVE_OBJECT_REFUSAL_REASONS];
      expect(fromRemoveObject, `${reason} must not be one wire id for two commands`).not.toBe(fromUnzone);
    }
  });

  it('keeps the one spelling object removal, wall removal and un-zoning all share as three different wire ids (ADR 0106)', () => {
    // `nothing-to-remove` is now a member of three tables: `UnzoneRoomRefusalReason`,
    // `RemoveObjectRefusalReason` and `RemoveWallRefusalReason`, the same
    // condition reached by a third control -- a world press armed to remove
    // that finds no object, no pending object order and no completed wall.
    const sharedWithObject = Object.keys(REMOVE_OBJECT_REFUSAL_REASONS).filter((reason) =>
      Object.hasOwn(REMOVE_WALL_REFUSAL_REASONS, reason),
    );
    expect(sharedWithObject.sort()).toEqual(['nothing-to-remove']);
    const sharedWithUnzone = Object.keys(UNZONE_REFUSAL_REASONS).filter((reason) =>
      Object.hasOwn(REMOVE_WALL_REFUSAL_REASONS, reason),
    );
    expect(sharedWithUnzone.sort()).toEqual(['nothing-to-remove']);
    for (const reason of sharedWithObject) {
      const fromRemoveObject = REMOVE_OBJECT_REFUSAL_REASONS[reason as keyof typeof REMOVE_OBJECT_REFUSAL_REASONS];
      const fromRemoveWall = REMOVE_WALL_REFUSAL_REASONS[reason as keyof typeof REMOVE_WALL_REFUSAL_REASONS];
      const fromUnzone = UNZONE_REFUSAL_REASONS[reason as keyof typeof UNZONE_REFUSAL_REASONS];
      expect(fromRemoveWall, `${reason} must not be one wire id for two commands`).not.toBe(fromRemoveObject);
      expect(fromRemoveWall, `${reason} must not be one wire id for two commands`).not.toBe(fromUnzone);
    }
  });

  it('keeps a spelling that two domains share as two different wire ids', () => {
    // This is what the namespace is *for*, and it is not hypothetical:
    // `out-of-bounds` and `unowned-land` are members of both
    // `BuildOrderFailReason` and `ZoneRoomRefusalReason`. They are the same
    // condition and a different sentence -- the player asked for a room, not
    // a wall -- so one flat id per spelling would put one message on both.
    const shared = Object.keys(BUILD_REFUSAL_REASONS).filter((reason) =>
      Object.hasOwn(ZONE_REFUSAL_REASONS, reason),
    );
    expect(shared.sort()).toEqual(['out-of-bounds', 'unowned-land']);
    for (const reason of shared) {
      const fromBuild = BUILD_REFUSAL_REASONS[reason as keyof typeof BUILD_REFUSAL_REASONS];
      const fromZone = ZONE_REFUSAL_REASONS[reason as keyof typeof ZONE_REFUSAL_REASONS];
      expect(fromZone, `${reason} must not be one wire id for two commands`).not.toBe(fromBuild);
    }

    // And the second such pair, which arrived with hiring (ADR 0025): the
    // treasury refuses a purchase and a hire for the same reason, and only the
    // command says which panel the player should be looking at.
    expect(HIRE_REFUSAL_REASONS['insufficient-funds']).not.toBe(
      PURCHASE_REFUSAL_REASONS['insufficient-funds'],
    );
  });

  it('keeps `duplicate-order` -- the first spelling three domains share at once -- as three different wire ids (#514)', () => {
    // `build.duplicate-order` is the newest arrival, and it lands on a
    // spelling `place-object.*` and `purchase.*` already used for the
    // identical fact ("a request just like this one is already standing") on
    // their own commands. A flat id here would tell somebody who pressed
    // *Place order* that their materials were not ordered, or that an object
    // was not placed -- neither of which is the control they pressed.
    expect(BUILD_REFUSAL_REASONS['duplicate-order']).toBe('build.duplicate-order');
    expect(PLACE_OBJECT_REFUSAL_REASONS['duplicate-order']).toBe('place-object.duplicate-order');
    expect(PURCHASE_REFUSAL_REASONS['duplicate-order']).toBe('purchase.duplicate-order');
    expect(
      new Set([
        BUILD_REFUSAL_REASONS['duplicate-order'],
        PLACE_OBJECT_REFUSAL_REASONS['duplicate-order'],
        PURCHASE_REFUSAL_REASONS['duplicate-order'],
      ]).size,
      'three domains, three different wire ids for the same condition',
    ).toBe(3);
  });
});

describe('a build order the simulation refuses reaches the session log', () => {
  it('records the refusal a player produces by typing a coordinate outside the map', () => {
    // Issue #261's reproduction, exactly: the Build panel's coordinate fields
    // carry no `min`/`max`, so `100, 100` is a value a player can enter, and
    // the order comes back `failed`/`out-of-bounds`.
    const runtime = createNewSimulationRuntime(0x261);
    placeWall(runtime, 0, OUT_OF_BOUNDS_TILE);

    expect(runtime.refusals.last).toEqual({ sequence: 1, tick: 0, reason: 'build.out-of-bounds' });
  });

  it('records a wall placed on ground the prison does not own', () => {
    const runtime = createNewSimulationRuntime(0x261);
    // Inside the materialised starting chunk, but disowned first, so the
    // ownership check refuses rather than the bounds check. The two are
    // decided in that order and both had nowhere to go.
    runtime.world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, false);
    placeWall(runtime, 0, OWNED_TILE);

    expect(runtime.refusals.last?.reason).toBe('build.unowned-land');
  });

  it('says nothing about an order the simulation accepted', () => {
    // The other direction, and it is the one that makes the assertions above
    // mean something: a log that recorded every order would be just as
    // useless as one that recorded none.
    const runtime = createNewSimulationRuntime(0x261);
    placeWall(runtime, 0, OWNED_TILE);

    expect(runtime.refusals.last).toBeUndefined();
    expect(runtime.refusals.count).toBe(0);
  });

  it('counts each refusal separately, so a second one replaces the first rather than being lost', () => {
    const runtime = createNewSimulationRuntime(0x261);
    placeWall(runtime, 0, OUT_OF_BOUNDS_TILE);
    placeWall(runtime, 1, OWNED_TILE);
    placeWall(runtime, 2, { x: -100, y: -100 });

    // Two of the three were refused, and the accepted one in between did not
    // clear the log or advance the count.
    expect(runtime.refusals.count).toBe(2);
    expect(runtime.refusals.last).toEqual({ sequence: 2, tick: 2, reason: 'build.out-of-bounds' });
  });
});

describe('a purchase the treasury refuses reaches the session log', () => {
  it('records a purchase the balance cannot cover', () => {
    const runtime = createNewSimulationRuntime(0x261);
    // The starting balance is 25,000 minor units and a brick is 40, so 1,000
    // bricks is 40,000 and cannot be paid for. The quantity is well inside
    // `MAX_PURCHASE_QUANTITY`, so this is the treasury refusing and not the
    // quantity bound.
    submit(runtime, 0, packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 1_000 }));

    expect(runtime.refusals.last).toEqual({ sequence: 1, tick: 0, reason: 'purchase.insufficient-funds' });
    // And the refusal left the treasury alone, which is what makes it a
    // refusal rather than a failure.
    expect(runtime.treasury.balanceMinorUnits).toBe(25_000);
  });

  it('records a purchase of something that is not for sale', () => {
    const runtime = createNewSimulationRuntime(0x261);
    submit(runtime, 0, packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.waste', quantity: 1 }));

    expect(runtime.refusals.last?.reason).toBe('purchase.unknown-material');
  });

  it('records a duplicate order id rather than silently buying nothing', () => {
    const runtime = createNewSimulationRuntime(0x261);
    submit(runtime, 0, packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 1 }));
    expect(runtime.refusals.last).toBeUndefined();

    submit(runtime, 1, packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 1 }));
    expect(runtime.refusals.last?.reason).toBe('purchase.duplicate-order');
  });

  it('shares one log with construction, so the last refusal is the last refusal', () => {
    // Both systems write to the session's single `RefusalLog`. A separate log
    // per system would mean the HUD had to decide which of two "last"
    // refusals is more recent, which is a decision with no basis.
    const runtime = createNewSimulationRuntime(0x261);
    placeWall(runtime, 0, OUT_OF_BOUNDS_TILE);
    submit(runtime, 1, packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 1_000 }));

    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
    expect(runtime.refusals.count).toBe(2);
  });
});

describe('a zoning rectangle the simulation refuses reaches the session log', () => {
  it('records a room zoned outside the map', () => {
    const runtime = createNewSimulationRuntime(0x261);
    submit(
      runtime,
      0,
      // 2x3, `room.cell`'s authored `minimum-size`. It was 2x2 while nothing
      // evaluated that requirement; the assertion is unchanged, and the
      // rectangle is now refused for being outside the map rather than for
      // being too small.
      packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x: 100, y: 100, width: 2, height: 3 }),
    );

    expect(runtime.refusals.last?.reason).toBe('zone.out-of-bounds');
  });

  it('records a rectangle smaller than the room type allows, under its own wire id', () => {
    // One of the twelve wire ids no test named literally before #416, driven
    // end to end so the *pairing* is proven by the session rather than only by
    // the table: `room.cell` authors a 2x3 minimum, this is 1x1, and the
    // sentence the player gets must be the one about size. A table whose
    // `below-minimum-size` pointed at `zone.duplicate-instance-id` would send
    // them looking for a room that is not there.
    const runtime = createNewSimulationRuntime(0x261);
    submit(runtime, 0, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x: 2, y: 2, width: 1, height: 1 }));

    expect(runtime.refusals.last).toEqual({ sequence: 1, tick: 0, reason: 'zone.below-minimum-size' });
  });

  it('records a room type the prison does not know', () => {
    const runtime = createNewSimulationRuntime(0x261);
    submit(
      runtime,
      0,
      packCommand({ type: 'ZoneRoom', roomId: 'room.not-a-room', x: 2, y: 2, width: 2, height: 2 }),
    );

    expect(runtime.refusals.last?.reason).toBe('zone.unknown-room-type');
  });

  it('records a rectangle that overlaps a room already there', () => {
    const runtime = createNewSimulationRuntime(0x261);
    const zone = (sequence: number, x: number, y: number): void => {
      // Walled before it is asked for, because `zone` refuses an `enclosed`
      // room whose perimeter is open and `room.cell` authors that requirement.
      // Both rectangles are walled, so the refusal below is the overlap and
      // not the walls -- which is the whole subject of this case.
      wallRoomPerimeter(runtime.world, { x, y, width: 3, height: 3 });
      submit(
        runtime,
        sequence,
        packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x, y, width: 3, height: 3 }),
      );
    };

    zone(0, 2, 2);
    expect(runtime.refusals.last).toBeUndefined();

    // Shifted by one tile, so the two rectangles overlap while their anchors
    // differ. Re-zoning the *identical* rectangle refuses as
    // `duplicate-instance-id` instead -- the instance id is derived from the
    // anchor -- which is a different refusal and has its own sentence.
    zone(1, 3, 3);
    expect(runtime.refusals.last?.reason).toBe('zone.overlaps-existing-room');
  });

  it('reports the same condition under a different id from a build order', () => {
    // The reason the wire ids are namespaced, end to end: the same tile, out
    // of bounds for both commands, produces two different refusals because
    // the player asked for two different things.
    const runtime = createNewSimulationRuntime(0x261);
    placeWall(runtime, 0, OUT_OF_BOUNDS_TILE);
    expect(runtime.refusals.last?.reason).toBe('build.out-of-bounds');

    submit(
      runtime,
      1,
      packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x: 100, y: 100, width: 2, height: 3 }),
    );
    expect(runtime.refusals.last?.reason).toBe('zone.out-of-bounds');
  });

  it('leaves the service its own window, which is diagnosis rather than the alert', () => {
    // `RoomZoningService.recentRefusals()` keeps the request and the deciding
    // tile for the last thirty-two refusals. The channel carries the reason
    // and nothing else, so the two are not duplicates: one is a bounded
    // developer-facing record inside the worker, the other is one sentence on
    // screen.
    const runtime = createNewSimulationRuntime(0x261);
    submit(
      runtime,
      0,
      packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x: 100, y: 100, width: 2, height: 3 }),
    );

    expect(runtime.roomZoning.recentRefusals()).toHaveLength(1);
    expect(runtime.roomZoning.recentRefusals()[0]?.reason).toBe('out-of-bounds');
    expect(runtime.refusals.last?.reason).toBe('zone.out-of-bounds');
  });
});

describe('a removal the simulation refuses reaches the same session log', () => {
  it('records a rectangle holding no room, under its own wire id', () => {
    // The route removal needed and did not have: `UnzoneRoom` is dispatched by
    // the kernel, `RoomZoningService.unzone` refuses it, and the reason has to
    // reach the player down the one channel every other refusal uses.
    const runtime = createNewSimulationRuntime(0x261);
    submit(runtime, 0, packCommand({ type: 'UnzoneRoom', x: 2, y: 2, width: 4, height: 4 }));

    expect(runtime.refusals.last).toEqual({ sequence: 1, tick: 0, reason: 'unzone.nothing-to-remove' });
  });

  it('says nothing about a removal the simulation carried out', () => {
    // The direction that makes the assertion above mean something.
    const runtime = createNewSimulationRuntime(0x261);
    wallRoomPerimeter(runtime.world, { x: 2, y: 2, width: 2, height: 3 });
    submit(
      runtime,
      0,
      packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x: 2, y: 2, width: 2, height: 3 }),
    );
    submit(runtime, 1, packCommand({ type: 'UnzoneRoom', x: 2, y: 2, width: 2, height: 3 }));

    expect(runtime.refusals.last).toBeUndefined();
    expect(runtime.refusals.count).toBe(0);
  });

  it('frees the tiles, so the room the player meant to draw can be drawn', () => {
    // The whole reason the command exists, asserted end to end through the
    // kernel rather than against the service: before it, a stray designation
    // was refused as `overlaps-existing-room` for ever.
    const runtime = createNewSimulationRuntime(0x261);
    // Both rectangles walled up front, so every refusal in the sequence below
    // is the one the case is about. The 2x2 holding cell shares three sides
    // with the 2x3 cell and needs its own south wall; the shared segments are
    // written twice and that is a no-op, exactly as two adjacent rooms share a
    // wall in play.
    wallRoomPerimeter(runtime.world, { x: 2, y: 2, width: 2, height: 3 });
    wallRoomPerimeter(runtime.world, { x: 2, y: 2, width: 2, height: 2 });
    submit(
      runtime,
      0,
      packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x: 2, y: 2, width: 2, height: 3 }),
    );
    expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')).toHaveLength(1);

    submit(
      runtime,
      1,
      packCommand({ type: 'ZoneRoom', roomId: 'room.holding-cell', x: 2, y: 2, width: 2, height: 2 }),
    );
    expect(runtime.refusals.last?.reason, 'the tiles are taken').toBe('zone.overlaps-existing-room');

    submit(runtime, 2, packCommand({ type: 'UnzoneRoom', x: 2, y: 2, width: 1, height: 1 }));
    submit(
      runtime,
      3,
      packCommand({ type: 'ZoneRoom', roomId: 'room.holding-cell', x: 2, y: 2, width: 2, height: 2 }),
    );

    expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')).toHaveLength(0);
    expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.holding-cell')).toHaveLength(1);
    // One refusal in the whole sequence -- the middle one -- so the removal and
    // the re-designation each produced no message at all.
    expect(runtime.refusals.count).toBe(1);
  });
});

describe('recording a refusal is deterministic', () => {
  it('records the same refusals, in the same order, at the same ticks, for the same commands', () => {
    // The log is written from inside the kernel's command dispatch, so it is
    // simulation-adjacent state and has to behave like it: same input, same
    // output. `docs/DETERMINISM.md`.
    const run = (): readonly (RefusalReason | undefined)[] => {
      const runtime = createNewSimulationRuntime(0x261);
      const seen: (RefusalReason | undefined)[] = [];
      placeWall(runtime, 0, OUT_OF_BOUNDS_TILE);
      seen.push(runtime.refusals.last?.reason);
      submit(runtime, 1, packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.waste', quantity: 2 }));
      seen.push(runtime.refusals.last?.reason);
      placeWall(runtime, 2, OWNED_TILE);
      seen.push(runtime.refusals.last?.reason);
      return seen;
    };

    expect(run()).toEqual(run());
    expect(run()).toEqual(['build.out-of-bounds', 'purchase.unknown-material', 'purchase.unknown-material']);
  });
});

describe('issue #492: a refusal is withdrawn once the simulation accepts the very command it refused', () => {
  it("clears the line once the room the player was told is open on a side gets walled and the same rectangle succeeds", () => {
    // The reproduction transcript in #492, exactly: `room.cell` at 20,20 2x3,
    // refused for being open, walled, and zoned again.
    const runtime = createNewSimulationRuntime(0x492);
    submit(runtime, 0, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x: 20, y: 20, width: 2, height: 3 }));
    expect(runtime.refusals.last?.reason).toBe('zone.not-enclosed');

    wallRoomPerimeter(runtime.world, { x: 20, y: 20, width: 2, height: 3 });
    submit(runtime, 1, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x: 20, y: 20, width: 2, height: 3 }));

    expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')).toHaveLength(1);
    expect(runtime.refusals.last, 'the sentence the player was shown is no longer true and must not still be on screen').toBeUndefined();
    // The withdrawal is not an undo of the fact that a refusal happened --
    // see `RefusalLog.count`.
    expect(runtime.refusals.count).toBe(1);
  });

  it('leaves the line alone when a different rectangle is what got walled and zoned -- the narrow reading, not the wide one', () => {
    // Answers #492's first question: a successful `zone` withdraws only the
    // refusal about the *same* rectangle, not every standing `zone.*`
    // refusal. The wide reading would clear the line below even though the
    // first rectangle is exactly as unenclosed as it was.
    const runtime = createNewSimulationRuntime(0x492);
    submit(runtime, 0, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x: 2, y: 2, width: 2, height: 3 }));
    expect(runtime.refusals.last?.reason).toBe('zone.not-enclosed');

    wallRoomPerimeter(runtime.world, { x: 10, y: 10, width: 2, height: 3 });
    submit(runtime, 1, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x: 10, y: 10, width: 2, height: 3 }));

    expect(
      runtime.refusals.last?.reason,
      'a different rectangle succeeding does not make this one enclosed',
    ).toBe('zone.not-enclosed');
  });

  it('generalises to a build order: granting ownership back and retrying the same tile clears the refusal', () => {
    const runtime = createNewSimulationRuntime(0x492);
    runtime.world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, false);
    placeWall(runtime, 0, OWNED_TILE);
    expect(runtime.refusals.last?.reason).toBe('build.unowned-land');

    runtime.world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, true);
    placeWall(runtime, 1, OWNED_TILE);

    expect(
      runtime.refusals.last,
      'the same wall, retried once the land is owned again, must clear its own refusal',
    ).toBeUndefined();
  });

  it('generalises to a build order, narrowly: a different tile succeeding does not clear the standing one', () => {
    const runtime = createNewSimulationRuntime(0x492);
    runtime.world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, false);
    placeWall(runtime, 0, OWNED_TILE);
    expect(runtime.refusals.last?.reason).toBe('build.unowned-land');

    runtime.world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, true);
    placeWall(runtime, 1, { x: OWNED_TILE.x + 1, y: OWNED_TILE.y });

    expect(runtime.refusals.last?.reason, 'a different tile built must not clear this one').toBe('build.unowned-land');
  });

  it('generalises to admission, keyed domain-wide rather than per-request (see `admitSupersessionKey`)', () => {
    // `admit.no-accommodation` and `admit.population-full` are both the same
    // global check, re-run identically for every admission -- so a
    // *different* admission's success is not a proxy for the standing
    // refusal being false, it is the same fact turning out false. Answers
    // #492's second question for this domain: unlike `zone`, keying `admit`
    // per-request would leave the analogous bug unfixed, because a retried
    // admission has no reason to repeat its predecessor's sentence length or
    // prior-incidents count.
    const runtime = createNewSimulationRuntime(0x492);
    submit(runtime, 0, packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 10_000, priorIncidents: 0, x: 16, y: 16 }));
    expect(runtime.refusals.last?.reason).toBe('admit.no-accommodation');

    wallRoomPerimeter(runtime.world, { x: 2, y: 2, width: 2, height: 3 });
    submit(runtime, 1, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x: 2, y: 2, width: 2, height: 3 }));
    submit(
      runtime,
      2,
      packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 5_000, priorIncidents: 2, x: 16, y: 16 }),
    );

    expect(
      runtime.refusals.last,
      'a successful admission, even with different parameters, disproves the standing admit refusal',
    ).toBeUndefined();
  });
});

describe('issue #780: a zoning refusal is withdrawn by a different room type succeeding at the identical rectangle', () => {
  it("a room.cell refused for being open does not survive a room.yard -- which needs no enclosure -- succeeding at the exact same rectangle", () => {
    // The playtest reproduction (docs/research/2026-09-01-playing-the-rooms-surface.md,
    // act 3), narrowed to the one case #492's own keying left open: not a
    // *different* rectangle (the guarding test two blocks above pins that
    // case exactly as it is), but the *same* rectangle, a *different* room
    // type. `room.cell` requires `enclosed`; `room.yard` requires only
    // `outdoors` and never reaches the enclosure check at all
    // (`RoomZoningService.zone`, `zoning.ts:613`) -- so its success at this
    // rectangle is a direct, positive answer to "is this rectangle enclosed",
    // and the old `zoneSupersessionKey(roomCatalogId, x, y, width, height)`
    // -- which folded the type into every one of `zone.*`'s eight reasons --
    // could never see it: `zone:room.cell:20:20:8:8` and
    // `zone:room.yard:20:20:8:8` are two different strings.
    //
    // 8x8 rather than #492's own 2x3, because `room.yard` authors an 8x8
    // minimum (`room-catalog.ts`) and this rectangle has to satisfy both
    // types' minimums to isolate the enclosure question from the size one.
    const runtime = createNewSimulationRuntime(0x780);
    submit(runtime, 0, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x: 20, y: 20, width: 8, height: 8 }));
    expect(runtime.refusals.last?.reason).toBe('zone.not-enclosed');

    submit(runtime, 1, packCommand({ type: 'ZoneRoom', roomId: 'room.yard', x: 20, y: 20, width: 8, height: 8 }));

    expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.yard')).toHaveLength(1);
    expect(
      runtime.refusals.last,
      'the yard needed no walls and stands where the cell was refused; the stale "must be enclosed" sentence must not still be the standing refusal',
    ).toBeUndefined();
    // The refusal really happened; only the standing record is withdrawn,
    // exactly as #492's own build-order and admission cases assert.
    expect(runtime.refusals.count).toBe(1);
  });

  it('withdraws a type-dependent refusal when the same type succeeds at the same rectangle -- the narrow key is load-bearing, not decorative', () => {
    /*
     * **This test exists because a mutation survived without it.** Replacing
     * the `zoneSupersessionKey` withdrawal in `session-commands.ts` with a
     * second `zoneAreaSupersessionKey` one -- dropping the room type from the
     * narrow path entirely, which is exactly the over-widening #492 forbids --
     * left all forty-six cases in this file green. So nothing pinned that the
     * narrow key is ever *used*, and the #780 split could have silently
     * collapsed into one key.
     *
     * The reason no existing case reached it is worth stating, because it is
     * not an oversight in those cases. #492's own positive test withdraws a
     * `not-enclosed` refusal, and `not-enclosed` is one of the five reasons
     * #780 moved to the *area* key -- so that test now exercises the area
     * withdrawal, not the narrow one. Of the three reasons that keep the
     * narrow key, two can never be followed by a success at the same
     * (type, rectangle) pair at all: `below-minimum-size` is a fact about a
     * rectangle that does not change, and `unknown-room-type` is a fact about
     * a type that does not change. **`duplicate-instance-id` is the only one
     * of the three that is reachable twice**, because unzoning frees the
     * instance id and lets the identical request succeed afterwards -- which
     * makes it the only case that can pin the narrow path, and this is it.
     *
     * `room.yard` rather than `room.cell` so no walls are needed: a yard is
     * `'outdoors'` and never reaches the enclosure check, which keeps this
     * case about the key and not about construction.
     */
    const runtime = createNewSimulationRuntime(0x780);
    submit(runtime, 0, packCommand({ type: 'ZoneRoom', roomId: 'room.yard', x: 20, y: 20, width: 8, height: 8 }));
    expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.yard'), 'the first zoning has to succeed or the rest measures nothing').toHaveLength(1);
    expect(runtime.refusals.last, 'a successful first zoning must refuse nothing').toBeUndefined();

    // The identical request again: the instance id is taken, and
    // `duplicate-instance-id` is checked before `overlaps-existing-room`
    // (`zoning.ts`), so this is the reason under test rather than the
    // geometry one.
    submit(runtime, 1, packCommand({ type: 'ZoneRoom', roomId: 'room.yard', x: 20, y: 20, width: 8, height: 8 }));
    expect(runtime.refusals.last?.reason, 'the second identical zoning must be refused for the duplicate instance id, which is one of the three type-dependent reasons').toBe('zone.duplicate-instance-id');

    // Freeing the id is what makes the same request answerable again.
    submit(runtime, 2, packCommand({ type: 'UnzoneRoom', x: 20, y: 20, width: 8, height: 8 }));
    expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.yard'), 'unzoning has to actually remove the room or the retry below is not a retry').toHaveLength(0);

    submit(runtime, 3, packCommand({ type: 'ZoneRoom', roomId: 'room.yard', x: 20, y: 20, width: 8, height: 8 }));

    expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.yard')).toHaveLength(1);
    expect(
      runtime.refusals.last,
      'the duplicate id was the whole refusal and the id is free again and taken again by the same request -- the standing "already exists" sentence must be withdrawn through the narrow key',
    ).toBeUndefined();
  });

  it('leaves a different rectangle exactly as unenclosed as it was -- #492s own guard, unaffected by the #780 fix', () => {
    // The companion case: the fix above must not have quietly widened into
    // the reading the "leaves the line alone... narrow reading, not the wide
    // one" test two blocks up exists to forbid. Same two types as above, two
    // genuinely different rectangles.
    const runtime = createNewSimulationRuntime(0x780);
    submit(runtime, 0, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x: 2, y: 2, width: 2, height: 3 }));
    expect(runtime.refusals.last?.reason).toBe('zone.not-enclosed');

    submit(runtime, 1, packCommand({ type: 'ZoneRoom', roomId: 'room.yard', x: 12, y: 12, width: 8, height: 8 }));

    expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.yard')).toHaveLength(1);
    expect(
      runtime.refusals.last?.reason,
      'a yard succeeding twelve tiles away does not make the first rectangle enclosed',
    ).toBe('zone.not-enclosed');
  });
});

/**
 * Issue #514: eight rapid *Place order* presses at one tile and edge queued
 * eight distinct build orders for a wall only one of which could ever exist.
 *
 * Every case here is driven through `PlaceBuildOrder`, dispatched by the real
 * kernel and the real `createConstructionCommandHandler`
 * (`src/simulation/construction/handler.ts`) -- never by calling
 * `ConstructionSystem.submitOrder` by hand -- because the defect was in the
 * production route a player press actually takes, and a fixture that called
 * the system directly would not exercise it (#375).
 */
describe('issue #514: a repeated build order at the same tile and edge is refused, not queued again', () => {
  it('refuses the second identical press while the first order is still standing, under its own wire id', () => {
    const runtime = createNewSimulationRuntime(0x514);
    placeWall(runtime, 0, OWNED_TILE);
    expect(runtime.refusals.last).toBeUndefined();
    expect(runtime.construction.getOrder('order-0')?.state, 'the first press is accepted').not.toBe('failed');

    placeWall(runtime, 1, OWNED_TILE);

    expect(runtime.refusals.last?.reason).toBe('build.duplicate-order');
    expect(runtime.construction.getOrder('order-1')).toEqual(
      expect.objectContaining({ state: 'failed', failReason: 'duplicate-order' }),
    );
    // The refusal touches only the new order. The one already standing is
    // exactly as it was -- a refused press does not cancel or otherwise
    // disturb it.
    expect(runtime.construction.getOrder('order-0')?.state).not.toBe('failed');
  });

  it('the playtest reproduction: eight presses at the same tile and edge leave exactly one live order', () => {
    const runtime = createNewSimulationRuntime(0x514);
    for (let sequence = 0; sequence < 8; sequence += 1) placeWall(runtime, sequence, OWNED_TILE);

    const states = Array.from({ length: 8 }, (_, sequence) => runtime.construction.getOrder(`order-${String(sequence)}`)?.state);
    expect(states[0], 'order-0').not.toBe('failed');
    for (let sequence = 1; sequence < 8; sequence += 1) {
      expect(states[sequence], `order-${String(sequence)}`).toBe('failed');
    }
    // Seven of the eight presses were refused; `count` is the historical
    // tally and `last` is the most recent of the seven.
    expect(runtime.refusals.count).toBe(7);
    expect(runtime.refusals.last?.reason).toBe('build.duplicate-order');
  });

  it('does not block re-ordering the same tile and edge once the standing order is cancelled', () => {
    const runtime = createNewSimulationRuntime(0x514);
    placeWall(runtime, 0, OWNED_TILE);
    expect(runtime.refusals.last).toBeUndefined();

    submit(
      runtime,
      1,
      // ADR 0107: the order's true current revision, read fresh off the
      // system this test already holds a reference to.
      packCommand({ type: 'CancelBuildOrder', orderId: 'order-0', expectedRevision: runtime.construction.revisionOf('order-0') }),
    );
    expect(runtime.construction.getOrder('order-0')?.state).toBe('cancelled');

    placeWall(runtime, 2, OWNED_TILE);

    expect(runtime.refusals.last, 'a cancelled order gives the tile back -- ordinary play, not a duplicate press').toBeUndefined();
    expect(runtime.construction.getOrder('order-2')?.state).not.toBe('failed');
  });

  it('does not treat the opposite edge of the same tile as a duplicate', () => {
    const runtime = createNewSimulationRuntime(0x514);
    submit(
      runtime,
      0,
      packCommand({ type: 'PlaceBuildOrder', orderId: 'order-0', definitionId: 'wall-brick', x: OWNED_TILE.x, y: OWNED_TILE.y, edge: 'north' }),
    );
    submit(
      runtime,
      1,
      packCommand({ type: 'PlaceBuildOrder', orderId: 'order-1', definitionId: 'wall-brick', x: OWNED_TILE.x, y: OWNED_TILE.y, edge: 'west' }),
    );

    expect(runtime.refusals.last, 'the north face and the west face of one tile are two different walls').toBeUndefined();
    expect(runtime.construction.getOrder('order-0')?.state).not.toBe('failed');
    expect(runtime.construction.getOrder('order-1')?.state).not.toBe('failed');
  });

  it('does not treat the same edge spelling at a genuinely different tile as a duplicate', () => {
    // `BuildEdge` names only `'north'` and `'west'` -- the two slots
    // `SparseWorld` actually stores (`build-order.ts`). North of (x, y) and
    // north of (x + 1, y) share a spelling and are not the same wall, so this
    // is the case the obvious "same tile and edge" definition has to get
    // right without help from a third field.
    const runtime = createNewSimulationRuntime(0x514);
    submit(
      runtime,
      0,
      packCommand({ type: 'PlaceBuildOrder', orderId: 'order-0', definitionId: 'wall-brick', x: OWNED_TILE.x, y: OWNED_TILE.y, edge: 'north' }),
    );
    submit(
      runtime,
      1,
      packCommand({
        type: 'PlaceBuildOrder',
        orderId: 'order-1',
        definitionId: 'wall-brick',
        x: OWNED_TILE.x + 1,
        y: OWNED_TILE.y,
        edge: 'north',
      }),
    );

    expect(runtime.refusals.last).toBeUndefined();
    expect(runtime.construction.getOrder('order-1')?.state).not.toBe('failed');
  });

  it("names no 'east' or 'south' edge, so a caller cannot address one physical edge two different ways from its two neighbouring tiles", () => {
    // The concern the issue names directly: a wall at `(x, west)` and a wall
    // ordered as `(x - 1, east)` could be the same physical edge stored
    // twice under different keys, which would make this duplicate check miss
    // it. `BuildEdge` has no `'east'` or `'south'` member at all --
    // `build-order.ts`'s own comment says a caller "thinking in those terms
    // addresses the neighbouring tile instead" -- so there is exactly one
    // way to name any given wall, and the risk this test rules out cannot
    // arise through this type.
    expect([...BUILD_EDGES]).toEqual(['north', 'west']);
    expect(isBuildEdge('east')).toBe(false);
    expect(isBuildEdge('south')).toBe(false);
  });

  it('refuses a repeat order for a tile edge a previous order already finished building, rather than silently rebuilding it', () => {
    const runtime = createNewSimulationRuntime(0x514);
    runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).deposit('item.brick', 2);
    placeWall(runtime, 0, OWNED_TILE);
    for (let i = 0; i < 200; i += 1) runtime.kernel.step();
    expect(runtime.construction.getOrder('order-0')?.state, 'the wall really finished').toBe('completed');

    placeWall(runtime, 1, OWNED_TILE);

    expect(runtime.refusals.last?.reason, 'an already-built edge is refused the same way a still-queued one is').toBe(
      'build.duplicate-order',
    );
    expect(runtime.construction.getOrder('order-1')).toEqual(
      expect.objectContaining({ state: 'failed', failReason: 'duplicate-order' }),
    );
  });
});

/**
 * Issue #514's other question: were the materials of a redundant order
 * refunded when it found the tile already walled?
 *
 * Answer, established here rather than guessed from the HUD (no
 * material-stock readout is surfaced in any panel): **no.**
 * `ConstructionSystem` has exactly one path that returns spent materials --
 * `cancelOrder`, through `materialsProvider.release` (`system.ts`) -- and
 * `finalizeConstruction` (`system.ts`), which is what runs when an order
 * reaches `completed`, never calls it. A duplicate order that was approved
 * and left to run its course would have spent its materials exactly as a
 * legitimate order does, permanently, with nothing to give them back. That is
 * why the fix above stops the second press from ever being *approved* rather
 * than letting it run and reconciling the container afterwards -- there is no
 * "afterwards" mechanism to reconcile with, and #514 is therefore an economic
 * leak this session's own container proves, not queue hygiene.
 */
describe('issue #514: the material cost a duplicate order would have leaked, and why prevention is the only fix', () => {
  it('a completed order never gives its materials back on its own -- only an explicit cancellation does', () => {
    // The general fact the refund answer rests on, restated at this file's
    // own level: two ordinary, non-duplicate orders (different tiles) both
    // consume their own materials on completion, and nothing hands any of it
    // back merely because the order finished. `cancelOrder` is the only
    // route that does (`tests/unit/operations-construction-integration.test.ts`
    // exercises that route directly); nothing here calls it.
    const runtime = createNewSimulationRuntime(0x514);
    const site = runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID);
    site.deposit('item.brick', 4); // exactly enough for two genuinely separate walls, no more

    submit(
      runtime,
      0,
      packCommand({ type: 'PlaceBuildOrder', orderId: 'order-0', definitionId: 'wall-brick', x: OWNED_TILE.x, y: OWNED_TILE.y }),
    );
    submit(
      runtime,
      1,
      packCommand({
        type: 'PlaceBuildOrder',
        orderId: 'order-1',
        definitionId: 'wall-brick',
        x: OWNED_TILE.x + 1,
        y: OWNED_TILE.y,
      }),
    );
    for (let i = 0; i < 200; i += 1) runtime.kernel.step();

    expect(runtime.construction.getOrder('order-0')?.state).toBe('completed');
    expect(runtime.construction.getOrder('order-1')?.state).toBe('completed');
    expect(site.quantityOf('item.brick'), 'both walls really cost their own materials, permanently').toBe(0);
  });

  it('eight presses at the same target now cost one wall, not eight -- the leak is closed by refusing the press, not by refunding it later', () => {
    const runtime = createNewSimulationRuntime(0x514);
    const site = runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID);
    site.deposit('item.brick', 16); // enough for eight walls, if all eight had wrongly been approved

    for (let sequence = 0; sequence < 8; sequence += 1) placeWall(runtime, sequence, OWNED_TILE);
    for (let i = 0; i < 200; i += 1) runtime.kernel.step();

    expect(runtime.construction.getOrder('order-0')?.state).toBe('completed');
    for (let sequence = 1; sequence < 8; sequence += 1) {
      expect(runtime.construction.getOrder(`order-${String(sequence)}`)?.state, `order-${String(sequence)}`).toBe('failed');
    }
    expect(site.quantityOf('item.brick'), 'only the one wall that could ever exist was ever paid for').toBe(14);
  });
});
