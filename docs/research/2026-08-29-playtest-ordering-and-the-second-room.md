# Playtest: the ordering lead, and the route to a second room

**2026-08-29.** Mouse-driven playtest on `main` at `133a7f6` (v0.0.204), Chromium,
driving the real assembled page (`index.html` + `src/main.ts`) through a
`Worker` tee that records every command sent and every reply received.

Continues the pass recorded in `2026-08-29-mouse-playtest.md` (PR #572) and the
question issue #569's retraction left open: **the owner's complaint —
*"nie mogłem postawić więzienia … grając sam"* — still has no established
cause**, and *ordering* is the best evidence-backed candidate.

Every claim below is labelled with how it was obtained. **MEASURED** means the
run is in this repository's transcript and the numbers below are pasted from it.
**READ** means a source file was opened at the line cited. **NOT ESTABLISHED**
means exactly that.

---

## 1. The container, not the parts

#569's retraction named the method failure that produced it: *a survey that
enumerates known regions cannot find a message in a region it did not know
about.* Every dump in this pass prints `document.querySelector('.hud').innerText`
in full, plus `.hud__refusal` and `.hud__event` geometry, at every step.

**MEASURED.** At 900x600, after the naive `ZoneRoom` refusal:

```
--- .hud__refusal: {"hidden":false,"box":{"w":900,"h":32,"x":0,"y":48},
    "text":"The room was not zoned — this room type must be enclosed, and the
             area you drew is open on at least one side."}
```

The retraction holds at the binding viewport. The band is there, it is 900x32,
and it is not folded behind anything.

## 2. Nothing on screen ever says the word "wall"

**MEASURED**, by grepping the whole `.hud` innerText at each step of the naive
route at 900x600:

| moment | `/wall/i` in the whole HUD? |
| --- | --- |
| arrival, Overview tab, nothing pressed | **false** |
| Rooms tab, `room.cell` selected | **false** |
| the 4x4 rectangle drawn, before Designate | **false** |
| after the refused Designate | false (the only hit is the BUILD tab label) |

What the panel *does* say, verbatim from the Rooms panel at the moment the
rectangle is pending:

```
AREA
4 × 4 tiles at 12, 12
OPEN ON AT LEAST ONE SIDE
NEEDS AT LEAST 2 × 3 TILES
MUST BE ENCLOSED
NEEDS 1 × BED
NEEDS 1 × TOILET
```

So the game states the *rule* ("must be enclosed", "open on at least one side")
and never the *action* that satisfies it. It is a measurement, not a diagnosis.

**What would establish the cause:** a player, or the owner, saying whether
"enclosed" read to them as "go to the Build tab and lay brick walls".
**What would establish the impact:** nothing in this repository can. Nobody
plays the game yet.

**READ.** The four requirement lines are rendered as one undifferentiated block:
all four are `eyebrowText(..., 'hud-rooms__rule')` inside `.hud-rooms__rule-block`
(`src/ui/hud/rooms-panel.ts:868-946`), with no per-line state class. Only one of
the four gates the control — `confirmButton.setDisabled(pendingIsTooSmall())`,
`src/ui/hud/rooms-panel.ts:1567` — and the comment immediately above it
(`:1540-1566`) says why the enclosure case deliberately does not.

## 3. The reachable world shrinks fast, and 900x600 leaves 6x9 tiles

**MEASURED.** On a fresh prison, Build tab, no panels folded, hit-testing the
centre pixel of every tile in a 34x34 block around the camera and asking whether
`document.elementFromPoint` is the canvas:

| viewport | reachable tiles | bounding box | largest all-reachable rectangle |
| --- | --- | --- | --- |
| 1440x900 | 217 | x 5..26, y 10..22 | **15 x 12** at (8,10) |
| 1280x800 | 174 | x 6..25, y 10..21 | **12 x 11** at (10,10) |
| 1024x768 | 110 | x 8..23, y 11..21 | **8 x 10** at (12,11) |
| 900x600  | **86** | x 9..22, y 12..20 | **6 x 9** at (13,12) |

The camera calibration `(viewportW/2 − 1024, viewportH/2 − 1024)` held at all
four, checked each time against a real `RemoveObject` press rather than assumed:
1440x900 → `(-304,-574)`, 1280x800 → `(-384,-624)`, 1024x768 → `(-512,-640)`,
900x600 → `(-574,-724)`.

The biggest single blockers at 900x600, by tiles covered:
`hud-minimap__surface` 16, `hud-strip` 8, `ui-panel__body` 6.

**This is a measurement and not a defect claim.** The camera pans, so a small
window is not a hard limit on prison size. What it does bound is a *single
gesture*: a wall run or a room drag whose pointer leaves the canvas is not the
run the player drew.

**READ, and relevant to how much that bound costs:** with a mouse, the camera
pans on the **middle button only** — `if (pointer.button !== 1) return;` at
`src/rendering/scene/world-scene.ts:407`. The wheel zooms
(`src/rendering/scene/world-scene.ts:368-381`), it does not pan. The Build
panel's own hint states this, verbatim from the run: *"Click a tile edge to
place a wall. Drag along it to lay a run. Two fingers, the middle button or the
arrow keys still move the camera."* So it is **documented, in the panel, at the
moment it matters** — which is why this is filed as a measurement of the
workspace and not as a missing-affordance claim.

**NOT ESTABLISHED:** what a laptop trackpad does here. A two-finger trackpad
swipe emits `wheel`, which this code zooms with; whether that leaves a trackpad
player able to reach the world they want is not something this pass measured.
**Cheapest measurement that would settle it:** dispatch a `wheel` sequence and
re-run the reachability count above at 900x600, before and after.

**Overlap declared:** an agent is working `src/ui/**` on the UI scale (#545).
The table above is theirs to use; this pass did not touch `src/`.

## 4. The refusal band latches across unrelated actions

**MEASURED.** The calibration probe presses "Remove" on bare ground, which earns
`"Nothing was removed — there is no object on that tile, and none being built
there."` That sentence was still the whole content of `.hud__refusal` several
minutes and dozens of commands later, at both 900x600 and 1440x900 — including
while the Rooms panel showed a pending rectangle, and after a *successful*
`ZoneRoom`.

**READ.** Deliberate: `src/ui/hud/hud.ts:946-951` — *"a simulation refusal
[stays] until another replaces it or the session ends, which are the first
moments each sentence stops being true."* The previous pass recorded the same
thing from the worker side (`state-machine.ts:517`). Whether a refusal about an
action three minutes ago should still be the one sentence under the status strip
is a product question. **No cause and no impact are claimed for it here.**

## 5. Import and Export: an empty category, with the numbers

**MEASURED**, mouse-driven at 1440x900, on a fresh prison:

- **Export** fires a real `download` event; the file arrives and parses.
- **Import** of that same file is accepted, and the panel then states exactly
  what came back and what did not, verbatim: *"Restored: kernel tick and command
  queue, RNG stream states, world terrain and ownership, construction orders and
  undo/redo, entity id liveness, prisoners, needs, actions and cell assignments,
  jobs, containers and utility networks, doors, security sectors, guards and
  patrols, contraband, intelligence and searches, incidents, gangs and tunnels,
  prisoner and staff names. Not carried by this save version: room and topology
  caches (recomputed from the world), navigation caches and in-flight path
  requests (re-issued on the next tick)."*
- **Import of a non-save file** (`notes.txt`, `text/plain`, `hello, not a save`)
  is refused with a sentence that says what to do: *"That file is not a Lockstate
  save — choose a file exported from this game."*
- No `pageerror`, no console output, on any of the three.

Nothing to report. Recorded so nobody re-derives it.

## 6. The three tabs nobody had walked, at 900x600

**MEASURED**, fresh prison, verbatim:

- **Overview / Intake** — *"Admit a prisoner"* live, with *"A prison needs a cell
  before it can admit anyone. It does not need a free bed: an arrival with none
  waits until a bed is free."*
- **Security / Staff** — *"GUARD COVERAGE / 0 of 0 / Covered / This prison has the
  guards it asks for. / WHO TO HIRE / Guard Selected / Hire Guard · 80 / … /
  ON DUTY / 0 held · 0 free / Nobody is assigned right now."*
- **Regime** — *"TODAY'S BLOCKS / General Population 0% THROUGH / Allows Sleep /
  High Risk 0% THROUGH / Allows Sleep, Meal, Hygiene / PRISONERS / 0 of 0 /
  Nobody has been admitted yet."*

All three render, all three say what state they are in. The one line worth a
second look is Security's **"0 of 0 — Covered — This prison has the guards it
asks for"** on a prison with no guards: true, because an empty prison asks for
none, and it reads as reassurance at the moment a player has done nothing.
**No cause and no impact are claimed.**

---

## Weakest claim, and the cheapest thing that would falsify it

**Weakest: that §2 is the owner's wall.** What is measured is that the word
"wall" never appears and that the rule is stated without the action. Nobody
observed the owner's session, and the previous pass made exactly this mistake
one level up — every premise checked, the conclusion invented.

**The single cheapest measurement that would falsify it:** ask the owner what
they tried after the refusal. If they had already built walls and were stopped
by something else, §2 is a nice-to-have and the cause is elsewhere.
