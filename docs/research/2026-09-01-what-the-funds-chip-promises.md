# Playtest: the FUNDS chip promises 1,250 the shop will not take, and payroll walks a prison past two rungs with nothing said

**Date:** 2026-09-01
**Branch played:** `docs/playtest-money-2026-09-01`, cut from `origin/main` at
**v0.0.323** (`109467aa`). The strip's own version line is how the played
commit is known rather than assumed: acts 1 to 4 logged `v0.0.323 · cbee581`
(the branch's first commit, which adds the instrument and nothing else) and
acts 5 and 6 logged `v0.0.323 · 9a64163` (the second, likewise).
`git diff 109467aa..cbee581 -- src/` is empty.

**Surface:** money, deliveries, purchasing and insolvency — the treasury, the
overdraft, the spend classes, the Buy panel, the FUNDS strip chip and what the
game says when a spend is refused.

**The brief, in the owner's words:** *"znajdź bugi i błędy grając"* — find
defects **by playing**. Desktop first; nothing below was measured on a mobile
viewport. The owner's design directive that anything a player must discover by
accident is itself a defect is the standard three of the six findings are
measured against.

**Why now.** The owner's ruling 19 of 2026-08-31 landed this morning as
[#747](https://github.com/matmaxalez/lockstate/pull/747) (`52b5bb1c`), giving
ADR 0017 decision 8's rungs their own thresholds inside the standing overdraft:
deliveries refused below −1,250, construction halted below −2,000, wages unpaid
at the floor of −2,500. **No part of it was ever driven in a browser.** The
previous money playtest
([`2026-09-01-playing-after-the-rulings.md`](./2026-09-01-playing-after-the-rulings.md),
act 2) ran at v0.0.305, three merges earlier, and measured the purchase floor at
−2,500 — which is what it was that morning and is not what it is now.

## Reproduction

`tests/browser/playtest-2026-09-01-money.playtest.ts`, one act at a time:

```
LOCKSTATE_BROWSER_TEST_PORT=5311 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-01-money.playtest.ts -g "act 1" --reporter=line
```

Nothing in CI collects it: `tests/browser/playwright.config.ts` matches
`/.*\.spec\.ts$/` and only `playwright.playtest.config.ts` matches
`.playtest.ts` — which
`tests/foundation/browser-suite-partition-contract.test.ts` is the reason for.
Every act drives `index.html` + `src/main.ts` in real Chromium at 1280x800,
through a `Worker` tee, with real mouse gestures on the real controls.

**LFS.** `git lfs checkout` was run in the worktree first — 62 objects, 93 MB —
and confirmed with `file public/assets/actors/actor.guard.base.idle.png`
returning `PNG image data, 260 x 3104` where a fresh worktree returns
`ASCII text`. `docs/AGENT_WORKFLOW.md` records a playtest that ran green with no
actor sprites at all, which is why this is checked and stated.

**Contention.** `ps -eo etime,args | grep -E "[p]laywright/test/cli|[v]itest"`
returned nothing before the first run, at a one-minute load average of 1.57.
Acts were run **one at a time, never concurrently**. Two wall-clock durations
appear below and both are marked as such; no other figure here is a timing.

## The prices every number below is built from

| | | source |
| --- | --- | --- |
| opening grant | 25,000 | `TREASURY_STARTING_BALANCE_MINOR_UNITS` |
| overdraft floor | −2,500 | `src/simulation/economy/treasury.ts:293` (one tenth of the grant) |
| deliveries rung | −1,250 | `src/simulation/economy/treasury.ts:409` |
| construction rung | −2,000 | `src/simulation/economy/treasury.ts:421` |
| wages rung | `-Infinity`, clamping to the floor | `src/simulation/economy/treasury.ts:447-452` |
| a brick | 40 | `src/content/procurement-catalog.ts:100` |
| a wood plank | 65 | `src/content/procurement-catalog.ts:101` |
| a brick wall segment | 2 bricks = 80 | `src/simulation/construction/definition.ts:89` |
| a guard, to hire | 80 | `wageBand.minPerDay`, `src/content/staff-role-catalog.ts:150` |

Every constant the brief named was checked against the source rather than
trusted, and every one is as the brief stated.

## Claim tiers

- **MEASURED** — this pass ran it in a browser; the output is quoted verbatim.
- **VERIFIED, read** — a file was opened at the line cited and quoted.
- **REASONED** — follows from MEASURED or VERIFIED facts, and says which.
- **UNKNOWN** — could not be established, and named as such.

## The acts

| act | what it played | result |
| --- | --- | --- |
| 1 | 403 planks down to −1,195, then the cheapest thing in the shop, twice, and a hire | `1 passed (30.0s)` |
| 2 | the same balance spent the other way: fourteen wall segments drawn with the mouse | `1 passed (1.4m)` |
| 3 | three deliveries bought, one cancelled | `1 passed (32.9s)` |
| 4 | the Buy control read at four balances, and a quantity of 10,000 | `1 passed (37.6s)` |
| 5 | twelve guards hired, then two day boundaries with no prisoners | `1 passed (1.5m)` |
| 6 | seven things typed into the quantity field, and five Buy presses in a burst | `1 passed (40.4s)` |

---

## Independent re-verification (second pass, same day)

This document was drafted by a session killed mid-sentence, mid-write-up, and
picked up by a second session per this branch's brief: *"do not trust this
summary about the branch's state ... re-run it yourself before you build on
it."* Every act above was re-run in this pass, one at a time, after merging
`origin/main` (v0.0.323 → v0.0.325; the merge touched none of `src/ui/hud/`,
`src/ui/affordability.ts`, `src/simulation/economy/`, or this file).

**Every figure in D1 through D6 reproduced to the minor unit**, on a
substantially *more* loaded box than the first pass — `uptime` read a
one-minute load average of 25.4 against a stated 1.57 for the original run,
with five to six other agents' Playwright and Vitest processes visible in
`ps` throughout. Balances, badge text, tones, refusal bands, alert lines and
sent-command lists all matched: act 1's `-1,235` / `"1,265 left"`; act 2's ten
funded wall segments down to `-1,995` / `"505 left"` and the `320`-unit
shortfall note; act 3's refund arithmetic; act 4's four-row table; act 5's
`-1,220 → -2,180 → -2,500` double-rung crossing and the `640`-unit wage debt;
act 6's clamping table. The two wall-clock durations in act 5 (`t+28s`/`t+59s`
against the first pass's `t+31s`/`t+60s`) are the only numbers that moved, and
they are timing, not the game's own arithmetic, so neither pass treats them as
evidence of anything.

One value was checked and is *not* a discrepancy worth flagging: act 6's own
excerpt in D6 prints six of its seven typed values, dropping the first
(`typed ""`). Re-running showed that case too: the field read `"2"` and the
button `"Buy 2 × Brick · 80"` before any press, which is correct and not a
clamp at all — `paintBuy` sets the quantity to `material.quantityPerPlacement`
whenever the selected material changes (`src/ui/hud/build-panel.ts:1584-1587`),
and a `wall-brick` placement needs two bricks, matching the pricing table's
"2 bricks = 80" entry above. Reproduced identically twice, on two separate
runs at two different ports, so it is the material default working as
written, not contention.

Also re-verified by reading rather than by re-running: every `SpendClass`
constant and every `file:line` this document cites, against the current tree.
`TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS = -2_500` (one tenth of the 25,000
opening grant, `treasury.ts:293`), `INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS
= -1_250` (`treasury.ts:339`), `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS
= -2_000` (`treasury.ts:351`), the `'wages'` rung is `Number.NEGATIVE_INFINITY`
— the sentinel identity of `Math.max`, not a fourth threshold
(`treasury.ts:380`, docblock at `treasury.ts:357-366`) — and `'hiring'` shares
the deliveries rung (`treasury.ts:381`). `Treasury.canAfford` and
`Treasury.spend` both take `spendClass: SpendClass` as a required, non-defaulted
parameter (`treasury.ts:516`, `:533`). All five call sites that spend or check
affordability were re-enumerated: `procurement.ts:230` (`'deliveries'` via the
purchase path), `payroll.ts:319` (`'wages'`), `just-in-time-materials.ts:556`
(`'construction'`), `staff/hiring.ts:213` (`'hiring'`) — the same four this
document already named, confirming D5's enumeration is still exhaustive as of
this commit.

### The promise-to-the-player question this branch's brief asks for directly

**The sentence a player sees**, on the `FUNDS` chip's badge, at any negative
balance: **`"{n} left"`** — e.g. `"1,265 left"` at a balance of −1,235
(`hud.status.funds-remaining` in the badge, rendered by `overdraftRemaining`,
`src/ui/hud/projection.ts:437-440`, whose body is
`Math.max(0, counts.treasuryMinorUnits - floor)` against
`counts.treasuryOverdraftFloorMinorUnits` — the treasury's −2,500).

**What it computes** — `src/ui/hud/projection.ts:440`: `balance - (-2,500)`.

**What the purchase and hire paths actually refuse at** —
`src/ui/affordability.ts:152`, `HOST_PRESS_FLOOR_MINOR_UNITS =
rungFloorMinorUnits('deliveries', TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS)` = the
deliveries rung, −1,250 — read on the host's pre-flight at
`src/main.ts:2546` (purchase) and `src/main.ts:2735` (hire) — the two
`HostRefusalError('past-the-overdraft-floor', …)` sites, located by
`grep -n "HostRefusalError('past-the-overdraft-floor'" src/main.ts` rather than
trusted from a Vite-transformed stack trace — and matched on
the worker's own side by `Treasury.canAfford` at
`src/simulation/economy/treasury.ts:588` against `floorFor('deliveries')` /
`floorFor('hiring')`, both −1,250 (`treasury.ts:378,381`).

**The exact balance, precisely stated, because "becomes false" undersells it.**
The badge is `balance + 2,500`; the real room to spend on a delivery or a hire
is `balance + 1,250`. Those two are off by exactly 1,250 at **every** balance
below zero — the badge is not "true, then false past a threshold", it is wrong
by the same constant from the first minor unit of overdraft. What changes at a
threshold is not truth but *how fictitious*: while `balance + 1,250` is still
positive (balance above −1,250), the real room merely doesn't match the
badge's; once balance reaches **−1,250**, the real room is **zero** — nothing
at all can be bought or anyone hired — and stays zero all the way to −2,500,
while the badge keeps counting down a positive number the whole way
(`"1,250 left"` at −1,250, `"320 left"` at −2,180, `"0 left"` only at −2,500).
So the single balance most worth naming is **−1,250**: the point where the
badge stops merely overstating the player's room and starts promising money
that is not there at all, for every balance from there to the floor. Measured
concretely in act 1 at −1,235 (one step short of that line): the badge said
`"1,265 left"` and the cheapest catalogue item, a 40 brick, was already
refused, on the host's own thread, with `HostRefusalError: The last reported
balance of -1195 cannot cover 65.` never reaching the player (console only).

**Is this a promise the code does not keep?** Yes, on this pass's reading of
`AGENTS.md`'s fourth exclusion. `"{n} left"` is stated in the imperative,
first-person-actionable voice a Buy or Hire button uses ("what you have to
spend"), not hedged as "room before the deeper floor" or similar — and between
−1,250 and −2,500 it is not a delayed truth or a rounding artifact, it is a
number that is *wrong by a constant* (exactly 1,250, always, in the encouraging
direction) about whether the very next press will work. `src/ui/affordability.ts`
already reads it this way in its own source, in the paragraph headed *"What it
does not fix, deliberately"*: *"between -1,250 and -2,500 that badge now
offers a player room they cannot spend"* — written by the code that introduced
the rung, not by this playtest. This pass adds the browser evidence that
sentence lacked and treats the ruling as the owner's fourth-exclusion call,
not something to patch here — consistent with `origin/feat/name-the-rung-on-screen`
already being in flight to re-base this exact number.

---

# D1 — The FUNDS badge offers exactly 1,250 that no press can spend

**MEASURED, act 1.** An empty prison — no prisoners, so the state pays nothing
at a day boundary; no staff, so payroll takes nothing — was spent down on planks
alone, so that the brick store stayed at zero:

```
[act1] on arrival: treasury=25000 | chip "25,000" tone=null | badge null tone=null
[act1] after 403 planks (26,195): treasury=-1195 | chip "-1,195" tone=warning | badge "1,305 left" tone=warning
[act1] one more plank (65): sent=[] band="Nothing was bought — that would go past what the state will carry."
[act1] after pressing Buy on one plank: treasury=-1195 | chip "-1,195" tone=warning | badge "1,305 left" tone=warning
[act1] one brick (40): sent=["PurchaseMaterials"] band="not laid out"
[act1] after pressing Buy on one brick: treasury=-1235 | chip "-1,235" tone=warning | badge "1,265 left" tone=warning
[act1] a second brick (40): sent=[] band="Nothing was bought — that would go past what the state will carry."
[act1] the hire control reads "Hire Guard · 80"
[act1] one hire (80): sent=[] band="Nobody was hired — that would go past what the state will carry."
[act1] the whole strip: … | -1,235 | FUNDS | 1,265 left | 0 | EARNED TODAY | DAY | 1 | …
```

**A `sent=[]` is the host refusing on its own thread before anything goes on the
wire.** The console carries the diagnostic half, which never reaches the player:
`HostRefusalError: The last reported balance of -1195 cannot cover 65.` The
throws are at `src/main.ts:2546` (purchase) and `src/main.ts:2735` (hire),
located by `grep -n "HostRefusalError('past-the-overdraft-floor'" src/main.ts`
rather than by trusting a Vite-transformed stack trace.

So, on the assembled page: **the strip says `1,265 left` and the cheapest item
in the whole catalogue, a 40 brick, is refused.**

**VERIFIED, read — the arithmetic, and it is not a rounding.** Three
subtractions that were one subtraction until this morning:

- the badge is `overdraftRemaining`, `counts.treasuryMinorUnits - floor` where
  `floor` is `treasuryOverdraftFloorMinorUnits`, the treasury's own
  **−2,500** (`src/ui/hud/projection.ts:408-412`);
- the press is `judgeAffordability`, `balance - charge < overdraftFloorMinorUnits`
  defaulted to `HOST_PRESS_FLOOR_MINOR_UNITS`, which is
  `rungFloorMinorUnits('deliveries', −2,500)` = **−1,250**
  (`src/ui/affordability.ts:152`);
- the worker is `Treasury.canAfford`, `balance - amount >= this.floorFor(spendClass)`
  (`src/simulation/economy/treasury.ts:588`), the same −1,250 for `'deliveries'`
  and `'hiring'`.

`overdraftRemaining − judgeAffordability's spendable` is therefore
`(−1,250) − (−2,500)` = **1,250, at every balance, always**. The badge is not
approximately wrong; it is wrong by a constant, and the constant is half the
overdraft.

**The divergence was seen and left, deliberately, by the change that caused it.**
`src/ui/affordability.ts:145-152`, in the source, under the heading *"What it
does not fix, deliberately"*: *"`hud.status.funds-remaining` renders `balance -
overdraftFloor` (`src/ui/hud/projection.ts`), which is the room to -2,500;
between -1,250 and -2,500 that badge now offers a player room they cannot
spend."* That paragraph is right and this act is its browser evidence. What it
did not have, and what D1 adds, is the size of it on screen at a balance a
player reaches, and the fact that the *cheapest possible purchase* is what the
badge is refusing.

**Player-visible cost.** The badge exists because of ruling 18, and ruling 18's
purpose was that a player should not have to meet the overdraft by hitting it.
As shipped it tells a player at −1,235 that they have 1,265 to spend, and every
one of the six things they could spend it on is refused. A number that is wrong
in the *encouraging* direction is worse than no number: it is the reason the
player presses Buy.

**Whose call.** The owner's, under `AGENTS.md` exclusion 4 — it is a
player-visible figure whose wording the owner authored (ruling 18). Not
re-based here. Three shapes it could take are set out in "Proposals" below.

---

# D2 — The shop is shut and the build queue is still spending

**MEASURED, act 2.** The identical descent — 403 planks, balance −1,195, no
brick in store — and then the same money spent by drawing wall segments with the
mouse instead of pressing Buy. Fourteen segments were pressed on tile edges; the
balance and the FUNDS chip were read after each.

```
[act2] Buy one brick (40) here: sent=["PurchaseMaterials"] …
[act2] wall 1  … treasury=-1275 | badge "1,225 left" | queue "1 waiting · 0 being built"  | shortfall not laid out
[act2] wall 2  … treasury=-1355 | badge "1,145 left" | queue "2 waiting · 0 being built"  | shortfall not laid out
[act2] wall 3  … treasury=-1435 | badge "1,065 left" …
[act2] wall 4  … treasury=-1515 | badge "985 left"   …
[act2] wall 5  … treasury=-1595 | badge "905 left"   …
[act2] wall 6  … treasury=-1675 | badge "825 left"   …
[act2] wall 7  … treasury=-1755 | badge "745 left"   …
[act2] wall 8  … treasury=-1835 | badge "665 left"   …
[act2] wall 9  … treasury=-1915 | badge "585 left"   …
[act2] wall 10 … treasury=-1995 | badge "505 left"   | queue "10 waiting · 0 being built" | shortfall not laid out
[act2] wall 11 … treasury=-1995 | badge "505 left"   | queue "11 waiting · 0 being built" | shortfall "Waiting for 80 to buy materials."
[act2] wall 12 … treasury=-1995 | badge "505 left"   | queue "12 waiting · 0 being built" | shortfall "Waiting for 160 to buy materials."
[act2] wall 13 … treasury=-1995 | badge "505 left"   | shortfall "Waiting for 240 to buy materials."
[act2] wall 14 … treasury=-1995 | badge "505 left"   | shortfall "Waiting for 320 to buy materials."
[act2] the alerts log holds ["Nothing was bought — that would go past what the state will carry.Warning"]
```

Ten wall segments, **800 spent, at a balance where the shop had just refused
40.** The ladder is doing exactly what ruling 19 says: the press is the
`'deliveries'` rung at −1,250 and a queued order is the `'construction'` rung at
−2,000 (`src/simulation/economy/procurement.ts:194-211`,
`src/simulation/economy/just-in-time-materials.ts:557`). It is correct, and it
is also **the game's largest piece of hidden functionality on this surface**:
when the shop shuts, the way to keep spending is to stop using the shop.

Two things follow that a player has no way to know:

1. **Drawing a wall is the cheap way to buy bricks.** With the store empty, a
   wall order buys its own two bricks at the same 40 each, on a floor 750
   deeper. Nothing on either control says so.
2. **The 800 is spent with no press that mentions money.** Segments 1–10
   produced no sentence, no badge change beyond the number, and no alert. The
   first thing the game said about any of it was after segment 11, in a note
   inside the Queued fold.

**REASONED, from acts 1 and 2 together:** the deepest balance a player can reach
by any press is **−1,995** — Buy stops at −1,250 and the wall tool stops at
−2,000, and 80 does not fit in the 5 that is left. D5 is what that costs the
strip.

**Also MEASURED, and a smaller thing on its own: the shortfall note states the
wrong number.** `Waiting for 320 to buy materials.` at a balance of −1,995 with
a construction floor of −2,000. 320 is the **cost of the four unfunded orders**
(`shortfallMinorUnits`, `src/simulation/presentation/construction-projection.ts:299`)
and it is not what the queue is waiting for: 5 of room is already there, so the
money that has to arrive is **315** for all four and **75** for the first one.
The sentence is `'hud.build.queue-shortfall'`, *"Waiting for {total} to buy
materials."* (`src/content/default-locale-en.ts:847`), and "waiting for" names a
sum a player will try to earn. Also the owner's, for the same reason as D1.

---

# D3 — Payroll crosses both rungs in one step, and the alerts log says "No active alerts"

**MEASURED, act 5.** Twelve guards hired at 80 each while solvent, then 388
planks, leaving −1,180 — 70 above the deliveries rung. The clock was then run at
×4 with **no prisoners in the prison**, so nothing paid anything in.

```
[act5] after twelve hire presses: treasury=24040 staff=12
[act5] after 388 planks: treasury=-1180 | FUNDS {"chipValue":"-1,180","chipTone":"warning","badgeText":"1,320 left","badgeTone":"warning"}
[act5] Buy one brick (40) before the first day boundary: sent=["PurchaseMaterials"] band="not laid out"
[act5] the clock reads "Pause | Play at normal speed | Fast forward | Speed 4x | ×4"
[act5] t+31s tick=2424 day=2: treasury -1220 -> -2180 | chip tone=warning badge "320 left" tone=warning | alerts ["No active alerts"]
[act5] t+60s tick=4831 day=3: treasury -2180 -> -2500 | chip tone=danger badge "0 left" tone=danger | alerts ["Payday went unpaid — your staff are owed 640. Day 2WarningClear this alert"]
[act5] the whole strip: … | -2,500 | FUNDS | 0 left | 0 | EARNED TODAY | DAY | 3 | … | ×4
```

Re-run once and identical to the minor unit, at t+30s and t+60s.

**At the day-2 boundary the prison went from −1,220 to −2,180 in one automatic
step.** That single step crossed the deliveries rung *and* the construction
rung. Before it, Buy worked (the brick two lines above went through). After it,
Buy is refused, hiring is refused, and any wall drawn goes onto the queue
unfunded — and the alerts log, read in the same second, reads
`["No active alerts"]`.

**VERIFIED, read — why nothing was said.** `grep -n "'hud.alert" src/content/default-locale-en.ts`
returns exactly one economy *event*: `'hud.alert.event.economy.wages-unpaid'`
(line 581). Every other money sentence in the file is a refusal — something the
player pressed. **There is no event for a rung being crossed**, so the only
state change the channel can report is a payday that failed, which happens a
whole in-game day later and is about a different thing.

The two figures the strip showed while this happened are D1 again, sharper: at
−2,180 the badge read **`320 left`**, and 320 was spendable on precisely one
thing — wages, whose rung is the floor. Nothing the player can press could touch
any of it.

**Player-visible cost.** A player who hires a normal-looking number of guards on
day 1 finds, without being told, that on day 2 the Build panel stopped working.
The prison has not "run out of money" in any way it is shown: it has 320 left,
in `warning` not `danger`, and no alert.

**What is not claimed.** Whether such a prison can recover is **UNKNOWN** and
this pass did not establish it. The act-5 prison holds 388 planks, and a queued
order that needs no purchase never consults `canAfford` at all
(`just-in-time-materials.ts:556` is reached only for a shortfall) — so it can
still build beds from stock, zone, admit, and earn. A prison at the floor with
an **empty** store is a different case and was not produced here. Saying "the
game can be soft-locked" would be a claim about impact that this pass has not
earned.

---

# D4 — The Buy control is identical whether the purchase will work or not

**MEASURED, act 4.** The same control, read at four balances:

| balance | FUNDS badge | the Buy button | disabled? |
| --- | --- | --- | --- |
| 25,000 | *no badge* | `Buy 1 × Brick · 40` | no |
| −25 | `2,475 left` | `Buy 1 × Brick · 40` | no |
| −1,185 | `1,315 left` | `Buy 1 × Brick · 40` | no |
| −1,225 | `1,275 left` | `Buy 1 × Brick · 40` | no |

The whole row's text is the same string at all four:
`QUANTITY | − | + | Buy 1 × Brick · 40 | Arrives while the clock runs, into the
stock a build draws from.` At the last of them the press is certain to be
refused — the host has the balance, has the price, and `judgeAffordability`
already knows the answer — and the control gives no sign of it until pressed.

Same for a quantity a solvent prison cannot afford:

```
[act4] with 10,000 typed into the quantity field: {"submitLabel":"Buy 10000 × Brick · 400,000","submitDisabled":false,…}
[act4] pressing it: sent=[] band="Nothing was bought — that would go past what the state will carry."
```

**REASONED, from `src/ui/affordability.ts` as read:** the verdict the host
computes already carries the number that would fix this.
`AffordabilityVerdict.spendableMinorUnits` is documented at
`src/ui/affordability.ts:82-90` as existing for exactly this — *"the figure that
makes a refusal legible — a balance of `-2,480` refusing a `65` plank is not
obviously right until the twenty of room left is beside it"* — and
`grep -rn spendableMinorUnits src/` finds **no reader outside the module and its
own test.** The right number is computed on every press, against the right
floor, and discarded; the wrong one is painted on the strip.

**Player-visible cost.** The only way to learn what a prison can afford is to be
refused. That is the design directive's "discover by accident", on the one panel
where money is spent.

---

# D5 — `danger` is the tone for a state no press can reach

**MEASURED, acts 2 and 5 together.** `overdraftTone`
(`src/ui/hud/projection.ts:446-450`) paints `danger` when
`remaining <= 0`, i.e. at exactly −2,500, and `warning` everywhere else below
zero. Act 2's deepest press-reachable balance was **−1,995**, still `warning`,
badge `505 left`. Act 5 reached `danger` only when **payroll** took the last 320.

So on the shipped ladder the tones divide as: `warning` covers −1 through
−2,499, which contains the two boundaries that actually change what the player
can do (−1,250, where buying and hiring stop; −2,000, where building stops), and
`danger` is reserved for a balance only the automatic wage debit can produce.

The chip's own docblock argues the split at length and its argument is sound for
the world it was written in — *"A prison at -100 and a prison at -2,500 are not
the same state told louder: the first can still buy the plank that finishes the
cell, and the second can buy nothing at all"*, `projection.ts:419-424`. **That
sentence became false at `52b5bb1c`.** A prison at −1,300 can also buy nothing
at all, and it is painted the same as one at −100.

Whose call: the owner's, ruling 18 authored the tones.

---

# D6 — Two things that are right, measured so the category is not empty by assumption

**The quantity field cannot be made to lie (MEASURED, act 6).** Seven values
typed into it — `""`, `0`, `-5`, `0.5`, `1e3`, `100001`, `999999999` — and in
every case the field clamped to `[1, 100000]` **before** the button relabelled,
so the label a player reads is always the purchase they get:

```
[act6] typed "0":         the field now holds "1"      | button "Buy 1 × Brick · 40"            | sent ["PurchaseMaterials x1"]
[act6] typed "-5":        the field now holds "1"      | button "Buy 1 × Brick · 40"            | sent ["PurchaseMaterials x1"]
[act6] typed "0.5":       the field now holds "1"      | button "Buy 1 × Brick · 40"            | sent ["PurchaseMaterials x1"]
[act6] typed "1e3":       the field now holds "1"      | button "Buy 1 × Brick · 40"            | sent ["PurchaseMaterials x1"]
[act6] typed "100001":    the field now holds "100000" | button "Buy 100000 × Brick · 4,000,000" | sent [] | band "Nothing was bought — …"
[act6] typed "999999999": the field now holds "100000" | button "Buy 100000 × Brick · 4,000,000" | sent [] | band "Nothing was bought — …"
```

`judgeAffordability`'s `'malformed-charge'` branch could not be reached through
the interface at all, which is the branch working. Five Buy presses in a burst
sent five `PurchaseMaterials` and moved the balance by exactly 200 — no press
was silently swallowed by `AsyncActionGate`.

**Deliveries state their refund honestly (MEASURED, act 3).**

```
[act3] after three orders (400 + 400 + 195 = 995): treasury=24005
       pending="ON THE WAY | 3 bought · 995 back if cancelled | 3 × Wood Plank · 195 back | Cancel | 10 × Brick · 400 back | Cancel | 10 × Brick · 400 back | Cancel"
[act3] first cancel: treasury 24005 -> 24200
[act3] the deliveries fold now: "ON THE WAY | 2 bought · 800 back if cancelled | 10 × Brick · 400 back | Cancel | 10 × Brick · 400 back | Cancel"
```

Each row states what cancelling it gives back, the header states the total, and
the refund landed to the minor unit (195, the recorded `paidMinorUnits`, not a
recomputation). The three quoted figures are the only place in this pass where a
money number the player is shown matched what pressing the control did.

---

# The one thing this pass changed in `src/`

`src/ui/hud/projection.ts` carried, since #723 (`8d495e62`), the sentence
*"`balance - floor`, which is `judgeAffordability`'s `spendableMinorUnits` and
`Treasury.canAfford`'s own subtraction"*. It was true when it was written.
`git show 52b5bb1c --stat -- src/ui/hud/projection.ts` is **empty** — #747 did
not touch the file — and from that commit the three subtractions are three
different subtractions. The comment is corrected, with both directions marked
per `docs/AGENT_WORKFLOW.md` §4, and **no rendered figure is changed**: that is
the owner's.

# Proposals

Each needs a yes or no; none was taken here.

**P1 — what the FUNDS badge should count (D1, D3, D5).** Three shapes:

- *(a)* Re-base the badge on the deliveries rung: `balance − (−1,250)`, clamped
  at 0. The number then means "what you can spend", which is what a player reads
  it as. Cost: it hits 0 at −1,250 while the prison can still fund 750 of
  queued building, so the badge understates the *construction* room by 750.
- *(b)* Keep the badge as the overdraft remainder and add the rung as the
  chip's `danger` threshold: `danger` from −1,250 rather than from −2,500. One
  number, honest tone, no new string. Cheapest; does not stop the badge reading
  `1,265 left` beside a refused 40.
- *(c)* Two figures — the room to the rung and the room to the floor. Truest,
  and it costs a second number on a strip that already overflows by 133px on a
  populated prison at 1280 (previous record, act 6).

**Recommendation: (a) plus (b).** They are the two halves of the same claim —
the badge should count what the player can spend, and the tone should change
when they can no longer spend it — and together they make the strip's two
signals agree with the two controls. (c) is the honest one and the strip cannot
afford it.

**P2 — say the limit on the control, not only after the press (D4).** The verdict
already carries `spendableMinorUnits` against the right floor and nothing reads
it. Disabling the button, or appending the room to its label, needs no new
simulation state and no new channel field — only a sentence the owner authors.

**P3 — an event for crossing a rung (D3).** The events channel has one economy
event and it is the wrong one for this. A prison whose Build panel just stopped
working should say so at the moment it stops, not a day later about wages.

**P4 — `hud.build.queue-shortfall` states a cost, not a need (D2).** Either
re-word it away from "waiting for" or subtract the room the construction rung
still has.

# The weakest claim here, and what would change my mind

**D2's "largest piece of hidden functionality" is a judgement, not a
measurement.** What is measured is that ten wall orders were funded at a balance
where a 40 brick was refused, and that nothing on either control said why. That
this *matters* assumes a player will meet the state — which act 5 shows payroll
delivers unprompted, but act 5 hired twelve guards, which is not obviously what
a real player does. **A measurement of the balance across the first three
in-game days of an ordinarily-played prison — a cell, three or four guards,
prisoners admitted, state income running — would settle it, and this pass did
not take one.** If that prison never goes below −1,250, D1, D2, D3 and D5 are all
real and all rare, and P1's priority drops accordingly.

Second weakest: **D5's claim that no press reaches −2,500 is reasoned from two
acts, not from an enumeration of every control that spends.** `grep -rn "\.spend(\|canAfford(" src/`
finds four call sites — `procurement.ts:230`, `payroll.ts:319`,
`just-in-time-materials.ts:556`, `staff/hiring.ts:213` — and three of them are
rungs above the floor, which is why the claim is made; a fifth spend added
without a rung of its own would break it silently, and nothing in the test suite
would notice.
