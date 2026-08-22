/**
 * Pure retention policy: given the existing generation IDs (oldest first)
 * and a newly written one, returns the updated list plus which generations
 * fell out of the retention window and should be deleted.
 *
 * `keep` counts the current generation *and* its previous safe copies, so
 * `keep: 3` satisfies "current plus at least two previous safe generations".
 */
export interface GenerationRetentionResult {
  readonly generationIds: readonly string[];
  readonly toDelete: readonly string[];
}

export function applyGenerationRetention(
  existing: readonly string[],
  newGenerationId: string,
  keep: number,
): GenerationRetentionResult {
  if (!Number.isInteger(keep) || keep < 1) {
    throw new RangeError('keep must be a positive integer.');
  }

  const updated = [...existing, newGenerationId];
  const overflow = updated.length - keep;
  if (overflow <= 0) {
    return { generationIds: updated, toDelete: [] };
  }

  return { generationIds: updated.slice(overflow), toDelete: updated.slice(0, overflow) };
}
