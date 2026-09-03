# `src/ui/hud/regime-panel.ts`, checked against the decisions it implements

**Question.** `docs/adr/STATUS-QUEUE.md` cites `src/ui/hud/regime-panel.ts`
exactly once, and that mention is a bullet naming it as one of eighteen files
the delta method's window *excludes*. No live-claim section of that document
cites it at all, so no audit of this file against the decisions it implements
had ever been taken. This is the first: what does it claim, and does the code
still do it?

**Decision it feeds.** None. This is a report. Nothing here proposes a
`STATUS-QUEUE.md` §5 entry, nothing here changes an ADR's `Status`, and no file
under `src/` was touched — `src/ui/hud/regime-panel.ts` was being edited by
another agent (issue #895, the prisoner inspector) throughout this pass, so it
was read and never written.

**Ground.** Every claim below was read on `origin/main` in a worktree at
`ac58c457` (v0.0.427). **`fc74aa3b` (v0.0.428) landed while this was being
written and is merged in**, so the anchors below are true of v0.0.428 and the
findings were taken at v0.0.427 — see the note on citation rot below, which is
about exactly that gap. `git fetch origin main` was run immediately before both
`git worktree add` and the merge, per
`docs/AGENT_WORKFLOW.md`'s 2026-09-02 addendum about a stale `origin/main`
inside a worktree; `ln -sfn /workspace/lockstate/node_modules
<worktree>/node_modules` was made first, and every tool below was invoked as
`node node_modules/<tool>/...` rather than through `pnpm`, per the same
document's note that `pnpm <script>` aborts in a worktree with a symlinked
`node_modules`.

**How the anchors in this file are written, and why.** `docs/AGENT_WORKFLOW.md`
§4 rates a `file:line` into a document under active edit as the least durable
citation here. `src/ui/hud/regime-panel.ts` was under active edit while this was
written, so **every claim below leads with the quoted sentence and carries the
line number second**. The quotes are what to grep for.

**That is not advice, it is what happened to this note in the hour it took to
write.** `fc74aa3b` (v0.0.428) merged issue #877 while this pass was running.
It touched no file this audit found a defect in — `src/ui/hud/regime-panel.ts`
is untouched by it — but it added 356 lines to `src/ui/hud/staff-panel.ts`, 31
to `src/ui/hud/hud.ts`, 20 to `src/ui/hud/messages.ts` and one HUD module to
`tests/unit/ui-hud-messages.test.ts`'s pinned inventory, and **eleven anchors
in the draft of this note went stale at once**: `staff-panel.ts:107` became
`:108`, `:114` became `:116`, `:123` became `:125`, `:189-193` became
`:222-225`, `:302` became `:335`, `:627-630` became `:661-663`;
`hud.ts:1785` became `:1800`, `:1789` became `:1804`, `:1958` became `:1973`;
`ui-hud-messages.test.ts:72` became `:73` and `:419-424` became `:420-425`.
Every one was re-derived from its symbol and re-opened, and every one still
lands on the code its sentence means. **Not one claim in this note changed** —
only the coordinates did, which is the interval `docs/AGENT_WORKFLOW.md` §2's
2026-09-02 bullet records as the finding in its own right. The anchors into
`src/ui/hud/regime-panel.ts` will go the same way the moment #895 merges.

## Coverage, counted rather than claimed

**Twenty decisions are named in the file's own docblocks**, collected by reading
all 805 lines and extracting every ADR number, issue number, owner ruling, gap
and contract document it cites:

| # | Decision | Where the file names it |
| --- | --- | --- |
| 1 | Issue #451 — an observation surface for the prison's day and its people | `:18` |
| 2 | ADR 0022 (as amended 2026-08-25) — the tab bar is full at five | `:22` |
| 3 | Issue #535 decision 6 — each row draws that prisoner's worst need | `:51` |
| 4 | Issue #488 — `STATE_INCOME_UNMET_NEED_LEVEL` is a line the simulation acts on | `:70` |
| 5 | Issue #506 — "never admitted" is not "fully discharged" | `:450`, `:702` |
| 6 | Owner's ruling of 2026-09-03 — the emptied prison gets its own sentence | `:716`, `:724` |
| 7 | Issue #703, the owner's fourth ruling of 2026-08-31 — four rows, tier-ordered | `:156` |
| 8 | Issue #209 — a row the player is reading must not move under them | `:164` |
| 9 | ADR 0090 — `Medium` as a warning, capped so it can never move a group | `:226`, `:250`, `:270` |
| 10 | Owner's ruling of 2026-09-02 on issue #788 — tier 2 gets a tone of its own | `:220`, `:263` |
| 11 | ADR 0080 — crossing into high risk draws contraband | `:229` |
| 12 | ADR 0015 — a name is not localizable content, and its halves are ordered by the locale | `:393` |
| 13 | `AGENTS.md` boundary 1 — the HUD may not import the simulation | `:43`, `:268` |
| 14 | `AGENTS.md`'s fourth exclusion — no player-facing sentence is authored here | `:84`, `:253`, `:376`, `:710` |
| 15 | `docs/HUD_PROJECTIONS.md` gap 7 — no need warning threshold exists | `:57`, `:72`, `:347` |
| 16 | Gap 10 — a position is written on arrival and never in between | `:97` |
| 17 | Gap 11 — where a prisoner *is* is unprojected | `:101` |
| 18 | Gap 5, via the withdrawn `HH:MM` readout — there is no hour of day | `:105` |
| 19 | `docs/TESTING.md` — the Vitest environment is `node`, so a decision must be a pure exported function | `:186`, `:330` |
| 20 | Issue #877 — a pooled element keeps the last subject's state | `:739` |

**Eight more it honours without naming**, found by working outward from what it
reads rather than from what it cites — the projection field, the constant, the
cadence and the ordering each belong to a decision the docblock argues from and
does not attribute:

- **ADR 0005** — the canonical entity order that makes the roster's tie-break
  stable. The panel describes the order at `:168` and never names the ADR;
  `src/simulation/presentation/prisoner-projection.ts:416` and
  `src/ui/hud/view-model.ts:1750` both do.
- **ADR 0011** — ids and message keys, never text. Reached only through ADR
  0015's argument at `:393`; every string the panel renders is a
  `LocalizationKey` or a name.
- **ADR 0026** — an index is recycled behind a wrapping generation, which is why
  the reader asks for one window and no offset
  (`src/ui/simulation-prisoner-roster.ts:217`).
- **ADR 0025** — one panel in the rail's side slot, which is what makes the
  height budget the panel spends available at all (`src/ui/hud/staff-panel.ts:116`).
- **ADR 0003** — the worker publishes unsolicited, which is what makes a pulled
  readout move (`src/main.ts:1726`).
- **ADR 0086** — what actually refreshes a pulled readout. The panel states a
  cadence at `:520` and names no source; this is finding 4.
- **`docs/HUD_PROJECTIONS.md` §4 and §6** — a bounded value withholds its raw
  value and its raw maximum, which is why the bar is driven on per-mille.
- **`AGENTS.md` boundaries 3 and 5** — the composer holds no state the
  simulation owns, stated at `:42` as house style with no citation.

**88 discrete checkable assertions were extracted and 82 were checked
mechanically, opening both sides.** Six were not reached, and they are named
below rather than absorbed. **Seven disagreements were found**, one of which is
in a neighbouring file. That yield is higher than
`docs/research/2026-09-02-accepted-adrs-against-main.md`'s one-in-nineteen, and
the reason is visible in the dates: five of the seven were false in the commit
that wrote them, and this file had never been read against its own code.

**What was not reached (6):**

1. The five-viewport row-height table at `:131-137` (44.7 / 27.5 px). A browser
   measurement. Not re-taken: the box was running other agents' suites
   throughout, and `docs/AGENT_WORKFLOW.md` §2 is explicit that a contended run
   proves nothing. The assertion that guards it,
   `tests/browser/ui-shell.spec.ts:5242`, exists verbatim.
2. `.hud-tabs__inner` spanning 1.8 to 373.2 at 375x812 (`:27`). Same reason. It
   agrees exactly with `src/ui/hud/hud-state.ts:18`, which is where the panel
   got it, so the two are consistent even though neither was re-measured.
3. The 219.0 px held-guard block at 900x600 (`:117`). Agrees exactly with
   `src/ui/hud/staff-panel.ts:108`, not re-measured.
4. ADR 0086's harness table of 120 and 178 refreshes in 30 s
   (`docs/adr/0086-what-refreshes-a-pulled-hud-readout.md:116-118`). Read, not
   re-measured.
5. The locale search asserted at `:707` — *"every other 'nobody'/'empty' string
   names a different subject"*. A claim about what a search found at the time,
   over a file that has changed since; not re-run.
6. The superseded shape asserted at `:539` — *"the same three `delete`s written
   twice"*. A claim about code that no longer exists; not checked against
   history.

---

## Finding 1 — the panel's public interface documents the opposite of what the panel does

**Which is wrong: the document.** The code is right and its own comment says so
twelve lines away; a docblock 280 lines above was not carried along.

**The claim**, `src/ui/hud/regime-panel.ts:449-452`, in `RegimePanel.setRoster`'s
docblock:

> `undefined` hides the block. `total: 0` draws the empty sentence only
> when `everAdmitted` is also false -- see `paintRoster`'s own comment
> (issue #506) for why a roster that emptied by discharge draws no
> sentence at all rather than this one, which would be false of it.

**What the code does**, `src/ui/hud/regime-panel.ts:733-742`:

```
    rosterEmpty.hidden = shown.length > 0;
    if (!rosterEmpty.hidden) {
      ...
      rosterEmpty.textContent = t(
        roster.everAdmitted ? HUD_MESSAGE_KEY.regimeRosterEmptied : HUD_MESSAGE_KEY.regimeRosterEmpty,
      );
    }
```

An empty roster **always** draws a sentence now, and `everAdmitted` chooses
which of two it is. A roster that emptied by discharge draws
`regimeRosterEmptied`, not nothing.

**`paintRoster`'s own comment already says this**, at `:724-729`:

> **The owner ruled the missing sentence on 2026-09-03, so the box no
> longer goes dark on the second state.** ... So the visibility test drops its
> `everAdmitted` half -- an empty roster always draws a line now -- and
> `everAdmitted` becomes the choice of *which* line.

**When it became false.** `96ec6130`, *"An emptied-out prison says so, in the
owner's own sentence (owner's ruling of 2026-09-03)"*, at
2026-09-03T16:38:18+00:00 — under four hours before this pass. That commit's diff
against `src/ui/hud/regime-panel.ts` is a **single hunk**, `@@ -720,7 +720,27 @@`,
which replaced `rosterEmpty.hidden = shown.length > 0 || roster.everAdmitted;`
and added the paragraph quoted above. The `setRoster` docblock sits at `:446`,
outside that hunk, and carries wording introduced by `2a78e98a` (issue #506)
that the ruling superseded.

**Why this one matters more than its size.** It is the docblock on the
**exported interface** — the sentence a caller reads instead of reading
`paintRoster`. It tells that caller the panel will draw nothing in the state the
owner has just ruled must draw something.

**What a fix would have to convey** (the sentence itself is not mine to write —
`AGENTS.md`'s fourth exclusion covers player copy, and this is a comment, but
the *behaviour* it describes is the owner's ruling): that an empty roster always
draws a line, and that `everAdmitted` selects which of the two shipped keys it
is. Marking both directions per §4 would keep the #506 sentence as what the
panel used to do.

---

## Finding 2 — the header claims the tab this panel fills is bound to no panel

**Which is wrong: the document**, and it was wrong in the commit that wrote it.

**The claim**, `src/ui/hud/regime-panel.ts:22-28`:

> The `regime` tab has rendered nothing since ADR 0022 measured the tab bar
> full at five and `hud-state.ts` gave the last slot to Rooms. It is the only
> one of the five bound to no panel, and `tests/browser/ui-shell.spec.ts`
> pinned that emptiness deliberately rather than as an oversight.

**What the code does.** `src/ui/hud/hud.ts:1800` constructs this very panel,
`:1804` appends it to the rail, and `:1973` binds it to that tab:

```
    regimePanel.setVisible(state.activeTab === 'regime');
```

So the `regime` tab is bound to a panel — this one. And
`tests/browser/ui-shell.spec.ts` no longer pins any emptiness: `:4922` asserts
the opposite, *"the panel rendered no title"* as its failure message, and
`:5222` asserts four roster rows exist.

**When it became false: immediately.** `f8393f00`,
*"Build the observation surface: a prisoner roster and a Regime panel on the
empty fifth tab (#459)"*, 2026-08-28T11:31:05+02:00, added both the docblock and
the binding. Its own commit message states the fact correctly and in the past
tense — *"a fifth HUD tab was declared, rendered and bound to no panel"* — and
then *"This adds a prisoner roster off hud/prisoner-roster and a Regime panel
off hud/status-strip, filling that tab."*

**This is the weakest of the seven and it is labelled as such.** The paragraph
sits under the heading *"Why it is here, and why it is one panel and not two"*,
so a reader who knows the file exists can read the whole passage as the state of
the world immediately before it. What defeats that reading is the tense — "has
rendered nothing", "It **is** the only one" — and the third clause, which is a
claim about a suite that today asserts the reverse. **What would change my
mind:** an explicit marker that the paragraph is historical. There is none, and
this file marks both directions elsewhere (`:64`, `:219`, `:716`) whenever it
means to.

---

## Finding 3 — the `info` badge's stated purpose names the one intake state that never produces it

**Which is wrong: the document**, and it was wrong five days before it was
written.

**The claim**, `src/ui/hud/regime-panel.ts:285-288`:

> No group at all: the prisoner is still in intake, and neither tier nor
> group has been written. `info` rather than `neutral`, so a prison whose
> arrivals are stuck at cell assignment does not read as a settled one --
> the Intake panel on the Overview tab is where that is diagnosed.

**What the code does.** The `info` branch fires on exactly one condition,
`src/ui/hud/regime-panel.ts:289`:

```
  if (row.classificationGroupId === undefined) {
```

and the projection omits `classificationGroupId` only before classification has
run. `src/simulation/presentation/prisoner-projection.ts:122`:

```
const CLASSIFIED_STAGES: readonly IntakeStage[] = ['accommodation-assignment', 'completed', 'failed'];
```

with `isClassified` at `:312-314` and the six stages at
`src/simulation/prisoners/components.ts:19` — `queued`, `reception`,
`classification`, `accommodation-assignment`, `completed`, `failed`.

**A prisoner stuck for want of a cell is at `accommodation-assignment`, which is
a classified stage.** `src/simulation/prisoners/intake-system.ts:565`:

```
          continue; // stay in accommodation-assignment; retried next scheduled tick
```

and the counter that exists to measure exactly that wait,
`src/simulation/prisoners/intake-system.ts:42`:

> Cumulative ticks any prisoner has spent waiting in accommodation-assignment
> because every matching room instance was full -- observable unmet demand, not
> hidden success.

So a prison whose arrivals are stuck at cell assignment renders those rows with
a **tier** tone — `neutral`, `caution` or `warning` — and a **tier** word, never
`info` and never an intake stage. `info` is reachable only for `queued`,
`reception` and `classification`.

**When it became false.** `CLASSIFIED_STAGES` has included
`'accommodation-assignment'` since `a8366a8f`, *"Add the HUD read-model layer"*,
2026-08-23T16:04:44+02:00. The comment was written in `f8393f00`, five days
later.

**The tone choice itself is unaffected.** `info` for a pre-classification row is
a defensible distinction and nothing here argues against it; what is false is
the example given for why, and it is the example a reader would use to decide
whether the tone is doing its job.

**A second reading, and why I do not take it.** "stuck at cell assignment" could
be read loosely as "stuck somewhere in intake". I do not take it because the
stage has that name in this repository, because the sentence's whole force is
naming a specific stall a player would care about, and because the stall it
names is the one the simulation counts by name.

---

## Finding 4 — the panel repeats a cadence sentence that two neighbouring files corrected, and that ADR 0086's sweep did not reach

**Which is wrong: the document.** The code is right, the correction already
exists twice in the tree with dates and issue numbers, and the panel's copy was
outside the inventory of the sweep that removed the others.

**The claim**, `src/ui/hud/regime-panel.ts:518-522`:

> Pooled where the timetable above is rebuilt, and the difference is the
> badge: `createStatusBadge` builds an element per row and this block
> repaints on the counts cadence, so rebuilding would discard and rebuild
> `PRISONER_ROSTER_ROW_LIMIT` badges twice a second for a list whose length
> never changes.

**Both halves are false: it is not the counts cadence, and it is not twice a
second.** `src/main.ts:1165-1179`:

> **Which cadence, corrected 2026-09-01 (issue #718). This is the one place
> in this file that states it; the eight comments below point here.** This
> paragraph read *"**On the counts cadence** ... `simulation/status-counts`
> arrives up to twice a second while a session exists"* ... **All of them were
> false the day they were written** ... So the binding cadence of every pulled
> readout in this file is the **clock heartbeat at 250 ms**, and the counts
> channel's change gate never bounded it at all.

And the panel's own reader, `src/ui/simulation-prisoner-roster.ts:206-215`:

> **"twice a second" is the counts cadence and this reader does not ride
> it (corrected 2026-09-02, issues #718 and #765).** ... `CLOCK_STATE_PUBLISH_INTERVAL_MS`
> is 250 against the counts channel's 500 ... so **up to about four a second,
> not two**.

The two constants, `src/simulation/worker/state-machine.ts:64` and `:106`:

```
export const CLOCK_STATE_PUBLISH_INTERVAL_MS = 250;
export const STATUS_COUNTS_PUBLISH_INTERVAL_MS = 500;
```

**Why the panel kept it: it was not in the sweep's inventory.** ADR 0086 §8,
*"Where the documentation says something else"*
(`docs/adr/0086-what-refreshes-a-pulled-hud-readout.md:299-304`), enumerates the
sites it corrects — `docs/HUD_PROJECTIONS.md` §9 at six line numbers and
`src/main.ts` at nine. `src/ui/hud/regime-panel.ts` appears nowhere in that ADR
at all (`grep -n "regime-panel\|regime panel"` over it returns nothing), so the
one copy of the sentence outside the two files it listed survived.

**When it became false: the day it was written**, and ADR 0086 says so about
this class of sentence and names the commit
(`docs/adr/0086-what-refreshes-a-pulled-hud-readout.md:310-315`):
*"it was false the day each sentence was written. `hudClockFromWorkerMessage`
has been in that listener since `f8393f00` (#459), which is the commit that
introduced `refreshPrisonerRoster` itself"*. `f8393f00` is also the commit that
wrote `:520`.

**The decision is not affected, and this is the part to relay.** The comment's
conclusion — pool the rows rather than rebuild them — gets **stronger** at four
refreshes a second than at two. `src/ui/simulation-prisoner-roster.ts:212-215`
draws exactly that conclusion about its own copy: *"the argument is unchanged
and only gets stronger ... The cost this window refuses is therefore roughly
double what this sentence priced."* Nothing about the pooling should change;
one sentence of fact should.

---

## Finding 5 — "the single reader of the flag" had two readers in the commit that wrote it

**Which is wrong: the document**, in the same commit.

**The claim**, `src/ui/hud/regime-panel.ts:89-90`:

> If the owner wants a different line, `STATE_INCOME_UNMET_NEED_LEVEL` is the
> single edit and `describePrisonerNeed` is the single reader of the flag.

**The second reader**, `src/ui/hud/regime-panel.ts:697`:

```
      row.element.dataset['needUnmet'] = String(prisoner.lowestNeed.unmetForStateIncome);
```

It reaches past the helper because `PrisonerNeedReadout`
(`src/ui/hud/regime-panel.ts:355-361`) carries `tone`, `labelKey` and `permille`
and **not** the flag, so the code that writes `data-need-unmet` has no route to
it through `describePrisonerNeed`. Full inventory in the HUD:

```
$ grep -rn "unmetForStateIncome" src/ui/ | grep -v view-model.ts
src/ui/hud/regime-panel.ts:80    (prose)
src/ui/hud/regime-panel.ts:342   (prose)
src/ui/hud/regime-panel.ts:366   describePrisonerNeed
src/ui/hud/regime-panel.ts:697   the dataset write
src/ui/simulation-prisoner-roster.ts:143  carries it across the boundary
```

**When it became false: at once.** Both the sentence and the second reader
landed in `041fb440`, *"Show each prisoner's worst need in the roster (#535
decision 6) (#542)"*, 2026-08-29T15:05:11+02:00 — 607 lines apart in one commit.

**The other half of the sentence holds.** `STATE_INCOME_UNMET_NEED_LEVEL` really
is a single edit: it is defined once
(`src/simulation/economy/income.ts:307`) and compared once, in
`isNeedUnmetForStateIncome` (`:371-373`), which is the predicate
`unmetNeedCount` (`:389-396`) sums to compute the money. The panel holds no
threshold and no comparison, exactly as `:341-345` claims.

**This is the shape `docs/AGENT_WORKFLOW.md` §4 names first** — *"a sentence
asserting an absence or a count rots first ... the only"* — with the sharpest
possible interval: zero commits.

---

## Finding 6 — a neighbouring type says the roster window is in entity-index order

**Which is wrong: the document.** Reported and not fixed: it is under `src/`,
which is not this pass's to touch.

**The claim**, `src/ui/hud/view-model.ts:1750`:

```
  /** The window the panel asked for, in ascending entity index (ADR 0005). */
  readonly rows: readonly HudPrisonerRowViewModel[];
```

**What the code does.** `projectPrisonerRoster` is a counting sort on the risk
tier, highest first, with entity index as the tie-break only.
`src/simulation/presentation/prisoner-projection.ts:415-417`:

> One window of the prisoner roster, **highest risk tier first**, ties broken
> by ascending entity index -- the same canonical order `EntityQuery.execute()`
> walks (ADR 0005), so paging is stable across ticks and identical on every
> client.

**When it became false.** `27707e62`, *"Put the high-risk count on the strip,
and sort the Regime roster by tier (#703) (#710)"*. The comment was written in
`f8393f00` and was correct then.

**The panel is the file that is right here.** `src/ui/hud/regime-panel.ts:156-171`
describes the new order accurately, including that the reordering is bound by
issue #209's rule, and it is that paragraph which makes the stale line one
module over visible at all. Included because a reader sent to the view model to
learn what `rows` holds is told the pre-#703 answer.

---

## Finding 7 — the activity gloss names one of three phase words as if it were the only one

**Which is wrong: the document**, narrowly. The behaviour is right.

**The claim**, `src/ui/hud/regime-panel.ts:410-413`:

> Two forms and not three. A prisoner performing an action is described by the
> action's own word -- "Showering", "Yard Time" -- and a prisoner with no
> action selected by the phase's, which is "Idle". Only the walk gets a
> wrapper, because only the walk is about a place the prisoner is not yet.

**What the code does.** `src/ui/simulation-prisoner-roster.ts:128-132` derives
the label from the phase whenever no action is selected, and there are three
phases, not one — `src/simulation/prisoners/components.ts:242`:

```
export const ACTION_PHASES = ['idle', 'travelling', 'performing'] as const;
```

with labels `{ idle: 'Idle', travelling: 'Travelling', performing: 'Performing' }`
at `src/content/simulation-message-keys.ts:225`. The case that contradicts the
gloss is documented explicitly in the field the panel reads,
`src/ui/hud/view-model.ts:1679-1682`:

> True only while the prisoner is walking **to a named action**. A phase of
> `travelling` with no action selected cannot name a destination, so it is
> reported as the phase instead and this stays `false`.

So a prisoner with no action selected and a `travelling` phase reads
"Travelling", and `formatPrisonerActivity` renders it correctly — `row.travelling`
is `false`, so no wrapper is applied and the phase word is printed as-is. The
sentence *"Two forms and not three"* is right about the panel's branching; the
gloss *"which is 'Idle'"* is right about the common case and wrong about a case
the type it reads from calls out by name.

Lowest severity of the seven, and included because it is the only one where the
file contradicts a docblock it is directly reading from.

---

## Five citations that drift by one symbol or one clause, and are not findings

Each was opened and each holds in substance. They are recorded because the brief
for this pass named "a citation one level too high" as a way to be wrong in both
directions, and these are the instances of it in this file.

1. **`:315` attributes the double-quantization warning to `toBoundedValue`.**
   The warning is on `computeFilledSegments`
   (`src/simulation/presentation/view-model.ts:142-146`): *"Going through an
   integer per-mille first quantizes twice: 1/255 rounds to `permille: 4`"*. One
   symbol over, in the same file, and `toBoundedValue` calls it.
2. **`:507` names `.hud-intake__pipeline-stage` as "the handle".** The
   id-carrying handle is `line.dataset['stage']`
   (`src/ui/hud/intake-panel.ts:324`), on the same element as that class; the
   class alone would still require counting rows, which is what the sentence
   says the handle avoids. The precedent is otherwise exact, including its
   wording — `src/ui/hud/intake-panel.ts:322-323` reads *"The stage's own id, so
   a browser assertion can find the line about one stage rather than counting
   rows."*
3. **`:165`'s quote of issue #209's rule is truncated where the scope changes.**
   `src/ui/simulation-alerts.ts:449-450` reads *"the position of a row the
   player is already reading must not change under them **when the same fault
   recurs** -- the same property `HudAlertViewModel.id` exists for"*, and the
   panel quotes it up to "under them". The broader property is genuinely kept by
   the projection's total order, so nothing rests on the truncation; the
   attribution to #209 is fair — that issue is the browser-executed rendering
   and UI audit whose nine findings became #199 through #208, and
   `src/ui/simulation-alerts.ts:201` credits it with the ordering measurement.
4. **`:167-169`'s "only when" omits a third case, and simplifies the key.**
   *"a row moves only when that prisoner's tier changes or somebody above them
   leaves"* — a prisoner *below* being promoted above also moves the row, and it
   moves down. The sort key's lowest rank is also not tier 0 but
   `UNCLASSIFIED_ROSTER_RANK = -1`
   (`src/simulation/presentation/prisoner-projection.ts:398`), so an unclassified
   arrival sorts below an assessed minimal-risk prisoner rather than beside one.
   The stability claim the paragraph exists to make — *"Two prisoners at the
   same tier can never swap between publications"* — is exactly right, because
   the second walk assigns positions in ascending index
   (`prisoner-projection.ts:504-509`, walk at `:517-525`).
5. **`:98-100`'s premise is narrower than it was.** *"an accommodation resolves
   to the word 'Cell' for every prisoner in a prison whose only residential room
   type is `room.cell`"* is guarded and therefore true of the prison it names,
   but since ADR 0080 a high-risk prisoner is housed in `room.solitary-cell`
   (`docs/adr/0080-when-the-prison-asks-what-a-prisoner-is-carrying.md:187`,
   with measured placements at `:208`), so a prison that has built one has two
   residential types. The argument the sentence supports — that an accommodation
   does not answer "where is this person" — does not depend on the premise.

---

## What was checked and holds

Recorded because an empty category backed by numbers is a result, and because
the next pass over this file should not re-derive it. Every item was checked by
opening both sides.

**Constants and arithmetic (10).** `HELD_GUARD_ROW_LIMIT` and
`PENDING_DELIVERY_ROW_LIMIT` are both 3 (`src/ui/hud/staff-panel.ts:125`,
`src/ui/hud/build-panel.ts:774`); `DEFAULT_PRISONER_CAPACITY` is 5,000
(`src/simulation/runtime/new-session.ts:387`) and `MAX_PROJECTION_PAGE_LIMIT` is
500 (`src/simulation/protocol/types.ts:369`); `DAY_LENGTH_TICKS` is 2,400
(`src/simulation/prisoners/regime.ts:12`); `NEED_MAX` is 255
(`src/simulation/prisoners/needs.ts:14`), so "256 levels" at `:318` is right and
`NeedsComponent.get` reports whole levels
(`src/simulation/presentation/prisoner-projection.ts:283`);
`BOUNDED_VALUE_PERMILLE_MAX` is 1,000
(`src/simulation/presentation/view-model.ts:56`), so `NEED_BAR_MAX_PERMILLE` is
inherited and not chosen; `STATE_INCOME_UNMET_NEED_LEVEL` is 51 and is
`NEED_MAX / 5` exactly (`src/simulation/economy/income.ts:307`, `:275`);
`EARLY_WARNING_TIER_CEILING` is 2 and does live under
`src/simulation/prisoners/` (`src/simulation/prisoners/classification.ts:249`),
so `MEDIUM_RISK_TIER` agrees with it across the boundary; 219.0 divided by 4 is
54.75, the ceiling `:139` prices; `HIGH_RISK_REGIME` confines to sleep, meals
and hygiene for exactly 2,200 of 2,400 ticks
(`src/simulation/prisoners/regime.ts:120-128`: blocks of 0-2,000 and 2,200-2,400).

**The threshold and the money (5).** `isNeedUnmetForStateIncome` is `level <= 51`
(`src/simulation/economy/income.ts:371-373`); `unmetNeedCount` sums that same
predicate over `NEED_IDS` (`:389-396`); `stateIncomeForPrisonerDay` really pays
less, subtracting 40 minor units per unmet need (`:407-412`), so the `warning`
tone's promise is one the code keeps; `lowestNeed` really is the minimum, scanned
in declared order so a tie resolves to the earlier `NEED_IDS` entry
(`src/simulation/presentation/prisoner-projection.ts:298-310`); and the
biconditional at `:686` — *"The worst need being unmet is exactly
`unmetNeedCount >= 1`"* — follows, because the minimum is at or below the
threshold if and only if some need is.

**The tier, the group and the tone (8).** `classificationGroupIdForTier` is
`riskTier >= 3` (`src/simulation/prisoners/classification.ts:58-60`), so the
group and the tier are the same fact at two grains as `:199` claims;
`HIGH_RISK_GROUP_ID` matches the schedule's own id
(`src/simulation/prisoners/regime.ts:121`); the group **is** tested before the
tier (`src/ui/hud/regime-panel.ts:295-301`); `BadgeTone` carries `caution`
between `success` and `warning` and its docblock argues each rejected
alternative under the heading *"No existing tone would do"*
(`src/ui/primitives/status-badge.ts:33-42`); ADR 0090's cap is real and is there
so the system can never move a group
(`docs/adr/0090-medium-as-a-warning-not-a-skipped-step.md:172-173`, ceiling
applied at `src/simulation/prisoners/classification-early-warning-system.ts:151`);
ADR 0090's *"What this does not decide"* item 3 names the same badge-copy gap
in the same terms — *"`createStatusBadge` carries no `title`, no screen-reader
text"* (`:282-283`) — and that is still true of the primitive, which sets only
`data-tone` and `textContent` (`src/ui/primitives/status-badge.ts:57-71`); ADR
0080's decision 1 does put a contraband draw on the review that raises a
prisoner into tier 3 (`docs/adr/0080-when-the-prison-asks-what-a-prisoner-is-carrying.md:235-239`);
and `ClassificationReviewSystem` does write `classificationGroupIndex`
(`src/simulation/prisoners/classification-review-system.ts:385`) which
`ActionSystem` reads on reconsideration (`src/simulation/prisoners/action-system.ts:971`,
`:1193`, `:1234`), so the cause-and-effect `:34-37` is built around is real.

**One qualification on the badge claim.** `:250-251`'s *"The badge carries no
`title` and no screen-reader text"* is loose read literally — the badge's
**word** is `textContent` and a screen reader does read it
(`src/ui/primitives/status-badge.ts:64`). The following sentence disambiguates
to what is actually missing, an explanation of the colour, and that holds. It is
flagged because `docs/AGENT_WORKFLOW.md` §2 records a whole false claim built on
exactly this confusion at this exact render site.

**The boundary (4).** `regime-panel.ts` imports nothing outside
`src/ui/**` and `src/content/localization` (`:1-14`);
`tests/unit/ui-hud-messages.test.ts:420-425` enforces that for every HUD module
and `:73` lists `regime-panel.ts` by name, so the scan cannot silently skip it;
`vitest.config.ts:5` is `environment: 'node'`, which is the premise for
exporting the four pure helpers; and `describeStaffCoverage`, the precedent
`:186` cites for that, exists at `src/ui/hud/staff-panel.ts:335`.

**The playtest, quoted exactly (1).** `:230-233`'s measurement is verbatim in
`docs/research/2026-09-02-playing-what-landed-today.md:149-155`: *"eleven
prisoners reached tier 2 at tick 26,514, `badgeTone` stayed `neutral` — the same
tone `Minimal` carries"*, and *"Across 3,098 further ticks the act recorded
exactly **one** distinct screen state."* That note also cites this file at
`src/ui/hud/regime-panel.ts:174` for the row limit, which is still where the
constant is.

**The projections and the reader (7).** The panel counts nothing — the header
prints `roster.total` and the "and N more" line subtracts from it
(`src/ui/hud/regime-panel.ts:629-636`, `:747`); the reader asks for exactly one
row budget (`src/ui/simulation-prisoner-roster.ts:246`);
`PrisonerRosterRowViewModel.lowestNeed` is *"The most depleted of the six"*
(`src/simulation/presentation/prisoner-projection.ts:186`) and
`PrisonerNeedViewModel.unmetForStateIncome` is the projected threshold, with a
docblock that quotes this very panel's old refusal back at it (`:129-149`);
`status-strip-projection.ts:856` copies `allowedCategories` as declared and
`src/ui/simulation-regime.ts:109` maps them to keys in that order; a room
instance id really has the form `room.cell:12:9`
(`src/simulation/rooms/zoning.ts:404`); gap 7's narrowing sentence is verbatim
(`docs/HUD_PROJECTIONS.md:903`, `:908-909`), and so are gap 10 (`:943-946`) and
gap 11 (`:947-961`); and the `HH:MM` readout really was withdrawn for the reason
given, with `hud.clock.time` replaced because it *"labelled an `HH:MM` readout
the simulation never produced"* (`src/ui/hud/messages.ts:220-223`).

**The bar (5).** `filledSegments` exists in the DOM primitive
(`src/ui/primitives/segmented-bar.ts:46`); the bar sets `aria-valuetext` and
takes `aria-label` from `label` (`:200-201`), so `:350-353`'s claim that the
colour never stands alone holds; `tests/unit/regime-need-bar.test.ts:146` really
drives every level — `for (let level = 0; level <= NEED_MAX; level += 1)` — and
`tests/unit/segment-fill-agreement.test.ts` exists; the percent form is the
strip's, `maximumFractionDigits: 0` included
(`src/ui/hud/status-strip.ts:302`); and *"would guarantee a HUD somewhere
hard-codes `255`"* is verbatim
(`src/simulation/presentation/view-model.ts:82-83`).

**Structure and house rules (7).** Nothing in either block is focusable — the
panel body builds only `div` and `span`, with no `button`, no `tabIndex` and no
listener anywhere in the file — so both `:172` and `:467-468` hold, and this is
the claim a prisoner inspector would falsify first; `paintNeeds`
(`src/ui/hud/rooms-panel.ts:1443-1448`) and `paintCoverage`
(`src/ui/hud/staff-panel.ts:661-663`) both state the single-authority rule
`:771-776` cites, the first with *"measured, by deleting it and watching every
assertion stay green"*; the collapse pattern is byte-for-byte the Intake
panel's (`src/ui/hud/intake-panel.ts:342-345`) and `panel.setCollapsed` is an
idempotent assignment rather than an internal toggle
(`src/ui/primitives/panel.ts:70-77`), so the local `collapsed` flag cannot
desynchronise; `data-waiting` does exist on the Intake readout for the reason
`:627` gives (`src/ui/hud/intake-panel.ts:316`); `clearRowData` clears all six
attributes both callers set; `.hud-regime__roster-line` really carries
`flex-wrap: wrap` (`src/ui/hud/hud.css:2200-2202`); the fold assertion exists
verbatim (`tests/browser/ui-shell.spec.ts:5242`); and `formatHeldGuardText`
really follows the entity-id fallback rule for the same stated reason
(`src/ui/hud/staff-panel.ts:222-225`).

**ADR 0015 and ADR 0022, both read to the end including their amendments (2).**
ADR 0015's §*"The name is not localizable content"* supports `:393` — *"It is
never authored into a content catalog, never translated, and identical in every
locale"* — and its next paragraph supports `:394-395` directly: *"The
projections expose `givenName` and `familyName` separately rather than one
composed string, because which order they read in is a presentation choice the
simulation should not bake in"* (`docs/adr/0015-actor-identity-allocation.md:131-145`).
The amendment of 2026-08-27 corrects eight `file:line` citations and one dead
symbol and touches neither. ADR 0022's amendment of 2026-08-25 confirms the
fifth tab went to Rooms (`docs/adr/0022-room-zoning-surface.md:550-565`), which
is what `:22-23` says. **Neither was concluded from its Decision section
alone**, per this pass's brief.

---

## Two corrections to the brief this pass was given

`AGENTS.md` asks for these rather than compliance around them.

1. **`src/ui/hud/regime-panel.ts` is cited at `docs/adr/STATUS-QUEUE.md:1252`,
   but that line is not in §2.** It sits under the document's H1, inside the
   anchor-pass narrative — the nearest preceding heading of any level is line 1,
   *"# What the owner still has to decide, and where an accepted decision
   contradicts the code"*, and the first `## 1.` heading is at `:5225`. **The
   substance is not weakened, it is sharper than the brief put it**: the file's
   single mention in an eleven-thousand-line document is inside a bullet that
   lists it among eighteen files the delta window *excludes*, so its only
   appearance anywhere is as a named non-member. §§3-6 (at `:6518`, `:7277`,
   `:7930`, `:8037`, `:8245`, `:10906`) cite it nowhere, which is the gap as
   named.
2. **ADR 0090 being `Proposed` while its system runs on `main` is already
   recorded, so it is not offered here as a finding.** The check was run and both
   sides hold: the ADR reads *"**Proposed, 2026-09-02. Not self-approved.**"*
   (`docs/adr/0090-medium-as-a-warning-not-a-skipped-step.md:27`), its index row
   agrees (`docs/adr/README.md:247`), and the mechanism is nevertheless
   constructed in an ordinary session
   (`src/simulation/prisoners/prisoner-operations-runtime.ts:385`). But
   `docs/adr/STATUS-QUEUE.md:8299` already states it and already classifies it:
   *"0089 and 0090 arrived `Proposed` with no row, which is the abandonment §5's
   first bullet counts"*, and *"a `Proposed` ADR with no row is a decision nobody
   priced for the owner"*. Reporting it as new would be re-filing a known item.

---

## The weakest claim in this note, and what would change my mind

**Finding 2**, and it is weak in a specific way rather than uncertain in its
facts. Every fact under it is checked: the panel is constructed
(`src/ui/hud/hud.ts:1800`) and bound (`:1973`), and the browser suite asserts
the panel renders rather than pinning emptiness (`tests/browser/ui-shell.spec.ts:4922`).
What is arguable is whether a paragraph headed *"Why it is here"* should be read
as a claim about the present at all. **What would change my mind:** any marker
in the paragraph that it is historical. This file marks both directions
deliberately and often — at `:64` for the need-bar refusal, `:219` for the
tone rule, `:716` and `:724` for the empty sentence, each time with the old
wording quoted and dated — so the absence of a marker here is evidence, but it
is weaker evidence than a contradiction.

**Second weakest: finding 3's reading of "cell assignment".** The stall it names
is real, is counted by name in the simulation
(`src/simulation/prisoners/intake-system.ts:42`) and cannot produce the badge the
sentence attributes to it. What would change my mind is evidence that
"cell assignment" was meant as a loose synonym for intake generally — for which
I found none, and against which the stage carries that name in
`src/simulation/prisoners/components.ts:19`.

**Strongest, and the one to act on first: finding 1.** It is on an exported
interface, it contradicts the code twelve lines from a comment that announces
the contradiction, and it concerns behaviour the owner ruled on the same day.

**A note on the file's overall condition, kept separate from the findings
because it is a judgement and not a measurement.** Eighty-two of eighty-eight
checkable assertions in this file are exactly right, including every constant,
every quotation of another document, every arithmetic derivation and every
claim about the simulation across the boundary it may not import. The seven
disagreements are not carelessness distributed through the file; **five of them
were false in the commit that wrote them**, four of those in `f8393f00`, and
that commit built the whole panel in one pass. The pattern worth relaying is
not that this file rots faster than others. It is that a large docblock written
in the same commit as the code it describes gets no second reader, and this file
had never had one.
