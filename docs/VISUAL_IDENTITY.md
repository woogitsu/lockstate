# Visual identity and product voice

This document is the repository's reading of the design direction the owner
delivered on 2026-09-13. The delivery itself is vendored verbatim under
[`docs/design/2026-09-13-identity-v5/`](./design/2026-09-13-identity-v5/) and is
never edited; this file says what it binds *here*, what it does not, and where
this repository's code disagrees with it today.

[ADR 0112](./adr/0112-what-the-2026-09-13-identity-delivery-decides.md) is the
decision record — what is settled, what is still open, and what an agent may not
decide alone. [`docs/IDENTITY_V5_ROLLOUT.md`](./IDENTITY_V5_ROLLOUT.md) is the
staged plan for getting from today's UI to this one.

## The three-line summary, before any detail

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

## What is binding

### Product promise and voice

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

Target scale 32 / 24 / 20 / 16 / 14 / 12 px, with 16 px body, 14 px labels and
12 px metadata. Tabular figures for money and the clock. **The spacing and
motion values below come from `DOKUMENTACJA/projekt.md`, not from
`DOKUMENTACJA/02-SYSTEM-WIZUALNY.md`, which has no section for either** — worth
saying because the contents table above calls that file the binding visual
system, and a reader who goes there for a spacing scale will not find one.
Spacing 4 / 8 / 12 / 16 / 24 / 32. Radii as revised by iteration 02: **2–4 px for tools, 8 px for
windows, 12 px on the top edge of the mobile inspector** — the larger radii in
the original specification are explicitly history. Motion 160–200 ms, honouring
`prefers-reduced-motion`. Shadow means "floating above the map"; fixed panels
are separated by borders instead.

### Character

"Architectural workshop": flat groups, value columns, zone numbers, a marked
edge on the active element. Explicitly rejected: a separate rounded card per
row, marketing headings, and fake rust or bolts. This is the owner's correction
of iteration 01, which they judged *"zbyt AI-owy"* — too AI-looking — while
keeping its geometry and palette.

### Navigation

Five sections — **Przegląd / Buduj / Strefy / Zarządzaj / Plan dnia** (Overview
/ Build / Zones / Manage / Day plan) — with matter-of-fact titles. Today's HUD
has five too, and they are not the same five; §"Where this repository stands"
below has the mapping.

### The constitution

Twenty articles, in `DOKUMENTACJA/konstytucja.md`, with a tie-break order for
design disputes: data truth and save safety first, then reachability of the
needed action, then legibility, then naming consistency, and aesthetics last.
Six of the twenty (1, 2, 4, 7, 10, 13) restate constraints this repository
already holds in `AGENTS.md` or an accepted ADR; the other fourteen are new
product rules and are what ADR 0112 puts to the owner. **Article 5 — every
sentence the game shows is true — was in the first list when this document was
written, and it does not belong there.** The nearest thing `AGENTS.md` holds is
the fourth reservation, which is about the truth of a *player-visible string*
that somebody is already writing; article 5 is a standing demand on what the
interface may display at all, and it is the most expensive of the fourteen.

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
  delivery says not to cut sprites out of it.
- **Camera limits and grid.** ±600 / ±500 px and a decorative grid are prototype
  limits, not the chunked world's.
- **`app.js` and the mock's CSS.** The delivery's own audit says the layered
  overrides are iteration history to be consolidated at integration, and
  `DOKUMENTACJA/05-INSTRUKCJA-DLA-MODELU.md` says not to replace the game
  application with the mock.

## Where this repository stands against it

Measured on this checkout at `e5628369`, so that the gap is a fact rather than
an impression.

1. **There is one theme and it is the dark one.** `grep -rn prefers-color-scheme
   src/` returns nothing, and the token file's ramps are an ink/paper dark set
   (`src/ui/tokens.css:161-190`). The delivery designs a **light** day theme as
   the default and a night theme beside it, switchable and remembered. That is
   the single largest piece of work in the whole direction, and it is a token
   architecture question before it is a colour question.
2. **The type scale is smaller than the target by three steps.**
   `src/ui/tokens.css:371-373` sets body and value text to 13 px and labels to
   11 px, each multiplied by `--ui-scale`; the delivery asks for 16 / 14 / 12.
   Raising it is not a token edit — it changes how much fits in every panel at
   every device tier.
3. **The interactive hue is a single desaturated steel blue**
   (`--sky-600: #4a7fa5`, `src/ui/tokens.css:186-188`), where the direction has
   a teal action colour and a mint brand colour with different jobs.
4. **The status tones carry measured contrast arguments that a re-skin must not
   silently discard.** `src/ui/tokens.css` records three owner rulings of
   2026-09-02 on issue #788 and the exact ratios they were chosen to clear, and
   `tests/unit/ui-design-tokens.test.ts` *computes* those ratios from the file
   rather than pinning literals. A palette swap that ignores them fails that
   test, which is the intended behaviour.
5. **The five HUD sections are `overview`, `build`, `rooms`, `security` and
   `regime`.** The direction's five are Overview, Build, Zones, Manage and Day
   plan, and moving staff out of Security into Manage is described in the
   delivery itself as a UI-semantic proposal rather than a move of simulation
   modules.
6. **Collapse exists; the rest of the layout system does not.** Two panels,
   `alerts` and `minimap`, collapse through `collapsedPanels` in the HUD shell
   state (`src/ui/hud/hud-state.ts:43`, `:82`), and that state is in-memory —
   nothing writes it anywhere. There is no drag-resizable separator in `src/ui/`
   (the only `aria-valuenow` is `src/ui/primitives/segmented-bar.ts:199`, a
   progress bar), no layout menu, no reset, and no "map only" mode. The
   direction makes all of those core, with layout preferences under their own
   storage key — article 13's hard rule. The mechanism for that key already
   exists and should be reused rather than rebuilt: `src/input/storage.ts` is a
   `localStorage` wrapper written around the browsers that throw on access, and
   `src/main.ts:431` already passes a key-value store into `WorldScene` for
   exactly this class of preference (`:259` is the docblock that explains why).
7. **The integration points the delivery names are all real.** Every path
   listed under *"Rozpoznane wcześniej punkty integracji"* in
   `DOKUMENTACJA/05-INSTRUKCJA-DLA-MODELU.md` exists at `e5628369` — checked
   one by one, eighteen of them. That is worth stating because the delivery
   asks the reader to verify it and because it is the part of an outside brief
   that most often rots.

## The rule this document exists to make unmissable

**A visual direction cannot change what the game may say.** Every constitution
article that promises the player something — "Zapisano", "wolne miejsce", "brak
incydentów", a repair button that repairs — is a claim this repository has to be
able to prove in code before the sentence ships. `AGENTS.md`'s fourth
reservation governs that, the wording is ours and the truth is not, and every
authored string goes into the commit message and the pull request body verbatim
beside the code that proves it true.
