import { expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { Scene: class {} } }));
import { WorldScene } from '../../src/rendering/scene/world-scene';
import { RoomTemplateTool } from '../../src/ui/room-template-tool';

it('refreshes the stationary world ghost when mirror changes', () => {
  const scene = Object.create(WorldScene.prototype) as Record<string, unknown>;
  const preview = vi.fn();
  const clear = vi.fn();
  scene.templateRevision = 1;
  scene.templatePlan = { id: 'cell-basic' };
  scene.templateVerdict = { ok: true };
  scene.templateOrigin = { x: 10, y: 10 };
  scene.templateHoverScreen = { x: 400, y: 300 };
  scene.buildOverlay = { clear };
  scene.previewTemplateHover = preview;
  scene.isTemplateArmed = () => true;
  const tool = new RoomTemplateTool({ preflight: async () => ({ ok: true }), place: async () => {} });
  (scene.setTemplateGhostPort as (port: RoomTemplateTool) => void)(tool);
  tool.select('cell-basic', true);
  expect(scene.templateRevision).toBe(2);
  expect(scene.templateVerdict).toBeUndefined();
  expect(clear).toHaveBeenCalledOnce();
  expect(preview).toHaveBeenCalledWith({ x: 400, y: 300 });
});

it('does not let an old placement verdict replace the ghost after the pointer moves', async () => {
  let finish: ((verdict: { ok: false; reason: 'structure-occupied'; tile: { x: number; y: number } }) => void) | undefined;
  const overlay = { updateTemplate: vi.fn(), clear: vi.fn() };
  const scene = Object.create(WorldScene.prototype) as Record<string, unknown>;
  const oldPlan = { id: 'cell-basic' };
  const newPlan = { id: 'cell-large' };
  const oldOrigin = { x: 10, y: 10 };
  const newOrigin = { x: 20, y: 20 };
  scene.templatePointerId = 1;
  scene.templateOrigin = oldOrigin;
  scene.templatePlan = oldPlan;
  scene.templateVerdict = { ok: true };
  scene.templateRevision = 1;
  scene.templateGhostPort = { isArmed: () => true, planAt: () => ({ width: 4, height: 7 }), placeAt: () => new Promise((resolve) => { finish = resolve; }), standDown: vi.fn() };
  scene.buildOverlay = overlay;
  scene.worldPointOf = () => oldOrigin;
  scene.squareAt = () => oldOrigin;

  expect((scene.commitTemplate as (pointer: { id: number }) => boolean)({ id: 1 })).toBe(true);
  scene.templateRevision = 2;
  scene.templateOrigin = newOrigin;
  scene.templatePlan = newPlan;
  scene.templateVerdict = { ok: true };
  finish?.({ ok: false, reason: 'structure-occupied', tile: oldOrigin });
  await Promise.resolve();
  expect(scene.templateVerdict).toEqual({ ok: true });
  expect(overlay.updateTemplate).not.toHaveBeenCalledWith(newPlan, { ok: false, reason: 'structure-occupied', tile: oldOrigin });
});

it('does not disarm a new template selection when the previous submission completes', async () => {
  let finish: ((verdict: { ok: true }) => void) | undefined;
  const standDown = vi.fn();
  const overlay = { updateTemplate: vi.fn(), clear: vi.fn() };
  const scene = Object.create(WorldScene.prototype) as Record<string, unknown>;
  const origin = { x: 10, y: 10 };
  const newPlan = { id: 'cell-large' };
  scene.templatePointerId = 1;
  scene.templateOrigin = origin;
  scene.templatePlan = { id: 'cell-basic' };
  scene.templateVerdict = { ok: true };
  scene.templateRevision = 1;
  scene.templateGhostPort = { isArmed: () => true, planAt: () => ({ width: 4, height: 7 }), placeAt: () => new Promise((resolve) => { finish = resolve; }), standDown };
  scene.buildOverlay = overlay;
  scene.worldPointOf = () => origin;
  scene.squareAt = () => origin;

  expect((scene.commitTemplate as (pointer: { id: number }) => boolean)({ id: 1 })).toBe(true);
  scene.templateRevision = 2;
  scene.templatePlan = newPlan;
  finish?.({ ok: true });
  await Promise.resolve();
  expect(standDown).not.toHaveBeenCalled();
  expect(scene.templatePlan).toBe(newPlan);
  expect(overlay.clear).not.toHaveBeenCalled();
});
