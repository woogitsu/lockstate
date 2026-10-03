import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { expect, it } from 'vitest';
import { ObjectTool } from '../../src/ui/object-tool';
import type { HudObjectGesture, HudIntent } from '../../src/ui/hud';
import { nextObjectQuarterTurns } from '../../src/ui/object-rotation';
import type { ObjectPlacementPreflight } from '../../src/simulation/objects/object-placement-service';
import type { ObjectPlacementPreviewTarget } from '../../src/ui/simulation-object-placement-port';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

it('the real object tool gives both preview and placement the same selected orientation', () => {
  const tool = new ObjectTool();
  const reports: HudObjectGesture[] = [];
  tool.attachGestures(gesture => reports.push(gesture));
  for (const quarterTurns of [1, 2, 3, 0]) {
    // Reflect keeps this pre-change test runnable against the original port.
    Reflect.apply(tool.setArmed, tool, [true, { definitionId: 'desk-wooden', footprint: { width: 2, height: 1 }, quarterTurns }]);
    expect(tool.footprint()).toEqual(quarterTurns % 2 === 0 ? { width: 2, height: 1 } : { width: 1, height: 2 });
    tool.place({ tileX: 8, tileY: 5 });
    expect(reports.at(-1)).toEqual({ kind: 'place', definitionId: 'desk-wooden', x: 8, y: 5, ...(quarterTurns === 0 ? {} : { quarterTurns }) });
  }
  tool.setArmed(true, { removing: true });
  expect(tool.footprint()).toEqual({ width: 1, height: 1 });
  tool.place({ tileX: 8, tileY: 6 });
  expect(reports.at(-1)).toEqual({ kind: 'remove', x: 8, y: 6 });
});

it('the actual Rotate activation retains its anchor, reports every angle and refuses removal/walls', () => {
  const source = readFileSync(new URL('../../src/ui/hud/build-panel.ts', import.meta.url), 'utf8');
  const start = source.indexOf('  const rotateButton = createActionButton({');
  const end = source.indexOf("  rotateButton.element.classList.add('hud-build__rotate-object');", start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  const reports: unknown[] = [];
  const factory = new Function('createActionButton', 't', 'HUD_MESSAGE_KEY', 'nextObjectQuarterTurns', 'reports',
    stripTypeScriptTypes(`function actualControl() { let quarterTurns = 0; let removing = false; let isObject = true;
      const currentTarget = {x:8,y:5}; const selectedBuildable = () => isObject ? {objectFootprint:{width:2,height:1}} : {};
      const paintCatalogue = () => {}; const paintArmed = () => {};
      const setTarget = target => reports.push({target}); const reportArmed = () => reports.push({quarterTurns});
      ${source.slice(start, end)}
      return {activate:rotateButton.activate, remove:() => {removing=true;}, wall:() => {removing=false;isObject=false;}};
      } actualControl();`).replace('actualControl();', 'return actualControl();'));
  const control = factory((options: {label: string; onActivate: () => void}) => ({activate: options.onActivate}),
    (key: string) => key, {buildRotateObject: 'hud.build.rotate-object'}, nextObjectQuarterTurns, reports) as
    {activate: () => void; remove: () => void; wall: () => void};
  for (const quarterTurns of [1,2,3,0]) {
    control.activate();
    expect(reports.slice(-2)).toEqual([{target:{x:8,y:5}},{quarterTurns}]);
  }
  control.remove(); control.activate(); control.wall(); control.activate();
  expect(reports).toHaveLength(8);
});

it('a changed angle owns a new real preflight target and rejects the previous-angle reply', async () => {
  const pending: {target: ObjectPlacementPreviewTarget; resolve: (reply: ObjectPlacementPreflight) => void}[] = [];
  const tool = new ObjectTool({worldRevision: () => 1, preflight: target => new Promise(resolve => pending.push({target, resolve}))});
  tool.setArmed(true, {definitionId:'desk-wooden',footprint:{width:2,height:1}});
  tool.target({tileX:8,tileY:5,width:2,height:1});
  tool.setArmed(true, {quarterTurns:1});
  tool.target({tileX:8,tileY:5,width:1,height:2});
  expect(pending.map(query => query.target)).toEqual([
    {definitionId:'desk-wooden',anchor:{x:8,y:5}},
    {definitionId:'desk-wooden',anchor:{x:8,y:5},quarterTurns:1},
  ]);
  const footprint = [{x:tileCoordinate(8),y:tileCoordinate(5)},{x:tileCoordinate(8),y:tileCoordinate(6)}];
  pending[0]!.resolve({ok:true,roomInstanceId:'room:old',footprint,catalogueCostMinorUnits:130});
  await Promise.resolve(); expect(tool.previewVerdict()).toBeUndefined();
  pending[1]!.resolve({ok:false,reason:'tile-occupied',tile:footprint[1]!,footprint,catalogueCostMinorUnits:130});
  await Promise.resolve(); expect(tool.previewVerdict()).toBe('blocked');
});

it('a different individual selection resets facing while the same selection retains it', () => {
  const tool = new ObjectTool();
  Reflect.apply(tool.setArmed, tool, [true, { definitionId: 'desk-wooden', footprint: { width: 2, height: 1 }, quarterTurns: 1 }]);
  tool.setArmed(true);
  expect(tool.footprint()).toEqual({ width: 1, height: 2 });
  tool.setArmed(true, { definitionId: 'bed-wooden', footprint: { width: 1, height: 2 } });
  expect(tool.footprint()).toEqual({ width: 1, height: 2 });
});

it('the exact public main placement case retains nondefault turns and the omitted legacy control', () => {
  const source = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
  const start = source.indexOf("        case 'place-object':");
  const end = source.indexOf("        case 'remove-object':", start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  const dispatch = new Function('intent', 'commands', 'requireSimulation', 'crypto',
    stripTypeScriptTypes(`function actual() { switch(intent.kind) { ${source.slice(start, end)} } } actual();`)) as
    (intent: HudIntent, commands: { submit: (value: unknown) => void }, requireSimulation: (value: unknown) => unknown, crypto: { randomUUID: () => string }) => void;
  const actual: unknown[] = [];
  const commands = { submit: (value: unknown) => actual.push(value) };
  for (const quarterTurns of [1, 3, undefined]) {
    const intent = { kind: 'place-object', definitionId: 'desk-wooden', x: 8, y: 5, ...(quarterTurns === undefined ? {} : { quarterTurns }) };
    dispatch(intent as HudIntent, commands, value => value, { randomUUID: () => 'real-host-test-owner' });
    expect(actual.at(-1)).toEqual({ type: 'PlaceObject', orderId: 'object-real-host-test-owner', definitionId: 'desk-wooden', x: 8, y: 5,
      ...(quarterTurns === undefined ? {} : { quarterTurns }) });
  }
});
