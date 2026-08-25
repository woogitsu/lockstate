import { decodeMainToWorkerMessage } from '../protocol/decode';
import { SimulationWorkerStateMachine } from './state-machine';
import { SIMULATION_PROTOCOL_VERSION } from '../protocol/types';
import { BUILD_IDENTITY } from '../../shared/build-identity';

/**
 * Reported to the main thread as `workerBuildId` in the ready handshake.
 *
 * It used to be the literal `'dev-build'`, under a comment reading "To be
 * injected by Vite or build process in the future". That is now what happens:
 * `src/shared/build-identity.ts` is the injection seam, and this is the same
 * identity the save envelope carries and the badge in the corner shows -- so a
 * handshake, a save file and the screen cannot disagree about which build is
 * running.
 *
 * Still validated as an `identifierSchema` on the receiving side, which is why
 * the identity uses `-` and not semver's `+` to join its parts.
 */
const BUILD_ID = BUILD_IDENTITY.id;

const stateMachine = new SimulationWorkerStateMachine(
  self as unknown as MessagePort,
  BUILD_ID,
  () => performance.now()
);

self.onmessage = (event: MessageEvent) => {
  const result = decodeMainToWorkerMessage(event.data);
  
  if (result.ok) {
    stateMachine.handleMessage(result.value);
  } else {
    // The decoder's own classification, not a single collapsed code. ADR 0003,
    // "Runtime validation and failure behavior": "Decoders classify malformed
    // envelopes, unsupported versions, unknown kinds and invalid payloads
    // separately." This is the only place that classification leaves the
    // worker, so reporting a hard-coded `invalid-message` here computed it and
    // threw it away -- and `unsupported-protocol-version` and
    // `unknown-message-kind` were then codes the worker could never emit.
    // No cast: `ProtocolDecodeErrorCode` is declared as a subset of
    // `ProtocolFaultCode`, so a code that drifted out of the fault enum would
    // fail to compile at its declaration rather than at a player.
    //
    // `recoverable: true`, and it is the one thing this call site has to say
    // out loud (#187 finding 1, [ADR 0024](../../../docs/adr/0024-protocol-fault-recoverability.md)).
    // `fault()` defaults to `false`, which transitions the worker to
    // `faulted` -- and `faulted` stops the tick loop, answers the play button
    // with `invalid-state` and makes `handleSubmitCommand` return without
    // replying at all. One malformed envelope from anywhere on the main
    // thread therefore ended the session for the rest of the page's life.
    //
    // The argument for recovering is narrow and checkable rather than
    // optimistic: `decodeMainToWorkerMessage` returns its verdict as data and
    // calls nothing in the kernel (ADR 0003, "Validation errors are returned
    // as data and do not call simulation code"), so a message that failed it
    // provably reached no simulation state. There is nothing half-applied to
    // protect, and no divergence to fail closed against -- which is exactly
    // the condition `fault()`'s own signature offers this option for, and the
    // same one `rejectedSnapshotFault` already uses one module over.
    //
    // It is not "continue quietly": the fault is still posted, it now carries
    // a classification the main thread can act on, and since this change the
    // main thread paints it (`src/ui/simulation-alerts.ts`). Continuing
    // *silently* would be the worse option ADR 0024 rejects; continuing
    // loudly is what a message that touched nothing is owed.
    stateMachine.fault(result.error.code, result.error.message, { recoverable: true });
  }
};

// Catch unhandled exceptions that might kill the worker
self.addEventListener('error', (event: ErrorEvent) => {
  stateMachine.fault('internal-error', `Unhandled worker error: ${event.message}`);
  // Don't prevent default, allow the worker to be seen as faulted
});

self.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  stateMachine.fault('internal-error', `Unhandled rejection: ${event.reason}`);
});
