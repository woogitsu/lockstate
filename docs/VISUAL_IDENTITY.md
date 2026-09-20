# Visual identity and product voice

This document is the repository's reading of the design direction the owner
delivered on 2026-09-13. The delivery itself is vendored verbatim under
[`docs/design/2026-09-13-identity-v5/`](./design/2026-09-13-identity-v5/) and is
never edited; this file says what it binds *here*, what it does not, and where
this repository's code disagrees with it today.

[ADR 0112](./adr/0112-what-the-2026-09-13-identity-delivery-decides.md) is the
decision record. **The owner ruled on all five of its decisions on 2026-09-13**,
two of them against its recommendations; its Status block carries each ruling
and its provenance. [`docs/IDENTITY_V5_ROLLOUT.md`](./IDENTITY_V5_ROLLOUT.md) is
the staged plan for getting from today's UI to this one.

> **This sentence used to end "and the three sentences of this document that the
> rulings changed say so where they stand", and it is corrected rather than
> deleted** (`docs/AGENT_WORKFLOW.md` §4: mark both directions, and a tally is
> the sentence form that rots first). The count was wrong in both directions at
> once: four sentences said so, not three — the constitution's acceptance, the
> type scale, article 8's amendment and the navigation move — while **two of the
> five rulings, decisions 2 and 5, were restated nowhere in this document at
> all**. Both are restated below now. The section that follows replaces the
> tally with a subject: it names each ruling and the place that restates it, so
> adding a sixth ruling breaks a named row rather than silently making a number
> stale.

## How to read a sentence in this document

`docs/ISSUE_BACKLOG.md`'s source-of-truth order gained a rung on 2026-09-15, by
the owner's ruling, and this document is one of that rung's two members: **the
repository's reading of an accepted ADR binds where it restates a ruling, and
does not bind where it is a snapshot of code.** That file states the cost in its
own words — *"Each sentence in such a document has to be classifiable as
**restatement of a ruling** or as **reading of the code**, and **nothing checks
that classification**"* — and it sets the default: *"Where a document's own
sentence does not make clear which it is, it is a reading and does not bind."*

That default is safe and it is lossy: applied to this document as it stood, it
demoted every real restatement in it, because not one of them said out loud
which kind it was. So this document now says so where each sentence stands.
Three kinds appear below.

- **A restatement of a ruling. It binds.** It carries a bold lead-in naming what
  it restates — **Restates ADR 0112 decision 3**, or **Binds through decision 1**
  for a constitution article. If one of these disagrees with ADR 0112, that is a
  conflict of contracts rather than a documentation bug: the ADR wins and the
  sentence here is the defect.
- **A reading of the code. It binds nothing.** A measurement of `src/` at a
  stated commit. Where it disagrees with the code, the code is right and the
  sentence rotted (`docs/AGENT_WORKFLOW.md` §3). The whole of §"Where this
  repository stands against it" is this kind and repeats the warning under its
  own heading.
- **The delivery's own material, which no ruling reaches.** Palette values,
  spacing, radii, motion durations, the character note. It is the reference a
  UI change is checked against — that obligation is `.agents/rules/lockstate.md`'s
  and `AGENTS.md`'s, and it is a *reading* obligation rather than a contract
  rung — and turning any of it into a contract needs a ruling, not an edit here.

**Where each of the five rulings is restated, named rather than counted.**

| ADR 0112 decision | What was ruled | Restated in this document at |
|---|---|---|
| 1 — the constitution binds | it binds, as a product contract under `AGENTS.md` | §"The constitution" |
| 2 — themes | two themes, the light one default | §"The palettes" |
| 3 — navigation | the delivery's five sections, now | §"Navigation" |
| 4 — type scale | 15 / 13 / 11, and article 8 amended to 15 px | §"Typography, shape and motion" and §"The constitution" |
| 5 — world illustration | a reference, nothing cut out of it, plus new production prompts | §"What is explicitly **not** binding" |

**One thing this classification found that it is not an agent's to settle, so it
is stated as a question rather than answered.** Constitution article 8's type
sentence carries three numbers — *"Tekst podstawowy: 16 px, regularne etykiety:
14 px, metadane: 12 px."* — and decision 4 amends the article *"to 15 px"*,
while ADR 0112's list of what in article 8 is untouched (*"contrast, visible
focus, 200 % text, a status carrying a label and an icon as well as a colour"*)
names none of the other two. The ruled scale is 15 / 13 / 11 and the code ships
it, pinned by `tests/unit/ui-design-tokens.test.ts`; read strictly, the amended
article still says 14 px and 12 px. **Whether the amendment carries all three of
the article's numbers or only the first is the owner's to say**, and nothing is
changed here on either reading. It is recorded here and nowhere in the delivery,
for the reason decision 4 already gives.

> **RULED BY THE OWNER ON 2026-09-16: the amendment carries all three.**
> Article 8 reads **15 / 13 / 11**. **This restates ADR 0112's §*Amendment,
> 2026-09-16*, so it binds under the first of the three kinds above**; the
> paragraph it sits under is kept exactly as it stood rather than rewritten,
> because the record of a question having been open is what makes the answer
> legible (`docs/AGENT_WORKFLOW.md` §4, both directions) — and because *"read
> strictly, the amended article still says 14 px and 12 px"* was a true
> description of the documents for three days.
>
> **The provenance is the weaker kind, and the paragraph above is the reason it
> is worth having anyway.** The owner chose a clickable option labelled
> *"Poprawka niesie wszystkie trzy"* rather than typing a sentence, and what the
> label agreed is the **reading of article 8's scope**. No ramp value was
> agreed, because none was open: 15 / 13 / 11 was already ruled, already built
> and already pinned by `tests/unit/ui-design-tokens.test.ts`. The sentence above
> remains right that *"nothing is changed here on either reading"* — what changed
> is which reading the documents state.

## The three-line summary, before any detail

**Lines 1 and 2 bind through decision 1** — they are constitution articles 1, 2
and 5 in English. **Line 3 is a reading of the delivery and binds nothing.**

1. **The map is the game; panels serve it.** One panel is the place of work at
   any moment, it sits beside the map rather than over it, and opening it issues
   no simulation command.
2. **Every sentence the game shows a player must be true**, and the delivery's
   twenty-article constitution spends most of its length on what that costs.
3. **The delivery is a direction, not an implementation.** Its prototype is a
   standalone HTML/CSS/JS mock with sample data, a single raster map and
   `localStorage`. None of that crosses into this repository.

## What the delivery contains

| Path under the delivery | What it is |
|---|---|
| `START_TUTAJ.md` | Entry point, scope and the handover's own safety rules |
| `DOKUMENTACJA/01-BRIEF-I-DECYZJE.md` | The owner's brief and the source hierarchy for conflicts |
| `DOKUMENTACJA/02-SYSTEM-WIZUALNY.md` | The binding visual system: palettes, rhythm, typography, icons |
| `DOKUMENTACJA/03-INTERAKCJE-I-URZADZENIA.md` | Navigation, build loop, panel geometry, theme, device tiers |
| `DOKUMENTACJA/04-RESEARCH-I-BACKLOG.md` | Five cited sources, what was implemented, eight unimplemented proposals |
| `DOKUMENTACJA/05-INSTRUKCJA-DLA-MODELU.md` | The brief for the implementing model, in eight ordered steps |
| `DOKUMENTACJA/06-PLAN-TESTOW.md` | Thirteen screen-level acceptance areas |
| `DOKUMENTACJA/07-STATUS-I-OGRANICZENIA.md` | What was verified and what was not — read this before quoting anything |
| `DOKUMENTACJA/08-PROMPT-GRAFIKI.md` | Provenance of the one world illustration, including the full prompt |
| `DOKUMENTACJA/09-REJESTR-WERSJI.md` | The five iterations, each with the sha it was taken at **in the prototype's own repository** |
| `DOKUMENTACJA/konstytucja.md` | The twenty-article product constitution |
| `DOKUMENTACJA/projekt.md` | The full specification, with iterations 01–05 as history |
| `DOKUMENTACJA/audyt.md` | The iteration-05 audit: eight fixed defects, nine logic tests, open risks |
| `AKTUALNY_PROTOTYP/` | The published iteration-05 prototype and its nine-case logic suite, `docs/design/2026-09-13-identity-v5/AKTUALNY_PROTOTYP/tests/audit.cjs` |
| `HISTORIA/` | All five iterations as complete snapshots, plus git patches between them |
| `ASSETY/`, `REFERENCJE/` | The world illustration; screenshots of this repository's UI and the owner's marked-up notes |

## What is binding, and what here is only the delivery's own material

**Read the lead-ins, not the heading.** This section used to be titled
*"What is binding"*, and under the rung added on 2026-09-15 that title was the
single most misleading sentence in the file: most of what follows is the
delivery's material, which no ruling reaches. Each subsection now says which
kind it is in its first line, and the heading is widened rather than the
contents moved, so every existing citation of a subsection still lands.

### Product promise and voice

**Binds through decision 1, in part: the message pattern is constitution
article 6** (*"Komunikat podaje fakt, lokalizację i następny krok"* — a message
gives the fact, the place and the next step), so decision 1 makes it a contract.
**The promise line and the verb list are the delivery's material and are not
ruled.**

**"Twoje decyzje. Żywy świat."** — "Your decisions. A living world." The
delivery states in `DOKUMENTACJA/02-SYSTEM-WIZUALNY.md` that this is identity
material and must not be used in place of a useful heading inside the tools.

The message pattern is **fact → place → next step**, with direct verbs
(*Wybierz, Sprawdź, Zaplanuj, Zapisz* — Choose, Check, Plan, Save). The
specification carries a ten-row table of worked examples. Those rows are
*shapes*, not strings to paste: the numbers in them are invented, and
`AGENTS.md`'s fourth reservation makes the truth of a player-visible sentence
the owner's, not ours, however free we are with its wording.

### The palettes

**Restates ADR 0112 decision 2: two themes, the light one the default, the dark
one kept.** That much binds, and `src/ui/theme.ts`'s own docblock already reads
the ruling the same way — *"light **is** the default theme (ADR 0112 decision
2)"*. **The values in the two tables below are the delivery's material and are
not themselves ruled**; they bind here only as the source
`src/ui/tokens.css:83` cites for the rungs it declares, and that file records a
derivation and its reason beside every rung that is not one of these values.

Day (the default the delivery designs for). Eleven of these rows are
`DOKUMENTACJA/02-SYSTEM-WIZUALNY.md`'s own table; **"secondary ink" is not** —
it appears as *"Drugorzędny atrament #244454"* in `DOKUMENTACJA/projekt.md`'s
iteration-01 section, and is kept here because the prototype's light theme
carries the value as a live custom property:

| Role | Value |
|---|---|
| Frame / ink | `#122C3A` |
| Secondary ink | `#244454` |
| Text | `#183442` |
| Subtle text | `#5C717D` |
| Action / teal | `#007477` |
| Brand mint | `#89E0C3` |
| Surface | `#FFFFFF` |
| Background | `#F2F6F8` |
| Border | `#DCE5E9` |
| Selection | `#DFF5F0` |
| Warning | `#895300` on `#FFF1D7` |
| Danger | `#B63744` on `#FFEBED` |

Night:

| Role | Value |
|---|---|
| Background | `#10232E` |
| Header frame | `#0B1D27` |
| Panels | `#132A36` / `#193440` |
| Text | `#E0EDF2` |
| Subtle text | `#ADC2CD` |
| Accent | `#8CDEC9` |
| Selection | `#22473F` |
| Primary button | `#89DFC7`, text `#102C2D` |
| Border | `#36505E` |
| Warning | `#F0C77F` on `#443522` |
| Danger | `#FFB3B9` on `#482B35` |

One value carries a recorded correction and must not be reverted: the teal was
darkened from `#007E80` to `#007477` after a contrast check. The delivery says
so in its own words — *"Turkus został przyciemniony z początkowego #007E80 po
sprawdzeniu kontrastu. Nie wracać do pierwszej wartości."*

### Typography, shape and motion

**Restates ADR 0112 decision 4 in its first sentence; everything after
"Tabular figures" is the delivery's material and is not ruled** — with one
exception named where it stands.

**The delivery's target scale is 32 / 24 / 20 / 16 / 14 / 12 px with 16 px body,
and the owner ruled on 2026-09-13 for a smaller step: 15 / 13 / 11.** The
delivery's figure is kept in this sentence rather than overwritten, because the
gap between what was asked for and what was chosen is the thing a later reader
needs. The ramp is rebuilt around the ruling; the upper steps scale with it —
**built on 2026-09-14 as 31 / 23 / 19 / 15 / 13 / 11** (#1158). The upper three
are derived rather than given, and two derivations were required to agree
before they were written down: the −1 px offset that fits all three of the
owner's numbers exactly (a ratio does not — 15/16 of 14 is 13.125), and the
delivery's own +2/+2/+4/+4/+8 increments laid over 11 / 13 / 15. Both give the
same six numbers, which is why the odd-looking 31 and 19 stand rather than a
rounder 30 and 20. Tabular figures for money and the clock. **The spacing and
motion values below come from `DOKUMENTACJA/projekt.md`, not from
`DOKUMENTACJA/02-SYSTEM-WIZUALNY.md`, which has no section for either** — worth
saying because the contents table above calls that file the binding visual
system, and a reader who goes there for a spacing scale will not find one.
Spacing 4 / 8 / 12 / 16 / 24 / 32. Radii as revised by iteration 02: **2–4 px for tools, 8 px for
windows, 12 px on the top edge of the mobile inspector** — the larger radii in
the original specification are explicitly history. Motion 160–200 ms, honouring
`prefers-reduced-motion`. Shadow means "floating above the map"; fixed panels
are separated by borders instead.

**The exception, because it is the one value in that list with a contract behind
it.** *Honouring* `prefers-reduced-motion` binds through decision 1 —
constitution article 10 reads *"Ustawienie ograniczonego ruchu ma
pierwszeństwo"*, the reduced-motion setting takes precedence. The **160–200 ms**
beside it does not: no ruling reaches a duration. The same split applies to the
spacing steps and the radii, which are `DOKUMENTACJA/projekt.md`'s and are
nobody's contract.

**And the six-step ramp is `DOKUMENTACJA/projekt.md`'s too, not
`DOKUMENTACJA/02-SYSTEM-WIZUALNY.md`'s**, which is worth one sentence because
the paragraph above says as much about spacing and motion and leaves the type
scale looking like an exception. `02-SYSTEM-WIZUALNY.md` §"Typografia i ikony"
gives three numbers — *"Docelowo tekst podstawowy 16 px, etykiety 14 px,
metadane 12 px"* — and the full 32 / 24 / 20 / 16 / 14 / 12 appears once in the
delivery, in `DOKUMENTACJA/projekt.md`'s §"Iteracja 01" line beginning
*"Hierarchia docelowa"*.

### Character

**The delivery's material, and not ruled.** The owner's correction quoted at the
end of it is theirs and is recorded rather than adopted as a rule; the nearest
thing with contract force is constitution article 11's *"ograniczone
dekoracje"*, which binds through decision 1 and says far less than this
paragraph does.

"Architectural workshop": flat groups, value columns, zone numbers, a marked
edge on the active element. Explicitly rejected: a separate rounded card per
row, marketing headings, and fake rust or bolts. This is the owner's correction
of iteration 01, which they judged *"zbyt AI-owy"* — too AI-looking — while
keeping its geometry and palette.

### Navigation

**Restates ADR 0112 decision 3**, which the owner ruled against the ADR's own
recommendation and ruled to happen immediately rather than after the stage 0
inventory. The five titles bind. Which English word carries one of them does
not: §"Where this repository stands against it" item 5 records why *Plan dnia*
ships as **Schedule**.

Five sections — **Przegląd / Buduj / Strefy / Zarządzaj / Plan dnia** (Overview
/ Build / Zones / Manage / Day plan) — with matter-of-fact titles.

> **This paragraph used to end "Today's HUD has five too, and they are not the
> same five; §"Where this repository stands" below has the mapping", and that
> clause is kept here rather than deleted** (`docs/AGENT_WORKFLOW.md` §4). It
> stopped being true on 2026-09-14, when the sections moved, and it then
> contradicted this document's own item 5 — *"since 2026-09-14 they are the
> direction's own five"* — for a day, in a file whose two halves nothing reads
> against each other. That is the §4 check that no diff performs: reading a
> file's own headings against each other. Today's HUD **is** the direction's
> five; item 5 carries the move, its cost and the two gaps it left.

### The constitution

Twenty articles, in `DOKUMENTACJA/konstytucja.md`, with a tie-break order for
design disputes: data truth and save safety first, then reachability of the
needed action, then legibility, then naming consistency, and aesthetics last.
**Restates ADR 0112 decision 1, and it is the ruling that gives every article
below its force: the owner accepted the constitution on 2026-09-13, as a product
contract subordinate to `AGENTS.md`.** Six of the twenty (1, 2, 4, 7, 10, 13) restate
constraints this repository already held; the other fourteen are new, and are
now binding rather than proposed.

**Restates the second half of ADR 0112 decision 4. Article 8 is amended, by the
same ruling and in the same breath as the type scale.** It reads *"tekst podstawowy 16 px"*; the owner chose 15 px and chose to
amend the article rather than record an exception to it. **That amendment lives
here and in ADR 0112 and never in the delivery** — `docs/design/README.md`'s
rule is that a delivery is not edited after it lands. Everything else in article
8 stands: contrast measured rather than assumed, visible focus, 200 % text, and
a status that carries a label and an icon as well as a colour. **"Everything
else" is this document's word and not the ruling's, and the gap it hides is the
open question named in §"How to read a sentence in this document"**: the
article's type sentence carries 14 px and 12 px beside the 16, ADR 0112's own
enumeration of the untouched parts names neither, and the shipped ramp is
13 and 11. Nothing here decides it. *(It was decided on 2026-09-16, two
sentences below; this one is kept because it is what this section said while the
question was open.)* **Article 5 — every
sentence the game shows is true — was in the first list when this document was
written, and it does not belong there.** The nearest thing `AGENTS.md` holds is
the fourth reservation, which is about the truth of a *player-visible string*
that somebody is already writing; article 5 is a standing demand on what the
interface may display at all, and it is the most expensive of the fourteen.

**Restates ADR 0112's §*Amendment, 2026-09-16*, which settles the open question
the paragraph above names.** The owner ruled on 2026-09-16 that decision 4's
amendment of article 8 carries **all three** of the article's numbers: article 8
reads **15 / 13 / 11**, not 15 px with 14 px and 12 px left standing. **The
provenance is the weaker kind** — a clickable option labelled *"Poprawka niesie
wszystkie trzy"*, not a sentence the owner typed — and what it agreed is the
scope of the amendment and nothing else. **No ramp value moved**: 15 / 13 / 11
was ruled by decision 4 on 2026-09-13, built on 2026-09-14, and is pinned by
`tests/unit/ui-design-tokens.test.ts`, so the ruling removes a contradiction
between these documents and the code rather than changing either. **"Everything
else" in the paragraph above is now exhaustive rather than hiding a gap**:
contrast, visible focus, 200 % text and the status that carries a label and an
icon as well as a colour are untouched, and the delivery's own copy of article 8
still reads 16 / 14 / 12 and is never edited.

## What is explicitly **not** binding

The delivery is unusually disciplined about this and the list is its own, not a
hedge added here:

- **Sample data.** Prices, roles, prisoner counts, the name *Northfield* and the
  campus layout are demonstration. They are not an economy or content change.
- **The prototype's build loop.** No collision, zone, material or worker-queue
  validation; cost is subtracted locally on confirm. The specification says
  outright not to carry that cost model into the game without checking the
  existing economy.
- **The prototype's persistence.** `localStorage` under `lockstate-design-v1`,
  with no protection against two ordinary tabs overwriting each other — the
  audit records that as a known gap, not as a fix to copy.
- **The map illustration.** One 1536×1024 render, not a production atlas. The
  delivery says not to cut sprites out of it. **Restates ADR 0112 decision 5,
  and the ruling went further than this bullet did:** the illustration stays a
  reference and nothing is cut out of it, *and* the owner asked for new
  production prompts covering tiles and objects in the same style, so the
  catalogue is produced rather than improvised. That half is stage 7's work and
  is tracked in #1163; the CI include-list constraint on it is the owner's to
  release and is unchanged.
- **Camera limits and grid.** ±600 / ±500 px and a decorative grid are prototype
  limits, not the chunked world's.
- **`app.js` and the mock's CSS.** The delivery's own audit says the layered
  overrides are iteration history to be consolidated at integration, and
  `DOKUMENTACJA/05-INSTRUKCJA-DLA-MODELU.md` says not to replace the game
  application with the mock.

## Where this repository stands against it

**Every numbered item below is a reading of the code and binds nothing.** Under
the rung added on 2026-09-15 this is the half of the document that is an
ordinary documentation bug when it goes wrong rather than a conflict of
contracts: where one of these disagrees with `src/`, the code is right and the
sentence rotted. Two of them had rotted when this classification was made, and
both are marked in place below rather than overwritten.

Measured on this checkout at `e5628369`, so that the gap is a fact rather than
an impression. **That anchor is now two days and one whole stage old**, which is
the honest reason to read each item's own dated update before its opening
sentence.

1. **Stage 1 landed on 2026-09-13 (#1157) and this item was false from the day
   it was written. The measurement is kept below rather than overwritten**
   (`docs/AGENT_WORKFLOW.md` §4), because it is what the stage was measured
   against and because *when* it became false is the part worth seeing:

   > **There is one theme and it is the dark one.** `grep -rn
   > prefers-color-scheme src/` returns nothing, and the token file's ramps are
   > an ink/paper dark set (`tokens.css:161-190`). The delivery designs a
   > **light** day theme as the default and a night theme beside it, switchable
   > and remembered. That is the single largest piece of work in the whole
   > direction, and it is a token architecture question before it is a colour
   > question.

   Both halves are wrong today. `grep -rn prefers-color-scheme src/` returns
   seven lines, and the one that decides is `src/ui/theme.ts:64`; the
   stated-as-absent thing is the only shape §4 warns about first. The token file
   carries **both** palettes on one layer, the light one on bare `:root` so a
   page that runs no script renders the day theme, and `:root[data-theme='dark']`
   selects the night one. The anchor rotted with it: `tokens.css:161-190` is an
   `@property` block for spacing, radius and type steps today, and no ramp is
   declared there at all. The three commits are `24798b49` (both palettes on one
   token layer), `f604b711` (the control, following the device until the player
   chooses) and `1274d23e` (one cycling button rather than three). All three are
   dated **2026-09-13** — `f62d8d43`, the commit that first wrote this document,
   is the same day, so this item never described a tree anyone could check it
   against for long.
2. **The type scale was smaller than the target by three steps, and stage 2
   closed the gap on 2026-09-14 (#1158).** The sentence this item used to
   carry is kept below rather than overwritten, because the measurement is
   what the rest of this list is for and a reader needs to see what moved:

   > `src/ui/tokens.css:371-373` sets body and value text to 13 px and labels
   > to 11 px, each multiplied by `--ui-scale`; the delivery asks for
   > 16 / 14 / 12. Raising it is not a token edit — it changes how much fits
   > in every panel at every device tier.

   Today `tokens.css` declares the full ramp — **31 / 23 / 19 / 15 / 13 / 11**,
   the delivery's own scale less the 1 px the owner's three numbers determine —
   and `:root` selects **15 px** for body and value. Labels never moved: 11 px
   was already the ruled size. The upper three steps have no consumer yet and
   the token file says so; `tests/unit/ui-design-tokens.test.ts` pins the
   arithmetic of all six.

   **"Not a token edit" was right, and four surfaces prove it.** These keep
   13 px, each with the assertion that says so beside it in `tokens.css`:

   | Surface | What went red at 15 px |
   |---|---|
   | Build panel | `.hud-build__arm` 56 px against a 44 px tap target (#926); the panel arriving with 6 px more content than box (#920); a queue cancel 2 px below the fold |
   | Alerts list | #739's worst-case sentence wrapping to 5 line boxes against a cap of 4, at 1280×720 |
   | Rooms panel | its own body 15 px shorter than its content at 900×600 (#331) |
   | Events band | #985's 32 px grid row measuring 35 px — **a recording rather than a floor**, and the one keep that rests on not editing a pinned number rather than on a real overflow |

   All four are inside ADR 0112's ruling rather than exceptions to it: the
   label carrying it read *"np."* ("e.g."), and 13 is a step on the ramp the
   owner named. The list of keeps is closed executably, because *adding* one
   breaks no floor and would otherwise erode the ruled scale silently.

   **One recorded measurement did move**, because it is downstream of the type
   scale by construction rather than a property of the thing it names:
   `app-shell.spec.ts`'s `ARRIVAL_PANEL_HEIGHT_PX` at 1280×720 and 375×812,
   by the 1.7 px the status strip's own growth hands the rail. Its docblock
   already required that a change to it arrive with the measurement that
   caused it, and #545 and #634 each moved it that way before.
3. **Closed by the same stage, and kept rather than overwritten for the same
   reason.** It read:

   > **The interactive hue is a single desaturated steel blue**
   > (`--sky-600: #4a7fa5`, `tokens.css:186-188`), where the direction has a
   > teal action colour and a mint brand colour with different jobs.

   `--sky-600` is not declared anywhere in `src/ui/tokens.css` today; it left in
   `24798b49`. The day action colour is `--teal-600: #007477`, the delivery's
   own value including its recorded contrast correction, and `--accent` resolves
   to it in the light theme and to `--teal-300` in the dark one. The anchor is
   the same kind of rot as item 1's: `tokens.css:186-188` is in range and lands
   on the `@property --type-display` declaration, which is exactly the drift
   `tests/foundation/documentation-source-anchor-contract.test.ts` says in its
   own docblock it cannot catch — *"an anchor that drifts onto plausible-looking
   code is worse than one that drifts onto nothing"*.
4. **The status tones carry measured contrast arguments that a re-skin must not
   silently discard.** `src/ui/tokens.css` records three owner rulings of
   2026-09-02 on issue #788 and the exact ratios they were chosen to clear, and
   `tests/unit/ui-design-tokens.test.ts` *computes* those ratios from the file
   rather than pinning literals. A palette swap that ignores them fails that
   test, which is the intended behaviour.
5. **The five HUD sections were `overview`, `build`, `rooms`, `security` and
   `regime`, and since 2026-09-14 they are the direction's own five.** The
   measurement this item carried is kept above rather than overwritten, because
   it is what the move was measured against.

   > The direction's five are Overview, Build, Zones, Manage and Day plan, and
   > moving staff out of Security into Manage is described in the delivery
   > itself as a UI-semantic proposal rather than a move of simulation modules.

   Today `HUD_TAB_IDS` is `['overview', 'build', 'zones', 'manage', 'day-plan']`
   in the delivery's own order, on ADR 0112 decision 3 — which the owner ruled,
   in their own typed words, happens **now** rather than after the inventory.
   The ids moved with the labels because they are read as
   `hud.dataset.activeTab`, as `.ui-tab[data-tab="…"]`, and as `activeTab ===`
   gates; no tab id is persisted anywhere, re-checked on this branch at `d5137d5d` (v0.0.613), so nothing
   about it was a migration.

   Three rulings of 2026-09-14 decided the contents, and
   [`docs/IDENTITY_V5_ROLLOUT.md`](./IDENTITY_V5_ROLLOUT.md)'s stage 5 carries
   them with their provenance: intake moved to Manage, materials and deliveries
   stayed in Build, and Overview got a readout of its own rather than the save
   panel, which stays in the rail and is reachable from every section. Staff
   moved with the tab it was already on and no simulation module moved with it,
   exactly as the delivery said.

   **Two gaps remain and are named there rather than here:** the Regime panel
   still carries the prisoner roster and inspector on Day plan, where the
   delivery puts them under Zarządzaj; and the eleven surfaces the direction
   does not place are still unplaced.

   **The first half of that sentence stopped being literally true on
   2026-09-16 and is kept rather than rewritten, because the *gap* it names is
   intact.** The roster and the inspector are their own panel now —
   `src/ui/hud/roster-panel.ts`, `.ui-panel.hud-roster` — and it is still laid
   out on Day plan, beside the timetable, because that is what the owner ruled
   that day: *"Opcja 4 — rozbij panel w kodzie, obie połowy na Plan dnia"*
   (split the panel in code, both halves on Plan dnia), with the option that
   moved it to Zarządzaj declined. So the code no longer disagrees with itself
   about what a panel is, and it still disagrees with the delivery's table
   about which section inmates belong to — by ruling rather than by omission.
   A UI change must not read this as groundwork for a later move: moving the
   panel is a fresh ruling for the owner.

   **The 63 px that cost, and the arrival scroll it bought at two viewports,
   are in `hud.css`'s `.ui-panel.hud-roster` block** — the measurement any
   further panel added to this rail should be read against, because it is what
   a second panel header costs anywhere in it.

   > **A SIXTH SECTION WAS BUILT ON 2026-09-17 AND RULED ON 2026-09-19, AND
   > THE READING ABOVE IS KEPT RATHER THAN OVERWRITTEN**
   > (`docs/AGENT_WORKFLOW.md` §4, both directions).
   > `HUD_TAB_IDS` is
   > `['overview', 'build', 'zones', 'manage', 'day-plan', 'security']` today:
   > the direction's five, in the direction's order, **plus** a `security`
   > section that paints the four HUD read models that had a route out of the
   > worker and no painter (`hud/security`, `hud/incidents`,
   > `hud/incident-detail`, `hud/contraband`). **This is a reading of the code
   > and binds nothing**, and it takes nothing away from §"Navigation" above,
   > which is a restatement and does bind: the five titles are unchanged, none
   > was renamed, and none was dropped.
   >
   > **THE QUESTION THIS BLOCK USED TO LEAVE OPEN WAS RULED ON 2026-09-19 AND
   > THE SENTENCE THAT LEFT IT OPEN IS KEPT.** It read: *"What is not settled
   > here is whether the direction's navigation may carry a section it does not
   > name — the ruling behind the sixth tab is recorded in
   > `src/ui/hud/hud-state.ts`'s docblock, with its provenance marked as the
   > weaker kind, and nowhere else in this repository."* That was true for two
   > days and is why this branch sat parked. **The owner ruled on 2026-09-19
   > that the sixth section goes in** — Polish option label *"Tak, szósta
   > sekcja wchodzi"*. **The provenance is the weaker kind**: the owner chose a
   > clickable option an integrating session wrote rather than typing a
   > sentence, and PR #1319 is what gives that ruling a durable home in
   > `AGENTS.md`. What it answers is *may there be a sixth section at all*, and
   > nothing more: the sector-id question below it was not asked and is not
   > answered.
   >
   > **The second ruling it depended on has landed.** #1192's icon-only tabs
   > below 720px (ruled 2026-09-16, recorded by #1275) shipped in #1281,
   > merged at `51cf5291`, and they are what make room for a sixth button on a
   > phone. Measured on the assembled page at 375x812 *before* #1281, with six
   > labelled tabs: 384px of button in a 351px bar, the first and last
   > overhanging by 16.5px each, and at 320x640 `overview` and `security` fell
   > outside the viewport and hit-tested to something else. With #1192's rule
   > in the tree that arithmetic is gone: each tab is `min-width: 56px` with
   > its name in the accessibility tree only.
   >
   > **Above the break the sixth button cost one change, and it is a change to
   > the bottom-left corner rather than to the navigation** (2026-09-19). In
   > `rail` placement the tab column is one button taller -- measured on the
   > assembled page at 1280x800, `.hud-tabs__inner` spans `y = 92.69..420.81`
   > where five tabs spanned 92.69..367 -- and the corner is bottom-anchored in
   > the same middle row, so `.hud-zoom__in` at `415..459` was covered by a
   > `.ui-tab` and a press meant for it landed there. `hud.css` now caps the
   > corner at `calc(100% - var(--hud-navigation-block))` inside the one media
   > query where the corner does not step aside for the column, and the corner
   > yields its slack: 402 -> 428.69, clearing the column by 8px. The corner's
   > tallest child is the alerts list, which is already a scroll container; the
   > tab column is not, and a clipped tab is a section nobody can press. **No
   > section name is taken off the screen anywhere #1192's ruling does not
   > already take it**, which was the other candidate and is the owner's to
   > rule on rather than an agent's.
   >
   > **Re-deriving the media query's own 781px threshold for six tabs was the
   > obvious repair, and it is reported rather than shipped.** `837px` -- that
   > block's arithmetic with the new column -- turns the zoom control green and
   > then fails `app-shell.spec.ts`'s #331 Rooms-panel drag at 1280x800,
   > exactly as `hud.css`'s own comment predicts in writing. Measured on
   > 2026-09-19 against current `main`, not carried from the earlier attempt.

   **The Polish name wrapped anyway, and the fix is a layout one** (#1192,
   2026-09-14). `Plan dnia` has a space in it too, so at 375x812 it laid out in
   **two line boxes** -- 26.38px against every other label's 13.19 -- in the
   locale neither wrap spec could see: `ui-shell.spec.ts` drives the default
   catalogue, where *Schedule* is one word. Both obvious remedies were measured
   failing. `white-space: nowrap` alone trades the wrap for a **2.50px overlap**
   between `Zarządzaj` and `Plan dnia`, because the five buttons are already
   flex-shrunk below their own `min-width`; padding cannot pay for it either,
   with 323.70px of unwrapped label in a 351px inner bar.

   What shipped is `nowrap` **plus** `--label-tracking-tight` (0.06em) on the
   tab labels below 721px: the five Polish names then sum to 291.14px and the
   tightest adjacent pair sits 5.11px apart, which is the gap
   `Strefy/Zarządzaj` already had (5.14px). It buys back the 13.19px of rail
   the wrap was charging and takes the bar from 82.38px to 69.19px; at the
   150 % interface scale it takes the bar from three rows to two and gives the
   rail 81.80px.

   **Why tracking rather than the two alternatives #1192 named.** A smaller
   *step* is not available: the ramp bottoms out at `--type-label` and the tab
   label is already on it, so a smaller label would be a step below the
   15 / 13 / 11 the owner ruled (ADR 0112). A **scrolling bar** was measured --
   380px of content in a 351px box, so two of five sections start off-screen
   with no affordance, on the one navigation surface a phone has -- and ADR
   0022 already refused overflow in the rail. Tracking is in neither ruling,
   and the delivery makes the same move at the same breakpoint: its own phone
   CSS sets `letter-spacing: 0` on the status labels inside
   `@media(max-width:720px)`. This goes half that far, because uppercase text
   needs tracking to stay legible.

   **The limit, stated because a media query is a claim about a range.** At a
   320px viewport the labels overlap by 4.08px even tracked this tight, and no
   tracking value fixes it (0 tracking is still 266.72px of label in a 296px
   bar once padding is paid). 375x812 is this repository's narrowest measured
   viewport, in 24 specs; a 320px gate would need the scrolling bar priced
   rather than a smaller number here. Both halves are gated in `pl-PL`, in
   `tests/browser/locale-delivery.spec.ts`: the wrap gate goes red without the
   `nowrap`, the overlap gate goes red without the tighter tracking, and on
   today's `main` -- neither declaration -- the wrap gate reports the 26.4px
   label.

   > **RULED BY THE OWNER ON 2026-09-16: BELOW THE BREAKPOINT THE TABS SHOW
   > THEIR ICONS AND NOT THEIR NAMES.** **This is a restatement of a ruling and
   > binds**, under the first of the three kinds in §"How to read a sentence in
   > this document"; the paragraphs above it, from *"The Polish name wrapped
   > anyway"* to *"The limit"*, are a *reading of the code* and are kept exactly
   > as they stand, because they are what the ruling was made against. The issue is
   > [#1192](https://github.com/woogitsu/lockstate/issues/1192), and this block is
   > the durable record: the dossier that priced the five options is held by an
   > unmerged branch ([#1242](https://github.com/woogitsu/lockstate/pull/1242)),
   > and a GitHub comment is not a record.
   >
   > > **THE HALF OF THAT SENTENCE ABOUT #1242 WENT FALSE ON 2026-09-17 AND IS
   > > KEPT RATHER THAN REWRITTEN.** #1242 merged as `bdf2fcfc`, so the dossier
   > > is on `main` at
   > > `docs/research/2026-09-15-three-decisions-that-have-been-waiting-on-the-owner.md`,
   > > and its post-ruling table records this one as the single dossier
   > > recommendation the owner **declined** — *"no — option 3, which this
   > > dossier declined"*. **The conclusion is untouched and now rests on the
   > > other half**: a research record is read-only history by
   > > `docs/research/README.md`'s own rule, so a live identity document does
   > > not read its rulings out of one. This block is still the durable record.
   >
   > **The provenance is the weaker of the two kinds this repository
   > distinguishes**, the kind `CLAUDE.md` flags for the 2026-09-08, -09 and -10
   > releases inside reservation 3 and the kind ADR 0091's Status block records
   > of itself. The owner did not type a sentence; they chose a clickable option
   > whose label an agent session had written:
   >
   > > Opcja 3 — zakładki tylko z ikonami poniżej progu
   >
   > ("Option 3 — icon-only tabs below the threshold.") **The option's own label
   > is the whole of what was agreed**: which of the five options is right, and
   > that it applies below the breakpoint. No `min-width` value, no accessible
   > name and no icon is agreed with it — and an icon-only control still needs
   > the section's name to reach a screen reader, which is article 7's business
   > and not this ruling's.
   >
   > **What it costs, which is the reason this is a ruling and not a patch: the
   > section name leaves the screen** below the break. That is tie-break rung 4,
   > *"Spójność nazewnictwa i zachowania"*, and it undoes on the phone the one
   > thing the 2026-09-14 navigation move worked hardest to settle — what each
   > section is called. **The ruling was made with that in front of it.**
   >
   > **What it does NOT cost, and this is where the ruling overturns a priced
   > objection rather than accepting one.** The option had been priced as also
   > costing five authored and drawn icons — *"none exists"* — and that is false,
   > which the owner was shown before choosing. Opened on this branch:
   > `createIcon(options.icon, 'lg'),` `readonly icon: IconId;` (both verbatim in `src/ui/primitives/tab-button.ts`)
   >
   > — so every tab already draws an icon above its label and the id is required
   > rather than optional.
   > All five sections already name one, in `HUD_TABS` at `src/ui/hud/hud.ts`:
   > `overview`, `build`, `rooms` (for the Zones tab), `security` (for Manage)
   > and `regime` (for Day plan) — and all five are drawn as path lists in
   > `src/ui/primitives/icon.ts`. **The authoring cost is zero.**
   >
   > **A DECLINED OPTION THAT HAD BEEN THE RECOMMENDATION, RECORDED BECAUSE A
   > RULING MADE OVER A STATED OBJECTION IS A STRONGER RECORD THAN ONE THAT
   > READS AS UNANIMOUS.** A horizontally scrolling tab bar was the
   > recommendation put to the owner, and they declined it. **It had been
   > recommended on the strength of the false pricing above** — the argument was
   > that it is the only candidate costing *"neither rail height nor a name"*,
   > which is an argument against an icon-only bar that was carrying five
   > imaginary icons on its back. The objection to icon-only that survives the
   > correction is the one stated two paragraphs up — the name leaves the screen
   > — and it is a product position rather than a work estimate. The owner
   > overruled it. **A second thing nobody has measured, and it belongs to the
   > option that was chosen**: whether these five glyphs read as their sections
   > *without* the name is a playtest and not a ruler, and it is unrun.
   >
   > **The paragraph above this block argues against the scrolling bar on a
   > figure that is no longer the tree's** — *"380px of content in a 351px box"*
   > was measured on the untracked bar, before `--label-tracking-tight` shipped.
   > It is kept rather than corrected here because it is a dated reading, and
   > because the ruling did not turn on it: the scrolling bar was declined on the
   > owner's word, not on that number.
   >
   > **Nothing under `src/ui/` implements this**, and the ruling does not by
   > itself change that.

   **What the move cost, measured, in two places:** the Manage tab is the first
   in this rail's life to lay out two panels at once, and at 900x600 the Intake
   panel came out 42px shorter than its own content beside the Staff panel —
   `hud.css` carries the remedy and the one that was tried first and did not
   work. And the English name for *Plan dnia* is **Schedule** rather than the
   obvious *Day plan*, because at 375x812 a label with a space in it wraps: two
   line boxes instead of one, a tab bar of 82.4px instead of 69.2px, and the
   13.2px came off the rail and put a delivery row's Cancel outside the Build
   panel's visible box. The direction's five titles bind; which English word
   carries one of them is ours, and this one was chosen with a ruler.
6. **The layout system landed on 2026-09-14 (#1159), and the measurement this
   item used to carry is kept below rather than overwritten** — it is what the
   stage was measured against, and a reader needs to see what moved.

   > **Collapse exists; the rest of the layout system does not.** Two panels,
   > `alerts` and `minimap`, collapse through `collapsedPanels` in the HUD shell
   > state (`src/ui/hud/hud-state.ts:43`, `:82`), and that state is in-memory —
   > nothing writes it anywhere. There is no drag-resizable separator in `src/ui/`
   > (the only `aria-valuenow` is `src/ui/primitives/segmented-bar.ts:199`, a
   > progress bar), no layout menu, no reset, and no "map only" mode. The
   > direction makes all of those core, with layout preferences under their own
   > storage key — article 13's hard rule. The mechanism for that key already
   > exists and should be reused rather than rebuilt: `src/input/storage.ts` is a
   > `localStorage` wrapper written around the browsers that throw on access, and
   > `src/main.ts:431` already passes a key-value store into `WorldScene` for
   > exactly this class of preference (`:259` is the docblock that explains why).

   Today three regions fold — the five sections, the right rail and the status
   strip's readouts — two of them drag-resize, and the Layout menu carries a
   slider per resizable region, a reset, a "map only" toggle and a clock. The
   mechanism was reused exactly as that paragraph asks: `src/input/storage.ts`
   gained `loadLayoutSettings` / `saveLayoutSettings` over a key of its own,
   `lockstate.settings.layout`, and the composition root reads it before the
   HUD mounts and writes it on every settled change.

   **Three things a later reader will want and would otherwise have to
   re-derive.** The limits are the delivery's own and live in
   `src/ui/hud/hud-layout.ts` with the passage they came from quoted beside
   them; the one number that is **not** the delivery's is
   `MAP_WIDTH_RESERVE_PX`, which it leaves unspecified. A **stored** size is a
   design pixel and a **resolved** one is a painted pixel, so a width chosen at
   100 % means the same panel at 150 % — the first attempt held every limit
   unscaled and produced a 264 px rail around controls at twice their size. And
   the navigation is a left column only where it fits: `navigationPlacement` is
   a fit test rather than a breakpoint, because `--ui-scale` decides it and no
   media query can ask about `--ui-scale`.

   **What did not land, stated so it is not mistaken for done.** A phone cannot
   fold the sections on their own — the Layout menu's "map only" is that tier's
   route, and `app-shell.spec.ts`'s `NEVER_LAID_OUT_BELOW_720` carries the
   arrow beside the minimap and the zoom pair. And the 200 %-page-zoom debt
   this stage inherited is **unchanged**: 23 of 36 viewport × interface-scale
   combinations fail, the same 23 as before the stage, and commit `d7aab8d8`
   carries both sweeps and what clearing it would take.

   > **THE "23 OF 36" ABOVE IS KEPT AND IS NOT COMPARABLE TO ANY FIGURE
   > MEASURED SINCE (#1202).** It is left in place because it is what stage 3
   > was measured against and because the instrument that produced it —
   > `d7aab8d8`'s own message calls it *"a throwaway spec and is not
   > committed"* — no longer exists, so nobody can re-derive it. What replaced
   > it is `tests/browser/playtest-1164-the-200-percent-sweep.playtest.ts`,
   > written for stage 8 and committed, and it is a **stricter** instrument:
   > run on `d7aab8d8` itself it reports **32 of 36**, nine combinations more
   > than the 23 recorded here from the same commit. So a later "29" does not
   > mean six new failures, and the two numbers must not be subtracted from
   > each other.
   >
   > **Held to the one instrument that still exists, the debt went 32 → 29.**
   > Three combinations fixed between `d7aab8d8` and `2559eb14` (v0.0.628) —
   > `1280x720@100%`, `1024x768@100%`, `900x600@75%` — and none added. Both
   > figures re-measured for #1202 rather than quoted, in two worktrees on two
   > ports, with
   > `node_modules/.bin/playwright test --config tests/browser/playwright.playtest.config.ts tests/browser/playtest-1164-the-200-percent-sweep.playtest.ts`:
   > `32 of 36` on a detached worktree at `d7aab8d8` with the playtest copied
   > in, `29 of 36` on `2559eb14`. Neither tree had the Git LFS bytes, so the
   > actor atlases failed to decode in both — the sweep measures DOM geometry
   > in `.hud-*` and not the canvas, and the two runs shared the condition.
   >
   > **What did not change is that the row still fails.** 29 of 36 is not a
   > cleared debt, the delivery's *"Brak utraty treści i działań"* is unmet,
   > and constitution article 8's third element is unmet with it. `d7aab8d8`
   > still carries the price of clearing it.
   >
   > **AND THE "29 OF 36" IN THIS MARK IS A READING OF `2559eb14`, NOT OF
   > `main` (#1202).** It is right about the tree it names: run there a third
   > time it returns `29 of 36` with the same failing set. What it cannot say,
   > and does not, is anything about a later tree — and the same committed
   > sweep, same config, on `ab3bf7ba` (v0.0.693) returns **31 of 36**.
   >
   > **The three combinations this mark records as cleared are the three that
   > came back.** `1280x720@100%`, `1024x768@100%` and `900x600@75%` fail on
   > `ab3bf7ba`, each on `.hud__aside` overflow alone and nothing else — 34 px,
   > 32 px and 18 px of spill — which is the failure mode they had before they
   > were fixed. One went the other way: `390x844@75%` fails on `2559eb14`,
   > where two `.ui-tab` centres belong to the canvas, and passes on
   > `ab3bf7ba`. So *"32 → 29, three fixed, none added"* is a true sentence
   > about a window that has since closed, and a later tree owes its own
   > measurement rather than a subtraction from this one.
   >
   > **How this gap arose is the mark above's own shape, one turn on.** The 23
   > stopped being re-derivable because its instrument was deleted. The 29
   > stopped describing the head because the instrument that replaced it is a
   > `*.playtest.ts`, which no gate collects — deliberately, and
   > `tests/browser/browser-suites.ts` gives the reason. A figure that moves
   > only when a person runs it by hand does not announce that it has stopped
   > being true, and three combinations regressed inside that silence.
   >
   > **The Git LFS condition recorded just above held for these runs too**, and
   > identically on both trees: no LFS bytes, actor atlases undecodable. The
   > three regressed combinations fail on DOM overflow in `.hud__aside`, which
   > is not the canvas.
   >
   > **What still does not change is that the row fails.** On every tree
   > measured so far the delivery's *"Brak utraty treści i działań"* is unmet,
   > and constitution article 8's third element is unmet with it.
   >
   > **AND THE "31 OF 36" IN THIS MARK IS A READING OF `ab3bf7ba`, WHICH THE
   > HEAD HAS SINCE LEFT BEHIND (#1318).** It is right about the tree it names
   > and is not edited. Same committed sweep, same config, re-run on
   > `a1c7f97d` (v0.0.696, the merge of #1311 — one commit past #1318's
   > `1da79d2e`): **16 of 36**. The failing set is `1280x720@200%`,
   > `1024x768@175%`, `1024x768@200%`, `900x600@150%`, `900x600@175%`,
   > `900x600@200%`, `390x844@100%`, `390x844@150%`, `390x844@175%`,
   > `390x844@200%`, and every one of the six `375x812` scales.
   >
   > **The three combinations this mark records as having come back have gone
   > again, and that is the sentence above that stops being true of the head.**
   > `1280x720@100%`, `1024x768@100%` and `900x600@75%` pass on `a1c7f97d`.
   > They failed on `ab3bf7ba` on `.hud__aside` overflow alone, and #1312's
   > repair — merged as #1318 — put a content floor under that slot;
   > `tests/browser/ui-rail-aside-content-floor.spec.ts` is the gate that now
   > holds those same three rows. No `.hud__aside` overflow appears anywhere in
   > the 16 failing reports. `390x844@75%` still passes, as it did on
   > `ab3bf7ba`.
   >
   > **Read as a delta rather than as a tally, and only against the tree pair
   > it is a delta of:** fifteen of `ab3bf7ba`'s 31 cleared between `ab3bf7ba`
   > and `a1c7f97d`, and none was added. What the 16 is *not* is a figure
   > comparable to the 23 or to anything measured with the instrument
   > `d7aab8d8` deleted; that bar stands exactly as this mark already sets it.
   >
   > **How this gap arose is a narrower thing than the silence recorded above,
   > and worth separating from it.** Nothing here went unmeasured for a window:
   > #1318's own branch measured 16 and said so, and deliberately left these
   > two documents alone because #1311 was open and appending to these very
   > paragraphs. The two merged minutes apart, #1311 second, and #1311's
   > reading is bound to `ab3bf7ba` and stays true of it. So this is not a
   > rotted claim — it is a **live claim that the head overtook between one
   > merge and the next**, and it is appended for the same reason the marks
   > above are.
   >
   > **One sentence elsewhere states this figure in the present tense without
   > binding it to a commit**, and it is named here rather than edited, because
   > it belongs to #1318's just-merged ground:
   > `tests/browser/ui-rail-aside-content-floor.spec.ts`'s docblock reads
   > *"16 of 36 still fail after this repair"*. The run recorded here agrees
   > with its number on `a1c7f97d`; what it lacks is the commit that makes it
   > checkable later.
   >
   > **The Git LFS condition recorded twice above held for this run as well.**
   > The tree had no LFS bytes — `file public/assets/actors/actor.guard.base.idle.png`
   > answers `ASCII text` — so the actor atlases did not decode and the console
   > carried `Failed to process file: image` for all ten. The sweep measures
   > `.hud-*` DOM geometry and not the canvas, and the four things it reports
   > on in the 16 failures are `.brand`, `.hud-tabs__inner`, `.save-panel`,
   > `.ui-tab` and `.display-scale__cycle` centres, and `.hud-strip`'s own
   > overflow — none of them the canvas. **The absolute 16 is nevertheless
   > conditional on that** and wants a tree holding the art before it is
   > certified; the *delta* against `ab3bf7ba` is the sounder half, because
   > that reading was taken under the same condition.
   >
   > **AND THE "16 OF 36" IN THIS MARK HAS BEEN OVERTAKEN IN TURN, BY THE
   > SWEEP'S FIRST FOLLOW-UP.** It is right about `a1c7f97d` and is not
   > edited. Same committed sweep, same config, re-run on `7b0f6f69` (the
   > branch of #1312's remaining-sweep follow-up, on `faf7ce3a`): **13 of 36**.
   > The three that left are `390x844@100%`, `375x812@75%` and
   > `375x812@100%`; the failing set is otherwise the same set of labels, so
   > this is again a **strict subset** — three cleared, none added.
   >
   > **What did not move is the row's verdict, and that clause is now the
   > oldest true sentence in this chain.** FAIL is what a failing set of 13
   > says as plainly as one of 16, of 31 or of 29. *"Brak utraty treści i
   > działań"* is unmet at 13 and constitution article 8's third element is
   > unmet with it.
   >
   > **What the remaining 13 fail on is one thing rather than five**, and it is
   > worth recording because it is the shape of the decision that is left: at
   > a viewport halved in both axes the status strip, the tab bar and the rail
   > cannot all have the height they ask for, and which of them gives way is
   > not a question `src/ui/hud/hud.css` can answer by tuning a number. Every
   > one of the 13 sits at an interface scale of 125 % or more, or at a window
   > of 900x600 or narrower, or both.
   >
   > **The gap this whole chain is a record of is closed on the way in from
   > here, and not by a person remembering to look.**
   > `tests/browser/ui-200-percent-zoom-sweep-ratchet.spec.ts` is collected by
   > the `browser` gate and asserts that the failing set may shrink and may not
   > grow. It is a subset assertion rather than an equality, so a repair needs
   > no edit to it; what it forbids is a fourteenth combination arriving
   > unannounced, which is exactly how the three this chain opens on came back.
   > It does **not** re-derive these documents' figure, so the marks above stay
   > the way this figure is checked.
   >
   > **The Git LFS condition recorded three times above held for this run as
   > well**, and the absolute 13 is conditional on it in exactly the way the
   > absolute 16 is.
7. **The integration points the delivery names are all real.** Every path
   listed under *"Rozpoznane wcześniej punkty integracji"* in
   `DOKUMENTACJA/05-INSTRUKCJA-DLA-MODELU.md` exists at `e5628369` — checked
   one by one, eighteen of them. That is worth stating because the delivery
   asks the reader to verify it and because it is the part of an outside brief
   that most often rots. **Not re-checked in the 2026-09-15 classification
   pass**, so "eighteen" is a tally carried from `e5628369` and is the shape §4
   warns about; the paths it counts are in
   `docs/design/2026-09-13-identity-v5/DOKUMENTACJA/05-INSTRUKCJA-DLA-MODELU.md`
   under *"Rozpoznane wcześniej punkty integracji"* for whoever re-counts it.

## The rule this document exists to make unmissable

**Binds twice over, and neither route is this document's own authority.** The
demand is constitution article 5, which binds through ADR 0112 decision 1, and
`AGENTS.md`'s fourth reservation, which binds because `AGENTS.md` is rung 1. If
this section and either of those ever disagree, they win and this paragraph is
the defect.

**A visual direction cannot change what the game may say.** Every constitution
article that promises the player something — "Zapisano", "wolne miejsce", "brak
incydentów", a repair button that repairs — is a claim this repository has to be
able to prove in code before the sentence ships. `AGENTS.md`'s fourth
reservation governs that, the wording is ours and the truth is not, and every
authored string goes into the commit message and the pull request body verbatim
beside the code that proves it true.
