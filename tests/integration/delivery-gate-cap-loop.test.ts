import { describe, expect, it } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { messageCatalogPl } from '../../src/services/localization/pl-catalog';
import { HUD_VIEW_MODEL_SCHEMA_VERSION } from '../../src/simulation/presentation/view-model';
import { SIMULATION_PROTOCOL_VERSION, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { hudAlertsFromWorkerMessage } from '../../src/ui/simulation-alerts';
import { alertRows } from '../helpers/alert-rows';

const SEED = 0x587;

describe('delivery gate capacity through a live prison (#587)', () => {
  it('refuses the ruinous press before spend and preserves pending space across a save', () => {
    const runtime = createNewSimulationRuntime(SEED);
    const buy = (id: string, quantity: number): void => {
      runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick,
        packCommand({ type: 'PurchaseMaterials', orderId: id, itemId: 'item.brick', quantity }));
      runtime.kernel.step();
    };

    buy('too-many', 625);
    expect(runtime.refusals.last?.reason).toBe('purchase.delivery-capacity');
    expect(runtime.treasury.balanceMinorUnits).toBe(25_000);
    expect(runtime.procurement.pendingDeliveries).toEqual([]);
    const publication = {
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'capacity-refusal',
      kind: 'simulation/status-counts',
      payload: {
        tick: runtime.kernel.tick,
        schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
        counts: projectStatusCounts(runtime, runtime.kernel.tick),
        refusal: runtime.refusals.last,
      },
    } as WorkerToMainMessage;
    const alert = alertRows(hudAlertsFromWorkerMessage(publication))[0]!;
    expect(alert.labelKey).toBe('hud.alert.refusal.purchase.delivery-capacity');
    expect(new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] }).format(alert.labelKey))
      .toBe('The materials were not ordered — there is not enough storage space for them. Use stock, cancel a delivery, or add storage racks.');
    expect(new Localizer({ locale: 'pl', catalogs: [defaultMessageCatalogEn, messageCatalogPl] }).format(alert.labelKey))
      .toBe('Nie zamówiono materiałów — brakuje miejsca na tę dostawę. Zużyj zapasy, anuluj dostawę lub dodaj regały.');

    buy('first', 400);
    expect(runtime.procurement.pendingDeliveries.map((delivery) => delivery.quantity)).toEqual([400]);
    const { runtime: restored } = restoreSimulationRuntime(captureSessionSnapshot(runtime), SEED);
    const balanceBefore = restored.treasury.balanceMinorUnits;
    restored.kernel.submitCommand('over-remaining', restored.kernel.expectedSequence, restored.kernel.tick,
      packCommand({ type: 'PurchaseMaterials', orderId: 'over-remaining', itemId: 'item.brick', quantity: 201 }));
    restored.kernel.step();
    expect(restored.refusals.last?.reason).toBe('purchase.delivery-capacity');
    expect(restored.treasury.balanceMinorUnits).toBe(balanceBefore);
    expect(restored.procurement.pendingDeliveries.map((delivery) => delivery.quantity)).toEqual([400]);
  });
});
