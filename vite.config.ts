import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig, type Plugin } from 'vite';
import { buildIdentityDefines } from './tooling/build-identity.mjs';
import { telemetryDefines } from './tooling/telemetry-config.mjs';

/**
 * The exact text `src/content/room-catalog.ts` throws when a room requires an
 * object no catalogue declares. A string literal rather than an identifier,
 * because identifiers are mangled in a minified chunk and this has to be
 * findable in the artefact a player downloads.
 */
const CONTENT_CROSS_REFERENCE_MARKER = 'failed cross-reference validation';

/**
 * Fails the build if the content cross-reference validation is not in the
 * client bundle.
 *
 * Issue #315: the check was documented in two places as failing fast at
 * startup and was absent from every shipped build, because it lived in
 * `src/content/index.ts` -- a barrel nothing in the production graph imports,
 * so the bundler dropped the module and its `throw` with it. Nothing failed.
 * `tsc` was clean, the tests were green (they import the barrel), `vite dev`
 * ran the check, and the artefact did not contain it.
 *
 * That is the failure this plugin exists to make impossible to repeat, and it
 * is the only layer that can: a test can prove the check is *written* and can
 * prove the module is *reachable*
 * (`tests/foundation/content-validation-reachability-contract.test.ts` does
 * the latter), but neither runs the bundler, and reachable is not the same as
 * emitted -- tree-shaking is a judgement about side effects that a change to
 * this file, to Vite, or to the module's shape can alter without touching a
 * line of `src/content/`. This reads the emitted chunk.
 *
 * It runs on `pnpm build` and `pnpm build:staging`, so it is on the CI path
 * through `pnpm verify`.
 */
function assertContentValidationIsShipped(): Plugin {
  return {
    name: 'lockstate:content-validation-is-shipped',
    apply: 'build',
    // After every transform and the minifier, so what is inspected is what is
    // written to `dist/`.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((output) => output.type === 'chunk');

      // The Cloudflare plugin builds more than one environment, and only the
      // client one carries game code. Skipping an environment with no
      // JavaScript is correct; passing because a bundle was empty is the
      // vacuous green this plugin must not produce, so the client environment
      // is required to be non-empty rather than merely checked if present.
      if (this.environment.name !== 'client') return;
      if (chunks.length === 0) {
        this.error(
          'The client environment emitted no JavaScript chunk, so nothing could be checked for the content cross-reference validation. This gate cannot pass vacuously (#315).',
        );
        return;
      }

      if (chunks.some((chunk) => chunk.code.includes(CONTENT_CROSS_REFERENCE_MARKER))) return;

      this.error(
        `No emitted client chunk contains ${JSON.stringify(CONTENT_CROSS_REFERENCE_MARKER)}, so the content cross-reference validation is not in this build. ` +
          'It has to run in the shipped artefact, not only under `vite dev` and in the test suite -- that was issue #315, where a dangling room-to-object reference could boot a build and break later. ' +
          'It lives at the bottom of `src/content/room-catalog.ts` because every reader of `defaultRoomContentRegistry` imports that module; if it has deliberately moved somewhere the bundler still emits, update this marker in the same change, and `docs/CONTENT.md` with it.',
      );
    },
  };
}

export default defineConfig({
  plugins: [cloudflare(), assertContentValidationIsShipped()],
  // The build's own identity, replaced into the bundle at compile time.
  // Compile-time constants rather than environment variables: they are baked
  // into a public bundle and there is nothing secret in either. The resolvers
  // live in `tooling/build-identity.mjs` because
  // `tests/browser/vite.config.ts` needs the same ones -- the browser suite is
  // the only layer that can prove the injection works, and a second copy there
  // would prove the copy.
  //
  // `telemetryDefines()` is the telemetry ingestion destination, on the same
  // terms: nothing secret, absent unless a deployment sets it, and validated
  // in `src/services/telemetry/ingestion-config.ts` rather than here. With
  // both variables unset -- which is every workflow in this repository -- it
  // resolves to two empty strings and no transport is ever constructed.
  define: { ...buildIdentityDefines(), ...telemetryDefines() },
  build: {
    target: 'es2022',
    // Public source maps would expose original game source in Static Assets.
    // A future private error-reporting pipeline may upload them separately.
    sourcemap: false,
    reportCompressedSize: true,
  },
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
});
