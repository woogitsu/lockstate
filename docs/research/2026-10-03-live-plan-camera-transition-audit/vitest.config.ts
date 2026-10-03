import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'node',globals:false,include:['docs/research/2026-10-03-live-plan-camera-transition-audit/live-camera-sequence.test.ts'],testTimeout:5000,hookTimeout:5000,restoreMocks:true,unstubGlobals:true}});
