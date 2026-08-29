# Design search: what else could Lockstate's economy and progression be?

**Dated 2026-08-29.** Read-only, like every record under `docs/research/`. It is
what was known when the issues it produced were filed; when the code moves on,
this does not become wrong, it becomes older.

## What this is

The owner sent `00-the-brief-as-sent.md` to nineteen independent models and
returned their answers. This directory is the corpus, reduced.

- `00-the-brief-as-sent.md` — the brief, verbatim, as it went out.
- `batch-a-extract.md` … `batch-d-extract.md` — the nineteen answers reduced to
  **251 deduplicated mechanism entries**, each carrying the same six fields the
  brief asked for: the mechanic, what it reuses, what the player now optimises,
  the accepted cost, the build size, and a status.

The nineteen source documents themselves are not in the repository. They are the
owner's, they are ~465 KB, and every idea in them that survived reading is in
the extracts with its source file named.

## How the reduction was done, and what that costs

Four readers, each given the brief and a disjoint set of source documents, each
writing one extract to a fixed schema. **They did not see each other's work**, so
the same mechanism appears in more than one batch under different numbers — the
cross-batch clusters are listed below rather than merged into the files, because
merging them would have destroyed which document said what.

The reduction is a summary and inherits a summary's failure mode: **a mechanism
that is vague in its source is vague here**, and the extracts say so entry by
entry rather than quietly improving it. Where an extract adds a reading of its
own it is marked "My reading" and is the reader's, not the source's.

## Where the answers agree

The convergence is much stronger than the count of ideas suggests, and it is not
about ideas at all — it is about order.

**Fourteen of the nineteen documents put the same thing first: make the game
stop lying about capacity.** They arrive at it independently and by different
routes — certified places, licensed capacity, capacity compliance bands, sector
load ratios, cell quality scores — but the target is one line of code's meaning:
today an occupied place is *a prisoner assigned to a room*, and they all want it
to mean *a prisoner backed by residency capacity that currently exists*.

The argument they give for putting it first is the same one every time, and it
is an argument about the decided-but-unbuilt work rather than about their own
proposals: threshold grants, prison labour, admission bounties and release
scores all multiply whatever the occupied-place count says, so shipping any of
them onto the present definition pays out on the measured exploit — the one the
brief itself records, where a plank removed and re-spent produced 3 residents
and 4,380 earned against a control's 1 and 1,460.

**Second, with almost the same weight: Decision 1's other half was never
wired.** That decision accepted, in its own text, that "overcrowding must be
punished elsewhere or the optimum is to pack the prison". The documents differ
on the instrument but not on the diagnosis, and the sharpest of them says the
instrument already exists: *"Do not add a new overcrowding tax. The 40-withhold
is the tax. Give it something to read."*

**Third: the dead rooms do not need functions, they need readers.** The brief
records a deliberate refusal to invent actions for the nine unroutable rooms,
on the grounds that every candidate was a clone or needed a system that does not
exist. Several documents accept the refusal and then dissolve it: a room does
not have to *do* anything new if something existing starts *reading* it. A
garbage room that resets a filth counter, a utility panel that powers eight
provisioning objects, a security office that buys six hundred ticks of warning,
a staff room whose mere existence clears guard fatigue — none of those is a new
subsystem, and each gives a dead room a consumer.

## Where they disagree, and the disagreements worth a ruling

These are live conflicts inside the corpus, not settled positions:

- **Loan repayment shape.** Revenue-share (a fixed percentage of positive
  inflows, no fixed instalment) versus a fixed daily deduction. One document
  argues the fixed instalment "recreates a loss condition by arithmetic" in a
  game that decided not to have one; two others propose exactly that instalment.
- **Overcrowding: cliff or curve.** Clamp payment at certified capacity, or
  degrade continuously above 100%. Two documents solve the same gap by opposite
  means and both should not ship.
- **Are the three unmeetable needs a bug or the point?** The brief says nobody
  has decided. The corpus splits: one document rules **safety is a bug** (its
  instrument, coverage, exists and is unread, so Decision 1's "safely" half has
  no reader) while **hygiene and recreation are the point** (a short sentence
  should not finish them; laundry and visits are leaks, not demolitions).
  Another wants a large payout for a prisoner released with zero unmet needs —
  which, against the brief's own tick counts, would almost never pay.
- **Patrol.** Three documents propose player-drawn routes without noticing the
  accepted decision behind the derived sector's missing route; one reads the
  constraint and routes around it, giving the patrol system an explicit
  authoring path instead of removing its skip; one says the no-patrol decision
  is right *conditionally* — right if coverage becomes a reader and the console
  becomes information, and reopenable if neither ships.
- **Cross-session persistence.** Three propose it; one argues explicitly against
  it *for now*, on the grounds that the deterministic kernel is currently how
  anyone tells whether a change is a change.

## The one factual challenge to the brief itself

One document checked the brief's own arithmetic and found it does not close.
The brief reports "a neglected twelve-prisoner prison earns about 150/day while
three guards cost 240/day". The withholding schedule floors at 60 per prisoner
per day, so twelve paid places cannot gross less than 720.

**Checked here against the code rather than against the brief.**
`stateIncomeForCompletedDay` in `src/simulation/economy/income.ts` sums
`stateIncomeForPrisonerDay` over `source.roomInstances.residentIds()`, and
`stateIncomeForPrisonerDay` returns `Math.max(0, 300 - 40 * unmetNeeds)`, which
is 60 at six unmet needs. So the floor is per **resident of a room instance**,
and a prisoner who is not a resident of one contributes nothing at all.

That makes the reading with the fewest assumptions **not** "income is tight" but
"most of that population was not housed". It is not the only reading — the
figure could be a net treasury delta, or a mid-day reading of the prorated
"earned today" accrual, which `stateIncomeAccruedByTick` computes and which is
by construction smaller than the day it belongs to. This record does not settle
which. It records that the number cannot mean what it was taken to mean, and
that no sink should be tuned against it until someone re-measures.

## What is not here

**Nothing in the corpus is a decision.** Every entry is a candidate. The
statuses `ALREADY DECIDED` and `CONTRADICTS DECISION n` mark entries against the
brief's own list; they mark what a document proposed, never what was accepted.
