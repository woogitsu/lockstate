import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
// This cannot execute tests. It lists source cases while the sole build/browser
// lease is elsewhere; the runnable config still requires the real built client.
if (!process.argv.includes('--list')) throw new Error('Collection-only config requires --list; use playwright.native.config.ts for actual built-client execution');
export default defineConfig({ testDir: fileURLToPath(new URL('.', import.meta.url)), testMatch: /object-rotation-fullhd\.native\.ts$/,
  fullyParallel: false, workers: 1, retries: 0, timeout: 60_000, expect: { timeout: 10_000 } });
