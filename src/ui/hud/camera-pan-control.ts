import { createIconButton } from '../primitives/icon-button';
import { element } from '../primitives/dom';
import type { HudLocalizer } from './view-model';

export type CameraPanDirection = 'up' | 'down' | 'left' | 'right';
export type CameraPanStep = (direction: CameraPanDirection) => void;

/** Existing localized directions; no simulation command or keyboard remap. */
export function createCameraPanControl(localizer: HudLocalizer, onStep: CameraPanStep): HTMLElement {
  const choices = [
    ['left', 'input.action.camera.left'], ['up', 'input.action.camera.up'],
    ['down', 'input.action.camera.down'], ['right', 'input.action.camera.right'],
  ] as const;
  return element('div', {
    className: 'hud-camera-pan',
    children: choices.map(([direction, key]) => {
      const button = createIconButton({ icon: 'chevron', variant: 'bordered',
        label: localizer.format(key), onActivate: () => { onStep(direction); } }).element;
      button.dataset.cameraPanDirection = direction;
      return button;
    }),
  });
}
