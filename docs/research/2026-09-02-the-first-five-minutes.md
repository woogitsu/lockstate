# Playing the first five minutes — a player who has never seen the game

**Date:** 2026-09-02 (session clock; the branch itself was cut and played on
2026-09-01 wall-clock in this container).
**Branch played:** `docs/playtest-first-five-minutes`, cut from `origin/main`
at **v0.0.343** (`f0d4b01e`). Every act below ran on top of that commit plus
this branch's own instrument commits (`55e9dc6` → `30b7bc95`); nothing under
`src/` differs from `f0d4b01e`. The strip's own version line confirms the
base commit directly — act 1's own capture reads `v0.0.343 · 55e9dc6` (this
branch's first commit, instrument-only).

**The assignment, as given:** five playtests the same day each played one
mechanism — money, rooms, save/reload, alerts, people. This one plays neither:
it is a brand-new player's first five minutes, using **only what the screen
says**, not what any test fixture, ADR or source file knows. The owner's
standing directive is the whole brief: *"the game must be easy and friendly
to play — no hidden functionality."*

## Reproduction

`tests/browser/playtest-2026-09-02-the-first-five-minutes.playtest.ts`, one
act at a time:

```
LOCKSTATE_BROWSER_TEST_PORT=5340 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-02-the-first-five-minutes.playtest.ts -g "act 1" --reporter=line
```

Nothing in CI collects it: `tests/browser/playwright.config.ts` matches
`*.spec.ts` only; `playwright.playtest.config.ts` is the one that matches
`*.playtest.ts`. Every act drives `index.html` + `src/main.ts` in real
Chromium through a `Worker` tee, at this config's own default 1440x900
viewport — not the 1280x800 several earlier playtests used — and that
difference is itself the cause of one instrument bug below, so it is stated
rather than assumed away.

**LFS.** `git lfs checkout` was run in the worktree first (62 objects, 93 MB);
confirmed with `file public/assets/actors/actor.guard.base.idle.png` returning
`PNG image data, 260 x 3104` rather than the `ASCII text` a fresh worktree
returns.

**Contention.** `ps -eo etime,args | grep -E "[p]laywright/test/cli|[v]itest"`
returned nothing before the first run, at a one-minute load average of 0.31.
Acts were run one at a time. **No finding below rests on wall-clock time** —
every timed claim is in simulation ticks, read from `simulation/clock-state`
(`playtest-harness.ts`'s `currentTick`, which is published every tick
regardless of whether anything else changed, unlike `simulation/status-counts`).

## Claim tiers

- **MEASURED** — this pass ran it in a browser and the output below is pasted
  from that run.
- **VERIFIED, read** — a file was opened at the line cited and quoted.
- **REASONED** — follows from a MEASURED or VERIFIED fact stated beside it.

## Two bugs in this pass's own instrument, found and fixed before they could produce a false finding

Both are recorded in full because the brief asked for it explicitly, and
because both are exactly the shape the brief warned about: a broken
instrument reporting a refusal, or a wrong reading, as if it were the
product's own behaviour.

### Instrument bug 1 — an off-screen tile pair hung a click forever

Act 4's first draft dragged a rectangle at tiles (2,2)-(6,6), reasoning (by
analogy with `.hud-minimap`, which this branch's brief names as covering low
tile numbers) that a small area near the origin would be visible and clear of
the minimap. `calibrate()` measured this run's actual origin at
**`(-304, -574)`** — this config's 1440x900 default viewport, not the
1280x800 several earlier playtests used, puts the camera somewhere those
earlier sessions never measured — so tile (2,2)'s centre resolved to screen
point **`(-144, -414)`**: off the visible page entirely, in negative
coordinates. No rectangle was ever held on screen, `.hud-rooms__confirm` was
never laid out, and `playwright.playtest.config.ts` sets `expect.timeout`
(15s) but no default `actionTimeout` — so `.click()` waited **with no
timeout at all** instead of failing. The run sat past this file's own 120s
harness timeout with zero output, which reads exactly like a hang in the
product rather than a bad tile choice in the instrument.

Fixed two ways, both committed (`20f88a7f`): moved the act 4 rectangle onto
`(12,12)-(17,17)`, the footprint `buildAndPopulate`/`buildResilientCell`
already use elsewhere in this directory for the documented reason that it is
on-screen; and added `page.setDefaultTimeout(30_000)` in a `beforeEach`, so
any future instance of this mistake fails in 30 seconds with a readable
`TimeoutError` instead of consuming the whole test budget silently. The
30-second guard then caught a second, smaller version of the same class of
mistake immediately (see below) rather than letting it hang too.

### Instrument bug 2 — calibrate()'s own probe overwrote the very refusal act 5 was measuring

Act 5 needs one honest sequence in one session: fail to zone on open ground
(the natural first mistake), then build walls and succeed, then ask whether
the refusal band still lies about the first failure. The first run of this
act showed the band reading, after a real, confirmed success:

```
"Nothing was removed — there is no object on that tile, and none being built there."
```

— which is neither the mistake's own message nor anything about zoning at
all. Cause: `buildWalls()` called `calibrate(page)` internally, and
`calibrate()` presses the Remove tool against empty ground to bisect the
screen-to-tile transform (`playtest-harness.ts:226-272`) — a real command
that produces its own `nothing-to-remove` refusal and leaves it standing in
`.hud__refusal`. That calibration call happened *between* the deliberate
mistake and the deliberate success, so its own refusal overwrote the
mistake's, and the run measured the calibration probe's leftover rather than
the thing the act was written to measure. (`docs/research/2026-09-01-playing-the-rooms-surface.md`'s
act 4 hit the identical mechanism the same way, for the same reason, earlier
the same week — this is the second instrument in two days to trip over
`calibrate()`'s own side effect.)

Fixed (`30b7bc95`) by calibrating **once**, before the mistake, and passing
that origin into `buildWalls()` so it does not calibrate a second time. With
that fix, the sequence reads cleanly (see the finding below) and the earlier
false reading is recorded here rather than discarded, per
`docs/AGENT_WORKFLOW.md`'s instruction to report a corrected measurement in
both directions rather than silently replacing it.

Both bugs were caught the way the brief asks: by distrusting a result that
looked like a hang or a mismatch, rather than reporting either as a product
defect.

## The first five minutes, narrated

**The first screen**, before "New prison" is ever pressed, is a save browser
that says exactly what it is: `PRISONS / New prison / Save now / Export /
Import / No prisons yet. / Local saves only — no network required.` No prison
exists yet and the screen does not pretend one does.

**Pressing "New prison"** lands on the **Overview** tab by default
(`hud-state.ts`'s `INITIAL_HUD_SHELL_STATE.activeTab = 'overview'`), which
shows exactly one thing: the Intake panel.

```
INTAKE
Admit a prisoner
A prison needs a cell before it can admit anyone. It does not need a free
bed: an arrival with none waits until a bed is free.
```

**This is a real, working piece of onboarding, and it is checked here rather
than assumed.** The one word a first-time player needs — "cell" — is the
exact word the Rooms tab's catalogue uses for the room type
(`room.cell.name`: `'Cell'`), so a player who reads this sentence and looks
for a tab with rooms in it is not guessing at a synonym. The Admit button is
never disabled (`intake-panel.ts` wires `onAdmit` unconditionally), so a
player can press it immediately — and what happens next is where the first
real finding is.

## Finding 1 — the first refusal a genuinely new player is likely to see says nothing at all, while a specific, correct sentence for the exact same condition exists twice in the tree and reaches neither the player nor even the developer's own message-key system

**Reproduction (MEASURED, act 2).** New prison, immediately press "Admit a
prisoner" with zero rooms zoned — the single most likely first action for a
player who clicks before reading, and a perfectly ordinary one for a player
who has read the hint and is testing whether the button does anything:

```
[act2] command(s) the press actually submitted: []
[act2] .hud__refusal band: "Nobody was admitted — the request was refused."
[act2] .hud__event band: ".hud__event: not laid out"
[act2] .hud-alerts__list: "No active alerts"
```

No `AdmitPrisoner` command ever reaches the simulation worker — the refusal
happens entirely client-side, before dispatch. **The one sentence the player
actually reads is the fully generic per-action fallback and names nothing
about *why*.**

**What the game itself knows, and throws away.** The same press logs this to
the browser's developer console — invisible to an ordinary player, who has no
reason to open devtools:

```
[console.warn] HUD action failed {"actionId":"admit-prisoner","error":{"message":"This prison has no room to hold a prisoner, so nobody can be admitted into it."}}
```

**Cause, VERIFIED, read.** `src/main.ts:2681-2682`:

```ts
if (viewModel.counts.rooms === 0) {
  throw new Error('This prison has no room to hold a prisoner, so nobody can be admitted into it.');
}
```

This `Error`'s `.message` is genuinely good, specific English — and it is
**explicitly documented, by design, never to reach the player.**
`src/ui/host-refusal.ts`'s own module doc states it plainly: *"The message is
diagnostic English and deliberately never reaches the player (ADR 0011): it
goes to the host through `MountHudOptions.onError`, exactly as every other
thrown `Error` on this path does."* ADR 0011 is the rule that every
player-facing sentence must be a locale message key, not a raw string — a
real, reasoned architectural boundary, not an oversight. The mechanism that
*does* let a thrown value choose a specific sentence is
`HostRefusalReason`/`HostRefusalError` (`src/ui/host-refusal.ts:52-63`), and
it exists — but it currently has **exactly one member**,
`'past-the-overdraft-floor'`, wired for one purchase-refusal ruling
(#723/ruling 18). `admit-prisoner`'s pre-check throws a plain `Error`, not a
`HostRefusalError`, so `hostRefusalReason(failure.error)` answers `undefined`
(`hud.ts:1299`) and `reportError` falls back to the fully generic per-action
key:

```
'hud.refusal.admit-prisoner': 'Nobody was admitted — the request was refused.'
```

**The specific sentence this situation needs already exists in the locale
file, unused for this path.** `src/content/default-locale-en.ts:403`:

```
'hud.alert.refusal.admit.no-accommodation': 'Nobody was admitted — there is no room to put a prisoner in yet.'
```

That key *is* reachable — but only from the simulation's own, coarser-grained
refusal on the far side of a real `AdmitPrisoner` submission, which the
client-side pre-check at `main.ts:2681` exists specifically to intercept
*before* dispatch (its own comment explains why: to answer during a paused
clock, and to guarantee exactly one message per press rather than a race
between two). For the ordinary case this playtest reproduces — zero rooms
zoned at all — the pre-check always wins, so the specific key is only ever
reached if the client-side count (`viewModel.counts.rooms`) is nonzero for a
reason the finer-grained worker check does not accept (e.g. a zoned Yard with
no cell) — a real edge case, but not the first-five-minutes one.

**Player-visible cost.** A player who presses the one control the default tab
offers, before reading or after reading and testing it, learns nothing from
the refusal itself. The panel's own hint text one line above the button
already answers the question correctly ("needs a cell") — so the practical
harm is bounded to whoever does not re-read the hint after a refusal — but
the refusal line itself is a wasted opportunity that costs nothing to fix: the
exact right sentence is sitting in the same file, already written, already
reasoned about, and simply not wired to this call site. This is a proposal
(give `admit-prisoner`'s pre-check its own `HostRefusalReason`, or route it
through the same specific key the simulation-side path already uses), not a
one-line fix attempted on this branch — `HostRefusalReason`'s own module doc
frames it as a closed vocabulary extended deliberately one member at a time,
and picking the wording is a decision, not a typo.

## Finding 2 — the ordinary shape of the first mistake really does leave a false refusal on screen, reproduced without contrivance

`docs/research/2026-09-01-playing-the-rooms-surface.md` already found and
reported that a successful `ZoneRoom` can leave an earlier, unrelated
refusal standing verbatim, because `refusals.supersede` is keyed to the exact
rectangle and room type that just succeeded rather than to "the standing
refusal, whatever it was about" — and it named its own weakest claim
explicitly: *"this playtest did not measure how often it happens across a
longer, less scripted session."* This pass supplies exactly that measurement,
for the specific sequence a first five minutes actually produces.

**Reproduction (MEASURED, act 5).** A new player, following the Intake hint
literally, opens the Rooms tab, selects Cell, and drags a rectangle on open
ground before realising a cell needs walls:

```
[act5] first (open-ground) attempt refusal band: "The room was not zoned — this room type must be enclosed, and the area you drew is open on at least one side."
[act5] rooms count after the mistake: 0
```

Then builds a real 6x6 walled shell around a *different* rectangle (rows
20-24 rather than 12-17 — a genuinely separate area, the same shape the
original finding measured), and zones it — succeeding on the first attempt:

```
[act5] zone attempt 1 at tick 2786: rooms=1 | refusal band NOW says: "The room was not zoned — this room type must be enclosed, and the area you drew is open on at least one side."
[act5] zoned: true after 1 attempt(s)
[act5] refusal band read again, 1200ms after a real success: "The room was not zoned — this room type must be enclosed, and the area you drew is open on at least one side."
[act5] refusal band once more, +1200ms: "The room was not zoned — this room type must be enclosed, and the area you drew is open on at least one side."
```

The room genuinely exists — the Rooms panel's own "Not ready" section, read
in the same moment, correctly names the new room and what it still needs
(`Cell at 12, 12 is missing / 1 × Bed / 1 × Toilet`) — while the always-laid-out
refusal band a few pixels above it keeps insisting, in the present tense,
that the room "was not zoned." **Both sentences are on screen at once and
they contradict each other about the same fact.**

**Cause.** Unchanged from the original finding — `session-commands.ts:137-166`'s
`refusals.supersede(zoneKey)` is keyed to the rectangle and room type that
just succeeded, so a success at one rectangle does not clear a standing
refusal about a different one, by design (issue #492, cited in the code's
own comment, is about the opposite failure mode: a success elsewhere should
not silently clear a refusal the player has not fixed yet). Reported again
here, not as a new defect, but as evidence on the exact question the original
report named as unresolved: **this is not a corner case a playtest had to
manufacture — it is the natural result of the intake hint's own wording,
reproduced end to end with no scripted detour.**

## Finding 3 — none of the nine status-strip chips explain themselves during an ordinary first five minutes

**Reproduction (MEASURED, act 7, at the end of a full successful chain — one
resident housed, funds still positive).**

```json
[{"metric":"prisoners","label":"Prisoners","value":"1","chipTitle":null,"srOnlyText":null},
 {"metric":"high-risk","label":"High Risk","value":"0","chipTitle":null,"srOnlyText":null},
 {"metric":"staff","label":"Staff","value":"0","chipTitle":null,"srOnlyText":null},
 {"metric":"coverage","label":"Coverage","value":"0","chipTitle":null,"srOnlyText":null},
 {"metric":"rooms","label":"Rooms","value":"1","chipTitle":null,"srOnlyText":null},
 {"metric":"incidents","label":"Incidents","value":"0","chipTitle":null,"srOnlyText":null},
 {"metric":"contraband","label":"Contraband","value":"0","chipTitle":null,"srOnlyText":null},
 {"metric":"funds","label":"Funds","value":"22,325","chipTitle":null,"srOnlyText":null},
 {"metric":"earned-today","label":"Earned today","value":"162","chipTitle":null,"srOnlyText":null}]
[act7] chips carrying a title/description (0 of 9): []
```

Reproduced identically on a second, independent run of the whole seven-act
file (`prisoners`, `rooms` and `chipTitle`/`srOnlyText` for all nine chips
matched exactly; `funds` read `22,325` both times; `earned-today` read `169`
against `162` above and total ticks `3,750` against `3,688` — the only two
numbers that moved, both timing-dependent for the reason given in Finding 3's
own tick note, and neither changes which chips carry a description).

Zero of nine chips carry a `title` attribute or an `.ui-sr-only` sentence, at
any point this pass measured, including the moment a player has a resident,
a room, income and a balance all at once — the state a genuinely successful
first five minutes actually reaches.

**Not a gap in the mechanism — a gap in when it fires.** `src/ui/hud/projection.ts:958-970`
carries exactly one chip's description, `funds`' `overdraftDescription`, added
by *"the owner's ruling of 2026-09-01"* specifically so a screen-reader user
and a non-hovering player both learn what the `FUNDS` badge's `{remaining}
left` is a remainder *of*. Read in full, `overdraftDescription` is defined
only while the treasury is in the negative overdraft band
(`overdraftTone`/`overdraftBadge`'s own comments: *"nobody chose zero, and
nobody chose the floor either... there is no tone here for a balance that is
merely low"*). A prison built the ordinary way in five minutes spends roughly
2,675 of its opening 25,000 and finishes the chain at **22,325**, nowhere
near the −2,500 floor — so the one mechanism that exists for this never
switches on. **The other eight chips have no such mechanism at all, at any
balance.** This confirms today's `2026-09-01-playing-the-people-surface.md`'s
narrower finding about the `high-risk` chip specifically, at the scale the
brief asked for: for the entire ordinary first five minutes, all nine chips
are bare words and bare numbers.

**Money's unit, checked and found deliberate, not hidden.** The `FUNDS` chip
reads a bare integer (`22,325`) under the label `Funds`, with no currency
symbol and no stated unit. `src/ui/hud/projection.ts:891-903` states the
reason in full: issue #96 named money the primary resource without choosing
a currency, ADR 0017 is Accepted without naming one either, and dividing by
100 or printing a symbol "would take both by implication, in a chip" — so a
bare number under a plain label is recorded as the *honest* rendering of a
quantity nobody has named a unit for yet, not an oversight. **Checked and
found correct as a deliberate, reasoned decision** — reported because the
brief named it explicitly, not because this pass found anything wrong with
it.

## Finding 4 (soft) — "Not ready" does not mean not usable, and the label can outlive the thing it is warning about

**Reproduction (MEASURED, act 6).** A cell zoned, one bed placed, no toilet:

```
[act6] after one bed, no toilet, tick 3021: roomCapacity=1 accommodationCapacity=1
[act6] Rooms panel with a bed and no toilet: "...NOT READY\n1 of 1\nCell at 12, 12 is missing\n1 × Toilet..."
[act6] admit pressed at tick 3302, prisoners now 1, occupants 1 (tick 3470)
```

The room is admissible and actually houses a resident (`occupants: 1`) while
the Rooms panel still reads **"NOT READY"** for the same room, because
occupancy is derived from sleep-surface capacity alone (ADR 0028) and a
toilet is not a sleep surface. This is not a defect in the mechanism — it is
documented and deliberate (ADR 0028, and `hud.intake.hint`'s own second
sentence: *"It does not need a free bed: an arrival with none waits until a
bed is free"* already tells a careful reader that occupancy and
"furnished-and-complete" are two different facts). It is recorded here as a
**soft** finding because the word "ready," read by a player who has not
studied ADR 0028, plausibly means "you can use this now" — and here a room
the panel calls not ready is, in the one sense that actually matters to a
five-minute session, ready. Nobody is blocked by it; the label is simply
narrower than a first reading of the word suggests. Not fixed on this branch,
and not proposed as one — naming a mismatch between a label's plain-English
reading and its authored scope is a smaller thing than a decision, and a
sharper word ("Missing furniture" rather than "Not ready") is available
without touching `ADR 0028` at all if the owner wants it.

## What this pass checked and found correct

Recorded because the brief asks for it explicitly and the last several passes
have found it as valuable as the defects.

- **The Rooms tab's own before-you-draw disclosure is real and it matches the
  Intake hint's own wording exactly (MEASURED, act 3).** Selecting "Cell"
  shows, before a single tile is dragged: `NEEDS AT LEAST 2 × 3 TILES / MUST
  BE ENCLOSED / NEEDS 1 × BED / NEEDS 1 × TOILET` — the complete, accurate
  requirement, stated ahead of the mistake rather than only after it. This is
  issue #529's `paintRule`, working as designed.
- **A refused zoning confirm leaves the tool in a clean, retryable state, not
  a stuck one (MEASURED, act 4).** After the "open on at least one side"
  refusal, the panel automatically drops back to a fresh `Draw on map /
  Remove rooms` state rather than leaving a discarded rectangle or a dead
  Confirm button behind — a player can simply try again with no extra
  gesture to learn.
- **The pre-confirm enclosure preview does say the true thing before the
  press, live (MEASURED, act 4).** With the rectangle held and Confirm not
  yet pressed, the panel already reads `AREA / 5 × 5 tiles at 12, 12 / OPEN
  ON AT LEAST ONE SIDE` — the same information the post-refusal sentence
  gives, available a step earlier to a player who reads before clicking.
- **The Admit control is never disabled, and pressing it with no
  accommodation target correctly refuses rather than admitting into a dead
  end (VERIFIED, read; MEASURED, act 2).** `IntakeSystem` marks a refused
  arrival's record `'failed'` rather than accepting an inert one the strip
  would silently count as a prisoner — the refusal (Finding 1's wording
  aside) is the right decision, just poorly worded.
- **The whole chain — New prison, walls, zoning, a bed, a toilet, Admit — is
  reachable in well under a real five minutes of interaction, and the ticks
  say so plainly (MEASURED, act 7, run twice: isolated and as part of the
  full seven-act file):** **3,688** simulation ticks from New prison to a
  housed resident on the isolated run, **3,750** on the full-file run —
  roughly 1.5 in-game days either way, the two figures differing only because
  each run's construction/delivery timers land on slightly different ticks in
  real time, not because either run is wrong. The great majority of both
  figures is construction and delivery timers a player runs past at Fast
  forward exactly as every other playtest in this repository does, not active
  decisions. No step in the chain required reading this file, a test, or an
  ADR — every fact a player needed was on a screen they were already looking
  at.
- **The catalogue list itself carries no per-row facts, and that is a
  measured, reasoned choice rather than a gap (VERIFIED, read; MEASURED, act
  3).** All 18 room types show only a name and a "Selected" badge in the
  list; the minimum size, enclosure rule and object requirements appear only
  for the one currently selected, in `paintRule`. Issue #529's own text (cited
  in the code) already weighed and rejected putting those facts on all 18
  rows for the reason it would cost the one box in the panel that already
  always scrolls.

## What this pass did not reach

Touch/pointer input (desktop only, matching every other playtest here); the
Security and Regime tabs' own first-five-minutes onboarding (a first cell has
no staff and one prisoner, so neither tab has much to say yet, and this pass
did not separately measure what either says to an empty prison); the save
panel's own first-five-minutes flow beyond the very first screen (renaming a
save, the Export/Import controls, what a second "New prison" click does with
one save already standing); and whether Finding 1's generic refusal recurs
for other pre-dispatch client-side checks in `main.ts` beyond `admit-prisoner`
— the module doc for `HostRefusalReason` suggests it is a general pattern
(*"a closed vocabulary... extended... one member at a time"*) and this pass
checked only the one call site the first five minutes actually reaches.

## What would change my mind

Finding 1's weakest claim is that a genuinely new player presses Admit before
reading the hint often enough for the missing sentence to matter — the hint
itself is correct and one line away. A count of how often real playtesting
sessions (not this repository's own scripted ones) hit this refusal before
reading the panel text above the button would sharpen or refute that. Finding
2's reproduction here answers the previous report's own named weak point (is
the stale-refusal sequence the *ordinary* shape of play) for one concrete
path; it does not establish a rate across a longer, less scripted session,
which is the same gap the original report named and this one inherits rather
than closes.

## Instrument note: `currentTick` reads `-1` immediately after "New prison"

Recorded because it is a genuine measurement, not because it is a finding.
`page.locator('.hud-clock__day')` reads `'1'` — the on-screen fact — a frame
or more before the tee has seen any `simulation/clock-state` message at all,
so `currentTick(page)` called with no settle time reads its `-1` sentinel
even 200ms after the click (MEASURED, act 1). This says something about this
harness's two channels racing each other, nothing about what a player sees —
the day label the player actually looks at is already correct — so it is
recorded here rather than reported as a defect, and every tick figure
elsewhere in this document was read after the simulation had produced real
activity (walls queued, a room zoned), where the channel is unambiguously
populated.
