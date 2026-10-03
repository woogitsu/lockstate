# Exact captured model PNG reader in Node

Prepared on `da685c52902e2a1318594017cf90a35b689005bc`. This adds a shared
test helper and offline evidence. **No existing native spec, game source,
region, colour, threshold, configuration or screenshot bytes are changed.**

`tests/browser/captured-png-pixels.ts` uses the PNG decoder already shipped
by the declared Playwright dependency, following the accepted actor reader
on873. `countCapturedPalettePixels(buffer, samples)` accepts the original
canvas rectangles `[x,y,width,height]` and RGB triples. It decodes once,
requires an opaque capture and counts exact matches in all three channels.
It chooses no palettes or acceptance thresholds. Cabinet, Desk and Security
can pass their existing samples directly; existing native specs are untouched.

## Same real captures, same counts

The source is the coordinator's retained directory
`Temp/lockstate-desk-cabinet-renderer-combined-results-20261003`. Only its
twelve Cabinet/Desk PNGs are included, excluding the seven unrelated renderer
receipt PNGs. [The fixture manifest](../../../tests/fixtures/captured-model-pngs-20261003/manifest.json)
records original folder/name, byte length, SHA256, exact samples and counts.
All twelve copied files are byte-identical to the originals. The original four
native JSON receipts are retained with them.

| Actual view | Existing rectangles | Existing RGB | Browser construction/Load | Node construction/Load |
| --- | --- | --- | --- | --- |
| Cabinet q0 |830,350,100,130|64,76,76|1151 /1151|1151 /1151|
| Cabinet q1 |965,390,100,130|72,86,86|2231 /2231|2231 /2231|
| Desk q0 |815,450,25,35;780,420,35,32|143,116,86;91,148,149|281,111 /281,111|281,111 /281,111|
| Desk q1 |945,382,25,23;905,348,45,27|143,116,87;75,86,89|497,455 /497,455|497,455 /497,455|

Pillow independently reads the same buffers and exact samples, agreeing with
all eight recorded browser count arrays and Node. The four opposite-side
hardware views have no prior browser palette counts: the native consumers
captured them for visual inspection only. Their unchanged default-view sample
regions count zero in both independent offline decoders, as expected after
the camera turns. That is decoder/control coverage, **not hardware palette
acceptance or a replacement for the native hardware screenshots**.

All twelve PNGs are1920×1080,8-bit RGB, noninterlaced. The exact chunk inventory
is IHDR/IDAT/IEND, without gamma, ICC or other colour metadata. Decoded alpha
is255 throughout. Their raw channels require no profile conversion or alpha
compositing to match these original browser samples. The helper deliberately
fails closed for other metadata/encodings and for nonopaque RGBA pixels; it
does not claim equivalence for arbitrary exported/source art PNGs.

## Meaningful controls and negative

`tests/unit/captured-png-pixels.test.ts` passes **30/30** at maxWorkers2,
unchanged5s budgets. Twelve cases validate the exact real file hashes and
counts. Eighteen controls cover precise RGB discrimination, valid subregions,
nonopaque alpha, a valid gamma-tagged PNG, invalid RGB bytes, empty samples,
out-of-bounds/fractional/nonfinite rectangles, corrupted CRC, truncation,
malformed signatures and trailing bytes. Unsupported files and regions throw;
they never become a successful empty/zero count.

One unique temporary mutation changed the helper's real predicate from exact
RGB to red-channel-only matching: **10 RED /20 legal controls GREEN**. It
changes genuine real-capture counts as well as the tiny RGB discriminator.
The exact helper bytes were restored in `finally`: **30/30 GREEN**.
[mutation.json](./mutation.json) and the original negative/restoration logs
retain hashes and outputs. Strict standalone TypeScript for the new helper
and unit file passes. This demonstrates the offline helper contract, not a
new native run or a new model acceptance result.

## Bounded buffer timing

[measure-buffers.mjs](./measure-buffers.mjs) reads files and imports the helper
before measuring. Three rounds over the same twelve in-memory buffers give
36 observations on Node24.19.0/Windows: **median40.46ms**, min35.78ms,
max47.49ms for PNG validation/decode, opacity checking and exact RGB sampling.
[buffer-measurements.json](./buffer-measurements.json) retains every observation
and its unchanged count array.

File I/O, startup, screenshot capture, browser work, simulation/construction
and full-suite duration are excluded. No same-buffer browser decoder was run
in this task, so there is **no browser speed ratio or whole-game/CI speedup
claim**. Recorded browser counts already prove equality for the eight accepted
palette captures. Any future native integration remains the coordinator's
decision; this task launched no browser or preview server.
