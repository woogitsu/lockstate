# Is the open issue list an index of what is live?

**Question.** A survey of `woogitsu/lockstate`'s open issues reported that ten of
the most promising were already fixed on `main` and open only because nobody
closed them (#882, #791, #868, #870, #772, #740, #1191, #1199, #1142, #794), and
observed that `docs/ISSUE_BACKLOG.md` carries no items at all — only the
source-of-truth order, pointing at GitHub Issues. Two questions follow, and the
second is the one worth the effort. **(1)** Which of those ten are genuinely
done? **(2)** What fraction of the 120 open issues is live, are the
`tests/foundation/unconsumed-*` gates a better index than the issue list, and is
there a cheap mechanical check that would keep the list honest?

**Decision it feeds.** None as an ADR. It closes eleven issues, leaves six open
with reasons, and prices one proposed script for whoever decides whether to
write it. It also bears on [#121](https://github.com/woogitsu/lockstate/issues/121),
which asks what `docs/ISSUE_BACKLOG.md` should become.

**Ground.** `origin/main` at `57cffa10` (v0.0.648), read in a worktree per
`AGENTS.md`'s worktree rule, with `node_modules` symlinked from the primary
checkout. Every `file:line` below was opened. Issue bodies and comments were
read through the GitHub API on 2026-09-17. `npx tsc -b` clean; `npx vitest run
tests/foundation/` **63 files, 636 tests, all passing** — the baseline this
record was taken against, unchanged by it.

---

## 1. The ten, verified

Nine of the ten are done. **One is not, and the brief is wrong about it.** One
more is wrong in the opposite direction: the brief calls it half done and both
halves have landed.

| # | Brief said | Verdict | Evidence |
|---|---|---|---|
| 882 | fixed | **fixed** | `action-system.ts:1454` |
| 791 | fixed | **fixed** | `host-refusal.ts:69`, `projection.ts:1275` |
| 868 | half 1 fixed | **half 1 fixed, half 2 open** | `default-locale-en.ts:2532` |
| 870 | fixed | **fixed** | `simulation-counts.ts:111` |
| 772 | fixed | **fixed** | `build-panel.ts:2176` |
| 740 | fixed | **fixed** | `deployment-system.ts:254` |
| 1191 | fixed | **fixed** | `view-model.ts:2295-2297` |
| 1199 | fixed | **fixed** | `main.ts:3825` |
| 1142 | half 1 fixed | **BOTH halves fixed** | `save-panel.ts:956`, `repository.ts:657` |
| 794 | fixed | **NOT fixed** | `world-scene.ts:71` |

### #882 — a restore turns an in-flight errand into a selection

Fixed by `490df767` (PR #1213). The gate that short-circuited before the
active-job check now waives the block category for a prisoner already carrying,
`src/simulation/prisoners/action-system.ts:1452-1455`:

```ts
const carryEligible = CARRY_ACTION !== undefined
  && !awaitingAccommodation
  && (resumingAnErrand || isActionCategoryAllowed(CARRY_ACTION, block.allowedCategories))
  && this.carryAvailableFor(entityId);
```

Pinned by `tests/integration/carry-restore-resumes-the-errand.test.ts`.

### #791 — the first refusal says nothing

Fixed by `23a6f48c` (the owner's ruling of 2026-09-03). `HostRefusalReason`
gained the member the issue asked for — `src/ui/host-refusal.ts:69`:

```ts
export type HostRefusalReason = 'past-the-overdraft-floor' | 'no-room-to-hold-anybody';
```

`src/main.ts:3435` throws it and `src/ui/hud/projection.ts:1275-1276` maps it to
a sentence. Pinned by `tests/unit/ui-hud-projection.test.ts`. Note the issue's
premise that the existing key `hud.alert.refusal.admit.no-accommodation` would
be reached was **not** how it was answered: a new key
`hud.refusal.admit-prisoner-no-room` was authored under the owner's ruling. The
issue's ask — that the refusal name the missing thing — is met.

### #868 — half 1 only

The hire note now says what the first day costs,
`src/content/default-locale-en.ts:2532`:

```ts
'hud.security.hire-hint': 'Costs {total} now and {wage} a day in wages, including today.',
```

**Half 2 is not answered.** The issue asks whether `0 of 0 · Covered` should say
something else when the prison holds nobody and a guard stands unassigned. The
*hint* beside the badge did change — `hud.security.coverage-met-hint` is now
`'Incidents and searches need free guards.'` — but that change came through
#941 and belongs to [#893](https://github.com/woogitsu/lockstate/issues/893)'s
question about what the coverage block should state. The badge word `Covered`
(`:2685`) is unchanged, and no decision is recorded about the empty-prison case.
**Left open.**

### #870 — a published count with no reader

Fixed by `4089fe20` (PR #1106). `src/ui/simulation-counts.ts:111` reads it:

```ts
staffUnassigned: counts.staffUnassigned,
```

and the same change added the gate the issue asked for by name,
`tests/foundation/unconsumed-status-count-contract.test.ts`. The issue's scope
is explicit — *"this issue is about the number reaching the UI at all — not
about what the UI then says"* — and a comment of 2026-09-15 already measured
this and concluded the issue *"can close as fixed by #1106"*. The remaining
copy question is #868/#893's, and the gate's own weakness (a *mention* counts as
a reader, so a field can cross into `src/ui/` and still be painted by nobody) is
recorded in §3 below rather than kept open here.

### #772 — the Buy button

Fixed in two halves, both landed. The mechanical half is
`src/ui/hud/build-panel.ts:2176`:

```ts
buySubmit.setUnavailable(verdict.refused);
```

and the sentence half — reserved to the owner when the issue was filed, ruled on
2026-09-03 — is `hud.build.buy-shortfall`:
`'Not enough money — you need {amount} more.'` (`default-locale-en.ts:2263`).
Pinned by `tests/browser/ui-buy-button-affordability.spec.ts` and
`tests/browser/ui-refusal-shortfall.spec.ts`.

### #740 — nothing walks

Fixed by `9dd6e601` under ADR 0088. The snap the issue quotes —
`this.guards.setTile(guardId, postTile)` — is gone; the guard is handed to
`GuardLocomotionSystem`, `src/simulation/security/deployment-system.ts:254`:

```ts
if (this.guards.locomotion.beginWalk(guardId, routeWaypoints(outcome.result.route))) {
```

Pinned by `tests/unit/security-deployment.test.ts`'s *"a deployed guard walks
tile-by-tile to its post rather than being snapped there (#740)"*, whose
docblock records the mutation that turns it red, with the instrument in
`tests/browser/playtest-740-does-a-guard-walk.playtest.ts`.

### #1191 — confident zeros before any prison reported

Fixed by `c9cdcb63` (PR #1197). `EMPTY_HUD_VIEW_MODEL` no longer carries a
counts row at all, `src/ui/hud/view-model.ts:2295-2297`:

```ts
export const EMPTY_HUD_VIEW_MODEL: HudViewModel = {
  clock: UNKNOWN_HUD_CLOCK,
};
```

and every chip opens at the same sentinel the clock uses,
`src/ui/hud/status-strip.ts:144-145`:

```ts
function metricValueText(value: number | undefined, localizer: HudLocalizer): string {
  return value === undefined ? UNKNOWN_READOUT_TEXT : localizer.formatNumber(value);
}
```

### #1199 — a second tab does not follow the first

Fixed by `162e9656` (PR #1216). `src/main.ts:3825`:

```ts
  subscribeToSettingsChanges(globalThis.window, {
```

Three of the four keys follow; the language key deliberately does not, and the
reason is written into `src/input/storage.ts`'s `SettingsChangeHandlers`
docblock and into `docs/adr/drafts/what-a-second-tab-follows.md`. The
composition-root call itself is pinned by
`tests/foundation/composition-root-contract.test.ts:201`, which exists because
the seam can be entirely correct and joined to nothing.

### #1142 — the brief is wrong in the *other* direction

The brief calls this half 1. **Both halves are on `main`.** The arm-then-confirm
landed in PR #1173 (`src/ui/save-panel.ts:956`, `const confirm = this.button(`),
and the undo window ADR 0114 describes landed in PR #1180: the `tombstones`
store at `src/persistence/local/indexeddb-store.ts:25`, `DATABASE_VERSION = 2`
at `:22`, the move-inside-the-transaction at
`src/persistence/local/repository.ts:657` (`expiresAt: deletedAt + this.undoWindowMs,`),
`restoreDeletedPrison` at `src/ui/save-panel.ts:452`, and the owner's
"free it now" control as `'save.action.tombstone-forget': 'Free its space now'`
(`default-locale-en.ts:3567`). The confirmation sentence was rewritten in the
same change, so it no longer claims what undo falsifies:

```ts
'save.delete.confirm':
  'Delete {name}? Every saved copy of this prison goes from your list. You can bring it back from this panel for one day, and after that it is gone for good. Its saves last changed {age}.',
```

**Closed.**

### #794 — the brief is wrong

**Not fixed.** Panning is still unclamped: `grep -n "clamp" src/rendering/scene/world-scene.ts`
returns nothing, and the only bound in the file is
`const ZOOM_BOUNDS = { min: 0.2, max: 3 } as const;` (`:71`) — exactly what the
issue reported. What landed since is the minimap (#793), which *navigates* but
**draws no map**: the string a player reads is
`'hud.minimap.navigable': 'No map is drawn here yet — press to jump the camera there'`
(`default-locale-en.ts:695`), and `src/ui/hud/hud.ts:1801` says in its own words
that minimap *rendering* belongs to the renderer and does not exist yet. So a
player panned into solid black has a surface that can move the camera somewhere
and still nothing telling them which way their prison is. None of the issue's
three shapes — clamp, "return to prison" control, edge marker — is built.
**Left open.**

---

## 2. Three more found in the same state while sampling

Not in the brief; found by the random sample of §3 and verified the same way.

- **[#663](https://github.com/woogitsu/lockstate/issues/663)** (language picker)
  — all three of its questions are answered on `main`. The control is mounted
  (`src/main.ts:3771`, `:3841`), it sits in the settings drawer rather than the
  strip with the displacement measurement the issue demanded written into the
  call site's docblock, the preference is a device preference under its own key
  (`src/input/storage.ts`), and the "does a switch re-render everything" question
  is answered by reloading, with the count behind that decision in
  `docs/adr/drafts/how-a-language-change-reaches-a-running-page.md`. PR #1195.
  **Closed.**
- **[#1181](https://github.com/woogitsu/lockstate/issues/1181)** (#88's six
  seconds of headroom) — both remedies the issue names as acceptable landed, and
  neither forbidden one did: `d7c2bcb8` split the sweep into one test per
  viewport (`app-shell.spec.ts:4810`, `every control can actually be pressed, on
  every tab at ${width}x${height} (#88)`), and `7681d80b` made it cheaper.
  **Closed.**
- **[#1225](https://github.com/woogitsu/lockstate/issues/1225)** (the save
  reader's enum and the TS union joined by nothing) —
  `tests/foundation/save-schema-enum-union-contract.test.ts` exists and
  implements precisely the asymmetric rule the issue said had to be decided
  first: the union must be a subset of the reader's enum, and every extra member
  must be named with the build that wrote it. It covers the class, not only the
  instance. **Closed.**

Two more were found **half** answered and are left open, because a half-done
issue does not get closed:

- **[#913](https://github.com/woogitsu/lockstate/issues/913)** — the false
  sentence is fixed (`default-locale-en.ts:264` records that the tail *"used to
  read 'until the state pays what it owes'"*), but the issue's second question,
  whether the floor should be escapable at all, is a difficulty judgement the
  owner has not taken.
- **[#930](https://github.com/woogitsu/lockstate/issues/930)** — §2 is fixed:
  the comment at `src/ui/simulation-events.ts:1230-1248`, corrected explicitly at `:1236`, no longer defers the
  player's figure to a channel that cannot hold one, and says so with the issue
  number on it. §1 stands — `grep -rn "PrisonCondition" src/ui/ src/main.ts`
  still finds no table, so the four standing conditions are computed, diffed and
  read by nobody.

---

## 3. How much of the open list is live

### Method, and why it is a sample rather than a census

120 issues are open (GitHub API, 2026-09-17). Verifying one costs roughly what
§1 cost per row — read the issue, work out its completion criterion, open the
cited code — so a census is not what this record buys. **A simple random sample
of 20 was drawn from all 120** with a fixed seed (`random.seed(1142)`,
`random.sample`), before any of them was looked at, and every one was then
verified the same way §1's ten were. The draw was:

> 29, 35, 40, 535, 540, 587, 591, 592, 641, 663, 703, 889, 899, 913, 930, 973,
> 1181, 1201, 1225, 1257

**None of the brief's ten fell in it**, which is luck rather than design but
does mean the two sets are independent — and that matters, because the brief's
ten were *selected for being dead* and are useless as an estimate of anything.

Three buckets, because two of them are not the same claim:

- **DEAD** — what the issue asks for is on `main`.
- **LIVE** — it is not, in whole or in part.
- **RECORD** — the issue has no completion criterion at all: it is a durable
  minute of owner rulings, a session handover, or an epic tracker.

### The result

| Bucket | Count | Which |
|---|---|---|
| DEAD | **3** | 663, 1181, 1225 |
| LIVE | **15** | 29, 35, 40, 540, 587, 591, 592, 641, 889, 899, 913, 930, 973, 1201, 1257 |
| RECORD | **2** | 535, 703 |

**15 % of open issues are dead (3/20). Wilson 95 % interval: 1.2 %–32.0 %** — in
absolute terms, about **18 of the 120, and anywhere from 1 to 38.** The interval
is embarrassingly wide and that is the honest output of n = 20; halving it needs
roughly n = 80, which is four times this record's cost.

Two figures constrain it from the ends, and both are worth more than the point
estimate:

- **A verified floor of 11.** §1 and §2 close eleven issues, so at least 9.2 %
  of the list was dead before this record and the true figure cannot be below
  that. The random sample's point estimate (18) is consistent with it.
- **RECORD issues are 10 % of the sample (2/20).** A title scan of all 120 for
  the shapes those two have — `[Roadmap]`, `[Owner decisions]`, `OWNER RULINGS`,
  `OWNER DIRECTIVE`, `OWNER DECISION`, `HANDOVER`, `[Continuation prompt]`,
  `[EPIC]`/`EPIC:`, and #584's design-search index — finds **13** (#9, #535,
  #537, #584, #599, #604, #629, #639, #703, #934, #972, #1145, #1155), which is
  10.8 % and agrees with the sample. **These will never close and should not**,
  but they are 13 rows a reader has to skip.

So the honest summary of the open list as an index: **roughly two thirds of it
is live work, about one sixth is finished work nobody closed, and about one
tenth is records that are not work at all** — with the middle figure carrying a
very wide interval.

`docs/ISSUE_BACKLOG.md` cannot fix any of that. It holds no items by design,
which is the right call — a second list of items would rot against the first —
and #121 is the open question about what it should become instead. Nothing here
argues for putting items back in it.

---

## 4. Are the `unconsumed-*` gates a better index?

**They are a better index of the thing they index, and they index very little.**
That is not a criticism: it is what makes them trustworthy.

There are four (`npx vitest run tests/foundation/unconsumed-*.test.ts`:
4 files, 23 tests, all green on `57cffa10`):

| Gate | Unit | Today |
|---|---|---|
| `unconsumed-command-contract` | a `simulationCommandSchema` member with no producer in `src/` | 17 produced, **1 unproduced** (`EditRegimeBlock`, with a written reason) |
| `unconsumed-action-contract` | an `ACTION_IDS` entry with no reader in `src/` | 9 read, **2 unread** (`selection.primary`, `build.confirm`, both with reasons) |
| `unconsumed-content-contract` | a catalogue id referenced nowhere | 62 declared, **0** unconsumed across `src/` + `tests/` (20 by `src/` alone, not gated) |
| `unconsumed-status-count-contract` | a `statusCountsSchema` field never mentioned under `src/ui/` or `src/main.ts` | 23 published, **0** silent |

**What they cover.** A declared vocabulary member that nothing on the other side
of a seam can reach. They cannot rot, because each one recomputes its denominator
from the real schema or registry rather than from a hand-written list — which is
the property the issue list lacks entirely.

**What they cannot cover, and this is the load-bearing half.**

1. **They surface three items today, all three already written down with
   reasons.** So as an index of *work to pick up* they would surface **zero**
   unknown items. The issue list's ~100 live rows are not in their vocabulary at
   all.
2. **A mention is a reader.** `unconsumed-status-count-contract`'s own docblock
   says so. `staffUnassigned` satisfies it by being copied into a view model
   nobody paints — the exact state #870 complained about, one layer further in.
   The gate catches *"never crossed into `src/ui/`"* and cannot catch
   *"crossed and was never painted"*.
3. **Their unit is a declared id.** Every defect in §1 that is about a
   *sentence* (#868, #791, #913), a *layout* (#794, #899, #1201), a *balance
   decision* (#540, #587, #591, #641, #973) or a *missing test* (#1257) is
   outside their reach by construction, and #930 records the general form:
   *"a gate whose unit is an id cannot see an orphan inside an object that has a
   reader."*

So the survey agent's suggestion is half right in a useful way. The gates are
the better index **of unconsumed vocabulary**, and they are not a substitute for
the issue list: they are an index of a different, much smaller thing, and the
thing they really demonstrate is the *shape* an honest index has — a denominator
the machine recomputes, plus a written reason for every exception.

---

## 5. The cheap mechanical check, priced

**Not built.** What follows is the proposal and its measured accuracy.

**The check.** A script under `scripts/` — `stale-issues.mjs`, say — run by hand, not a CI job
(`.github/workflows/` is `AGENTS.md` reservation 3 and nothing here justifies
spending it). For each open issue `#N`:

1. `git log origin/main --pretty=%s | grep "(#N)"` — commits on `main` whose
   **subject** cites the issue in this repository's fix convention.
2. `grep -rl "#N\b" src/ tests/` — source or test files that name it.

Print a table; an issue with ≥1 subject citation is a **candidate for closing**
and a human or agent then does what §1 did.

**Its measured output on this tree, today: 38 of the 120 open issues are
flagged, 34 of them by both signals.** That is the whole worklist it produces.

**Its measured accuracy**, against the 20 issues of the unbiased random sample
(the only set where precision means anything — measuring it on the brief's ten
would be measuring it on a set selected for being dead):

- Flagged: 6 of 20 (#663, #703, #913, #930, #1181, #1225).
- Of those, actually dead: 3 (#663, #1181, #1225). **Precision 50 %.**
- Dead in the sample: 3. Flagged: 3. **Recall 100 %.**

Extrapolated: ~38 flagged, ~19 genuinely dead — which lands on the §3 point
estimate of 18 from a completely different direction, and is the strongest thing
this record has to say about that number.

**What it costs.** Two API calls for the issue list, ~120 `git log` invocations
(seconds), maybe 100 lines. The script is cheap; **the verification it hands you
is not** — 38 issues at §1's cost is most of a session.

**What it misses, measured rather than guessed.**

- **Fixes that never cite the number.** #882 and #791 are both dead and both
  scored `commits=0`: #882's fix commits say *"a restored carrier"* without the
  `(#882)` form in the subject, and #791 was closed by the owner's ruling commit
  `23a6f48c`, which names neither. Across the eleven issues this record
  closes the recall is **9/11**; on the brief's own eight dead rows it is
  **6/8**, and these two are the whole of the miss.
- **Half-done issues.** #868 scores `commits=0` and is half fixed; #913 and #930
  score 2 and 1 and are half fixed. A citation says nothing about *which* half.
- **Citations that are not fixes.** #703 (an owner-rulings record) scores 2 and
  #740 scored 1 from a commit that *reported* the defect rather than fixing it.
  Half the flags are this.
- **RECORD issues flag forever.** #703 and #535 have 2 and 0 subject citations
  and 87 and 40 source references; nothing about either will ever make them
  closeable. They need a label, which is cheaper than any script.
- **Everything the issue list gets wrong that is not staleness** — a live issue
  whose premise has been refuted, a duplicate, an issue whose owner decision was
  taken in a chat and recorded on a different issue. None of that is visible to
  a grep over commit subjects.

**The cheapest thing of all is not the script.** Two labels — one for records
and handovers, one for "verified fixed, awaiting close" — would remove the 13
permanent rows from the list and give this record's eleven closures a place to
queue. That costs nothing to run and nothing to maintain, and it is the part a
script cannot do.

---

## Weakest claim

**#899.** It is counted LIVE on the grounds that nothing in the tree clamps or
reframes the canvas at 375×812 and no commit cites the issue — but its finding
is a *measurement in a real browser* (8.2 % of the viewport is canvas, no 64×64
square of reachable canvas exists) and the HUD has been substantially rewritten
by the identity rollout since it was taken. **This record did not re-measure
it**, and a browser reading at 375×812 could move it to DEAD or leave it
standing with different numbers. If it moved, the sample's dead count becomes 4
of 20 and the point estimate rises from 15 % to 20 %.

The second weakest is the §3 interval itself: n = 20 gives 1.2 %–32.0 %, and any
downstream argument that leans on "15 %" as though it were 15 rather than
"somewhere between one and thirty-eight issues" is leaning on the point estimate
of a very small sample.
