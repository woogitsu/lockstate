# Rounds two and three, audited — 2026-09-05

**What this is.** On 2026-09-05 a coordinator consolidated ten play-testers who
played `origin/main` from **v0.0.469** (`be244a24`) to **v0.0.476** (`413def1c`)
into one report, *"Ten more play-testers, overnight"*, and ranked their findings
against each other in its §11. This document is the **integrator's audit of that
report**, in the form
`2026-09-04-audit-of-the-five-tester-round.md` established for the round before
it: which of its load-bearing claims survive an independent reading of the code,
which do not, and what the round produced that its own report does not say.

`docs/AGENT_WORKFLOW.md` §1 requires a coordinator to verify agents' load-bearing
claims rather than accept them. The report did that for about forty citations and
labelled where it had and had not. This document does the same to *it* — against
`origin/main` at **v0.0.477** (`376b48bf`), one further release past the newest
version any tester played.

> **This audit is PARTIAL and was stopped early, by a budget decision rather
> than by a result.** It reached eleven of the citations it set out to re-open
> and did not reach the rest. §3 names exactly which, because the whole value of
> a pass like this is that silence must not be readable as *"checked and fine"*.

---

## 1. Before the citations: the report's own §10 does not resolve

The audit brief that produced this document said the report's ten primary records
are *"the `docs/research/2026-09-04-*` and `2026-09-05-*` files it lists in §10 —
check which of those are on `origin/main` and read the ones that are."*

**The answer is none of them.** At `376b48bf`, `docs/research/` holds no
`2026-09-05-*` record at all and none of the five `2026-09-04-*` records §10
names. All ten sit on `agent/playtest-*` branches with `wip/playtest-*` snapshots
beside them, and all ten are also carried together on the branch that holds the
consolidated report itself. This is the same finding the five-tester audit made
in its §3 — *"none of the five records was in the repository"* — recurring one
round later at twice the scale, and it is worth stating plainly that **the
five-tester audit is itself not on `main` either**.

**And one of the ten links is dead.** §10's row for `the-empty-work-block` points
at `./2026-09-05-the-empty-work-block.md`. No commit on any branch in this
repository has ever created that path. The record exists and is good; it is
`2026-09-04-the-empty-work-block.md`, dated a day earlier than the row that links
it. Nothing gates this, because the record is not on `main` and
`documentation-links-contract` only sees what is.

---

## 2. The citations re-opened, with outcomes

Read as: **matches** (the coordinate holds byte-for-byte and the claim is
supported), **drifted** (the claim is true, the coordinate moved), **refuted**
(the claim as written is not what the code says). The three the integrator had
already confirmed — A2's five-comment grep, A3's `overdraftTone` guard, D4's
`NEW_PRISON_ORIGIN_TILE` — were not re-run here and are not in this table.

| # | claim, as the report states it | outcome | on `main` at `376b48bf` |
| --- | --- | --- | --- |
| **A1** | `ObjectPlacementService.remove`'s pending arm calls `orders.cancelOrder` directly | **matches** | `src/simulation/objects/object-placement-service.ts:673`, inside `remove` at `:627` |
| **A1** | the `RemoveObject` arm calls only `refusals.supersede` | **matches** | `src/simulation/runtime/session-commands.ts:696`, arm opens `:665`; `grep -n "events\.record"` on that file still returns the single `:539` |
| **A1** | *"byte-identical at v0.0.469 and at today's `main`"* | **matches** | `git diff be244a24 376b48bf` over both files is empty |
| **A5** | `if (claimableGuardIds(this.guards).length < policy.requiredGuardCount) continue;` | **matches**, verbatim | `src/simulation/contraband/sector-search-duty.ts:126` |
| **A5** | the posting requirement is `ceil(occupants / 8)` | **drifted — and the report understates it** | `src/simulation/security/sector-staffing.ts:190` is `Math.max(scheduledGuardCount, Math.ceil(max(0, occupantCount) / 8))`, with `DEFAULT_SECTOR_PRISONERS_PER_GUARD = 8` at `:147`. See §2.1 |
| **A4** | `DEFAULT_POLL_INTERVAL_SECONDS = 30` | **matches** | `src/rendering/feed/simulation-snapshot-feed.ts:107` |
| **A4** | placing an order sets `dirty`, a construction completing does not | **partly reached** | the feed sets `this.dirty = true` at `:243`, `:279`, `:304`, `:311` and `:361`, and gates on `this.dirty \|\| (clockRunning && now >= nextPollAt)` at `:365`. Its own docblock at `:85-89` says *"a build is a command, which already sets `dirty`"* and names *"a route neither `dirty` nor the delta covers"*. **I did not enumerate the completion path**, so the second half of this row is the code's word, not mine |
| **B1** | the click handler writes `minimapNavigable` into the placeholder it advertises | **matches**, and it is exactly as the report reads it | `src/ui/hud/hud.ts:1513-1522`; the handler's own comment at `:1518-1521` states the caution deliberately |
| **B1** | *"the minimap surface is `tabIndex:-1`"* | **REFUTED as a code citation** | see §2.2 |
| **C2** | `const dismissible = alert.occurrences !== undefined;` | **matches**, verbatim | `src/ui/hud/hud.ts:2092` |
| **C8** | `minimapPanel.body.append(minimapSurface, alertsSection.element)` | **matches**, verbatim | `src/ui/hud/hud.ts:1555` |
| **D3** | a catalogue row is `createListRow({icon, label})` | **drifted, substance intact** | `src/ui/hud/build-panel.ts:986-989` is `createListRow({ icon: 'build', label: t(buildable.labelKey), onActivate: … })`. There is a third key; there is still **no price field**, which is the claim that matters |
| **D5** | the own-accommodation path resolves the stored instance and re-checks no gate | **matches**, and the code says it of itself | `src/simulation/prisoners/action-system.ts:1556-1560` (`resolveTargetInstance`) and `:1520-1522` (`prisonProvides`); the comment at `:1565-1568` states the consequence in terms |

### 2.1 A5 is stronger than the report claims, not weaker

The report gives the posting requirement as `ceil(occupants / 8)` and derives
*"the real threshold is posting requirement + 1"*. The line is
`Math.max(scheduledGuardCount, Math.ceil(…/ 8))`. The `scheduledGuardCount` term
means the requirement can be **higher** than the occupant arithmetic alone
predicts — so the gap between "the number the panel prints" and "the number a
sweep needs" is at least what the report measured and may be wider in a prison
with a schedule. The measurement (1 → 0 finds, 2 → 0 finds at `2 of 2 · Covered`,
3 → finds) is unaffected. The arithmetic *behind* it needs the `max` in it.

### 2.2 B1's `tabIndex: -1` is a measurement described as a citation

`minimapSurface` is built at `src/ui/hud/hud.ts:1509-1512` as
`element('div', { className: 'hud-minimap__surface', children: [minimapPlaceholder] })`.
**No `tabIndex` is set.** `grep -n "tabIndex\|tabindex"` over `hud.ts` and
`hud.css` returns nothing for the minimap at all; the only `tabIndex` writes in
the HUD are the roving tab stops in `build-panel.ts:981`, `regime-panel.ts:1409`
and `rooms-panel.ts:599`.

**The tester's finding is true and its wording is not.** A `<div>` with no
`tabindex` attribute has a DOM `tabIndex` *property* of `-1` and is not in the
tab order — which is what a browser probe reports, and it is what the tester
measured. But there is no line of code that says `tabIndex: -1`, so an agent
sent to *"change the `-1` to `0`"* will look for something that is not there.
The honest claim is **"the minimap surface is a non-interactive `div`: no
`tabindex`, no `role`, no key handler"**, and the fix is correspondingly bigger
than the report's *"one-line change to a sentence that already exists"* (§11
item 6) implies: the sentence is one line, the keyboard route is not.

---

## 3. What this audit did NOT reach

Recorded first-class, because a partial pass read as a complete one is worse than
no pass.

- **Not re-opened at all:** every Tier C citation except C2 and C8; D1's viewport
  geometry and the `--hud-build-catalogue-floor` arithmetic; A6's
  `concurrentUseCapacity` grep; B2, B3, B4, B5; C1, C3, C4, C5, C6, C7, C9, C10,
  C11; D2.
- **The §5 re-checks:** only **#890** and **#902** were opened (§4). **#912,
  #641, #595, #794 and #573 were not** — their outcomes in the report's §5 are
  the coordinator's word, unverified here.
- **The duplicate sweep against the ~120 open issues was not run.** One listing
  page of closed issues was read and one semantic search. `INDEX.md` marks every
  drafted issue with what was and was not checked, and **nothing in it should be
  filed on the strength of my duplicate-check alone.**
- **The superset pass the five-tester audit's amendment ran** — mechanically
  extracting every `file:line` from the ten primary records and opening each at
  both revisions — was not attempted. That pass found **44 of 176 citations
  stale, 16 of them already stale on the commit that carried their own record**.
  There is no reason to expect these ten records to behave differently, and at
  twenty-five releases of drift rather than fourteen there is reason to expect
  worse.

---

## 4. Two of §5's re-checks, opened

### #890 is not stale. It is **suspended**, and the word matters this week.

The report's §5 says *"**#890 — stale.** ✅ RE-VERIFIED: the unmet-need
withholding constant is **`0`**, so every day boundary closes on a full
`300 × residents`."*

**The constant is `0`, at `src/simulation/economy/income.ts:401`.** That half is
exact. **The conclusion drawn from it is wrong**, and the file says so eleven
lines above the constant it cites. The docblock at `:461-480` reads:

> `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` is suspended at `0` while
> the owner plays and judges difficulty -- its own docblock carries the ruling
> and the owner's words -- and a mechanism that costs nothing cannot be observed
> through the shipped rate at all.

A constant deliberately switched off by a dated owner ruling, with the mechanism
kept alive and gated (`stateIncomeForPrisonerDayAt` takes the rate as an
argument precisely so the tests can drive it at `40`), is not a stale issue. It
is a live issue with its cost temporarily set to zero.

**And the reading is about to expire on its own.** PR **#986** restores the
constant to `40`. **What is true at `40`:** the same file's `:456-457` states it
— *"300 against a withheld 40 -- the floor is 60 and the clamp never binds"* —
so with all six needs unmet a prisoner-day pays `300 − 6 × 40 = 60` rather than
`300`, and the clamp at zero is unreachable. Every property #890 is about
becomes observable the moment #986 merges. **Anyone reading §5's row after that
merge will be reading a sentence that was already conditional when it was
written.** That is the row to strike, not the issue.

### #902: confirmed, exactly as the report states it

`13c50289` is real and its subject line is the report's claim in the author's own
words: *"revert(hud): withdraw the edge fade; #902 is not this file's to
decide"*, dated 2026-09-04. `grep -c background-attachment src/ui/hud/hud.css`
returns **0**. The issue is closed and the geometry stands — which is what the
five-tester audit's §2 already concluded by a different route, and the two agree.

---

## 5. Two fix-verifications, re-opened

The report's §1 calls #941 and #944 *"landed only partly"*. **Both calls hold**,
and #941's needs one correction.

**#944 — the arithmetic is exact.** `crowdSpreadOffset` at
`src/rendering/actors/crowd-spread.ts:166-179` computes
`progress = count === 1 ? 0 : rank / (count - 1)` and multiplies by
`CROWD_SPREAD_SPAN_TILES_X = 0.44` (`:86`) and `_Y = 0.3` (`:95`). With
`TILE_SIZE_PX = 64` (`src/rendering/tile-metrics.ts:21`) the step between
adjacent ranks is `0.44 / (n − 1) × 64` px: **1.34px at n = 22**, and it falls
under 4px at `n − 1 > 7.04`, i.e. **from n ≥ 9**. Every figure in the report's
row is reproducible from those four lines.

**#941 — true, and there are two badges, not one.** The report says *"the badge
is still green `Covered`"*. That is true of the **Staff panel**, where
`staff-panel.ts:449-451` returns `tone: 'success'` with
`securityCoverageMet`. It is **not** true of the status strip: `coverageTone`
at `src/ui/hud/projection.ts:358-362` returns `undefined` — not `success` —
when nobody is understaffed or unguarded, and its docblock at `:345-357`
argues that choice deliberately (*"a status strip where several things are
always amber teaches players to ignore amber" applies to green as well; the
badge still says "Covered" in words, so the state is never carried by colour
alone*). So the green is in one surface and the word is in both, and a fix
aimed at "the badge" has two call sites with two different existing arguments
behind them.

---

## 6. The documentation rot, verified — and it is wider than reported

The report's §8 names two items. Both are real. The second is bigger than it says.

**`STARTING_ORIGIN_TILE`: confirmed.** `docs/PRISONER_OPERATIONS.md:1324` reads
*"filled by `src/main.ts` from the same `STARTING_ORIGIN_TILE` the Build…"*. A
grep for that identifier across every `.ts` and `.md` in the tree returns
**that one line**. The symbol does not exist. `src/main.ts:621` carries
`NEW_PRISON_ORIGIN_TILE`, which is what the sentence means.

**The catalogue token: confirmed, wrong token, and five comments not one.** The
report says *"the catalogue-height token justifies its value by saying the
buildable registry 'has two entries'"*. The sentence is at
`src/ui/tokens.css:441` and it belongs to **`--hud-rooms-catalogue-floor`**
(`:451`), not to `--hud-build-catalogue-floor` (`:415`) — it justifies the
*Rooms* floor being one row by comparison with the Build panel's two:

> `BUILDABLE_REGISTRY` has two entries, so the Build panel's two-row floor *is*
> its list's height and the list donates nothing

**And the same dead premise is in four more comments**, all in
`src/ui/hud/hud.css`: `:916` (*"the two buildables `BUILDABLE_REGISTRY`
defines"*), `:983`, `:1219` (*"the floor *is* the list's own height, 88px"*)
and `:2697`. Meanwhile `src/ui/hud/build-panel.ts:753` and `:1579` say
**twenty-one** rows, in the same tree. So the repository contradicts itself
about the size of its own catalogue, in two files, in the direction that makes
a deliberate layout decision unreadable.

**Worse than either: `BUILDABLE_REGISTRY` is not a symbol.** It has **six**
occurrences in `src/` and every one is inside a comment. Like
`STARTING_ORIGIN_TILE`, it names something that does not exist — and unlike it,
five of the six carry a *number* that is also wrong, which is what turns a
naming slip into a layout argument nobody can check.

---

## 7. What the audit did not have to correct

Stated because the five-tester audit's §5 was right that the risk runs both ways.

Of the eleven citations opened here, **nine matched or drifted with their
substance intact, and one was refuted only in its wording**. A1 — the report's
own first recommendation, and the one the brief most wanted opened — is exact on
all three of its load-bearing coordinates and byte-identical across the whole
range of versions these rounds played. A5's verbatim line is verbatim. C2 and C8
are verbatim. That is a good record for ten testers across twenty-five releases,
and it is consistent with the 132-of-176 the previous round's superset pass
measured.

**One thing the report does not say about A1, and should.** The pending arm's
silence is now **deliberate and documented**: the comment at
`object-placement-service.ts:648-651` reads *"The pending-order arm below records
nothing: it refunds, and a sentence about money that does not come back is false
of it."* So the fix is not "make the silent arm speak the sentence the other one
speaks" — the code has already refused that, correctly. The live defect is the
one the report's own title names and its body then drops: **the previous
removal's sentence is still standing on the band when the silent press lands**.
Nothing in that comment addresses the band's lifetime, and `refusals.supersede`
supersedes a *refusal*, not an *event*. The report is right that no new string is
needed; it is right for a different reason than it gives.

---

## 8. This audit's own weakest claim

**That eleven citations, chosen by a brief rather than by the records, say
anything about the other ninety-odd.** The previous round's audit named exactly
this weakness — *"roughly thirty re-verified citations generalise to the rest"* —
and a later pass then closed it by re-opening 176 and finding 44 stale, 16 of
them already stale on the commit that carried their own record. **This pass is a
third the size of the one that was found wanting**, on a round with nearly twice
the drift. I have no basis for believing these ten records are cleaner than those
five were, and one weak signal that they are not: §10's link to
`the-empty-work-block` is broken, which is the same class of error as an off-by-
one coordinate and was found without looking for it.

**What would change it:** the mechanical superset pass — extract every `file:line`
from all ten records, open each at the version its record names and at `main`,
count exact / drifted / dead. §3 lists what is untouched. That is a reading pass,
not a play session, and every record names its own coordinates.

**A second, narrower weakness.** Three of the outcomes in §2 rest on a grep
returning nothing (`tabIndex` in §2.2, `background-attachment` in §4,
`STARTING_ORIGIN_TILE` in §6). A grep that finds nothing is the easiest evidence
in this repository to get wrong, because a different spelling reads exactly like
an absence. I spelled each of those three the way the source spells it and
checked the positive control in the same file; that is not the same as proof.

---

## 9. The ten records

None of these is on `main`, so they are named without a rooted path, the way the
fifty-prisoner note names its own. Each sits on `agent/playtest-<slug>` with a
`wip/playtest-<slug>` snapshot beside it.

| tester | record |
| --- | --- |
| `are-the-fixes-real` | `2026-09-04-are-the-fixes-real.md` |
| `the-hud-a-player-reads` | `2026-09-04-the-hud-a-player-reads.md` |
| `the-standing-crowd` | `2026-09-04-the-standing-crowd.md` |
| `the-rooms-nobody-builds` | `2026-09-04-the-rooms-nobody-builds.md` |
| `what-the-game-tells-you` | `2026-09-04-what-the-game-tells-you.md` |
| `the-empty-work-block` | `2026-09-04-the-empty-work-block.md` — **not** the `2026-09-05-` path §10 links |
| `getting-lost` | `2026-09-05-getting-lost.md` |
| `the-money-runs-out` | `2026-09-05-the-money-runs-out.md` |
| `contraband` | `2026-09-05-contraband.md` |
| `the-build-flow` | `2026-09-05-the-build-flow.md` |

The consolidated report is `2026-09-05-playtest-rounds-two-and-three.md`, also
not on `main`.
