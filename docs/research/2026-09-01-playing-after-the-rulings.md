# Playtest: the six changes of 2026-09-01 — the alerts log is no longer cut, and gives a 109-character sentence 88 pixels

**Date:** 2026-09-01
**Branch played:** `playtest/after-rulings-18-25`, cut from `origin/main` at
**v0.0.305** (`8185243c`), the release commit that carries the last of the six
merges under test — [#723](https://github.com/matmaxalez/lockstate/pull/723),
[#726](https://github.com/matmaxalez/lockstate/pull/726),
[#731](https://github.com/matmaxalez/lockstate/pull/731),
[#729](https://github.com/matmaxalez/lockstate/pull/729) and
[#732](https://github.com/matmaxalez/lockstate/pull/732). The branch adds one
file under `tests/browser/` and this record. **It changes nothing under
`src/`** — `git diff --stat 8185243c..HEAD -- src/` is empty.

**Two commits were played, and the difference between them is the instrument
file.** Acts 1 through 5b ran on `8185243c` itself; act 6 ran on `99072ea`,
this branch's first commit, which adds
`tests/browser/playtest-2026-09-01-after-the-rulings.playtest.ts` and nothing
else. The version line the strip prints is how that is known rather than
assumed: every act up to 5b logged `v0.0.305 · 8185243` and act 6 logged
`v0.0.305 · 99072ea`.

**The brief, in the owner's words:** *"znajdź bugi i błędy grając"* — find
defects **by playing** — desktop viewport first, mobile a later pass. The six
changes above landed within hours of each other and **not one of them carried
browser evidence**; three of the five commit messages say so in as many words
(#731: *"No browser evidence was taken."*).

**Reproduction.** `tests/browser/playtest-2026-09-01-after-the-rulings.playtest.ts`,
one act at a time:

```
LOCKSTATE_BROWSER_TEST_PORT=5301 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-01-after-the-rulings.playtest.ts -g "act 1" --reporter=line
```

Nothing in CI collects it: `tests/browser/playwright.config.ts` matches
`/.*\.spec\.ts$/` and only `playwright.playtest.config.ts` matches
`.playtest.ts`. Every act drives `index.html` + `src/main.ts` in real Chromium
through a `Worker` tee, with real mouse gestures.

**LFS.** `git lfs checkout` was run in the worktree first — 62 objects, 93 MB —
and confirmed with `file public/assets/actors/actor.guard.base.idle.png`
returning `PNG image data, 260 x 3104` where it had returned `ASCII text`.
`docs/AGENT_WORKFLOW.md` records a playtest that ran green with no actor
sprites at all, which is why this is checked and stated.

**Contention.** `ps -eo etime,args | grep -E "[p]laywright/test/cli|[v]itest"`
returned **nothing** before the first run, at a one-minute load average of 0.42
on a container three minutes old, and no other agent held the browser at any
point in this pass. Acts were run **one at a time, never concurrently**, so no
figure here is a contended measurement. Two figures below are wall-clock
durations and both are marked as needing an idle machine.

## Claim tiers

- **MEASURED** — this pass ran it in a browser; the output is quoted verbatim.
- **VERIFIED, read** — a file was opened at the line cited and quoted.
- **REASONED** — follows from MEASURED or VERIFIED facts, and says which.
- **UNKNOWN** — could not be established, and named as such.

## The acts

| act | what it played | viewport | result |
| --- | --- | --- | --- |
| 1 | six walls drawn in a deliberately scrambled order, then the crew watched | 1280x800 | `1 passed (1.4m)` |
| 2 | 25,000 spent down to exactly −2,500, then one purchase and one hire past it | 1280x800 | `1 passed (45.4s)` |
| 3 | the same descent with planks only, then four walls with no brick in store | 1280x800 | `1 passed (59.7s)` |
| 4 | a built prison, three guards, a save across a deployment, a reload | 1280x800 | `1 passed (4.2m)` |
| 5 | the longest refusal sentence in the alerts log, and a clipping sweep of every tab | 1280x720 **and** 900x600 | `1 passed (1.3m)` |
| 5b | the same row measured line box by line box | 1920x1080, 1280x800, 1280x720, 900x600 | `1 passed (1.8m)` |
| 6 | the first half hour: twelve prisoners, four guards, three in-game days, a reload, one more day | 1280x800 | `1 passed (5.3m)` |

---

# Part A — the five claims the brief named

## 1. #731 / ADR 0082 holds on the real page, and the Queued fold offers the three drawn first

**MEASURED, act 1, 1280x800.** Six single-segment brick walls were drawn on the
north edges of six tiles, with the mouse, in an order chosen so that no spatial
sort produces it — not left to right, not top to bottom, not by distance from
anything:

```
drawn in this order: [{"tile":"18,13","commands":["PlaceBuildOrder 18,13 north"]},
                      {"tile":"11,16","commands":["PlaceBuildOrder 11,16 north"]},
                      {"tile":"15,14","commands":["PlaceBuildOrder 15,14 north"]},
                      {"tile":"19,15","commands":["PlaceBuildOrder 19,15 north"]},
                      {"tile":"12,13","commands":["PlaceBuildOrder 12,13 north"]},
                      {"tile":"16,16","commands":["PlaceBuildOrder 16,16 north"]}]
```

The clock was **paused** for all six (tick 646), so nothing had been started
when the panel was read. The Queued fold — collapsed on arrival, `data-collapsed
= "true"` — then read:

```
queue count reads "6 waiting · 0 being built"
the fold offers 3 row(s): [{"label":"Brick wall · 18, 13 · North","state":"approved","order":"order-59a4c603-…"},
                           {"label":"Brick wall · 11, 16 · North","state":"approved","order":"order-7179055e-…"},
                           {"label":"Brick wall · 15, 14 · North","state":"approved","order":"order-6d3c9bc5-…"}]
and behind them: "and 3 more behind these — undo takes back a whole run."
panel data-queued = 6
```

The three rows a player is offered to cancel are **the first three drawn, in
that order**. Then the clock was started at ×1 and the head of the queue
sampled every 500 ms by `data-state`:

```
tick 677: the crew is on "Brick wall · 18, 13 · North"
tick 749: the crew is on "Brick wall · 11, 16 · North"
tick 800: the crew is on "Brick wall · 15, 14 · North"
tick 856: the crew is on "Brick wall · 19, 15 · North"
tick 927: the crew is on "Brick wall · 12, 13 · North"
tick 983: the crew is on "Brick wall · 16, 16 · North"
```

Six orders executed in exactly the order they were placed. **A uuid sort would
have matched that by chance once in 720.** The Build panel's own sentence — *"in
the order the crew will reach them"* — is now a statement a player can check on
screen, and it checks out.

**The note #731 corrected is also confirmed.** `playtest-into-the-lock.playtest.ts`
had said the three cancellable rows were *"ordered by ascending order id, which
is a uuid"*; the diff replaced that with placement order, and the rows above are
that correction measured rather than asserted. The **count** of rows is three
either way (`BUILD_QUEUE_ROW_LIMIT`, `src/ui/hud/build-panel.ts:558`); what
changed is *which* three, and it is now the three drawn first.

**What this does not cover.** One act, one session, six orders, all of them
`wall-brick` and all `PlaceBuildOrder`. It says nothing about the `PlaceObject`
producer #731 also stamps, and nothing about ordering across a save — both of
which are pinned headlessly in `tests/integration/construction-placement-order.test.ts`
and neither of which this pass re-measured.

## 2. #723 ruling 18 holds, and the badge reads `0 left` at exactly −2,500

**MEASURED, act 2, 1280x800, empty prison.** No prisoners, so the state pays
nothing at a day boundary; no staff, so payroll takes nothing; no build orders,
so the just-in-time route buys nothing. Every move of the balance below is a
purchase this act made. The FUNDS chip was read after each:

| balance | chip value | chip `data-tone` | badge text | badge `data-tone` |
| --- | --- | --- | --- | --- |
| 25,000 | `25,000` | *none* | *no badge* | — |
| 13,000 | `13,000` | *none* | *no badge* | — |
| 1,000 | `1,000` | *none* | *no badge* | — |
| −2,240 | `-2,240` | `warning` | `260 left` | `warning` |
| −2,500 | `-2,500` | `danger` | `0 left` | `danger` |

The floor was reached **exactly**, by arithmetic chosen for it: 681 bricks at 40
plus 4 planks at 65 is 27,500, and 25,000 − 27,500 = −2,500 =
`TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS`. Every one of ruling 18's four clauses is
therefore confirmed on the assembled page: nothing while solvent, `{remaining}
left` while negative, `warning` while there is room, `danger` at the floor, and
`0 left` at the floor itself. The number goes through the strip's own `Intl`
formatter — `260 left`, not `260`, beside a chip reading `-2,240`.

**One press past the floor, and the host refuses it before anything is sent.**

```
one brick past the floor: commands the host sent = []
the band under the control reads "Nothing was bought — that would go past what the state will carry."
one hire past the floor:  commands the host sent = []
the band under the control reads "Nobody was hired — that would go past what the state will carry."
```

Both are ruling 18's authored sentences, verbatim. The console carries the
diagnostic half, which never reaches the player:
`HostRefusalError: The last reported balance of -2500 cannot cover 40.` at
`src/main.ts:2261`, and `… cannot cover 80.` at `src/main.ts:2446`.

**A measurement that qualifies #723's own note, rather than contradicting it.**
The commit says *"At either end the row still overflows at 1280, so ruling 21
alone does not put FUNDS and EARNED TODAY back on screen."* On this prison it
does not overflow: `.hud-strip__metrics` measured `scrollWidth 1256` in
`clientWidth 1256` at 1280x800, and the FUNDS chip's whole box lay inside the
row's visible box, at every one of the seven readings above. That is **an empty
prison**, whose nine chips all read short values and whose coverage badge reads
`Covered`.

**On a populated one it overflows, and act 6 measured by how much.** The same
selector at the same viewport, on a prison of twelve with four guards:
`scrollWidth 1320` in `clientWidth 1256` on in-game day 4, and **`scrollWidth
1389` in `clientWidth 1256`** on day 7 once the `8 with no bed` and `Currency`
badges had appeared — **133px of the row is off-screen behind `overflow-x: auto`
with the scrollbar suppressed.** #723's note is therefore confirmed rather than
contradicted, and D9 below carries the figure. The FUNDS chip itself stayed
fully inside the visible box at every reading in both acts, so ruling 18's badge
is on screen where it matters.

## 3. #729 ruling 23 holds for the purchase half, and both halves were seen in one session

**MEASURED, act 3, 1280x800.** The discriminator between the two producers is
not a guess — it is a difference this pass measured:

- A **host** refusal writes `.hud__refusal` and leaves the alerts log untouched.
  Act 2, at the floor, twice: the band carried the sentence and
  `.hud-alerts__list` still read `["No active alerts"]` after both refusals.
- A **worker** refusal writes both.

Act 3 spent 27,365 on planks alone — leaving **no brick in the material store**
and 135 of facility left — and then drew four wall segments. Nothing on the host
thread pre-checks a build order against the treasury, because the charge is not
known until the worker prices the materials, so this is the worker's refusal or
nothing:

```
alerts before four unaffordable walls: ["Nothing was removed — there is no object on that tile, …Warning"]
alerts after:  ["Nothing was bought — that would go past what the state will carry.Warning"]
the band under the control reads "Nothing was bought — that would go past what the state will carry."
queue: "QUEUED | 4 waiting · 0 being built"
shortfall note: "Waiting for 320 to buy materials."
```

The worker's `purchase.insufficient-funds` and the host's
`hud.refusal.purchase-materials-past-floor` are the same sentence on screen.
Ruling 23's purchase half is confirmed by play, on the just-in-time route the
commit names — *"with no press on Buy at all"* — which is exactly how it
happened here.

**The hire half could not be produced, and this is the honest limit of the act.**
The route tried was the stale pre-check: the host tests against a balance that
is at most one status publication old, so two presses inside that window should
both be waved through. Two `click()`s back to back produced **one**
`HireStaff` on the wire; the second was refused by the host, which had already
seen −2,445 (`HostRefusalError: The last reported balance of -2445 cannot cover
80.`). `AsyncActionGate` is single-slot (`src/ui/primitives/async-action.ts:86`,
`if (this.active !== undefined) return 'refused-busy'`), so a second press
during the first does not dispatch at all, and by the time it can, the balance
has been republished.

**REASONED, from those two facts:** through the Hire control, the host's
pre-check and the single-slot gate together appear to leave the worker's
`hire.insufficient-funds` no window. Whether some other producer reaches it is
**UNKNOWN** — this pass did not enumerate them, and "I could not reach it in one
act" is not "it is unreachable". Recorded as finding **D3** below, as a question
rather than a defect.

## 4. #732 ruling 24 — `Returning` could not be produced by playing, and the reason is measurable

**MEASURED, act 4, 1280x800.** A built prison: a 6x6 cell zoned with the mouse,
three beds, a toilet, three prisoners admitted, then three guards hired with the
clock stopped. Coverage read *"0 of 1 · Unguarded · Nobody is on duty. Hire 1 to
cover this population."* The clock was then started at ×1 and
`.hud-staff__roster .hud-staff__held-row` polled **every 80 ms for 90 seconds**
across about 1,800 ticks. **No sample count is claimed for this act** — the
loop's iterations were not counted, and a figure derived from 90 s ÷ 80 ms
would ignore the `evaluate` round trip in each one. Act 6 counts its samples;
this one only ran:

```
first tick at which a row said Travelling: -1
paused at tick 7588; rows = ["Guard · On Post","Guard · Unassigned","Guard · Unassigned"]
```

**Not once did a roster row say `Travelling`.** The save that followed was
therefore a save of a settled prison, and after a real page navigation and
*Load* the row read:

```
AFTER LOAD, tick …: rows = ["Guard · On Post","Guard · Unassigned","Guard · Unassigned"]
coverage summary: "GUARD COVERAGE | 1 of 1 | Covered | This prison has the guards it asks for."
```

That is a **useful negative control and nothing more**: `displayedDeploymentPhase`
does not invent `Returning` for a guard that really is on its post. The claim
the brief asked about — save mid-journey, reload, read `Returning`, keep playing,
watch it settle on `On Post` — **is not confirmed, and this pass could not
confirm it.**

**VERIFIED, read, for why the window is so small.**
`DeploymentSystem.continueDeploymentTravel` ends a deployment with

```ts
    const postTile = this.sectors.requireDefinition(sectorId).postTile;
    this.guards.setTile(guardId, postTile);
    this.guards.setDeploymentPhase(guardId, 'on-post');
```

(`src/simulation/security/deployment-system.ts:242-244`). The guard is **placed
on the post tile in one step** — the deployment is not a walk across tiles at
all — so `'travelling'` spans exactly one navigation round trip: the tick that
calls `requestRoute` and the tick that finds a result. And the roster the player
reads is pulled on the counts publication, `refreshStaffRoster()` at
`src/main.ts:1801`, about twice a second.

**REASONED, from those two:** the binding constraint is not how fast a test
polls, it is the **pull cadence**. At ×1 a tick is 50 ms and at ×4 it is 12.5 ms,
so a one-or-two-tick `'travelling'` phase is 12–100 ms of wall time against a
projection that is re-read about twice a second. Most deployments therefore
happen entirely between two reads, and a player pressing *Save now* inside that
window is not something this pass could arrange.

**MEASURED, act 6, three in-game days.** The same question asked over a whole
session instead of one window. Every word any roster row said, across 95
samples of a four-guard prison running from in-game day 4 to day 7 at ×4:

```
{"On Post":{"first":1,"samples":190},"Unassigned":{"first":1,"samples":76},"On Search":{"first":9,"samples":19}}
```

`On Search` appears — searches and incidents really do take guards off their
posts, 19 row-samples of it — so the roster is not simply frozen. **`Travelling`
never appears, and neither does `Returning`.** Act 6 then hunted deliberately
for a guard off its post before saving, caught one (`["Guard · On Post","Guard ·
On Post","Guard · On Search"]`), saved, reloaded and loaded — and the row came
back `Unassigned`:

```
caught a guard off post: ["Guard · On Post","Guard · On Post","Guard · On Search"]
roster immediately after load: ["Guard · On Post","Guard · On Post","Guard · Unassigned"]
```

**VERIFIED, read**, for why that route cannot produce the word either:
`GuardRoster.loadSnapshot` rewrites **only** `'travelling'` —
`if (restored.deploymentPhase === 'travelling') { … restored.deploymentPhase =
restored.sectorId === undefined ? 'unassigned' : 'on-post'; }`
(`src/simulation/security/guard-roster.ts:246-248`). An `'on-search'` guard is
not touched by it, so the only state `displayedDeploymentPhase` can call
`Returning` is one saved inside that 12–100 ms window.

**What that means for #732 is a question, not a verdict.** The change is right
where it is reachable — `walkBackToPost` exists, its boundary with `PatrolSystem`
is pinned, and the negative control above holds. What is not established is that
a player will ever see either word. Recorded as **D2**.

## 5. #726 / #720 — the sentences are whole, and 88 pixels wide

**MEASURED, acts 5 and 5b.** The longest sentence in the refusal namespace is
`hud.alert.refusal.zone.not-enclosed` at **109 characters**, and it is two mouse
gestures away: arm the cell tool over open ground and confirm. It arrived
complete, at both viewports the brief named:

```
1280x720: the alerts log holds ["The room was not zoned — this room type must be enclosed,
                                 and the area you drew is open on at least one side.Warning"]
900x600:  the alerts log holds ["The room was not zoned — this room type must be enclosed,
                                 and the area you drew is open on at least one side.Warning"]
```

and the clipping probe reported **nothing** for `.hud-alerts__list .ui-row__label`
at either. **#726 holds: the sentence is no longer cut.** `#720`'s
`Contraban…` is gone.

**What it costs, measured line box by line box** (act 5b, `Range.getClientRects()`
over the label's own contents — `line-height` computes to `normal`, so
`scrollHeight` arithmetic returns `NaN` and act 5 duly printed `labelLines: -1`):

| viewport | row | label | badge | lines | widest line | list box |
| --- | --- | --- | --- | --- | --- | --- |
| 1920x1080 | 200x181 | **88x165** | 64x20 | **11** | 84px | 200x181 of 200x181 |
| 1280x800 | 200x181 | **88x165** | 64x20 | **11** | 84px | 200x181 of 200x181 |
| 1280x720 | 200x181 | **88x165** | 64x20 | **11** | 84px | 200x181 of 200x181 |
| 900x600 | 200x181 | **88x165** | 64x20 | **11** | 84px | **200x137 of 200x181** |

Font size 13px. So: 109 rendered characters get **88 pixels and eleven line
boxes**, about ten characters a line, and the word `Warning` beside it gets 64 —
73% as much horizontal room as the sentence. The row is 200px wide at **every**
viewport including 1920x1080, because the corner is a fixed-width region. And at
900x600 a log holding **one** alert already overflows its own list: 181px of row
in a 137px box, 44px — about three of the eleven lines — below the fold, behind
`overflow-y: auto` with no scrollbar drawn.

**REASONED, from act 6 and act 5b together.** Act 6's prison reached **eight
alert rows** by in-game day 7 with no input after the build. One 109-character
row measures 181px tall; the list's box is 181px. Eight rows of incident history
therefore live in a window that fits about one of them, behind an `auto`
scrollbar the stylesheet suppresses. The eight-row total height was **not**
measured — rows of different lengths are different heights — so that sentence is
arithmetic over one measured row and is marked as such.

**The width did not change; only the wrapping did — and that is the sharpest
way to put this finding.**
`docs/research/2026-08-31-playing-the-twelve.md` measured the same label at
**88px** the day before #726 and called it *"ellipsised to 88px of a needed
538"*. This pass measures it at **88px** after #726. The fix turned one cut line
into eleven whole ones inside the same column: the sentence went from
unreadable to readable-but-slivered, and the column it lives in is untouched.

This is finding **D1**, and it is the finding of the pass. #726 did what it
said; what it revealed is that the log was never given enough width for a
sentence.

## 6. The first half hour, played straight through

**MEASURED, act 6, 1280x800, `1 passed (5.3m)`.** A 6x6 cell built with the
mouse, four beds, a toilet, **twelve** prisoners admitted, **four** guards
hired, three in-game days run at ×4, then a save, a real page navigation, a
*Load*, and one more day. Every panel was read at day 1, at day 4, and after the
reload.

**The economy is steady and small.** Three unbroken day boundaries, each one:

| boundary | tick | treasury | delta | accrued just before | wage bill | unpaid |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 9,600 | 23,070 → 23,950 | **+880** | 1,196 | 320 | 0 |
| 2 | 12,000 | 23,950 → 24,830 | **+880** | 1,199 | 320 | 0 |
| 3 | 14,400 | 24,830 → 25,710 | **+880** | 1,182 | 320 | 0 |

Twelve prisoners at 100 a prisoner-day is 1,200; four guards at 80 is 320;
1,200 − 320 = 880, three times over, with nothing ever unpaid. The boundary
*after* the reload paid **+720** instead — the save landed 80% through a day, so
only the remainder of that day's accrual was still to come. Stated as
arithmetic, not as a defect.

**Nothing was clipped at 1280x800.** The sweep across all five tabs returned
`[]` at day 1, at day 4 and after the reload. D5, D6 and D7 below are findings
about 1280x720 and 900x600, not about this width.

**The reload kept everything.** Of the twelve counters compared before the save
and after the load, exactly one differed:

```
what the reload changed: ["stateIncomeAccruedTodayMinorUnits: 797 -> 835"]
```

and the sample it was compared against was taken before the clock was paused, so
the day had accrued a little more by the time the snapshot was written. Prisoners,
intake backlog, rooms, capacity, occupants, treasury, wage bill, unpaid wages and
staff all came back identical.

**Two things the reload did not keep**, both recorded below: the alerts log
(**D11**) and the incident claims on two guards — *"ON DUTY | 4 held · 0 free"*
with a row reading `Guard · Incident Response` before the save, *"2 held · 2
free"* and that guard `Unassigned` after it.

**The prison does things on its own.** By day 7 the log held three separate
fights and a contraband find, with no input at all after the build:

```
["A fight has broken out between two prisoners.Warning",
 "The prison is under control again — no incident is still open.Info",
 "Contraband found: Currency.Warning",
 "A fight has broken out between two prisoners.Warning",
 "The prison is under control again — no incident is still open.Info",
 "A fight has broken out between two prisoners.Warning",
 "The prison is under control again — no incident is still open.Info",
 "Nothing was removed — there is no object on that tile, and none being built there.Warning"]
```

**And eight of the twelve had nowhere to sleep for the whole session** — `8 with
no bed` on the strip at day 1, day 4 and day 7, `roomOccupants` pinned at 4
against `prisoners` 12 — with no incident, no unrest counter and no sentence
anywhere naming it beyond that badge. Whether that is a balance decision or a
gap is **UNKNOWN** and is not this pass's to call.

**One line of act 6 is an instrument error and not a finding.** Every reading of
the Overview tab printed `.hud-overview: ABSENT`, because there is no such
class: `grep -rn "hud-overview" src/ui/` returns nothing. The Overview tab's
panels are `.hud-intake` and its siblings. Nothing was measured about that tab.

---

# Part B — what else the prison did

## D1. A 109-character alert is eleven lines in an 88-pixel column, at every desktop width

**MEASURED**, above. **How badly it hurts a player:** the alerts log is where
four of the owner's rulings of 2026-08-31 deliver, and reading one sentence in
it means reading a ten-character-wide sliver eleven lines tall — at 1920x1080 as
much as at 900x600, because the row does not widen. At 900x600 a single alert
does not fit the log at all. It is legible, which #720 was not; it is not
readable at a glance, which is what an alerts log is for.

**What would change my mind:** a measurement showing the 200px row widening on
some viewport this pass did not visit, or a design intent that the corner is
deliberately a narrow ticker. The four widths above are all this pass measured.

## D2. Nothing in an ordinary session was ever seen walking

**MEASURED / VERIFIED**, §4 above. **How badly it hurts a player:** a guard
crossing the prison is one of the few things that would make the world look
alive, and `setTile(guardId, postTile)` skips it. It also means #732's two words
— `Travelling` and `Returning` — label states a player is unlikely to see.
Whether this is a defect or a deliberate stand-in for movement that
`ActorMotion` will later animate is **UNKNOWN** and is the first thing to ask.

## D3. The worker's hire refusal may have no reachable producer through the Hire control

**MEASURED / REASONED**, §3 above. **How badly it hurts a player:** not at all
directly — the player gets the same sentence either way, which is the whole
point of ruling 23. It matters because `hud.alert.refusal.hire.insufficient-funds`
is authored copy, and `AGENTS.md`'s fourth exclusion is about copy with nothing
behind it. Worth an enumeration of `GuardRoster.hire`'s callers rather than
another act of play.

## D4. Each *Admit* press takes about 1.8 seconds to become actionable

**MEASURED, act 4, 1280x800**, and this figure needs an idle machine — it is a
wall-clock duration, taken on a container with no other suite running:

```
admit press durations (ms): [1961,1665,1819]
```

That is how long Playwright waited for `.hud-intake__admit` to be actionable,
which is time a player spends watching a button they have already decided to
press. `docs/research/2026-08-31-playing-the-twelve.md` measured the same
control in its acts 7 and 7b; this is a third reading of it and it has not
improved. Twelve admissions is the better part of half a minute.

## D5. The game's own instruction for drawing a room is painted outside its panel

**MEASURED, act 5.** `.hud-rooms__note` — *"Drag a rectangle across the tiles
this room should cover."*, the only instruction the game gives for the room
gesture — measures `469x13` in a `238x13` box:

- at **1280x720** it is `spilled`: `overflow: visible`, so it is painted 231px
  outside its own box, over whatever is beside it;
- at **900x600** it is `cut`: the same 231px, never painted.

The 2026-08-31 record measured this label spilling at 1280x800 and 1920x1080.
It is still there at two more widths, and at the smaller one it has become
invisible rather than merely misplaced.

## D6. At 1280x720 the Rooms panel hides 219px of itself

**MEASURED, act 5, Rooms tab.** `section.ui-panel.hud-rooms` reports
`scrollWidth 481` in `clientWidth 262` with the overflowing axis `hidden`:
219px of the panel is content the browser never paints, with nothing on screen
to say so. The text the probe caught at the cut edge is the room-type list —
`RoomsCollapseRoom type and areaStaff RoomClassroomCanteenKitchenCellSelectedHold…`.
At 900x600 the panel itself is not cut and only D5's note is, so this is a
1280x720 finding rather than a small-screen one.

## D7. At 900x600 three of the game's instructions are clamped to one line and cut

**MEASURED, act 5.** `hud.css`'s `@media (max-height: 700px)` clamps
`.hud-strip-height` and the panel notes; the cost, at 900x600:

| element | text | cut |
| --- | --- | --- |
| `.hud-build__note` | *"Click a tile edge to place a wall. Drag along it to lay a run. Two fingers, the …"* | 40px of 53 hidden — **three of its four lines** |
| `.hud-staff__note` | *"A released guard stays hired and goes back to the pool."* | 13px of 26 hidden — one of two lines |
| `.ui-section__eyebrow` | *"What to build"* | 28px of 108 hidden, at **1280x720 too** |

The first is how the game explains its central gesture. `staff-panel.ts` names
this clamp and exempts one label from it (`.hud-staff__hire-unassigned`); these
three are not exempted.

## D8. Two mechanics a player meets in the first minutes, recorded because they surprised this pass

**MEASURED.** Neither is called a defect here; both are stated because an agent
reading this record later will otherwise re-derive them.

- **A new prison starts paused.** After *New prison* the strip reads `Speed 1x`
  and `PAUSED` with *Through the day* at `0%` — and **purchases still settle**:
  act 2 moved the treasury from 25,000 to −2,500 across five purchases without
  the clock ever running.
- **A press that lands on a HUD panel places nothing and says nothing.** Act 1's
  first run aimed at six tiles chosen on the grid without checking where they
  fall on a 1280x800 screen. Four were off-viewport or under a panel and
  produced no command at all; the fifth landed on the Build panel's own *Buy*
  control and silently bought sixty more bricks. The act measured two orders
  instead of six and reported success. The instrument now asserts one
  `PlaceBuildOrder` per press for exactly this reason.

## D9. On a populated prison the status strip hides 133 pixels of itself at 1280x800

**MEASURED, act 6.** `.hud-strip__metrics` is `overflow-x: auto` with the
scrollbar suppressed, and on a prison of twelve with four guards it measured
`scrollWidth 1320` in `clientWidth 1256` at in-game day 4 and **`scrollWidth
1389` in `clientWidth 1256`** at day 7, once the `8 with no bed` and `Currency`
badges were on it. On the empty prison of act 2 the same row measured `1256` in
`1256` — it fits exactly, and then every badge the game earns pushes something
off the end. **How badly it hurts a player:** the ninth chip is `Earned today`,
and a scroll region with no scrollbar gives no sign that a chip exists at all.
This is #723's own closing note — *"At either end the row still overflows at
1280"* — measured on the assembled page, and it confirms rather than corrects it.

## D10. The alerts log accumulates identical rows, with no time, no count and no way to dismiss

**MEASURED, act 6.** By in-game day 7 the log held *"A fight has broken out
between two prisoners."* three times and *"The prison is under control again — no
incident is still open."* three times, interleaved, in an eight-row list. Nothing
distinguishes the three: no tick, no in-game time, no *×3*. **How badly it hurts
a player:** three fights and one fight read the same in the only place the game
reports either, and there is no control to clear a row.
`src/ui/simulation-alerts.ts` states plainly that nothing clears a row and that
a dismissal *"would be a main-to-worker message and a piece of simulation state
to hold it, which is a decision rather than a detail"* — so this is a known and
recorded gap, and this record's contribution is the measured cost of it.

## D11. A reload empties the alerts log

**MEASURED, act 6.** Eight rows before the save; `["No active alerts"]` after
the page navigation and *Load*, with the prison otherwise restored counter for
counter. **How badly it hurts a player:** the log is the only record of what the
prison did while they were not looking, and reloading is the ordinary way to
come back to a saved prison. **REASONED**: this follows from the channel being
main-thread session state — the same sentence in `simulation-alerts.ts` that
D10 quotes — so it is a consequence of a recorded decision rather than a
surprise. It is written down because a player will read it as data loss.

---

# Part C — instruments, and the case against a new CI gate

**Kept:** `tests/browser/playtest-2026-09-01-after-the-rulings.playtest.ts`, six
acts. It is an instrument, not a gate, and nothing in CI collects it.

**No `.spec.ts` is proposed by this pass, and each candidate is argued rather
than skipped:**

- **Placement order (#731).** Already pinned where it is cheap and stable:
  `tests/unit/construction-build-queue-projection.test.ts` proves the projection
  orders by `(placementSequence ?? -1, id)` and
  `tests/integration/construction-placement-order.test.ts` proves the stamping,
  the persistence and the post-load continuation. A browser spec would add the
  mouse path and a several-minute build, and would be testing Playwright.
- **`Returning` (#732).** A spec would have to *catch* a 50–100 ms state — the
  definition of a flaky test, and §4 shows 95 counted samples across three
  in-game days missing it. The right
  gate for that decision is headless, over `displayedDeploymentPhase`, which is
  where #732 already put it.
- **The alerts row (#726) at 900x600.** This is the one real gap: #726's own
  `no row is cut off at …` loop in `ui-shell.spec.ts` covers 1280x720, 1280x800
  and 1920x1080 and **not** 900x600, and it runs against the UI harness, whose
  aside slot is empty and which therefore hands the corner a different layout
  from the assembled page. Adding 900x600 to that loop would be one line and
  would pass today — the sentence is not *cut* there, it is *scrolled* — so it
  would pin nothing that is currently at risk. **D1 is a width decision, not a
  clipping one, and it needs the owner before it needs a test.**

---

# Part D — the weakest claim in this record

**It is §4's, and it is the one to attack first.** Two acts, two prisons, about
four in-game days and every roster sample either act took -- 95 of them
counted, in act 6 -- never showed the word `Travelling`, and act 6's deliberate hunt for a guard off its post caught an
`On Search` one whose reload produced `Unassigned` rather than `Returning`. The
code read under it is unambiguous — `setTile(guardId, postTile)` is one line,
and `loadSnapshot` rewrites `'travelling'` and nothing else — but the step from
that to *"a player will never see `Returning`"* is **REASONED, not MEASURED**,
and this pass never produced the state at all. A negative result over a few
hundred samples is not a proof of unreachability.

**What would change my mind:** a single roster sample reading `Travelling` or
`Returning` in ordinary play. One is enough.

**And what this pass did not reach at all:** mobile viewports (375x812 and
below), the keyboard entirely, the Regime tab beyond reading it, escapes,
`Undo`, `Cancel` on a queued order, the *Enter coordinates* route, deliveries
and refunds, and any prison older than in-game day 7. Contraband and incidents
were *observed* in act 6 but nothing was done to or about either. None of that
was played.
