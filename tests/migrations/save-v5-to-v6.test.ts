import { describe, expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import {
  migrateSaveEnvelopeV1ToV2,
  migrateSaveEnvelopeV2ToV3,
  migrateSaveEnvelopeV3ToV4,
  migrateSaveEnvelopeV4ToV5,
  migrateSaveEnvelopeV5ToV6,
} from '../../src/persistence/save-migrations';
import {
  SAVE_SCHEMA_VERSION,
  decodeSaveEnvelope,
  type SaveEnvelopeV1,
  type SaveEnvelopeV5,
} from '../../src/persistence/save-schema';
import {
  ACTION_CATEGORIES,
  DEFAULT_REGIME_SCHEDULES,
  GENERAL_POPULATION_REGIME,
  HIGH_RISK_REGIME,
  type ActionCategory,
  type RegimeBlock,
  type RegimeSchedule,
} from '../../src/simulation/prisoners/regime';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import type { JsonValue } from '../../src/shared/json';
import freshPrisonFixture from '../fixtures/persistence/save-v1-fresh-prison.json';
import inProgressFixture from '../fixtures/persistence/save-v1-in-progress.json';

/**
 * Save-schema V5 -> V6
 * ([ADR 0113](../../docs/adr/0113-how-a-regime-is-edited-and-whose-day-it-is.md)
 * §2): `simulation` gains a **required** `regimeSchedules` section.
 *
 * ## Why this migration has nothing to guess, verified rather than cited
 *
 * ADR 0113's claim is that every V5 save was written by a session running
 * exactly `DEFAULT_REGIME_SCHEDULES`, because that array is a module constant
 * no production call site has ever overridden and no V5 payload recorded a
 * schedule at all. The first test below **re-measures the load-bearing half of
 * that premise on this tree** rather than repeating it: it reads the two rows
 * a real captured V6 session writes and compares them against the two authored
 * constants by value. If a future change gave a new session a different
 * starting timetable, that assertion fails and this file's argument is known to
 * have expired -- which is the point of measuring a premise instead of citing
 * it, and is the shape `save-v4-to-v5.test.ts` uses for the same purpose.
 *
 * ## The two provenances of a V5 save under test
 *
 * - **The checked-in V1 fixtures, walked forward by the four frozen steps.**
 *   They carry no `simulation` section at all, which is the case this migration
 *   must leave completely alone, and it keeps `git diff -- tests/fixtures/`
 *   empty.
 * - **A real captured session, with the new section taken back off.** A V5
 *   payload and a V6 payload differ in exactly that one key, so a current
 *   capture with it removed is the byte shape a V5 build wrote.
 */

/**
 * The authored constants with each block's categories put into
 * `ACTION_CATEGORIES` order, which is the one normalisation the persisted form
 * applies (`RegimeScheduleRegistry`).
 *
 * Written here from `ACTION_CATEGORIES` -- a data constant -- rather than
 * obtained from the registry, so the expected side of every comparison below
 * is not produced by the code under test. `GENERAL_POPULATION_REGIME`'s block
 * at tick 2,100 is the one authored out of that order, so this is not a no-op
 * dressed up as a precaution.
 */
function asPersisted(schedule: RegimeSchedule): unknown {
  return {
    classificationGroupId: schedule.classificationGroupId,
    blocks: schedule.blocks.map((block: RegimeBlock) => ({
      startTickOfDay: block.startTickOfDay,
      endTickOfDay: block.endTickOfDay,
      allowedCategories: ACTION_CATEGORIES.filter((category: ActionCategory) => block.allowedCategories.includes(category)),
    })),
  };
}

const EXPECTED_ROWS = [asPersisted(GENERAL_POPULATION_REGIME), asPersisted(HIGH_RISK_REGIME)];

/** A structured clone through JSON -- how a save actually reaches `decodeSaveEnvelope` from storage. */
function throughStorage<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function v5EnvelopeFromV1(fixture: unknown): SaveEnvelopeV5 {
  return migrateSaveEnvelopeV4ToV5(
    migrateSaveEnvelopeV3ToV4(migrateSaveEnvelopeV2ToV3(migrateSaveEnvelopeV1ToV2(fixture as SaveEnvelopeV1))),
  );
}

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

/**
 * A genuine V5 envelope holding real subsystem state, built by capturing a
 * current session and removing the keys V6 added: `regimeSchedules`, which is
 * why V6 exists, and `inFlight` (issue #1373), an optional V6 section no V5
 * build wrote. (This comment said *"the one key V6 added"* until the second.)
 */
function v5EnvelopeWithASession(): SaveEnvelopeV5 {
  const runtime = createNewSimulationRuntime(0x5ca1e);
  while (runtime.kernel.tick < 20) runtime.kernel.step();
  const bundle = captureSessionSnapshot(runtime);
  if (bundle.simulation === undefined) throw new Error('a captured session must carry a simulation section');

  const { regimeSchedules: _regimeSchedules, inFlight: _inFlight, crossingNotices: _crossingNotices, ...simulation } = bundle.simulation;
  const payload = {
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
    kernel: bundle.kernel,
    world: bundle.world,
    construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    simulation,
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  };

  return {
    saveSchemaVersion: 5,
    gameVersion: 'lockstate-0.0.0',
    prisonId: 'v5-prison',
    revision: 5,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_001,
    checksum: computeSaveChecksum(payload as unknown as JsonValue),
    payload,
  } as unknown as SaveEnvelopeV5;
}

describe('save-schema V5 -> V6 migration', () => {
  it('re-measures the premise: a fresh session writes exactly the two authored schedules', () => {
    const runtime = createNewSimulationRuntime(0xb0a7);
    const bundle = captureSessionSnapshot(runtime);

    // By value against the authored constants, not against anything this test
    // computed from the code under test.
    expect(bundle.simulation?.regimeSchedules).toEqual(EXPECTED_ROWS);
    expect(DEFAULT_REGIME_SCHEDULES).toHaveLength(2);

    // And the normalisation is a property rather than a fixture: every block's
    // categories are a subsequence of `ACTION_CATEGORIES`, whatever the
    // constants are authored as.
    for (const schedule of bundle.simulation?.regimeSchedules ?? []) {
      for (const block of schedule.blocks) {
        const positions = block.allowedCategories.map((category) => ACTION_CATEGORIES.indexOf(category));
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
      }
    }
  });

  it('writes both existing schedules under their existing ids, for a V5 save that has a simulation section', () => {
    const migrated = migrateSaveEnvelopeV5ToV6(v5EnvelopeWithASession());

    expect(migrated.saveSchemaVersion).toBe(6);
    expect(migrated.payload.simulation?.regimeSchedules).toEqual(EXPECTED_ROWS);
  });

  it('adds no regime section to a V5 save that carries no simulation section at all', () => {
    for (const fixture of [freshPrisonFixture, inProgressFixture]) {
      const v5 = v5EnvelopeFromV1(fixture);
      expect(v5.payload.simulation).toBeUndefined();

      const migrated = migrateSaveEnvelopeV5ToV6(v5);
      expect(migrated.payload.simulation).toBeUndefined();
      expect(migrated.saveSchemaVersion).toBe(6);
    }
  });

  it('leaves everything outside `simulation.regimeSchedules` byte-identical', () => {
    const v5 = v5EnvelopeWithASession();
    const migrated = migrateSaveEnvelopeV5ToV6(v5);

    const { regimeSchedules: _added, ...migratedSimulation } = migrated.payload.simulation ?? {};
    expect(migratedSimulation).toEqual(v5.payload.simulation);
    expect(migrated.payload.kernel).toEqual(v5.payload.kernel);
    expect(migrated.payload.world).toEqual(v5.payload.world);
    expect(migrated.payload.construction).toEqual(v5.payload.construction);
    expect(migrated.payload.entities).toEqual(v5.payload.entities);
    expect(migrated.payload.identity).toEqual(v5.payload.identity);
  });

  it('is pure: the input envelope is untouched', () => {
    const v5 = v5EnvelopeWithASession();
    const before = JSON.stringify(v5);
    migrateSaveEnvelopeV5ToV6(v5);
    expect(JSON.stringify(v5)).toBe(before);
  });

  it('recomputes the checksum over the migrated payload', () => {
    const migrated = migrateSaveEnvelopeV5ToV6(v5EnvelopeWithASession());
    expect(migrated.checksum).toBe(computeSaveChecksum(migrated.payload as unknown as JsonValue));
  });

  it('decodes a stored V5 save through the whole chain and restores onto the authored schedules', () => {
    const stored = throughStorage(v5EnvelopeWithASession());
    const decoded = decodeSaveEnvelope(stored);

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.migrated).toBe(true);
    expect(decoded.value.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);

    const bundle = decoded.value.payload;
    const { runtime } = restoreSimulationRuntime({
      kernel: bundle.kernel,
      world: bundle.world,
      construction: bundle.construction,
      ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
      ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
      ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    } as never);

    expect(runtime.prisoners.regimes.all()).toEqual(EXPECTED_ROWS);
  });

  it('carries an edited timetable across a save and a load, which is what the section is for', () => {
    const runtime = createNewSimulationRuntime(0xed17);
    submit(
      runtime,
      'edit',
      packCommand({
        type: 'EditRegimeBlock',
        classificationGroupId: 'high-risk',
        startTickOfDay: 2_000,
        allowedCategories: ['work', 'recreation'],
      }),
    );

    const bundle = captureSessionSnapshot(runtime);
    const { runtime: restored } = restoreSimulationRuntime(bundle);

    const highRisk = restored.prisoners.regimes.all().find((s) => s.classificationGroupId === 'high-risk');
    expect(highRisk?.blocks.find((b) => b.startTickOfDay === 2_000)?.allowedCategories).toEqual(['work', 'recreation']);
    // The rest of the day is untouched, and so is the other group.
    expect(highRisk?.blocks.map((b) => b.startTickOfDay)).toEqual([0, 2_000, 2_200]);
    expect(restored.prisoners.regimes.all().find((s) => s.classificationGroupId === 'general-population')).toEqual(
      asPersisted(GENERAL_POPULATION_REGIME),
    );
  });
});
