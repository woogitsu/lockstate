import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
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
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const cloudflareEnvironment = {
  ...process.env,
  CLOUDFLARE_ENV: environment,
};

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env,
      stdio: 'inherit',
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
    pnpmCommand,
    ['exec', 'vite', 'build', '--mode', environment],
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
    await run(pnpmCommand, ['exec', 'vite', 'preview'], cloudflareEnvironment);
    process.exit(0);
  }

  if (task === 'dry-run') {
    const outdir = path.join(repositoryRoot, '.wrangler', 'dry-run', environment);
    await rm(outdir, { recursive: true, force: true });
    await mkdir(outdir, { recursive: true });
    await run(
      pnpmCommand,
      ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', outdir, '--strict'],
      cloudflareEnvironment,
    );
    process.exit(0);
  }

  await run(pnpmCommand, ['exec', 'wrangler', 'deploy', '--strict'], cloudflareEnvironment);
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
