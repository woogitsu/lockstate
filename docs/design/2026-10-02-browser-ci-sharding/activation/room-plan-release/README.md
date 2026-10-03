# Room-plan release CI activation candidate — 2026-10-03

This separate candidate starts at the exact frozen PR #1899 head
`3eeeddc2d276714fee6a7c8420270b78d2e49b3c`. It does not update that PR or its
branch. The owner-approved #1983 activation is reused from `45e3215`,
`9bd35ed`, and `4ce977d`; the old main activation evidence remains historical.

## Preserved subject

The immutable [release baseline](../ci-before-room-plan-release-activation.yml)
is the exact Git blob `git-blob=350f28fb277920c71bc5cf690972d0938419b248` from
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

## Producer negatives and exact restoration

At detached fixed checkpoint `d4b7d4ec`, omission of the actual hydration step,
each of the four actual aggregate result/SHA guards, and one file from the
actual partition producer each gave **1 RED / 6 legal controls**. The mutated
CLI and real wrapper collected **886**, with the entire
`ui-clock-paused-readout.spec.ts` missing. The restored producer collected the
exact original **887** test metadata tuples. Both edited production files were
restored from their saved full buffers in `finally`, the named branch was
restored, and the production diff was empty. The complete restored preservation
gate again gave **59 GREEN / 3 files**. See the
[restoration receipt](./producer-restoration-receipt.json) and
[executed inert recipe](./producer-proof.cjs.txt).

Actual YAML parsing plus Bash syntax and matching/mismatching checked-out
subject guards gave **46 checks GREEN**, without executing job commands beyond
read-only Git subject checks. Final application and tool types both exit 0.
The first documentation gate gave **1 RED / 17 GREEN** because this README
formatted a real Git *blob* ID as a commit citation. It is now explicitly labelled
`git-blob=...`; no citation allowlist or guard changed. The baseline checksum
checks the canonical LF Git blob on Unix and autocrlf Windows checkouts.

The next citation run correctly refused the published own checkpoint because
this shared checkout's fetch configuration contains only `main`: the own remote
branch had not been fetched into a remote-tracking ref. A bounded named fetch
resolved that environment boundary, without changing repository configuration.
Final links/citations: **18 GREEN / 2 files**.

The independent [preservation receipt](./final-preservation-receipt.json)
additionally confirms the complete workflow prefix through `verify` and `assets`
is byte-equal to the frozen subject after canonical checkout line endings; all
**191 physical spec files** appear exactly once across 169 source and 22 artifact
files. Configs, package/lockfile and existing wrapper/signature/fixture are
unchanged from the release. The weight file and old main baseline are unchanged
from the approved activation. The first standalone inventory recipe incorrectly
looked for that newly introduced weight file in the release base; its original
recipe is retained and corrected to the actual activation subject. This was a
probe error, not a failing production gate.
