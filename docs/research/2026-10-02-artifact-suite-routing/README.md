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
