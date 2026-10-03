import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Generate an ignored opt-in config; do not add this larger player journey to
// shared CI/source-dev specs. Loading the canonical base still requires the
// real production build, and preserves its production preview server and gates.
const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = resolve(root, 'assets/intermediate/small-prison-showcase');
mkdirSync(directory, { recursive: true });
const config = resolve(directory, 'playwright.showcase.artifact.config.ts');
writeFileSync(config, `import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import artifact from '../../../tests/browser/playwright.artifact.config.ts';

export default defineConfig({
  ...artifact,
  testMatch: /native-small-prison-showcase\\.recipe\\.ts$/,
  outputDir: fileURLToPath(new URL('./native-results/', import.meta.url)),
});
`, 'utf8');
console.log(`Prepared opt-in built-client config: ${config}`);
console.log('No browser, server or build started. Root runs the native route serially after a real production build.');
