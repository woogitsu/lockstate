import { describe, expect, it, vi } from 'vitest';
import { RoomTemplatePreviewFitController } from '../../src/ui/room-template-preview-fit';

describe('approved full-plan fit/pan lock', () => {
  it('refits a stationary locked origin after camera pose or viewport changes without looping', () => {
    let view = 0, offset = 0;
    const fit = vi.fn((_origin: { x: number; y: number }) => { offset += 10; view += 1; return true; });
    const c = new RoomTemplatePreviewFitController({ pick: p => ({ x: p.x + offset, y: p.y }), size: () => ({ width: 7, height: 16 }), revision: () => 1, viewRevision: () => String(view), fit });
    c.prepare({ x: 2, y: 3 }, true);
    view += 1;
    c.prepare({ x: 2, y: 3 }, false);
    expect(fit.mock.calls[1]?.[0]).toEqual({ x: 2, y: 3 });
    c.prepare({ x: 2, y: 3 }, false);
    expect(fit).toHaveBeenCalledTimes(2);
    expect(c.pick({ x: 2, y: 3 })).toEqual({ x: 2, y: 3 });
  });

  it('preserves the exact chosen origin through camera movement, polling and release', () => {
    let offset = 0;
    const fit = vi.fn(() => { offset = 30; return true; });
    const c = new RoomTemplatePreviewFitController({ pick: p => ({ x: p.x + offset, y: p.y }), size: () => ({ width: 7, height: 16 }), revision: () => 1, fit });
    c.prepare({ x: 4, y: 6 }, true);
    c.prepare({ x: 4, y: 6 }, false);
    c.prepare({ x: 4, y: 6 }, true);
    expect(c.pick({ x: 4, y: 6 })).toEqual({ x: 4, y: 6 });
    expect(fit).toHaveBeenCalledOnce();
    c.prepare({ x: 5, y: 6 }, true);
    expect(c.pick({ x: 5, y: 6 })).toEqual({ x: 35, y: 6 });
    expect(fit).toHaveBeenCalledTimes(2);
  });
  it('refits changed/mirrored selections at the retained origin, and resets on cancel', () => {
    let revision = 1, offset = 0;
    const fit = vi.fn((_origin: { x: number; y: number }) => { offset += 10; return true; });
    const c = new RoomTemplatePreviewFitController({ pick: p => ({ x: p.x + offset, y: p.y }), size: () => ({ width: 7, height: 16 }), revision: () => revision, fit });
    c.prepare({ x: 2, y: 3 }, true);
    revision += 1;
    c.prepare({ x: 2, y: 3 }, false);
    expect(fit.mock.calls[1]?.[0]).toEqual({ x: 2, y: 3 });
    c.reset();
    c.prepare({ x: 2, y: 3 }, true);
    expect(c.pick({ x: 2, y: 3 })).toEqual({ x: 22, y: 3 });
  });
  it('does not lock an already visible or unfittable preview', () => {
    let offset = 0;
    const c = new RoomTemplatePreviewFitController({ pick: p => ({ x: p.x + offset, y: p.y }), size: () => ({ width: 7, height: 16 }), revision: () => 1, fit: () => false });
    c.prepare({ x: 2, y: 3 }, true);
    offset = 8;
    expect(c.pick({ x: 2, y: 3 })).toEqual({ x: 10, y: 3 });
  });
});
