import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { expect, it } from 'vitest';
import { ObjectTool } from '../../src/ui/object-tool';
import type { HudObjectGesture, HudIntent } from '../../src/ui/hud';

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
