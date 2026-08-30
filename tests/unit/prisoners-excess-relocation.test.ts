import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { buildPrisonerScenarioFixture, type PrisonerScenarioFixture } from '../helpers/prisoner-fixture';

/**
 * `PrisonerOperationsRuntime.relocateExcessResidentsOf` on its own --
 * [ADR 0076](../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
 * decision A(i)'s mechanism, without a command, a world or an object in it.
 *
 * **Why this file exists beside `tests/integration/object-removal-loop.test.ts`,
 * which drives the same code through the real kernel.** That file measures
 * what a *press* does, and can only reach the states a sequence of presses can
 * produce: one bed at a time, one removal at a time. The three answers this
 * method can give -- everybody moved, nobody moved, and **some** moved -- are a
 * property of the method rather than of any command, and the third one takes a
 * prison contrived enough that reaching it through presses costs two removals
 * and a second cell. Here it is three lines of state.
 *
 * It is also the only reader of `ExcessRelocationOutcome`. Nothing in `src/`
 * consumes the return value today: the caller is a command dispatch that
 * cannot refuse and has nothing to say, and the one thing that *would* consume
 * it -- telling the player their prisoner has been moved -- is the
 * player-facing string ADR 0076's Status flags and reserves to the owner. The
 * value is returned rather than dropped because "who could not be moved" is
 * exactly the set decision A(ii) goes on withholding money for, and a method
 * that computed it and threw it away would have to be re-opened to say so.
 *
 * The fixture is `buildPrisonerScenarioFixture`, so classification, the
 * accommodation policy and `findBestAvailable` are the real ones. Residency is
 * then arranged by hand where a real intake would not produce it, and every
 * arrangement is asserted before it is relied on.
 */

const SEED = 1;

/** The fixture, with `count` prisoners admitted and housed by the real intake path. */
function prisonWithHousedPrisoners(count: number): { readonly fixture: PrisonerScenarioFixture; readonly prisoners: readonly number[] } {
  const fixture = buildPrisonerScenarioFixture({ cellCount: 6, capacity: 10 });
  const kernel = new Kernel(
    0,
    0,
    new NamedRngStreams([{ name: 'prisoners.classification', state: deriveXoshiroState(SEED, 'prisoners.classification') }]),
  );
  fixture.registerOn(kernel);
  const prisoners: number[] = [];
  for (let index = 0; index < count; index += 1) {
    prisoners.push(fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 100_000, priorIncidents: 0 }, fixture.originTile));
  }
  for (let tick = 0; tick < 600; tick += 1) kernel.step();
  return { fixture, prisoners };
}

/** Takes an instance's residency capacity to `capacity`, the way a removal's re-derivation does. */
function setCapacity(fixture: PrisonerScenarioFixture, instanceId: string, capacity: number): void {
  fixture.prisoners.roomInstances.updateDerived(instanceId, {
    residentCapacity: capacity,
    concurrentUseCapacity: capacity,
    concurrentUseCapacityByCapability: capacity > 0 ? [['sleep-surface', capacity]] : [],
    objectCapabilities: capacity > 0 ? ['sleep-surface', 'sanitation'] : ['sanitation'],
  });
}

describe('relocating the residents a room can no longer sleep (ADR 0076 A(i))', () => {
  it('moves the resident and says so when the prison has somewhere to put them', () => {
    const { fixture, prisoners } = prisonWithHousedPrisoners(1);
    const [prisoner] = prisoners as readonly [number];
    const home = fixture.prisoners.coldState.getAccommodation(prisoner);
    expect(home, 'housed by the real intake path, in a general cell').toBe('cell-0');

    setCapacity(fixture, 'cell-0', 0);
    expect(fixture.prisoners.roomInstances.residentIdsWithExistingPlace(), 'and now holding a place that is not there').toEqual(
      [],
    );

    expect(fixture.prisoners.relocateExcessResidentsOf(['cell-0'])).toEqual({ relocated: [prisoner], stranded: [] });
    expect(fixture.prisoners.coldState.getAccommodation(prisoner)).toBe('cell-1');
    expect(fixture.prisoners.roomInstances.occupancyOf('cell-0')).toBe(0);
    expect(fixture.prisoners.roomInstances.residentIdsWithExistingPlace(), 'and paid for again').toEqual([prisoner]);
  });

  it('leaves the resident exactly where they were, and names them, when there is nowhere', () => {
    const { fixture, prisoners } = prisonWithHousedPrisoners(1);
    const [prisoner] = prisoners as readonly [number];
    // Every general cell furnished out of existence, which is the one-cell
    // prison and the full prison at once -- the branch ADR 0076 says the
    // recycling loop runs through by construction.
    for (const instanceId of ['cell-0', 'cell-1', 'cell-2', 'cell-3']) setCapacity(fixture, instanceId, 0);

    expect(fixture.prisoners.relocateExcessResidentsOf(['cell-0'])).toEqual({ relocated: [], stranded: [prisoner] });
    expect(fixture.prisoners.coldState.getAccommodation(prisoner), 'nobody is put on the street').toBe('cell-0');
    expect(fixture.prisoners.roomInstances.occupancyOf('cell-0')).toBe(1);
    expect(fixture.prisoners.roomInstances.residentIdsWithExistingPlace(), 'and the state pays for none of it').toEqual([]);
  });

  it('moves as many as it can and strands the rest, rather than rolling the successful moves back', () => {
    const { fixture, prisoners } = prisonWithHousedPrisoners(2);
    const [lower, higher] = prisoners as readonly [number, number];
    expect(lower, 'entity ids ascend with admission, which is what the tie-break is about').toBeLessThan(higher);

    // Both into one two-place cell, which is what a two-bed cell is. Arranged
    // rather than admitted, because intake spreads arrivals across empty cells
    // and no sequence of admissions produces this from a fixture whose cells
    // hold one each.
    setCapacity(fixture, 'cell-0', 2);
    fixture.prisoners.roomInstances.release('cell-1', higher);
    expect(fixture.prisoners.roomInstances.assign('cell-0', higher)).toBe(true);
    fixture.prisoners.coldState.setAccommodation(higher, 'cell-0');
    expect(fixture.prisoners.roomInstances.occupantsOf('cell-0')).toEqual([lower, higher]);

    // One place left in the whole prison, and both residents of `cell-0` lose
    // theirs: two excess, one destination.
    setCapacity(fixture, 'cell-0', 0);
    setCapacity(fixture, 'cell-2', 0);
    setCapacity(fixture, 'cell-3', 0);
    expect(fixture.prisoners.roomInstances.getById('cell-1')?.residentCapacity, 'the one place left').toBe(1);

    // **Partial, and deliberately not atomic.** `relocateResidentsOutOf` would
    // have rolled the first move back on reaching the resident it could not
    // place, because `unzone` can still refuse; this caller cannot refuse
    // anything -- the bed is already gone -- so undoing the move would put a
    // rehoused prisoner back in a bedless cell and cost the prison the one
    // place it still has. The lowest entity id is offered it first.
    expect(fixture.prisoners.relocateExcessResidentsOf(['cell-0'])).toEqual({ relocated: [lower], stranded: [higher] });
    expect(fixture.prisoners.coldState.getAccommodation(lower)).toBe('cell-1');
    expect(fixture.prisoners.coldState.getAccommodation(higher)).toBe('cell-0');
    expect(fixture.prisoners.roomInstances.residentIdsWithExistingPlace()).toEqual([lower]);
  });

  it('moves nobody out of a room that can still sleep everybody in it, and nobody out of an instance that is gone', () => {
    const { fixture, prisoners } = prisonWithHousedPrisoners(1);
    const [prisoner] = prisoners as readonly [number];

    // Occupancy 1, capacity 1: no excess, so nothing to do and nothing done.
    expect(fixture.prisoners.relocateExcessResidentsOf(['cell-0'])).toEqual({ relocated: [], stranded: [] });
    expect(fixture.prisoners.coldState.getAccommodation(prisoner)).toBe('cell-0');

    // An id the registry does not hold is skipped rather than throwing: a
    // caller that resolved a room from a tile can hand over an instance that
    // has since been unregistered, and a `RangeError` out of a command
    // dispatch faults the worker.
    expect(fixture.prisoners.relocateExcessResidentsOf(['cell-nowhere'])).toEqual({ relocated: [], stranded: [] });
  });
});
