import { decodeWorkerToMainMessage, type ProtocolDecodeError } from '../protocol/decode';
import {
  SIMULATION_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type WorkerToMainMessage,
} from '../protocol/types';

export type WorkerMessageHandler = (message: WorkerToMainMessage) => void;

export class SimulationClient {
  private readonly worker: Worker;
  private readonly listeners = new Set<WorkerMessageHandler>();
  /**
   * How many messages from this worker have failed to decode, which is all the
   * `messageId` of a locally raised fault needs to be.
   *
   * A counter and not `crypto.randomUUID()`, for two reasons that both matter.
   * This module is inside the simulation import closure that
   * `tests/determinism/ambient-nondeterminism-contract.test.ts` scans, and a
   * randomness source there needs an allow-list entry rather than being worth
   * it for a diagnostic id. And an id that is a plain count is *readable*: two
   * fault reports one apart tell a reader that exactly two messages were lost,
   * which a pair of UUIDs does not.
   */
  private undecodableMessages = 0;

  /**
   * Accepts an already-constructed `Worker` as well as a URL.
   *
   * The URL form cannot survive a production build: bundlers detect
   * workers by seeing `new Worker(new URL(...), ...)` *at the call site*,
   * and here that call lives inside this class, so the module is never
   * emitted as a worker chunk and the URL resolves to a file that does not
   * exist in `dist`. Production callers therefore pass a `Worker` built by
   * the bundler's own worker import (`?worker`), which is statically
   * analyzable; the URL overload stays for tests and any non-bundled
   * consumer.
   */
  public constructor(workerOrUrl: Worker | string | URL) {
    this.worker = workerOrUrl instanceof Worker ? workerOrUrl : new Worker(workerOrUrl, { type: 'module' });
    this.worker.onmessage = this.handleMessage.bind(this);
    this.worker.onerror = (e) => {
      console.error('Simulation Worker raw error:', e);
    };
  }

  public addListener(handler: WorkerMessageHandler): void {
    this.listeners.add(handler);
  }

  public removeListener(handler: WorkerMessageHandler): void {
    this.listeners.delete(handler);
  }

  public send(message: MainToWorkerMessage, transfer?: Transferable[]): void {
    if (transfer) {
      this.worker.postMessage(message, transfer);
    } else {
      this.worker.postMessage(message);
    }
  }

  public terminate(): void {
    this.worker.terminate();
  }

  /**
   * The one door every worker-to-main message comes through.
   *
   * A message that decodes reaches every listener. A message that does not
   * used to reach `console.error` and nothing else (#187 finding 3), and the
   * cost of that was not the lost log line:
   *
   * - `WorkerSessionHost` settles a pending request on `replyTo`, so the
   *   request the unreadable message was answering waited out its 15 s
   *   timeout and then reported "the simulation worker did not reply" -- the
   *   misleading symptom #103 records, reached by a second route;
   * - the HUD was told nothing at all, at any point, by anything;
   * - and if the message that failed to decode is a `protocol/error`, the
   *   worker's only statement about what went wrong is precisely the one the
   *   main thread throws away. That is not hypothetical: it is what a fault
   *   carrying a code outside `ProtocolFaultCode` would do, which is the
   *   defect `PROTOCOL_DECODE_ERROR_CODES`' `satisfies` clause exists to
   *   prevent one module over.
   *
   * So the failure is *reported on the route the protocol already has* rather
   * than through a channel of this class's own: listeners are handed a real
   * `protocol/error`, carrying the decoder's own classification, and every
   * existing reader handles it without knowing anything new. `console.error`
   * stays for the `issues` array, which is diagnostic detail no view model
   * carries.
   */
  private handleMessage(event: MessageEvent): void {
    const result = decodeWorkerToMainMessage(event.data);
    if (!result.ok) console.error('Main thread failed to decode worker message:', result.error);

    // One fan-out for both outcomes, and deliberately one rather than two.
    // A decodable message and a locally raised fault are both just messages
    // by this point, so a second loop would be a second delivery path to keep
    // in step -- and it would be a second unordered enumeration in the tree
    // `tests/determinism/canonical-iteration-contract.test.ts` scans, needing
    // a second exemption for one fact.
    const message = result.ok ? result.value : this.localFault(result.error);
    for (const listener of this.listeners) {
      listener(message);
    }
  }

  /**
   * The undecodable message, restated as the protocol message the main thread
   * *can* read.
   *
   * **No `replyTo`, and that is a refusal rather than an omission.** The
   * envelope this fault is about never passed its schema, so any `replyTo` on
   * it is unvalidated input; `WorkerSessionHost` resolves pending requests by
   * `replyTo` alone, so a fabricated one would settle whichever request
   * happened to share the id -- with a *fault*, on a request that may well
   * have succeeded. Waiting out a timeout is a worse report than the truth,
   * and settling the wrong request with the wrong answer is worse than both.
   * ADR 0003 decision 2 permits the uncorrelated form for exactly this, and
   * `SimulationWorkerStateMachine.fault` declines to correlate the mirror-image
   * case for the same reason.
   *
   * **`recoverable: false`**, and this is the asymmetry with the worker's own
   * decode fault, which is now `recoverable: true` (ADR 0024). The worker can
   * say a rejected message reached no simulation state, because it holds the
   * state and it ran the decoder before dispatch. This thread can say nothing
   * of the kind: it does not know what the message said, therefore does not
   * know what the worker did, and cannot tell an unreadable diagnostic from an
   * unreadable `simulation/ready`. `recoverable` answers "can this worker
   * still be relied on", and the honest answer here is no.
   *
   * It reports rather than acts: nothing here terminates the worker. Ending an
   * authoritative session -- the player's prison, with everything since the
   * last save in it -- on the strength of one message this thread could not
   * parse is a decision the main thread does not have the information to make,
   * and ADR 0006 puts the session boundary on a deliberate `claimForSession`
   * rather than on an inference.
   */
  private localFault(error: ProtocolDecodeError): WorkerToMainMessage {
    this.undecodableMessages += 1;
    return {
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `main-decode-fault-${this.undecodableMessages}`,
      kind: 'protocol/error',
      payload: {
        code: error.code,
        message: `The main thread could not decode a worker message: ${error.message}`,
        recoverable: false,
      },
    };
  }
}
