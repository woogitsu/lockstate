import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import type { SimulationContext, SystemRegistration } from '../../src/simulation/kernel/system';
import { packCommand } from '../../src/simulation/protocol/commands';
import { buildDeterminismScenario } from '../helpers/determinism-scenario';

/**
 * ADR 0004: "every registered system must define an explicit integer
 * `order` and a stable string `id`. Systems are deterministically sorted
 * primarily by `order` and secondarily by `id`." ADR 0009 makes that a
 * product guarantee -- inserting a system into the middle of the order
 * changes the outcome of every stored challenge replay -- so the resolved
 * order must be a property of the declarations alone, never of the order
 * `registerSystem` happened to be called in.
 */

function probe(id: string, order: number, log: string[], schedule = { intervalTicks: 1, phaseTicks: 0 }): SystemRegistration {
  return {
    id,
    order,
    schedule,
    update: (context: SimulationContext) => log.push(`${id}@${context.tick}`),
  };
}

function runOrder(systems: readonly SystemRegistration[], ticks = 1): string[] {
  const log: string[] = [];
  const kernel = new Kernel();
  for (const system of systems) kernel.registerSystem(system);
  for (let tick = 0; tick < ticks; tick += 1) kernel.step();
  return log.length === 0 ? kernel.systemExecutionOrder.map((entry) => entry.id) : log;
}

describe('kernel system ordering', () => {
  it('runs systems by declared order, independent of registration order', () => {
    const log: string[] = [];
    const build = () => [probe('zulu', 10, log), probe('alpha', 30, log), probe('mike', 20, log)];

    const forwards = new Kernel();
    for (const system of build()) forwards.registerSystem(system);
    forwards.step();
    const forwardsLog = [...log];

    log.length = 0;
    const backwards = new Kernel();
    for (const system of [...build()].reverse()) backwards.registerSystem(system);
    backwards.step();

    expect(forwardsLog).toEqual(['zulu@0', 'mike@0', 'alpha@0']);
    expect(log).toEqual(forwardsLog);
  });

  it('breaks a tie on equal `order` by ascending id, in either registration order', () => {
    const log: string[] = [];
    const tied = () => [probe('charlie', 50, log), probe('alpha', 50, log), probe('bravo', 50, log)];

    for (const permutation of [[0, 1, 2], [2, 1, 0], [1, 2, 0]]) {
      log.length = 0;
      const kernel = new Kernel();
      const systems = tied();
      for (const index of permutation) kernel.registerSystem(systems[index]!);
      kernel.step();
      expect(log, `registration permutation ${permutation.join(',')}`).toEqual(['alpha@0', 'bravo@0', 'charlie@0']);
    }
  });

  it('rejects a duplicate system id, so the tie-break key is genuinely unique', () => {
    const log: string[] = [];
    const kernel = new Kernel();
    kernel.registerSystem(probe('same', 1, log));
    expect(() => kernel.registerSystem(probe('same', 2, log))).toThrow(/duplicate/i);
  });

  it('honours multi-rate schedules without disturbing the order of the systems that do run', () => {
    const log: string[] = [];
    const kernel = new Kernel();
    kernel.registerSystem(probe('every-tick', 20, log));
    kernel.registerSystem(probe('every-third', 10, log, { intervalTicks: 3, phaseTicks: 0 }));
    kernel.registerSystem(probe('phased', 30, log, { intervalTicks: 3, phaseTicks: 1 }));

    for (let tick = 0; tick < 4; tick += 1) kernel.step();

    expect(log).toEqual([
      'every-third@0', 'every-tick@0',
      'every-tick@1', 'phased@1',
      'every-tick@2',
      'every-third@3', 'every-tick@3',
    ]);
  });

  it('dispatches all due commands, in sequence order, before any system runs that tick', () => {
    const log: string[] = [];
    const kernel = new Kernel();
    kernel.setCommandHandler((command) => log.push(`cmd:${command.id}`));
    kernel.registerSystem(probe('system', 10, log));

    kernel.submitCommand('first', 0, 0, null);
    kernel.submitCommand('second', 1, 0, null);
    kernel.submitCommand('later', 2, 1, null);

    kernel.step();
    kernel.step();

    expect(log).toEqual(['cmd:first', 'cmd:second', 'system@0', 'cmd:later', 'system@1']);
  });

  it('orders the pending command queue by (tick, sequence) regardless of submission order after a restore', () => {
    const log: string[] = [];
    const kernel = new Kernel();
    kernel.setCommandHandler((command) => log.push(`cmd:${command.id}`));

    const shuffled = {
      tick: 0,
      expectedSequence: 3,
      rngStates: [],
      commands: [
        { id: 'c', sequence: 2, executeAtTick: 1, payload: null },
        { id: 'a', sequence: 0, executeAtTick: 0, payload: null },
        { id: 'b', sequence: 1, executeAtTick: 0, payload: null },
      ],
    };
    kernel.restoreState(shuffled);
    kernel.step();
    kernel.step();

    expect(log).toEqual(['cmd:a', 'cmd:b', 'cmd:c']);
  });

  it('rejects out-of-order, duplicate and retroactive commands rather than silently desynchronising', () => {
    const kernel = new Kernel();
    kernel.submitCommand('a', 0, 0, packCommand({ type: 'Undo' }));
    expect(() => kernel.submitCommand('gap', 2, 0, packCommand({ type: 'Undo' }))).toThrow(/gap/i);
    expect(() => kernel.submitCommand('dupe', 0, 0, packCommand({ type: 'Undo' }))).toThrow(/duplicate/i);
    kernel.step();
    expect(() => kernel.submitCommand('past', 1, 0, packCommand({ type: 'Undo' }))).toThrow(/past/i);
  });

  /**
   * The pin that matters for stored replay evidence: adding, removing or
   * renumbering a simulation system changes what a recorded command stream
   * produces. This list is the declared execution order of a real session,
   * and updating it must be a deliberate, reviewed edit -- accompanied,
   * per ADR 0009, by retiring incompatible challenge submissions through
   * the definition allow-lists.
   */
  it('pins the declared execution order of a real session', () => {
    expect(buildDeterminismScenario().kernel.systemExecutionOrder).toEqual([
      { id: 'prisoners.intake', order: 50 },
      { id: 'prisoners.needs-decay', order: 60 },
      { id: 'construction', order: 100 },
      { id: 'navigation', order: 150 },
      { id: 'prisoners.actions', order: 250 },
      { id: 'operations.jobs', order: 260 },
      { id: 'contraband.intelligence', order: 265 },
      { id: 'security.deployment', order: 270 },
      { id: 'security.patrol', order: 280 },
      { id: 'incidents.trigger', order: 285 },
      { id: 'contraband.search', order: 290 },
      { id: 'incidents.response', order: 295 },
    ]);
  });

  it('leaves no ambiguity for a reviewer: every declared order in a real session is distinct', () => {
    // The id tie-break above makes a collision *deterministic*, not
    // *obvious*: two systems sharing an order would silently swap places
    // the day one of them is renamed. Keeping the declared integers unique
    // means the execution order can be read off the declarations alone.
    const orders = buildDeterminismScenario().kernel.systemExecutionOrder.map((entry) => entry.order);
    expect(new Set(orders).size).toBe(orders.length);
    expect([...orders].sort((left, right) => left - right)).toEqual(orders);
  });

  it('exposes execution order as a copy that cannot be used to mutate the kernel', () => {
    const kernel = new Kernel();
    const log: string[] = [];
    kernel.registerSystem(probe('one', 1, log));
    const view = kernel.systemExecutionOrder;
    (view as { id: string; order: number }[]).push({ id: 'injected', order: 0 });
    expect(kernel.systemExecutionOrder.map((entry) => entry.id)).toEqual(['one']);
  });

  it('helper sanity: `runOrder` reports the resolved order for systems that never run', () => {
    expect(runOrder([{ id: 'never', order: 5, schedule: { intervalTicks: 1_000, phaseTicks: 500 }, update: () => {} }])).toEqual(['never']);
  });
});
