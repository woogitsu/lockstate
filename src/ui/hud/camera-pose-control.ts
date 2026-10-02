import { createActionButton } from '../primitives/action-button';
import { element } from '../primitives/dom';
import type { HudLocalizer } from './view-model';

export type CameraPoseStep = (axis: 'yaw' | 'elevation', direction: -1 | 1) => void;

/** The host supplies this port only when the active renderer can change its pose. */
export function createCameraPoseControl(localizer: HudLocalizer, onStep: CameraPoseStep): HTMLElement {
  const choices = [
    ['yaw', -1, 'input.action.camera.rotate.left'],
    ['yaw', 1, 'input.action.camera.rotate.right'],
    ['elevation', 1, 'input.action.camera.tilt.up'],
    ['elevation', -1, 'input.action.camera.tilt.down'],
  ] as const;
  return element('div', {
    className: 'hud-camera-pose',
    children: choices.map(([axis, direction, key]) => {
      const button = createActionButton({
        label: localizer.format(key),
        onActivate: () => { onStep(axis, direction); },
      }).element;
      button.dataset.cameraPoseAxis = axis;
      button.dataset.cameraPoseDirection = String(direction);
      return button;
    }),
  });
}
