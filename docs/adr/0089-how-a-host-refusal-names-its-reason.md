# ADR 0089: How a host refusal names its reason to the player

> **The number is 0089, taken above a held 0088, and the sweep is the
> authority.** `docs/adr/README.md`'s own bolded line reads `Next free number:
> 0088` at the commit this draft was cut from (`main` @ `5aef4301`, v0.0.348),
> and `max + 1` off disk agrees — the highest numbered file in `docs/adr/` on
> that tree is `0087-whether-a-refusal-is-an-event-or-a-condition.md`. Both are
> wrong, for the reason this corpus has now recorded ten times: disk sees only
> what has merged, and the index's own next-free line is only ever a claim
> about disk.
>
> The remote sweep was performed rather than asserted. `git fetch origin
> '+refs/heads/*:refs/remotes/origin/*' --prune` followed by `git
> ls-remote --refs --heads origin` returned **427 heads**; `git ls-tree
> --name-only <head> -- docs/adr/` was read out of every one of them, and the
> four-digit filename prefixes were collected across all 427. The maximum
> found anywhere is **0088**, as `0088-does-a-guard-walk-to-its-post.md` on
> `fix/740-a-guard-walks-to-its-post` alone — unmerged, and therefore invisible
> to `docs/adr/README.md` and to a bare `ls docs/adr/`. That branch is PR #781,
> confirmed **open and not merged** at the time of this sweep. Nothing at 0089
> or above appears on any of the 427 heads.
>
> So 0088 is spoken for and this document takes **0089**, exactly as 0073,
> 0082 and 0087 each took a number one above a held one their own sweeps found.
> The number is provisional on the same terms those three set for themselves:
> if it collides with an ADR landing from a branch this sweep could not see —
> including PR #781 itself, should it merge and be renumbered, or should
> another branch also have reached for 0089 — this file, its row in
> `docs/adr/README.md` and every citation of it get renumbered together, and
> resolving that is the integrator's task, not this draft's.

## Status

**Proposed, 2026-09-02. Not self-approved.**

This document recommends a shape and prices it. It authors no new
player-facing sentence — `AGENTS.md`'s fourth exclusion reserves that to the
owner, and every quotation of English text below is transcribed verbatim from
a sentence that already ships in `src/content/default-locale-en.ts`, cited by
line. Nothing under `src/` is changed by this document.

## Context

### What #791 found, and why it is not itself the interesting part

[Issue #791](https://github.com/matmaxalez/lockstate/issues/791): pressing
*Admit* on a brand-new prison with no cell reads

> "Nobody was admitted — the request was refused."

(`src/content/default-locale-en.ts:1462`, key `hud.refusal.admit-prisoner`).
That is very likely the first refusal a new player ever meets, and it says
nothing about what to do. The throw behind it is specific —
`src/main.ts:2710`:

> `throw new Error('This prison has no room to hold a prisoner, so nobody can be admitted into it.');`

— but `src/ui/host-refusal.ts` deliberately never shows that string to a
player (ADR 0011, and correctly — see below), and `HostRefusalReason` carries
exactly one member (`src/ui/host-refusal.ts:57`), for an unrelated overdraft
ruling. The throw at `main.ts:2710` therefore has no reason to attach, and the
generic per-control sentence is all that is left to say.

The cheap fix — give `HostRefusalReason` a second member for this one case —
was offered to the owner in #791 itself and declined. Their instruction, tying
CLAUDE.md's rule about proposing an ADR rather than deciding architecture
inside implementation code to this specific decision:

> Rethink ADR 0011 once and for all. Instead of adding cases one at a time,
> decide how a host refusal conveys its reason to the player. More expensive
> now, but it removes this obstacle from every future refusal — and several
> are already filed.

So this document is not about admission. It is about the mechanism that made
admission's specific throw unable to reach the sentence already written for
it.

### The inventory: every host-refusal producer, enumerated rather than counted

`src/ui/host-refusal.ts:6-46`'s own docblock names the shape: a *command*
intent is refused in one of two places, and a **host** refusal is the one
`src/main.ts` decides on this thread, before a command is ever sent to the
simulation worker, by throwing. (The other place — the worker refusing a
command it already accepted — is ADR 0087's subject, not this one; see
"What this does not solve" below.)

Six `throw` statements in `src/main.ts` are reachable from a command's
dispatch and land in the HUD's gate (`AsyncActionGate`, read by `reportError`
at `src/ui/hud/hud.ts:1294-1309`). No other file throws a host refusal —
`place-build-order` (`src/main.ts:2290-2329`), `place-object`
(`src/main.ts:2365-2373`), `zone-room` and `unzone-room` submit without any
pre-check at all, refusing only from the worker's side, by the composition
root's own account of why (`src/main.ts:2354-2364`: "every one of the seven
refusal reasons is about the zoning plane, the objects already standing or the
orders in flight, and this thread holds none of them").

| # | Site | Actioned by | Carries a reason today? | What it could say if it could |
| --- | --- | --- | --- | --- |
| H1 | `src/main.ts:1058-1063`, `requireSimulation` — shared by every command case that reaches it (at least eight: `purchase-materials`, `admit-prisoner`, `hire-staff`, `place-build-order`, `place-object`, `zone-room`, `unzone-room`, and every other case calling `requireSimulation(commands)`) | no session at all | No — plain `Error` | Nothing control-specific: "no session" is a cross-cutting fault, not a fact about the control pressed, and the per-`actionId` generic key (`refusalMessageKey`'s `undefined`-reason branch, `src/ui/hud/projection.ts:1116-1146`) is already the right sentence for it |
| H2 | `src/main.ts:2549-2551`, `purchase-materials` — unknown `itemId` | a schema-shaped defect: the requested material does not exist | No — plain `Error` | Nothing a player caused: nothing on the Build panel can name an item the catalogue does not carry, so this is the "malformed charge" case `host-refusal.ts:52-55` already reasons about for the sibling affordability check — a defect on this thread, and the generic sentence is the true one |
| H3 | `src/main.ts:2565-2591`, `purchase-materials` — affordability | one of two: the standing overdraft floor (`verdict.refusal === 'past-the-floor'`), or a malformed charge | **Half of it.** `'past-the-floor'` throws `HostRefusalError('past-the-overdraft-floor', message)` (`main.ts:2588-2590`); the other branch throws a plain `Error` deliberately, for the same "malformed charge is a defect" reason as H2 | Already reaches `hud.refusal.purchase-materials-past-floor` (`src/content/default-locale-en.ts:1456`) |
| H4 | `src/main.ts:2710`, `admit-prisoner` — no room instance exists | genuinely player-actionable: nothing is zoned yet | **No** — plain `Error`, the #791 defect | `hud.alert.refusal.admit.no-accommodation`'s sentence, or its equivalent — see "Why the existing key is the wrong destination" below |
| H5 | `src/main.ts:2769`, `hire-staff` — unknown `staffRoleId` | a schema-shaped defect, same shape as H2 | No — plain `Error` | Nothing a player caused, for the same reason as H2 |
| H6 | `src/main.ts:2783-2785`, `hire-staff` — affordability | same two-way split as H3 | **Half of it**, same mechanism as H3 | Already reaches `hud.refusal.hire-staff-past-floor` (`src/content/default-locale-en.ts:1457`) |

Two things this table makes precise that the issue's framing does not:

**#791 is not "no reasons are carried."** Two of six sites already carry one
(H3, H6), and they reach the right sentence today — ruling 18 of 2026-08-31
built exactly the mechanism this document is about to generalise, for exactly
one case. **The defect is narrower than the issue's title suggests, and the
owner's instruction is broader than the defect**: three sites (H2, H5, and the
shared H1) are *correctly* silent about the specific reason, because the
condition behind them is a defect on this thread rather than a fact a player
can act on — `host-refusal.ts:52-55` already states this rule for the sibling
half of H3/H6 and it generalises without a new argument. **Exactly one site
(H4) is a genuine miss**: a player-actionable condition, with a sentence
already written and shipped, that the mechanism cannot reach. The owner's
instruction is not "fix H4" — it is "decide the mechanism H4 exposed a gap
in," because #772, #767 and #780 (below) are three more places the same gap
would reopen one case at a time if it is patched rather than redesigned.

### Why ADR 0011's narrowness was right, not merely established

`src/ui/host-refusal.ts:35-46` gives the concrete reason `Error.message` is
never player text: the value behind `AsyncActionFailure.error` is `unknown`,
so the reader has to decide from the value itself, and an `Error` thrown for a
programmer's benefit is authored for a programmer. `main.ts:2710`'s own
message — "This prison has no room to hold a prisoner, so nobody can be
admitted into it" — is a perfectly good *diagnostic* sentence and a poor
*player* one for a reason specific to this codebase: it describes the
mechanism (`IntakeSystem` marking an arrival `'failed'`, per the comment
immediately above the throw at `main.ts:2617-2626`) rather than the action
`hud.intake.hint` already told the player to take ("A prison needs a cell
before it can admit anyone," per #791's own playtest). Showing the thrown
string would trade a wrong sentence for a differently wrong one — accurate
about the code, silent about the fix.

ADR 0011's own frame is the general form of this: three namespaces — a stable
id, a message key, translated text — with the rule that translated text "may
reach the player: always" and everything else "never" (`docs/adr/0011-localization-architecture.md:24-28`).
An `Error.message` is not a member of any of the three; it is free-form
English written for whoever reads a stack trace, and the three-namespace rule
is exactly what says such a string may not stand in for a message key merely
because it happens to be readable prose. Any proposal below that quietly
started showing diagnostic text again would be reopening this, not
generalising it, and none of the three options does that.

### The precedent this repository already built, twice, on the other side of `sender.submit`

The worker side of the boundary — a command the simulation *accepted* and then
refused at its tick — solved this exact problem already, and did not solve it
with a switch statement. `src/ui/simulation-alerts.ts:6-33` states the design:

> A `Record` over the closed `RefusalReason` union, so a reason added to the
> protocol fails to compile here until it has something to say.

and the table it introduces (`src/ui/simulation-alerts.ts:34-76`,
`REFUSAL_LABEL_KEYS`) is thirty-nine flat, namespaced string members —
`'admit.no-accommodation'`, `'hire.roster-full'`, `'zone.not-enclosed'`, and so
on — each mapped to exactly one `LocalizationKey`. `PROTOCOL_FAULT_LABEL_KEYS`
two sections down (`simulation-alerts.ts:104-117`) is the same shape for a
different closed union. Both are exhaustive **by construction**: TypeScript
refuses to compile a `Record<ClosedUnion, X>` missing a member, so a producer
naming a fortieth `RefusalReason` breaks the build until somebody has decided
its sentence — which is the property the current host-side switch
(`src/ui/hud/projection.ts:1116-1146`) does not have. Nothing there stops a
seventh `HostRefusalReason` member from compiling while `refusalMessageKey`
quietly keeps falling through to the generic key for it, because the function
is an ordinary `switch`, not a lookup the compiler can check for completeness.

A second precedent, from the same file, answers a question option 2 below has
to face: whether a host sentence and a worker sentence covering the same fact
may share one key. `src/content/default-locale-en.ts:560-577` argues no, at
length, for the money-floor pair ruling 18 and ruling 23 produced:

> Four call sites, and two vocabularies that ADR 0011 keeps apart... Making
> one table's value a member of the other namespace would put a host key on
> the wire's side of that line. The repository's own precedent is the same
> direction and is not thin... this file has always let distinct keys carry
> identical text, because a key here is a *call site* and never a string pool.
> What keeps identical text identical is a test, not a shared key.

And `default-locale-en.ts:419-424` states the same rule from the other
namespace's side, specifically about the sentence #791 names as "already
written":

> Namespaced `hud.alert.refusal.*` and not `hud.refusal.*`: the two keys in
> that older namespace label the always-laid-out band under the status
> strip... These are rows in the alerts list about something the simulation
> decided later, with no control to attach to.

### Why the existing key is the wrong destination, even though the sentence is right

#791 frames the fix as reaching `hud.alert.refusal.admit.no-accommodation`
(`default-locale-en.ts:433`: "Nobody was admitted — there is no room to put a
prisoner in yet."). Per the rule just quoted, that specific key is reserved
for the alerts-list row a *worker* refusal produces, with no control attached
— and a host refusal is bound to a control (`refusal.dataset['action']`,
`markControl`, `aria-describedby`; `src/ui/hud/hud.ts:1298-1309`). Wiring H4 to
reach that literal key would be the exact cross-namespace reuse
`default-locale-en.ts:560-577` already argued against for the money pair, one
producer over. The right destination is a *new* `hud.refusal.*` key, and the
established convention is that its wording may be identical to
`admit.no-accommodation`'s without becoming the same key — exactly as
`hud.refusal.hire-staff-past-floor` and `hud.alert.refusal.hire.insufficient-funds`
already do for money (`default-locale-en.ts:1456-1457` beside
`REFUSAL_LABEL_KEYS['hire.insufficient-funds']`, `simulation-alerts.ts:47`).
That new key is copy, and it is the owner's; this document names where it
goes and does not write it.

### The three related issues, and why none of them is this document's subject

- **#772** — the Buy button looks identical whether the press will work. This
  is a *pre-press* affordance question: whether to show anything before a
  control is pressed at all, using `spendableMinorUnits`, which is computed on
  every press and read nowhere (per the issue). That is a live, standing fact
  about the prison, not an event a press produces — the same event/condition
  split ADR 0087 exists to answer, and #772 says so itself, naming ADR 0087's
  option 4 as the fork it is waiting on. Nothing in this document changes when
  or whether a condition is shown before a press.
- **#767** — crossing an insolvency rung produces no notice. This is entirely
  on the worker side of `sender.submit`: `PrisonCondition`,
  `computeStandingPrisonConditions` and `InsolvencyRungSystem` are all
  simulation-side machinery published on `simulation/status-counts`, and ADR
  0087's amendment records the owner's ruling and the implementation already
  landed. It has no `HostRefusalReason` in it anywhere.
- **#780** — a refusal outliving its subject. This is a *lifecycle* defect in
  `RefusalLog.supersede`'s per-target keying (`src/simulation/runtime/session-commands.ts`)
  and in `hud.ts`'s clearing rules (`src/ui/hud/hud.ts:1211-1259` per the
  issue) — when a standing refusal stops being shown, not what it says while
  it stands. A host refusal already clears on the narrower, and already
  correct, rule `hud.ts`'s `clearRefusal` states: the same `actionId`
  succeeding retires it (`src/ui/hud/hud.ts:1317-1324`). Nothing about
  widening `HostRefusalReason` touches when a refusal is retired.

All three sit in the family #791 belongs to — "the game knows something and
does not say it, or says something stale" — and none of the three is a
producer of a *host* refusal in the sense this document's inventory covers.
Solving this document's question does not solve any of them, and is not a
step toward solving #767 or #780, which are ADR 0087's territory. It is a
partial step toward #772 only in a narrow sense: if #772's control-state
sentence is ever decided to come from a host pre-check rather than from ADR
0087's condition mechanism, it would want to name its reason from the same
kind of vocabulary this document recommends, so the two halves of one fact
("you can't press this" / "you pressed it and it failed") stay expressible in
one system rather than two.

## Options

### Option 1 — widen the closed union, keep the switch (the cheap fix, generalised)

Add a member to `HostRefusalReason` per new case as it arises — exactly what
#791 offered and the owner declined — and extend `refusalMessageKey`'s
`switch` (`src/ui/hud/projection.ts:1116-1146`) with a new arm each time.

**What it costs:** almost nothing per case — a union member, a throw site, a
switch arm, one new `default-locale-en.ts` entry. This is the cheapest option
by a wide margin and the one already partially built (H3/H6).

**What it gets wrong, and it is the whole reason the owner rejected it stated
in general terms:** nothing enforces that a new member gets a sentence.
`HostRefusalReason` is a plain union and `refusalMessageKey` is an ordinary
function; TypeScript happily compiles a seventh member that no `case` handles,
silently falling through to the generic key exactly as H4 does today. The
compiler catches a typo in a case label; it does not catch a missing one. Every
future host refusal that wants to say something specific — and #791 names
"several" already filed — repeats #791's own investigation from scratch: read
the throw, discover the union has no member for it, discover the switch has no
arm for it, and either patch both by hand (this option) or file the issue
again. This is a per-instance fix to a class defect, and the class defect is
what the owner asked to have decided once.

### Option 2 — reasons as data, resolved through a closed lookup the compiler checks (recommended)

Two changes, in the two files that already own each half of the boundary:

1. **`src/ui/host-refusal.ts`** — widen `HostRefusalReason` from one member to
   a small, flat, namespaced vocabulary in the same style
   `REFUSAL_LABEL_KEYS` already uses on the worker side: `'admit.no-accommodation'`,
   `'purchase.past-overdraft-floor'`, `'hire.past-overdraft-floor'` are the
   three this inventory identifies as player-actionable today (H4, and the
   reason-carrying halves of H3/H6, renamed from the single shared
   `'past-the-overdraft-floor'` to two namespaced members — see "What it costs"
   for why the rename is worth its own churn). H1, H2 and H5 stay
   reason-less, correctly, per the "defect on this thread" argument above —
   widening the union is not an obligation to give every throw a reason, only
   the ones a player caused.
2. **`src/ui/hud/projection.ts`** — replace `refusalMessageKey`'s
   reason-then-`actionId` nested `switch` with a flat
   `Record<HostRefusalReason, LocalizationKey>`, consulted first; the existing
   per-`actionId` switch stays, unchanged, as the fallback for an `undefined`
   reason (H1, H2, H5, and every chrome intent, exactly as today). Because the
   new lookup is total over a closed union, adding an eighth
   `HostRefusalReason` member fails the build until a `LocalizationKey` is
   named for it — the same property `REFUSAL_LABEL_KEYS` already gives the
   worker side, now given to the host side by the same mechanism rather than a
   parallel one.

`host-refusal.ts` stays import-free, exactly as its own docblock argues it
must (`host-refusal.ts:22-33`): the vocabulary lives there, the mapping to
`LocalizationKey` — which needs imports `host-refusal.ts` may not carry — stays
in `projection.ts`, where `refusalMessageKey` already lives.

**What this gets right that option 1 does not:** the compiler is the gate, not
a reviewer's memory. A future host refusal that wants to say something
specific adds a union member and immediately gets a build failure naming the
missing sentence, rather than a silently-generic message discovered by playing
the game — which is how #791 itself was found.

**What it does not solve, stated rather than implied:** this is a mechanism
for *reaching* a sentence, not a decision about *which* conditions deserve
one. A future host pre-check with a condition nobody has judged worth its own
words still correctly falls through to the generic key, exactly as H1, H2 and
H5 do today — the `Record` enforces that every reason that exists has a
sentence, not that every refusal must acquire a reason.

### Option 3 — producers write their own sentence directly

Instead of a reason travelling as data, `src/main.ts` resolves the final
translated string itself at the point of the throw — it already holds the
shared `Localizer` instance (imported at `main.ts:104-107`; instantiated at
`main.ts:1066`, "The page's one localizer.") —
and either throws that string for `reportError` to display verbatim, or calls
into the HUD's rendering state directly.

**Whether this violates the boundary AGENTS.md draws between simulation and
HUD, checked rather than assumed:** it does not, mechanically. The rule
`tests/unit/ui-hud-messages.test.ts:20-26,360-365` enforces — "the HUD must
never become a source of truth," policed by scanning `src/ui/hud/` and
`src/ui/primitives/` for a `/simulation/` import — has no jurisdiction over
`src/main.ts`, which is not under either directory and already imports
`src/simulation/**` freely as the composition root (e.g.
`TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` from `src/simulation/economy`, used at
`main.ts:2568,2779`). So the literal test this repository has for that
boundary would not fire on option 3, and asserting that it does would be the
"measurement is not a diagnosis" failure `docs/AGENT_WORKFLOW.md` §3 warns
against.

**The real cost is a different one, and it is concrete rather than
architectural taste.** `vitest.config.ts:5` sets `environment: 'node'`, and
`src/main.ts` touches `document` — the same fact `src/ui/affordability.ts:29-33`
already states as the reason `judgeAffordability` was extracted out of
`main.ts` in the first place: "that file is unreachable from `pnpm test` *at
all* — a mutation inside it survives because nothing can observe it." ADR
0087's own cost table says the identical thing about a sibling decision
(`docs/adr/0087-whether-a-refusal-is-an-event-or-a-condition.md`, "Host rows
(decision 4)" row: "the decision must be extracted into a pure function the
way `judgeAffordability` and `orderPrisonsForDisplay` were, or it is
untestable by construction"). Option 3 would put the *reason-to-sentence*
decision — the exact thing #791 is about getting wrong silently — inside the
one file in this whole pipeline that unit tests structurally cannot reach,
and that a mutation there survives for want of an observer is not a
hypothetical: it is this repository's own recorded failure mode
(`docs/AGENT_WORKFLOW.md` §3, "Code that touches `document`..."). Option 2
keeps that decision in `projection.ts`, which carries no DOM dependency and is
already exercised by `tests/unit/ui-hud-projection.test.ts`.

It also duplicates a call site `default-locale-en.ts:560-577` argues against
duplicating for a different reason: two places in the codebase already resolve
`t()` for refusal text — `hud.ts:1305`'s `reportError`, for a host refusal, and
`hud.ts:1355`'s `applySimulationRefusal`, for a worker one — and option 3 would
make it three, with `main.ts` resolving its own. `main.ts` would also need to
re-derive the "is this a chrome intent that already applied locally" judgement
`reportError` itself encodes (`hud.ts:1300-1302`, `messageKey !== undefined`)
in order to decide whether to say anything at all, which today is
knowledge the HUD layer holds by construction (`dispatchCommand` gates on the
control; `dispatchShell` never shows a line) rather than knowledge `main.ts`
would have to reconstruct.

**Verdict:** not recommended, on testability rather than on the boundary rule
#791's brief asked to be checked — which turns out not to apply here, stated
plainly rather than claimed.

### Option 4 — do nothing

Leave `HostRefusalReason` at one member. Costs nothing today and repeats
#791's investigation, one throw at a time, for every future host refusal that
turns out to need a specific sentence — which the owner's own framing names as
"several... already filed." Not recommended, for the reason the owner already
gave in #791.

## Recommendation

**Option 2.** It is the shape the owner's instruction described —
"decide how a host refusal conveys its reason to the player" as a mechanism,
not a per-case patch — and it is not a new invention: it is the exact pattern
`REFUSAL_LABEL_KEYS` and `PROTOCOL_FAULT_LABEL_KEYS` already prove out twice on
the other side of `sender.submit`, carried across the boundary those two
tables cannot cross (`src/ui/simulation-alerts.ts` may import `src/simulation/**`
freely; `src/ui/host-refusal.ts` and `src/ui/hud/projection.ts` may not).
Option 1 is cheaper and was explicitly rejected. Option 3 is not clearly
cheaper, is unreachable from `pnpm test`, and duplicates a call site the
codebase has already argued should not be duplicated.

## What it costs to implement

Priced against the tree at `main` @ `5aef4301` (v0.0.348).

| File | Change | Size | Risk |
| --- | --- | --- | --- |
| `src/ui/host-refusal.ts` | Widen `HostRefusalReason` from 1 to 3 members (`admit.no-accommodation`, `purchase.past-overdraft-floor`, `hire.past-overdraft-floor`); rewrite the docblock's "one member, and that is not an oversight" paragraph (`host-refusal.ts:48-56`) to state the real membership rule ("a reason belongs here once some sentence differs because of it and the condition is player-actionable, not a defect on this thread") | ~15 lines changed, no new imports | None — a type and a comment |
| `src/main.ts` | H3/H6 (`main.ts:2588-2590`, `:2783-2785`): rename `'past-the-overdraft-floor'` to the two namespaced members. H4 (`main.ts:2710`): change `throw new Error(...)` to `throw new HostRefusalError('admit.no-accommodation', message)`, keeping the existing diagnostic string as the `Error`'s message argument | 3 call sites, ~6 lines | Low — each site already has a passing test on the generic fallback; unreachable from `pnpm test` directly (DOM), so correctness of the *reason chosen* rests on review and the browser suite, exactly as it does today for H3/H6 |
| `src/ui/hud/projection.ts` | Replace `refusalMessageKey`'s reason-`switch` (`projection.ts:1116-1123`) with a `Record<HostRefusalReason, LocalizationKey>` lookup of the same three entries, falling back to the unchanged `actionId`-only switch (`projection.ts:1124-1146`) when the reason is absent or unmapped; rewrite the function's docblock (`projection.ts:1080-1115`) to state the new contract | ~30 lines net, in a file with no DOM dependency | Low — `tests/unit/ui-hud-projection.test.ts` already exercises this function directly |
| `src/ui/hud/messages.ts` | Add one `HUD_MESSAGE_KEY` member (`refusalAdmitPrisonerNoAccommodation` or similar) beside the existing eleven refusal keys (`messages.ts:1058-1130`); rename the two existing `...PastFloor` keys' *values* only if the namespacing choice above is taken literally (the key **names** in `messages.ts` need not change, only what `HostRefusalReason` string they are keyed from in `projection.ts`) | ~5 lines | None |
| `src/content/default-locale-en.ts` | **One new authored sentence**, under `hud.refusal.admit.no-accommodation` or an equivalent new key in the `hud.refusal.*` namespace (not the existing `hud.alert.refusal.admit.no-accommodation` — see "Why the existing key is the wrong destination"). **This is the owner's**, per `AGENTS.md`'s fourth exclusion; this document does not write it. The nearest already-shipped sentence, offered only as evidence a sentence of this shape is reachable and not as a proposal, is `default-locale-en.ts:433`'s "Nobody was admitted — there is no room to put a prisoner in yet." | 1 line, once authored | — |
| `tests/unit/ui-hud-projection.test.ts` | Six call sites in the `refusalMessageKey` describe block (`:1038`, `:1041`, `:1049-1050`, `:1067-1069`) reference the literal `'past-the-overdraft-floor'` and move to the two namespaced strings; one new case for `'admit.no-accommodation'` | ~10 lines changed, ~5 added | Low — mechanical rename plus one new assertion, run red-then-green per `docs/AGENT_WORKFLOW.md` §3 |
| `tests/unit/ui-hud-funds-threshold-named.test.ts` | References the *message key* names (`:85,87,156`), not the `HostRefusalReason` string values — unaffected if the `HUD_MESSAGE_KEY` constant names are kept stable while only their `HostRefusalReason` source is renamed | 0 lines expected, verify by running | None expected |

Total: three production files touched beyond the union's own file, one new
authored sentence (the owner's), and one existing test file with a mechanical
rename plus one new case. No wire format changes, no save format changes, no
new dependency, no `SAVE_SCHEMA_VERSION` bump — `HostRefusalReason` is a
main-thread-only value that never crosses `sender.submit` and never persists.

## Consequences

- `HostRefusalReason` becomes the same *kind* of vocabulary `RefusalReason`
  and `ProtocolFaultCode` already are: closed, namespaced by producer, and
  paired with a `Record` a missing sentence fails to compile against. Three
  closed unions in this codebase now share one design rather than two of them
  sharing it and the third being a plain `switch`.
- The next host refusal that wants a specific sentence — #791's brief names
  "several... already filed" — adds a union member and a `Record` entry and
  gets a compile error naming the missing key, rather than shipping silently
  generic and waiting to be found by playing the game.
- `host-refusal.ts` stays import-free and stays the file every layer can
  depend on without depending on each other, exactly as its own docblock
  argues it must.
- Nothing about when a refusal is shown, retired, or superseded changes —
  those are #780's and ADR 0087's questions, not this document's.
- The rename of the existing `'past-the-overdraft-floor'` member is a real,
  admitted cost of doing this properly rather than additively: it is not free,
  and it is priced above rather than glossed over.

## Weakest claim, and what would change my mind

**The weakest claim in this document is the size of the inventory.** Six
`throw` sites in `src/main.ts` were found by grep for `throw new Error(` and
`throw ` at the commit named throughout
(`main.ts:1060,2551,2588,2710,2769,2783`), and each was opened and read. A
seventh site added on a branch this pass could not see would not change the
argument — the argument is about the *shape* of the fix, and one more instance
of a defect-shaped or player-actionable throw is still one of the two kinds
this document already sorts — but it would falsify the count. What would
change my mind about the count specifically: a `grep -n "throw " src/main.ts`
on a later `main` returning a seventh match this document's table does not
account for.

**Second weakest: that H2 and H5 are correctly reason-less rather than
under-served.** This document classifies "unknown item id" and "unknown staff
role" as defects on this thread rather than player-actionable conditions,
reasoning by analogy to `host-refusal.ts:52-55`'s treatment of a malformed
charge. Nothing measures whether a player can actually reach either state
through the interface as shipped — if the Build panel or the hiring panel can
somehow submit an id the catalogue does not carry, through a route this
document did not trace, then H2 or H5 would belong in the widened union too,
and the recommendation's shape is unaffected but its "three members" figure
would grow by one. What would change my mind: a control in `src/ui/` that can
dispatch `purchase-materials` or `hire-staff` with an id absent from
`procurableMaterial` or the staff-role catalogue.

**Third: the exact membership and naming of the widened union is this
document's best judgment, not a measurement.** `'admit.no-accommodation'`,
`'purchase.past-overdraft-floor'` and `'hire.past-overdraft-floor'` mirror
`RefusalReason`'s existing namespacing convention for legibility and for the
reason given in "What it costs" — a flat `Record` needs one key per fact, not
per fact-and-control pair — but the owner may prefer different names, or may
judge the rename of the existing shared member not worth its churn and prefer
a hybrid where the new member is namespaced and the two money members keep
their current shared name inside a `Record` that maps `('past-the-overdraft-floor', actionId)`
pairs rather than a flat `HostRefusalReason` alone. That hybrid was considered
and set aside because it keeps two mechanisms live in one function rather than
one, which is the exact fragmentation this document exists to remove — but it
is a legitimate cheaper variant of option 2 and is named here rather than
silently ruled out.
