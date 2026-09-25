import { createHistoricalOpeningRuntime } from '../helpers/historical-opening-treasury';
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
import { type SimulationRuntime } from '../../src/simulation/runtime/new-session';
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
 * **Every figure here moved with the owner's ruling 19 of 2026-08-31, and the
 * old ones are kept because the *shape* of the fixture is unchanged and only
 * the depth is not.** What stood here:
 *
 * > 620 bricks at 40 takes 24,800 of the 25,000, two hires at 80 take 160, and
 * > the 40 left cannot meet the 160 that falls due at the first day boundary. It
 * > pays the 40 and owes 120.
 *
 * > ```
 * > submit(runtime, 'buy', … itemId: 'item.brick', quantity: 620 );
 * > expect(runtime.treasury.balanceMinorUnits).toBe(40);
 * > stepTo(runtime, DAY_LENGTH_TICKS);
 * > expect(runtime.treasury.balanceMinorUnits, 'floored, not overdrawn').toBe(0);
 * > expect(runtime.payroll.unpaidWagesMinorUnits, '160 billed against 40 held').toBe(120);
 * > ```
 *
 * Ruling 19 -- drafted as ADR 0017's "Amendment, 2026-09-01" -- gives ADR 0017
 * decision 8's rungs their own thresholds inside the overdraft, and **wages are
 * the rung at the floor**: a payday is paid out of the overdraft until the
 * balance reaches -2,500, and only then goes unpaid. So a prison stops being
 * *floored at zero* and starts being *floored at the wage rung*, and it takes
 * longer to get there.
 *
 * **The arithmetic below moved once more with the owner's second ruling on
 * #771 (2026-09-01), and it is kept as a superseded quote for the same reason
 * the ruling-19 paragraph above is**:
 *
 * > - Two hires at 80 take 160 of the 25,000, leaving 24,840. A hire is the
 * >   `'hiring'` rung, refused below -1,250.
 * > - 649 bricks at 40 and 2 planks at 65 is 26,090, which is exactly the
 * >   24,840 plus the 1,250 of delivery-rung room -- so the last purchase a
 * >   player can make lands the balance on **-1,250** to the minor unit, and
 * >   the fixture is at the first rung with nothing further buyable.
 * > - The wage rung is 1,250 deeper. Seven paydays at 160 take 1,120 of it,
 * >   leaving 130 at the eighth, which pays 130 of its 160 and **owes 30**.
 *
 * **This runtime never zones a room, so it is "fresh, unfurnished"
 * (`RoomInstanceRegistry.totalResidentCapacity === 0`) for its whole life, and
 * both hires and both purchases are judged at the *starter* rung
 * (`INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS`, -1,185), not the
 * mature -1,250 the quote above assumed.** The arithmetic, redone from the
 * same two hires:
 *
 * - Two hires at 80 take 160 of the 25,000, leaving 24,840, exactly as before
 *   -- both well above either rung.
 * - 649 bricks at 40 and **one** plank at 65 (not two) is 26,025, which is
 *   exactly the 24,840 plus the 1,185 of starter-rung room -- one fewer plank
 *   than the mature derivation needed, because the starter rung reserves
 *   exactly that plank's worth of room. The last purchase a player can make
 *   lands the balance on **-1,185** to the minor unit.
 * - The wage rung is unaffected by freshness and is still 1,315 deeper from
 *   here (`-1,185 - (-2,500)`). Eight paydays at 160 take 1,280 of it,
 *   leaving 35 at the ninth, which pays 35 of its 160 and **owes 125**.
 *
 * **Superseded by [ADR 0096](../../docs/adr/0096-what-a-way-back-is-and-what-guarantees-one.md)
 * decision 2 (accepted 2026-09-10), and this is a sharper case than
 * `tests/integration/economy-liquidity-hard-lock.test.ts`'s -- here the
 * *press* alone already lands below the new wages rung, before payroll ever
 * runs.** `'wages'` while fresh is now
 * `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS + WAGES_STARTER_RESERVE_MINOR_UNITS`
 * = -1,250 + 1,195 = **-55**, and this fixture's own press already lands the
 * balance at **-1,185** — deeper than -55 before a single payday. So
 * `Math.max(0, balance - floorFor('wages', true))` is `Math.max(0, -1,185 -
 * (-55)) = Math.max(0, -1,130) = 0` from the very first payday: nothing is
 * paid, ever, while this prison stays unfurnished, and the balance never
 * moves past -1,185 again. Measured through the real kernel: **arrears is
 * 160 a day, flat, with no draw on the balance at all** — 1,440 after nine
 * days, not 125. This is decision 2 working exactly as intended, not a
 * regression: the reserve exists precisely so a payday cannot draw the
 * balance any deeper than a press already has, and a press that has already
 * spent past the reserve leaves payday nothing left to spend either.
 *
 * Nothing here reads the catalogue except `GUARD_WAGE`, which is restated as a
 * literal.
 */
function insolventSession(): SimulationRuntime {
  const runtime = createHistoricalOpeningRuntime(0x9a6e5);
  submit(runtime, 'hire-0', packCommand({ type: 'HireStaff', staffRoleId: GUARD, ...ARRIVAL }));
  submit(runtime, 'hire-1', packCommand({ type: 'HireStaff', staffRoleId: GUARD, ...ARRIVAL }));
  submit(runtime, 'buy', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: 649 }));
  submit(runtime, 'buy-p', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: 1 }));
  expect(runtime.refusals.count, 'the fixture must afford everything it buys').toBe(0);
  expect(runtime.treasury.balanceMinorUnits, 'exactly the starter delivery rung, with nothing left to press').toBe(
    -1_185,
  );
  expect(runtime.payroll.dailyWageBillMinorUnits()).toBe(2 * GUARD_WAGE);

  stepTo(runtime, DAY_LENGTH_TICKS * 9);
  // ADR 0096 decision 2: the press already sits below the wages starter rung
  // (-55), so payroll draws nothing from day one -- the balance never moves
  // past the press's own -1,185, and the whole nine days of bills become
  // arrears: 9 x 160.
  expect(runtime.treasury.balanceMinorUnits, 'the press`s own rung, not the mature wage rung').toBe(-1_185);
  expect(runtime.payroll.unpaidWagesMinorUnits, 'nine paydays, none of them paid at all').toBe(1_440);
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
    expect(restored.payroll.unpaidWagesMinorUnits).toBe(1_440);
    expect(restored.treasury.balanceMinorUnits).toBe(-1_185);

    // And the restored debt is charged forward rather than merely remembered:
    // 1,440 owed plus 160 for the next day, against a treasury the wages
    // starter rung already refuses to draw on at all. Before ADR 0096
    // decision 2 this read 125 owed against a treasury at the mature wage
    // rung, ending at 285; before ruling 19 it read 120 owed against an empty
    // treasury, ending at 280; before the starter rung it read 30 owed,
    // ending at 190.
    stepTo(restored, DAY_LENGTH_TICKS * 10);
    expect(restored.payroll.unpaidWagesMinorUnits).toBe(1_600);
  });

  it('writes the section unconditionally, so a solvent prison says "nothing owed" rather than "unknown"', () => {
    const runtime = createHistoricalOpeningRuntime(0x9a6e5);
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
      unpaidWagesMinorUnits: 1_440,
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
    expect(createHistoricalOpeningRuntime(0).payroll.unpaidWagesMinorUnits).toBe(0);

    // The rest of the save is untouched by the absence: the treasury the older
    // build wrote is the treasury that comes back -- ADR 0096 decision 2's
    // wages starter rung, since this fixture's press already lands below it.
    expect(restored.treasury.balanceMinorUnits).toBe(-1_185);
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
    // because no V4 build had one to write -- and, since the owner's decisions
    // of 2026-09-01 on ADR 0084, the alerts key removed beside the objects key
    // for exactly that reason.
    const captured = capturedSystems(insolventSession());
    const { bundle } = captured;
    // `regimeSchedules` removed beside them for the same reason, since ADR
    // 0113: it is V6's required section and no V4 build wrote one.
    const { objects: _objects, alerts: _alerts, regimeSchedules: _regimeSchedules, ...simulation } = captured.simulation;
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
    // no way to owe one. ADR 0096 decision 2's wages starter rung, since this
    // fixture's own press already lands below it (see `insolventSession`).
    expect(restored.treasury.balanceMinorUnits).toBe(-1_185);
    expect(restored.payroll.unpaidWagesMinorUnits).toBe(0);
  });
});

describe('the version this all rests on', () => {
  it('is 6, and the bump that took it there is not payroll\'s', () => {
    // Pinned rather than deleted, for the reason
    // `economy-state-income-persistence.test.ts` gives about the same number:
    // what this guards is that a bump has a reason, not that the number never
    // moves. Payroll is not one -- it adds an optional field whose absence is
    // unambiguous, which is the pattern five fields took before it. The reason
    // for 6 is ADR 0113's `simulation.regimeSchedules`, which is required
    // precisely because its absence is *not* unambiguous once a schedule can be
    // edited -- the distinction this assertion exists to keep visible.
    expect(SAVE_SCHEMA_VERSION).toBe(6);
  });
});
