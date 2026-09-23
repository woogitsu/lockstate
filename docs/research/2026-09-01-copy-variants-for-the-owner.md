# Copy variants for two rulings: the insolvency ladder's sentences, and four controls that say nothing when they succeed

**Purpose and what this is not.** These are candidates for the owner to choose
between, not copy that ships. `AGENTS.md`'s fourth exclusion — a player-facing
promise the code does not keep — covers every sentence below; nothing here is
written into `src/content/default-locale-en.ts` by this document, and no
locale key is added, renamed, or removed on this branch. Whoever implements the
owner's choice writes the words verbatim, wires the interpolations, and — for
several of the candidates below — writes the small amount of new code the
words need to become true. Where a candidate needs code beyond copy, that is
stated, because a sentence naming a number is a promise that the number is
right *and reachable*, and reachability is a fact about the code, not about the
words.

**A correction to the brief before anything else.** The brief describes ruling
19 (#747) and the money-not-materials ruling (#746) as landing "today." Both
are already merged to `origin/main`: `git log --oneline origin/main` shows
`52b5bb1c` (#747) and `098b3a18` (#746), and `git merge-base --is-ancestor
52b5bb1c origin/main` confirms `52b5bb1c` is an ancestor of the `main` tip at
the time this branch was cut (`0a53ec70`, v0.0.314). ADR 0017's "Amendment,
2026-09-01" is **Accepted**, not merely drafted — its own header says so, with
the implementation "put to them with the implementation beside it." So the two
rulings this document exists to give words to are not proposals; they are
signed decisions with an implementation already in `main`, and the only thing
missing is the four sentences and one badge the amendment names as owed
(§5 of the amendment) plus the four success sentences #749 asks for. This
changes nothing about what is asked of this document — the copy is still the
owner's to choose — but it means every fact cited below about what the code
does today was read from the merged implementation, not from a proposal.

---

## 1. The voice, read from twenty-odd sentences already in the file

Read in `src/content/default-locale-en.ts`, mostly the `hud.alert.refusal.*`,
`hud.refusal.*` and `hud.alert.event.*` blocks (`:243`–`:1104`). What holds
across nearly all of them:

- **One shape: "[what happened, stated flatly] — [why, or how much]."** One
  em dash, one clause on each side, a full stop at the end. "Nobody was
  hired — that would go past what the state will carry."
  (`:358`). "Nothing was removed — there is no object on that tile, and none
  being built there." (`:389`). The neutral, non-refusal sentences keep the
  same shape: "{count} released — their sentences are served." (`:511`),
  "Payday went unpaid — your staff are owed {total}." (`:512`).
- **The left clause is always "Nobody/Nothing/The X was not Yed," never a
  second-person imperative.** No sentence anywhere in the file says "you
  cannot" or "you must." The prison is the subject; the player is never
  addressed directly.
- **Money is a bare grouped number with no currency symbol**, per `:173`'s
  own comment ("Funds names no currency on purpose"), and the word that says
  what kind of figure it is sits beside the number rather than fused to it:
  "{total} a day" (`:994`), "{total} back" (`:780`), "your staff are owed
  {total}" (`:512`).
- **A refusal names the rule or the consequence a player can act on, never
  the mechanism.** "That would go past what the state will carry" — not
  "the treasury refused the spend." "This room type must be enclosed" — not
  "the zone gesture failed a topology check."
- **Nothing here promises what the code cannot keep.** The incident block's
  own comment states the constraint in words worth repeating: "they must not
  promise a response... None of these says what happens next" (`:547`–`552`).
  This is the load-bearing constraint on every "success" sentence drafted
  below for #749 too — a sentence that implies a control will always do the
  same thing when the code branches on state must not be written as if it
  does not.
- **The owner has broken this voice before, on purpose, for sentences ruled
  on individually** — the contraband colon ("Contraband found: {item}.",
  `:633`), the relocation notice with no em dash (`:535`), the escape
  sentence (`:598`). Each is marked "reproduced exactly" and each is a case
  where the owner supplied the exact words rather than an agent matching the
  house style. So the voice above is strong but not a fence: if the owner
  writes something in a different shape, the house style yields to it, as it
  already has three times.

**Conclusion stated plainly so it can be disagreed with:** the default voice
here is dry, third-person, unit-of-money-bare, one-em-dash, no-promises. Every
candidate below is written to that voice unless marked otherwise. If the owner
wants a warmer or more explanatory voice for either ruling, that is a
different premise than "which words," and worth saying so rather than
silently overridden by a wording choice.

---

## 2. The two surfaces, measured, because they take different lengths of sentence

Three surfaces carry these sentences, and they are not the same size.

### 2a. The alerts log — 88 pixels wide, wraps at ten characters a line

`docs/research/2026-09-01-playing-after-the-rulings.md` §D1 (and its §5) is
the measurement: the alerts log's label column (`.hud-alerts__list
.ui-row__label`) is **88×165px at every desktop viewport measured — 1920,
1280×800, 1280×720, and 900×600 — because the row is a fixed-width corner
region that does not widen.** At 13px font that is about ten characters a
line; the 109-character `zone.not-enclosed` sentence fills **eleven** line
boxes there. `hud.alert.refusal.hire.insufficient-funds` and
`hud.alert.refusal.purchase.insufficient-funds` are two of the four keys
ruling 19 makes false, and **both render into this column**, confirmed by
`src/ui/simulation-alerts.ts`'s `REFUSAL_LABEL_KEYS` table, which is what maps
a worker `RefusalReason` onto exactly one `hud.alert.refusal.*` key rendered
into that list. A 60-character sentence here is already six lines; nothing
proposed below should be written without checking this table.

### 2b. The refusal band (`.hud__refusal`) and the events band (`.hud__event`) — full width, one line, wraps rather than truncates

`hud.refusal.purchase-materials-past-floor` and `hud.refusal.hire-staff-past-floor`
render only into `.hud__refusal` (confirmed:
`docs/research/2026-09-01-playing-after-the-rulings.md:204`, "A host refusal
writes `.hud__refusal` and leaves the alerts log untouched"), and that band is
the full viewport width — measured `width: 1280` at 1280×800 and `width: 1920`
at 1920×1080 in `docs/research/2026-08-31-playing-the-twelve.md` §9, holding an
84-character sentence on one visible line. `src/ui/hud/hud.css:502` sets
`.hud-refusal__text { white-space: normal }` — it wraps rather than
truncates, so nothing here is ever cut, only made taller at narrow widths. The
neighbouring `.hud__event` band (`hud.css:562`) is the same shape, `grid-area:
event`, toned by `data-severity` ('info'/'warning') rather than always red.
**This is the generous surface**: a sentence in the 60–90 character range that
would be unreadable in the alerts log's 88px column reads as one ordinary line
here at every desktop width this pass has measurements for.

**The consequence for task 1:** the two `hud.alert.refusal.*` keys and their
`hud.refusal.*-past-floor` twins are required by ruling 23 ("the same words as
the host") to carry **identical text**, and that text has to work in *both*
places — the cramped 88px column and the generous full-width band. The binding
constraint is therefore the narrower surface. Nothing proposed for those four
keys below should be materially longer than what is already there (54–68
characters; the incumbent pair is 64 and 66).

### 2c. The funds chip's `{remaining} left` badge — no pixel measurement exists for it

`hud.css:2865` measures the `FUNDS` **value** chip (85.8px at a balance of 0,
110.2px at seven figures), but no research pass in this repository has
measured the `{remaining} left` sub-badge under it. It sits beside a value
chip in a nine-chip row that already overflows at some widths (D9 in the
playtest doc, `docs/research/2026-09-01-playing-after-the-rulings.md`), so the
honest position is: **the only proven-safe length is what is already there**
("1,250 left" is 10 characters), and any candidate materially longer than that
is unmeasured and should get the same treatment D1 gave the alerts log before
it ships.

---

## 3. What the ruling makes false, and nobody has flagged all of it yet

The brief names four sentences and one badge. Reading ADR 0017's amendment
(§5, "What a player is told at each rung") and the merged code together turns
up two more:

1. **Rung 2 — construction halted below −2,000 — has no sentence of its own
   at all**, and this is *not* an oversight this document is inventing:
   `docs/adr/0017-money-primary-resource-model.md:638` states it directly ("A
   halted construction queue reports `hud.alert.refusal.purchase.insufficient-funds`
   through `reportMaterialsFunding`, which is rung 1's sentence on rung 2's
   event"). Verified against the code: `JustInTimeMaterialsService`
   (`src/simulation/economy/just-in-time-materials.ts:557`) calls
   `this.treasury.canAfford(orderCostMinorUnits, 'construction')` — correctly
   rung-aware — and on refusal, `reportMaterialsFunding`
   (`src/simulation/construction/handler.ts:248`) writes the same
   `insufficient-funds` `RefusalReason` that a Buy-press refusal writes, which
   `REFUSAL_LABEL_KEYS` maps to the identical alert key regardless of which
   rung actually fired. So a prison at −1,800 gets `hud.alert.refusal.purchase.insufficient-funds`
   for a stalled build queue, saying "that would go past what the state will
   carry" — which at −1,800 is off by 200, in the *other* direction from the
   brief's four keys (those are wrong because they under-state how much room
   is left; this one, if it existed with the same words, would be
   mis-attributed to the wrong rung's boundary). **A candidate set is drafted
   for it below (§4c)** even though the brief's list stops at four, because the
   ADR the brief itself points to names this as owed.
2. **The funds chip's tone (`warning`/`danger`), not only its number, is
   computed against the wrong floor.** `overdraftTone`
   (`src/ui/hud/projection.ts:446`) and `overdraftRemaining` (`:408`) both
   read `counts.treasuryOverdraftFloorMinorUnits` — the whole −2,500 floor —
   so a prison at −1,300, which has *already* had a delivery and a hire
   refused, still shows `warning` (amber) with "1,200 left," which reads as
   headroom the prison does not have. The brief only asked for the badge's
   *words*; the badge's *colour* is wrong for the same reason and needs the
   same re-basing. This is a code fix, not a copy one, and is named here so it
   is not lost.
3. **`hud.build.remove-hint` (`:697`) is already known to be false, and is
   already flagged in the merge that made it false** — "One still being built
   is cancelled and its materials come back" is exactly what #746 (`098b3a18`)
   supersedes for `planned`/`approved`/`materials-pending`/`assigned` orders
   (money now, not materials) and reverses entirely for `in-progress` (nothing
   comes back). The commit message says so itself: *"Copy left byte-for-byte
   and flagged: `hud.build.remove-hint` names the wrong currency and has no
   clause for the case where nothing comes back."* This key is not in either
   ruling's named list, but it is the same fourth-exclusion gap and belongs on
   the owner's list of sentences to choose new words for. **Not drafted with
   candidates below** — it was not asked for and this document does not want
   to smuggle a third ruling's copy in under two — but it should not stay
   unnoticed a second time.
4. **The worker's refusal channel (`RefusalLog`) carries no payload at
   all.** `src/content/default-locale-en.ts:274`–`277` states this for a
   different key ("No id in the sentence. The refusal channel carries no
   coordinates, order id or definition id") and it is true of every
   `hud.alert.refusal.*` sentence, including the two ruling 19 breaks. This
   bounds what §4's candidates can honestly offer: **no candidate for the two
   `hud.alert.refusal.*` keys can interpolate a live number**, because there
   is nothing on the wire to interpolate. A candidate that names −1,250 has to
   bake it into the string as static text, not as `{threshold}` — which is a
   real cost (§4b explains it) and not available to fix by choosing different
   words.

---

## 4. Ruling 19's sentences: the insolvency ladder's rungs

### 4a. The constraint that shapes every candidate here

Four keys, and ruling 23 pairs them: `hud.alert.refusal.hire.insufficient-funds`
must read identically to `hud.refusal.hire-staff-past-floor`, and
`hud.alert.refusal.purchase.insufficient-funds` identically to
`hud.refusal.purchase-materials-past-floor` (`tests/unit/ui-simulation-alerts.test.ts`
pins this, per the comment at `:341`–`343`). That means:

- Whatever is chosen for "purchase" has to survive the 88px alerts-log column
  (§2a) **and** read well as one line in the full-width band (§2b) —
  simultaneously, because it is the same string in both places.
- **No candidate can interpolate the live threshold or the live balance**,
  because `RefusalLog` carries none of it (§3, point 4). A number can only
  appear as a hard-coded literal in the string.
- A hard-coded literal is a second copy of a constant that already lives at
  `INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS = -1_250` and
  `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS = -2_000`
  (`src/simulation/economy/treasury.ts:409`, `:351`), with no test tying the
  *prose* to the constant the way `tests/foundation/localization-key-completeness.test.ts`
  ties keys to reasons. If a future ruling moves either number, a candidate
  that spells it out goes stale silently — which is exactly the failure mode
  ruling 19 exists to correct. This is stated once here rather than repeated
  under every numbered candidate below.

### 4b. `purchase.insufficient-funds` / `purchase-materials-past-floor` (deliveries rung, −1,250)

Incumbent, byte-for-byte and left untouched by the amendment: *"Nothing was
bought — that would go past what the state will carry."* (66 characters).

| # | Candidate | Chars | What it commits the code to | What it costs |
| --- | --- | --- | --- | --- |
| P1 | "Nothing was bought — the state will not pay past −1,250." | 58 | A hard-coded literal now correct for rung 1 only; goes stale if the constant ever moves (§4a). Names the number, so a curious player can correlate it against the Funds chip. | 6 lines in the 88px column at ~10 chars/line (vs. 7 for the incumbent) — no worse than what ships today. Reads as one line in the band. |
| P2 | "Nothing was bought — deliveries are refused until the state pays what it owes." | 80 | Nothing numeric to go stale. Commits to "deliveries" as the word for what stops, which has to agree with whatever word rung 2's sentence uses for construction (§4c) or the two will read as unrelated rules rather than one ladder. | 8 lines in the 88px column — noticeably worse than the incumbent's 7, and this is the narrower surface's binding constraint. |
| P3 | "Nothing was bought — the state cannot carry this purchase right now." | 70 | Commits to nothing false at any rung — it is true at −1,250 and at −2,500 alike, so it never needs to be revisited if the thresholds move. Costs the specificity the ADR's own framing (name the rung) seems to want. | 7 lines, same as the incumbent. Safest against future drift; least informative about *why*. |

### 4c. `hire.insufficient-funds` / `hire-staff-past-floor` (hiring, sharing the deliveries threshold)

Incumbent: *"Nobody was hired — that would go past what the state will
carry."* (64 characters). Note from `treasury.ts:315`: hiring is **not** one
of ruling 19's three named rungs — it takes the shallowest rung's threshold
by construction (`INSOLVENCY_RUNG_FLOORS_MINOR_UNITS.hiring =
INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS`), and whether it deserves a rung
of its own is explicitly left to the owner (ADR 0017 amendment §4). A
candidate that calls −1,250 "the deliveries threshold" would be naming a rung
hiring is not actually on; the candidates below avoid that.

| # | Candidate | Chars | What it commits the code to | What it costs |
| --- | --- | --- | --- | --- |
| H1 | "Nobody was hired — the state will not pay past −1,250." | 56 | Same hard-coded-literal risk as P1. Correct today because hiring shares rung 1's threshold; would need rewording (not just the number) if hiring ever gets its own rung. | 6 lines in the 88px column, one better than the incumbent's 7. |
| H2 | "Nobody was hired — hiring is refused until the state pays what it owes." | 73 | Names hiring as its own thing rather than borrowing "deliveries," which is honest about §4c's finding that hiring has no rung of its own yet — but reads as if hiring *has* a named rule when it is really riding rung 1's coattails. | 8 lines — same cost as P2. |
| H3 | "Nobody was hired — the state cannot carry this hire right now." | 65 | Same as P3's argument: true at every rung, never needs revisiting. | 7 lines, same as incumbent. |

### 4d. Rung 2 — construction halted below −2,000 — a sentence that does not exist yet

No incumbent; today this event silently reuses P-whatever-is-chosen-for-rung-1
(§3, point 1). **This needs a new `RefusalReason` member and a new
`REFUSAL_LABEL_KEYS` entry to exist as a distinct sentence at all** —
`reportMaterialsFunding` currently writes the same `insufficient-funds` reason
regardless of which `SpendClass` refused, so today's code has no way to *tell*
the alerts list this was rung 2 rather than rung 1. That is implementation
work beyond copy, named here because the brief's own cited source (the ADR)
calls it owed and this document would be incomplete pretending otherwise.

| # | Candidate | Chars | What it commits the code to | What it costs |
| --- | --- | --- | --- | --- |
| C1 | "The build queue is stalled — the state will not pay past −2,000." | 67 | Same hard-coded-literal risk as P1/H1, at rung 2's constant. Needs the new reason plumbing above to ever fire. | 7 lines. |
| C2 | "The build queue is stalled — no more materials until the state pays what it owes." | 83 | Pairs naturally with P2's "deliveries are refused" if that pairing is chosen — same subject, same shape, two rungs read as one ladder. | 9 lines — the longest of any candidate in this document for the narrow surface. |
| C3 | "The build queue is stalled — the state cannot carry this delivery right now." | 79 | True at any threshold. Note: reuses "delivery," which is the word ADR 0017 amendment §3c uses to distinguish rung 1 (a player's *delivery*, i.e. a Buy press) from rung 2 (the queue's own material spend) — so this wording risks a player reading rung 2's stall as rung 1's, which is the exact confusion the amendment's whole §3c split exists to prevent. **Not recommended as worded**; kept in the table to show why the distinction matters. | 8 lines. |

### 4e. The funds chip's `{remaining} left` badge

The words are not what is wrong today — `hud.status.funds-remaining` already
says "{remaining} left" with no claim about *which* rung the remainder
protects, so the sentence is not false in the way the four refusal keys are.
**What is wrong is the number**, computed at `src/ui/hud/projection.ts:408`
against `counts.treasuryOverdraftFloorMinorUnits` (the whole −2,500 floor)
rather than against `HOST_PRESS_FLOOR_MINOR_UNITS` (`src/ui/affordability.ts:152`,
already correctly −1,250 for the host's own pre-flight check). Re-basing that
arithmetic is a code change, not a copy one, and this document cannot ship it.
What follows are candidates for whether the *words* should change once the
number is fixed, and the badge's total absence of a prior width measurement
(§2c) is the reason none of these is recommended over the others without a
fresh D1-style pass.

| # | Candidate | Chars (template) | What it commits the code to | What it costs |
| --- | --- | --- | --- | --- |
| B1 | "{remaining} left" (unchanged) | 16 | Nothing new — once the arithmetic is re-based to the deliveries rung, this sentence becomes true again with zero wording risk. Says nothing about *which* rung the remainder is room to, so a player at −1,900 (past rung 1, not yet at rung 2) sees "0 left" and has no way to tell from the badge alone that construction can still spend. | Proven-safe length; the only one of the three with a real precedent (10 chars rendered today). |
| B2 | "{remaining} left before deliveries stop" | 39 | Names exactly what the number protects, which is accurate once re-based (the shallowest rung is always deliveries). Commits to never changing which rung is shallowest — true today, not guaranteed by any test. | +23 characters over the incumbent with **no measurement anywhere in this repository** of whether that fits the badge; this is the candidate D1's method should be pointed at before it ships. |
| B3 | "{remaining} to spend" | 20 | Drops "left"'s implication of a running-out countdown in favour of a flatter fact. Says nothing about which rung, same gap as B1. | +9 characters over the incumbent; shorter than B2, still unmeasured. |

---

## 5. #749's four sentences: what a control says when it succeeds

### 5a. What data each control actually has, checked at the call site rather than assumed

| control | command | refund amount reachable today? | state reachable today? |
| --- | --- | --- | --- |
| Cancel (queued build order) | `CancelBuildOrder` | **No.** `ConstructionSystem.cancelOrder(id: string): void` (`src/simulation/construction/system.ts:653`) returns nothing; the refund happens inside the method and is never handed back to the caller. Surfacing it needs a return-value change, which is code beyond copy. | **Yes.** The order's `state` is read by the handler before `cancelOrder` is called (`src/simulation/construction/handler.ts:95`), and the queue view model already carries `state` per row (`src/ui/simulation-build-queue.ts:121`). A state-aware pair of sentences (refundable vs. not) is reachable with no new plumbing; a *specific amount* is not. |
| Cancel (a pending delivery) | `CancelMaterialPurchase` | **Yes.** `ProcurementSystem.cancel(orderId): PurchaseCancelOutcome` (`src/simulation/economy/procurement.ts:261`–`266`) returns `{ ok: true, refundedMinorUnits: delivery.paidMinorUnits }` today. The number already exists at the call site; wiring it into a sentence is a smaller change than any of the other three controls need. | N/A — a delivery is binary: pending or not (the refusal for the other case, `hud.alert.refusal.cancel-purchase.not-pending`, already exists). |
| Undo | `Undo` | **No.** No `UndoApplied`/`RedoApplied` event or return payload exists anywhere in the protocol (`grep -rn 'UndoApplied\|RedoApplied' src/simulation/protocol/` returns nothing). `ConstructionSystem.undo` groups a whole transaction of order ids (`redoTransaction.push(orderId)`, `system.ts:551`) — a *count* of orders reversed could in principle be surfaced, but nothing does today. | N/A |
| Redo | `Redo` | Same as Undo — no payload. | N/A |

This asymmetry is the central fact for §5b–5e: **a candidate that names a
refund amount is honest and cheap for the delivery-cancel, state-aware but not
amount-aware for the build-order cancel without new plumbing, and entirely out
of reach for Undo and Redo without new protocol work.**

### 5b. Where the sentence lands, and what that costs

The brief quotes the owner: "a sentence in the band on every success — the
same surface the refusals use." Read literally that is `.hud__refusal`
(`hud.css:502`), which today is **permanently red** ("Both of those are
permanently red because everything they can say is bad," `hud.css:548`
describing `.hud__refusal` and `.hud__unavailable`) and cleared only when "the
same action kind" next succeeds (`hud.ts:1253`, `clearRefusal(intent.kind)`).
Painting a success sentence in a permanently-red band is a real design
question this document cannot resolve and flags at §6 Q1. The width itself is
not the constraint here — §2b showed the band comfortably holds an
84-character sentence on one line at every desktop width measured — so every
candidate below is written to that budget rather than the alerts log's.

### 5c. Cancel (a queued build order)

Given §5a, the amount is not reachable without new code; the state (before vs.
after the crew starts) is. Candidates below are grouped by whether they lean
on that state distinction.

| # | Candidate | Chars | What it commits the code to | What it costs |
| --- | --- | --- | --- | --- |
| CO1 | "The order was cancelled." | 25 | Nothing false at any state — it is the one sentence guaranteed true regardless of what #746 returns. Says nothing about money at all, which under-uses the one fact (state) that is actually cheap to read. | Shortest possible; one line at any width, no wrapping risk. |
| CO2 | "The order was cancelled — the money it cost is refunded where any is still recoverable." | 90 | Honest across all five cancellable states without lying: "where any is still recoverable" is true (vacuously, at zero) for `planned` and explicitly false-covering for `in-progress`, where ruling 20 destroys the value on purpose. Needs no new return value — only the state check the handler already performs. | Long for a single line (90 chars); reads as hedging rather than as information, and does not say *how much*, which is the thing a player pressing Cancel actually wants to know. |
| CO3 | "The order was cancelled. Anything already spent past the point of no return stays spent." | 91 | Same honesty property as CO2, phrased to teach the mechanic (crew-started = no refund) rather than hedge around it. Riskier if the owner does not want the sentence to *explain* the rule rather than just report the outcome — that is closer to documentation than to the terse incumbent voice (§1). | Longest of the three; also the one most likely to need trimming once actually laid out. |

**A fourth option not tabled as a single candidate, because it is a different
shape of answer:** a state-aware *pair* — one sentence for
`planned`/`approved`/`materials-pending`/`assigned` (money back), a different
one for `in-progress` (nothing back) — costs nothing more in code than CO2/CO3
already assume (the state is already read), and would let each sentence be
short and unhedged instead of one long hedge covering both cases. Whether the
owner wants one sentence or two is Q2 at §6.

### 5d. Cancel (a pending delivery)

The only one of the four where an amount is already sitting at the call site,
unused (§5a). `hud.build.delivery` already renders `'{count} × {material} ·
{total} back'` per row (`:780`), so a player who presses Cancel there has
already read what pressing it would return before pressing it — the success
sentence's job is to confirm it happened, and naming the figure again is
optional rather than load-bearing.

| # | Candidate | Chars (template) | What it commits the code to | What it costs |
| --- | --- | --- | --- | --- |
| CD1 | "The delivery was cancelled — {total} back." | 43 | Cheapest of any amount-naming candidate in this document: `refundedMinorUnits` already exists at the call site (`procurement.ts:266`), so this is close to a pure wiring task. Matches the existing row's own "{total} back" vocabulary (`:780`) exactly. | With a realistic `{total}` (e.g. "1,250"), renders around 44 characters — comfortably one line in the band. |
| CD2 | "The delivery was cancelled, and {total} is back in the funds." | 62 | Same reachability as CD1, more words for the same fact. | Longer for no added truth; the plainer CD1 already says everything this does. |
| CD3 | "The delivery was cancelled." | 28 | True unconditionally, uses none of the data that is sitting there for free. | Shortest, but throws away the one piece of information this control's success sentence could cheaply carry that none of the other three can. |

### 5e. Undo and Redo

No payload exists for either (§5a), and both are scoped to construction
history only — `HudHistoryDirection` (`hud.ts:289`) and `ConstructionSystem`'s
undo/redo stacks are about build orders, not a general action log, per
`queue-more`'s own hint: *"undo takes back a whole run"* (`:750`). So a
candidate naming *what* was undone beyond "the build queue" would be
overclaiming; a candidate naming *how many* orders (a "run" can be more than
one) would need the transaction-size plumbing `redoTransaction` already groups
internally but nothing surfaces (`system.ts:551`).

| # | Candidate (Undo) | Candidate (Redo) | Chars | What it commits the code to | What it costs |
| --- | --- | --- | --- | --- | --- |
| UR1 | "The last build order was undone." | "The last build order was redone." | 33/33 | Assumes the reversed transaction is a single order. **False when a run of several was undone at once** — `queue-more`'s own copy already admits this can happen — so this candidate is honest only if the owner accepts "last order" as shorthand for "last group," or if Undo is changed to report a count. | Short, reads naturally; the singular is the risk. |
| UR2 | "Undone." / "Redone." | | 7/7 | Commits to nothing about scope, so it cannot be caught out by a multi-order run. Matches the terseness of `hud.clock.paused` ("PAUSED") more than the em-dash sentences elsewhere in the file — a real voice departure (§1), not a neutral choice. | Shortest possible; least informative; arguably too curt against the file's own convention of a full sentence for every other player-facing outcome. |
| UR3 | "The last change to the build queue was undone." | "...was redone." | 48/48 | Same singular-vs-plural risk as UR1, softened slightly by "change" rather than "order" (a change could cover a run without technically lying, but does not confirm it either way — it is vague rather than honest). | Longest of the three; still one line in the band. |

**Whether Redo should be the mechanical mirror of Undo (UR1/UR2/UR3 as
tabled) or its own sentence is Q4 at §6** — nothing in the code or the
existing copy answers it, and the two controls are symmetric in the protocol
(`case 'undo'` / `case 'redo'`, `main.ts:2038`–`2043`) but nothing requires
their sentences to be.

---

## 6. Questions the owner has to answer before any of the above can ship

Grouped so each can be put as a single clickable choice.

**Q1 — Ruling 19's rungs: name the number, name what stops, or say neither?**
(§4b–4d) Three shapes are on the table for all three refusal sentences at
once — the rungs should almost certainly share one shape, not three different
ones. Naming the number (P1/H1/C1) is the most literal reading of "the chip
and the sentences must name the rung," costs the least in the 88px column, and
carries the silent-staleness risk of a hard-coded constant with no test tying
it to the prose. Naming what stops (P2/H2/C2) needs no number and ages better,
but is the longest option in the narrowest surface. Naming neither (P3/H3/C3)
never goes stale and never needs the ADR's own framing satisfied at all —
worth asking whether that undershoots what "name the rung" was asking for.

**Q2 — Should the two `hud.alert.refusal.*` keys, which cannot carry a number
at all (§3 point 4, §4a), diverge from their `hud.refusal.*-past-floor`
twins**, which theoretically could via the host's own `AffordabilityVerdict.spendableMinorUnits`
(`src/ui/affordability.ts:88`)? Ruling 23 says the same words on both sides;
this document assumes that survives ruling 19 unless told otherwise, which is
why every 4b–4d candidate above is number-static rather than number-live —
but the host *could* be given a live figure where the worker cannot, and if
the owner wants that asymmetry, ruling 23 needs a second amendment before any
of §4's candidates should ship as identical pairs.

**Q3 — Does rung 2 (construction halted) get its own sentence at all** (§4d),
given that shipping one needs a new `RefusalReason` and a new
`REFUSAL_LABEL_KEYS` entry — code, not only copy — or does the owner accept
that a stalled build queue keeps borrowing rung 1's words until a later pass
does that plumbing?

**Q4 — For #749, is the cancel-build-order success sentence one sentence for
every state, or two** — before vs. after the crew starts (§5c)? The state is
already read by the handler; only the wording decision is outstanding.

**Q5 — Does the delivery-cancel success sentence name the refunded amount**
(CD1/CD2, cheap and already at the call site) **or stay generic** (CD3, safest
and least informative)? This is the one success sentence among the four where
naming a number costs almost nothing, which makes "why not" worth asking
explicitly rather than defaulting to the file's existing terseness.

**Q6 — Is Redo its own sentence or Undo's mechanical mirror** (§5e), and
should either name a count of orders reversed (needing new plumbing on
`redoTransaction`) or stay silent about scope, accepting the small dishonesty
UR1/UR3 both carry when a run of more than one order is reversed at once?

**Q7 — Literally which band?** (§5b) "The same surface the refusals use" is
`.hud__refusal`, which is permanently red today and clears only when the same
*kind* of action next succeeds. A success sentence painted in a red band, or a
success sentence that silently displaces the last *refusal* the moment the
next Undo succeeds, are both live readings of the owner's sentence and this
document does not think the code settles which was meant — `.hud__event`
already exists, already carries `data-severity='info'`, and already exists for
exactly the "the prison did something, and it is not bad news" case. Whether
#749's four sentences belong there instead of in `.hud__refusal` is worth
asking before any of them is wired.

---

## 7. The weakest claims here, and what would change my mind

- **That the badge's tone (§3, point 2) is a real defect and not a deliberate
  choice** rests on reading `overdraftTone`'s intent from its own docblock
  ("`warning` while it is under water with room left") against the fact that
  "room left" is no longer true of every rung once ruling 19 shipped. If the
  owner considers the badge's tone a coarser signal on purpose — "any
  overdraft at all is a warning, regardless of which specific spend it would
  next refuse" — this finding evaporates and only the number is wrong.
- **That "hire" borrowing rung 1's threshold makes H1's hard-coded −1,250
  correct today** rests on `INSOLVENCY_RUNG_FLOORS_MINOR_UNITS.hiring` still
  equalling `INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS` at `treasury.ts:381`
  when this was read. If a hiring-specific rung lands before this document's
  candidates are chosen, H1 needs re-checking against whatever that rung's
  magnitude turns out to be.
- **That the funds badge has no prior width measurement (§2c, §4e)** is an
  absence claim — the strongest form would be a fresh D1-style Playwright pass
  measuring `.hud-strip__metrics [data-badge]` or whatever its actual selector
  turns out to be, which this document did not run (`AGENTS.md`: no Playwright
  on this branch, another agent holds the browser).
- **That Undo and Redo are scoped to construction only** rests on
  `HudHistoryDirection`'s docblock and `ConstructionSystem`'s undo/redo stacks
  being the only implementation either command reaches — verified by grep, not
  by exhaustively reading every command handler this repository has. If a
  zoning or staffing undo exists somewhere this pass did not find, UR1/UR3's
  "build order"/"build queue" wording would be wrong for that path too.
