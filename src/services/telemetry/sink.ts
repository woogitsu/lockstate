import type { TelemetryEnvelope } from './events';

/**
 * Transport boundary. No transport implementation ships in this issue: an
 * ingestion endpoint is a deployment decision, and inventing one here
 * would ship a URL nobody reviewed. `MemoryTelemetryTransport` covers
 * tests and development.
 */
export interface TelemetryTransport {
  send(batch: readonly TelemetryEnvelope[]): Promise<void>;
}

export class MemoryTelemetryTransport implements TelemetryTransport {
  private readonly batches: TelemetryEnvelope[][] = [];

  public constructor(private readonly failNext: () => boolean = () => false) {}

  public async send(batch: readonly TelemetryEnvelope[]): Promise<void> {
    if (this.failNext()) throw new Error('Telemetry transport failed.');
    this.batches.push([...batch]);
  }

  public sentBatches(): readonly (readonly TelemetryEnvelope[])[] {
    return this.batches;
  }

  public sentEvents(): readonly TelemetryEnvelope[] {
    return this.batches.flat();
  }
}

export type TelemetryRecordOutcome = 'queued' | 'rate-limited' | 'queue-full';

export interface TelemetrySinkStats {
  readonly queued: number;
  readonly sent: number;
  readonly droppedQueueFull: number;
  readonly droppedRateLimited: number;
  readonly failedBatches: number;
  readonly lastFlushAt: number | undefined;
}

export interface BatchingTelemetrySinkOptions {
  readonly maxBatchSize?: number;
  readonly flushIntervalMs?: number;
  readonly maxQueueLength?: number;
  /** Token bucket: at most `maxEvents` accepted per `windowMs`. */
  readonly rateLimit?: { readonly maxEvents: number; readonly windowMs: number };
}

const DEFAULT_MAX_BATCH_SIZE = 20;
const DEFAULT_FLUSH_INTERVAL_MS = 30_000;
const DEFAULT_MAX_QUEUE_LENGTH = 200;
const DEFAULT_RATE_LIMIT = { maxEvents: 60, windowMs: 60_000 } as const;

/**
 * Batched, rate-limited, bounded and *timer-free*: the sink never
 * schedules anything itself. The host calls `pump(now)` from its own idle
 * or interval orchestration, so telemetry can never install work on the
 * simulation tick or render frame path, and every test is deterministic
 * without fake timers.
 *
 * `record()` is O(1), never awaits and never throws into its caller --
 * losing a diagnostic must never break the thing it was diagnosing.
 */
export class BatchingTelemetrySink {
  private readonly queue: TelemetryEnvelope[] = [];
  private readonly options: Required<Omit<BatchingTelemetrySinkOptions, 'rateLimit'>> & {
    readonly rateLimit: { readonly maxEvents: number; readonly windowMs: number };
  };
  private windowStartedAt = 0;
  private oldestQueuedAt: number | undefined;
  private windowCount = 0;
  private sent = 0;
  private droppedQueueFull = 0;
  private droppedRateLimited = 0;
  private failedBatches = 0;
  private lastFlushAt: number | undefined;
  private flushing: Promise<void> | undefined;

  public constructor(private readonly transport: TelemetryTransport, options: BatchingTelemetrySinkOptions = {}) {
    this.options = {
      maxBatchSize: options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE,
      flushIntervalMs: options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
      maxQueueLength: options.maxQueueLength ?? DEFAULT_MAX_QUEUE_LENGTH,
      rateLimit: options.rateLimit ?? DEFAULT_RATE_LIMIT,
    };
  }

  public record(envelope: TelemetryEnvelope, now: number): TelemetryRecordOutcome {
    if (now - this.windowStartedAt >= this.options.rateLimit.windowMs) {
      this.windowStartedAt = now;
      this.windowCount = 0;
    }
    if (this.windowCount >= this.options.rateLimit.maxEvents) {
      this.droppedRateLimited += 1;
      return 'rate-limited';
    }
    this.windowCount += 1;

    if (this.queue.length === 0) this.oldestQueuedAt = now;

    if (this.queue.length >= this.options.maxQueueLength) {
      // Drop the *oldest*: during a crash storm the newest events describe
      // the current failure, while the oldest are already superseded.
      this.queue.shift();
      this.droppedQueueFull += 1;
      this.queue.push(envelope);
      return 'queue-full';
    }

    this.queue.push(envelope);
    return 'queued';
  }

  /**
   * True when a flush is due: the batch is full, or the oldest queued
   * event has waited out the flush interval. Measured from when the event
   * was *queued* rather than from the last flush, so a single event in a
   * fresh sink is not instantly "overdue".
   */
  public shouldFlush(now: number): boolean {
    if (this.queue.length === 0) return false;
    if (this.queue.length >= this.options.maxBatchSize) return true;
    return this.oldestQueuedAt !== undefined && now - this.oldestQueuedAt >= this.options.flushIntervalMs;
  }

  /** Host-driven pump; flushes only when due. Never rejects. */
  public async pump(now: number): Promise<void> {
    if (!this.shouldFlush(now)) return;
    await this.flush(now);
  }

  /**
   * Sends at most one batch. A failed batch is dropped rather than
   * retried: retrying diagnostics forever costs the player bandwidth and
   * battery for data that has already been superseded, and an unbounded
   * retry queue is exactly the leak `maxQueueLength` exists to prevent.
   */
  public async flush(now: number): Promise<void> {
    if (this.flushing !== undefined) return this.flushing;
    if (this.queue.length === 0) {
      this.lastFlushAt = now;
      return;
    }

    const batch = this.queue.splice(0, this.options.maxBatchSize);
    this.oldestQueuedAt = this.queue.length === 0 ? undefined : now;
    const attempt = (async (): Promise<void> => {
      try {
        await this.transport.send(batch);
        this.sent += batch.length;
      } catch {
        this.failedBatches += 1;
      } finally {
        this.lastFlushAt = now;
        this.flushing = undefined;
      }
    })();
    this.flushing = attempt;
    return attempt;
  }

  public stats(): TelemetrySinkStats {
    return {
      queued: this.queue.length,
      sent: this.sent,
      droppedQueueFull: this.droppedQueueFull,
      droppedRateLimited: this.droppedRateLimited,
      failedBatches: this.failedBatches,
      lastFlushAt: this.lastFlushAt,
    };
  }
}
