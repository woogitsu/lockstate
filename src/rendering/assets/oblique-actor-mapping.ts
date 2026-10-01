/** Existing Blender actor catalogues. Unknown roles retain the scene fallback. */
const ACTOR_ASSET_IDS: Readonly<Record<string, string>> = Object.freeze({
  'actor.prisoner': 'actor.prisoner.base',
  'actor.guard': 'actor.guard.base',
  'actor.cook': 'actor.cook.base',
  'actor.medic': 'actor.medic.base',
  'actor.staff': 'actor.staff.base',
  'actor.prisoner.base': 'actor.prisoner.base',
  'actor.guard.base': 'actor.guard.base',
  'actor.cook.base': 'actor.cook.base',
  'actor.medic.base': 'actor.medic.base',
  'actor.staff.base': 'actor.staff.base',
});

export function obliqueAssetIdForActor(logicalId: string): string | undefined {
  return ACTOR_ASSET_IDS[logicalId];
}
