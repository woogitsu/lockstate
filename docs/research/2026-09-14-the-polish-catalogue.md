# The Polish catalogue: who writes the words, and the twelve questions answered

**2026-09-14. Issue [#661](https://github.com/woogitsu/lockstate/issues/661).
ADR 0011 is the governing decision. Branch `agent/661-pl-catalogue`.**

This record does three things, in the order they had to be settled: it decides
whether #661's approval step still binds, it re-measures the catalogue, and it
answers the twelve questions the 2026-08-30 candidate corpus left open. The
catalogue itself is `src/content/locale-pl.ts` and
`src/services/localization/pl-catalog.ts`; the reasoning per key is in those
files' own comments, beside the string, because that is where it stays true.

**Evidence tiers** (`docs/research/README.md`): every claim about *this
repository* is **VERIFIED** with the file and line that was opened. Every claim
about *Polish* is **JUDGEMENT** and says so.

---

## 1. #661's approval step does not still bind, and the reason is dated

**#661 was filed on 2026-08-30 and reserves the words to the owner**, verbatim:

> **The owner.** `AGENTS.md` reserves player-facing strings, and that rule does
> not weaken because the target language is the owner's own.
>
> - an agent produces **candidate** translations, grouped by panel, with every
>   key that needed its sentence reshaped **flagged and explained**;
> - the owner approves, edits or rejects;
> - nothing ships unapproved.

**That paragraph does not state an independent reason. It cites one** — the
fourth reservation of `AGENTS.md`, as that reservation stood on 2026-08-30 —
and then applies it. So the question is entirely about whether the cited
premise still holds.

**It does not. `AGENTS.md`'s fourth reservation was partly released on
2026-09-04, five days after #661 was written**, and the release is precisely
the half #661 rests on. Quoted from `AGENTS.md` (the section "The owner's
standing mandate, and the four things it does not cover", item 4):

> **Partly released by the owner on 2026-09-04: the CHOICE OF WORDS is ours
> now; the requirement that a sentence be TRUE is not.**

The owner's own words in that entry, given twice to two different questions:

> Sam decyduj zawsze, jak zacznę grać to ujednolicimy

("Decide yourself, always; when I start playing we will unify them.")

> Wybierz sam a potem się ujednolici sposób pisania

("Choose yourself, and afterwards the way it is written will be unified.")

**Three things make this a settled reading rather than a convenient one.**

1. **The release is about wording as such, not about a particular string.**
   `AGENTS.md` says so in its own summary of what moved: *"What the release
   covers, exactly: choosing the wording. It does not touch the reservation's
   actual subject, which is the *promise*."* A translation is a choice of
   words; there is no reading on which choosing Polish words is outside a
   release of choosing words.
2. **It was restated as a standing fact nine days later, in the same file.**
   `AGENTS.md`'s 2026-09-13 identity-delivery section: *"The wording of a
   player-visible string has been ours since 2026-09-04; its truth has not."*
   `docs/IDENTITY_V5_ROLLOUT.md` stage 6 — which is *the language stage*, the
   one this work belongs to — repeats it as the reservation governing that
   stage. So the reading is not an inference from a single sentence; it is what
   two later documents say the rule now is.
3. **`CLAUDE.md` warns against exactly the mistake of reading a stale
   paraphrase as current, and names the expensive direction.** Its own preamble:
   *"It has done so twice, both times in the direction of asking for permission
   the owner had already given, which is the expensive direction."* #661's
   approval step is that shape — a correct statement of a rule, outliving the
   rule.

**What the release does not do, and what this branch therefore owes.**

- **Truth was never released.** Every Polish sentence must be true of the code
  that renders it. The Polish here translates English that is already gated by
  `tests/foundation/localization-key-completeness.test.ts` and the
  player-string inventory, so the work of establishing truth is mostly the work
  of *not changing what the sentence claims* — and the places where Polish
  grammar forced a different claim are §4 below, every one of them named.
- **The recording obligation is live.** `AGENTS.md`: *"Every string authored
  under this release is therefore recorded — in the commit that lands it and in
  the pull request body, quoted verbatim alongside the code opened to prove it
  true — so the harmonising pass is one reading rather than an excavation."*
  A catalogue file is the one artefact where that is satisfied by construction:
  **the file is nothing but the strings**, each on its own line beside its key,
  and the commit that adds it quotes every one of them verbatim in its diff.
  The commits say so explicitly rather than leaving a reader to notice it.
- **The owner's own ruling of 2026-08-30 still binds**, because it is a ruling
  and not a reservation. *Osadzony* in official labels, *więzień* in event text
  and flavour. §3's Q1 records how it is applied.

**What would change this conclusion.** A sentence anywhere in `AGENTS.md`
narrowing the 2026-09-04 release to the six strings that prompted it, or
re-reserving a whole locale. There is none: the word the owner used is
*zawsze* ("always"), and the two later restatements are unqualified.

---

## 2. The key count, measured

**#661 says 387. A measurement on 2026-09-14 said 466. Both are counting
something real and neither is the number this catalogue is against.**

Measured by importing the modules under Vitest in this worktree at `189a97a3`
and counting the exported objects — not by grepping the file, which is what
produces the smaller numbers:

| What | Count |
| --- | --- |
| **`defaultMessageCatalogEn.messages` — the catalogue `src/main.ts` builds and a player sees** | **669** |
| `defaultLocaleEnCatalog` — the content-side module's export | 653 |
| &nbsp;&nbsp;of which derived by `simulationEnumMessages()` | 177 |
| &nbsp;&nbsp;of which the `authoredMessages` literal object | 476 |
| `SERVICE_MESSAGES` — `src/services/localization/default-catalog.ts` only | 16 |
| plural entries in the whole bundled catalogue | 2 |
| flat messages interpolating `{count}` | 27 |

**So #661's 387 and the 466 are both counts of the literal object in
`default-locale-en.ts`, at two different dates** — the 466 is
`docs/research/2026-09-14-stage-6-language-gap.md`'s, measured at `236bed4e`
and described there as *"the 466-string English catalogue"*; it holds 476 at
`189a97a3`, ten keys later the same day. The
module's *export* is larger than its literal because `simulationEnumMessages()`
is merged on top of it, and the *bundled* catalogue is larger again because the
services layer contributes sixteen strings that a `pl` catalogue omitting them
would leave in English on a Polish screen.

**669 is the number a second locale is against**, and it is the one the
coverage floor in `tests/foundation/second-locale-contract.test.ts` is measured
as a fraction of.

---

## 3. The twelve open questions, answered

The 2026-08-30 corpus asked thirteen. **Q1 was ruled by the owner on that day**
and the criterion derived from it is
`docs/research/2026-08-30-which-word-for-a-prisoner.md`. The other twelve were
put to the owner because the reservation then required it; under §1 they are
ours, and they are answered here rather than left open. **JUDGEMENT throughout,
except where a citation is given.**

**Q1 — *osadzony* / *więzień*.** Ruled by the owner; applied by the criterion.
Eleven keys take *Osadzony*, one narrated sentence keeps *więzień*. Its second
half — the masculine, against a name pool that mixes *Adan* and *Wanda* with no
gender field (**VERIFIED**: `src/simulation/identity/name-pool.ts:35` says
there is *"no gender model anywhere in the simulation"*) — is answered by
avoidance rather than by choosing: the impersonal `-no`/`-to` past removes the
person from every sentence that would otherwise need a gendered verb, and the
two places it cannot (`{name}` as a heading, *Ktoś* for an escaping prisoner)
are §4's R1 and its neighbour. Where a masculine noun is unavoidable it stays
masculine, which is the Polish generic.

**Q2 — register.** **Institutional, not the wing's own slang.** `room.yard.name`
is *Plac spacerowy* rather than the corpus's *Spacerniak*. The argument is the
owner's own Q1 ruling: it put the official word in labels because *"that is how
the language of a real institution actually behaves"*, and a room-type name in
the institution's own catalogue of rooms is a label of exactly that kind. The
identity delivery's product voice corroborates — *fakt → miejsce → następny
krok* with four plain direct verbs (`projekt.md:101,103`) is an institutional
register, not a slang one. `action.yard-recreation.name` stays *Spacer*, which
is neutral rather than slang.

**Q3 — *Kontrabanda*.** Against *Przedmioty niedozwolone*, which is the fuller
penitentiary phrase, is twenty-three characters where a status chip reads
*Kontrabanda*'s eleven, and would flip all three `contraband-state.*`
adjectives from feminine singular to neuter plural for no gain.

**Q4 — *Incydenty*, against the corpus's *Zajścia*.** Three reasons: the code's
own vocabulary is `incident-type.*`/`incident-state.*` and a Polish reader of
the panel and a Polish reader of the code should meet the same word; *zajście*
is the everyday-quarrel word and reads as narration where this is a label; and
the real term of art, *zdarzenie nadzwyczajne*, is far too long for the chip.
This changes `hud.status.incidents`, `save.scope.incidents`,
`guard-claim.incident-response.name` and the two all-clear sentences.

**Q5 — the tab bar.** **The honest word, and the width problem is reported
rather than translated around.** `hud.tab.rooms` is *Pomieszczenia*, thirteen
characters, not the corpus's *Strefy*, which was six because ADR 0022's
measurement left room for six. The corpus's own §7 names that as the choice it
would rather be overruled on — *"I would rather be overruled here than have
picked a Polish word to fit a browser assertion without saying so"* — and
`2026-08-30-which-word-for-a-prisoner.md` §5 then re-measured and found the
assertion **does not fire**: a thirteen-character label leaves the bar inside
its bounds and instead clips `Overview`'s label by 2.2 px and overlaps
`Security`'s by 10.3 px. **That measurement is inherited, not re-taken here**:
re-taking it needs the catalogue wired into a running page, which is #662 and
out of this branch's scope. It is carried into §6 as an owed item.
`hud.tab.regime` is *Rozkład* — a genuine shortening of *Rozkład dnia*, which
is what the panel shows, not a word picked for width.

**Q6 — gendered job titles.** **Masculine throughout**, so the eight roster
rows are one register: *Pielęgniarz* (though *Pielęgniarka* is the commoner
word), *Lekarz*, *Strażnik*, *Konserwator*. *Kucharz* rather than *Personel
kuchni* for `staff-role.kitchen-staff.name`, because the control hires one
person whatever the English collective says.

**Q7 — `brand.stage`.** **Left as `PRE-ALPHA`.** It sits on a badge beside an
untranslated wordmark and is a build-stage token rather than a sentence.

**Q8 — the two families whose gender could not be read off the code.** Half of
this is now answered from the code rather than guessed. `door-side.*` labels a
tile **edge**: `src/content/simulation-message-keys.ts:534` says the group
names the same geometry as `build-edge` *"under its own storage names (`top`,
`left`)"*, and that storage is `SparseWorld`'s `topEdge`/`leftEdge` layers
(**VERIFIED**). The Polish noun is *krawędź*, feminine, so *Lewa*/*Górna* are
correct and are no longer a guess. `grade.*.name` is still a guess and is
labelled as one in the file: nothing renders it, so the masculine adjectives
assume an implied *poziom*/*stopień*.

**Q9 — the `action.*` labels.** **Verbal nouns**, as the corpus proposed, and
the liveliness is the price: `hud.regime.roster-heading` wraps the value as
*W drodze: {activity}*, and that wrapper cannot take a present-tense verb.
Letting the bare cell and the wrapped value differ would need a second key and
a call-site change, which is a content decision rather than a translation one
and is not taken here.

**Q10 — the five terms of art.** *Cela przejściowa*, *Ambulatorium*,
*Naczelnik*, *Przydział celi* as proposed. **One change:** `room.reception.name`
is *Punkt przyjęć* rather than *Przyjęcia*, because the bare noun collides with
`hud.intake.title` — English separates them by context ("Reception" against
"Intake") and Polish would have printed one word for a room and a process.

**Q11 — money.** *Środki*, as proposed. *Budżet* implies a plan the game does
not model, and *Kasa* is colloquial where the rest of the strip is not.

**Q12 — how the game addresses the player.** **Informal *ty*, and this one is
settled by an owner document rather than by preference.** The identity
delivery's product voice names four direct verbs — *"Wybierz, Sprawdź,
Zaplanuj, Zapisz"* (`docs/design/2026-09-13-identity-v5/DOKUMENTACJA/projekt.md:103`,
vendored verbatim and never edited) — and all four are second-person singular
imperatives. The impersonal alternative (*do zatrudnienia*, *nie należy do
gracza*) is what Polish office software writes and is not what the owner's own
delivery writes.

**Q13 — `challenge.result.rejected`'s `{reason}`.** Still unknowable from the
tree, and the Polish is written to work either way: *Wynik odrzucony: {reason}*
puts the parameter after a colon, where it reads correctly whether it arrives
as a resolved label or as raw text.

---

## 4. What was reshaped, and the one class that would have needed an ADR

**Twenty-six keys carry a Polish sentence whose *shape* differs from the
English. All twenty-six are Class A: same parameters, same facts, same order,
no English string changed, no call site changed, and no grammatical-case
machinery added to the localiser.** Each one's reason is in
`src/content/locale-pl.ts` beside the string; the classes are:

| Class | Keys | Why the literal rendering fails |
| --- | --- | --- |
| **Imperative plus object** | `hud.build.step-down`, `step-up`, `hud.rooms.step-down`, `step-up`, `hud.security.hire` | A Polish imperative takes the accusative; the parameter arrives nominative. With today's five field labels the bare form is *accidentally* right — an accident that breaks silently the first time a field is called *Liczba*. An animate masculine accusative is never equal to its nominative, so `hud.security.hire` is wrong for **every** current role. |
| **Numeral before a participle** | `hud.build.queue-count`, `deliveries-count`, `hud.security.held-summary` | A participle agrees with what it counts: *1 czekające*, *5 czekających*. Reversing the pair costs nothing. |
| **Numeral before a verb** | `hud.intake.no-place`, `pipeline-failed`, `pipeline-stage` | A Polish verb agrees in number with its numeral and the rule flips at five (*2 czekają*, *5 czeka*). English has no equivalent, which is why the English catalogue never had to think about it. |
| **Preposition plus catalogue name** | `hud.regime.roster-heading`, `block-allows`, `block-progress`, `hud.rooms.needs-room` | **This is the class that would have justified the ADR #661 forbids, and it does not need one.** *Heading to {activity}* needs both a case and a preposition that depend on the destination — *do stołówki*, *na plac spacerowy*, *pod prysznic* — so a system that knew every noun's declension would still have to know which preposition each takes. A colon needs neither. |
| **Product plus noun** | `hud.rooms.area-value`, `minimum` | After a product Polish wants the genitive plural (*10 × 8 pól*) except at 1 × 1 (*1 × 1 pole*), and `area-value` renders the player's live drag, which is 1 × 1 the instant they press. |
| **Gendered agreement with a name or a room** | `hud.alert.event.prisoners.relocated`, `.housed`, `.incidents.escape-succeeded`, `.rooms.zoned`, `.unzoned`, `.needs-cleared`, `hud.rooms.at-capacity-room`, `save.tombstone.item`, `save.status.tombstone-restored` | A Polish past tense inflects for gender and there is no gender model anywhere in the simulation; a room's or a prison's name has a gender the catalogue cannot know. The impersonal `-no`/`-to` past and a heading-plus-colon frame agree with nothing. |
| **Counted noun** | `hud.status.rooms-not-ready`, `hud.alert.event.prisoners.discharged`, `.incidents.riot-opened` | *2 niegotowe* against *5 niegotowych*; and `DEFAULT_MINIMUM_RIOT_PARTICIPANTS` is **2**, which is exactly where the Polish rule flips, so the English's own escape hatch — pick a range where one form is always right — does not exist here. |
| **One list, two cases** | `save.detail.restored-scope` | The thirteen `save.scope.*` items are spliced into both halves, and the two frames demand the accusative and the genitive of the same list. No reshape of the *items* fixes it; both frames become labels instead. |

**Three keys #661 expected to need reshaping do not**, and each is a place the
English catalogue's own shape already dodged the problem: `Buy {count} ×
{material}` (the `×` is ordinary Polish order notation and keeps the
nominative — **the `×` is load-bearing for this locale and worth defending in
any future copy change**), `save.list.item`'s `gen` (an abbreviation declines no
more than it pluralises), and the `hud.build.target-*` family (a middle dot
licenses a nominative).

**No key could not be reshaped.** #661 asked for a report and a proposal if one
turned up; none did.

**One English string is worth flagging even though it was not changed.** #661
quoted *"Costs {total} now and {wage} a day in wages."* as a trap and the
2026-08-30 corpus correctly reported that no such key existed. It exists now —
`hud.security.hire-hint`, *"Costs {total} now and {wage} a day in wages,
including today."* — and #661's observation was right: *a day* is **dziennie**,
an adverb, not a noun phrase. It needed no reshape, only the adverb.

---

## 5. Coverage, and the counted-message inventory

**669 of 669.** `src/content/locale-pl.ts` carries 558 keys and
`src/services/localization/pl-catalog.ts` the remaining 111 plus the sixteen
service strings, and `tests/foundation/second-locale-contract.test.ts` now
registers `pl` beside the pseudo-locale and ratchets it at 669. The audit
reports **no** unknown key, dropped placeholder, unfillable placeholder, empty
message, flattened plural or missing plural category.

**That is a measurement after the fact, not a target that was chased**, and the
distinction is #664's rule: the floor ratchets what was authored, a key added
to English tomorrow does not fail it, and `pl` simply falls back for that key.
Nothing here was translated in order to make a gate pass.

**The counted-message inventory did not move.** `FLAT_MESSAGES_WITH_COUNT`
pins 27 English keys that interpolate `{count}` into a flat string; it pinned
27 before this branch and pins 27 after, because **no English string was
touched**. Turning one of them into a plural entry would mean authoring its
English forms, which is a change to the English catalogue and a separate
decision — and it would buy nothing today, because nothing in the running game
calls `formatPlural`.

**The two plural entries that do exist are authored in full.**
`save-slots.available` and `save-slots.over-capacity` carry all four categories
Polish selects. The trap they avoid is worth naming: in Polish `other` is the
**fraction** category (`Intl.PluralRules('pl')` puts 1 in `one`, 2–4 and 22–24
in `few`, 0 and 5+ in `many`), so the instinct to put the 5+ form in `other`
"because it is the fallback" is wrong twice — wrong for fractions, and, since
`Localizer.format` reads `entry.value.other` and `HudLocalizer` exposes no
`formatPlural`, `other` would be the only form anybody ever saw.

---

## 6. What is owed, and to whom

1. **The tab bar, and it is a measurement rather than a translation.**
   `hud.tab.rooms` is *Pomieszczenia*, thirteen characters. The inherited
   measurement (`2026-08-30-which-word-for-a-prisoner.md` §5, taken at 375×812)
   says a thirteen-character label does **not** fail
   `tests/browser/ui-shell.spec.ts`'s assertions — it stays inside the bar —
   but clips `Overview`'s label by 2.2 px and overlaps `Security`'s by 10.3 px.
   **This branch did not re-take that measurement**: doing so needs the
   catalogue wired into a running page, which is #662. It is owed to whoever
   does #662, and it is a layout defect to fix rather than a word to shorten —
   stage 3 of `docs/IDENTITY_V5_ROLLOUT.md` is rewriting that shell now.
2. **The masculine, which the owner's Q1 ruling did not touch.** Every
   person-noun in this catalogue is masculine, against a name pool that mixes
   *Adan* and *Wanda* with no gender field. The impersonal device removes the
   problem from every sentence it can reach; it cannot reach a noun like
   *Osadzony {id}* or *Strażnik {id}*. A gender model in the simulation would
   fix it and is far more than a translation.
3. **Q13 is still unanswered and is still unanswerable from the tree.** Nothing
   says whether `challenge.result.rejected`'s `{reason}` arrives as a message
   key or as raw text. The Polish works either way; the sentence would be
   better if the answer were known.
4. **The delivery half.** Nothing here registers a chunk, a supported-locale
   list or a picker. `messageCatalogPl` exists so the audit has something to
   judge; #662 is what makes it reachable.
