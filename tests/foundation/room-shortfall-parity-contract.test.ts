import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { defaultLocaleEnCatalog } from '../../src/content/default-locale-en';

const REPOSITORY_ROOT = path.resolve(__dirname, '../..');

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(REPOSITORY_ROOT, relativePath), 'utf8');
}

/**
 * The Rooms panel's readiness predicate is written twice, and the two copies
 * live on opposite sides of a boundary that forbids importing across it.
 *
 * `shortfallOf` in `src/ui/simulation-room-needs.ts` is what the panel counts
 * a room as short by. `RoomNeedsClearedNoticeSystem` (issue #1006 finding 3)
 * has to answer the same question on the worker side to decide when to
 * announce that a room stopped being short of anything -- and it may not
 * import that module, because `AGENTS.md` boundary 3 gives the HUD to the main
 * thread and the tick to the worker. So it restates the expression, and its
 * own comment says the two "must not be able to disagree".
 *
 * **A comment is not a gate, and this is the gate.** Without it, adding a
 * third contributor to the panel's `shortfallOf` leaves the worker computing
 * the old sum, and the alert then tells a player the room
 * *"is no longer short anything the Rooms panel checks for"* while the panel
 * is still checking for something. That is a false sentence reaching a player,
 * which is what `AGENTS.md`'s fourth reservation exists to prevent -- so the
 * drift this pins is not a tidiness concern.
 *
 * **It compares source text, which is the honest limit of what can be checked
 * from here.** The worker's copy is an inline expression rather than a
 * function, and the panel's is not exported, so neither can be called and
 * compared behaviourally without changing production shape for a test's
 * convenience. Reformatting either side fails this test; that is intended
 * rather than tolerated, because a reformat is a reason to look at both.
 */
describe('the Rooms-panel shortfall predicate, written twice (#1006)', () => {
  const EXPRESSION = "row.requirementSummary.missingCapability + (row.access === 'no-way-in' ? 1 : 0)";

  it('is spelled identically in the panel and in the worker system that announces it', async () => {
    const panel = await read('src/ui/simulation-room-needs.ts');
    const worker = await read('src/simulation/rooms/room-needs-cleared-notice.ts');

    // Vacuity guards. Each side must still hold the construct this pins,
    // otherwise the assertion below passes by comparing nothing.
    expect(
      panel,
      '`src/ui/simulation-room-needs.ts` no longer declares `shortfallOf`; this contract is pinning a predicate that has moved or gone.',
    ).toContain('function shortfallOf(');
    expect(
      worker,
      '`room-needs-cleared-notice.ts` no longer computes a `shortfall`; if the announcement stopped depending on the panel\'s predicate, delete this contract rather than satisfying it.',
    ).toContain('const shortfall =');

    expect(
      panel,
      `the panel's \`shortfallOf\` no longer spells the shortfall as \`${EXPRESSION}\`. If the rule genuinely changed, change the worker's copy in \`src/simulation/rooms/room-needs-cleared-notice.ts\` in the same commit and update this contract -- an alert saying a room "is no longer short anything the Rooms panel checks for" is false the moment the two disagree.`,
    ).toContain(EXPRESSION);

    expect(
      worker,
      `\`room-needs-cleared-notice.ts\` no longer spells the shortfall as \`${EXPRESSION}\`, so the worker and the panel can now disagree about which rooms are ready -- and the worker is the one that talks to the player.`,
    ).toContain(EXPRESSION);
  });

  /*
   * **This assertion reads the resolved catalogue value, and the first draft
   * of it read the source file instead -- which was vacuous.** The phrase
   * appears twice in `default-locale-en.ts`: once at `:1394` inside the
   * docblock arguing for it, and once at `:1411` as the value. Deleting it
   * from the value left the docblock's copy behind, the file still
   * "contained" it, and the test stayed green through the exact drift it
   * exists to catch. Proved by doing it, in a throwaway worktree, before this
   * rewrite.
   *
   * That is the same trap issue #890 recorded from the other side -- it went
   * looking for "withheld" in this file and found *"the two grep hits are
   * both comments"*. A file-text assertion about a player-facing string is
   * worth what a grep is worth, and this repository has already paid for
   * learning that once.
   */
  it('is announced by a sentence that disclaims what the predicate cannot establish', () => {
    // `roomPerimeterAccess` returns `'doorway'` on the first door in the
    // perimeter and never asks whether anything can reach it (#1006's own
    // comment, and #938's measurement: hygiene 0 of 255, 162 route failures).
    // So the predicate above is satisfied by a cell walled in behind its own
    // door, and the sentence must not read as "you can get in".
    const sentence = defaultLocaleEnCatalog.get('hud.alert.event.rooms.needs-cleared');

    expect(
      sentence,
      '`hud.alert.event.rooms.needs-cleared` is not in the catalogue at all; this contract is pinning a sentence that has been renamed or removed.',
    ).toBeDefined();

    expect(
      sentence,
      'the room-ready alert no longer disclaims reachability. `shortfallOf === 0` is satisfied by a room sealed behind its own door, so a sentence without that clause is a promise the code does not keep.',
    ).toContain('that is not a claim anyone can get in');
  });
});
