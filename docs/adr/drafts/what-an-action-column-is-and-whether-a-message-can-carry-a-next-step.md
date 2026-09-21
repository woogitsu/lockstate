# ADR draft: what an "action column" is, and whether a message can carry a next step

> **This draft deliberately carries no number.** ADR numbers are assigned
> centrally after drafts return (`AGENTS.md`), and this one pre-commits to
> being renumbered without argument. Nothing in `src/` or `tests/` cites it;
> `grep -rln "what-an-action-column-is" src/ docs/ tests/` was run rather than
> recalled and returns this file alone.

## Status

**Proposed. It asks and stops.** Nothing below is decided, implemented or
self-approved by the agent that wrote it. One question in §7 is named as the
owner's rather than answered, and it is the only one.

**What it is a response to.** The 2026-09-13 identity delivery
(`docs/design/2026-09-13-identity-v5/`, vendored verbatim and never edited
there) pairs every worked message example with a pressable action, and nothing
in this repository decides how such a press would work. This document
establishes what the delivery asks for, what the repository has already ruled,
what today's HUD does instead, what the two budgets are, and recommends a
shape.

---

## 1. What the delivery actually asks for, quoted

### 1a. The phrase "action column" is not the delivery's

Searched before quoting, because the brief that commissioned this draft uses
the phrase as if the delivery did:

```
$ grep -rni "action column\|action-column\|kolumna akcji\|kolumn.\{0,3\} akcj" docs/ src/ tests/
docs/research/2026-09-14-stage-6-language-gap.md:198:explains the state.") Searched for a producer of that action column and found
```

One hit in the whole tree, and it is a repository research record rather than
the delivery. **The delivery contains no phrase meaning "action column".** What
it contains is a table whose third column is headed `Akcja`, and the phrase is
this repository's shorthand for that column. That shorthand is where an
ambiguity gets in, and §1d is about it.

### 1b. The table, verbatim, from `DOKUMENTACJA/projekt.md`

The header and the ten rows, as the file carries them:

```
| Sytuacja | Proponowany komunikat | Akcja |
|---|---|---|
| Brak dostępu | Nie ma przejścia do celi A-12. Sprawdź drzwi i połączenie z korytarzem. | Pokaż przejście |
| Brak wyposażenia | Cela A-12 nie jest gotowa. Brakuje toalety. | Dodaj wyposażenie |
| Za mało środków | Brakuje 350 do tego planu. Zmniejsz zakres lub wróć po uzupełnieniu środków. | Zmień plan |
| Plan przyjęty | Zaplanowano 6 odcinków ściany. Koszt: 300. | Cofnij plan |
| Trwa zapis | Zapisuję na tym urządzeniu… | Brak |
| Zapis potwierdzony | Zapisano na tym urządzeniu o 14:32. | Pokaż zapisy |
| Konflikt lokalny | Nie zapisano zmian. Ten zapis zmienił się w innej karcie. | Sprawdź wersje |
| Brak łóżek | 3 osoby czekają na miejsce do spania. Przygotuj cele z wolnymi łóżkami. | Pokaż cele |
| Pusta lista | Nie masz jeszcze planów budowy. | Zaplanuj pierwszy element |
| Zagrożenie | Incydent w stołówce. 2 osoby wymagają pomocy. | Pokaż zdarzenie |
```

**Three things this table says that a paraphrase loses.** First, one cell is
`Brak` — "none": the delivery already holds that some messages carry no action,
so the column is not a promise that every row gets a button. Second, the verbs
divide into two kinds that are not the same mechanism — *Pokaż przejście*,
*Pokaż cele*, *Pokaż zdarzenie*, *Pokaż zapisy* ("show the passage / the cells /
the event / the saves") **go somewhere**, while *Dodaj wyposażenie*, *Zmień
plan*, *Cofnij plan*, *Zaplanuj pierwszy element* ("add equipment / change the
plan / undo the plan / plan the first element") **do something**. Third, the
caption immediately under the table is a constraint on the whole of it:

> Liczby są przykładowe. Komunikaty i akcje wymagają dowodu w kodzie przed
> integracją. Nie wdrażamy tekstu zapowiadającego nieistniejącą funkcję.

("The numbers are examples. Messages and actions require proof in code before
integration. We do not ship text that announces a non-existent feature.")

The same table appears a second time in the delivery, inside the prototype's
own chapter text vendored at
`HISTORIA/ZMIANY/02-warsztat-i-research.patch`, with the header
`<th>Sytuacja</th><th>Treść docelowa</th><th>Działanie</th>` and one differing
cell — that copy reads `Bez dodatkowej akcji` ("no further action") where
`projekt.md` reads `Brak`, and it omits the `Brak wyposażenia` row while adding
`Funkcja niedostępna` / `Zapisz lokalnie`. Two copies, not one; neither is
marked as superseding the other. `projekt.md` is quoted above because it is the
document `DOKUMENTACJA/` presents as the specification.

### 1c. The two constitution articles that make it a rule rather than a mock-up

`DOKUMENTACJA/konstytucja.md` article 6, *"Problem prowadzi do działania"* ("a
problem leads to an action"), in full:

> Komunikat podaje fakt, lokalizację i następny krok. Ostrzeżenia nie znikają
> dlatego, że przyszło nowsze zdarzenie. Historia zdarzeń pozostaje dostępna.
> Przycisk naprawczy musi mieć rzeczywistą implementację; inaczej tekst tylko
> wyjaśnia stan.

("A message gives the fact, the location and the next step. Warnings do not
disappear because a newer event arrived. The event history stays available. A
repair button must have a real implementation; otherwise the text only explains
the state.")

And article 1, *"Mapa jest miejscem gry"*, carries the same requirement from
the other end — one sentence of it, quoted because it is the half that is about
navigation rather than about layout:

> Informacja kontekstowa prowadzi do miejsca, którego dotyczy.

("Contextual information leads to the place it concerns.")

### 1d. Where the delivery is ambiguous, precisely

**It is not ambiguous about the table.** The table is a three-column editorial
pattern for messages, its third column is a per-message action, and the caption
binds it to proof in code.

**It is ambiguous about nothing else — but the phrase "action column" is,** and
the ambiguity is a collision between two unrelated things the delivery
describes. Besides the `Akcja` table column, the same specification designs a
**left navigation column** with its own widths, in `DOKUMENTACJA/projekt.md`'s
device table:

```
| Zakres | Układ | Interakcja |
|---|---|---|
| Do 720 px | Dolna nawigacja, mapa, wysuwany panel 240 px lub 55% wysokości | Panel zwija się do wskazania miejsca; dotyk; potwierdzenie w oknie |
| 721–1100 px | Lewa nawigacja 78 px, panel 284 px, mapa obok | Dotyk i mysz; kompaktowe metryki |
| 1101–1599 px | Lewa nawigacja 92 px, panel 320 px | Mysz, klawiatura, etykiety narzędzi |
| Od 1600 px | Nawigacja 100 px, panel 350 px | Więcej oddechu i pełne metryki |
```

Those are two different asks. The navigation column is a **container for the
five sections** and it has already landed (§3). The `Akcja` column is a
**per-message next step** and has not. Read as the second, this draft's subject
is a message affordance whose cost is measured in the *width* of the alerts
corner; read as the first, it is a rail whose cost is *height*. **The brief
that commissioned this draft reads it the first way** — it asks what an
action-column proposal "takes the height from" — and §5 establishes with
measurements that the binding budget is the other one. The conflation is worth
naming rather than routing around, because the phrase will be used again.

---

## 2. What the repository has already ruled, and what it has not

### 2a. ADR 0112 does not decide the action column, and its Status block is why

`docs/adr/0112-what-the-2026-09-13-identity-delivery-decides.md` is **Accepted
by the owner on 2026-09-13, in five rulings, two of which went against that
document's recommendation**, with a sixth ruling of 2026-09-16 that its own
Status block says *"is not a sixth decision"* — it settles the scope of
decision 4's amendment of constitution article 8 to 15 / 13 / 11. Read rather
than summarised: the five are the constitution binding, the light palette
becoming default, the navigation moving to the delivery's five sections, the
type scale, and the world illustration.

```
$ grep -ni "action\|column\|kolumn\|Akcja" docs/adr/0112-what-the-2026-09-13-identity-delivery-decides.md
36:| 3 — navigation moves to the delivery's five sections | **now**, in the owner's own words | **yes** |
110:type, rhythm, navigation, voice, device behaviour and a twenty-article product
179:### Decision 3 — Does the navigation move to the delivery's five sections?
184:> words are in the Status block above. The navigation moves to the delivery's
```

**Decision 3 is about the sections, not about per-message actions.** Its ruling
moves `overview / build / rooms / security / regime` to the delivery's five and
records that *"a surface the direction does not place is still not an agent's to
delete"*. Nothing in it reaches a button on a message row.

**Decision 1 does reach it, and this is the part that means this draft is not
free to invent.** The constitution binds as a product contract subordinate to
`AGENTS.md`, so article 6's last clause is a standing rule. **What is therefore
already decided is the prohibition, not the mechanism:** an action-verb label on
a control that does nothing is forbidden, by a ruling the owner has made. What
is undecided is what the mechanism looks like — and that is what this document
is for.

### 2b. The repository has already written the prohibition down, and it blocks work today

`docs/LOCALIZATION.md` carries it as a standing instruction to string authors:

> **What nothing in the codebase wires is the third beat: a next-step action
> attached to a message.** No code under `src/ui/` attaches a "jump to this
> tile/room" or "open this panel" handler to an alert or refusal row; the row
> renderer takes a label and an icon, never a destination. … **So: author
> fact → place now. Do not author a next-step action verb on any control until
> the navigation mechanism it presses exists** — that mechanism is its own,
> larger piece of stage 6's cost, not a wording exercise.

`docs/VISUAL_IDENTITY.md` reads the same delivery table the same way, and its
reading is the one to quote on what binds:

> **Binds through decision 1, in part: the message pattern is constitution
> article 6** … **The promise line and the verb list are the delivery's material
> and are not ruled.**

and, on the table specifically:

> Those rows are *shapes*, not strings to paste: the numbers in them are
> invented, and `AGENTS.md`'s fourth reservation makes the truth of a
> player-visible sentence the owner's, not ours, however free we are with its
> wording.

### 2c. No other ADR decides it

`docs/adr/0084-what-the-alerts-channel-owes-a-player.md` decides what an alert
row owes a player — identity, repeat counts, arrival times, dismissal, band
lifetime — and never a destination.
`docs/adr/0085-what-the-hud-corner-is-for-and-what-the-strip-may-drop.md`
decides the corner's width direction and is the budget §5 spends against.
`docs/adr/0091` (via 0084 §6) decides when a refusal band retires. None of the
three carries an action on a row, and no draft under `docs/adr/drafts/` does
either: the four present are about decode refusals, how a language change
reaches a running page, what a second tab follows, and gang reachability.

**So: no ADR already decides this, and this draft does not stop.** It is
narrower than it looks, though — §2a's prohibition is the decided half.

---

## 3. What today's HUD does instead, by file

The HUD is one CSS grid with six single-column rows, declared in
`src/ui/hud/hud.css`:

```
  grid-template-areas:
    'strip'
    'unavailable'
    'notice'
    'event'
    'middle'
    'tabs';
  pointer-events: none;
```

That column is the vertical budget, and the last line of it matters to every
option below: **the HUD surface is `pointer-events: none` and each interactive
island opts back in**, so the world underneath keeps every pixel no control has
claimed.

| Row / region | Class | What carries it |
|---|---|---|
| status strip | `.hud-strip` | `src/ui/hud/status-strip.ts` |
| no-simulation line | `.hud__unavailable` | `src/ui/hud/hud.ts` |
| refusal band | `.hud__refusal` | `src/ui/hud/hud.ts`, lifetime in `src/ui/hud/event-band-dwell.ts` |
| event band | `event` area | `src/ui/hud/hud.ts`, `src/ui/simulation-events.ts` |
| middle: rail, panels, corner | `.hud__rail`, `.hud__side`, `.hud__aside`, `.hud__corner` | `src/ui/hud/hud.ts`, `src/ui/hud/layout-shell.ts`, the panel modules |
| navigation | `.hud__tabs`, `.hud-tabs__inner`, `.ui-tab` | `src/ui/hud/hud.ts`, placement in `src/ui/hud/hud-layout.ts`, ids in `src/ui/hud/hud-state.ts` |

**The navigation column the delivery asks for already exists**, as a fit test
rather than a breakpoint. `src/ui/hud/hud-layout.ts`'s `navigationPlacement`
returns `'rail'` or `'bar'`, and its own docblock gives the reason:

> **A fit test rather than a breakpoint, and the difference is `--ui-scale`.**
> A media query cannot ask about the interface scale, and the scale is what
> decides this: five tabs are 270 px of column at 100 % and 540 px at 200 %,
> while the window does not grow at all.

It carries **six** sections today — `HUD_TAB_IDS` in
`src/ui/hud/hud-state.ts` is `overview, build, zones, manage, day-plan,
security` — the delivery's five plus the one decision 3 declined to delete.

**Where a message lands, and what it carries.** Alerts are rows in
`.hud-alerts__list` inside `.hud__corner`, built in `src/ui/hud/hud.ts` from
`HudAlertViewModel` in `src/ui/hud/view-model.ts`, produced by
`src/ui/simulation-alerts.ts` (the refusal row and protocol-fault rows) and
`src/ui/simulation-events.ts` (arrival rows). The view model's whole shape is
`id`, `labelKey`, `severity`, an optional `occurrences`, and the label
parameters it extends. **There is no destination field, and no row renderer
takes one.**

**What an action would press, if it had one.** The spine exists:
`src/main.ts` handles a HUD intent union that already carries `select-tab`,
`select-prisoner` and `select-incident`, and the renderer already exposes one
camera-navigation entry point — `WorldScene.navigateToMinimapPoint` in
`src/rendering/scene/world-scene.ts`, wired from `main.ts` as
`onMinimapNavigate`, whose docblock states its own boundary:

> Presentational only, per `AGENTS.md` boundary 1: reads `lastLoadedBounds` (a
> cached copy of a value already read for rendering) and writes only
> `this.cameras.main`. No simulation command is built or sent, matching every
> other camera gesture (drag, wheel, keyboard) on this scene.

So "move the camera there" is a solved problem with a precedent and a ruling
behind it (issue #793: the minimap accepted clicks and did nothing, and the
owner ruled that it should navigate). **What is missing is not the camera. It is
the *there*.**

**And that is a protocol fact, not a UI one.** The refusal that crosses the
worker boundary is `refusalSchema` in `src/simulation/protocol/types.ts`, and it
is `.strict()` with four members: `sequence`, `tick`, `reason` and an optional
`routeDecidedSince`. No coordinate, no room, no rectangle. The refusal *log*
inside the simulation does know the target — its supersession keys are
`<route>:<target>` — and none of that is published. The consequence is legible
in the English catalogue, where refusal strings are deictic without a referent:

```
$ grep -n "'hud\.alert\.refusal\.build\.[a-z-]*':" src/content/default-locale-en.ts | head -4
967:  'hud.alert.refusal.build.out-of-bounds': 'The build order failed — that tile is outside the map.',
968:  'hud.alert.refusal.build.unbuildable': 'The build order failed — nothing can be built on that tile.',
969:  'hud.alert.refusal.build.unbuildable-terrain': 'The build order failed — the ground there cannot be built on.',
987:  'hud.alert.refusal.build.water-blocked': 'The build order failed — there is water on that tile.',
```

*"That tile"*, four times, with nothing on the message that says which. **So
article 6's middle beat — `lokalizację`, the place — is missing for the same
reason its third beat is, and they are one piece of work rather than two.** The
outbound direction has coordinates in abundance (`src/ui/build-tool.ts`,
`src/ui/object-tool.ts`, `src/ui/room-tool.ts` all carry `tileX`/`tileY`); the
inbound direction has none. Checked before asserting: `grep -rn "tileX" src/ui/`
returns only those three tools and `src/ui/hud/build-panel.ts`, all of them
player-to-simulation.

---

## 4. Three premises in the commissioning brief, refuted with evidence

`docs/AGENT_WORKFLOW.md` asks that a false premise be refuted rather than
worked around. Three, and the third is the one that would have cost something.

**1. `KNOWN_FAILING` is not in `tests/browser/page-zoom-sweep.ts`.**

```
$ grep -rn "KNOWN_FAILING" tests/ src/ | head -3
tests/browser/ui-200-percent-zoom-sweep-ratchet.spec.ts:34: * A subset assertion is not that. `KNOWN_FAILING` below is a ceiling, not a
tests/browser/ui-200-percent-zoom-sweep-ratchet.spec.ts:85:const KNOWN_FAILING: readonly string[] = [
```

`page-zoom-sweep.ts` is the shared measurement — `UI_SCALES`, `WINDOWS`,
`sweep`, `fails`, `faults` — and two callers share it. The ceiling lives in the
ratchet spec.

**2. The deferred count is twelve, not thirteen.** Read off the list rather
than recalled: `1280x720@200%`, `1024x768@175%`, `1024x768@200%`,
`900x600@150%`, `900x600@175%`, `900x600@200%`, `390x844@150%`, `390x844@175%`,
`390x844@200%`, `375x812@150%`, `375x812@175%`, `375x812@200%`. Twelve entries,
and the spec's own docblock gives the history — it was thirteen until
`observeChromeRowOverflow` closed `375x812@125%`, sixteen before two repairs in
`ui-hud-chrome-under-page-zoom.spec.ts`, thirty-one before #1318. **The
direction of the error matters: a brief that says thirteen is asking a proposal
to be measured against a ceiling one entry looser than the real one.**

**3. `docs/IDENTITY_V5_ROLLOUT.md`'s Stage 6 does not carry the action column
as remaining work.** It carries language — stable keys, full sentences, no
concatenation, Polish plurals, locale-formatted numbers, and the truth
obligation.

```
$ grep -n "action\|Akcja\|third column" docs/IDENTITY_V5_ROLLOUT.md
345:  `.hud-build__actions` was tried first and cleared the first two, which is how
424:inside that abstraction, not beside it.
475:> subtraction is meaningless in either direction.
1020:> that spec changed to accommodate the translation, because its subtraction
1118:("Every present action has a reachable route; no refusal looks like a success;
1355:A re-skin that looks finished and quietly removes reachable actions, softens
```

Nothing in Stage 6 names it. **What carries it as remaining work is
`docs/research/2026-09-14-stage-6-language-gap.md` §3b and its §4 item 3** —
*"Design and build the "next step" navigation mechanism §3b identifies as
missing … This is the expensive piece: it is new UI plumbing, not a string
change"* — a research record *about* stage 6, plus the standing instruction in
`docs/LOCALIZATION.md` quoted in §2b. The distinction is not pedantry: the
rollout document is the plan, and a reader told the plan already carries this
would go looking for a staged approach that does not exist.

**One claim in that research record is narrower than it reads, and this draft
leans on it, so it is corrected here rather than repeated.** It says *"no code
under `src/ui/` attaches a 'jump to tile/room' or 'open this panel' handler to
a refusal or alert row"*, which is true as written, and a reader can carry away
from it that no camera-navigation mechanism exists at all. One does:
`WorldScene.navigateToMinimapPoint`, wired through `main.ts`'s
`onMinimapNavigate`, landed for issue #793. It takes a **fraction of the
minimap's box**, not a tile, so it does not answer the message case — but the
boundary question ("may the HUD move the camera?") is settled, with a ruling,
and that is the expensive half of a navigation mechanism in a codebase with
`AGENTS.md` boundary 1.

---

## 5. The budgets. There are two, and the binding one is not the vertical one

### 5a. Vertical: real, zero-sum, and already spent

The grid column in §3 is the budget, and the repository has priced entries in it.
`src/ui/hud/hud.css` records what one band row costs, measured:

> Measured on the assembled application at 900x600, that row costs
> `.hud__rail` 35px.

And `src/ui/hud/hud-layout.ts` records what a *navigation* entry costs, along
with the one attempt to pay for it out of the corner:

> A sixth section ends it: measured on the assembled page at 1280x800, the
> column runs `y = 92.69..420.81` and `.hud-zoom__in` sits at `415..459`, so a
> press meant for the zoom control landed on a `.ui-tab`.

> **THE PARAGRAPH ABOVE DESCRIBED A REPAIR THAT WAS REVERTED** … The cap cost
> the alerts list 27px it did not have -- a 28px list box holding a 76px row,
> which `ui-alerts-column.spec.ts`'s #739 assertion reports in those words --
> so it was reverted

What paid for the sixth section instead was a rail tab's own block padding,
which is why `NAVIGATION_TAB_HEIGHT_PX` is 47 rather than 54. The same file
records that the tab bar spends padding too, at enlarged scale, and that the two
alternatives were refused on stated grounds:

> Taking the *names* off the screen at enlarged scale … fits six tabs on one
> row and is a player-visible removal at a viewport class the owner's
> 2026-09-16 ruling does not reach, so it is theirs rather than ours.
> Re-cutting `.hud__aside`'s floor is the other place the 27px could come from
> and it is where #1318 has just put a floor *back* … taking it out again would
> re-open that.

And the ratchet spec's own reading of why the twelve remain is the same budget:

> Every remaining entry fails on that budget at the larger interface scales:
> the strip, the tab bar and the rail cannot all have the height they ask for
> in a viewport halved in both axes, and which of them gives way is a decision
> this file does not make.

**So the vertical budget is genuinely at zero, and every option in §6 is
measured against it.** But it is not what an action on a message row spends.

### 5b. Horizontal: the one an action button actually spends, and it is at its floor

An action on an alert row spends the **width of `.hud__corner`**, and that
number has already been to the owner once. `src/ui/hud/hud.css`'s arithmetic
block above `.hud-alerts__list > .ui-row` records the whole transaction, for
ADR 0084's *dismiss* control — the last control added to one of these rows:

> **This is not shrunk around.** The control stays at `--tap-target` because
> that is what makes it reachable, and the three things that could give are all
> decisions rather than styling, so they were named and put to the owner:
>
>   1. Drop the severity badge from *this* list and give the label its 64px
>      back. …
>   2. Let the row wrap and put the control on its own line -- height instead
>      of width, in the most constrained box chain in the interface (#174).
>   3. Widen the rail, which is #174's own subject.
>
> **THE OWNER ANSWERED ON 2026-09-01, AND THE ANSWER IS THE THIRD: THE WIDTH
> COMES FROM THE RAIL.**

The width that bought is exact, and it is a floor rather than a comfortable
figure:

> 396 is not a round number and is not the 430px ADR 0085 names as its
> guardrail -- it is the *smallest* width at which the worst severity badge's
> row still holds the 109-character sentence to **4 line boxes**, measured 2px
> at a time … 394px still wraps to 5, 396px is the first width that wraps to 4,
> and nothing between 396 and 430 buys a fifth line box back.

**Two pixels of label is the margin.** A second control at `--tap-target`
(`calc(44px * var(--ui-scale))` in `src/ui/tokens.css`) takes 44 of them at
100 % and 88 at 200 %. The property that would break is pinned:
`tests/browser/ui-alerts-column.spec.ts` gates *"the 109-character sentence, at
the narrowest severity badge, at every one of #739's five measured viewports,
wraps to **at most 4 line boxes**"*.

And the width cannot simply be taken from the world, because that trade has a
recorded limit:

> At 900x600 the world view was 362px before this change and is **190px** after
> (900 - 288 rail - 422 corner). Half of 362 is 181, so 190px keeps **9px more
> than half**, with headroom to spare against ADR 0085's own rule ("do not cut
> the 900x600 world-view budget by more than half")

**9px of headroom, against a 44px control.** Widening the corner by a tap
target at 900x600 puts the world view at ~146px against a 181px half-line.

**Stated honestly, because this is the load-bearing citation: that rule is not
an accepted ADR.** ADR 0085's Status reads *"Proposed, 2026-09-01. Not
self-approved. This document as a whole is unaccepted"*, with an addendum
recording that decision 1's **direction** was ruled by the owner on 2026-09-01
in the course of ADR 0084's tradeoff. And the guardrail itself says so: *"That
guardrail number is this document's own reasoning, not a measurement."* So what
is owner-ruled is that the corner widens rather than the row giving way; the
half-the-world-view line is the repository's own reasoning. It is still the
best-evidenced constraint in the file, and a proposal that blows through it
should say so out loud rather than lean on its unaccepted status.

### 5c. And the phone tier does not have the row at all

`src/ui/hud/hud.css` carries the measurement, in a correction to its own earlier
prose:

> **THE FIRST CLAUSE OF THAT PARAGRAPH IS FALSE AND THIS FILE CONTRADICTS IT
> ITSELF (#1117).** `.hud__corner` IS hidden below 720px: the rule
> `.hud__corner { display: none; }` lives inside `@media (max-width: 720px)` …
> Measured in the DOM harness at 375x812, `getComputedStyle('.hud__corner')
> .display` is `none` and the minimap surface inside it reports
> `clientHeight: 0`.

So at 390x844 and 375x812 — the two phones the delivery's own test plan names,
and eight of the twelve deferred sweep combinations — **an action on an alert
row reaches nobody.** The messages that reach a phone are the bands, and the
bands are `pointer-events: none` by design, inheriting from `.hud`. Putting a
control in one means opting a full-width band into pointer events above the
world, which is the arrangement constitution article 7 is about
(*"Przesunięcie kamery i zlecenie budowy nie mogą wynikać z tego samego
gestu"* — camera movement and a build order must not come from the same
gesture).

---

## 6. Options

Four shapes, the first three of them genuinely different, and one of them is
included because it is what a reader of the brief's framing would propose.

### Option A — a button per row in the alerts list (the delivery's literal shape)

A second control beside the dismiss control on each `.hud-alerts__list > .ui-row`
that has a destination.

**Cost, measured:** 44px of label at 100 %, 88px at 200 %, against a 2px margin
(§5b). Either `.hud-minimap`'s 396px grows by a tap target — putting the
900x600 world view ~35px under ADR 0085's half-line — or the #739 property
breaks and `ui-alerts-column.spec.ts` goes red. **Vertical cost:** zero, unless
the row is allowed to wrap, which is explicitly option 2 of the three the owner
was offered in 2026-09-01 and did not choose.

**What it forecloses:** the phone tier entirely (§5c), so the delivery's own
first-named viewport gets the pattern last or never. It also re-opens a
transaction the owner has already settled once, in the opposite direction.

### Option B — the row is the action; no new control

The alert row itself becomes pressable when it has a destination, with the
existing dismiss control keeping its own hit area. The label is unchanged, the
badge is unchanged, the corner width is unchanged.

**Cost:** zero width, zero height, no new grid row, no change to
`navigationRailBlock`. The affordance is carried by the row's own affordance
treatment (cursor, focus ring, `aria` role) rather than by a second box.

**What it forecloses:** one destination per row, not a labelled verb — the
delivery's *"Pokaż przejście"* becomes "press the row that says it" rather than
a button that says "show the passage". That is a real loss against the
delivery's table, and it is a loss of the *label*, which since 2026-09-04 is
ours to choose. It also puts an interactive control inside a scroll container on
a touch device, which article 7 has a rule about (*"Przewijanie list nie
przesuwa mapy"* — scrolling a list does not move the map) and which needs a
browser measurement rather than an argument.

### Option C — a seventh navigation section for messages

A "Do teraz" / "Alerts" section in the navigation column, so every message has
one place to be acted on.

**Cost, measured, and this option is dead on arrival:** `navigationRailBlock`
is `(HUD_TAB_IDS.length * 47 + 24) * scale`, so a seventh section is 47 more
CSS px of column at 100 % and 94 at 200 %. The sixth already collided with
`.hud-zoom__in` at 1280x800 (§5a), and the repair that tried to pay for it out
of the corner cost the alerts list 27px it did not have and was reverted. **It
also spends the exact budget the twelve deferred sweep combinations are
deferred against**, which means it can only be proposed together with a
statement of which of the strip, the tab bar and the rail gives way — the
decision the ratchet spec says it does not make.

### Option D — the destination rides the view model; the press is option B's

Not an alternative to B but the plumbing under it, listed separately because it
is where the scope actually is:

1. `refusalSchema` (and the event notices beside it) gain an **optional**
   location member — a tile or a rectangle — published from the target the
   refusal log's supersession key already holds.
2. `HudAlertViewModel` gains an optional destination.
3. The HUD intent union gains one member, beside `select-tab` and
   `select-incident`, and `src/main.ts` routes it.
4. `WorldScene` gains a tile-targeted sibling of `navigateToMinimapPoint`,
   which is the same `centerOn(tileToWorld(x), tileToWorld(y))` call
   `frameCameraOnFirstWorld` already makes.

Step 1 is a worker-protocol change and is the reason this needs an ADR at all
rather than a pull request. Steps 2–4 are small. **Step 1 is also what buys
article 6's middle beat**: once a refusal carries its place, *"that tile"* can
become a sentence that names one, which is a wording change whose truth the code
would for the first time support.

---

## 7. Recommendation

**B + D, sequenced with D step 1 first, and A explicitly not now.**

- **Take the destination through the protocol before writing any affordance.**
  Nothing about a press is decidable while every inbound message is
  place-blind, and the place is the half article 6 asks for that nobody has
  been counting. A repository that ships D step 1 and stops has already
  improved every refusal sentence in the catalogue.
- **Make the row the press, not a button on it.** It is the only shape whose
  cost against both budgets is zero, and the horizontal budget is at a
  two-pixel floor that an owner ruling put there.
- **Do not widen the corner for this.** The one time that width moved, it moved
  on an owner ruling, to the smallest value that cleared a measured property,
  with 9px of headroom against the only stated rule about the world view.
- **Say nothing to the player until the press works.** Article 6's last clause
  is binding through ADR 0112 decision 1, and `docs/LOCALIZATION.md`'s standing
  instruction is already written.

**Vertical-budget cost of the recommendation: zero.** No new grid row, no
change to `navigationRailBlock`, no change to `.hud__aside`'s floor, no change
to the strip. **`KNOWN_FAILING` is unchanged at twelve and is not raised.** It
may fall: the recommendation adds no box to the most constrained box chain in
the interface, which is where all twelve fail.

**What is not settled by this and must be measured before implementation, not
argued:** whether a pressable row inside a scroll container behaves on a touch
device, at the three phone combinations where `.hud__corner` is `display: none`
and therefore where the answer may be "the question does not arise".

### The one question that is the owner's

**Marked as such, and it is about a player-visible promise rather than about
layout.**

Option B gives up the delivery's *labelled verb*. The delivery's table pairs
each message with a sentence a player can read — *"Pokaż przejście"*, *"Pokaż
cele"*, *"Zaplanuj pierwszy element"* — and B replaces it with a row that is
pressable and does not say so in words. Since 2026-09-04 the *choice of words*
in a player-facing string is ours; whether a promise is made at all, and whether
the code keeps it, is not. **A pressable row with no label is not a false
promise — it is a missing one**, which is why this is a question rather than a
refusal. But the delivery asked for the label, in the owner's own delivery, and
substituting a bare affordance for it is a reduction in what the player is told.

The question, stated so it can be answered yes or no:

> **Is a pressable message row, with no action-verb label on it, an acceptable
> delivery of the `Akcja` column — or must the labelled button arrive, at the
> cost §5b prices (the corner past the width an owner ruling set, or the #739
> four-line-box property)?**

This draft recommends the first and does not take it.

---

## 8. Weakest claim in this document

**That option B's zero-cost claim survives contact with a browser.** Every
number in §5 is quoted from a measurement somebody else took and recorded; the
claim that a pressable row adds no box, and therefore no pixels, is an argument
from the DOM's shape rather than a measurement of the assembled page. A focus
ring is drawn inside the row's box in this stylesheet's other rows, and a press
target that must clear `--tap-target` at 200 % may not fit a 76px four-line row
beside a dismiss control that already claims 44 scaled pixels of it. **That is
one Playwright run against `page-zoom-sweep.ts`'s own harness and it was not
taken here**, because this draft's brief was research and an ADR, and because
the thing to measure does not exist yet to measure.

Second weakest: §1d's reading that the delivery's two "columns" are unrelated
rests on the delivery never connecting them, which is an argument from silence.
The device table and the voice table are in the same file, three headings apart.
