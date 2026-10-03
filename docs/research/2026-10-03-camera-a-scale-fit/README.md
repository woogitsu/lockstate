# Camera A: enlarged public controls

## Approved camera positioning correction

Base `94b923a6d02a63bfb0c8a6a36cf79422abe01d52`; production correction `55ebd97ee2b04cf152e181fbb2405b2d6cec2515`. Original nodes, View disclosure, all twelve controls, target floors, notice gaps, minimap, Zoom location, alert allocation and simulation ports remain in place. The expanded panel moves beside the corner when its actual height cannot fit above it. Resize observation includes the panel, so async World/Angled visibility changes recalculate that fit. Camera paint uses the existing panel semantic tokens.

The original source gives **2 RED / 6 GREEN** in measured presentation tests. The correction and bounded renderer/token neighbors give **95 GREEN**. Disabling only the real side-fit producer at detached `55ebd97` restores **2 RED / 93 GREEN**; exact source restoration gives **95 GREEN**. The executed inert recipe, raw logs and byte proof are in `evidence/`. App/tools strict types and both actual production builds succeed.

## Actual compiled public Chromium evidence

Default installed Chromium, Full HD 1920×1080, Polish, existing 60s / expect10 / retries0 / worker1. Public New prison, real RemoveWall refusal, pause, public View/renderer and physical camera presses; whole paused worker comparison and zero new commands remain in the spec. No private game state, CSS injection or synthetic bounds.

Original compiled `94b923a6` UI200 is **1 RED**: the expanded panel covers Zoom. Its actual geometry is panel bottom614 versus corner top552. Fixed compiled `55ebd97` pair is **UI100 GREEN / UI200 RED**, terminal45.11s. UI200 passes all twelve original target floors, reachability, viewport, notice gap and genuine horizontal non-overlap. It then fails the unchanged full-alert-row assertion: list clientHeight84 versus row207. The complete UI200 recipe has therefore **not** passed. UI100 does pass all interactions and whole paused worker equality.

The observer changes only the old vertical-separation assumption to real vertical **or** horizontal separation, and adds read-only diagnostic captures. Raw JSON, original/fixed screenshots, actual DOM geometry and compiled JS/CSS manifests are retained. Trace ZIPs remain in the absolute TEMP output recorded by the raw runner, not included as a source artifact. Own native PID60840 (original) and33324 (fixed) ended, own port5373 released after each run.

## Separate allocation decision

The current enlarged corner has maxHeight528 (`6 × 88`), height528, list scrollHeight207 but clientHeight84. This is a separate existing corner allocation limit, not a camera reachability failure. A broader UI200 corner-height candidate is prepared on a separate review branch; it requires an owner decision. This approved camera chain does not change that allocation or claim complete UI200 acceptance.

## Appearance observation

The actual screenshots retain nine top readings and existing status colors. Filled navigation and a quiet paper/navy hierarchy are visible; the camera now shares the panel surface tone. The larger corner and two-column camera consume considerable map area at 200%; this is a concrete layout tradeoff for the separate review, not evidence of an AI concept being shipped.
