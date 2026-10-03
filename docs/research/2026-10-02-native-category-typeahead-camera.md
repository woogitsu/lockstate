# Native Category typeahead and held camera pan

Date: 2026-10-02. Evidence tier: **VERIFIED** by actual built-client Chromium,
opened source, passive native event capture and production mutation.
Tracked as a dated extension to existing
[Issue #1970](https://github.com/woogitsu/lockstate/issues/1970).

## Actual native letter selection reaches two consumers

Diagnostic `e367a2d588c4e5cbd63107675585797390931b90` is based on the
completed Category focus-transfer delivery. Create and pause a prison at
1920×1080, open Build, focus Category at Everything, confirm the exposed map
pixels are settled, then hold one real printable key without repeat.

World100% and oblique100% use default camera-up KeyW; native w chooses Walls
and doors. Oblique200% uses a saved valid unused KeyC camera-up remap; native
c chooses Catering. Each case also uses a valid unused KeyJ camera-right
remap for the unmatched control. The100% settings are therefore not claimed
as entirely default, though their W camera-up binding is unchanged.

Passive capture records native keydown, keypress and change in that order:
KeyW/w at value*, followed by change to structure; KeyC/c at value*, followed
by change to food-service. The real filter hides the bed, retains the selected
Brick wall and keeps focus. The exposed map moves during the same held key.
Actual baseline is3red,4.1/5.7/5.0s, all at the same map-motion assertion.
There is no synthetic DOM event, forced option assignment, popup, modal or
renderer replacement in this route. The actual oblique mutation screenshot
was opened and inspected: native Walls and doors and the retained wall row
are visible, with exposed world pixels outside the rail.

Supporting **VERIFIED external source**, read independently of local runtime:
[Blink HTMLSelectElement](https://chromium.googlesource.com/chromium/src/+/ca40d630cdb539b4ced3679351b656b33031cc90/third_party/blink/renderer/core/html/forms/html_select_element.cc)
handles printable non-modifier keypress through TypeAheadFind, using prefix
matching/cycling and native input/change dispatch. That external revision is
not asserted to be the bundled browser revision. The observed built-client
sequence above is the acceptance evidence.

## Actual-change ownership, without prefix prediction

After the three actual failures, the root coordinator approved the narrow
actual-change ownership proposal and its explicit exclusions. Published fix
`38b3d09a44081e19e0344c862f65b4b1a1534c4d` invokes the existing Category
keyboard-only ownership callback from actual change. The optional focus-named
port is renamed truthfully across build-panel.ts, hud.ts and main.ts; the
existing focus transfer remains connected to releaseKeyboardInput(). The
receiver clears only the held keyboard adapter before frame polling.

The source does not predict printable prefixes or broaden the global SELECT
policy, and does not prevent the native default. It does not reset pointer,
camera pose, preview or intent, and adds no copy, layout, gameplay or save
change. Corrected new cases are3green,4.8/6.3/5.9s. Native letter filtering
still succeeds; an unmatched KeyJ that emits no option change still pans.
Stored input bytes remain equal and no placement command is sent.

## Mutation and exact restoration

Removing only the new change invocation, retaining focus transfer and native
default selection, then rebuilding produces3red,4.2/5.7/4.9s at the identical
map-motion assertion. Exact restored build-panel SHA-256:
`5777EB5BD769BE47953EF424CA09E7AD6C07C76424F84C6FF43E5B9289397FEC`.
All three production files have zero diff against the correction checkpoint.

Final exact-restored Category group is8/8green,54.6s: native arrows
world100%5.0s/oblique100%6.7s/oblique200%5.9s; popup100%8.9s/200%8.1s;
new typeahead world100%5.0s/oblique100%6.2s/oblique200%6.1s. The renamed focus
port still retains the armed112 polygons, quote and real worker target in
the earlier popup cases. The new cases retain native filtering, selected-row
visibility, unmatched J control and exact stored remaps, with zero
PlaceRoomTemplate or PlaceBuildOrder commands.

App/tools TypeScript, production build and80 existing policy/View-control
units pass. Those units are not claimed as new typeahead event evidence.
The durable actual regression is
`tests/browser/build-category-native-typeahead.spec.ts`, using the existing
artifact runner and untracked local config. No timeout increase or
network-abort retry ran. All processes were terminal before explicit lease
release to the next agent.

The initial combined documentation gate run was25green/3timeouts,49.40s:
the existing research subdirectory-collection scan and the no-teleport and
Supabase-reachability scans each exceeded their unchanged5s test budget.
There were no failed factual assertions in those cases. The same three
required files, run serially with file parallelism disabled and the same
budgets, pass28/28 in14.01s. No test, gate or timeout setting was changed.

## Record reuse and acceptance boundary

Fresh all-state searches covered Category typeahead, native select letter
camera, Category typeahead camera and native letter filter camera. No separate
matching Issue was found. Full current #1970 was read, then extended with a
dated typeahead section while its original arrow history remained intact.

Acceptance is the observed different-option native change and continuous held
camera pan, local built Chromium at Full HD100% both renderers/200% oblique,
default W and valid C/J remaps. Same-selected-option letters emitting no
change, buffered/localized matching, immediate zoom/Undo remaps, other
controls/engines, full integrated CI and deployment remain **UNKNOWN** here.
The correction relies on actual native change and invents none of those input
rules.
