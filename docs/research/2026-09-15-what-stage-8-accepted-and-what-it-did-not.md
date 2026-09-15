# What stage 8 accepted, area by area, and what it did not

**Stage 8 of the identity rollout (issue #1164, epic #1155) — the last stage.**
Taken in worktree `/workspace/stage8-accept`, branch `agent/1164-acceptance`,
on `584f5ca1` (v0.0.622), which is `origin/main` as it stood on 2026-09-15.

## What this document is, and the three things it is not

It is the **acceptance pass** #1164 asks for: the thirteen screen-level areas of
`docs/design/2026-09-13-identity-v5/DOKUMENTACJA/06-PLAN-TESTOW.md`, worked one
row at a time against this repository, plus every gate this repository has, with
the numbers each one actually produced.

It is **not a certificate**. Two of the thirteen rows do not pass and are
written up as failures below, and the delivery's own closing criterion has
clauses this repository does not satisfy — §16 lists them in one place so that
nobody has to assemble them from thirteen sections.

It is **not CI's verdict**. The owner's self-hosted runners were stuck for the
whole of this pass, so no CI run exists for this branch. Every number below was
measured locally in this container, and §14 says what that costs the reading.

It is **not a re-inventory**. `docs/research/2026-09-13-every-hud-surface-and-where-the-five-sections-put-it.md`
is the inventory, `docs/research/2026-09-14-the-mechanical-navigation-move.md`
the control-level map, and
`docs/research/2026-09-14-what-stage-5-checked-and-what-it-found.md` the
reachability check. This is the screen-level pass on top of those.

## How every claim here was obtained

Two ways, never mixed, in `docs/research/README.md`'s sense of VERIFIED:

- **Read.** Every `file:line` below was opened in this worktree on `584f5ca1`.
- **Executed.** Every PASS that rests on behaviour names the spec that proves
  it, and those specs were run — see §14 for which gate run each came from.
  Nothing here is a layout claim made by reading CSS, except where it says so.

**The delivery's own nine cases are not evidence for anything here, and #1164
says why.** `06-PLAN-TESTOW.md`'s *"ponownie uzyskano 9/9 PASS"* is
`tests/audit.cjs` in the prototype package: *"Testy uruchamiają fragmenty kodu w
Node VM z atrapami UI; nie przeglądarkę"* — fragments in a Node VM against
stubbed UI, not a browser and not this codebase. Constitution article 20 is the
delivery agreeing with that in its own voice.

---

## The thirteen areas at a glance

| # | Area | Verdict |
|---|---|---|
| 1 | Layout | **PASS** |
| 2 | Resize | **PASS** |
| 3 | Collapse | **PASS** |
| 4 | Slider / reset | **PASS** |
| 5 | Keyboard | **PASS** |
| 6 | Build | **PASS** |
| 7 | Modal | **PASS**, against a narrower surface than the word implies |
| 8 | Schedule | **PASS**, against ticks rather than clock hours |
| 9 | Save | **PASS** |
| 10 | Embed | **NOT APPLICABLE** — the surface does not exist here |
| 11 | Theme | **PASS**, with one clause of the delivery's row unimplemented |
| 12 | Text (200 %) | **FAIL** — re-measured this stage, and the figure moved |
| 13 | Touch | **PARTIAL** — gestures pass; one command has no phone route |

Ten pass, one is not applicable, one fails, one is partial. The two that are not
green were both known before this stage began and neither was caused by it.

---

## 1. Layout — PASS

**The row.** *"390×844, 1024×768, 1440×900, niski ekran"* against *"Brak
niezamierzonego overflow, narzędzia dostępne"*.

**What answers it here.** `tests/browser/app-shell.spec.ts:4660` generates one
test per entry of `HUD_LAYOUT_VIEWPORTS` (`app-shell.spec.ts:3085`) —
1280×720, 1440×900, 1024×768, 900×600, 375×812 — and at each one hit-tests
*every* control in the shell on *every* tab, accounting at the end for both
halves of the question: `neverLaidOut` against a named exemption list, and
`everMeasured.size` against the control inventory. That is the delivery's "tools
available" as a per-viewport closed set rather than a spot check.

900×600 is the "niski ekran" row, and it is the viewport the shell's own fold
tests press against (`app-shell.spec.ts:4717`, which measures the arrival-state
Build panel there because *"the rail is 482.8px and the save panel's floor takes
120.7px of it"*).

**Two of the delivery's four sizes are not in that constant.** 390×844 is not a
`HUD_LAYOUT_VIEWPORTS` entry — 375×812 is, and it is the narrower of the two, so
a shell that contains itself at 375 contains itself at 390. `unplaced-surfaces.spec.ts`
and `operations-reachability.spec.ts` both sweep a three-tier set
(desktop/tablet/phone) that names 1440×900, 1024×768 and 375×812 explicitly.
390×844 is covered at 195×422 by the sweep in §12 and fails there with every
other combination; that is §12's finding, not this row's.

**Overflow is measured, not assumed.** `app-shell.spec.ts:6063` pins the Rooms
panel's last block inside its fold *at every viewport*, `:6191` pins that no
catalogue entry pushes it past, and `ui-strip-badged-width.spec.ts:239` pins the
status strip's nine chips against every desktop width with the badges costing it
no height.

---

## 2. Resize — PASS, and it is the best-covered row of the thirteen

**The row.** *"Przeciągnij wszystkie krawędzie, wyjdź kursorem poza okno,
przerwij gest"* against *"Poprawny rozmiar, brak polecenia mapy, zwolniony
pointer"*.

`tests/browser/resize-separator.spec.ts` is twelve tests and each of the row's
three actions has one:

| The action | The spec |
|---|---|
| a drag that ends over the map resizes and **builds nothing** | `resize-separator.spec.ts:195` |
| the same drag on bare canvas **does** build, which is what makes the line above mean anything | `:256` |
| `pointercancel` mid-drag puts the panel back and builds nothing | `:279` |
| a second touch arriving mid-drag ends it and builds nothing | `:320` |
| the window losing focus ends it and puts the panel back | `:350` |
| a drag that **leaves the viewport** keeps its pointer under capture and still commits | `:404` |
| `pointerout` with no related target ends it and puts the panel back | `:449` |
| Escape abandons a drag in progress, as it abandons a wall run | `:485` |
| a middle-button press on the handle is not a resize at all | `:559` |

**"Brak polecenia mapy" — resize issues no command to the world — is the clause
of the closing criterion this row carries, and it is proved the only way it can
be**: by a sibling test that shows the same gesture on bare canvas *does* reach
the world (`:256`). Without that pair, "no command was sent" is equally
consistent with a harness that cannot send one.

On the assembled page rather than the separator harness,
`hud-layout-shell.spec.ts:220` pins that a pointer drag resizes the rail and is
written down **once**, when the hand lets go; `:238` the `pointercancel`; `:270`
the cursor leaving the window.

---

## 3. Collapse — PASS

**The row.** *"Schowaj każdy panel, wszystkie naraz; przywróć strzałką"* against
*"Uchwyty dostępne, fokus nie trafia w ukryty panel"*.

- `hud-layout-shell.spec.ts:293` — *every* region folds, keeps a handle on
  screen, and **never leaves the keyboard inside itself**. That is the row's
  second clause as an invariant over all regions rather than a case.
- `:324` — folding a panel while the keyboard is inside it hands the keyboard to
  that panel's own arrow. The delivery asks that focus not land in a hidden
  panel; this says where it lands instead, which is the stronger statement.
- `:350` — "map only" folds all three at once and brings them all back. That is
  the row's *"wszystkie naraz"*.
- `:374` — the clock is still readable with the counters folded away.

**One thing the handle is not.** The metric strip's fold control is a row inside
the Layout menu rather than an arrow on the strip, and `d7aab8d8` records that
as a deliberate weakening of the delivery's *"Strzałki zwijają …"*: a second tap
target in the strip's gutter cost one combination that otherwise passed
(1440×900 at 175 %). Constitution article 16 asks for a handle, and the Layout
button is one, present at every layout including "map only".

---

## 4. Slider / reset — PASS

**The row.** *"Zmień rozmiar suwakiem, reset i dwuklik"* against *"Ten sam
zakres i przewidywalne wartości"*.

`hud-layout-shell.spec.ts:204` is the row's first clause exactly: the slider
offers **the same range the separator does**, and moves the same panel.
`:134` pins that both separators announce the delivery's own limits *in the unit
they drag in*, and `:156` that the inspector's ceiling narrows by the map's
share where the window cannot afford both — so "the same range" is a range that
moves with the window rather than a constant.

`:417` is reset: it clears the layout key **and nothing else**. `:452` is the
other half of "predictable values" — a layout survives a reload and is **nowhere
in the save payload**, which is constitution article 13's separation of
preference from save.

**The double-click is real, and this pass nearly recorded it as missing.**
*"Dwuklik"* — double-clicking a separator to put it back — is
`SeparatorController.doubleClick` (`src/ui/primitives/resize-separator.ts:332`),
bound at `:612` (`node.addEventListener('dblclick', onDoubleClick)`) and aimed
at `defaultSize`, whose own comment at `:330` reads *"Where a double-click puts
it back to. Clamped like everything else."* It is gated on both sides:
`tests/unit/resize-separator.test.ts:271` pins that the first double-click
resizes to the default **with `reason: 'reset'`** and that the second reports
`{ kind: 'none' }` — a reset already at its default writes nothing — and
`tests/browser/resize-separator.spec.ts:541` and
`hud-layout-shell.spec.ts:196` drive a real `dblclick` on the real handle.

This is recorded rather than quietly corrected because the wrong version of the
sentence had already been written here, from reading `layout-shell.ts` alone and
finding no `dblclick` in it. The binding is one file down, in the primitive the
shell composes. `docs/AGENT_WORKFLOW.md` §4's rule — open the thing, do not
infer it from the file you happened to open — is what caught it.

---

## 5. Keyboard — PASS

**The row.** *"Tab, separator, strzałki, Home/End, Enter, Escape"* against
*"Fokus widoczny, limity jak dla myszy"*.

- **Separator, and the limits clause.** `resize-separator.spec.ts:507` — *"the
  keyboard reaches every step the delivery specifies, and the world hears none
  of them"*, and `hud-layout-shell.spec.ts:172` the same on the assembled page.
  *"Limity jak dla myszy"* is `:204`'s "the slider offers exactly the range the
  separator does".
- **Tab and Enter, end to end.** `app-shell.spec.ts:7104` zones a room and
  admits a prisoner **with the keyboard alone**; `:7412` takes a room back the
  same way. Those are whole commands issued without a pointer, not focus
  smoke-tests.
- **Where focus goes afterwards.** `app-shell.spec.ts:7577` — *every* command
  hands the keyboard back to the control that issued it.
- **Arrows that do not leak.** `app-shell.spec.ts:5432` — the Build catalogue's
  arrow keys move the catalogue, not the world camera; `world-scene-input.spec.ts:166`
  leaves the camera still while a text field owns the keyboard, and `:193`
  proves the guard is not a permanent mute.
- **Escape.** `world-scene-input.spec.ts:316` cancels a pending wall run and the
  run does not commit; `:415` puts the tool down when there is no run;
  `:488` takes the half-drawn run **first**, so one press never does two things.
- **Focus visible.** `tests/browser/ui-theme.spec.ts` and the token layer carry
  the focus ring through both themes; see §11.

- **Home/End, which the row names explicitly.** `readSeparatorKey`
  (`src/ui/primitives/resize-separator.ts:163`) answers `Home` with `range.min`
  (`:176`) and `End` with `range.max` (`:177`), guarding the inverted-range case
  in the same line. `tests/unit/resize-separator.test.ts:154`, `:159`, `:168`
  and `:173` pin both ends on both axes, and `:197`/`:198` pin the part that
  matters for a held key — **at the limit they report `{ kind: 'none' }` rather
  than a no-op resize**, so an owner that persists on every report does not
  write on a key held down against the stop. `resize-separator.spec.ts:523-524`
  and `hud-layout-shell.spec.ts:168`/`:188`/`:191` press them for real.
- **Enter collapses** (`resize-separator.ts:175`), which is how the keyboard
  reaches §3's fold without a pointer.

---

## 6. Build — PASS

**The row.** *"Wybierz, wskaż, anuluj, zatwierdź, cofnij"* against *"Spójny stan
przycisków i kosztów demonstracji"*.

This is the row stage 4 (#1160) was about, and its gates are the answer:

- **Costs are the simulation's, not a demonstration's** —
  `ui-build-catalogue-price.spec.ts` gates the catalogue's price against the
  simulation's, and `fedb2fab` made the row take it from there. The delivery's
  own words are *"kosztów demonstracji"*; this repository is past that, and the
  difference is worth stating because it is the one place the rollout is ahead
  of the direction rather than behind it.
- **Cancel** — `app-shell.spec.ts` pins one undo per press of Z and one redo per
  Y (`world-scene-input.spec.ts:589`), and `playtest-cancel-refund-readout.playtest.ts`
  carries what cancel gives back.
- **A refusal is not a success** — `ui-build-refusal-is-not-a-success.spec.ts:151`:
  a refused placement names the simulation's reason and queues nothing, and
  `:119` is its pair, an accepted order that says nothing about a refusal.
  This is the closing criterion's *"żadna odmowa nie wygląda jak sukces"* and
  it is gated rather than asserted in prose.
- **Refusals reach the screen rather than the console** —
  `app-shell.spec.ts:8481` (#207), `:8574` for a wall refused after a world drag
  (#225), `:8640` for a build order refused into the alerts list (#261).
- **Button state** — `ui-buy-button-affordability.spec.ts`,
  `ui-hire-button-affordability.spec.ts`, `ui-overdraft-badge.spec.ts`, and
  `app-shell.spec.ts:9839`, which pins that Buy charges the quantity its label
  was showing when it was pressed (#548).

---

## 7. Modal — PASS, against a narrower surface than the word implies

**The row.** *"Otwórz z listy, rerender listy, zamknij"* against *"Fokus wraca
do dostępnego miejsca"*.

**This repository has no `role="dialog"` anywhere** — grepped across `src/`; the
only hit in the tree is inside a playtest. The delivery's "modal" is the
prototype's. What this repository has in that shape is the **delete
confirmation opened from a row of the saves list**, which is the row's scenario
exactly: opened from a list, the list re-renders under it, and it closes.

`ui-save-delete-confirmation.spec.ts` is thirteen tests and four of them are
this row:

- `:143` — the keyboard lands on the control that changes nothing.
- `:152` — backing out deletes nothing **and hands the keyboard back to the
  row**.
- `:179` — confirming deletes exactly one prison, **and the keyboard lands
  somewhere reachable**. That is the row's expected result in the same words.
- `:236` — a confirmation aimed at one prison cannot be spent on another, which
  is the "rerender listy" hazard: the list changing under an armed confirmation.

`:207` and `:352` are the same shape for the undo window (ADR 0114): a press
after the window has closed is refused **and says so**.

**So the row passes, but on one surface rather than on a modal system.** If a
real dialog is ever introduced, this row needs re-working; it is not proved by
what is here.

---

## 8. Schedule — PASS, against ticks rather than clock hours

**The row.** *"08:59/09:00/11:59/12:00, północ"* against *"Poprawny pojedynczy
bieżący przedział"*.

**The times do not transfer and the invariant does.** This simulation's day is
`DAY_LENGTH_TICKS = 2_400` ticks at 20 Hz (`src/simulation/prisoners/regime.ts:12`),
deliberately not a 24-hour clock — the file says so: *"deliberately much shorter
than a literal 24h/86,400-tick real-time day"*. There is no 08:59. What the
delivery is actually asking for is that at every instant, including a boundary
and including midnight, **exactly one interval is current**, and that is a
property this repository holds at a stronger level than the delivery's five
sample times:

- `resolveActiveRegimeBlock` (`regime.ts:133`) resolves tick-of-day with
  `((tick % DAY) + DAY) % DAY` — so the wrap is defined for negative ticks too
  — and **throws** rather than returning a default if no block covers it
  (`:136-138`).
- `assertGaplessSchedule` (`regime.ts:40`) refuses any schedule that does not
  tile `[0, DAY_LENGTH_TICKS)` exactly once: sorted, each block must start
  exactly where the last ended, and the last must end at `DAY_LENGTH_TICKS`.
  One comparison rules out both a gap and an overlap. It runs at module load for
  the two shipped schedules and is exported for the ones built at runtime.
- The tests are the delivery's five cases generalised:
  `tests/unit/prisoners-regime.test.ts:40` — *"cover every tick of the day
  exactly once, at every tick rather than at every 137th"*; `:127` the inclusive
  start of a boundary (the 09:00 case); `:138` one tick before an exclusive end
  (the 08:59 case); `:121` **wraparound** — a tick resolves identically to that
  tick plus any whole number of days, which is the midnight case; and `:174`,
  `:187`, `:202`, `:208` the four ways a schedule can be malformed, each
  rejected.

`:187` is worth naming: it rejects an **overlap**, *"which the resolver alone
cannot detect"* — `find` would simply return the first match. That is the exact
failure the delivery's *"pojedynczy"* (single) is guarding against, caught by the
validator rather than by the lookup.

---

## 9. Save — PASS

**The row.** *"Zapisz, zmień, zamknij, wczytaj; blokada pamięci"* against
*"Prawdziwy komunikat i brak częściowej utraty danych"*.

**The save is real** — `local-save-durability.spec.ts:19` (a saved prison is
still readable after a reload), `:40` (a fresh context starts empty, so the line
above is not reading a cached page), `app-shell.spec.ts:7996` (a prison created
in the running game is still listed after a **real navigation**), and
`lifecycle-save.spec.ts:49` (both real lifecycle events from a real navigation
reach the handler).

**It survives the conflict scenarios**, which is the closing criterion's own
clause:

- `local-save-durability.spec.ts:45` — retention keeps the current generation
  plus two previous ones.
- `:82` — `loadCurrent` walks back to the previous good generation when the
  newest is corrupt.
- `:121` — a prison whose every retained generation is corrupt reports
  `no-valid-generation` rather than pretending.
- `local-save-quota.spec.ts:64` — **a save that exceeds the quota fails without
  destroying the last good generation.** That is *"blokada pamięci"* and *"brak
  częściowej utraty danych"* in one test.
- `local-save-errors.spec.ts:94` — a throw inside `work()` aborts the real
  transaction, discarding staged writes, so there is no half-written save to
  lose data to.
- `local-save-migration.spec.ts:52`, `:98`, `:140` — a V1 save from an older
  build still loads and migrates; loading migrates **in memory only**; a corrupt
  V1 generation falls back to the previous V1 generation.
- `lifecycle-save-epoch.spec.ts:70` (ADR 0109) — a save flushed during real page
  teardown never outlives the session that authorised it.

**The message is true**, which is the half a durability test cannot answer:
`ui-shell.spec.ts:210` — a save from an older version **reports that it was
brought up to date**; `:220` a file that is not JSON is refused before it
reaches persistence; `:230` **each refusal says something different, and none of
them loads anything**; `:253` with no prison to import into, it says so and
imports nothing. `local-save-errors.spec.ts:55` pins that every documented error
name matches what the browser actually throws, so the classification the message
is chosen from is not a guess.

---

## 10. Embed — NOT APPLICABLE, and calling it a pass would be false

**The row.** *"Zmień układ, motyw i dane w podglądzie urządzenia"* against
*"Główna sesja bez zmian"*.

**The surface it names does not exist in this repository.** The delivery is
describing its own design book:
`DOKUMENTACJA/03-INTERAKCJE-I-URZADZENIA.md:44` — *"Księga → Urządzenia: 390×844,
1024×768, 1440×900. To iframe z tą samą aplikacją, nie screenshoty"* — a chapter
of the prototype that embeds the prototype in three iframes at three device
sizes. `:38` says the previews keep *"osobny Map w pamięci każdego iframe"*, a
per-iframe in-memory store, precisely so that they cannot write to the main
session; `audyt.md:10` records that as a defect the delivery **fixed in itself**.

Lockstate has no design book, no device-preview chapter and no iframe of itself.
There is nothing here to change the layout, theme or data of. **The row is
not applicable, and it is recorded as not applicable rather than as a pass**,
because a pass would imply an isolation property was measured and it was not.

**What does transfer, and it is not satisfied.** `03-INTERAKCJE-I-URZADZENIA.md:34`
carries a second sentence in the same breath as the embed one: *"Zwykłe karty
odbierają zmiany preferencji przez storage event"* — ordinary tabs pick up
preference changes through the `storage` event. **This repository has no
`storage` event listener at all**: grepped across `src/`, nothing binds it. So
two Lockstate tabs open at once do not follow each other's theme, interface
scale, layout or language until each is reloaded. That is a divergence from the
delivery's described behaviour, it is not a regression this stage caused, and
nothing in this repository promises a player otherwise. Filed in §15.

---

## 11. Theme — PASS, with one clause of the row unimplemented

**The row.** *"Jasny/ciemny/system; zmiana systemu; formularze i błędy"* against
*"Spójne role, czytelne stany"*.

`tests/browser/ui-theme.spec.ts` answers the first two clauses directly:

- `:47` paints the day palette when the device asks for light; `:54` the night
  palette when it asks for dark.
- `:61` — **changes with the device, live, while no preference has been
  expressed.** That is *"zmiana systemu"*.
- `:77` — **stops following the device once the player has chosen.** The
  asymmetry `src/ui/theme.ts:148-153` argues for in prose, gated.
- `:103` — switching *"moves the surface, the body text and a badge chip
  together"*, so it is a repaint rather than an attribute flip. That is
  *"spójne role"*.
- `:146` remembers the choice across a reload under its own storage key
  (`lockstate.settings.theme`, `src/input/storage.ts:57` — the theme is a
  preference and is not part of the save, constitution article 13).
- `:170` — a browser that will not store anything **still boots and still
  switches, it merely does not remember**, which is the refusal-shaped case the
  row's *"błędy"* is about.

**Contrast and focus — the closing criterion's *"motywy zachowują kontrast i
fokus"*.** `docs/VISUAL_IDENTITY.md:161` records constitution article 8 as
standing: *"contrast measured rather than assumed, visible focus, 200 % text"*.
The first two hold; the third does not, and that is §12 rather than this row.

**What is not implemented.** The cross-tab half of the delivery's theme row —
see §10. A second tab does not follow the first.

---

## 12. Text (200 % page zoom) — FAIL, and the figure this repository has been
quoting is out of date

**The row.** *"Powiększenie 200%, długie tłumaczenia"* against *"Brak utraty
treści i działań"*.

### The long-translations half passes

`tests/browser/pseudo-locale-sweep.spec.ts` and `ui-shell.spec.ts:307` render
the interface in the pseudo-locale and refuse anything not in the catalog;
`ui-build-arm-label-fit.spec.ts`, `ui-roster-row-scales.spec.ts` and
`ui-occupancy-overflow.spec.ts` pin that long strings do not cost their rows
their content; `568f7053` pinned that the **Polish** section names do not
collide at 375×812. The repository ships a second locale and gates it
(`second-locale-contract.test.ts`).

### The 200 % half fails, as it has since before the rollout began

This is the debt `docs/VISUAL_IDENTITY.md:331` and
`docs/IDENTITY_V5_ROLLOUT.md:291` both record as **23 of 36** viewport ×
interface-scale combinations, measured three times during stage 3 (#1159) and
**identical on `origin/main`** each time. Stage 8 did not inherit a claim; it
re-measured one.

**It had to, because the harness behind that figure was deleted.** `d7aab8d8`'s
own message: *"The harness was a throwaway spec and is not committed: it loads
36 pages and asserts nothing, so it is a measurement rather than a gate."* So
the most-cited accessibility number in this repository had no re-runnable
source. This stage committed one —
`tests/browser/playtest-1164-the-200-percent-sweep.playtest.ts` — as a
`*.playtest.ts`, so no gate collects it and no assertion pins the failing set in
place. It measures `d7aab8d8`'s four things, verbatim, over `d7aab8d8`'s 36
pairs.

**What it reports on `584f5ca1`:** see §13's table.

### What clearing it would take, which is not this stage's to do

`d7aab8d8` priced it and the three items have not changed:

> a strip that sheds rows rather than wrapping them, a tab bar that scrolls or
> folds, and a rail that scrolls as a whole rather than trusting its panels to.

with the three measured patterns behind them: the strip spilling its own rows
from 125 % up and laying `.brand` at a negative `top`; the rail overflowing by
109–172 px because the strip and the wrapped tab bar leave it less than its
panels' floors; and **tabs unreachable at 188×406 and 195×422 at every scale
including 100 %**, which is the one failure that is not about zoom at all — it
is two tabs of five off the end of a bar 188 px wide.

**An acceptance pass cannot report this row green and #1164 says so in terms**:
*"Anything not reached stated explicitly. A partial pass reported honestly beats
a complete-sounding one."*

---

## 13. Touch — PARTIAL: the gestures pass, one command has no phone route

**The row.** *"Scroll w panelu, resize wysokości, tap narzędzia"* against
*"Gesty nie przeciekają do mapy"*.

### The three actions pass

- **Scroll inside a panel** — `hud-corner-chrome-passthrough.spec.ts:188`: the
  alerts list keeps a **whole-list** wheel scroll, not just its individual rows.
  `operations-reachability.spec.ts:368`: the Staff panel scrolls wherever the
  rail cannot afford it whole.
- **Resize by height** — `hud-layout-shell.spec.ts:492`: a phone drags the sheet
  by height, between 180 px and two thirds of the screen.
- **Tap a tool, without leaking to the map** — `app-shell.spec.ts:8807` removes
  an object from a world press at 375×812 **with no key ever pressed**, and
  `:9013` pins that a world press with nothing to remove says so at 375×812,
  *where the alerts list does not exist*. `world-scene-touch.spec.ts` is
  eleven tests on two-finger gestures: `:215` two fingers travelling together
  pan and **do not** zoom, `:250` pans while a build tool is armed and abandons
  the run, `:291`/`:318` pinch with the world point held under the midpoint,
  `:342`/`:370` the clamps, `:423` a lifted finger forgotten so the next drag
  pans rather than pinches, and `:505` a second stationary finger cancelling
  placement for each tool.
- **And the pair that makes "no leak" mean something** —
  `hud-corner-chrome-passthrough.spec.ts:110` presses `.hud-minimap`'s title and
  `.hud-zoom`'s own background and requires those to **reach the world**, while
  `:149` requires every real control in the same corner to keep its own press.
  A blanket "HUD swallows everything" would pass one and fail the other.

### The clause that does not pass: "telefon daje dostęp do mapy" is true, and "every present action has a reachable route" is not

Both are in the delivery's closing criterion, one sentence apart.

**The map is reachable on a phone.** `hud-layout-shell.spec.ts:350` — "map only"
folds all three regions at once and brings them back — and `:492`'s sheet drag
are that tier's route to the world view. This clause holds.

**`DismissAlert` is not reachable on a phone.** `.hud__corner` is
`display: none` at 720 CSS px and below (`src/ui/hud/hud.css:4704`, inside the
`@media (max-width: 720px)` opened at `:4642`), the alerts list is inside it,
and the alerts list row is the only site that issues `DismissAlert`
(`src/main.ts`, recorded at `:2897` in the stage 5 table). So one of the
seventeen commands in `src/simulation/protocol/commands.ts` has no route at
375×812.

**This is measured, not inferred.** `tests/browser/unplaced-surfaces.spec.ts:226`
reads `getComputedStyle('.hud__corner').display` at all three tiers and asserts
the string `'desktop: flex / tablet: flex / phone: none'`. Its own docblock says
what it is doing and why (`:215-225`): *"recorded at all three tiers rather than
required at any of them … it is the one measurement in this file whose current
value is arguably wrong for a player."*

**`hud.css` admits it in its own prose**, at `:4701-4702`:

> On a phone the log is still out of reach; on every viewport above 720px it is
> not.

**It is an open owner question and stage 8 does not answer it.** Stage 5 asked
it (`docs/research/2026-09-14-what-stage-5-checked-and-what-it-found.md` §4);
ADR 0112's rule for an unplaced surface is that it goes to the owner when a
stage needs an answer. Fixing it inside an acceptance pass would be exactly what
#1164's hard constraints forbid. **What stage 8 adds is that the acceptance
criterion now depends on it**: the delivery's *"Każda obecna akcja ma osiągalną
drogę"* is false at one of the three device tiers the delivery itself names, and
§16 lists it as such.

---

## 14. The gates, with the numbers each one produced

See §14.1 for the table. **Every run below is local.** The owner's self-hosted
CI runners were stuck for the whole of this pass, so **no CI run exists for
`agent/1164-acceptance`** and nothing here has CI's blessing. Local green is
evidence; it is not the same evidence.

**Two environment facts that change how a number should be read.**

1. **`pnpm` refuses to run in this worktree as shipped.** `node_modules` is a
   symlink to the primary checkout, and pnpm's pre-run dependency check tries to
   reinstall, failing with `ERR_PNPM_UNSAFE_MODULES_DIR`. Every gate below was
   run as `pnpm --config.verify-deps-before-run=false <script>`, which runs the
   identical script body — the banner line each run printed is quoted in the
   table so the command is checkable.
2. **`pnpm verify:assets` fails on a fresh checkout of this worktree for a
   reason that is not a defect.** The Git LFS payloads were pointers, and the
   validator says so by name: *"is a Git LFS pointer, not image data"*. Resolved
   with `git lfs checkout`, which materialised 91 objects / 94 MB from the local
   object cache without a network fetch. The first-run failure is recorded
   because it is what CI's `git lfs pull --include=` step exists to prevent and
   because an agent who skipped it would have reported seven spurious browser
   failures.

### 14.1 Results

<!-- GATES-TABLE -->

---

## 15. What this pass found, and what was done with each

<!-- FINDINGS -->

---

## 16. What the delivery's closing criterion asks for that this repository does not satisfy

The criterion, in the delivery's words, clause by clause, with a verdict on
each. This is the list #1164 asks to be stated plainly.

<!-- CRITERION-TABLE -->
