import {
  type EntitlementProjection,
  type EntitlementTrustTier,
  type SaveSlotEntitlementView,
  evaluateSaveSlotAccess,
  evaluateSaveSlotEntitlement,
} from '../../services/entitlements/projection';
import { type AccountSessionState, hasCloudIdentity } from './account-session';

/**
 * What the save-slot cap means for *this* player right now.
 *
 * #34 requires the five-free-slot policy to be "account metadata/configuration
 * rather than hard-coded simulation logic", with "a safe offline cached
 * projection". Both already exist, in `src/services/entitlements/`:
 * `evaluateSaveSlotEntitlement` implements ADR 0013's degradation ladder
 * (`verified` -> `cached` under the offline grace window -> `base`), and every
 * unhappy path lands on the free tier so the client can never invent a right.
 * This module adds no arithmetic and no second copy of the number 5.
 *
 * What it adds is the one thing that layer cannot know: **a cap applies only
 * when there is a cloud identity at all.** `enforce_prison_slot_capacity`
 * counts rows in `public.prisons`; a player who has never signed in has none,
 * so applying a five-slot cap to their local prisons would be inventing a
 * restriction the server does not impose (ADR XXXX decision 4).
 */
export interface CloudSlotAvailability {
  /**
   * `false` when there is no cloud identity: local play is uncapped and every
   * other field is descriptive only. A UI must not show "3 of 5" to a
   * local-only player.
   */
  readonly applies: boolean;
  readonly capacity: number;
  readonly usedCloudSlots: number;
  readonly canCreateCloudSlot: boolean;
  /**
   * Existing cloud prisons beyond the currently trusted capacity -- which
   * happens when a paid grant expires or cannot be confirmed, never when one
   * is bought.
   */
  readonly overCapacitySlots: number;
  /** How much the capacity above is trusted; `cached` means it is running on the offline grace window. */
  readonly trust: EntitlementTrustTier;
  /**
   * Invariant carried in the type, mirroring `SaveSlotAccess`: losing capacity
   * never deletes, locks or hides a prison. It only stops a *new* cloud slot
   * from being created until the entitlement is confirmed again.
   */
  readonly existingPrisonsRemainPlayable: true;
}

export interface CloudSlotAvailabilityInput {
  readonly account: AccountSessionState;
  /** The cached, validated projection for this account; `undefined` when there is none, which the ladder reads as the free tier. */
  readonly projection: EntitlementProjection | undefined;
  /** How many prisons this account already occupies in the cloud. */
  readonly usedCloudSlots: number;
  readonly now: number;
}

export function projectCloudSlotAvailability(input: CloudSlotAvailabilityInput): CloudSlotAvailability {
  const view: SaveSlotEntitlementView = evaluateSaveSlotEntitlement({ projection: input.projection, now: input.now });
  const access = evaluateSaveSlotAccess(view, input.usedCloudSlots);
  const applies = hasCloudIdentity(input.account);

  return {
    applies,
    capacity: access.capacity,
    usedCloudSlots: access.usedSlots,
    // A local-only player cannot create a *cloud* slot for a different reason
    // than a capped one: there is nowhere to create it. Reporting `false` for
    // both and `applies: false` alongside is what keeps the two apart without
    // a second boolean.
    canCreateCloudSlot: applies && access.canCreateNewSlot,
    overCapacitySlots: access.overCapacitySlots,
    trust: access.tier,
    existingPrisonsRemainPlayable: true,
  };
}
