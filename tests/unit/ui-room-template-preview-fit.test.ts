import { describe, expect, it, vi } from 'vitest';
import { RoomTemplatePreviewFitController } from '../../src/ui/room-template-preview-fit';
import { computeObliqueFit } from '../../src/rendering/camera/oblique-fit';
import { screenToGround, type ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';

describe('approved full-plan fit/pan lock', () => {
  it('repicks the first genuine movement after keyboard arming instead of retaining the old hover', () => {
    let offset = 0;
    const fit = vi.fn(() => { offset += 10; return true; });
    const controller = new RoomTemplatePreviewFitController({
      pick: p => ({ x: p.x + offset, y: p.y }), size: () => ({ width: 7, height: 16 }),
      revision: () => 1, fit,
    });
    controller.prepare({ x: 2, y: 3 }, false);
    controller.prepare({ x: 3, y: 3 }, true);
    expect(controller.pick({ x: 3, y: 3 })).toEqual({ x: 13, y: 3 });
    expect(fit).toHaveBeenCalledTimes(2);
  });
  it.each([
    { width: 7, height: 16, movedOrigin: { x: 21, y: 15 } },
    { width: 16, height: 7, movedOrigin: { x: 26, y: 11 } },
  ])(
    'retains keyboard-armed hover through the first stationary click after fitting $width by $height', size => {
      let camera: ObliqueCameraState = {
        target: { x: 1024, y: 1024 }, viewport: { width: 1920, height: 1080 },
        zoom: 1.25, yawRadians: -Math.PI / 4, elevationRadians: Math.PI / 4,
      };
      const screen = { x: 880, y: 380 };
      const fit = vi.fn((origin: { x: number; y: number }) => {
        const result = computeObliqueFit({ camera,
          groundBounds: { left: origin.x * 64, top: origin.y * 64,
            right: (origin.x + size.width) * 64, bottom: (origin.y + size.height) * 64 },
          safeScreenBounds: { left: 550, top: 94, right: 1556, bottom: 1072 },
          cursorScreen: screen, mode: 'pan-locked',
        });
        expect(result.fits).toBe(true);
        camera = result.camera;
        return true;
      });
      const controller = new RoomTemplatePreviewFitController({
        pick: point => {
          const ground = screenToGround(point, camera);
          return { x: Math.floor(ground.x / 64), y: Math.floor(ground.y / 64) };
        }, size: () => size, revision: () => 1,
        viewRevision: () => JSON.stringify(camera), fit,
      });
      // Before keyboard arming, the bridge has retained this map hover, but its
      // unarmed frame has reset the controller. The first armed frame is a poll.
      expect(controller.pick(screen)).toEqual({ x: 17, y: 13 });
      controller.prepare(screen, false);
      expect(controller.pick(screen)).toEqual({ x: 17, y: 13 });
      const fittedCamera = camera;
      controller.prepare(screen, true); // pointerdown, with no physical movement
      controller.prepare(screen, true); // pointerup, with no physical movement
      expect(controller.pick(screen)).toEqual({ x: 17, y: 13 });
      expect(camera).toEqual(fittedCamera);
      expect(fit).toHaveBeenCalledOnce();
      controller.prepare({ x: screen.x + 1, y: screen.y }, true);
      expect(controller.pick(screen)).toEqual(size.movedOrigin);
      expect(fit).toHaveBeenCalledTimes(2);
    });
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
