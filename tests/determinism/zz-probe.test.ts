
import { describe, expect, it } from 'vitest';
import { buildDeterminismScenario, submitScenarioCommands } from '../helpers/determinism-scenario';

describe('p', () => { it('p', () => {
  const runtime = buildDeterminismScenario(0x5eed);
  submitScenarioCommands(runtime);
  for (let i = 0; i < 4000; i += 1) {
    runtime.kernel.step();
    if (i % 400 === 0) {
      // eslint-disable-next-line no-console
      console.log(runtime.kernel.tick, runtime.jobs.allSorted().map((j) => `${j.id}:${j.state}:${j.leg}:${String(j.assignedWorkerId)}`).join(' '));
    }
  }
  expect(true).toBe(true);
}, 60_000); });
