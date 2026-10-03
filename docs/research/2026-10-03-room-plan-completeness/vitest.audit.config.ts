import { defineConfig } from 'vitest/config';

export default defineConfig({ test: {
  environment: 'node', globals: false,
  include: ['docs/research/2026-10-03-room-plan-completeness/quarter-turn.audit.ts', 'docs/research/2026-10-03-room-plan-completeness/dialog-reopen.audit.ts'],
  passWithNoTests: false, testTimeout: 30_000, maxWorkers: 2,
} });
