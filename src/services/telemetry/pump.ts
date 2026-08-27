/**
 * The host-driven pump `BatchingTelemetrySink` was written to expect and
 * nothing ever supplied.
 *
 * `sink.ts` is deliberately timer-free -- "the host calls `pump(now)` from its
 * own idle or interval orchestration" -- and no host existed, so no flush ever
 * happened anywhere in the repository. This is that orchestration, with the
 * browser primitive injected rather than reached for.
 *
 * ## Why the scheduler is a parameter
 *
 * `requestIdleCallback` is the right primitive and it is a browser global, so
 * a module that called it would be untestable in the default `node` Vitest
 * environment and would put an ambient global inside `src/services/` besides.
 * The composition root passes one in; this file owns the *loop*, which is the
 * part with rules worth asserting:
 *
 * - **Never concurrent.** The next tick is scheduled only after the previous
 *   `pump` settles. Overlapping pumps would let two flushes race for one
 *   queue, and `BatchingTelemetrySink.flush` already de-duplicates
 *   concurrent flushes by returning the in-flight promise -- so an
 *   overlapping pump would spin rather than send.
 * - **Never fatal.** A rejected pump stops nothing. Losing a diagnostic must
 *   not break the thing it was diagnosing, and that has to hold for the loop
 *   as well as for `record()`.
 * - **Stoppable.** `stop()` cancels the pending tick and prevents re-arming,
 *   including from inside a pump that is already running.
 *
 * ## Why not a frame callback, and why not on unload
 *
 * Not `requestAnimationFrame`: ADR 0010 and ADR 0008's T11 both say no
 * trusted-service work sits on the frame or tick path, and an idle callback is
 * the one browser scheduling primitive that promises it will not.
 *
 * Nothing flushes on `pagehide`. Whatever is queued when the tab goes away is
 * lost, bounded by the sink's flush interval, and that is the deliberate
 * choice: a `keepalive` send fired during unload is the shape that most often
 * turns "diagnostics" into "tracking", and the events being dropped are
 * aggregates nobody is waiting on. It is written down here rather than left as
 * an omission because it is the first thing a reader will want to add.
 */

/** Cancels a scheduled tick. Idempotent. */
export type CancelScheduledPump = () => void;

/**
 * Schedules `run` to happen no sooner than `delayMs` from now, preferably when
 * the host is idle. Returns its own canceller.
 */
export type TelemetryPumpScheduler = (run: () => void, delayMs: number) => CancelScheduledPump;

export interface TelemetryPumpTarget {
  pump(now: number): Promise<void>;
}

export interface TelemetryPumpOptions {
  readonly target: TelemetryPumpTarget;
  readonly schedule: TelemetryPumpScheduler;
  readonly now: () => number;
  /**
   * How often the loop looks. Not the flush interval: the sink decides whether
   * a flush is due (`shouldFlush`), and this only decides how often it is
   * asked. Shorter than the sink's flush interval on purpose, so a batch that
   * comes due is not held for a whole extra period.
   */
  readonly intervalMs?: number;
}

export const DEFAULT_TELEMETRY_PUMP_INTERVAL_MS = 5_000;

export interface TelemetryPumpHandle {
  stop(): void;
}

export function startTelemetryPump(options: TelemetryPumpOptions): TelemetryPumpHandle {
  const intervalMs = options.intervalMs ?? DEFAULT_TELEMETRY_PUMP_INTERVAL_MS;
  let stopped = false;
  let cancel: CancelScheduledPump | undefined;

  const arm = (): void => {
    if (stopped) return;
    cancel = options.schedule(() => {
      cancel = undefined;
      if (stopped) return;
      void run();
    }, intervalMs);
  };

  const run = async (): Promise<void> => {
    try {
      await options.target.pump(options.now());
    } catch {
      // A pump that threw is a pump that did not send. It is not a reason to
      // stop pumping, and it is certainly not a reason to surface an error to
      // a player who is mid-game.
    }
    arm();
  };

  arm();

  return {
    stop(): void {
      stopped = true;
      cancel?.();
      cancel = undefined;
    },
  };
}
