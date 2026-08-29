import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const viteManifestPath = createRequire(import.meta.url).resolve('vite/package.json');
const viteBinField = (createRequire(import.meta.url)('vite/package.json') as { bin: { vite: string } }).bin.vite;
const viteBinPath = resolve(dirname(viteManifestPath), viteBinField);
const port = Number(process.env['LOCKSTATE_BROWSER_TEST_PORT'] ?? 5307);
const baseURL = `http://127.0.0.1:${port}`;
const explicitExecutablePath = process.env['LOCKSTATE_CHROMIUM_PATH'];

export default defineConfig({
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 600_000,
  expect: { timeout: 10_000 },
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    baseURL,
    browserName: 'chromium',
    ...(explicitExecutablePath === undefined ? {} : { launchOptions: { executablePath: explicitExecutablePath } }),
  },
  webServer: {
    command: `${JSON.stringify(execPath)} ${JSON.stringify(viteBinPath)} --config tests/browser/vite.config.ts --port ${port} --strictPort`,
    cwd: repositoryRoot,
    url: `${baseURL}/tests/browser/harness.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
