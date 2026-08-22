import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteEntry = path.resolve(repositoryRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const readinessTimeoutMs = 30_000;
const requestTimeoutMs = 5_000;
let previewOutput = '';

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Could not reserve a local TCP port for the deployment preview.'));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

function captureOutput(stream) {
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    previewOutput = `${previewOutput}${chunk}`.slice(-16_000);
  });
}

async function fetchWithTimeout(url, init = {}) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
}

async function waitForPreview(previewProcess, origin) {
  const deadline = Date.now() + readinessTimeoutMs;

  while (Date.now() < deadline) {
    if (previewProcess.exitCode !== null) {
      throw new Error(
        `Deployment preview exited before becoming ready (code ${previewProcess.exitCode}).`,
      );
    }

    try {
      const response = await fetchWithTimeout(new URL('/', origin), {
        headers: { Accept: 'text/html' },
      });
      await response.body?.cancel();

      if (response.ok) {
        return;
      }
    } catch {
      // The preview process may still be starting. Retry until the deadline.
    }

    await delay(250);
  }

  throw new Error(`Deployment preview did not become ready within ${readinessTimeoutMs} ms.`);
}

async function fetchText(url) {
  const response = await fetchWithTimeout(url, {
    headers: { Accept: 'text/html' },
  });
  const body = await response.text();

  assert.equal(response.status, 200, `${url.pathname} must return HTTP 200.`);

  return { response, body };
}

async function stopPreview(previewProcess) {
  if (previewProcess.exitCode !== null) {
    return;
  }

  previewProcess.kill('SIGTERM');
  const exited = await Promise.race([
    once(previewProcess, 'exit').then(() => true),
    delay(3_000).then(() => false),
  ]);

  if (!exited && previewProcess.exitCode === null) {
    if (process.platform === 'win32' && previewProcess.pid) {
      const killer = spawn(
        'taskkill',
        ['/pid', String(previewProcess.pid), '/T', '/F'],
        { stdio: 'ignore' },
      );
      await once(killer, 'exit');
    } else {
      previewProcess.kill('SIGKILL');
      await once(previewProcess, 'exit');
    }
  }
}

async function main() {
  const port = await reservePort();
  const origin = new URL(`http://127.0.0.1:${port}`);
  const previewProcess = spawn(
    process.execPath,
    [viteEntry, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  captureOutput(previewProcess.stdout);
  captureOutput(previewProcess.stderr);

  try {
    await waitForPreview(previewProcess, origin);

    const root = await fetchText(new URL('/', origin));
    const deepLink = await fetchText(new URL('/prisons/local-smoke-test/dashboard', origin));

    assert.match(root.body, /<title>Lockstate\.io<\/title>/, 'Root must contain Lockstate shell.');
    assert.match(root.body, /id="game-root"/, 'Root must contain the Phaser mount point.');
    assert.equal(deepLink.body, root.body, 'A deep link must resolve to the same SPA shell as /.');

    const htmlCacheControl = root.response.headers.get('cache-control') ?? '';
    assert.match(htmlCacheControl, /max-age=0/i, 'HTML must require revalidation.');
    assert.doesNotMatch(htmlCacheControl, /immutable/i, 'HTML must never be cached as immutable.');
    assert.equal(
      root.response.headers.get('x-content-type-options'),
      'nosniff',
      'Static responses must include the security header baseline.',
    );

    const assetMatch = root.body.match(/(?:src|href)="([^"?]*\/assets\/[^"?]+)"/u);
    assert.ok(assetMatch?.[1], 'The shell must reference a fingerprinted Vite asset.');

    const assetResponse = await fetchWithTimeout(new URL(assetMatch[1], origin));
    await assetResponse.arrayBuffer();
    assert.equal(assetResponse.status, 200, 'The fingerprinted asset must be served.');

    const assetCacheControl = assetResponse.headers.get('cache-control') ?? '';
    assert.match(
      assetCacheControl,
      /max-age=31536000/i,
      'Fingerprint assets must receive a one-year cache lifetime.',
    );
    assert.match(assetCacheControl, /immutable/i, 'Fingerprint assets must be immutable.');

    console.log(`Cloudflare deployment preview smoke test passed on ${origin.origin}.`);
  } finally {
    await stopPreview(previewProcess);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);

  if (previewOutput.trim().length > 0) {
    console.error('\nPreview process output:\n');
    console.error(previewOutput.trim());
  }

  process.exitCode = 1;
});
