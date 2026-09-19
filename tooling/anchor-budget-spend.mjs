#!/usr/bin/env node
// Computes and prints, as a GitHub Actions annotation, how much of the
// `docs/adr/STATUS-QUEUE.md` anchor's staleness budget has been spent.
//
// ## Why this exists
//
// `tests/foundation/adr-status-queue-anchor-contract.test.ts` fails when the
// anchor line in `docs/adr/STATUS-QUEUE.md` falls more than
// `ANCHOR_STALENESS_BUDGET_MERGES` (10) merges behind `main`. That gate has
// gone red in practice -- commit `de88526a` (2026-09-04) landed a re-anchor at
// FOURTEEN of the ten the budget allows, discovered only because it was
// already failing `verify` on every open pull request. Nobody saw it coming
// because nothing watches the spend between merges: `ci.yml` never runs on the
// release commit that moves `package.json` (GitHub does not start a new
// workflow run for a push made with a workflow's own `GITHUB_TOKEN`), so the
// one moment the number used to change is invisible to the one workflow that
// could otherwise report on it.
//
// `.github/workflows/version.yml` is the workflow that runs at that moment --
// it is the thing that moves the version -- so it is where this prints from.
// It is deliberately non-blocking: this file's CLI mode never exits non-zero
// no matter what it finds, because a failing step in a workflow that runs
// *after* a merge has already landed blocks nothing and would only be noise.
// (Per the brief this shipped under -- see the commit that added this file --
// and `AGENTS.md`/`docs/AGENT_WORKFLOW.md` for how this repository is worked.)
//
// ## THE UNIT WAS RELEASES UNTIL 2026-09-15, AND COUNTING THEM HERE MEANT
// ANNOTATING A GATE THIS SCRIPT NO LONGER MEASURED
//
// #1214 changed what the gate counts: from `package.json` patch numbers to
// **first-parent commits since the anchor whose subject is not
// `chore(release): v`** -- merges, plus the occasional direct push to `main`.
// Its own header carries the measurements and they are the reason: a version
// number can be spent on nothing (24 of this repository's 628 release commits
// sit directly on another release commit, one duplicated push event delivering
// two `Version` runs for one sha), and between `491fcdce` (v0.0.541) and
// `450c9819` (v0.0.542) twenty landings -- nineteen merges and one direct push
// -- went under a single version number.
//
// This script kept counting releases for a day, and the gate's header recorded
// that divergence as designed-but-tolerated ("a window carrying a duplicate
// bump warns earlier than the gate fires, and a window carrying a skipped bump
// warns later"). It was measured on `b08e0d0c` (v0.0.635), with the anchor at
// `c6337952` (v0.0.622): this script printed *"13 of 10 ... exceeded by 3
// releases"* while the gate failed at **12 merges**. Two numbers for one
// budget, one of them belonging to no gate at all -- and in the near case the
// divergence is worse than a wrong number, because it inverts the verdict: at
// `7e9c3043` (v0.0.623) with the anchor at `d57b97ba` (v0.0.612) the release
// arithmetic reads ELEVEN and this script would have printed *"the contract is
// failing"* over a gate that was green there at nine merges.
//
// **So the spend is merges now, counted the way the gate counts them**, and
// the release figure is still printed beside it -- as an aside that names
// itself as not the unit, exactly as the gate's own failure message does.
// `BUDGET` below mirrors `ANCHOR_STALENESS_BUDGET_MERGES`, and
// `anchor-budget-spend-annotation.test.ts` reads *that* declaration by name out
// of the gate's source to keep the two from drifting.
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
//   last `WARNING_REMAINING_THRESHOLD` merges of it (and once it is spent
//   outright).** The threshold is 3, chosen against the same evidence the
//   budget itself was: the worst observed burst was ten releases in 31
//   minutes, so "3 remaining" is the point past which the *entire* remaining
//   budget could plausibly be gone before anyone reads a mid-severity notice.
//   `::warning::` surfaces more prominently in the Actions UI and in a
//   checkout's annotations tab; a `::notice::` for routine spend keeps that
//   prominence meaningful instead of habituating readers to warnings that fire
//   on every ordinary merge.
// - **Names the unit, the spend and what remains.** "5 of 10 merges" and "5
//   merges left" read as the same fact to a machine and differently to a
//   person deciding whether to merge again right now; printing both leaves
//   nothing for the reader to compute under time pressure. The word *merges*
//   is load-bearing rather than decorative -- this annotation printed a
//   release count against a merge budget for a day, and a number whose unit is
//   not on screen is a number a reader will assume the unit of.
// - **Never prints a negative or fabricated number.** When the anchor line is
//   missing, duplicated, or names a commit this checkout does not contain,
//   this says exactly that and gives up on a number instead of printing one
//   that would misstate the state of the file. See `computeAnchorSpend`'s
//   non-`ok` results below. The release *aside* has the same rule: an anchor
//   naming a version `package.json` has not reached yet, or one on a different
//   `major.minor` line, is reported as that sentence rather than as arithmetic.
//
// ## Why the parsing and counting logic is duplicated rather than imported
//
// `adr-status-queue-anchor-contract.test.ts` is a `.test.ts` file compiled by
// the vitest/tsc project for `tests/`; this file runs directly as a plain
// `.mjs` script on the self-hosted runner with no build step and no
// `tsconfig` of its own (`version.yml` never runs `pnpm install` and never
// touches `tests/`). Importing across that boundary would make a workflow
// step depend on the test toolchain being present, which it deliberately is
// not. `ANCHOR_LINE` and `RELEASE_COMMIT_SUBJECT` below are therefore second
// copies of that test's patterns, and
// `tests/foundation/anchor-budget-spend-annotation.test.ts` asserts that the
// budget here matches the gate's -- read by name out of the gate's own source
// text -- so a change to one cannot silently stop matching the other.
//
// ## The git dependency, and why it is affordable here
//
// Counting merges costs a `git log --first-parent` and needs the anchor commit
// present in the checkout, which the release count did not. `version.yml`'s
// checkout sets `fetch-depth: 0` ("Full history", in its own words, because
// its retry loop re-fetches and hard-resets the branch), so the history is
// there. When it is not -- a shallow tree, a sha this history does not
// contain, a `git` that will not run -- `countLandingsSince` returns `null`
// and this prints the sentence that says so instead of a number. That is the
// same precondition, and the same say-so-rather-than-skip choice, the gate
// makes in `has not fallen more than the staleness budget behind the history
// that has landed`.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Must match `ANCHOR_STALENESS_BUDGET_MERGES` in
 * `tests/foundation/adr-status-queue-anchor-contract.test.ts` -- the number
 * that gate actually enforces. Kept as a separate literal (see module header)
 * and checked against that test's source text by
 * `tests/foundation/anchor-budget-spend-annotation.test.ts`.
 */
export const BUDGET = 10;

/**
 * How many merges of budget must remain before this stops speaking at
 * `::notice::` and starts speaking at `::warning::`. See the module header for
 * why 3.
 */
export const WARNING_REMAINING_THRESHOLD = 3;

/**
 * The same pattern `adr-status-queue-anchor-contract.test.ts` uses to find the
 * live re-anchoring line. Anchored on the words "Re-anchored at" for the same
 * reason that test gives: so this cannot start matching some other sentence
 * that happens to hold a sha and a version.
 *
 * Widened with that gate on 2026-09-16, and the reason is the whole of why
 * this copy could not be left alone. Every gap here was a literal space, and
 * `STATUS-QUEUE.md` keeps 48 verbatim quotations of superseded anchor lines
 * inside hand-wrapped prose and blockquotes -- so this read **1** span where
 * the file holds **49**, and read `1` only because the other 48 happened to
 * wrap. Re-flowing one kept paragraph made this script report
 * `multiple-anchors` and stop annotating, for a formatting edit. Gaps are
 * `[\s>]+` now: whitespace because the prose re-wraps, `>` because it is
 * quoted inside blockquotes.
 */
const ANCHOR_LINE =
  /Re-anchored[\s>]+at[\s>]+`main`[\s>]+@[\s>]*`([0-9a-f]{7,40})`[\s>]*\(\*{0,2}v(\d+\.\d+\.\d+)\*{0,2}\)/g;

/**
 * What tells a kept record from the live anchor, now that the pattern above
 * can see both: the file saying it is quoting.
 *
 * A second copy of `KEPT_ANCHOR_RECORD` in
 * `adr-status-queue-anchor-contract.test.ts`, duplicated for the reason the
 * module header gives for duplicating everything else here, and matched
 * against the text *preceding* a span so the anchor line itself stays
 * byte-identical whether it is live or kept. Every one of the 48 records
 * carries the verb `read` immediately before it, with a colon in 37 and
 * without one in 11, and nothing but quoting punctuation in between.
 */
const KEPT_ANCHOR_RECORD = /\bread:?[*"'\s>]*$/iu;

/** See `KEPT_RECORD_LOOKBEHIND` in the gate: the longest introduction in the
 *  file is eleven characters and the `$` anchor means a longer window can only
 *  ever match the same eleven. */
const KEPT_RECORD_LOOKBEHIND = 64;

/**
 * The subject `.github/workflows/version.yml` writes for its bump commit, and
 * the only commit shape this script refuses to count as history. A second copy
 * of the gate's `RELEASE_COMMIT_SUBJECT`, anchored at both ends for the reasons
 * that file gives: `^` so a merge of a branch named after a release is not
 * mistaken for one, `$` on a full patch version so hand-written prose about a
 * release is not either.
 *
 * Not global, so `.test` carries no `lastIndex` between calls.
 */
export const RELEASE_COMMIT_SUBJECT = /^chore\(release\): v\d+\.\d+\.\d+$/u;

/**
 * @typedef {
 *   | { kind: 'ok', anchorSha: string, anchorVersion: string, packageVersion: string, spend: number, remaining: number, releases: number | null }
 *   | { kind: 'no-anchor' }
 *   | { kind: 'multiple-anchors', count: number }
 *   | { kind: 'uncountable', anchorSha: string, anchorVersion: string, packageVersion: string }
 * } AnchorSpendResult
 */

/**
 * Patch releases between two `x.y.z` versions inside the same `x.y` line, or
 * `null` when they are not comparable that way (a major or minor difference).
 * May be negative, which means the anchor names a version `package.json` has
 * not reached.
 *
 * Mirrors `patchReleasesBetween` in `adr-status-queue-anchor-contract.test.ts`,
 * returning `null` in place of that test's `Number.POSITIVE_INFINITY` because
 * this module reports "not comparable" as a sentence rather than as a number.
 * Since 2026-09-15 this figure is an **aside** here and not the spend: see the
 * module header.
 *
 * @param {string} anchor
 * @param {string} shipped
 * @returns {number | null}
 */
function patchReleasesBetween(anchor, shipped) {
  const [anchorMajor, anchorMinor, anchorPatch] = anchor.split('.').map(Number);
  const [shippedMajor, shippedMinor, shippedPatch] = shipped.split('.').map(Number);
  if (anchorMajor !== shippedMajor || anchorMinor !== shippedMinor) return null;
  return shippedPatch - anchorPatch;
}

/**
 * The gate's unit, counted the gate's way: first-parent commits since the
 * anchor whose subject is not `chore(release): v<x.y.z>`.
 *
 * `--first-parent` because a pull request with forty commits on its branch is
 * one merge on `main` and one thing for a re-anchor pass to read; `%s` because
 * the release commits have to be tellable apart at all.
 *
 * Returns `null` rather than throwing or guessing when this checkout cannot
 * answer -- no `git`, a sha this history does not contain, a shallow tree that
 * stops short of it. The caller prints that as its own sentence; see the module
 * header's "The git dependency".
 *
 * `until` defaults to `HEAD`, which is what the CLI wants: the tree this run
 * is annotating. It is a parameter so a test can count a window that does not
 * move with every merge -- a fixed pair of shas -- rather than asserting a
 * number that changes under it.
 *
 * @param {string} anchorSha
 * @param {string} repositoryRoot
 * @param {string} [until]
 * @returns {number | null}
 */
export function countLandingsSince(anchorSha, repositoryRoot, until = 'HEAD') {
  const resolved = spawnSync('git', ['cat-file', '-e', `${anchorSha}^{commit}`], { cwd: repositoryRoot });
  if (resolved.error !== undefined || resolved.status !== 0) return null;

  const log = spawnSync('git', ['log', '--first-parent', '--format=%s', `${anchorSha}..${until}`], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (log.error !== undefined || log.status !== 0 || typeof log.stdout !== 'string') return null;

  return log.stdout
    .split('\n')
    .map((subject) => subject.trim())
    .filter((subject) => subject.length > 0)
    .filter((subject) => !RELEASE_COMMIT_SUBJECT.test(subject)).length;
}

/**
 * Pure, given a counter. Takes the raw text of `docs/adr/STATUS-QUEUE.md`, the
 * version `package.json` currently ships, and a function that counts landings
 * since a sha, and reports the anchor's spend against `BUDGET` in **merges** --
 * or, when the file cannot be read as carrying exactly one countable anchor,
 * exactly which of those ways it failed.
 *
 * The counter is injected rather than called directly so a test can exercise
 * every state on fabricated input without building a git history for each one,
 * and so this function stays pure.
 *
 * @param {string} statusQueueText
 * @param {string} packageVersion
 * @param {(anchorSha: string) => number | null} countLandings
 * @returns {AnchorSpendResult}
 */
export function computeAnchorSpend(statusQueueText, packageVersion, countLandings) {
  const anchors = [...statusQueueText.matchAll(ANCHOR_LINE)].filter(
    (match) =>
      !KEPT_ANCHOR_RECORD.test(
        statusQueueText.slice(Math.max(0, match.index - KEPT_RECORD_LOOKBEHIND), match.index),
      ),
  );

  if (anchors.length === 0) return { kind: 'no-anchor' };
  if (anchors.length > 1) return { kind: 'multiple-anchors', count: anchors.length };

  const anchorSha = anchors[0][1];
  const anchorVersion = anchors[0][2];
  const spend = countLandings(anchorSha);

  if (spend === null) return { kind: 'uncountable', anchorSha, anchorVersion, packageVersion };

  return {
    kind: 'ok',
    anchorSha,
    anchorVersion,
    packageVersion,
    spend,
    remaining: BUDGET - spend,
    releases: patchReleasesBetween(anchorVersion, packageVersion),
  };
}

/**
 * The release figure as a sentence, never as bare arithmetic a reader could
 * mistake for the spend. Returns the sentence and whether it is on its own an
 * escalation -- a version the tree has not reached, or one off this
 * `major.minor` line, says the anchor line itself is wrong and is worth a
 * `::warning::` at any spend.
 *
 * @param {{ anchorVersion: string, packageVersion: string, releases: number | null }} result
 * @returns {{ aside: string, escalates: boolean }}
 */
function releaseAside({ anchorVersion, packageVersion, releases }) {
  if (releases === null) {
    return {
      aside:
        `No release figure is printed beside that: the anchor's v${anchorVersion} is not in the same major.minor ` +
        `line as the v${packageVersion} package.json ships, so re-check the anchor line.`,
      escalates: true,
    };
  }

  if (releases < 0) {
    return {
      aside:
        `docs/adr/STATUS-QUEUE.md also claims to be anchored at v${anchorVersion}, which package.json's ` +
        `v${packageVersion} has not reached yet -- that names a commit this history does not contain, so the file ` +
        `is likely mid-re-anchor and the anchor line needs re-checking.`,
      escalates: true,
    };
  }

  return {
    aside:
      `The same window spent ${String(releases)} release ${releases === 1 ? 'number' : 'numbers'}, which is not ` +
      `the unit this budget counts -- a version number can be spent on nothing, and a merge cannot.`,
    escalates: false,
  };
}

/**
 * Turns a result from `computeAnchorSpend` into the one line this prints as a
 * GitHub Actions annotation. Pure and separate from `computeAnchorSpend` so a
 * test can assert on the level and the numbers without parsing a message
 * string, and on the message without re-deriving the level.
 *
 * @param {AnchorSpendResult} result
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

    case 'uncountable':
      return {
        level: 'warning',
        message:
          `Could not count the anchor budget's spend in merges: docs/adr/STATUS-QUEUE.md is anchored at ` +
          `${result.anchorSha} (v${result.anchorVersion}) and this checkout cannot be measured against it -- the ` +
          `commit is absent, the history is shallow, or git would not run. That is a broken citation or a shallow ` +
          `checkout rather than stale history. See ${CONTRACT}. ${NON_BLOCKING}`,
      };

    case 'ok': {
      const { anchorSha, anchorVersion, packageVersion, spend, remaining } = result;
      const budgetSpentSummary = `${String(spend)} of ${String(BUDGET)} merges`;
      const remainingSummary =
        remaining > 0
          ? `${String(remaining)} merge${remaining === 1 ? '' : 's'} remain${remaining === 1 ? 's' : ''} before it is exceeded`
          : remaining === 0
            ? `none of it remains -- the budget is fully spent`
            : `it is exceeded by ${String(-remaining)} merge${-remaining === 1 ? '' : 's'}`;
      const { aside, escalates } = releaseAside(result);
      const base =
        `docs/adr/STATUS-QUEUE.md anchor budget spend: ${budgetSpentSummary} since \`${anchorSha}\` ` +
        `(anchored v${anchorVersion}, now v${packageVersion}) -- ${remainingSummary}. A merge here is a ` +
        `first-parent commit on main that is not a chore(release) bump, the unit ${CONTRACT} enforces. ${aside}`;

      if (remaining <= 0) {
        return {
          level: 'warning',
          message:
            `${base} ${CONTRACT} is failing (or will fail on its next run) until docs/adr/STATUS-QUEUE.md ` +
            `is re-anchored. ${NON_BLOCKING}`,
        };
      }

      if (remaining <= WARNING_REMAINING_THRESHOLD || escalates) {
        return {
          level: 'warning',
          message: `${base} Re-anchor docs/adr/STATUS-QUEUE.md soon -- the budget has gone red inside a single hour before. ${NON_BLOCKING}`,
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

    const result = computeAnchorSpend(statusQueueText, packageVersion, (anchorSha) =>
      countLandingsSince(anchorSha, repositoryRoot),
    );
    const { level, message } = formatAnchorSpendAnnotation(result);
    console.log(`::${level}::${message}`);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.log(
      `::warning::Could not compute the STATUS-QUEUE.md anchor budget's spend: ${detail}. This annotation is informational only and does not fail this workflow.`,
    );
  }
}
