# Stage 7: first Blender batch, 2026-09-23

The 2026-09-21 research note found no Blender or LFS bytes in its environment.
This Windows checkout has Blender 5.2.1 and the real LFS images. The earlier
environment finding is historical, not a current blocker here.

`fixture.shower.head` and `fixture.cell.waste_bin` are newly modelled 1x1
objects. They are published through `rendered-art.v1.json` and mapped to the
buildable `shower-head-brick` and `waste-bin-brick` paths. The real-browser
environment art harness places both finished orders and verifies their atlas
frames, footprint and screen pixels against the fallback slabs.

The same source scene now contains `fixture.cell.sink` and a rendered source
PNG. It is not published or mapped: `object.sink` has no buildable and no room
requires it (`src/simulation/construction/definition.ts`, "object.sink is
deliberately not here"). Publishing it now would load art no player can see.

The two new `renderedArtId` values require these exact additions to the
`browser` job's `git lfs pull --include=` list in `.github/workflows/ci.yml`:

```
public/game-content/source-art/rendered.fixture.shower.head.*.png
public/game-content/source-art/rendered.fixture.cell.waste_bin.*.png
```

**Update, 2026-09-23:** The owner selected "Tak — dopisz tylko te dwa globy"
against "Nie — pozostaw partię na gałęzi". `AGENTS.md` reservation 3 now
records the narrow release, and the two segments were added to the existing
line. Before that edit, `tests/foundation/ci-configuration-contract.test.ts`
failed on exactly those two ids; the gate must be re-run after the edit and
CI must still prove the real LFS fetch before merge.

Local evidence: Blender 5.2.1 rendered the three new frames; the rendered-art
catalog validator accepted five published entries; typecheck and production
build passed; `tests/browser/environment-art.spec.ts` passed 19/19. A deliberate
mutation mapping `object.shower-head` to the waste-bin frame turned its browser
test red with "resolves to the wrong model" before the mapping was restored.

The entire Vitest suite is not green on native Windows: 71 of 5,662 tests
failed across 29 files, predominantly from POSIX path assumptions and Bash
commands. One of those failures is the intentional CI glob contract above.
This observation does not prove a Linux CI result. The scoped art unit and
foundation tests passed 50/50 before the browser fixture extension.

Re-rendering every existing collection locally produced different PNG bytes
from the committed Linux-produced renders even with Blender 5.2.1. The old
23 PNGs were restored unchanged; the new source scene and only the three new
renders are committed. This is a cross-platform reproducibility question for
the pipeline, not evidence that the existing art should be silently replaced.
