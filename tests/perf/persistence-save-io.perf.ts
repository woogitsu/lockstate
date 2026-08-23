import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbLocalSaveStore, openLockstateDatabase } from '../../src/persistence/local/indexeddb-store';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import type { LocalSaveStore } from '../../src/persistence/local/store';
import { encodeEntityStoreSnapshot } from '../../src/persistence/entity-codec';
import { captureSessionSystems } from '../../src/simulation/runtime/session-systems';
import { NEED_IDS } from '../../src/simulation/prisoners/needs';
import { decodeSaveEnvelope, createSaveEnvelope } from '../../src/persistence/save-schema';
import type { SaveEnvelope } from '../../src/persistence/save-schema';
import { estimateSaveEnvelopeByteSize } from '../../src/persistence/size';
import {
  buildPrisonFixture,
  PRISON_SIZE_TIERS,
  snapshotEnvelope,
  type PrisonFixture,
  type PrisonSizeTier,
} from './fixtures/prison-fixture';
import {
  environmentSummary,
  formatBytes,
  formatMs,
  jsonByteSize,
  measureAsync,
  measureSync,
  renderTable,
  summarize,
  type DurationStats,
} from './measure';

/**
 * Measurement harness for issue #19's open performance requirement:
 * "Measure write/read time and storage size for representative
 * snapshots/generation counts. Dirty tracking/cadence must be justified by
 * measurements before tuning."
 *
 * This file REPORTS numbers; it never asserts one. Per `docs/BENCHMARKING.md`
 * no wall-clock threshold may gate anything until repeated controlled
 * baselines exist, and per `docs/TESTING.md` elapsed time may not prove
 * correctness. Every `expect` below is therefore a correctness invariant
 * (the save round-trips, the retention window holds, sizes are non-zero and
 * grow with payload size), never a duration.
 *
 * It is excluded from `pnpm test` on purpose: run it explicitly with
 *
 *   pnpm exec vitest run --config tests/perf/vitest.perf.config.ts
 *
 * CAVEAT, repeated in the printed output: the IndexedDB numbers come from
 * `fake-indexeddb`, a pure-JS in-process implementation. It performs the
 * structured clone and the transaction bookkeeping but never touches a disk,
 * a browser's storage quota, or a real origin-private file system. Its
 * timings are therefore a LOWER BOUND, not a production estimate — the same
 * caveat `docs/PERSISTENCE.md` already records for its directional numbers.
 */

const PRISON_ID = 'perf-prison';
const GAME_VERSION = 'lockstate-0.0.0';
const DEFAULT_KEEP_GENERATIONS = 3; // PrisonSaveRepository's default window.
const WARMUP_ITERATIONS = 2;
const RECOVERY_SAMPLES = 3;
/** Generation windows swept to show how retention cost scales with generation count. */
const GENERATION_WINDOW_SWEEP: readonly number[] = [1, 2, 3, 5, 10];
/** Tiers included in the generation sweep; running every tier there would multiply runtime for no new signal. */
const SWEEP_TIER_IDS: readonly string[] = ['medium', 'large'];

type StoreKind = 'memory' | 'fake-indexeddb';

interface StoreHandle {
  readonly store: LocalSaveStore;
  readonly dispose: () => void;
}

async function createStore(kind: StoreKind): Promise<StoreHandle> {
  if (kind === 'memory') {
    return { store: new MemoryLocalSaveStore(), dispose: () => undefined };
  }
  // A fresh IDBFactory per store, never the global `/auto` polyfill, exactly
  // as tests/integration/persistence-local-indexeddb.test.ts does.
  const db = await openLockstateDatabase(new IDBFactory());
  return { store: new IndexedDbLocalSaveStore(db), dispose: () => db.close() };
}

interface SizeReport {
  readonly tierId: string;
  readonly loadedChunks: number;
  readonly totalChunks: number;
  readonly buildOrders: number;
  readonly prisoners: number;
  readonly envelopeBytes: number;
  readonly gzippedBytes: number;
  readonly kernelBytes: number;
  readonly worldBytes: number;
  readonly constructionBytes: number;
  readonly entitiesBytes: number;
  /** The same store written in the pre-#50 capacity-shaped V1 form, for the before/after comparison. */
  readonly entitiesCapacityShapedBytes: number;
  readonly entityCapacity: number;
  /** #70's `simulation` section in total, and split by subsystem family. */
  readonly simulationBytes: number;
  readonly simulationPrisonersBytes: number;
  readonly simulationOperationsBytes: number;
  readonly simulationNavigationBytes: number;
  readonly simulationSecurityBytes: number;
  readonly simulationContrabandBytes: number;
  readonly simulationIncidentsBytes: number;
  /**
   * What the same per-prisoner component state would cost written across the
   * store's full allocated `capacity` instead of its allocated prefix -- the
   * capacity-shaped mistake #50 removed from `entities`, measured here so
   * #70 cannot quietly reintroduce it at eighteen times the size.
   */
  readonly simulationPrisonersCapacityShapedBytes: number;
  /** #75/ADR 0015's session-level `identity` section: two short strings plus a key per named actor. */
  readonly identityBytes: number;
  readonly namedActors: number;
  readonly retainedWindowBytes: number;
  readonly retainedGenerations: number;
}

interface TimingReport {
  readonly tierId: string;
  readonly store: StoreKind;
  /** The production autosave path: an envelope this process just built (#49). */
  readonly write: DurationStats;
  /** The import/untrusted path: the same envelope after a serialization round trip, so `save()` re-validates it in full. */
  readonly untrustedWrite: DurationStats;
  readonly read: DurationStats;
  /** Only measured for the IndexedDB store; see `measureRecoveryOnly`. */
  readonly recoveryRead?: DurationStats;
}

interface BuildReport {
  readonly tierId: string;
  readonly snapshotOnly: DurationStats;
  readonly envelopeBuild: DurationStats;
  /** Schema + checksum validation alone — what `save()`/`loadCurrent()` pay on top of storage. */
  readonly decodeOnly: DurationStats;
  /** Raw serialization alone, for attributing cost between JSON work and Zod validation. */
  readonly stringifyOnly: DurationStats;
}

interface SweepReport {
  readonly tierId: string;
  readonly keepGenerations: number;
  readonly write: DurationStats;
  readonly read: DurationStats;
  readonly retainedBytes: number;
  readonly retainedGenerations: number;
}

const sizeReports: SizeReport[] = [];
const timingReports: TimingReport[] = [];
const buildReports: BuildReport[] = [];
const sweepReports: SweepReport[] = [];

async function sumRetainedGenerationBytes(
  store: LocalSaveStore,
  generationIds: readonly string[],
): Promise<number> {
  let total = 0;
  for (const generationId of generationIds) {
    const stored = await store.runTransaction('readonly', (tx) => tx.getGeneration(PRISON_ID, generationId));
    total += jsonByteSize(stored);
  }
  return total;
}

async function corruptCurrentGeneration(store: LocalSaveStore, repository: PrisonSaveRepository): Promise<void> {
  const [metadata] = await repository.list();
  const currentGenerationId = metadata?.currentGenerationId;
  if (currentGenerationId === undefined) throw new Error('Expected a current generation to corrupt.');
  await store.runTransaction('readwrite', async (tx) => {
    await tx.putGeneration(PRISON_ID, currentGenerationId, { corrupted: true });
  });
}

/**
 * The pre-#50 encoding of the same store: `generations`, `freeIndices` and
 * `alive` written across the full allocated capacity. Reconstructed here (not
 * imported) because it is a retired on-disk shape, not production code -- the
 * harness only needs it to report what the change actually removed.
 */
function capacityShapedEntities(fixture: PrisonFixture): unknown {
  const snapshot = fixture.runtime.prisoners.entityStore.getSnapshot();
  return {
    capacity: snapshot.capacity,
    nextAvailableIndex: snapshot.nextAvailableIndex,
    maxActiveIndex: snapshot.maxActiveIndex,
    freeCount: snapshot.freeCount,
    generations: Array.from(snapshot.generations),
    freeIndices: Array.from(snapshot.freeIndices),
    alive: Array.from(snapshot.alive),
  };
}

/**
 * The prisoner component block written at the store's full allocated
 * capacity rather than its allocated prefix. Reconstructed here (never
 * imported) because it is a shape production deliberately does not write --
 * the harness only needs it to report what population-shaping saved.
 */
function capacityShapedPrisonerComponents(fixture: PrisonFixture): unknown {
  const capacity = fixture.runtime.prisoners.entityStore.capacity;
  const pad = (values: ArrayLike<number>): number[] => Array.from({ length: capacity }, (_, index) => values[index] ?? 0);
  const components = fixture.runtime.prisoners;
  return {
    sentenceLengthTicks: pad(components.records.sentenceLengthTicks),
    priorIncidentsAtIntake: pad(components.records.priorIncidentsAtIntake),
    sentenceEndTick: pad(components.records.sentenceEndTick),
    riskTier: pad(components.records.riskTier),
    classificationGroupIndex: pad(components.records.classificationGroupIndex),
    intakeStage: pad(components.records.intakeStage),
    needs: Object.fromEntries(NEED_IDS.map((needId) => [needId, pad(components.needs.levels[needId])])),
    actionIndex: pad(components.currentAction.actionIndex),
    actionPhase: pad(components.currentAction.phase),
    phaseStartedAtTick: pad(components.currentAction.phaseStartedAtTick),
    needFulfilledLastTick: pad(components.currentAction.needFulfilledLastTick),
    tileX: pad(components.position.tileX),
    tileY: pad(components.position.tileY),
  };
}

interface StoreMeasurement {
  readonly timing: TimingReport;
  readonly retainedWindowBytes: number;
  readonly retainedGenerations: number;
}

async function measureStore(fixture: PrisonFixture, kind: StoreKind): Promise<StoreMeasurement> {
  const handle = await createStore(kind);
  try {
    const repository = new PrisonSaveRepository(handle.store, { keepGenerations: DEFAULT_KEEP_GENERATIONS });
    await repository.create({ prisonId: PRISON_ID, gameVersion: GAME_VERSION });

    // These samples are the full production write path, not just the storage
    // call. Since #49 that path no longer re-validates an envelope this
    // process built moments earlier -- `fixture.envelope` came from
    // `createSaveEnvelope`, so `save()` writes it without a redundant third
    // walk of the payload. Warm-ups also carry the window into steady state,
    // where every save prunes an old generation.
    const write = await measureAsync(WARMUP_ITERATIONS, fixture.tier.samples, async () => {
      const result = await repository.save(PRISON_ID, fixture.envelope);
      if (!result.ok) throw new Error(`save() failed: ${result.error.code}`);
    });

    // The other half of that boundary, measured so removing the redundant
    // walk cannot quietly hide the cost of the validation that remains: an
    // envelope of unknown provenance (here, the same content after a
    // serialization round trip) still pays full schema + checksum validation
    // inside `save()`. Serialized once, outside the measured section.
    const untrustedEnvelope = JSON.parse(JSON.stringify(fixture.envelope)) as SaveEnvelope;
    const untrustedWrite = await measureAsync(WARMUP_ITERATIONS, fixture.tier.samples, async () => {
      const result = await repository.save(PRISON_ID, untrustedEnvelope);
      if (!result.ok) throw new Error(`untrusted save() failed: ${result.error.code}`);
    });

    const read = await measureAsync(WARMUP_ITERATIONS, fixture.tier.samples, async () => {
      const result = await repository.loadCurrent(PRISON_ID);
      if (!result.ok) throw new Error(`loadCurrent() failed: ${result.reason}`);
      if (result.outcome !== 'current') throw new Error(`Expected the current generation, got "${result.outcome}".`);
    });

    const [metadata] = await repository.list();
    const generationIds = metadata?.generationIds ?? [];
    const retainedWindowBytes = await sumRetainedGenerationBytes(handle.store, generationIds);

    return {
      timing: { tierId: fixture.tier.id, store: kind, write, untrustedWrite, read },
      retainedWindowBytes,
      retainedGenerations: generationIds.length,
    };
  } finally {
    handle.dispose();
  }
}

/**
 * Worst-case startup: the current generation is corrupt, so `loadCurrent()`
 * validates it, rejects it, validates the previous one, and heals the
 * pointer. Timed by hand rather than through `measureAsync` because only the
 * `loadCurrent()` segment belongs in the sample — the top-up save and the
 * deliberate corruption that set each iteration up do not.
 */
async function measureRecoveryOnly(
  fixture: PrisonFixture,
  kind: StoreKind,
): Promise<DurationStats> {
  const handle = await createStore(kind);
  try {
    const repository = new PrisonSaveRepository(handle.store, { keepGenerations: DEFAULT_KEEP_GENERATIONS });
    await repository.create({ prisonId: PRISON_ID, gameVersion: GAME_VERSION });
    for (let index = 0; index < DEFAULT_KEEP_GENERATIONS; index += 1) {
      const result = await repository.save(PRISON_ID, fixture.envelope);
      if (!result.ok) throw new Error(`save() failed during recovery setup: ${result.error.code}`);
    }

    const samples: number[] = [];
    for (let index = 0; index < RECOVERY_SAMPLES + 1; index += 1) {
      const topUp = await repository.save(PRISON_ID, fixture.envelope);
      if (!topUp.ok) throw new Error(`save() failed during recovery setup: ${topUp.error.code}`);
      await corruptCurrentGeneration(handle.store, repository);

      const started = performance.now();
      const result = await repository.loadCurrent(PRISON_ID);
      const elapsed = performance.now() - started;

      if (!result.ok) throw new Error(`recovery loadCurrent() failed: ${result.reason}`);
      if (result.outcome !== 'recovered-previous') throw new Error(`Expected recovery, got "${result.outcome}".`);
      if (index > 0) samples.push(elapsed); // index 0 is the warm-up
    }

    return summarize(samples);
  } finally {
    handle.dispose();
  }
}

async function measureGenerationWindow(
  fixture: PrisonFixture,
  keepGenerations: number,
): Promise<SweepReport> {
  const handle = await createStore('fake-indexeddb');
  try {
    const repository = new PrisonSaveRepository(handle.store, { keepGenerations });
    await repository.create({ prisonId: PRISON_ID, gameVersion: GAME_VERSION });

    // Fill the window first so measured saves are steady-state (each one
    // writes a generation AND prunes the oldest), not first-write-only.
    const write = await measureAsync(keepGenerations + 1, 3, async () => {
      const result = await repository.save(PRISON_ID, fixture.envelope);
      if (!result.ok) throw new Error(`save() failed: ${result.error.code}`);
    });

    const read = await measureAsync(1, 3, async () => {
      const result = await repository.loadCurrent(PRISON_ID);
      if (!result.ok) throw new Error(`loadCurrent() failed: ${result.reason}`);
    });

    const [metadata] = await repository.list();
    const generationIds = metadata?.generationIds ?? [];

    return {
      tierId: fixture.tier.id,
      keepGenerations,
      write,
      read,
      retainedBytes: await sumRetainedGenerationBytes(handle.store, generationIds),
      retainedGenerations: generationIds.length,
    };
  } finally {
    handle.dispose();
  }
}

describe.each(PRISON_SIZE_TIERS.map((tier) => [tier.id, tier] as const))(
  'persistence save/load measurement — %s prison',
  (_tierId: string, tier: PrisonSizeTier) => {
    let fixture: PrisonFixture;

    beforeAll(() => {
      fixture = buildPrisonFixture(tier);
    });

    it('produces a schema-valid, checksum-verified envelope from the real runtime', () => {
      const decoded = decodeSaveEnvelope(fixture.envelope);
      expect(decoded.ok).toBe(true);
      expect(fixture.envelope.payload.world.chunks.length).toBeGreaterThan(0);
      expect(fixture.envelope.payload.construction.orders.length).toBe(tier.buildOrders);
      expect(fixture.envelope.payload.entities?.capacity).toBeGreaterThan(0);
      // The section this harness exists to size (#70) is really present and
      // really describes this tier's prisoners, so the bytes below are not a
      // measurement of an empty object.
      expect(fixture.envelope.payload.simulation?.prisoners.components.activeLength).toBe(tier.prisoners);
    });

    it('measures serialized storage size per snapshot and across the retained window', async () => {
      const envelopeBytes = estimateSaveEnvelopeByteSize(fixture.envelope);
      const gzippedBytes = gzipSync(Buffer.from(JSON.stringify(fixture.envelope), 'utf8')).byteLength;

      const handle = await createStore('fake-indexeddb');
      let retainedWindowBytes = 0;
      let retainedGenerations = 0;
      try {
        const repository = new PrisonSaveRepository(handle.store, { keepGenerations: DEFAULT_KEEP_GENERATIONS });
        await repository.create({ prisonId: PRISON_ID, gameVersion: GAME_VERSION });
        // One more save than the window keeps, so retention has actually pruned.
        for (let revision = 1; revision <= DEFAULT_KEEP_GENERATIONS + 1; revision += 1) {
          const result = await repository.save(PRISON_ID, fixture.envelope);
          expect(result.ok).toBe(true);
        }
        const [metadata] = await repository.list();
        const generationIds = metadata?.generationIds ?? [];
        retainedGenerations = generationIds.length;
        retainedWindowBytes = await sumRetainedGenerationBytes(handle.store, generationIds);
      } finally {
        handle.dispose();
      }

      sizeReports.push({
        tierId: tier.id,
        loadedChunks: fixture.loadedChunks,
        totalChunks: fixture.totalChunks,
        buildOrders: fixture.buildOrders,
        prisoners: fixture.alivePrisoners,
        envelopeBytes,
        gzippedBytes,
        kernelBytes: jsonByteSize(fixture.envelope.payload.kernel),
        worldBytes: jsonByteSize(fixture.envelope.payload.world),
        constructionBytes: jsonByteSize(fixture.envelope.payload.construction),
        entitiesBytes: jsonByteSize(fixture.envelope.payload.entities),
        entitiesCapacityShapedBytes: jsonByteSize(capacityShapedEntities(fixture)),
        entityCapacity: fixture.runtime.prisoners.entityStore.capacity,
        simulationBytes: jsonByteSize(fixture.envelope.payload.simulation),
        simulationPrisonersBytes: jsonByteSize(fixture.envelope.payload.simulation?.prisoners),
        simulationOperationsBytes: jsonByteSize(fixture.envelope.payload.simulation?.operations),
        simulationNavigationBytes: jsonByteSize(fixture.envelope.payload.simulation?.navigation),
        simulationSecurityBytes: jsonByteSize(fixture.envelope.payload.simulation?.security),
        simulationContrabandBytes: jsonByteSize(fixture.envelope.payload.simulation?.contraband),
        simulationIncidentsBytes: jsonByteSize(fixture.envelope.payload.simulation?.incidents),
        simulationPrisonersCapacityShapedBytes: jsonByteSize(capacityShapedPrisonerComponents(fixture)),
        identityBytes: jsonByteSize(fixture.envelope.payload.identity),
        namedActors: fixture.envelope.payload.identity?.entries.length ?? 0,
        retainedWindowBytes,
        retainedGenerations,
      });

      // Correctness invariants only — never a byte budget.
      expect(envelopeBytes).toBeGreaterThan(0);
      expect(retainedGenerations).toBe(DEFAULT_KEEP_GENERATIONS);
      expect(retainedWindowBytes).toBeGreaterThan(envelopeBytes);
    });

    it('measures snapshot + envelope construction cost on the calling thread', () => {
      const snapshotOnly = measureSync(WARMUP_ITERATIONS, tier.samples, () => {
        fixture.runtime.kernel.snapshot();
        fixture.runtime.world.snapshot();
        fixture.runtime.construction.snapshot();
        fixture.runtime.prisoners.entityStore.getSnapshot();
        // Since #70 this is part of every snapshot the worker answers with,
        // so leaving it out would under-report the cost the sim thread pays.
        captureSessionSystems(fixture.runtime);
      });

      const kernel = fixture.runtime.kernel.snapshot();
      const world = fixture.runtime.world.snapshot();
      const construction = fixture.runtime.construction.snapshot();
      const entities = encodeEntityStoreSnapshot(fixture.runtime.prisoners.entityStore.getSnapshot());
      const simulation = captureSessionSystems(fixture.runtime);

      let built: SaveEnvelope | undefined;
      const envelopeBuild = measureSync(WARMUP_ITERATIONS, tier.samples, (index) => {
        built = createSaveEnvelope({
          gameVersion: GAME_VERSION,
          prisonId: PRISON_ID,
          revision: Math.max(0, index),
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
          kernel,
          world,
          construction,
          entities,
          simulation,
        });
      });

      const decodeOnly = measureSync(WARMUP_ITERATIONS, tier.samples, () => {
        const decoded = decodeSaveEnvelope(fixture.envelope);
        if (!decoded.ok) throw new Error(`decodeSaveEnvelope failed: ${decoded.error.code}`);
      });

      const stringifyOnly = measureSync(WARMUP_ITERATIONS, tier.samples, () => {
        JSON.stringify(fixture.envelope);
      });

      buildReports.push({ tierId: tier.id, snapshotOnly, envelopeBuild, decodeOnly, stringifyOnly });
      expect(built).toBeDefined();
      expect(decodeSaveEnvelope(built).ok).toBe(true);
    });

    it('measures save()/loadCurrent() against the in-memory store', async () => {
      const measurement = await measureStore(fixture, 'memory');
      timingReports.push(measurement.timing);
      expect(measurement.retainedGenerations).toBe(DEFAULT_KEEP_GENERATIONS);
    });

    it('measures save()/loadCurrent() against IndexedDB (fake-indexeddb, lower bound)', async () => {
      const measurement = await measureStore(fixture, 'fake-indexeddb');
      timingReports.push(measurement.timing);
      expect(measurement.retainedGenerations).toBe(DEFAULT_KEEP_GENERATIONS);
    });

    it('round-trips the persisted envelope byte-for-byte through IndexedDB', async () => {
      const handle = await createStore('fake-indexeddb');
      try {
        const repository = new PrisonSaveRepository(handle.store);
        await repository.create({ prisonId: PRISON_ID, gameVersion: GAME_VERSION });
        const saved = await repository.save(PRISON_ID, snapshotEnvelope(fixture.runtime, 7));
        expect(saved.ok).toBe(true);

        const loaded = await repository.loadCurrent(PRISON_ID);
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        expect(loaded.envelope.checksum).toBe(fixture.envelope.checksum);
        expect(estimateSaveEnvelopeByteSize(loaded.envelope)).toBe(
          estimateSaveEnvelopeByteSize(snapshotEnvelope(fixture.runtime, 7)),
        );
      } finally {
        handle.dispose();
      }
    });

    it('measures the corrupt-current-generation recovery read path', async () => {
      const recoveryRead = await measureRecoveryOnly(fixture, 'fake-indexeddb');
      const existing = timingReports.findIndex((row) => row.tierId === tier.id && row.store === 'fake-indexeddb');
      if (existing >= 0) {
        const previous = timingReports[existing];
        if (previous !== undefined) {
          timingReports[existing] = { ...previous, recoveryRead };
        }
      }
      expect(recoveryRead.samples).toBe(RECOVERY_SAMPLES);
    });

    it('measures how write cost and stored bytes scale with the generation window', async () => {
      if (!SWEEP_TIER_IDS.includes(tier.id)) return;
      for (const keepGenerations of GENERATION_WINDOW_SWEEP) {
        const report = await measureGenerationWindow(fixture, keepGenerations);
        sweepReports.push(report);
        expect(report.retainedGenerations).toBe(keepGenerations);
      }
    });
  },
);

describe('reported measurement evidence', () => {
  it('grows monotonically in serialized size with prison size', () => {
    const ordered = PRISON_SIZE_TIERS.map((tier) => sizeReports.find((row) => row.tierId === tier.id));
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      if (previous === undefined || current === undefined) continue;
      expect(current.envelopeBytes).toBeGreaterThan(previous.envelopeBytes);
      expect(current.retainedWindowBytes).toBeGreaterThan(previous.retainedWindowBytes);
    }
  });
});

afterAll(() => {
  const lines: string[] = [];
  lines.push('');
  lines.push('='.repeat(96));
  lines.push('Lockstate persistence measurement harness (issue #19) — REPORT ONLY, no timing assertions');
  lines.push(environmentSummary());
  lines.push(
    'IndexedDB numbers come from fake-indexeddb (in-process, no disk, no quota) and are a LOWER BOUND,',
  );
  lines.push('not a real-browser disk-backed estimate. Memory-store numbers isolate validation/serialization cost.');
  lines.push('='.repeat(96));

  lines.push('');
  lines.push('Serialized storage size per snapshot');
  lines.push(
    renderTable(
      ['tier', 'loaded chunks', 'chunks', 'orders', 'prisoners', 'envelope', 'gzip', 'world', 'construction', 'simulation', 'identity', 'entities', 'kernel', `retained (${DEFAULT_KEEP_GENERATIONS} gens)`],
      sizeReports.map((row) => [
        row.tierId,
        String(row.loadedChunks),
        String(row.totalChunks),
        String(row.buildOrders),
        String(row.prisoners),
        formatBytes(row.envelopeBytes),
        formatBytes(row.gzippedBytes),
        formatBytes(row.worldBytes),
        formatBytes(row.constructionBytes),
        formatBytes(row.simulationBytes),
        formatBytes(row.identityBytes),
        formatBytes(row.entitiesBytes),
        formatBytes(row.kernelBytes),
        formatBytes(row.retainedWindowBytes),
      ]),
    ),
  );

  lines.push('');
  lines.push('#70 `simulation` section, by subsystem family. These tiers populate prisoners and construction only,');
  lines.push('so security/contraband/incidents are near-empty here by construction, not by encoding.');
  lines.push(
    renderTable(
      ['tier', 'prisoners', 'simulation', 'prisoners', 'operations', 'navigation', 'security', 'contraband', 'incidents', 'share of envelope'],
      sizeReports.map((row) => [
        row.tierId,
        String(row.prisoners),
        formatBytes(row.simulationBytes),
        formatBytes(row.simulationPrisonersBytes),
        formatBytes(row.simulationOperationsBytes),
        formatBytes(row.simulationNavigationBytes),
        formatBytes(row.simulationSecurityBytes),
        formatBytes(row.simulationContrabandBytes),
        formatBytes(row.simulationIncidentsBytes),
        `${((row.simulationBytes / row.envelopeBytes) * 100).toFixed(1)}%`,
      ]),
    ),
  );

  lines.push('');
  lines.push('#75/ADR 0015 `identity` section: one entry per named actor (prisoners named at reception, staff at hire).');
  lines.push(
    renderTable(
      ['tier', 'named actors', 'identity', 'bytes per actor', 'share of envelope'],
      sizeReports.map((row) => [
        row.tierId,
        String(row.namedActors),
        formatBytes(row.identityBytes),
        row.namedActors === 0 ? 'n/a' : `${Math.round(row.identityBytes / row.namedActors)} B`,
        `${((row.identityBytes / row.envelopeBytes) * 100).toFixed(1)}%`,
      ]),
    ),
  );

  lines.push('');
  lines.push('Prisoner components: capacity-shaped (the mistake #50 removed from `entities`) vs. the allocated-prefix form #70 writes');
  lines.push(
    renderTable(
      ['tier', 'prisoners', 'allocated capacity', 'components if capacity-shaped', 'components as written', 'ratio'],
      sizeReports.map((row) => [
        row.tierId,
        String(row.prisoners),
        String(row.entityCapacity),
        formatBytes(row.simulationPrisonersCapacityShapedBytes),
        formatBytes(row.simulationPrisonersBytes),
        `${(row.simulationPrisonersCapacityShapedBytes / Math.max(1, row.simulationPrisonersBytes)).toFixed(1)}x`,
      ]),
    ),
  );

  lines.push('');
  lines.push('Entity liveness ledger: capacity-shaped (pre-#50) vs. population-shaped (current)');
  lines.push(
    renderTable(
      ['tier', 'prisoners', 'allocated capacity', 'entities (pre-#50)', 'entities (now)', 'share of envelope (pre-#50)', 'share of envelope (now)'],
      sizeReports.map((row) => [
        row.tierId,
        String(row.prisoners),
        String(row.entityCapacity),
        formatBytes(row.entitiesCapacityShapedBytes),
        formatBytes(row.entitiesBytes),
        `${((row.entitiesCapacityShapedBytes / (row.envelopeBytes - row.entitiesBytes + row.entitiesCapacityShapedBytes)) * 100).toFixed(1)}%`,
        `${((row.entitiesBytes / row.envelopeBytes) * 100).toFixed(1)}%`,
      ]),
    ),
  );

  lines.push('');
  lines.push(
    'Write / read time (ms; median, with p95 and sample count). "save" is the production autosave path (an',
  );
  lines.push(
    'envelope this process just built); "untrusted save" is the import path, still fully re-validated (#49).',
  );
  lines.push(
    renderTable(
      ['tier', 'store', 'save median', 'save p95', 'untrusted save median', 'load median', 'load p95', 'recovery load median', 'n'],
      timingReports.map((row) => [
        row.tierId,
        row.store,
        formatMs(row.write.median),
        formatMs(row.write.p95),
        formatMs(row.untrustedWrite.median),
        formatMs(row.read.median),
        formatMs(row.read.p95),
        row.recoveryRead === undefined ? 'n/a' : formatMs(row.recoveryRead.median),
        String(row.write.samples),
      ]),
    ),
  );

  lines.push('');
  lines.push('Snapshot + envelope construction cost (ms; synchronous, runs on whichever thread owns the sim)');
  lines.push(
    renderTable(
      [
        'tier',
        'subsystem snapshots',
        'createSaveEnvelope',
        'decodeSaveEnvelope',
        'JSON.stringify',
        'snapshot+encode',
        'n',
      ],
      buildReports.map((row) => [
        row.tierId,
        formatMs(row.snapshotOnly.median),
        formatMs(row.envelopeBuild.median),
        formatMs(row.decodeOnly.median),
        formatMs(row.stringifyOnly.median),
        formatMs(row.snapshotOnly.median + row.envelopeBuild.median),
        String(row.snapshotOnly.samples),
      ]),
    ),
  );

  if (sweepReports.length > 0) {
    lines.push('');
    lines.push('Cost vs. generation window (fake-indexeddb, steady state)');
    lines.push(
      renderTable(
        ['tier', 'keepGenerations', 'save median', 'load median', 'retained bytes', 'retained gens'],
        sweepReports.map((row) => [
          row.tierId,
          String(row.keepGenerations),
          formatMs(row.write.median),
          formatMs(row.read.median),
          formatBytes(row.retainedBytes),
          String(row.retainedGenerations),
        ]),
      ),
    );
  }

  lines.push('');
  lines.push('End-to-end autosave cycle (ms; snapshots + createSaveEnvelope + save() against fake-indexeddb)');
  lines.push(
    renderTable(
      ['tier', 'snapshot+encode', 'save()', 'cycle total', 'cycle as % of a 30s interval', 'cycle as % of a 60s interval'],
      buildReports.map((row) => {
        const timing = timingReports.find((entry) => entry.tierId === row.tierId && entry.store === 'fake-indexeddb');
        const encode = row.snapshotOnly.median + row.envelopeBuild.median;
        const write = timing?.write.median ?? Number.NaN;
        const cycle = encode + write;
        return [
          row.tierId,
          formatMs(encode),
          formatMs(write),
          formatMs(cycle),
          `${((cycle / 30_000) * 100).toFixed(2)}%`,
          `${((cycle / 60_000) * 100).toFixed(2)}%`,
        ];
      }),
    ),
  );

  lines.push('');
  lines.push('Raw samples (ms) are retained per measurement; outliers are reported, never discarded.');
  lines.push('='.repeat(96));

  // Written straight to stdout rather than through `console.log`: Vitest's
  // reporter swallows intercepted console output from hooks, and this report
  // is the entire point of the run.
  process.stdout.write(`${lines.join('\n')}\n`);
});
