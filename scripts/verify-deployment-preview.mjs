import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

/**
 * The security headers a deployed response must carry, and their exact values.
 *
 * Declared here rather than read out of `public/_headers`, deliberately: a
 * check derived from that file would pass after a header was deleted from it,
 * because the assertion would vanish with the declaration. This list is the
 * requirement; `public/_headers` is the implementation of it.
 *
 * Before this existed only `X-Content-Type-Options` was asserted, so deleting
 * the other three from `public/_headers` left `pnpm verify`,
 * `pnpm verify:deployment` and all three CI jobs green -- shipping the site
 * clickjackable, with a full referrer and no permissions policy, and nothing
 * saying a word (issue #138).
 *
 * Note what this does NOT cover: there is no Content-Security-Policy at all,
 * which matters because the bundle carries ~1.6 MB of Phaser. Adding one has a
 * real chance of breaking the renderer, so it is its own change; see #105.
 */
const SECURITY_HEADER_BASELINE = [
  ['x-content-type-options', 'nosniff'],
  ['x-frame-options', 'DENY'],
  ['referrer-policy', 'strict-origin-when-cross-origin'],
  ['permissions-policy', 'camera=(), geolocation=(), microphone=(), usb=()'],
];

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

/**
 * Runtime art (issue #32) is published from `public/`, so Vite never
 * fingerprints it: `/assets/actors/actor.<role>.base.walk.png` keeps that URL
 * across re-renders, and the atlas manifest beside it is the version pointer
 * that tells a client the art changed. ADR-0002 grants immutable caching to
 * fingerprinted names only, so this subtree must revalidate.
 *
 * Overlapping `_headers` rules concatenate into a single Cache-Control rather
 * than overriding one another, which silently produced
 * `max-age=31536000, immutable, max-age=300, must-revalidate`. Asserting that a
 * directive appears exactly once is what stops that shape coming back.
 */
async function assertRuntimeArtCachePolicy(origin) {
  const distDirectory = path.join(repositoryRoot, 'dist');

  const checks = [
    { file: path.join(distDirectory, 'assets', 'actors', 'asset-registry.json'), pathname: '/assets/actors/asset-registry.json', immutable: false },
  ];

  const sourceArtDirectory = path.join(distDirectory, 'game-content', 'source-art');
  const sourceArt = existsSync(sourceArtDirectory)
    ? (await readdir(sourceArtDirectory)).filter((name) => name.endsWith('.png')).sort()[0]
    : undefined;
  if (sourceArt !== undefined) {
    // Content-hashed filename: its URL changes whenever its bytes do.
    checks.push({ file: path.join(sourceArtDirectory, sourceArt), pathname: `/game-content/source-art/${sourceArt}`, immutable: true });
  }

  for (const check of checks) {
    if (!existsSync(check.file)) continue;

    const response = await fetchWithTimeout(new URL(check.pathname, origin));
    await response.arrayBuffer();
    assert.equal(response.status, 200, `${check.pathname} must be served.`);

    const cacheControl = response.headers.get('cache-control') ?? '';
    assert.equal(
      cacheControl.match(/max-age=/gi)?.length ?? 0,
      1,
      `${check.pathname} must receive exactly one cache lifetime, received "${cacheControl}".`,
    );

    if (check.immutable) {
      assert.match(cacheControl, /immutable/i, `${check.pathname} has a content-hashed name and must be cached immutably.`);
    } else {
      assert.doesNotMatch(
        cacheControl,
        /immutable/i,
        `${check.pathname} is not fingerprinted, so it must never be cached as immutable.`,
      );
      assert.match(cacheControl, /must-revalidate/i, `${check.pathname} must stay update-safe.`);
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
    for (const [header, expected] of SECURITY_HEADER_BASELINE) {
      assert.equal(
        root.response.headers.get(header),
        expected,
        `Static responses must send ${header}: ${expected}. public/_headers declares it on /*; if it has been removed or changed there, this is the gate that says so.`,
      );
    }

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

    await assertRuntimeArtCachePolicy(origin);

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
