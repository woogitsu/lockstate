import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { SimulationClient } from '../../src/simulation/worker/client';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';

class MockWorker {
  public onmessage: ((e: MessageEvent) => void) | null = null;
  public onerror: ((e: ErrorEvent) => void) | null = null;
  public terminate = vi.fn();
  public postMessage = vi.fn((data: any) => {
    // Simulate immediate response for tests
    if (data.kind === 'protocol/handshake') {
      setTimeout(() => {
        if (this.onmessage) {
          this.onmessage({
            data: {
              protocolVersion: SIMULATION_PROTOCOL_VERSION,
              messageId: 'res-1',
              replyTo: data.messageId,
              kind: 'protocol/handshake-accepted',
              payload: { workerBuildId: 'test', selectedProtocolVersion: SIMULATION_PROTOCOL_VERSION, capabilities: [] }
            }
          } as MessageEvent);
        }
      }, 0);
    }
  });

  constructor(public url: string | URL, public options?: any) {}
}

beforeEach(() => {
  vi.stubGlobal('Worker', MockWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('SimulationClient creates worker and handles communication', async () => {
  const client = new SimulationClient('worker.js');
  
  const responsePromise = new Promise<any>((resolve) => {
    client.addListener((msg) => {
      if (msg.kind === 'protocol/handshake-accepted') resolve(msg);
    });
  });

  client.send({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'msg-1',
    kind: 'protocol/handshake',
    payload: {
      clientBuildId: 'client-1',
      supportedProtocolVersions: [SIMULATION_PROTOCOL_VERSION],
      capabilities: [],
    }
  });

  const response = await responsePromise;
  expect(response.kind).toBe('protocol/handshake-accepted');
  expect(response.payload.workerBuildId).toBe('test');

  client.terminate();
});
