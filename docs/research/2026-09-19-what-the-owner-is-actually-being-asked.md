# 2026-09-19 — what the owner is actually being asked, on a list of six

A survey done today reported that six open issues are buildable except that each
waits on an owner ruling, and that nobody had put those rulings in a form the
owner could answer quickly. This pass prices them.

**Taken on `f1a61702`** (`origin/main`, v0.0.688). Per this directory's rule,
this record is not re-anchored when the code moves on: when it does, nothing
here becomes wrong, it becomes older.

**Nothing here decides anything, no ADR `Status` line is moved or proposed, and
no player-visible sentence is authored.** Where an option implies one, its
*shape* is described and the wording is named as downstream of the ruling.

**Two of the six do not belong on the list, and one of the two is finished
code.** They are struck in §4 with the evidence, rather than omitted.

---

## 0. The list, in the order it is cheapest to rule on

| # | The question, in one sentence | Whose | Where |
| --- | --- | --- | --- |
| **#894 + #985** | A refusal band, once raised, stands for the rest of the session and costs the rail **35 px** (53 px on a phone) for as long as it does. Does it get a lifetime, a dismiss, or neither? | **owner** — it reopens a decision ADR 0084 declined and touches ADR 0091's ruled rule | §1 |
| **#1294** | A pooled list in a **bottom-anchored** rail moves its own rows when its drawn row count changes, so a control lands on the pixel another control was on. Which of three fixes? | **ours to propose, owner's to accept** — an ADR across four shipped blocks | §2 |
| **#933** | The one instruction a newcomer gets names **one** of a Cell's four requirements. The sentence is the owner's own ruled wording of 2026-09-03. Add beside it, or edit it? | **split** — adding is ours; editing needs a fresh ruling | §3 |
| ~~#930~~ | struck — the reader was built on 2026-09-17 | — | §4.1 |
| ~~#1295~~ | struck — fixed on `main`, measured green here | — | §4.2 |

**One issue the sweep found that says it is the owner's and is not: #869.** See
§5.2. It is buildable today by an agent, and has been since 2026-09-04.

---

## 1. #894 and #985 are the same decision seen from two sides

**This is the finding that most changes the shape of the list, and it came out
of a measurement rather than a reading.** #894 is *"a refusal from tick 0 was
still on screen on day 9"*. #985 is *"any alerts band clips the Rooms panel at
900×600, and the band never expires"*. On this tree the **clip half of #985 is
empty** and its **permanence half is #894**.

### 1.1 What a refusal band costs, measured

Measured in a real Chromium on `f1a61702`, five viewports, through the drive
path `app-shell.spec.ts`'s #207 test uses — **no prison created**, Build tab,
coordinates section, submit — which refuses on the spot and raises
`.hud__refusal`. Read back: `getComputedStyle('.hud').gridTemplateRows`, the
band's own box, `.hud__rail`, `.hud__aside`, and every `.ui-panel__body`'s
`clientHeight` against its `scrollHeight`. Then re-read after **12 s**, past the
events band's own 8 000 ms ceiling.

| viewport | band | `.hud__rail` no band → band | `.hud__aside` | `.hud-rooms` body client/scroll, no band → band | any panel over? |
| --- | --- | --- | --- | --- | --- |
| 1440×900 | **35.00** | 819.31 → 784.31 | 204.83 → 196.08 | 535/535 → **509/509** | no |
| 1280×720 | **35.00** | 639.31 → 604.31 | 159.83 → 151.08 | 400/400 → **374/374** | no |
| 1024×768 | **35.00** | 687.31 → 652.31 | 171.83 → 163.08 | 436/436 → **410/410** | no |
| 900×600 | **35.00** | 519.31 → 484.31 | 129.83 → 121.08 | 318/318 → **292/292** | no |
| 375×812 | **53.00** | 650.31 → 597.31 | 162.58 → 149.33 | 401/401 → **361/361** | no |

All CSS px. The band lands in the `notice` grid row; the `event` and
`unavailable` rows measured **0 px** throughout, which confirms #985's own
2026-09-05 correction that an ordinary refusal raises `.hud__refusal` and never
`.hud__event`.

**Three things this settles.**

1. **The band costs more on a phone than anywhere else, and nobody had that
   number.** **53 px against 35** — the sentence wraps in the narrower column.
   As a share of the rail it is **8.1 %** at 375×812 against **4.3 %** at
   1440×900, so the viewport with the least room pays the most.
2. **It does not expire.** The `+12 s` reading is byte-identical to the
   `band` reading at every one of the five viewports — same
   `grid-template-rows`, same rail, same panel boxes. `EVENT_BAND_HOLD_CEILING_MS
   = 8_000` (`src/ui/hud/event-band-dwell.ts:140`) is real and does not reach
   this band, exactly as #998 recorded.
3. **Nothing clips.** `clientHeight === scrollHeight` in all **ten** readings,
   band up and band down. **#985's headline — an 18 px clip of the Rooms panel
   at 900×600 — does not reproduce.**

**The limit of that third claim, stated rather than left to be derived.** This
fixture has no prison, so the Rooms panel draws no `data-needs` rows, and
#985's own fixture is *two rooms unfinished*. That fixture was re-measured by
another pass on 2026-09-15 at `2559eb14` (`data-needs` 5: **431/431** without a
band, **421/421** with one) and did not clip either. So the clip is unreproduced
in two fixtures on two commits, and reproduced in none since the day it was
filed — but this pass measured only one of the two.

**Why it stopped clipping is not established here.** The 2026-09-15 pass offers
a hypothesis with the right sign and more than the right size — the `tabs` grid
row measured 0 px and the rail gained ~36.5 px when ADR 0112 decision 3 moved
navigation into the middle row — and explicitly declines to call it a cause
without a bisect. This pass adds nothing to that and does not need to: the
question the owner is being asked is about the band's **lifetime**, and the clip
was only ever the reason the lifetime got noticed.

### 1.2 What is actually left, and why it is the owner's

Two facts, both verified in code on this tree:

- **A refusal has no lifetime.** `RefusalLog.record` *"Records a refusal at
  `tick`, replacing whatever was last recorded"* (`refusal-log.ts:149`), and the
  log stores `tick` on every record while nothing in `src/` reads it. #894's
  own comment measured the consequence: a refusal recorded at tick 0 still
  standing at tick **20 740**, in-game day 9.
- **A refusal cannot be dismissed.** `src/ui/hud/hud.ts:689` states the rule and
  names the gap: *"Their dismissal is `docs/HUD_PROJECTIONS.md` gap 34, which
  ADR 0084 explicitly did not reopen."* ADR 0084 is **Accepted, 2026-09-01, all
  four decisions**, by the owner.

**And ADR 0091's ruling of 2026-09-16 does not reach the case #894 measured.**
Option F — *"a decided outcome of the SAME route retires the band"* — is built
and shipped (`hud.ts:1757`, `state-machine.ts:600`, `routeDecidedSince` on the
schema at `types.ts:1552`). It retires the band **when something further
happens on that route**. The day-9 case is one refusal followed by 20 740 quiet
ticks: nothing further happens, so option F never fires. #894's comment names
this and it is right — *"a ceiling retires it when nothing further happens"*,
and the two are complements rather than alternatives.

### 1.3 The options, each with what it costs

**Option A — leave it.** Zero code. Cost: the figures in §1.1 become the
accepted design — a single refusal spends **35 px of rail (53 on a phone) for
the rest of the session**, and the sentence a player was given at minute one is
still the sentence they are looking at on day 9. It also leaves standing the
reading of constitution article 6 that #985's comment raised and did not settle
(below).

**Option B — a hold ceiling on `.hud__refusal`, as `.hud__event` already has.**
The mechanism exists one module over and is the smallest of the three: an
8 000 ms ceiling (`event-band-dwell.ts:140`), an `expire` that drops the row
(`:312`), and a **`retired` ordinal** (`:188`, `:401`) that stops the same
sentence being re-raised. That last part is load-bearing rather than tidy: the
refusal is republished on the counts cadence **up to twice a second** with an
unchanged ordinal, so a naive expiry gives a 2 Hz flicker, not a release.

**Cost, and it is a real one rather than a caveat.** When the band lets go, the
refusal is not somewhere else. `RefusalLog` holds exactly one record, and the
alerts list *"contributes exactly one row or none"* from that channel
(`src/ui/simulation-alerts.ts:217`) — so a ceiling makes the sentence leave the
screen **with nothing behind it**. Against that,
`docs/design/2026-09-13-identity-v5/DOKUMENTACJA/konstytucja.md:35`, which
ADR 0112 decision 1 accepted as a product contract in the owner's own words:

> Ostrzeżenia nie znikają dlatego, że przyszło nowsze zdarzenie. **Historia
> zdarzeń pozostaje dostępna.**

("Warnings do not disappear because a newer event arrived. **The event history
stays available.**") Whether *"ostrzeżenia"* reaches a refusal is a reading of
the constitution and therefore the owner's; the code makes the literal reading
unusually easy to take, since every refusal row carries `severity: 'warning'`
and nothing else does.

**Option C — reopen gap 34 and give the row a dismiss.** This is #894's own
option 2: a local-only dismissal, the row leaving this thread's view with
nothing crossing the wire, on the precedent `hud.ts` already sets for a
dismissal made with no session. Cost: it reopens a decision **ADR 0084
explicitly declined**, and it puts two dismissal semantics in one region — the
alerts channel's rows cross the wire, this one would not. It does not touch the
permanence problem on its own: a player who never presses the control still has
the band on day 9.

**Option D — B and C together, plus a place for the sentence to go.** The
ceiling answers permanence, the dismiss answers agency, and article 6 is
answered by the refusal surviving in a list rather than only in the band. Cost:
it is the largest of the four, and it is the only one that needs the refusal
channel to buffer more than one record — which is a change to `RefusalLog`'s
stated design (*"It orders nothing. There is exactly one record"*,
`refusal-log.ts:86`) rather than an addition to it.

**Recommendation: option B, with the article 6 question answered explicitly in
the same ruling rather than left implied.** It is the option this repository
has already built once, for the sibling band, and it is the one that fixes what
was actually measured — a sentence outliving its situation by nine in-game days.
Option C is the expensive answer to a cheaper problem and reopens an accepted
ADR to do it. Option D is right if and only if article 6 binds a refusal, which
is exactly the half that is not ours; if it does, B alone is not enough and the
ruling should say so before anyone builds B.

**If the ruling is B or D, a player-visible string may be implied and it is not
authored here.** The shape would be *a line in the alerts list standing where
the band stood*, reusing the refusal's existing sentence rather than a new one;
whether any new words are needed at all is downstream of which option is chosen.

**What #985 keeps after this.** Its option 1 (bands overlay the world) and
option 2 (the grid reserves the band's height always) are untouched by §1.1 and
remain open — but the measurement moves them. Option 2's cost is now a number:
**35 px of rail at four viewports and 53 px at the fifth, permanently, at all
times**, bought in exchange for nothing, because the arrival of a band clips no
panel today. It is worth ruling on only if a clip comes back.

---

## 2. #1294 — a pooled list in a bottom-anchored rail

### 2.1 What is true on this tree

`assignPooledRows` closes the **binding** half of #860/#877 — a place names one
item for as long as that item is in the window. The invariant it states is
about a place **on screen**, and `.hud__side` carries `margin-top: auto`
(`src/ui/hud/hud.css:1176`, with the reason at `:1168`). The rail is anchored to
the **bottom**, so a block that changes height moves its own rows rather than
the space beneath them — and a pooled block's drawn row count changes exactly
when a place is held open.

**Verified live rather than assumed:** `src/ui/hud/pooled-row-binding.ts:92`
carries this in its own docblock, naming #1294 and dating it, and `:105` says
the module does not reach it. `tests/browser/ui-held-guards.spec.ts:274` records
the measurement in place of the assertion it cannot make.

**The measurements are #1294's own and are not re-taken here.** One held guard
whose hold ends as another is claimed: guard 9's Release box lands on **exactly**
the pixel guard 4's Release was on (690 → 690). Three held guards, one leaving:
602/656/711 → 599/651/706, i.e. **3–5 px** under a 44 px control. This pass
verified the structural premise and the code citations, not the pixels; that is
stated rather than smuggled.

### 2.2 The options, each with what it costs

**Option 1 — fill from the bottom.** Places become stable counted from the
anchor rather than from the top. Correct for the whole class in one move.
**Cost: it changes what `assignPooledRows` returns, or how every caller lays
rows out, and it reaches the two already-accepted blocks (#860's queue and
#877's roster) as well as the two in #1288.** That is four shipped surfaces and
their pinned specs, which is why the issue calls for an ADR.

**Option 2 — a held-open row holds its height as well as its box.** Closes the
**3–5 px** case, because a held row's sentence is two lines where a delivery
row's is one and blanking the label is what shrinks the block. **Does not close
the full-row case**, which is the one where a Release lands on exactly the pixel
another Release was on — the harm #877 exists to prevent. Cheapest, and it is a
partial answer that a reader could mistake for a whole one.

**Option 3 — the rail stops being bottom-anchored under a block drawing a
list.** Removes the cause rather than compensating for it. **Cost: it is a
`docs/VISUAL_IDENTITY.md` question**, not a HUD one — the bottom anchor is a
composition decision with a written reason at `hud.css:1168`, and it applies to
every tab, not to the two that draw pooled lists.

**Recommendation: option 1, written as an ADR that names the four blocks it
touches.** Option 2 buys the smaller half of a defect whose larger half is the
one #877 was filed for, and shipping it would leave a surface that looks fixed
and is not. Option 3 changes a composition rule to fix a list behaviour, which
is the wrong altitude.

**Which half is whose.** Writing the ADR and its measurements is **ours** under
the standing mandate — `AGENTS.md` asks for an ADR rather than a silent
decision, and asks agents to decide rather than to come back with a question.
**Accepting it is the owner's**, by the convention every ADR in this corpus
records in its own Status block. So the useful ask here is *"may this be
drafted?"* only if the owner wants to see it before the work; otherwise it needs
no ruling until the draft returns.

---

## 3. #933 — the first-cell instruction, and the line that runs through it

### 3.1 Four requirements, one named

`src/content/room-catalog.ts:152-157`, read on this tree:

```ts
{ schemaVersion: 1, id: 'room.cell', numericId: 1, nameKey: 'room.cell.name', category: 'housing', maxResidents: 2, requirements: [
  { type: 'enclosed' },
  { type: 'minimum-size', minWidth: 2, minHeight: 3, minTiles: 6 },
  { type: 'object', objectId: 'object.bed', minQuantity: 1 },
  { type: 'object', objectId: 'object.toilet', minQuantity: 1 },
] },
```

Four. The sentence a newcomer gets is `src/content/default-locale-en.ts:3223`:

> `'hud.regime.roster-empty': 'No prisoners yet. Build a cell with a bed to take somebody in.',`

It names the bed. Not the toilet, not the 2×3 minimum, not the enclosure.

### 3.2 The two things that changed since #933 was filed, both verified

**#933's blocker shipped.** #938 — a room with no doorway is accepted, counted
and dead — is **closed**, by PR #980 (*"A dead room says it is dead"*). So the
"teach around a defect" objection in #933's own comment is spent. The
requirement **vocabulary** is still four types
(`src/simulation/rooms/definition.ts:4`: `'minimum-size' | 'enclosed' |
'object' | 'outdoors'`), so a doorway is still required in practice and appears
in no requirement — but the readout now says so, which is the half that made
#933 unbuildable.

**The sentence is the owner's own, in their own words.** The locale file records
it at `:3165-3172`:

> **The owner ruled this sentence on 2026-09-03**, shown it among candidates and
> choosing it in their own words: *"No prisoners yet. Build a cell with a bed to
> take somebody in."*

The same block records what it replaced and why, per §4's mark-rather-than-
overwrite rule, and records that a second state got its own second sentence
(`hud.regime.roster-emptied`) later the same day rather than this one being
widened.

### 3.3 The distinction the owner is being asked to rule on, and it is narrow

The 2026-09-04 release makes the **choice of words** ours and leaves the
**truth** the owner's. A sentence the owner personally chose is a third thing,
and neither the release nor the reservation says which side it falls on. So:

**Option A — add, do not edit.** A second sentence, or a pointer to the
requirement block that already renders from the catalogue, placed beside the
ruled one and leaving it byte-identical. **This needs no ruling**: authoring the
words is ours since 2026-09-04, and the ruled sentence does not move. Cost: two
sentences where the owner ruled one, on a surface whose whole problem is that a
newcomer reads it once.

**Option B — edit the ruled sentence so it names all four.** Cleaner for the
player and it is the fix #933 actually asks for. **This needs a ruling**, because
the owner chose these exact words and the precedent set by editing them silently
is worse than the defect.

**Option C — neither: point at the block rather than restate the list.** #933's
own constraint is that *"the 2×3 minimum and the object list are catalogue data;
a hard-coded sentence drifts the moment the catalogue moves"*, and the
requirement block already renders from `room-catalog.ts`. A pointer is true for
as long as the catalogue is, which no restatement is. Cost: it is an extra hop
for a player who has just been told there are no prisoners, and #921 measured
that the Rooms panel **arrives selected on Staff Room**, so *"see the Rooms
panel"* is false until that is addressed.

**Recommendation: option B, and it is the reason this section exists.** A is
available today without asking and is the wrong shape — it answers a
completeness defect by adding a second sentence beside the incomplete one, which
is how a HUD ends up with two sentences that disagree. C is right about
catalogue drift and wrong about where the player is standing. **The narrow thing
the owner is being asked is not which words: it is whether a sentence they chose
by name may be replaced by one an agent writes under the 2026-09-04 release.**

**No replacement wording is proposed here.** Its shape would be *one sentence
that names the room and defers the requirement list to the block that renders
it*, verified against `room-catalog.ts:152-157` and quoted verbatim in the
commit and the pull request body, as the release requires. The words are
downstream of the ruling.

---

## 4. Two of the six do not belong on the list

### 4.1 #930 is answered — the reader was built on 2026-09-17

#930 is *"ADR 0087's standing conditions are computed, emitted and diffed on
every publication and read by nobody"*, and the survey characterised its residue
as *"paint it or delete it, still a design question"*. **It is neither, on this
tree.** `src/ui/simulation-conditions.ts` exists and is the reader:

- `PRISON_CONDITION_PRESENTATION` is `Readonly<Record<PrisonCondition,
  PrisonConditionPresentation>>` (`:59`) — exactly the shape #930 §3 asked for,
  and exactly the shape `REFUSAL_LABEL_KEYS` and `PROTOCOL_FAULT_LABEL_KEYS`
  have for their own unions.
- `isPostUnreachable(counts.conditions)` (`:79`) is called at
  `src/ui/simulation-counts.ts:152` and feeds `postUnreachable` into the view
  model. The field is read.
- The union has a **fifth** member, `'security.post-unreachable'`, added by
  **ADR 0117, accepted by the owner on 2026-09-17** — the one member not painted
  anywhere else, and the reason the module exists.

**Both halves of "paint it or delete it" are answered, and by the compiler
rather than by prose.** The four original members are `'painted-elsewhere'`, and
the module's docblock names the surface that makes each true — #930's own
2026-09-15 re-measurement, moved from a test's prose to a place the compiler
holds. A sixth member fails to compile until somebody decides where the player
is told about it.

#930's §2 — the transient notice deferring the player's figure to this channel
— was corrected on 2026-09-15, and the correction is at
`src/ui/simulation-events.ts:1268` on this tree, naming the issue in its first
words: *"**Corrected 2026-09-15 (issue #930).** These lines used to name …
`statusCountsSchema.conditions` as the channel holding the figure."* The figure
is re-attributed there to `overdraftRemaining` in `src/ui/hud/projection.ts`
— that comment's own pointer, quoted rather than re-derived — painted as
`{remaining} left` on the always-visible FUNDS chip.

**Recommendation: close #930.** Nothing in it is waiting on the owner. If
anything is owed it is a line in the issue saying where the reader landed.

### 4.2 #1295 is fixed on `main`, and this pass measured it green

#1295 is the composition of #1273 and #1280 into an unreachability at 900×600.
**Both PRs are merged** (`9e4944d6` and `3387b9f6`), so the composition is not a
prediction any more — it is `main`. And it was fixed there, in two commits, both
ancestors of `f1a61702`:

- `e2f22b44` — *"bound the regime editor so it cannot push the roster off the
  rail — **PARTIAL, 2 of 5 viewports**"*, whose own message says it is not
  finished and why: its 200 px was derived through the UI harness's fixtures
  rather than the assembled page.
- `4d8b00c5` — *"cap the regime editor in tap targets, measured on the assembled
  page"*, which introduces `--hud-regime-editor-ceiling`
  (`src/ui/tokens.css:821`, `3 * var(--tap-target)`; one tap target under the
  existing `@media (max-height: 700px)` at `hud.css:3522`).

**Measured here rather than taken from those messages.** `npx playwright test -c
tests/browser/playwright.config.ts -g "every control can actually be pressed"`
on `f1a61702`:

```
  5 passed (4.3m)
```

All five viewports of `every control can actually be pressed, on every tab at
{w}x{h} (#88)` — which is the sweep that carries `controls covered by something
else with the regime editor open at {w}x{h}` and was red at three of the five on
`e2f22b44`.

**So the question #1295 named as not-ours — *"whether 900×600 and 1280×720
should keep a usable roster beside an open editor at all"* — has been answered
by implementation rather than by ruling.** The answer shipped is: the editor is
capped, the roster keeps its header. That is worth the owner knowing, because it
is a playability decision taken under the standing mandate rather than put to
them, and `4d8b00c5`'s message argues it on measurement — the rejected
alternative (`flex: 0 1 auto` with the list absorbing) reaches all five
viewports too and was declined on what its floor costs: **3.9 px** from clipping
the timetable at 900×600 with the editor collapsed.

**Recommendation: close #1295**, with its merge-order consequences confirmed
spent. Nothing in it is waiting on the owner.

---

## 5. The sweep

### 5.1 Method, and what it is a statement about

**104 open issues.** This pass did not read 104 bodies. It read the six in the
brief in full, with every comment; ranked the remaining 98 by title for the
shape *"buildable, blocked on a ruling"*; and read **eight** in full: #869,
#540, #938 (closed, read as #933's blocker), #1149, #1273's PR body, plus the
three already named. **So this is a sample and not a census**, and it is the
same limitation `docs/AGENT_WORKFLOW.md` §4 names — a pass reporting a clean
result has reported on what its filter found.

A mechanical route was tried and failed: a semantic search for issues *"blocked
on a decision only the repository owner can make"* returned **zero** results
over this repository, which is a statement about the search index and not about
the issues.

### 5.2 #869 says it is the owner's and is not — and the date is the whole point

**The strongest thing the sweep found, and it points the opposite way from the
brief.** #869 — *"A refused Admit tells the player nothing"* — has a title that
says *"the sentence it needs is owed by the owner"* and a correction comment by
its own filer that re-classifies it: *"**Re-classified: blocked on a sentence
the owner owes, not an ordinary fix.** No agent should take it."*

That comment is dated **2026-09-03**. The owner released the choice of words on
**2026-09-04**, in the two sentences `AGENTS.md` records — *"Sam decyduj
zawsze…"* and *"Wybierz sam a potem się ujednolici sposób pisania"*. **#869 was
owner-blocked for one day and has been ours for fifteen.**

Its three steps are all inside the release: add a member to `HostRefusalReason`,
map it to a message key in `src/ui/hud/projection.ts`, author the sentence. The
truth requirement is not waived and is easy to meet here — the condition is
already computed, since `hud.intake.hint` states it before the press.

**Nothing is being asked of the owner for #869.** It is reported because the
brief's premise was that a list of issues is waiting on rulings, and at least
one of them is waiting on nobody. A title that says "owed by the owner" is the
sentence form `docs/AGENT_WORKFLOW.md` §4 says rots first, and this one rotted
the day after it was written.

### 5.3 What the sweep found that is genuinely the owner's and is not priced here

- **#540** — whether an admission should ever carry prior incidents. Genuinely
  open, genuinely buildable, and **the issue's claim about why it is the
  owner's is wrong**: it says *"balance and therefore the owner's"*, and balance
  is not one of `AGENTS.md`'s four reservations. Under the standing mandate it
  is ours to research and choose. It is left off the list above because if it is
  put to the owner at all, it should be put as a balance question with measured
  consequences — cell sharing, contraband and the regime timetable all turn on
  the tier — and that is its own pass, not a row in this one.
- **#1149** — five items explicitly held for the owner, two of them inside
  reservations (a `supabase/migrations/` PR held since 2026-08-26, and a one-line
  deletion in `ci.yml`). **That issue already is the document this one is.** It
  is not folded in here: its items are process and infrastructure, this one's are
  player-facing, and merging them would make both harder to rule on in a minute.

---

## 6. Where the line actually runs, which is the thing worth keeping

Applying `AGENTS.md`'s four reservations to the six, rather than each issue's own
claim about itself:

| the issue's own claim | what the contract says |
| --- | --- |
| #894 *"reopening gap 34 is ADR 0084's territory, and therefore the owner's"* | **holds, by convention rather than by the four.** No reservation names ADRs. Every Status block in this corpus records acceptance as the owner's, and ADR 0084 is one of them. Reopening an accepted decision is asking for that signature again. |
| #985 *"neither of the two belongs in implementation code"* | **holds for option 1** (it reverses a documented principle) and **now barely matters for option 2**, whose cost §1.1 prices at 35/53 px bought for nothing. |
| #1294 *"it wants an ADR rather than an implementation"* | **half.** Drafting the ADR is ours and the mandate asks for it; accepting it is the owner's. There is no ruling to give until a draft exists. |
| #933 *"the wording is ours; the truth requirement is not waived"* | **true, and incomplete.** The third case — a sentence the owner chose by name — is covered by neither half, and it is the one #933 is standing on. |
| #930 *"deleting the field reverses a signed owner ruling"* | **moot.** Nothing is being deleted; the field has a reader. |
| #1295 *"whether the editor may own the rail is the owner's"* | **overtaken.** Answered in code under the mandate, green at five viewports. |
| #869 *"step 3 is `AGENTS.md`'s fourth exclusion"* | **false since the day after it was written.** |

**Three of the seven claims survive intact.** That ratio is the reusable part:
an issue's statement that it is blocked on the owner is a claim about a contract
that has moved five times since 2026-09-03, and it is checked by opening
`AGENTS.md`, not by trusting the issue.

---

## 7. Weakest claim, and what would settle it

**That #985's clip is gone rather than unreproduced in the fixtures anyone has
tried.** §1.1 measured ten panel readings with zero overflow, and the
2026-09-15 pass measured a `data-needs` fixture with zero overflow — but neither
is the fixture #985 was filed on, which is *the assembled application with two
rooms actually zoned and unfinished, at 900×600*. This pass's own fixture has no
prison at all, which is the weakest of the three for this purpose: the Rooms
panel is at its emptiest, so it has the most slack to absorb the band.

**What would change it:** that fixture, driven to completion — zone two rooms,
leave them unfinished, raise a refusal, read `.hud-rooms > .ui-panel__body`'s
`clientHeight` against its `scrollHeight` at 900×600. It is a playtest rather
than a measurement of the shell, which is why it is not in this pass.

**And a second, smaller one.** §2's pixel figures are #1294's, not this pass's.
The structural premise was verified here (`margin-top: auto` at `hud.css:1176`,
the module docblock at `pooled-row-binding.ts:92`) and the numbers were not
re-taken. A reader treating the 690 → 690 collision as measured on `f1a61702`
would be reading a 2026-09-17 measurement with a 2026-09-19 date on it.

---

## Provenance of everything measured here

- **Commit:** `f1a61702`, `origin/main`, v0.0.688.
- **Chromium:** the repository's own Playwright install, `/opt/pw-browsers`,
  against `vite` on port 45871 in a worktree off `origin/main`.
- **Git LFS is not provisioned in this container**, so every run logs
  `World renderer: InvalidStateError: The source image could not be decoded.`
  Every figure above is DOM geometry in `.hud-*` and `.ui-panel*`; none of it is
  the canvas.
