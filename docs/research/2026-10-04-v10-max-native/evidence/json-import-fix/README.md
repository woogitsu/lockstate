# Node24 native JSON import correction

Base `e145defbd39ad73fef09e188504255d7c827c1e8`. The coordinator's real
Playwright attempt failed before its first browser case with
`ERR_IMPORT_ATTRIBUTE_MISSING` / "needs an import attribute of type: json",
followed by "No tests found". Its original console is copied unchanged in
`original-root-prebrowser.raw.txt`; the original JSON report remains in
TEMP/lockstate-modern-v10-max-native-20261004.json.

The actual import is `tests/browser/construction-v10-max-counter.native.ts:3`,
not the offline fixture authoring module. The only executable source change
adds `with { type: 'json' }` to that import. JSON bytes, fixture authorship,
native config, opt-in,60s/expect10s/w1/r0, assertions and all production/save
semantics are untouched.

Actual installed Node24.19.0 importing that real JSON file without the attribute
fails with `ERR_IMPORT_ATTRIBUTE_MISSING`/exit1. The same module import with the
attribute succeeds/exit0 and reads schema9/checksum e42c4bb66fc4e908. These are
direct Node ESM controls, not Playwright collection or browser acceptance.
The existing actual offline fixture test passes1/1,212ms; strict app/tools
typecheck exits0. Raw controls are alongside this receipt.

The JSON is byte-identical before/after:

- Windows CRLF checkout SHA256542d656c64d88f14b89ff7db98b39c3fce7d1934ca05607553cb307cd24816bb.
- Canonical LF SHA256d4027ad4d781b92c3a23d0cd0eb01f17335e39386b01e2e85720d3bd1480c890, matching the existing archive receipt.
- Git content identity `blob:e0ec84e929cbad67f7091d8f42b15c987a834dd2`.
- Exact JSON.stringify public Import body SHA256610c68da281b90eb55c7bd2e118236de45348f1b3e2287edf768dbd2af454cea, matching the original receipt.
- Payload checksum e42c4bb66fc4e908.

No browser, server, build or fake dist was started by this correction. Native
collection and execution remain for the coordinator using its genuine built
subject. This is no new persistence defect or new native acceptance claim.
