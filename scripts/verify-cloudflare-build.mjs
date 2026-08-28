/**
 * What a Cloudflare build must be true of before it may be deployed.
 *
 * Runs as part of `pnpm verify:deployment`, which is a CI job step, so a throw
 * here fails the build. In order, this script guarantees:
 *
 * 1. `dist` contains exactly one generated Wrangler config;
 * 2. it declares an assets object with SPA fallback handling;
 * 3. the Worker name, `workers_dev`, `preview_urls` and the routes match the
 *    environment named on the command line -- and staging carries no
 *    production custom-domain route;
 * 4. `assets.directory` resolves inside `dist`;
 * 5. `index.html` and `_headers` are present, and `_headers` still carries the
 *    immutable asset cache policy;
 * 6. `.assetsignore` keeps `wrangler.json` and `.dev.vars` off the public
 *    origin, each on a line of its own (issue #439 -- see the long comment at
 *    that check for why the line-of-its-own part is the whole point);
 * 7. no `.map` file reaches the assets directory;
 * 8. the Wrangler deploy redirect points at the config this build generated.
 *
 * Issue #439 referred to this enumeration as already existing. It did not --
 * the file began at the imports below -- so it is written here now, and this
 * list is a description of the code beneath it rather than a promise the code
 * is checked against. Adding a check without adding a line here will make it
 * wrong again.
 *
 * What it does NOT check is the served response. That is
 * `scripts/verify-deployment-preview.mjs`, which runs the built output through
 * workerd; the two overlap on purpose, because a file being correct and a
 * runtime honouring it fail separately.
 */

import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDirectory = path.join(repositoryRoot, 'dist');
const selectedEnvironment = process.argv[2]?.trim();

if (selectedEnvironment !== 'staging' && selectedEnvironment !== 'production') {
  throw new Error('Expected a Cloudflare environment argument: staging or production.');
}

async function findFiles(directory, predicate) {
  const entries = await readdir(directory, { withFileTypes: true });
  const matches = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      matches.push(...(await findFiles(entryPath, predicate)));
    } else if (entry.isFile() && predicate(entry.name)) {
      matches.push(entryPath);
    }
  }

  return matches;
}

function assertBoolean(config, key, expected) {
  if (config[key] !== expected) {
    throw new Error(`Expected generated ${key}=${expected}, received ${String(config[key])}.`);
  }
}

await access(distDirectory);

const outputConfigs = await findFiles(
  distDirectory,
  (filename) => filename === 'wrangler.json' || filename === 'wrangler.jsonc',
);

if (outputConfigs.length !== 1) {
  throw new Error(
    `Expected exactly one generated Wrangler config in dist, found ${outputConfigs.length}.`,
  );
}

const outputConfigPath = outputConfigs[0];
const outputConfig = JSON.parse(await readFile(outputConfigPath, 'utf8'));
const assets = outputConfig.assets;

if (typeof assets !== 'object' || assets === null) {
  throw new Error('Generated Wrangler configuration does not contain an assets object.');
}

if (assets.not_found_handling !== 'single-page-application') {
  throw new Error('Generated Wrangler configuration does not preserve SPA fallback handling.');
}

if (typeof assets.directory !== 'string' || assets.directory.length === 0) {
  throw new Error('Generated Wrangler configuration does not point to the client asset directory.');
}

if (selectedEnvironment === 'staging') {
  if (outputConfig.name !== 'lockstate-staging') {
    throw new Error(
      `Expected staging Worker name lockstate-staging, received ${String(outputConfig.name)}.`,
    );
  }

  assertBoolean(outputConfig, 'workers_dev', true);
  assertBoolean(outputConfig, 'preview_urls', true);

  if (Array.isArray(outputConfig.routes) && outputConfig.routes.length > 0) {
    throw new Error('Staging deployment must not contain production custom-domain routes.');
  }
} else {
  if (outputConfig.name !== 'lockstate') {
    throw new Error(`Expected production Worker name lockstate, received ${String(outputConfig.name)}.`);
  }

  assertBoolean(outputConfig, 'workers_dev', false);
  assertBoolean(outputConfig, 'preview_urls', false);

  const productionRoute = Array.isArray(outputConfig.routes)
    ? outputConfig.routes.find(
        (route) => route?.pattern === 'lockstate.io' && route?.custom_domain === true,
      )
    : undefined;

  if (productionRoute === undefined) {
    throw new Error('Generated production config does not contain the lockstate.io Custom Domain.');
  }
}

const assetsDirectory = path.resolve(path.dirname(outputConfigPath), assets.directory);
const assetsRelativeToDist = path.relative(distDirectory, assetsDirectory);

if (assetsRelativeToDist.startsWith('..') || path.isAbsolute(assetsRelativeToDist)) {
  throw new Error('Generated assets directory points outside dist.');
}

await access(path.join(assetsDirectory, 'index.html'));
const headersPath = path.join(assetsDirectory, '_headers');
await access(headersPath);

const headers = await readFile(headersPath, 'utf8');
if (!headers.includes('max-age=31536000') || !headers.includes('immutable')) {
  throw new Error('Generated _headers does not contain the immutable asset cache policy.');
}

/**
 * The two names that must never be reachable from the public origin, and the
 * only thing that keeps them off it.
 *
 * `assets.directory` is `.`, so Cloudflare serves `dist/` itself -- generated
 * Wrangler config and all. What excludes those two files is `dist/.assetsignore`,
 * and this repository does not write it: `@cloudflare/vite-plugin` emits it
 * during the client build, as
 * `${existing}${['wrangler.json', '.dev.vars'].join('\n')}\n` where `${existing}`
 * is any `public/.assetsignore` the repository supplies. Nothing here owns that
 * behaviour, so nothing here can promise it -- which is exactly why it is
 * asserted on the built output rather than on the plugin's source. The plugin is
 * the thing that might change (issue #439).
 *
 * `wrangler.json` carries the Worker and environment names, the production
 * route and the absolute build-workspace path; `.dev.vars` is a secrets file
 * this repository does not currently produce, because CI passes secrets through
 * `env:` (`scripts/check-deploy-secrets.sh`). So the gate defends a hole that is
 * shut, which is the cheapest moment to build one.
 *
 * **Each name must be on a line of its own**, not merely present, because the
 * concatenation above has no separator: a `public/.assetsignore` whose last line
 * lacked a trailing newline would fuse it onto the first plugin name
 * (`...somethingwrangler.json`) and silently un-ignore *both*. A naive
 * `includes('wrangler.json')` would pass on that exact string.
 *
 * One correction to issue #439, which called that fusion "the one worth the
 * gate": at `@cloudflare/vite-plugin@1.53.1` it cannot currently happen. The
 * plugin's `readAssetsIgnoreFile` normalises the file it reads: it returns the
 * content unchanged when its last character is a newline and appends one when it
 * is not, so the missing newline is added back before the concatenation. The hazard is real but it is
 * a *regression* hazard, not a live one: it returns the day that normalisation
 * is removed or the file is assembled some other way. That is the same class as
 * the issue's first hazard, and this check covers both without caring which.
 */
const ASSETS_IGNORE_REQUIRED_ENTRIES = ['wrangler.json', '.dev.vars'];
const assetsIgnorePath = path.join(assetsDirectory, '.assetsignore');
const assetsIgnoreRelativePath = path.relative(repositoryRoot, assetsIgnorePath);

let assetsIgnoreContent;
try {
  assetsIgnoreContent = await readFile(assetsIgnorePath, 'utf8');
} catch {
  throw new Error(
    `Missing ${assetsIgnoreRelativePath}, which is the only thing keeping ` +
      `${ASSETS_IGNORE_REQUIRED_ENTRIES.join(' and ')} off the public origin. ` +
      '@cloudflare/vite-plugin emits it during the client build; if it no longer does, ' +
      'those files are served.',
  );
}

// A trailing \r only, so a CRLF checkout still matches -- but no other trimming:
// `wrangler.json ` with a stray space is not an entry workerd would honour, and a
// check that trimmed it would report a protection this build does not have.
const assetsIgnoreLines = assetsIgnoreContent
  .split('\n')
  .map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));

const missingAssetsIgnoreEntries = ASSETS_IGNORE_REQUIRED_ENTRIES.filter(
  (entry) => !assetsIgnoreLines.includes(entry),
);

if (missingAssetsIgnoreEntries.length > 0) {
  throw new Error(
    `${assetsIgnoreRelativePath} must list ${ASSETS_IGNORE_REQUIRED_ENTRIES.join(' and ')}, ` +
      'each on a line of its own, or those files are served from the public origin. ' +
      `Not found on any line: ${missingAssetsIgnoreEntries.join(', ')}. ` +
      `The file currently reads: ${JSON.stringify(assetsIgnoreContent)}`,
  );
}

const publicSourceMaps = await findFiles(assetsDirectory, (filename) => filename.endsWith('.map'));

if (publicSourceMaps.length > 0) {
  throw new Error(
    `Public source maps are forbidden in Static Assets: ${publicSourceMaps
      .map((file) => path.relative(repositoryRoot, file))
      .join(', ')}`,
  );
}

const redirectPath = path.join(repositoryRoot, '.wrangler', 'deploy', 'config.json');
await access(redirectPath);
const redirectConfig = JSON.parse(await readFile(redirectPath, 'utf8'));
const redirectedConfigPath = path.resolve(path.dirname(redirectPath), redirectConfig.configPath ?? '');

if (redirectedConfigPath !== path.resolve(outputConfigPath)) {
  throw new Error('Wrangler deploy redirect does not reference the generated build configuration.');
}

console.log(
  `Verified Cloudflare ${selectedEnvironment} output: ${path.relative(
    repositoryRoot,
    outputConfigPath,
  )} -> ${path.relative(repositoryRoot, assetsDirectory)}`,
);
