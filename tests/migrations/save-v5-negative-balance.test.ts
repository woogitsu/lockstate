import { describe, expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import {
  migrateSaveEnvelopeV1ToV2,
  migrateSaveEnvelopeV2ToV3,
  migrateSaveEnvelopeV3ToV4,
  migrateSaveEnvelopeV4ToV5,
} from '../../src/persistence/save-migrations';
import {
  SAVE_SCHEMA_VERSION,
  createSaveEnvelope,
  decodeSaveEnvelope,
  type SaveEnvelopeV1,
} from '../../src/persistence/save-schema';
import type { JsonValue } from '../../src/shared/json';
import { TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import freshPrisonFixture from '../fixtures/persistence/save-v1-fresh-prison.json';
import inProgressFixture from '../fixtures/persistence/save-v1-in-progress.json';

/**
 * **Does the balance losing `.nonnegative()` need a migration step?** No, and
 * the reason is not the one `docs/PERSISTENCE.md`'s optional-field pattern
 * gives -- so this file establishes it rather than citing it.
 *
 * ADR 0075 decision 2 widened `simulation.economy.treasury.balanceMinorUnits`
 * from `z.number().int().nonnegative().safe()` to `z.number().int().safe()`
 * (`src/persistence/save-schema.ts`). `SAVE_SCHEMA_VERSION` stayed at 5 and no
 * step was added.
 *
 * ## Why the pattern this file's neighbours cite does not apply here
 *
 * `docs/PERSISTENCE.md`, "Adding an optional field without a version bump",
 * asks three things of a field that skips a bump. The first is:
 *
 * > **The field is optional, and absent means what the older build already
 * > did.**
 *
 * `balanceMinorUnits` is **required**, and always has been. Absence is not a
 * case that exists, so the condition is not satisfied and not violated -- it
 * is silent, and quoting it here in support would be quoting a rule about a
 * different shape. `masterSeed`, `simulation.objects` and
 * `simulation.economy.payroll` each took that route; this change did not.
 *
 * ## What does apply, and it settles the question outright
 *
 * ADR 0038 decision 1, quoted rather than paraphrased:
 *
 * > **A save is compatible with a build when the build can interpret every
 * > section the save carries, and every section the build needs and the save
 * > omits has exactly one meaning. Absence is a fact about the save's age and
 * > is honoured with the value the writing build would have held; a *value*
 * > the build cannot interpret is a fact about the blob and is refused.**
 *
 * This change moved only the second clause's line, and it moved it outward.
 * The set of balances this build interprets is a strict **superset** of the set
 * the previous build wrote, so **there is nothing a migration step could do**:
 * every save already in the corpus is valid under the new bound unchanged. A
 * step that rewrote a balance would be inventing a figure the file records
 * correctly. That is not the optional-field pattern's argument; it is a
 * separate one, and the tests below check it by walking the boundary rather
 * than by asserting the conclusion.
 *
 * ## The cost, which is real and points the other way
 *
 * `masterSeed` and `payroll` both record what skipping a bump costs them: an
 * **older** build reading a save that carries their key refuses it as
 * `invalid-shape` where a V6 bump would have said `unsupported-version`. A
 * loosened *value* bound has the same cost in a narrower case -- a save whose
 * balance is negative is refused `invalid-shape` by every build older than
 * this one, and only by those. The reciprocal is what makes it acceptable and
 * is pinned below: no save an older build could write is refused here.
 *
 * ## What is deliberately not claimed
 *
 * Nothing here says the loan *ledger* survives a save. It does not; there is
 * no loan section in the payload at all, and
 * `tests/determinism/loan-ledger-restore-boundary.test.ts` pins that with the
 * paragraph in `src/simulation/economy/loans.ts` that says so first.
 */

const PRISON_ID = 'negative-balance-prison';
const SEED = 0x75;

/** A structured clone through JSON -- how a save actually reaches `decodeSaveEnvelope` from storage. */
function throughStorage<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

/**
 * A session that has spent some of its money, so the payload under test is a
 * real capture rather than a fresh one -- and so the balance replaced below is
 * replacing a value the simulation produced.
 */
function spentSession(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: 10 }));
  expect(runtime.refusals.count).toBe(0);
  expect(runtime.treasury.balanceMinorUnits).toBeLessThan(TREASURY_STARTING_BALANCE_MINOR_UNITS);
  return runtime;
}

interface CapturedParts {
  readonly bundle: SessionSnapshotBundle;
  readonly simulation: NonNullable<SessionSnapshotBundle['simulation']>;
  readonly economy: NonNullable<NonNullable<SessionSnapshotBundle['simulation']>['economy']>;
}

/** The two optional levels this file works below, asserted present rather than asserted away with `!`. */
function capturedParts(runtime: SimulationRuntime): CapturedParts {
  const bundle = captureSessionSnapshot(runtime);
  const simulation = bundle.simulation;
  if (simulation === undefined) throw new Error('a captured session must carry a simulation section');
  const economy = simulation.economy;
  if (economy === undefined) throw new Error('a captured session must carry an economy section');
  return { bundle, simulation, economy };
}

/** A real capture with the balance replaced, taken all the way through `createSaveEnvelope` -- which parses, so an unacceptable figure throws here. */
function envelopeWithBalance(balanceMinorUnits: number): ReturnType<typeof createSaveEnvelope> {
  const { bundle, simulation, economy } = capturedParts(spentSession());
  return createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0',
    prisonId: PRISON_ID,
    revision: 1,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_001,
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
    kernel: bundle.kernel,
    world: bundle.world,
    construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    simulation: { ...simulation, economy: { ...economy, treasury: { balanceMinorUnits } } },
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  });
}

/**
 * A save carrying a balance no writer can produce, assembled by hand with a
 * checksum over the tampered payload -- so a refusal below is the *shape*
 * refusing it and not the integrity check catching an edit (#102).
 */
function handEditedEnvelope(balanceMinorUnits: number): unknown {
  const { bundle, simulation, economy } = capturedParts(spentSession());
  const payload = {
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
    kernel: bundle.kernel,
    world: bundle.world,
    construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    simulation: { ...simulation, economy: { ...economy, treasury: { balanceMinorUnits } } },
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  };
  return throughStorage({
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion: 'lockstate-0.0.0',
    prisonId: PRISON_ID,
    revision: 1,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_001,
    checksum: computeSaveChecksum(payload as unknown as JsonValue),
    payload,
  });
}

describe('every balance a build older than ADR 0075 decision 2 could write still loads unchanged', () => {
  /**
   * The four corners of the range the previous bound accepted:
   * `z.number().int().nonnegative().safe()`. Written out rather than derived
   * from the schema, so this list is a statement about the *old* build and
   * cannot be satisfied by a change to the current one.
   */
  const WRITABLE_BEFORE = [0, 1, TREASURY_STARTING_BALANCE_MINOR_UNITS, Number.MAX_SAFE_INTEGER] as const;

  it.each(WRITABLE_BEFORE)('decodes %d as a current save, unmigrated, and restores to it', (balance) => {
    const decoded = decodeSaveEnvelope(throughStorage(envelopeWithBalance(balance)));
    expect(decoded).toMatchObject({ ok: true, migrated: false });
    if (!decoded.ok) throw new Error('a save an older build wrote must still decode');
    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
    expect(restored.treasury.balanceMinorUnits).toBe(balance);
  });

  it('migrates a V1 save with no economy section at all and lands on the starting balance', () => {
    // The checked-in V1 fixtures carry no `simulation` section, so their V5
    // form is the case a loosened bound inside that section most has to leave
    // alone: the section the field lives in is not there either. This is
    // ADR 0038's "absence is a fact about the save's age" half, for a save
    // whose age predates money.
    for (const fixture of [freshPrisonFixture, inProgressFixture]) {
      const v5 = migrateSaveEnvelopeV4ToV5(
        migrateSaveEnvelopeV3ToV4(migrateSaveEnvelopeV2ToV3(migrateSaveEnvelopeV1ToV2(fixture as unknown as SaveEnvelopeV1))),
      );
      expect(v5.payload.simulation, 'the migration must not fabricate a section the save does not have').toBeUndefined();

      const decoded = decodeSaveEnvelope(throughStorage(fixture));
      expect(decoded).toMatchObject({ ok: true, migrated: true });
      if (!decoded.ok) throw new Error('the shipped V1 fixtures must still decode');
      const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
      expect(restored.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
      expect(restored.treasury.overdraftFloorMinorUnits, 'a prison that predates money owes nobody room').toBe(0);
    }
  });
});

describe('a prison that saved under water loads under water', () => {
  it('decodes a negative balance and restores to exactly it', () => {
    const decoded = decodeSaveEnvelope(throughStorage(envelopeWithBalance(-4_400)));
    expect(decoded).toMatchObject({ ok: true, migrated: false });
    if (!decoded.ok) throw new Error('a negative balance is an ordinary V5 save since ADR 0075 decision 2');
    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
    expect(restored.treasury.balanceMinorUnits, 'a reload is not a way out of the debt').toBe(-4_400);
  });

  it('accepts the far corner of the new half of the range', () => {
    const decoded = decodeSaveEnvelope(throughStorage(envelopeWithBalance(Number.MIN_SAFE_INTEGER)));
    expect(decoded).toMatchObject({ ok: true, migrated: false });
  });
});

describe('the bound that mattered is unchanged, and it is what the loosening kept', () => {
  /**
   * `.int()` and `.safe()` are what #105 finding 4 and #191 asked of a
   * client-writable number, and the change to the balance kept both. Each
   * figure below is one a hand editor can type and a writer cannot produce.
   */
  const REFUSED = [
    ['a positive fraction', 1.5],
    ['a negative fraction', -0.5],
    ['past the safe range, above', Number.MAX_SAFE_INTEGER + 2],
    ['past the safe range, below', Number.MIN_SAFE_INTEGER - 2],
  ] as const;

  it.each(REFUSED)('refuses %s behind a valid checksum', (_label, balance) => {
    expect(decodeSaveEnvelope(handEditedEnvelope(balance))).toMatchObject({
      ok: false,
      error: { code: 'invalid-shape' },
    });
  });

  it('refuses a writer that tries to produce one, at `createSaveEnvelope` rather than at the reader', () => {
    // The positive control for the row above: the refusal is the schema's, and
    // it fires on the way out as well as on the way in.
    expect(() => envelopeWithBalance(1.5)).toThrow();
    expect(() => envelopeWithBalance(-4_400), 'a negative balance is not what it refuses').not.toThrow();
  });
});
