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

At 1280×800, closing the numeric-coordinate disclosure exposes the full
Build note. The initial impression of a permanent Save-panel overlap was
caused by leaving the disclosure open and the Build panel scrolled. The brief
must not use that transient state as evidence for a layout bug.

## Binding rules to keep visible during design

- `docs/adr/0112-what-the-2026-09-13-identity-delivery-decides.md` and
  `docs/VISUAL_IDENTITY.md`: the map is the game; panels serve it; opening
  a panel issues no simulation command.
- The five section titles are Overview, Build, Zones, Manage and Schedule.
  Their placement can be explored, but the set is an owner ruling.
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
3. The five categories remain recognizable. A selected tool, its cost,
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
