import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['docs/research/2026-10-03-ci2010-ui-source2-diagnosis/quote-clamp-dom.test.ts'],testTimeout:5000,hookTimeout:5000,restoreMocks:true,unstubGlobals:true}});
