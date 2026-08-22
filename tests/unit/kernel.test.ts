import { test, expect } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import type { SystemRegistration, SimulationContext, QueuedCommand } from '../../src/simulation/kernel/system';
import { NamedRngStreams } from '../../src/simulation/rng/streams';

test('Kernel rejects duplicate system IDs', () => {
  const kernel = new Kernel();
  const sysA: SystemRegistration = {
    id: 'sysA',
    order: 1,
    schedule: { intervalTicks: 1, phaseTicks: 0 },
    update: () => {},
  };
  kernel.registerSystem(sysA);
  expect(() => kernel.registerSystem(sysA)).toThrowError(/duplicate ID/);
});

test('Kernel executes systems in deterministic (order, id) sequence', () => {
  const kernel = new Kernel();
  const execLog: string[] = [];

  const createSystem = (id: string, order: number): SystemRegistration => ({
    id,
    order,
    schedule: { intervalTicks: 1, phaseTicks: 0 },
    update: () => execLog.push(id),
  });

  // Register in scrambled order
  kernel.registerSystem(createSystem('sysC', 2));
  kernel.registerSystem(createSystem('sysA', 1));
  kernel.registerSystem(createSystem('sysB', 1)); // same order as sysA, but 'sysB' > 'sysA'
  kernel.registerSystem(createSystem('sysD', 0));

  kernel.step();

  // Expected order: sysD (0), sysA (1), sysB (1), sysC (2)
  expect(execLog).toEqual(['sysD', 'sysA', 'sysB', 'sysC']);
});

test('Kernel validates command sequences and execute-at-tick', () => {
  const kernel = new Kernel(10, 5); // start tick 10, expected seq 5

  // Duplicate sequence (4 < 5)
  expect(() => kernel.submitCommand('cmd1', 4, 10, null)).toThrowError(/Duplicate/);

  // Sequence gap (6 > 5)
  expect(() => kernel.submitCommand('cmd2', 6, 10, null)).toThrowError(/gap/);

  // Past tick (9 < 10)
  expect(() => kernel.submitCommand('cmd3', 5, 9, null)).toThrowError(/past/);

  // Valid
  kernel.submitCommand('cmd4', 5, 10, null);
  expect(kernel.expectedSequence).toBe(6);
});

test('Kernel executes commands due at current tick before systems', () => {
  const kernel = new Kernel();
  const execLog: string[] = [];

  kernel.setCommandHandler((cmd) => {
    execLog.push(`cmd:${cmd.sequence}`);
  });

  kernel.registerSystem({
    id: 'sysA',
    order: 1,
    schedule: { intervalTicks: 1, phaseTicks: 0 },
    update: () => execLog.push('sysA'),
  });

  // Execute at tick 1
  kernel.submitCommand('id1', 0, 1, null);
  // Execute at tick 0
  kernel.submitCommand('id2', 1, 0, null);

  expect(kernel.tick).toBe(0);
  kernel.step();
  // Tick 0: cmd seq 1 runs, then sysA. cmd seq 0 is waiting for tick 1.
  expect(execLog).toEqual(['cmd:1', 'sysA']);

  execLog.length = 0;
  kernel.step();
  // Tick 1: cmd seq 0 runs, then sysA.
  expect(execLog).toEqual(['cmd:0', 'sysA']);
});

test('Kernel multi-rate system scheduling', () => {
  const kernel = new Kernel();
  const execLog: string[] = [];

  kernel.registerSystem({
    id: 'sysA',
    order: 1,
    schedule: { intervalTicks: 2, phaseTicks: 0 }, // ticks 0, 2, 4...
    update: () => execLog.push('sysA'),
  });

  kernel.registerSystem({
    id: 'sysB',
    order: 2,
    schedule: { intervalTicks: 3, phaseTicks: 1 }, // ticks 1, 4, 7...
    update: () => execLog.push('sysB'),
  });

  for (let i = 0; i < 5; i++) {
    kernel.step();
  }

  // Tick 0: sysA (0 % 2 === 0)
  // Tick 1: sysB (1 % 3 === 1)
  // Tick 2: sysA (2 % 2 === 0)
  // Tick 3: none
  // Tick 4: sysA, sysB
  expect(execLog).toEqual(['sysA', 'sysB', 'sysA', 'sysA', 'sysB']);
});

test('Kernel snapshot and restore yields identical state', () => {
  const rng = new NamedRngStreams([
    { name: 'main', state: { algorithm: 'xoshiro128**', version: 1, words: [1, 2, 3, 4] } },
  ]);
  const kernel = new Kernel(5, 10, rng);
  
  let handledCommands = 0;
  const handler = () => handledCommands++;
  kernel.setCommandHandler(handler);
  
  kernel.submitCommand('cmdA', 10, 6, null); // execute at tick 6
  kernel.submitCommand('cmdB', 11, 7, null); // execute at tick 7
  
  // Advance 1 tick (executes tick 5, then increments to 6)
  kernel.step();
  expect(handledCommands).toBe(0);
  expect(kernel.tick).toBe(6);
  
  // Snapshot at tick 6 (cmdB is still pending for tick 7)
  const snap = kernel.snapshot();
  
  // Restore
  const systems: SystemRegistration[] = [];
  const restored = Kernel.restore(snap, systems, handler);
  
  expect(restored.tick).toBe(6);
  expect(restored.expectedSequence).toBe(12);
  
  // Step restored kernel (executes tick 6, handling cmdA, increments to 7)
  restored.step();
  expect(handledCommands).toBe(1);
  expect(restored.tick).toBe(7);
});
