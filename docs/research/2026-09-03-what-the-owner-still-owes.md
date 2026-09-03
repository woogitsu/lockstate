# What the owner still owes, assembled: 2026-09-03

**Measured on `origin/main` at v0.0.403 (`f948b8e2`).** Every `file:line` below
was opened at that commit. Every prose claim quoted from a document is quoted
rather than cited by line, per `docs/AGENT_WORKFLOW.md` §4.

This is a **reading** deliverable. Nothing in `src/` was touched, no
player-facing string was written or changed, and **none of the questions below
is answered here** — assembling them is the whole job. `AGENTS.md`'s fourth
exclusion, *"Anything that reaches a player as a promise the code does not
keep"*, is the rule that makes them the owner's.

---

## 0. The headline, stated before the list

**The wording backlog is smaller than "a real backlog scattered across four
places" suggests, and it is concentrated rather than scattered.**

On `main` today there are **six draft strings awaiting a wording call** (eight
locale keys) and **seven places where a sentence was deliberately not written
and the surface is waiting for one**. That is **thirteen wording obligations**,
plus **eight `STATUS-QUEUE.md` §2 signature/approval rows** and **one
un-put economy decision**. Of the thirteen wording items, **five were created in
the last two days** (2026-09-01 to 2026-09-02) and only **four have been waiting
longer than five days**.

**Three premises in the brief that commissioned this note are false on `main`
today**, and they inflate the queue rather than describe it:

| Brief's premise | What `main` says at `f948b8e2` |
| --- | --- |
| "`STATUS-QUEUE.md` §2's live entries (there are nine as of PR #863)" | **Eight.** §2's own heading opens *"Eight entries"* and eight `###` subsections stand between it and §3's first closed entry. The ninth row exists only on PR #863's branch, which is **open, not merged**. |
| "`action.carry`'s `'Errand'` … which may or may not have landed" | **Not landed.** PR #863 is open. `action.carry` does not exist in `src/`; `DEFAULT_ACTIONS` still ends at `action.kitchen-work`. |
| "the unstaffed-sector sentence … landing in PR #857" | **Not landed, and no longer owed.** PR #857 is open, and the owner supplied the replacement wording verbatim on 2026-09-03. The obligation is discharged; only the merge is outstanding. |

Two further items the brief treats as open are **settled**, and one marker in
`src/` is **stale in the owner's favour** — see §5 and §6. Correcting those
removes three items a naive grep would have reported as owed.

---

## 1. Method, and what it cannot reach

### What was derived mechanically

**Draft strings (§2).** Derived from the marking convention, not from the two
calibration instances. The convention is not one phrase but three, and finding
that out was the work:

- `a draft for the owner's review` — `grep -rn "draft for the owner" src/`, **1 hit**.
- `flagged for the owner's review` — `grep -rni "flagged for the owner" src/`, **3 hits**.
- `owner-pending` — `grep -rni "owner.pending" src/`, **6 hits**.

Ten raw hits over four files. They collapse to six obligations because three
markings describe **one** string (`hud.status.funds-treasury-floor-exhausted` is
marked in `src/content/default-locale-en.ts`, `src/ui/hud/messages.ts` and
`src/ui/hud/projection.ts` — by design, and that file says so) and one marking
covers a group of three keys.

**A grep for the two calibration strings alone would have found one of the six.**
`'Kitchen Duty'` carries the `draft for the owner's review` wording and nothing
else in the repository does; the other five use `flagged for the owner's review`
or `owner-pending`. That is the finding that made the convention worth deriving.

**Empty places (§3).** Derived from `grep -rn "fourth exclusion" src/` — **27
hits across 21 files**, every one opened and read. They split cleanly and the
split is most of the value:

| Reading of the 27 | Count |
| --- | --- |
| A live obligation: a sentence is owed and was not written | **7** |
| Already discharged — the comment records a ruling that has since landed | 6 |
| Not an obligation — explains why *no* copy was authored and none is needed | 11 |
| Standing option rather than a debt (§4) | 2 |
| Stale: says "open" where the ruling has landed (§6) | 1 |

**`STATUS-QUEUE.md` §2 (§7).** Enumerated by reading `grep -n '^### '` between
§2's heading and §3's, then opening each of the eight subsections. Counted on
disk rather than taken from the heading — and the heading agrees.

### What could not be enumerated mechanically, and what was searched instead

**ADR *"What is owed to the owner"*-shaped sections cannot be found by one
grep, and this is a structural finding rather than a limit of effort.** The
literal heading *"What is owed to the owner"* exists in **exactly one** of the
88 ADRs (`docs/adr/0093-a-carry-is-an-action.md`). `grep -rn "^#\+.*owed to the
owner" docs/adr/*.md` returns **two** lines, one of which is a different
sentence in ADR 0017.

Widening to `grep -rn "^#\+.*[Oo]wner" docs/adr/0*.md` returns **38 headings**
across 18 ADRs, in at least **twelve distinct shapes**: *"What is owed to the
owner"*, *"Open questions for the owner"*, *"Decisions for the owner"*, *"What
stays the owner's"*, *"What is left for the owner"*, *"What is left open, and is
the owner's rather than this document's"*, *"The costed choice, which is the
owner's to make"*, *"What the player is told is the owner's, and is not drafted
here"*, *"What ruling 20 does not decide, and is put to the owner rather than
settled here"*, *"The legal obligations are named, and are the owner's"*, *"It is
invisible to the player, and that half is the owner's"*, and *"A cost the gate
found and §5 did not price — not put to the owner, and not decided here"*. Many
of those 38 headings are **records of decisions already made** (*"The ruling, in
the owner's words"*, *"The owner ruled on five of these"*), not debts.

So §8 lists the sections that carry an owner-owed item, classified, **and does
not claim to be complete**: a thirteenth phrasing in an ADR that names no
owner-word in its heading at all would not appear. What bounds the risk is that
the *player-facing wording* subset does not depend on this scan — §2 and §3 reach
those obligations from `src/`, where the string actually lives, and a wording
debt with no marking in `src/` is a debt with no surface waiting on it.

**Issue comments could not be enumerated at all.** The brief names *"issue
comments"* as a source. This pass read the issue-and-PR record only where a
document or a code comment cited a specific number (#382, #506, #532, #533,
#585, #600, #615, #639, #703, #707, #749, #767, #768, #771, #772, #782, #785,
#799, #807, #848, #857, #863), and read PRs #857 and #863 in full because the
brief turns on them. **It did not sweep the comment bodies of the repository's
open issues**, so an obligation stated only in a comment and never written into
`src/` or `docs/` is outside this note. Everything below is derived from the
tree.

---

## 2. Draft strings already on screen, awaiting a wording call

Six obligations, eight locale keys. **All six are code-ready**: the mechanism
behind each shipped, the string renders today, and an answer replaces bytes in
one file.

| # | Where it is owed from | What the owner has to decide | Ready? | Waiting since |
| --- | --- | --- | --- | --- |
| **A1** | `src/content/simulation-message-keys.ts:187` | What the roster cell calls a prisoner on kitchen duty — the entry reads `'Kitchen Duty'` and is marked *"This is the one new player-facing sentence issue #532 adds, and it is a draft for the owner's review"*. | Yes | `fcd2a725` (#532), **2026-08-29** — 5 days, the oldest wording debt on `main` |
| **A2** | `src/content/default-locale-en.ts:272`, marked again at `src/ui/hud/messages.ts:181` and `src/ui/hud/projection.ts:614` | What the funds chip says at the treasury floor, where nothing at all can be spent — *"THIS COPY IS OWNER-PENDING"* in the first place, *"the clearest available draft, flagged owner-pending, not a placeholder"* in the third. | Yes | `25be9ca3` (#782), **2026-09-02** |
| **A3** | `src/content/default-locale-en.ts:364` | What a minimap with no map drawn but a working click says — the comment opens *"**THIS WORDING IS OWNER-PENDING. The mechanism behind it is not.**"* | Yes | `8fead7e7` (#793, #802), **2026-09-02** |
| **A4** | `src/content/default-locale-en.ts:723` | What a player is told when they dismiss somebody who is not on the roster — *"Drafted for issue #533 and flagged for the owner's review."* | Yes | `a8a446ed` (#533), **2026-08-29** |
| **A5** | `src/content/default-locale-en.ts:1392`, `:1414`, `:1415` | Three words for the Staff panel's roster block — its header, its button, and what a dismissal costs — *"All three are drafted and flagged for the owner's review"*. | Yes | `a8a446ed` (#533), **2026-08-29** |
| **A6** | `src/content/default-locale-en.ts:1170` | What the build queue says it is waiting for, now that the figure names one order rather than the whole queue — *"offered for the owner to sign, adjust or replace"*. | Yes | Key `a87b0d34` (#640), 2026-08-30; **subject changed** under the owner's #771 ruling at `53267d7e`, **2026-09-01** |

**A5's sibling is not owed and is the useful control.** `hud.security.roster-wage-bill`
sits between A5's keys at `:1413` and is *not* flagged: its comment reads *"the
owner's approved wording, 2026-08-30"*. Four keys in one block, three drafted
and one signed, is what tells you the marking means something.

---

## 3. Places where a sentence was deliberately not written

Seven obligations. Unlike §2 these are **empty surfaces**: the code refused to
author copy, so a player is told nothing, or is told a bare number where a
sentence was asked for. An answer here **adds** a string rather than replacing
one, so each also needs the key wired — named per row.

Sorted with the ones that unblock committed work first.

| # | Where it is owed from | What the owner has to decide | Ready, or unblocks? | Waiting since |
| --- | --- | --- | --- | --- |
| **B1** | `src/ui/hud/build-panel.ts:1628` and `src/ui/hud/staff-panel.ts:802` | What a Buy or Hire button that is advising against a press says stops it and what would lift it. Both comments read *"This is the mechanical half only"* and *"Naming what stops a press and what would lift it is new player-facing copy, which `AGENTS.md`'s fourth exclusion reserves to the owner"*. | **Unblocks two shipped half-features and one ADR decision.** ADR 0087 decision 2 is headed *"Recommended, gated on copy"* — that gate is this sentence. | `819b4d34` (#799) and `638b9349` (#807), **2026-09-02** |
| **B2** | `src/simulation/construction/handler.ts:327` and `src/simulation/presentation/construction-projection.ts:281` | What a player is told when a materials pass spends the treasury and buys only part of what the queue needs. ADR 0081 decision 3 calls it *"a precondition rather than a nicety"*; its open question 2 is *"what the player is told, and whether a partial fill is a refusal-class sentence or an event-class one"*. | **Ready — the number is already carried.** `MaterialsProcurementReport.purchased` holds it and the projection reads only `unfunded`; the comment ends *"So: this is the place, it is empty"* and *"This comment is the empty place."* | `a67b141d` (#725), **2026-08-31** |
| **B3** | `src/ui/hud/regime-panel.ts:700-712` | What a prison that admitted people and has since discharged all of them is told. *"Nobody has been admitted yet"* is false of it, so the panel draws **neither** sentence and the player reads nothing. | **Unblocks a blank surface.** The comment records the search: *"searched `default-locale-en.ts`: every other 'nobody'/'empty' string names a different subject … and reusing one would only be a different false claim"*. | `2a78e98a` (#506, #508), **2026-08-29** |
| **B4** | `src/simulation/presentation/status-strip-projection.ts:509` | The sentence that names *what* contraband was found rather than how many things were. The owner's ruling 3 *"asks that a discovery be named, and only a per-discovery message can name each of several"*; a mixed haul falls back to a bare count, which the comment calls *"honest but … not the whole of ruling 3"*. | Half-ready: the field needing no sentence shipped. A mixed haul needs the sentence before it can say anything. | `bdbd8cfc` (#707), **2026-08-31** |
| **B5** | ADR 0093, *"What is owed to the owner"* item 2 | What a prison says when a delivery is sitting in the bay and nobody is in a work block to carry it (a `PrisonCondition` member). | **Blocked on PR #863**, which is open. The PR states the member *"was also deliberately not built — its sentence is owed"*. | ADR 0093, **2026-09-02** |
| **B6** | The hungry-prisoner sentence — refused in #848 (`bc5f0075`), restated in PR #863 | What a prison says when a prisoner is too hungry to run an errand. #848 refused *"{prisoner} skipped {job} — too hungry"* because *"the mechanic does not exist anywhere in src/"*. | **Newly writable, and only on the branch.** PR #863 builds the mechanic and reports *"The underlying defect stands"* — a work block allows no `meal` category, so kitchen duty at 1/tick against a meal's 4 is a starving prisoner's only recourse. **Nothing on `main` can produce the state**, so the sentence is not yet writable there. | Refused `bc5f0075` (#848), **2026-09-03** |
| **B7** | `src/simulation/events/event-log.ts:579`, marked again at `src/content/default-locale-en.ts:877` | What a player is told when they cancel a build order that had already **finished** — neither shipped sentence is true of it, since the money did not come back and the materials went into the container. | **Lowest priority of the seven, on the code's own evidence**: `PENDING_BUILD_ORDER_STATES` excludes `'completed'`, so *"No control can reach that press today"*. Reachable only by an order finishing between a projection and the press. | `194d4a11` (#774), **2026-09-01** |

**ADR 0093's third owed sentence is deliberately not a row.** Item 3 —
*"Whatever the detail panel says about goods in hand, if it says anything"* — is
conditional on the owner wanting the panel to say anything at all, so it belongs
in §4 rather than here. It is listed for completeness and is blocked on #863
either way.

---

## 4. Standing options, not debts

Three items are the owner's and are **not waiting on anything**: nothing is
false, nothing is blank, and no work is blocked. They are recorded so a future
sweep does not promote them.

- **`src/ui/hud/hud.css:2842`** — the Rooms note wraps to two or three lines and
  pushes the controls down. *"Shortening the sentence instead remains available
  and remains the owner's."* A cosmetic option with a shipped, correct sentence.
- **ADR 0082 §4**, *"What the player is told is the owner's, and is not drafted
  here"* — *"If the owner wants the list to say it is placement-ordered, the copy
  is theirs."* The existing sentence became **true** with that change rather than
  false.
- **ADR 0093 item 3** — whether the prisoner detail panel names goods in hand at
  all.

---

## 5. Refused wordings: two of three are settled

| Refusal | State on 2026-09-03 |
| --- | --- |
| **The unstaffed-sector sentence.** *"No guard is posted here, so nothing stops an incident in this sector"* — refused in #848 because guard presence is an amplifier and not a gate, so the sentence *"is not merely unbacked, it is backwards"*. | **SETTLED.** The owner supplied `No guard is posted here, so nobody in this sector is kept safe.` verbatim on 2026-09-03. It is implemented on PR #857, which is **open**. Not owed; only merged. |
| **The Remove tool's hint.** *"its materials come back"* was false from 2026-08-31 to 2026-09-02 under the owner's ruling 20. | **SETTLED.** `src/content/default-locale-en.ts:1052` now opens *"`remove-hint` WAS FALSE FROM 2026-08-31 TO 2026-09-02, AND THE OWNER HAS NOW WRITTEN THE REPLACEMENT."* The lesson it records is worth carrying forward: *"A false player-facing sentence needs a question, not a record."* |
| **The hungry-prisoner sentence.** | **STILL OWED** — §3, B6. Writable only once PR #863 lands. |

---

## 6. One marker that overstates the queue

**`src/ui/affordability.ts:157` says a settled question is open.** It reads:

> The badge's *words* are a separate question and are still open. … The
> incumbent `{remaining} left` ships until the owner rules on the figures; ADR
> 0017 "Amendment, 2026-09-01" §5a(d) carries them.

The owner **did** rule. ADR 0017's §5a(e) is headed *"The owner ruled on (d),
reversing their own earlier choice of `{remaining} left before deliveries stop`,
still 2026-09-01"*, and rules *"the chip keeps the short wording, because it
fits"*. Verified in the tree rather than taken from the ADR: the two keys that
ruling created, `hud.status.funds-before-deliveries-stop` and
`hud.status.funds-deliveries-stopped`, exist at `src/content/default-locale-en.ts:236`
and `:250`. `src/content/default-locale-en.ts:199` records the same ruling
correctly — *"The owner ruled on those numbers on 2026-09-01"* — so the two
comments about one decision disagree, and the one in `src/ui/` is the stale half.

**A second stale claim, found the same way and reported rather than fixed.**
`src/simulation/runtime/new-session.ts:731-736` says of the standing overdraft
*"It does not tell the player … so the funds chip renders the minus
`Intl.NumberFormat` gives it, with no tone and no badge, and no sentence has been
authored here."* `src/ui/hud/view-model.ts:333` records the opposite outcome —
*"The owner ruled on both places on 2026-08-31 (ruling 18) and authored both
strings"* — and `overdraftTone` and `overdraftBadge` in `src/ui/hud/projection.ts`
are what give the chip the tone and badge that comment denies.

Neither is a wording debt and neither was changed here. Both are named because a
sweep that trusted the marker would report obligations the owner has already
discharged, which is the opposite of this note's job.

---

## 7. `STATUS-QUEUE.md` §2's eight live entries

**Eight, not nine.** §2's heading opens *"Eight entries"*, and eight `###`
subsections stand between it and the first closed entry (*"ADR 0031 — accepted
2026-08-26, and the entry is deleted"*). §2 itself explains why ADR 0093 has no
row: *"It is not filed because 0093 is `Proposed` and implements nothing, so no
price has been paid; a reader landing 0093 should expect that entry to need a
reading."* PR #863 files that ninth row, and PR #863 is open.

None of the eight is a **wording** debt. Each is a signature, an approval, or a
balance figure.

| # | Entry | What the owner has to say or sign, in one line |
| --- | --- | --- |
| 1 | ADR 0008 §2's two rulings (#382) | Approve or reject two Supabase authority rulings that #382 wrote into an `Accepted` ADR as decided, with no approval caveat behind them but its own judgement. |
| 2 | ADR 0008 §3's scope clause (2026-08-27) | Approve the consequences drawn from the *by-authority* reading they already chose — the choice is theirs and made; *"a choice between two readings does not approve the consequences drawn from it"*. |
| 3 | The first server-side entry point (2026-08-27) | Work and approve `docs/DEPLOYMENT.md`'s nine-item pre-merge checklist, because the condition they attached to their own ordering decision is *"a **future approval** that nothing will ask for"* — the merge itself publishes. |
| 4 | ADR 0056 (2026-08-28) | Accept (or refuse) the one second of simulated time a player's order is deferred by, as the price of orders staying in the order they gave them. |
| 5 | ADR 0059 (2026-08-28) | Accept the cost of an actor walking tile-by-tile rather than teleporting — *"the walk is decided, the day it eats is not"*. |
| 6 | ADR 0074 (2026-08-29) | Decide whether a legacy prison's rooms may silently change bounds under a player when it is restored. |
| 7 | ADR 0071's open-area amendment (2026-08-29) | Approve the still-`Proposed` document that their own 2026-08-29 ruling scopes — the ruling is theirs and recorded; the document it amends is unapproved. |
| 8 | ADR 0077 (2026-08-29) | Decide whether a lockdown may strand a walker mid-route. |

---

## 8. ADR sections carrying an owner-owed item

Classified, and **not claimed complete** — see §1 on why one grep cannot find
these. Sections whose heading names the owner only to *record* a ruling they have
already given are excluded.

### Carries a player-facing wording obligation

Every one of these is already a row in §2, §3 or §4, reached from `src/` rather
than from this scan. That the two routes agree is the only cross-check available
for this category.

- `docs/adr/0093-a-carry-is-an-action.md`, *"What is owed to the owner"* — three
  items: the action's label (§2 A1's sibling on the branch), the standing
  condition (B5), the detail-panel copy (§4).
- `docs/adr/0082-what-order-build-orders-are-carried-out-in.md` §4 — §4 above.
- `docs/adr/0081-whether-a-purchase-may-be-partly-filled.md` open question 2 —
  B2. *(Reached via `src/simulation/construction/handler.ts:327`, which quotes it.)*

### Carries a non-wording owner decision, still open

- **`docs/adr/0017-money-primary-resource-model.md` §9**, *"A cost the gate found
  and §5 did not price — **not put to the owner**, and not decided here"*.
  **This is the one item in this note that blocks a player rather than an
  agent.** ADR 0075's ECON-002 hard lock reopened: a new prison that makes *"one
  legal, unrefused 656-brick purchase"* reaches a state it cannot earn its way
  out of by any command the game offers, before it has built a single bed. The
  section says of itself that the acceptance banner above it *"was true of §5 as
  written and is not true of the cost below"*. Waiting since `53267d7e` (#771,
  #785), **2026-09-01**.
- `docs/adr/0070-dismissing-a-staff-member.md` Status — *"Two things here are
  explicitly not decided"*: the severance/refund amount and the
  guards-per-prisoner ratio. 2026-08-29.
- `docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md`, *"What
  ruling 20 does not decide, and is put to the owner rather than settled here"* —
  `RemoveObject` on a **completed** object, with three live answers and *"the
  ruling does not choose between them"*. Sharpened by an inversion the ruling
  created: *"it pays to let the crew finish"*.
- `docs/adr/0080-when-the-prison-asks-what-a-prisoner-is-carrying.md`, *"The
  costed choice, which is the owner's to make"* — the `60/30/10` prior-incident
  split, recommended and *"This document still decides nothing"*.
- `docs/adr/0086-what-refreshes-a-pulled-hud-readout.md`, *"What stays the
  owner's"* and §4 *"What is left for the owner"* — approval of the ADR, whether
  E.3 is wanted, whether the paused-prison behaviour is acceptable **as a product
  answer**, and whether a routinely-missed millisecond bound was ever the right
  shape of bound.
- `docs/adr/0051-what-a-player-sees-for-an-order-given-while-the-clock-is-paused.md`,
  *"Open questions for the owner"* — three, of which *"Should a purchase spend
  money during a pause?"* is named by the ADR as *"the one place where reasonable
  people could take the other side"*.
- `docs/adr/0056-keeping-a-players-orders-in-the-order-they-gave-them.md`, *"Open
  questions for the owner"* — three; §7 row 4 is the same debt from the queue's
  side.
- `docs/adr/0066-what-a-navigation-tick-may-cost.md`, *"Open questions for the
  owner"* — *"What share of a 50 ms tick may navigation have, and on what
  reference hardware?"*, which the ADR calls *"a product decision about target
  hardware, which is state this repository cannot read"*.
- `docs/adr/0046-shipping-the-telemetry-pipeline.md` §8, *"The legal obligations
  are named, and are the owner's"* — and §7 row 3 is its precondition.
- `docs/adr/0065-what-happens-to-a-save-this-build-cannot-read.md` §7, *"It is
  invisible to the player, and that half is the owner's"*.
- `docs/adr/0020-deterministic-kernel.md`, *"What is left open, and is the
  owner's rather than this document's"*.

### Recorded as owed and since discharged

- `docs/adr/0017-money-primary-resource-model.md` §5, *"owed to the owner, and
  four sentences are now wrong"* → §5a, *"What the owner then ruled, 2026-09-01 —
  **every debt §5 records is paid**"*, with §5a(e) reversing §5a(d). §5 is kept
  unedited on purpose: it *"is the record of the sentences having waited for a
  ruling rather than been rewritten by whoever noticed they were wrong"*.
- `docs/adr/0084-what-the-alerts-channel-owes-a-player.md`, *"Decisions for the
  owner"* — decisions 1 and 2 both carry a **"Decided on 2026-09-01"** paragraph.
- `docs/adr/0087-whether-a-refusal-is-an-event-or-a-condition.md`, *"Decisions for
  the owner"* — decision 2 remains *"Recommended, gated on copy"*, and that copy
  is B1.

---

## 9. Sorted by whether an answer unblocks something

**Tier 1 — an answer releases work that is already built and waiting.**

1. **B1**, the Buy and Hire buttons' refusal copy. Two shipped mechanisms
   (#772/#799, #807) are mechanism-only by their own comments, and ADR 0087
   decision 2 is *"Recommended, gated on copy"* — one sentence releases all three.
2. **§7 row 3**, the server entry point's pre-merge approval. ADR 0046's
   telemetry ingest cannot land at all without it, and it is the one approval
   `deploy.yml` will never pause to ask for.
3. **ADR 0017 §9**, the reopened ECON-002 hard lock. Not wording, and *"not put to
   the owner"* by the section's own heading — a player who makes one legal
   purchase can lock a prison out of the game.

**Tier 2 — an answer fills a surface that is blank or bare today.**

4. **B3**, the discharged-empty roster, which currently draws no sentence at all.
5. **B2**, the partial materials buy, where the figure is already carried.
6. **B4**, the mixed-hauled contraband chip, which falls back to a bare count.

**Tier 3 — an answer replaces a draft that is already legible on screen.**

7. **A1**–**A6** (§2). Each is code-ready and each currently reads as a
   defensible sentence; nothing is false and nothing is blocked.

**Tier 4 — blocked on a merge, not on the owner.**

8. **B5**, **B6** and ADR 0093 item 3, all gated on PR #863 landing.
9. The unstaffed-sector sentence, gated on PR #857 landing (§5).

**Tier 5 — standing options.** §4.

---

## 10. Weakest claims in this note

- **The ADR scan in §8 is not exhaustive and cannot be made so by grep.** §1
  says what was searched and how many shapes it found. What bounds the risk is
  that the wording subset is reached from `src/` independently.
- **Issue comments were not swept.** An obligation living only in a comment
  thread is outside this note. §1 lists the issue numbers actually read.
- **"Waiting since" is the commit that introduced the marking, not the commit
  that created the underlying gap.** For A6 the two differ and both are given.
  For B4 the ruling predates the marking.
- **The three "settled" verdicts in §5 and §6 rest on the tree's own prose plus
  one verification each** (the two locale keys for §6; the replacement string in
  place for the Remove hint). No independent confirmation from the owner was
  sought, because seeking one would be asking a question this note exists to
  avoid asking.
