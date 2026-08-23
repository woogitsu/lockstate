#!/usr/bin/env bash
# Lockstate branch cleanup, 2026-08-23.
# 31 branches fully merged into main (every commit reachable from main -> zero history loss),
# plus claude/asset-pipeline-gaps (only unmerged commit is a self-described TEMP debug commit),
# plus foundation/production-architecture (unrelated history, already archived as the branch
# archive/foundation-production-architecture at commit 7cd6384).
#
# Verify before running:  git fetch --prune && git branch -r --merged origin/main

set -e
git push origin --delete \
  claude/actor-identity \
  claude/asset-pipeline-determinism \
  claude/asset-pipeline-reproducibility \
  claude/atomic-create-prison \
  claude/bound-free-tier-capacity \
  claude/browser-gate \
  claude/browser-suite-v2-coverage \
  claude/ci-run-sql-suite \
  claude/construction-geometry \
  claude/deploy-pipeline \
  claude/determinism-hardening \
  claude/entity-snapshot-by-population \
  claude/fix-cloud-save-idempotency-key \
  claude/fix-cloud-save-sql-defects \
  claude/fix-hud-without-worker \
  claude/hud-projections \
  claude/hud-shell \
  claude/lockstate-continuation-rg2xbw \
  claude/lockstate-exploration-9bq9jl \
  claude/mount-hud \
  claude/parallel-safe-sql-scratch \
  claude/persist-simulation-state \
  claude/pin-projection-ordering \
  claude/save-validate-once \
  claude/simulation-message-keys \
  claude/supabase-real-stack-verification \
  claude/trusted-services-layer-mo0bmt \
  claude/vigilant-volta-cs4dk8 \
  claude/vigorous-pascal-9358c2 \
  claude/world-renderer \
  codex/worker-world-runtime \
  claude/asset-pipeline-gaps \
  foundation/production-architecture
