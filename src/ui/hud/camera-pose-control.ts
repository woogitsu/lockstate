import { createIconButton } from '../primitives/icon-button';
import { element } from '../primitives/dom';
import type { HudLocalizer } from './view-model';

export type CameraPoseStep = (axis: 'yaw' | 'elevation', direction: -1 | 1) => void;

/** The host supplies this port only when the active renderer can change its pose. */
export function createCameraPoseControl(localizer: HudLocalizer, onStep: CameraPoseStep): HTMLElement {
  const choices = [
    ['yaw', -1, 'input.action.camera.rotate.left', 'undo'],
    ['yaw', 1, 'input.action.camera.rotate.right', 'redo'],
    ['elevation', 1, 'input.action.camera.tilt.up', 'chevron'],
    ['elevation', -1, 'input.action.camera.tilt.down', 'chevron'],
  ] as const;
  return element('div', {
    className: 'hud-camera-pose',
    children: choices.map(([axis, direction, key, icon]) => {
      const button = createIconButton({
        icon, variant: 'bordered',
        label: localizer.format(key),
        onActivate: () => { onStep(axis, direction); },
      }).element;
      button.dataset.cameraPoseAxis = axis;
      button.dataset.cameraPoseDirection = String(direction);
      return button;
    }),
  });
}
