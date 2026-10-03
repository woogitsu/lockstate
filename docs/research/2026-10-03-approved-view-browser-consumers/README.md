# Explicit public prerequisites after the approved View disclosure

## Observed scope

**VERIFIED, source comparison:** base `01d6aa666373fec181b3f474210aea4fa8de51e3`
contains the approved default-closed View/Widok panel. Existing native consumers
that act on its SELECT or camera buttons must open that panel publicly first.
`tests/browser/public-camera-controls.ts` is an explicit caller prerequisite,
not a fixture hook. It clicks View/Widok only when the real panel is hidden,
then checks visible state and `aria-expanded=true`. It chooses no renderer,
camera pose or game state.

The first pushed checkpoint is `44475e77bc00c4584199782a45e4e0beb1a0b438`.
This follow-up covers the actual remaining routes, including canonical poses
after Load, live native SELECT consumers, scene picking and demand-profile
camera steps. Keyboard-only focus still uses physical Tab and Enter to open
View. Held key/pointer routes open before the measured hold or gesture.
The production and integrated-square screenshot baselines are captured after
opening, so opening the panel cannot itself satisfy a camera-change check.
The north-door failure cleanup gains no new UI action. A value-only history
observer that never operates hidden controls is unchanged.

## Retained controls and measured checks

**VERIFIED, read-only source proof:** [guard-preservation.json](./guard-preservation.json)
records 49 existing browser consumers, with 49 original bodies preserved after
removing only the enumerated public prerequisites. The precise comparison also
accounts for the same native SELECT moving from `.hud__corner` to
`.hud-camera-panel`, and braces needed for the q1-only bookshelf prerequisite.
Original pixel, cost, owner, whole Save/Load, camera-step, pointer/key and budget
assertions remain. This is a source proof, not native acceptance.

Reproduce from the repository root:

```powershell
node docs/research/2026-10-03-approved-view-browser-consumers/guard-preservation.mjs
pnpm --config.verify-deps-before-run=false typecheck
```

**VERIFIED, executed:** app and tools typecheck exit 0; raw output is retained in
[typecheck.txt](./typecheck.txt). No browser, build, server or native collection
was run in this migration. The existing real-build guard remains intact.
No production code was changed or mutated by this consumer-only checkpoint;
it makes no producer-negative or native-pass claim.

## Separately published Laundry helper

The current isolated base does not contain `laundry-linen-rack/native-evidence.ts`.
[laundry-linen-opener.patch](./laundry-linen-opener.patch) was generated from the
actual published file in `088a436cf5fe150c2ca5e0d4606770229bef87ba` and adds only
the helper import plus its explicit call in `recordLaundryCanonical`, after
the actual loaded-owner assertion. All original 7 right / 3 lower / 2 raise
steps and whole-state guards remain. This patch was not applied or typechecked
against an absent file here; the integrator must check/apply it after the real
Laundry import and run the integrated gates.

**Weakest claim / next gate:** source preservation and strict types do not
establish that every real page opens the panel at the intended moment. The root
owns the sole browser/build lease and must run the real integrated native
consumers. No timeout, assertion, floor, panel default or visible copy changed.
