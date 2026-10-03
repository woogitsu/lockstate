# Template-refund release CI candidate — 2026-10-03

This isolated candidate starts at the exact frozen PR #1972 head
`41998ff60f013c099a2337dcd64172aa0ab12c34`. It does not change that PR, its
base, or its branch. It reuses the already owner-approved #1983 activation
from `45e3215`, `9bd35ed`, and `4ce977d`; all historical activation evidence
and the original main baseline remain unchanged.

## Exact preservation

The separate immutable [release baseline](../ci-before-template-refund-release-activation.yml)
comes directly from `41998ff6:.github/workflows/ci.yml`. Its object ID is
`git-blob=350f28fb277920c71bc5cf690972d0938419b248`; SHA256 is
`749bfab9c2467b8442f89f238e796fd8aae9dd9aee4e8976cd622ca9e8241833`.
This workflow happens to be byte-identical to the frozen #1899 workflow, but
the baseline path and collection evidence explicitly identify this subject.
The canonical LF checksum supports Windows autocrlf checkouts without altering
the entire parsed verification/assets equality guard.

The initial unadapted contract gave **1 RED / 6 GREEN** because its historical
main snapshot lacks the approved 14-line Blender hydration step. Only the
release baseline/report readers, exact immutable checksum, and subject label
were adapted. The whole `verify` and `assets` jobs, their provisioning and LFS
globs remain unchanged. No matcher or failure guard was relaxed.

## Actual own gates

- [Real collection receipt](./collection-receipt.json): **887 source tests /
  169 files**, split into **325 / 79 files** and **562 / 90 files**. Exact test
  metadata union, no duplicates, no source/artifact overlap.
- Actual artifact wrapper: **60 tests / 25 files**, collected once against the
  candidate's own production build. These are this subject's measured counts,
  not copied from the predecessor's 49 artifact tests.
- [Preservation contracts](./preservation-fixed.txt): **59 GREEN / 3 files**.
- [Application types](./app-types.txt), [tool types](./tools-types.txt) and
  [production build](./production-build.txt): exit 0.
- [Actual YAML/Bash/subject guards](./yaml-shell-validation.json): **46 GREEN**,
  including correct/mismatched checked-out subject checks. Only read-only Git
  subject commands executed beyond Bash syntax validation.

All collection calls use `--list`. No browser/server launched, no hosted CI
rerun/cancellation/merge, and no native acceptance claimed. This candidate
activates the approved execution graph; it does not claim that all individual
browser assertions on the frozen release have passed.

## Producer proof reuse, explicitly bounded

The [Git-byte comparison](./split-producer-byte-equality.json) independently
confirms that the entire active workflow, actual partition producer, and weight
manifest are identical to published predecessor candidate
`cee3eac48870e9038fee1fe13059d30f50d7c057`. That candidate recorded six real
producer omissions, each **1 RED / 6 controls**, actual CLI collection of
886 instead of 887 after one whole-file omission, and byte-exact `finally`
restoration followed by **59 GREEN / 3 files**.

The [prior receipt](./prior-producer-restoration-receipt.json) is retained with
its original subject. Its raw logs and executed recipes are
[published at the exact predecessor](https://github.com/woogitsu/lockstate/tree/cee3eac48870e9038fee1fe13059d30f50d7c057/docs/design/2026-10-02-browser-ci-sharding/activation/room-plan-release).
Per the coordinator's explicit instruction, those six identical mutation loops
were not repeated here. Fresh collection and preservation checks above belong
to this candidate. No future subject or differing producer is covered by that
reuse. Weights balance whole files; timeouts/retries remain unchanged. Full
hosted CI is still required after the coordinator transfers the candidate.

All executed helpers lived in this agent's TEMP directory; archived `.cjs.txt`
and `.mjs.txt` files are inert evidence, not runnable repository probes.

## Final handoff gates

The independent [preservation receipt](./final-preservation-receipt.json)
confirms the full workflow prefix through verification/assets is byte-equal
to the frozen release after canonical checkout line endings; all **194 physical
spec files** have exactly one suite owner. Existing configs, package/lockfile,
wrapper/signature/fixture are unchanged from #1972, and activation weights and
the original main baseline are unchanged from the approved split.

Final [links/citations](./docs-final.txt): **18 GREEN / 2 files**, with lazy Git
fetch disabled. The already published own/predecessor branches were fetched by
exact names because this shared checkout's fetch configuration contains only
`main`; no configuration, allowlist or guard was changed. The production and
player-source diff outside the authorized CI split is empty. No new source
conflict occurred. The coordinator must transfer this candidate and obtain its
complete hosted CI result before treating the release as verified.
