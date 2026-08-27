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
 *
 * ## Append. Never insert, never reorder, never rename.
 *
 * `CurrentActionComponent.actionIndex` is a **positional** index into this
 * array (`components.ts`'s `actionIndexOf` is `findIndex` over it), and the
 * save carries that integer verbatim -- `save-schema.ts`'s `actionIndex` is a
 * bare `z.array(z.number().int())` with no id anywhere near it. Its sibling
 * `needs` object in the same schema is keyed **by name** and says why in a
 * comment: *"reordering `NEED_IDS` in the simulation must not silently
 * reinterpret an existing save's levels as a different need."* Nothing gives
 * this array that protection.
 *
 * So an entry inserted anywhere but the end shifts every index above it and
 * silently reinterprets every in-flight action in every existing save: a
 * prisoner who was showering resumes doing something else, at the same phase
 * and the same `phaseStartedAtTick`, with no error, no decode failure and no
 * `SAVE_SCHEMA_VERSION` mismatch to notice it by. Appending moves no existing
 * index, so it needs no migration and no version bump -- which is the only
 * reason a catalogue entry is a content change here rather than a persistence
 * one ([ADR 0042](../../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
 * decision 1 corrects issue #440 on exactly this point).
 *
 * `tests/unit/prisoners-action-catalog.test.ts` is the gate that fails on an
 * insertion, a reorder or a rename; this paragraph is only the reason.
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
  /*
   * Association: the out-of-cell time a regime block grants rather than an
   * activity it provides. **Appended, and the paragraph above this array is
   * why that word carries the whole change.**
   *
   * `ACTION_CATEGORIES` has had `'free-association'` since issue #24 and two
   * of `GENERAL_POPULATION_REGIME`'s ten blocks allow it, but nothing was ever
   * authored under it. `RIOT_ALLOWED_CATEGORIES` is
   * `['free-association', 'recreation']` (`../incidents/riot-regime.ts`), both
   * recreation actions target a zoned room, and a room the player has not
   * zoned resolves to nothing -- so a rioting prisoner in a prison with no
   * yard and no common room had **no candidate at all** and
   * `beginNextAction` fell through to `unmetDemandCycles` for every
   * reconsideration of every day the riot lasted.
   *
   * Three choices, in the order they were decided:
   *
   * - **`own-accommodation`, with no `requiredObjectCapability`.** An entry
   *   that exists to close a hole has to resolve wherever the hole opens, and
   *   a `room-catalog-id` target would need the very room whose absence opens
   *   it. `own-accommodation` resolves by instance id and re-checks neither
   *   the capability nor the concurrent-use ceiling
   *   (`action-system.ts`'s `resolveTargetInstance` and `claimUseIfNeeded`),
   *   so a capability named here would be data nothing reads --
   *   `action.eat-in-cell` names none for the same reason. The prisoner
   *   associates on their own wing; a dedicated association room is content
   *   this catalogue does not have and a player cannot yet zone.
   * - **No need effect at all, which is what makes appending it to a live
   *   catalogue safe.** `scoreAction` sums `deficit x effect` over the
   *   action's effects, so an action with none scores exactly 0 -- the
   *   minimum any candidate can score, since no effect is negative. It can
   *   therefore never displace an action addressing a need that is even
   *   slightly unmet, in any block, in any prison. It is reached when nothing
   *   better resolves, and in an exact 0-0 tie, where every legal alternative
   *   is at `NEED_MAX` and there is by definition nothing to lose by
   *   associating instead. Whether association should *serve* a need is a
   *   balance question ADR 0042 routes to its own step 4, and answering it
   *   here would trade that invariant for a number nobody has decided.
   * - **60 ticks**, three `ActionSystem` reconsideration cycles. Long enough
   *   to read as an activity in `projectPrisonerDetail` rather than as a
   *   flicker between idle cycles; short enough that a prisoner takes up a
   *   yard, a shower or a meal soon after the player provides one. A long
   *   commitment to an action that fulfils nothing is the one way this entry
   *   could make a prison worse than it found it.
   *
   * **It fulfils no need, and `ActionSystem` therefore does not stamp
   *   `needFulfilledLastTick` while it runs** -- see `continuePerforming`,
   *   which learned to ask rather than assume when this entry arrived.
   */
  {
    id: 'action.free-association', category: 'free-association', target: { kind: 'own-accommodation' },
    needEffectsPerTick: {}, minDurationTicks: 60,
  },
];
