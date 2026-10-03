import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'node',globals:false,include:['docs/research/2026-10-03-common-room-connectivity-review/saturated-room-cost.audit.ts'],passWithNoTests:false,maxWorkers:1,testTimeout:30_000}});
