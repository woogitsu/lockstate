import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const [task, environment] = process.argv.slice(2);
const validTasks = new Set(['build', 'preview', 'dry-run', 'deploy']);
const validEnvironments = new Set(['staging', 'production']);

if (!validTasks.has(task) || !validEnvironments.has(environment)) {
  console.error(
    'Usage: node scripts/cloudflare-task.mjs <build|preview|dry-run|deploy> <staging|production>',
  );
  process.exit(2);
}

if (
  task === 'deploy' &&
  environment === 'production' &&
  process.env.LOCKSTATE_PRODUCTION_DEPLOY !== '1'
) {
  console.error(
    'Production deployment is guarded. Set LOCKSTATE_PRODUCTION_DEPLOY=1 after staging verification.',
  );
  process.exit(2);
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verifyBuildScript = path.join(repositoryRoot, 'scripts', 'verify-cloudflare-build.mjs');

/**
 * Every task below used to shell out through `pnpm exec <tool>`. That works in
 * a normal checkout and **aborts in a git worktree**, which is how this
 * repository's agents are required to work (`docs/AGENT_WORKFLOW.md` §2: "Every
 * implementing agent gets its own git worktree as its first action").
 *
 * The mechanism, which the symptom hides: pnpm 11 runs a dependency-status
 * check before `exec`, decides the tree is out of date, and shells out to
 * `pnpm install`; the install then refuses with
 *
 *   [ERR_PNPM_UNSAFE_MODULES_DIR] Refusing to remove the modules directory at
 *   ".../node_modules" because its resolved target is not a strict
 *   subdirectory of the project root at ".../<worktree>".
 *
 * -- because a worktree's `node_modules` is a symlink to the main checkout's.
 * `node scripts/cloudflare-task.mjs build production` therefore failed for a
 * reason that has nothing to do with the build, on the one command a CI job
 * and three docs tell an agent to run to produce the artefact.
 *
 * `tests/browser/playwright.config.ts` already carries this fix and the same
 * explanation for its own web server; this is the same fix applied to the
 * other place in the repository that spawns a packaged binary. Resolve the
 * tool's bin out of its own `package.json` -- the bin paths are not in the
 * `exports` map, so `require.resolve` on the subpath throws
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` and the `bin` field is the supported way in
 * -- and run it on this process's own Node. One process instead of three, no
 * opinion about whether `node_modules` is a symlink, identical behaviour in a
 * plain checkout and in a worktree.
 */
const requireFromHere = createRequire(import.meta.url);

function binaryOf(packageName) {
  const manifestPath = requireFromHere.resolve(`${packageName}/package.json`);
  const manifest = requireFromHere(`${packageName}/package.json`);
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[packageName];

  if (typeof bin !== 'string') {
    throw new Error(
      `${packageName} declares no \`bin.${packageName}\` in its package.json, so this script cannot run it without a package manager. Check the installed version.`,
    );
  }

  return path.resolve(path.dirname(manifestPath), bin);
}

/**
 * The one service `pnpm exec` performed that resolving a bin does not: it put
 * `node_modules/.bin` on the child's `PATH`. A tool that shells out to a
 * sibling binary by name would otherwise stop finding it, and that failure
 * would arrive far from this change.
 */
const binDirectory = path.join(repositoryRoot, 'node_modules', '.bin');
const cloudflareEnvironment = {
  ...process.env,
  CLOUDFLARE_ENV: environment,
  PATH: `${binDirectory}${path.delimiter}${process.env.PATH ?? ''}`,
};

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(' ')} failed (${signal ? `signal ${signal}` : `exit ${code}`})`,
        ),
      );
    });
  });
}

async function build() {
  await run(
    process.execPath,
    [binaryOf('vite'), 'build', '--mode', environment],
    cloudflareEnvironment,
  );
  await run(process.execPath, [verifyBuildScript, environment], cloudflareEnvironment);
}

try {
  await build();

  if (task === 'build') {
    process.exit(0);
  }

  if (task === 'preview') {
    await run(process.execPath, [binaryOf('vite'), 'preview'], cloudflareEnvironment);
    process.exit(0);
  }

  if (task === 'dry-run') {
    const outdir = path.join(repositoryRoot, '.wrangler', 'dry-run', environment);
    await rm(outdir, { recursive: true, force: true });
    await mkdir(outdir, { recursive: true });
    await run(
      process.execPath,
      [binaryOf('wrangler'), 'deploy', '--dry-run', '--outdir', outdir, '--strict'],
      cloudflareEnvironment,
    );
    process.exit(0);
  }

  await run(process.execPath, [binaryOf('wrangler'), 'deploy', '--strict'], cloudflareEnvironment);
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
