# ADR 0103: What a gang is, and how a grudge forms

> **NUMBERED AND PROMOTED 2026-09-08, ON THE CONDITION THIS DOCUMENT SET
> ITSELF.** "Promotion, decided rather than deferred" below said the obstacle
> was substantive rather than the number, and named the one thing that would
> flip it: *"Open Question 1 answered by the owner — either branch."* The owner
> answered it the same day, choosing reading A (recorded in Status), so
> Decision 2 can be stated flat and this document has moved out of
> the `drafts` subdirectory it was written into, taken **0103**, and taken its row in
> `docs/adr/README.md`. **That subdirectory no longer exists**: it held this
> file and nothing else, so moving the file emptied it and git does not track
> an empty directory. Every mention of it below is therefore written as prose
> rather than as a rooted path, deliberately — `documentation-links-contract`
> resolves rooted paths against disk and a historical narrative must not leave
> five dangling ones behind.
>
> **Its Status is still `Proposed`**: the owner ruled on
> the producer and on the reading, not on the document.
>
> **The number was re-swept rather than carried forward, because the earlier
> sweep said it would be stale.** `git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`,
> then `git ls-remote --refs --heads origin` (**250 heads**, down from 252
> because branches have since been merged and pruned) with
> `git ls-tree --name-only <head> -- docs/adr/` read out of every one of them.
> The highest four-digit prefix on any head was **0102**; nothing at 0103 or
> above appeared anywhere. Highest on disk is also 0102 and the index's prior
> line already read `Next free number: 0103`. **All three agree**, which is the
> configuration `docs/adr/README.md` calls lucky rather than normal.
>
> **The paragraph below is kept rather than deleted, because it is the record
> of why this file sat one directory down for a day**, and `docs/AGENT_WORKFLOW.md`
> §4 asks for both directions. Every claim in it was true when written and the
> first sentence is now false.

> **This document carries no number, deliberately.** `AGENTS.md` states that
> ADR numbers are assigned centrally after drafts return and that *"A number is
> not reserved until it appears in `docs/adr/README.md`"*, so this draft takes
> none and pre-commits to being renumbered, retitled into the
> `NNNN-kebab-case.md` form, given its row in the index and moved up one
> directory without argument, exactly as every numbered ADR in this corpus
> pre-committed before it.
>
> **WHY IT WAS IN A `drafts` SUBDIRECTORY AND NOT DIRECTLY IN `docs/adr/`, MEASURED
> RATHER THAN PREFERRED.** The brief that commissioned this document asked for
> it at `DRAFT-what-a-gang-is-and-how-a-grudge-forms.md` directly inside
> `docs/adr/` **and** asked
> for `tests/foundation/` to be green. Those two are mutually exclusive on this
> tree and it was checked rather than assumed: a file of that name placed
> directly in `docs/adr/` fails **five** assertions in
> `tests/foundation/adr-numbering-contract.test.ts` — the filename is not
> `NNNN-kebab-case.md`, its four-character prefix `DRAF` is not a number that
> matches any heading, the index holds no row for it, no row links to it, and
> the stated next free number becomes `0NaN`. That test's own allow-list
> comment says why it must be that strict: `SUPPORTING_DOCUMENTS` is
> *"An explicit allow-list rather than a `!/^\d{4}-/` filter"* precisely so a
> misnamed ADR is *"a malformed one"* rather than silently exempt.
>
> A subdirectory is skipped by that test's `statSync(...).isFile()` filter, so
> the exact filename the brief asked for survives, one directory down, and the
> whole foundation suite stays green — measured below under "The gates". This
> is a deviation from the brief and it is named here rather than buried in a
> report.
>
> **RE-DECIDED 2026-09-08, after the owner ruled on the producer, and the
> answer did not change.** The placement above was a mechanical consequence of
> a brief; the question of whether this document is now *ready* to be numbered
> is a different one and is answered under "Promotion, decided rather than
> deferred" below, with a 252-head remote sweep behind the number and a
> substantive reason for the delay that is not the number.

## Status

**Accepted by the owner on 2026-09-08 — all seven decisions.** Put to them as
three clickable options after the ruling on reading A had been recorded, they
chose the one labelled:

> Przyjmij wszystkie siedem decyzji

("Accept all seven decisions.")

**Open question 2 answered by the owner on 2026-09-10 — both directions at
half weight.** The one remaining answer that
[#979](https://github.com/woogitsu/lockstate/issues/979) was blocked on: the
grudge ledger is directional and this document's ruling "between" is
symmetric, so somebody had to say which of two prisoners is the offender.
Put to them as four clickable options, they chose the one labelled:

> Obie strony po pół wagi

("Both sides at half weight.")

**The provenance is the weaker kind, exactly as the 2026-09-08 acceptance
above is**: the label of a clickable option this session wrote, given against
a summary of the three available answers and the `instigatorId` objection,
not a sentence the owner typed. **And the cost this document named beside its
own instinct was not waived by the answer** — half-weight writes double the
ledger entries and the cadence is still unmeasured. See open question 2 below
for what that makes a precondition of, and of what.

**No decision's status moved, and no player-visible sentence is authored
here.** The answer settles a direction in a ledger nobody reads on screen;
question 1's finding stands untouched, so a player still cannot connect a
retaliation to the fight that caused it.

**DECISION 6 AMENDED BY THE OWNER ON 2026-09-19 — the member split AND the
cadence, both at once.** Of 12 seeds, 7 reach a tier-3 pair; 3 of those draw a
same-gang pair and never retaliate, and the remaining 4 lock the prison down
every 4,800 ticks forever — so an id parity decides which game a session gets.
Put to them as options, the owner chose the one labelled *"Obie naraz"* ("Both
at once"). **The provenance is the weaker kind, as above.** The amendment is
written into decision 6 itself rather than summarised here, and **the acceptance
of all seven decisions does not move**: one of the seven is amended, none is
withdrawn. **No code changed with it**, and the amendment deliberately fixes
neither the new split nor the new cadence figure.

**Given against a summary, not against these 1,700 lines, and that is
disclosed rather than glossed.** The option they read carried three things: that
Decision 2 was already theirs and decisions 1 and 3 to 7 were the document's and
unaccepted; that the open questions could stay open, *"ADR 0102 was accepted
exactly that way, with the toilet question added"*; and that accepting unblocks
implementation — the gang registry, the grudge ledger, `gang-retaliation`. It
also said in as many words that this *"requires you to take decisions 1 and 3–7
on trust or read them"*. They took it.

**IMPLEMENTED 2026-09-09, AND WHAT WAS LEFT UNBUILT IS NAMED HERE RATHER THAN
IN A PULL REQUEST NOBODY WILL FIND AGAIN.** All seven decisions are in `src/`:
two gangs seeded onto the watched sector at session creation and re-applied
after a restore (decision 1), the grudge producer on the adjudication seam with
the port widened to carry the record (decision 2), the amplifier untouched
(decision 3), the guard against a retaliation nobody is in (decision 4),
nothing added to the four this decision does not touch (decision 5), membership
assigned at intake (decision 6), and no text, asset or layout taken from
anywhere (decision 7).

**Three of the eight open questions bear directly on code that was written, and
none of them was answered.** Where a decision could not be implemented without
picking one, the decision's own words were followed and the question is named
at the site:

- **Open question 2 (which prisoner is the offender).** Decision 2.1 states the
  direction flat — the offending gang is the instigator's — and that is what is
  written, in `src/simulation/incidents/default-gangs.ts`. The other two
  answers, both directions at half weight and writing nothing until issue #80's
  real adjudication exists, are untaken.
- **Open question 5 (when membership is assigned).** Decision 6 says intake and
  intake is where it is. The consequence is measured rather than predicted: in
  the prison this document names as Fixture A, whose arrivals are admitted at
  `priorIncidents: 0`, **nobody is ever assigned** — entities 2 and 7 are tier
  1 at intake, are raised to tier 2 by `ClassificationEarlyWarningSystem` after
  the first assault, and first reach tier 3 at the review on tick **47,999**.
  The second write site that would catch them is what this question asks about,
  so it was not added.
- **Open question 6 (the weight).** Decision 2.5's recommended `0.2` is the
  constant, named `CROSS_GANG_ASSAULT_GRUDGE_WEIGHT` so a balance pass moves
  one number.

  **THAT SENTENCE STOPPED BEING TRUE ON 2026-09-11 AND IS CORRECTED RATHER THAN
  OVERWRITTEN (`docs/AGENT_WORKFLOW.md` §4), BECAUSE THE BALANCE PASS IT
  PREDICTED IS EXACTLY WHAT HAPPENED.** The constant is **`0.4`**
  (`src/simulation/incidents/default-gangs.ts:231`), raised by the owner's
  ruling on this open question in `554984ec`. The reason is in that constant's
  own docblock and is worth carrying here: at `0.2` the mechanism was
  measurably close to unreachable — eight seeds, ninety in-game days each, a
  gang member in **2 of 8** sessions and a retaliation in **1 of 8**. The
  document's *recommendation* was overruled; the *sentence* was left behind, and
  a reader taking this bullet at its word would price every figure in Decision
  2.5 at half the weight the game runs.

  **The two rulings interact, and neither bullet says so.** Open question 2 was
  answered *"both directions at half weight"*, and
  `recordGrudgeFromAdjudicatedAssault` splits the constant —
  `src/simulation/incidents/default-gangs.ts:310-314` — so each direction of a
  cross-gang assault accrues `0.4 / 2`, which is the `0.2` this bullet names.
  The recommendation survives as the *per-direction* figure and is false as the
  *constant*. That is the distinction to hold, and it is why this is marked in
  place instead of the number simply being changed.

**The measurement this document demanded was run and one of its predictions was
wrong.** Context 15's arithmetic says a lapsed assault plus *"the next review"*
reaches tier 3; the review system's cadence is `intervalTicks` and
`phaseTicks` of `CLASSIFICATION_REVIEW_INTERVAL_TICKS`, so the first review a
prisoner classified at tick 1,010 is eligible for lands at **47,999**, not at
25,010. The arithmetic was right about the score and out by roughly one whole
review period about the tick.

**And decision 4's sweep is three fixtures rather than the two this document
names.** Besides the two in `tests/unit/incident-trigger.test.ts`, the shared
`tests/helpers/determinism-scenario.ts` registers `gang-a` and `gang-b` with no
members and a grudge of 0.8, and had been opening a memberless retaliation that
five determinism and projection tests then asserted against.

**What the acceptance does not do.** It answers none of the seven questions
still open below, authorises no player-visible sentence (the branch that would
have needed one is the branch they declined on reading A), and moves no other
document's status.

**The `Proposed` record below is kept exactly as it stood**, per
`docs/AGENT_WORKFLOW.md` §4 and the precedent ADR 0098 and ADR 0101 set: the
acceptance is recorded above it rather than by overwriting it.

**Proposed. Not self-approved.** Nothing in this document is accepted, and the
agent that wrote it does not accept it. `AGENTS.md` reserves acceptance to the
owner and `docs/AGENT_WORKFLOW.md` §3 repeats it (*"never self-approve one"*).

**What the owner has already ruled, in their own words, on 2026-09-08.** Asked
whether the game should have gangs at all, they answered:

    Tak, ale najpierw ADR

("Yes, but the ADR first.")

**A SECOND RULING LANDED ON 2026-09-08, AND IT IS THE ONE THIS DOCUMENT WAS
WRITTEN WITH OPEN.** The question put to the owner was how a grudge between two
prisoners comes to exist. From a set of clickable options they chose:

> A grudge forms from an adjudicated assault between members of different gangs — one the player was actually shown.

**How that sentence reached this document, stated because provenance is the
thing a later reader cannot reconstruct.** It was relayed to this pass by the
integrating session as the owner's ruling of 2026-09-08, in English, as the
text of the option they clicked. It is **not** text the owner typed into this
repository, and no other words are attributed to them here. Where the two
earlier rulings above and in `AGENTS.md` are quoted in Polish because that is
what the owner wrote, this one is quoted in English because that is what they
chose; the difference is recorded rather than smoothed over.

**A THIRD RULING LANDED ON 2026-09-08, AND IT CLOSES THE FORK THE SECOND ONE
LEFT.** Decision 2.3 found that *"one the player was actually shown"* has no
referent in this codebase and admits exactly three readings, took reading A on
its own authority, and put the fork to the owner as Open Question 1. It was put
to them as three clickable options — reading A; announcing the adjudication as
a new player-visible sentence; or striking the clause from the rule. They chose
**reading A**, described in the option they clicked as:

> Czytanie A: „zapisana na kanale alertów"

("Reading A: 'recorded on the alerts channel'.")

**What that ratifies, and what it deliberately does not.** Decision 2.3 stops
being this document's choice and becomes the owner's, so Decision 2 can now be
stated flat — which is what promoted this file out of that subdirectory. The
option carried its own cost in the text the owner read, and the cost is
restated here rather than left in the option: **under reading A the ruling's
third clause constrains nothing today**, because `openIncident` records every
assault unconditionally. The owner chose it knowing that. What they did **not**
choose is the other branch — announcing an adjudication — so no new member of
`SIMULATION_EVENT_TYPES`, no new locale key and no new player-visible sentence
is authorised by anything here, and `AGENTS.md`'s fourth reservation is
untouched.

**That ruling is the whole of the owner's input on the producer, and together
the two settle one of this document's seven decisions.** Decision 2 below,
including 2.3, is now theirs. Decisions 1 and 3 to 7 are unchanged and remain
this document's, unaccepted.

**THE DISCLOSURE, BECAUSE A RULING MUST NOT BE MISTAKEN FOR A READING.** The
first answer was given to a *question* — should prisons have gangs — and not
against this document's Context, Decision, Cost or Open Questions, none of
which existed when it was given. It settles the product question issue #979
named as the owner's (*"Whether prisons should have gangs at all"*) in the
affirmative and settles nothing else.

**The paragraph above used to continue with a list, and one entry of that list
is now false. It is corrected rather than overwritten, per
`docs/AGENT_WORKFLOW.md` §4.** It read:

> Every "how" below — what a gang is, how many there are, where membership
> comes from, what produces a grudge, what the territory amplifier is for, and
> what the first retaliation does to a prison — is this document's, and is
> unaccepted until the owner reads it.

*"what produces a grudge"* is the entry that moved: as of the second ruling it
is the owner's and not this document's. The other five are untouched and the
sentence holds for them. The same disclosure several ADRs in this corpus carry,
for the same reason.

**What the second ruling does NOT settle, said plainly because the temptation
is to read a ruling as wider than it is.** It names no weight, no number of
gangs, no membership rule, no territory rule, and no guard on the trigger. It
does not say what happens to a grudge that is never acted on, and it does not
say whether a gang retaliation should itself produce a grudge. Those are open
questions below, numbered, and this document does not read the ruling onto any
of them.

**And one of its three terms has no referent in this repository.** Context 14
is the finding and it is the most important thing in this document: *"one the
player was actually shown"* names a state nothing records and, under its
strongest reading, a state the determinism contract forbids the simulation from
reading. Decision 2 presents the closest implementable reading and names the
gap rather than quietly redefining the owner's words; Open Question 1 is the
fork the owner has to close.

**What this document does NOT do** *(it said "this draft", and it is not one any more)*. It authors no production code, seeds no gang,
adds no locale key, and changes no player-visible string. `AGENTS.md`'s fourth
reservation covers the *promise*, not the wording, and the sentence at issue
here already exists; this document's business with it is to say what would make
it true, not to rewrite it.

**SPENT, AND THE SENTENCE IS KEPT BECAUSE IT WAS THE LAST LIVE ONE STILL
SAYING OTHERWISE.** It read:

> **Whether this document should be numbered and moved out of the `drafts`
> subdirectory is answered under "Promotion, decided rather than deferred"
> below, and the answer measured on this pass is not yet.**

The answer is no longer "not yet": the owner closed Open Question 1 the same
day, this document is **0103**, and it sits in `docs/adr/` with its row in the
index. **It was missed on the promotion pass** — the Promotion section below is
marked as kept-unedited and needed nothing, but this restatement of it was
outside every kept blockquote and went on making a live claim that the
document's own opening contradicts. Found by the pass that re-derived
`STATUS-QUEUE.md`, and recorded here rather than quietly deleted, because a
document that carries its own history has to carry the places where the history
was applied unevenly.

## Claim tiers used below

- **VERIFIED, read** — a source file was opened at the cited `file:line` on
  this branch, and where the claim rests on exact text, the text is quoted
  under `tests/foundation/adr-quotation-verbatim-contract.test.ts`'s form.
- **ARITHMETIC** — computed from constants that were opened, with the
  computation shown so it can be re-run.
- **REASONED** — derived from code that was opened, without a run behind it.
- **MEASURED** — produced by a run of an instrument named here, with its
  inputs given.
- **REPORTED, not reproduced** — carried from a test file or an earlier pass
  that states the number, without this document re-running it.

**Every anchor below was read at `491fcdce` (v0.0.541), off `origin/main`.**
Issue #979 was written against v0.0.467 and several of its anchors have since
moved; where one has, both numbers are given, because a reader checking the
issue against this document deserves to see which of us moved.

**Re-anchored for the ruling pass at `98e88f34` (v0.0.541)** — this branch with
`origin/main` at `adb9ed00` merged into it, which is the tree every claim added
on 2026-09-08 was read against and the tree the gates below were run on. **The
Context 1 to 11 anchors were re-opened on it rather than carried forward, and
every one still lands on the line it names**: `gangs.ts` at `:26`, `:37`,
`:52`, `:71`, `:82`, `:86`, `:87`, `:89`, `:96` and `:140`; `trigger-system.ts`
at `:262`, `:450`, `:492`, `:523`, `:524`, `:525`, `:529`, `:531`, `:538` and
`:546`; `response-system.ts` at `:218`, `:326`, `:327`, `:328` and `:329`;
`flashpoint.ts` at `:343`. Nothing in Context 1 to 11 needed correcting for
drift. That is stated because the alternative — assuming a week-old anchor
still holds — is the failure `adr-quotation-verbatim-contract.test.ts` exists
to catch, and an anchor it cannot catch is one this document has to check by
hand.

**BOTH PARAGRAPHS ABOVE ARE NOW FALSE, AND THEY ARE CORRECTED HERE RATHER THAN
OVERWRITTEN (`docs/AGENT_WORKFLOW.md` §4), BECAUSE EACH WAS TRUE OF THE TREE IT
NAMES AND THE SECOND ONE IS THIS DOCUMENT'S OWN RECORD OF HAVING CHECKED.**
Swept by hand on 2026-09-15 against `main` at `e044a3e8`, every anchor opened.

- **A global pin is advisory and does not date what is below it.** The
  convention is stated in `docs/adr/README.md`, in the section *"A global
  anchor pin in an ADR is advisory, and does not date what is below it"* added
  by pull request #1231 — which quotes **this document's** pin sentence among
  the five it collects. It is cited here and not restated: the reason a reader
  cannot trust the sentence above belongs in one place.
- **This document is an instance of that finding rather than an exception to
  it.** `338b053b` and `51b882d4` each edited anchors below the pin's own line
  with the pin sentence byte-identical in the commit's parent and in the commit
  itself. Neither commit message mentions a pin.
- **#1231 excluded `338b053b` from its evidence table on the ground that it is
  *"a reformat, not a re-aim"*, and that reading does not survive opening the
  diff.** That commit demoted two live anchors into historical blockquotes and
  wrote replacements beside them — Context 6's `trigger-system.ts:583` and
  Context 13's `response-system.ts:329` and `:218`, each moved into a quoted
  block introduced *"so they are quoted here as history rather than as live
  citations"*. Re-aiming an anchor into a history block is the most deliberate
  form of re-aiming there is. The exclusion is withdrawn; the row belongs in
  that table.
- **The enumeration above — *"every one still lands on the line it names"* — is
  a tally, which `docs/AGENT_WORKFLOW.md` §4 names as the sentence form that
  rots first, and it has.** Of its twenty-six entries, **at least eight no
  longer land on what the sentence citing them names**: all five of
  `response-system.ts` (`:218`, `:326`, `:327`, `:328`, `:329` — `:218` is now
  a docblock line that opens the note recording that the port stopped taking
  `(entityId, tick)`, and `:326` through `:329` sit inside an unrelated docblock
  about plural rules) and three
  of the ten `trigger-system.ts` entries (`:262`, `:531`, `:546`). The other
  eleven still land exactly: all ten `gangs.ts` entries and `flashpoint.ts:343`.
  **The split is the finding.** `gangs.ts` was not touched by the
  implementation; `response-system.ts` and `trigger-system.ts` are the two files
  decision 2 and decision 4 changed. An anchor into the file a decision edits is
  the anchor that decision breaks, and this document's Context sections cite
  those two files most.
- **Where the anchor still names live code, it is re-aimed below and the old
  number is kept beside it.** Where the sentence is a diagnosis of the tree this
  document replaced, it is left alone: re-aiming it would make a dead diagnosis
  read as current, which is the error pull request #1229 avoided in ADR 0040 and
  named.

---

## Context

### 1. The three writers, and the issue's "decisive" claim — VERIFIED, read

Issue #979's central table is correct on this tree. `GangRegistry` declares
three writers and `src/` calls none of them:

| link in the chain | method | callers in `src/` | anchor, read at `491fcdce` |
| --- | --- | --- | --- |
| a gang exists | `GangRegistry.register` | none but `loadSnapshot` | `src/simulation/incidents/gangs.ts:26` |
| a prisoner belongs to one | `GangRegistry.addMember` | none but `loadSnapshot` | `src/simulation/incidents/gangs.ts:37` |
| one gang has wronged another | `GangRegistry.addGrudge` | **none at all** | `src/simulation/incidents/gangs.ts:86` |

`grep -rn "addGrudge" src/` returns one hit on this tree, the declaration
itself. The registry is constructed bare and nothing writes to it —
`const gangs = new GangRegistry();` (verbatim in
`src/simulation/runtime/new-session.ts`), at `:543`, exactly where the issue
says.

**The issue's claim that `addGrudge` is the decisive one is correct**, and the
line it rests on reads exactly as it says:
`if (grudge === 0) return 0;` (verbatim in
`src/simulation/incidents/gangs.ts`), at `:140`. So a session that seeded every
gang and assigned every prisoner to one would still open no retaliation.

**One correction to the issue's grep, and it does not weaken the finding.**
`grep -rn "addGrudge" src/` returns one hit;
`git grep -n addGrudge -- src tests benchmarks` returns **thirteen**, because
`tests/helpers/determinism-scenario.ts:241` and two unit-test files call it —
one of which is the shared determinism scenario, not a test of gangs. That matters in one direction only: the downstream
chain has *already been exercised end to end* by a fixture that hand-seeds two
gangs and a grudge, so this document is not proposing an untried path. It does
not weaken "no producer in `src/`", which is the claim the issue makes and
which holds.

### 2. There is a fourth gate above the three, and the issue does not name it — VERIFIED, read

`tryOpenRetaliation` does not walk grudges. It walks the *sector's claimants*
first and only then filters grudges to those the claimant holds:

`const claimants = this.gangs.gangsClaiming(sectorId);` (verbatim in
`src/simulation/incidents/trigger-system.ts`)

`for (const offendedGangId of claimants) {` (verbatim in
`src/simulation/incidents/trigger-system.ts`)

Both are at `:524-525`. So **a gang with an empty `territorySectorIds` can hold
a grudge for ever and never act on it**: it is never a claimant, so the outer
loop never selects it as `offended`. "A gang exists" is therefore not the
first writer's job — "a gang exists *with territory in a watched sector*" is.
An implementation that registers gangs with no territory satisfies the issue's
first row and still produces nothing. This is stated because it is the exact
shape of mistake this repository has paid for before: a writer added, a
downstream gate unnoticed, and the symptom unchanged.

### 3. The territory amplifier is not merely degenerate — at the default threshold it is load-bearing — ARITHMETIC

The issue says the `× 1.5` amplifier *"is always on"* because there is one
sector. **The first half of that is true and the second half is a weaker
reading than the code supports.**

What is true about the sector count, verified: exactly one sector id is ever
watched in a session a player can start.
`if (!targets.watchedSectorIds.includes(definition.id)) targets.watchedSectorIds.push(definition.id);`
(verbatim in `src/simulation/security/default-sector.ts`), at `:283`, and the
id it pushes is the constant `DEFAULT_SECURITY_SECTOR_ID`
(`src/simulation/security/default-sector.ts:68`).

Now the arithmetic, off constants that were opened:

- `addGrudge` clamps to `[0,1]` (`src/simulation/incidents/gangs.ts:89`).
- `resolveRetaliationRisk` returns
  `return Math.max(0, Math.min(1, contested ? grudge * 1.5 : grudge * 0.5));`
  (verbatim in `src/simulation/incidents/gangs.ts`), at `:143`.
- The gate is `if (risk < this.retaliationThreshold) continue;` (verbatim in
  `src/simulation/incidents/trigger-system.ts`), at `:529`, and the threshold
  defaults to `0.6` (`src/simulation/incidents/trigger-system.ts:312`).

So:

- **Uncontested**: `risk = grudge × 0.5 ≤ 1 × 0.5 = 0.5`, and `0.5 < 0.6`.
  **The dampened branch can never open an incident at the default threshold,
  at any sector count, for any grudge weight.** It is not "the case that does
  not happen to arise today"; it is arithmetically dead.
- **Contested**: `risk = min(1, grudge × 1.5) ≥ 0.6 ⟺ grudge ≥ 0.4`.

The repository already knows this and wrote it down in a test comment:
`gangs.addGrudge('gang-north', 'gang-south', 0.5); // 0.5 * 0.5 = 0.25, below the 0.6 threshold`
(verbatim in `tests/unit/incident-trigger.test.ts`), at `:281`.

**The consequence for this document's Decision.** The amplifier is not an
optional flourish that a second sector would switch off. Retaliation *only*
exists on contested ground. So "should the `× 1.5` ever not apply?" is the
wrong question; the right one is "should there be a path to a retaliation that
is not on contested ground at all?", and Decision §3 answers it.

**A second, narrower correction to the issue.** The uncontested branch is
reachable *as a computation* even with one sector, whenever the offended gang
claims it and the offending gang does not. It just cannot clear the threshold.
So the issue's *"every pair of gangs contests it"* is true only of gangs that
all claim the one sector, which is a property of the seeding this document has
yet to decide, not a property of there being one sector.

### 4. A retaliation is the last gate in the update loop, behind three others — VERIFIED, read

`IncidentTriggerSystem.update` (`src/simulation/incidents/trigger-system.ts:346-385`)
runs, per sector, in this order: bail out if any incident is open in the sector
at all; try a riot; try an escape attempt; try an assault; and only then, last,
`this.tryOpenRetaliation(sectorId, context.tick);`
(`src/simulation/incidents/trigger-system.ts:397`; the anchor read `:333`, a
blank line). The system's cadence is
`intervalTicks: 50` (`src/simulation/incidents/trigger-system.ts:294`; the anchor
read `:232`).

**REASONED, from those gates**: in a prison hot enough to be producing
assaults, a retaliation can only open in the trough *after* one — the assault
takes the sector's single open slot while it runs, and its own per-type quiet
window (`DEFAULT_SECTOR_QUIET_TICKS_AFTER_ASSAULT = 2_400`,
`src/simulation/incidents/trigger-system.ts:125`) then holds the assault
producer off for 2,400 ticks while leaving the retaliation gate open, since the
quiet windows are per type. That trough is where the mechanism this document
proposes actually lands, and it is a reason to prefer the assault as the grudge
producer rather than an argument against it.

### 5. Every gang retaliation that opens locks the whole prison down — ARITHMETIC

- Severity is
  `severity: Math.max(1, Math.min(MAX_INCIDENT_SEVERITY, Math.round(risk * MAX_INCIDENT_SEVERITY))),`
  (verbatim in `src/simulation/incidents/trigger-system.ts`), at `:624`.
  Since #893, `MAX_INCIDENT_SEVERITY` names the same ceiling of 10 in
  `src/simulation/incidents/incident.ts`; the arithmetic below is unchanged.
- `risk ≥ 0.6` by the gate above, so **severity ≥ 6**, always.
- The lockdown line is
  `if (incident.severity >= this.policy.lockdownSeverityThreshold) {` (verbatim
  in `src/simulation/incidents/response-system.ts`), at `:551`, and the policy
  is `lockdownSeverityThreshold: 6,` (verbatim in
  `src/simulation/incidents/response-system.ts`), at `:29`.

So the *minimum-severity* gang retaliation is exactly at the lockdown
threshold. There is no mild one. And because there is one sector and it covers
the whole prison (Context §3), the lockdown is prison-wide: the responders'
docblock states the scope in its own words — *"this system's own lockdown locks
every door in the incident's sector"*
(`src/simulation/incidents/response-system.ts:125-126`).

Responder demand, same arithmetic:
`return Math.max(1, Math.ceil(severity * this.policy.respondersPerSeverityPoint));`
(verbatim in `src/simulation/incidents/response-system.ts`), at `:352`, against
`respondersPerSeverityPoint: 0.5,` (verbatim in
`src/simulation/incidents/response-system.ts`), at `:26` — so **3 unassigned guards at
severity 6 and 5 at severity 10**, on top of the guards `DeploymentSystem` has
already posted, or the incident lapses on `responseDeadlineTicks: 600`
(`src/simulation/incidents/response-system.ts:27`).

**The lockdown only fires if a response is actually mounted** — the line above
sits inside `mountResponse` (`src/simulation/incidents/response-system.ts:545`),
which runs after guards are claimed. A prison with nobody spare gets the
incident and the lapse without the lockdown.

### 6. A gang retaliation can open today with an empty participant list, and that is what would make the sentence false — VERIFIED, read

Participants are the union of both gangs' members. **This section read the
line as it stood before decision 4 was implemented, and the old text is kept
rather than overwritten** (`docs/AGENT_WORKFLOW.md` §4) — it is the code this
finding was made against, and a reader has to be able to see the defect as it
was:

> `const participants = [...this.gangs.membersOf(offended), ...this.gangs.membersOf(offending)].sort((a, b) => a - b);`
> at `src/simulation/incidents/trigger-system.ts:583`

What stands there now is the same union off two locals the guard has just
read: `const participants = [...offendedMembers, ...offendingMembers].sort((a, b) => a - b);`
(verbatim in `src/simulation/incidents/trigger-system.ts`).
`IncidentLog.open` (`src/simulation/incidents/incident.ts:239`) validates
nothing about that list's length, which is unchanged and is why the guard is in
the trigger rather than in the log.

This is not hypothetical. An existing unit test registers two gangs with **no
members at all**, adds a grudge, and asserts an incident opens
(`tests/unit/incident-trigger.test.ts:278-297`); a second registers one member
on one side only and replays it for determinism
(`tests/unit/incident-trigger.test.ts:289-321`; the anchor read `:301-315`).

> **Both the anchor and the conclusion it carried are dead, and the second is
> the finding (2026-09-17).** That spec's title today is *"refuses a
> retaliation nobody is in, on either side, and opens one the moment both sides
> have a member"* — the opposite of what this sentence concluded. The guard
> that closed it is `src/simulation/incidents/trigger-system.ts:613-615`, which
> this document already cites in *Decision 6*'s own landing note; the two
> passages disagreed with each other inside one file, which is the check
> `docs/AGENT_WORKFLOW.md` §4 says no diff performs. The sentence is kept
> because it is the defect that produced the guard.

So the code **as this section read it** would open a
prison-wide, severity-≥6, "Two gangs are settling a score." incident involving
**nobody**.

Membership is not static either: a released prisoner is forgotten —
`surfaces.gangs?.removeMember(entityId);` (verbatim in
`src/simulation/prisoners/release.ts`), at `:211` — so a gang can be emptied
between the tick a grudge is recorded and the tick it is acted on. Any
implementation that seeds gangs must close this, or the first thing a player
sees is a lie about their prison.

### 7. The player-facing sentence, and exactly what makes it true — VERIFIED, read

`'hud.alert.event.incidents.gang-retaliation-opened': 'Two gangs are settling a score.',`
(verbatim in `src/content/default-locale-en.ts`), at `:1294` — the issue cites
`:1149`, which is where it was at v0.0.467.

The row is graded `severity: 'danger'` on both the band and the log
(`src/ui/simulation-events.ts:537-541`), and it **takes no parameters at all**:
its event kind falls through the `return {};` arm of both the parameter
resolvers (`src/ui/simulation-events.ts:1207`, `:1335`). That is a useful fact
for this decision, not a defect — it means a gang needs no `nameKey` before
this mechanism can ship, because no gang's id ever reaches the screen.

So the sentence makes exactly two assertions and both are structural:

1. **"Two gangs"** — the trigger opens a retaliation for exactly one
   `(offended, offending)` pair, so exactly two gangs are named by construction.
   **True the moment two gangs exist.**
2. **"settling a score"** — there is an outstanding, directional grudge, and it
   is discharged rather than retained:
   `this.gangs.clearGrudge(offended, offending); // acted on -- not a permanent standing grievance`
   (verbatim in `src/simulation/incidents/trigger-system.ts`), at `:546`.
   **True the moment a grudge has a real cause.**

What is *not* guaranteed by the code today is that anybody is doing the
settling (Context §6). That is the only respect in which the existing sentence
could ship false, and Decision §4 closes it.

The HUD already says all of this against itself, which is why this is a gap
rather than a hidden defect: *"It is graded on that rather than on anything
measured in play, because nothing in `src/` seeds a gang -- `GangRegistry.addMember`
is reached only from `loadSnapshot` -- so no session a player can start opens
one today. The grade is what the code would do if one did, and it is here so
that seeding gangs is not also a copy decision."*
(`src/ui/simulation-events.ts:130-136`; the issue cites `:107-114`, its
position at v0.0.467).

### 8. Everything downstream is built and persisted, including the grudges — VERIFIED, read

The incident type is in the persisted enum
(`src/persistence/save-schema.ts:951`; the anchor read `:939`), the protocol
event is registered
(`src/simulation/protocol/types.ts:1826`, payload schema at `:2032`), the
message census carries a label (`src/content/simulation-message-keys.ts:268`),
and both projections enumerate all four types
(`src/simulation/presentation/incident-projection.ts:149`,
`src/simulation/presentation/status-strip-projection.ts:428`).

**The registry's whole state is already in the save envelope** — definitions,
members, reputation and grudges — at `src/persistence/save-schema.ts:971-977`,
written at `src/simulation/runtime/session-systems.ts:680` and read back at
`:964`. So issue #979's expectation that a save round trip is "free" is
correct, with one caveat worth pricing: the definition schema is
`.strict()`, so **adding any field to `GangDefinition` is a schema edit**, not
a no-op. An *optional* field would not move `SAVE_SCHEMA_VERSION` under the
three conditions `docs/PERSISTENCE.md` sets and
`src/persistence/save-schema.ts:182-200` works through for two precedents, but
it is still a reviewed edit rather than free.

### 9. The assault already carries everything a grudge producer needs — VERIFIED, read — HEADING CORRECTED 2026-09-08: the *record* does, the *seam* does not

- An assault names exactly two participants
  (`ASSAULT_PARTICIPANT_COUNT = 2`, `src/simulation/incidents/flashpoint.ts:343`)
  and one of them as the instigator: `instigatorId: worst.entityId,`
  (verbatim in `src/simulation/incidents/trigger-system.ts`), at `:450`.
- `GangRegistry.getGangOf` already exists
  (`src/simulation/incidents/gangs.ts:52`).
- There is already **one door** both terminal transitions of an assault go
  through, already narrowed to exactly this case:
  `if (incident.type !== 'assault' || incident.instigatorId === undefined) return;`
  (verbatim in `src/simulation/incidents/response-system.ts`), at `:328` —
  inside `adjudicateAssaultIfAny`, whose own docblock states why it is a single
  method: *"so the two call sites cannot drift about which incidents earn a
  sanction or which participant it lands on"*
  (`src/simulation/incidents/response-system.ts:326`).
- That door already carries an injected, defaulted port of exactly the shape a
  second consumer needs — `onAssaultAdjudicated`
  (`src/simulation/incidents/response-system.ts:218`) — whose docblock argues
  the pattern: *"The same narrow injected-port shape `onPrisonerEscaped` is,
  for the same reason"* (`src/simulation/incidents/response-system.ts:212-213`).

So the issue's proposal — *"the natural producer is an existing incident: an
assault whose two participants belong to different gangs"* — lands on a seam
that already exists, is already tested, and already has a second occupant. It
is the cheapest correct place, and Decision §2 takes it.

**CORRECTED 2026-09-08. This section's heading says the assault "already
carries everything a grudge producer needs", and that is true of the *record*
and false of the *seam*.** The bullet above calls `onAssaultAdjudicated` a port
*"of exactly the shape a second consumer needs"*, and Context 13 point 3 shows
it is not: its shape is `(entityId: EntityId, tick: number) => void`
(`src/simulation/incidents/response-system.ts:218`) and it is handed only
`incident.instigatorId` (`:329`), so the second participant — the one a
directional grudge needs — never crosses it. The heading and the bullet are
kept because the *pattern* claim they make is sound and is what a second port
should copy; what was wrong was the word "shape", and the correction is one line
of signature rather than a different design.

### 10. Nothing in the incident tree draws random numbers, and this decision keeps it that way — VERIFIED

`grep -c "rng" src/simulation/incidents/*.ts` returns **0** for all ten files
on this tree, exactly as the issue says. Six named RNG streams are registered
in a new session (`src/simulation/runtime/new-session.ts:446-487`; the
constants are at `:83`, `:86`, `:88`, `:109`,
`src/simulation/prisoners/sentence.ts:47` and
`src/simulation/identity/actor-identity.ts:210`; those six anchors read
`:440-483`, `:78`, `:81`, `:83`, `:104` and `:188`, and `sentence.ts:47` is the
one of the seven that never moved). A seventh would be a
save-compatibility question that `src/simulation/runtime/new-session.ts:471-478`
sets out in full. **This document proposes no new stream** (Decision §5).

### 11. The issue's provenance note is not on `main` — VERIFIED

Issue #979 cites its research as `2026-09-04-what-difficulty-would-take.md`
§2.3, under `docs/research/`. **That file does not exist on `origin/main`.** It lives on the unmerged
branch `research/what-difficulty-would-take` (commits `73b1af30`, `8c20d7a9`),
and `git merge-base --is-ancestor 73b1af30 origin/main` returns non-zero. Its
§2.3 was read out of that branch for this document and says what the issue says
it says.

This is recorded for two reasons. First, a reader following the issue's own
citation from `main` finds nothing and may conclude the finding is unsupported.
Second, it is why this document names that note by title and branch rather than
by a rooted path in backticks: `documentation-links-contract.test.ts` fails a
dangling rooted path, and it already failed on that exact note once — the
branch's own commit message records the run.

One fact worth carrying over from it: the effective **floor** on a gang
retaliation's severity is 6, not the 7 an earlier brief assumed, and it is 6
*because* the threshold is 0.6. Context §5 re-derives that here rather than
relying on it.

### 12. Term 1 of the ruling — what an "assault" is, and whether its record names both prisoners — VERIFIED, read

**It does, and the worry that it might not is closed rather than carried.** An
assault is an `IncidentType` opened by `IncidentTriggerSystem.tryOpenAssault`
(`src/simulation/incidents/trigger-system.ts:454`), and the record it opens
carries three things a grudge producer needs:

- **Exactly two participants.**
  `export const ASSAULT_PARTICIPANT_COUNT = 2;` (verbatim in
  `src/simulation/incidents/flashpoint.ts`), at `:343`, sliced off the ranked
  flashpoints at `src/simulation/incidents/trigger-system.ts:486` and sorted
  into the list at `:441`.
- **One of the two named separately.** `instigatorId: worst.entityId,`
  (verbatim in `src/simulation/incidents/trigger-system.ts`), at `:450`.
- **Both survive onto the read model.** `readonly instigatorId?: EntityId;`
  (verbatim in `src/simulation/incidents/incident.ts`) — the field is declared
  on `IncidentRecord` at `:102` and again on `OpenIncidentInput` at `:142`, and
  `toRecord` copies it at `:131`.

So the victim is derivable: it is the participant that is not the instigator,
of a list that is exactly two long. **A grudge between two named prisoners
therefore does not need a new field on the incident**, and this document does
not ask for one.

**What the code refuses to say, and the ruling's word "between" invites.**
`instigatorId` is not a finding of fault, and the field's own docblock says so
in terms: *"Not a culprit field in the sense issue #80's design question means:
`scoreAssaultPressure` ranks by whose needs and holdings are worst, not by who
struck first"* (`src/simulation/incidents/incident.ts:95-97`). The comment at
the write site says the same thing from the other end — *"`worst` is
`ranked[0]` -- the entity `scoreAssaultPressure` finds a reason for -- not a
struck-first determination"*
(`src/simulation/incidents/trigger-system.ts:496-501`) — and two more modules
say it independently: an assault's participants are *"who was in it"*, and
*"Distinguishing an aggressor from a victim is adjudication, which is issue
#80's and needs a command type"*
(`src/simulation/incidents/flashpoint.ts:336-341`);
`buildDisciplinaryIndex` charges **both** participants the same points and
gives the same reason (`src/simulation/prisoners/disciplinary-record.ts:145-155`).

**Why that matters to this decision rather than being a nicety.** A grudge is
*directional* — the key is `` `${offendedGangId}->${offendingGangId}` ``
(`src/simulation/incidents/gangs.ts:82`) and `addGrudge` throws on a
self-grudge (`:87`) — so a producer must pick a direction, and the only
directional signal on the record is a field three modules say is not about
culpability. **The ruling's "between" is symmetric and the model is not.** This
is not a reason to refuse the ruling; it is the one thing an implementer has to
choose that the ruling does not choose for them, and it is Open Question 2.

### 13. Term 2 of the ruling — "adjudicated" has a referent, and it is narrower than the word — VERIFIED, read

**There is an adjudication step, it has one door, and it is already the seam
Context 9 identified.** `IncidentResponseSystem.adjudicateAssaultIfAny` is a
single private method whose docblock states why it is single: *"The one thing
both terminal transitions below do identically, so the two call sites cannot
drift about which incidents earn a sanction or which participant it lands on"*
(`src/simulation/incidents/response-system.ts:326`).

What it takes as input:
`if (incident.type !== 'assault' || incident.instigatorId === undefined) return;`
(verbatim in `src/simulation/incidents/response-system.ts`), at `:328`.

What it leaves behind. **Both lines below are the ones this finding was made
against and both were changed by implementing decision 2**, so they are quoted
here as history rather than as live citations (`docs/AGENT_WORKFLOW.md` §4) —
point 3 immediately below is what forced the change:

> `this.onAssaultAdjudicated(incident.instigatorId, tick);`
> at `src/simulation/incidents/response-system.ts:329`, against a port declared
> `private readonly onAssaultAdjudicated: (entityId: EntityId, tick: number) => void = () => {},`
> at `:218`

The port now carries the record —
`private readonly onAssaultAdjudicated: (incident: IncidentRecord, tick: number) => void = () => {},`
(verbatim in `src/simulation/incidents/response-system.ts`) — and the
narrowing above it is untouched, so a consumer may still rely on the incident
being an `'assault'` that carries an `instigatorId`. In a
real session that port is
`prisoners.imposeSolitarySanction(entityId, tick)`
(`src/simulation/runtime/new-session.ts:1430-1432`), carried out by
`SanctionSystem` (`src/simulation/prisoners/sanction-system.ts`), whose own
comment records that the sanction *"is the only state
`PrisonerOperationsRuntime.imposeSolitarySanction` writes"*
(`src/simulation/prisoners/sanction-system.ts:66`).

**Four properties of that step, each of which bears on the ruling:**

1. **It is not a hearing.** There is no evidence stage, no command, no
   contested finding and no player input. "Adjudicated" here means *the
   incident reached a terminal state and the instigator was sent to solitary*,
   and nothing more. `src/simulation/prisoners/disciplinary-record.ts:154-155`
   and `src/simulation/incidents/flashpoint.ts:341` both say the adjudication
   issue #80 asks for — the one that identifies a culprit — *"needs a command
   type"* and does not exist.
2. **It fires on both terminal transitions, including the one where nobody
   came.** `this.adjudicateAssaultIfAny(incident, tick);` (verbatim in
   `src/simulation/incidents/response-system.ts`) appears twice — at `:711`,
   inside `lapse`, and at `:899`, in the `'resolved'` branch of
   `advanceResponse`. A lapse is
   an incident that ran out its `responseDeadlineTicks: 600` with no guard on
   it. **So "an adjudicated assault" includes assaults the prison ignored**,
   which is the majority case in a prison at the one-guard floor Context 5
   prices.
3. **It carries the instigator and nothing else.** Not the victim, not the
   participant list, not the incident. A grudge producer hanging off this seam
   needs both prisoners, so **the port has to be widened or a second port added
   beside it** — the smallest correct change is to pass the `IncidentRecord`,
   which the method already holds. That is Consequences below, and it is the
   one change to existing code the ruling itself forces.
4. **It is already tested end to end.** `tests/integration/assault-sanction-loop.test.ts`
   drives a real kernel through it, which is why this document names that
   fixture for the measurement rather than inventing one.

**So term 2 is implementable as written, with one caveat the owner should
see**: if "adjudicated" was meant to imply *someone looked into it*, nothing in
this repository does that, and the nearest thing that exists is "the incident
ended and the instigator went to solitary". This document reads it as the
latter, because that is what the code has, and says so here rather than in a
footnote.

### 14. Term 3 of the ruling — "one the player was actually shown" has no referent, and its strongest reading is forbidden — VERIFIED, read

**This is the finding this document exists to return.** *"Was actually shown"*
is not a state anything in this repository records, and the reason is
architectural rather than an omission somebody can patch.

**(a) What a player is actually shown about an assault, in full.** One
sentence, once, when it opens:
`'hud.alert.event.incidents.assault-opened': 'A fight has broken out between two prisoners.',`
(verbatim in `src/content/default-locale-en.ts`), at `:1292`, graded
`severity: 'warning'` and `surfaces: 'band-and-log'`
(`src/ui/simulation-events.ts:522-526`). It is **recorded** unconditionally: the
one door every producer goes through calls
`this.events.recordIncidentOpened(input.type, input.participantIds.length, tick);`
(verbatim in `src/simulation/incidents/trigger-system.ts`), at `:492`, and the
only guard on the other side is
`if (!Number.isSafeInteger(participantCount) || participantCount < 1) return;`
(verbatim in `src/simulation/events/event-log.ts`), at `:566`, which an
assault's two participants always clear. **Every assault that opens is recorded
on the alerts channel.**

**Recorded is not the same as delivered, and the gap is small but real.** The
buffer trims to `MAX_BUFFERED_SIMULATION_EVENTS` on append
(`src/simulation/events/event-log.ts:871-874`) and the publisher reads it on a
timer, so a burst of more than that many events between two publications would
drop the oldest before anyone saw them. Nothing in this repository has measured
that happening, and the dwell module's own event-spacing runs — 64 events in
200,000 ticks, 54 in 90,000 (`src/ui/hud/event-band-dwell.ts:25-26`) — are two
orders of magnitude away from it. It is named because reading A below is stated
as "the log holds a record", and a reader is owed the one case in which the log
holds one and the player still saw nothing.

**(b) The row names nobody, and the panel that would is not built.** The wire
payload is the envelope and the literal —
`type: z.literal('incidents.assault-opened'),` (verbatim in
`src/simulation/protocol/types.ts`), at `:2039` — because the channel
deliberately carries no identity: *"No incident id, no sector id: the channel
carries no identity"* (`src/simulation/protocol/types.ts:2095`). The place a
player would look one up does not exist: `hud/incidents` and
`hud/incident-detail` are both listed in `UNPAINTED_PROJECTION_IDS`
(`const UNPAINTED_PROJECTION_IDS`,
`tests/foundation/projection-reachability-contract.test.ts:383`; the anchor read
`:363-366`), and
`grep -rn "hud/incidents" src/ui/ src/main.ts` returns nothing on this tree.

> **BOTH HALVES OF THAT SENTENCE STOPPED BEING TRUE ON 2026-09-19, AND IT IS
> KEPT RATHER THAN REWRITTEN** (`docs/AGENT_WORKFLOW.md` §4). #1292's Security
> section gave `hud/incidents` and `hud/incident-detail` a reader --
> `src/ui/simulation-incidents.ts` reads the pair, `src/ui/hud/security-panel.ts`
> paints it -- so **neither id is in `UNPAINTED_PROJECTION_IDS` any more**; the
> list holds exactly one entry, `'world/render-snapshot'`, whose blocker was
> never a panel. The grep now returns hits under `src/ui/`. **What this does
> *not* settle is the finding this bullet is making**: the panel names the
> incident's participants by count (`{count} taking part`, from
> `participantIds.length`) and not by name, because turning an entity id into a
> prisoner a player recognises is `docs/HUD_PROJECTIONS.md`'s gaps 10 and 11 and
> is not built. So *"a player is told that a fight happened and is never told
> who was in it"* holds, for a different reason than the one written above it.
`participantEntityIds` is projected
(`src/simulation/presentation/incident-projection.ts:161`, written at `:341`)
and has no reader anywhere in `src/`. **So a player is told that a fight
happened and is never told who was in it.**

**(c) The adjudication — the moment the ruling names — is announced by
nothing.** `SIMULATION_EVENT_TYPES`
(`src/simulation/protocol/types.ts:1961-1989`; the anchor read `:1713-1735`) is
the closed list of everything
the prison can say, and **no member of it is a sanction, a finding, a solitary
term or an adjudication** — a count is deliberately not given, because the
durable claim is about the subject and a tally beside a closed list is the
shape `docs/AGENT_WORKFLOW.md` §4 names as rotting first. The only
solitary-related locale
key in the catalogue is the room's name,
`'room.solitary-cell.name'` (`src/content/default-locale-en.ts:28`). The two
terminal-incident sentences that do exist — `incidents.all-clear` and
`incidents.all-clear-after-lapse` — are about *the prison* returning to calm
and fire only when nothing at all is open
(`src/simulation/incidents/response-system.ts:316-324`). **So under a reading
of the ruling where "shown" attaches to the adjudication, the ruling is not
implementable at all today**: the player has never been shown an adjudication,
of any incident, in any prison.

**(d) Nothing records that a sentence reached a screen, and this repository has
already measured a sentence that did not.** The dwell module's own docblock
says what the band is for and what went wrong without it: the band's job is
*"that a player who is looking at it sees the sentence exist, which is exactly
what the escape sentence did not do: written three times, painted zero times"*
(`src/ui/hud/event-band-dwell.ts:47-50`). Written three times, painted zero
times **is** the gap between "published" and "shown", measured, in this
codebase, on a different sentence.

**(e) The simulation is forbidden from reading publication, and that is a
contract rather than a preference.** The watermark that knows what has been
published lives outside the kernel — `private _publishedEventSequence = 0;`
(verbatim in `src/simulation/worker/state-machine.ts`), at `:307`, read at
`const pending = this._runtime.events.since(this._publishedEventSequence);`
(verbatim in `src/simulation/worker/state-machine.ts`), at `:717` — and
`SimulationEventLog`'s class comment says why it is there and not in the log:
*"a publication is driven by wall-clock time, so a tick that behaved
differently because a publication had happened would make the simulation depend
on how fast the machine ran"* (`src/simulation/events/event-log.ts:75-77`).
`tests/determinism/status-counts-publication.test.ts` is the gate, and its
header states the failure in the exact words this ruling risks: *"then the mere
act of showing a player a number would change the simulation, and it would do
so only in the running app, never in a headless replay"*
(`tests/determinism/status-counts-publication.test.ts:25-27`).

**(f) The one fact about the player's attention that does reach the kernel, and
what it actually is.** A dismissal. `export const dismissAlertSchema = z.object({`
(verbatim in `src/simulation/protocol/commands.ts`), at `:583`, applied from
the command queue at `src/simulation/runtime/session-commands.ts:940` into
`public dismiss(fromSequence: number, throughSequence: number): number {`
(verbatim in `src/simulation/events/event-log.ts`), at `:269`. Its far end is
documented as exactly the thing the ruling asks for: *"`throughSequence` is the
newest arrival the player had actually seen when they pressed"*
(`src/simulation/events/event-log.ts:240-241`). It is deterministic because it
arrives as a command, not as a publication.

**But it is an acknowledgement, not a display, and three properties make it a
poor proxy for one.** It requires the player to press *Clear this alert*, which
most will never do. It retires a **run** of arrivals that say the same thing
(`simulationEventIdentity`), and because the assault row carries no payload
(b above) *every* assault in the buffer collapses into one run — so one press
would mark every assault the player had ever been told about, not one. And the
log holds at most sixty-four records
(`MAX_BUFFERED_SIMULATION_EVENTS = 64`, `src/simulation/events/event-log.ts:33`)
while the list holds eight rows chosen by severity, which the log's own comment
contrasts: *"the alerts list keeps eight rows chosen by severity, this keeps
sixty-four records chosen by age, and only the second of those is in the save
because only the second of those is in the worker"*
(`src/simulation/events/event-log.ts:129-132`).

**(g) Nothing in the simulation reads the event log back.** `since` has exactly
one caller, the publisher at `src/simulation/worker/state-machine.ts:717`; the
log's other public methods are its `record*` writers, a snapshot pair, a count
and `dismiss`, and not one of them answers a question about a past event. A producer that consulted the log to ask *"was this announced?"*
would be the **first** simulation reader of it, inverting a sink into a source.
That is not forbidden, and it is not free either: it is a new coupling between
the incident tree and the announcement channel, and it is named here so that
whoever writes it knows they are the first.

### 15. A correction to this document's own weakest claim, in the direction that saves the mechanism — ARITHMETIC

**The earlier pass named Decision 6's dependence on `high-risk` arrivals as its
weakest claim and said it had not been chased down. It has now been chased down
on the constants, and the claim as written is too pessimistic.**

`classificationGroupIdForTier` is
`return riskTier >= 3 ? 'high-risk' : 'general-population';` (verbatim in
`src/simulation/prisoners/classification.ts`), at `:59`. At **intake**
(`classifyPrisoner`, `:82-90`) the score is a long-sentence bonus of at most 1
plus `min(2, priorIncidents)`, then a screening draw of `-1 | 0 | +1`. So an
arrival admitted with `priorIncidents: 0` maxes out at `1 + 0 + 1 = 2` and
**can never be `high-risk` at intake** — which is what
`tests/integration/assault-sanction-loop.test.ts:33` observed for its own
fixture and what the earlier pass generalised from.

**What the earlier pass missed is that intake is not the only writer.** ADR
0032's `reviewClassification` recomputes the tier absolutely, every
`CLASSIFICATION_REVIEW_INTERVAL_TICKS = 24_000`
(`src/simulation/prisoners/classification.ts:105`), from
`sentence + intakeHistory + findings + cleanConduct`
(`src/simulation/prisoners/classification.ts:213`), where
`const findings = Math.min(MAX_FINDINGS_TERM, Math.max(0, disciplinary.points));`
(verbatim in `src/simulation/prisoners/classification.ts`), at `:196`, and
`MAX_FINDINGS_TERM = 3` (`:127`). `ClassificationReviewSystem` writes the result
back —
`this.records.classificationGroupIndex[index] = nextGroupIndex;` (verbatim in
`src/simulation/prisoners/classification-review-system.ts`), at `:385`, beside
`riskTier` at `:384`.

The arithmetic, off constants that were opened. A prisoner in **one lapsed
assault** is charged two points by
`export const DISCIPLINARY_POINTS_BY_INCIDENT_TYPE: Readonly<Record<IncidentType, number>> = {
  assault: 2,`
(verbatim in `src/simulation/prisoners/disciplinary-record.ts`), at `:46-47`, plus
`export const LAPSED_INCIDENT_SURCHARGE_POINTS = 1;` (verbatim in
`src/simulation/prisoners/disciplinary-record.ts`), at `:58` — three points,
and `buildDisciplinaryIndex` charges **both** participants. At the next review,
with a sentence at or over `LONG_SENTENCE_THRESHOLD_TICKS = 200_000` (`:41`) and
no clean-conduct credit yet accrued, the score is `1 + 0 + 3 - 0 = 4`, clamped
to tier 3. **`high-risk` is therefore reachable from `priorIncidents: 0` after
one lapsed assault and one review**, on a fixture whose own comment says its
arrivals are *"deterministically `general-population`"* at intake.

**Two consequences, and the second is the one that damages Decision 6.**

1. The mechanism is **not** inert for want of `high-risk` prisoners. It
   bootstraps off exactly the incident the ruling names as the grudge's cause.
2. **Decision 6 assigns membership "at intake", and the population that
   actually becomes `high-risk` becomes so long after intake.** A membership
   rule evaluated once, at admission, would therefore never see them. That is a
   defect in Decision 6's *timing* rather than in its criterion, and it is
   marked here rather than silently repaired because Decision 6 is not what the
   owner ruled on. Open Question 5.

**This is ARITHMETIC, not a run, and the distinction is load-bearing.** It shows
tier 3 is *reachable*; it does not show how often a prison reaches it, whether
a review lands before the prisoner is discharged, or whether clean-conduct
credit claws the tier back before a second assault. Only the measurement below
settles that, and item 1 of Fixture A is written to ask it.

---

## Decision

**Item 2 is the owner's ruling of 2026-09-08 and is not this document's to
accept or withdraw. Items 1 and 3 to 7 are this document's, and none of them is
accepted.** Each is written so the owner can disagree with a specific sentence
rather than with a direction.

**This preamble read "Nothing here is accepted" until the ruling arrived, and
that sentence is kept here rather than deleted** (`docs/AGENT_WORKFLOW.md` §4):
it was true of every item when it was written, and it is now true of six of the
seven. The one it stopped being true of is the one a reader most needs to see
move.

### 1. What a gang is: a claim on territory, not a badge on a prisoner

A gang is a `GangDefinition` — an id and a set of claimed sector ids — seeded
**once per prison, at session creation**, alongside the default security
sector, and persisted from that moment like every other registry.

**Two gangs, both claiming the one default sector.** Not one — a single gang can
hold no grudge against anyone, and `addGrudge` throws on a self-grudge
(`src/simulation/incidents/gangs.ts:87`). Not more than two either, and that
half is REASONED rather than shown by anything above: with one sector every
pair of claimants contests the same ground on identical terms (Context §3's
arithmetic), so a third gang multiplies the pairs without producing any new
*kind* of situation, while tripling the chance that a released prisoner leaves
one of them empty (Context §6). Two is the smallest number the mechanism needs
and the largest one sector can distinguish.

**A gang with no territory is not seeded.** Context §2 established that such a
gang is structurally inert. Seeding one would be authored content that provably
does nothing, which is the class of defect issue #979 exists to close, repeated
one level down.

**No `nameKey`, and no gang reaches the player by name.** Context §7 showed the
alert takes no parameters, so naming gangs is not a prerequisite. Leaving it
out keeps the `.strict()` definition schema untouched (Context §8) and keeps
this decision clear of `AGENTS.md`'s fourth reservation entirely. If gang names
are wanted later they are a separate decision with a separate cost.

### 2. Where a grudge comes from — THE OWNER'S RULING OF 2026-09-08, and what it rests on

**The ruling, quoted, and it is the whole of the owner's input on this
question:**

> A grudge forms from an adjudicated assault between members of different gangs — one the player was actually shown.

Relayed to this pass by the integrating session as the text of the option the
owner chose on 2026-09-08; not text they typed into this repository. Status
above carries the provenance in full.

**Two of the ruling's three terms have referents in this repository and one does
not.** Context 12, 13 and 14 are the evidence, and the reading below is built on
them rather than on the words alone.

#### 2.1 What the ruling confirms, and what this document had already argued

The producer is the seam Context 9 named and Decision 2 already proposed:
`adjudicateAssaultIfAny` (`src/simulation/incidents/response-system.ts:346`),
the one door both terminal transitions of an assault go through. **Re-aimed
2026-09-15 from `:327`**, which is where that method stood when this section was
written and which `338b053b` — the implementation of this very decision — moved
without touching the pin above. The offending
gang is the instigator's, the offended gang is the other participant's, and
`addGrudge(offendedGangId, offendingGangId, weight)` is called only when both
lookups return a gang and the two differ.

**The ruling settles this against the alternatives, and they are now rejected by
the owner rather than by this document** — recorded under "Alternatives the
owner's ruling rejects" below, kept rather than deleted because they will be
proposed again.

#### 2.2 The sentence in this document that the ruling makes false, corrected in both directions

**This section's heading read "Where a grudge comes from: an assault the player
already watched", and its second paragraph opened "Why adjudication rather than
the moment the assault opens" with this reasoning:**

> The incident is terminal there — resolved or lapsed — so the grudge is
> recorded *after* the player has seen the assault run its course, and the
> sector's single open-incident slot is free (Context §4).

**"After the player has seen the assault run its course" was asserted and never
checked, and Context 14 establishes it is not true of this codebase.** A player
is shown one sentence when an assault *opens* and nothing whatever when it
reaches a terminal state; there is no event, no locale key and no panel for an
adjudication (Context 14c). The old wording is kept above rather than
overwritten because it is exactly the shape `docs/AGENT_WORKFLOW.md` §4 warns
about — a plausible sentence about a player's experience, written from the
simulation's side, with nothing opened on the UI side to support it.

**The correction runs in the other direction too, and it is the more useful
half.** The *conclusion* — adjudicate rather than open — survives, on the two
reasons that were checked: the sector's single open-incident slot is free at a
terminal transition (Context 4), and the seam already exists with a second
occupant (Context 9). It is the *player-facing* reason that was wrong, and it
was the reason this document leaned on hardest.

#### 2.3 "One the player was actually shown": three readings, and what each costs

Context 14 establishes that no state anywhere records that a sentence reached a
screen. So the clause has to be read, and there are exactly three readings this
codebase admits.

| reading | what it would select | implementable? | what it costs |
| --- | --- | --- | --- |
| **A — announced** | assaults for which `SimulationEventLog` holds an `incidents.assault-opened` record | yes, and already true of every assault | nothing, and it filters nothing: `openIncident` records unconditionally (Context 14a) |
| **B — displayed** | assaults whose row was painted on the player's screen | **no** | the fact lives on the main thread; reading it in the kernel is what `tests/determinism/status-counts-publication.test.ts` exists to forbid (Context 14e) |
| **C — acknowledged** | assaults whose alert row the player pressed *Clear this alert* on | yes, via `DismissAlert` | grudges depend on housekeeping most players never do, and one press marks every assault in the buffer because the row carries no identity (Context 14f) |

**READING A IS THE OWNER'S, RULED 2026-09-08.** The paragraph below is kept
exactly as it stood, because it is the argument that was put to them and the
reasoning they ratified rather than a claim this document has to withdraw. What
changes is only its standing: the sentence *"This document implements reading A
and says so plainly rather than presenting it as the ruling"* was accurate for
one day and is now superseded — reading A **is** the ruling, quoted in Status.
The cost the paragraph names, that A filters nothing today, was in the option
the owner read.

**This document implements reading A and says so plainly rather than presenting
it as the ruling.** A is the only one that is both implementable and not
perverse. It is also the reading under which the ruling's third clause
**constrains nothing today**, because every assault that opens is announced —
and that is stated here, in the Decision, rather than buried, because a reader
who takes the clause to be doing work would be wrong.

**What A buys despite filtering nothing.** It ties the grudge to the announced
event rather than to the incident record, so the day announcement becomes
conditional — a quieter channel, a per-severity filter, a player-set mute — the
grudge follows the sentence instead of silently decoupling from it. That is a
guarantee about the *future* shape of the channel, not about today's prison, and
it is worth having for that reason alone.

**What A does not buy, and what the owner may have meant.** If the intent was
that a player should be able to *connect* the retaliation to the fight that
caused it, reading A does not deliver it and no reading available today does:
the assault row names nobody (Context 14b), the incidents panel is unbuilt, and
the retaliation's own sentence takes no parameters (Context 7). **Delivering
that intent needs a new player-visible sentence** — most plainly, an
announcement at adjudication naming what the prison decided — and that is a new
member of `SIMULATION_EVENT_TYPES`, a new schema, a new locale key and a new
row definition. Under `AGENTS.md`'s fourth reservation the *wording* of such a
sentence has been ours since 2026-09-04; the requirement that it be true is not,
and neither is the decision to add one. **Open Question 1 is that fork and it is
the owner's.**

**They took it, and they took the other side of it: reading A, not the
announcement.** So the paragraph above describes work that is **not**
authorised, rather than work that is pending. It is kept because it is the
price of reading A and a reader should be able to see what was declined; if the
intent ever changes, it is the sentence to come back to, and it needs a fresh
ruling rather than this one.

#### 2.4 Why not a die roll, a timer, or a scheduled injection

Unchanged from the earlier draft, and now reinforced rather than argued, because
the owner ruled the same way. Three reasons, in descending strength:

1. It keeps the incident tree free of RNG (Context 10), which is the property
   the whole subsystem was built to have.
2. It makes retaliation *legible* — with the limit 2.3 names: legible to a
   player who is watching the alerts channel, not to one who wants to know
   which two prisoners were involved, because the channel never says.
3. It costs no new state.

#### 2.5 Weight: unchanged, still a recommendation, still the number a balance pass moves first

The ruling names no weight. From Context 3, a retaliation needs `grudge ≥ 0.4`,
so `0.4` makes every cross-gang assault produce a retaliation, `0.2` every
second and `0.15` every third. **This document continues to recommend `0.2`** —
two cross-gang assaults buy one retaliation — on the reasoning that one is
indistinguishable from "an assault sometimes escalates" and three is far enough
away that a player would never connect the two events. It is a directional
default in the same sense `retaliationThreshold` calls itself one
(`src/simulation/incidents/trigger-system.ts:324`, re-aimed 2026-09-15 from
`:261`). Open Question 6.

**"Two assaults" means two in the SAME direction, and this is the part an
implementer will get wrong.** Grudges are keyed
`` `${offendedGangId}->${offendingGangId}` `` (`src/simulation/incidents/gangs.ts:82`),
so an assault by a member of gang A on a member of gang B and an assault by a
member of B on a member of A accumulate under **two different keys** and
neither reaches 0.4. At weight 0.2 a prison whose cross-gang assaults alternate
direction never retaliates at all. That is arguably correct — a score that is
already even is not a score to settle — but it is a consequence of the
directional key rather than a decision anyone took, so it is named here and
carried into the measurement below.

**And the direction itself is not settled by the ruling.** Context 12 showed
`instigatorId` is the worst-ranked flashpoint and three modules say it is not a
finding of fault. "Between members of different gangs" is symmetric; the ledger
is not. Open Question 2.

### 3. The territory amplifier stays, and the reason is now stated rather than assumed

**Keep `× 1.5` / `× 0.5` exactly as written, change nothing in
`resolveRetaliationRisk`, and accept that with one sector the amplifier is
always on.**

The issue's acceptance criterion offers two ways out — *"either has a case
where it is not applied, or the issue records that with one sector it is always
on and that is accepted"*. This document takes the second, and Context §3 is
why the first is not available: the dampened branch cannot clear the default
threshold at any grudge weight, so "a case where it is not applied" is not a
case where a retaliation happens more quietly, it is a case where **nothing
happens**. Manufacturing one would mean either lowering `retaliationThreshold`
below 0.5 — which changes the meaning of every fixture that pins it — or
seeding a territory-less gang, which Decision §1 refuses on separate grounds.

**What is accepted, said plainly so a later reader does not have to infer it:**
with one sector and two gangs that both claim it, `contested` is always `true`,
`resolveRetaliationRisk` is always `grudge × 1.5` clamped, and the entire
`× 0.5` branch is unreachable in a session a player can start. That branch is
**not dead code to delete**: it becomes reachable the moment sectors multiply,
which is the same shape of argument ADR 0061's open question 4 makes about
cell-sharing, and deleting it would have to be undone by whoever draws the
second sector.

### 4. The trigger must refuse a retaliation nobody is in

**`tryOpenRetaliation` gains one guard: skip the pair unless both
`membersOf(offended)` and `membersOf(offending)` are non-empty.**

This is the one change this document requires to code that already exists, and
Context §6 is the whole argument: without it, a released prisoner emptying a
gang between the grudge and the retaliation produces a prison-wide lockdown, a
severity-≥6 danger alert, and the sentence *"Two gangs are settling a score."*
with an empty participant list. That is precisely the promise-without-code that
`AGENTS.md`'s fourth reservation exists to prevent, and it is reachable from
the mechanism this document proposes rather than a theoretical concern.

It is a **narrowing** of an existing gate, not a lowered floor, and two
existing unit tests would have to be given members to keep asserting what they
mean: one registers two gangs with no members at all and asserts an incident
opens (`tests/unit/incident-trigger.test.ts:278-297`), and one replays a
scenario in which only the offended side has a member
(`tests/unit/incident-trigger.test.ts:301-315`). Extending a fixture so it
describes a prison that can exist is not weakening an assertion; the assertions
themselves — that an incident opens, and that it replays identically — are
untouched.

### 5. What this decision does not touch

- **No new RNG stream.** Membership assignment (Decision §6) is deterministic.
- **No new locale key and no changed string** — **under Decision 2.3's reading
  A.** The one sentence involved already exists and this document does not edit
  it. **Open Question 1's branch (b) would add one**, and that is why the
  question is the owner's: it is a new promise, not a new wording.
- **No change to `retaliationThreshold`, to the severity formula, to
  `lockdownSeverityThreshold`, or to any response policy constant.** Context §5
  prices what those produce; changing them is a balance decision this document
  deliberately leaves whole.
- **No server-side surface, no migration, no deploy configuration.** Nothing
  here goes near `AGENTS.md`'s first three reservations.
- **No gang reputation writer.** `adjustReputation`
  (`src/simulation/incidents/gangs.ts:71`) stays unwritten. Its docblock
  describes standing *"raised by successful retaliation, lowered when a gang's
  own incident is contained"* (`src/simulation/incidents/gangs.ts:21`), which
  is a second mechanism with its own consequences and no reader anywhere;
  adding it here would be scope this document has not priced. Open Question 7.

### 6. Membership: assigned at intake, deterministically, from the classification the prison already draws — TIMING CORRECTED 2026-09-08, in this section

**A prisoner joins a gang at admission, by a rule over state intake already
computes, and not by a new random draw.**

Intake already classifies every arrival on the `prisoners.classification`
stream (`src/simulation/prisoners/intake-system.ts:565-571`, re-aimed
2026-09-15 from `:224`) into a risk tier and a
classification group. The recommendation is: **`high-risk` arrivals join a
gang; everyone else joins none**, and which of the two gangs is chosen
alternates on the arrival's entity id parity, which is recorded input and needs
no stream.

Two properties this buys, both of which matter more than the rule's elegance:

- **It is deterministic and adds no draw**, so no existing seed's prisoner
  classification shifts — the failure mode
  `src/simulation/runtime/new-session.ts:446-452` spells out at length for a
  shared stream.
- **It ties gang membership to the one prisoner attribute the player can
  already see and already influences**, so "why is my prison full of gang
  members" has an answer the player can act on.

**This is the weakest of the six decisions this document still owns and is
flagged as such**, see "The weakest claim in this document, named". A defensible alternative — every
arrival joins a gang, so the mechanism does not depend on high-risk arrivals
being reachable at all — is Open Question 4.

**CORRECTED 2026-09-08, AND THE CORRECTION RUNS BOTH WAYS. The paragraph above
is kept exactly as it stood.** Context 15 measured the constants this rule
depends on and found two things the earlier pass had not.

*In this rule's favour, and against the fear that named it weakest:*
`high-risk` **is** reachable from `priorIncidents: 0`. It is reached through
`reviewClassification`, not at the gate — one lapsed assault charges both
participants three disciplinary points, which is the `MAX_FINDINGS_TERM` cap,
and the next review scores `1 + 0 + 3 - 0 = 4` and clamps to tier 3. So the
mechanism is not inert for want of high-risk prisoners, and it bootstraps off
the very incident the owner's ruling names as the grudge's cause.

*Against this rule as written:* **that population becomes `high-risk` long after
intake, and this rule is evaluated at intake, so it would never see them.** The
criterion survives; the *timing* does not. A membership rule that reads
`classificationGroupIndex` once, at admission, assigns nobody in a prison whose
high-risk prisoners are made rather than admitted. The repair is to evaluate
membership wherever the tier is written — `ClassificationReviewSystem` already
writes both fields at
`src/simulation/prisoners/classification-review-system.ts:443-444` (re-aimed
2026-09-15 from `:384-385`, which this document also carried in Open Question 5
below) — but that is
a second write site, a second determinism question and a decision this document
has not priced. **Open Question 5**, and it is the one an implementer hits
first.

**AMENDED BY THE OWNER ON 2026-09-19 — BOTH THE MEMBER SPLIT AND THE CADENCE,
AND THE TWO PARAGRAPHS ABOVE ARE KEPT EXACTLY AS THEY STAND.** They are the rule
that was amended and the correction that survived it; a reader needs to see what
the amendment is an amendment *to*.

**The finding that forced it.** Whether a session ever sees a gang retaliation
at all is decided by **the parity of two entity ids** — the alternation this
rule uses to pick which of the two gangs an arrival joins. Over 12 seeds, **7**
reach a tier-3 pair. Of those 7, **3** draw a pair whose two prisoners land in
the *same* gang, and a same-gang pair has no contested grudge to amplify, so
those prisons retaliate **never**. The other **4** lock the whole prison down
every **4,800 ticks, forever** — Context 5's arithmetic and Context 15's, run
forward rather than stopped at the first retaliation. **Both halves are the
mechanism failing, in opposite directions**, and the split between them is a
coin this document did not know it was tossing.

**Decision 6 is one of the seven the owner accepted on 2026-09-08**, so changing
it is theirs and not this repository's, which is why it was put to them rather
than fixed. Offered the member split and the cadence as alternatives and as a
pair, they chose the option labelled:

> Obie naraz

("Both at once.") **So decision 6 is amended in both directions: the membership
split changes AND the retaliation cadence is cooled.** Neither alone was taken,
and the option said in as many words that either alone leaves one of the two
failure modes standing — a better split still produces a prison that locks down
on a fixed drumbeat, and a cooler cadence still produces prisons that never
retaliate at all.

**The provenance is the weaker kind, exactly as this document's Status block
records of the 2026-09-08 acceptance and the 2026-09-10 answer to open question
2**: the label of a clickable option the integrating session wrote and the owner
chose, not a sentence they typed. `AGENTS.md`'s entry of 2026-09-19 carries the
same disclosure for all four of that day's rulings.

**WHAT THIS AMENDMENT DOES NOT DO, AND IT IS THE HALF AN IMPLEMENTER WILL WANT
TO SKIP.** It does not pick the new split, and it does not pick the new cadence
figure. The owner ruled that both move; *what they move to* is a costing this
document has not done and must not be guessed at in implementation code. Open
question 4 — every arrival joins a gang — is the obvious candidate for the first
half and is **not** thereby accepted; Open question 5's timing problem is
untouched and still the thing an implementer hits first. **No code changed with
this ruling**: the amendment was recorded on its own, deliberately, so that the
decision and the diff that implements it can be reviewed as two things.

### 7. Why this is Lockstate's mechanism and not a copied one

`AGENTS.md` forbids copying Prison Architect's *"code, assets, text, UI
layouts or protected content"* while permitting research to inform mechanics,
and the HUD docblock quoted in Context §7 flagged in advance that
*"seeding gangs is not also a copy decision"*. This section is that flag
answered rather than deferred.

**What is not taken.** No text, no asset, no UI layout, no numbers read off
another game, and no gang overlay, gang-leader entity, recruitment meter,
protection racket, or territory-painting interface — none of which exist here
and none of which this document proposes.

**What makes the mechanism structurally ours, stated as differences a reader
can check against the code above rather than as an assertion:**

1. **A grudge is a directional, single-use ledger entry, not a standing
   relationship.** `grudges` is keyed `offended->offending`
   (`src/simulation/incidents/gangs.ts:82`) and is *cleared on use*
   (`src/simulation/incidents/trigger-system.ts:632`, re-aimed 2026-09-15 from
   `:546`). The genre's usual model
   is a persistent inter-gang hostility that modulates a probability; ours is a
   debt that is created by one identifiable event and discharged by one
   identifiable event. That is closer to the incident ledger this repository
   already has than to a relationship matrix.
2. **The producer is an incident the prison announced to the player, not a
   hidden sampler.** Decision §2. There is no gang-activity roll anywhere;
   Context §10 is why there cannot be one without a deliberate decision.
   **This clause read "an incident the player already watched" and is corrected
   in place with the old wording kept**: Context 14 established that
   "announced" is what the code delivers and "watched" is what nothing records.
   The structural difference from the genre is unaffected — a sampler announces
   nothing at all — which is why the item survives its own correction.
3. **Territory is a *sector* claim reusing the security sector the prison
   already derives** (Context §3), not a drawn or painted gang zone. Gangs
   inherit the geometry ADR 0036 already established for staffing and
   incidents; they do not introduce a second spatial concept.
4. **Membership is a consequence of classification**, which is this
   repository's own intake model (Decision §6), rather than a recruitment
   system with its own state.
5. **The whole model is deterministic**, which is a constraint the genre does
   not impose and this repository does (`docs/DETERMINISM.md`, ADR 0009's
   replay verification). A mechanism that must replay bit-identically from a
   seed cannot be a copy of one built on random rolls, because the shape of the
   decision is different.

The honest limit: *having* gangs at all is a genre convention, and this
document does not claim otherwise. What it claims is that the four moving parts
above — the single-use directional grudge, the assault as its sole producer,
the reused security sector as territory, and classification as membership — are
this repository's own answers, each derived from a module that already existed
here.

---

## Alternatives the owner's ruling rejects

**These were rejected by this document before 2026-09-08 and are rejected by the
owner's ruling now.** They are kept rather than deleted for the reason
`AGENTS.md` keeps a released reservation's original paragraph: a reader needs to
see what was given up, and every one of these will be proposed again.

**Each is priced in what it would have cost, not merely named.**

1. **A scheduled or random injection** — "gangs act up every N ticks", or a
   per-sample draw on a new RNG stream.
   *What it would have cost:* a seventh named RNG stream, which
   `src/simulation/runtime/new-session.ts:476-481` sets out as a
   save-compatibility question in full, and the loss of the property Context 10
   establishes — that nothing in `src/simulation/incidents/` draws a random
   number. *What it would have bought:* a retaliation reachable in a prison that
   has never had a fight, which is the one thing the ruling's producer cannot
   deliver. **Rejected by the ruling**, which makes the assault the cause.
2. **Contraband seizure** — a find on a prisoner raises their gang's grudge.
   *The obvious objection to it is wrong, so the real one is given instead.*
   Attribution is **not** the problem: `ContrabandHolderKind` includes
   `'prisoner'` (`src/simulation/contraband/item.ts:12`), so an item taken off a
   prisoner already names one and `getGangOf` would map it to a gang. The
   problem is that a seizure is a wrong done by the **prison**, not by another
   gang, so it has no `offendingGangId` to key a directional grudge against —
   the model in `src/simulation/incidents/gangs.ts` cannot express "this gang
   resents the warden". *What it would have cost:* either a second kind of
   grievance with its own reader, or arbitrarily blaming a rival, which is a
   lie the player could catch. **Rejected by the ruling**, which names an
   assault between members of different gangs.
3. **Cell-sharing friction** — `rateCellSharing` is the authored metric for two
   prisoners who go together badly. *What it would have cost:* nothing to
   build and nothing to observe — ADR 0061's open question 4 already records
   that no fixture builds a shared cell, so it would fire nowhere.
   **Rejected by the ruling**, and it was already inert.
4. **Writing the grudge when the assault opens rather than when it is
   adjudicated.** Not previously listed as an alternative because this document
   had already chosen against it; the ruling's word *"adjudicated"* now closes
   it. *What it would have cost:* a grudge that can be acted on while the
   assault it came from is still being contained, which reads as two incidents
   about one event — and the sector's single open-incident slot makes that a
   real ordering, not a stylistic worry (Context 4).

**One alternative the ruling does NOT reject, because it is not a producer:**
announcing the adjudication. Decision 2.3 sets out why it is the thing that
would deliver what the ruling's third clause appears to want, and Open Question
1 puts it to the owner. Adding it would not change what causes a grudge; it
would change what the player is told about the cause.

---

## Consequences

**Re-derived from the ruling rather than from the earlier draft's Decision, and
split three ways: what must exist, what does not exist today, and what the first
change touches.**

### What must exist in code before a grudge can form

1. **Two gangs, registered, both claiming the one watched sector.** Nothing in
   `src/` calls `GangRegistry.register` (Context 1) and a gang with no territory
   is structurally inert (Context 2).
2. **Members on both sides of a cross-gang assault.** `getGangOf` must answer
   for both participants and answer differently. Nothing in `src/` calls
   `addMember` (Context 1).
3. **A grudge writer.** `addGrudge` has no caller in `src/` at all (Context 1),
   and Context 3's arithmetic makes it the decisive one: with no grudge,
   `resolveRetaliationRisk` returns `0` at `src/simulation/incidents/gangs.ts:140`
   and every downstream gate is unreachable.
4. **Both participants at the adjudication seam.** The port carries only the
   instigator (Context 13, point 3), so the seam cannot today name the second
   prisoner a directional grudge needs.

### What does not exist today, listed so nobody re-discovers it

- **No producer of any kind**: zero calls to `register`, `addMember` or
  `addGrudge` outside `loadSnapshot` (Context 1).
- **No way for the adjudication seam to name the victim** (Context 13).
- **No record anywhere that a sentence reached a player**, and a determinism
  contract that forbids the kernel from reading publication (Context 14d, 14e).
- **No announcement of an adjudication**, of any incident, in any prison
  (Context 14c).
- **No panel that names an assault's participants**: `hud/incidents` and
  `hud/incident-detail` are both unpainted (Context 14b).
- **No guard against a retaliation with an empty participant list** (Context 6),
  which is the one defect in existing code this document asks to close.

**THREE OF THOSE SIX BULLETS ARE NOW FALSE, AND THE HEADING IS WHY THEY WERE
NOT NOTICED.** *"What does not exist today"* is a list of absences, which
`docs/AGENT_WORKFLOW.md` §4 names as the sentence form that rots first —
*"adding the thing it denies never touches the sentence denying it"* — and this
document's own decisions are what added them. Marked rather than overwritten,
and re-checked one bullet at a time on 2026-09-15 against `main` at `e044a3e8`:

- *"No producer of any kind: zero calls to `register`, `addMember` or
  `addGrudge` outside `loadSnapshot`"* — **there are four.**
  `src/simulation/incidents/default-gangs.ts:82` registers,
  `src/simulation/runtime/new-session.ts:671` adds a member at the site
  Decision 6 named, and `src/simulation/incidents/default-gangs.ts:313-314` add
  the grudge pair. The count was the claim and the count has moved.
- *"No guard against a retaliation with an empty participant list"* — **the
  guard is `src/simulation/incidents/trigger-system.ts:613-615`**, which is
  Decision 4 built. This bullet called it *"the one defect in existing code this
  document asks to close"*; it is closed.
- *"No way for the adjudication seam to name the victim"* — **the seam carries
  the whole record now**, `src/simulation/incidents/response-system.ts:237`, so
  both participants are reachable from it. See the marked bullet under *What it
  costs in code* below, which prices this as still owed.
- **The other three bullets were not re-checked on this pass and are not
  asserted either way** — the two about what a player is shown, and the
  unpainted `hud/incidents` pair. Saying so is cheaper than leaving a reader to
  guess which half of a list was read.

### What a first implementation would touch

Six files, and the list is deliberately short because the ruling lands on a seam
that already exists.

| file | change | why |
| --- | --- | --- |
| `src/simulation/incidents/response-system.ts` | widen `onAssaultAdjudicated`, or add a second port beside it, so the adjudication carries both participants rather than only the instigator | Context 13, point 3 — the ruling cannot be implemented without it |
| `src/simulation/runtime/new-session.ts` | seed two gangs at session creation; wire the grudge producer to the widened port | Decision 1 and 2 |
| `src/simulation/incidents/trigger-system.ts` | one guard clause: skip a pair unless both `membersOf` are non-empty | Decision 4, Context 6 |
| the membership write site | assign membership from `classificationGroupIndex` — and Context 15 says this is **not** `intake-system.ts` alone | Decision 6 as corrected; Open Question 5 |
| `tests/unit/incident-trigger.test.ts` | give members to the two fixtures that today assert on memberless gangs | Decision 4; the assertions are untouched |
| a new integration test | the measurement below, red-then-green | `docs/AGENT_WORKFLOW.md` §3 |

**What it does not touch, and this is the part worth checking against the four
reservations.** No `wrangler.jsonc`, no Worker, no `supabase/migrations/`, no
`public/_headers`, no `deploy.yml` and no dashboard. **No locale key and no
player-visible string**, under reading A — the one sentence involved
(`'Two gangs are settling a score.'`) already exists and this document does not
edit it. **Under Open Question 1's other branch it does touch a string**, which
is precisely why that question is the owner's and not an implementer's.

**No save-format move.** The registry's four collections are already persisted
(Context 8) and Decision 1 adds no field to the `.strict()` definition schema.

**No new RNG stream** (Context 10, Decision 5).

---

## Cost, priced

### What the first retaliation does to a prison, arithmetically

From Context §5, and it is worth reading before accepting this document because
it is the part a player experiences:

| quantity | value | derivation |
| --- | --- | --- |
| minimum severity | **6** | `round(0.6 × 10)`, and the gate refuses anything below `0.6` |
| maximum severity | **10** | `round(1.0 × 10)` |
| lockdown | **always** | severity ≥ 6 = `lockdownSeverityThreshold` |
| lockdown scope | **the whole prison** | one sector, covering all owned land |
| responders demanded | **3 to 5** | `ceil(severity × 0.5)` |
| deadline before it lapses | **600 ticks** | `responseDeadlineTicks` |

**So there is no gentle introduction to this feature.** The first gang
retaliation a prison ever sees seals every door in it and demands three spare
guards. A prison running the one-guard floor
(`DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT = 1`,
`src/simulation/security/default-sector.ts:113`) has none spare, so it gets the
alert and the lapse and no lockdown. That is a real consequence of accepting
this document and it is priced here rather than discovered in play.

### What it costs in code

**Consequences above answers the same question per file and this list answers it
per change; they are deliberately not two independent tallies, because two lists
of the same facts is the shape `docs/AGENT_WORKFLOW.md` §4 names as rotting
first.** Where they could disagree, Consequences is the one derived from the
ruling and wins.

- One guard clause in `tryOpenRetaliation` (Decision §4).
- One injected port beside `onAssaultAdjudicated`, on the pattern that port's
  own docblock argues for (Context §9). **CORRECTED 2026-09-08, and the bullet
  is kept because the correction is one an implementer would otherwise make at
  the keyboard:** a port *of the same shape* is not enough. `onAssaultAdjudicated`
  is `(entityId: EntityId, tick: number) => void`
  (`response-system.ts:218`) and a directional grudge
  needs both participants, so the new port must carry the record or the pair —
  Context 13, point 3.

  **THAT BULLET IS SPENT, AND IT IS MARKED RATHER THAN OVERWRITTEN
  (`docs/AGENT_WORKFLOW.md` §4) BECAUSE IT IS WHAT THE PRICE WAS BEFORE IT WAS
  PAID.** The port was widened when this decision was implemented and today
  takes `(incident: IncidentRecord, tick: number)` at
  `src/simulation/incidents/response-system.ts:237` — the record, which is the
  first of the two shapes the bullet named. Its anchor above is demoted to a
  bare basename for the same reason: `:218` is now a line of the docblock
  recording that widening, and that docblock marks both directions itself.
- Two `register` calls and a membership rule at session creation.
- Extending two existing unit-test fixtures that today assert on memberless
  gangs (Decision §4).
- **No new module, no new system, no new message kind, no new locale key, no
  RNG stream, and no save-format version bump** (Context §8, §10) — **under
  Decision 2.3's reading A only.** Open Question 1's other branch adds a
  `SIMULATION_EVENT_TYPES` member, a schema, a locale key, a row definition and
  a census label, which is a different order of change and is the owner's.

### What it costs in save format

Nothing, under Decision §1. The registry's four collections are already
persisted (Context §8) and no field is added. If Open Question 8's `nameKey`
is ever taken, that is an optional field against a `.strict()` schema and
carries the review cost `src/persistence/save-schema.ts:182-200` describes.

### The chain in ticks — REASONED, not measured

In a prison that produces assaults, and taking the measured assault of the
fixture named below: the assault opens, holds the sector's one slot, and
reaches a terminal state; the grudge is written at that moment; the assault
producer is then held off for 2,400 ticks by its own quiet window while the
retaliation gate stays open; the trigger samples every 50 ticks. **So the
earliest a retaliation can open is roughly one sampling interval after the
assault ends**, provided the accumulated grudge has reached 0.4. At the
recommended weight of 0.2 that is the *second* cross-gang assault, not the
first. This is reasoned from the gates in Context §4 and has not been run;
running it is the measurement below.

---

## The measurement the implementation will owe

Before landing any change described in Decision above, the implementing pass
must run, and report both sides of, the following — **named this precisely so a
more flattering fixture cannot be substituted for it.**

**Fixture A — the named prison: `tests/integration/assault-sanction-loop.test.ts`'s
`buildPrison()`, seed `0x5a17`, eight `room.cell`s plus one
`room.solitary-cell`, one `staff-role.guard`, eight `AdmitPrisoner` commands at
`{ x: 16, y: 16 }` with `sentenceLengthTicks: 400_000` and `priorIncidents: 0`,
real kernel, no hand-placed incident.**

That file records what this fixture already produces, and the numbers are the
baseline the implementation must not silently move — REPORTED, not reproduced,
from that file's own comment: *"the first terminal, adjudicated assault in this
exact fixture opens at tick 13,650 and lapses (no guard responds in time -- the
one hire is elsewhere) at tick 14,260, naming participants [2, 7] and
instigator 2."*

Report, for the unmodified tree and the tree with this decision implemented:

1. **The gang each of entities 2 and 7 is in at tick 13,650**, and whether they
   differ. If they do not, this fixture cannot produce a grudge and the run
   must say so rather than being replaced — Decision §6's membership rule is
   what would then be wrong, and that is the finding.
2. **Every incident opened over the run** — type, severity, participant ids,
   instigator id, and tick — so that the assault ladder this fixture is the
   reference for is visibly unchanged for everything except the new type.
3. **The tick the first `gang-retaliation` opens, if one does**, its severity,
   its two `causeFactors` values (`gang-grudge` and `retaliation-risk`), and
   its participant list. The list must be non-empty; Decision §4 is the reason.
4. **Whether `IncidentResponseSystem` mounted a response to it**, and therefore
   whether the prison-wide lockdown in Cost above actually fired at one guard —
   the arithmetic says it will not, and a run is what settles it.
5. **The grudge ledger at the end of the run** (`allGrudges()`), so that
   accumulation and clearing are both visible rather than inferred.

**Fixture B — the reachability reference: `tests/integration/incident-trigger-reachability.test.ts`'s
`BED_ONLY` case with `guards: 1`, seed `0x0cc0`, `RUN_TICKS = 30_000`.** That
file's assault case asserts `staffing-shortfall` is exactly `0` and
`assault-pressure` at least `0.65`; report the same four cause factors after
this change, to establish that seeding gangs moved no assault input. This is
the fixture that would catch a membership rule accidentally changing
classification draws.

**Red-then-green, per `docs/AGENT_WORKFLOW.md` §3.** Mutate the grudge producer
— the simplest mutation is to drop the "different gangs" condition so a grudge
is written for every adjudicated assault including same-gang ones — and watch
the new integration test go red. Report both outputs. A green suite that has
never been watched failing proves nothing here.

**What is recommended but not owed:** a second run of Fixture A with a second
guard hired, which is the smallest change that lets a response mount and would
be the only way to observe the prison-wide lockdown this document prices.

### Three items the owner's ruling adds — 2026-09-08

Numbered separately so a reader can see which of this measurement is the
ruling's and which was already owed.

6. **The tick each of entities 2 and 7 reaches `high-risk`, if either does, and
   the score `reviewClassification` gave them.** Context 15's arithmetic says a
   lapsed assault plus one review is enough; item 1 of Fixture A asks which
   gang they are in at tick 13,650, which is *before* any such review could
   have run on a finding from that assault. **The two items answer different
   questions and both are needed**: item 1 asks whether the ruling's producer
   can fire at all in this fixture, and this one asks whether the population it
   needs exists later. If neither prisoner ever reaches tier 3, Decision 6's
   criterion is what is wrong; if they reach it only after discharge, its
   timing is.
7. **Whether the assault at tick 13,650 produced a grudge, and in which
   direction.** The instigator is entity 2 (REPORTED from that fixture's own
   comment) and the participants are `[2, 7]`. Report the ledger key that was
   written, so that Open Question 2's direction choice is visible in a run
   rather than argued from the docblocks.
8. **The `incidents.assault-opened` record that assault produced** — its
   ordinal and its tick — beside the incident's own `startedAtTick`. This is
   the item that tests Decision 2.3's reading A end to end: reading A asserts
   that every assault that opens is announced, and a run that shows an assault
   with no record against it would falsify the one reading this document was
   able to implement. **It is expected to be vacuous** — Context 14a says the
   announcement is unconditional — and it is asked for anyway, because a
   vacuous check that was run is worth more than an unchecked inference, and
   this is the inference the whole of Decision 2.3 rests on.

---

## The gates this draft was run against

Documentation-only change. Run in this worktree at `491fcdce` (v0.0.541):

- `pnpm --config.verify-deps-before-run=false exec vitest run tests/foundation/`
  — **57 files, 526 tests, all passing**, both before this file existed and
  with it in place.
- The same command with this file placed directly at
  `docs/adr/` under that same basename — **5 failed** in
  `adr-numbering-contract.test.ts`, which is the measurement behind the
  placement note at the top of this document.
- **The verbatim gate was watched failing on this document rather than assumed
  to be reading it.** Mutating one character of one quotation here — the
  `if (grudge === 0)` line to `if (grudge === 0.0)` — turned
  `adr-quotation-verbatim-contract.test.ts` from **18 passed** to
  **1 failed | 17 passed**, and restoring the character turned it back. So
  every quotation above is compared against the file it names, rather than
  taken on trust — a count is deliberately not given here, because a tally in
  prose beside a gate that computes the same tally is the shape
  `docs/AGENT_WORKFLOW.md` §4 names as rotting first.
- Three real defects in this document were caught by that suite on the first
  run and are recorded rather than quietly fixed: two attributions written
  inside a wider parenthesis, which the pattern cannot read and which therefore
  checked nothing; one rooted path to the unmerged research note, which
  `documentation-links-contract.test.ts` reported as dangling exactly as it did
  for that note's own branch; and a bare version token in a table header with no
  commit beside it, which `documentation-version-claim-contract.test.ts`
  refuses because `.github/workflows/version.yml` bumps the patch on every push
  and a bare number is therefore false as soon as it merges.

**The ruling pass, run in this worktree at `98e88f34` (v0.0.541):**

- `tsc -p tsconfig.json --noEmit` — clean, exit 0, before and after this
  document changed. Documentation-only, so this is a statement that nothing was
  touched rather than a statement about the edit.
- `vitest run tests/foundation/` — **57 files, 526 tests, all passing**, taken
  as a baseline before any edit and again with every change above in place. The
  two counts are given because they are the same: this pass added no
  documentation contract and broke none.
- **Three real defects in the new material were caught by that suite on its
  first run and are recorded rather than quietly fixed**, exactly as the three
  above were. Two attributions were written `(both verbatim in ...)` over a
  single quotation span — *"both"* counts the spans bound to the attribution,
  not the occurrences in the file, and the gate reported *"binds 1 quotations,
  and the wording promises 2"* for each. One quotation, `assault: 2,`, was
  refused as *"too short to be evidence of anything"* at eleven normalized
  characters against a floor of twelve, and was replaced with the declaration
  line above it so the value is quoted in context. **All three were mistakes
  about the gate rather than about the code**, which is the useful thing to
  record: the gate caught a claim that was checking nothing.
- **The verbatim gate was watched failing on the *new* material rather than
  assumed to be reading it.** Mutating one character of one of this pass's own
  quotations — `private _publishedEventSequence = 0;` to `= 1;` — turned
  `adr-quotation-verbatim-contract.test.ts` from **18 passed** to
  **1 failed | 17 passed**, naming that quotation, and restoring the character
  turned it back to **18 passed**. Both outputs were obtained;
  `docs/AGENT_WORKFLOW.md` §3 asks for both.
- **The mutation this pass wanted and did not take.** The stronger form is to
  mutate the *source* and watch the document's gate fail, which is what proves
  the comparison runs against the live file rather than against a cached copy.
  It was attempted on `src/simulation/worker/state-machine.ts` and refused:
  `src/` is not this pass's surface. The weaker form above was taken instead
  and the difference is named rather than glossed — what was demonstrated is
  that the gate reads this document, not that it re-reads that file.

---

## The weakest claim in this document, named

**THAT CLAIM IS NO LONGER THIS DOCUMENT'S TO MAKE, AND THE ONE SENTENCE IT
ASKED FOR ARRIVED.** The owner ruled on 2026-09-08 that reading A is the
reading (Status). The section is kept whole rather than rewritten, because the
argument it makes is the argument they ruled on, and because "what would change
my mind" below turns out to have named the resolution correctly: it said one
sentence from the owner would settle it, and one did.

**So the weakest claim in this document is now the one below it** — Decision
6's membership *timing*, which the ruling does not touch and which Context 15
left half wrong in each direction. Everything about the producer is now either
code that was opened or a ruling that was quoted.

**The claim as it stood, on the day before the ruling:**

**The weakest claim is now Decision 2.3's: that reading A is what the owner
meant by *"one the player was actually shown"*.**

Everything else in this document is a statement about code that was opened.
That one is a statement about an intention, and the evidence cuts against it:
"actually" is an emphatic word, and a reading under which the clause selects
every assault and excludes none is not obviously what an emphatic word is for.
The honest position is that **reading A is the only implementable reading that
is not perverse, not that it is the intended one** — and Decision 2.3 says so
in those terms rather than presenting the choice as settled.

**What would change my mind about it, and it is one sentence from the owner.**
If they say the point was that a player should be able to connect the
retaliation to the fight, then reading A is wrong, the producer is unchanged but
incomplete, and Open Question 1's second branch — announce the adjudication —
becomes the work. If they say the point was that a grudge must not come out of
nowhere the player could not have seen, reading A is exactly right and the
clause is a guarantee about the channel's future rather than a filter on today's
prison.

**The previous weakest claim, kept and marked, because it moved rather than
vanished.** It read:

> **Decision §6's membership rule assumes `high-risk` arrivals actually occur in
> a prison a player builds, and this document did not verify that they do.**
> [...] This was not chased down because `src/simulation/prisoners/` is another
> agent's surface on this pass, and a claim about how often a tier is drawn
> needs a run rather than a reading.

**It has now been chased down on the constants and it is half wrong in each
direction** — Context 15 and the correction under Decision 6. `high-risk` is
reachable from `priorIncidents: 0`, so the fear that named it is unfounded; but
it is reached at *review* rather than at intake, so the rule's timing is wrong
in a way the earlier pass did not suspect. It is no longer the weakest claim
because it is no longer a claim about something unmeasured; it is a measured
defect with a named repair.

**Three claims that are NOT weak, said so a reader does not have to guess where
the confidence is.** Context 3's and Context 5's arithmetic are computations
over constants that were opened and either can be re-derived in a minute from
the quoted lines. **Context 14 is the strongest thing in this document**: every
one of its six parts is a file that was opened, and two of them are gates that
would fail if it were wrong — `adr-quotation-verbatim-contract.test.ts` on the
quotations, and `status-counts-publication.test.ts` on the determinism claim
itself.

---

## What would change my mind

**Rewritten 2026-09-08. This section used to be about which producer to pick;
the owner has picked one, so it is now about whether the one they picked can be
built as they described it.** The earlier version is not reproduced, because
every one of its four bullets survives below in a form the ruling reshaped
rather than contradicted, and a verbatim copy would be four paragraphs a reader
has to diff by hand.

- **The owner saying the point of *"actually shown"* was legibility rather than
  provenance.** This is the one that would change the most. Decision 2.3's
  reading A would then be too weak, the producer would be unchanged but the
  work would not be finished without an announcement at adjudication, and that
  is a new player-visible sentence — the owner's, not an implementer's.
  See Open Question 1.
- **A run showing `high-risk` is never reached in ordinary play**, despite
  Context 15's arithmetic saying it is reachable. Arithmetic shows a path
  exists; it does not show a prison walks it. That falsifies Decision 6's
  criterion rather than its timing, and Open Question 4's every-arrival rule
  becomes the answer.
- **A run showing the review never lands before discharge.** The mirror of the
  above and the more likely failure: Context 15's path needs one lapsed assault
  *and* a review at `CLASSIFICATION_REVIEW_INTERVAL_TICKS` while the prisoner is
  still in custody. If sentences in ordinary play are short relative to that,
  the path is real and nobody ever walks it.
- **A second sector arriving before this ships.** Decision 3's acceptance of the
  always-on amplifier is contingent on there being one sector; two sectors make
  the dampened branch reachable as a computation and its dead-at-threshold
  arithmetic worth revisiting rather than merely recording. The ruling does not
  touch this.
- **Evidence that a prison-wide lockdown on the first retaliation is
  unplayable.** Cost above prices it and does not judge it. A playtest finding
  it ruinous would not change the mechanism but would move
  `lockdownSeverityThreshold` or the severity formula into scope, which this
  document deliberately excluded — and the ruling does not touch that either.
- **Anything showing the assault record can name an aggressor.** Context 12
  rests on three modules saying `instigatorId` is not a finding of fault. If
  issue #80's command type ever lands and a real adjudication names a culprit,
  Open Question 2 answers itself and the grudge's direction stops being a
  choice.

---

## Promotion, decided rather than deferred — AND THEN TAKEN

**SPENT 2026-09-08.** This section said not yet and named its own condition:
*"Open Question 1 answered by the owner — either branch."* It was answered the
same day (reading A, quoted in Status), so the document is numbered **0103**,
sits in `docs/adr/`, and has its row in `docs/adr/README.md` with `Proposed` in
the Status column to match its own. The five assertions in
`tests/foundation/adr-numbering-contract.test.ts` that a draft in the
subdirectory was outside are now in force over this file, and they pass.

**The number was re-swept, because this section said the sweep would be stale
and it was — by two heads.** 250 remote heads rather than 252; highest
four-digit prefix on any head still **0102**, nothing at 0103 or above; disk
and the index's prior line agree. `0095` is still held on
`measure/893-coverage-and-response-draw-from-one-pool` and this pass did not
re-derive its holder either.

**The section below is kept unedited**, because its reasoning is why the file
waited a day and `docs/AGENT_WORKFLOW.md` §4 asks for both directions. Its
first sentence is now false; every measurement in it was true when taken.

**Should this document move out of the `drafts` subdirectory, take a number and get a
row in `docs/adr/README.md`? Measured on this pass: not yet, and the condition
that would flip it is one sentence long.**

**The number is not the obstacle, and it was swept rather than assumed.**
`git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`, then
`git ls-remote --refs --heads origin` (**252 heads**) with
`git ls-tree --name-only <head> -- docs/adr/` read out of every one of them and
**all 252 readable**. The highest four-digit prefix on any head was **0102**;
nothing at 0103 or above appeared on any of them. Highest on disk in this
checkout is also 0102, and `docs/adr/README.md`'s stated line already reads
`Next free number: 0103`. **All three answers agree, which is the configuration
that file calls the lucky one rather than the normal one.** `0095` is still held
and still not on disk, on `measure/893-coverage-and-response-draw-from-one-pool`
— the same head the index's chain has named at every sweep since 2026-09-05,
and it has not moved at this one either.

**The obstacle is substantive.** A numbered ADR with a row in the index asserts
that a decision has been taken. Decision 2 — the section the owner's ruling
lands on — cannot yet be stated in a form the code supports, because its third
term admits three readings and this document had to pick one on its own
authority (Decision 2.3). Numbering the document would put a row in the index
saying *what a gang is and how a grudge forms* is settled while the sentence
that settles it has a fork in it. `AGENTS.md`'s fourth reservation is about
promises the code does not keep; an index row is a promise of a smaller kind and
this one is not yet keepable.

**The procedural reason points the same way and is the weaker of the two**, said
so a reader does not mistake it for the argument: `AGENTS.md` states that *"ADR
numbers are assigned centrally, after drafts return"*, and this draft is
returning.

**The condition that flips it.** Open Question 1 answered by the owner —
either branch. Once "one the player was actually shown" has a reading, Decision
2 can be stated flat, and promotion is one commit: rename to
`0103-what-a-gang-is-and-how-a-grudge-forms.md` (or whatever number is free
then, re-swept, because this sweep will be stale), retitle the heading to
`# ADR 0103: …`, add the row to `docs/adr/README.md` with `Proposed` in the
Status column to match this document's own, and move the `Next free number`
line to 0104. **The five assertions in
`tests/foundation/adr-numbering-contract.test.ts` that a draft in this directory
fails are all satisfied by exactly those edits**, and the reason the draft is
skipped today was re-verified on this tree rather than carried forward: the
test's file walk reads `ADR_ROOT` one level deep and filters each entry on
`statSync(join(ADR_ROOT, entry)).isFile()` (verbatim in
`tests/foundation/adr-numbering-contract.test.ts`), at `:186`, so a
subdirectory is skipped before any filename rule is applied.

**What the draft does NOT escape by sitting in a subdirectory**, said because
the reverse would be the comfortable assumption: `collectMarkdownFiles`
recurses (`tests/foundation/adr-quotation-verbatim-contract.test.ts:239-246`),
so every quotation in this file is compared against the source it names, and the
links, source-anchor, version-claim and commit-citation contracts all read it
too. The only checks it is outside are the numbering, index-row and
status-keyword ones — which is exactly the set that needs a number to mean
anything.

---

## Open questions

**Renumbered 2026-09-08 when the ruling closed the producer question.** Two are
new and are the ruling's own residue; one — the old question 3, "rejected grudge
producers" — is no longer a question and has been promoted into "Alternatives
the owner's ruling rejects" above, where it is marked as rejected by the owner
rather than by this document. The rest are the earlier draft's, unchanged in
substance and moved only in number. **The old numbering is given beside each so
a reader holding the earlier draft can follow.**

1. **ANSWERED BY THE OWNER, 2026-09-08: branch (a), reading A.** *(Kept in
   place rather than deleted, and kept at number 1, because it is the question
   that promoted this document and because the branch they declined is the one
   a later reader will want to find.)* The question as it stood:

   > **Which reading of *"one the player was actually shown"* did the owner
   > mean, and should the prison announce an adjudication? — NEW, and it is the
   > one question this document cannot answer for itself.** Decision 2.3 sets
   > out the three readings and takes A, because B is forbidden by the
   > determinism contract and C depends on a gesture. The fork is: **(a)** A is
   > right, the clause is a guarantee about the channel rather than a filter,
   > and the work is as Consequences describes it; or **(b)** the point was
   > that a player should be able to *connect* the retaliation to the fight, in
   > which case the work also includes a new member of `SIMULATION_EVENT_TYPES`
   > announcing what the prison decided about an assault — a new schema, a new
   > locale key, a new row definition and a new census label. **(b) is a
   > player-visible sentence, so it is the owner's under `AGENTS.md`'s fourth
   > reservation** — the wording has been ours since 2026-09-04, the decision
   > to make the promise at all has not.

   The answer is (a). Status quotes the option they chose. **What it forecloses
   is worth stating as plainly as what it authorises**: there is no announcement
   at adjudication, so a player still cannot connect a retaliation to the fight
   that caused it, and nothing in this document may be read as licensing a
   sentence that would let them. That is a live limitation of the accepted
   design, not an oversight, and reopening it needs a fresh ruling.
2. **ANSWERED BY THE OWNER, 2026-09-10: write both directions at half
   weight.** *(Kept in place and at number 2, the way question 1 above is,
   because the two answers they declined are what a later reader will want to
   find.)* Status quotes the option they chose. **What the answer authorises
   and what it does not:** it settles the *direction* problem — the ledger is
   written symmetrically, so an even score stays even and a one-sided prison
   escalates — and it does **not** waive the cost this document named in the
   same breath. **The measurement is still owed and is now a precondition of
   implementation rather than of the decision**: half-weight writes double the
   number of ledger entries, nobody has measured what that does to the
   retaliation cadence, and a mechanism that fires twice as often as intended
   is a different game from the one that was accepted. Measure the cadence
   against a real prison before wiring the three missing writers
   [#979](https://github.com/woogitsu/lockstate/issues/979) needs, and if the
   figure moves the design, come back here rather than tuning it in
   implementation code.

   **Why the two rejected answers are worth keeping visible.** Treating the
   instigator's gang as the offender was the cheap option and it is the one
   that would have made the game assign fault from a signal three modules
   independently say is not a finding of fault. Writing nothing until
   [#80](https://github.com/woogitsu/lockstate/issues/80)'s real adjudication
   exists was the honest option and it would have left `gang-retaliation`
   unreachable indefinitely — which is the state #979 reports, so declining it
   is what makes #979 actionable.

   The question as it stood:

   **Which of the two prisoners is the offender? — NEW.** The grudge ledger is
   directional (`src/simulation/incidents/gangs.ts:82`) and the ruling's
   "between" is symmetric. The only directional signal on an assault record is
   `instigatorId`, which three modules independently say is not a finding of
   fault (Context 12). Three answers are available and none is obviously right:
   treat the instigator's gang as the offender; write **both** directions at
   half weight, so an even score stays even and a one-sided prison escalates;
   or write nothing until issue #80's real adjudication exists. The second is
   this document's instinct and it is deliberately not a recommendation,
   because it doubles the ledger writes and nobody has measured what that does
   to the cadence.
3. **Should a gang retaliation's participants be restricted the way a riot's
   are?** *(was open question 1.)* `IncidentLog` indexes open participants for
   `'riot'` only, and says why in its own words: reading the riot's authored
   action restrictions onto `'gang-retaliation'` *"would be a content decision
   with no measurement behind it"* (`src/simulation/incidents/incident.ts:227-228`).
   This document does not take it, so a retaliation's participants carry on with
   their day while the incident is open. That is the same open question ADR 0057
   left, now reachable for a second incident type.
4. **Should every arrival join a gang, rather than only `high-risk` ones?**
   *(was open question 2.)* The alternative to Decision 6's criterion. Its cost
   is that gang membership stops being something the player influences; its
   benefit is that the mechanism cannot ship inert. **Context 15 weakened the
   case for it without removing it**: `high-risk` turns out to be reachable, so
   "the mechanism cannot ship inert" is no longer the decisive argument it was
   when this question was written.
5. **ANSWERED BY THE OWNER, 2026-09-09: wherever the tier is written.** *(Kept
   in place and at number 5, the way open question 1 above is, because the
   question is what a later reader will want to find.)* The write is added to
   `ClassificationReviewSystem`, which is given the **same**
   `IntakeGangAssigner` port the intake stage already takes; the intake write
   stays. `tests/integration/gang-membership-at-review.test.ts` pins it.

   > **THE PROVENANCE IS THE WEAKER KIND AND IS DISCLOSED RATHER THAN DRESSED
   > UP**, exactly as this repository does for the 2026-09-08 and 2026-09-09
   > releases inside `AGENTS.md`'s reservation 3 and for ADR 0104's own
   > acceptance: the ruling is **the label of a clickable option this session
   > wrote and the owner chose**, not a sentence they typed, and it was put to
   > them against the finding below rather than against this document.

   **What forced the question is sharper than this entry put it, and the
   original text is kept below.** This entry said the population that becomes
   `high-risk` does so at review *"long after intake"*. The stronger fact,
   measured rather than reasoned: **`high-risk` is not reachable at intake at
   all in the shipped game.** `src/main.ts` builds the only `AdmitPrisoner`
   command the interface can produce and passes
   `ADMISSION_REQUEST.priorIncidents`, which is `{ priorIncidents: 0 } as const`
   — a *held* decision carrying its own reason (drawing priors moves risk tiers,
   and tiers decide cell sharing, contraband introduction and regime). So
   decision 6's gate was sound and unreachable, and gangs, grudges and
   `'gang-retaliation'` were built, tested and inert.
   `tests/integration/gang-grudge-loop.test.ts` admits at `priorIncidents: 2`
   and says so in its own header, which is why a green suite never showed this.

   **The determinism question this entry raised is answered by the port's own
   shape rather than by a measurement.** `IntakeGangAssigner` takes no `rng`,
   and its docblock says a session wiring it *"registers no seventh stream and
   no existing seed's classification draw moves"* — so a second call site adds
   no stream and moves no draw. It is **not** the situation
   `contrabandIntroducer` is in at the same site, which does consume a draw and
   is gated on the step into tier 3 for that reason; the two look alike and are
   not.

   **What it costs, measured on the new test's prison:** the first members
   appear at tick **48,000** rather than at intake, so this entry's own *"a
   prison's first gang members appear after its first review interval"* is the
   accepted pacing rather than a surprise. Membership is idempotent across the
   two sites, because `defaultGangIdForArrival` is pure in the entity id.
   Release still drops membership — entity 6 leaves at tick 48,611 in the same
   fixture — and **no revocation on a tier drop was added**, because this
   document never asked for one.

   The question as it stood:

   > **When is membership assigned — at intake, or wherever the tier is
   > written? — NEW, and it is the question an implementer hits first.**
   > Decision 6 says intake; Context 15 shows the population that actually
   > becomes `high-risk` becomes so at review, long after intake, and that
   > `ClassificationReviewSystem` writes both `riskTier` and
   > `classificationGroupIndex` at `classification-review-system.ts:384-385`.
   > (**The anchor in this quoted block is left as it was written and demoted to
   > a bare basename**, which is this corpus's form for a number that is no
   > longer current; the live pair is
   > `src/simulation/prisoners/classification-review-system.ts:443-444`, given
   > once in Decision 6 above.)
   > Assigning at both sites is the obvious repair and it is a second write
   > site with its own determinism question; assigning *only* at review means a
   > prison's first gang members appear after its first review interval, which
   > is a real pacing decision rather than a detail.
6. **What weight should one cross-gang assault carry?** *(was open question 6.)*
   Decision 2.5 recommends `0.2` and shows the arithmetic that makes `0.4`,
   `0.2` and `0.15` mean "every assault", "every second" and "every third". This
   is the one number in the document a balance pass would move first, and the
   ruling does not name it.
7. **Does a successful retaliation move gang reputation?** *(was open question
   4.)* Decision 5 leaves `adjustReputation` unwritten. Its own docblock
   describes the intent (`src/simulation/incidents/gangs.ts:21`), and nothing
   anywhere reads reputation back — so writing it would create a second
   subsystem with no reader, which is the class of defect this document is
   closing.
8. **Do gangs ever need names?** *(was open question 5.)* Not for this decision
   (Context 7: the alert takes no parameters). It becomes a question the first
   time a gang id would reach a player — a roster column, an incident detail
   panel — and it is then an optional `nameKey` on `GangDefinition` plus a
   locale key. **Open Question 1's branch (b) is the first thing that would
   make it live**, because a sentence about what the prison decided is a
   sentence that might want to say who it decided about.
