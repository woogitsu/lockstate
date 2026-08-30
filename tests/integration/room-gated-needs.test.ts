import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { NEED_IDS, NEED_MAX, NEED_SCALE, type NeedId } from '../../src/simulation/prisoners/needs';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **Which needs a prison of cells can meet, and which two it cannot**
 * ([ADR 0054](../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)
 * decision 1, closing issue #436's second acceptance criterion).
 *
 * ## Why this file exists when ADR 0054 has already shipped
 *
 * ADR 0054 ruled that `hygiene` and `recreation` are **room-gated by design**:
 * no cell-side sibling for `action.shower`, none for the three recreation
 * actions, and a prison that has not zoned the room keeps both needs on the
 * floor for as long as it stands. That ruling is content, and content is one
 * appended entry in `DEFAULT_ACTIONS` away from being reversed by accident.
 *
 * What guarded it before this file was a single pair of lines in
 * `tests/integration/laundry-work-and-empty-blocks.test.ts` — `finalHygiene`
 * and `hygieneEverRose` on the run that file already had. **`recreation` was
 * not guarded at all**, and neither half of the ruling's *other* direction —
 * that zoning the room is a real and sufficient escape — was asserted against
 * a named prisoner's own history anywhere. #436 asks for exactly that, per
 * need: *"every need the ruling says should be servable is served at least
 * once — asserted per need against a named prisoner's own history, not against
 * a population aggregate"*.
 *
 * ## How a need being "served" is established, without asking the code
 *
 * Every need in `NEED_DECAY_PER_TICK` only ever falls unless something restores
 * it, so **a level that is higher than it was on the previous tick is proof a
 * restore happened** and a decay curve can never produce one. That is the same
 * argument `furnished-prison-loop.test.ts` makes about `action.shower` and it
 * is the reason this file samples every tick rather than periodically: it reads
 * the stored `Uint16Array` directly, compares each tick against the last, and
 * never asks `ActionSystem` whether it thinks it served anything (#375).
 *
 * ## The three questions, and they are deliberately separate
 *
 * 1. A prison of cells serves four of the six needs and cannot serve the other
 *    two. That is the ruling stated as behaviour.
 * 2. Zoning the room is the whole of the escape — one yard, which requires no
 *    object at all, and one shower room with its two heads.
 * 3. **What the neglect actually costs, measured rather than assumed.** ADR
 *    0054 decision 1 rests on the claim that room-gating is *enforced* because
 *    "ADR 0048 turns an unmet need into `needsPressure`, `needsPressure` into a
 *    hot sector and a hot sector into a riot". The third case measures how wide
 *    that is, and it is narrower than the sentence reads: the two floored needs
 *    put `needsPressure` at 0.4824 in a prison of eight (0.4837 at one) against
 *    a `hotThreshold` of 0.65, so the sector goes hot only once the
 *    `staffingShortfall` term is carrying the rest. One guard is the whole of
 *    the difference between three riots and none. The numbers are pinned here
 *    so that a later change to `DEFAULT_SECTOR_RISK_POLICY` has to move them in
 *    the open.
 */

/** Distinct from every other seed in the suite, so no shared fixture can make these figures true by accident. */
const SEED = 0x436;

/** `src/main.ts`'s `NEW_PRISON_ORIGIN_TILE`: where a hire stands and an admission arrives. */
const ARRIVAL = { x: 16, y: 16 } as const;
/** Far longer than any run here, so `PrisonerDischargeSystem` cannot release anybody mid-measurement. */
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;

/** `room.shower-room`'s authored 3x3 minimum, clear of the cells. */
const SHOWER = { x: 26, y: 1, width: 3, height: 3 } as const;
/**
 * `room.yard`'s authored 8x8 minimum. It requires **no object at all**
 * (`src/content/room-catalog.ts`), which is the fact ADR 0054 decision 1 leans
 * on when it calls the escape cheap, and case 2 is where that is checked rather
 * than repeated.
 */
const YARD = { x: 20, y: 20, width: 8, height: 8 } as const;

const SECTOR = 'security-sector.prison';

/**
 * **Ten in-game days** at `DAY_LENGTH_TICKS` 2,400 — long enough that a need
 * served once a day is served ten times.
 *
 * **This comment read "Twenty in-game days" until
 * [ADR 0064](../../docs/adr/0064-what-an-unmet-need-costs-a-prison.md)**,
 * and so did the two
 * `describe` names below, `src/simulation/incidents/sector-risk.ts`,
 * `docs/PRISONER_OPERATIONS.md`, ADR 0059's speed ladder, ADR 0061's opening
 * measurement and issue #477 itself. `24_000 / 2_400` is 10. Nothing measured
 * here changes — every figure in this file was read off a 24,000-tick run and
 * still is — but the window these numbers describe is half as long as five
 * documents said, which matters to anyone reasoning about how fast a prison
 * decays.
 */
const RUN_UNTIL = 24_000;
/** Past intake, past every delivery and every build order, so nothing below is measuring a prison still under construction. */
const WATCH_FROM = 2_000;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** Cells in a row along the top of the one chunk a prison owns, three tiles apart so no two share a wall. */
function cellRect(index: number): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return { x: 1 + index * 3, y: 1, width: 2, height: 3 };
}

interface Plan {
  /** One furnished `room.cell` per prisoner: a bed and a toilet, so `sleep`, `hunger` and `bladder` all have a route. */
  readonly prisoners: number;
  readonly guards: number;
  readonly shower: boolean;
  readonly yard: boolean;
}

/**
 * Built with nothing but the five commands a player can send today —
 * `PurchaseMaterials`, `ZoneRoom`, `PlaceObject`, `HireStaff`,
 * `AdmitPrisoner` — for `incident-trigger-reachability.test.ts`'s reason: a
 * fixture that registers a room instance by hand cannot tell whether a player
 * could ever have got the prison into that state. `wallRoomPerimeter` is the
 * one shortcut, and writes the edges a completed `wall-brick` order would.
 */
function build(plan: Plan): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  const cells = Array.from({ length: plan.prisoners }, (_unused, index) => cellRect(index));

  // One plank per bed; one brick per toilet, plus two for the shower heads.
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: plan.prisoners }));
  submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: plan.prisoners + 2 }));

  for (const rect of cells) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  if (plan.shower) wallRoomPerimeter(runtime.world, SHOWER, { doors: runtime.navigation.doors });
  if (plan.yard) wallRoomPerimeter(runtime.world, YARD, { doors: runtime.navigation.doors });

  cells.forEach((rect, index) => submit(runtime, `zone-cell-${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
  if (plan.shower) submit(runtime, 'zone-shower', packCommand({ type: 'ZoneRoom', roomId: 'room.shower-room', ...SHOWER }));
  if (plan.yard) submit(runtime, 'zone-yard', packCommand({ type: 'ZoneRoom', roomId: 'room.yard', ...YARD }));

  cells.forEach((rect, index) => {
    submit(runtime, `bed-${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed-${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y }));
    submit(runtime, `wc-${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `wc-${String(index)}`, definitionId: 'toilet-brick', x: rect.x + 1, y: rect.y }));
  });
  if (plan.shower) {
    submit(runtime, 'head-1', packCommand({ type: 'PlaceObject', orderId: 'head-1', definitionId: 'shower-head-brick', x: SHOWER.x, y: SHOWER.y }));
    submit(runtime, 'head-2', packCommand({ type: 'PlaceObject', orderId: 'head-2', definitionId: 'shower-head-brick', x: SHOWER.x + 1, y: SHOWER.y }));
  }

  // Delivery delay plus build progress; every order is standing well before this.
  stepTo(runtime, 1_000);
  for (let index = 0; index < plan.guards; index += 1) {
    submit(runtime, `hire-${String(index)}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  }
  for (let index = 0; index < plan.prisoners; index += 1) {
    submit(runtime, `admit-${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }

  // A refused purchase, zoning, placement or hire would make every figure below
  // a measurement of a different prison, so it is checked rather than assumed.
  expect(runtime.refusals.count, 'the fixture must build the prison it says it builds').toBe(0);
  return runtime;
}

interface WatchedPrisoner {
  readonly runtime: SimulationRuntime;
  /** Per need: did the level ever read higher than it did on the tick before? Only a restore can do that. */
  readonly everRose: Readonly<Record<NeedId, boolean>>;
  /** Per need: the lowest level seen across the whole window, in whole levels. */
  readonly lowest: Readonly<Record<NeedId, number>>;
  /** Ticks spent in `performing`, per action id. */
  readonly performingTicks: Readonly<Record<string, number>>;
  /** The highest `scoreSectorRisk` the derived sector reached across the window. */
  readonly peakRisk: number;
}

/**
 * Watches **one named prisoner** — the occupant of slot 0, resolved once by
 * entity id and re-resolved by id every tick so a slot recycle could not
 * silently swap who is being measured — every tick from `WATCH_FROM` to
 * `RUN_UNTIL`.
 *
 * Every tick rather than a sample, for `furnished-prison-loop.test.ts`'s
 * reason: an `action.shower` block is 30 ticks and a coarse sample can step
 * straight over one.
 */
function watch(runtime: SimulationRuntime): WatchedPrisoner {
  stepTo(runtime, WATCH_FROM);
  const store = runtime.prisoners.entityStore;
  const entityId = store.getIdByIndex(0);

  const everRose: Record<NeedId, boolean> = {} as Record<NeedId, boolean>;
  const lowest: Record<NeedId, number> = {} as Record<NeedId, number>;
  const previous: Record<NeedId, number> = {} as Record<NeedId, number>;
  for (const need of NEED_IDS) {
    everRose[need] = false;
    lowest[need] = NEED_MAX;
    previous[need] = Number.POSITIVE_INFINITY;
  }
  const performingTicks: Record<string, number> = {};
  let peakRisk = 0;

  for (let tick = runtime.kernel.tick + 1; tick <= RUN_UNTIL; tick += 1) {
    stepTo(runtime, tick);
    const index = store.getIndex(entityId);

    // `2` is `performing` in `ACTION_PHASES`; the phase names are not exported,
    // and all that matters here is that the action is being done rather than
    // travelled to.
    const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
    if (runtime.prisoners.currentAction.phase[index] === 2 && actionIndex >= 0) {
      const id = DEFAULT_ACTIONS[actionIndex]!.id;
      performingTicks[id] = (performingTicks[id] ?? 0) + 1;
    }

    for (const need of NEED_IDS) {
      // The stored `Uint16Array`, divided by `NEED_SCALE` here rather than read
      // through `NeedsComponent.get`, which rounds: a restore of a fraction of a
      // level is still a restore and rounding could hide it.
      const level = runtime.prisoners.needs.levels[need][index]! / NEED_SCALE;
      if (level > previous[need]) everRose[need] = true;
      previous[need] = level;
      if (level < lowest[need]) lowest[need] = level;
    }

    const risk = runtime.sectorRisk.getScore(SECTOR);
    if (risk > peakRisk) peakRisk = risk;
  }

  return { runtime, everRose, lowest, performingTicks, peakRisk };
}

/** The two ADR 0054 decision 1 rules room-gated, and the three the cell serves. */
const ROOM_GATED: readonly NeedId[] = ['hygiene', 'recreation'];
/**
 * **`safety` left this list with issue #588 and it is a fourth category, not a
 * demotion to `ROOM_GATED`.**
 *
 * It was here because `action.sleep` carried `safety: 0.2`, so a bed served it
 * along with `sleep`. Under the owner's ruling on issue #599 the provisioner is
 * **guard coverage** (`SafetyCoverageSystem`), and every prison in this file
 * has one guard on post -- so `safety` in these runs is not "served", it is
 * *held at the ceiling*: the covered rung provisions 0.08 a tick against a
 * decay of 0.05, and the surplus is clamped away every tick.
 *
 * That distinction is why it cannot simply move to `ROOM_GATED` either. A
 * room-gated need is pinned at **zero** and never rises; this one is pinned at
 * `NEED_MAX` and never falls. Both fail an `everRose` check and they are
 * opposite facts, so `SAFETY_HELD_BY_COVERAGE` asserts the level rather than
 * the movement.
 */
const CELL_SERVED: readonly NeedId[] = ['hunger', 'sleep', 'bladder'];

describe('a prison of cells and nothing else, ten in-game days', () => {
  it('serves four of the six needs and cannot serve the other two', () => {
    const watched = watch(build({ prisoners: 1, guards: 1, shower: false, yard: false }));

    /*
     * The ruling, as behaviour. `hygiene` is served only by `action.shower`
     * (`room.shower-room`) and `action.laundry-work` (`room.laundry`);
     * `recreation` only by the yard, the common room and the classroom. This
     * prison has none of those five rooms, so neither need is ever restored by
     * anything, and "never restored" is read off the curve rather than off the
     * action census: a level that never rises never had anything put into it.
     */
    for (const need of ROOM_GATED) {
      expect(watched.everRose[need], `${need} has no route in a prison of cells and must never rise`).toBe(false);
      expect(watched.lowest[need]).toBe(0);
    }

    /*
     * And the other four are genuinely served, which is what makes the two
     * above a *ruling* rather than a broken prison. Each rises at least once —
     * `action.sleep`, `action.eat-in-cell` and `action.use-toilet` all resolve
     * from the prisoner's own cell — and each holds a floor far off zero.
     *
     * The floors are read off the run and written out. `bladder` is the lowest
     * of the four at 100.6 because it decays fastest (0.08 a tick against
     * `hunger`'s 0.05) and `action.use-toilet` is only 10 ticks long.
     */
    for (const need of CELL_SERVED) {
      expect(watched.everRose[need], `${need} is served from the prisoner's own cell and must rise`).toBe(true);
    }
    expect(watched.lowest).toMatchObject({ hunger: 178.5, sleep: 201.3, bladder: 100.6 });

    /*
     * And `safety`, which this prison's one guard holds at the ceiling for the
     * whole window (issue #588). It never rises because it never has anywhere
     * to rise from: the covered rung out-provisions the decay every tick and
     * the surplus is clamped. `237.1` stood here until `action.sleep` stopped
     * carrying `safety: 0.2` -- a bed kept a prisoner safe and a guard did
     * not, which is the defect the ruling on issue #599 names.
     */
    expect(watched.everRose.safety).toBe(false);
    expect(watched.lowest.safety).toBe(NEED_MAX);

    /*
     * Nobody stands still, which is ADR 0054 decision 2 and the half that is
     * *not* being re-litigated here — it is asserted so that a run which had
     * stopped reconsidering could not pass the two blocks above by having
     * nothing happen at all.
     */
    expect(watched.runtime.prisoners.actionSystem.getMetrics()).toMatchObject({ unmetDemandCycles: 0, routeFailures: 0 });
    expect(watched.performingTicks['action.free-association'] ?? 0).toBeGreaterThan(0);
    expect(Object.keys(watched.performingTicks).sort()).toEqual([
      'action.eat-in-cell',
      'action.free-association',
      'action.sleep',
      'action.use-toilet',
    ]);
  });
});

describe('zoning the room is the whole of the escape', () => {
  it('a yard, which costs no object at all, is what makes recreation reachable', () => {
    const watched = watch(build({ prisoners: 1, guards: 1, shower: false, yard: true }));

    // `room.yard`'s only requirements are `outdoors` and an 8x8 minimum: no
    // purchase, no delivery, no placement. This is the cheapest escape in the
    // game and ADR 0054 decision 1's argument depends on it being real.
    expect(watched.everRose.recreation).toBe(true);
    // 232.65 since [ADR 0059](../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md),
    // 233.55 before it: the prisoner walks to the yard, so a fraction more of
    // the recreation need decays before each session starts. What this pins is
    // that recreation is *served at all*, which the assertion beside it makes.
    expect(watched.lowest.recreation).toBe(232.65);
    // 2,116 since ADR 0059, 2,300 before it: 184 of the twenty days' ticks go
    // on walking to the yard instead of standing in it.
    expect(watched.performingTicks['action.yard-recreation']).toBe(2_116);

    // And the other room-gated need is untouched by it, so the two are separate
    // buildings rather than one switch.
    expect(watched.everRose.hygiene).toBe(false);
    expect(watched.lowest.hygiene).toBe(0);
  });

  it('a shower room with its two heads is what makes hygiene reachable', () => {
    const watched = watch(build({ prisoners: 1, guards: 1, shower: true, yard: false }));

    expect(watched.everRose.hygiene).toBe(true);
    expect(watched.lowest.hygiene).toBe(212.4);
    // 722 since ADR 0059, 760 before it: the walk to the shower room costs 38
    // ticks of the twenty days this watches, and the claim is the line under
    // it -- hygiene is reachable once the room is zoned.
    expect(watched.performingTicks['action.shower']).toBe(722);

    expect(watched.everRose.recreation).toBe(false);
    expect(watched.lowest.recreation).toBe(0);
  });

  it('both rooms together leave every one of the six needs served', () => {
    const watched = watch(build({ prisoners: 1, guards: 1, shower: true, yard: true }));

    for (const need of NEED_IDS) {
      if (need === 'safety') continue; // Held at the ceiling by the guard, never served from a room -- see `CELL_SERVED`.
      expect(watched.everRose[need], `${need} must be served in a prison that has built every room serving it`).toBe(true);
      expect(watched.lowest[need]).toBeGreaterThan(0);
    }
    expect(watched.lowest.safety).toBe(NEED_MAX);
  });
});

describe('what the neglect costs, and how much of it is the staffing term', () => {
  /**
   * ADR 0054 decision 1 answers ADR 0041's *"a requirement the game never
   * enforces, never reports and never resolves is not a design"* by pointing at
   * the riot. This case measures how much of that riot the neglect is actually
   * paying for, because the ADR asserts the link and never puts a number on the
   * split.
   *
   * Eight prisoners, eight furnished cells, no shower room and no yard — so
   * exactly two of six needs are pinned at zero and every other input to
   * `scoreSectorRisk` is what a competently run prison produces.
   */
  const BOTH_FLOORED = { prisoners: 8, shower: false, yard: false } as const;

  it('two needs on the floor reach 0.4824 of a 0.65 threshold, so a staffed prison never riots', () => {
    const watched = watch(build({ ...BOTH_FLOORED, guards: 1 }));

    // 0.4742 is `needsPressure` alone: `staffingShortfall` is 0 and
    // `contrabandPressure` is structurally 0, so the score *is* the mean
    // deficit. `DEFAULT_SECTOR_RISK_POLICY.hotThreshold` is 0.65 and this never
    // reaches it, in ten in-game days of a prison nobody improves.
    //
    // **0.4824 until issue #588**, and the eighty ten-thousandths it lost are
    // the sixth of the mean that `safety` contributes: this prison's one guard
    // covers the sector, so `safety` sits at `NEED_MAX` for the whole window
    // instead of the 237-248 a bed used to hold it at. A staffed prison got
    // *quieter*, which is the direction the change had to move it in.
    expect(watched.peakRisk).toBeCloseTo(0.4742, 4);
    expect(watched.runtime.deploymentSystem.getCoverageReport(watched.runtime.kernel.tick)).toEqual([
      { sectorId: SECTOR, required: 1, assigned: 1, shortage: 0 },
    ]);
    expect(watched.runtime.incidents.all()).toEqual([]);
    expect(watched.runtime.incidentTriggerSystem.getMetrics().riotsTriggered).toBe(0);

    // The neglect is real and unrelieved throughout — this is not a quiet
    // prison, it is a prison whose two floored needs cannot reach the line.
    expect(watched.everRose.hygiene).toBe(false);
    expect(watched.everRose.recreation).toBe(false);
  });

  it('and the same prison unguarded riots four times, which is the whole of the difference', () => {
    const watched = watch(build({ ...BOTH_FLOORED, guards: 0 }));

    // `staffingShortfallWeight` is 0.3 and the shortfall is 1, so the same
    // neglect clears the threshold. `sustainedSamplesRequired` 12 and
    // `DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT` are why it is a few riots in
    // ten days rather than one every window.
    //
    // **The figure has moved twice and both are worth keeping.** It was 0.7979
    // when ADR 0048 set the weights, 0.7981 after ADR 0059 -- two
    // ten-thousandths, the prisoners spending part of the day walking -- and
    // **0.9661 since issue #588**. That last step is not drift: with nobody on
    // post, `safety` is now provisioned by nothing and falls to zero, so this
    // prison has *three* needs on the floor where it had two, and the mean
    // deficit rises by a sixth accordingly.
    //
    // The gap between this row and the guarded one above is the whole of what
    // the change bought: 0.0142 of risk separated a covered prison from an
    // unguarded one before, and 0.4919 separates them now.
    expect(watched.peakRisk).toBeCloseTo(0.9661, 4);
    expect(watched.runtime.deploymentSystem.getCoverageReport(watched.runtime.kernel.tick)).toEqual([
      { sectorId: SECTOR, required: 1, assigned: 0, shortage: 1 },
    ]);
    // Three until issue #588; four now, for the reason the peak above moved:
    // an unguarded sector no longer provisions `safety`, so the prison spends
    // more of the window over the line and re-arms sooner after each quiet
    // period. The claim this case makes is unchanged and stronger -- one hire
    // is still the whole of the difference between this row and zero.
    expect(watched.runtime.incidentTriggerSystem.getMetrics().riotsTriggered).toBe(4);
  });
});
