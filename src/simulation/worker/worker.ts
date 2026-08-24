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
    stateMachine.fault(result.error.code, result.error.message);
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
