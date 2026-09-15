import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  BUDGET,
  RELEASE_COMMIT_SUBJECT,
  WARNING_REMAINING_THRESHOLD,
  computeAnchorSpend,
  countLandingsSince,
  formatAnchorSpendAnnotation,
} from '../../tooling/anchor-budget-spend.mjs';

/**
 * `.github/workflows/version.yml` runs `tooling/anchor-budget-spend.mjs` after
 * every successful version bump, to make the anchor budget's spend visible at
 * the one moment `ci.yml` never runs a check: the release commit itself (see
 * that script's own header, and the commit that added this test, for why).
 *
 * This exercises the two pure functions that script's CLI mode is a thin
 * wrapper around, against fabricated states rather than only today's tree --
 * today's spend proves almost nothing on its own, because it is one point on
 * a scale that runs from 0 to well past the budget.
 *
 * ## The unit these tests assert changed on 2026-09-15
 *
 * They were written against a spend counted in `package.json` patch numbers,
 * because that is what the script counted and what
 * `adr-status-queue-anchor-contract.test.ts` then enforced. #1214 moved the
 * gate to merges -- first-parent commits since the anchor that are not
 * `chore(release): v<x.y.z>` -- and left this annotation counting releases, so
 * for a day the number printed at every release commit measured a budget no
 * gate held. On `b08e0d0c` (v0.0.635), anchor `c6337952` (v0.0.622), the script
 * printed *"13 of 10 ... exceeded by 3 releases"* while the gate failed with
 * *"12 merges have landed on main since, against a budget of 10"*.
 *
 * So `computeAnchorSpend` now takes a counter, and these cases fabricate one
 * rather than building a git history per case. `countLandingsSince` -- the real
 * one, which shells out to git -- has its own cases below against this
 * repository's actual history, because a counter that is only ever faked is a
 * counter nothing tests.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const ANCHOR_CONTRACT_PATH = join(REPOSITORY_ROOT, 'tests/foundation/adr-status-queue-anchor-contract.test.ts');

function anchorLine(sha: string, version: string): string {
  return `Re-anchored at \`main\` @ \`${sha}\` (**v${version}**)`;
}

/** A counter that answers `merges` for any sha, so a case can name one number. */
function counting(merges: number): (anchorSha: string) => number | null {
  return () => merges;
}

/** A checkout that cannot answer: the anchor is absent, or git would not run. */
const uncountable = (): number | null => null;

describe('anchor-budget-spend.mjs: computeAnchorSpend', () => {
  it('reports spend 0 the moment no merge has landed since the anchor', () => {
    const result = computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.10', counting(0));
    expect(result).toEqual({
      kind: 'ok',
      anchorSha: 'abc1234',
      anchorVersion: '0.0.10',
      packageVersion: '0.0.10',
      spend: 0,
      remaining: BUDGET,
      releases: 0,
    });
  });

  it('reports spend 9 -- one merge inside the budget, one remaining', () => {
    const result = computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.19', counting(9));
    expect(result).toMatchObject({ kind: 'ok', spend: 9, remaining: 1, releases: 9 });
  });

  it('reports spend 10 -- exactly at the budget, nothing remaining', () => {
    const result = computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.20', counting(10));
    expect(result).toMatchObject({ kind: 'ok', spend: 10, remaining: 0 });
  });

  it('reports spend 11 -- one merge over the budget, without ever printing a negative "remaining"', () => {
    const result = computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.21', counting(11));
    expect(result).toMatchObject({ kind: 'ok', spend: 11, remaining: -1 });
    // `remaining` may go negative internally -- `formatAnchorSpendAnnotation`
    // is what must never surface that as a printed negative number, and the
    // sibling describe block below checks the message text for exactly that.
  });

  it('takes its spend from the merge count and not from the version numbers, which is the whole of the 2026-09-15 divergence', () => {
    // The measured case: v0.0.622 anchored, v0.0.635 shipped, 12 merges. The
    // release arithmetic says 13. Only one of those is a budget any gate holds.
    const result = computeAnchorSpend(anchorLine('c6337952', '0.0.622'), '0.0.635', counting(12));
    expect(result).toMatchObject({ kind: 'ok', spend: 12, remaining: -2, releases: 13 });
  });

  it('reports the merge spend even where the release count would have inverted the verdict', () => {
    // `7e9c3043` (v0.0.623) against anchor `d57b97ba` (v0.0.612): eleven
    // releases, nine merges. The old unit called that over budget; the gate
    // passed there.
    const result = computeAnchorSpend(anchorLine('d57b97ba', '0.0.612'), '0.0.623', counting(9));
    expect(result).toMatchObject({ kind: 'ok', spend: 9, remaining: 1, releases: 11 });
  });

  it('reports "no-anchor" rather than a spend when the file declares no anchor line at all', () => {
    expect(computeAnchorSpend('Nothing about an anchor here.', '0.0.20', counting(3))).toEqual({ kind: 'no-anchor' });
  });

  it('reports "no-anchor" for a malformed anchor line missing its sha, rather than matching it loosely', () => {
    // The sha capture group is mandatory in the shared pattern; a line with
    // an empty `@ ()` must fail to match at all, not match with an empty sha.
    expect(computeAnchorSpend('Re-anchored at `main` @ (**v0.0.10**)', '0.0.20', counting(3))).toEqual({
      kind: 'no-anchor',
    });
  });

  it('reports "multiple-anchors" with the count when the file declares more than one live anchor -- the exact defect de88526a\'s predecessor state carried', () => {
    const text = [anchorLine('abc1234', '0.0.10'), anchorLine('def5678', '0.0.15')].join('\n');
    expect(computeAnchorSpend(text, '0.0.20', counting(3))).toEqual({ kind: 'multiple-anchors', count: 2 });
  });

  it('reports "uncountable" rather than a number when the checkout cannot be measured against the anchor', () => {
    expect(computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.20', uncountable)).toEqual({
      kind: 'uncountable',
      anchorSha: 'abc1234',
      anchorVersion: '0.0.10',
      packageVersion: '0.0.20',
    });
  });

  it('still carries the release figure as a negative when the anchor names a version the tree has not reached', () => {
    // Not a separate result kind any more: the spend is countable in merges
    // regardless, and the version mismatch is reported beside it. What must not
    // happen is the mismatch going unmentioned -- the format block below has it.
    expect(computeAnchorSpend(anchorLine('abc1234', '0.0.30'), '0.0.20', counting(2))).toMatchObject({
      kind: 'ok',
      spend: 2,
      releases: -10,
    });
  });

  it('carries a null release figure across a minor or major line rather than a nonsense patch count', () => {
    expect(computeAnchorSpend(anchorLine('abc1234', '0.1.5'), '0.0.20', counting(2))).toMatchObject({
      kind: 'ok',
      spend: 2,
      releases: null,
    });
  });
});

describe('anchor-budget-spend.mjs: formatAnchorSpendAnnotation', () => {
  it('prints at ::notice:: level well under budget, and never omits the unit, the spend or what remains', () => {
    const { level, message } = formatAnchorSpendAnnotation(
      computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.10', counting(0)),
    );
    expect(level).toBe('notice');
    expect(message).toContain('0 of 10 merges');
    expect(message).toContain('10 merges remain');
    // The unit on screen is the point of the 2026-09-15 change: a bare "0 of
    // 10" beside a version number reads as releases to anyone who remembers
    // the old annotation.
    expect(message).toContain('first-parent commit on main that is not a chore(release) bump');
  });

  it(`escalates to ::warning:: at ${String(WARNING_REMAINING_THRESHOLD)} merges remaining, singular grammar included`, () => {
    const { level, message } = formatAnchorSpendAnnotation(
      computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.19', counting(9)),
    );
    expect(level).toBe('warning');
    expect(message).toContain('9 of 10 merges');
    expect(message).toContain('1 merge remains');
    expect(message).not.toContain('1 merges');
  });

  it('stays at ::notice:: one merge short of the warning threshold', () => {
    const spendAtThresholdMinusOne = BUDGET - (WARNING_REMAINING_THRESHOLD + 1);
    const { level } = formatAnchorSpendAnnotation(
      computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.10', counting(spendAtThresholdMinusOne)),
    );
    expect(level).toBe('notice');
  });

  it('reports the budget as fully spent, not "exceeded by 0", exactly at the budget', () => {
    const { level, message } = formatAnchorSpendAnnotation(
      computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.20', counting(10)),
    );
    expect(level).toBe('warning');
    expect(message).toContain('10 of 10 merges');
    expect(message).not.toContain('exceeded by 0');
    expect(message).toContain('fully spent');
  });

  it('names merges over budget without ever printing a negative number, once the budget is exceeded', () => {
    const { level, message } = formatAnchorSpendAnnotation(
      computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.21', counting(11)),
    );
    expect(level).toBe('warning');
    expect(message).toContain('11 of 10 merges');
    expect(message).toContain('exceeded by 1 merge');
    expect(message).not.toMatch(/-\d/u);
  });

  it('prints the release count as an aside that says it is not the unit, so the two numbers can never be read as one', () => {
    const { message } = formatAnchorSpendAnnotation(
      computeAnchorSpend(anchorLine('c6337952', '0.0.622'), '0.0.635', counting(12)),
    );
    expect(message).toContain('12 of 10 merges');
    expect(message).toContain('13 release numbers');
    expect(message).toContain('not the unit this budget counts');
  });

  it('is explicit rather than silent when the anchor line is missing', () => {
    const { level, message } = formatAnchorSpendAnnotation(computeAnchorSpend('no anchor here', '0.0.20', counting(3)));
    expect(level).toBe('warning');
    expect(message).toContain('declares no');
    expect(message).not.toMatch(/-?\d+ of \d+/u); // no fabricated spend number
  });

  it('is explicit rather than silent when the file declares more than one anchor', () => {
    const text = [anchorLine('abc1234', '0.0.10'), anchorLine('def5678', '0.0.15')].join('\n');
    const { level, message } = formatAnchorSpendAnnotation(computeAnchorSpend(text, '0.0.20', counting(3)));
    expect(level).toBe('warning');
    expect(message).toContain('2 "Re-anchored at" lines');
  });

  it('gives up on a number, loudly, when the checkout cannot be measured against the anchor', () => {
    const { level, message } = formatAnchorSpendAnnotation(
      computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.20', uncountable),
    );
    expect(level).toBe('warning');
    expect(message).toContain('cannot be measured against it');
    expect(message).not.toMatch(/-?\d+ of \d+/u);
  });

  it('does not stay quiet about an anchor naming a version ahead of the tree, even at a comfortable merge spend', () => {
    const { level, message } = formatAnchorSpendAnnotation(
      computeAnchorSpend(anchorLine('abc1234', '0.0.30'), '0.0.20', counting(2)),
    );
    // Two merges is well inside the budget, so the spend alone would print at
    // ::notice::. The anchor line is still wrong, and that is the escalation.
    expect(level).toBe('warning');
    expect(message).toContain('has not reached yet');
    expect(message).not.toMatch(/-\d/u);
  });

  it('says so rather than inventing arithmetic when the anchor is on another major.minor line', () => {
    const { level, message } = formatAnchorSpendAnnotation(
      computeAnchorSpend(anchorLine('abc1234', '0.1.5'), '0.0.20', counting(2)),
    );
    expect(level).toBe('warning');
    expect(message).toContain('2 of 10 merges');
    expect(message).toContain('not in the same major.minor line');
  });

  it('every message names itself as non-blocking, since the annotation must never read as a gate', () => {
    const cases = [
      computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.10', counting(0)),
      computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.20', counting(10)),
      computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.19', counting(9)),
      computeAnchorSpend('no anchor', '0.0.20', counting(3)),
      computeAnchorSpend(anchorLine('abc1234', '0.0.30'), '0.0.20', counting(2)),
      computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.20', uncountable),
    ] as const;

    for (const result of cases) {
      const { level, message } = formatAnchorSpendAnnotation(result);
      if (level === 'warning') {
        expect(
          message,
          `a ::warning:: annotation must say it does not block the workflow, or a reader could mistake it for a failing gate: ${message}`,
        ).toMatch(/informational only|does not (block|fail)/u);
      }
    }
  });
});

describe('anchor-budget-spend.mjs: countLandingsSince, against this repository', () => {
  it('counts the window the release unit was blind to, and drops exactly the release commit in it', () => {
    // `491fcdce` (v0.0.541)..`450c9819` (v0.0.542): first-parent history
    // carries 21 commits there -- nineteen merges, one direct push
    // (`80b54a97`), and one `chore(release)` bump -- so the gate's unit counts
    // 20 while the release arithmetic counts one.
    //
    // Counted between two fixed commits rather than from HEAD, because a test
    // whose expected number moves with every merge is a test nobody can read.
    // Both shas are real commits on `main`, which
    // `documentation-commit-citation-contract` requires of shas in this corpus
    // anyway.
    expect(countLandingsSince('491fcdce', REPOSITORY_ROOT, '450c9819')).toBe(20);
  });

  it('returns null rather than a number for a commit this history does not contain', () => {
    // A 40-hex sha no checkout of this repository resolves. The annotation then
    // prints the sentence that says so, instead of the zero a "count whatever
    // git printed" implementation would have reported.
    expect(countLandingsSince('0'.repeat(40), REPOSITORY_ROOT)).toBeNull();
  });

  it('drops a chore(release) subject and keeps everything else, which is what RELEASE_COMMIT_SUBJECT is for', () => {
    // The pattern is a second copy of the gate's, and its anchoring is the part
    // that bites: a merge of a branch NAMED after a release must still count,
    // and prose about a release is not the workflow's own commit.
    expect(RELEASE_COMMIT_SUBJECT.test('chore(release): v0.0.635')).toBe(true);
    expect(RELEASE_COMMIT_SUBJECT.test('Merge pull request #1 from woogitsu/chore(release): v0.0.635')).toBe(false);
    expect(RELEASE_COMMIT_SUBJECT.test('chore(release): v0.1 prep')).toBe(false);
  });
});

describe('anchor-budget-spend.mjs: stays in sync with its sources of truth', () => {
  it('BUDGET matches ANCHOR_STALENESS_BUDGET_MERGES in adr-status-queue-anchor-contract.test.ts', () => {
    // Read by name out of the gate's source text rather than imported, for the
    // reason that script's header gives: it runs from `version.yml` with no
    // build step and no `tests/` toolchain.
    //
    // This used to read `ANCHOR_STALENESS_BUDGET_RELEASES`, a constant that is
    // no longer declared anywhere, and that kept the annotation pinned to a
    // number the gate had stopped enforcing -- the coupling held while the
    // meaning drifted, which is the quietest way for a sync test to be useless.
    const anchorContractSource = readFileSync(ANCHOR_CONTRACT_PATH, 'utf8');
    const match = /const ANCHOR_STALENESS_BUDGET_MERGES = (\d+);/u.exec(anchorContractSource);

    expect(
      match?.[1],
      `tests/foundation/adr-status-queue-anchor-contract.test.ts no longer declares ANCHOR_STALENESS_BUDGET_MERGES in the form this test reads. tooling/anchor-budget-spend.mjs's BUDGET is a second literal copy of that number (see that file's header for why it cannot import the test instead), and this is what keeps the two from drifting apart.`,
    ).toBeDefined();

    expect(
      BUDGET,
      `tooling/anchor-budget-spend.mjs's BUDGET (${String(BUDGET)}) no longer matches ANCHOR_STALENESS_BUDGET_MERGES (${String(match?.[1])}) in adr-status-queue-anchor-contract.test.ts. The annotation would then report a spend against a budget the actual gate does not enforce -- update BUDGET to match, in the same commit that changes either.`,
    ).toBe(Number(match?.[1]));
  });

  it('counts the same shape of commit the gate counts, so the two cannot disagree about what a merge is', () => {
    // The unit, not just the number. `RELEASE_COMMIT_SUBJECT` is the whole of
    // the definition -- everything on first-parent `main` that is not this is
    // history a re-anchor pass has to read -- so a change to one copy that is
    // not made to the other puts this annotation back where it was before
    // 2026-09-15: a number measuring something no gate holds.
    const anchorContractSource = readFileSync(ANCHOR_CONTRACT_PATH, 'utf8');
    const match = /const RELEASE_COMMIT_SUBJECT = (\/.+\/[a-z]*);/u.exec(anchorContractSource);

    expect(
      match?.[1],
      'tests/foundation/adr-status-queue-anchor-contract.test.ts no longer declares RELEASE_COMMIT_SUBJECT in the form this test reads. tooling/anchor-budget-spend.mjs carries a second copy of that pattern, and this is what keeps the two counting the same commits.',
    ).toBeDefined();

    expect(
      RELEASE_COMMIT_SUBJECT.toString(),
      `tooling/anchor-budget-spend.mjs's RELEASE_COMMIT_SUBJECT (${RELEASE_COMMIT_SUBJECT.toString()}) no longer matches the gate's (${String(match?.[1])}). The annotation and the gate would then count different commits as merges -- change both in the same commit.`,
    ).toBe(match?.[1]);
  });

  it('WARNING_REMAINING_THRESHOLD is strictly less than BUDGET, so every spend is reachable at ::notice:: before it ever reaches ::warning::', () => {
    // Non-vacuous bound: a threshold at or above BUDGET would mean this
    // annotation never prints at ::notice:: at all, which is the "always
    // ::warning::" shape the module header explicitly argues against.
    expect(WARNING_REMAINING_THRESHOLD).toBeGreaterThan(0);
    expect(WARNING_REMAINING_THRESHOLD).toBeLessThan(BUDGET);
  });
});
