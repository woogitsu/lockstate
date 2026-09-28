import type { InputContextId } from './actions';

export type CameraPoseAction = 'yaw-left' | 'yaw-right' | 'elevation-up' | 'elevation-down' | 'reset';

export interface CameraPoseBinding {
  readonly code: string;
  readonly action: CameraPoseAction;
}

export const DEFAULT_CAMERA_POSE_BINDINGS: readonly CameraPoseBinding[] = [
  { code: 'KeyQ', action: 'yaw-left' },
  { code: 'KeyE', action: 'yaw-right' },
  { code: 'PageUp', action: 'elevation-up' },
  { code: 'PageDown', action: 'elevation-down' },
  { code: 'Home', action: 'reset' },
];

export type CameraPoseRemapResult =
  | { readonly ok: true; readonly bindings: readonly CameraPoseBinding[] }
  | { readonly ok: false; readonly reason: 'unknown-action' | 'empty-code' | 'duplicate-code' };

/** Kept separate from the shipped input settings until the oblique scene is active. */
export function remapCameraPoseBinding(
  bindings: readonly CameraPoseBinding[], action: CameraPoseAction, code: string,
): CameraPoseRemapResult {
  if (!bindings.some((binding) => binding.action === action)) return { ok: false, reason: 'unknown-action' };
  if (code.trim() === '') return { ok: false, reason: 'empty-code' };
  if (bindings.some((binding) => binding.action !== action && binding.code === code)) return { ok: false, reason: 'duplicate-code' };
  return { ok: true, bindings: bindings.map((binding) => binding.action === action ? { ...binding, code } : binding) };
}

export interface CameraPosePort {
  readonly cameraPose: { readonly yawRadians: number; readonly elevationRadians: number };
  setPoseRadians(yawRadians: number, elevationRadians: number, pivot?: { readonly x: number; readonly y: number }): void;
}

const YAW_STEP = Math.PI / 12;
const ELEVATION_STEP = Math.PI / 18;
const POINTER_RADIANS_PER_PIXEL = 0.005;
const HOME_YAW = -Math.PI / 4;
const HOME_ELEVATION = Math.PI / 4;

/**
 * One future keyboard or HUD press becomes one camera operation. This module
 * deliberately mounts no control: main.ts still runs the top-down scene, so
 * exposing these actions in the shipped HUD would promise an angle it cannot draw.
 */
export class CameraPoseInputAdapter {
  public constructor(
    private readonly camera: CameraPosePort,
    private readonly activeContexts: () => readonly InputContextId[],
    private readonly isPlacementActive: () => boolean,
    private readonly bindings: readonly CameraPoseBinding[] = DEFAULT_CAMERA_POSE_BINDINGS,
  ) {}

  public keyDown(event: {
    readonly code: string;
    readonly repeat?: boolean;
    readonly altKey?: boolean;
    readonly ctrlKey?: boolean;
    readonly metaKey?: boolean;
    readonly shiftKey?: boolean;
  }): boolean {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    const binding = this.bindings.find((item) => item.code === event.code);
    return binding === undefined ? false : this.activate(binding.action);
  }

  /** The same entry point is intended for the future on-screen buttons. */
  public activate(action: CameraPoseAction): boolean {
    if (!this.canActivate()) return false;
    const { yawRadians: yaw, elevationRadians: elevation } = this.camera.cameraPose;
    switch (action) {
      case 'yaw-left': this.camera.setPoseRadians(yaw - YAW_STEP, elevation); break;
      case 'yaw-right': this.camera.setPoseRadians(yaw + YAW_STEP, elevation); break;
      case 'elevation-up': this.camera.setPoseRadians(yaw, elevation + ELEVATION_STEP); break;
      case 'elevation-down': this.camera.setPoseRadians(yaw, elevation - ELEVATION_STEP); break;
      case 'reset': this.camera.setPoseRadians(HOME_YAW, HOME_ELEVATION); break;
    }
    return true;
  }

  /** Matches the oblique scene's right-button drag sensitivity and pointer pivot. */
  public pointerDrag(gesture: {
    readonly button: number;
    readonly dx: number;
    readonly dy: number;
    readonly pivot?: { readonly x: number; readonly y: number };
  }): boolean {
    if (gesture.button !== 2 || !this.canActivate() || !Number.isFinite(gesture.dx) || !Number.isFinite(gesture.dy)) return false;
    if (gesture.dx === 0 && gesture.dy === 0) return false;
    const { yawRadians: yaw, elevationRadians: elevation } = this.camera.cameraPose;
    this.camera.setPoseRadians(
      yaw + gesture.dx * POINTER_RADIANS_PER_PIXEL,
      elevation - gesture.dy * POINTER_RADIANS_PER_PIXEL,
      gesture.pivot,
    );
    return true;
  }

  /** The same decision the host uses to enable or disable on-screen controls. */
  public canActivate(): boolean {
    const contexts = this.activeContexts();
    return !this.isPlacementActive()
      && !contexts.includes('text-entry')
      && !contexts.includes('modal')
      && (contexts.includes('world') || contexts.includes('construction'));
  }
}
