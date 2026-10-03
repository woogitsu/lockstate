import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'node',globals:false,include:['docs/research/2026-10-03-common-room-connectivity-review/integration.audit.ts'],passWithNoTests:false,maxWorkers:2,testTimeout:30_000}});
