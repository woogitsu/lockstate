# Integrated verification repairs

2026-10-03. Subject: published integration commit
`3d454c2872fb6b777cd9afc2cc13c286bf8346ef`, which includes current main
`6d25ebd896c76fb09c2d387185eb1bd8b2a48b8d`, the demanded-image loader and the
World catalogue-focus fix. This is a local gate repair, not a production release.

## Original complete gate

The actual named `pnpm verify` ended with 30 failures, 8163 passes and two skips
across 10 failed and 679 passing files. Its original output is retained in
[original-verify.txt](./original-verify.txt). No failing case is removed, no
test timeout or retry policy changes, and no exemption is added.

The Windows process originally resolved plain `bash` to the WSL launcher, which
reported that no Linux distribution was installed. The corrected task process
prepends the already-installed Git for Windows `bin` directory to `PATH`.
This changes neither machine settings nor repository shell contracts and does
not install a distribution.

## Canonical physical component seeds

The real new `sharesPhysicalComponent` producer enumerated the region Map
without sorting. The complete gate caught that enumeration and the additional
unapproved exemption it would require. Region IDs are numbers: the producer now
sorts ascending numerically before assigning component labels. It preserves
physical membership, graph invalidation and the separately queued permission
checks. The existing scanner and actual navigation/iteration controls pass
with the source fix; the original unsorted producer failure is retained above.

## Documentation and published references

The Garbage Room record accidentally formatted the external Blender build ID
as a repository commit citation. It now explicitly names that external build
ID in ordinary text. The source hash, model, PNGs and Blender version are
unchanged. All real commit citations remain checked.

The local clone initially held only a narrow set of origin tracking refs.
Actual source branches and the integration branch were already published;
fetching those exact branches into their origin tracking refs makes the local
publication check see the same commits as hosted full-depth checkout. No
unpublished citation is allowlisted. The first focused run retained one such
publication failure and 222 passes in eight files. After the exact integration
ref fetch, the existing citation contract passes all eight cases.

[Focused gate output](./focused-repair.txt) and
[publication gate output](./published-citations.txt) retain the actual terminal
reports. Full integrated verification after the independent Blender/version,
tooling type-coverage, generated-file checkout and historical room-metric
repairs remains pending. Native acceptance of the new demand loader and
Classroom/Reception fixtures also remains separate.

## Complete repaired named gate

On published subject `d4299094d6`, the actual unchanged named `pnpm verify`
exits 0. Both application and tooling strict type checks pass. All 693 test
files pass: **8208 tests pass and two explicitly skip**. The real production
Cloudflare build also succeeds and its existing output verifier passes;
the existing large-chunk warning is retained. The full terminal output is
[repaired-verify.txt](./repaired-verify.txt).

The combined subject includes the actual Reception-only armchair registry and
context, all three explicit dedicated Blender guards, current main and the
demanded-image/World-focus fixes. It preserves the original models and renders.
The generated player-string content is byte-identical to its existing Git blob;
its new LF checkout rule fixes a Windows working-file mismatch rather than
adding sentences. The physical no-door route filter correctly prevents failed
journeys: both route counters are exactly zero while real blocked-need
substitutions remain positive; the working doorway control remains all zero.
This replaces only a historical expectation and does not undo the source fix.

No hosted full-green result or native fixture acceptance follows from this
local gate. Actual Classroom/Reception construction and demanded-image native
acceptance remain separately reported with their exact compiled subjects.
