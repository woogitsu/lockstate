import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { ObjectTool } from '../../src/ui/object-tool';
import { SimulationObjectPlacementPreviewRevision } from '../../src/ui/simulation-object-placement-port';
import type { SimulationMessageChannel } from '../../src/simulation/worker/worker-channel';
import type { WorkerToMainMessage } from '../../src/simulation/protocol/types';
import type { ObjectPlacementPreflight } from '../../src/simulation/objects/object-placement-service';
import type { HudObjectGesture } from '../../src/ui/hud';

const source = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
const readyCallback = source.match(/new SimulationObjectPlacementPreviewRevision\(simulation,\s*([\s\S]*?),\s*\(\) => objectTool\?\.refreshPreview\(\)\)/)?.[1];
const availabilityCallback = source.match(/onWorkerAvailability:\s*(\(available\) => \{[\s\S]*?\n      \}),/)?.[1];
if (readyCallback === undefined || availabilityCallback === undefined) throw new Error('Actual session composition callbacks absent');
function actualCallback<T>(expression: string, bindings: Record<string, unknown>): T {
  return new Function(...Object.keys(bindings), `return (${expression});`)(...Object.values(bindings)) as T;
}
for (const boundary of ['ready', 'availability'] as const) for (const removing of [false, true]) {
  it(`${boundary} preserves the publicly armed ${removing ? 'removal' : 'placement'} while invalidating old preview ownership`, async () => {
    let listener: ((message: WorkerToMainMessage) => void) | undefined;
    const channel: SimulationMessageChannel = { addListener: handler => { listener = handler; }, send: () => {} };
    let cancellations = 0;
    const scene = { cancelConstructionGesture: () => { cancellations++; } };
    const pending: ((verdict: ObjectPlacementPreflight) => void)[] = [];
    let revision: SimulationObjectPlacementPreviewRevision;
    const tool = new ObjectTool({ worldRevision: () => revision.revision,
      preflight: () => new Promise<ObjectPlacementPreflight>(resolve => pending.push(resolve)) });
    const gestures: HudObjectGesture[] = [];
    tool.attachGestures(gesture => gestures.push(gesture));
    const bindings = { objectTool: tool, worldScene: scene, roomTemplateTool: { standDown() {} },
      ObliqueWorldScene: class {}, hud: { setUnavailable() {} }, SIMULATION_UNAVAILABLE_NOTICE: {}, crashReporter: undefined };
    revision = new SimulationObjectPlacementPreviewRevision(channel, actualCallback<() => void>(readyCallback!, bindings));
    tool.setArmed(true, { definitionId: 'bed-wooden', footprint: { width: 1, height: 2 }, removing });
    tool.target({ tileX: 7, tileY: 6, width: 1, height: removing ? 1 : 2 });
    if (boundary === 'availability') actualCallback<(available: boolean) => void>(availabilityCallback!, bindings)(true);
    else listener!({ protocolVersion: 1, messageId: 'new-session-ready', replyTo: 'initialize-replacement', kind: 'simulation/ready',
      payload: { sessionId: 'replacement', tick: 0, clock: { mode: 'paused' } } });
    // The UI's Stop placing/Remove selection does not change on New/Load.
    expect(tool.isArmed()).toBe(true);
    expect(tool.isRemoving()).toBe(removing);
    expect(tool.selectedDefinitionId).toBe('bed-wooden');
    expect(tool.footprint()).toEqual({ width: 1, height: removing ? 1 : 2 });
    expect(cancellations).toBe(1); // outgoing held gesture is still cancelled
    expect(gestures).toEqual([]);
    for (const settle of pending.splice(0)) settle({ ok: false, reason: 'outside-room' });
    await Promise.resolve(); await Promise.resolve();
    expect(tool.previewVerdict()).toBeUndefined(); // old verdict cannot repaint the replacement session
    tool.target({ tileX: 9, tileY: 8, width: 1, height: removing ? 1 : 2 });
    expect(pending).toHaveLength(removing ? 0 : 1); // fresh session aim actually queries again
    // Actual release still sends the selected command; it never treats query as admission.
    tool.place({ tileX: 9, tileY: 8 });
    expect(gestures).toEqual([removing ? { kind: 'remove', x: 9, y: 8 }
      : { kind: 'place', definitionId: 'bed-wooden', x: 9, y: 8 }]);
  });
}
