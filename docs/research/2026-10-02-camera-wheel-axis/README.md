# Horizontal wheel camera diagnostic — offline checkpoint

## Observed production callback defect

At base `dc1253beb7`, both scene wheel handlers treated a zero vertical delta
as zoom in. The angled callback changed zoom from 1.25 to 1.5625 and moved
the ground centre from (0,0) to (-2.1019335983756235,-34.10193359837558)
for wheel deltas (-120,0), (120,0) and (0,0).

The diagnostic invokes the actual callbacks registered by each real scene's
`create()`. Phaser graphics/events/camera plumbing and asset loading are stubbed;
the scene callback, zoom producer and camera snapshot execute unchanged.
This is source/consumer evidence, **not a native browser result**.

## Narrow correction and mutation proof

Diagnostic `a096fe880a` was published first. Correction `cb36300ad1` adds only
`if (deltaY === 0) return` to each existing wheel callback. A horizontal wheel
does not acquire a new pan action. Nonzero vertical and diagonal gestures retain
their existing direction, step size and cursor anchor. No copy, controls, layout,
art, simulation or saved state changes are included.

| Actual unit run | Result |
| --- | --- |
| Original paired callbacks | 6 RED, 8 positive controls GREEN |
| Corrected callbacks | 14 GREEN |
| Remove only fixed renderer guard | 3 RED, 11 GREEN |
| Remove only angled renderer guard | 3 RED, 11 GREEN |
| Restore both exact source byte arrays | 14 GREEN |

Independent positive controls project the pre-event cursor world point through
the post-event camera, checking both axes to ten decimal places. Both vertical
signs and both diagonal gestures execute. The test budget remains five seconds.
Both application and tooling TypeScript checks and the production build passed.
The focused unit test plus research-index, documentation-claims and published
commit-citation checks passed 42 cases across four files.

Restored source SHA256:

- Fixed scene: `34b93a2898251939bef33e6e62aed386c62d07ae50ea68e9414d2e453cba4e6f`.
- Angled scene: `4470ec92178cf0d7d9528a96bb70dae6f2473ab586729590fcdc04ce720dd284d`.

## Pending native acceptance

`tests/browser/camera-wheel-axis-native.spec.ts` prepares two real built-client
cases at 1920×1080: fixed and angled. Each uses native horizontal wheel events,
canvas hit verification, actual painted pixels, minimap view bounds, retained
armed square/cost and unchanged worker commands. Native vertical and diagonal
controls must still zoom while retaining the chosen square. A zero-motion wheel
is covered only by the callback test; this checkpoint does not claim a browser
will emit such an event.

No browser was launched for this checkpoint because another agent holds the
exclusive lease. Original-source native baseline, production guard mutations,
exact restoration and native screenshots remain pending.

## Subsequent Issue publication — 2026-10-02

[Issue #1979](https://github.com/woogitsu/lockstate/issues/1979) records the six
actual registered-callback failures with an explicit source-proof label and
the separate pending native acceptance. Fresh all-state searches for horizontal
wheel, deltaY zoom, trackpad zoom and wheel zoom found no matching cause.
Closed Issue #1955 was read in full and concerns anchoring a nonzero angled
zoom. The new Issue was fetched after creation; title and body matched the
submitted UTF-8 payload exactly and state was open. No native result is claimed.

Raw terminal logs are retained alongside this checkpoint.
