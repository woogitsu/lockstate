# Candidate Polish translations for the default catalogue

**2026-08-30. Issue [#661](https://github.com/matmaxalez/lockstate/issues/661). ADR 0011 is the governing decision. Branch `agent/661-polish-candidates`.**

---

## 0. Nothing here is approved

> **Amended 2026-08-30, after the owner ruled on Q1.** One of the thirteen questions
> has been answered — the mixed register: *osadzony* in official labels, *więzień* in
> event text and flavour. **Twelve remain open and nothing else here is approved.**
> This document is left as the record of what was recommended *before* that ruling;
> every place the ruling changes something is marked in both directions rather than
> overwritten, and the criterion that decides which word any key takes lives in its own
> record, [which word for a prisoner](./2026-08-30-which-word-for-a-prisoner.md). That
> record also re-took one measurement this document leans on — Q5's tab bar — and it
> came back different; §3's Q5 and §7's third claim carry the correction.

**Every Polish string in this document is a candidate. None of it is a
translation this project has agreed to ship, and none of it may be wired up.**

That is not a disclaimer, it is the point of the exercise. `AGENTS.md`'s fourth
exclusion reserves *"anything that reaches a player as a promise the code does
not keep"* to the owner, and #661 says in its own words what the failure would
look like here: **a machine-translated catalogue merged without the owner's pass
would be exactly the failure `AGENTS.md` is about — in the one language the
owner can judge better than anyone.** A Polish string this repository cannot
argue about is worse than an English one it can.

So this pass deliberately produced **no `src/content/*-pl.ts`**. A catalogue file
sitting in `src/content/` in the shape of `default-locale-en.ts` invites the next
agent to import it, and #664's gates — the ones that would prove a `pl` catalogue
is complete, well-formed and reachable — do not exist yet. `src/` was not touched
at all on this branch.

**How to read this.** §1 is the reshape list and is the most valuable part: every
key whose *sentence* has to change, why the literal rendering fails, and what is
proposed instead. §2 is the plural finding, which is not what the issue expected.
§3 is the list of things only the owner knows, asked rather than guessed. §4
corrects three of the brief's own numbers. §5 is the 579 candidates, grouped by
panel so they can be read in sittings. §6 states the conventions the whole
catalogue follows, §7 names the weakest claim.

**Evidence tiers** (`docs/research/README.md`): every claim below about *this
repository* is **VERIFIED** — the file was opened and the line read, and the
citation is given. Every claim about *Polish* is the author's own judgement and
is marked **JUDGEMENT**; it is exactly the tier the owner is being asked to
overrule.

---

## 1. The reshape list — eleven sentences that cannot survive a literal rendering

**The problem, restated.** Polish inflects. A catalogue built from parameter
substitution puts a noun into a sentence without knowing what the sentence will
do to it: *Cela* is the nominative, but *"moved to Cell"* is **do celi**
(genitive) and *"in the Cell"* is **w celi** (locative). The localizer
substitutes one string, so it can only ever produce the nominative.

**#661 says do not solve this by adding grammatical-case machinery, and it is
right — but the cheaper answer is cheaper than the issue assumed.** In every one
of the eleven cases below, the fix is a *punctuation-and-frame* change that puts
the parameter where Polish leaves it alone: after a colon, after a middle dot,
after `×`, or as the grammatical subject. Polish label-and-colon (`Zatrudnij:
Strażnik`) is idiomatic in exactly the places a game UI needs it — a button, a
row, a badge.

**Two classes, and only one of them needs the owner to change English.**

- **Class A — Polish-only reshape.** The `pl` catalogue writes a different
  sentence with the *same parameters*. The English key is untouched, the call
  site is untouched, nothing in `src/` moves. Ten of the eleven are Class A. This
  is possible because ADR 0011 keeps the message *key* stable and lets the
  *text* differ freely per locale — the property that makes a second locale a
  text change and nothing else. **VERIFIED**: `Localizer.format` reads
  `catalog.messages[key]` per locale through the fallback chain and does nothing
  else with the template (`src/services/localization/localizer.ts:115-121`).
- **Class B — the English or the code has to change too.** One case. It is R1.

### R1 — `hud.alert.event.prisoners.relocated` · **Class B, and the owner wrote this sentence**

> `{name} had nowhere to sleep and moved to {room}.`

Two independent failures, and the second is the one that cannot be reshaped away
without a decision.

**(a) `{room}` must decline.** *"moved to Cell"* is **przeniósł się do celi** —
genitive. `{room}` arrives as the room catalogue's own `nameKey`, resolved by the
renderer, so it is always the nominative *Cela*. **VERIFIED**:
`eventParameterMessages` returns `room: { key: event.roomNameKey }`
(`src/ui/simulation-events.ts:477`).

**(b) `{name}` is the subject of a past-tense verb, and Polish past tenses inflect
for gender.** *Adan had* is **Adan nie miał**; *Alma had* is **Alma nie miała**.
There is no third form. **VERIFIED**, and the repository says so itself:
`src/simulation/identity/name-pool.ts:35` — *"no gender model anywhere in the
simulation to attach them to"* — and the pool at `:71-76` mixes 'Adan', 'Bram',
'Gustav', 'Omar' with 'Alma', 'Carla', 'Marta', 'Wanda' in one flat list with no
gender field. So there is no parameter to select on and nothing to add one from.

**Proposed:** `{name} — nie było gdzie spać. Nowe miejsce: {room}.`

*"nie było"* is the Polish impersonal — literally *"there was nowhere to sleep"* —
which has no subject and therefore no gender. `{name}` becomes a heading rather
than a subject; `{room}` lands after a colon, in the nominative it actually
arrives in. Same two parameters, same facts, same order.

**Why this is Class B and not Class A:** the English sentence is *the owner's own,
approved on 2026-08-30 and reproduced exactly*, and ADR 0076's Status reserved it
— *"whoever implements relocation must put the question rather than invent the
string"*. The Polish above is not a translation of that sentence; it says the same
thing in a different grammatical shape. **That is a copy decision, not a
linguistic one, and it is the owner's.** The English does not have to change for
the Polish to work — but the owner should know the two versions no longer have the
same shape.

### R2 — `hud.alert.event.incidents.riot-opened` · Class A

> `A riot has broken out — {count} prisoners have stopped taking orders.`

The English comment already refuses a plural here: *"this localizer has no plural
rules, so a figure that can be 1 would read '1 prisoners'"*, and rests on
`DEFAULT_MINIMUM_RIOT_PARTICIPANTS`. **VERIFIED**: that constant is `2`
(`src/simulation/incidents/trigger-system.ts:96`).

Two is exactly where Polish gets harder, not easier. **2, 3, 4 → *dwóch
więźniów przestało* is wrong; it is *dwaj więźniowie przestali*. 5+ → *pięciu
więźniów przestało*.** Both the noun and the verb change. The English's own
escape hatch — pick a range where one form is always right — does not exist in
Polish, because the range starts at the boundary.

**Proposed:** `Wybuchł bunt — liczba uczestników: {count}.`

The numeral becomes the value of a labelled field, where nothing agrees with it.
It says less than the English (*"stopped taking orders"* is gone) and it is
correct at every count. The alternative is plural forms — §2 explains why they
would not be selected.

### R3 — the imperative-plus-object family · Class A · 5 keys

`hud.build.step-down`, `hud.build.step-up`, `hud.rooms.step-down`,
`hud.rooms.step-up`, `hud.security.hire`

> `Decrease {field}` / `Increase {field}` / `Hire {role} · {total}`

A Polish imperative takes the **accusative**: *Zmniejsz szerokość*, *Zatrudnij
strażnika*. `{field}` and `{role}` are both other catalogue keys resolved to their
nominative form. **VERIFIED for `{field}`**: `build-panel.ts:1164` passes
`field: t(HUD_MESSAGE_KEY.buildBuyQuantity)`, `:1664` and `:1675` pass the two
tile labels, `rooms-panel.ts:716` passes the field's own label. **VERIFIED for
`{role}`**: `staff-panel.ts` resolves the role key the same way.

*Strażnik* → *strażnika* is an animate masculine accusative, which is never equal
to the nominative — so `Zatrudnij {role}` is wrong for **every** current role.

**Proposed:** `Zmniejsz: {field}` / `Zwiększ: {field}` / `Zatrudnij: {role} · {total}`

**A near miss worth recording, because it is the trap in this family.** With the
five field labels this catalogue happens to have — `Pole X`, `Pole Y`, `Ilość`,
`Szerokość`, `Wysokość` — the colon is not strictly necessary: masculine inanimate
nouns and feminine nouns in *-ość* have accusative = nominative, so `Zmniejsz
Szerokość` is accidentally correct. It stops being correct the moment somebody
labels a field *Liczba* (accusative *liczbę*) or *Krawędź*… and nothing would
fail. **That is why the colon is proposed rather than the shorter form**: the
short form is a grammar rule disguised as a naming convention. Note also that this
is why `hud.build.buy-quantity` is proposed as **Ilość** and not **Liczba**.

### R4 — the two-figure summary rows · Class A · 4 keys

`hud.build.queue-count`, `hud.build.deliveries-count`,
`hud.security.held-summary`, `hud.status.coverage-detail` (**the last of these
was deleted on 2026-08-31** by the owner's ruling 21 and is kept in this list
because the rule below was derived from all four)

> `{count} waiting · {started} being built` · `{held} held · {unassigned} free`

English puts the numeral first and a participle after it. Polish participles
agree in number and gender with what they describe, and *what they describe is a
count* — `1 czekające`, `2 czekające`, `5 czekających`. Reversing the pair costs
nothing and fixes all four.

**Proposed:** `Czeka: {count} · W budowie: {started}`, `Kupione: {count} · Zwrot przy anulowaniu: {total}`, `Na służbie: {held} · Bez przydziału: {unassigned}`, `Niedobór obsady: {understaffed} · Bez obsady: {unguarded}`

### R5 — the numeral-before-a-verb family · Class A · 3 keys

`hud.intake.no-place`, `hud.intake.pipeline-failed`, and (services layer)
`save-slots.over-capacity`

> `{count} waiting with no bed to sleep in` · `{count} cannot be housed at all`

**Polish verbs agree in number with the numeral, and the rule flips at five.**
*2 czekają* (plural), *5 czeka* (singular neuter). One string cannot be right at
both. English has no equivalent — *"2 waiting"* and *"5 waiting"* are the same
word — which is precisely why the English catalogue never had to think about it.

**Proposed:** `Bez łóżka do spania: {count}` · `Nie da się nigdzie umieścić: {count}`

The first moves the numeral out of the verb's way entirely. The second uses *nie
da się*, the Polish impersonal, which agrees with nothing at all.

### R6 — `hud.intake.pipeline-stage` · Class A

> `{count} at {stage}`

*"at"* → **na etapie** + locative: *na etapie klasyfikacji*, not *na etapie
Klasyfikacja*. `{stage}` is the resolved `intake-stage.*.name`. **VERIFIED**:
`intake-panel.ts:159` — `t(HUD_MESSAGE_KEY.intakePipelineStage, { count: stage.count, stage: t(stage.labelKey) })`.

**Proposed:** `{count} — etap: {stage}`

### R7 — see R4. *(kept as its own number so the table cross-references resolve; the two are one fix.)*

### R8 — the preposition-plus-catalogue-name family · Class A · 4 keys

`hud.regime.roster-heading`, `hud.regime.block-allows`,
`hud.regime.block-progress`, `hud.rooms.needs-room`

> `Heading to {activity}` · `Allows {categories}` · `{room} at {x}, {y} is missing`

`Heading to {activity}` is the hardest of the four and the clearest illustration
of why case machinery would not even be enough. Polish needs **both a case and a
preposition that depend on the destination**: *do stołówki* (to the canteen,
genitive, *do*), *na spacerniak* (to the yard, accusative, *na*), *pod prysznic*
(to the shower, accusative, *pod*). A grammatical-case system that knew every
noun's declension would still have to know which preposition each noun takes.
**This is the key that would justify the ADR #661 says not to write, and it does
not need one — it needs a colon.**

`Allows {categories}` is *pozwala na* + accusative, applied to a list joined at
render time. **VERIFIED**: `regime-panel.ts:344` joins the resolved category
labels with `hud.regime.category-separator` and substitutes the finished string.

**Proposed:** `W drodze: {activity}` · `Dozwolone: {categories}` · `Postęp bloku: {percent}%` · `{room} ({x}, {y}) — brakuje:`

**A consequence the owner should see: this decides what the `action.*` labels
are.** Once the wrapper is `W drodze: {activity}`, the activity has to be a noun
— so `action.sleep` becomes **Spanie** rather than *Śpi*. Polish present-tense
verbs are genderless and would otherwise have been the natural choice for a
roster cell (*Śpi*, *Je*, *Bierze prysznic*), and they read better bare than
verbal nouns do. The colon buys correctness and costs some life. See **Q9**.

### R9 — three English verbs, three different Polish verbs · Class A · 6 keys

`hud.security.held-release`, `hud.security.roster-dismiss`,
`hud.alert.refusal.release-guard.*`, `hud.alert.refusal.dismiss.unknown-staff`,
`hud.refusal.release-guard`, `hud.alert.event.prisoners.discharged`

English uses **release** for taking a guard off a post, **dismiss** for ending
someone's employment, and **released** again for a prisoner whose sentence is
served. Polish has a separate verb for each and *zwolnić* covers two of the three:
**odwołać** (a guard from a post), **zwolnić** (dismiss a staff member) and
**zwolnić** (release a prisoner). Two controls sitting in the same panel would
therefore both read *Zwolnij*.

**Proposed:** the guard control reads **Odwołaj** and the payroll control reads
**Zwolnij**, and every refusal sentence follows its own control. This is not a
reshape of a sentence — it is a vocabulary split English never had to make, and
it is the reason `hud.security.held-release` and `hud.security.roster-dismiss`
are different words in the tables below where English gives them near-synonyms.

### R10 — `{width} × {height}` followed by a noun · Class A · 3 keys

`hud.rooms.area-value`, `hud.rooms.minimum`, `hud.rooms.too-small`

> `{width} × {height} tiles at {x}, {y}`

After a product, Polish wants the genitive plural — *10 × 8 pól* — which is right
for everything **except 1 × 1**, where it must be *1 × 1 pole*.

**This matters for exactly one of the three, and the difference is measurable.**
`hud.rooms.minimum` and `hud.rooms.too-small` render a room type's authored
minimum, and **VERIFIED**: no room in `src/content/room-catalog.ts` has a
`minWidth` or `minHeight` of 1 — the smallest is the cell's `2 × 3` at `:94`, and
the eighteen values range from 2 to 8. So *pól* is correct for every value the
game can currently produce there, and the risk is a future room, not a present
bug. `hud.rooms.area-value` renders **the player's live drag**, which is 1 × 1
the instant they press.

**Proposed:** `Pola: {width} × {height}, w {x}, {y}` for the drag — the noun moves
in front of the product, where nothing agrees with it. The other two keep the
genitive plural but drop into a labelled form anyway (`Minimalny rozmiar: {width}
× {height}`) so the whole rule block reads as one series.

### R11 — `save.detail.restored-scope` · Class A · **the subtlest one**

> `Restored: {restored}. Not carried by this save version: {notCarried}.`

The thirteen `save.scope.*` strings are **spliced into both halves of this
sentence**, joined with `', '` by `describeRestoredScope`. In Polish the two
halves demand **two different cases of the same list**: *Przywrócono* takes the
accusative, *nie przenosi* takes the genitive. One string cannot be both, and
there is no reshape of the *items* that fixes it — the fix has to be in the frame.

**Proposed:** `Przywrócone: {restored}. Nieprzeniesione przez tę wersję zapisu: {notCarried}.`

Both frames become **labels**, so both lists stay nominative. The thirteen items
are then written as bare nominative noun phrases (*takt jądra i kolejka poleceń*),
which is what §5.20 proposes.

**Note for the owner:** #226's ruling was *"Do not 'improve' these sentences here;
change the report, if it should change, as its own decision"* — that ruling is
about the **English**, which this pass does not touch. The Polish is new text and
has no frozen predecessor.

### Keys the issue expected to need reshaping, that do not

Three, and they are worth recording because each is a place where the English
catalogue's own shape already dodged the problem.

1. **`Buy {count} × {material}`.** #661 gives this as a trap — *"2 cegły / 5
   cegieł — the material declines with the count"*. It does not, **because the
   English uses `×` rather than a bare numeral**. *2 × Cegła* is ordinary Polish
   receipt-and-order-list notation and keeps the nominative. The same holds for
   `hud.build.delivery`, `hud.rooms.requires-object`, `hud.rooms.needs-object`
   and `hud.build.target-run`. The `×` is worth defending in any future copy
   change: it is load-bearing for this locale.
2. **`Costs {total} now and {wage} a day in wages.`** #661 quotes this as a key.
   **It is not in the catalogue.** No key in `default-locale-en.ts` contains the
   word "wages" in that shape; the nearest are `hud.security.hire-hint` (*"Taken
   from the treasury on hire"*) and `hud.alert.event.economy.wages-unpaid`. The
   observation behind it stands anyway — *"a day"* is **dziennie**, an adverb —
   and it will apply the moment a payroll panel exists.
3. **`save.list.item` — `{name} ({count} gen)`.** `src/ui/save-panel-messages.ts:47`
   flags this as a real limitation waiting for *"the first locale that needs
   `one`/`few`/`many`"*. Polish is that locale and still does not need it: the
   abbreviation **gen.** does not decline any more than "gen" pluralizes.

---

## 2. Plurals: `few` and `many` are the wrong problem, and here is the right one

#661 opens by saying the plumbing is not the hard part, and cites
`pluralFormsSchema` accepting `zero`/`one`/`two`/`few`/`many`/`other` as evidence
that nothing needs widening. **Both halves are true and the conclusion does not
follow.**

**VERIFIED, three findings, in the order they bite:**

**(1) The content catalogue cannot hold a plural form at all — not in `pl`, not in
`en`.** `default-locale-en.ts` declares `authoredMessages` as
`Readonly<Record<string, string>>` (`:25`) and hands it to
`buildLocalizationCatalog`, whose signature is
`(entries: Readonly<Record<LocalizationKey, string>>) => ReadonlyMap<LocalizationKey, string>`
(`src/content/localization.ts:20-24`). A `PluralForms` object does not typecheck
there. `pluralFormsSchema` lives one tier up, in
`src/services/localization/catalog.ts:15-25`, and governs *fetched* catalogues —
so a `pl` catalogue delivered as versioned data genuinely can carry
`few`/`many`, while the `src/content/` file #661 asks for cannot. The
`save-panel-messages.ts:47` comment already says this about `en`; it is equally
true of `pl`.

**(2) Nothing in the running game calls `formatPlural`.** Grepped across `src/`
and `tests/`: the only occurrences outside `localizer.ts` itself are two comments
and four assertions in `tests/unit/services-localization.test.ts` — which,
tellingly, already test Polish (`'1 więzień'`, `'3 więźniów'`, `'25 więźniów'` at
`:146-148`). The HUD's own interface is
`interface HudLocalizer { format(...); formatNumber(...); }` —
**`src/ui/hud/view-model.ts:1421-1424`** — and `messages.ts:389` states the
consequence outright: *"No plural form: `HudLocalizer` exposes `format` and not
`formatPlural`."*

**(3) `format()` on a plural entry silently takes `other`.**
`src/services/localization/localizer.ts:74` —
`const template = typeof entry.value === 'string' ? entry.value : entry.value.other;`

Put together: **a Polish catalogue could author perfect `one`/`few`/`many` forms
today and every one of them would render as `other`.** Not fall back — render the
wrong form, for every count, with no missing-key report, because the key
resolved.

### The `other` trap, which is specific to Polish

**VERIFIED** by running `Intl.PluralRules('pl')` on this container's Node:

| count | 0 | 1 | 2 | 3 | 4 | 5 | 12 | 22 | 25 | 1.5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| category | many | one | few | few | few | many | many | few | many | **other** |

**In Polish, `other` is the *fraction* form.** *1,5 celi* — genitive singular —
not the genitive plural *cel* that `many` wants. So the natural instinct when
authoring a Polish catalogue ("put the 5+ form in `other`, it's the fallback") is
wrong twice over: it is the wrong form for fractions, and — because of finding
(3) — it is *the only form anybody will ever see*.

### What this pass therefore did

**Every count-bearing key in §5 is written to be correct at every count, with no
plural forms at all.** That is the same discipline the English catalogue already
applies to `hud.security.coverage-short-hint` — *"both sentences are worded to
read correctly at every count rather than at all but one of them"* — carried into
a language where it is much harder and where R2, R4 and R5 are what it costs.

### The keys that would want `few`/`many` if the machinery were wired

Ten keys, all of which are handled by reshape in §5 instead. The forms are given
so the owner can see what is being given up, **and so this list exists if #664 or
a successor ever adds `formatPlural` to `HudLocalizer`**:

| Key | `one` | `few` (2–4, 22–24…) | `many` (0, 5+) | `other` (fractions) |
| --- | --- | --- | --- | --- |
| `hud.status.prisoners-without-bed` | {count} bez łóżka | {count} bez łóżka | {count} bez łóżka | {count} bez łóżka |
| `hud.intake.no-place` | {count} czeka bez łóżka | {count} czekają bez łóżka | {count} czeka bez łóżka | {count} czeka bez łóżka |
| `hud.intake.pipeline-failed` | {count} nie ma gdzie się podziać | {count} nie mają gdzie się podziać | {count} nie ma gdzie się podziać | — |
| `hud.alert.event.prisoners.discharged` | Zwolniono {count} więźnia — kara odbyta. | Zwolniono {count} więźniów — kara odbyta. | Zwolniono {count} więźniów — kara odbyta. | — |
| `hud.alert.event.incidents.riot-opened` | — (unreachable) | Bunt — {count} więźniowie przestali słuchać poleceń. | Bunt — {count} więźniów przestało słuchać poleceń. | — |
| `hud.build.queue-count` | {count} czekające zlecenie | {count} czekające zlecenia | {count} czekających zleceń | {count} zlecenia |
| `hud.build.queue-more` | i jeszcze {count} zlecenie | i jeszcze {count} zlecenia | i jeszcze {count} zleceń | — |
| `hud.build.deliveries-more` | i jeszcze {count} dostawa | i jeszcze {count} dostawy | i jeszcze {count} dostaw | — |
| `hud.security.held-more` / `hud.regime.roster-more` / `hud.rooms.needs-item-more` | i jeszcze {count} | i jeszcze {count} | i jeszcze {count} | i jeszcze {count} |
| `save-slots.available` | {count} wolny slot na więzienie | {count} wolne sloty na więzienia | {count} wolnych slotów na więzienia | {count} wolnego slotu |

Four of the ten collapse to one form in Polish anyway (`{count} bez łóżka`, `i
jeszcze {count}`) — those are the cases where the reshape in §5 costs nothing at
all. The other six are where it costs something, and R2 is where it costs most.

**`save-slots.available` and `save-slots.over-capacity` are the only two keys in
the game that carry plural forms today**, and they live in the services layer
(`src/services/localization/default-catalog.ts:23-31`). They are also **not
rendered by anything** — grepped: no `src/` file outside `default-catalog.ts`
reads either key. So even there, nothing selects a form.

---

## 3. What only the owner knows — thirteen questions, asked rather than guessed

Each of these is a place where a defensible Polish answer exists and picking one
is not a translator's call. They are ordered by how much of the catalogue moves
with the answer.

**Q1 — *więzień* or *osadzony*, and what to do about the masculine.**
**RULED ON, 2026-08-30, and the first half is answered: the mix — *osadzony* in
official labels, *więzień* in event text and flavour
([#661 comment](https://github.com/matmaxalez/lockstate/issues/661#issuecomment-5470901583)).**
The paragraph below is kept exactly as it was written, because it is what was
recommended *before* the ruling and because the ruling is a choice against it. What
changed: the criterion that decides any key, the eleven keys that move and the one
that stays, and the width measurement the ruling asked for, are all in
[2026-08-30 which word for a prisoner](./2026-08-30-which-word-for-a-prisoner.md).
Its finding on the count: **eleven move to *osadzony* and one stays *więzień*** —
`hud.alert.event.incidents.assault-opened`, the only key in 579 on the narrating
side. The paragraph's *"about 12 keys move"* is the right size and the wrong split.
**Its second half — the masculine — is untouched by the ruling and remains open.**

Every prisoner-facing key uses **więzień** below: `hud.status.prisoners`
(*Więźniowie*), `hud.regime.roster-unnamed` (*Więzień {id}*),
`actor-kind.prisoner`, `contraband-holder-kind.prisoner`,
`intelligence-target.prisoner`, `informant-holder-kind.prisoner`. *Osadzony* is
the current official Polish term; *więzień* is the word a game would use. **Both
are masculine**, and (R1) the name pool is half female with no gender field —
so *Wanda Kowal* will be labelled *Więzień 3*. Polish has no fix for this that
is not a rewrite (*Osoba osadzona*), and the masculine generic is normal in
Polish. **Confirming it is deliberate is worth one line from the owner**, because
it is exactly the kind of thing a player notices and a translator cannot decide.
**About 12 keys move.**

**Q2 — register: how much prison slang?**
`room.yard.name` is proposed as **Spacerniak**, which is authentic Polish prison
vocabulary and much more alive than the neutral *Dziedziniec* or *Plac
spacerowy*. The same choice recurs at `action.yard-recreation` (*Spacer*). This
is a tone decision about the whole game, not one room. **What is the register —
institutional, or the wing's own word?**

**Q3 — *Kontrabanda* or *Przedmioty niedozwolone*.**
`hud.status.contraband`, `contraband.*.name` (5), `contraband-state.*` (3),
`contraband-source.*` (5), `save.scope.contraband`. *Kontrabanda* is a loanword
that reads naturally in a game and is not the Polish penitentiary term. **Note
that `contraband-state.*` agrees in gender with whichever noun is chosen** —
*Ukryta* becomes *Ukryte* if the answer is *Przedmioty niedozwolone*. **About 15
keys move.**

**Q4 — *Zajścia*, *Incydenty* or *Zdarzenia nadzwyczajne*.**
`hud.status.incidents`, `hud.alert.event.incidents.all-clear`,
`save.scope.incidents`, and the phrasing of `guard-claim.incident-response`.
*Zdarzenie nadzwyczajne* is the real Polish term and is far too long for a status
chip. **About 6 keys move.**

**Q5 — the tab bar does not fit, and this is a measurement, not a preference.**
**The measurement this rests on was re-taken on 2026-08-30 and no longer says what
this paragraph says it says.** Measured at 375×812 on this branch, `.hud-tabs__inner`
spans x = 12.0 … 363.0, and substituting the 13-character *Pomieszczenia* leaves it at
**12.0 … 363.0** — both assertions the paragraph below relies on (`tabs.x >= 0`,
`tabs.right <= 375`) **pass**. What happens instead is silent: `Overview`'s label is
drawn at x = 9.8, 2.2px outside the bar's own left edge and clipped by
`.hud-tabs__inner`'s `overflow: hidden`, and *Pomieszczenia*'s label overlaps
`Security`'s by 10.3px. The paragraph is kept as written because its *conclusion* may
still stand — thirteen characters do not fit — while its *reason* has changed. Details,
method and the mechanism (`max-width: 100%` on `.hud__tabs`, added by `2a00f98`) are in
[which word for a prisoner](./2026-08-30-which-word-for-a-prisoner.md) §5. **Q5 stays
open and is re-asked there rather than answered.**

ADR 0022 measured the tab bar at 375×812 spanning x = 1.8 … 373.2 with a fifth
tab, and `default-locale-en.ts` records the consequence: *"a nine-character label
such as 'Logistics' would put the bar at x = −9.5 and fail the assertions in
`tests/browser/ui-shell.spec.ts`"*. **That measurement was taken on English.**
The honest Polish for `hud.tab.rooms` is *Pomieszczenia* — thirteen characters.
The table proposes **Strefy** (six, the exact budget) and **Rozkład** for
`hud.tab.regime`, both of which are compromises chosen for width. **This is the
one place in the catalogue where a Polish word is picked because of a browser
test.** The owner may prefer to widen the bar; that is a layout change and is not
this pass's to make.

**Q6 — gendered job titles.** `staff-role.nurse.name` is proposed as
**Pielęgniarz** (masculine) purely because a choice had to be made;
*Pielęgniarka* is the far more common word and is feminine. Same question, less
sharply, for `staff-role.kitchen-staff.name` — English names a collective
("Kitchen Staff") but the control hires one person, so **Kucharz** is proposed
over *Personel kuchni*.

**Q7 — `brand.stage` = `PRE-ALPHA`.** Left untranslated. *PREALFA* exists in
Polish and looks odd; *WERSJA WSTĘPNA* is accurate and long. It is on the brand
badge next to an untranslated wordmark, which argues for leaving it.

**Q8 — two families whose grammatical gender cannot be determined from the code.**
`grade.*.name` (5) has **no consumer at all** — `grade.` appears in no `src/ui/`
file, so nothing on screen says whether these modify *poziom* (masculine),
*kategoria* (feminine) or *strefa* (feminine). The adjectives below guess
masculine. `door-side.*` (2) has the same problem in miniature: *Lewa*/*Górna*
agree with *krawędź*; if they ever label a *bok* they become *Lewy*/*Górny*.
**Neither is a translation question and neither can be answered by reading more
code.** They are marked and left.

**Q9 — the `action.*` labels, and the liveliest option is the one R8 rules out.**
Polish present-tense verbs carry **no gender** — *Śpi*, *Je*, *Bierze prysznic* —
which would have made the roster column both correct and vivid, and would have
sidestepped R1's problem entirely for these eleven keys. `hud.regime.roster-heading`
wraps them (*"Heading to {activity}"*), and a wrapper cannot take a verb, so §5
proposes verbal nouns instead: *Spanie*, *Jedzenie*, *Kąpiel*, *Spacer*. **The
alternative is to let the two forms differ** — a verb bare in the cell and a noun
after the wrapper — which needs a second key and a call-site change, and is
therefore a decision rather than a translation. There is a second, smaller half:
English distinguishes the action *"Association"* from the category *"Free
Association"*, and Polish has to invent that distinction (proposed: *Wspólny
czas* against *Czas wolny*).

**Q10 — five terms of art, each with a defensible alternative.**
`room.holding-cell` **Cela przejściowa** / *Areszt*; `room.infirmary`
**Ambulatorium** / *Izba chorych*; `staff-role.warden` **Naczelnik** / *Dyrektor*
(the current official title); `room.reception` **Przyjęcia** / *Punkt przyjęć*;
`intake-stage.accommodation-assignment` **Przydział celi** / *Rozmieszczenie*.

**Q11 — money.** `hud.status.funds` = **Środki**, against *Budżet* (implies a
plan the game does not model) and *Kasa* (colloquial, and closer in tone to
Q2's answer if that answer is "the wing's own word").

**Q12 — informal or impersonal address.** Polish has to choose where English does
not. This pass uses **informal *ty*** throughout — *nie należy do ciebie*,
*Zatrudnij*, *Możesz to zmienić* — which matches the English's directness. The
alternative is the impersonal (*nie należy do gracza*, *do zatrudnienia*), which
is what Polish office software does and would read colder. **This governs roughly
forty keys** and is the single answer that changes the most text.

**Q13 — `challenge.result.rejected`'s `{reason}`.** Nothing in the tree
establishes whether `{reason}` arrives as a message key (translatable) or as raw
text (not). Unlike `{detail}`, whose English `Error` origin is documented in
`default-locale-en.ts`, this one has no note and no producer this pass found. The
Polish is written to work either way, but the sentence would be better if the
answer were known.

---

## 4. Three corrections to the brief

**A measurement, not a complaint.** Each is stated with what was run.

**(1) `default-locale-en.ts` exports 563 keys, not 387.**

The 387/388 figure counts `authoredMessages` — the literal object in the file.
The module's *export* merges `simulationEnumMessages()` on top of it:

```
const derivedMessages = simulationEnumMessages();
export const defaultLocaleEnCatalog = buildLocalizationCatalog({ ...authoredMessages, ...derivedMessages });
```

Measured by bundling the module with esbuild and counting the exported Map:

```
all 563   derived 175   authored 388
```

(The literal object holds **388**, one more than the issue's counted 387 — most
likely a key added between the count and the writing.) The derived 175 are real
translation work: `build-order-state.*` is on screen in the Build panel's queue,
`intake-stage.*` in the Intake pipeline, `guard-claim.*` in the held-guards list,
`action.*` in the prisoner roster.

**(2) The bundled default locale the player actually sees is 579 keys.**

`src/main.ts:1076` constructs the running `Localizer` from
`defaultMessageCatalogEn`, not from `defaultLocaleEnCatalog` — and the comment
above it explains why in detail: the services layer contributes strings of its
own, and building from content alone *"was proving completeness of a catalog the
application did not use"*. Those are 563 + 16 = **579**. §5 covers all 579.

**Handed over, since `src/` is out of bounds on this branch:** that same comment
says the services layer contributes *"twelve more strings"*. It contributes
sixteen (`SERVICE_MESSAGES`, `src/services/localization/default-catalog.ts:16-51`),
counted. The three `telemetry.consent.*` keys the neighbouring comment describes
as *"the last three arrive with the code that renders all seven"* are among the
four that made the number stale. One word in one comment.

**(3) `Buy {count} × {material}` is not a case problem in Polish, and
`Costs {total} now and {wage} a day in wages.` is not a key.** Both are in §1's
closing list with the evidence.

**None of the three changes the shape of the work** — a partial catalogue is
still valid, the fallback chain is still per-key, and the reshape problem is still
the real one. They change its size, and (2) changes which files a future `pl`
catalogue has to touch: **two, not one.**

---

## 5. The candidates

**Nothing below is approved.** Read a group, mark it up, reject freely. `**bold**`
is the proposed Polish. A `Note` reading `Rn` points at the reshape list in §1;
`Qn` points at a question in §3.

### 5.1 Rooms — `room.*.name` (18)

The room-type catalogue. These are the rows of the Rooms panel and the `{room}` parameter of two sentences.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `room.cell.name` | Cell | **Cela** |  |
| `room.holding-cell.name` | Holding Cell | **Cela przejściowa** | Q10 |
| `room.solitary-cell.name` | Solitary Cell | **Cela izolacyjna** |  |
| `room.reception.name` | Reception | **Przyjęcia** | shares a word with `intake-stage.reception` — see Q10 |
| `room.kitchen.name` | Kitchen | **Kuchnia** |  |
| `room.canteen.name` | Canteen | **Stołówka** |  |
| `room.shower-room.name` | Shower Room | **Łaźnia** |  |
| `room.laundry.name` | Laundry | **Pralnia** |  |
| `room.yard.name` | Yard | **Spacerniak** | Q2 — register |
| `room.common-room.name` | Common Room | **Świetlica** |  |
| `room.classroom.name` | Classroom | **Sala lekcyjna** |  |
| `room.infirmary.name` | Infirmary | **Ambulatorium** | Q10 |
| `room.security-office.name` | Security Office | **Dyżurka ochrony** |  |
| `room.staff-room.name` | Staff Room | **Pokój socjalny** |  |
| `room.storage-room.name` | Storage Room | **Magazyn** | collides with `object.category.storage` — deliberate, both are "Magazyn" in Polish as in English ("Storage") |
| `room.delivery-bay.name` | Delivery Bay | **Rampa dostawcza** |  |
| `room.garbage-room.name` | Garbage Room | **Śmietnik** |  |
| `room.utility-room.name` | Utility Room | **Pomieszczenie techniczne** | 23 characters against the English 12 — the longest room row |

### 5.2 Objects — `object.*.name` (20)

The Build panel catalogue rows, and the `{object}` parameter of three Rooms-panel sentences.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `object.bed.name` | Bed | **Łóżko** |  |
| `object.medical-bed.name` | Medical Bed | **Łóżko szpitalne** |  |
| `object.toilet.name` | Toilet | **Toaleta** |  |
| `object.sink.name` | Sink | **Umywalka** |  |
| `object.shower-head.name` | Shower Head | **Prysznic** | not "głowica prysznicowa": Polish names the fixture, not the part |
| `object.washing-machine.name` | Washing Machine | **Pralka** |  |
| `object.desk.name` | Desk | **Biurko** |  |
| `object.chair.name` | Chair | **Krzesło** |  |
| `object.stove.name` | Stove | **Kuchenka** |  |
| `object.prep-counter.name` | Prep Counter | **Blat roboczy** |  |
| `object.fridge.name` | Fridge | **Lodówka** |  |
| `object.dining-table.name` | Dining Table | **Stół jadalny** |  |
| `object.bench.name` | Bench | **Ławka** |  |
| `object.bookshelf.name` | Bookshelf | **Regał na książki** |  |
| `object.medicine-cabinet.name` | Medicine Cabinet | **Szafka na leki** |  |
| `object.security-console.name` | Security Console | **Pulpit ochrony** |  |
| `object.storage-rack.name` | Storage Rack | **Regał magazynowy** |  |
| `object.loading-dock-door.name` | Loading Dock Door | **Brama rozładunkowa** |  |
| `object.waste-bin.name` | Waste Bin | **Kosz na odpady** |  |
| `object.utility-panel.name` | Utility Panel | **Panel techniczny** |  |

### 5.3 Object categories — the two families that must agree (7 + 7)

`object.category.<id>.name` is authored and has the consumer (`src/main.ts:461`); `object-category.<id>.name` is derived from the same seven ids and reaches no surface. `tests/foundation/content-vocabulary-contract.test.ts` fails on a pair that diverges. **The Polish text below is one candidate serving both keys** — authoring two would recreate, in Polish, exactly the divergence that test exists to stop.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `object.category.furniture.name` | Furniture | **Meble** |  |
| `object-category.furniture.name` | Furniture | **Meble** | same text as the row above |
| `object.category.sanitation.name` | Plumbing | **Hydraulika** | English chose "Plumbing" over "Sanitation" on purpose; "Hydraulika" carries the same "what a shower head is filed under" sense |
| `object-category.sanitation.name` | Plumbing | **Hydraulika** | same text as the row above |
| `object.category.food-service.name` | Catering | **Gastronomia** | English chose "Catering" over "Food Service" |
| `object-category.food-service.name` | Catering | **Gastronomia** | same text as the row above |
| `object.category.security.name` | Security | **Ochrona** |  |
| `object-category.security.name` | Security | **Ochrona** | same text as the row above |
| `object.category.storage.name` | Storage | **Magazyn** |  |
| `object-category.storage.name` | Storage | **Magazyn** | same text as the row above |
| `object.category.utility.name` | Utility | **Instalacje** |  |
| `object-category.utility.name` | Utility | **Instalacje** | same text as the row above |
| `object.category.medical.name` | Medical | **Sprzęt medyczny** | not the bare adjective "Medyczne": the other six options are nouns, and a lone adjective in a Polish option list reads as an unfinished phrase |
| `object-category.medical.name` | Medical | **Sprzęt medyczny** | same text as the row above |

### 5.4 Staff roles — `staff-role.*.name` (8)

Hireable roles. Also the `{role}` parameter of `hud.security.hire` and the `{name}` fallback in the held-guards list.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `staff-role.warden.name` | Warden | **Naczelnik** | Q10 — "Dyrektor" is the current official Polish title |
| `staff-role.administrator.name` | Administrator | **Administrator** |  |
| `staff-role.guard.name` | Guard | **Strażnik** |  |
| `staff-role.security-chief.name` | Security Chief | **Szef ochrony** |  |
| `staff-role.nurse.name` | Nurse | **Pielęgniarz** | **Q6** — Polish has no genderless form; this picks the masculine |
| `staff-role.doctor.name` | Doctor | **Lekarz** | same gender problem, but "lekarz" is the established generic |
| `staff-role.maintenance-worker.name` | Maintenance Worker | **Konserwator** |  |
| `staff-role.kitchen-staff.name` | Kitchen Staff | **Kucharz** | **Q6** — English names a collective, but the row hires one person |

### 5.5 Items — `item.*.name` (6)

The `{material}` parameter of the buy control and the delivery rows.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `item.brick.name` | Brick | **Cegła** |  |
| `item.wood-plank.name` | Wood Plank | **Deska** |  |
| `item.food-ration.name` | Food Ration | **Racja żywnościowa** |  |
| `item.dirty-linen.name` | Dirty Linen | **Brudna pościel** |  |
| `item.clean-linen.name` | Clean Linen | **Czysta pościel** |  |
| `item.waste.name` | Waste | **Odpady** |  |

### 5.6 Security grades — `grade.*.name` (5)

**No consumer renders these today** (grepped: `grade.` appears in no `src/ui/` file). That is not a translation problem, it is why the Polish below is a guess — see Q8.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `grade.general.name` | General | **Ogólny** | masculine, guessing the implied noun is "poziom"/"stopień" |
| `grade.medical.name` | Medical | **Medyczny** |  |
| `grade.high-security.name` | High Security | **Ściśle strzeżony** |  |
| `grade.staff-only.name` | Staff Only | **Tylko personel** | the one row that is a noun phrase rather than an adjective, because "Tylko personelowy" is not Polish |
| `grade.administrative.name` | Administrative | **Administracyjny** |  |

### 5.7 Contraband — `contraband.*.name` (5)

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `contraband.weapon.name` | Weapon | **Broń** |  |
| `contraband.drug.name` | Drugs | **Narkotyki** |  |
| `contraband.phone.name` | Phone | **Telefon** |  |
| `contraband.currency.name` | Currency | **Gotówka** |  |
| `contraband.tool.name` | Tool | **Narzędzie** |  |

### 5.8 Status strip and chrome — `hud.status.*`, `hud.clock.*`, `hud.transport.*`, `hud.tabs.*`, `hud.minimap.*`, `hud.alerts.*`, `hud.panel.*`, `hud.severity.*`, `hud.unavailable.*`

The always-visible shell. Two rows are reshaped (marked **R**) and one whole family collides with a measured layout budget — see Q5.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `hud.status.title` | Prison status | **Stan więzienia** |  |
| `hud.status.prisoners` | Prisoners | **Więźniowie** | **Q1** — masculine-personal plural against a mixed-gender name pool. **Q1 ruled 2026-08-30: this is a label, so it becomes *Osadzeni*** — see [which word for a prisoner](./2026-08-30-which-word-for-a-prisoner.md) §3.1. Measured 15.1px *narrower* than the candidate, §4.2 there |
| `hud.status.prisoners-without-bed` | {count} with no bed | **{count} bez łóżka** | "bez" takes the genitive singular and never changes with the count |
| `hud.status.staff` | Staff | **Personel** |  |
| `hud.status.rooms` | Rooms | **Pomieszczenia** |  |
| `hud.status.incidents` | Incidents | **Zajścia** | **Q4** |
| `hud.status.coverage` | Coverage | **Obsada** |  |
| `hud.status.coverage-detail` | {understaffed} understaffed · {unguarded} unguarded | **Niedobór obsady: {understaffed} · Bez obsady: {unguarded}** | **R7**. **Key deleted 2026-08-31** by the owner's ruling 21: the strip's coverage badge now reuses `hud.security.coverage-short` / `hud.security.coverage-unguarded`, so there is nothing left to translate here. Row kept because the R7 reasoning about numeral-first summary rows is still what `hud.build.queue-count` and `hud.security.held-summary` need |
| `hud.status.contraband` | Contraband | **Kontrabanda** | **Q3** |
| `hud.status.funds` | Funds | **Środki** | **Q11** |
| `hud.status.earned-today` | Earned today | **Zarobione dziś** |  |
| `hud.status.occupancy` | Cell occupancy | **Zajętość cel** |  |
| `hud.status.occupancy-value` | {value} of {capacity} | **{value} z {capacity}** |  |
| `hud.status.incidents-clear` | Clear | **Spokój** |  |
| `hud.status.incidents-active` | Active | **Aktywne** |  |
| `hud.clock.title` | Time controls | **Sterowanie czasem** |  |
| `hud.clock.day-progress` | Through the day | **Postęp dnia** |  |
| `hud.clock.day` | Day | **Dzień** |  |
| `hud.clock.speed` | Speed {speed}x | **Prędkość {speed}×** | the ASCII `x` becomes `×`, matching every other `×` in this catalogue |
| `hud.transport.pause` | Pause | **Pauza** |  |
| `hud.transport.play` | Play at normal speed | **Odtwarzaj z normalną prędkością** |  |
| `hud.transport.fast-forward` | Fast forward | **Przyspiesz** |  |
| `hud.tabs.title` | Prison sections | **Sekcje więzienia** |  |
| `hud.tab.overview` | Overview | **Przegląd** | 8 characters against "Overview"'s 8 |
| `hud.tab.build` | Build | **Budowa** | 6 against 5 |
| `hud.tab.security` | Security | **Ochrona** | 7 against 8 |
| `hud.tab.regime` | Regime | **Rozkład** | 7 against 6; "Regulamin" (9) and "Porządek dnia" (13) are the fuller renderings — **Q5** |
| `hud.tab.rooms` | Rooms | **Strefy** | **6 characters exactly** — the budget ADR 0022 measured. "Pomieszczenia" (13) is the accurate word and does not fit. **Q5** |
| `hud.minimap.title` | Minimap | **Minimapa** |  |
| `hud.minimap.placeholder` | Minimap is not available yet | **Minimapa jeszcze niedostępna** |  |
| `hud.alerts.title` | Alerts | **Powiadomienia** |  |
| `hud.alerts.empty` | No active alerts | **Brak aktywnych powiadomień** |  |
| `hud.panel.collapse` | Collapse | **Zwiń** |  |
| `hud.panel.expand` | Expand | **Rozwiń** |  |
| `hud.severity.info` | Info | **Informacja** |  |
| `hud.severity.warning` | Warning | **Ostrzeżenie** |  |
| `hud.severity.danger` | Critical | **Alarm** | not "Krytyczne": the other two are nouns |
| `hud.unavailable.simulation` | Simulation unavailable — this browser could not start it, so nothing can run or be saved | **Symulacja niedostępna — ta przeglądarka nie zdołała jej uruchomić, więc nic nie może działać ani zostać zapisane** |  |

### 5.9 Refusals the simulation raised — `hud.alert.refusal.*` (41)

Every one of these opens with the Polish impersonal past in **-no/-to** (`nie przyjęto`, `nie zbudowano`, `nie postawiono`). That form has no subject and no gender, which is what makes the whole family translatable without a single reshape — see §1's note on the device. The em dash and the what-then-why order are kept.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `hud.alert.refusal.admit.no-accommodation` | Nobody was admitted — there is no room to put a prisoner in yet. | **Nikogo nie przyjęto — nie ma jeszcze pomieszczenia, w którym można kogoś umieścić.** |  |
| `hud.alert.refusal.admit.population-full` | Nobody was admitted — this prison is holding as many people as it can. | **Nikogo nie przyjęto — to więzienie przetrzymuje już tylu ludzi, ilu może.** |  |
| `hud.alert.refusal.build.duplicate-order` | The build order failed — that order already exists. | **Zlecenie budowy nie doszło do skutku — takie zlecenie już istnieje.** |  |
| `hud.alert.refusal.build.out-of-bounds` | The build order failed — that tile is outside the map. | **Zlecenie budowy nie doszło do skutku — to pole leży poza mapą.** |  |
| `hud.alert.refusal.build.unbuildable` | The build order failed — nothing can be built on that tile. | **Zlecenie budowy nie doszło do skutku — na tym polu nie da się nic zbudować.** |  |
| `hud.alert.refusal.build.unbuildable-terrain` | The build order failed — the ground there cannot be built on. | **Zlecenie budowy nie doszło do skutku — na tym gruncie nie da się budować.** |  |
| `hud.alert.refusal.build.unknown-buildable` | The build order failed — that is not something this prison knows how to build. | **Zlecenie budowy nie doszło do skutku — to więzienie nie wie, jak coś takiego zbudować.** |  |
| `hud.alert.refusal.build.unowned-land` | The build order failed — you do not own that land. | **Zlecenie budowy nie doszło do skutku — ta ziemia nie należy do ciebie.** | **Q12** — informal address |
| `hud.alert.refusal.build.water-blocked` | The build order failed — there is water on that tile. | **Zlecenie budowy nie doszło do skutku — na tym polu jest woda.** |  |
| `hud.alert.refusal.cancel-purchase.not-pending` | Nothing was refunded — that delivery is not on its way any more. | **Nic nie zwrócono — ta dostawa nie jest już w drodze.** |  |
| `hud.alert.refusal.hire.insufficient-funds` | Nobody was hired — there are not enough funds. | **Nikogo nie zatrudniono — brakuje środków.** |  |
| `hud.alert.refusal.hire.no-duty-for-role` | Nobody was hired — only security staff can hold a post, and this prison has no other work for that role. | **Nikogo nie zatrudniono — posterunek może objąć tylko ochrona, a dla tej roli to więzienie nie ma innej pracy.** |  |
| `hud.alert.refusal.hire.roster-full` | Nobody was hired — this prison cannot hold any more staff. | **Nikogo nie zatrudniono — to więzienie nie pomieści więcej personelu.** |  |
| `hud.alert.refusal.hire.unknown-role` | Nobody was hired — that is not a role this prison knows. | **Nikogo nie zatrudniono — to więzienie nie zna takiej roli.** |  |
| `hud.alert.refusal.place-object.duplicate-order` | The object was not placed — that order already exists. | **Nie postawiono obiektu — takie zlecenie już istnieje.** |  |
| `hud.alert.refusal.place-object.not-a-placeable-object` | The object was not placed — that is not something built by placing it on a tile. | **Nie postawiono obiektu — tego nie buduje się, stawiając na polu.** |  |
| `hud.alert.refusal.place-object.out-of-bounds` | The object was not placed — part of it would be outside the map. | **Nie postawiono obiektu — jego część znalazłaby się poza mapą.** |  |
| `hud.alert.refusal.place-object.outside-room` | The object was not placed — it has to stand in a room you have zoned. | **Nie postawiono obiektu — musi stać w wyznaczonym pomieszczeniu.** |  |
| `hud.alert.refusal.place-object.tile-occupied` | The object was not placed — something is already standing there. | **Nie postawiono obiektu — coś już tam stoi.** |  |
| `hud.alert.refusal.place-object.unknown-buildable` | The object was not placed — that is not something this prison knows how to build. | **Nie postawiono obiektu — to więzienie nie wie, jak coś takiego zbudować.** |  |
| `hud.alert.refusal.place-object.unowned-land` | The object was not placed — you do not own all of that land. | **Nie postawiono obiektu — nie cała ta ziemia należy do ciebie.** | **Q12** |
| `hud.alert.refusal.remove-object.nothing-to-remove` | Nothing was removed — there is no object on that tile, and none being built there. | **Nic nie usunięto — na tym polu nie ma obiektu ani nic się tam nie buduje.** |  |
| `hud.alert.refusal.purchase.duplicate-order` | The materials were not ordered — that order already exists. | **Nie zamówiono materiałów — takie zlecenie już istnieje.** |  |
| `hud.alert.refusal.purchase.insufficient-funds` | The materials were not ordered — there are not enough funds. | **Nie zamówiono materiałów — brakuje środków.** |  |
| `hud.alert.refusal.purchase.invalid-quantity` | The materials were not ordered — that quantity cannot be bought. | **Nie zamówiono materiałów — takiej ilości nie da się kupić.** |  |
| `hud.alert.refusal.purchase.unknown-material` | The materials were not ordered — that material is not for sale. | **Nie zamówiono materiałów — ten materiał nie jest na sprzedaż.** |  |
| `hud.alert.refusal.dismiss.unknown-staff` | Nobody was dismissed — that staff member is not on the roster. | **Nikogo nie zwolniono — tej osoby nie ma na liście personelu.** | **R9** — English "dismissed", "released" and "discharged" are three Polish verbs; see the reshape list |
| `hud.alert.refusal.release-guard.not-held` | Nothing was released — that guard is already off duty. | **Nikogo nie odwołano — ten strażnik jest już poza służbą.** | **R9** |
| `hud.alert.refusal.release-guard.unknown-guard` | Nothing was released — that guard is not on the roster. | **Nikogo nie odwołano — tego strażnika nie ma na liście personelu.** | **R9** |
| `hud.alert.refusal.zone.duplicate-instance-id` | The room was not zoned — a room is already recorded on that tile. | **Nie wyznaczono pomieszczenia — na tym polu zapisano już inne.** |  |
| `hud.alert.refusal.zone.invalid-area` | The room was not zoned — that area is not a valid rectangle. | **Nie wyznaczono pomieszczenia — ten obszar nie jest poprawnym prostokątem.** |  |
| `hud.alert.refusal.zone.out-of-bounds` | The room was not zoned — part of that area is outside the map. | **Nie wyznaczono pomieszczenia — część tego obszaru leży poza mapą.** |  |
| `hud.alert.refusal.zone.overlaps-existing-room` | The room was not zoned — it overlaps a room that is already there. | **Nie wyznaczono pomieszczenia — nachodzi na pomieszczenie, które już tam jest.** |  |
| `hud.alert.refusal.zone.unknown-room-type` | The room was not zoned — that is not a room type this prison knows. | **Nie wyznaczono pomieszczenia — to więzienie nie zna takiego typu pomieszczenia.** |  |
| `hud.alert.refusal.zone.unowned-land` | The room was not zoned — you do not own all of that land. | **Nie wyznaczono pomieszczenia — nie cała ta ziemia należy do ciebie.** | **Q12** |
| `hud.alert.refusal.zone.below-minimum-size` | The room was not zoned — that area is smaller than this room type allows. | **Nie wyznaczono pomieszczenia — ten obszar jest mniejszy, niż pozwala ten typ pomieszczenia.** |  |
| `hud.alert.refusal.zone.not-enclosed` | The room was not zoned — this room type must be enclosed, and the area you drew is open on at least one side. | **Nie wyznaczono pomieszczenia — ten typ musi być zamknięty, a narysowany obszar jest otwarty z co najmniej jednej strony.** |  |
| `hud.alert.refusal.unzone.invalid-area` | Nothing was removed — that area is not a valid rectangle. | **Nic nie usunięto — ten obszar nie jest poprawnym prostokątem.** |  |
| `hud.alert.refusal.unzone.nothing-to-remove` | Nothing was removed — there is no room in that area. | **Nic nie usunięto — w tym obszarze nie ma pomieszczenia.** |  |
| `hud.alert.refusal.unzone.room-occupied` | Nothing was removed — somebody is using that room. | **Nic nie usunięto — ktoś korzysta z tego pomieszczenia.** |  |

### 5.10 Protocol faults — `hud.alert.fault.*` (12)

Same -no/-to device. Each sentence has to be true of both producers (worker rejecting the interface and the interface rejecting the worker), which the impersonal form gives for free.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `hud.alert.fault.invalid-message` | A simulation message was rejected — it was not a message this game understands. | **Odrzucono wiadomość symulacji — ta gra nie rozumie takiej wiadomości.** |  |
| `hud.alert.fault.unsupported-protocol-version` | A simulation message was rejected — it was written for a different version of the game. | **Odrzucono wiadomość symulacji — napisano ją dla innej wersji gry.** |  |
| `hud.alert.fault.unknown-message-kind` | A simulation message was rejected — this build does not know that kind of message. | **Odrzucono wiadomość symulacji — ta wersja gry nie zna takiego rodzaju wiadomości.** |  |
| `hud.alert.fault.invalid-payload` | A simulation message was rejected — its contents were not what that message must carry. | **Odrzucono wiadomość symulacji — jej zawartość nie była tym, co ta wiadomość musi nieść.** |  |
| `hud.alert.fault.not-initialized` | A simulation request was refused — no prison is loaded yet. | **Odmówiono żądania symulacji — żadne więzienie nie jest jeszcze wczytane.** |  |
| `hud.alert.fault.already-initialized` | A simulation request was refused — this session already has a prison loaded. | **Odmówiono żądania symulacji — ta sesja ma już wczytane więzienie.** |  |
| `hud.alert.fault.duplicate-message` | A command was refused — it had already been sent. | **Odmówiono polecenia — zostało już wysłane.** |  |
| `hud.alert.fault.sequence-gap` | A command was refused — a command sent before it never arrived. | **Odmówiono polecenia — polecenie wysłane wcześniej nigdy nie dotarło.** |  |
| `hud.alert.fault.invalid-state` | A simulation request was refused — the simulation cannot do that right now. | **Odmówiono żądania symulacji — symulacja nie może teraz tego zrobić.** |  |
| `hud.alert.fault.snapshot-incompatible` | The save could not be loaded — this build does not understand its format. | **Nie udało się wczytać zapisu — ta wersja gry nie rozumie jego formatu.** |  |
| `hud.alert.fault.shutting-down` | A simulation request was refused — the session is shutting down. | **Odmówiono żądania symulacji — sesja się zamyka.** |  |
| `hud.alert.fault.internal-error` | The simulation hit an internal error. | **Symulacja napotkała błąd wewnętrzny.** |  |

### 5.11 Events — `hud.alert.event.*` (7)

Two of the seven are reshaped, and they are the two sharpest cases in the whole catalogue.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `hud.alert.event.prisoners.discharged` | {count} released — their sentences are served. | **Zwolniono: {count} — kara odbyta.** | the -no form again; "kara odbyta" avoids agreeing with a count |
| `hud.alert.event.economy.wages-unpaid` | Payday went unpaid — your staff are owed {total}. | **Wypłata nie doszła do skutku — personelowi należy się {total}.** |  |
| `hud.alert.event.prisoners.relocated` | {name} had nowhere to sleep and moved to {room}. | **{name} — nie było gdzie spać. Nowe miejsce: {room}.** | **R1**, the sharpest reshape in the catalogue. The owner wrote this English sentence; the Polish cannot keep its shape. |
| `hud.alert.event.incidents.riot-opened` | A riot has broken out — {count} prisoners have stopped taking orders. | **Wybuchł bunt — liczba uczestników: {count}.** | **R2** |
| `hud.alert.event.incidents.assault-opened` | A fight has broken out between two prisoners. | **Doszło do bójki między dwoma więźniami.** | **Q1 ruled: unchanged.** An `event-` row — the game narrating — and the only key in the 579 that carries *więzień* under the ruling |
| `hud.alert.event.incidents.escape-attempt-opened` | A prisoner is trying to break out. | **Ktoś próbuje się stąd wydostać.** | "Więzień próbuje uciec" is the literal rendering and is masculine; the impersonal "ktoś" holds for a prisoner of either gender — see R1 |
| `hud.alert.event.incidents.gang-retaliation-opened` | Two gangs are settling a score. | **Dwa gangi wyrównują rachunki.** |  |
| `hud.alert.event.incidents.all-clear` | The prison is under control again — no incident is still open. | **Więzienie znowu jest pod kontrolą — żadne zajście nie jest już otwarte.** |  |

### 5.12 Build panel — `hud.build.*` (46)

Four reshapes, all of them the same shape: an English verb-plus-object becomes a Polish label-plus-colon so the parameter can stay in the nominative.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `hud.build.title` | Build | **Budowa** |  |
| `hud.build.catalogue` | What to build | **Co zbudować** |  |
| `hud.build.catalogue-empty` | Nothing is available to build | **Nie ma nic do zbudowania** |  |
| `hud.build.selected` | Selected | **Wybrane** |  |
| `hud.build.placement` | Where | **Gdzie** |  |
| `hud.build.tile-x` | Tile X | **Pole X** | "pole", not "kafelek": Polish strategy games call a grid square a *pole* |
| `hud.build.tile-y` | Tile Y | **Pole Y** |  |
| `hud.build.step-down` | Decrease {field} | **Zmniejsz: {field}** | **R3** |
| `hud.build.step-up` | Increase {field} | **Zwiększ: {field}** | **R3** |
| `hud.build.edge` | Edge | **Krawędź** |  |
| `hud.build.submit` | Place order | **Złóż zlecenie** |  |
| `hud.build.note` | An order is queued now and built while the clock runs. | **Zlecenie trafia do kolejki od razu, a budowa idzie, gdy zegar chodzi.** | no renderer since `67e366e` — translated anyway, because the key is in the catalogue |
| `hud.build.arm` | Place on map | **Stawiaj na mapie** |  |
| `hud.build.remove` | Remove | **Usuń** | one word, as the English is, and for the same measured reason |
| `hud.build.remove-active` | Stop removing | **Przestań usuwać** |  |
| `hud.build.remove-hint` | Press any tile of an object to take it away. One still being built is cancelled and its materials come back; a finished one is not refunded. | **Naciśnij dowolne pole obiektu, aby go zabrać. Obiekt jeszcze budowany zostaje anulowany, a materiały wracają; gotowy nie podlega zwrotowi.** |  |
| `hud.build.remove-submit` | Remove object here | **Usuń obiekt tutaj** |  |
| `hud.build.disarm` | Stop placing | **Przestań stawiać** |  |
| `hud.build.arm-hint` | Click a tile edge to place a wall. Drag along it to lay a run. Two fingers, the middle button or the arrow keys still move the camera. | **Kliknij krawędź pola, aby postawić ścianę. Przeciągnij wzdłuż niej, aby położyć cały ciąg. Dwa palce, środkowy przycisk i strzałki nadal poruszają kamerą.** |  |
| `hud.build.target-none` | Point at the world | **Wskaż miejsce na mapie** |  |
| `hud.build.target-value` | {x}, {y} · {edge} | **{x}, {y} · {edge}** | no reshape: the middle dot licenses the nominative |
| `hud.build.target-run` | {count} × {edge} from {x}, {y} | **{count} × {edge} od {x}, {y}** | no reshape: `×` licenses the nominative, and numerals do not decline |
| `hud.build.target-tile` | {x}, {y} | **{x}, {y}** |  |
| `hud.build.coordinates` | Enter coordinates | **Wpisz współrzędne** |  |
| `hud.build.coordinates-hint` | The keyboard route. Pointing at the map is quicker. | **Droga przez klawiaturę. Wskazanie na mapie jest szybsze.** |  |
| `hud.build.buy` | Buy | **Kup** |  |
| `hud.build.buy-quantity` | Quantity | **Ilość** | deliberately "ilość" and not "liczba" — see R3 |
| `hud.build.buy-submit` | Buy {count} × {material} · {total} | **Kup {count} × {material} · {total}** | **no reshape, and the issue predicted one** — see the correction in §4 |
| `hud.build.buy-hint` | Arrives while the clock runs, into the stock a build draws from. | **Przyjeżdża, gdy zegar chodzi, do zapasu, z którego czerpie budowa.** |  |
| `hud.build.queue` | Queued | **W kolejce** |  |
| `hud.build.queue-count` | {count} waiting · {started} being built | **Czeka: {count} · W budowie: {started}** | **R4** |
| `hud.build.queue-order` | {buildable} · {x}, {y} · {edge} | **{buildable} · {x}, {y} · {edge}** |  |
| `hud.build.queue-cancel` | Cancel | **Anuluj** |  |
| `hud.build.queue-unnamed` | Unnamed order | **Zlecenie bez nazwy** |  |
| `hud.build.queue-more` | and {count} more behind these — undo takes back a whole run. | **i jeszcze {count} za nimi — cofnięcie zabiera cały ciąg.** |  |
| `hud.build.deliveries` | On the way | **W drodze** |  |
| `hud.build.deliveries-count` | {count} bought · {total} back if cancelled | **Kupione: {count} · Zwrot przy anulowaniu: {total}** | **R4** |
| `hud.build.delivery` | {count} × {material} · {total} back | **{count} × {material} · zwrot {total}** |  |
| `hud.build.delivery-cancel` | Cancel | **Anuluj** |  |
| `hud.build.delivery-unnamed` | Unnamed material | **Materiał bez nazwy** |  |
| `hud.build.deliveries-more` | and {count} more on the way — these arrive first, and the rest come into view as they land. | **i jeszcze {count} w drodze — te przyjadą pierwsze, a reszta pojawi się, gdy tamte dotrą.** |  |
| `hud.build.buildable.wall-brick` | Brick wall | **Ściana z cegły** |  |
| `hud.build.buildable.door-wooden` | Wooden door | **Drewniane drzwi** |  |
| `hud.build.category` | Category | **Kategoria** |  |
| `hud.build.category-all` | Everything | **Wszystko** |  |
| `hud.build.category.structure` | Walls and doors | **Ściany i drzwi** |  |

### 5.13 Intake panel — `hud.intake.*` (7)

Three of the seven are reshaped, all for the same reason: a Polish verb agrees in number with its numeral (`2 czekają`, `5 czeka`), so a count-parameterised sentence with a verb in it is wrong at some counts whatever you write.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `hud.intake.title` | Intake | **Przyjęcia** |  |
| `hud.intake.admit` | Admit a prisoner | **Przyjmij więźnia** | **Q1 ruled**: read as a control's label, so ***Przyjmij osadzonego*** — and this is the one key of the eleven where the criterion is *applied* rather than read off. Named as the weakest claim of [which word for a prisoner](./2026-08-30-which-word-for-a-prisoner.md) §8 |
| `hud.intake.hint` | A prison needs a cell before it can admit anyone. It does not need a free bed: an arrival with none waits until a bed is free. | **Zanim więzienie kogokolwiek przyjmie, potrzebuje celi. Nie potrzebuje wolnego łóżka: przybysz bez łóżka czeka, aż któreś się zwolni.** |  |
| `hud.intake.no-place` | {count} waiting with no bed to sleep in | **Bez łóżka do spania: {count}** | **R5** |
| `hud.intake.pipeline` | In intake | **W przyjęciach** |  |
| `hud.intake.pipeline-count` | {waiting} of {total} | **{waiting} z {total}** |  |
| `hud.intake.pipeline-stage` | {count} at {stage} | **{count} — etap: {stage}** | **R6** |
| `hud.intake.pipeline-failed` | {count} cannot be housed at all | **Nie da się nigdzie umieścić: {count}** | **R5** — "nie da się" is impersonal, so no verb agrees with anything |

### 5.14 Staff panel — `hud.security.*` (23)

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `hud.security.staff` | Staff | **Personel** |  |
| `hud.security.roles` | Who to hire | **Kogo zatrudnić** |  |
| `hud.security.roles-empty` | Nobody can be hired yet. | **Nie ma jeszcze kogo zatrudnić.** |  |
| `hud.security.selected` | Selected | **Wybrane** |  |
| `hud.security.hire` | Hire {role} · {total} | **Zatrudnij: {role} · {total}** | **R3** — "Zatrudnij strażnika" is the correct Polish and `{role}` arrives as "Strażnik" |
| `hud.security.hire-hint` | Taken from the treasury on hire. A new guard starts unassigned. | **Pobierane ze środków przy zatrudnieniu. Nowy strażnik zaczyna bez przydziału.** |  |
| `hud.security.held` | On duty | **Na służbie** |  |
| `hud.security.held-summary` | {held} held · {unassigned} free | **Na służbie: {held} · Bez przydziału: {unassigned}** | **R7** |
| `hud.security.held-empty` | Nobody is assigned right now. | **Nikt nie ma teraz przydziału.** |  |
| `hud.security.held-row` | {name} · {claim} | **{name} · {claim}** |  |
| `hud.security.held-row-unnamed` | Guard {id} · {claim} | **Strażnik {id} · {claim}** |  |
| `hud.security.held-release` | Release | **Odwołaj** | **R9** — not "Zwolnij", which is the Dismiss button two blocks down |
| `hud.security.held-more` | and {count} more | **i jeszcze {count}** |  |
| `hud.security.held-hint` | A released guard stays hired and goes back to the pool. | **Odwołany strażnik nadal jest zatrudniony i wraca do puli.** |  |
| `hud.security.roster` | On the payroll | **Na liście płac** |  |
| `hud.security.roster-dismiss` | Dismiss | **Zwolnij** | **R9** |
| `hud.security.roster-hint` | A dismissed staff member leaves the prison for good, and their wage stops. | **Zwolniona osoba odchodzi z więzienia na dobre, a jej wynagrodzenie przestaje obciążać budżet.** | "osoba" (f.) rather than a masculine noun, so the sentence works for any staff member — see R1 |
| `hud.security.coverage` | Guard coverage | **Obsada strażników** |  |
| `hud.security.coverage-summary` | {assigned} of {required} | **{assigned} z {required}** |  |
| `hud.security.coverage-met` | Covered | **Obsadzone** |  |
| `hud.security.coverage-met-hint` | This prison has the guards it asks for. | **To więzienie ma tylu strażników, ilu wymaga.** |  |
| `hud.security.coverage-short` | Understaffed | **Niedobór obsady** |  |
| `hud.security.coverage-short-hint` | Hire {count} more to cover this population. | **Zatrudnij jeszcze {count}, aby obsadzić tę populację.** | no reshape: an imperative plus a bare numeral agrees with nothing |
| `hud.security.coverage-unguarded` | Unguarded | **Bez obsady** |  |
| `hud.security.coverage-unguarded-hint` | Nobody is on duty. Hire {count} to cover this population. | **Nikt nie pełni służby. Zatrudnij {count}, aby obsadzić tę populację.** |  |

### 5.15 Regime panel — `hud.regime.*` (12)

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `hud.regime.title` | Regime | **Rozkład dnia** |  |
| `hud.regime.blocks` | Today's blocks | **Dzisiejsze bloki** |  |
| `hud.regime.block-allows` | Allows {categories} | **Dozwolone: {categories}** | **R8** |
| `hud.regime.block-progress` | {percent}% through | **Postęp bloku: {percent}%** | **R8** |
| `hud.regime.category-separator` | ,  | **, ** | unchanged — Polish uses the same list separator as English, unlike the Arabic and Japanese cases the English comment names |
| `hud.regime.roster` | Prisoners | **Więźniowie** | **Q1 ruled**: a label, so ***Osadzeni*** |
| `hud.regime.roster-count` | {shown} of {total} | **{shown} z {total}** |  |
| `hud.regime.roster-name` | {given} {family} | **{given} {family}** | unchanged — Polish puts the given name first, as English does (ADR 0015 makes the order a locale decision, and this locale agrees) |
| `hud.regime.roster-unnamed` | Prisoner {id} | **Więzień {id}** | **Q1 ruled**: a record identifier, so ***Osadzony {id}***. One monospace character wider, against 49.4px of column slack — measured |
| `hud.regime.roster-heading` | Heading to {activity} | **W drodze: {activity}** | **R8** — "Idzie do stołówki / na spacerniak" needs a different preposition *and* a different case per destination |
| `hud.regime.roster-more` | and {count} more | **i jeszcze {count}** |  |
| `hud.regime.roster-empty` | Nobody has been admitted yet. | **Nikogo jeszcze nie przyjęto.** |  |

### 5.16 What a refused control says — `hud.refusal.*` (12)

The band under the status strip. Same -no/-to device as the alert refusals, and deliberately the same wording where the fact is the same.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `hud.refusal.set-clock` | The clock did not change — the request was refused. | **Zegar się nie zmienił — żądanie odrzucono.** |  |
| `hud.refusal.place-build-order` | The build order was not placed — the request was refused. | **Nie złożono zlecenia budowy — żądanie odrzucono.** |  |
| `hud.refusal.purchase-materials` | Nothing was bought — the purchase was refused and no money was spent. | **Nic nie kupiono — zakup odrzucono i nie wydano pieniędzy.** |  |
| `hud.refusal.hire-staff` | Nobody was hired — the request was refused and no money was spent. | **Nikogo nie zatrudniono — żądanie odrzucono i nie wydano pieniędzy.** |  |
| `hud.refusal.undo` | Nothing was undone — the request was refused. | **Nic nie cofnięto — żądanie odrzucono.** |  |
| `hud.refusal.redo` | Nothing was redone — the request was refused. | **Nic nie ponowiono — żądanie odrzucono.** |  |
| `hud.refusal.zone-room` | The room was not designated — the request was refused. | **Nie wyznaczono pomieszczenia — żądanie odrzucono.** |  |
| `hud.refusal.unzone-room` | Nothing was removed — the request was refused. | **Nic nie usunięto — żądanie odrzucono.** |  |
| `hud.refusal.admit-prisoner` | Nobody was admitted — the request was refused. | **Nikogo nie przyjęto — żądanie odrzucono.** |  |
| `hud.refusal.cancel-build-order` | The order is still queued — the request was refused. | **Zlecenie nadal czeka w kolejce — żądanie odrzucono.** |  |
| `hud.refusal.cancel-material-purchase` | Nothing was refunded — the request was refused and the delivery is still on its way. | **Nic nie zwrócono — żądanie odrzucono, a dostawa nadal jest w drodze.** |  |
| `hud.refusal.release-guard` | Nobody was released — the request was refused and the guard is still assigned. | **Nikogo nie odwołano — żądanie odrzucono, a strażnik nadal ma przydział.** | **R9** |

### 5.17 Rooms panel — `hud.rooms.*` (40)

The panel with the most reshapes, because it is the panel that puts a room name, an object name and two numbers into sentences.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `hud.rooms.title` | Rooms | **Pomieszczenia** |  |
| `hud.rooms.catalogue` | Room type and area | **Typ pomieszczenia i obszar** |  |
| `hud.rooms.catalogue-empty` | No room types are available | **Nie ma dostępnych typów pomieszczeń** |  |
| `hud.rooms.selected` | Selected | **Wybrane** |  |
| `hud.rooms.arm` | Draw on map | **Rysuj na mapie** |  |
| `hud.rooms.disarm` | Stop drawing | **Przestań rysować** |  |
| `hud.rooms.arm-hint` | Drag a rectangle across the tiles this room should cover. | **Przeciągnij prostokąt przez pola, które ma zająć to pomieszczenie.** |  |
| `hud.rooms.remove` | Remove rooms | **Usuń pomieszczenia** |  |
| `hud.rooms.remove-active` | Stop removing | **Przestań usuwać** |  |
| `hud.rooms.remove-hint` | Drag across any part of a room to remove all of it. | **Przeciągnij przez dowolną część pomieszczenia, aby usunąć je w całości.** |  |
| `hud.rooms.area` | Area | **Obszar** |  |
| `hud.rooms.area-none` | Nothing selected | **Nic nie wybrano** |  |
| `hud.rooms.area-value` | {width} × {height} tiles at {x}, {y} | **Pola: {width} × {height}, w {x}, {y}** | **R10** — the one place where a 1 × 1 really can appear |
| `hud.rooms.confirm` | Designate {width} × {height} | **Wyznacz {width} × {height}** | no reshape: numerals do not decline and there is no noun after them |
| `hud.rooms.confirm-remove` | Remove {width} × {height} | **Usuń {width} × {height}** |  |
| `hud.rooms.cancel` | Discard | **Odrzuć** |  |
| `hud.rooms.minimum` | Needs at least {width} × {height} tiles | **Minimalny rozmiar: {width} × {height}** | **R10** |
| `hud.rooms.minimum-none` | No minimum size | **Bez minimalnego rozmiaru** |  |
| `hud.rooms.too-small` | Too small — this room needs at least {width} × {height} tiles. | **Za małe — to pomieszczenie wymaga co najmniej {width} × {height} pól.** | "za **małe**" agrees with *pomieszczenie* (neuter). If Q10 renames the room noun, this word changes with it. |
| `hud.rooms.enclosure` | Enclosure | **Zamknięcie** |  |
| `hud.rooms.enclosure-none` | Not evaluated yet | **Jeszcze nieocenione** |  |
| `hud.rooms.enclosure-sealed` | Walled in on every side | **Otoczone ścianami ze wszystkich stron** |  |
| `hud.rooms.enclosure-open` | Open on at least one side | **Otwarte z co najmniej jednej strony** |  |
| `hud.rooms.requirement-enclosed` | Must be enclosed | **Musi być zamknięte** |  |
| `hud.rooms.requirement-outdoors` | Must be outdoors | **Musi być na zewnątrz** |  |
| `hud.rooms.requirement-none` | No enclosure rule | **Bez reguły zamknięcia** |  |
| `hud.rooms.requires-object` | Needs {count} × {object} | **Wymaga {count} × {object}** | no reshape — `×` again |
| `hud.rooms.requires-none` | No objects needed | **Nie wymaga obiektów** |  |
| `hud.rooms.coordinates` | Enter coordinates | **Wpisz współrzędne** |  |
| `hud.rooms.coordinates-hint` | The keyboard route. Dragging on the map is quicker. | **Droga przez klawiaturę. Przeciąganie po mapie jest szybsze.** |  |
| `hud.rooms.coordinates-submit` | Use these tiles | **Użyj tych pól** |  |
| `hud.rooms.tile-x` | Tile X | **Pole X** |  |
| `hud.rooms.tile-y` | Tile Y | **Pole Y** |  |
| `hud.rooms.width` | Width | **Szerokość** |  |
| `hud.rooms.height` | Height | **Wysokość** |  |
| `hud.rooms.step-down` | Decrease {field} | **Zmniejsz: {field}** | **R3** |
| `hud.rooms.step-up` | Increase {field} | **Zwiększ: {field}** | **R3** |
| `hud.rooms.needs` | Not ready | **Niegotowe** |  |
| `hud.rooms.needs-count` | {unfinished} of {total} | **{unfinished} z {total}** |  |
| `hud.rooms.needs-room` | {room} at {x}, {y} is missing | **{room} ({x}, {y}) — brakuje:** | **R8** — "Celi w 4, 7 brakuje" would need the genitive of the room name |
| `hud.rooms.needs-object` | {count} × {object} | **{count} × {object}** |  |
| `hud.rooms.needs-object-uncounted` | {object} | **{object}** |  |
| `hud.rooms.needs-item-more` | and {count} more | **i jeszcze {count}** |  |
| `hud.rooms.needs-object-unknown` | something this build cannot name | **coś, czego ta wersja gry nie potrafi nazwać** | lower-case initial on purpose: it is substituted where an object name would stand, mid-line |

### 5.18 Save panel — `save.*` (56)

Its own namespace, its own module, and the only family where `{detail}` is deliberately untranslated English from `src/persistence/**`. The Polish sentence around it is written so the English fragment lands after a colon rather than inside a clause.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `save.panel.region` | Prison saves | **Zapisy więzień** |  |
| `save.panel.title` | Prisons | **Więzienia** |  |
| `save.action.create` | New prison | **Nowe więzienie** |  |
| `save.action.save` | Save now | **Zapisz teraz** |  |
| `save.action.export` | Export | **Eksportuj** |  |
| `save.action.import` | Import | **Importuj** |  |
| `save.action.load` | Load | **Wczytaj** |  |
| `save.action.delete` | Delete | **Usuń** |  |
| `save.list.empty` | No prisons yet. | **Nie ma jeszcze żadnych więzień.** |  |
| `save.list.item` | {name} ({count} gen) | **{name} ({count} gen.)** | the abbreviation dodges declension in Polish exactly as it dodges plural in English — see §2 |
| `save.status.idle` | Local saves only — no network required. | **Tylko zapisy lokalne — sieć niepotrzebna.** |  |
| `save.status.saved` | Saved (generation {generation}). | **Zapisano (generacja {generation}).** |  |
| `save.status.quota-exceeded` | Storage is full. Delete an old prison or export and remove saves to free space. Your previous save is intact. | **Pamięć jest pełna. Usuń stare więzienie albo wyeksportuj i skasuj zapisy, żeby zwolnić miejsce. Poprzedni zapis jest nienaruszony.** |  |
| `save.status.transaction-aborted` | The browser interrupted the save. Your previous save is intact — try saving again. | **Przeglądarka przerwała zapisywanie. Poprzedni zapis jest nienaruszony — spróbuj zapisać jeszcze raz.** |  |
| `save.status.save-failed` | Save failed: {detail} | **Zapis nie powiódł się: {detail}** |  |
| `save.status.list-unreadable` | Could not read the local prison list (private browsing or an unreadable slot record can cause this): {detail} | **Nie udało się odczytać lokalnej listy więzień (może to być tryb prywatny albo nieczytelny wpis zapisu): {detail}** |  |
| `save.status.creating` | Creating prison… | **Tworzenie więzienia…** |  |
| `save.status.create-failed` | Could not create a prison: {detail} | **Nie udało się utworzyć więzienia: {detail}** |  |
| `save.status.no-active-prison` | No active prison — create or load one first. | **Brak aktywnego więzienia — najpierw utwórz albo wczytaj jakieś.** |  |
| `save.status.saving` | Saving… | **Zapisywanie…** |  |
| `save.status.loading` | Loading… | **Wczytywanie…** |  |
| `save.status.not-found` | That prison no longer exists. | **To więzienie już nie istnieje.** |  |
| `save.status.no-readable-generation` | No readable save generation remains for this prison. Every retained copy failed validation. | **Dla tego więzienia nie została żadna czytelna generacja zapisu. Każda zachowana kopia nie przeszła walidacji.** |  |
| `save.status.recovered` | The most recent save was unreadable — recovered an earlier verified generation. | **Najnowszy zapis był nieczytelny — odzyskano wcześniejszą, zweryfikowaną generację.** |  |
| `save.status.loaded` | Loaded. | **Wczytano.** |  |
| `save.status.deleted` | Prison deleted. | **Więzienie usunięte.** |  |
| `save.status.nothing-to-export` | Nothing to export — no valid active save. | **Nie ma czego wyeksportować — brak poprawnego aktywnego zapisu.** |  |
| `save.status.exported` | Exported the current save. | **Wyeksportowano bieżący zapis.** |  |
| `save.status.importing` | Reading the save file… | **Odczytywanie pliku zapisu…** |  |
| `save.status.imported` | Imported the save file into this prison (generation {generation}). | **Zaimportowano plik zapisu do tego więzienia (generacja {generation}).** |  |
| `save.status.imported-migrated` | Imported a save from an older version of Lockstate and brought it up to date (generation {generation}). | **Zaimportowano zapis ze starszej wersji Lockstate i uaktualniono go (generacja {generation}).** |  |
| `save.status.import-not-a-save` | That file is not a Lockstate save — choose a file exported from this game. | **Ten plik nie jest zapisem Lockstate — wybierz plik wyeksportowany z tej gry.** |  |
| `save.status.import-unsupported-version` | That save was written by a newer version of Lockstate than this one. Update the game, then import it again. | **Ten zapis powstał w nowszej wersji Lockstate niż ta. Uaktualnij grę i zaimportuj go jeszcze raz.** |  |
| `save.status.import-corrupt` | That save does not match its own checksum — it was damaged or edited after it was exported, so it was not imported. | **Ten zapis nie zgadza się z własną sumą kontrolną — został uszkodzony albo zmieniony po eksporcie, więc go nie zaimportowano.** |  |
| `save.status.import-invalid` | That save file could not be read: {detail} | **Nie udało się odczytać tego pliku zapisu: {detail}** |  |
| `save.failure.create` | Creating the prison failed: {detail} | **Tworzenie więzienia nie powiodło się: {detail}** |  |
| `save.failure.save` | Saving failed: {detail} | **Zapisywanie nie powiodło się: {detail}** |  |
| `save.failure.load` | Loading failed: {detail} | **Wczytywanie nie powiodło się: {detail}** |  |
| `save.failure.delete` | Deleting failed: {detail} | **Usuwanie nie powiodło się: {detail}** |  |
| `save.failure.export` | Exporting failed: {detail} | **Eksportowanie nie powiodło się: {detail}** |  |
| `save.failure.import` | Importing failed: {detail} | **Importowanie nie powiodło się: {detail}** |  |
| `save.failure.unknown` | The action failed: {detail} | **Operacja nie powiodła się: {detail}** |  |
| `save.detail.restored-scope` | Restored: {restored}. Not carried by this save version: {notCarried}. | **Przywrócone: {restored}. Nieprzeniesione przez tę wersję zapisu: {notCarried}.** | **R11** — the same list is spliced into two frames that in Polish demand two different cases |
| `save.scope.kernel` | kernel tick and command queue | **takt jądra i kolejka poleceń** | the thirteen list items are nominative noun phrases, lower-case, so R11's frame works |
| `save.scope.rng-streams` | RNG stream states | **stany strumieni RNG** |  |
| `save.scope.world` | world terrain and ownership | **teren świata i własność gruntu** |  |
| `save.scope.construction` | construction orders and undo/redo | **zlecenia budowy oraz cofanie i ponawianie** |  |
| `save.scope.entity-liveness` | entity id liveness | **żywotność identyfikatorów bytów** |  |
| `save.scope.prisoners` | prisoners, needs, actions and cell assignments | **więźniowie, potrzeby, czynności i przydziały cel** | **Q1 ruled**: a save-manifest label, so ***osadzeni*, potrzeby, czynności i przydziały cel** |
| `save.scope.operations` | jobs, containers and utility networks | **zadania, pojemniki i sieci instalacji** |  |
| `save.scope.security` | doors, security sectors, guards and patrols | **drzwi, sektory ochrony, strażnicy i patrole** |  |
| `save.scope.contraband` | contraband, intelligence and searches | **kontrabanda, informacje i przeszukania** |  |
| `save.scope.incidents` | incidents, gangs and tunnels | **zajścia, gangi i tunele** |  |
| `save.scope.names` | prisoner and staff names | **imiona i nazwiska więźniów oraz personelu** | **Q1 ruled**: a save-manifest label, so **imiona i nazwiska *osadzonych* oraz personelu** |
| `save.scope.room-caches` | room and topology caches (recomputed from the world) | **pamięci podręczne pomieszczeń i topologii (przeliczane ze świata)** |  |
| `save.scope.navigation-caches` | navigation caches and in-flight path requests (re-issued on the next tick) | **pamięci podręczne nawigacji i trwające żądania tras (wysyłane ponownie w następnym takcie)** |  |

### 5.19 Input actions — `input.action.*` (11)

No keybinding or help UI reads these yet.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `input.action.camera.up` | Pan camera up | **Przesuń kamerę w górę** |  |
| `input.action.camera.down` | Pan camera down | **Przesuń kamerę w dół** |  |
| `input.action.camera.left` | Pan camera left | **Przesuń kamerę w lewo** |  |
| `input.action.camera.right` | Pan camera right | **Przesuń kamerę w prawo** |  |
| `input.action.camera.zoom.in` | Zoom in | **Przybliż** |  |
| `input.action.camera.zoom.out` | Zoom out | **Oddal** |  |
| `input.action.selection.primary` | Select | **Wybierz** |  |
| `input.action.build.confirm` | Confirm placement | **Potwierdź postawienie** |  |
| `input.action.build.cancel` | Cancel | **Anuluj** |  |
| `input.action.edit.undo` | Undo | **Cofnij** |  |
| `input.action.edit.redo` | Redo | **Ponów** |  |

### 5.20 Brand badge and display scale — `brand.*`, `display.*` (7)

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `brand.region` | Lockstate build | **Kompilacja Lockstate** |  |
| `brand.wordmark` | LockState.io | **LockState.io** | **not translated** — a wordmark is a name |
| `brand.stage` | PRE-ALPHA | **PRE-ALPHA** | **Q7** — leave as is, or "PREALFA"? |
| `brand.build` | v{version} · {commit} | **v{version} · {commit}** | unchanged |
| `brand.description` | Lockstate, {stage} build, version {version}, commit {commit}. | **Lockstate, kompilacja {stage}, wersja {version}, commit {commit}.** |  |
| `display.scale.region` | Interface scale | **Skala interfejsu** |  |
| `display.scale.cycle` | Change the interface scale | **Zmień skalę interfejsu** |  |

### 5.21 Simulation enumerations, actors and prisoners — derived keys (41)

These have no definition object; `simulationEnumMessages()` computes the key from the id. The Polish is authored per key exactly as the English is, in `SIMULATION_ENUM_GROUPS.labels`. **The `action.*` family carries the catalogue's second-hardest decision — see R8 and Q9.**

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `actor-kind.prisoner.name` | Prisoner | **Więzień** | **Q1 ruled**: derived by `SIMULATION_ENUM_GROUPS`, labels-not-prose by construction, so ***Osadzony*** |
| `actor-kind.staff.name` | Staff | **Personel** |  |
| `need.hunger.name` | Hunger | **Głód** |  |
| `need.sleep.name` | Sleep | **Sen** |  |
| `need.hygiene.name` | Hygiene | **Higiena** |  |
| `need.bladder.name` | Bladder | **Pęcherz** |  |
| `need.safety.name` | Safety | **Bezpieczeństwo** |  |
| `need.recreation.name` | Recreation | **Rekreacja** |  |
| `action-category.sleep.name` | Sleep | **Sen** |  |
| `action-category.meal.name` | Meal | **Posiłek** |  |
| `action-category.work.name` | Work | **Praca** |  |
| `action-category.recreation.name` | Recreation | **Rekreacja** |  |
| `action-category.education.name` | Education | **Nauka** |  |
| `action-category.hygiene.name` | Hygiene | **Higiena** |  |
| `action-category.free-association.name` | Free Association | **Czas wolny** |  |
| `action.sleep.name` | Sleeping | **Spanie** | **Q9** — a verbal noun, not "Sen", so it does not read identically to `action-category.sleep` |
| `action.eat-meal.name` | Eating | **Jedzenie** | **Q9** |
| `action.eat-in-cell.name` | Eating in Cell | **Jedzenie w celi** |  |
| `action.use-toilet.name` | Using Toilet | **Toaleta** |  |
| `action.shower.name` | Showering | **Kąpiel** |  |
| `action.yard-recreation.name` | Yard Time | **Spacer** |  |
| `action.common-room-recreation.name` | Common Room | **Świetlica** |  |
| `action.classroom-education.name` | Class | **Zajęcia** |  |
| `action.free-association.name` | Association | **Wspólny czas** | English shortens the category "Free Association" to "Association"; Polish shortens "Czas wolny" the other way, to "Wspólny czas" — **Q9** |
| `action.laundry-work.name` | Laundry Duty | **Praca w pralni** |  |
| `action.kitchen-work.name` | Kitchen Duty | **Praca w kuchni** |  |
| `action-phase.idle.name` | Idle | **Bezczynność** | a noun, not "Bezczynny" — the phase word stands beside verbal nouns in the same roster column and must not carry a gender |
| `action-phase.travelling.name` | Travelling | **W drodze** |  |
| `action-phase.performing.name` | Performing | **W trakcie** |  |
| `intake-stage.queued.name` | Queued | **W kolejce** |  |
| `intake-stage.reception.name` | Reception | **Przyjęcie** |  |
| `intake-stage.classification.name` | Classification | **Klasyfikacja** |  |
| `intake-stage.accommodation-assignment.name` | Cell Assignment | **Przydział celi** |  |
| `intake-stage.completed.name` | Admitted | **Zakończone** | not "Przyjęty" — see R1, the same gender problem |
| `intake-stage.failed.name` | Failed | **Nieudane** |  |
| `classification-group.general-population.name` | General Population | **Populacja ogólna** |  |
| `classification-group.high-risk.name` | High Risk | **Podwyższone ryzyko** |  |
| `risk-tier.0.name` | Minimal | **Minimalne** | the four agree with *ryzyko* (neuter), which is the noun `classification-group.high-risk` puts on screen |
| `risk-tier.1.name` | Low | **Niskie** |  |
| `risk-tier.2.name` | Medium | **Średnie** |  |
| `risk-tier.3.name` | High | **Wysokie** |  |

### 5.22 Simulation enumerations, incidents and security — derived keys (34)

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `incident-type.assault.name` | Assault | **Napaść** |  |
| `incident-type.escape-attempt.name` | Escape Attempt | **Próba ucieczki** |  |
| `incident-type.riot.name` | Riot | **Bunt** |  |
| `incident-type.gang-retaliation.name` | Gang Retaliation | **Porachunki gangów** |  |
| `incident-state.active.name` | Active | **Aktywne** |  |
| `incident-state.notified.name` | Notified | **Zgłoszone** |  |
| `incident-state.responding.name` | Responding | **Reakcja w toku** |  |
| `incident-state.resolved.name` | Resolved | **Rozwiązane** |  |
| `incident-state.lapsed.name` | Lapsed | **Bez reakcji** | "Lapsed" is a deadline that passed unanswered; "Przedawnione" is the literal rendering and means something else in Polish |
| `deployment-phase.unassigned.name` | Unassigned | **Bez przydziału** |  |
| `deployment-phase.travelling.name` | Travelling | **W drodze** |  |
| `deployment-phase.on-post.name` | On Post | **Na posterunku** |  |
| `deployment-phase.on-search.name` | On Search | **Na przeszukaniu** |  |
| `guard-claim.deployment.name` | Sector Post | **Posterunek w sektorze** |  |
| `guard-claim.incident-response.name` | Incident Response | **Reakcja na zajście** |  |
| `guard-claim.search.name` | Contraband Search | **Przeszukanie** |  |
| `guard-claim.unattributed.name` | Unclaimed | **Bez przypisania** | says "nothing holds this", as the English deliberately does |
| `sector-control-state.normal.name` | Normal | **Normalny** | the three agree with *sektor* (masculine) |
| `sector-control-state.restricted.name` | Restricted | **Ograniczony** |  |
| `sector-control-state.lockdown.name` | Lockdown | **Zablokowany** | not the noun "Blokada": the other two are adjectives |
| `door-state.open.name` | Open | **Otwarte** | *drzwi* is plural-only in Polish, so all three take the plural non-masculine-personal form |
| `door-state.closed.name` | Closed | **Zamknięte** |  |
| `door-state.locked.name` | Locked | **Zaryglowane** |  |
| `door-side.left.name` | Left | **Lewa** | **Q8** — agrees with *krawędź* (feminine); if these ever label a *bok* (masculine) they become "Lewy"/"Górny" |
| `door-side.top.name` | Top | **Górna** | **Q8** |
| `door-access-denial.locked.name` | Locked | **Zaryglowane** |  |
| `door-access-denial.insufficient-clearance.name` | Insufficient Clearance | **Za niskie uprawnienia** |  |
| `door-access-denial.missing-permission.name` | Missing Permission | **Brak zezwolenia** |  |
| `route-failure.invalid-origin.name` | Invalid Start | **Błędny start** |  |
| `route-failure.invalid-destination.name` | Invalid Destination | **Błędny cel** |  |
| `route-failure.unreachable.name` | Unreachable | **Nieosiągalne** |  |
| `route-failure.permission-denied.name` | Access Denied | **Brak dostępu** |  |
| `worker-state.uninitialized.name` | Not Started | **Nieuruchomiona** | the six agree with *symulacja* (feminine), which is the word `hud.unavailable.simulation` puts on screen |
| `worker-state.ready.name` | Ready | **Gotowa** |  |
| `worker-state.running.name` | Running | **Działa** |  |
| `worker-state.paused.name` | Paused | **Wstrzymana** |  |
| `worker-state.shutting-down.name` | Shutting Down | **Zamykanie** |  |
| `worker-state.faulted.name` | Faulted | **Awaria** |  |

### 5.23 Simulation enumerations, contraband — derived keys (21)

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `search-scope.person.name` | Person | **Osoba** |  |
| `search-scope.cell.name` | Cell | **Cela** |  |
| `search-scope.sector.name` | Sector | **Sektor** |  |
| `search-scope.delivery.name` | Delivery | **Dostawa** |  |
| `search-order-state.queued.name` | Queued | **W kolejce** |  |
| `search-order-state.travelling.name` | Travelling | **W drodze** |  |
| `search-order-state.searching.name` | Searching | **Przeszukiwanie** |  |
| `contraband-holder-kind.prisoner.name` | Prisoner | **Więzień** | **Q1 ruled**: derived, so ***Osadzony*** |
| `contraband-holder-kind.staff.name` | Staff | **Personel** |  |
| `contraband-holder-kind.cell.name` | Cell | **Cela** |  |
| `contraband-holder-kind.container.name` | Container | **Pojemnik** |  |
| `contraband-source.delivery.name` | Delivery | **Dostawa** |  |
| `contraband-source.visit.name` | Visit | **Widzenie** | the Polish penitentiary term of art for a prison visit |
| `contraband-source.staff.name` | Staff | **Personel** |  |
| `contraband-source.prisoner.name` | Prisoner | **Więzień** | **Q1 ruled**: derived, so ***Osadzony*** |
| `contraband-source.room-object.name` | Room Object | **Wyposażenie pomieszczenia** |  |
| `contraband-state.concealed.name` | Concealed | **Ukryta** | the three agree with *kontrabanda* (feminine) — **Q3** changes all three if the noun changes |
| `contraband-state.confiscated.name` | Confiscated | **Skonfiskowana** | **Q3** |
| `contraband-state.departed.name` | Left With Holder | **Wyniesiona przez posiadacza** | **Q3** |
| `intelligence-target.prisoner.name` | Prisoner | **Więzień** | **Q1 ruled**: derived, so ***Osadzony*** |
| `intelligence-target.staff.name` | Staff | **Personel** |  |
| `intelligence-target.cell.name` | Cell | **Cela** |  |
| `intelligence-target.sector.name` | Sector | **Sektor** |  |
| `intelligence-source.informant.name` | Informant | **Informator** |  |
| `intelligence-source.observation.name` | Observation | **Obserwacja** |  |
| `intelligence-source.search-residue.name` | Search Residue | **Ślad po przeszukaniu** |  |
| `informant-holder-kind.prisoner.name` | Prisoner | **Więzień** | **Q1 ruled**: derived, so ***Osadzony*** |
| `informant-holder-kind.staff.name` | Staff | **Personel** |  |

### 5.24 Simulation enumerations, operations, construction and world — derived keys (28)

`build-order-state` is the only family here that is definitely on screen: five of its eight are what a queued order's row says it is waiting for.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `job-state.available.name` | Available | **Dostępne** | the eight agree with *zadanie* (neuter) |
| `job-state.reserved.name` | Reserved | **Zarezerwowane** |  |
| `job-state.assigned.name` | Assigned | **Przydzielone** |  |
| `job-state.travelling.name` | Travelling | **W drodze** |  |
| `job-state.performing.name` | Working | **W trakcie** |  |
| `job-state.completed.name` | Completed | **Ukończone** |  |
| `job-state.failed.name` | Failed | **Nieudane** |  |
| `job-state.cancelled.name` | Cancelled | **Anulowane** |  |
| `carry-leg.pickup.name` | Pickup | **Odbiór** |  |
| `carry-leg.dropoff.name` | Drop-off | **Dostarczenie** |  |
| `build-order-state.planned.name` | Planned | **Zaplanowane** | the eight agree with *zlecenie* (neuter) |
| `build-order-state.approved.name` | Approved | **Zatwierdzone** |  |
| `build-order-state.materials-pending.name` | Awaiting Materials | **Czeka na materiały** |  |
| `build-order-state.assigned.name` | Awaiting the Crew | **Czeka na ekipę** | the English chose "Awaiting the Crew" over "Assigned" deliberately; the Polish keeps that choice |
| `build-order-state.in-progress.name` | In Progress | **W trakcie** |  |
| `build-order-state.completed.name` | Completed | **Ukończone** |  |
| `build-order-state.cancelled.name` | Cancelled | **Anulowane** |  |
| `build-order-state.failed.name` | Failed | **Nieudane** |  |
| `buildable-category.wall.name` | Wall | **Ściana** |  |
| `buildable-category.object.name` | Object | **Obiekt** |  |
| `buildable-category.utility.name` | Utility | **Instalacja** |  |
| `build-edge.north.name` | North | **Północ** | substituted after `×` and after a middle dot, both of which keep the nominative |
| `build-edge.west.name` | West | **Zachód** |  |
| `utility-type.electricity.name` | Electricity | **Prąd** |  |
| `utility-type.water.name` | Water | **Woda** |  |
| `utility-node-kind.producer.name` | Producer | **Źródło** |  |
| `utility-node-kind.consumer.name` | Consumer | **Odbiornik** |  |
| `utility-node-state.powered.name` | Powered | **Zasilany** |  |
| `utility-node-state.disabled-no-supply.name` | No Supply | **Brak zasilania** |  |
| `utility-node-state.disabled-failure.name` | Fault | **Awaria** |  |
| `chunk-lifecycle.metadata-only.name` | Not Loaded | **Niewczytany** |  |
| `chunk-lifecycle.loaded.name` | Loaded | **Wczytany** |  |
| `room-requirement.enclosed.name` | Enclosed | **Zamknięcie** |  |
| `room-requirement.outdoors.name` | Outdoors | **Na zewnątrz** |  |
| `room-requirement.minimum-size.name` | Minimum Size | **Minimalny rozmiar** |  |
| `room-requirement.object.name` | Required Object | **Wymagany obiekt** |  |
| `room-requirement-status.satisfied-by-capability.name` | Satisfied | **Spełnione** |  |
| `room-requirement-status.missing-capability.name` | Missing | **Brakuje** |  |
| `room-requirement-status.not-evaluated.name` | Not Evaluated | **Nieocenione** |  |

### 5.25 Content categories the projections group by — derived keys (22)

`object-category.*` is in the object-category table above, with the authored family it must agree with.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `room-category.housing.name` | Housing | **Zakwaterowanie** |  |
| `room-category.security.name` | Security | **Ochrona** |  |
| `room-category.operations.name` | Operations | **Operacje** |  |
| `room-category.food.name` | Food | **Wyżywienie** |  |
| `room-category.hygiene.name` | Hygiene | **Higiena** |  |
| `room-category.recreation.name` | Recreation | **Rekreacja** |  |
| `room-category.education.name` | Education | **Edukacja** |  |
| `room-category.medical.name` | Medical | **Opieka medyczna** | not the bare adjective "Medyczne", for the reason `object.category.medical` gives |
| `room-category.administration.name` | Administration | **Administracja** |  |
| `room-category.logistics.name` | Logistics | **Logistyka** |  |
| `room-category.utility.name` | Utility | **Instalacje** |  |
| `item-category.construction-material.name` | Construction Material | **Materiał budowlany** |  |
| `item-category.food.name` | Food | **Żywność** |  |
| `item-category.linen.name` | Linen | **Pościel** |  |
| `item-category.waste.name` | Waste | **Odpady** |  |
| `staff-department.administration.name` | Administration | **Administracja** |  |
| `staff-department.security.name` | Security | **Ochrona** |  |
| `staff-department.medical.name` | Medical | **Służba zdrowia** | not the adjective "Medyczny": the other three departments are nouns |
| `staff-department.operations.name` | Operations | **Operacje** |  |
| `contraband-legal-context.illicit.name` | Illicit | **Nielegalne** |  |
| `contraband-legal-context.restricted.name` | Restricted | **Ograniczone** |  |
| `contraband-legal-context.controlled.name` | Controlled | **Kontrolowane** |  |

### 5.26 Trusted-services layer — `product.*`, `save-slots.*`, `entitlements.*`, `challenge.*`, `telemetry.*` (16)

**Not in `src/content/`** — these are authored in `src/services/localization/default-catalog.ts` and merged over the content catalogue by `buildDefaultMessageCatalog()`. They are included because they are part of the bundled `en` catalogue the player actually sees (`src/main.ts` builds its `Localizer` from `defaultMessageCatalogEn`, not from `defaultLocaleEnCatalog`), so a `pl` catalogue that omits them leaves sixteen English strings in a Polish UI. **They are also the only two keys in the whole game that carry plural forms today** — see §2.

| Key | English today | Polish candidate | Note |
| --- | --- | --- | --- |
| `product.save-slots.plus-5.name` | 5 extra prison slots | **5 dodatkowych slotów na więzienia** |  |
| `product.save-slots.plus-10.name` | 10 extra prison slots | **10 dodatkowych slotów na więzienia** |  |
| `save-slots.available` | one: {count} prison slot available / other: {count} prison slots available | **{count} wolnych slotów na więzienia** | **plural key — see §2 for the one/few/many forms.** The value shown here is the `other` form, because `other` is what the non-plural `format()` path always takes |
| `save-slots.over-capacity` | one: {count} prison is above your current slot capacity… / other: {count} prisons are above… | **Tyle więzień przekracza obecny limit slotów i nie da się ich przenieść do chmury, dopóki uprawnienie nie zostanie potwierdzone: {count}.** | **plural key — see §2.** Also **R5**: the English "{count} prisons are above…" puts the numeral in front of a verb |
| `entitlements.unverified-offline` | Paid slots are shown from your last confirmed entitlement. | **Płatne sloty są pokazane na podstawie ostatniego potwierdzonego uprawnienia.** |  |
| `entitlements.base-tier` | Showing free slots only until your entitlement can be confirmed. | **Do czasu potwierdzenia uprawnienia widoczne są tylko darmowe sloty.** |  |
| `challenge.result.verified` | Verified result | **Wynik zweryfikowany** |  |
| `challenge.result.unverified` | Personal result — not eligible for ranking | **Wynik prywatny — nie liczy się do rankingu** |  |
| `challenge.result.rejected` | Result rejected: {reason} | **Wynik odrzucony: {reason}** | `{reason}` — **Q13**: nothing in the tree says whether this arrives as a message key or as untranslated text |
| `telemetry.consent.title` | Help improve Lockstate? | **Pomóc w ulepszaniu Lockstate?** |  |
| `telemetry.consent.body` | Nothing is sent unless you tick a box. You can change this at any time, and your choice is stored on this device only. | **Nic nie jest wysyłane, dopóki nie zaznaczysz pola. Możesz to zmienić w każdej chwili, a twój wybór jest zapisany tylko na tym urządzeniu.** | **Q12** |
| `telemetry.consent.diagnostics` | Send crash and error diagnostics | **Wysyłaj diagnostykę awarii i błędów** |  |
| `telemetry.consent.performance` | Send performance measurements | **Wysyłaj pomiary wydajności** |  |
| `telemetry.consent.gameplay` | Send anonymous gameplay statistics | **Wysyłaj anonimowe statystyki rozgrywki** |  |
| `telemetry.consent.accept` | Save my choices | **Zapisz moje wybory** |  |
| `telemetry.consent.decline` | Send nothing | **Nie wysyłaj niczego** |  |

---

## 6. The conventions this whole catalogue follows

Six rules, applied everywhere above. They are stated so a reviewer can reject one
of them once instead of five hundred times.

1. **Sentence case, not Title Case.** English title-cases content names (*Wood
   Plank*, *High Security*, *Awaiting Materials*); Polish does not capitalise
   common nouns mid-phrase. Every candidate capitalises only its first letter —
   *Racja żywnościowa*, *Czeka na materiały* — except the `save.scope.*` items,
   which are lower-case throughout because they are spliced into the middle of a
   sentence (R11).
2. **The impersonal `-no`/`-to` past is the default voice for anything that
   happened.** *Zwolniono*, *nie przyjęto*, *nie postawiono*, *odmówiono*. It has
   no subject and no gender, which is what lets 53 refusal and fault sentences be
   translated without a single reshape, and it is also the register a Polish
   institution actually writes in. This is the single most useful thing Polish
   grammar offers this catalogue.
3. **A parameter goes after a colon, a middle dot, or `×`, or it is the subject.**
   Those are the four positions where Polish leaves a nominative alone. Every
   reshape in §1 is an application of this one rule.
4. **`×` and `·` are kept exactly as English has them**, and `Speed {speed}x`
   gains the `×` it should have had. §1's closing list explains why `×` is
   load-bearing here and not decoration.
5. **Adjective families agree with the noun the panel puts on screen, and that
   noun is named in the row's note.** `risk-tier.*` agrees with *ryzyko*
   (neuter), `sector-control-state.*` with *sektor*, `worker-state.*` with
   *symulacja*, `job-state.*` with *zadanie*, `build-order-state.*` with
   *zlecenie*, `door-state.*` with *drzwi* (plural-only). Where no such noun could
   be found in the code, the row says so and asks — Q8.
6. **A family that must agree in English must agree in Polish.** The seven object
   categories exist under two key families that differ by one character
   (`object.category.<id>.name` and `object-category.<id>.name`), and
   `tests/foundation/content-vocabulary-contract.test.ts` fails on a divergent
   pair. §5.3 gives one Polish string per id, listed twice.

**What was deliberately *not* done:** no key was renamed, no parameter was added
or removed, no call site was assumed to change, and no English string was
rewritten. Ten of the eleven reshapes are Polish-only for exactly that reason.

---

## 7. What would have to be true for this to be wrong

**The weakest claim, named.** *Every Polish string here is one non-native-graded
person's judgement, and the owner is a native speaker.* That is the whole reason
the document is a proposal. But that is the weakness of the deliverable, not a
claim, so here is the actual weakest **claim**:

> **The claim: reshaping is sufficient — that no key in this catalogue needs
> grammatical-case machinery, and the eleven fixes in §1 cover the whole class.**

It is the load-bearing conclusion, it is the one #661 most wanted answered, and it
is established by a method that could miss something: I enumerated the 70 keys
whose English contains a `{placeholder}` (mechanically, from the exported
catalogue), classified each by what its parameter is, and opened the call site for
**eight** of them — `{field}` ×2, `{material}`, `{object}`, `{room}`, `{stage}`,
`{activity}`, `{categories}`. For the rest I read the key's own authored comment
and inferred the parameter's origin from it. A parameter that is *not* what its
key's comment says it is would break a candidate silently, and would most likely
break it by putting a whole *sentence* where I assumed a noun.

**What would change my mind:** a call site that passes an already-formatted
phrase rather than a resolved label — for instance `{claim}` in
`hud.security.held-row`, which I read as a `guard-claim.*.name` and did not open.
If any parameter turns out to carry a clause, that key moves from Class A to
Class B and the "no ADR needed" conclusion weakens for it specifically. It would
not overturn §1: the ten reshapes that *were* traced to a call site stand on
their own evidence.

**Two smaller claims, ranked below it:**

- **That `Zmniejsz: {field}` is better than `Zmniejsz {field}`.** The short form
  is accidentally correct for all five current field labels (R3 shows the
  arithmetic). I proposed the colon because the accident is invisible and would
  break silently. A reviewer who prefers the shorter aria-label is not wrong, and
  the answer is a naming rule on field labels rather than a colon.
- **That `Strefy` is an acceptable `hud.tab.rooms`.** **Corrected in one direction on
  2026-08-30, and only one: the browser assertion this claim was fitted to does not
  fire.** A 13-character label leaves the bar at 12.0 … 363.0 at 375×812 with `tabs.x
  >= 0` and `tabs.right <= 375` both passing; it clips and overlaps instead
  ([which word for a prisoner](./2026-08-30-which-word-for-a-prisoner.md) §5.2). So the
  sentence below overstates what enforces the six-character budget — nothing does —
  while its preference for being overruled stands unchanged, and is now better founded:
  a word picked to fit an assertion that cannot fail is worse than one picked to fit a
  measured overlap. The claim as written:
  It is six characters because
  ADR 0022's measurement leaves room for six, and it is *not* what the panel
  designates — the panel zones rooms, and "strefa" is closer to "zone" than to
  "room". If the owner rejects it, the honest word is *Pomieszczenia* and the tab
  bar has to change. **I would rather be overruled here than have picked a Polish
  word to fit a browser assertion without saying so.**

---

## 8. Handed over

- **`src/main.ts`'s "twelve more strings"** is sixteen. §4(2). One word, in a
  comment, in a file this branch may not touch.
- **`src/ui/save-panel-messages.ts:47`** predicts that *"the first locale that
  needs `one`/`few`/`many` here needs this key moved to a plural-capable catalog
  and `formatPlural` at the call site."* Polish is that locale and **does not**
  need it for that key — `gen.` does not decline. The comment is not wrong, it is
  waiting for a different locale than it expects.
- **For #664, or whatever wires a `pl` catalogue up:** the three findings in §2
  are a prerequisite, not a footnote. A `pl` catalogue that ships plural forms
  into today's `HudLocalizer` renders `other` for every count with no error, no
  missing-key report and no test failure — which is a defect that looks exactly
  like a translation mistake. Either wire `formatPlural` first, or take §5 as it
  stands, which needs no plural forms at all.
