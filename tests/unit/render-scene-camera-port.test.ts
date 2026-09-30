import { describe, expect, it, vi } from 'vitest';
import { createRenderSceneCameraPort, type RenderSceneCameraPort } from '../../src/rendering/scene/render-scene-camera-port';

describe('render scene camera port', () => {
  it('forwards navigation and zoom operations without changing their results', () => {
    const callbacks: RenderSceneCameraPort = {
      navigateToTile: vi.fn(() => true),
      navigateToMinimapPoint: vi.fn(() => false),
      stepCameraZoom: vi.fn(),
      setMinimapSink: vi.fn(),
    };
    const port = createRenderSceneCameraPort(callbacks);

    expect(port.navigateToTile(4, 7)).toBe(true);
    expect(port.navigateToMinimapPoint(0.25, 0.75)).toBe(false);
    port.stepCameraZoom('in');
    expect(callbacks.navigateToTile).toHaveBeenCalledWith(4, 7);
    expect(callbacks.navigateToMinimapPoint).toHaveBeenCalledWith(0.25, 0.75);
    expect(callbacks.stepCameraZoom).toHaveBeenCalledWith('in');
  });

  it('keeps minimap sink registration renderer-owned', () => {
    const setMinimapSink = vi.fn();
    const callbacks: RenderSceneCameraPort = {
      navigateToTile: () => true,
      navigateToMinimapPoint: () => true,
      stepCameraZoom: () => undefined,
      setMinimapSink,
    };
    const port = createRenderSceneCameraPort(callbacks);
    const sink = vi.fn();
    port.setMinimapSink(sink);
    expect(setMinimapSink).toHaveBeenCalledWith(sink);
  });
});
