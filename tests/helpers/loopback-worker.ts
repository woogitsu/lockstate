import { decodeMainToWorkerMessage, decodeWorkerToMainMessage } from '../../src/simulation/protocol/decode';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { SimulationWorkerStateMachine } from '../../src/simulation/worker/state-machine';

/**
 * A `SimulationClient` stand-in wired straight to a real
 * `SimulationWorkerStateMachine`, through both real protocol decoders.
 *
 * The decoders are the point. A test double that passed objects straight
 * through would accept a message the schema forbids -- a fault carrying a
 * `replyTo` its envelope does not permit, say -- and prove a correlation the
 * real transport would have dropped. Anything the worker posts that does not
 * decode lands in `undecodableWorkerMessages` instead of reaching a listener,
 * so a test can assert that nothing did.
 *
 * Shared by `tests/integration/session-restore-failure.test.ts` (#103) and
 * `tests/integration/session-second-load.test.ts` (#149). The second needs
 * *several* of these -- one per session -- which is what made one copy per
 * test file the wrong shape: two fakes of one protocol drift apart, and the
 * one that drifts is the one still passing.
 */
export class LoopbackWorker {
  public readonly machine: SimulationWorkerStateMachine;
  private readonly listeners = new Set<(message: WorkerToMainMessage) => void>();
  public readonly undecodableWorkerMessages: unknown[] = [];
  /**
   * Every message the worker posted that **decoded**, in order.
   *
   * Recorded post-decode on purpose: a test asserting on a fault's `details`
   * is asserting that the envelope schema permits that shape, not merely that
   * the state machine tried to send it (#431). A listener cannot stand in for
   * this -- `WorkerSessionHost` consumes a correlated fault by rejecting the
   * pending request, so the message is gone by the time a test could look.
   */
  public readonly posted: WorkerToMainMessage[] = [];
  /** Set by `terminate`, so a test can assert a worker was really disposed of. */
  public terminated = false;

  public constructor() {
    this.machine = new SimulationWorkerStateMachine(
      {
        postMessage: (message: unknown) => {
          // A terminated worker's thread is gone: nothing it was mid-way
          // through posting arrives, which is what a listener registered for
          // the life of the page must survive.
          if (this.terminated) return;
          const decoded = decodeWorkerToMainMessage(message);
          if (!decoded.ok) {
            this.undecodableWorkerMessages.push(message);
            return;
          }
          this.posted.push(decoded.value);
          for (const listener of this.listeners) listener(decoded.value);
        },
      },
      'test-build',
      () => 0,
    );
  }

  public addListener(handler: (message: WorkerToMainMessage) => void): void {
    this.listeners.add(handler);
  }

  public removeListener(handler: (message: WorkerToMainMessage) => void): void {
    this.listeners.delete(handler);
  }

  public send(message: MainToWorkerMessage): void {
    // `Worker.postMessage` after `terminate()` is silently discarded rather
    // than throwing, and the state machine on the other side is gone, so this
    // must not reach `handleMessage` either.
    if (this.terminated) return;
    const decoded = decodeMainToWorkerMessage(message);
    if (!decoded.ok) throw new Error(`the main thread sent a message the worker rejects: ${decoded.error.message}`);
    this.machine.handleMessage(decoded.value);
  }

  public terminate(): void {
    this.terminated = true;
  }
}
