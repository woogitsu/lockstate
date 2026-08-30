# Which word for a prisoner: turning the owner's mixed register into a criterion

**2026-08-30. Issue [#661](https://github.com/matmaxalez/lockstate/issues/661), the
owner's ruling of 2026-08-30 on Q1. Branch `agent/661-polish-candidates`, beside the
corpus it revises: [2026-08-30 candidate Polish translations](./2026-08-30-candidate-polish-translations.md).**

---

## 0. What was ruled, and what this record is

The corpus asked thirteen questions. Q1 offered *więzień* throughout, *osadzony*
throughout, or a mix. **The ruling is the mix: *osadzony* in official labels —
rosters, statuses, refusals — and *więzień* in event text and flavour.**

The ruling also names its own cost, in the terms it was offered: *two words for one
thing, so every future key needs the question asked again.* That is what makes the
deliverable a **rule** rather than a word list. An enumeration decays the first time
somebody adds a key; a criterion is checkable by the person adding it.

**Nothing here is approved either.** This record applies a ruling to the keys the
ruling covers and measures two things it turned on. It creates no
`src/content/*-pl.ts`, touches no file under `src/`, and answers none of the twelve
questions still open. Where its evidence bears on one of those questions — and it
bears hard on Q5 — it re-asks the question with the new numbers instead of closing
it.

**Evidence tiers**, as in the corpus. Claims about *this repository* are **VERIFIED**:
the file was opened and the line read, or the measurement was taken in a browser and
the harness named. Claims about *Polish* are **JUDGEMENT** and are exactly what the
owner is being asked to overrule.

---

## 1. The criterion

> ***Osadzony* wherever the message is a label — the "dense panel labels, not prose"
> line this repository already draws and tests — and wherever a whole sentence is the
> simulation's own (`refusal-`, `fault-`); *więzień* only where a whole sentence is the
> game narrating an event (`event-`). A message whose Polish names no person takes
> neither word, and that clause outranks both.**

Three things make it a criterion rather than a preference, and they are why it is
worth more than the list in §3.

### 1.1 The label/prose line is not new here, and it is already enforced

The seam the ruling describes exists in this codebase, has a name, and has a test
behind it. `src/content/simulation-message-keys.ts:95` documents the `labels` field
of every projected enum as:

> *"Stable id -> default (`en`) label. Short, neutral, HUD-appropriate: these are
> dense panel labels, not prose."*

**VERIFIED.** And `src/ui/simulation-alerts.ts` states the other half, in the course
of explaining why refusals are *not* derived through that module
(`src/ui/simulation-alerts.ts:14-23`):

> *"That module labels an id a panel renders **as a label** -- a cell reading
> "Awaiting Materials", a badge reading "High Risk" -- and it says so: "short,
> neutral, HUD-appropriate: these are dense panel labels, not prose". A refusal is
> not a label. It is a sentence saying what did not happen and why…"*

**VERIFIED.** `tests/unit/simulation-message-keys.test.ts` carries that exemption and
its reason as data, and puts the distinction in one line at `:238`:

> *"a claim kind is a dense label on a roster row and a refusal reason is a sentence
> about something that did not happen."*

**VERIFIED.** So the first half of the criterion — *label takes the official word* —
is not a new rule a translator has to remember. It is an existing, tested,
argued-about boundary, and a future key is already on one side of it before anybody
asks what Polish it takes.

### 1.2 The second half is typed too

The alert band is not one family. `src/ui/simulation-alerts.ts` builds every row it
produces from a `RefusalReason` or a `ProtocolFaultCode`; `src/ui/simulation-events.ts`
builds its rows from the typed simulation event union and gives them **a third row
prefix of their own** — `const EVENT_ROW_PREFIX = 'event-';`
(`src/ui/simulation-events.ts:158`), described at `:149` as *"A third prefix beside
`simulation-alerts.ts`'s `refusal-` and `fault-`"*. **VERIFIED.**

So "the institution speaking" and "the game narrating" are already two different code
paths with two different row prefixes and two different producers. The criterion
rides on that, and a new key inherits its side from which module builds it.

### 1.3 The third clause is the one that does the most work

**A message whose Polish names no person takes neither word.** This is not an
escape hatch bolted on to cover awkward keys. It is the single largest fact about
this catalogue, and §2 is its measurement.

---

## 2. Testing the family hypothesis, and where it breaks

The ruling proposed the families as the seam: *"a refusal the simulation raised is
the institution speaking, an event in the alert band is the game narrating."* That
is the right shape and it was worth testing rather than assuming. Tested against the
candidates, it decides **one key in twelve**.

### 2.1 The refusal family names nobody. Not once, in sixty-five sentences

Counted across the corpus's §5.9, §5.10 and §5.16 — the three families in which the
simulation or the interface reports a refusal:

| Family | Keys | Candidates containing a word for the inmate |
| --- | --- | --- |
| `hud.alert.refusal.*` (§5.9) | 41 | **0** |
| `hud.alert.fault.*` (§5.10) | 12 | **0** |
| `hud.refusal.*` (§5.16) | 12 | **0** |

**The family the ruling leaned on hardest is empty.** Sixty-five institutional
sentences, and the word *osadzony* would appear in none of them.

The reason is grammatical, not editorial, and the corpus states it as convention 2 of
its §6: *"The impersonal `-no`/`-to` past is the default voice for anything that
happened… It has no subject and no gender, which is what lets 53 refusal and fault
sentences be translated without a single reshape."* A sentence with no subject names
no subject. `Nikogo nie przyjęto` — "nobody was admitted" — is the whole sentence, and
there is no slot in it for either candidate word.

Only one refusal in the sixty-five even mentions the class in **English**:
`hud.alert.refusal.admit.no-accommodation`, *"there is no room to put a prisoner in
yet"*, whose candidate is *"…w którym można **kogoś** umieścić"* — *somebody*.

**This is where the family hypothesis breaks, and the break is informative rather
than annoying.** The impersonal device was adopted to dodge the gender wall of R1;
its side effect is that the institution's own voice in this game never names the
inmate at all. So the ruling's most-cited family costs nothing to implement and
teaches nothing to the next author, because there is no instance in it to copy.

### 2.2 The event family names somebody exactly once

`hud.alert.event.*` is seven keys (§5.11). Of those seven candidates, **one** carries
the word: `hud.alert.event.incidents.assault-opened`, *"Doszło do bójki między dwoma
**więźniami**."*

The other six avoid it, and three of them avoid it *for the same reason the refusals
do*:

- `escape-attempt-opened` — candidate *"**Ktoś** próbuje się stąd wydostać."*, with
  the corpus's own note: *"Więzień próbuje uciec" is the literal rendering and is
  masculine; the impersonal "ktoś" holds for a prisoner of either gender — see R1*.
- `prisoners.discharged` — candidate *"Zwolniono: {count} — kara odbyta."*, the
  impersonal `-no` again.
- `prisoners.relocated` — R1 itself; the candidate names `{name}`, never the class.

So the *więzień* side of the ruling, applied to the catalogue as it stands, has **one
visible instance**.

### 2.3 What actually carries the word

Eleven of the twelve occurrences are outside both families the ruling named. They are
headings, columns, enum values, a save manifest and a control's object — every one of
them a **label**, which is why §1's criterion is stated on the label/prose line rather
than on the family list.

**So the honest summary of the test: the ruling's two named families between them
hold 1 of the 12 keys, and the seam that decides the other 11 is the one the
repository already draws for a different reason.**

---

## 3. The reclassified list, derived from §1

Applying the criterion, in order. The "Corpus said" column is what the corpus
recommended before the ruling and is kept rather than overwritten.

### 3.1 Labels — the criterion sends every one to *osadzony*. **Eleven keys move.**

| Key | Corpus said | Criterion says | Which clause |
| --- | --- | --- | --- |
| `hud.status.prisoners` | Więźniowie | **Osadzeni** | label (status strip heading) |
| `hud.regime.roster` | Więźniowie | **Osadzeni** | label (roster heading) |
| `hud.regime.roster-unnamed` | Więzień {id} | **Osadzony {id}** | label (a record identifier standing in for a name) |
| `hud.intake.admit` | Przyjmij więźnia | **Przyjmij osadzonego** | label (a control's object; the operator acting on the institution) |
| `save.scope.prisoners` | więźniowie, potrzeby, czynności i przydziały cel | **osadzeni, potrzeby, czynności i przydziały cel** | label (a save manifest entry) |
| `save.scope.names` | imiona i nazwiska więźniów oraz personelu | **imiona i nazwiska osadzonych oraz personelu** | label (same manifest) |
| `actor-kind.prisoner.name` | Więzień | **Osadzony** | label — derived by `SIMULATION_ENUM_GROUPS` |
| `contraband-holder-kind.prisoner.name` | Więzień | **Osadzony** | label — derived |
| `contraband-source.prisoner.name` | Więzień | **Osadzony** | label — derived |
| `intelligence-target.prisoner.name` | Więzień | **Osadzony** | label — derived |
| `informant-holder-kind.prisoner.name` | Więzień | **Osadzony** | label — derived |

The last five need no judgement at all: they are produced by
`simulationEnumMessages()` from `SIMULATION_ENUM_GROUPS`, whose `labels` field is
documented as labels-not-prose at `src/content/simulation-message-keys.ts:95`. **Every
future member of any enum group is on the *osadzony* side by construction**, and that
is the largest single class the ruling has to cover.

The inflections, **JUDGEMENT**: *osadzony* is an adjectival noun, so *Osadzeni* is the
masculine-personal nominative plural, *osadzonego* the accusative singular after
*Przyjmij*, and *osadzonych* the genitive plural after *nazwiska*. Sentence case is
convention 1 of the corpus's §6, so the mid-sentence `save.scope.*` items stay
lower-case.

### 3.2 Narration — the criterion leaves it alone. **One key stays.**

| Key | Corpus said | Criterion says |
| --- | --- | --- |
| `hud.alert.event.incidents.assault-opened` | Doszło do bójki między dwoma więźniami. | **unchanged** — an `event-` row, the game narrating |

### 3.3 Neither side — the third clause. **Nothing changes now, and the rule is on record for when it does**

These keys are governed by the criterion and name nobody today, so the ruling costs
them nothing. They are listed because a future edit that reintroduces the noun needs
to know which side it is on before it writes it.

| Key | Side | What it says instead, and why |
| --- | --- | --- |
| `hud.alert.refusal.admit.no-accommodation` | official | *kogoś* — the only refusal whose English names the class |
| `hud.refusal.admit-prisoner` | official | *Nikogo* — impersonal `-no` |
| the other 63 refusal and fault keys | official | impersonal `-no`/`-to`; no subject to name |
| `hud.status.prisoners-without-bed` | official | *{count} bez łóżka* — the count is the subject |
| `hud.regime.roster-empty` | official | *Nikogo jeszcze nie przyjęto.* |
| `hud.alert.event.prisoners.discharged` | narrative | *Zwolniono: {count}* today; the §2 plural forms, if ever wired, read *więźnia*/*więźniów* |
| `hud.alert.event.incidents.riot-opened` | narrative | *liczba uczestników: {count}* (R2); §2's plural forms read *więźniowie*/*więźniów* |
| `hud.alert.event.incidents.escape-attempt-opened` | narrative | *Ktoś* — chosen for gender, not register |
| `hud.alert.event.prisoners.relocated` | narrative | R1; names `{name}`, never the class |

### 3.4 The count, and what it says about the ruling's cost

**Eleven keys move to *osadzony*. One stays *więzień*. The corpus's estimate of
"about 12 keys move" was the right size and the wrong split** — it read as twelve
keys choosing between two words, and the criterion turns it into eleven-and-one.

That is worth putting in front of the owner plainly, because it bears on whether the
stated cost is being paid for what was expected:

**The mix is real, but on today's 579 keys it is almost invisible.** One sentence in
the whole catalogue carries *więzień*. The register the ruling protects — the wing's
own word, in the game's own narration — has one instance because §6's impersonal
device has already removed the person-noun from every other sentence in the tree.

**It becomes visible in exactly two futures**, and both are already named elsewhere in
the corpus: (a) if `formatPlural` is ever wired, §2's plural forms put *więźniów* into
`discharged` and `riot-opened`; (b) as more event text is authored — and
`hud.alert.event.*` is the family this repository has been adding to most recently
(#507, #555). So the ruling is a decision about the catalogue's *future* far more than
about its present. **That is an argument for it, not against it**, and it is the
reason a criterion was the right thing to ask for: the eleven keys could have been a
list, the next fifty cannot.

---

## 4. Width: measured, and it does not decide the seam

The ruling asked for this as a measurement that might *constrain* the criterion:
*"Osadzeni and Osadzony {id} are longer than Więźniowie and Więzień {id}, and they
land on exactly the measured limits that already push Pomieszczenia out of ADR 0022's
tab bar. If the official side does not fit, that is a measurement, not a preference."*

**It was measured. The premise is half backwards, and the half that is right lands on
the surface with the most room.**

### 4.1 How it was measured

Chromium 1194 (`/opt/pw-browsers/chromium-1194`), driven by Playwright from a Vite
dev server on this branch, against `tests/browser/ui-harness.html` — the same page
`tests/browser/ui-shell.spec.ts` measures on, mounted through
`lockstateUiHarness.mountHudShell()` and `reportRegime()` with that spec's own
`TIMETABLE` and `ROSTER` fixtures. Candidate strings were substituted into the live
DOM and the layout re-probed through the harness's own `layoutProbe()` and
`regimeProbe()`, so every figure is a real `getBoundingClientRect` in a real browser
with the shipped CSS and the computed font stack. Five viewports, the same set the
spec visits: 375×812, 900×600, 1024×768, 1280×720, 1440×900.

Substituting into the DOM rather than into a catalogue is deliberate: no
`src/content/*-pl.ts` exists, and width is a property of the glyphs and the CSS, not
of the localizer.

### 4.2 The status strip: the official word is the **shorter** one

Intrinsic text width in the strip's own computed face (11px system-ui, uppercased,
1.54px tracking — `.ui-eyebrow.ui-stat__label`):

| String | Characters | Width |
| --- | --- | --- |
| `Prisoners` (English today) | 9 | **76.8px** |
| `Więźniowie` (corpus candidate) | 10 | **85.2px** |
| `Osadzeni` (the ruling) | 8 | **70.1px** |

**JUDGEMENT is not needed for this one.** *Osadzeni* is 15.1px narrower than
*Więźniowie* and 6.7px narrower than the English the strip is laid out for. Measured
end to end on the strip's scroller at 375×812: English overflows by 941px,
*Więźniowie* by 949px, *Osadzeni* by **934px** — the official word is the only one of
the three that makes the strip *less* crowded.

The ruling's premise — *"Osadzeni … longer than Więźniowie"* — is true of the
singular and false of the plural, and the status strip takes the plural.

### 4.3 The strip could not have decided it anyway

`.hud-strip__metrics` is `overflow-x: auto` with `flex: 1; min-width: 0`, so the
metrics row absorbs any excess by scrolling, and `tests/browser/ui-shell.spec.ts`
asserts that it does — `expect(layout.metricsScrollWidth).toBeGreaterThan(layout.metricsClientWidth)`
at 375×812. Measured on the harness's `BASE_VIEW_MODEL` (eight metric chips), the
row is over-full in **English** at every viewport in the set: 941px of overflow at
375×812, 776 at 900×600, 652 at 1024×768, 396 at 1280×720 and **236px at 1440×900**,
where the last two chips (`Funds`, `Earned today`) already end at x = 1327.9 against a
metrics box ending at x = 1092.5.

**That is a measurement and not a diagnosis.** It was taken on the harness fixture,
which mounts every metric at once; whether a live session shows all eight, and whether
a chip past the visible edge is a defect or the affordance working as designed, are
both questions this record did not ask and cannot answer from here. What it does
settle is the narrow point it was taken for: **against 236–941px of existing
overflow, a ±15px label cannot decide anything.**

### 4.4 The roster: one monospace character, against 49px of slack

`hud.regime.roster-unnamed` renders into `.hud-regime__roster-name`, computed 13px
`ui-monospace` — so every glyph is 7.8px and the arithmetic is exact:

| String | Characters | Width |
| --- | --- | --- |
| `Prisoner 8` | 10 | 78.0px |
| `Więzień 8` | 9 | 70.2px |
| `Osadzony 8` | 10 | **78.0px** — exactly the English |
| `Osadzony 128` | 12 | 93.6px |
| `Delphine Vanderweghe` (the fixture's longest real name) | 20 | 156.0px |

Here the ruling's premise **is** right: *Osadzony {id}* is one character — 7.8px —
wider than *Więzień {id}*. And it is free. The name column is 143px at 1280×720 and
238px at 375×812, so a three-digit *Osadzony 128* leaves **49.4px** of slack at the
narrowest desktop column, and the label would need a nine-digit entity id before it
reached the column's edge.

Measured end to end at all five viewports with the four-row fixture, English against
*Więzień 8*, *Osadzony 8* and *Osadzony 128*: `lastLineBottom`, `panelVisibleBottom`,
`panelOverflow`, every row height and every name box are **byte-identical across all
four cases at all five viewports** — e.g. at 1280×720, `lastLineBottom=629.8`,
`panelVisibleBottom=637.7`, `panelOverflow=0`, rows `[44.7, 27.5, 27.5, 44.7]` for
every one of them. Every badge stays inside the panel in every case.

The reason is already recorded in the tree: `.hud-regime__roster-name` is
`white-space: normal; overflow-wrap: anywhere`, and `hud.css`'s own comment on
`.hud-regime__roster-text` carries the measurement — *"a 38-character unbroken given
name still left every badge inside the panel at all five viewports the browser
suite visits"*. **VERIFIED.**

### 4.5 The tab bar carries no key from this question at all

`HUD_TAB_IDS` is `['overview', 'build', 'rooms', 'security', 'regime']`
(`src/ui/hud/hud-state.ts:34`), and the five labels are `hud.tab.overview`,
`hud.tab.build`, `hud.tab.rooms`, `hud.tab.security`, `hud.tab.regime`
(`src/content/default-locale-en.ts:201-209`). **No tab is named for the population.**
**VERIFIED.** So ADR 0022's constraint, which is what the ruling was worried about, is
not reachable from Q1 in either direction. It is Q5's constraint, and §5 below re-asks
Q5 with what the same run measured.

### 4.6 The finding

**Width does not constrain the criterion. It is free on both sides.** The official
word is *cheaper* where the pressure is (the strip, by 15.1px) and costs one monospace
character where there are forty-nine pixels spare (the roster). Neither figure is
close to anything.

---

## 5. A finding for the owner: Q5's evidence has changed, and Q5 is re-asked

**This is not an answer to Q5.** The tab bar's Polish is player-facing copy and stays
the owner's. But the same run measured the thing Q5 rests on, and the measurement no
longer says what Q5 says it says.

### 5.1 What Q5 and the tree currently claim

The corpus's Q5, and its §7 third claim, rest on a browser assertion firing:

> *"ADR 0022 measured the tab bar at 375×812 spanning x = 1.8 … 373.2 with a fifth
> tab, and `default-locale-en.ts` records the consequence: 'a nine-character label
> such as "Logistics" would put the bar at x = −9.5 and fail the assertions in
> `tests/browser/ui-shell.spec.ts`'."*

The tree says it twice. `src/content/default-locale-en.ts:205-208`, above
`'hud.tab.rooms'`, and `src/ui/hud/hud-state.ts:15-21`:

> *"`.hud-tabs__inner` spans x = 1.8 .. 373.2 at 375x812, which is 1.8px of margin per
> side, so a **sixth tab is foreclosed** at that viewport and a label longer than
> "Rooms" would already fail `tests/browser/ui-shell.spec.ts`'s `tabs.x >= 0` /
> `tabs.right <= 375` pair."*

**VERIFIED** as quotations.

### 5.2 What the bar measures today

At 375×812 on this branch, `.hud-tabs__inner` spans **x = 12.0 … 363.0** — 12px of
margin per side, not 1.8. Substituting `Pomieszczenia` (13 characters) for `Rooms`:

| Label | Bar span at 375×812 | `tabs.x >= 0` | `tabs.right <= 375` |
| --- | --- | --- | --- |
| `Rooms` | 12.0 … 363.0 | pass | pass |
| `Strefy` | 12.0 … 363.0 | pass | pass |
| `Pomieszczenia` | **12.0 … 363.0** | **pass** | **pass** |

**The assertion pair does not fire.** The bar does not move at all. What happens
instead, measured on the same run:

- `Overview`'s label is drawn at **x = 9.8 … 80.7**, starting **2.2px outside the
  bar's own left edge** at 12.0, and is clipped there.
- `Pomieszczenia`'s label runs to x = 243.6 while `Security`'s label begins at
  x = 233.3 — **the two words overlap by 10.3px**, drawn on top of each other.
- Every tab button shrinks: `Overview` goes 80.1px → 64.4px around a label that needs
  70.9px; the `Pomieszczenia` button is 92.6px around a label of 110.7px.

At 900×600 and above the bar simply grows instead (213.5 … 686.5 at 900×600) and
stays inside the viewport, so no assertion fires at any viewport in the set.

### 5.3 The mechanism, and when it changed

`.hud__tabs { max-width: 100%; box-sizing: border-box; }` and `.hud-tabs__inner`'s
`max-width: 100%` with `overflow: hidden` are what bound the bar to the viewport, and
`hud.css`'s own comment on `.hud-tabs__inner` describes this outcome exactly:

> *"`justify-self: center` on `.hud__tabs` sizes the bar to `fit-content` of the grid
> column, so a row of tabs wider than the viewport is squeezed into a box it does not
> fit -- and this element's own `overflow: hidden`, which is what keeps the tabs inside
> the rounded corners, then *clips* the ones that do not fit."*

**VERIFIED.** `.hud__tabs`'s `max-width` was added by `2a00f98`, *"Make the interface
scale a control that changes the interface (#579)"*, which is on `origin/main`
(`git merge-base --is-ancestor 2a00f98 origin/main` succeeds). The comment goes on to
say the rule is *"inert"* at 100% because *"the five tabs fit every viewport the
browser suite visits"* — which is true of the five **English** labels and is the
condition a Polish catalogue would remove.

**Stated as a measurement, separately from any diagnosis.** What was measured: the
assertion pair passes with a 13-character label, and the labels clip and overlap. What
this record did **not** establish: whether that is a defect, whether ADR 0022's 1.8px
was measured on a tree whose CSS since changed (it was taken on a local #282+#283
merge with a fifth tab *injected*, which the ADR says plainly), or what the right fix
is. Those need somebody who owns `src/ui/**`.

### 5.4 So Q5 is re-asked, not answered

Q5 was: *may `hud.tab.rooms` be **Strefy** (six characters) because **Pomieszczenia**
(thirteen) does not fit?* The corpus's §7 named this its third-weakest claim and said,
in the author's words, *"I would rather be overruled here than have picked a Polish
word to fit a browser assertion without saying so."*

**The browser assertion it was fitted to does not fire.** That does not make
*Pomieszczenia* usable — it makes the failure mode *silent* rather than loud, which is
worse to ship and cheaper to discover. Both directions are now on the record:

- **What the corpus said:** *Strefy* is a compromise picked for a measured six-character
  budget, and the honest word is *Pomieszczenia*.
- **What this measurement changes:** the six-character budget is not enforced by the
  assertions the corpus cites, and a 13-character label instead overlaps its neighbour
  by 10.3px and clips `Overview` by 2.2px at 375×812.
- **What is still the owner's:** whether to take *Strefy*, take *Pomieszczenia* and
  widen or wrap the bar, or take a third word. **Q5 stands open.**

---

## 6. R1, and the masculine the ruling did not touch

**R1 survives the criterion untouched, and the criterion does not reach it.**

R1 is `hud.alert.event.prisoners.relocated` — ADR 0076's relocation notice, the
owner's own approved English sentence, and the corpus's one Class B item. It is an
`event-` row, so the criterion puts it on the *więzień* side — and then finds nothing
to do, because the candidate
*"{name} — nie było gdzie spać. Nowe miejsce: {room}."* names `{name}` and never names
the class. **The ruling changes no word of R1**, and R1 stays Class B for the reason
the corpus gives: the Polish says the same thing in a different grammatical shape from
the sentence the owner approved, and that is a copy decision.

**Q1's second half is untouched too, and it is the same wall.** Both words are
masculine. `src/simulation/identity/name-pool.ts:35` records that there is *"no gender
model anywhere in the simulation to attach them to"* — **VERIFIED** — and the pool
mixes 'Adan', 'Bram', 'Gustav', 'Omar' with 'Alma', 'Carla', 'Marta', 'Wanda' in one
flat list with no gender field. So `hud.regime.roster-unnamed` will label *Wanda Kowal*
as *Osadzony 3*, exactly as it would have labelled her *Więzień 3*.

**Reporting the wall's shape, as asked, and inventing nothing.** Three observations,
and the third is the only one that is new:

1. **The criterion concentrates the problem rather than spreading it.** The only key
   where the masculine attaches to a *specific, named, possibly-female person* is
   `hud.regime.roster-unnamed`, and §3.1 sends that key to the official word. The other
   ten label a *class* (`actor-kind.prisoner.name` labels a kind, not a person), where
   the masculine generic is unremarkable in Polish. **JUDGEMENT.**
2. **Every impersonal device the corpus reaches for is a symptom of the same wall**,
   not of six separate problems: *nikogo*, *kogoś*, *ktoś*, the whole `-no`/`-to`
   family, *osoba* at `hud.security.roster-hint`, *przybysz* at `hud.intake.hint`. §2's
   finding that sixty-five refusals name nobody is that wall, measured.
3. **The ruling happens to pick the word that is cheaper to fix later.** *Osadzony* is
   an **adjectival** noun, so its feminine is *Osadzona* — one letter, and a future
   gender field would need `Osadzon{y|a}` and a plural `Osadzen{i|e}`. *Więzień* is a
   plain noun whose feminine is a different lexeme, *więźniarka*, which in ordinary
   Polish also means a prison transport van. **JUDGEMENT**, and offered as an
   observation about a decision already taken on register grounds, not as an argument
   for reopening it. **No gender model is proposed here and none should be inferred**;
   that is architecture, it is `src/simulation/`'s, and it needs an ADR and the owner.

---

## 7. What this record does not do

- **It creates no `src/content/*-pl.ts`.** Twelve questions remain open — Q2 (prison
  slang), Q3 (*Kontrabanda* / *Przedmioty niedozwolone*), Q4 (*Zajścia* / *Incydenty*),
  Q5 (the tab bar, re-asked in §5), Q6 (gendered job titles), Q7–Q13 — and `AGENTS.md`
  reserves player-facing copy.
- **It answers none of them.** §5 sharpens Q5's evidence and re-asks it. That is the
  only question it touches.
- **It does not touch `src/`.** Two sentences in `src/` are now false as measured; they
  are handed over in §9 rather than corrected here.
- **It proposes no gender model** and no change to the name pool.

---

## 8. The weakest claim

**The weakest claim is §3.1's fourth row: that `hud.intake.admit` is a label.**

It is the one key in the eleven where the criterion has to be *applied* rather than
read off. The other ten are unambiguous: five are enum values produced by
`SIMULATION_ENUM_GROUPS` and therefore labels by the repository's own definition; four
are headings and manifest entries with no verb; one is a record identifier.
`hud.intake.admit` is *"Admit a prisoner"* — an imperative with an object, which is a
short sentence wearing a button's clothes. I read it as a label because the register of
a control is the operator's, and *Przyjmij osadzonego* is what a Polish institution's
own console would say. **JUDGEMENT.**

**What would change my mind:** if the owner reads the Intake panel's controls as the
game talking to the player rather than the interface labelling an action — which is a
defensible reading, and its neighbour `hud.intake.hint` is unambiguously prose. If so,
`hud.intake.admit` moves to *więzień*, the count becomes ten-and-two, and the criterion
gains a fourth clause distinguishing a control's object from a control's name. Nothing
else in §3 moves with it, and §4's measurements are unaffected.

**Two smaller claims, ranked below it.**

- **That the label/prose line is stable enough to carry a register decision.** It is
  tested for enum groups and argued at length in the exemption table, but the test
  gates *which module a key is authored in*, not what register its text takes. A key
  authored as prose that a panel later renders as a badge would drift, and nothing
  would fail. **What would change my mind:** an existing key that is authored as a
  sentence and rendered as a label. I did not find one; I did not enumerate every
  render site to prove there is none.
- **That §4.3's strip overflow figures generalise.** They were taken on
  `BASE_VIEW_MODEL`, the harness fixture, at eight chips. A live session with fewer
  metrics would overflow less, and at some chip count the strip stops scrolling and the
  ±15px starts to matter. **What would change my mind:** a measurement on the assembled
  page with a real session. It would not change §4.2 or §4.4, which are text widths and
  panel geometry, not fixture-dependent.

---

## 9. Handed over

- **Two sentences in `src/` are false as measured**, and `src/` is out of bounds on
  this branch. `src/content/default-locale-en.ts:205-208` and
  `src/ui/hud/hud-state.ts:15-21` both say a label longer than "Rooms" *"would already
  fail `tests/browser/ui-shell.spec.ts`'s `tabs.x >= 0` / `tabs.right <= 375` pair"*.
  Measured at 375×812 on this branch, a 13-character label leaves the bar at
  12.0 … 363.0 and both assertions pass; the label clips and overlaps instead (§5.2).
  The mechanism is the `max-width: 100%` + `overflow: hidden` pair on
  `.hud-tabs__inner`, whose own comment in `hud.css` already describes the clip. This
  is a documentation-versus-code disagreement, not a proposal to change the CSS.
- **The corpus's §7 third claim is superseded in one direction only.** *"That `Strefy`
  is an acceptable `hud.tab.rooms`"* rests on a six-character budget enforced by an
  assertion that does not fire. The claim's *conclusion* may still be right — a
  13-character tab overlaps its neighbour — but its *reason* has changed. Marked in the
  corpus rather than rewritten.
- **For whoever wires a `pl` catalogue (#664):** the criterion in §1 is the thing to
  put in the catalogue file's own header comment, next to the corpus's §6 conventions.
  A future key's author needs one sentence, not this document.
