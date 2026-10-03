# Rotated model acceptance belongs to the existing artifact gate

## Observed failure

**VERIFIED, terminal PR1899 CI36997641989 and local reproduction.** The newly added rotated-object Playwright config was absent from the retry-wrapper registry and inherited fields that the static partition contract cannot resolve. Three existing assertions failed. Its selected spec was also eligible for the source-server suite, so a separate manual run did not establish correct CI routing.

## Correction and sensitivity

**VERIFIED, source and local output.** Removed the redundant configuration. The existing artifact config now explicitly selects both production-artifact and rotated-security-console-player-build; the dev config excludes the same set. The unchanged artifact wrapper therefore owns the new real-player acceptance too. No timeout, retry, assertion budget or workflow changed. The original console evidence's separate-config command is historical; its captures and mutation results remain valid.

Existing retry, suite partition and suite selection checks passed17/17. Deliberately removing only the rotated-spec dev exclusion made the unchanged partition assertion fail, naming the spec as collected by both configs. Exact source restoration returned17/17 green. Tools TypeScript passed. A new hosted or full-artifact execution is not claimed by these static routing checks.

## Repeat

After building, select the specific artifact case through the existing wrapper:

```text
pnpm test:artifact rotated-security-console-player-build.spec.ts
```

The regular `pnpm test:artifact` includes it in the artifact gate. Weakest claim: static ownership proves routing, not browser completion; the actual gate must still finish on the exact release head.

## Infirmary integration — 2026-10-02

The accepted `infirmary-player-build.spec.ts` now joins the same artifact matcher and complementary dev exclusion. Its [actual worker, pixel and Save/Load evidence](../2026-10-02-infirmary-export-alignment/player-acceptance.md) was verified separately. Removing only its dev exclusion produces the expected duplicate-collection failure; byte-exact restoration returns the partition checks green. The combined citation, partition, retry and selection checks pass25/25 and tools TypeScript passes. No new tracked config or assertion/timeout relaxation is introduced.

## Previously accepted built-client cases — 2026-10-02

The retained Bookshelf, Utility panel and FullHD Layout Escape specs are now
explicitly selected by the existing artifact gate and excluded by its matching
dev partition. Their real built-client acceptance is recorded in the durable
camera plan, Bookshelf design record and Layout Escape research; this routing
change does not claim a new browser execution of those cases.

Temporarily omitting only their dev exclusions makes the unchanged partition
gate fail and name all three duplicate consumers. Complementary restoration
passes10 partition/selection tests. No new tracked configuration or changed
assertion, retry, timeout or workflow is needed. The three obsolete local-only
selector configs were inspected, had no tracked references or other active
process consumers, and were deleted by exact paths after canonical routing.
