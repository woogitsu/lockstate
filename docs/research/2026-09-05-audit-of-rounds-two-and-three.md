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

### 6.1 Both misses are inside a working gate's declared blind spots

`tests/foundation/comment-symbol-existence-contract.test.ts` exists for exactly
this class — *"A comment that names a symbol must name one that exists"* — and it
is green. **Neither miss is a bug in that test.** Its docblock declares both
boundaries that let these through:

- it reads comments **under `src/` and `tests/`**, so `STARTING_ORIGIN_TILE` —
  a three-segment screaming constant in a backticked token, precisely the shape
  the gate matches — survives only because it is in `docs/`;
- it deliberately excludes **two-segment** constants, because they collide with
  prose acronyms and admitting them would need the allowlist the file is built
  to avoid. `BUILDABLE_REGISTRY` is two segments.

So the cheap half of the fix is real and mechanical: extend the same extractor
to `docs/**/*.md` and miss 1 closes outright. Miss 2 is the harder half and the
gate's own reasoning against it still stands; a narrower admission rule is
proposed in the issue body rather than decided here.

**And the second miss is why finding D1 exists.** The argument for
`--hud-build-catalogue-floor` being two rows (`src/ui/tokens.css:415`) rests on
the Build list being two rows tall and therefore donating no height. At
twenty-one rows the premise is inverted — the Build list is the one that scrolls
at every viewport. D1 is not an oversight. It is a decision taken correctly
against a fact that has since changed by a factor of ten, and five comments
still assert the old one.

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

---

## Amendment, 2026-09-05: the superset pass, the fixed sweep and the duplicate check

**§3 is left exactly as it stands and is not corrected in place.** It was true
when written — the pass above was stopped by a budget decision with three things
unreached — and this section is what dated it. That is the form
`docs/adr/README.md` requires of an amendment and the form the previous round's
audit used when it closed its own §7 the same way.

§3 named three gaps: the mechanical superset pass over every `file:line`, the
*"already fixed"* sweep, and the duplicate check against the open issues. All
three were run. This section reports them against `origin/main` at **v0.0.479**
(`0bda941f`), **two** releases past the newest version any tester played and one
past the `376b48bf` §2 above was measured on.

---

### A. Four things in the brief that did not survive the reading

Stated first, because a refutation shown is worth more than a confirmation, and
because two of these change what the sweep below could possibly have found.

**A1. `main` is at v0.0.479 (`0bda941f`), not v0.0.478.** It moved once more
during this pass; every number below is pinned to `0bda941f` and re-running
against a later `main` will not reproduce them exactly.

**A2. Nine of the eighteen pull requests named as the "already fixed" sweep were
already on `main` before the earliest of these ten records was written, so they
cannot have fixed anything any of them says.** The brief introduces
#950, #951, #952, #953, #954, #955, #964, #965, #967, #968, #969, #970, #971,
#980, #981, #984, #986 and #987 with *"everything below landed during or after
those rounds"*. `git log --merges be244a24..0bda941f` lists **ten** merged pull
requests in that whole range: **#968, #969, #970, #971, #980, #981, #982, #984,
#986, #987**. The other nine are ancestors of `be244a24` — the v0.0.469 tree the
first two records were based on — verified one at a time with
`git log --merges be244a24 --grep="Merge pull request #NNN "`. They were on the
build the testers played. A record that still describes their subject as broken
would be *stale on arrival*, which is a different and worse finding than *"since
fixed"*, and section D reports on that separately: it happened four times out of
356, and none of the four involves those nine.

**A3. The list omits #982, which is the one that closes a headline finding.**
`Merge pull request #982 from matmaxalez/feat/the-first-acknowledgement` carries
*"feat(rooms): a designated room says so, which is the first thing this game
acknowledges (#966)"*. On `main` today
`src/ui/simulation-events.ts:519` reads
`'rooms.zoned': { labelKey: 'hud.alert.event.rooms.zoned', severity: 'info', surfaces: 'log-only' }`
and `src/content/default-locale-en.ts:1178` reads
`'hud.alert.event.rooms.zoned': '{room} designated.'`. Two of the ten records
assert in terms that no such sentence exists. See section E.

**A4. Four of the thirteen issues listed as "also live" are closed, and a fifth
is open on a claim that is now false.** Against the full open list
(`list_issues`, `state: OPEN`, 112 issues, enumerated in two pages):

- **#920 is closed**, completed 2026-09-04T14:20 by PR #940 — *before* the first
  of these ten records was committed (2026-09-04T21:53).
- **#902 is closed**, completed 2026-09-04T10:35. §4 above already established
  the revert behind it; this adds that the issue itself is not open.
- **#773 and #529 are not in the open set** at all.
- **#793 is open and its central claim is false.** Its title is *"The minimap
  accepts clicks and does nothing with them — … no handler"*; `hud.ts` has
  carried the handler since before v0.0.469 and `getting-lost`'s own citation of
  `WorldScene.navigateToMinimapPoint` at `src/rendering/scene/world-scene.ts:1279`
  is **exact on `main`**. The brief says this was corrected; the correction is a
  comment (the issue's `updated_at` is 2026-09-05T04:28), and a comment does not
  close an issue. It is still on the open list a duplicate check reads.

**A5. The expectation that these ten records would be dirtier than the previous
five is refuted.** §8 above wrote *"at twenty-five releases of drift rather than
fourteen there is reason to expect worse"*. The measured direction is the
opposite on both axes — 83% of coordinates still exact against the previous
round's 75%, and four already-stale-on-arrival against sixteen. Section C says
why the comparison is not quite like for like.

---

### B. The extraction, and the two traps in it

**356 distinct citations**, counted as a (record, resolved file, span) triple and
de-duplicated. Before de-duplication the ten records contain **379** distinct
(record, *as written*, span) pairs and **436** occurrences; the difference is a
coordinate cited twice in one record under two spellings, most often once rooted
and once bare.

Three shapes, and the third is invisible to the obvious grep:

| shape | example | count |
| --- | --- | --- |
| rooted path | `src/ui/hud/hud.ts:1513-1522` | **210** |
| bare filename | `world-scene.ts:1280` | **71** |
| bare `` `:NNNN` `` continuation | `` (`:176-178`) `` | **75** |

The continuation shape is 21% of the corpus here against 27% in the previous
round, and it behaves no worse than the others (66 exact / 8 drifted / 1 dead).

**Trap 1, the one the previous round disclosed, and it bit again.** A bare
`` `:NNNN` `` inherits the file named before it, and *before it* is not always on
the same line: **66 of the 75** continuations inherit across a line break, the
longest gap being twenty lines. Eleven inherited the **wrong** file and are
corrected by hand below; two of those — `the-standing-crowd`'s `` `:120-121` ``
and `` `:165-166` `` — were reported **exact** by an unguarded comparison against
`prisoner-projection.ts`, which is a false pass of exactly the kind the previous
amendment warned about. They belong to `src/simulation/prisoners/actions.ts`
(`action.eat-meal` at `:120`, `action.yard-recreation` at `:165`), where both are
exact anyway.

The eleven corrections, all resolved from the record's own sentence:

| record | written as | belongs to | how it was settled |
| --- | --- | --- | --- |
| the-hud-a-player-reads | `intake-panel.ts:1592` | `src/content/default-locale-en.ts:1592` | the quoted `'{count} waiting with no bed to sleep in'` is a locale value; `intake-panel.ts` is 387 lines |
| the-hud-a-player-reads | `simulation-build-queue.ts:269-272`, `:274-277` | `src/simulation/presentation/status-strip-projection.ts` | the other rows of the same table cite that file; `simulation-build-queue.ts` is 207 lines |
| the-standing-crowd | `default-sector.ts:1438` | `src/simulation/prisoners/action-system.ts:1438` | the next sentence names `action-system.ts:1438`; `default-sector.ts` is 287 lines |
| the-standing-crowd | `prisoner-projection.ts:120-121`, `:165-166` | `src/simulation/prisoners/actions.ts` | the action ids quoted are defined there |
| the-standing-crowd | `actions.ts:116-117` | `src/simulation/prisoners/actions.ts` | bare filename, two `actions.ts` in the tree |
| what-the-game-tells-you | `simulation-alerts.ts:2148`, `:578` | `src/content/default-locale-en.ts` | both quoted strings are locale values; `simulation-alerts.ts` is 460 lines |
| getting-lost | `actions.ts:2-7` | `src/input/actions.ts` | the six ids quoted are `ACTION_IDS` |
| the-money-runs-out | `dismissal.ts:196` | `src/ui/hud/staff-panel.ts:196` | `STAFF_ROSTER_ROW_SETTLE_MS` lives there, and the same record cites `staff-panel.ts:196` correctly twenty lines earlier |

**Trap 2, new here.** Six of the eleven were caught only because the cited line
number is **past the end** of the file it was attributed to. Where the borrowed
file happens to be long enough — as `prisoner-projection.ts` is — nothing
announces the error, so **an in-range assertion is necessary and not sufficient**.
The other five were caught by comparing the sentence's own quoted text against
the line it points at, which is the check that scales.

---

### C. The result

Read as: **exact** — the line at that number holds, byte for byte, the text the
record was written against, at both revisions; **drifted** — that text is on
`main` at a different coordinate; **no longer true** — the text is not on `main`
at all. Each citation is opened at the merge-base its own record was written
from (v0.0.469 for two records, v0.0.470, v0.0.471, v0.0.475 for the rest) and at
`0bda941f`.

| | fixes real | hud a player reads | standing crowd | rooms nobody builds | what the game tells you | empty work block | getting lost | money runs out | contraband | build flow | **all** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| exact | 19 | 24 | 36 | 36 | 21 | 27 | 45 | 48 | 24 | 16 | **296** |
| drifted | 4 | 13 | 7 | 5 | 13 | 5 | 2 | 6 | 1 | 1 | **57** |
| no longer true | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 2 | 0 | 0 | **3** |

By shape: rooted **167 / 41 / 2**, bare filename **63 / 8 / 0**, continuation
**66 / 8 / 1**.

**Already stale against the `main` that existed when the record was published:
four.** For each record the last `main` commit at or before the record file's own
author date was resolved, and the citation opened there too. Three are
`the-rooms-nobody-builds`'s (`room-projection.ts:214` and `:236-258`,
`rooms-panel.ts:406`) and one is `what-the-game-tells-you`'s
(`messages.ts:1278-1283`). All four are off by one to twenty-one lines and all
four are still true; none is a dead claim.

**Why the comparison with the previous round is not like for like, said before
anyone leans on it.** Those five records were **merged to `main`**, so "already
stale on the commit that carried the record" was measurable against the tree the
record landed in. These ten are on unmerged `agent/playtest-*` branches — §1
above is the finding — so the equivalent question has to be asked against the
`main` that existed at the moment the file was committed. That is a weaker test:
a record cut from a branch that was never rebased has less opportunity to
disagree with `main` than one that was merged into it. The 4-against-16 gap is
real but part of it is method, not hygiene.

#### C.1 The 57 drifted coordinates

Recorded so nobody re-derives them. Every one was located by its own text on
`main`, not by a guess at the offset. Two thirds of the corpus's drift is one
file's growth: `src/content/default-locale-en.ts` accounts for **14** of the 57
and moved by a near-constant +55 lines, and `src/ui/simulation-events.ts` for
another **7**, which is #982 and #966 adding the acknowledgement above them.

| record | as cited | now on `main` | note |
| --- | --- | --- | --- |
| are-the-fixes-real | `src/content/default-locale-en.ts:1917` | `:1972` |  |
| are-the-fixes-real | `src/simulation/events/event-log.ts:655-666` | `:678` |  |
| are-the-fixes-real | `src/simulation/runtime/session-commands.ts:695-716` | `:735` |  |
| are-the-fixes-real | `src/ui/hud/view-model.ts:1860-1867` | `:1894` |  |
| the-empty-work-block | `src/content/default-locale-en.ts:1986` | `:2041` |  |
| the-empty-work-block | `src/content/default-locale-en.ts:2005` | `:2060` |  |
| the-empty-work-block | `src/ui/hud/regime-panel.ts:293` | `:301` |  |
| the-empty-work-block | `src/ui/hud/regime-panel.ts:769-775` | `:777` |  |
| the-empty-work-block | `src/ui/hud/regime-panel.ts:791-817` | `:799` |  |
| the-hud-a-player-reads | `src/content/default-locale-en.ts:1592` | `:1647` | written as src/ui/hud/intake-panel.ts |
| the-hud-a-player-reads | `src/content/default-locale-en.ts:1598` | `:1653` |  |
| the-hud-a-player-reads | `src/content/default-locale-en.ts:2005` | `:2060` |  |
| the-hud-a-player-reads | `src/ui/hud/regime-panel.ts:293` | `:301` |  |
| the-hud-a-player-reads | `src/ui/hud/regime-panel.ts:1140` | `:1148` |  |
| the-hud-a-player-reads | `src/ui/hud/regime-panel.ts:1172-1187` | `:1180` |  |
| the-hud-a-player-reads | `src/ui/hud/regime-panel.ts:1280-1284` | `:1288` |  |
| the-hud-a-player-reads | `src/ui/hud/regime-panel.ts:1507-1526` | `:1517` |  |
| the-hud-a-player-reads | `src/ui/simulation-events.ts:319-337` | `:472` | block edited |
| the-hud-a-player-reads | `src/ui/simulation-events.ts:320-323` | `:472` | block edited |
| the-hud-a-player-reads | `src/ui/simulation-events.ts:325-337` | `:482` | block edited |
| the-hud-a-player-reads | `src/ui/simulation-room-needs.ts:101-111` | `:116` | block edited |
| the-hud-a-player-reads | `src/ui/simulation-room-needs.ts:344` | `:398` |  |
| the-rooms-nobody-builds | `src/content/default-locale-en.ts:1400` | `:1455` |  |
| the-rooms-nobody-builds | `src/simulation/presentation/room-projection.ts:214` | `:235` | ALREADY STALE at publication |
| the-rooms-nobody-builds | `src/simulation/presentation/room-projection.ts:236-258` | `:257` | block edited; ALREADY STALE at publication |
| the-rooms-nobody-builds | `src/ui/hud/regime-panel.ts:1360-1362` | `:1370` |  |
| the-rooms-nobody-builds | `src/ui/hud/rooms-panel.ts:406` | `:407` | ALREADY STALE at publication |
| the-standing-crowd | `src/content/default-locale-en.ts:1592` | `:1647` |  |
| the-standing-crowd | `src/main.ts:2935-2936` | `:2944` |  |
| the-standing-crowd | `src/main.ts:3005-3006` | `:3014` |  |
| the-standing-crowd | `src/simulation/presentation/prisoner-projection.ts:432-460` | `:434` |  |
| the-standing-crowd | `src/simulation/presentation/prisoner-projection.ts:616-638` | `:618` |  |
| the-standing-crowd | `src/simulation/presentation/prisoner-projection.ts:645` | `:647` |  |
| the-standing-crowd | `src/ui/hud/regime-panel.ts:293` | `:301` |  |
| what-the-game-tells-you | `src/content/default-locale-en.ts:1150` | `:1205` |  |
| what-the-game-tells-you | `src/content/default-locale-en.ts:1167-1169` | `:1222` |  |
| what-the-game-tells-you | `src/content/default-locale-en.ts:1201` | `:1256` |  |
| what-the-game-tells-you | `src/content/default-locale-en.ts:1441` | `:1496` |  |
| what-the-game-tells-you | `src/content/default-locale-en.ts:1592` | `:1647` |  |
| what-the-game-tells-you | `src/content/default-locale-en.ts:1686` | `:1741` |  |
| what-the-game-tells-you | `src/content/default-locale-en.ts:2148` | `:2203` | written as src/ui/simulation-alerts.ts |
| what-the-game-tells-you | `src/main.ts:2910-2923` | `:2919` |  |
| what-the-game-tells-you | `src/ui/hud/messages.ts:1278-1283` | `:1295` | ALREADY STALE at publication |
| what-the-game-tells-you | `src/ui/simulation-events.ts:488` | `:664` |  |
| what-the-game-tells-you | `src/ui/simulation-events.ts:519-531` | `:695` |  |
| what-the-game-tells-you | `src/ui/simulation-events.ts:783-805` | `:986` |  |
| what-the-game-tells-you | `src/ui/simulation-events.ts:819-824` | `:1022` |  |
| contraband | `src/ui/simulation-events.ts:488` | `:664` |  |
| getting-lost | `src/main.ts:2106` | `:2115` |  |
| getting-lost | `tests/browser/app-shell.spec.ts:4515` | `:4605` |  |
| the-build-flow | `src/simulation/runtime/session-commands.ts:194-216` | `:213` | block edited |
| the-money-runs-out | `src/content/default-locale-en.ts:1543-1544` | `:1598` |  |
| the-money-runs-out | `src/main.ts:2766` | `:2775` |  |
| the-money-runs-out | `src/main.ts:2988` | `:2997` |  |
| the-money-runs-out | `src/simulation/economy/income.ts:548-556` | `:678` |  |
| the-money-runs-out | `src/simulation/economy/income.ts:747` | `:879` |  |
| the-money-runs-out | `src/simulation/events/event-log.ts:473` | `:496` |  |

#### C.2 The three coordinates that are no longer true, all one constant

| record | as cited | what `main` says now |
| --- | --- | --- |
| the-empty-work-block | `src/simulation/economy/income.ts:401` — `export const STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 0;` | the constant is `40`, at `:513` |
| the-money-runs-out | the same line, cited twice in its §9 | as above |
| the-money-runs-out | `src/simulation/economy/income.ts:347` — the docblock sentence *"Restoring the mechanic is `0` -> `40` on the line below and nothing else"* | the restoration happened. The sentence survives only as a **quotation of a withdrawn rule**, indented under `>` at `:434`, beside the new docblock's *"the suspension carried a condition, and the condition has been met"* |

**Every dead coordinate in 8,433 lines of playtesting is the same constant, and
§4 above predicted it in terms.** It wrote *"the reading is about to expire on
its own … anyone reading §5's row after that merge will be reading a sentence
that was already conditional when it was written."* PR #986 merged; it has.

---

### D. The "already fixed" sweep

Only three of the ten pull requests merged since v0.0.469 change behaviour a
record could be describing: **#980** (issue #938), **#982** (issue #966) and
**#986**. #968, #969, #970, #971, #984 add research records, #981 edits
`docs/AGENT_WORKFLOW.md` and a test budget, #987 fixes a documentation path.
What each closes, with the code opened:

**#986 — the unmet-need withholding is `40` again, and it retires a whole
section.** `src/simulation/economy/income.ts:513`.

| record | what it says | status |
| --- | --- | --- |
| the-money-runs-out §9 | *"the unmet-need withholding is still suspended, and this record's arithmetic is the proof"* — and, from it, *"issue #890 is therefore stale at this version"* | **dead.** The heading, the citation and the inference all go. #890 is live, not stale, which §4 above reached by a different route one release earlier |
| the-money-runs-out §9 | the arithmetic *"every day boundary … closes to the unit on an income of exactly `300 × roomOccupants`"* | **dead as a present-tense claim, sound as a record of v0.0.475.** At `40` a prisoner-day with all six needs unmet pays 60, so those sums no longer close |
| the-empty-work-block | *"the only other constant is the withholding …, suspended at **0**"* | **dead** |
| the-rooms-nobody-builds §6 | *"the money says nothing about rooms at all"*, drawn explicitly from `WITHHELD = 0` | **dead, and it is the substantial one.** Rooms serve needs; needs are priced again. The record's own framing — *"the one channel that was designed to price neglect is switched off on purpose"* — is now false, and its conclusion that a four-room prison's only feedback is a Regime-tab percentage goes with it |

**#980 — the Rooms panel counts a missing doorway, so the predicate two records
quote is gone.** `src/ui/simulation-room-needs.ts:118` is now
`.filter((row) => shortfallOf(row) > 0)`, and the docblock at `:104-105` states
the change: *"The predicate above was `missingCapability > 0` and nothing else,
so a shower room with both its heads placed and no door in its wall line was
reported complete by every readout a player has."*

| record | what it says | status |
| --- | --- | --- |
| the-hud-a-player-reads | *"VERIFIED, read: `simulation-room-needs.ts:101-111`, `unfinishedRoomIds` filters to `row.requirementSummary.missingCapability > 0`"* | **the quoted predicate is dead; the argument built on it survives.** Only rooms short of something are still asked about, so *"a finished, working cell is never the subject of a `hud/room-detail` request"* holds — but an agent sent to that line will not find that filter |
| the-rooms-nobody-builds §7 | the same predicate, plus *"the panel draws at most **one** of them … `ROOM_NEEDS_ROOMS_LIMIT = 1`"* | **half and half.** The predicate is dead; the limit is **still 1**, at `src/ui/hud/rooms-panel.ts:407` (drifted from the cited `:406`) |

**#982 — the game acknowledges the first thing it ever has, and it is a room
being designated.**

| record | what it says | status |
| --- | --- | --- |
| the-build-flow §8 | *"nothing acknowledges any part of building, ever"*, and it names `session-commands.ts:194-216`, the accepted `ZoneRoom` outcome, as *"a site where a true claim is computed and nothing is published"* | **the named site is closed.** That branch now calls `refusals.supersede` **and** records the event; the citation drifted to `:213` |
| the-build-flow §8 | the MEASURED table — five moments of building, `.hud__event` `not laid out` at all five, including *"a room zoned, `rooms 0 → 1`"* | **still reproducible, deliberately.** The ruling of 2026-09-05 in `simulation-events.ts:323-345` sends the acknowledgement to the alerts **log** and not to the band: `surfaces: 'log-only'`. So the band stays empty on a zoning and the record's measurement stands; what changed is that the sentence now exists somewhere |
| the-rooms-nobody-builds §6 | *"No event fired. No alert. No sentence anywhere named a room"* | **dead.** `'hud.alert.event.rooms.zoned': '{room} designated.'` names the room, in the log |

**And the audit above has already rotted, in one release.** Its own coordinates
were re-opened at `0bda941f` as part of this pass. Ten hold exactly —
`object-placement-service.ts:673` and `:627`, `sector-search-duty.ts:126`,
`sector-staffing.ts:190` and `:147`, `simulation-snapshot-feed.ts:107`,
`hud.ts:1513` / `:2092` / `:1555`, `build-panel.ts:986`,
`action-system.ts:1556`, `tokens.css:441` and `:451`, `main.ts:621`,
`staff-panel.ts:449`, `projection.ts:358` — and **four have moved between
`376b48bf` (v0.0.477) and `0bda941f` (v0.0.479)**:

| §2-§6 above | now on `main` |
| --- | --- |
| A1: `session-commands.ts:696`, `refusals.supersede(removeKey)`, arm opening `:665` | `:736`; `:696` is now a comment line |
| §5: `crowd-spread.ts:166-179`, `const progress = count === 1 ? 0 : …` | `:176`; `:86` and `:95` are still exact |
| §6: `docs/PRISONER_OPERATIONS.md:1324`, the `STARTING_ORIGIN_TILE` sentence | `:1335`, and the symbol still does not exist |
| §4: `income.ts:401` | the constant is `40` at `:513` |

**One of A1's three load-bearing facts is not merely moved — it is dead, and it
is the exact trap the previous round's amendment warned about.** §2 records
*"`grep -n "events\.record"` on that file still returns the single `:539`"*. On
`main` that grep returns **two** lines, `:255` and `:579`, and `:255` is
`events.recordRoomZoned(outcome.roomNameKey, context.tick)` — #982's
acknowledgement, landed in the same file. The previous amendment's warning was
that an agent re-running that grep *"will see one line and draw the withdrawn
conclusion"*; the failure mode has now inverted, and an agent re-running it will
see two lines and conclude the file was refactored. Neither reading is what the
count means. **A grep count is the most perishable evidence in this corpus**, and
this is the second round in a row it has expired on the same file.

---

### E. The duplicate check

Run against the full open set: **112 open issues**, enumerated by `list_issues`
in two pages rather than sampled, plus four semantic searches. §3 above said
nothing in the drafted `INDEX.md` should be filed on the strength of the earlier
pass's duplicate check alone; this is the check it was waiting for, and it is
**not** a clean bill.

**E1. #990 and #903 are the same defect, filed twice, five days apart.**

- **#903** (2026-09-03): *"The minimap says it is not available, and the only way
  to learn otherwise is to press it — which a keyboard player cannot do."*
- **#990** (2026-09-05, from these rounds): *"The one control that recovers a
  lost camera is a bare `div`: no `tabindex`, no `role`, no key handler — a
  keyboard player has no way back to their prison."*

One surface, one missing keyboard route, one placeholder sentence. #990 adds the
*consequence* (a camera lost past the loaded bounds cannot be recovered without a
pointer) and the precise accessibility shape §2.2 above corrected; #903 holds the
copy half. **They should be merged, and §2.2 is the reason the merged issue must
not be written as "change the `-1` to `0`".**

**E2. #793 is the third issue on that same surface and it is now false.** It
asserts *"no handler"*; `world-scene.ts:1279` is `public navigateToMinimapPoint`,
and `getting-lost` re-measured the navigation working. It is open, so a duplicate
check run by the next agent will keep finding it. **Closing it is a one-line act
the integrator can take and I am not permitted to.**

**E3. #989 lands in a family of four, and is not a duplicate of any of them.**
#941 (*Covered* at the guard count that makes every **incident** lapse), #893
(the panel's advice *"buys coverage and buys no response"*), #868 (*"the coverage
block calls the prison Covered"* on day one) and #989 (*Covered* at the guard
count at which no **contraband search** can start). Four issues, one badge, four
different mechanisms behind it. Cross-linking is right; closing any of them as a
duplicate would lose a mechanism. §2.1 above sharpens #989 specifically: the
`Math.max(scheduledGuardCount, …)` term means its threshold is a floor.

**E4. #988 overlaps #780 and #894 in surface and not in subject.** #780 is *a
refusal outliving its own subject*; #894 is *a refusal from tick 0 still on
screen on day 9*; #988 is an **event** sentence — the removal's *"the money does
not come back"* — still standing when a differently-shaped press lands. §7 above
is the load-bearing distinction and it is worth repeating in the issue:
`refusals.supersede` supersedes a refusal, not an event, so #780's fix does not
reach #988.

**E5. #890 and #586 overlap in one sentence and should be cross-linked, not
merged.** #586's most-argued corpus position is *"the 40-withhold is the tax.
Give it something to read"*, which is #890's whole subject. #586 is a design
proposal for an overcrowding mechanism; #890 is a defect report about an existing
one being invisible. With #986 merged, **both are live again on the same day** —
and #937 (*"the state pays per occupied place-day … nothing on screen says why"*)
is the third member.

**E6. #960 and #503 are the same measurement a week apart.** #503: *"Measured
over six in-game days: a correct prison tells the player nothing about the two
things that happen to it."* #960: *"A prison being run well publishes nothing:
twenty event types and not one reports something going right."* #960 is the
stronger and better-evidenced statement of #503's finding. **And #982 has now
moved both**: the count is no longer zero. #966, which is the actionable subset
of #960, is **one third closed** — its ZoneRoom site shipped.

**E7. Nothing else in the round's filings duplicates an open issue.** #956,
#957, #958, #959, #961, #962, #963, #972–#979, #983, #985 and #991 were each
compared against the 112 titles and against the nearest neighbours by search;
the closest calls are #956 against #928 (both reach the `KeyZ` removal path,
different defects — #928 is that touch cannot reach it, #956 is that it destroys
the wrong thing silently) and #985 against #719 (both are rail overflow, at
different viewports and from different causes). Neither is a duplicate.

---

### F. This amendment's weakest claim

**That "exact" is a statement about the code and not about the record.** It is
neither — it is a statement about a *coordinate*. 296 citations point at the same
bytes they pointed at when they were written, and the previous round's amendment
already demonstrated that three such citations can be exact by that test and
wrong on inspection. This pass read every sentence attached to a citation only
where the automated quote comparison disagreed with the line (148 citations carry
a quotable code fragment on their own line; 91 matched the cited span outright,
and the 57 that did not were listed and read. Nine of those were opened in the
code, and all nine turned out to be a sentence quoting a *neighbouring* line
rather than a misquotation — for example `contraband`'s
*"`search-system.ts:422-424` increments it when `rng.nextFloat() >= probability`"*,
where the code says `const detected = rng.nextFloat() < probability` and
increments `itemsMissed` in the `!detected` branch, so the record's paraphrase is
right. The other 48 were judged from the sentence alone.) **For the remaining 208
citations, "exact" means the bytes match and nothing more.**

A second weakness, narrower: **the base revision each record is measured against
is its branch's merge-base, not a revision the record names.** Nine of the ten
say nothing about which commit they were read at; the tenth
(`the-standing-crowd`) names `995b631f`, which is its merge-base, which is the
only evidence that the convention holds for the other nine. If any tester read a
file at a tree other than its merge-base, this pass would score a correct
citation as drifted.
