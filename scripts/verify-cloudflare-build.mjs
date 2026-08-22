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
