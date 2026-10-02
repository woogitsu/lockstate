# Export correction checkpoint — native acceptance pending

The scoped export correction is published in `5b9f7f4129`. It translates the
centred full and low source meshes by (.5,.5,0) in the export scene, translates
the camera target equally, and uses orthographic scale 8 at 512 pixels. The
original source files are neither regenerated nor saved. Existing renderer
metadata places the ground centre at the middle of the occupied square.

Actual Blender 5.2.1 scene validation covers both variants and all 72 poses
per variant: world bounds [0,1] on both ground axes, centred ground pivot,
independently projected 64-pixel unit-ground scale, and model coordinates
strictly within the camera frame. All 144 rendered PNGs have transparent
borders and correct manifest digests. The focused catalog and real scheduled
logistics tests pass four cases; both TypeScript targets and production build
pass. These checks do not replace actual player acceptance.

Producer tests and byte-exact restoration:

- [Scale mutation](export-scale-mutation.txt) restores ortho5.5 and fails at
  93.090911865 pixels instead of64.
- [Camera target mutation](export-anchor-mutation.txt) restores target(0,0,0)
  and fails the ground centre at(.4375,.5264136195) instead of(.5,.5).
- [Restored scene proof](export-placement-restored.txt) passes both variants,
  retaining original source SHA256c73fcc00471682135b53049e0b74f1d71588909b245bfeac0cac6cd93d696ae1
  and SHA256583c49382bf24191ee0d0e10518c0678716eb036c9638558036d5a06b0fbd1f1.

The prepared native test in `eb36782828` extends the original real Build path
with an optional Yard created by an authoritative command. That empty area
causes the existing perimeter cutaway rule to select the low catalog at both
tested yaws, without fixtures invoking complete hiding. Native full/low
baseline, separate scale/metadata anchor mutations, and exact restoration are
queued behind the exclusive browser lease. No fixed native result, hosted
release, merge or CI acceptance is claimed at this checkpoint.

The weakest claim is the unobserved low native path. Its actual catalog request
and rendered masonry pixels must pass before low acceptance is reported. The
accepted 80° nearest-frame height quantization remains outside the horizontal
ground-span assertion; shadows and dark footing are excluded consistently.
