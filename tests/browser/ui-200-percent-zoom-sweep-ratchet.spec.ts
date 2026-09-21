import { expect, test } from './network-changed-fixture';

import { UI_SCALES, WINDOWS, fails, faults, sweep } from './page-zoom-sweep';

/**
 * **The 200 % page-zoom sweep may shrink and may not grow** (issues
 * [#1164](https://github.com/woogitsu/lockstate/issues/1164) and
 * [#1312](https://github.com/woogitsu/lockstate/issues/1312)).
 *
 * ## The hole this closes, in the words of the issue that found it
 *
 * The sweep is the repository's instrument for one of the 2026-09-13
 * delivery's acceptance rows -- *"Powiększenie 200%, długie tłumaczenia"*
 * against *"Brak utraty treści i działań"* -- and it lives in a
 * `*.playtest.ts`, which **no CI job collects**. That is deliberate and
 * `browser-suites.ts` gives the reason. #1312 gives the price:
 *
 * > A number that moves only when a person runs it by hand cannot announce
 * > that it has gone stale. Between `2559eb14` and `ab3bf7ba` nobody ran it.
 *
 * It had gone stale in the worst available direction. Both rollout documents
 * recorded three combinations as **cleared**, and those three were exactly the
 * three that had come back -- on the same element, in the same failure mode,
 * unannounced, for 65 commits.
 *
 * ## Why a ratchet rather than the failing set asserted
 *
 * The playtest's own objection to being made a gate is that asserting the
 * failing set *pins the defect in place*: the next person to repair the strip
 * would have to edit the gate to go green, which is the shape of a test that
 * discourages the repair it describes. That objection is about an assertion
 * of **equality**, and it is right.
 *
 * A subset assertion is not that. `KNOWN_FAILING` below is a ceiling, not a
 * target: every combination may leave it and none may join it. A repair needs
 * no edit here to land -- it simply stops appearing. A regression at any of
 * the 23 combinations that pass, or a *new* combination going red, is named on
 * the way in rather than 65 commits later.
 *
 * The cost of the looseness is stated rather than hidden: a tree that repairs
 * ten of these stays green here with a list that over-describes it. That is
 * the failure mode the playtest's printed count is for, and it is a document
 * going stale rather than a defect going unannounced.
 *
 * ## The list, and what it is a reading of
 *
 * **Twelve**, read off the sweep on this branch. It was **13** before
 * `observeChromeRowOverflow` (`src/main.ts`, #1164 follow-up) closed
 * `375x812@125%` -- the one of the thirteen whose `.display-scale__cycle`
 * centre landed on `.theme-control` for a reason local to the chrome row
 * rather than the vertical budget the other twelve share, verified by
 * dropping that control's icon and legend (both already `aria-hidden`) when a
 * real measurement finds them not fitting, and confirmed against the whole
 * sweep rather than the one combination alone. It was **16** on `faf7ce3a`
 * before the two repairs in `ui-hud-chrome-under-page-zoom.spec.ts`, **31**
 * before #1318, and **29** at `2559eb14`.
 *
 * **The twelve that remain are not one thing split from a different one.**
 * The owner's ruling of 2026-09-21 read the thirteen as nine rail-budget
 * collapses plus four chrome-row overflows, the second group closable on its
 * own; measured against the full sweep, only `375x812@125%` was. The other
 * three named with it (`1024x768@175%`, `390x844@150%`, `375x812@150%`)
 * share `.display-scale__cycle`'s centre landing on a foreign element, but
 * closing that reachability fault for them costs `.hud__aside` the height
 * `overflow: hidden` no longer contains -- the same vertical budget the nine
 * already share, reached by a different door. Every remaining entry fails on
 * that budget at the larger interface scales: the strip, the tab bar and the
 * rail cannot all have the height they ask for in a viewport halved in both
 * axes, and which of them gives way is a decision this file does not make.
 *
 * ## The ruling that folded the last three in, and the premise it corrected
 *
 * **The paragraph above attributes the nine-plus-four split to the owner, and
 * that attribution is wrong. It is marked here rather than rewritten**
 * (`docs/AGENT_WORKFLOW.md` §4). The split was the **coordinating session's
 * own premise**, carried into the options that session wrote for the owner:
 * that the four chrome-row combinations were a real local defect separable
 * from the nine. Measured against the full sweep, one of the four was --
 * `375x812@125%`, closed by `observeChromeRowOverflow` -- and three were not.
 * The reading the owner ruled on therefore came from this side of the
 * conversation, and that belongs beside the ruling rather than behind it.
 *
 * **Shown that measurement, the owner ruled on 2026-09-21 that the three are
 * folded into the deferred set rather than carried as separate work.**
 * Offered that against keeping them as their own item, they chose the option
 * labelled:
 *
 * > Złóż do odroczonych
 *
 * ("Fold into the deferred set.") **The provenance is the weaker of the two
 * kinds this repository distinguishes, and is recorded as such**: the label
 * of a clickable option this session wrote and the owner picked, not a
 * sentence they typed. `AGENTS.md`'s entries for the 2026-09-08 and
 * 2026-09-09 releases record the same distinction of themselves. Read it as
 * settling what its label says and nothing wider.
 *
 * **What the ruling changes here is a description, not a number.**
 * `KNOWN_FAILING` is twelve before it and twelve after it -- the three were
 * already on the list. What moves is that the list stops being nine plus
 * three and is one group of twelve waiting on one decision: which of the
 * strip, the tab bar and the rail gives way. Nothing is added; the ceiling
 * may be lowered and never raised, and none of the three is to be repaired
 * ahead of that decision.
 *
 * ## The one condition on it
 *
 * The figures above were read in a tree with **no Git LFS bytes**, so the
 * actor atlases were pointer text in every run. The sweep measures DOM
 * geometry and `elementFromPoint`, not canvas contents, and the world canvas
 * is laid out either way -- but this is the first run of this list in a tree
 * that holds the art. If CI reports a combination here that the list does not
 * carry, the list is what is wrong, and the failure message says which one.
 */

/**
 * The ceiling. Sorted as the sweep visits them, so a diff reads in sweep
 * order rather than alphabetically.
 *
 * **All twelve are one group** -- the deferred zero-sum vertical
 * rail/strip/tab-bar question, by the 2026-09-21 ruling recorded above. There
 * is no second grouping in this list for an entry to be moved into, which is
 * why that fold is a paragraph rather than a diff here. The list may be
 * lowered and never raised.
 */
const KNOWN_FAILING: readonly string[] = [
  '1280x720@200%',
  '1024x768@175%',
  '1024x768@200%',
  '900x600@150%',
  '900x600@175%',
  '900x600@200%',
  '390x844@150%',
  '390x844@175%',
  '390x844@200%',
  '375x812@150%',
  '375x812@175%',
  '375x812@200%',
];

test.describe('the 200 % page-zoom sweep (#1164)', () => {
  test('no combination fails that was not already failing', async ({ page }) => {
    test.slow();

    const reports = await sweep(page);

    // Non-vacuity, three ways. A sweep that visited fewer combinations, or one
    // whose scales never arrived, would satisfy the subset assertion by
    // measuring less rather than by the interface being better.
    expect(reports, 'the sweep did not visit all 36 combinations').toHaveLength(
      WINDOWS.length * UI_SCALES.length,
    );
    expect(
      reports.filter((row) => row.appliedScale !== String(row.scale)).map((row) => row.label),
      'the stored interface scale did not arrive at these combinations',
    ).toEqual([]);
    expect(
      new Set(KNOWN_FAILING).size,
      'KNOWN_FAILING lists a combination twice, so its length is not its size',
    ).toBe(KNOWN_FAILING.length);

    const failing = reports.filter(fails);
    const known = new Set(KNOWN_FAILING);
    const added = failing.filter((row) => !known.has(row.label));

    expect(
      added.map((row) => `${row.label}\n    ${faults(row).join('\n    ')}`),
      `${added.length} combination(s) fail the 200 % page-zoom sweep that were passing. ` +
        'Either the change under test took content or a control away from a player at that ' +
        'viewport and interface scale, or the sweep has been re-derived and KNOWN_FAILING in ' +
        'this file is the thing that is out of date. Run ' +
        '`playtest-1164-the-200-percent-sweep.playtest.ts` for the whole picture.',
    ).toEqual([]);

    // Not an assertion: the sweep's own count, printed so a green run still
    // reports whether the list is over-describing the tree.
    const cleared = KNOWN_FAILING.filter((label) => !failing.some((row) => row.label === label));
    console.log(
      `[1164] ratchet: ${failing.length} of ${reports.length} fail, ceiling ${KNOWN_FAILING.length}` +
        (cleared.length === 0 ? '' : `; cleared since the ceiling was read: ${cleared.join(', ')}`),
    );
  });
});
