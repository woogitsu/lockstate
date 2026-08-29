# Playtest probes — 2026-08-29, "the ordering lead and the second room"

**This directory must never be merged to `main`.** It exists on
`agent/playtest-ordering-harness` and nowhere else, for the reason
`tests/browser/playtest-mouse-route.spec.ts` stayed on
`agent/playtest-mouse-route`: these are *reproduction harnesses*, not guards.
They assert almost nothing, they cost minutes of browser time, and they would
pass whether or not anything they measure is ever fixed.

`docs/research/2026-08-29-playtest-ordering-and-the-second-room.md`, on
`agent/playtest-ordering`, carries the findings and every transcript quoted
from these runs.

They are **outside `tests/`** on purpose: `tsconfig.json` includes `tests` and
`tests/browser/playwright.config.ts` sets `testDir` to `tests/browser`, so a
probe left there is collected by CI and typechecked by `tsc -b`. These carry
their own Playwright config instead.

## Running one

```sh
ln -sfn /workspace/lockstate/node_modules <worktree>/node_modules
LOCKSTATE_BROWSER_TEST_PORT=5307 \
  ./node_modules/.bin/playwright test --config .probe/playwright.probe.config.ts <name>.spec.ts
```

`pnpm <script>` aborts in a worktree (`ERR_PNPM_UNSAFE_MODULES_DIR`); call the
binary. `public/assets/**` must be real, not LFS pointers — `git lfs pull`.

## What each probe measures

| file | question |
| --- | --- |
| `ordering.spec.ts` | The naive route at 900x600. Does anything on screen ever say "wall"? |
| `viewport.spec.ts` | How much world is clickable at 1440x900, 1280x800, 1024x768, 900x600 |
| `tabs.spec.ts` | Overview, Security and Regime at 900x600; Export, Import, and importing junk |
| `prison.spec.ts` | Two cells, doors, furniture, two guards, three prisoners, one whole day |
| `recovery.spec.ts` | Refused → build walls → designate again. Is #492 still fixed? |
| `enclosure.spec.ts` | Does the Rooms panel call a fully-walled rectangle open, and for how long? |
| `snapshot-lag.spec.ts` | The mechanism: `simulation/snapshot` arrival times against the note flipping |
| `cheapest.spec.ts` | Are the finished walls *drawn*? And what does a `wheel` do at 900x600? |

`lib.ts` holds the shared driving code. `dumpHud` prints
`document.querySelector('.hud').innerText` **in full** plus `.hud__refusal` and
`.hud__event` geometry — the container, not the parts, which is the method
failure that produced and then retracted issue #569.
