# What stays readable when the whole game runs in `en-XA`

**Date:** 2026-08-30
**Question:** [#664](https://github.com/matmaxalez/lockstate/issues/664) second
half — run ADR 0011's pseudo-locale against the *assembled application* and
inventory every string that never became a key.
**Commit swept:** `898a16a` (`v0.0.252`), branch `agent/664-pseudo-locale-sweep`.
**Harness:** `tests/browser/pseudo-locale-sweep.spec.ts`, added by this pass.
**Feeds:** nothing yet. Every route out of §4 needs either a player-facing
string or a decision about whether a brand name is localisable, and `AGENTS.md`
reserves both to the owner. **This record reports and stops.**

---

## 0. The answer in one paragraph

Across **31 states** of the real page — first paint, the telemetry consent
prompt, a refusal, all five tabs both folded and with every disclosure open, a
created prison, an explicit save, a running clock, a hired guard, a build queue
with three orders, a pending material delivery, a pending zoned room and a
failed create — the sweep found **six distinct sites** where readable English
survives, in **nine** raw string forms. **Zero** keys rendered as their own
name. Two of the six are defects, one is a decision the owner has to make about
a brand name, and three are deliberate. The single sharpest finding is that
**seven call sites in `src/ui/save-panel.ts` splice a raw `Error.message` into a
localised template**, so a Polish player is shown
`Simulation worker fault (already-initialized): Kernel is already initialized.`
— in English, *when the catalogue already carries a translated sentence for that
exact fault code*.

---

## 1. Was anything already running the pseudo-locale? Partly — one panel

The brief said "nothing in the tree appears to run it". That is close, and the
correction matters because it changes what is new here.

**Three consumers exist (VERIFIED, each file opened):**

- `tests/unit/services-localization.test.ts:349-380` exercises
  `buildPseudoLocaleCatalog` and `pseudoLocalizeText` directly — the transform,
  not any UI.
- `tests/unit/simulation-message-keys.test.ts:608-620` formats every derived
  simulation message key through a pseudo-locale `Localizer` and asserts one of
  them contains `Ř`. Keys, not a rendered page.
- `tests/browser/ui-harness.ts:259-261` builds a `pseudoLocalizer`, and
  `ui-harness.ts:898-900` hands it to **`mountSavePanel` only**, behind an
  `options?.pseudoLocale === true` flag. `tests/browser/ui-shell.spec.ts:313` is
  its one consumer.

So the locale ran against **one panel in a harness**, which is exactly what
`docs/research/audit-2026-08-26/06-frontend-ux-a11y.md` recorded as **UXA-19**,
whose heading is *"The pseudo-locale gate covers one surface"* and whose body
says *"ADR 0011 makes the pseudo-locale the designated detector of hard-coded
strings; it is currently pointed at 1 of 8 player-facing surfaces."* Nothing had
ever driven `index.html` + `src/main.ts` under it. That is what this pass adds,
and UXA-19's suggested fix — *"add `pseudoLocale` to `mountHudShell`"* — is
**not** what was done, because the harness is not the application.
`tests/browser/app-shell.spec.ts:2281-2282` says so about itself: *"the harness in
`ui-shell.spec.ts` cannot see this defect, because nothing there occupies the
rail's aside slot"*. A sweep run there would have missed the save panel's
position, its status line, the brand badge and the consent prompt alike.

`docs/LOCALIZATION.md:74-81` and `docs/adr/0011-localization-architecture.md:73`
both describe the locale as a tool for finding hard-coded strings. Until today
that description was aspirational for every surface but one.

---

## 2. What `pseudo.ts` actually does

Read at `src/services/localization/pseudo.ts` rather than assumed. Three
transforms, and the third is the one the detector below turns on:

1. **Accents every ASCII letter.** `ACCENTS` (`pseudo.ts:14-19`) maps all 52
   ASCII letters, upper and lower — `a → á`, `Z → Ž`. Nothing is left alone.
2. **Pads by 35 %.** `DEFAULT_PSEUDO_EXPANSION = 0.35` (`pseudo.ts:26`), padded
   with `·` (`PADDING_CHARACTER`, `pseudo.ts:24`) — the layout-growth signal.
3. **Brackets the result** with `⟦` and `⟧` (`pseudo.ts:22-23`), whose own
   comment says why: *"Bracketing makes truncation visible: a clipped string
   loses its closing marker."*

And the property everything below depends on: **`{placeholder}` spans are copied
through untouched** (`pseudoLocalizeText`, `pseudo.ts:40-54`, assembled at `:53`), because
*"an accented placeholder name would simply fail to interpolate and prove
nothing"*.

`buildPseudoLocaleCatalog` (`pseudo.ts:70-79`) derives the whole catalogue
mechanically from the English one, so it cannot drift.

A rendered example from the run, the brand badge:

```
⟦ĻóçķŠţáţé.íó·····⟧
⟦ṽ0.0.252 · 898a16a········⟧
```

The second line is `brand.build` = `v{version} · {commit}`
(`src/content/default-locale-en.ts:1092`): the `v` is accented because it is
template text, and `0.0.252` and `898a16a` are not, because they arrived as
parameters.

---

## 3. How the sweep was run, and the detector mistake worth recording

### 3.1 Getting the real page into `en-XA` without giving a player a route to it

`src/main.ts:1076` is the page's only `Localizer`:

```ts
const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
```

There is no runtime locale switch anywhere in `src/` — that absence is UXA-07 in
the same audit. Adding one to reach a *test* locale would put a route to `en-XA`
in front of players, and `src/services/localization/locale.ts:10` says the
locale is *"never offered to players"*. So the spec rewrites the module Vite
serves, in the browser context only, via `page.route('**/src/main.ts')`:
`locale` becomes `PSEUDO_LOCALE` and `catalogs` gains
`buildPseudoLocaleCatalog(defaultMessageCatalogEn)`. **No production file was
modified.**

Two further substitutions turn the telemetry ingest `define` guards into
literals, because `tests/browser/vite.config.ts` deliberately passes no telemetry
`define` (`tooling/telemetry-config.mjs` says so in its own docblock) and
`src/main.ts:2865` therefore never mounts the consent prompt. #664 names that
prompt explicitly, so the sweep gives telemetry a destination in order to see it.

All four substitutions are asserted before the response is fulfilled, and every
test asserts `.save-panel__heading` contains `⟦` before drawing any conclusion.
An instrumentation that silently stopped matching would otherwise report a clean
page because nothing was transformed.

Every panel is covered by that one swap: `BrandLocalizer`, `HudLocalizer`,
`SavePanelLocalizer`, `DisplayScaleLocalizer` and `TelemetryConsentLocalizer`
are all structural ports fed from that single instance, and `grep -rn "new
Localizer" src/` returns exactly two hits — `main.ts:1076` and
`localizer.ts:108` (`withLocale`, which has no caller in `src/`).

### 3.2 The detector, and the rule that was wrong first

The obvious detector deletes every `⟦ … ⟧` span and looks at the residue. **That
is what the first version of this sweep did, and it scored the single most
important finding on this page as zero.** The save panel's

```
⟦Çóúļđ ñóţ çřéáţé á ƥříšóñ: Simulation worker fault (already-initialized): Kernel is already initialized.·············⟧
```

is *one* bracketed span, so deleting the span deleted the English inside it. The
first run reported **3** findings; the corrected run reports **9**.

The rule that holds is simpler and strictly stronger. Because `ACCENTS` maps
every ASCII letter, **no character of any catalogue-derived string is an ASCII
letter**. So every run of two or more consecutive ASCII letters anywhere on the
page is exactly one of three things:

- a **hard-coded string** (never went through the catalogue), or
- an **unresolved key** (`Localizer.format` returns the key itself,
  `localizer.ts:68-73`), or
- an **interpolated parameter** (the class the naive rule cannot see).

Two letters rather than one, because `formatNumber` and `Intl` output reaches
the DOM unbracketed by design and a lone ASCII letter is far more often part of
a number or an id than a word.

The sweep collects text nodes, six attributes (`title`, `aria-label`,
`aria-placeholder`, `aria-valuetext`, `alt`, `placeholder`), `document.title`
and `<html lang>`.

### 3.3 Proving the sweep can fail

Both mutations were run against the real page and both outputs kept.

**Mutation 1 — a hard-coded string added to a panel.**
`src/ui/hud/status-strip.ts:146`, `eyebrowText(t(HUD_MESSAGE_KEY.clockDay))` →
`eyebrowText('Day of the week')`:

```
PSEUDO-LOCALE SWEEP :: [text] "Day of the week" — not from the catalogue at all
PSEUDO-LOCALE SWEEP ::     at div.hud > div.hud-strip > div.hud-strip__clock > span.ui-eyebrow
```

**Mutation 2 — a key that resolves to nothing.** Same line pointed at the
non-existent `hud.clock.day-of-week`:

```
PSEUDO-LOCALE SWEEP :: [text] "hud clock day of week" — not from the catalogue at all
PSEUDO-LOCALE SWEEP :: 1 of those are key-shaped (a key that resolved to nothing)
  ✘  2 … › no key rendered as its own name anywhere the sweep went
```

Both were reverted; `git diff` over `src/` is empty on the branch.

---

## 4. The inventory

Six sites. `file:line` was opened for every one.

### 4.1 DEFECT — a raw `Error.message` spliced into a localised template

**Rendered:**
`⟦Çóúļđ ñóţ çřéáţé á ƥříšóñ: Simulation worker fault (already-initialized): Kernel is already initialized.·············⟧`
**At:** `div.hud__rail > div.hud__aside > aside.save-panel > p.save-panel__status`
**Source of the parameter:** `src/persistence/session/worker-session-host.ts:40`
— `` super(`Simulation worker fault (${code}): ${detail}`) `` — reached through
`describeActionError` (`src/ui/primitives/async-action.ts:324-327`, *"if (error
instanceof Error) return error.message"*).

**Seven call sites in one file put an English `Error.message` on screen:**

| line | key it fills |
| --- | --- |
| `src/ui/save-panel.ts:89` | `save.status.save-failed` (`result.error.message`) |
| `src/ui/save-panel.ts:198` | import rejection (`rejected.message`) |
| `src/ui/save-panel.ts:204` | import rejection (`rejected.message`) |
| `src/ui/save-panel.ts:280` | action failure (`describeActionError`) |
| `src/ui/save-panel.ts:550` | list failure (`describeActionError`) |
| `src/ui/save-panel.ts:634` | `save.status.create-failed` (`describeActionError`) |
| `src/ui/save-panel.ts:816` | export/import failure (`describeActionError`) |

**Why this is a defect and not a judgement call.** The catalogue *already
carries* the localised sentence for this exact fault:
`src/content/default-locale-en.ts:416` holds
`'hud.alert.fault.already-initialized': 'A simulation request was refused — this
session already has a prison loaded.'`, and
`src/ui/simulation-alerts.ts:108` maps the code `'already-initialized'` to that
key. So the translated string exists, is shipped, and this path walks past it to
print the engine's internal English instead.

**The HUD does not do this, which is the proof it is avoidable.**
`src/ui/hud/hud.ts:1127-1128` maps `failure.actionId` to a key via
`refusalMessageKey` and renders that; the refusal swept in this run came back
fully bracketed —
`⟦Ţĥé çļóçķ đíđ ñóţ çĥáñğé — ţĥé řéɋúéšţ ŵáš řéƒúšéđ.⟧` — with no English in it
at all. Two panels, one problem, two answers.

`src/ui/save-panel.ts:55`'s own docblock claims of its message shapes:
*"Neither is a literal authored in this module, which is the property that
matters."* That is true of the *template* and false of what reaches the screen.

**Not fixed here.** Every route out — a code-to-key map for
`WorkerFaultError`, or a decision to show a code instead of a sentence —
produces player-facing copy.

### 4.2 DEFECT — the application's accessible name is hard-coded English

**Rendered:** `Lockstate game application` (attribute, never bracketed)
**At:** `html > body > main#app [aria-label]`
**Source:** `index.html:11` — `<main id="app" aria-label="Lockstate game application">`

This is the accessible name of the entire application region: the first thing a
screen-reader user hears. It is player-facing text and it never passes through
the catalogue. It is invisible to
`tests/foundation/localization-key-completeness.test.ts` twice over — it is not
a `*Key:` declaration, and it is not in a `.ts` file at all.

The catalogue already localises the *sibling* landmarks: `brand.region`
(`default-locale-en.ts:1045`), `save.panel.region`, `hud.clock.region`,
`hud.status.region`. This one landmark is the exception.

### 4.3 DECISION — the brand name is a key in one place and a literal in another

**Rendered:** `Lockstate.io` (document title, never bracketed)
**At:** `<title>`, `index.html:8`
**The same name, as a key:** `src/content/default-locale-en.ts:1075` —
`'brand.wordmark': 'LockState.io'` — which the sweep saw come back as
`⟦ĻóçķŠţáţé.íó·····⟧`, i.e. it *is* localisable today.

So the project has already decided, in the catalogue, that the wordmark goes
through the localizer; `index.html` predates or ignores that decision. **The two
spellings are not even the same**: `Lockstate.io` in the title, `LockState.io`
in the catalogue. Whichever answer the owner gives — brand names are never
translated, or the title should be built from `brand.wordmark` at boot — one of
these two files is currently wrong about the product's own name.

`<title>` cannot be set from a catalogue without a line in `src/main.ts`, so
this is a change, not a copy-edit. Not made here: it is a brand decision.

### 4.4 NOT A HARD-CODED STRING, but the same root as 4.1 — `<html lang="en">`

**Rendered:** `en`
**At:** `<html lang>`, `index.html:2`

Under `en-XA` the document still tells the browser and every assistive
technology that its content is English. This is not a missing key — `lang` takes
a locale tag, not a translated string — but it is the same absence: nothing
copies `localizer.locale` onto `document.documentElement.lang`. Already recorded
as UXA-26 in the 2026-08-26 audit and unchanged since. Listed because the sweep
saw it, not as a new finding.

### 4.5 DELIBERATE — the generation id

**Rendered:** `⟦Šáṽéđ (ğéñéřáţíóñ gen-mtg1aol0-1).············⟧` (four variants,
one site)
**At:** `div.hud__rail > div.hud__aside > aside.save-panel > p.save-panel__status`
**Source:** `src/ui/save-panel.ts:75-77`

Deliberate, and the code says so in a comment written before this sweep existed:
*"A generation id is a stable identifier, not copy: it is shown so a player
reporting a problem can name the exact save."* An identifier that changed
between locales would stop being an identifier. The ASCII the detector caught is
`gen`, `mtg` and similar fragments of a timestamp-derived id — no word is being
communicated.

### 4.6 DECISION — the default prison name

**Rendered:** `⟦New Prison (1 ğéñ)·······⟧`
**At:** `aside.save-panel > ul.save-panel__list > li.save-panel__item > span.save-panel__item-label`
**Source:** `src/ui/save-panel.ts:629` —
`this.controller.createPrison(prisonId, 'New Prison')`

This one is genuinely on the line, which is why it is a decision and not a
verdict. `New Prison` is the *name the player's first prison is given*, and the
template around it (`save.list.item`) is localised. Arguments both ways, and
neither is obviously right:

- It is a **datum**, not copy: it is persisted into the save, it is what the
  player will rename, and a name that changed when the player changed language
  would rename their prison under them.
- It is also the **only English sentence-case words a Polish player sees in the
  save panel**, and it is authored copy — nobody typed it.

`src/persistence/session/session-controller.ts:157` and
`src/ui/primitives/async-action.ts:13` both quote the string in comments, so it
is load-bearing in more than one reader's head. Not decided here.

---

## 5. What the sweep covered, and what it did not reach

**31 states, 133 raw hits, 9 distinct readable strings, 6 sites, 0 unresolved
keys.** Covered, each confirmed by an assertion or a printed count in the run:

- first paint with no session; the save panel's empty state (*"No prisons yet"*);
- the **telemetry consent prompt** (asserted present: `expect(count).toBe(1)`),
  its declined state;
- a **refusal** (transport pressed with no session, `.hud__refusal` visible);
- the **brand badge**, the **interface-scale control**, the minimap region;
- all five tabs (`overview`, `build`, `rooms`, `security`, `regime`), folded and
  again with every visible disclosure opened;
- a **created prison**, an explicit **Save now**, a **running clock** at ×1 and
  at fast-forward;
- a **hired guard** (roster row confirmed present by a probe: 1 row);
- a **build queue** with 3 rows and a **pending delivery** with 1 row (printed:
  `build queue rows = 3, delivery rows = 1`);
- a **pending zoned room** (printed: `rooms confirm visible = true`);
- a **failed create**, which is what produced §4.1.

**Not reached, and therefore not swept — say so rather than implying coverage:**

- **Any prisoner.** The Regime panel read `PRISONERS 0 of 0 / Nobody has been
  admitted yet` throughout: a prison needs a built cell before it can admit
  anyone, and this pass never completed one. **The prisoner roster's row text is
  the largest unswept surface**, and it is the one most likely to carry a
  generated name.
- **Any incident or alert row.** The Alerts section was open in every tab sweep
  and empty in all of them.
- Import/export failure statuses (`save-panel.ts:198`, `:204`, `:816`) — the
  same class as §4.1, reached by static reading rather than by the browser.
- **Anything drawn on the canvas.** The sweep reads the DOM. Phaser text is not
  in it.
- The `en-XA` **layout** question. The 35 % padding is on screen in every run,
  and no overflow assertion was made. This pass was about hard-coded strings.
- One viewport only, 1440x900.

---

## 6. Handed over: a defect this pass reproduced and did not investigate

Found while building the harness, reproduced against the **unmodified**
application at `898a16a`, and **out of scope for #664**:

> On a freshly loaded page with no session, **one click on any `.ui-tab`** makes
> the next `New prison` press fail with
> `Could not create a prison: Simulation worker fault (already-initialized):
> Kernel is already initialized.` A second press then succeeds.

Measured, unpatched page, five of five tabs:

```
PROBE overview  … status: Could not create a prison: Simulation worker fault (already-initialized): Kernel is already initialized.
PROBE build     … status: Could not create a prison: …
PROBE rooms     … status: Could not create a prison: …
PROBE security  … status: Could not create a prison: …
PROBE regime    … status: Could not create a prison: …
```

Controls, same page, same commit: no tab click and an immediate create →
`Saved (generation gen-…-1)`. A 6 s wait with no tab click → saved. Opening the
Alerts disclosure without a tab click → saved. Two consecutive creates → both
saved. So the trigger is the tab press itself, not elapsed time, not a
disclosure, and not a double press.

**The cause was not determined and no impact is claimed here.** The obvious
suspect is `src/main.ts:1850-1897`, the `select-tab` intent, which fires up to
nine `refresh*()` reads at every tab change including the first — but a *read*
initialising a kernel is not something this pass established, and
`docs/AGENT_WORKFLOW.md` §3 is explicit that a measurement is not a diagnosis.
It is a reproduction, offered to whoever owns that surface.

It is also the reason the sweep creates its prison before touching a tab, and
the reason §4.1 has a state to be observed in at all.

---

## 7. What would make this record wrong

- **The `<title>` and `aria-label` findings are the least interesting and the
  most certain**; §4.1 is the most interesting and rests on one observed fault
  code. If `describeActionError` is only ever reachable via faults whose
  messages are themselves catalogue text, §4.1 shrinks — but
  `worker-session-host.ts:40` builds its message with a template literal from
  `code` and `detail`, so at least that one is not.
- **A generated prisoner name, if one exists, would change the shape of the
  answer** from "six sites, mostly in one file" to "the roster too". §5 says
  plainly that this was not reached.

## 8. Weakest claim

**That "31 states" is a meaningful measure of coverage.** It is a count of times
the sweep function was called, not of distinct screens: several of those states
differ only by which disclosure happens to be open, and two panels — the
prisoner roster and any alert row — were swept *while empty*, which means the
sweep looked at them and learned nothing about the text they render when they
have content. A reader could take "31 states, 6 sites" as "the page is clean",
and the honest version is narrower: **every string that was on screen in the
states I could reach has been accounted for, and the states I could not reach
are named in §5.** What would change my mind is a single run that admits a
prisoner and opens the Regime roster with rows in it; if that comes back clean
too, the claim gets much stronger, and if it does not, §4 is incomplete rather
than wrong.
