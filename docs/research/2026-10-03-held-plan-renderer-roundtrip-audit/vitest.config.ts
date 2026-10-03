import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'node',globals:false,include:['docs/research/2026-10-03-held-plan-renderer-roundtrip-audit/held-roundtrip.test.ts'],testTimeout:5000,hookTimeout:5000,restoreMocks:true,unstubGlobals:true}});
