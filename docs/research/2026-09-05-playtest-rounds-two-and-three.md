# Ten more play-testers, overnight: what Lockstate does to a person at v0.0.469 → v0.0.476

**Date:** 2026-09-05
**Versions played:** v0.0.469 (`be244a24`) through v0.0.476 (`413def1c`). Each
tester cut its own worktree from `origin/main` as it stood when it started and
says in its own record which version that was — `main` moved **twenty-five
releases** during these rounds, so no two testers played quite the same game and
none of them pretends otherwise.

**Nothing under `src/` was changed by any tester.** `git diff -- src/` is empty
on every branch in these rounds. All four of `AGENTS.md`'s owner-reserved
surfaces are untouched.

**This is the second consolidated report.** The first,
[2026-09-04 five play-testers](./2026-09-04-playtest-round-five-testers.md),
covers the five testers who played v0.0.451. This one covers the **ten** who
have played since, under the owner's standing instruction to keep two testers
playing continuously and to look for improvement ideas — better UI, better HUD —
rather than defects alone.

Two testers were still playing when this was written (`a-big-prison`,
`the-second-evening`) and are **not** in it.

---

## How to read this

Testers label their own claims — **MEASURED** (from a run, quoted), **VERIFIED,
read** (a file opened at the line cited), **REASONED**, **JUDGEMENT** — and
nothing is **FROM MEMORY**. On top of that this document adds:

- **✅ RE-VERIFIED** — the coordinator independently opened the cited code and
  confirmed the claim. About forty citations were re-opened across these rounds.
- **○ TESTER'S CLAIM** — measured and reported, not independently re-checked
  here. Not doubted; not re-run.

**Two citation slips were found and are recorded rather than smoothed over**,
because the point of the tier is that it is checkable: one tester wrote the key
`hud.build-shortfall` where the shipped key is `hud.build.buy-shortfall` (line
number and quoted sentence both exact); another cited `tokens.css:415` for a
comment that sits at `:441` (phrase exact). Both are naming slips, not
fabrications — every claim they carried held up. **No claim was withdrawn in
these rounds.**

---

## The verdict, in one paragraph

**This game now knows a great deal that it does not say.** That single sentence
is the finding of these rounds, and it arrived independently from ten testers
who were not looking for it: the security panel knew the guard count it
recommended would let every incident lapse and said `Covered`; the world knew
twenty-two prisoners stood on one tile and drew two figures; the simulation
computes a standing-conditions field that has **exactly five mentions in the
whole UI, all of them comments**; the treasury readout is silent across its
entire positive range *by construction*; building three rooms that fix 42% of a
prisoner's day moves one visible number; and the way back from a lost camera
exists, costs one press, and is advertised by a sentence written into the page
**by the click it advertises**. Against that: the descent into insolvency is
drawn beautifully, the shipped art reads, contraband tells you honestly when it
fires, the rooms genuinely work, and six of the previous round's findings were
fixed and shipped while these rounds ran — four of them reaching the player whole.

---

## 1. What was fixed while we played, and what that proved

A parallel session shipped fixes for the previous round's top tier during these
rounds. One tester's whole brief was to find out whether a **player** experiences
them, because a merged pull request and a green test prove the code path and
nothing else — this repository's most expensive recurring defect is a thing
shipped, keyed, tested and rendered by nothing (#920, still open).

| fix | finding it answered | does a player get it? |
| --- | --- | --- |
| #942 a run of presses is a run | 25 Admits → 17 prisoners | **whole.** 150 admits + 48 hires across 1×/2×/4×: 25/25 and 8/8 every run |
| #943 a new prison keeps the old one | New prison discarded unsaved play | **whole.** Prison A returns at tick 6857 unchanged |
| #926 the arm label stays in its box | label painted over `Remove` | **whole.** 9.0px inside its button, 17.0px clear |
| #941 `Covered` says what it means | the panel said Covered at a lapsing count | **partly.** The new sentence renders at all five viewports — *not* #920's failure mode — but the badge is still green `Covered` while 8 of 8 incidents lapsed and 31 were injured |
| #944 a shared tile draws both | 28 actors drew as 2 figures | **to about eight actors.** Six on a tile → six countable figures. Twenty-two → an orange slab. Step is `0.44/(n-1)` tiles = 1.34px at n=22, under 4px from n≥9 |
| #945 removing a standing object says so | a 65-cost bed destroyed in silence | **and its sibling is still silent — see A1 below** |

**The lesson these rounds paid for:** four of six landed whole, and the two that
did not failed in the two ways this project keeps failing — a **bound nobody
stated** (#944 works at the scale it was tested at) and a **sibling code path the
fix's own premise excluded** (#945).

---

## 2. The ranked findings

### Tier A — the code knows something the screen does not say

**A1. #945's sibling arm is still silent, and the sticky band leaves a FALSE
sentence over it.** `are-the-fixes-real`. **MEASURED with the clock paused**, so
no tick could pass between the two presses: cancelling a *pending* object order
with Build → `Remove` says nothing at all, while the previous removal's sentence
— *"The object was removed — the money it cost does not come back."* — stays on
screen. **That sentence is false about the press it is standing over**, because a
cancelled order refunds.

**✅ RE-VERIFIED, and still live.** `ObjectPlacementService.remove`'s pending arm
calls `this.orders.cancelOrder(...)` **directly**, returning `order-cancelled`
without ever entering the `CancelBuildOrder` branch that speaks; the
`RemoveObject` arm in `session-commands.ts` calls only `refusals.supersede(...)`.
The code is **byte-identical at v0.0.469 and at today's `main`**. *The same order
cancelled two ways says two different things.*

**#945 inherited a wrong premise:** its own text calls this arm *"the channel
#932 fixed"*, and #932 never reached this route. The proposed close needs **no
new string** — pass the pending order's state to the event the other path
already records.

**A2. The standing-conditions field is computed, put on the wire, and dropped at
the HUD boundary — while a false sentence holds the band.**
`what-the-game-tells-you`. **✅ RE-VERIFIED by the crispest check in these
rounds:** `grep -rn "conditions" src/ui/ src/main.ts` returns **exactly five
hits, and all five are comments.** The field that knows what is actually wrong
with the prison has no reader at all. This is #930, now with its cost attached:
`counts.conditions` was `["intake.no-place"]` in every logged sample while the
band showed a removal refusal from before the prison had a wall.

**A3. The FUNDS readout is silent across its entire positive range, by
construction.** `the-money-runs-out`. **MEASURED:** 620 bricks, one press,
25,000 → 200, and the chip is `{"text":"25,000 | FUNDS","tone":null}` at both
ends. **✅ RE-VERIFIED:** `overdraftTone` opens with
`if (remaining === undefined || counts.treasuryMinorUnits >= 0) return undefined;`
— tone, badge and tooltip are all switched on by the balance being *negative*.
So the whole starting balance is spent in silence, and the money readout only
begins to speak once the money is gone.

**A4. The world does not change for up to thirty seconds after a wall is built.**
`the-build-flow`. **MEASURED:** the clipped world is byte-identical (md5
`81fc2de6`) at *"16 waiting · 0 being built"*, at *"…1 being built"*, and at
*"0 waiting · 0 being built"*; a bed queued and the same bed finished are one
image. Panel announced the empty queue at t+19,371ms; the picture changed at
**t+30,380ms**. **✅ RE-VERIFIED in mechanism:** the snapshot feed is
`dirty`-gated with `DEFAULT_POLL_INTERVAL_SECONDS = 30`, and placing an order
sets `dirty` where a construction *completing* does not. **11.0s of dead screen
across the game's strongest visual transition** — a grey wash becoming bright
brickwork. Known at code level as #576 half B; new as a player measurement.

**A5. Searches are unreachable until you hire one more guard than the panel asks
for — and the panel says `Covered` at the number that finds nothing.**
`contraband`. **MEASURED**, one prison, one seed, twelve prisoners, three phases,
one variable: **1 guard → 0 discoveries. 2 guards → 0 discoveries** over ~9
in-game days, with the panel reading `2 of 2 · Covered`. **3 guards → finds.**
**✅ RE-VERIFIED:** a sweep requires a *claimable* guard
(`if (claimableGuardIds(this.guards).length < policy.requiredGuardCount) continue;`)
while the posting requirement is `ceil(occupants / 8)` — so the real threshold is
**posting requirement + 1**. This is the twin of the previous round's A1 on a
second subsystem, and ADR 0073 predicted the coupling against a constant of one,
before the panel said `Covered` at that number.

**A6. Building the three rooms that fix 42% of a prisoner's day moves one visible
number.** `the-empty-work-block`. The rooms **work completely** (see §3), and
three of them move `ROOMS 3 → 6` and nothing else, ever. The figure that did
change is `concurrentUseCapacity` — ten work places for eight prisoners — and
**✅ RE-VERIFIED: it has zero occurrences in `src/ui/`.** The player pays 880 and
cannot tell it worked.

### Tier B — the way back, and what a player can do

**B1. The way back from a lost camera exists, costs one press, and the screen
says it does not.** `getting-lost`. **MEASURED:** from a screen where 113 of 113
sampled points are void, **one press on the minimap returns the camera to tile
(16,16)** — the prison, to the tile. **✅ RE-VERIFIED, and it is a small
masterpiece of unintended consequence:** the placeholder reads
`'Minimap is not available yet'`, and the click handler does
`if (navigated) minimapPlaceholder.textContent = t(HUD_MESSAGE_KEY.minimapNavigable)`
— so the sentence *"No map is drawn here yet — click to jump the camera there"*
is written into the page **by the click it advertises**. The code comment shows
the caution was deliberate — never show a promise that might be false — and the
consequence is that the true sentence is shown only to a player who already
guessed. **This also refutes one quarter of #794**, whose fourth claim (*"no
return-to-prison control exists"*) has been false since 2026-09-02.

**B2. Three drags and the prison is gone; a prison switch lands the new one on a
black screen.** `getting-lost`. 800px × 3 at zoom 1 puts owned land off screen;
whole-HUD text on all five tabs then names **no position, direction or
distance**. Across a prison switch with no reload the camera moves `dx=0 dy=0`
and 113/113 points are void — and `New prison` is the control a lost player's eye
finds. **Keyboard players have no way back at all**: the minimap surface is
`tabIndex:-1`, matching none of the page's 116 focusable elements, and there is
no recentre binding. **There are no edges** — a tester reached 617 tiles out with
no error and the HUD verbatim.

**B3. The player cannot order a contraband search, and that is correct rather
than broken.** `contraband`. **✅ RE-VERIFIED:** the protocol declares **fifteen**
player commands — Admit, CancelBuildOrder, CancelMaterialPurchase, DismissAlert,
DismissStaff, Hire, PlaceBuildOrder, PlaceObject, PurchaseMaterials, Redo,
ReleaseGuardAssignment, RemoveObject, Undo, UnzoneRoom, ZoneRoom — and none names
a search. ADR 0073's Option B is deliberately unbuilt pending Option A being
played; **this record is that play.**

**B4. The Regime tab is structurally read-only, and not by omission.**
`the-empty-work-block`. Five interactive elements under `.hud-regime`: one
collapse toggle and four roster rows that select a *prisoner*. A press on the
timetable submits **0 commands**; 24 `Tab` stops never land inside it. It could
not be otherwise — **the same fifteen commands** name no regime, block, schedule
or group. And *"Today's blocks"* shows **one** block where the schedule has ten.

**B5. Twenty-two interactions to one cell; seven change the prison, fifteen
operate the interface.** `the-build-flow`. And nothing acknowledges any of it:
`.hud__event` is *not laid out* at all five of queued / being built / finished /
`rooms 0→1` / `accommodationCapacity 0→1`.

### Tier C — what the game says, and for how long

**C1. Over 20,127 ticks a twelve-prisoner prison said four distinct sentences,
and the loudest was false throughout.** `what-the-game-tells-you`. One refusal —
about a press on an empty tile made **before the prison had a wall** — held the
band for **≥24,000 ticks and ≥9 day boundaries**, through a successful zoning, 24
walls, 8 beds, 12 admissions, 2 fights, 4 riots and 6 returns to calm.

**C2. A player who clears everything they are allowed to clear is left holding
exactly the false row.** **✅ RE-VERIFIED:** `const dismissible = alert.occurrences !== undefined;`
— and a refusal row carries no occurrences, so it alone has no dismiss control.

**C3. Truth audit: 10 of 56 samples carried a standing sentence false at that
tick** — *"No incident is still open"* stood in 56 of 56 and was false in 10. The
final screen carried three regions in three implied states at once: strip
`0 INCIDENTS Clear`, column `A riot has broken out — 12 prisoners have stopped
taking orders`, band a removal refusal.

**C4. There is a second way to clear the screen and nothing says so: reload.**
The page returns with an empty band and `No active alerts`. The documentation's
*"no player gesture"* is true of everything inside the game and misses F5.

**C5. The same press refused twice renders byte-identical text.** Events, which
never needed one, get an `N×` counter; refusals, where *"did my second press do
anything"* is the only question that matters, do not.

**C6. Dismissing 28 guards reads as having done nothing for two in-game days.**
`the-money-runs-out`. Bill `2,400 → 160`, balance stays `-2,500`, chip stays
`critical` with the same sentence, while arrears fall `1,810 → 770 → 0`
underneath. **And when the prison returns to credit the game never says so** — a
payday met in full fires no event at all, so at the moment of recovery the band
still read *"Payday went unpaid — your staff are owed 770."*

**C7. A prison with everything going wrong is 62% word-for-word identical to an
empty one.** `the-hud-a-player-reads`. Eight prisoners, four with nowhere to
sleep, one guard, a fight running, an incident just lapsed — and the Overview
tab's entire gain over an empty prison is four intake numbers and three alert
rows. **Not one sentence about the prison.** The four-room prison measured later
is **83.2%** identical to the one-cell one.

**C8. The alerts list lives inside a panel that says it does not work.**
**✅ RE-VERIFIED:** `minimapPanel.body.append(minimapSurface, alertsSection.element)`.
That panel is the largest thing on screen on all five tabs, and its surface reads
*"Minimap is not available yet"*. **Collapsing the minimap takes the alerts with
it.** (Its share of the viewport is **27.4% at 900×600 and 7.1% at 1920×1080** —
a later tester corrected the single "17%" figure this report's own brief had
quoted without a viewport.)

**C9. The alerts column cannot triage.** Four rows over six in-game days, **all
four `Warning`** — four fights that lapsed hurting everyone, beside a click that
did nothing. Three severity tiers exist and produced zero discrimination.

**C10. Two of six always-present regions never changed once in 5.93 in-game
days**, one of them painting a stale refusal in the strongest alarm colour across
the full width.

**C11. No typographic hierarchy at all.** Only 11px, 13px and 13.33px exist in
`.hud`, and every 13.33px element is an icon. **Every visible sentence and number
is 13px** — the prisoner count, an incident that hurt everybody, and the save-file
generation id.

### Tier D — the catalogue, the price, and the crowd

**D1. 75.9% of the Build catalogue is hidden, with a 0.0px scrollbar gutter.**
21 rows × 44px = 924px through **223px** at 1440×900, **88px** at 1280×720 (two
rows of twenty-one), 358px at 1920×1080. The Rooms list is the same shape. **✅
RE-VERIFIED:** `--hud-build-catalogue-floor: calc(2 * var(--tap-target))` and
`--tap-target: calc(44px * var(--ui-scale))` — the two-row floor is deliberate,
not incidental. **#902 is closed and its fix was reverted before merge**
(`13c50289`); `grep -c background-attachment src/ui/hud/hud.css` returns 0.

**D2. ADR 0035's category filter IS built and works — it is just not the arrival
state.** Nine options; at 1440×900 it clears the scroll for seven of eight
groups. From `Everything`, reaching row 17 costs **6 wheel notches or 16
ArrowDown**, and typing a letter does nothing.

**D3. The catalogue prices nothing.** **✅ RE-VERIFIED:** a row is
`createListRow({icon, label})`. `numerals anywhere in the Build panel: []` at
three viewports. The only price in the game is the Buy control's own label, per
unit of raw material, behind a fold — and its quantity resets on a change of
*material*, not of row, so `Chair` after `Dining Table` reads *"Buy 3 × Wood
Plank · 195"* under a 65 chair.

**D4. Why twenty-two prisoners stand on one tile: two rules, two owners.**
`the-standing-crowd`. **✅ RE-VERIFIED both.** A room's destination is always
`instance.anchorTile` — one tile per room, so everyone going to a room goes to
one point. And `NEW_PRISON_ORIGIN_TILE` is `{x:16,y:16}` while
`deriveDefaultSecuritySectorPostTile` independently derives (16,16) — whose own
docblock already says *"the post tile is where a homeless population
accumulates."* **It starts at two prisoners**, with a bed each and nobody
waiting, which kills the framing that a fix should "fan out when a tile gets
crowded": the destination is wrong when there is no crowd. **Cost:** sixteen of
twenty-two prisoners permanently inert (`phase=idle action=NONE` after ten
in-game days), named on screen only as *"16 with no bed"*.

**D5. Take every bed away and nobody moves — and they go on sleeping.** **✅
RE-VERIFIED:** the own-accommodation path resolves the stored instance and
re-checks no gate. So the tile is not "the room"; it is the last place an arrival
was written.

---

## 3. What this game does well, with the numbers

Five empty categories, each backed by the measurement that establishes it. Three
of them refute a premise of the brief that produced them.

**The rooms work.** `the-rooms-nobody-builds`: hygiene **0% → 90%** two days
after the shower opened, recreation **0% → 93%** two days after the yard. A
four-room prison ends with every need above 60% and every prisoner at `Minimal`
risk against a one-cell prison at `Hygiene 29%` and falling. `room.yard` was
placed for the first time in this repository's history — three times, all
accepted on attempt 1.

**The day fills up completely.** `the-empty-work-block`, with the paired
counterfactual the previous tester named as its own weakest link:

| | no work rooms | with kitchen, laundry, classroom |
| --- | --- | --- |
| `free-association` inside the work blocks | **54 of 56 · 96%** | **0 of 48 · 0%** |
| `free-association` across the whole day | **62 · 45.6%** | **4 · 3.6%** |

All six rooms accepted on the first designation attempt.

**The descent into insolvency is drawn properly.** `the-money-runs-out`: three
tones at −870, −2,070 and −2,500, three different **true** sentences, and the
same three in reverse on the way up. The half of the range that is instrumented
is instrumented well.

**Contraband tells you honestly when it fires.** Chip `2 · CONTRABAND · Tool` at
`warning`, a band sentence, and a dismissible row aggregating repeats as
`2× Day 15` inside a bounded, reload-surviving log that is honest about mixed
hauls.

**The Buy control is the model for the rest of the game, and a tester offered it
as such.** It produces **no refusal at all**: `aria-disabled="true"` plus *"Not
enough money — you need 133,815 more."* — present tense, specific, recomputed,
**where the hand already is**.

---

## 4. Not defects — recorded so they are not mistaken for findings

- **A player cannot order a search** (B3) — ADR 0073's deliberate Option A.
- **The Regime tab being read-only** (B4) — no command exists to make it
  otherwise; this is unbuilt, not broken.
- **The kitchen producing nothing.** `item.food-ration`, `item.clean-linen`,
  `item.dirty-linen` and `item.waste` have a catalogue row, a locale name and no
  other occurrence in `src/`. The catalogue says the kitchen supplies nothing
  **deliberately**. Decided, deliberate and unbuilt.
- **`Association` having no effect** — the catalogue's own docblock explains that
  a dedicated association room is content this catalogue does not have and a
  player cannot yet zone.
- **The informant tip having no producer** (#573, re-verified live: `.report(`
  has one call site and `reportInformantTip` has **no caller**, which the code
  says of itself in three places). But the *other* contraband term is live —
  severity feeds assault scoring and is a hard precondition of an escape.

---

## 5. Old issues re-checked rather than re-quoted

Testers were told to check before reporting, and it changed six answers:

- **#912 — fixed.** The 09-04 finding that said otherwise was a shared-class-name
  misread.
- **#641 — stale.** The treasury no longer stops at 40; the Buy press stops at
  −1,160. Its point survives: `judgeAffordability` has exactly two callers and
  `PlaceBuildOrder` is not one.
- **#890 — stale.** **✅ RE-VERIFIED:** the unmet-need withholding constant is
  **`0`**, so every day boundary closes on a full `300 × residents`.
- **#595 — the number is wrong.** Nine dead rooms is **seven** at v0.0.471;
  delivery-bay and storage-room gained real readers.
- **#573 — true, and incomplete in both directions** (above).
- **#794 — one of its four claims is false** since 2026-09-02 (B1).
- **#902 — closed, and the problem stands**, its fix reverted before merge.

---

## 6. What nobody has reached

- **Scale.** Four separate testers named it. A tester is on it now and is not in
  this report. ADR 0062's room contention has still never fired in a playtest.
- **Whether searching changes anything measurable** — one tester looked and
  **found no measurable difference, and says so** rather than claiming one.
- **A real touch device**, `isMobile`, any interface scale but 100%.
- **Whether the minimap's target survives the world growing** — named as the
  first thing the next camera pass should run.
- **The `git log -S` dating** the workflow asks for: this container's clone is
  **shallow**, so it is UNKNOWN by construction, and testers said so instead of
  guessing dates.

---

## 7. The weakest claims, named by the testers themselves

| tester | its weakest claim | what would overturn it |
| --- | --- | --- |
| `are-the-fixes-real` | that a 22-actor tile "reads as two figures" to a person — the arithmetic is solid, the reading is not a measurement | a programmatic silhouette count, or the same tile at 200% zoom |
| `what-the-game-tells-you` | that a player reads a dated all-clear row as a claim about *now* | someone shown the column cold saying "that all-clear is about Day 4" |
| `the-rooms-nobody-builds` | "the canteen is a no-op" — four prisoners, three days, no counterfactual | a twelve-prisoner paired run with hunger sampled inside the meal blocks |
| `the-empty-work-block` | "both prisons earned exactly the same" — partly arithmetic luck | any treasury delta that differs between a working and an idle prison |
| `contraband` | that Release on a searching guard is unreachable — three attempts, **all at ×4** | one run at ×1, where the window is four times as wide |
| `getting-lost` | that a player acts on the sentence rather than on the `pointer` cursor | a session with a person in front of it |
| `the-money-runs-out` | that the floor sentence "lands wrong" on an earning prison | somebody reading it at the floor and correctly concluding "cut the payroll" |
| `the-build-flow` | eleven seconds as a general figure — one run, pointer parked off canvas | any run where an incidental repaint shortens it |
| `the-standing-crowd` | that the sixteen inert prisoners are what tips the prison into a riot | the same prison with beds for all twenty-two, still rioting |
| `the-hud-a-player-reads` | that two never-changing regions are "spending pixels" — a judgement on top of a measurement | a player observed returning to either and getting something |

---

## 8. What the testers corrected — in their briefs, in the record, and in
themselves

This is the part that makes the rest usable, and it is worth its own section.

- **Three briefs were refuted by the testers who received them.** The pending
  room rectangle is **not** cleared on mouse-up at v0.0.475 (it was, three days
  earlier). The "why do they stack" question was **not** open — a record had
  landed one release earlier answering half of it, and the tester took the four
  things *that* record left unreached instead. And the "17% of the viewport"
  figure this coordinator supplied **had no viewport attached**; it is 27.4% at
  900×600 and 7.1% at 1920×1080.
- **A previous round's headline was overturned with exactly the evidence that
  round had named as decisive.** `2026-09-04-can-i-see-my-prison.md` measured 400
  consecutive keyframes with every velocity zero and wrote that one non-zero
  velocity would overturn it. `the-standing-crowd` found **ten**, in 52,879
  samples — and then explained why the earlier reading was right about its own
  window: six walks are ~12 frames, and that window opened 18,000 ticks after the
  last one.
- **Three instrument faults were found by testers in their own instruments**,
  each of which would have produced confident false numbers: a census channel
  holding the **wrong worker** (a new one is created per prison); a reply read
  off a **guessed envelope path**, which threw nothing and made a nine-actor
  prison report no actors at all; and a need figure read one level too shallow,
  printing a confident `0%` for every prisoner beside a HUD reading 61%.
- **One tester corrected its own first hypothesis in public**: `touch-action` is
  not what stops a flick, the catalogues do scroll by finger, and the finding is
  geometry rather than a wall.
- **Documentation rot found in passing:** `PRISONER_OPERATIONS.md` names a
  constant, `STARTING_ORIGIN_TILE`, that **does not exist in the tree and that no
  reachable commit introduced**; and the catalogue-height token justifies its
  value by saying the buildable registry *"has two entries"* — it has 21.

---

## 9. Method, and what it cost

Two testers at a time, on **Opus 5**, each in its own git worktree cut from a
freshly fetched `origin/main`, on its own branch, its own Playwright port and its
own scratchpad subdirectory. An hourly routine counts what is running and tops
the round back up; when two are playing it does nothing and says one sentence.

**The model choice was made on the evidence of the first round and these rounds
confirmed it.** Everything in §8 — the self-caught instrument faults, the refuted
briefs, the overturned headline — is the behaviour a cheaper model does not
reliably produce, and this repository's own contract says it has paid hours for
confident false findings.

**Two testers were lost to API session limits mid-run**, both after building
their instrument and before gathering evidence. Nothing was lost: their
instruments were committed and pushed, the coordinator committed what was left in
their worktrees, and both questions were relaunched on the newest `main` with
instructions to continue rather than rebuild. **Two concurrent Opus playtests
exhaust the session limit in roughly two hours**, so "continuous" in practice
means two playing, then a stall until reset — the trigger absorbs it.

**One coordinator error, recorded because the rule exists for a reason:** a
`git merge origin/main` was run with its output silenced, hit a conflict, and the
`&&` guard after it quietly skipped the failure. The push that followed pushed an
earlier commit and left the tree mid-merge. A stop hook caught it; it was
resolved keeping every row, and the practice of silencing merge output has been
dropped.

**The rounds produced ten records and ten re-runnable instruments, and changed
nothing under `src/`.**

---

## 10. The records

| tester | question | record |
| --- | --- | --- |
| `are-the-fixes-real` | do players experience the six fixes, or did they stop at the code? | [2026-09-04 are the fixes real](./2026-09-04-are-the-fixes-real.md) |
| `the-hud-a-player-reads` | which of a player's questions does the HUD answer, and what should it be instead? | [2026-09-04 the HUD a player reads](./2026-09-04-the-hud-a-player-reads.md) |
| `the-standing-crowd` | why does the simulation put every prisoner on one tile? | [2026-09-04 the standing crowd](./2026-09-04-the-standing-crowd.md) |
| `the-rooms-nobody-builds` | build the second, third and fourth room — does serving a need do anything visible? | [2026-09-04 the rooms nobody builds](./2026-09-04-the-rooms-nobody-builds.md) |
| `what-the-game-tells-you` | over a whole session, what does the game say, and is any of it still true? | [2026-09-04 what the game tells you](./2026-09-04-what-the-game-tells-you.md) |
| `the-empty-work-block` | 42% of a prisoner's day is a do-nothing action. Build the rooms that would fill it | [2026-09-05 the empty work block](./2026-09-05-the-empty-work-block.md) |
| `getting-lost` | can a player get lost, and does anything bring them back? | [2026-09-05 getting lost](./2026-09-05-getting-lost.md) |
| `the-money-runs-out` | can a prison fail on money, and is failing legible? | [2026-09-05 the money runs out](./2026-09-05-the-money-runs-out.md) |
| `contraband` | a whole subsystem nobody had played | [2026-09-05 contraband](./2026-09-05-contraband.md) |
| `the-build-flow` | play the primary verb end to end, then design it from the measurements | [2026-09-05 the build flow](./2026-09-05-the-build-flow.md) |

---

## 11. What the coordinator recommends, in one list

Not decisions. Balance and the player-visible promise are the owner's under
`AGENTS.md`; this is the order the evidence supports.

1. **A1 first — it is a live false sentence over a money-shaped press**, the
   cheapest thing here to close, and it needs **no new string**.
2. **A2, because it is the whole pattern in one field**: the game already
   computes what is wrong with the prison and drops it at the boundary. Fixing it
   would give the band something true to say, which is what makes C1–C5 tolerable.
3. **A4, because it is felt on every single build** and building is the game's
   primary verb — eleven seconds of dead screen at its best moment.
4. **A3 and C6 together**: the money readout is silent while a player can still
   act and loud only once they cannot, and the one decisive corrective action
   reads as having done nothing.
5. **A5, because it is the same defect as the last round's A1 on a second
   subsystem** — a panel saying `Covered` at a number that disables a whole
   system. Worth asking whether the pattern has a third instance.
6. **B1, which is a one-line change to a sentence that already exists**, and
   turns "I cannot find my prison" into one press.
7. **D3 and D1 together** — the catalogue prices nothing and shows two rows of
   twenty-one — and note that D2 means **part of the fix is already built and
   merely not the default**.
8. **C7 is the roadmap question and not a bug list.** A prison in trouble looks
   62% like an empty one. Everything else here is a symptom of that.
