import { describe, expect, it } from 'vitest';
import { RoomFilthLedger } from '../../src/simulation/economy/room-filth';
import { stateIncomeForOccupiedPlaces, STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS } from '../../src/simulation/economy/income';
import { EntityStore } from '../../src/simulation/entity/entity-store';
import { NeedsComponent } from '../../src/simulation/prisoners/needs';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';

describe('room filth', () => {
  it('records only the three producing room types and withholds once per prisoner-day', () => {
    const ledger = new RoomFilthLedger();
    ledger.recordCompletedUse('room.shower', 'shower-1', 0);
    expect(ledger.snapshot()).toEqual({ rooms: [], uses: [] });
    ledger.recordCompletedUse('room.kitchen', 'kitchen-1', 0);
    ledger.recordCompletedUse('room.canteen', 'canteen-1', 0);
    expect(ledger.filthOf('kitchen-1')).toBe(1);
    expect(ledger.hasDirtyRoomUse(0)).toBe(true);

    const store = new EntityStore(1);
    const id = store.spawn();
    const needs = new NeedsComponent(1);
    const source = { roomInstances: { residentIdsWithExistingPlace: () => [id] }, entityStore: store, needs, roomFilth: ledger };
    const clean = stateIncomeForOccupiedPlaces({ ...source, roomFilth: undefined }, [id]);
    expect(stateIncomeForOccupiedPlaces(source, [id])).toBe(clean - STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS);
  });

  it('keeps filth without disposal, clears it with a bin, and forgets deleted rooms', () => {
    const ledger = new RoomFilthLedger();
    ledger.recordCompletedUse('room.laundry', 'laundry-1', 7);
    ledger.closeDay(false, new Set(['laundry-1']));
    expect(ledger.filthOf('laundry-1')).toBe(2);
    expect(ledger.hasDirtyRoomUse(7)).toBe(false);
    ledger.closeDay(true, new Set(['laundry-1']));
    expect(ledger.filthOf('laundry-1')).toBe(0);
    ledger.recordCompletedUse('room.laundry', 'laundry-1', 7);
    ledger.closeDay(false, new Set());
    expect(ledger.snapshot()).toEqual({ rooms: [], uses: [] });
  });

  it('persists room filth and same-day users through a save round trip', () => {
    const runtime = createNewSimulationRuntime(595);
    runtime.roomFilth.recordCompletedUse('room.kitchen', 'kitchen-1', 7);
    const bundle = captureSessionSnapshot(runtime);
    const encoded = createSaveEnvelope({
      gameVersion: 'lockstate-0.0.796', prisonId: 'filth-prison', revision: 1,
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
      kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
      ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
      ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
      ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    });
    const decoded = decodeSaveEnvelope(encoded);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as typeof bundle).runtime;
    expect(restored.roomFilth.snapshot()).toEqual(runtime.roomFilth.snapshot());
    expect(restored.roomFilth.hasDirtyRoomUse(7)).toBe(true);
  });

  it('accepts an older save without the optional field and starts with empty filth', () => {
    const runtime = createNewSimulationRuntime(595);
    runtime.roomFilth.recordCompletedUse('room.kitchen', 'kitchen-1', 7);
    const bundle = captureSessionSnapshot(runtime);
    const { roomFilth: _omitted, ...legacyEconomy } = bundle.simulation!.economy!;
    const legacySimulation = { ...bundle.simulation!, economy: legacyEconomy };
    const encoded = createSaveEnvelope({
      gameVersion: 'lockstate-0.0.796', prisonId: 'legacy-filth-prison', revision: 1,
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
      kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
      ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
      simulation: legacySimulation,
      ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    });
    const decoded = decodeSaveEnvelope(encoded);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as typeof bundle).runtime;
    expect(restored.roomFilth.snapshot()).toEqual({ rooms: [], uses: [] });
  });
});
