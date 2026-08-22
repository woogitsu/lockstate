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
};
