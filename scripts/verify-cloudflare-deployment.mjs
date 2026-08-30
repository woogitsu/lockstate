import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const taskScript = path.join(repositoryRoot, 'scripts', 'cloudflare-task.mjs');
const previewScript = path.join(repositoryRoot, 'scripts', 'verify-deployment-preview.mjs');

/**
 * Same reason as `scripts/cloudflare-task.mjs`'s `run`: without a contextual
 * return type `new Promise` infers `Promise<unknown>` and `resolve()` with no
 * argument is an error (#602).
 *
 * @returns {Promise<void>}
 */
function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repositoryRoot,
      env: process.env,
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
          `${process.execPath} ${args.join(' ')} failed (${signal ? `signal ${signal}` : `exit ${code}`})`,
        ),
      );
    });
  });
}

try {
  await runNode([taskScript, 'dry-run', 'production']);
  await runNode([previewScript]);
  await runNode([taskScript, 'dry-run', 'staging']);
  console.log('Cloudflare production and staging deployment verification passed.');
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
