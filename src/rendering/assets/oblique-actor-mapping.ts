/** Existing Blender actor catalogues. Unknown roles retain the scene fallback. */
const ACTOR_ASSET_IDS: Readonly<Record<string, string>> = Object.freeze({
  'actor.prisoner': 'actor.prisoner.base',
  'actor.guard': 'actor.guard.base',
});

export function obliqueAssetIdForActor(logicalId: string): string | undefined {
  return ACTOR_ASSET_IDS[logicalId];
}
