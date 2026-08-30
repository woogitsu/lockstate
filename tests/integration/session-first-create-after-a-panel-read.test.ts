import { describe, expect, it } from 'vitest';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { SessionController } from '../../src/persistence/session/session-controller';
import { WorkerPerSessionHost } from '../../src/persistence/session/worker-per-session-host';
import type { SimulationClient } from '../../src/simulation/worker/client';
import { SimulationWorkerChannel } from '../../src/simulation/worker/worker-channel';
import { IntakePipelineReader } from '../../src/ui/simulation-intake';
import { BuildQueueReader } from '../../src/ui/simulation-build-queue';
import { LoopbackWorker } from '../helpers/loopback-worker';

/**
 * Issue #680: one click on any `.ui-tab` before the first **New prison** made
 * that press fail `already-initialized` -- *"Kernel is already initialized"* --
 * and a second press succeed.
 *
 * ## What the composition does, and why no component held the defect
 *
 * `src/main.ts` builds the page's readers at boot, over the channel rather
 * than over a session, because they have to survive a worker swap (#149). The
 * `select-tab` intent (`src/main.ts`'s `onIntent`) then fires up to nine
 * `refresh*()` reads on **every** tab change, including the first one, and
 * every one of those is a `simulation/request-projection` at the **boot
 * worker** -- the worker that has hosted no session and that
 * `SimulationWorkerChannel.claimForSession` therefore hands to the first
 * session (`worker-channel.ts`, *"The boot worker is the one worker that is
 * not wasted"*).
 *
 * The state machine answered that read `not-initialized`, correctly -- and
 * `fault()` defaults to `recoverable: false`, so it also moved the worker to
 * `faulted`. `faulted` is not `uninitialized`, so `handleInitialize`'s first
 * line then refused the first `simulation/initialize` with
 * `already-initialized` and the message *"Kernel is already initialized."*,
 * which is false about that worker: it had no kernel and never had one. The
 * second press succeeded because the first had already *claimed* the boot
 * worker, so the channel terminated it and built a fresh one.
 *
 * So the defect lived in no component. The reader was right to ask, the state
 * machine was right to refuse, and the channel was right to hand the boot
 * worker to the first session. What was wrong is that a refusal which touched
 * no simulation state spent the worker -- the exact condition
 * `SimulationWorkerStateMachine.fault` documents `recoverable: true` for, and
 * the one ADR 0024 §1 settled for the decode path.
 *
 * ## Why this is an integration test
 *
 * Because the claim is about composition: one real `SimulationWorkerChannel`
 * handing one real `SimulationWorkerStateMachine` both to a panel reader and
 * to a real `WorkerPerSessionHost`. Every existing test builds a fresh machine
 * per case, so nothing read from a worker *before* the session that would run
 * in it. `tests/unit/worker-state-machine.test.ts` carries the narrow half --
 * that each pre-session guard leaves the worker usable.
 */

interface Fixture {
  readonly controller: SessionController;
  readonly channel: SimulationWorkerChannel;
  /** Every worker the channel has constructed, oldest first. */
  readonly workers: readonly LoopbackWorker[];
}

function buildFixture(): Fixture {
  const workers: LoopbackWorker[] = [];
  const channel = new SimulationWorkerChannel(() => {
    const worker = new LoopbackWorker();
    workers.push(worker);
    return worker as unknown as SimulationClient;
  });
  // What `src/main.ts` does at module scope, before the HUD mounts: the boot
  // worker exists so a browser that cannot start one is discovered at first
  // paint (#82), and it has hosted nothing, so the first session runs in it.
  channel.open();

  const repository = new PrisonSaveRepository(new MemoryLocalSaveStore(), {
    generateGenerationId: (() => {
      let n = 0;
      return () => `gen-${(n += 1)}`;
    })(),
  });

  const host = new WorkerPerSessionHost(channel);
  const controller = new SessionController(repository, host, { gameVersion: 'test-version' });
  return { controller, channel, workers };
}

describe('the first "New prison" after the player has touched the interface (#680)', () => {
  it('creates a prison after a tab click has read a projection from the boot worker', async () => {
    const { controller, channel, workers } = buildFixture();

    // The `overview` tab's read, which `select-tab` fires on the very first
    // tab press because `activeTab` starts there and `dispatchShell`
    // notifies the host whether or not the tab actually changed.
    await expect(new IntakePipelineReader(channel).read()).rejects.toThrow(/not-initialized/);

    const result = await controller.createPrison('prison-a', 'New Prison');

    expect(result.ok).toBe(true);
    // And it ran in the boot worker, which is the second half of the claim:
    // a fix that threw the poisoned worker away and started another would
    // also make the line above pass, while still costing a worker per stray
    // read.
    expect(workers).toHaveLength(1);
    expect(controller.getActiveSession()?.prisonId).toBe('prison-a');
  });

  it('creates a prison after the Build tab has read the build queue', async () => {
    const { controller, channel } = buildFixture();

    await expect(new BuildQueueReader(channel, () => undefined).read()).rejects.toThrow(/not-initialized/);

    expect((await controller.createPrison('prison-a', 'New Prison')).ok).toBe(true);
  });
});
