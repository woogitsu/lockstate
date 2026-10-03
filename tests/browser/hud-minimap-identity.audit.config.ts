import { defineConfig } from '@playwright/test';
import artifact from './playwright.artifact.config';
export default defineConfig({ ...artifact, testMatch: /hud-minimap-identity\.audit\.ts$/, testIgnore: [] });
