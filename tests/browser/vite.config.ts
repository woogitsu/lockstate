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
 *
 * `index.html` is served too, because `app-shell.spec.ts` drives the real
 * application entry rather than a harness: the renderer's canvas, the mounted
 * HUD and the save panel only exist together on that page. It is the same
 * `index.html` the production build uses; only the server around it differs.
 * `public/` is the default `publicDir` under this root, so the runtime atlases
 * are served from `/assets/actors/**` exactly as they are in production.
 */
export default defineConfig({
  root: repositoryRoot,
  // Pre-bundle from every page the suite actually opens. `index.html` pulls in
  // Phaser, so leaving it out made the first app-shell test pay for an
  // optimizer run and the page reload that follows it.
  optimizeDeps: {
    entries: [
      'tests/browser/harness.html',
      'tests/browser/ui-harness.html',
      'tests/browser/camera-harness.html',
      'index.html',
    ],
  },
  server: {
    host: '127.0.0.1',
    // `playwright.config.ts` passes `--port` explicitly, which wins; this is
    // the default for anyone starting the harness server by hand. Both read
    // the same variable so a second checkout can move off 5183 in one place.
    port: Number(process.env['LOCKSTATE_BROWSER_TEST_PORT'] ?? 5183),
    strictPort: true,
  },
});
