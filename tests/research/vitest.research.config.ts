import { defineConfig } from 'vitest/config';

/**
 * The config that makes a research instrument runnable **and** keeps it out of
 * `pnpm test`.
 *
 * `vitest.config.ts` collects `src/**` and `tests/**` under `*.test.ts`, so a
 * measurement that takes minutes cannot live under either name without being
 * charged to every CI run. `vitest` 4.1.11 has no `--include` flag -- it exits
 * with ``Unknown option `--include` ``, measured rather than assumed -- so a
 * second config is the only way to point the runner at a different set of
 * files.
 *
 * `disableConsoleIntercept` is what makes an instrument an instrument: without
 * it the default reporter swallows every `console.log`, and a measurement pass
 * prints nothing at all.
 *
 * Nothing collected here is a gate. A file under this config asserts only that
 * the prison it built is the prison it says it built; its deliverable is the
 * table it prints, which is quoted into a note under `docs/research/`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/research/**/*.research.ts'],
    passWithNoTests: false,
    disableConsoleIntercept: true,
    testTimeout: 3_600_000,
    hookTimeout: 3_600_000,
  },
});
