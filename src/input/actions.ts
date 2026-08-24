export const ACTION_IDS = [
  'camera.up',
  'camera.down',
  'camera.left',
  'camera.right',
  'camera.zoom.in',
  'camera.zoom.out',
  'selection.primary',
  'build.confirm',
  'build.cancel',
  'edit.undo',
  'edit.redo',
] as const;

export type ActionId = (typeof ACTION_IDS)[number];
export type ActionBehavior = 'continuous' | 'discrete';
export type InputContextId = 'world' | 'construction' | 'modal' | 'text-entry';

export interface ActionDefinition {
  readonly id: ActionId;
  readonly behavior: ActionBehavior;
  readonly contexts: readonly InputContextId[];
  readonly descriptionKey: `input.action.${ActionId}`;
}

export interface SemanticActionEvent {
  readonly action: ActionId;
  readonly phase: 'started' | 'ended';
  readonly source: 'keyboard' | 'pointer';
}

export const ACTION_REGISTRY: Readonly<Record<ActionId, ActionDefinition>> = {
  'camera.up': {
    id: 'camera.up', behavior: 'continuous', contexts: ['world', 'construction'], descriptionKey: 'input.action.camera.up',
  },
  'camera.down': {
    id: 'camera.down', behavior: 'continuous', contexts: ['world', 'construction'], descriptionKey: 'input.action.camera.down',
  },
  'camera.left': {
    id: 'camera.left', behavior: 'continuous', contexts: ['world', 'construction'], descriptionKey: 'input.action.camera.left',
  },
  'camera.right': {
    id: 'camera.right', behavior: 'continuous', contexts: ['world', 'construction'], descriptionKey: 'input.action.camera.right',
  },
  'camera.zoom.in': {
    id: 'camera.zoom.in', behavior: 'discrete', contexts: ['world', 'construction'], descriptionKey: 'input.action.camera.zoom.in',
  },
  'camera.zoom.out': {
    id: 'camera.zoom.out', behavior: 'discrete', contexts: ['world', 'construction'], descriptionKey: 'input.action.camera.zoom.out',
  },
  'selection.primary': {
    id: 'selection.primary', behavior: 'discrete', contexts: ['world'], descriptionKey: 'input.action.selection.primary',
  },
  'build.confirm': {
    id: 'build.confirm', behavior: 'discrete', contexts: ['construction'], descriptionKey: 'input.action.build.confirm',
  },
  'build.cancel': {
    id: 'build.cancel', behavior: 'discrete', contexts: ['world', 'construction', 'modal'], descriptionKey: 'input.action.build.cancel',
  },
  /*
   * Undo and redo the last build gesture (#261).
   *
   * `discrete`, like the zoom keys and for the same reason: undo has no
   * duration, so `isActive` -- which answers "is the key down right now" --
   * cannot serve it. They are handled in `WorldScene.handleActionEvents`,
   * which acts on the `'started'` phase only, so one press is one undo.
   *
   * **`text-entry` is deliberately absent**, exactly as it is for every other
   * world action. The Build panel's two coordinate fields are the exposure:
   * `z` and `y` are characters a player types into them, and an undo that
   * fired while a field owned the keyboard would cancel a wall the player was
   * in the middle of describing (#201 is this class of defect, measured).
   *
   * `edit.` rather than `build.`, though `ConstructionSystem` is the only
   * handler of the `Undo` command today: what the key asks for is "reverse the
   * last thing I did", and the command carries no build vocabulary at all.
   */
  'edit.undo': {
    id: 'edit.undo', behavior: 'discrete', contexts: ['world', 'construction'], descriptionKey: 'input.action.edit.undo',
  },
  'edit.redo': {
    id: 'edit.redo', behavior: 'discrete', contexts: ['world', 'construction'], descriptionKey: 'input.action.edit.redo',
  },
};
