import type { KeyValueStore } from '../../shared/key-value-store';
import { consentGatedTelemetryAdmission } from './admission';
import { TelemetryConsentGate, createTelemetryConsent, saveTelemetryConsent } from './consent';
import {
  type TelemetryConsentDraft,
  inspectStoredTelemetryConsent,
  shouldAskForTelemetryConsent,
} from './consent-flow';
import { createTelemetrySessionId } from './diagnostics';
import { HttpTelemetryTransport } from './http-transport';
import {
  type RawTelemetryIngestionConfig,
  type TelemetryIngestion,
  type TelemetryIngestionRefusal,
  resolveTelemetryIngestion,
  telemetryReleaseIdentity,
} from './ingestion-config';
import { TelemetryRecorder } from './recorder';
import {
  type TelemetryPumpHandle,
  type TelemetryPumpScheduler,
  startTelemetryPump,
} from './pump';
import { BatchingTelemetrySink, type BatchingTelemetrySinkOptions } from './sink';

/**
 * Assembly, in one place, so the composition root joins one thing rather than
 * six — and so the *decision not to assemble* is testable in the default node
 * environment instead of living in `src/main.ts` where no unit test runs.
 *
 * ## Absent configuration is the whole design, not an edge case
 *
 * With no ingestion destination configured — which is every build in this
 * repository today, and every build until somebody deploys a route and sets
 * two variables — this function returns `{ enabled: false }` and constructs
 * **nothing**: no transport, no sink, no recorder, no session id, no consent
 * prompt. There is no disabled-but-present pipeline to be re-enabled by a
 * later bug, and there is nothing on screen asking a player to consent to a
 * collection that cannot happen.
 *
 * That last part is deliberate and is the lesson of ADR 0044: the four
 * `telemetry.consent.*` strings shipped inside the bundle for months while the
 * code that would render them did not, and *"a player downloads the consent
 * prompt for a telemetry system that cannot send"* was the sharpest single
 * statement of what was wrong. Asking for consent that cannot be acted on
 * would recreate it with more steps.
 *
 * ## What it does not decide
 *
 * The scheduler. `startPump` takes one, because `requestIdleCallback` is a
 * browser global and `src/services/` may not reach for one.
 */

export interface TelemetryPipelineOptions {
  readonly ingestion: RawTelemetryIngestionConfig;
  /** `BUILD_IDENTITY.id`: the same string a save envelope and the worker handshake carry. */
  readonly buildVersion: string;
  readonly commit?: string | undefined;
  /** Where the consent decision lives. Outside any prison save (ADR 0010). */
  readonly store: KeyValueStore;
  readonly now: () => number;
  /** Injected so the session id is testable and never comes from a simulation RNG stream. */
  readonly random?: () => number;
  readonly sink?: BatchingTelemetrySinkOptions;
}

export interface TelemetryPipeline {
  readonly recorder: TelemetryRecorder;
  readonly consent: TelemetryConsentGate;
  readonly ingestion: TelemetryIngestion;
  /** True when no valid decision is on record, so the prompt goes up. */
  readonly shouldAskForConsent: boolean;
  /**
   * Records the player's answer: written to storage first, then into the gate
   * the recorder and the sink share.
   *
   * Storage first because a decision that is honoured this session and
   * forgotten by the next is a prompt that reappears forever; the gate second
   * because that is the one that takes effect on the very next event.
   */
  applyConsentDecision(draft: TelemetryConsentDraft): void;
  startPump(schedule: TelemetryPumpScheduler): TelemetryPumpHandle;
}

export type TelemetryPipelineResolution =
  | { readonly enabled: true; readonly pipeline: TelemetryPipeline }
  | { readonly enabled: false; readonly reason: TelemetryIngestionRefusal };

export function createTelemetryPipeline(options: TelemetryPipelineOptions): TelemetryPipelineResolution {
  const resolution = resolveTelemetryIngestion(options.ingestion);
  if (!resolution.configured) return { enabled: false, reason: resolution.reason };

  const { ingestion } = resolution;
  const stored = inspectStoredTelemetryConsent(options.store);
  // Only a decision on the current policy version is carried into the gate. A
  // superseded or unreadable one becomes "no consent", which is also what
  // `isTelemetryAllowed` would independently conclude.
  const consent = new TelemetryConsentGate(stored.status === 'current' ? stored.consent : undefined);

  const sessionId = createTelemetrySessionId(options.random ?? Math.random);
  let eventCounter = 0;

  const sink = new BatchingTelemetrySink(
    new HttpTelemetryTransport(ingestion),
    consentGatedTelemetryAdmission({ consent }),
    options.sink ?? {},
  );

  const recorder = new TelemetryRecorder({
    sink,
    release: telemetryReleaseIdentity(options.buildVersion, ingestion.environment, options.commit),
    sessionId,
    // Session-scoped and monotonic rather than random: two events in one
    // session are distinguishable, and nothing across sessions is, which is
    // the same property the session id itself is chosen for.
    newEventId: () => `${sessionId}-${(eventCounter += 1)}`,
    consent,
  });

  return {
    enabled: true,
    pipeline: {
      recorder,
      consent,
      ingestion,
      shouldAskForConsent: shouldAskForTelemetryConsent(stored),
      applyConsentDecision(draft: TelemetryConsentDraft): void {
        const decided = createTelemetryConsent(options.now(), draft);
        saveTelemetryConsent(options.store, decided);
        recorder.setConsent(decided);
      },
      startPump(schedule: TelemetryPumpScheduler): TelemetryPumpHandle {
        return startTelemetryPump({ target: recorder, schedule, now: options.now });
      },
    },
  };
}
