import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [cloudflare()],
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
