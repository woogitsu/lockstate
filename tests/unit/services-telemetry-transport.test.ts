import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { telemetryEnvironment, telemetryIngestPath } from '../../tooling/telemetry-config.mjs';
import type { KeyValueStore } from '../../src/shared/key-value-store';
import {
  HttpTelemetryTransport,
  TelemetryConsentGate,
  consentGatedTelemetryAdmission,
  BatchingTelemetrySink,
  createTelemetryConsent,
  createTelemetryPipeline,
  resolveTelemetryIngestion,
  telemetryReleaseIdentity,
  TELEMETRY_ENVIRONMENTS,
} from '../../src/services/telemetry';

/**
 * The transport, and the state it is in on every build that exists today:
 * absent.
 *
 * `src/services/telemetry/sink.ts` has always refused to name a destination --
 * *"an ingestion endpoint is a deployment decision, and inventing one here
 * would ship a URL nobody reviewed"* -- and that has not changed. What changed
 * is that there is now a transport for a destination *deployment
 * configuration* supplies, and the interesting property is what happens when
 * it supplies none. That is the default, it is what this repository ships, and
 * it is what most of this file is about.
 */

const NOW = 1_700_000_000_000;

class MemoryStore implements KeyValueStore {
  private readonly entries = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

function pipelineOptions(ingestion: { path?: string; environment?: string }, store = new MemoryStore()) {
  return {
    ingestion,
    buildVersion: 'lockstate-0.0.1-abcdefg',
    store,
    now: () => NOW,
    random: () => 0.5,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('an absent ingestion destination is the default and reaches the network never', () => {
  it.each([
    ['nothing configured at all', {}],
    ['both values empty', { path: '', environment: '' }],
    ['a path of whitespace', { path: '   ', environment: 'production' }],
    ['an environment with no destination', { path: '', environment: 'production' }],
  ])('resolves %s to absent', (_case, raw) => {
    expect(resolveTelemetryIngestion(raw)).toEqual({ configured: false, reason: 'absent' });
  });

  it('builds no pipeline, and therefore no transport, sink, recorder or session id', () => {
    const resolution = createTelemetryPipeline(pipelineOptions({}));
    expect(resolution).toEqual({ enabled: false, reason: 'absent' });
    // `enabled: false` carries no `pipeline` property at all, so there is
    // nothing to re-enable by accident later. Checked structurally rather than
    // by reading a field the type says is absent.
    expect(Object.hasOwn(resolution, 'pipeline')).toBe(false);
  });

  it('calls fetch zero times while an absent-configuration pipeline is built and a consent decision is stored', () => {
    // The assertion that matters, made against the real global the transport
    // calls. A stub that throws rather than a no-op: a single reach for the
    // network on this path should fail loudly, not be counted.
    const fetchSpy = vi.fn(() => {
      throw new Error('the absent-configuration path reached the network');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const store = new MemoryStore();
    expect(createTelemetryPipeline(pipelineOptions({}, store)).enabled).toBe(false);
    // Nothing was returned to record a decision with, so nothing can.
    expect(store.getItem('lockstate.telemetry.consent')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reaches the network on the configured path, so the assertion above is not vacuous', async () => {
    // The positive control. Without it, "fetch was never called" would hold
    // just as well for a build in which the transport was broken outright.
    const fetchSpy = vi.fn(async (_input: unknown, _init?: unknown) => new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchSpy);

    const resolution = createTelemetryPipeline(
      pipelineOptions({ path: '/api/telemetry', environment: 'production' }),
    );
    expect(resolution.enabled).toBe(true);
    if (!resolution.enabled) return;

    resolution.pipeline.applyConsentDecision({ diagnostics: true, performance: false, gameplay: false });
    const decision = resolution.pipeline.recorder.record('diagnostic.unhandled-error', { area: 'renderer' }, NOW);
    expect(decision.accepted).toBe(true);

    await resolution.pipeline.recorder.pump(NOW + 60_000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('/api/telemetry');
  });

  it('is the state this repository is actually in: the build defines resolve to absent', () => {
    // End to end over the real resolvers `vite.config.ts` calls, not a
    // fixture. With neither variable set -- which is every workflow in
    // `.github/workflows/` -- the two defines are empty strings and the
    // resolver refuses them.
    expect(resolveTelemetryIngestion({ path: telemetryIngestPath(), environment: telemetryEnvironment() })).toEqual({
      configured: false,
      reason: 'absent',
    });
  });

  it('is not configured by any workflow in this repository', () => {
    // The other half of the claim above: the defines are absent because
    // nothing sets them, not because this process happens not to. If a
    // deployment starts setting them, this fails -- which is correct, and the
    // moment the ingestion side's obligations become live rather than
    // documented.
    const workflows = join(__dirname, '../../.github/workflows');
    const files = readdirSync(workflows).filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'));
    expect(files.length, 'no workflows were scanned; this would pass vacuously').toBeGreaterThan(0);

    const setting = files.filter((file) => {
      const source = readFileSync(join(workflows, file), 'utf8');
      return source.includes('LOCKSTATE_TELEMETRY_INGEST_PATH') || source.includes('LOCKSTATE_TELEMETRY_ENVIRONMENT');
    });
    expect(
      setting,
      'a workflow now configures a telemetry ingestion destination. That is a deployment milestone: the route it names has to exist and to meet what the telemetry pipeline ADR says the ingestion side must do (retention, an unauthenticated-write review against ADR 0008 section 3, and a lawful basis recorded somewhere). Update this test in the same change',
    ).toEqual([]);
  });
});

describe('a destination that would leave the origin is refused rather than attempted', () => {
  it.each([
    ['an https URL', 'https://telemetry.example.test/ingest', 'not-same-origin'],
    ['a protocol-relative reference', '//telemetry.example.test/ingest', 'not-same-origin'],
    ['a bare host', 'telemetry.example.test/ingest', 'malformed-path'],
    ['a relative path', 'api/telemetry', 'malformed-path'],
    ['a path with a query string', '/api/telemetry?key=abc', 'malformed-path'],
    ['a path with a fragment', '/api/telemetry#x', 'malformed-path'],
    ['a traversal', '/api/../../etc/passwd', 'malformed-path'],
    ['a path with whitespace inside it', '/api/tele metry', 'malformed-path'],
  ])('refuses %s', (_case, path, reason) => {
    expect(resolveTelemetryIngestion({ path, environment: 'production' })).toEqual({ configured: false, reason });
  });

  it('is what keeps connect-src \'self\' intact, and public/_headers still says it', () => {
    // The refusal above is not a style preference. `public/_headers` sets
    // `connect-src 'self'`, so a cross-origin destination would be blocked by
    // the browser at send time -- and "fix" it by widening a security header
    // (ADR 0021). Refusing it here means no `_headers` change was needed for
    // this pipeline, and this assertion is what makes that a checked fact.
    const headers = readFileSync(join(__dirname, '../../public/_headers'), 'utf8');
    expect(headers).toContain("connect-src 'self'");
  });

  it('refuses a destination whose environment is missing or unknown', () => {
    // `ReleaseIdentity.environment` is on every envelope and cannot be
    // inferred in a browser. Guessing `production` would mislabel every
    // staging crash.
    for (const environment of [undefined, '', 'prod', 'PRODUCTION', 'test']) {
      expect(
        resolveTelemetryIngestion({ path: '/api/telemetry', ...(environment === undefined ? {} : { environment }) }),
        `${String(environment)} was accepted as an environment`,
      ).toEqual({ configured: false, reason: 'unknown-environment' });
    }
  });

  it('accepts each environment the release schema declares', () => {
    // Enumerated, so an environment added to the schema and not to the
    // resolver fails here rather than at a deployment.
    for (const environment of TELEMETRY_ENVIRONMENTS) {
      expect(resolveTelemetryIngestion({ path: '/api/telemetry', environment })).toEqual({
        configured: true,
        ingestion: { path: '/api/telemetry', environment },
      });
    }
  });

  it('omits the commit rather than stamping an empty one', () => {
    // `identifierSchema` rejects an empty string, and a build with no `.git`
    // yields `unknown` rather than nothing (`src/shared/build-identity.ts`).
    expect(telemetryReleaseIdentity('lockstate-0.0.1-abcdefg', 'staging')).toEqual({
      buildVersion: 'lockstate-0.0.1-abcdefg',
      environment: 'staging',
    });
    expect(telemetryReleaseIdentity('lockstate-0.0.1-abcdefg', 'staging', '')).toEqual({
      buildVersion: 'lockstate-0.0.1-abcdefg',
      environment: 'staging',
    });
  });
});

describe('the send itself is asynchronous, failable and optional', () => {
  const ingestion = { path: '/api/telemetry', environment: 'production' } as const;

  function envelopes() {
    const gate = new TelemetryConsentGate(
      createTelemetryConsent(NOW, { diagnostics: true, performance: true, gameplay: true }),
    );
    const resolution = createTelemetryPipeline(pipelineOptions(ingestion));
    if (!resolution.enabled) throw new Error('fixture pipeline was not configured');
    resolution.pipeline.consent.set(gate.current());
    const decision = resolution.pipeline.recorder.record('diagnostic.unhandled-error', { area: 'renderer' }, NOW);
    if (!decision.accepted) throw new Error(`fixture event was rejected: ${decision.reason}`);
    return [decision.envelope];
  }

  it('posts the batch without cookies, without following a redirect and with a deadline', async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);

    await new HttpTelemetryTransport(ingestion).send(envelopes());

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/telemetry');
    expect(init.method).toBe('POST');
    expect(init.credentials, 'a cookie would attach an identity telemetry is designed not to carry').toBe('omit');
    expect(init.mode).toBe('same-origin');
    expect(init.redirect, 'a redirect could take the batch off-origin').toBe('error');
    expect(init.signal, 'a fetch that never settles would wedge the queue permanently').toBeDefined();
    expect(JSON.parse(String(init.body))).toMatchObject({ environment: 'production' });
  });

  it('sends nothing at all for an empty batch', () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);

    void new HttpTelemetryTransport(ingestion).send([]);
    expect(fetchSpy, 'an empty batch would be a periodic beacon for a player collecting nothing').not.toHaveBeenCalled();
  });

  it('rejects on a refusal, and the sink turns that into a dropped batch rather than a throw', async () => {
    const fetchSpy = vi.fn(async () => new Response('go away', { status: 503 }));
    vi.stubGlobal('fetch', fetchSpy);

    const transport = new HttpTelemetryTransport(ingestion);
    await expect(transport.send(envelopes())).rejects.toThrow(/503/);

    const gate = new TelemetryConsentGate(
      createTelemetryConsent(NOW, { diagnostics: true, performance: true, gameplay: true }),
    );
    const sink = new BatchingTelemetrySink(transport, consentGatedTelemetryAdmission({ consent: gate }), {
      maxBatchSize: 1,
    });
    expect(sink.record(envelopes()[0]!, NOW)).toBe('queued');
    await expect(sink.flush(NOW)).resolves.toBeUndefined();
    expect(sink.stats()).toMatchObject({ failedBatches: 1, sent: 0, queued: 0 });
  });

  it('rejects rather than hanging when the network throws, and drops that too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const transport = new HttpTelemetryTransport(ingestion);
    await expect(transport.send(envelopes())).rejects.toThrow(/Failed to fetch/);

    const gate = new TelemetryConsentGate(
      createTelemetryConsent(NOW, { diagnostics: true, performance: true, gameplay: true }),
    );
    const sink = new BatchingTelemetrySink(transport, consentGatedTelemetryAdmission({ consent: gate }), {
      maxBatchSize: 1,
    });
    sink.record(envelopes()[0]!, NOW);
    await expect(sink.flush(NOW)).resolves.toBeUndefined();
    expect(sink.stats().failedBatches).toBe(1);
  });

  it('carries no account identifier, auth token or save fragment in what it posts', () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);

    void new HttpTelemetryTransport(ingestion).send(envelopes());
    const body = String((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body).toLowerCase();
    for (const forbidden of ['accountid', 'authorization', 'bearer', 'access_token', 'savedata', 'prisonid']) {
      expect(body, `${forbidden} reached the wire`).not.toContain(forbidden);
    }
  });
});
