import { decodeWorkerToMainMessage } from '../protocol/decode';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../protocol/types';

export type WorkerMessageHandler = (message: WorkerToMainMessage) => void;

export class SimulationClient {
  private readonly worker: Worker;
  private readonly listeners = new Set<WorkerMessageHandler>();
  
  public constructor(workerUrl: string | URL) {
    this.worker = new Worker(workerUrl, { type: 'module' });
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

  private handleMessage(event: MessageEvent): void {
    const result = decodeWorkerToMainMessage(event.data);
    
    if (result.ok) {
      for (const listener of this.listeners) {
        listener(result.value);
      }
    } else {
      console.error('Main thread failed to decode worker message:', result.error);
    }
  }
}
