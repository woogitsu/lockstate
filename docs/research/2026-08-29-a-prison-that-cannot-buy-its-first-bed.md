# A prison that cannot buy its first bed, and a bed that pays for three

**Date:** 2026-08-29. **Measured against `main` at `ec10451` (v0.0.206)**, in a
worktree cut from it, with every figure obtained by running the sequence
described. An external economy audit raised both of these against `4c18bc4`
(v0.0.203) and marked them CONFIRMED, but its own preamble says it executed
nothing: it read for them. This record plays them.

Both still exist. Neither has been fixed and neither is fixed here — the
remedies are game-design decisions with real alternatives, and §5 and §6 carry
the two ADR drafts they need. **Both drafts are unnumbered.** `docs/adr/README.md`
says next free is 0075 and that 0072 is held; a number is not reserved until it
is a row in that index, and this record does not take one.

## 1. What is claimed, in one line each

- **ECON-002.** A purchase the game offers, accepts and never warns about can
  spend a new prison below the price of the cheapest object that produces
  income, after which the session can never earn another minor unit.
- **ECON-003.** `Undo` on a *completed* bed order returns the plank and leaves
  the resident housed, so one plank furnishes a cell, is recovered, furnishes
  the next, and every cell it left behind keeps earning.

Both reproductions are integration tests through the real kernel:
`tests/integration/economy-liquidity-hard-lock.test.ts` and
`tests/integration/economy-bed-recycling.test.ts`.

## 2. ECON-002, reproduced

**The loop that closes.** Three facts, each correct alone:

1. State income is paid per *occupied place*, and an occupied place is a unit of
   a room instance's `residentCapacity` that a prisoner holds
   (`src/simulation/economy/income.ts`, `OccupiedPlaceSource`).
2. `residentCapacity` is derived from standing `sleep-surface` objects. Both
   buildables in `BUILDABLE_REGISTRY` that place one — `bed-wooden` and
   `medical-bed-wooden` — require `item.wood-plank` and nothing else
   (`src/simulation/construction/definition.ts:180`,
   `src/simulation/construction/definition.ts:570`). No brick-priced definition
   places a sleep surface. The test derives this from the registry rather than
   listing it, so a future brick bed fails the assertion.
3. A plank is 65 (`src/content/procurement-catalog.ts:101`) and money has two
   sources: the opening balance of 25,000, and `StateIncomeSystem`.

So *cash below 65, no plank in stock, nothing plank-built to reverse* is a
closed state.

**Reached by one press.** `item.brick` is 40
(`src/content/procurement-catalog.ts:100`), so 625 bricks is exactly 25,000. The
Build panel's material stepper opens on `MAX_PURCHASE_QUANTITY` — 100,000 — and
not on affordability (`src/main.ts:665`), so the quantity is composable in the
interface as shipped. Nothing refuses the command; `refusals.last` is
`undefined` after it.

**The escapes, exhausted by running them.** After the delivery lands (288
ticks), on a balance of 0 with 625 bricks in the container:

| attempted escape | measured result |
| --- | --- |
| `CancelMaterialPurchase` on the landed order | `cancel-purchase.not-pending`; balance 0; bricks stay |
| `PurchaseMaterials` 1 x `item.wood-plank` | `purchase.insufficient-funds`; balance 0 |
| `PlaceObject bed-wooden`, then 5,000 ticks | order still `materials-pending`; no object; `residentCapacity` 0 |
| `AdmitPrisoner`, then 12,000 ticks (five in-game days) | `totalOccupancy` 0; balance 0 |
| build a brick object and `Undo` it | 625 bricks back; balance 0 |

and the structural half, which is what makes "no escape" a claim rather than a
list: `simulationCommandSchema` is enumerated in the test. There are fourteen
commands. Exactly one credits the treasury — `CancelMaterialPurchase` — and the
row above measures it refusing. There is no sell, no production, no gathering,
no research and no grant.

**It is a zone, not a knife edge**, and that is a separate test so no fixture
sits on the value it measures. 624 bricks leaves **40**: a non-zero balance the
status strip displays, and the same trap, because the trap is *below the price
of a plank*. A remedy that floors the balance at zero fixes nothing.

**And it is reachable without any reckless press at all.** The 625-brick
purchase is the audit's sequence and it is the loud one. The quiet one is
payroll, and it was measured on the same tree:

| step | balance |
| --- | --- |
| fresh prison | 25,000 |
| 616 `item.brick` at 40 — 308 wall segments, an ordinary first build | 360 |
| `HireStaff` one guard, one day's wage up front (`src/simulation/staff/hiring.ts:198`) | 280 |
| three in-game days of payroll at 80 (`src/content/staff-role-catalog.ts:150`), nothing pressed | **40** |
| `PurchaseMaterials` 1 x `item.wood-plank` | `purchase.insufficient-funds`, 40 |
| tick 12,000 | 0, with unpaid wages climbing |

Nobody spent the treasury. A recurring charge the player cannot decline walked
it below the price of the one object that starts the income line, and ADR 0049's
insolvency-as-a-state — which is right, and which a *furnished* prison digs out
of — has nothing to dig with before the first bed exists.

**This contradicts an accepted decision rather than filling a gap.** ADR 0017
decision 8 is *"insolvency is a state, not a loss condition"*, accepted because
#96 asked for an answer *"interesting rather than terminal"*. The state above is
terminal — not a loss screen, which would at least be legible, but a session
that continues, accepts commands, and can never change. ADR 0017 decision 3 also
already accepts that *"grants and labour income remain, as secondary lines"*;
neither exists in code. So the question the ADR in §5 asks is which remedy
realizes decisions 3 and 8, not whether the state is acceptable.

## 3. ECON-003, reproduced

**The half that is already decided, and is not the finding.** ADR 0028 decision
2 says a removal evicts nobody. `tests/integration/object-removal-loop.test.ts`
already measures the resulting cell — occupancy 1, `residentCapacity` 0 — its
survival of a save round trip, and the sentence *"the state still pays for the
place they occupy"*. That is intended and this record does not re-argue it.

**The half that is decided nowhere: two commands disagree about whether a
finished object un-builds into its materials.**

- `RemoveObject` on a completed order refunds nothing. Measured, and
  `object-removal-loop.test.ts` says why: *"the plank became a bed"*.
- `Undo` on the same completed order refunds the plank in full.
  `ConstructionSystem.cancelOrder` releases `materialsAllocated`
  (`src/simulation/construction/system.ts:565`), and nothing clears that field
  when an order completes — it is written once at allocation
  (`src/simulation/construction/system.ts:726`) and carried through
  `'completed'`.

Neither is the decided answer. ADR 0017's consequences already record it:
*"#99's dismantle-to-salvage decision means a built object's value returns as
**carried salvage**, not as cash"*, and ADR 0037 names the same issue as the one
that *"would give `ContainerRegistry` a removal path"*. So the repository holds
a third answer for removal that neither command implements.

**What the two halves make together.** Place, admit, undo, repeat.

| | recycled | control |
| --- | --- | --- |
| planks bought | 1, for 65 | 1, for 65 |
| cells zoned | 3 | 3 |
| beds standing at the end | 1 | 1 |
| residents at tick 12,000 | **3** | 1 |
| balance at tick 12,000 | **29,315** | 26,395 |
| state income earned | **4,380** | 1,460 |

Same seed, same purchase, same tick. `24,935 + 3 x 1,460 = 29,315`: exactly
three times the income for exactly the same money. The bound is the number of
cells the prison can zone, not the number of planks it can buy — so "unbounded"
overstates it and "one plank, one resident per cell, for ever" does not.

**The invariant this breaks is written down.** `src/simulation/economy/income.ts:112`
argues that `assign` refusing past `residentCapacity` means *"the count can never
exceed the capacity the prison has actually furnished, which is a stronger
statement than it used to be"*. Occupancy 1 against capacity 0 is that count
exceeding that capacity. The code is right and the paragraph rotted.

**Look one module over: the fix is already written.**
`PrisonerOperationsRuntime.relocateResidentsOutOf`
(`src/simulation/prisoners/prisoner-operations-runtime.ts:500`) moves every
resident of named instances into other suitable accommodation, atomically —
all-or-nothing, ascending entity id, rolling back every move it already made if
one resident has nowhere to go, reading no RNG and no clock. It was built for
#478 so `UnzoneRoom` could relocate rather than refuse. `RoomZoningService` is
its only caller. An object removal that drops a cell's capacity below its
occupancy is the same question asked one command over.

Its one gap for this use: it empties whole instances. A room losing one of two
beds needs *the excess* relocated, which is a narrowing of the same walk rather
than a second mechanism.

## 4. What is not affected

- **No save payload field.** Neither reproduction adds or reads a field, and
  neither remedy sketched below requires one — `relocateResidentsOutOf` writes
  only state the save already carries, and a grant or a floor is a balance.
- **No determinism fingerprint moves.** No production code changed for either
  reproduction.
- **No player-facing string.** Neither test adds a locale key. Two of the
  remedies below *would* add one, and that is called out where it applies,
  because a locale key with no implementation behind it is the defect ADR 0046
  records.

## 5. ADR draft — what a prison that cannot afford its first bed is owed

**Unnumbered. Renumber the file, its row in `docs/adr/README.md` and every
citation of it when a number is assigned.**

**Status:** Proposed.

**Context.** §2. A legal purchase reaches a state ADR 0017 decision 8 says must
not exist, and the owner's standing brief for this work is *"I could not build a
prison on my own"* — which is this, with a mechanism.

**The decision to take: which of these, and in what order.** They are not
equivalent, and the spread is the point — one changes the economy's shape and
one is a sentence in the HUD.

1. **A liquidity floor.** `Treasury.spend` (`src/simulation/economy/treasury.ts:111`)
   refuses a discretionary spend that would leave less than one plank's price.
   *Cost:* a magic coupling between the treasury and a content price; and it
   makes the floor a *rule* the player must be told about, or they meet a
   refusal they cannot explain. *It also fights ADR 0017's decision-8 ladder*,
   whose third rung is "staff unpaid" and depends on discretionary spends being
   refused *before* the undeclinable one — a floor changes which rung is
   reached first. Cheapest to build; hardest to explain.
2. **Sell-back at a loss.** A `SellMaterials` command, at a fraction of the
   purchase price. *Cost:* a new command, a new refusal reason, a new HUD
   control, a new player-facing string — and a price ratio, which is a balance
   value ADR 0017 decision 5 reserves to #29. *Benefit:* it is the general
   answer. It fixes every future variant of "the money is in the wrong shape",
   not this one instance, and it is what a management sim normally has.
3. **A starting grant of planks.** The opening container holds enough planks
   for one bed. *Cost:* almost none, and it is honest about what the game
   requires to begin. *It does not fix the class:* a player who builds a bed,
   removes it, and spends the rest on bricks is back in the trap on day two.
4. **A recurring grant.** ADR 0017 decision 3 already accepts grants as a
   secondary income line and nothing implements one. A small unconditional
   per-day credit makes every trap temporary rather than terminal, which is
   exactly decision 8's *"interesting rather than terminal"*. *Cost:* a real
   balance decision (#29), and it weakens the pressure the whole economy is
   built to create.
5. **A warning before a purchase that spends the last of the treasury.** A
   confirmation on the press. *Cost:* a player-facing string, and touch/keyboard
   parity per `AGENTS.md` boundary 10. *It does not fix the class either*:
   payroll can walk a prison into the same state with no press at all.
6. **Say the prison is stuck.** An explicit terminal state with a sentence and
   a restart. *Cost:* it converts decision 8's answer into the loss condition
   that decision rejected. Listed because it is honest, not because it is
   recommended.

**The payroll route above disqualifies 3 and 5 as complete answers**, and that
is the sharpest thing this record has to say about the option list: a starting
grant of planks is spent by day two and a confirmation dialog never fires,
because the press that empties the treasury is not a press. Both remain useful;
neither closes the class.

**Recommendation to the owner:** 3 now and 2 next. 3 is a one-line content
change that makes the first hour of the game work and buys time; 2 is the
general answer, needs #29's ratio, and should not be rushed for that reason.
1 is recommended *against* — it is the cheapest patch and the one that quietly
edits ADR 0017's insolvency ladder.

**What would change this:** if the owner intends prisons to be able to fail
irrecoverably, 6 becomes the right answer and the rest are wrong. That is a
product call and it is the owner's.

## 6. ADR draft — what happens to a resident whose bed is taken away, and what a finished object un-builds into

**Unnumbered.** Same renumbering commitment as §5. **This ADR amends ADR 0028
decision 2**, which decided that a removal evicts nobody, and it should be read
as narrowing that decision rather than replacing it.

**Status:** Proposed.

**Context.** §3. Two questions that look like one and are not.

**Question A: may residency outlive the object it was granted for?**

1. **Evict on capacity loss** — relocate the excess through
   `relocateResidentsOutOf`, and only fail the removal if there is nowhere to
   put them. *Benefit:* the machinery exists, is atomic, is deterministic, and
   is already trusted by `UnzoneRoom`. *Cost:* a removal can now move a
   prisoner across the prison, which is a bigger consequence than a player
   pressing "remove bed" expects; and the no-vacancy branch has to do something
   (refuse, or leave the state as it is today).
2. **Revalidate at income time** — leave residency alone and pay only
   `min(occupancy, residentCapacity)` per room. *Benefit:* smallest change,
   touches one system, and it restores the invariant
   `src/simulation/economy/income.ts:112` already claims. *Cost:* the prisoner
   is still sleeping in a cell with no bed and nothing says so; it closes the
   money leak and leaves the fiction broken.
3. **Refuse the removal while a resident depends on the object.** *Cost:* this
   is what `UnzoneRoom` did before #478 and #478 exists because it was wrong —
   a room could become permanently un-editable through ordinary play.
   Recommended against for the reason #478 already established.
4. **Accept it and charge for it** — an over-capacity cell costs the prison
   something. *Cost:* a new mechanic and a new balance value; the most
   interesting answer and much the most expensive.

**Question B: what does a finished object un-build into?** Today `Undo` says
"its materials, in full" and `RemoveObject` says "nothing", and only one of them
can be right.

1. **Salvage, both routes.** #99's decided answer, which ADR 0017's consequences
   and ADR 0037 both already cite. *Cost:* it is unbuilt, and ADR 0037's bullet
   says whoever builds it owns a known stock-destruction hole in
   `ContainerRegistry`.
2. **Nothing, both routes** — `Undo` stops refunding a completed order's
   materials. *Cost:* it makes `Undo` a lie for the case it was written for; a
   wall undone one tick after it finished would silently eat two bricks.
3. **Full materials, both routes** — `RemoveObject` starts refunding.
   *Cost:* dismantling becomes free and reversible, which is a real economy
   change and contradicts #99.

**Recommendation to the owner:** A2 now, as the correctness fix, because it
restores a stated invariant in one system with no new mechanic; then A1 when
somebody can own the no-vacancy branch properly. On B, B1 is the decided answer
and the honest one, and it is a bigger piece of work than either finding —
recording it here so the disagreement between the two commands is not closed by
whichever patch lands first.

**What would change this:** if the owner would rather a bed removal never move
anybody, A2 is the whole answer and A1 should be dropped, not deferred.

## 7. Weakest claim, and what would change my mind

**The weakest claim is the ECON-002 word "never".** What is measured is that
five specific escapes fail, that the fourteen-member command union contains one
crediting command, and that both sleep-surface buildables are plank-priced. What
is *not* measured is every ordering of those fourteen commands — a combination
argument, not an exhaustion. What would change my mind: any sequence that
raises the balance above 0 from the state the test leaves. A `SellMaterials`
command, a grant, or a brick-priced bed would each do it, and the test's
enumeration is written so that adding any of them fails a named assertion rather
than silently making the file a false story.

Second weakest: **"one plank per cell, for ever" is bounded by zonable land and
I did not find the bound.** Three cells were measured; the starter prison owns
one 32x32 chunk and a `room.cell` minimum is a 2x3 interior, so the ceiling is
tens rather than three, but I did not count it and do not claim a figure.

**What I did not reach:** the browser suite (Git LFS is not provisioned in this
container, so `public/assets/**` are pointer files and the atlas-decode spec
fails by design, `docs/AGENT_WORKFLOW.md` §2); whether a *restored* session
reproduces the recycling loop — `object-removal-loop.test.ts` already covers the
residency half of that across a save round trip, but nothing covers the plank
refund across one; and how many `room.cell` instances the starter chunk actually
admits, which is the real ceiling on §3's table.
