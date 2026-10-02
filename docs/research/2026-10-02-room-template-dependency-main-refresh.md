# Corrected room-template vertical slice against current main

## Scope and dependency

PR #1898 previously compared `55db8c3060` against PR #1882's `f496b248fc`.
Both heads are ancestors of this refresh. The corrected slice was merged with
freshly fetched main `af180e33f9` (v0.0.836), pushed as `7e5fa72607`, and
PR #1898 was retargeted to main. This makes the full-square correction and the
original Cell/shower template implementation reviewable as one dependency.
PR #1899 remains the later full-library/orientation/art integration.

The merge preserves saved square-wall rendering together with main's authored
fixture asset mapping. It preserves both sets of research rows and regenerates
the locale inventory with literal source-key quotations. Shifted documentation
anchors were corrected without raising quotation budgets.

## Obtained evidence

- Both application and tools TypeScript targets passed.
- The production build passed. Runtime atlas validation passed for 10 clips;
  the rendered-art validator passed for 40 catalog entries.
- Twenty relevant unit/foundation files passed, 165 tests, covering the vertical
  slice, construction geometry, square barriers/rendering, input, HUD messages,
  production bootstrap, inventory, documentation and browser-suite registration.
- A new rendering regression combines a restored world square without order
  history with a medical-bed structure. It independently expects a 64-pixel
  square and the `furniture.medical-bed.variants` asset id.
- Production mutation: remove the fixture asset-id spread from `structureSolid`.
  The new assertion failed (`undefined` instead of the expected asset id): one
  failed, two passed. Exact byte restoration was verified with SHA256
  `74F8F6D8B9F912FF562E80DA6274C2C36232004420C399215FAE87461F1DB6B0`.
  Four related files then passed, 17 tests; the wider 165-test run followed.

## Limits and release gates

A completed full native Windows run at the merge head reported 495 passing
files, 18 failing files, 5,760 passing tests, 49 failing tests and two skipped
tests. It is **not** a full-suite pass. Failures include native path separators,
CRLF-sensitive source scans, a malformed Windows file-URL conversion and shell
tests selecting an unavailable WSL distribution. An isolated main-based checkout
also reproduced the comment-symbol, composition-root and fenced-map failures.

Hydrating published floor PNGs additionally exposed an unexplained canteen
calibration mismatch: decoded red mean 191.43820190429688 versus 209.852 in the
unchanged drift assertion. The same assertion is skipped on an unhydrated LFS
pointer in the main-based checkout. This was handed to the art owner; the
expectation was not changed. Asset validators passing do not resolve that drift.

No browser was launched during this refresh. The earlier cancelled #1898 browser
run is not acceptance evidence. Terminal required checks on the final published
head, including browser, and the coordinator's serial main CI must be green
before merging. The weakest claim is portability of the complete test suite:
only exact-head Linux CI can establish that from this Windows session.
