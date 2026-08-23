import type { NeedId } from './needs';
import type { ActionCategory } from './regime';

export type ActionTarget =
  | { readonly kind: 'own-accommodation' }
  | { readonly kind: 'room-catalog-id'; readonly roomCatalogId: string };

export interface ActionDefinition {
  readonly id: string;
  readonly category: ActionCategory;
  /** Level gained per tick while performing (see action-system.ts) -- data, not a per-action if-chain. */
  readonly needEffectsPerTick: Partial<Record<NeedId, number>>;
  readonly target: ActionTarget;
  /** Room instance must have an object with this capability tag (src/content/object-catalog.ts) -- absent means any instance of the target room type qualifies. */
  readonly requiredObjectCapability?: string;
  readonly minDurationTicks: number;
}

/**
 * Representative candidate-action set (issue #24) spanning every core
 * need and regime category. Deliberately small and data-driven -- adding
 * a new action is one more entry here, never a new branch in
 * utility-ai.ts or action-system.ts.
 */
export const DEFAULT_ACTIONS: readonly ActionDefinition[] = [
  {
    id: 'action.sleep', category: 'sleep', target: { kind: 'own-accommodation' },
    requiredObjectCapability: 'sleep-surface', needEffectsPerTick: { sleep: 2, safety: 0.2 }, minDurationTicks: 200,
  },
  {
    id: 'action.eat-meal', category: 'meal', target: { kind: 'room-catalog-id', roomCatalogId: 'room.canteen' },
    requiredObjectCapability: 'dining', needEffectsPerTick: { hunger: 4 }, minDurationTicks: 40,
  },
  {
    id: 'action.eat-in-cell', category: 'meal', target: { kind: 'own-accommodation' },
    needEffectsPerTick: { hunger: 3 }, minDurationTicks: 40,
  },
  {
    id: 'action.use-toilet', category: 'hygiene', target: { kind: 'own-accommodation' },
    requiredObjectCapability: 'sanitation', needEffectsPerTick: { bladder: 5 }, minDurationTicks: 10,
  },
  {
    id: 'action.shower', category: 'hygiene', target: { kind: 'room-catalog-id', roomCatalogId: 'room.shower-room' },
    requiredObjectCapability: 'hygiene', needEffectsPerTick: { hygiene: 4 }, minDurationTicks: 30,
  },
  {
    id: 'action.yard-recreation', category: 'recreation', target: { kind: 'room-catalog-id', roomCatalogId: 'room.yard' },
    needEffectsPerTick: { recreation: 3, safety: 0.1 }, minDurationTicks: 100,
  },
  {
    id: 'action.common-room-recreation', category: 'recreation', target: { kind: 'room-catalog-id', roomCatalogId: 'room.common-room' },
    needEffectsPerTick: { recreation: 2 }, minDurationTicks: 80,
  },
  {
    id: 'action.classroom-education', category: 'education', target: { kind: 'room-catalog-id', roomCatalogId: 'room.classroom' },
    needEffectsPerTick: { recreation: 1 }, minDurationTicks: 120,
  },
];
