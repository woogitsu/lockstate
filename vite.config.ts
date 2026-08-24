import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import { buildIdentityDefines } from './tooling/build-identity.mjs';

export default defineConfig({
  plugins: [cloudflare()],
  // The build's own identity, replaced into the bundle at compile time.
  // Compile-time constants rather than environment variables: they are baked
  // into a public bundle and there is nothing secret in either. The resolvers
  // live in `tooling/build-identity.mjs` because
  // `tests/browser/vite.config.ts` needs the same ones -- the browser suite is
  // the only layer that can prove the injection works, and a second copy there
  // would prove the copy.
  define: buildIdentityDefines(),
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
