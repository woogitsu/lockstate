import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = resolve(root, 'assets/intermediate/reception-room-native-preparation');
mkdirSync(directory, { recursive: true });
const path = resolve(directory, 'playwright.reception.artifact.config.ts');
writeFileSync(path, `import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import artifact from '../../../tests/browser/playwright.artifact.config.ts';

export default defineConfig({
  ...artifact,
  testMatch: /native-reception-room\\.recipe\\.ts$/,
  outputDir: fileURLToPath(new URL('./native-results/', import.meta.url)),
});
`, 'utf8');
console.log(`Prepared opt-in actual built-client recipe: ${path}`);
console.log('Inherited 60s cases/expect10s/workers1/retries0. No build/browser/server started. Requires the integrated Reception waiting-armchair AND registration-desk models in the actual production build.');
