# Room-plan release CI activation candidate — 2026-10-03

This separate candidate starts at the exact frozen PR #1899 head
`3eeeddc2d276714fee6a7c8420270b78d2e49b3c`. It does not update that PR or its
branch. The owner-approved #1983 activation is reused from `45e3215`,
`9bd35ed`, and `4ce977d`; the old main activation evidence remains historical.

## Preserved subject

The immutable [release baseline](../ci-before-room-plan-release-activation.yml)
is the exact Git blob `350f28fb277920c71bc5cf690972d0938419b248` from
`3eeeddc2:.github/workflows/ci.yml`, SHA256
`749bfab9c2467b8442f89f238e796fd8aae9dd9aee4e8976cd622ca9e8241833`.
The original `ci-before-activation.yml` remains unchanged. The contract now
reads the release baseline and its separately collected reports. Entire parsed
`verify` and `assets` jobs equal the release baseline, including the approved
14-line Blender source/angled PNG hydration step and its original include globs.
No retry, timeout, worker, dependency, player source, or persistence changes.

The first contract run correctly found **1 RED / 6 GREEN**: the old main
baseline lacks the release's approved hydration step. Only its baseline reader
needed adaptation; no workflow matcher or output guard was relaxed.

## Actual local gates

- [Real collection receipt](./collection-receipt.json): 887 source tests in 169
  whole files; bins **325 / 79 files** and **562 / 90 files**. Exact test metadata
  union, no duplicates, no source/artifact overlap.
- Artefact: **49 tests / 22 files**, collected once with the actual wrapper.
  Initial artefact collection correctly refused an absent own production build;
  that stderr is retained. After the isolated production build, collection passed.
- [Preservation gates](./preservation-fixed.txt): **59 GREEN / 3 files** covering
  active sharding, existing CI configuration, and source/artifact routing.
- [Application types](./app-types.txt), [tool types](./tools-types.txt), and
  [production build](./production-build.txt): exit 0.

Collection uses `--list`, not browser execution. No browser or server launched,
no PR rerun/cancellation/merge, and no native acceptance claimed. This restores
the approved execution graph; it does not claim to repair the previously
reported individual browser failures on the frozen release.

The archived [executed collection helper](./collect-current.cjs.txt) is inert
evidence; the executed file lived in the agent's TEMP directory. The original
proposal weights are unchanged; they affect balancing, not budgets. Both source
jobs retain one worker, whole-file ownership, and the original real wrapper.
The separate artifact job builds once. The existing `browser` check fails closed
unless both job results are successful and both checked-out subjects equal the
workflow subject. Full hosted CI is still required on the transferred candidate.
