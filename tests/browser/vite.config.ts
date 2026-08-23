import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Dev server used *only* by the Playwright browser tests
 * (`pnpm test:browser`). It is deliberately separate from the production
 * `vite.config.ts`: it loads no Cloudflare plugin and never participates in
 * `pnpm build`, so nothing here can reach the production bundle.
 *
 * The root stays the repository root so `tests/browser/harness.ts` can
 * import `src/persistence/**` by relative path and have Vite transpile the
 * real TypeScript sources on the fly — the browser tests exercise the same
 * modules the game ships, not a copy.
 */
export default defineConfig({
  root: repositoryRoot,
  // Keep the optimizer off `index.html` (which pulls in Phaser); the harness
  // page only needs the persistence + simulation sources and zod.
  optimizeDeps: {
    entries: ['tests/browser/harness.html', 'tests/browser/ui-harness.html'],
  },
  server: {
    host: '127.0.0.1',
    port: 5183,
    strictPort: true,
  },
});
