import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every ruling in ADR 0112 is restated somewhere in `docs/VISUAL_IDENTITY.md`,
 * and every restatement in that file names a ruling that exists.
 *
 * ## Why this gate exists at all, and what it deliberately does not try to do
 *
 * `docs/ISSUE_BACKLOG.md`'s source-of-truth order gained a rung on 2026-09-15:
 * *"the repository's reading of an accepted ADR"* binds where it restates a
 * ruling and does not bind where it is a snapshot of code. That file states the
 * cost in the same breath -- *"nothing checks that classification"* -- and sets
 * the safe default: an unmarked sentence is a reading and does not bind.
 *
 * The default is safe and it is lossy, and the loss is measurable rather than
 * theoretical. Classified by hand on 2026-09-15, `docs/VISUAL_IDENTITY.md`
 * restated four of ADR 0112's five rulings and **restated decisions 2 and 5
 * nowhere at all**, while its own header claimed *"the three sentences of this
 * document that the rulings changed"*. A tally, wrong in both directions, in the
 * one file the new rung made load-bearing.
 *
 * **What is mechanical is coverage, not correctness.** No test can read English
 * and decide whether a restatement is *faithful* to the ruling it names -- that
 * is what a person comparing the two sentences does, and `docs/AGENT_WORKFLOW.md`
 * §4 already says a quoted sentence is the durable form for it. What is
 * mechanical is the weaker pair, and it is the pair that failed here: a ruling
 * with no restatement, and a restatement naming a ruling that does not exist.
 * A sixth decision added to ADR 0112 fails this file in the commit that adds it,
 * instead of quietly leaving the reading a ruling short.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const ADR = join(REPOSITORY_ROOT, 'docs/adr/0112-what-the-2026-09-13-identity-delivery-decides.md');
const READING = join(REPOSITORY_ROOT, 'docs/VISUAL_IDENTITY.md');

const adrSource = readFileSync(ADR, 'utf8');
const readingSource = readFileSync(READING, 'utf8');

/** The decision numbers ADR 0112 actually carries, from its own `### Decision N` headings. */
const ruledDecisions = new Set(
  [...adrSource.matchAll(/^### Decision (\d+)\b/gm)].map((match) => Number(match[1])),
);

/**
 * The mapping table rows in `docs/VISUAL_IDENTITY.md` §"How to read a sentence
 * in this document": `| N — … | … | §"Heading" … |`.
 */
const mappedRows = [...readingSource.matchAll(/^\| (\d+) — [^|]*\|[^|]*\|([^|]*)\|$/gm)].map(
  (match) => ({ decision: Number(match[1]), where: match[2]! }),
);

describe('the repository reading of ADR 0112 accounts for every ruling', () => {
  it('finds decisions to check, so the assertions below cannot pass vacuously', () => {
    expect(ruledDecisions.size).toBeGreaterThan(0);
    expect(mappedRows.length).toBeGreaterThan(0);
  });

  it('maps every ruling ADR 0112 carries to the place that restates it', () => {
    expect([...mappedRows.map((row) => row.decision)].sort((a, b) => a - b)).toEqual(
      [...ruledDecisions].sort((a, b) => a - b),
    );
  });

  it('names a section that exists for every mapped ruling', () => {
    const headings = new Set(
      [...readingSource.matchAll(/^#{2,3} (.+)$/gm)].map((match) => match[1]!.trim()),
    );
    for (const row of mappedRows) {
      const named = [...row.where.matchAll(/§"([^"]+)"/g)].map((match) => match[1]!);
      expect(named, `decision ${row.decision} names no section`).not.toHaveLength(0);
      for (const section of named) {
        // A `§"…"` cell may name a subsection by its own words; the heading has
        // to start with them so that `### Typography, shape and motion` matches
        // without the cell having to repeat a heading that later grows a clause.
        expect(
          [...headings].some((heading) => heading.startsWith(section)),
          `decision ${row.decision} names §"${section}", which is not a heading in this file`,
        ).toBe(true);
      }
    }
  });

  it('never claims to restate a ruling ADR 0112 does not carry', () => {
    const claimed = [...readingSource.matchAll(/\bdecisions? (\d+)\b/g)].map((match) =>
      Number(match[1]),
    );
    expect(claimed.length).toBeGreaterThan(0);
    for (const decision of claimed) {
      expect(ruledDecisions.has(decision), `this file cites ADR 0112 decision ${decision}`).toBe(
        true,
      );
    }
  });
});
