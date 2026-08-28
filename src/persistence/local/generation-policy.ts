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
 *
 * **And it may hold one more again for a generation this build has refused as
 * `unsupported-by-this-build`** (#432). That generation is *quarantined*: it
 * is kept, it is not counted against `keep`, and no rule in this file evicts
 * it. See `isQuarantinedGenerationId`.
 */
export interface GenerationRetentionResult {
  readonly generationIds: readonly string[];
  readonly toDelete: readonly string[];
}

/**
 * The mark a generation id carries once this build has refused it as
 * `unsupported-by-this-build` and kept it anyway (#432, ADR 0065 decision 2).
 *
 * ## Why the mark is in the id and not in a field of its own
 *
 * The obvious form is a `quarantinedGenerationIds` array on the slot record,
 * and `docs/PERSISTENCE.md` had already written down why it is the wrong one:
 * `prisonSlotMetadataSchema` is `.strict()`, so a slot record written by a
 * newer build fails validation on an older one, `requirePrisonSlotMetadata`
 * throws `CorruptSlotMetadataError`, and `PrisonSaveRepository.list()` refuses
 * **the player's whole prison list** rather than one prison. A quarantine
 * whose price is that a downgrade hides every save is not insurance.
 *
 * A generation id is a string this repository generates and nothing else
 * interprets: `generationIds` is `z.array(z.string().min(1))` at every version
 * the schema has ever had, so a marked id is a record an older build reads
 * without complaint. What an older build then does with it is the ordinary
 * thing -- it offers the generation to the restore path, is refused, and
 * demotes it exactly as it would have before #432. Marked or not, the failure
 * mode of a downgrade is unchanged; only this build keeps more.
 *
 * The mark therefore costs no save-schema version, no slot-schema change and
 * no migration. It costs one rename of the stored record, which
 * `PrisonSaveRepository.quarantineGeneration` performs inside the transaction
 * that rewrites the window, so the id in `generationIds` and the key the bytes
 * are stored under never disagree.
 *
 * `!` is not a character `defaultGenerationId` can emit (`gen-<base36>-<base36>`),
 * and `writeGeneration` refuses an injected id that carries the mark, so a
 * generation is quarantined only by having been quarantined.
 *
 * ## This module imports nothing, and two `src/ui/**` modules depend on that
 *
 * `readableGenerationIds` below is imported *as a value* by
 * `src/ui/save-panel.ts` and `src/ui/account/save-list-projection.ts`, so that
 * the counts those show the player exclude a generation this build cannot
 * offer. `tests/unit/ui-orchestration-boundaries.test.ts` records both as
 * `kind: 'value'` and both reasons rest on this file having **no imports at
 * all** -- that is what stops a store, a schema or a package reaching the UI
 * tier through it. That gate compares direct imports and does not follow what
 * an imported module pulls in, so **adding an import here makes those two
 * reasons false and leaves the suite green.** Keep this file import-free, or
 * rewrite both entries in the same change.
 */
const QUARANTINE_MARKER = '!unreadable!';

/** Whether this generation has been set aside as unreadable by this build (#432). */
export function isQuarantinedGenerationId(generationId: string): boolean {
  return generationId.startsWith(QUARANTINE_MARKER);
}

/** The marked form of an id. Idempotent, so quarantining twice is quarantining once. */
export function quarantinedGenerationId(generationId: string): string {
  return isQuarantinedGenerationId(generationId) ? generationId : `${QUARANTINE_MARKER}${generationId}`;
}

/**
 * The id a quarantined generation had before it was set aside -- restored to
 * it once a build has actually restored the generation, so the mark never
 * outlives the verdict that put it there.
 */
export function releasedGenerationId(generationId: string): string {
  return isQuarantinedGenerationId(generationId) ? generationId.slice(QUARANTINE_MARKER.length) : generationId;
}

/**
 * The generations this build can offer the player: everything the window
 * holds except what it has set aside as unreadable.
 *
 * Used by the retention rules below, and by the two places that count
 * generations *for the player* (`src/ui/account/save-list-projection.ts` and
 * the save panel's list row). Counting a quarantined generation there would
 * tell the player a prison has a copy to fall back to when the only extra copy
 * is one this build has just refused -- which is a claim the code does not
 * keep, so quarantine is deliberately invisible above this layer. Whether it
 * *should* be visible is a player-facing promise and therefore the owner's.
 */
export function readableGenerationIds(generationIds: readonly string[]): readonly string[] {
  return generationIds.filter((id) => !isQuarantinedGenerationId(id));
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
 *
 * Quarantined generations are neither counted nor eligible (#432). They sit
 * outside `keep` entirely, so a prison carrying one still keeps its full
 * complement of readable saves and the quarantined bytes survive however long
 * the player goes on playing -- which is the whole of what quarantine buys.
 * Without that, a quarantined generation would be evicted after `keep` further
 * autosaves: 90 seconds at the default cadence, against a fix that ships in
 * weeks.
 */
function trimOldest(generationIds: readonly string[], keep: number): GenerationRetentionResult {
  const evictable = readableGenerationIds(generationIds);
  const overflow = evictable.length - keep;
  if (overflow <= 0) {
    return { generationIds: [...generationIds], toDelete: [] };
  }
  const toDelete = evictable.slice(0, overflow);
  return { generationIds: generationIds.filter((id) => !toDelete.includes(id)), toDelete };
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
 *
 * Quarantined generations take no part in any of this (#432): they are not
 * the spare slot's occupant, they cannot be the "one over budget" that grants
 * it, and an import never retires one.
 */
export function applyProvisionalRetention(
  existing: readonly string[],
  newGenerationId: string,
  keep: number,
): GenerationRetentionResult {
  requireKeep(keep);
  const evictable = readableGenerationIds(existing);
  const reusedSpareSlot = evictable.length > keep ? evictable.slice(evictable.length - 1) : [];
  const retained = existing.filter((id) => !reusedSpareSlot.includes(id));
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
