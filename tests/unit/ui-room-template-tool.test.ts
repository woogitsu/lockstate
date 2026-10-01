import { describe, expect, it, vi } from 'vitest';
import { RoomTemplateTool, type RoomTemplatePlacementPort } from '../../src/ui/room-template-tool';

describe('room-template HUD tool contract', () => {
  it('previews the complete selected square plan, including mirror direction', async () => {
    const preflight = vi.fn(async () => ({ ok: true as const }));
    const port: RoomTemplatePlacementPort = { preflight, place: vi.fn(async () => {}) };
    const tool = new RoomTemplateTool(port);
    tool.select('cell-large', true);
    const { plan } = await tool.inspectAt({ x: 10, y: 20 });
    expect(plan.width).toBe(6);
    expect(plan.height).toBe(7);
    expect(plan.doorSquares).toContainEqual({ x: 13, y: 26 });
    expect(plan.objects).toHaveLength(3);
    expect(preflight).toHaveBeenCalledWith({ templateId: 'cell-large', origin: { x: 10, y: 20 }, mirrorX: true });
  });

  it('refuses before submission if any square is blocked, then submits one template request when clear', async () => {
    let blocked = true;
    const place = vi.fn(async () => {});
    const port: RoomTemplatePlacementPort = {
      preflight: vi.fn(async () => blocked
        ? { ok: false as const, reason: 'structure-occupied' as const, tile: { x: 4, y: 7 } }
        : { ok: true as const }),
      place,
    };
    const tool = new RoomTemplateTool(port);
    tool.select('cell-basic');
    expect(await tool.placeAt({ x: 3, y: 4 })).toEqual({ ok: false, reason: 'structure-occupied', tile: { x: 4, y: 7 } });
    expect(place).not.toHaveBeenCalled();
    blocked = false;
    expect(await tool.placeAt({ x: 3, y: 4 })).toEqual({ ok: true });
    expect(place).toHaveBeenCalledOnce();
    expect(place).toHaveBeenCalledWith({ templateId: 'cell-basic', origin: { x: 3, y: 4 } });
  });
});



describe('room-template mouse arming', () => {
  it('stays inactive while browsing, and changes revision when replacing an armed plan', () => {
    const tool = new RoomTemplateTool({ preflight: async () => ({ ok: true }), place: async () => {} });
    expect(tool.isArmed()).toBe(false);
    tool.select('cell-basic');
    expect(tool.isArmed()).toBe(false);
    tool.arm();
    expect(tool.isArmed()).toBe(true);
    const first = tool.revision;
    tool.select('cell-large');
    expect(tool.revision).toBeGreaterThan(first);
    tool.standDown();
    expect(tool.isArmed()).toBe(false);
  });
});
