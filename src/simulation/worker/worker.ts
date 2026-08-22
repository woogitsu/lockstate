import { decodeMainToWorkerMessage } from '../protocol/decode';
import { SimulationWorkerStateMachine } from './state-machine';
import { SIMULATION_PROTOCOL_VERSION } from '../protocol/types';

const BUILD_ID = 'dev-build'; // To be injected by Vite or build process in the future

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
    // Decoding failed, post protocol error
    stateMachine.fault('invalid-message', result.error.message);
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
