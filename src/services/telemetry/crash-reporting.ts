import { type CapturedError, type CrashDiagnosticContext, captureError } from './diagnostics';
import type { TelemetryAttributes } from './events';
import type { TelemetryRecordDecision } from './recorder';
import { redactText } from './redaction';

/**
 * The producers. Everything that decides *what a crash report says* lives
 * here; the only thing left outside is the browser event registration that
 * calls in.
 *
 * ## Why the decisions are here and not at the listener
 *
 * The same line ADR 0046 §4 drew for the consent surface, for the same
 * reason. `vitest.config.ts` runs in `node` with no jsdom, so a module that
 * touches the DOM is unreachable from `pnpm test` and can be exercised only
 * by the Playwright suite. A crash reporter whose *rules* -- which event
 * name, which attributes, what happens when the recorder itself throws, how
 * many reports one page load may produce -- lived beside the listener would
 * be a privacy-relevant control with no headless coverage at all. The split
 * is structurally enforced rather than intended:
 * `tests/unit/services-layer-boundaries.test.ts` refuses DOM member access
 * anywhere under `src/services/`, so this file cannot acquire one.
 *
 * What is consequently reachable only from the browser suite: that the two
 * listeners are registered at all, and that a real thrown error reaches
 * `reportUnhandledError`. Everything either of them then decides is headless.
 *
 * ## A crash reporter that can itself crash is worse than none
 *
 * Four properties, in the order they matter:
 *
 * - **It never throws.** Every call into the recorder is wrapped. A
 *   diagnostic that breaks the thing it was diagnosing is a net loss, and a
 *   throw out of an `error` listener is a throw with nowhere left to go.
 * - **It never recurses.** A report already in flight suppresses a nested
 *   one, so a failure *on the reporting path* that arrives back through the
 *   same handler stops at one frame instead of unwinding through the budget.
 *   The `catch` above is what makes the loop impossible; this flag is what
 *   makes it impossible for a future emit path that defers rather than
 *   throwing.
 * - **It is bounded per page load.** `maxReports` caps how much work an error
 *   storm can spend on the main thread. The sink's token bucket bounds what
 *   is *sent*; it does not bound what is *built*, and an admitted-then-
 *   refused envelope still costs two schema parses and two redaction passes
 *   (ADR 0046 §3's stated cost).
 * - **It never blocks and never awaits.** `TelemetryRecorder.record` is an
 *   O(1) enqueue, and nothing here is on the tick or frame path
 *   (`docs/ARCHITECTURE.md`'s services-layer rule).
 *
 * It adds no route around the consent gate. Both producers go through
 * `TelemetryRecorder`, which refuses a category the player has not allowed
 * before an envelope is even built, and the sink's admission gate refuses it
 * a second time.
 *
 * ## Free text, and the one producer that carries none
 *
 * `redactText` blanks seven value shapes and misses an IP address, a
 * player-chosen prison name, an actor name and a non-UUID prison id
 * (ADR 0046's context section). It is a last line of defence, so a producer
 * that can avoid free text entirely should.
 *
 * `reportWorkerLoss` does: its attributes are `area` and `phase`, both drawn
 * from closed sets this module declares, plus -- only where the detection
 * carried a thrown value -- `errorName`, which is the error's *class* rather
 * than its message. No player-supplied string can reach any of the three.
 *
 * `reportUnhandledError` cannot. An error message and a stack are the whole
 * content of a crash report, they are free text by nature, and ADR 0010
 * already accepts them with redaction as the last line. This module does not
 * widen that: it adds no attribute of its own beyond a coarse `area`.
 */

/** Registered in `./events`; a name this file invented would be refused by the recorder and by the sink. */
export const UNHANDLED_ERROR_EVENT = 'diagnostic.unhandled-error';
export const WORKER_TERMINATED_EVENT = 'diagnostic.worker-terminated';

/**
 * Which browser mechanism surfaced the failure. A closed set rather than a
 * caller-supplied string: `area` is the one attribute this producer adds, and
 * an open one would be the seam through which free text arrives.
 */
export type UnhandledErrorSource = 'page-error' | 'page-rejection';

/**
 * Where the worker loss was detected. `boot` is the first construction, which
 * a page can survive with an empty world; `session` is a later one, which
 * leaves a page that had a simulation without one.
 */
export type WorkerLossPhase = 'boot' | 'session';

/** The coarse area every worker-loss report carries. Fixed, not derived from anything. */
const SIMULATION_WORKER_AREA = 'simulation-worker';

/**
 * The slice of `TelemetryRecorder` a producer needs, so a test needs no sink,
 * no transport and no session id to drive one -- and so nothing here can
 * reach `setConsent` or `pump`.
 */
export interface CrashReportRecorder {
  record(name: string, attributes: TelemetryAttributes, now: number): TelemetryRecordDecision;
  recordError(
    name: string,
    error: CapturedError,
    context: CrashDiagnosticContext,
    now: number,
  ): TelemetryRecordDecision;
}

/**
 * Reports one page load may produce before the reporter stops building them.
 *
 * Chosen against the sink's own defaults rather than picked: the token bucket
 * admits 60 events a minute and the queue holds 200, so 20 is comfortably
 * below the point at which a crash storm would start evicting the earliest
 * report -- which is the one most likely to name the original cause.
 */
export const DEFAULT_MAX_CRASH_REPORTS = 20;

export interface CrashReporterOptions {
  readonly recorder: CrashReportRecorder;
  /** Injected: `src/services/` may not read a clock any more than it may read the DOM. */
  readonly now: () => number;
  readonly maxReports?: number;
}

/**
 * Counters, so the reporter's own refusals are observable. Nothing sends
 * them: a diagnostics pipeline that reports its own failures can spam a
 * player about a problem they did not have (`http-transport.ts`'s rule).
 */
export interface CrashReporterStats {
  /** Reports this reporter began building, whether or not the recorder took them. */
  readonly attempted: number;
  /** Reports the recorder accepted. Consent, sampling and admission can all reduce this. */
  readonly recorded: number;
  readonly suppressedOverBudget: number;
  readonly suppressedReentrant: number;
  /** Times the recording path itself threw and was swallowed. Non-zero is a bug in the pipeline, not in the caller. */
  readonly threw: number;
}

export interface CrashReporter {
  reportUnhandledError(raw: unknown, source: UnhandledErrorSource): void;
  /** `raw` is omitted where the detection carries no thrown value, which is the re-entrant session case. */
  reportWorkerLoss(phase: WorkerLossPhase, raw?: unknown): void;
  stats(): CrashReporterStats;
}

/**
 * Attributes for `diagnostic.worker-terminated`, with no free text in them.
 *
 * `errorName` is the error's class -- `SecurityError`, `TypeError`, `Error`
 * -- chosen by the runtime or by the throwing module, never by a player and
 * never derived from player data. It is the one field that distinguishes a
 * worker the browser refused to construct from one that died, which is the
 * whole question this event exists to answer. It is redacted anyway, because
 * `name` is a writable property on any thrown object.
 */
function workerLossAttributes(phase: WorkerLossPhase, raw: unknown, hasError: boolean): TelemetryAttributes {
  return {
    area: SIMULATION_WORKER_AREA,
    phase,
    ...(hasError ? { errorName: redactText(captureError(raw).name) } : {}),
  };
}

export function createCrashReporter(options: CrashReporterOptions): CrashReporter {
  const maxReports = options.maxReports ?? DEFAULT_MAX_CRASH_REPORTS;

  let attempted = 0;
  let recorded = 0;
  let suppressedOverBudget = 0;
  let suppressedReentrant = 0;
  let threw = 0;
  let reporting = false;

  function attempt(emit: (now: number) => TelemetryRecordDecision): void {
    if (reporting) {
      suppressedReentrant += 1;
      return;
    }
    if (attempted >= maxReports) {
      suppressedOverBudget += 1;
      return;
    }

    reporting = true;
    attempted += 1;
    try {
      // `options.now()` is inside the guard on purpose: an injected clock is
      // as capable of throwing as an injected recorder, and a reporter that
      // survives one but not the other is not a reporter that fails safe.
      if (emit(options.now()).accepted) recorded += 1;
    } catch {
      // Deliberately silent. There is no channel left: this runs from an
      // error handler, so re-raising would be the loop, and a console write
      // during a crash storm is its own denial of service.
      threw += 1;
    } finally {
      reporting = false;
    }
  }

  return {
    reportUnhandledError(raw: unknown, source: UnhandledErrorSource): void {
      attempt((now) => options.recorder.recordError(UNHANDLED_ERROR_EVENT, captureError(raw), { area: source }, now));
    },

    reportWorkerLoss(phase: WorkerLossPhase, ...raw: readonly unknown[]): void {
      // Rest rather than an optional parameter so `undefined` passed
      // explicitly is distinguishable from nothing passed: `captureError`
      // maps every non-Error to the same placeholder, and a report claiming
      // an error class that never existed is worse than one carrying none.
      const hasError = raw.length > 0;
      attempt((now) =>
        options.recorder.record(WORKER_TERMINATED_EVENT, workerLossAttributes(phase, raw[0], hasError), now),
      );
    },

    stats(): CrashReporterStats {
      return { attempted, recorded, suppressedOverBudget, suppressedReentrant, threw };
    },
  };
}
