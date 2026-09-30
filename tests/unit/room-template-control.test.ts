import { describe, expect, it, vi } from 'vitest';
import type { RoomTemplatePlacementIntent } from '../../src/ui/hud/room-template-control';

describe('room template HUD intent', () => {
  it('keeps the atomic command payload closed and copies the origin', () => {
    const intent: RoomTemplatePlacementIntent = { templateId: 'cell-basic', origin: { x: 4, y: 7 }, mirrorX: false };
    const onPlace = vi.fn<(value: RoomTemplatePlacementIntent) => void>();
    onPlace({ ...intent, origin: { ...intent.origin } });
    expect(onPlace).toHaveBeenCalledWith(intent);
    expect(Object.keys(intent).sort()).toEqual(['mirrorX', 'origin', 'templateId']);
  });
});