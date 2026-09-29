import type { CameraPoseAction } from '../../input/camera-pose-input';
import { element } from '../primitives/dom';

export interface CameraAngleLabels {
  readonly title: string;
  readonly yawLeft: string;
  readonly yawRight: string;
  readonly elevationUp: string;
  readonly elevationDown: string;
  readonly reset: string;
  readonly yawLeftShort: string;
  readonly yawRightShort: string;
  readonly elevationUpShort: string;
  readonly elevationDownShort: string;
  readonly resetShort: string;
  readonly yaw: string;
  readonly elevation: string;
}

export interface CameraAngleControl {
  readonly element: HTMLElement;
  updatePose(pose: { readonly yawRadians: number; readonly elevationRadians: number }): void;
  setAvailable(available: boolean): void;
}

export function cameraAngleDegrees(radians: number): number {
  return Math.round(radians * 180 / Math.PI);
}

/** Presentation only. The host mounts this beside the zoom control once an angle-capable scene is active. */
export function createCameraAngleControl(
  labels: CameraAngleLabels,
  onActivate: (action: CameraPoseAction) => void,
): CameraAngleControl {
  const reading = element('output', { className: 'hud-camera-angle__reading' });
  const actions: readonly [CameraPoseAction, string, string][] = [
    ['yaw-left', labels.yawLeft, labels.yawLeftShort],
    ['yaw-right', labels.yawRight, labels.yawRightShort],
    ['elevation-up', labels.elevationUp, labels.elevationUpShort],
    ['elevation-down', labels.elevationDown, labels.elevationDownShort],
    ['reset', labels.reset, labels.resetShort],
  ];
  const buttons = actions.map(([action, label, shortLabel]) => {
    const button = element('button', {
      className: 'ui-action hud-camera-angle__button',
      attributes: { type: 'button', 'aria-label': label, title: label },
      text: shortLabel,
    });
    button.addEventListener('click', () => onActivate(action));
    return button;
  });
  const legend = element('span', { className: 'hud-camera-angle__legend', text: labels.title });
  const control = element('div', {
    className: 'hud-camera-angle',
    attributes: { role: 'group', 'aria-label': labels.title },
    children: [legend, reading, ...buttons],
  });
  return {
    element: control,
    updatePose(pose): void {
      reading.textContent = `${labels.yaw} ${cameraAngleDegrees(pose.yawRadians)}° · ${labels.elevation} ${cameraAngleDegrees(pose.elevationRadians)}°`;
    },
    setAvailable(available): void {
      for (const button of buttons) button.disabled = !available;
    },
  };
}
