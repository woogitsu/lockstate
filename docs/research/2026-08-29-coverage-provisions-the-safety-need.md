# 2026-08-29 — What guard coverage should do to the `safety` need

**Question.** Issue [#588](https://github.com/matmaxalez/lockstate/issues/588),
under the owner's ruling on
[#599](https://github.com/matmaxalez/lockstate/issues/599), makes guard coverage
the provisioner of the `safety` need and says the 20,400-tick requirement is
*"discarded, or demoted to a long-stay accumulator"*. Three things it does not
settle, and this record answers: **which of those two dispositions**, **at what
rates**, and **whether coverage actually suppresses incidents** — the sequencing
constraint the issue calls load-bearing.

Measured on `agent/588-coverage-safety`, cut from `origin/main` @ `05640b6`
(**v0.0.210**), Node 24.19.0, shared container. Every "before" figure was taken
in a **second worktree checked out at that same commit**, never in the tree being
edited. Evidence tier is **VERIFIED** throughout unless a claim says otherwise:
every number below was obtained by running this repository's own modules, and
every `file:line` was opened.

---

## 1. A correction to the premise, first, because it inverts the sign

Both issues describe the old state as *"the 20,400-tick requirement makes 40 of
the withholding a permanent constant that no play can move"*.

**Measured, it was a permanent zero, not a permanent 40.**
`DEFAULT_ACTIONS`'s `action.sleep` carried `needEffectsPerTick: { sleep: 2,
safety: 0.2 }` — twenty times the decay rate of 0.01 — so any prisoner with a
furnished cell sat at 237 or above indefinitely.
`tests/integration/room-gated-needs.test.ts` pinned `safety: 237.1` as the
*lowest* level over ten in-game days, and `STATE_INCOME_UNMET_NEED_LEVEL` is 51.
The state therefore withheld **nothing** for `safety` in any prison that had
built a cell.

`src/simulation/incidents/sector-risk.ts` already recorded the same fact from
the other side and is quoted here because it is the load-bearing prior art:
`needsPressure` *"used to be the `safety` deficit alone, which `action.sleep`
restores twenty times faster than it decays, so the term was pinned near zero
for anybody with a bed."*

Both readings agree on the conclusion the ruling drew — the number was a
constant and no play moved it — and disagree about its sign. The consequence for
the implementation is the same either way and is the reason the bed's
contribution had to go: **an instrument a bed overrides twenty to one is not an
instrument.**

## 2. Which disposition, and why the answer is "both, on different rungs"

The ladder implemented is: `covered` provisions
`SAFETY_COVERAGE_PROVISION_PER_TICK`, `understaffed` half of it, `unguarded`
nothing, against a decay that runs regardless. The **net** rate is what a player
experiences, and it is what the two free parameters have to be chosen against.

Three rungs stay three distinct outcomes only while
`provision / 2 < decay < provision`. Below the lower bound `understaffed`
recovers and stops costing anything; above the upper, `covered` drains and the
instrument reads backwards.

With `safety` decaying at 0.05 — `hunger`'s rate, which is this repository's
existing statement of *"a need a prison must attend to about daily"*, and 4,080
ticks from full to unmet — and with `NEED_SCALE` admitting only rates whose
*half* is also representable, the entire available range is four numbers:

| provision | understaffed net | time to unmet, understaffed | covered net |
| --- | --- | --- | --- |
| 0.06 | −0.02 | 10,200 ticks | +0.01 |
| 0.07 | −0.015 | 13,600 ticks | +0.02 |
| **0.08** | **−0.01** | **20,400 ticks** | **+0.03** |
| 0.09 | −0.005 | 40,800 ticks | +0.04 |

**0.08 is the one where the ruling's own two alternatives are both honoured.**
20,400 is *discarded* for the unguarded prison, which now crosses the unmet line
in 4,080 ticks — inside `MIN_SENTENCE_LENGTH_TICKS` (4,800), so every sentence
the game draws outlasts it — and *preserved exactly, to the tick*, as the
long-stay accumulator for the understaffed one, where only a prisoner held more
than eight and a half in-game days ever crosses. A prison short of guards does
not stop being safe; it stops being safe **for its long-stayers**.

0.09's accumulator never accumulates: 40,800 ticks is past the 38,400-tick
maximum sentence. 0.06's and 0.07's are `hygiene`'s and `recreation`'s own
numbers, which would read as a coincidence rather than as a decision.

**Weakest claim in this section**, named as `docs/research/README.md` requires:
the choice between 0.08 and 0.07 is an argument about *legibility*, not about
play. Either produces three distinct outcomes. What would change my mind is a
playtest finding that 8.5 in-game days is too long for an understaffed prison to
feel any consequence — in which case 0.07 or 0.06 is the same design at a
shorter fuse, and neither the system nor any test needs restructuring.

## 3. The sequencing constraint, measured before and after

Issue #588: *"If incidents still fire every two in-game days under full
coverage, this mechanic punishes the player twice for a rate they cannot move."*

Seed `0x588`, ten in-game days (24,000 ticks), 16 prisoners in 8 furnished cells
— an over-capacity prison, which is the shape the brief's *"full coverage still
riots every two in-game days"* claim is about. "Before" is `05640b6` in a
separate worktree; the fixture is byte-identical in both.

| coverage | riots before → after | incidents before → after | peak risk before → after |
| --- | --- | --- | --- |
| `covered` 2 of 2 | 2 → **0** | 7 → 7 | 0.7373 → 0.6538 |
| `understaffed` 1 of 2 | 3 → 4 | 5 → 6 | 0.9018 → 0.9734 |
| `unguarded` 0 of 2 | 4 → 5 | 5 → 6 | 1.0 → 1.0 |

**The constraint is met: a fully covered prison rioted twice in ten days before
and riots zero times now.**

Two things worth reading beside that:

- **Coverage was not a lever before, and hiring more guards is still not one.**
  Two guards and four guards measure identically in both trees, because
  `resolveOccupancyScaledGuardCount` asks for one guard per eight occupants and
  the extra two stay unassigned. What changed is not how many guards help; it is
  that reaching the requirement now does something.
- **Seven assaults remain under full coverage, and this mechanic does not touch
  them.** They come from ADR 0061's per-prisoner flashpoint sampler, which reads
  overcrowding and sentence pressure rather than sector coverage. That rate *is*
  one the player can move — by building cells — so it is not the
  "punished twice" case the constraint is about. **No incident fine was added**,
  which the source of the ruling is explicit about.

The same split shows on the smaller fixture
`tests/integration/room-gated-needs.test.ts` (8 prisoners, 8 cells, no shower or
yard, ten days): peak risk **0.4824 → 0.4742** guarded and **0.7981 → 0.9661**
unguarded. Coverage moved that score by 0.0142 before and moves it by 0.4919
now.

## 4. What had to change beyond the reader itself

- **`action.sleep` loses `safety: 0.2`** (§1). Arithmetic for why keeping it is
  not an option: a prisoner sleeps about 1,200 ticks of a 2,400-tick day
  (measured, `tests/integration/riot-regime-loop.test.ts`'s control census), so
  0.2 a tick returns +240 a day against a decay of −120. The bed alone would
  pin the need at `NEED_MAX` in an entirely unguarded prison and the mechanic
  would be dead on arrival.
- **`action.yard-recreation` loses `safety: 0.1`.** This was kept for one draft
  on the grounds that it is dominated — a yard session returns about 6% of what
  `safety` now loses in a day — and that was true and the wrong argument. The
  term's effect is on *what the prisoner chooses*: `scoreAction` is
  deficit × effect, so a term scaled by a deficit an unguarded prison drives to
  the top of its range lifted the yard over meals, showers and sleep in the
  ranking. Measured on `tests/integration/yard-and-common-room.test.ts` with the
  term still in: yard time **5,872 → 8,588** performing ticks in the minimum
  yard and **7,208 → 13,120** in the enlarged one. With it removed those read
  6,120 and 7,424 — 4% and 3% off the unmodified tree.
  The cost, recorded: the yard and the common room now tie wherever
  `recreation` alone is full instead of where `recreation` *and* `safety` both
  are, so common-room time rises from 1,248 to 4,208 ticks. Same
  "a prisoner who wants nothing" state; what moved is how often a prison is in
  it.

## 5. A confound in four fixtures, and the check that identified it

Four contention fixtures — `contended-shower-fairness`,
`contended-canteen-meal-fallback`, `contended-canteen-substitution-cost`,
`canteen-shape-hunger-comparison` — build **unstaffed** prisons. Under this
change an unstaffed prison of that size riots, and a riot regime takes away the
very actions each file measures: the shower fixture opened **six riots** in its
40,000-tick watch, total shower time halved from 7,488 ticks to 3,816, and
twelve of its 24 prisoners touched hygiene 0.

Each now hires `ceil(PRISONERS / 8)`, which is what
`DEFAULT_SECTOR_PRISONERS_PER_GUARD` makes the derived sector ask for. That
moved a great many pinned numbers, and **the hire is what moved them, verified
rather than assumed**: applying exactly the same `HireStaff` commands to the
*unmodified* tree at `05640b6` reproduces the new arrays exactly — 11/9/0
canteen entries, 185 control substitutions, 268 unbuilt substitutions. A guard
walking to and standing on the arrival tile changes how a population routes to
its rooms, and that is true on `main` today and has nothing to do with this
need.

Two claims those files made were falsified by the hire and are corrected rather
than re-pinned:

- `contended-canteen-substitution-cost` said *"the contended canteen genuinely
  starves this prison"* and asserted the worst hunger floor under 20 levels.
  Staffed, it is 136.5: the twelve who never win a seat fall back to
  `action.eat-in-cell` promptly (ADR 0041 decision 1) instead of queueing to be
  refused. **The starvation was a property of the unstaffed prison, not of the
  contended canteen.**
- `contended-shower-fairness` said nobody is left below *"well above a third of
  `NEED_MAX`"*. The worst floor is now 24.4 of 255. Narrowed to what is
  measured: nobody reaches the floor, and the run is much closer to it.

## 6. Two findings handed over rather than acted on

- **Canteen seating has no rotation, and the caste hardened.** With the fixture
  staffed, `contended-canteen-substitution-cost`'s twenty-four prisoners split
  11 / 9 / 0 canteen meals where they split 8 / 6 / 3 before — the **same total
  of 120**, distributed so that twelve prisoners never sit down at all. ADR 0029
  decision 5's rotation and the fix #434 made for it are about the **shower**
  room; `contended-shower-fairness` still shows its last-scanned prisoner
  winning and losing days in turn. Nothing equivalent applies to dining claims.
  Whether it should is not #588's to decide.
- **Eight stray `console.log` calls sit in
  `tests/integration/riot-regime-loop.test.ts` on `main`** (`DURING`, `CONTROL`,
  `AFTER`, `CONTROLDAY`, `RIOTDAY`, `DEF1`, `DEF2`, `RESTORED`). They predate
  this branch — `05640b6` carries them — and were used rather than removed,
  because removing them is not this issue's change.

## 7. What this record does not establish

- **Nothing about how it feels to play.** Every figure here is a tick count off
  a deterministic run. Whether a guard per eight prisoners is the right price,
  and whether an 8.5-day fuse on an understaffed prison reads as a consequence
  or as nothing, are playtest questions.
- **Nothing about a second sector.** The shipped topology has one derived
  sector, so `covered` and `unguarded` are prison-wide states today. The three
  counts on the status strip are already per-rung sums rather than a ratio,
  which is the shape a multi-sector prison needs, but no multi-sector prison has
  been run.
- **The `assault` rate under full coverage is unchanged and unexplained by this
  work.** Seven in ten days, before and after. I measured it; I did not
  diagnose it, and I do not know what it costs a player.
