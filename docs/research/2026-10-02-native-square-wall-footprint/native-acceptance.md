# Square Brick wall export alignment — native acceptance

The local correction for the remaining graphic mismatch in
[Issue #1585](https://github.com/woogitsu/lockstate/issues/1585) is verified.
The [original three native failures](README.md) remain archived alongside the
separate [export checkpoint](export-checkpoint.md). No duplicate Issue was opened.

## Correction and preserved original art

Production export correction `5b9f7f4129` converts each centred authored mesh
from ground bounds [-.5,.5] to [0,1] **in memory during export**. The camera
translates equally and its manifest target becomes [.5,.5,0]. Orthographic
scale changes from 5.5 to 8 at 512 pixels, matching the existing 64 pixels per tile.
The existing renderer consumes that metadata without a scene special case.
Both full and low catalogs have 72 new frames, 144 total, with complete decoded
transparent-border and SHA checks.

The original `.blend` files are retained byte for byte at their existing paths,
with source bounds [-.5,.5] and heights .75/full, .34/low. The catalog test pins
their original source hashes:

- Full `assets/source/blender/wall.square.brick.full.blend`, SHA256c73fcc00471682135b53049e0b74f1d71588909b245bfeac0cac6cd93d696ae1.
- Low `assets/source/blender/wall.square.brick.low.blend`, SHA256583c49382bf24191ee0d0e10518c0678716eb036c9638558036d5a06b0fbd1f1.

Actual Blender 5.2.1 validation exercises the real export producer at all 144
camera poses, checking 0..1 mesh bounds, ground-centre pivot, independently
projected 64-pixel ground scale and model frame margins. It never saves the
source. [Restored producer output](restored-producer.txt) and
[four final unit cases](restored-unit.txt) retain the receipts. Both TypeScript
targets and the production build passed before the final native group.

## Actual player and worker path

`tests/browser/oblique-square-wall-native-footprint.spec.ts` uses genuine
scheduled logistics, the native Import chooser and Load, and normal Build
placement of one Brick wall at (20,20). The real worker completes exactly that
square order using two bricks. Total submitted world commands remain exactly
one, including camera/minimap framing; the whole-square footprint remains the
same throughout. No wall, stock, worker reply, or renderer state is injected.

The low fixture adds a genuine authoritative Yard command at (16,12), 8×8,
before capture. Its empty interior invokes the existing perimeter cutaway
rule behind the test wall at both yaws. The unit control checks that Yard
rectangle and the native case checks the actual requested low-frame URL.
The three low-wall images visibly retain that Yard and the short wall.

Acceptance uses 1920×1080, UI 100%, one browser worker, unchanged 60s case and 10s
expectation limits, and no retry. The pixel palette and 20-pixel outside budget
remain unchanged. The horizontal occupied-square span is independent of
height. A second independent authored-frame hull catches vertical anchor
errors at +45°, where the same diagonal anchor shift has zero horizontal
component. At 80°, its local geometry uses the accepted nearest 65° frame around
the actual 80° ground centre; quantized height is not labelled a defect.

## Baseline, two producer negatives, exact restoration

The first fixed group passed 6/6; the extended anchor-hull baseline then passed
6/6. Baseline times were full 19.1/21.5/22.0s and low 18.8/21.3/22.5s. Its exact
buffers were also independently remeasured before extending the assertion.

| Variant / native pose | Scale negative: outside horizontal span | Anchor negative: outside authored hull | Final restored: both outside counts |
| --- | ---: | ---: | ---: |
| Full −45°/45° |2673|4594|0 /0|
| Full45°/65° |1040|4087|0 /0|
| Full45°/80° |1034|4356|0 /0|
| Low −45°/45° |1324|3465|0 /0|
| Low45°/65° |947|4012|0 /0|
| Low45°/80° |947|4274|0 /0|

- [Scale producer negative](native-scale.txt): change only exporter ortho to 5.5,
  render both catalogs, build production, observe six actual pixel failures.
- [Anchor producer negative](native-anchor.txt): restore correct scale, change
  only produced metadata target to [0,0,0], rerender and build. All 144 frame SHA
  values remain identical to fixed exports; six native pixel failures follow.
  At +45° the horizontal outside count stays 0, proving the added hull assertion
  actually detects the anchor defect. [Existing catalog guard](anchor-unit-red.txt)
  also fails both variants, without a guard exemption.
- [Final rebuilt exact restoration](native-restored.txt): exporter and both
  manifest bytes match the fixed backups; referenced PNG digests match. All
  six cases pass, full 19.9/25.2/23.4s and low 20.2/25.8/23.9s. Both outside
  counts are 0 in each case. The same completed square, two bricks and exactly
  one submitted world command survive both negatives and restoration.

[Aggregate raw values](native-results.json) and the 24 stage-specific JSON
receipts retain passive minimap click coordinates, independent ground/hull
geometry, actual catalog URLs, full completed worker orders and commands.
Negative groups are terminal intended failures, with no network retry;
`no-last-run-file` is the wrapper's missing default output-file report after
the custom evidence directory, not an additional product defect.

All six final images below are the exact measured canvas buffers and were opened.

| Native pose | Full wall | Low wall |
| --- | --- | --- |
| −45°/45° |[PNG](restored-full-minus45-elev45.png),[JSON](restored-full-minus45-elev45.json)|[PNG](restored-low-minus45-elev45.png),[JSON](restored-low-minus45-elev45.json)|
|45°/65° |[PNG](restored-full-plus45-elev65.png),[JSON](restored-full-plus45-elev65.json)|[PNG](restored-low-plus45-elev65.png),[JSON](restored-low-plus45-elev65.json)|
|45°/80° |[PNG](restored-full-plus45-elev80.png),[JSON](restored-full-plus45-elev80.json)|[PNG](restored-low-plus45-elev80.png),[JSON](restored-low-plus45-elev80.json)|

## Byte restoration and remaining boundaries

Exact restored SHA256 values:

- Exporter20a7594fcb26a7563e3cbe0cadc5ca94d53a64f61e4d9c64a3b8210406ae44c1.
- Full manifest65afff7368f00c1d3628995a88ae3b49286fd43fc9a2145e6c78cf34600deb31.
- Low manifest48fa968a6e48bf1bac572abe39b26be441f72d3dbcf166dee29aeb978ba9782e.
- Final built client `index-CrQoe5sh.js`, SHA2560bfa6ef56538fa021af2c21bf1cf875148513dc4a1d647fc1ce5ac3a72edd512.
- Final worker `worker-DalCqm-P.js`, SHA25691427f14541176f3e6ca700068cc861da34c7527ac663af63b00622f9c551f7b.

All own browser/controller processes are terminal, port 5402 has zero listeners,
and the exclusive browser lease was explicitly released. The 96 own untracked
scale-mutation PNGs were removed after checking their absolute paths and tracked
filename set; existing historical images and the 144 fixed frames were retained.
Production files have zero diff from the committed fixed producer.

The weakest claim remains coverage beyond these six native poses at 100%.
Other yaw/elevation frames have real producer geometry and decoded-frame checks,
but no native screenshot acceptance is inferred for them. New-wall Save/Load,
UI 200%, other renderer, fixture cutaway/SAT behavior, hosted release, main merge,
and exact-head CI acceptance are outside this local proof. No simulation,
persistence, renderer scene, palette, cutaway/SAT rule or copy was changed.
