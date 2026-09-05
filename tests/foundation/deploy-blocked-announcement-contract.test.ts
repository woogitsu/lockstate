import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A BLOCKED DEPLOY MUST REPORT `failure`, NOT `skipped` (#424).
 *
 * ## The defect this stands behind
 *
 * `.github/workflows/deploy.yml` triggers on the *completion* of `CI` and its
 * `staging` job requires `github.event.workflow_run.conclusion == 'success'`.
 * When that guard rejects a run every job in the workflow skips, and GitHub
 * reports a run whose every job skipped as **`skipped`** — no red X in the
 * Actions list, no notification, nothing that distinguishes it from a run that
 * had nothing to do. So a deploy that is genuinely blocked looks exactly like
 * one that is merely slow.
 *
 * That is not a hypothesis. On 2026-08-26 no Deploy run concluded `success`
 * between `32994037499` at 17:25:21 and `33005151972` at 19:26:26 — 2h01m —
 * and seven consecutive runs in between (`32996050125`, `32996093805`,
 * `32997470428`, `33004133740`, `33004481382`, `33005039649`, `33005071431`)
 * all concluded `skipped`. Nothing showed as a failure at any point, and what
 * ended it was a later merge going green on its own. (`32996017285`, also in
 * that window, did publish — its deploy step completed at 17:46:31 and the run
 * says `cancelled` only because a rejected run joined its concurrency group
 * four seconds later. The silence was continuous; the staleness was not.)
 *
 * The gap is wide because non-success is common: of the sixty most recent
 * completed CI runs started by a push to `main` (2026-08-25T18:08Z to
 * 2026-08-26T19:45Z), thirty-eight concluded `success`, fourteen `failure` and
 * eight `cancelled`.
 *
 * The `staging-blocked` job is the fix, and it is the smallest one available:
 * it fails, so the run concludes `failure`, so a blocked deploy is reported by
 * the machinery that already reports every other failure.
 *
 * ## Why a contract test rather than the YAML alone
 *
 * Every mutation that re-silences it is invisible to `pnpm verify` and leaves
 * CI green: deleting the job, softening its `exit 1` into a `::warning::`
 * (which leaves the *run* green, which is the same silence one level down),
 * or widening its guard so it also fires for a fork's pull request — which
 * would hand anyone who can open one the ability to turn this repository's
 * Deploy workflow red at will, and would very likely be "fixed" by deleting
 * the job. The only evidence would be another silent gap, months later.
 *
 * Sibling of the deploy contracts in
 * `tests/foundation/ci-configuration-contract.test.ts`, which pin the
 * `staging` job's own guard, its checkout ref and the concurrency policy. This
 * is a separate file rather than a section there because it is a separate
 * statement: those say *what may publish*, this says *what must be said when
 * nothing does*.
 *
 * ## What it cannot establish
 *
 * That the job runs, that GitHub reports the run as `failure`, or that anyone
 * is notified. Those need a real blocked deploy on a real runner, and this
 * file reads YAML. What it does establish is that the terms which make those
 * things possible are still present and still say what they said.
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEPLOY = '.github/workflows/deploy.yml';

async function readRepositoryFile(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

/**
 * The lines of one job's block under `jobs:`, up to the next job.
 *
 * Scoped rather than searched for across the whole file, for the same reason
 * the deploy contracts in `ci-configuration-contract.test.ts` scope theirs:
 * deploy.yml has three jobs now, two of them carry a `workflow_run` term in
 * their guard, and a whole-file `toContain` could be satisfied by the wrong
 * one.
 */
function jobBlock(workflow: string, job: string): readonly string[] {
  const lines = workflow.split(/\r?\n/u);
  const start = lines.indexOf(`  ${job}:`);

  expect(
    start,
    `${DEPLOY} has no \`${job}:\` job. Nothing below can be asserted about a job that is not there; if it was renamed, rename it here in the same commit, and if it was removed say on #424 what replaced it.`,
  ).toBeGreaterThanOrEqual(0);

  const body = lines.slice(start + 1);
  const end = body.findIndex((line) => line.trim().length > 0 && line.search(/\S/u) <= 2);
  const block = end === -1 ? body : body.slice(0, end);

  // Vacuity guard: a block parsed down to nothing would fail every assertion
  // below, but would blame the workflow for a broken parser.
  expect(
    block.length,
    `the \`${job}:\` job in ${DEPLOY} parsed to almost no lines; the job parser is broken.`,
  ).toBeGreaterThan(5);

  return block;
}

/** A job-level `if:`, folded to the single line GitHub evaluates. */
function jobGuard(jobLines: readonly string[], job: string): string {
  const start = jobLines.findIndex((line) => line.search(/\S/u) === 4 && /^if:/u.test(line.trim()));

  expect(
    start,
    `the \`${job}:\` job in ${DEPLOY} has no job-level \`if:\` guard at all. Without one it runs on every event that reaches this workflow.`,
  ).toBeGreaterThanOrEqual(0);

  const first = (jobLines[start] ?? '').trim().slice('if:'.length).trim();
  const folded = first === '>-' || first === '>' || first === '|' ? [] : [first];
  for (const line of jobLines.slice(start + 1)) {
    if (line.trim().length === 0 || line.search(/\S/u) <= 4) {
      break;
    }
    folded.push(line.trim());
  }

  const guard = folded.join(' ').replace(/\s+/gu, ' ');
  expect(
    guard.length,
    `the \`if:\` guard on the \`${job}:\` job in ${DEPLOY} parsed to nothing; the parser is broken.`,
  ).toBeGreaterThan(0);

  return guard;
}

/** Job-block lines with comments and blanks dropped. */
function statements(jobLines: readonly string[]): readonly string[] {
  return jobLines
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

describe('blocked deploy announcement contract', () => {
  it('has a job that fires exactly when the automatic path is rejected', async () => {
    const guard = jobGuard(jobBlock(await readRepositoryFile(DEPLOY), 'staging-blocked'), 'staging-blocked');

    // One path only. `A || anything` fires on `anything`, so a second
    // alternative would be a way into this job that none of the terms below
    // gate -- the same reason the `staging` contract counts its alternatives.
    expect(
      guard.split('||').filter((alternative) => alternative.trim().length > 0).length,
      `the \`if:\` guard on \`staging-blocked\` in ${DEPLOY} now has more than one \`||\` alternative. Each one is an independent way to make this repository's Deploy workflow report failure, and every assertion below reads the single conjunction this contract knows about. If a second path is genuinely wanted, say on #424 what gates it and assert that here in the same commit.`,
    ).toBe(1);

    // The leading `&&` is part of every pinned string on purpose: without it
    // the assertion is satisfied by a term sitting beside the conjunction and
    // gating nothing.
    expect(
      guard,
      `\`staging-blocked\` in ${DEPLOY} no longer fires on a *rejected* CI conclusion. \`conclusion != 'success'\` is the whole trigger: it is the negation of the term the \`staging\` job requires, and together the two partition the automatic path so that exactly one of them runs for a push to \`main\` from this repository.`,
    ).toContain("&& github.event.workflow_run.conclusion != 'success'");

    expect(
      guard,
      `\`staging-blocked\` in ${DEPLOY} no longer restricts itself to a CI run a PUSH started. ci.yml also runs on \`pull_request\` and on \`workflow_dispatch\`, and \`branches: [main]\` on the trigger filters the triggering run's head BRANCH rather than its event. Rejecting those runs is the \`staging\` guard WORKING -- CI passing is not a merge -- and a working gate must not be announced as a failure. Restore \`&& github.event.workflow_run.event == 'push'\`.`,
    ).toContain("&& github.event.workflow_run.event == 'push'");

    expect(
      guard,
      `\`staging-blocked\` in ${DEPLOY} no longer restricts itself to a CI run whose head commit came from THIS repository. ci.yml triggers on a bare \`pull_request\`, so a pull request opened from a fork starts a CI run that belongs to this repository -- and every job of it skips, which is #423's gate working rather than a blocked deploy. Without this term anyone who can open a fork pull request can make this workflow report failure at will, and the likeliest response to that is deleting this job. Restore \`&& github.event.workflow_run.head_repository.full_name == github.repository\`.`,
    ).toContain('&& github.event.workflow_run.head_repository.full_name == github.repository');

    expect(
      guard,
      `the \`if:\` guard on \`staging-blocked\` in ${DEPLOY} no longer begins by testing \`github.event_name == 'workflow_run'\`. Every other term reads \`github.event.workflow_run\`, a payload that exists on no other event: under a \`workflow_dispatch\` they all evaluate against nothing.`,
    ).toContain("github.event_name == 'workflow_run'");
  });

  it('is the exact complement of the staging job, so no run falls between them', async () => {
    const workflow = await readRepositoryFile(DEPLOY);
    const publishing = jobGuard(jobBlock(workflow, 'staging'), 'staging');
    const blocked = jobGuard(jobBlock(workflow, 'staging-blocked'), 'staging-blocked');

    // Read out of the file rather than pinned as a literal here, because the
    // property being asserted is a relationship BETWEEN the two guards: one
    // requires the conclusion, the other requires its negation. A literal on
    // each side would still pass if only one of them moved.
    expect(
      publishing,
      `the \`staging\` job in ${DEPLOY} no longer requires \`conclusion == 'success'\`. \`staging-blocked\` is written as that term's negation, so if the publishing side stops testing the conclusion the two jobs stop partitioning anything: a run could satisfy both, or neither, and "neither" is the silent \`skipped\` this contract exists to prevent.`,
    ).toContain("github.event.workflow_run.conclusion == 'success'");

    expect(
      blocked,
      `\`staging-blocked\` in ${DEPLOY} no longer negates the term the \`staging\` job requires, so the two no longer cover every completed CI run between them.`,
    ).toContain("github.event.workflow_run.conclusion != 'success'");

    // The three terms the two guards must share, so that the set one accepts
    // and the set the other announces are drawn from the same population.
    for (const term of [
      "github.event.workflow_run.event == 'push'",
      'github.event.workflow_run.head_repository.full_name == github.repository',
    ]) {
      expect(
        [publishing.includes(term), blocked.includes(term)],
        `\`${term}\` is on one of the two guards in ${DEPLOY} and not the other. They must agree: a term on the publishing side alone silently drops runs into neither job, and a term on the announcing side alone reports a run that would have published as blocked.`,
      ).toEqual([true, true]);
    }
  });

  it('actually fails, rather than printing a warning into a green run', async () => {
    const block = statements(jobBlock(await readRepositoryFile(DEPLOY), 'staging-blocked'));

    // The last executable line of the job. A `::error::` annotation on its own
    // leaves the run's conclusion `success`, and a green Deploy run is a worse
    // report than a skipped one: it looks like the site was published.
    expect(
      block.at(-1),
      `the last thing \`staging-blocked\` does in ${DEPLOY} is no longer \`exit 1\`. Failing is the entire mechanism: a run that only annotates concludes \`success\`, which reads as "the site was published" and is a worse report than the \`skipped\` this job replaced. If the announcement is meant to move somewhere else, #424's acceptance criteria ask that the new signal be demonstrated failing and then demonstrated silent -- do that before changing this.`,
    ).toBe('exit 1');

    expect(
      block.join('\n'),
      `\`staging-blocked\` in ${DEPLOY} no longer emits an \`::error::\` annotation. The exit code makes the run red; the annotation is what says which commit was not published and why, on the run page and in the Actions list.`,
    ).toContain('::error');
  });

  it('needs no credential and publishes nothing', async () => {
    const block = statements(jobBlock(await readRepositoryFile(DEPLOY), 'staging-blocked'));
    const body = block.join('\n');

    // This job is the one place in deploy.yml that runs when the gate has
    // REJECTED a run. It must therefore be inert: a step here executes on a
    // path the publishing guard deliberately refused.
    expect(
      body,
      `\`staging-blocked\` in ${DEPLOY} now reads a repository secret. It runs on exactly the path the \`staging\` guard rejected, so it must not be able to reach Cloudflare, Supabase or anything else: it exists to report, not to act.`,
    ).not.toContain('secrets.');

    expect(
      body,
      `\`staging-blocked\` in ${DEPLOY} now checks out a ref. It runs on the path the \`staging\` guard rejected -- which includes a CI run this workflow has just refused to trust -- and it has no reason to put that tree on the runner.`,
    ).not.toContain('actions/checkout');

    // `ubuntu-latest` does not work in this repository: version.yml's header
    // records run 32727713492 failing in four seconds with no step recorded
    // and no log, the signature of a runner that was never provisioned. An
    // announcement that cannot run is the defect again.
    expect(
      body,
      `\`staging-blocked\` in ${DEPLOY} now asks for a hosted runner. \`ubuntu-latest\` has never worked in this repository -- version.yml's header measures run 32727713492 failing after four seconds with no step recorded -- so this job would fail to start rather than report anything, and its message would be lost.`,
    ).not.toContain('ubuntu-latest');

    // The `woogitsu` label was appended on 2026-09-05, when the owner moved
    // this repository into the `woogitsu` organisation and pointed every
    // self-hosted job at that organisation's shared WSL2 pool
    // (`woogitsu-wsl-DOM-NEW-01` through `-04`). It selects the pool; the
    // assertion above about `ubuntu-latest` is untouched and still holds. The
    // same string is pinned in tests/foundation/ci-configuration-contract.test.ts,
    // and both had to move in the same commit -- a substring assertion left on
    // the old label reports the migration as a defect.
    expect(
      body,
      `\`staging-blocked\` in ${DEPLOY} no longer runs on the self-hosted runner every working job in this repository uses.`,
    ).toContain('runs-on: [self-hosted, Linux, X64, wsl2, woogitsu]');
  });

  it('cannot be cancelled by a later deploy joining the concurrency group', async () => {
    const workflow = await readRepositoryFile(DEPLOY);
    const lines = workflow.split(/\r?\n/u);
    const start = lines.indexOf('concurrency:');

    expect(
      start,
      `${DEPLOY} has no top-level \`concurrency:\` block.`,
    ).toBeGreaterThanOrEqual(0);

    const body = lines.slice(start + 1);
    const end = body.findIndex((line) => line.length > 0 && !/^\s/u.test(line));
    const group = (end === -1 ? body : body.slice(0, end))
      .map((line) => line.trim())
      .filter((line) => line.startsWith('group:'))
      .join(' ');

    expect(
      group.length,
      `no \`group:\` line parsed out of the concurrency block in ${DEPLOY}; the parser is broken.`,
    ).toBeGreaterThan(0);

    // The workflow-level group cancels the whole RUN, so without this term the
    // announcement is cancelled by the next deploy to join `deploy-staging` --
    // and a cancelled run is grey, which is the silence again. The same term
    // stops a run that publishes nothing from cancelling one that is
    // deploying: Deploy runs 32971477174 and 32996017285 both finished their
    // `wrangler deploy` and are filed as `cancelled` anyway, which loses the
    // record of a publish that happened.
    expect(
      group,
      `the concurrency group in ${DEPLOY} no longer distinguishes a run that will publish from one that will not. Two things depend on it: a run whose CI did not succeed must not cancel one that is mid-\`wrangler deploy\` (runs 32971477174 and 32996017285 both completed their upload and are filed as \`cancelled\`, so the record of a real publish was lost), and \`staging-blocked\` must not be cancelled mid-announcement by the next deploy -- a cancelled run is grey, which is the silence #424 is about. Restore \`github.event.workflow_run.conclusion == 'success'\` to the group expression, or say on #134 and #424 what replaces it.`,
    ).toContain("github.event.workflow_run.conclusion == 'success'");
  });
});
