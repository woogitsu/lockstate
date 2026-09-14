import { describe, expect, it } from 'vitest';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { decodePrisonSlotMetadata } from '../../src/persistence/local/slot-metadata-schema';
import type { PrisonSlotMetadata } from '../../src/persistence/local/store';

/**
 * #1143: `MemoryLocalSaveStore` staged and published like IndexedDB but did
 * not **serialise** like it, so two overlapping `readwrite` transactions both
 * read the pre-write state and the later one published over the earlier one's
 * commit -- including over keys it had never touched, because publishing
 * replaces the store's maps wholesale.
 *
 * Everything below is asserted about the double itself rather than through
 * `PrisonSaveRepository`, because the double is what changed and a test that
 * reaches it through policy cannot say which layer answered. The repository
 * -level consequence is
 * `tests/unit/persistence-stale-save-refusal.test.ts`'s "gives two
 * overlapping manual saves two different revisions".
 *
 * Real IndexedDB serialises these because `IndexedDbLocalSaveStore` opens
 * every transaction over all three object stores at once, so every pair of
 * transactions has overlapping scope; see that file's `runTransaction`.
 */
describe('#1143: MemoryLocalSaveStore serialises overlapping transactions', () => {
  function slot(prisonId: string, updatedAt: number): PrisonSlotMetadata {
    return { prisonId, gameVersion: 'test-version', currentGenerationId: undefined, generationIds: [], createdAt: 0, updatedAt };
  }

  /** Lets a test park inside a transaction until it decides to let it finish. */
  function barrier(): { readonly wait: Promise<void>; open: () => void } {
    let open!: () => void;
    const wait = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { wait, open };
  }

  it('does not let a slow transaction publish over one that was queued behind it', async () => {
    const store = new MemoryLocalSaveStore();
    const held = barrier();
    const seenBySecond: string[] = [];

    /*
     * Measured before the queue existed, with this exact shape: the slow
     * transaction's staging maps were snapshotted before the other one
     * committed, so publishing them dropped `p1` -- a record that had been
     * written and acknowledged. Two prisons, no key in common, and one still
     * lost.
     */
    const slow = store.runTransaction('readwrite', async (tx) => {
      await held.wait;
      await tx.putMetadata(slot('p2', 2));
    });

    const second = store.runTransaction('readwrite', async (tx) => {
      for (const entry of await tx.listMetadata()) seenBySecond.push(decodePrisonSlotMetadata(entry)!.prisonId);
      await tx.putMetadata(slot('p1', 1));
    });

    held.open();
    await Promise.all([slow, second]);

    // Both survive, and the second ran *after* the first published rather than
    // alongside it: it saw `p2`, which the first had not yet written when it
    // was queued.
    expect(seenBySecond).toEqual(['p2']);
    const stored = await store.runTransaction('readonly', (tx) => tx.listMetadata());
    expect(stored.map((entry) => decodePrisonSlotMetadata(entry)!.prisonId)).toEqual(['p1', 'p2']);
  });

  it('lets the second of two overlapping read-modify-write transactions see the first', async () => {
    const store = new MemoryLocalSaveStore();
    await store.runTransaction('readwrite', (tx) => tx.putMetadata(slot('p1', 0)));

    /*
     * The shape `PrisonSaveRepository.writeGeneration` is: read the slot,
     * derive the next value from what was read, write it. Two of them, started
     * without an await between, must produce 2 rather than 1 -- which is
     * #1143's `[2, 3]`-not-`[2, 2]` in miniature.
     */
    const bump = () =>
      store.runTransaction('readwrite', async (tx) => {
        const existing = decodePrisonSlotMetadata(await tx.getMetadata('p1'), 'p1');
        // A turn of the event loop between the read and the write, which is
        // what `writeGeneration` has (it decodes, allocates and re-stamps an
        // envelope in between) and what made the interleaving reachable.
        await Promise.resolve();
        await tx.putMetadata(slot('p1', (existing?.updatedAt ?? 0) + 1));
      });

    const first = bump();
    const second = bump();
    await Promise.all([first, second]);

    const bumped = decodePrisonSlotMetadata(await store.runTransaction('readonly', (tx) => tx.getMetadata('p1')), 'p1');
    expect(bumped?.updatedAt).toBe(2);
  });

  it('holds a readonly transaction opened behind a readwrite until that write has published', async () => {
    const store = new MemoryLocalSaveStore();
    const held = barrier();

    const write = store.runTransaction('readwrite', async (tx) => {
      await held.wait;
      await tx.putMetadata(slot('p1', 1));
    });
    // Queued while the write is parked, so it must observe the committed state
    // rather than the state the write found.
    const read = store.runTransaction('readonly', (tx) => tx.getMetadata('p1'));

    held.open();
    await write;

    expect(decodePrisonSlotMetadata(await read, 'p1')?.updatedAt).toBe(1);
  });

  it('still publishes nothing from a transaction that throws, and lets the queue carry on', async () => {
    const store = new MemoryLocalSaveStore();
    store.failNextWrite = new Error('quota');

    await expect(
      store.runTransaction('readwrite', async (tx) => {
        await tx.putMetadata(slot('p1', 1));
      }),
    ).rejects.toThrow('quota');

    // `failNextWrite` is consumed by the transaction that ran, not by the one
    // that was queued, so the next one proceeds normally.
    await store.runTransaction('readwrite', (tx) => tx.putMetadata(slot('p2', 1)));
    const stored = await store.runTransaction('readonly', (tx) => tx.listMetadata());
    expect(stored.map((entry) => decodePrisonSlotMetadata(entry)!.prisonId)).toEqual(['p2']);
  });
});
