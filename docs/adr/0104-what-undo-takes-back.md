# ADR 0104: What `Undo` takes back, and what it may reach past

> **The number was assigned from `docs/adr/README.md`'s own "Next free number"
> line, and this document pre-commits to renumbering.** `AGENTS.md`'s rule is
> that a number is not reserved until it appears in that index, and a branch
> nobody has merged is invisible from it — so if another branch turns up
> holding 0104, this file, its row and every citation of it get renumbered
> without argument, exactly as 0031, 0034, 0035, 0037, 0048, 0049, 0074, 0075,
> 0076, 0083, 0096, 0097, 0098, 0099, 0100, 0101, 0102 and 0103 each
> pre-committed.
>
> **The sweep was performed rather than trusted**, on 2026-09-09 from this
> worktree, cut from `origin/main` at `296812c9` (v0.0.549):
> `git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`, then
> `git ls-remote --refs --heads origin` (**267 heads**), then
> `git ls-tree -r --name-only <ref> -- docs/adr` over every one of them
> grepped for `^docs/adr/0104-`. **No head holds a 0104 document**, and no
> head's `docs/adr/README.md` has moved its next-free line past 0104.

## Status

**Accepted by the owner on 2026-09-09 — option 2 now, option 4 as the
direction, and option 3 folded into whichever lands.** That is this document's
own recommendation taken whole; nothing in the option list was modified in the
taking.

> **THE PROVENANCE IS THE WEAKER KIND AND IS DISCLOSED RATHER THAN DRESSED
> UP.** The ruling is the label of a clickable option this session wrote and
> the owner chose — *"Opcja 2 teraz, 4 jako kierunek (rekomendacja)"* — not a
> sentence they typed, and it was given against a summary of the four options
> and the two measurements rather than against these 350 lines. `CLAUDE.md`
> flags exactly this shape twice about the 2026-09-08 and 2026-09-09 releases
> of reservation 3, in both cases saying the entry's provenance *"is weaker
> than the two before it"*, and the same caution applies here. **What the
> acceptance binds is the direction; the refusal sentence option 2 needs is
> not authorised by it** and is still the owner's under the fourth reservation,
> as the paragraph below already said before the ruling.
>
> **The `Proposed. Not self-approved.` record is kept below rather than
> overwritten**, because the document argued the case as a proposal and a
> reader should see it in the form it was argued in.

**Proposed. Not self-approved.** `docs/AGENT_WORKFLOW.md` §3: *"**Propose an
ADR rather than deciding architecture inside implementation code, and never
self-approve one** outside a recorded delegation from the owner."*

Filed against [#956](https://github.com/woogitsu/lockstate/issues/956), whose
§5 says in terms that this is a design decision about what one key means and
*"should be recorded rather than chosen inside an implementation"*, and marks
its options 2 and 4 as worth an ADR.

**It is also the question two Accepted documents already left open, and one of
them says it should be answered here rather than twice.**
[ADR 0025](./0025-guard-hiring-surface.md) `:477-478`: *"whether the undo stack
should grow a second kind of entry is the same open question ADR 0022 left for
zoning, and it should be answered once for both."*

**No player-visible sentence is authored, edited or added by this document.**
Option 2 below would need one; the wording of it would be ours under the
2026-09-04 release of `AGENTS.md`'s fourth reservation and its *truth* would
not be waived, and this document proposes the option rather than the string.

> **A CLAUSE IN THE ACCEPTANCE BLOCK ABOVE OVERSTATED THAT RESERVATION AND IS
> CORRECTED HERE RATHER THAN EDITED THERE.** It said the refusal sentence *"is
> still the owner's under the fourth reservation"*. The paragraph immediately
> above it, written before the ruling, has it right and the acceptance block had
> it wrong: after the 2026-09-04 release the **choice of words is ours**, and
> what is not waived is that the sentence be TRUE and be quoted verbatim in the
> commit message and the pull request body beside the code that proves it.
> `CLAUDE.md` states the release in those terms. The implementing change authors
> the string on that footing and quotes it; **nothing about the ruling widens or
> narrows the reservation**, and the overstatement is kept above so that a
> reader who copies a reservation out of an acceptance block sees it being got
> wrong once.

**Amended by the owner on 2026-09-23: a placement the simulation refuses is
not the player's latest action.** See the section *"Amendment, 2026-09-23"* at
the end of this document. Option 2 stands. The amendment settles what
"the newest accepted player command" means when that command was a placement
refused on its content. The provenance is the weaker kind, the same as the
acceptance's: the label of a clickable option this session wrote, *"Opcja A
(zalecane)"*, and not a sentence the owner typed.

## Claim tiers used below

- **MEASURED** — a number a run produced, on the tree named beside it.
- **VERIFIED** — read out of the code or a document at a named commit.
- **ARITHMETIC** — derived from MEASURED figures, with the derivation shown.
- **ASSERTED** — believed and not established. Marked every time.

## Context

### 1. One key, one word, one route — VERIFIED at `296812c9`

`KeyZ` is bound to `edit.undo` in the `world` and `construction` input
contexts and nowhere else (`src/input/bindings.ts:64`; the action's own
declaration repeats the pair at `src/input/actions.ts:78-79`). The whole of
what a player is told about it is one word:
`'input.action.edit.undo': 'Undo'` (`src/content/default-locale-en.ts:2754`).

There is no pointer route. The key is recognised in the scene
(`src/rendering/scene/world-scene.ts:853`, `case 'edit.undo':
this.editHistory?.undo();`), handed to the `BuildTool`
(`src/ui/build-tool.ts:257-259`), turned into a HUD intent
(`src/ui/hud/hud.ts:499`, `| { readonly kind: 'undo' }`) and submitted as a
command (`src/main.ts:2363-2364`, `requireSimulation(commands).submit({ type:
'Undo' })`).

**And the tool argues, in its own words, against making the key conditional**
(`src/ui/build-tool.ts:250-256`): *"Unconditional, where `place` refuses a
disarmed tool: what undo reverses is a transaction the simulation is holding,
not a gesture in progress, so an armed check here would make the key work only
while the tool happened to be armed — which no player would connect to
anything."* That paragraph is right about the gesture and it is the reason
option 1 below is not free.

### 2. The stack holds construction transactions and nothing else — VERIFIED

`ConstructionSystem.registerTransactionOrder` (`src/simulation/construction/system.ts:599`)
has exactly two producers in `src/`: a `PlaceBuildOrder`
(`src/simulation/construction/handler.ts:129`) and a `PlaceObject`
(`src/simulation/objects/object-placement-service.ts:566`). A hire, a
designation, an admission, a regime change, a dismissal and an unzone write
nothing onto it and cannot.

`ConstructionSystem.undo()` (`:668`) flushes the open gesture and then pops:
`const transaction = this.undoStack.pop();` (`:675`). **It does not ask what
the player did last.** Every cancellable order in the popped transaction goes
through `cancelOrder`, a `completed` one included, and the method's own comment
says why: leaving a wall standing while its order reads `cancelled` *"would
make the undo stack a lie, and would leave geometry nothing can ever remove."*

### 3. What that costs a player — MEASURED at `296812c9`

Run through the real `Kernel`, the real `packCommand` decoder and the real
session command router (`createNewSimulationRuntime`), by a probe deleted after
the numbers were taken; posted in full on #956. Two `wall-brick` orders on one
`transactionId`, stepped to `completed`, then `HireStaff`, then `Undo`:

| reading | before `Undo` | after `Undo` |
| --- | --- | --- |
| both order states | `completed` | **`cancelled`** |
| guards on the roster | 1 | **1** |
| treasury | 24,840 | **24,760** |
| events the press recorded | — | **one: `construction.undone-spend-destroyed`** |

**The press moves the treasury by nothing.** The hire's 80 is not returned and
the two finished walls' 160 is not refunded — ARITHMETIC over the MEASURED
figures: 24,840 − 80 = 24,760, and no other term appears. The guard count
settles the other half: the hire was never on the stack.

The one event maps to `'hud.alert.event.construction.undone-spend-destroyed'`
(`src/content/default-locale-en.ts:1104-1105`), *"The last change to the build
queue was undone — anything already spent past the point of no return stays
spent."*, graded `'warning'` on `band-and-log`
(`src/ui/simulation-events.ts:482-486`). So the loss **is** reported — that is
[#932](https://github.com/woogitsu/lockstate/issues/932)'s work — and the
subject is wrong: the sentence names the build queue, on a tab where no queue
is drawn, for a wall the player had stopped thinking about.

### 4. There is no bound on how old the transaction can be — MEASURED, and the reason is deliberate

#956 §7 declined to claim this half: *"the undo stack across a save was **not**
played … Not measured, so not claimed."* Measured now, and the reach survives —
**not through `undoStack`**:

```
undoStack in the snapshot:                 0
redoStack in the snapshot:                 0
both order states after restore:           completed, completed
both order states after Undo:              cancelled, cancelled
```

Both stacks are **empty** in the snapshot and the press still cancelled two
finished walls. The carrier is `ConstructionSnapshot.currentTransaction`, and
`system.ts:11-30` states its purpose in as many words: without it *"the first
`undo()` after a restore then reached past it and cancelled the **previous**
gesture instead"*
([#108](https://github.com/woogitsu/lockstate/issues/108)). All three fields
are in the save envelope (`src/persistence/save-schema.ts:226`, wired at
`:1266`), so this is the real persistence path.

**This is not an argument against #108.** #108 made the reach survive a reload
on purpose, so that `Undo` means the same thing either side of a save. That is
correct and this document does not propose changing it. What it also does,
unavoidably, is remove the last natural bound on the age of the transaction the
key reaches: not the session, not the day, not the tab. **A player can load a
prison saved a week ago, hire a guard, press the one key labelled `Undo`, and
lose a wall they built in a different sitting.** Any fix that works by bounding
*age* has to keep #108's property, and the two pull in opposite directions —
which is the sharpest reason this is a decision rather than a patch.

### 5. What the two Accepted documents say, and where they stop — VERIFIED

- ADR 0025 `:475-478`: `HireStaff` carries no `transactionId`, so *"there is
  nothing for undo to pop; whether the undo stack should grow a second kind of
  entry is the same open question ADR 0022 left for zoning, and it should be
  answered once for both."*
- ADR 0022 `:631`: zoning *"writes no construction order so `Undo` reaches
  nothing, and undo is a keyboard chord"* — used there as an argument for
  shipping `UnzoneRoom`, because otherwise a stray drag had *"no recovery of
  any kind on a touch device."*

Both sentences are **true about the hire and the designation**: neither is on
the stack, which §3's `1 → 1` confirms. Both stop one step short of the
consequence. The press does not reach *nothing*; it reaches **the last wall**.

## Decision

**The question.** What does `Undo` take back — the player's last action, or the
last construction transaction? And when the two differ, what does the key do?

This document does not choose for the owner. It states the four candidates,
prices them, and recommends one pair.

### Option 1 — scope the press to a construction surface

`Undo` acts only while the player's current context is a construction surface
(a HUD tab or an armed tool), so the key is silent on the Security tab.

- **Stops the measured loss.** Yes, for the measured act.
- **Needs no new sentence.** A key that does nothing says nothing, which is
  honest.
- **Cost.** It contradicts `build-tool.ts:250-256`'s own reasoned argument
  (§1), and it makes the key's behaviour a function of which tab is open — so
  a player who builds a wall, opens Rooms to check something, and presses `Z`
  gets nothing, with no way to tell that from an empty stack. It does not make
  `Undo` mean *"take back what I just did"*; it makes it mean *"take back a
  build, and only while you are looking at builds."*
- **Not a binding change.** The Security tab is inside the `world` input
  context, so `bindings.ts:64` already permits the press; this is a condition
  above it.

### Option 2 — refuse a transaction the player did not just create

`undo()` refuses when the newest construction transaction is older than the
newest accepted player command of any kind, and says so.

- **Stops the measured loss** and stops the week-old-wall case in §4 without
  touching #108: the transaction still survives the reload, and it is still
  refused, because a reload is followed by *some* newer command before the
  press.
- **What it needs that does not exist.** A single monotone fact — the tick of
  the newest accepted command. **ADR 0099 set the precedent for exactly this
  shape**, a monotone marker published rather than a channel added, and its own
  argument applies here: the cheap fact is the one the system already computes
  and throws away. Every command passes the session router with a tick, and
  **every command there is, is a player press** — enumerated in the weakest-claim
  section below, which is why this reads *"newest accepted command"* and not
  *"newest accepted **player** command"*: the qualifier would suggest a
  distinction the tree does not contain.
- **And a refusal sentence.** Player-visible. Wording ours, truth not waived,
  and it must be verified against `undo()` and quoted verbatim in the commit
  and the pull request body.
- **Cost.** One new fact, one new locale key, one new refusal path. It does
  **not** foreclose option 4: when a second kind of entry lands, "newest
  player action" is precisely the fact that decides which entry is on top.

### Option 3 — keep the reach and name the subject

Keep today's behaviour, and make the sentence say what came down.

- **Does not stop the loss.** The player still loses the wall; they are told
  more accurately. That is worth having and it is not a fix.
- **Permitted by the no-count ruling.** [#749](https://github.com/woogitsu/lockstate/issues/749)
  forbids a *count*; naming no count is not the same as naming no subject.
- **Cost.** One string and the reading behind it. Cheapest of the four.

### Option 4 — one undo stack for every reversible player action

The open question ADR 0025 and ADR 0022 name. `Undo` pops the newest
*reversible player action*, whatever kind it was.

- **The only option under which the one-word label is true.**
- **Cost, and why it is not one change.** Each producer has to define its own
  reversal, and at least one of those is itself undecided: is un-hiring a
  guard a *reversal*, or is it a `DismissStaff` with the severance
  `src/simulation/staff/dismissal.ts` charges? Those are different promises to
  a player who presses one key. Zoning has an answer already (`UnzoneRoom`),
  admissions and regime changes have none.
- It also needs the snapshot to carry the wider stack, so it touches the save
  schema — and therefore a migration.

### What this document recommends

**Option 2 now, option 4 as the direction, and option 3 folded into whichever
lands.** The reasoning, stated so it can be argued with:

1. **Option 2 is the smallest change that makes the key stop destroying work
   the player was not thinking about**, which is the harm §3 measures. It
   converts a silent destructive reach into a refusal.
2. **It is the only one of the four that is strictly compatible with all
   three existing decisions it touches** — #108's reload property,
   `build-tool.ts`'s argument against a gesture-state condition, and #749's
   no-count ruling.
3. **Option 4 is the meaning; option 2 is the guard.** Shipping 2 first buys
   the fact 4 needs anyway, so it is not throwaway work.
4. **Option 1 is rejected as a design**, not as an implementation: a control
   whose behaviour depends on which tab is open is harder to learn than one
   that refuses and says why.

## Cost, priced

| option | new player-visible string | save schema | new shared fact | stops the §3 loss | stops the §4 week-old case |
| --- | --- | --- | --- | --- | --- |
| 1 | no | no | no | yes | yes |
| 2 | **yes, one refusal** | no | **yes, one monotone marker** | yes | yes |
| 3 | yes, one rewording | no | no | **no** | **no** |
| 4 | probably several | **yes, and a migration** | yes | yes | yes |

## Consequences for existing sentences

- **ADR 0025 `:475-478` and ADR 0022 `:631` stay true and stop being
  incomplete.** Both say the hire and the designation are not on the stack.
  Neither says what the press then reaches. Whichever option is accepted, both
  documents owe one clause naming the consequence, and this document is where
  the answer they defer to lives.
- **`'The last change to the build queue was undone — anything already spent
  past the point of no return stays spent.'` keeps its words under options 1,
  2 and 4** — under 1 and 2 it is simply not raised by the act §3 measures,
  and under 4 the subject is whatever the player actually did. Under option 3
  it is replaced, and the replacement is a player-visible promise.
- **Nothing here moves any other document's status.**

## The weakest claim this document named, and what settling it returned

> **THE PARAGRAPH BELOW IS KEPT RATHER THAN DELETED, BECAUSE THE DIRECTION IS
> THE FINDING.** It read, before the read it asked for was done:
> *"**That "the newest accepted player command" is a cheap fact.** The claim
> rests on ADR 0099's precedent and on every command passing one router with a
> tick — both VERIFIED — but the marker option 2 needs is not merely a tick: it
> has to distinguish a command the player issued from one the simulation issued
> on their behalf, and this document has not enumerated the commands to check
> that the distinction is clean. If it is not, option 2's cost moves from one
> monotone fact toward option 4's, and the recommendation weakens with it.
> **What would settle it:** enumerate `SimulationCommand`'s members and classify
> each as player-issued or not. That is a bounded read and it is not done
> here."*

**It is done now, and the distinction does not exist — which strengthens option
2 rather than weakening it.** VERIFIED at `296812c9`:

- `simulationCommandSchema` (`src/simulation/protocol/commands.ts:597-613`) has
  **fifteen** members.
- Every `.submit(` call site in the whole of `src/` — **fifteen of them**, one
  per member — is in `src/main.ts`, inside the HUD-intent dispatcher, and every
  one reads an `intent`. No other module submits a command at all.
- The worker's only `submitCommand` call is
  `state-machine.ts:1130`, inside `handleSubmitCommand`, which forwards a
  `simulation/submit-command` message that arrived from the main thread. **The
  simulation originates no command.**

So the marker option 2 needs is *"the newest accepted command"*, full stop:
there is no player/non-player classification to get wrong, because there is
only one kind. Option 2's price is one monotone fact and it does not drift
toward option 4's.

### The new weakest claim, which is what the old one turned into

**That the property above stays true, and nothing enforces it.** "Every command
is player-issued" is an enumeration of fifteen call sites on one tree, not an
invariant: `tests/foundation/composition-root-contract.test.ts` pins specific
*wirings* in `src/main.ts` and says nothing about where a command may be
submitted from. The day something in `src/` submits a command no press caused —
an automatic sanction, a scheduled admission, a retry — option 2's marker
silently starts counting it, and `Undo` starts refusing transactions the player
really did just create. **The read is sound and the guarantee is absent**, and
that is a different and smaller claim than the one it replaces. Open question 4
names the gate.

Two smaller ones, stated rather than buried:

- **The probe drives the simulation, not the HUD.** §3 proves what the press
  reaches and what event it records. What a player *reads* is a table lookup
  on the far side of the worker boundary, read at
  `src/ui/simulation-events.ts:482-486` rather than rendered.
- **§4's reload is a `ConstructionSystem.restore` from its own snapshot into a
  fresh runtime**, not a full envelope round-trip through
  `PrisonSaveRepository`. The schema wiring is VERIFIED
  (`save-schema.ts:226`, `:1266`), so the two should agree; they were not run
  end to end.

## What would change my mind

- **A finished order turning out to be unreachable by `Undo` in real play** —
  refuted for this act by §3's `completed → cancelled`, and it is the one
  reading that would make this a cosmetic issue.
- **`build-tool.ts:250-256`'s argument extending to option 2.** It argues
  against conditioning the key on *gesture state*. If it is really an argument
  against conditioning the key on anything, option 2 falls with option 1 and
  only 3 and 4 remain.
- **The owner ruling that `Undo` means "take back the last build"** rather
  than "take back what I just did". That makes option 3 the whole answer, and
  the one-word label becomes the thing to change instead of the behaviour.

## Open questions

1. **Is un-hiring a guard a reversal or a dismissal?** Option 4 cannot be
   specified without an answer, and the two differ by a severance the player
   would or would not pay. Not proposed here.
2. **What does `Redo` mean under option 2?** A refused undo pushes nothing, so
   `Redo` is unaffected by the refusal itself; whether a *stale* redo should be
   refused by the same rule is not decided here.
3. **Should a contract pin command submission to the composition root?**
   Option 2 rests on every command being a player press, which is true by
   enumeration and guarded by nothing. A gate of the shape this repository
   already uses — a boundary manifest over `.submit(` call sites — would turn
   the enumeration into an invariant, and it would fail on the first
   simulation-issued command rather than on the first `Undo` that refuses
   wrongly because of one. Not proposed here, because it is only worth its
   maintenance if option 2 is accepted.
4. **Is there a pointer route to undo at all?** ADR 0022 `:631` already
   records that undo being a keyboard chord left *"no recovery of any kind on a
   touch device"*, and [#928](https://github.com/woogitsu/lockstate/issues/928)
   carries that half. This document changes what the key does, not how it is
   reached.

## Amendment, 2026-09-23: a placement the simulation refuses is not the player's latest action

**Ruled by the owner on 2026-09-23.** From three options this session wrote,
they chose the one labelled:

> Opcja A (zalecane)

("Option A (recommended).") **The provenance is the weaker kind**, as the
acceptance above records of its own: the label of an option this session
wrote and the owner picked, not a sentence they typed. It was given against a
summary of the options and the measurement below, not against this text.

### The question it settles

Option 2 refuses a press when the newest construction transaction is older
than *"the newest accepted player command of any kind"*. It does not say what
happens when that newest command was a **placement the simulation refused on
its content**. The kernel accepted the command, and the simulation decided
the order `failed`.

The question was forced by
[#1370](https://github.com/woogitsu/lockstate/issues/1370), which marks the
status strip's Undo unavailable when a press would do nothing. A refused
placement left a dead transaction on top of the stack, so Undo went dim while
a live wall sat beneath it.

### What the code did before, measured and verified

- **Refused walls were registered.** `PlaceBuildOrder` called
  `registerTransactionOrder` after its `failed` branch, so a refused wall
  entered the history. That opened a dead transaction, emptied the redo stack
  and reset `newerActionThanTheStackTop`.
- **The consequence, measured through the real kernel and router.** Place a
  live wall at 12,12, then `HireStaff`, then a wall at 900,900 (refused), then
  press Undo twice. The result was
  `{"dead":"failed","p1":[],"p2":["construction.undone"],"live":"cancelled"}`.
  The first press recorded nothing. The second reversed a wall placed
  **before the hire**, which is §3's loss, reachable in two presses despite
  option 2.
- **Refused objects were never registered.** `ObjectPlacementService` returns
  through `refuse(...)` on every refusal before it registers anything, so the
  wall path and the object path disagreed.

### The decision (option A)

**A placement the simulation refuses is not written to the undo history.**
- It opens no transaction.
- It leaves the redo stack as it was.
- It leaves the newer-action flag as it was.

For option 2, "the newest accepted player command" is therefore the newest one
that changed something. A refused placement changed nothing, and it has
already told the player so with a refusal of its own.

Implemented in `createConstructionCommandHandler`'s `PlaceBuildOrder` branch
(`src/simulation/construction/handler.ts`, the
`if (order.state !== 'failed')` guard around `registerTransactionOrder`).

**Pinned by** `tests/integration/undo-refuses-a-transaction-the-player-did-not-just-create.test.ts`,
under *"Undo, after a placement the simulation refused"*. Each case was
watched red on the code before the change:
- **One press.** A refused wall over a live one is reversed in one press.
- **Refused after a hire.** Live wall, hire, refused wall: both presses give a
  visible refusal.
- **Redo survives.** A refused wall no longer empties the redo stack. This is
  the one change a player can see.

### The options not taken

**The three options the owner was offered were:** option A, the one chosen;
*"Odrzucone = nowsza akcja"* ("refused = newer action"), the second bullet
below; and *"Na razie bez zmian"* ("no change for now"), which would have left
this document as it stood, shipped #1370's mark dimming Undo over a dead top,
and filed the two-press hole as a separate issue. **The first bullet below was
never offered.** It is the proposal that raised the question, and it was
withdrawn before the question was put, for the reason that bullet gives. It is
recorded here so a later reader does not propose it again without that
reason, not as something the owner declined.

- **Skip dead transactions inside `undo()`.** This fixes the dim button in one
  press, but it widens the hole above from two presses to one. Take a live
  wall, a hire and a refused wall: the refused wall resets the flag, and a
  skipping press lands on the wall placed before the hire. Closing that would
  need a per-transaction "superseded" mark, which is save state, and so a
  migration. This document's own field comment on
  `newerActionThanTheStackTop` rejects a per-transaction tick for that cost.
- **Treat a refused placement as a newer action.** That is the literal reading
  of option 2: the next Undo would refuse. It keeps the dead-transaction
  shape, and it would have required the object path to change to match.

### What it leaves

- **A dead top can still arise two ways.** Either `update()` fails an order
  whose content was withdrawn mid-session, or a save written before this
  amendment is restored carrying one; the stacks are restored as saved,
  #108. `ConstructionSystem.undoWouldReverseSomething` still answers both
  correctly.
- **No save-format change.** The snapshot's shape is untouched.
- **Open question 2 above**, about a stale redo, is not answered by this.

