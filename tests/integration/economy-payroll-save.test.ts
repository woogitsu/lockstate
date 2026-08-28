import { describe, expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import {
  SAVE_SCHEMA_VERSION,
  createSaveEnvelope,
  decodeSaveEnvelope,
  type SaveEnvelopeV1,
  type SaveEnvelopeV4,
} from '../../src/persistence/save-schema';
import {
  migrateSaveEnvelopeV1ToV2,
  migrateSaveEnvelopeV2ToV3,
  migrateSaveEnvelopeV3ToV4,
} from '../../src/persistence/save-migrations';
import type { JsonValue } from '../../src/shared/json';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import freshPrisonFixture from '../fixtures/persistence/save-v1-fresh-prison.json';

/**
 * **Does `simulation.economy.payroll` need a save migration?** No, and this
 * file is the proof rather than the assertion.
 *
 * ADR 0042 step 3's *Persistence* paragraph says the debit *"must carry a
 * version and a migration before release (`AGENTS.md` boundary 7)"*, and that
 * is the sentence this file exists to test rather than to obey. Boundary 7 asks
 * for *"a version and a migration strategy"*; `docs/PERSISTENCE.md`, "Adding an
 * optional field without a version bump", states the strategy that already
 * covers this shape and names five fields that took it. The arrears field is
 * the sixth, and the three conditions that section sets are each checked below
 * against a real save rather than argued:
 *
 * 1. **The field is optional and absence means what the older build did.** A
 *    V5 save with the key removed loads, and lands on the arrears a session
 *    that never had a payroll actually had -- zero.
 * 2. **The key is declared.** `economySectionSchema` is `.strict()`, so a save
 *    carrying an undeclared key fails whole. The positive control below is that
 *    a live capture *does* carry it and decodes.
 * 3. **Absence is unambiguous.** Here it is a fact about the corpus, not a
 *    convention: no build that could write a V5 save had a recurring charge, so
 *    no V5 save can be hiding a real debt behind a missing key. The
 *    code-level counterpart is checked: a runtime restored from a save with no
 *    payroll section is at exactly the arrears a new runtime is at.
 *
 * `economySectionSchema` is shared by the V3, V4 and V5 session-systems shapes
 * (`sessionSystemsShapeFor`), so the key is equally valid in all three and no
 * migration step has to add it -- the same fact `docs/PERSISTENCE.md` records
 * for `simulation.contraband.intelligenceSequence`. The V4 case below is what
 * checks that the historical chain still walks a save that predates the field.
 *
 * ## What "no migration" costs, and it is not nothing
 *
 * An **older** build reading a save that carries this key refuses it as
 * `invalid-shape`, where a V6 bump would have given the same refusal the label
 * `unsupported-version`. Both builds refuse it; only the diagnosis differs.
 * That is `masterSeed`'s recorded cost and it is this field's too.
 */

const PRISON_ID = 'payroll-prison';
const GUARD = 'staff-role.guard';
const ARRIVAL = { x: 16, y: 16 } as const;
/** The catalogue's guard band, restated as a literal so a balance below is not derived from the code that charges it. */
const GUARD_WAGE = 80;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * A prison that owes its staff money, reached only through commands a player
 * has.
 *
 * 620 bricks at 40 takes 24,800 of the 25,000, two hires at 80 take 160, and
 * the 40 left cannot meet the 160 that falls due at the first day boundary. It
 * pays the 40 and owes 120. Every figure is written out; nothing here reads the
 * catalogue except `GUARD_WAGE`, which is restated as a literal.
 */
function insolventSession(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(0x9a6e5);
  submit(runtime, 'buy', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: 620 }));
  submit(runtime, 'hire-0', packCommand({ type: 'HireStaff', staffRoleId: GUARD, ...ARRIVAL }));
  submit(runtime, 'hire-1', packCommand({ type: 'HireStaff', staffRoleId: GUARD, ...ARRIVAL }));
  expect(runtime.refusals.count, 'the fixture must afford everything it buys').toBe(0);
  expect(runtime.treasury.balanceMinorUnits).toBe(40);
  expect(runtime.payroll.dailyWageBillMinorUnits()).toBe(2 * GUARD_WAGE);

  stepTo(runtime, DAY_LENGTH_TICKS);
  expect(runtime.treasury.balanceMinorUnits, 'floored, not overdrawn').toBe(0);
  expect(runtime.payroll.unpaidWagesMinorUnits, '160 billed against 40 held').toBe(120);
  return runtime;
}

/**
 * The captured `simulation` section, with the two optional levels this file
 * works below asserted present rather than asserted away with `!`.
 *
 * `EncodedSessionSystems.economy` is optional because a bundle need not carry
 * one; a live capture always does, and a test that quietly tolerated its
 * absence would pass on a runtime that had stopped emitting it.
 */
function capturedSystems(runtime: SimulationRuntime): {
  readonly bundle: SessionSnapshotBundle;
  readonly simulation: NonNullable<SessionSnapshotBundle['simulation']>;
  readonly economy: NonNullable<NonNullable<SessionSnapshotBundle['simulation']>['economy']>;
} {
  const bundle = captureSessionSnapshot(runtime);
  const simulation = bundle.simulation;
  if (simulation === undefined) throw new Error('a captured session must carry a simulation section');
  const economy = simulation.economy;
  if (economy === undefined) throw new Error('a captured session must carry an economy section');
  return { bundle, simulation, economy };
}

/** The full save path a session controller takes, including the JSON round trip that destroys object identity. */
function envelopeOf(bundle: SessionSnapshotBundle): ReturnType<typeof createSaveEnvelope> {
  return createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0',
    prisonId: PRISON_ID,
    revision: 1,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_001,
    kernel: bundle.kernel,
    world: bundle.world,
    construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  });
}

function decodeThroughStorage(envelope: unknown): ReturnType<typeof decodeSaveEnvelope> {
  return decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
}

describe('the arrears field is in the save, and it is what makes a debt survive a reload', () => {
  it('carries the arrears through a real save and restores them', () => {
    const original = insolventSession();
    const decoded = decodeThroughStorage(envelopeOf(captureSessionSnapshot(original)));
    expect(decoded).toMatchObject({ ok: true, migrated: false });
    if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');

    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
    expect(restored.payroll.unpaidWagesMinorUnits).toBe(120);
    expect(restored.treasury.balanceMinorUnits).toBe(0);

    // And the restored debt is charged forward rather than merely remembered:
    // 120 owed plus 160 for the next day, against an empty treasury.
    stepTo(restored, DAY_LENGTH_TICKS * 2);
    expect(restored.payroll.unpaidWagesMinorUnits).toBe(280);
  });

  it('writes the section unconditionally, so a solvent prison says "nothing owed" rather than "unknown"', () => {
    const runtime = createNewSimulationRuntime(0x9a6e5);
    submit(runtime, 'hire-0', packCommand({ type: 'HireStaff', staffRoleId: GUARD, ...ARRIVAL }));
    const envelope = envelopeOf(captureSessionSnapshot(runtime));
    expect(envelope.payload.simulation?.economy?.payroll).toEqual({ unpaidWagesMinorUnits: 0 });
  });
});

describe('a save written before the payroll existed still loads, which is why no migration is added', () => {
  /**
   * A V5 save from a build with no payroll: a real capture with the key
   * removed and the checksum recomputed over what is left.
   *
   * Removing the key is exactly what an older build's writer did, because the
   * writer had no field to emit -- so this is the byte shape such a save has,
   * not an approximation of it.
   */
  function v5EnvelopeWithoutPayroll(): unknown {
    const captured = capturedSystems(insolventSession());
    const { payroll: dropped, ...economy } = captured.economy;
    expect(dropped, 'the positive control: the key must be there before this function removes it').toEqual({
      unpaidWagesMinorUnits: 120,
    });
    const envelope = envelopeOf({ ...captured.bundle, simulation: { ...captured.simulation, economy } });
    return JSON.parse(JSON.stringify(envelope)) as unknown;
  }

  it('decodes as a current save, unmigrated, with the key absent', () => {
    const decoded = decodeSaveEnvelope(v5EnvelopeWithoutPayroll());
    expect(decoded).toMatchObject({ ok: true, migrated: false });
    if (!decoded.ok) throw new Error('an older V5 save must still decode');
    expect(
      (decoded.value.payload as unknown as SessionSnapshotBundle).simulation?.economy?.payroll,
      'the save genuinely does not carry the field, so this is the case that matters',
    ).toBeUndefined();
  });

  it('restores to the arrears a prison with no payroll actually had, which is none', () => {
    const decoded = decodeSaveEnvelope(v5EnvelopeWithoutPayroll());
    if (!decoded.ok) throw new Error('an older V5 save must still decode');
    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;

    // Absence is unambiguous *because* of this: it lands where a session that
    // never had a payroll sat, rather than on a value invented at restore.
    expect(restored.payroll.unpaidWagesMinorUnits).toBe(0);
    expect(createNewSimulationRuntime(0).payroll.unpaidWagesMinorUnits).toBe(0);

    // The rest of the save is untouched by the absence: the treasury the older
    // build wrote is the treasury that comes back.
    expect(restored.treasury.balanceMinorUnits).toBe(0);
  });

  it('is refused if it carries the key with a value the field cannot hold', () => {
    /*
     * The other half of "the key still has to be declared": `.nonnegative()`
     * is what stops a hand-edited save (#102) from restoring a negative debt,
     * which `PayrollSystem.restore` would otherwise throw on -- a crashed
     * *load* rather than a refused one.
     *
     * Assembled by hand rather than through `createSaveEnvelope`, because that
     * function parses what it is given: a writer cannot produce this save, and
     * a player's text editor can.
     */
    const { bundle, simulation, economy } = capturedSystems(insolventSession());
    const payload = {
      masterSeed: bundle.masterSeed,
      kernel: bundle.kernel,
      world: bundle.world,
      construction: bundle.construction,
      ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
      simulation: { ...simulation, economy: { ...economy, payroll: { unpaidWagesMinorUnits: -1 } } },
      ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    };
    const tampered = {
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      gameVersion: 'lockstate-0.0.0',
      prisonId: PRISON_ID,
      revision: 1,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_001,
      // A valid checksum over the tampered payload, so the refusal below is
      // the *shape* refusing it and not the integrity check catching an edit.
      checksum: computeSaveChecksum(payload as unknown as JsonValue),
      payload,
    };

    expect(decodeThroughStorage(tampered)).toMatchObject({ ok: false, error: { code: 'invalid-shape' } });
  });
});

describe('the historical chain still walks a save older than the field', () => {
  it('migrates a V4 save with no economy section at all, and lands on zero arrears', () => {
    // The checked-in V1 fixture carries no `simulation` section, so its V4 form
    // is the case a shared `economySectionSchema` most has to leave alone: the
    // section the new key lives in is not there either.
    const v4 = migrateSaveEnvelopeV3ToV4(
      migrateSaveEnvelopeV2ToV3(migrateSaveEnvelopeV1ToV2(freshPrisonFixture as unknown as SaveEnvelopeV1)),
    );
    expect(v4.saveSchemaVersion).toBe(4);

    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(v4)) as unknown);
    expect(decoded).toMatchObject({ ok: true, migrated: true });
    if (!decoded.ok) throw new Error('a V4 save must still migrate and decode');
    expect(decoded.value.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);

    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
    expect(restored.payroll.unpaidWagesMinorUnits).toBe(0);
  });

  it('accepts a V4 save whose economy section is the shape a V4 build wrote', () => {
    // A V4 payload carrying an economy section, built the way
    // `tests/migrations/save-v4-to-v5.test.ts` builds one: a real capture put
    // back into the V4 room-instance shape, with the payroll key removed
    // because no V4 build had one to write.
    const captured = capturedSystems(insolventSession());
    const { bundle } = captured;
    const { objects: _objects, ...simulation } = captured.simulation;
    const { payroll: _payroll, ...economy } = captured.economy;
    const payload = {
      kernel: bundle.kernel,
      world: bundle.world,
      construction: bundle.construction,
      ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
      simulation: {
        ...simulation,
        economy,
        prisoners: {
          ...captured.simulation.prisoners,
          roomInstanceDefinitions: captured.simulation.prisoners.roomInstanceDefinitions.map((instance) => ({
            instanceId: instance.instanceId,
            roomCatalogId: instance.roomCatalogId,
            anchorTile: instance.anchorTile,
            capacity: 0,
            objectCapabilities: [],
          })),
        },
      },
      ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    };
    const v4 = {
      saveSchemaVersion: 4,
      gameVersion: 'lockstate-0.0.0',
      prisonId: 'v4-payroll-prison',
      revision: 5,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_001,
      checksum: computeSaveChecksum(payload as unknown as JsonValue),
      payload,
    } as unknown as SaveEnvelopeV4;

    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(v4)) as unknown);
    expect(decoded).toMatchObject({ ok: true, migrated: true });
    if (!decoded.ok) throw new Error('a V4 save carrying an economy section must still migrate');

    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
    // The treasury the V4 save recorded, and no debt -- because a V4 build had
    // no way to owe one.
    expect(restored.treasury.balanceMinorUnits).toBe(0);
    expect(restored.payroll.unpaidWagesMinorUnits).toBe(0);
  });
});

describe('the version this all rests on', () => {
  it('is still 5, and a bump would need its own reason', () => {
    // Pinned rather than deleted, for the reason
    // `economy-state-income-persistence.test.ts` gives about the same number:
    // what this guards is that a bump has a reason, not that the number never
    // moves. Payroll is not one -- it adds an optional field whose absence is
    // unambiguous, which is the pattern five fields took before it.
    expect(SAVE_SCHEMA_VERSION).toBe(5);
  });
});
