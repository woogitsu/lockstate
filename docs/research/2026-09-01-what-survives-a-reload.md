# What survives a reload — the ADR 0084 alerts channel, RefusalLog, and a band that can go blank without a reload at all

**Date:** 2026-09-01
**Branch played:** `docs/playtest-reload-2026-09-01`, cut from `origin/main` at
`27400bcd` (v0.0.325).
**Instrument:** `tests/browser/playtest-2026-09-01-what-survives-a-reload.playtest.ts`,
run with `./node_modules/.bin/playwright test -c tests/browser/playwright.playtest.config.ts
tests/browser/playtest-2026-09-01-what-survives-a-reload.playtest.ts --reporter=line`.
**Brief:** *"Znajdź bugi i błędy grając"* — play a prison into an interesting
state, reload, and say what came back, what silently did not, and whether the
game ever told the player. Surface: saving, reloading, and what survives a
reload.

## Claim tiers

- **MEASURED** — a real browser ran it and the quoted text is what the DOM
  said.
- **VERIFIED, read** — a source file was opened and quoted at the line cited.
- **REASONED** — follows from the above, marked as such.
- **UNKNOWN** — could not be established this pass, named rather than guessed.

---

## Summary

| | verdict |
| --- | --- |
| **Finding A — `RefusalLog` does not survive a reload, and the one disclosure sentence the game has says nothing about it** | **Confirmed by reproduction, twice, on independent scenarios.** Reproduces exactly as ADR 0087's own draft argument (unaccepted) predicts. The load summary — the only sentence the game emits about what changed — is silent on it in both directions. |
| **Finding B — the alerts-list run counter, dismissal, and reload survival (ADR 0084 decisions 1–3)** | **Confirmed end to end, MEASURED, on the third attempt.** A run's count and day survive a reload unchanged; a dismissed row stays dismissed across a reload **and** across a second save/reload; a row restored from a save is still a live control a player can dismiss. Decision 3 does exactly what it promises, on screen, not only in the store. |
| **Finding C — a refusal can vanish from `.hud__refusal` with no reload at all, while the alerts list still reports it standing** | **Confirmed by reproduction, deterministically, no load/timing dependency.** An unrelated host-side refusal that later resolves permanently evicts a still-true simulation refusal from the one band documented as "always laid out." |
| **The loan ledger's restore boundary** | **Re-verified rather than newly found: unreachable by a player.** `createNewSimulationRuntime` never receives `loanTerms` from anything under `src/`; the gate's own docblock already says so. Nothing to play across. |

---

## Finding A — `RefusalLog` does not survive a reload, and nothing on screen says so

### A.1 The small, fast repro

**MEASURED**, `playtest-2026-09-01-what-survives-a-reload.playtest.ts`,
describe block *"a refusal, a save, and a reload"*: New prison, calibrate,
mis-click Remove on an empty tile (`.hud-build__remove` armed, a press at an
empty tile), then a refused purchase (9,999 × `wall-brick`), Save, a real
`page.goto` navigation, Load.

Before the save:

```
refusal band: "Nothing was bought — that would go past what the state will carry."
alerts list (1 row): [refusal-14] "Nothing was removed — there is no object on
  that tile, and none being built there." badge=Warning dismissible=false
```

(The band shows the *later* host-side purchase refusal; the alerts list still
shows the *earlier* simulation refusal from the mis-click. Both are correct
and independent — see Finding C for why a band reading and a list reading are
allowed to differ, and for the case where that independence itself misleads.)

After the reload and Load:

```
refusal band: ".hud__refusal: not laid out"
event band:   ".hud__event: not laid out"
alerts list (1 row): [empty] "No active alerts"
```

The full HUD text at that point includes the game's own load summary,
word for word:

> Loaded. Restored: kernel tick and command queue, RNG stream states, world
> terrain and ownership, construction orders and undo/redo, entity id
> liveness, prisoners, needs, actions and cell assignments, jobs, containers
> and utility networks, doors, security sectors, guards and patrols,
> contraband, intelligence and searches, incidents, gangs and tunnels,
> prisoner and staff names. Not carried by this save version: room and
> topology caches (recomputed from the world), navigation caches and
> in-flight path requests (re-issued on the next tick).

Neither list — the eleven `restored` entries nor the two
`notCarriedByThisSaveVersion` entries — names a refusal, an alert, or an
event, in either direction.

### A.2 A second, independent dataset says the same thing

**MEASURED**, the larger scenario (twelve admit presses, four survived a
harness-timing race that is not itself a finding — see "What this pass could
not establish"), full pass, 10.7 minutes:

```
BEFORE SAVE:
  refusal band: "Nobody was admitted — the request was refused."
  alerts list (1 row): [refusal-13] "Nothing was removed — there is no object
    on that tile, and none being built there."

AFTER RELOAD:
  refusal band: ".hud__refusal: not laid out"
  alerts list (1 row): [empty] "No active alerts"
  row count: 1 -> 0; LOST: "Nothing was removed..." (refusal-13, badge Warning)
  "the word \"refus\" appears in the HUD: false"
  "the word \"lost\" appears in the HUD:  false"
  "the word \"restor\" appears in the HUD: true"
```

Same shape, different trigger (a host-side admit refusal rather than a
purchase refusal), different population, different session length. The load
summary is present (`"restor"` is `true`) and, again, has nothing to say about
either the band or the list going to zero.

### A.3 Cause, at file:line

**VERIFIED, read.** `src/simulation/runtime/new-session.ts:198-204`:

> **Not in the session snapshot, deliberately.** See `RefusalLog`'s own
> comment and `docs/HUD_PROJECTIONS.md` gap 33: this is a notice about an
> action the player just took, not a condition of the prison, so a restored
> session starts with none rather than re-raising an alert about a wall that
> failed before the save.

**VERIFIED, read.** `grep -n "runtime.refusals" src/simulation/runtime/restore-session.ts`
returns nothing — `restoreSimulationRuntime` never touches `runtime.refusals`
at all, in either direction, where it explicitly calls
`runtime.events.loadSnapshot(...)` for the sibling channel
(`session-systems.ts:970`).

**VERIFIED, read.** `CURRENT_SAVE_RESTORED_SCOPE`
(`src/simulation/runtime/restore-session.ts:202-217`) lists exactly 11
`restored` entries and 2 `notCarriedByThisSaveVersion` entries (room caches,
navigation caches), pinned character-for-character by
`tests/determinism/snapshot-restore-fidelity.test.ts`'s *"states plainly what
the current save version does and does not resume"*. Neither list has ever
had a slot for `RefusalLog` or the alerts channel — this is not a regression
in the catalogue, the catalogue was simply never asked the question.

**VERIFIED, read.** ADR 0087, *"Whether a refusal is an event or a condition
of the prison"* (on branch `docs/657-what-a-refusal-is`, not yet merged — no
link here because there is nothing in this checkout for one to resolve to)
decision 3 recommends
keeping `RefusalLog` unsnapshotted, arguing exactly `refusal-log.ts:52-65`'s
point (*"a refusal is about a press in the session that made it… it dies with
the session because its subject does"*). Its Status heading reads, verbatim:
**"Proposed, 2026-09-01. Not self-approved."** So the behaviour this pass
measured matches a proposal that is on the table, not a decision the owner
has made — the difference between "the codebase argued this on purpose" (true,
twice, in two docblocks) and "the owner ruled on it" (not yet true).

### A.4 Player-visible cost

A player who reloads moments after a mis-click, or after any refusal at all —
build, purchase, zone, hire, admit — loses every trace of it: the warning
band, the alert-list row, and the badge, all at once, with **no sentence
anywhere in the HUD** — not the refusal band, not the event band, not the
save panel, not the one paragraph the game writes specifically to describe
what a reload changed — telling them it happened. This is precisely the
*"quietly differs, not told"* shape the brief asked this surface to
distinguish from *"told and it's fine."* It is not a promise the code breaks
(`RefusalLog`'s own docblock and `docs/PERSISTENCE.md` both say this is
deliberate), but the *disclosure* the owner's "no hidden functionality"
directive would ask for does not exist for it.

**Weakest claim, and what would change it.** If the owner accepts ADR 0087
decision 3 as written, this stops being an open question and becomes a
documented, ruled-on exclusion — at which point the remaining gap narrows to
purely the disclosure sentence (should `CURRENT_SAVE_RESTORED_SCOPE` or a
sibling list say "the last thing the prison refused" explicitly?), which is
player-facing copy and `AGENTS.md`'s fourth exclusion reserves it to the
owner regardless.

---

## Finding B — the alerts-list run counter, dismissal, and reload survival, all confirmed end to end (ADR 0084 decisions 1–3)

### B.1 What was MEASURED, live, before any save

**MEASURED**, the large scenario, run 1 (crashed after the save — see below —
but not before capturing several minutes of a running session):

- The count-and-day rendering renders and updates correctly:
  `"A fight has broken out between two prisoners. 11× Day 17"` became
  `"...12× Day 19"` after one further arrival — `hud.alert.occurrences`
  (`{count}×`) and `hud.alert.time` (`Day {day}`) both live, both composed by
  `hudAlertRowLabel` (`src/ui/hud/alert-row-label.ts:42-51`) exactly as ADR
  0084's acceptance describes.
- Dismissal (decision 2) does exactly what it is documented to do: dismissing
  `[event-1]` *"A fight has broken out… 11× Day 17"* removed exactly that row
  and left `[event-2]` and `[refusal-13]` untouched. A **new** arrival of the
  identical fact afterward opened a **fresh** row starting at count 1
  (`[event-23]`, no `×`), never re-merging into the dismissed run — precisely
  the *"answered as a new row"* rule at `src/ui/simulation-events.ts:704-710`.
- A save does not pause the simulation: the event band's text changed between
  the "before the save" and "immediately after the save" readings, taken
  roughly a second apart around the Save button's own round trip.

### B.2 Getting there took three attempts, and the first two failures are named rather than hidden

The instrument plays until the alerts list holds a *run* (the same sentence
more than once) before saving, so the reload leg can compare a populated,
counted, dismissed list against its restored self. **Getting a run to exist
before the save takes real play** — a fight has to actually break out — and
across three full attempts at the twelve-admit, day-7 scenario:

1. **Attempt 1** (`reload-big-run.log`) reached a list with two counted runs
   (11× and 11×) and a dismissal, then the entire Vite dev server dropped
   mid-run: `page.goto` hit `net::ERR_CONNECTION_REFUSED` at 11.2 minutes,
   with `uptime` reading a load average of 16–22 on this 4-core box the whole
   time (several other agents' browser suites were running concurrently).
   **This is a resource/load failure of the test harness, not a game finding,
   and is not reported as one** — the brief is explicit that nothing resting
   on this box's contention today is trustworthy evidence about the game.
2. **Attempt 2** (`reload-big-run-2.log`) completed cleanly end to end (10.7
   minutes) but no incident fired before the save — only the one leftover
   calibration refusal was on the list, so decision 2's dismissal could not
   be exercised (logged honestly: *"NO DISMISSIBLE ROW ON SCREEN — decision 3
   cannot be exercised, and that is itself a reading"*). It independently
   reconfirmed Finding A on a second dataset (see A.2).
3. **Attempt 3** (`reload-big-run-3.log`) completed cleanly (5.8 minutes, a
   quieter machine) with all twelve admits landing and an incident already
   open by day 4. This is the run the rest of this section reports.

Why the incident timing (and even how many admits land) differs run to run,
without this being a timing claim about the *game*: the **harness's** own
admit loop races the worker's startup handshake
(`SimulationCommandSender.submit` throws *"The simulation has not reported
its command sequence yet"* — `src/ui/simulation-commands.ts:249-252` — when a
command is sent before `sequenceSynced`), so different runs admit a different
number of prisoners depending on real wall-clock luck early in the session. A
different population changes when a fight becomes likely within the
scenario's fixed day-7 window. This is a genuine harness fragility worth
naming (and a candidate fix for a later pass — the admit loop could poll
`sequenceSynced` instead of a fixed 150ms gap), but it is a claim about *this
box, right now*, not about the simulation's own determinism: the kernel's tick
loop is untouched, only which host-level presses land is affected.

### B.3 What attempt 3 MEASURED, across a save, a reload, a dismissal of a restored row, and a second save/reload

Before the save, the list held two rows: `[event-2]` *"The prison is under
control again — no incident is still open. 4× Day 8"* and `[refusal-13]`
(the calibration leftover). A third row, `[event-1]` *"A fight has broken out
between two prisoners…"*, had already been dismissed earlier in the run and,
correctly, was not on the list at save time — the dismissal was already
holding before the save had anything to do with it.

After the reload and Load:

```
row count: 2 -> 1
kept:    "The prison is under control again — no incident is still open. 4× Day 8"
LOST:    "Nothing was removed — there is no object on that tile, and none being
          built there." (refusal-13, badge Warning -- Finding A, again)
the dismissed sentence "A fight has broken out between two prisoners. 4× Day 8"
  is still gone
refusal band: "Nothing was removed…" -> ".hud__refusal: not laid out"
event band:   "The prison is under control again…" -> ".hud__event: not laid out"
```

The surviving row's text is **byte-for-byte identical** across the reload,
count and day included: `"...4× Day 8"` before, `"...4× Day 8"` after. Decision
1's rendering and decision 3's persistence agree with each other across the
boundary that matters — the one a player actually crosses by reloading.

The instrument then went one step further than the header's own three
questions ask: it pressed the `×` control on the **restored** row.

```
pressing the x on a restored row: [event-2] "The prison is under control
  again — no incident is still open. 4× Day 8"
the restored row is gone (1 rows left)
```

**A row that came back from a save is not a second-class control**: dismissing
it works exactly as it would a row that had never been through a save,
directly answering this surface's "no hidden functionality" directive for
this specific case — a restored row's `×` is not a button that looks live and
silently does nothing.

Finally, the instrument saved and reloaded a **second** time, to ask the
question the save round trip had never been asked before: does a dismissal
made against a record whose ordinal came out of a *previous* save itself
survive a *further* reload?

```
=== AFTER A SECOND SAVE AND RELOAD ===
alerts list: [empty] "No active alerts"
the twice-dismissed sentence "The prison is under control again — no
  incident is still open. 4× Day 8" is still gone
```

It does. The dismissal mark travels with the record through as many round
trips as the record itself does.

### B.4 Cause, at file:line, now confirmed by the screen rather than only by reading

- **VERIFIED, read.** `src/simulation/runtime/session-systems.ts:352-363` and
  `:970` — `runtime.events.loadSnapshot(systems.alerts)` runs on every
  restore when an `alerts` section is present, and the dismissal marks travel
  inside that same snapshot (`SimulationEventLog`'s `_dismissed` set,
  `event-log.ts`).
- **VERIFIED, read.** `src/simulation/worker/state-machine.ts:1033,1074` —
  `_restoredThroughSequence` is set to `runtime.events.count` and
  `publishEvents()` runs immediately afterward, so every retained,
  non-dismissed record reaches the main thread as a `simulation/event`
  message (marked `restored: true`) with no player action needed — MEASURED
  above as the row being on screen the instant the load finished.
- **VERIFIED, read.** `src/ui/simulation-events.ts:571-576` —
  `hudEventAlertsFromWorkerMessage` builds a row from a restored message
  exactly as it would a live one; no `restored` flag reaches
  `HudAlertViewModel`, which is why the restored row's `×` control worked —
  the HUD has no way to tell the two apart and therefore cannot special-case
  either.
- **VERIFIED, read.** `tests/determinism` and `tests/contract` (the gates this
  surface was told to run) pass at 267/268 (1 skipped, unrelated) as of
  `27400bcd` plus this branch's commits.

**Weakest claim.** This pass ran the scenario once with an incident before the
save; it did not vary which severity, which incident type, or how many
distinct runs were on the list at once. Nothing in the code read above
suggests those would behave differently — the mechanism is generic over the
record, not special-cased per event type — but "generic in the code" and
"tested in every combination" are different claims, and only the first is
made here.

---

## Finding C — a refusal can vanish from the band with no reload at all, and the alerts list disagrees with it while it does

Found while establishing Finding A's "before the save" reading: in the large
scenario, `.hud__refusal` read `"not laid out"` well before any save while
`[refusal-13]` was still the newest row on the alerts list — two panels
reading the same underlying fact and disagreeing about it, mid-session, no
reload involved. Isolated and reproduced **deterministically** — no
fast-forwarding, no load-dependent timing — in a small standalone check (run
once to confirm, then deleted; not part of the committed deliverable, per
`docs/AGENT_WORKFLOW.md`'s "never leave a scratch file under `tests/`"):

1. Mis-click Remove on empty ground → `.hud__refusal` shows *"Nothing was
   removed — there is no object on that tile, and none being built there."*
   — a **simulation** refusal, `RefusalLog` sequence *N*.
2. A purchase far past the overdraft floor → a **host** (chrome-side, no
   round trip) refusal takes the same line: *"Nothing was bought — that would
   go past what the state will carry."*
3. The **same action**, now affordable → succeeds. `.hud__refusal` goes to
   fully hidden immediately.
4. Three seconds later — several `status-counts` publications later, at up
   to twice a second, every one of them still carrying the unchanged
   sequence-*N* refusal, because nothing has superseded it — the band is
   **still hidden**.
5. The alerts list's own refusal row, at the same moment, still reads
   *"Nothing was removed…"* — the list says a refusal stands; the band, whose
   own comment (`hud.ts:1027-1031`) calls it *"always laid out"* and *"the
   most recently decided refusal,"* says nothing does.

### Cause, at file:line

**VERIFIED, read.**

- `applySimulationRefusal` (`src/ui/hud/hud.ts:1244-1256`) early-returns when
  `notice.sequence === simulationRefusalSequence` (`:1250`) — a guard against
  a `status-counts` republication stealing the line back from a *newer* host
  refusal (`hud.ts:1137-1142` states this intent explicitly). The guard has
  no way to distinguish *"the line already shows this sequence"* from *"the
  line showed this sequence once, was then overwritten by something else, and
  cleared"* — both leave `simulationRefusalSequence` unchanged, and only the
  first is the case the guard was written for.
- `clearRefusal(actionId)` (`hud.ts:1220-1223`, invoked from `dispatchCommand`
  at `:1286` on every command whose promise does not reject) unconditionally
  calls `clearRefusalLine()` the moment a host-refused action of the same
  kind later succeeds. Correct when that action's *own* host refusal is what
  is still standing; it does not check whether the line it is about to clear
  is actually still a *simulation* refusal underneath, wrongly attributed.
- `clearRefusalLine()` (`hud.ts:1176-1183`) sets `refusal.hidden = true`
  unconditionally, with no fallback that hands the line back to whatever
  `RefusalLog.last` currently holds.

### Player-visible cost

A player whose mis-click left a warning on screen, who then does something
completely ordinary and unrelated — tries to buy more than the treasury can
cover, then buys what it can — loses that warning from the one band
documented to always show the most recent refusal, with **no click on it, no
reload, nothing dismissed**, while the alerts list, built from the identical
underlying fact, keeps saying the opposite. Two panels built from the same
session disagree about whether the prison has a standing refusal, and nothing
on screen says either one is stale.

**Scope note.** This is not a persistence/reload defect on its own terms —
nothing here survives or fails to survive a save; it was found establishing
this surface's "before" reading and reported because it costs the same trust
property (does the game ever silently un-say something it already told the
player) that the brief is about. Handed over rather than fixed: an honest
repair changes `clearRefusal`'s contract so it re-consults `RefusalLog.last`
before hiding the line rather than hiding it unconditionally — a small change,
but exactly the kind of *"what does the band do when two producers touch it"*
question ADR 0084 Finding 4 already declined to settle unilaterally for a
sibling case (the same-tick escape/all-clear collision), so it is written up
rather than patched in place.

---

## The loan ledger's restore boundary — re-verified, not newly found

`tests/determinism/loan-ledger-restore-boundary.test.ts` and
`src/simulation/economy/loans.ts` both already state this, and this pass
re-confirms it by reading rather than trusting the claim:

**VERIFIED, read.** `grep -n "loanTerms" -r src/` returns exactly one
production call site, `src/simulation/runtime/new-session.ts:845`
(`const loans = options.loanTerms === undefined ? undefined : new
LoanBook(...)`), and nothing else under `src/` ever supplies
`options.loanTerms`. `createNewSimulationRuntime(seed).loans` is `undefined`
for every session a player can start. No HUD module reads `runtime.loans`
either.

**REASONED, from that.** There is no sequence of player actions that puts a
`LoanBook` into a running session, so there is nothing to "play across" the
loan ledger's restore boundary — the gap the pinned test describes
(`loanTerms` is dropped by a round trip) cannot be reached by anyone who is
not calling `createNewSimulationRuntime` directly with test-only options.
This confirms the test file's own docblock (*"No player can reach it"*)
rather than overturning it, and is recorded here because the brief asked for
it to be checked rather than assumed.

---

## What would change these findings' minds

- Finding A: the owner ruling on ADR 0087 decision 3, in either direction —
  acceptance settles the architecture question and leaves only the
  disclosure-copy question open; rejection reopens the mechanism itself.
- Finding B: nothing pending — MEASURED end to end on attempt 3. A future
  pass that varies the incident type, severity mix, or dismisses several rows
  at once before saving would broaden the coverage but is not needed to close
  the question this pass asked.
- Finding C: nothing pending — reproduced deterministically and is not
  timing-sensitive; a fix attempt that re-runs this repro and now sees the
  band recover the standing refusal at step 4 would close it.
