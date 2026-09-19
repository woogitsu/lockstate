import { describe, expect, it } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **ADR 0103's gangs, reached the way a player would reach them** — open
 * question 5, answered by the owner on 2026-09-09.
 *
 * ## Why this file exists, and why `gang-grudge-loop.test.ts` does not cover it
 *
 * That file admits with `priorIncidents: 2`, and says so in its own header:
 * *"the one field that differs ... is what puts arrivals in reach of the
 * high-risk floor at intake"*. **No player can send that value.** `src/main.ts`
 * builds the game's only `AdmitPrisoner` command and passes
 * `ADMISSION_REQUEST.priorIncidents`, and that constant is
 * `{ priorIncidents: 0 } as const` — a *held* decision with its own docblock
 * saying why (drawing priors moves risk tiers, and tiers decide cell sharing,
 * contraband and regime). So the existing loop test proves decision 6's gate
 * works on an admission the interface cannot produce, and ADR 0103's whole
 * mechanism was unreachable in play.
 *
 * This file admits with **`priorIncidents: 0`** — the exact request `src/main.ts`
 * sends — and asserts membership arrives anyway, because
 * `ClassificationReviewSystem` now carries the same `IntakeGangAssigner` port
 * the intake stage does.
 *
 * ## The prison
 *
 * The neglected, unguarded shape `risk-tier-neglect-reachability.test.ts`
 * already established reaches tier 3 from disciplinary findings alone at
 * `priorIncidents: 0`: bed-only cells, no toilet, no shower, no yard, no staff,
 * built entirely from commands a player can send. That file settles *that a
 * tier-3 population is reachable*; this one settles *that reaching it makes
 * gang members*.
 *
 * ## Every figure below was read off a real run and written out
 *
 * Never computed from the code under test — the discipline
 * `incident-trigger-reachability.test.ts` and `gang-grudge-loop.test.ts` both
 * use. Measured on this fixture: **nobody is a member at intake**; all eight
 * arrivals join at **tick 48,000**, the first review that carries them into
 * `high-risk`; they split on entity-id parity; and entity 6 **leaves at tick
 * 48,611** on release, which is the pre-existing `releasePrisoner` path and not
 * anything this change added.
 */

const SEED = 0x0cc0;
const SENTENCE_LENGTH_TICKS = 60_000;
/** The exact request `src/main.ts` sends. `priorIncidents: 0` is the whole point of this file. */
const ADMISSION = { sentenceLengthTicks: SENTENCE_LENGTH_TICKS, priorIncidents: 0 } as const;

const CELL_COUNT = 8;
const ARRIVAL = { x: 16, y: 16 } as const;
/** Measured: the first review that writes `high-risk` for this fixture. */
const FIRST_REVIEW_TICK = 48_000;
/** Measured: entity 6's release, which drops its membership again. */
const ENTITY_6_RELEASE_TICK = 48_611;

function cellRect(index: number): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return { x: 1 + index * 3, y: 1, width: 2, height: 3 };
}

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** A bed-only, unguarded prison built entirely from commands a player can send. */
function buildNeglectedPrison(prisonerCount: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  const cells = Array.from({ length: CELL_COUNT }, (_unused, index) => cellRect(index));

  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: CELL_COUNT }));
  for (const rect of cells) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  cells.forEach((rect, index) => submit(runtime, `zone-c${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
  cells.forEach((rect, index) =>
    submit(runtime, `bed${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y })),
  );

  stepTo(runtime, 1_000);
  for (let index = 0; index < prisonerCount; index += 1) {
    submit(runtime, `admit${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }

  expect(runtime.refusals.count, 'the fixture must build the prison it says it builds, with zero staff and zero refusals').toBe(0);
  return runtime;
}

function allMembers(runtime: SimulationRuntime): readonly number[] {
  return [...runtime.gangs.membersOf('gang.alpha'), ...runtime.gangs.membersOf('gang.beta')].sort((a, b) => a - b);
}

describe('ADR 0103 decision 6, at the site the owner chose (open question 5)', () => {
  it('assigns nobody at intake, because the only admission a player can make is priorIncidents: 0', () => {
    const runtime = buildNeglectedPrison(CELL_COUNT);

    // The two gangs exist from session creation -- decision 1, unchanged.
    expect(runtime.gangs.all().map((gang) => gang.id)).toEqual(['gang.alpha', 'gang.beta']);

    // And nobody is in either of them. This is the inertness open question 5
    // was about, reproduced rather than argued: the intake gate is sound and
    // the interface cannot feed it.
    expect(allMembers(runtime), 'no arrival classifies high-risk at intake from priorIncidents: 0').toEqual([]);
    expect(runtime.prisoners.records.priorIncidentsAtIntake[0]).toBe(0);
  });

  it('assigns every arrival at the first review that carries them into high-risk, split on entity-id parity', () => {
    const runtime = buildNeglectedPrison(CELL_COUNT);
    stepTo(runtime, FIRST_REVIEW_TICK - 1);

    // Still nobody, one tick before the review. This is what makes the next
    // assertion about the review rather than about elapsed time.
    expect(allMembers(runtime), 'membership must not appear before the review that writes high-risk').toEqual([]);

    stepTo(runtime, FIRST_REVIEW_TICK);

    expect(runtime.gangs.membersOf('gang.alpha')).toEqual([0, 2, 4, 6]);
    expect(runtime.gangs.membersOf('gang.beta')).toEqual([1, 3, 5, 7]);
    // Every one of them was admitted at priorIncidents: 0 and is high-risk now.
    for (let index = 0; index < CELL_COUNT; index += 1) {
      expect(runtime.prisoners.records.priorIncidentsAtIntake[index]).toBe(0);
      expect(runtime.prisoners.records.riskTier[index]).toBe(3);
    }
  });

  it('drops a member on release, which is the pre-existing path and not something this write site changed', () => {
    const runtime = buildNeglectedPrison(CELL_COUNT);
    stepTo(runtime, ENTITY_6_RELEASE_TICK - 1);
    expect(runtime.gangs.getGangOf(6), 'entity 6 is a member right up to its release').toBe('gang.alpha');

    stepTo(runtime, ENTITY_6_RELEASE_TICK);
    expect(runtime.gangs.getGangOf(6)).toBeUndefined();
    expect(runtime.gangs.membersOf('gang.alpha')).toEqual([0, 2, 4]);
  });
});
