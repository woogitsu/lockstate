import { decodeWorkerToMainMessage } from '../protocol/decode';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../protocol/types';

export type WorkerMessageHandler = (message: WorkerToMainMessage) => void;

export class SimulationClient {
  private readonly worker: Worker;
  private readonly listeners = new Set<WorkerMessageHandler>();

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
