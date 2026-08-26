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
  /**
   * Room instance must have an object with this capability tag
   * (src/content/object-catalog.ts), and since issue #326 it is also **the
   * ceiling the room admits this action against**: the summed footprint width
   * of the objects in the room carrying this capability, and nothing else's.
   *
   * **Absent means any instance of the target room type qualifies, and no
   * object-derived ceiling applies** -- a stronger statement than it used to
   * be, so a `room-catalog-id` action leaves this out only when the room really
   * is unbounded by furniture. `room.yard` is the one such room in
   * `src/content/room-catalog.ts`: it requires no object at all, and the
   * previous rule read that as a ceiling of zero and admitted nobody to 64
   * tiles of open ground. `action.common-room-recreation` and
   * `action.classroom-education` had this absent for the same reason and were
   * not unbounded at all -- `room.common-room` requires two benches and
   * `room.classroom` a bookshelf and four chairs -- so they now name the
   * capability those objects already carried.
   */
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
    requiredObjectCapability: 'recreation', needEffectsPerTick: { recreation: 2 }, minDurationTicks: 80,
  },
  {
    id: 'action.classroom-education', category: 'education', target: { kind: 'room-catalog-id', roomCatalogId: 'room.classroom' },
    requiredObjectCapability: 'education', needEffectsPerTick: { recreation: 1 }, minDurationTicks: 120,
  },
];
