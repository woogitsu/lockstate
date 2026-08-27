import type { TelemetryEnvelope } from './events';
import type { TelemetryIngestion } from './ingestion-config';
import type { TelemetryTransport } from './sink';

/**
 * The one module in `src/services/` that leaves the device.
 *
 * It is listed by name in `tests/unit/services-layer-boundaries.test.ts`'s
 * `MODULES_PERFORMING_IO`, which was deliberately empty until this file
 * existed. That gate's own comment says why the entry is the point: *"Wiring
 * the first telemetry send or entitlement read is a real milestone … and it
 * should require writing down that the layer now leaves the device, not just
 * adding a call."* This is the writing down. Nothing else in the layer is
 * allow-listed, and this file does nothing but send, so the allow-list stays
 * one module wide.
 *
 * ## What it will not do
 *
 * - **It holds no destination of its own.** The path comes from
 *   `TelemetryIngestion`, which `./ingestion-config` will only produce from
 *   deployment configuration, and which refuses anything that is not
 *   same-origin. There is no default, no fallback host and no URL in this
 *   file.
 * - **It sends no credentials.** `credentials: 'omit'` and `mode:
 *   'same-origin'`. Telemetry carries no account identifier by design
 *   (ADR 0010), and a cookie attached by the browser would undo that on the
 *   wire without a single line of this repository saying so.
 * - **It never retries.** A failed batch is the sink's to drop
 *   (`BatchingTelemetrySink.flush`), and an unbounded retry queue is exactly
 *   the leak `maxQueueLength` exists to prevent.
 * - **It never waits forever.** `BatchingTelemetrySink.flush` returns the
 *   in-flight promise while one is outstanding, so a `fetch` that never
 *   settles would wedge the queue permanently. The abort deadline is what
 *   stops a hung network from being a permanent telemetry outage — and,
 *   because the queue is bounded and drops oldest-first, a permanent one that
 *   also loses the newest events.
 *
 * ## Failure is silent, and that is the contract
 *
 * `send` rejects on anything that is not a 2xx, and the sink catches it,
 * counts a failed batch and drops it. Nothing reaches a `console`, a HUD
 * notice or the player: ADR 0008's T11 is that a trusted-service call must
 * never affect playability, and a diagnostics pipeline that reports its own
 * failures is a diagnostics pipeline that can spam a player about a problem
 * they did not have.
 */

export const DEFAULT_TELEMETRY_REQUEST_TIMEOUT_MS = 10_000;

export interface HttpTelemetryTransportOptions {
  readonly timeoutMs?: number;
}

export class HttpTelemetryTransport implements TelemetryTransport {
  private readonly timeoutMs: number;

  public constructor(
    private readonly ingestion: TelemetryIngestion,
    options: HttpTelemetryTransportOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TELEMETRY_REQUEST_TIMEOUT_MS;
  }

  public async send(batch: readonly TelemetryEnvelope[]): Promise<void> {
    // An empty batch is not a request. The sink never produces one, and
    // sending it anyway would put a periodic beacon on the network for a
    // player who has consented to nothing being collected.
    if (batch.length === 0) return;

    const response = await fetch(this.ingestion.path, {
      method: 'POST',
      mode: 'same-origin',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ environment: this.ingestion.environment, events: batch }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      // The status and nothing else. A response body from an endpoint this
      // client does not control has no business being read, let alone logged.
      throw new Error(`Telemetry ingestion refused the batch (${response.status}).`);
    }
  }
}
