import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Separate, explicitly-invoked project for the persistence measurement
 * harness:
 *
 *   pnpm exec vitest run --config tests/perf/vitest.perf.config.ts
 *
 * It is intentionally NOT part of `pnpm test`. The root `vitest.config.ts`
 * only collects `*.test.ts`, and every file here is named `*.perf.ts`, so
 * building multi-hundred-chunk prisons and running repeated save/load
 * samples never slows the ordinary correctness gate. These files still get
 * strict-typechecked by `pnpm typecheck`, because `tsconfig.json` includes
 * the whole `tests` tree.
 */
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/perf/**/*.perf.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    passWithNoTests: false,
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    // Fixture construction and repeated large-payload samples are the point
    // here, so the ordinary 5s correctness-test budget does not apply.
    testTimeout: 900_000,
    hookTimeout: 900_000,
    // One file at a time, one worker: concurrent workers would contend for
    // CPU and make every duration meaningless.
    fileParallelism: false,
    maxWorkers: 1,
  },
});
