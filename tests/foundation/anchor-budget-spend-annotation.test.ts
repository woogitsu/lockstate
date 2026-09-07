import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  BUDGET,
  WARNING_REMAINING_THRESHOLD,
  computeAnchorSpend,
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
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const ANCHOR_CONTRACT_PATH = join(REPOSITORY_ROOT, 'tests/foundation/adr-status-queue-anchor-contract.test.ts');

function anchorLine(sha: string, version: string): string {
  return `Re-anchored at \`main\` @ \`${sha}\` (**v${version}**)`;
}

describe('anchor-budget-spend.mjs: computeAnchorSpend', () => {
  it('reports spend 0 the moment the tree sits exactly at the anchor', () => {
    const result = computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.10');
    expect(result).toEqual({ kind: 'ok', anchorVersion: '0.0.10', packageVersion: '0.0.10', spend: 0, remaining: BUDGET });
  });

  it('reports spend 9 -- one release inside the budget, one remaining', () => {
    const result = computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.19');
    expect(result).toEqual({ kind: 'ok', anchorVersion: '0.0.10', packageVersion: '0.0.19', spend: 9, remaining: 1 });
  });

  it('reports spend 10 -- exactly at the budget, nothing remaining', () => {
    const result = computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.20');
    expect(result).toEqual({ kind: 'ok', anchorVersion: '0.0.10', packageVersion: '0.0.20', spend: 10, remaining: 0 });
  });

  it('reports spend 11 -- one release over the budget, without ever printing a negative "remaining"', () => {
    const result = computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.21');
    expect(result).toEqual({ kind: 'ok', anchorVersion: '0.0.10', packageVersion: '0.0.21', spend: 11, remaining: -1 });
    // `remaining` may go negative internally -- `formatAnchorSpendAnnotation`
    // is what must never surface that as a printed negative number, and the
    // sibling describe block below checks the message text for exactly that.
  });

  it('reports "no-anchor" rather than a spend when the file declares no anchor line at all', () => {
    expect(computeAnchorSpend('Nothing about an anchor here.', '0.0.20')).toEqual({ kind: 'no-anchor' });
  });

  it('reports "no-anchor" for a malformed anchor line missing its sha, rather than matching it loosely', () => {
    // The sha capture group is mandatory in the shared pattern; a line with
    // an empty `@ ()` must fail to match at all, not match with an empty sha.
    expect(computeAnchorSpend('Re-anchored at `main` @ (**v0.0.10**)', '0.0.20')).toEqual({ kind: 'no-anchor' });
  });

  it('reports "multiple-anchors" with the count when the file declares more than one live anchor -- the exact defect de88526a\'s predecessor state carried', () => {
    const text = [anchorLine('abc1234', '0.0.10'), anchorLine('def5678', '0.0.15')].join('\n');
    expect(computeAnchorSpend(text, '0.0.20')).toEqual({ kind: 'multiple-anchors', count: 2 });
  });

  it('reports "ahead" rather than a negative spend when the anchor names a version package.json has not reached', () => {
    expect(computeAnchorSpend(anchorLine('abc1234', '0.0.30'), '0.0.20')).toEqual({
      kind: 'ahead',
      anchorVersion: '0.0.30',
      packageVersion: '0.0.20',
    });
  });

  it('reports "incomparable" rather than a nonsense patch count across a minor or major line', () => {
    expect(computeAnchorSpend(anchorLine('abc1234', '0.1.5'), '0.0.20')).toEqual({
      kind: 'incomparable',
      anchorVersion: '0.1.5',
      packageVersion: '0.0.20',
    });
  });
});

describe('anchor-budget-spend.mjs: formatAnchorSpendAnnotation', () => {
  it('prints at ::notice:: level well under budget, and never omits the spend or what remains', () => {
    const { level, message } = formatAnchorSpendAnnotation(computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.10'));
    expect(level).toBe('notice');
    expect(message).toContain('0 of 10');
    expect(message).toContain('10 releases remain');
  });

  it(`escalates to ::warning:: at ${String(WARNING_REMAINING_THRESHOLD)} releases remaining, singular grammar included`, () => {
    const { level, message } = formatAnchorSpendAnnotation(computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.19'));
    expect(level).toBe('warning');
    expect(message).toContain('9 of 10');
    expect(message).toContain('1 release remains');
    expect(message).not.toContain('1 releases');
  });

  it('stays at ::notice:: one release short of the warning threshold', () => {
    const spendAtThresholdMinusOne = BUDGET - (WARNING_REMAINING_THRESHOLD + 1);
    const packageVersion = `0.0.${String(10 + spendAtThresholdMinusOne)}`;
    const { level } = formatAnchorSpendAnnotation(computeAnchorSpend(anchorLine('abc1234', '0.0.10'), packageVersion));
    expect(level).toBe('notice');
  });

  it('reports the budget as fully spent, not "exceeded by 0", exactly at the budget', () => {
    const { level, message } = formatAnchorSpendAnnotation(computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.20'));
    expect(level).toBe('warning');
    expect(message).toContain('10 of 10');
    expect(message).not.toContain('exceeded by 0');
    expect(message).toContain('fully spent');
  });

  it('names releases over budget without ever printing a negative number, once the budget is exceeded', () => {
    const { level, message } = formatAnchorSpendAnnotation(computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.21'));
    expect(level).toBe('warning');
    expect(message).toContain('11 of 10');
    expect(message).toContain('exceeded by 1 release');
    expect(message).not.toMatch(/-\d/u);
  });

  it('is explicit rather than silent when the anchor line is missing', () => {
    const { level, message } = formatAnchorSpendAnnotation(computeAnchorSpend('no anchor here', '0.0.20'));
    expect(level).toBe('warning');
    expect(message).toContain('declares no');
    expect(message).not.toMatch(/-?\d+ of \d+/u); // no fabricated spend number
  });

  it('is explicit rather than silent when the file declares more than one anchor', () => {
    const text = [anchorLine('abc1234', '0.0.10'), anchorLine('def5678', '0.0.15')].join('\n');
    const { level, message } = formatAnchorSpendAnnotation(computeAnchorSpend(text, '0.0.20'));
    expect(level).toBe('warning');
    expect(message).toContain('2 "Re-anchored at" lines');
  });

  it('does not lie with a negative spend when the file is mid-re-anchor and names a version ahead of the tree', () => {
    const { level, message } = formatAnchorSpendAnnotation(
      computeAnchorSpend(anchorLine('abc1234', '0.0.30'), '0.0.20'),
    );
    expect(level).toBe('warning');
    expect(message).not.toMatch(/-\d/u);
    expect(message).toContain('has not reached yet');
  });

  it('every message names itself as non-blocking, since the annotation must never read as a gate', () => {
    const cases = [
      computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.10'),
      computeAnchorSpend(anchorLine('abc1234', '0.0.10'), '0.0.20'),
      computeAnchorSpend('no anchor', '0.0.20'),
      computeAnchorSpend(anchorLine('abc1234', '0.0.30'), '0.0.20'),
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

describe('anchor-budget-spend.mjs: stays in sync with its sources of truth', () => {
  it('BUDGET matches ANCHOR_STALENESS_BUDGET_RELEASES in adr-status-queue-anchor-contract.test.ts', () => {
    const anchorContractSource = readFileSync(ANCHOR_CONTRACT_PATH, 'utf8');
    const match = /const ANCHOR_STALENESS_BUDGET_RELEASES = (\d+);/u.exec(anchorContractSource);

    expect(
      match?.[1],
      `tests/foundation/adr-status-queue-anchor-contract.test.ts no longer declares ANCHOR_STALENESS_BUDGET_RELEASES in the form this test reads. tooling/anchor-budget-spend.mjs's BUDGET is a second literal copy of that number (see that file's header for why it cannot import the test instead), and this is what keeps the two from drifting apart.`,
    ).toBeDefined();

    expect(
      BUDGET,
      `tooling/anchor-budget-spend.mjs's BUDGET (${String(BUDGET)}) no longer matches ANCHOR_STALENESS_BUDGET_RELEASES (${String(match?.[1])}) in adr-status-queue-anchor-contract.test.ts. The annotation would then report a spend against a budget the actual gate does not enforce -- update BUDGET to match, in the same commit that changes either.`,
    ).toBe(Number(match?.[1]));
  });

  it('WARNING_REMAINING_THRESHOLD is strictly less than BUDGET, so every spend is reachable at ::notice:: before it ever reaches ::warning::', () => {
    // Non-vacuous bound: a threshold at or above BUDGET would mean this
    // annotation never prints at ::notice:: at all, which is the "always
    // ::warning::" shape the module header explicitly argues against.
    expect(WARNING_REMAINING_THRESHOLD).toBeGreaterThan(0);
    expect(WARNING_REMAINING_THRESHOLD).toBeLessThan(BUDGET);
  });
});
