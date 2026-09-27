import { DEFAULT_KEYBOARD_BINDINGS } from './bindings';

/**
 * Dormant orientation input contract. The current top-down renderer does not
 * consume these intents; no live key, mouse listener or HUD control uses it.
 * A projection implementation can connect the adapter without changing the
 * remappable gesture vocabulary or letting a build drag rotate the view.
 */
export type OrientationAxis = 'yaw' | 'tilt';
export type OrientationDirection = -1 | 1;

export interface OrientationKeyBinding {
  readonly code: string;
  readonly axis: OrientationAxis;
  readonly direction: OrientationDirection;
}

export interface OrientationMouseBinding {
  readonly button: number;
  readonly modifier: 'alt' | 'ctrl' | 'shift';
  readonly degreesPerPixel: number;
}

export interface OrientationBindings {
  readonly keys: readonly OrientationKeyBinding[];
  readonly mouse: OrientationMouseBinding;
}

export const DEFAULT_ORIENTATION_BINDINGS: OrientationBindings = {
  keys: [
    { code: 'KeyQ', axis: 'yaw', direction: -1 },
    { code: 'KeyE', axis: 'yaw', direction: 1 },
    { code: 'PageUp', axis: 'tilt', direction: 1 },
    { code: 'PageDown', axis: 'tilt', direction: -1 },
  ],
  mouse: { button: 2, modifier: 'alt', degreesPerPixel: 0.4 },
};

/** Reject ambiguous remaps before a future settings adapter activates them. */
export function validateOrientationBindings(bindings: OrientationBindings): boolean {
  const reserved = new Set(DEFAULT_KEYBOARD_BINDINGS.map((binding) => binding.code));
  const codes = bindings.keys.map((binding) => binding.code);
  return codes.every((code) => code.length > 0 && !reserved.has(code))
    && new Set(codes).size === codes.length
    && Number.isFinite(bindings.mouse.degreesPerPixel)
    && bindings.mouse.degreesPerPixel > 0;
}

export interface OrientationIntent {
  readonly axis: OrientationAxis;
  readonly degrees: number;
}

export interface OrientationGate {
  /** True from pointer-down until the placement gesture ends or is cancelled. */
  readonly placementInProgress: boolean;
  /** Text fields and modal dialogs retain the keyboard. */
  readonly context: 'world' | 'construction' | 'modal' | 'text-entry';
}

function available(gate: OrientationGate): boolean {
  return !gate.placementInProgress && (gate.context === 'world' || gate.context === 'construction');
}

/** One key press produces one step; callers may remap the physical code. */
export function orientationKeyIntent(
  code: string,
  bindings: OrientationBindings,
  gate: OrientationGate,
  stepDegrees = 15,
): OrientationIntent | undefined {
  if (!available(gate)) return undefined;
  const binding = bindings.keys.find((item) => item.code === code);
  if (binding === undefined) return undefined;
  return { axis: binding.axis, degrees: binding.direction * stepDegrees };
}

/** A modifier plus secondary-button drag reserves the primary build gesture. */
export function orientationMouseIntents(
  gesture: { readonly button: number; readonly altKey: boolean; readonly ctrlKey: boolean; readonly shiftKey: boolean; readonly dx: number; readonly dy: number },
  bindings: OrientationBindings,
  gate: OrientationGate,
): readonly OrientationIntent[] {
  if (!available(gate) || gesture.button !== bindings.mouse.button) return [];
  const modifierPressed = bindings.mouse.modifier === 'alt' ? gesture.altKey : bindings.mouse.modifier === 'ctrl' ? gesture.ctrlKey : gesture.shiftKey;
  if (!modifierPressed) return [];
  return [
    { axis: 'yaw', degrees: gesture.dx * bindings.mouse.degreesPerPixel },
    { axis: 'tilt', degrees: -gesture.dy * bindings.mouse.degreesPerPixel },
  ];
}

export interface CameraOrientationState {
  readonly yawDegrees: number;
  readonly tiltDegrees: number;
}

export const DEFAULT_CAMERA_ORIENTATION: CameraOrientationState = { yawDegrees: 0, tiltDegrees: 0 };

/** Desired angles only. Applying them to a Phaser projection is a separate feature. */
export function reduceCameraOrientation(state: CameraOrientationState, intent: OrientationIntent): CameraOrientationState {
  if (intent.axis === 'yaw') {
    return { ...state, yawDegrees: ((state.yawDegrees + intent.degrees) % 360 + 360) % 360 };
  }
  return { ...state, tiltDegrees: state.tiltDegrees + intent.degrees };
}

/** Machine-readable angle readout for a future active camera control. */
export function cameraOrientationReadout(state: CameraOrientationState): { readonly yaw: number; readonly tilt: number } {
  return { yaw: Math.round(state.yawDegrees), tilt: Math.round(state.tiltDegrees) };
}
