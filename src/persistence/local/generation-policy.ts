/**
 * Pure retention policy: given the existing generation IDs (oldest first)
 * and a newly written one, returns the updated list plus which generations
 * fell out of the retention window and should be deleted.
 *
 * `keep` counts the current generation *and* its previous safe copies, so
 * `keep: 3` satisfies "current plus at least two previous safe generations".
 *
 * **The window may hold `keep + 1` for as long as one generation is
 * unproven** (#438). A generation the player's own play produced restores by
 * construction; an imported file has decoded, migrated and checksummed and
 * has not been shown to restore at all, so it is written into a spare slot
 * rather than over one of the player's saves. There is at most one such slot
 * and `applyConfirmedRetention` closes it the moment the generation holding
 * it restores. `applyProvisionalRetention` carries the measurement.
 */
export interface GenerationRetentionResult {
  readonly generationIds: readonly string[];
  readonly toDelete: readonly string[];
}

function requireKeep(keep: number): void {
  if (!Number.isInteger(keep) || keep < 1) {
    throw new RangeError('keep must be a positive integer.');
  }
}

/**
 * Drops generations from the **oldest** end until the window is within
 * budget. The one place this file deletes a save the player's own play
 * produced, and every caller below routes its trimming through it so there
 * is one definition of which end gives way.
 */
function trimOldest(generationIds: readonly string[], keep: number): GenerationRetentionResult {
  const overflow = generationIds.length - keep;
  if (overflow <= 0) {
    return { generationIds: [...generationIds], toDelete: [] };
  }
  return { generationIds: generationIds.slice(overflow), toDelete: generationIds.slice(0, overflow) };
}

export function applyGenerationRetention(
  existing: readonly string[],
  newGenerationId: string,
  keep: number,
): GenerationRetentionResult {
  requireKeep(keep);
  return trimOldest([...existing, newGenerationId], keep);
}

/**
 * Retention for a generation that has **not been shown to restore**: an
 * imported file (#438).
 *
 * `applyGenerationRetention` evicts the oldest generation the moment the
 * window is full, which is right for a save this session just produced --
 * the player was playing it, so it restores by construction. It is wrong for
 * a file the player was handed. An import decodes, migrates and checksums
 * before it reaches storage, and none of that establishes that it *restores*:
 * the repository's own `tests/fixtures/persistence/save-v1-in-progress.json`
 * passed all three and then threw. Measured on `main` @ `6f671d5` (v0.0.136), against a
 * prison holding three of the player's own generations: one import took the
 * window from `[gen-1, gen-2, gen-3]` to `[gen-2, gen-3, gen-4]`, and three
 * imports with no load between them left `[gen-4, gen-5, gen-6]` -- every
 * save the player had, deleted by files that could not be loaded, before
 * anything had tried to load them.
 *
 * So an import is written into a **spare** slot instead: the window may hold
 * `keep + 1` generations while one of them is unproven, and
 * `applyConfirmedRetention` closes it back to `keep` once the imported
 * generation has actually restored.
 *
 * **The spare slot is reused, not granted again**, which is what bounds the
 * window. A window already over `keep` can only be over it because a previous
 * import took the spare slot and nothing has confirmed it since -- every
 * other write here trims back to `keep` -- so a second import retires that
 * occupant rather than the player's oldest save. One unproven generation is
 * lost, and it is a file the player still has on disk; the alternative is
 * losing one they do not.
 *
 * Exactly one is retired per call, never a run of them, so a window that is
 * over budget for some *other* reason -- a build that lowered
 * `keepGenerations` between sessions -- converges one import at a time
 * instead of having its newest saves trimmed off in a single write.
 */
export function applyProvisionalRetention(
  existing: readonly string[],
  newGenerationId: string,
  keep: number,
): GenerationRetentionResult {
  requireKeep(keep);
  const reusedSpareSlot = existing.length > keep ? existing.slice(existing.length - 1) : [];
  const retained = existing.slice(0, existing.length - reusedSpareSlot.length);
  return { generationIds: [...retained, newGenerationId], toDelete: reusedSpareSlot };
}

/**
 * The window once the generation holding the spare slot has restored: the
 * ordinary budget applies again, and the oldest generation gives way exactly
 * as it would have on the write.
 *
 * This is `applyGenerationRetention`'s trimming without the append, so an
 * import that works costs the player the same generation it always did --
 * only later, and only once the file has proved it is worth the slot.
 */
export function applyConfirmedRetention(
  generationIds: readonly string[],
  keep: number,
): GenerationRetentionResult {
  requireKeep(keep);
  return trimOldest(generationIds, keep);
}
