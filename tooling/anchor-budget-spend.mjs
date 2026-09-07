#!/usr/bin/env node
// Computes and prints, as a GitHub Actions annotation, how much of the
// `docs/adr/STATUS-QUEUE.md` anchor's staleness budget has been spent.
//
// ## Why this exists
//
// `tests/foundation/adr-status-queue-anchor-contract.test.ts` fails when the
// anchor line in `docs/adr/STATUS-QUEUE.md` falls more than
// `ANCHOR_STALENESS_BUDGET_RELEASES` (10) releases behind `package.json`. That
// gate has gone red in practice -- commit `de88526a` (2026-09-04) landed a
// re-anchor at FOURTEEN of the ten releases the budget allows, discovered only
// because it was already failing `verify` on every open pull request. Nobody
// saw it coming because nothing watches the spend between merges: `ci.yml`
// never runs on the release commit that moves `package.json` (GitHub does not
// start a new workflow run for a push made with a workflow's own
// `GITHUB_TOKEN`), so the one moment the number actually changes is invisible
// to the one workflow that could otherwise report on it.
//
// `.github/workflows/version.yml` is the workflow that runs at that moment --
// it is the thing that moves the version -- so it is where this prints from.
// It is deliberately non-blocking: this file's CLI mode never exits non-zero
// no matter what it finds, because a failing step in a workflow that runs
// *after* a merge has already landed blocks nothing and would only be noise.
// (Per the brief this shipped under -- see the commit that added this file --
// and `AGENTS.md`/`docs/AGENT_WORKFLOW.md` for how this repository is worked.)
//
// ## What "visible" means here, and why
//
// - **Always prints, never silent.** The measured failure mode is a budget
//   spent faster than any periodic check can catch (up to 16 releases inside
//   one hour, a median 10-release window of 4.7 hours) landing with nobody
//   watching. A check that only speaks once things are already bad gives up
//   exactly the lead time the whole point of running this from `version.yml`
//   was to buy. An annotation on every merge costs one line in the Actions UI;
//   silence before the cliff has already cost a red `verify` on every open
//   pull request once.
// - **`::notice::` while comfortably under budget, `::warning::` inside the
//   last `WARNING_REMAINING_THRESHOLD` releases of it (and once it is spent
//   outright).** The threshold is 3, chosen against the same evidence the
//   budget itself was: the worst observed burst was ten releases in 31
//   minutes, so "3 remaining" is the point past which the *entire* remaining
//   budget could plausibly be gone before anyone reads a mid-severity notice.
//   `::warning::` surfaces more prominently in the Actions UI and in a
//   checkout's annotations tab; a `::notice::` for routine spend keeps that
//   prominence meaningful instead of habituating readers to warnings that fire
//   on every ordinary merge.
// - **Names both the spend and the releases remaining.** "5 of 10" and "5
//   releases left" read as the same fact to a machine and differently to a
//   person deciding whether to merge again right now; printing both leaves
//   nothing for the reader to compute under time pressure.
// - **Never prints a negative or fabricated number.** When the anchor line is
//   missing, duplicated, or names a version `package.json` has not reached
//   yet (the file mid-re-anchor, or a stale/incorrect anchor slipped past
//   review), this says exactly that and gives up on a number instead of
//   printing one that would misstate the state of the file. See
//   `computeAnchorSpend`'s non-`ok` results below.
//
// ## Why the parsing logic is duplicated rather than imported
//
// `adr-status-queue-anchor-contract.test.ts` is a `.test.ts` file compiled by
// the vitest/tsc project for `tests/`; this file runs directly as a plain
// `.mjs` script on the self-hosted runner with no build step and no
// `tsconfig` of its own (`version.yml` never runs `pnpm install` and never
// touches `tests/`). Importing across that boundary would make a workflow
// step depend on the test toolchain being present, which it deliberately is
// not. `ANCHOR_LINE` below is therefore a second copy of that test's pattern,
// and `tests/foundation/ci-configuration-contract.test.ts`'s "anchor budget
// spend annotation contract" describe block asserts the two numbers that
// matter -- the budget and the warning threshold -- stay in sync with their
// sources of truth, so a change to one cannot silently stop matching the
// other.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Must match `ANCHOR_STALENESS_BUDGET_RELEASES` in
 * `tests/foundation/adr-status-queue-anchor-contract.test.ts`. Kept as a
 * separate literal (see module header) and checked against that test's source
 * text by `tests/foundation/ci-configuration-contract.test.ts`.
 */
export const BUDGET = 10;

/**
 * How many releases of budget must remain before this stops speaking at
 * `::notice::` and starts speaking at `::warning::`. See the module header for
 * why 3.
 */
export const WARNING_REMAINING_THRESHOLD = 3;

/**
 * The same pattern `adr-status-queue-anchor-contract.test.ts` uses to find the
 * live re-anchoring line. Anchored on the words "Re-anchored at" for the same
 * reason that test gives: so this cannot start matching some other sentence
 * that happens to hold a sha and a version.
 */
const ANCHOR_LINE = /Re-anchored at `main` @ `([0-9a-f]{7,40})`\s*\(\*{0,2}v(\d+\.\d+\.\d+)\*{0,2}\)/g;

/**
 * @typedef {
 *   | { kind: 'ok', anchorVersion: string, packageVersion: string, spend: number, remaining: number }
 *   | { kind: 'no-anchor' }
 *   | { kind: 'multiple-anchors', count: number }
 *   | { kind: 'incomparable', anchorVersion: string, packageVersion: string }
 *   | { kind: 'ahead', anchorVersion: string, packageVersion: string }
 * } AnchorSpendResult
 */

/**
 * Patch releases between two `x.y.z` versions inside the same `x.y` line, or
 * `null` when they are not comparable that way (a major or minor difference).
 * Mirrors `patchReleasesBetween` in `adr-status-queue-anchor-contract.test.ts`,
 * returning `null` in place of that test's `Number.POSITIVE_INFINITY` because
 * this module reports "incomparable" as its own explicit result rather than
 * folding it into a spend number.
 */
function patchReleasesBetween(anchor, shipped) {
  const [anchorMajor, anchorMinor, anchorPatch] = anchor.split('.').map(Number);
  const [shippedMajor, shippedMinor, shippedPatch] = shipped.split('.').map(Number);
  if (anchorMajor !== shippedMajor || anchorMinor !== shippedMinor) return null;
  return shippedPatch - anchorPatch;
}

/**
 * Pure. Takes the raw text of `docs/adr/STATUS-QUEUE.md` and the version
 * `package.json` currently ships, and reports the anchor's spend against
 * `BUDGET` -- or, when the file cannot be read as carrying exactly one live
 * anchor ahead of nothing, exactly which of those ways it failed.
 *
 * @param {string} statusQueueText
 * @param {string} packageVersion
 * @returns {AnchorSpendResult}
 */
export function computeAnchorSpend(statusQueueText, packageVersion) {
  const anchors = [...statusQueueText.matchAll(ANCHOR_LINE)];

  if (anchors.length === 0) return { kind: 'no-anchor' };
  if (anchors.length > 1) return { kind: 'multiple-anchors', count: anchors.length };

  const anchorVersion = anchors[0][2];
  const spend = patchReleasesBetween(anchorVersion, packageVersion);

  if (spend === null) return { kind: 'incomparable', anchorVersion, packageVersion };
  if (spend < 0) return { kind: 'ahead', anchorVersion, packageVersion };

  return { kind: 'ok', anchorVersion, packageVersion, spend, remaining: BUDGET - spend };
}

/**
 * Turns a result from `computeAnchorSpend` into the one line this prints as a
 * GitHub Actions annotation. Pure and separate from `computeAnchorSpend` so a
 * test can assert on the level and the numbers without parsing a message
 * string, and on the message without re-deriving the level.
 *
 * @param {ReturnType<typeof computeAnchorSpend>} result
 * @returns {{ level: 'notice' | 'warning', message: string }}
 */
export function formatAnchorSpendAnnotation(result) {
  const CONTRACT = 'tests/foundation/adr-status-queue-anchor-contract.test.ts';
  const NON_BLOCKING = 'This annotation is informational only and does not fail this workflow.';

  switch (result.kind) {
    case 'no-anchor':
      return {
        level: 'warning',
        message:
          `Could not compute the anchor budget's spend: docs/adr/STATUS-QUEUE.md declares no ` +
          `"Re-anchored at \`main\` @ ..." line. See ${CONTRACT}. ${NON_BLOCKING}`,
      };

    case 'multiple-anchors':
      return {
        level: 'warning',
        message:
          `Could not compute the anchor budget's spend: docs/adr/STATUS-QUEUE.md declares ` +
          `${String(result.count)} "Re-anchored at" lines instead of exactly one -- the file is ` +
          `mid-re-anchor or malformed. See ${CONTRACT}. ${NON_BLOCKING}`,
      };

    case 'incomparable':
      return {
        level: 'warning',
        message:
          `Could not compute the anchor budget's spend as a release count: ` +
          `docs/adr/STATUS-QUEUE.md is anchored at v${result.anchorVersion}, which is not in the same ` +
          `major.minor line as the v${result.packageVersion} package.json now ships. Re-read ` +
          `docs/adr/STATUS-QUEUE.md and move the anchor. ${NON_BLOCKING}`,
      };

    case 'ahead':
      return {
        level: 'warning',
        message:
          `docs/adr/STATUS-QUEUE.md claims to be anchored at v${result.anchorVersion}, which package.json's ` +
          `v${result.packageVersion} has not reached yet -- that names a commit this history does not ` +
          `contain. The file is likely mid-re-anchor; re-check the anchor line rather than trusting a ` +
          `spend computed against it. ${NON_BLOCKING}`,
      };

    case 'ok': {
      const { anchorVersion, packageVersion, spend, remaining } = result;
      const budgetSpentSummary = `${String(spend)} of ${String(BUDGET)}`;
      const remainingSummary =
        remaining > 0
          ? `${String(remaining)} release${remaining === 1 ? '' : 's'} remain${remaining === 1 ? 's' : ''} before it is exceeded`
          : remaining === 0
            ? `none of it remains -- the budget is fully spent`
            : `it is exceeded by ${String(-remaining)} release${-remaining === 1 ? '' : 's'}`;
      const base =
        `docs/adr/STATUS-QUEUE.md anchor budget spend: ${budgetSpentSummary} ` +
        `(anchored v${anchorVersion}, now v${packageVersion}) -- ${remainingSummary}.`;

      if (remaining <= 0) {
        return {
          level: 'warning',
          message:
            `${base} ${CONTRACT} is failing (or will fail on its next run) until docs/adr/STATUS-QUEUE.md ` +
            `is re-anchored. ${NON_BLOCKING}`,
        };
      }

      if (remaining <= WARNING_REMAINING_THRESHOLD) {
        return {
          level: 'warning',
          message: `${base} Re-anchor docs/adr/STATUS-QUEUE.md soon -- the budget has gone red inside a single hour before.`,
        };
      }

      return { level: 'notice', message: base };
    }
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;

if (isMain) {
  // Deliberately allows no path to a non-zero exit. A bug in this script must
  // never turn a merge-time annotation into a failing step -- see the module
  // header's "non-blocking" note and the hard constraint it quotes.
  try {
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const statusQueueText = readFileSync(path.join(repositoryRoot, 'docs/adr/STATUS-QUEUE.md'), 'utf8');
    const packageVersion = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')).version;

    const result = computeAnchorSpend(statusQueueText, packageVersion);
    const { level, message } = formatAnchorSpendAnnotation(result);
    console.log(`::${level}::${message}`);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.log(
      `::warning::Could not compute the STATUS-QUEUE.md anchor budget's spend: ${detail}. This annotation is informational only and does not fail this workflow.`,
    );
  }
}
