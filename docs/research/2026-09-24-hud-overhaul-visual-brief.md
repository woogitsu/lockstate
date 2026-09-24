# HUD overhaul: map-first game interface

Research snapshot: 2026-09-24, `origin/main` at `430906af` (v0.0.757).

## Request and evidence

The owner asked for a complete HUD and interaction redesign with the clarity and
game feel of Prison Architect, and asked us to collect more screenshots for
inspiration. The three owner-supplied gameplay screenshots show a large prison
map with permanent operational context at its edges. Additional reference
screenshots: [Prison Architect's official Steam page](https://store.steampowered.com/app/233450/Prison_Architect/),
[its Free For Life update gallery](https://store.steampowered.com/app/2085570/Prison_Architect__Free_for_life/),
and [the Steam community screenshot gallery](https://steamcommunity.com/app/233450/screenshots/).
These are references for information hierarchy and interaction, not assets to
copy into the game.

Across the references, the recurring pattern is: map in the centre, the few
numbers needed every minute along the top, immediate tasks at the left,
contextual tools along the bottom, and clock plus speed controls at the top
right. Build categories and subtools reveal themselves on demand while the
map remains visible. This is a reading of the screenshots, not a claim that
each version of Prison Architect always uses the same placement.

### Reference gallery by interaction

| Situation | Screenshot | What to study for Lockstate |
| --- | --- | --- |
| Large working prison | [Official Steam gallery](https://store.steampowered.com/app/233450/Prison_Architect/) and the owner's first screenshot | The building stays visually primary despite many live counters. Task text is concentrated in one edge, not repeated in three panels. |
| Early construction | [Planning view](https://www.gamepressure.com/prisonarchitect/planning/z251ff) | The chosen build tool and preview are visibly tied to the map; tool categories remain reachable at the bottom. |
| Room designation | [Room planning view](https://www.gry-online.pl/poradniki/prison-architect/wprowadzenie/z4156b6) | A placement preview and dimensions appear over the target terrain while the rest of the prison remains visible. |
| Schedule | [Regime chart](https://forums.introversion.co.uk/viewtopic.php?t=51345) | A time axis and current-time marker make the plan legible as a schedule rather than prose in a narrow rail. |
| Operations | [Deployment screen](https://forum.paradoxplaza.com/forum/threads/prisoners-stuck-on-prison-bus.1254048/) | Contextual controls can become dense when needed without occupying their footprint in ordinary map play. |
| Money | [Finance view](https://www.gamepressure.com/prisonarchitect/budget/z85201) | The top bar gives immediate funds; a detailed breakdown opens only for the finance task. |

The screenshot sources include different game versions and third-party guides.
They establish visual patterns, not a current-feature inventory or permission
to reuse Prison Architect art, icons or text.

## Current Lockstate baseline

The assembled game at 900×600 has a top chrome row, a second metrics row,
a left navigation rail, a large minimap/alerts panel, and a right stack of
settings, saves and the selected work panel. In a fresh prison the minimap
still says no map is drawn while its panel occupies a large part of the
playfield. Build and queue information sits in the right panel below other
panels; at 900×600 the queue summary and the existing clock-dependency note
are outside the initial visible fold. The narrow-screen map-first Build work
in #1392 addresses a separate phone case; it does not remove the desktop
stack. Reproduction and a blind exploratory run are recorded on
[#936](https://github.com/woogitsu/lockstate/issues/936#issuecomment-5820967039).

A fresh-main three-viewport audit found more exact symptoms. At 900×600 the
minimap/alerts block is 400×318 px although its map placeholder has no useful
content; the Saves panel above Build is itself clipped; the Build category,
selected item's price and next placement instruction end in ellipses. The
metrics row silently clips a chip at the right edge. At 375×812 the persistent
settings and Saves panels plus Build catalogue cover almost the entire world;
the bottom navigation shows icons without visible names. The audit covered
1280×800, 900×600 and 375×812 on `430906af`; these observations are about that
tree, not a promise about the pending phone PR.

At 1280×800, closing the numeric-coordinate disclosure exposes the full
Build note. The initial impression of a permanent Save-panel overlap was
caused by leaving the disclosure open and the Build panel scrolled. The brief
must not use that transient state as evidence for a layout bug.

## Binding rules to keep visible during design

- `docs/adr/0112-what-the-2026-09-13-identity-delivery-decides.md` and
  `docs/VISUAL_IDENTITY.md`: the map is the game; panels serve it; opening
  a panel issues no simulation command.
- The five identity section titles are Overview, Build, Zones, Manage and
  Schedule. The owner later approved a sixth Security route; all six existing
  destinations remain reachable. Their placement can be explored, but the
  identity set and added route are owner rulings.
- Light is the default theme and dark remains available. The ruled type scale
  is 15/13/11. Legibility, visible focus, 200% text and status meaning beyond
  colour are product requirements.
- No UI sentence may assert a state the simulation does not make true. New
  English and Polish copy requires code evidence, quoted in the commit and PR.
- Map gestures, HUD dragging and scrolling must keep their respective owners.
  Pointer, keyboard and touch must reach the same action.

## Design target and acceptance

1. In Overview, the map is the obvious primary surface at 1280×800, 900×600,
   375×812 and at 200% text. No placeholder minimap or secondary save controls
   dominate the initial view.
2. Paused/running state, Play and speed are discoverable beside each other.
   Queued construction visibly explains its dependency on time where the user
   can act; the queue remains reachable.
3. All six current navigation routes remain recognizable. A selected tool, its cost,
   placement action, undo and cancel can be read without covering the area
   where the player will build.
4. Critical alerts are visible and actionable without turning the map into a
   dashboard of permanent panels. Status numbers are prioritized by the
   available width and retain labels, icons and accessible names.
5. Layout and interaction are checked in the real game, with genuine world
   sprites and state, across mouse, touch, keyboard, compact windows, large
   windows and zoom. A static mockup cannot prove these gates.

The visual mockups are design probes. Implementation will be split into
coherent, testable slices so a cosmetic pass cannot quietly change simulation
commands, saves or asset rendering.

## Two directions under comparison

The first two mockups compare an **operations frame** (left navigation, full
status row, one right work panel) with a **map desk** (one left work panel,
bottom navigation, a compact top command row). The map desk exposes more map
at 900×600, while the operations frame keeps more metrics visible at once.
Neither preliminary image is a product decision: they initially omitted the
owner-approved Security route and the explicit home for compressed metrics.
Revisions must show both before one is selected for implementation.

For the map desk, compactness cannot mean losing status. #1382 already
implements the owner's #719 priority and height budget for the nine metrics;
its work must be integrated rather than overwritten. Funds (including any
overdraft warning), clock state and transport stay in the command row. A
labelled **All stats** control opens all nine existing metrics from the same
`projectStatusMetrics` descriptors, preserving badges and unknown values. A
separate persistent Saves control opens the full existing save workflow. The
desktop disclosures temporarily overlay the map only while open; on a phone
they are bounded sheets with an explicit close control and an accessible
return of focus. This is an implementation proposal, not a new metric rule.
The owner specifically chose on 2026-09-14 to keep `SavePanel` in the rail
aside slot. Moving its visible placement into a disclosure requires a fresh,
explicit owner decision before implementation or publication. The existing
minimap and other unplaced surfaces also need a placement decision rather
than silent removal.

The new shell should recompose the existing `hud.ts` elements and binders,
including unavailable/refusal/event bands and all six work panels. It must
not clone simulation logic or substitute the vendored identity mock's sample
economy. The phone Build drawer in #1392 and the status priorities in #1382
are integration prerequisites for those slices.

## Independent review of the revised probes

The revised A and B mockups now depict six routes, a Save trigger, and access
to all nine status values. Direction B is the stronger small-window candidate:
its 900×600 map is larger, and its compact command row keeps the time controls
and urgent counts near the world. Both are still drawings, not proof of a
usable responsive game.

The phone drawings require correction before implementation. Their labelled
3×2 navigation conflicts with the owner's #1192 icon-only decision below
720px (`docs/VISUAL_IDENTITY.md`, lines 617–654), and several controls are only
27–33px tall, below the 44px `--tap-target` floor (`src/ui/tokens.css`). The
phone implementation should keep six distinct accessible icon tabs in one
56px row; two 44px header rows and a collapsible 164px Build sheet leave about
504px of unobscured map at 375×812. These numbers are design targets at 100%
scale, not fixed heights at 200% scale. The real layout must reflow and pass
the existing scale sweep. The Build catalogue arms a tool; any world dock
switches the armed tool and mirrors its selected state. The nine-stat sheet
must support keyboard close and focus return. Save, minimap, zoom, alerts,
and all existing panel actions need explicit reachable homes.
