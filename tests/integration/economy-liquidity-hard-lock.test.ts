import { createHistoricalOpeningRuntime } from '../helpers/historical-opening-treasury';
import { describe, expect, it } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS, procurableMaterial } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction/definition';
import {
  INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS,
  INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS,
  INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS,
} from '../../src/simulation/economy';
import { packCommand, simulationCommandSchema, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { wallRoomPerimeter } from '../helpers/room-walls';

/** Historical 25,000-grant scenario: keep its original economy boundary. */
const SCENARIO_STARTING_BALANCE_MINOR_UNITS = 25_000;
const SCENARIO_OVERDRAFT_FLOOR_MINOR_UNITS = -2_500;

/**
 * **A legal purchase can spend a new prison out of the game.**
 *
 * Audit finding ECON-002, reproduced here by playing it rather than by reading
 * for it. The shape of the trap is a closed loop between three facts that are
 * each correct on their own:
 *
 * 1. **State income is paid per occupied place** and an occupied place needs a
 *    registered room instance with `residentCapacity > 0`
 *    (`src/simulation/economy/income.ts`, `OccupiedPlaceSource`).
 * 2. **Capacity comes from a standing `sleep-surface` object**, and both objects
 *    in the catalogue that carry that capability -- `object.bed` and
 *    `object.medical-bed` -- are built by definitions requiring
 *    `item.wood-plank` and nothing else (`BUILDABLE_REGISTRY`, pinned below).
 *    No brick-built definition places a sleep surface.
 * 3. **A plank costs money and money has exactly two sources**: the opening
 *    balance, and `StateIncomeSystem`. There is no sell command, no production,
 *    no gathering and no grant -- the whole command union is enumerated below
 *    rather than asserted about.
 *
 * So a session that reaches *spending power below one plank's price with no
 * plank in stock and nothing plank-built to reverse* can never earn another
 * minor unit. `MAX_PURCHASE_QUANTITY` is 100,000 and `src/main.ts`'s Build panel
 * opens its stepper on that same bound rather than on affordability
 * (`purchasableMaterialFor`), so one press of a control the game offers reaches
 * it.
 *
 * ## What #703 ruling A moved here, and what it did not
 *
 * **The sentence above read *"cash below one plank's price"* until 2026-08-31,
 * and cash was the right word then**: the balance could not go below zero, so
 * spending power and cash were the same number. #703 ruled a standing overdraft
 * every prison has ([ADR 0083](../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
 * §2), `createNewSimulationRuntime` opens `SCENARIO_OVERDRAFT_FLOOR_MINOR_UNITS`
 * on every treasury, and the two numbers came apart.
 *
 * **Measured on this file, and the two halves came out differently:**
 *
 * - **The purchase route is translated, not cured.** The trap's shape is
 *   untouched -- `Treasury.canAfford` is `balance - amount >= floor`, so what
 *   ends a prison is `balance - 65 < floor` rather than `balance < 65`. A player
 *   who keeps pressing until something is refused is locked at the floor
 *   instead of at 40, which is 2,520 minor units lower and 63 bricks later. The
 *   sequences below spend the room as well as the grant, and reproduce every
 *   step.
 * - **The payroll route is cured.** `PayrollSystem.update` bounds the day's
 *   payment by `Math.min(due, this.treasury.balanceMinorUnits)` -- by the
 *   *balance*, not by what `spend` allows -- so wages can walk a prison to 0
 *   and no further, and at 0 the standing overdraft buys the plank. The case at
 *   the bottom of this file used to end with a prison that could never earn
 *   again; it now ends with one that recovers, and the old expectations are
 *   quoted where they stood.
 *
 * ## What the owner's ruling 19 of 2026-08-31 moved, and it is more than a
 * number
 *
 * Ruling 19 -- *"Dać szczeblom własne progi wewnątrz debetu"*, drafted as ADR
 * 0017's "Amendment, 2026-09-01" -- gives ADR 0017 decision 8's three rungs
 * their own thresholds inside the overdraft: a press stops at -1,250, the build
 * queue's own procurement at -2,000, and wages at the floor. Both halves of the
 * two-bullet finding above move again, and in opposite directions:
 *
 * - **The purchase route is no longer a lock at all.** The trap needed the
 *   press and the queue to share one threshold. They do not: whatever a player
 *   presses their way to, the queue keeps 750 more, which buys the 65 plank the
 *   press was refused. The first case below now measures the *recovery* where it
 *   used to measure five failed escapes, and every one of the old expectations
 *   is quoted where it stood.
 * - **The payroll route walks further than it did.** Wages are the rung at the
 *   floor, so a payday draws on the overdraft down to -2,500 instead of stopping
 *   at 0. It still does not lock anybody, for the reason the case says, but the
 *   prison spends its facility on wages while it waits rather than holding it.
 *
 * ## What the owner's ruling on #771 (2026-09-01) reopens, and this is the
 * largest single consequence this branch measured
 *
 * **The purchase-route cure above depended entirely on the press and the
 * queue *not* sharing a threshold, and #771's equalisation removes exactly
 * that.** #771 found the 750 minor units of daylight between the two rungs
 * had a cost the sentence above does not name: it was a purchase-route escape
 * from ECON-002's own lock, and closing the daylight closes the escape with
 * it. Measured directly, on the exact fixture that used to demonstrate the
 * recovery (`BALANCE_AT_THE_RUNG = -1,240`, no plank in stock, no bed built):
 * a `PlaceObject` for a bed now stays `materials-pending` for ever, exactly as
 * it did before ruling 19 shipped, because `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS`
 * is now the same -1,250 the press already stops at and `-1,240 - 65 = -1,305`
 * clears neither. **No admission can hold an occupancy slot, `StateIncomeSystem`
 * pays nothing, and the loop this file opens with -- a session that reaches
 * this balance can never earn another minor unit -- is true again**, for the
 * player who spends by pressing Buy rather than by queuing a build order.
 *
 * **This is reported here rather than reversed here.** The owner ruled on
 * #771 with the cost of narrowing the construction rung stated and accepted;
 * what neither the ruling nor its statement of cost named is that the
 * construction rung's extra depth was, on this one fixture, the only thing
 * standing between a new prison and ADR 0075's hard lock. ADR 0075 decision 1
 * (development grants at population thresholds) and decision 3 (sell-back)
 * are still unimplemented -- nothing in `src/` reads a population threshold
 * for money, and there is no sell command -- and decision 2's loan
 * (`LoanBook`) is built only when `loanTerms` is supplied, which nothing in
 * `src/` does either. So none of ADR 0075's other remedies is standing behind
 * this lock today; the case below is updated to assert it is a lock again,
 * and `docs/adr/0017-money-primary-resource-model.md`'s #771 amendment names
 * this as a consequence the owner was not shown when they ruled, for a
 * decision on what closes it.
 *
 * The payroll-route case at the bottom of this file is unaffected: it buys
 * its plank with a direct player press (`PurchaseMaterials`, the
 * `'deliveries'` rung), which #771 does not move, and every figure in that
 * case is unchanged.
 *
 * ## What the owner's second ruling on #771 (2026-09-01) closes
 *
 * The reopening above was put back to the owner with its cost stated
 * plainly, alongside the three shapes ADR 0017's equalisation amendment §9
 * named and did not choose between. Their ruling: *"A fresh, unfurnished
 * prison gets a rung of its own — a lower limit, enough that it can always
 * afford its first plank. Equalisation stands; the starter exemption is how
 * the lock stays shut."* Drafted as ADR 0017's "Amendment, 2026-09-01: a
 * starter rung for a fresh, unfurnished prison."
 *
 * **"Fresh, unfurnished" is `RoomInstanceRegistry.totalResidentCapacity ===
 * 0`** — the summed `residentCapacity` of every registered room instance,
 * read live at the moment of a press or a hire
 * (`src/simulation/runtime/session-commands.ts`), never cached. It is `0`
 * exactly when nothing anywhere has a standing `'sleep-surface'` object, which
 * is precisely ECON-002's own precondition (`docs/adr/0075-…`'s "cash below
 * 65, no plank in stock, and nothing plank-built to reverse"), so the
 * exemption cannot outlive the condition it exists for and cannot go stale:
 * the moment a build order places the first bed or medical bed,
 * `RoomCapacityResolver` raises that instance's `residentCapacity` above
 * zero and the very next command sees it, with nothing to remember and
 * nothing to forget.
 *
 * **The limit: `'deliveries'` and `'hiring'` are refused below −1,185 rather
 * than −1,250 while fresh** (`INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS`,
 * `src/simulation/economy/treasury.ts`) — the mature rung shifted shallower
 * by exactly one plank's price (65). `'construction'` is untouched, still
 * −1,250, which is the room the shallower press reserves: `Treasury.canAfford`
 * enforces `balance ≥ floor` on every spend, so a fresh `'deliveries'` balance
 * can never fall below −1,185, and `−1,185 − 65 = −1,250` is exactly the
 * construction rung — so a queued build order's one-plank purchase always
 * clears, from wherever a press left the balance. That is an inequality over
 * the whole reachable range (proved and swept in
 * `tests/unit/economy-treasury.test.ts`), not a property of the one balance
 * this file happens to press to.
 *
 * **The case below is rewritten rather than merely re-valued**, because the
 * shallower rung changes which press even *reaches* the trap's neighbourhood:
 * `BRICKS_TO_THE_RUNG` (656, landing on `BALANCE_AT_THE_RUNG = -1,240`) is now
 * refused outright for a fresh prison — the starter rung stops the press three
 * bricks earlier, at `STARTER_BRICKS_TO_THE_RUNG` (654), before the balance
 * ever reaches the neighbourhood ECON-002 needs. Both figures are kept, named,
 * because the file's own history is the record of what each ruling moved.
 *
 * **The exemption ends the instant the first bed completes, and the ADR's own
 * arithmetic is why that is not a cliff.** At the worst reachable fresh
 * balance the construction spend lands exactly on the mature rung
 * (`−1,185 − 65 = −1,250`), never below it — so furnishing a prison can only
 * ever *widen* the room a press has next, never narrow it. The case below
 * measures that transition in the kernel rather than only in the arithmetic:
 * the balance after the bed completes sits below where the starter rung would
 * have refused everything, and the prison is furnished, not locked.
 *
 * ## What this file is not
 *
 * It is not an assertion of the trap's *shape*. The trap is established by
 * exhausting the escapes: every command that could plausibly restore liquidity
 * is sent through the real kernel and its refusal or its no-effect is measured.
 * A test that merely asserted "balance is 0" would certify the defect.
 *
 * ## Why every figure is a literal
 *
 * `docs/TESTING.md`'s rule, and `economy-purchase-cancellation.test.ts`'s
 * practice: a balance computed from a price read out of the catalogue would
 * agree with any price. `item.brick` is 40, `item.wood-plank` is 65 and a
 * session opens on 25,000, so 625 x 40 = 25,000 is written out. The standing
 * overdraft is written out for the same reason and pinned in the first case
 * below, so a change to the shipped magnitude fails there with the reason named
 * instead of being silently followed.
 */

const SEED = 0x0ec002;
/**
 * The standing overdraft every session opens with (#703 ruling A), written out
 * and pinned below rather than imported into the arithmetic.
 *
 * > Spending power is `25,000 + 2,500 = 27,500`, which is 687 bricks and 40 left
 * > over -- so 687 x 40 leaves **-2,480**, exactly the shape 625 x 40 leaving 0
 * > had before the ruling, and 2,480 of the 2,500 is spent.
 *
 * **The owner's ruling 19 of 2026-08-31 moved what a *press* may spend, and the
 * paragraph above is kept because the overdraft itself has not moved.** Ruling
 * 19 -- drafted as ADR 0017's "Amendment, 2026-09-01" -- gives ADR 0017 decision
 * 8's rungs their own thresholds inside the overdraft, and a `PurchaseMaterials`
 * is the first of them: refused below -1,250. So the press that reaches the
 * bottom is **656** bricks rather than 687, and the bottom the *player* can
 * press their way to is -1,240 rather than -2,480. The trap's shape is
 * untouched -- it is still `[rung, rung + 65)` in the balance, 65 wide -- and
 * only where it sits has moved, which is the same correction #703 ruling A made
 * to the same sentence one ruling earlier.
 */
const OVERDRAFT_ROOM = 2_500;
/**
 * The first rung, which is what bounds a press (ruling 19). Written out and
 * pinned beside `OVERDRAFT_ROOM` for the same reason.
 */
const DELIVERY_RUNG_ROOM = 1_250;
/** 26,250 / 40, rounded down: the largest whole brick order a new prison can press. */
const BRICKS_TO_THE_RUNG = 656;
/** 25,000 - 656 x 40. The 10 that is left is unspendable on a 65 plank, exactly as the pre-ruling 40 was. */
const BALANCE_AT_THE_RUNG = -1_240;
/**
 * The owner's second ruling on #771 (2026-09-01): the starter rung shifts a
 * *fresh, unfurnished* prison's `'deliveries'`/`'hiring'` threshold shallower
 * by one plank's price (65), to 1,185 of room rather than 1,250. Pinned here
 * beside `DELIVERY_RUNG_ROOM` for the same reason: a shipped magnitude that
 * moved would fail this line with the arithmetic to correct, rather than
 * silently re-deriving every figure below.
 */
const STARTER_RUNG_ROOM = DELIVERY_RUNG_ROOM - 65;
/**
 * 26,185 / 40, rounded down: the largest whole brick order a **fresh,
 * unfurnished** prison can press under the shallower starter rung — three
 * fewer than `BRICKS_TO_THE_RUNG`, because the starter rung stops the press
 * before it ever reaches the neighbourhood the mature rung's own 656 does.
 */
const STARTER_BRICKS_TO_THE_RUNG = 654;
/** 25,000 - 654 x 40. 25 of press room left: short of a 65 plank via a second press, and exactly enough for one at the unaffected construction rung. */
const STARTER_BALANCE_AT_THE_RUNG = -1_160;
const CELL = 'room.cell';
/** `room.cell`'s authored minimum, the rectangle every object fixture in this repository uses. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const BED_TILE = { x: 4, y: 6 } as const;
/** The tile `src/main.ts` admits at. */
const ARRIVAL = { x: 16, y: 16 };
const ADMISSION = { sentenceLengthTicks: 100_000, priorIncidents: 0 };

function send(runtime: SimulationRuntime, id: string, command: SimulationCommand): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, packCommand(command));
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

const stockOf = (runtime: SimulationRuntime, itemId: string): number =>
  runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).quantityOf(itemId);

describe('the treasury spent to nothing on one legal purchase (ECON-002)', () => {
  it('pins every figure the sequences below are written from', () => {
    expect(SCENARIO_STARTING_BALANCE_MINOR_UNITS).toBe(25_000);
    expect(procurableMaterial('item.brick')?.unitPriceMinorUnits).toBe(40);
    expect(procurableMaterial('item.wood-plank')?.unitPriceMinorUnits).toBe(65);
    /*
     * The one figure in this file that is production configuration rather than
     * content, pinned so that moving the shipped overdraft fails here -- with
     * the arithmetic in `OVERDRAFT_ROOM`'s comment to correct -- instead of
     * quietly re-deriving every balance below.
     */
    expect(SCENARIO_OVERDRAFT_FLOOR_MINOR_UNITS, '#703 ruling A: one tenth of the opening grant').toBe(-OVERDRAFT_ROOM);
    expect(INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS, 'ruling 19: the rung a mature prison`s press stops at').toBe(
      -DELIVERY_RUNG_ROOM,
    );
    expect(SCENARIO_STARTING_BALANCE_MINOR_UNITS - BRICKS_TO_THE_RUNG * 40, 'the pre-starter-rung reproduction').toBe(
      BALANCE_AT_THE_RUNG,
    );
    /*
     * The owner's second ruling on #771 (2026-09-01): a fresh, unfurnished
     * prison's `'deliveries'`/`'hiring'` rung is shallower by exactly one
     * plank's price, and `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS` --
     * the room the shallower rung reserves -- is unaffected by it.
     */
    expect(
      INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS,
      'the starter rung: shallower than the mature one by one plank`s price',
    ).toBe(-STARTER_RUNG_ROOM);
    expect(STARTER_RUNG_ROOM, '1,250 - 65').toBe(1_185);
    expect(
      INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS - 65,
      'shallower by exactly one plank, so subtracting it back out lands on the unaffected construction rung',
    ).toBe(INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS);
    expect(
      SCENARIO_STARTING_BALANCE_MINOR_UNITS - STARTER_BRICKS_TO_THE_RUNG * 40,
      'the largest press a fresh, unfurnished prison can make',
    ).toBe(STARTER_BALANCE_AT_THE_RUNG);
  });

  it('has exactly two ways to buy a sleep surface and both are priced in planks', () => {
    /*
     * The step in the argument that a reader would otherwise have to take on
     * trust, and the one a content change is most likely to move: if any
     * buildable placing a `sleep-surface` object could be bought with bricks,
     * 625 bricks would not be a trap at all.
     *
     * Derived from the two catalogues rather than listed, so a new brick-built
     * bed fails here with the reason named.
     */
    const sleepSurfaceBuildables = [...BUILDABLE_REGISTRY.values()]
      .filter((definition) => definition.placesObjectId === 'object.bed' || definition.placesObjectId === 'object.medical-bed')
      .map((definition) => [definition.id, definition.materialsRequired] as const)
      .sort((left, right) => (left[0] < right[0] ? -1 : 1));
    expect(sleepSurfaceBuildables).toEqual([
      ['bed-wooden', [{ itemId: 'item.wood-plank', quantity: 1 }]],
      ['medical-bed-wooden', [{ itemId: 'item.wood-plank', quantity: 1 }]],
    ]);
  });

  it('now offers exactly one command that turns stock back into money, at a loss the class does not reopen from empty', () => {
    /*
     * **This test's own title used to be "offers no command that turns stock,
     * or anything else, back into money", and that claim is the one this
     * change falsifies on purpose.** ADR 0075 decision 3 named the day this
     * would happen before it did: "A `SellMaterials` added by decision 3
     * below fails that assertion and sends its author here, deliberately."
     * This is that day. The title is corrected rather than the old one kept
     * silently wrong, per `docs/AGENT_WORKFLOW.md` §4 -- a reader who meets
     * the retired claim elsewhere needs to see which half of it survived.
     *
     * **What survives.** The exhaustive half of "there is no escape" is still
     * the enumeration below: `simulationCommandSchema` is the whole of what a
     * session can be told to do, so a `ProduceItem` or a `RequestGrant` added
     * later still fails this line and sends its author here. What no longer
     * survives is "exactly one credits the treasury" -- `SellMaterials` is a
     * second, and deliberately so (ADR 0075 decision 3, invoked by ADR 0096
     * decision 3(b)): it sells stock a container holds back at
     * `SELL_BACK_RATIO_NUMERATOR / SELL_BACK_RATIO_DENOMINATOR` (1/2) of the
     * catalogue price, floored per unit (`ProcurementSystem.sellStock`).
     *
     * **Why no assertion below moves, stated from measurement rather than
     * assumed -- and the first draft of this comment assumed wrong.** It
     * read that neither fixture in this file ever holds a saleable surplus,
     * on the theory that a `wallRoomPerimeter` call must have spent what a
     * `PurchaseMaterials` press bought. Instrumented rather than trusted:
     * the payroll-route case below buys 616 bricks and 1 plank and builds
     * nothing with either -- `residentCapacity` stays `0` for the whole
     * case by its own comment, and no `PlaceBuildOrder`, `ZoneRoom` or
     * `PlaceObject` is ever sent -- so the container holds all 616 bricks
     * and the 1 plank, unconsumed, at every point in the case including its
     * final assertions (measured: `final brick stock 616`, `final plank
     * stock 1`, beside `final balance -55`). That is a real, reachable
     * surplus, and `SellMaterials` reaches it: 616 bricks at
     * `Math.floor(40 * 1/2) = 20` each is 12,320 minor units, over four
     * times the 2,500 the arrears bound bounds *and* enough on its own to
     * clear the entire capped debt this case ends holding.
     *
     * **None of that turns the payroll-route case's own assertions false,
     * which is the reason this file's numbers are untouched even though the
     * premise above was wrong.** ADR 0096 decision 2's reserve and decision
     * 3(c)'s arrears bound are read passively here -- nothing in this file
     * presses `SellMaterials`, so nothing about the mechanism existing
     * changes what a session that never presses it does. And the case was
     * never locked to begin with, on its own text: *"The player is not
     * locked either way, which is the finding this route exists to
     * report."* `SellMaterials` reaching a real surplus in an unlocked case
     * is not the class ECON-002 names reopening -- it is decision 3 doing
     * exactly what ADR 0075 built it for, "the general answer to 'the money
     * is in the wrong shape'", faster than the income line the case is
     * shown recovering by instead. Recorded here because a comment that
     * measured wrong stays wrong until somebody re-measures it, which is
     * `docs/AGENT_WORKFLOW.md` §4's whole argument for marking a correction
     * rather than silently fixing the number.
     *
     * The 654-brick case above it is the true instance of the theory that
     * prompted the wrong first draft: it walls a room, places a bed and a
     * toilet, and the bricks the wall and the toilet consume really do come
     * out of what was bought, leaving no comparable surplus at the point its
     * own assertions run. The two cases are not the same shape, and treating
     * them as though they were is exactly the mistake this correction fixes.
     *
     * **What this does not settle.** Whether a position combining a floor
     * this deep with a surplus large enough to matter is reachable *while a
     * session is actually locked* (rather than merely deep and unpressed,
     * as here) is a real question, and this file does not construct that
     * case either way -- named per `docs/AGENT_WORKFLOW.md` §3's "name your
     * weakest claim" rather than assumed shut in either direction.
     *
     * Of these seventeen, two credit the treasury --
     * `CancelMaterialPurchase` and `SellMaterials` -- and the test below
     * measures the first refusing once the delivery has landed.
     * `tests/unit/economy-procurement-sellback.test.ts` pins the second's
     * economics at the `ProcurementSystem` layer and
     * `tests/integration/economy-sellback-command.test.ts` drives the command
     * itself through the real kernel, which this file does not re-do.
     *
     * **This said "fourteen" until the owner's decisions of 2026-09-01 on
     * [ADR 0084](../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md).**
     * `DismissAlert` is the fifteenth and it moves no money at all: it marks a
     * row of the alerts log as read, which is the one command in this list that
     * changes nothing about the prison. The tally is what rots here and the
     * list is what to read, so both are corrected together rather than the
     * number alone.
     *
     * **And it said "fifteen" until ADR 0106.** `RemoveWall` is the sixteenth
     * and it moves no money either in the sense this test is about: it takes
     * geometry away and, for a `'completed'` order, destroys whatever was
     * spent on it -- `destroysSpendOnCancel` -- which is a loss, not a route
     * back into money.
     *
     * **And it said "sixteen" until `SellMaterials`.** `SellMaterials` is the
     * seventeenth, and it is the first in this list that both moves money
     * *and* credits the treasury -- see the correction above.
     *
     * **And it said "seventeen" until ADR 0113.** `EditRegimeBlock` is the
     * eighteenth and it is the second in this list that moves no money at all,
     * beside `DismissAlert` -- it rewrites what one block of one classification
     * group's day allows. It is in this list for the same reason `DismissAlert`
     * is: the list is every command the protocol declares, and the claim this
     * test defends is about which of them can turn stock back into money.
     * Editing a timetable cannot, in either direction.
     */
    const types = simulationCommandSchema.options.map((option) => option.shape.type.value).sort();
    expect(types).toEqual([
      'AdmitPrisoner',
      'CancelBuildOrder',
      'CancelMaterialPurchase',
      'DismissAlert',
      'DismissStaff',
      'EditRegimeBlock',
      'HireStaff',
      'PlaceBuildOrder',
      'PlaceObject',
      'PurchaseMaterials',
      'Redo',
      'ReleaseGuardAssignment',
      'RemoveObject',
      'RemoveWall',
      'SellMaterials',
      'Undo',
      'UnzoneRoom',
      'ZoneRoom',
    ]);
  });

  it('spends the grant and the starter rung on 654 bricks, and the ECON-002 lock stays shut since the owner`s second ruling on #771', () => {
    /*
     * **The title said "25,000 on 625 bricks", then "687 bricks" (#703 ruling
     * A), then "656 bricks and the ECON-002 lock reopens since #771 equalised
     * the rungs" -- kept below as the quote of what this case asserted for one
     * release, because it is the record of the lock this rung closes:
     *
     * > "spends the grant and the delivery rung on 656 bricks, and the
     * > ECON-002 lock reopens since #771 equalised the rungs" -- one press of
     * > `item.brick`, quantity `BRICKS_TO_THE_RUNG` (656), landed on
     * > `BALANCE_AT_THE_RUNG` (-1,240), and no escape -- cancelling the
     * > purchase, buying the plank directly, queuing a bed and waiting,
     * > admitting anyway, or building and undoing something else -- moved the
     * > balance off it. `docs/adr/0017-money-primary-resource-model.md`'s
     * > "Amendment, 2026-09-01… equalised" §9 named this cost and did not
     * > choose a remedy.
     *
     * **The owner's second ruling on #771 (2026-09-01) is the remedy, and it
     * changes which press even reaches the trap's neighbourhood.** A fresh,
     * unfurnished prison's `'deliveries'`/`'hiring'` rung is now -1,185, not
     * -1,250 -- see `INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS` and
     * the file docblock's "What the owner's second ruling on #771 closes".
     * So the *exact command this case used to press* is refused outright, and
     * the case is rewritten around the new bottom instead of merely re-valued
     * around the old one -- kept as the first live assertion below, because
     * "this press is now refused" is itself half of the proof.
     */
    const runtime = createHistoricalOpeningRuntime(SEED);
    expect(runtime.treasury.balanceMinorUnits).toBe(25_000);
    expect(runtime.treasury.overdraftFloorMinorUnits, 'the facility is standing, unpressed').toBe(-OVERDRAFT_ROOM);

    // The exact press that used to reach ECON-002 (quoted above) is refused
    // outright for a fresh, unfurnished prison: 656 bricks would land on
    // -1,240, and the starter rung does not let a press pass -1,185 at all.
    send(runtime, 'buy-too-many', { type: 'PurchaseMaterials', orderId: 'buy-0', itemId: 'item.brick', quantity: BRICKS_TO_THE_RUNG });
    expect(
      runtime.refusals.last?.reason,
      'a fresh, unfurnished prison cannot press its way to the balance that used to lock it',
    ).toBe('purchase.insufficient-funds');
    expect(runtime.treasury.balanceMinorUnits, 'refused outright -- nothing was spent').toBe(25_000);

    // The largest press a fresh, unfurnished prison **can** make: 654 bricks,
    // landing on -1,160 -- 25 short of the mature rung, not 10, because the
    // starter rung is 65 shallower than it.
    //
    // `refusals.count` rather than `refusals.last` here: the standing refusal
    // above is keyed on `(item.brick, 656)` (`purchaseSupersessionKey`) and
    // this press asks for a *different* quantity, so it cannot supersede that
    // key even though it succeeds -- `RefusalLog.supersede`'s own doc comment
    // is explicit that a miss there is silent. `count` is unaffected by
    // supersession and is exactly "how many refusals have been recorded", so
    // it staying at 1 is the proof this second press added none of its own.
    send(runtime, 'buy-all', { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: STARTER_BRICKS_TO_THE_RUNG });
    expect(runtime.refusals.count, 'no second refusal was recorded').toBe(1);
    expect(
      runtime.treasury.balanceMinorUnits,
      '654 x 40 is the grant and all but 25 of the starter rung',
    ).toBe(STARTER_BALANCE_AT_THE_RUNG);

    stepTo(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 2);
    expect(stockOf(runtime, 'item.brick'), 'the goods arrived, so this is not a pending order').toBe(
      STARTER_BRICKS_TO_THE_RUNG,
    );
    expect(runtime.procurement.pendingDeliveries).toHaveLength(0);

    // **Escape 1: cancel the purchase.** #285's command exists and reaches a
    // real credit path, and it is out of reach the moment the lorry unloads --
    // unaffected by any of the rung's rulings.
    send(runtime, 'cancel', { type: 'CancelMaterialPurchase', orderId: 'buy-1' });
    expect(runtime.refusals.last?.reason).toBe('cancel-purchase.not-pending');
    expect(runtime.treasury.balanceMinorUnits).toBe(STARTER_BALANCE_AT_THE_RUNG);
    expect(stockOf(runtime, 'item.brick'), 'and the bricks stay bought').toBe(STARTER_BRICKS_TO_THE_RUNG);

    // **Escape 2: buy the one plank a bed needs, directly.** 65 against 25 of
    // press room left -- still refused, and deliberately so: the starter rung
    // reserves that plank's worth of room for the *construction* rung, not
    // for a second press. The direct route is the one that stays shut; the
    // queued-order route below is the one the starter rung opens.
    send(runtime, 'buy-plank', { type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.wood-plank', quantity: 1 });
    expect(runtime.refusals.last?.reason, 'the shop still refuses this, on purpose').toBe('purchase.insufficient-funds');
    expect(runtime.treasury.balanceMinorUnits).toBe(STARTER_BALANCE_AT_THE_RUNG);
    expect(stockOf(runtime, 'item.wood-plank')).toBe(0);

    /*
     * **The route that used to fail forever, live and green.** Quoted from
     * the version of this case the owner's second ruling on #771 superseded:
     *
     * > **Escape 3, and under the owner's ruling on #771 (2026-09-01) it is an
     * > escape that fails again.** … `-1,240 - 65 = -1,305` clears neither
     * > rung, and this order is exactly the pre-ruling-19 case again … A
     * > `materials-pending` order is retried on every scheduled tick for ever,
     * > and 5,000 ticks is two in-game days of retrying against a container
     * > that will never hold a plank.
     *
     * The starter rung is exactly the fix for this: the construction rung is
     * untouched at -1,250, and `-1,160 - 65 = -1,225` clears it with 25 to
     * spare -- the same 25 the press above could not spend on a plank
     * directly, now spent by the queue instead.
     */
    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
    send(runtime, 'zone', { type: 'ZoneRoom', roomId: CELL, ...CELL_RECT });
    send(runtime, 'bed', { type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE });
    stepTo(runtime, runtime.kernel.tick + 5_000);
    expect(
      runtime.construction.getOrder('bed-1')?.state,
      'the queue buys what the press could not, at the unaffected construction rung',
    ).toBe('completed');
    expect(runtime.placedObjects.size, 'a bed is standing').toBe(1);
    const cellInstanceId = `${CELL}:${CELL_RECT.x}:${CELL_RECT.y}`;
    expect(
      runtime.prisoners.roomInstances.getById(cellInstanceId)?.residentCapacity,
      'furnished: the cell can now hold somebody',
    ).toBe(1);
    const balanceAfterTheBed = runtime.treasury.balanceMinorUnits;
    expect(balanceAfterTheBed, '-1,160 - 65').toBe(-1_225);

    /*
     * **The transition is not a cliff, measured in the kernel rather than
     * only in the arithmetic.** The balance the bed's construction spend
     * leaves is already below where the starter rung would have refused
     * *everything* (-1,185) -- but the cell is furnished now, so the prison is
     * judged at the mature rung (-1,250) from here on, and -1,225 is
     * comfortably inside it. `tests/unit/economy-treasury.test.ts` proves this
     * holds for every reachable balance, not only this one; this is that
     * property observed through the real kernel on the exact fixture that
     * used to lock.
     */
    expect(balanceAfterTheBed, 'below where the starter rung would already refuse everything').toBeLessThan(
      INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS,
    );
    expect(balanceAfterTheBed, 'yet still inside the room a furnished prison gets').toBeGreaterThanOrEqual(
      INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS,
    );

    /*
     * **What used to be Escape 4 is no longer an escape: it is how the prison
     * recovers.** Quoted from the version this ruling superseded:
     *
     * > **Escape 4: admit somebody anyway.** … with no furnished cell there is
     * > no occupancy slot for `StateIncomeSystem` to pay for, so nothing is
     * > earned. `totalOccupancy` stays 0; the balance stays at
     * > `BALANCE_AT_THE_RUNG` five in-game days later.
     *
     * The cell is furnished now, so the same admission holds a place, and the
     * income line the loop this file opens with says cannot exist finally
     * does.
     */
    send(runtime, 'admit', { type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL });
    // Enough ticks for intake to classify, allocate and house the arrival --
    // `src/simulation/economy/income.ts`'s own measured table houses one in
    // 200 -- and deliberately fewer than one in-game day, so this reading is
    // *before* the income line has had a chance to pay anything.
    stepTo(runtime, runtime.kernel.tick + 500);
    expect(runtime.prisoners.roomInstances.totalOccupancy, 'housed -- the bed is standing and claimed').toBe(1);
    const balanceAfterHousing = runtime.treasury.balanceMinorUnits;
    expect(balanceAfterHousing, 'housing itself costs nothing').toBe(balanceAfterTheBed);

    // A further in-game day of the state's own payment: the income line
    // pays per occupied place, and an occupied place now exists.
    stepTo(runtime, runtime.kernel.tick + DAY_LENGTH_TICKS + 1);
    expect(
      runtime.treasury.balanceMinorUnits,
      'the loop this file opens with is broken: the balance moves on its own, with no further press',
    ).toBeGreaterThan(balanceAfterHousing);

    /*
     * **Escape 5: give the bricks back.** Still not a way to money, which is
     * unaffected by either ruling on #771 and is the one claim this case has
     * never needed to revise: a brick-built object can be removed and undone,
     * and the owner's separate ruling of 2026-09-01 on ADR 0076 (*"Taking a
     * finished object away returns nothing. Not its materials, not its
     * money."*) means it gives back neither, once completed.
     */
    const balanceBeforeTheToilet = runtime.treasury.balanceMinorUnits;
    const bricksBeforeTheToilet = stockOf(runtime, 'item.brick');
    send(runtime, 'toilet', { type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', x: 5, y: 6 });
    stepTo(runtime, runtime.kernel.tick + 300);
    expect(runtime.construction.getOrder('toilet-1')?.state).toBe('completed');
    expect(stockOf(runtime, 'item.brick')).toBe(bricksBeforeTheToilet - 1);
    const toiletTile = { x: tileCoordinate(5), y: tileCoordinate(6) };
    expect(runtime.placedObjects.objectAt(toiletTile)?.objectId, 'the toilet is standing').toBe('object.toilet');
    send(runtime, 'undo', { type: 'Undo' });
    expect(runtime.construction.getOrder('toilet-1')?.state, 'the undo does reach the order').toBe('cancelled');
    expect(runtime.placedObjects.objectAt(toiletTile), 'and the toilet really came down').toBeUndefined();
    expect(stockOf(runtime, 'item.brick'), 'undo returns nothing: the brick went into the toilet and stayed there').toBe(
      bricksBeforeTheToilet - 1,
    );
    expect(runtime.treasury.balanceMinorUnits, 'and not a minor unit of it is money').toBe(balanceBeforeTheToilet);

    /*
     * **The prison is not locked, which is ECON-002's own conclusion, closed.**
     * A place exists, it is occupied, and the balance has already moved
     * upward once with no further press -- the opposite of the state the
     * file's opening sentence names. This is the gate: a hand-restored,
     * unfixed treasury.ts turns this red at the line naming `'completed'`
     * above (Escape 3 stays `materials-pending` again), and everything from
     * there down never runs.
     */
    expect(
      runtime.treasury.balanceMinorUnits,
      'still moving, on the strength of the admission alone',
    ).toBeGreaterThan(balanceAfterHousing);
  });

  it('is a zone and not a knife edge, on the fresh, unfurnished prison`s own starter rung', () => {
    /*
     * `docs/AGENT_WORKFLOW.md`'s floor-value trap, answered directly. A fixture
     * that spent *exactly* the treasury could not tell "the game ends at zero"
     * from "the game ends below the price of a plank", and those are different
     * findings with different remedies -- a floor at zero fixes the first and
     * not the second.
     *
     * **Pre-ruling this case bought 624 bricks and asserted 40 in the bank**:
     * *"money in the bank, a balance the HUD shows as non-zero, and a prison in
     * exactly the same trap"*. The trap is a zone in *spending power*, and #703
     * ruling A moved where that zone sits without changing its width: it is
     * `[floor, floor + 65)` in the balance, so 686 x 40 leaves -2,440 with 60 of
     * the overdraft unspent -- room in the facility, a balance the HUD shows as
     * a minus, and a prison in exactly the same trap.
     *
     * > ```
     * > send(runtime, 'buy', { … quantity: 686 });   // -2,440, 60 of room, locked
     * > send(escaped, 'buy', { … quantity: 685 });   // -2,400, 100 of room, escapes
     * > ```
     *
     * **The owner's ruling 19 of 2026-08-31 moved it once more, again without
     * changing the width, and this is the version the owner's second ruling on
     * #771 superseded**, quoted rather than deleted: *"The zone is now
     * `[rung, rung + 65)` against the delivery rung: 655 x 40 leaves -1,200
     * with 50 of press room, and 654 leaves -1,160 with 90, which buys the
     * plank."*
     *
     * ```
     * send(runtime, 'buy', { … quantity: 655 });   // -1,200, 50 of room, locked
     * send(escaped, 'buy', { … quantity: 654 });   // -1,160, 90 of room, escapes
     * ```
     *
     * **The starter rung moves the zone a third time, by exactly the same
     * mechanism, and this is the live assertion.** A fresh, unfurnished
     * prison's press stops at -1,185 rather than -1,250, so the zone a
     * *press-only* route (buy bricks, then buy the plank, both `'deliveries'`)
     * can be locked inside is `[-1,185, -1,185 + 65) = [-1,185, -1,120)`: 654
     * bricks leaves -1,160, inside the zone, and 653 leaves -1,120, at its far
     * edge, which is exactly 65 of room and buys the plank directly -- no
     * construction order needed at that balance. Still 65 wide, still a zone
     * and not a point, and the same two facts on either side of it, three
     * rulings later.
     */
    const runtime = createHistoricalOpeningRuntime(SEED);
    send(runtime, 'buy', { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: STARTER_BRICKS_TO_THE_RUNG });
    expect(runtime.treasury.balanceMinorUnits).toBe(STARTER_BALANCE_AT_THE_RUNG);
    stepTo(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 2);

    send(runtime, 'buy-plank', { type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.wood-plank', quantity: 1 });
    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
    expect(
      runtime.treasury.balanceMinorUnits,
      'the 25 of press room left is unspendable on the one thing that matters, by a direct press',
    ).toBe(STARTER_BALANCE_AT_THE_RUNG);

    // And the far edge of the zone, so this is a width and not a point: 653
    // bricks leaves -1,120, which is exactly 65 of press room, and the plank
    // goes through by a direct press -- no construction order needed here.
    const escaped = createHistoricalOpeningRuntime(SEED);
    send(escaped, 'buy', { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: STARTER_BRICKS_TO_THE_RUNG - 1 });
    expect(escaped.treasury.balanceMinorUnits).toBe(-1_120);
    send(escaped, 'buy-plank', { type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.wood-plank', quantity: 1 });
    expect(escaped.refusals.last, 'one brick fewer and the prison is not locked at all, even by a direct press').toBeUndefined();
    expect(escaped.treasury.balanceMinorUnits, 'lands exactly on the starter rung').toBe(
      INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS,
    );
  });
});

describe('the same lock reached by a charge the player cannot decline', () => {
  /**
   * The route that matters more than the 625-brick press, because nobody has
   * to make a reckless purchase to find it.
   *
   * `PayrollSystem` bills every employee's `wageBand.minPerDay` at the end of
   * every in-game day -- a guard is 80 (`src/content/staff-role-catalog.ts:150`)
   * -- and `HireStaff` charges one day's wage up front
   * (`src/simulation/staff/hiring.ts:202`). A prison that spends most of its
   * money on walls and hires one guard is then losing 80 a day against an
   * income line that cannot start until it buys a 65 plank. The balance walks
   * itself below 65 with no further press, and every press after that is
   * refused.
   *
   * ADR 0049 made insolvency a state rather than a loss condition, and it is a
   * state a *furnished* prison digs out of. This is the same state entered
   * before the first bed, where there is nothing to dig with.
   */
  /**
   * **#703 ruling A cures this route, and that is the finding rather than a
   * fixture repair.** The case below used to be titled *"walks a prison below
   * one plank on payroll alone, with no further press"* and it ended:
   *
   * > `stepTo(runtime, 12_000);`
   * > `expect(runtime.treasury.balanceMinorUnits).toBe(0);`
   * > `expect(runtime.payroll.unpaidWagesMinorUnits).toBeGreaterThan(0);`
   *
   * -- a prison at 40, then at 0, arrears rising, and no press that could ever
   * earn a minor unit. Every one of those figures was correct when it was
   * written and the walk still happens exactly as described; what changed is
   * where it *ends*.
   *
   * `PayrollSystem.update` pays `Math.min(due, this.treasury.balanceMinorUnits)`
   * -- bounded by the **balance**, not by what `Treasury.spend` allows -- so
   * wages cannot reach into the standing overdraft at all. The walk still stops
   * at 0, and at 0 the prison has the whole 2,500 to buy a 65 plank with. So the
   * route a player *cannot decline* no longer locks anybody, while the purchase
   * route above still does, because a player can spend the room and payroll
   * cannot. That asymmetry is the whole of what the ruling bought here.
   *
   * **The asymmetry is gone under the owner's ruling 19 of 2026-08-31, and it
   * is gone in the direction the paragraph above did not consider.** Ruling 19
   * -- drafted as ADR 0017's "Amendment, 2026-09-01" -- puts ADR 0017 decision
   * 8's third rung *at the floor*: wages are unpaid below -2,500, which means
   * paid down to it. `PayrollSystem` therefore bounds the day by
   * `Math.min(due, balance - floorFor('wages'))` and **does** reach into the
   * overdraft. The paragraph above is kept because it is the reading ADR 0083's
   * "considered and not taken" defended by name, and it is the reading the owner
   * overruled.
   *
   * What that does to this case, measured below rather than argued:
   *
   * - The walk to 40 and the plank at -25 are **unchanged**, because none of it
   *   crosses a rung: a press is refused below -1,250 and -25 is nowhere near.
   * - The nine days after it no longer arrear anything. The balance walks on
   *   down to **-745**, and the arrears stay at 0.
   * - The walk now ends at the wage rung rather than at 0, and the last case
   *   below steps far enough to watch it get there and start owing.
   *
   * **The player is not locked either way**, which is the finding this route
   * exists to report: the plank is bought at -25 and the bed is buildable, so
   * the income line can start. What ruling 19 changes is that the prison spends
   * its facility on wages while it waits, instead of holding it.
   *
   * **[ADR 0096](../../docs/adr/0096-what-a-way-back-is-and-what-guarantees-one.md)
   * decision 2 (accepted 2026-09-10) moves where this walk stops, a second
   * time, and this is the case that measured it.** This prison never places
   * the plank it bought into a bed -- `residentCapacity` stays `0` for the
   * whole of this case, so it is fresh and unfurnished throughout, and
   * `'wages'` now has a rung of its own while that holds:
   * `STARTER_RUNG_WAGES_FLOOR_MINOR_UNITS` in `src/simulation/economy/treasury.ts`,
   * `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS + WAGES_STARTER_RESERVE_MINOR_UNITS`
   * = -1,250 + 1,195 = **-55**, shallower than -745, so the walk this case
   * used to measure is intercepted long before it gets there. Every balance
   * and arrears figure below this point moves with the release named above
   * it; the text above it is left standing because it is the record of what
   * ruling 19 alone did, one release before this one.
   */
  it('walks a prison past zero on payroll alone, buys the plank on the way, and stops at the wages reserve (ADR 0096 decision 2)', () => {
    const runtime = createHistoricalOpeningRuntime(SEED);
    // Walls, not a spending spree: 616 bricks is 24,640, which at two bricks a
    // wall segment is 308 segments. The prison keeps 360 -- five planks' worth,
    // and it never presses a purchase again.
    send(runtime, 'buy', { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 616 });
    expect(runtime.treasury.balanceMinorUnits).toBe(360);

    send(runtime, 'hire', { type: 'HireStaff', staffRoleId: 'staff-role.guard', x: 16, y: 16 });
    expect(runtime.refusals.last, 'the hire is affordable and is accepted').toBeUndefined();
    expect(runtime.treasury.balanceMinorUnits, 'one day of a guard, up front').toBe(280);

    // Three in-game days of payroll at 80, and nothing else pressed at all.
    // 280 - 240 = 40: the same walk, to the same figure, as before the ruling.
    stepTo(runtime, 3 * 2_400 + 1);
    expect(runtime.treasury.balanceMinorUnits).toBe(40);

    // The press that used to be refused here.
    send(runtime, 'buy-plank', { type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.wood-plank', quantity: 1 });
    expect(runtime.refusals.last, 'the plank is affordable out of the standing overdraft').toBeUndefined();
    expect(runtime.treasury.balanceMinorUnits, '40 - 65').toBe(-25);
    expect(stockOf(runtime, 'item.wood-plank'), 'not yet -- the lorry is on the road').toBe(0);
    stepTo(runtime, runtime.kernel.tick + PROCUREMENT_DELIVERY_DELAY_TICKS + 2);
    expect(stockOf(runtime, 'item.wood-plank'), 'and a bed is now buildable, which is the way out').toBe(1);

    /*
     * **And payroll now follows it down, only as far as the reserve --
     * ADR 0096 decision 2, measured through the real kernel rather than only
     * in `treasury.ts`'s own arithmetic.**
     *
     * This block asserted, for the whole life of ruling 19 alone:
     *
     * > Nine more in-game days of an 80 wage against a balance of -25 …
     * > `expect(runtime.treasury.balanceMinorUnits).toBe(-745)`
     * > `expect(runtime.payroll.unpaidWagesMinorUnits).toBe(0)`
     *
     * That reading is overtaken here rather than merely re-valued: -745 is
     * deeper than the new starter wages rung (-55), so the eight more days
     * this case used to measure never happen -- the very first payday after
     * the plank purchase already has only 30 of room left before -55 (`-25 -
     * (-55) = 30`), pays that much and no more, and every payday after it
     * pays nothing at all while the arrears bound (ADR 0096 decision 3(c),
     * `ARREARS_BOUND_MINOR_UNITS`) has not yet been reached.
     */
    expect(runtime.treasury.balanceMinorUnits).toBe(-25);
    stepTo(runtime, 4 * 2_400);
    expect(runtime.treasury.balanceMinorUnits, 'one payday: 30 of room to the reserve, not the whole 80').toBe(-55);
    expect(runtime.payroll.unpaidWagesMinorUnits, '80 due, 30 paid').toBe(50);

    stepTo(runtime, 12 * 2_400);
    expect(runtime.treasury.balanceMinorUnits, 'pinned at the reserve, not walking on to -745').toBe(-55);
    expect(runtime.payroll.unpaidWagesMinorUnits, 'eight more whole paydays owed in full: 50 + 8 x 80').toBe(690);

    /*
     * **The arrears bound, watched firing -- ADR 0096 decision 3(c), not the
     * third rung ruling 19 gave `'wages'` alone.** From 690 owed, 80 a day,
     * `ARREARS_BOUND_MINOR_UNITS` (2,500) is crossed on the twenty-third
     * payday after day 12: 690 + 22 x 80 = 2,450, one short; the
     * twenty-third would add the 24th multiple and land on 2,530, capped to
     * exactly 2,500 instead -- forgiven, per decision 3(c)'s own words,
     * rather than deferred. That is the historical #771 reading. #641 moves
     * the derived arrears cap to 10,000, so this scenario carries those
     * paydays in full; the current cap is tested in economy-payroll.test.ts.
     */
    stepTo(runtime, 34 * 2_400);
    expect(runtime.treasury.balanceMinorUnits, 'the reserve holds: no payday may pass it while unfurnished').toBe(-55);
    expect(runtime.payroll.unpaidWagesMinorUnits, '690 + 22 whole paydays at 80').toBe(2_450);

    stepTo(runtime, 35 * 2_400);
    expect(runtime.treasury.balanceMinorUnits).toBe(-55);
    expect(runtime.payroll.unpaidWagesMinorUnits, 'the linked cap is now 10,000, so this payday carries all 80').toBe(
      2_530,
    );

    stepTo(runtime, 40 * 2_400);
    expect(runtime.payroll.unpaidWagesMinorUnits, 'five more unpaid paydays, still below the new 10,000 cap').toBe(
      2_930,
    );

    // `SCENARIO_OVERDRAFT_FLOOR_MINOR_UNITS` (-2,500) is cited here rather than
    // silently dropped: it is what this same fixture reached under ruling 19
    // alone, and it is now unreachable for as long as this prison stays
    // unfurnished, which is exactly ADR 0096 decision 2's point.
    expect(runtime.treasury.balanceMinorUnits, 'nowhere near the treasury`s own floor').toBeGreaterThan(
      SCENARIO_OVERDRAFT_FLOOR_MINOR_UNITS,
    );
  });
});
