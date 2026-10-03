import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import native from './playwright.native.config';
export default defineConfig({ ...native, testMatch: /object-rotation-scroll\.native\.ts$/, outputDir: fileURLToPath(new URL('./native-results/scroll', import.meta.url)) });
