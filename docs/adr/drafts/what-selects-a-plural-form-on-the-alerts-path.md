# ADR draft: what selects a plural form on the alerts path

> **This draft deliberately carries no number.** ADR numbers are assigned
> centrally after drafts return (`AGENTS.md`), and this one pre-commits to
> being renumbered without argument, along with every citation of it added by
> the same branch. Today there is exactly one — `src/ui/hud/label-parameters.ts`
> names this file by path rather than by number for that reason.
> `grep -rn "what-selects-a-plural-form-on-the-alerts-path" src/ docs/ tests/`
> is the list, so a second citation added later cannot be missed by reading
> this sentence.

## Status

**Proposed.** The decision it records is implemented on the branch that carries
it, because the stage it answers cannot be implemented without taking it: the
two alert sentences whose English disagreed with their own number could not be
given plural forms until something on their render path selected between those
forms.

## Context

[ADR 0011](../0011-localization-architecture.md) decided that plurals are
selected with `Intl.PluralRules` on the locale that actually resolved the
message, never with `count === 1`. `selectPluralForm` in
`src/services/localization/format.ts` has implemented that correctly since, and
`Localizer.formatPlural` exposes it. A later change added the authoring shapes
— `LocalizationPluralForms` and `LocalizationEntry` in
`src/content/localization.ts` — and `HudLocalizer.formatPlural`, so a HUD
surface can ask for a form.

What remained was that the alerts list and the event band could not ask. Both
painted their sentence the same way:

```
t(label.labelKey, resolveHudLabelParameters(t, label))
```

`t` is `Localizer.format`. Handed a plural entry, `format` reads `other` and
stops. So a key given `one`/`few`/`many` on this path would have carried forms
that nothing ever selected between: the catalogue would look migrated, the
screen would not change, and the only signal would be Polish that is wrong at
2, 3, 4, 22 and so on while a test suite stayed green.

Two keys sit behind that. `hud.alert.event.incidents.riot-opened` rendered
*"1 prisoners have stopped taking orders"* for a single participant, and
`hud.alert.event.prisoners.discharged` rendered *"their sentences are served"*
for a single prisoner. Both are reachable: the riot schema and the discharge
schema each admit `min(1)` on the wire.

## The question

**When a HUD label is painted, what decides whether it is looked up with
`format` or with `formatPlural`, and what number is the selector?**

## Decision

**A new pure function, `renderHudLabel`, owns the choice, and the parameter
named `count` is the selector.** It resolves the label's parameters exactly as
before, then:

- if the resolved parameters carry a finite `number` under the name `count`,
  the sentence is looked up with `formatPlural(key, count, parameters)`;
- otherwise it is looked up with `format(key, parameters)`.

Both the alerts list (`src/ui/hud/alert-row-label.ts`) and the event band
(`src/ui/hud/hud.ts`) call it. `hudAlertRowLabel` takes a small structural port
— `HudLabelLocalizer`, with `format` and `formatPlural` — rather than a bare
`t`, because it now needs both. The two fragments it appends after the
sentence, the occurrences multiplier and the timestamp, keep calling `format`
deliberately.

### Why `count`, by name

The convention is not invented here. ICU MessageFormat, i18next and Fluent all
select on a parameter of that name; `Localizer.formatPlural` already injects
`count` into every template it renders, so a form that spells the number reads
the same placeholder either way; and every counted message already in this
tree uses it. A key that wants plural selection therefore needs no registry
entry, no flag on the view model and no second parameter — it names its number
`count`, which it already did.

### Why it is safe for the thirty-one keys that do not migrate

A flat string is its own `other` form under `Localizer.formatPlural`. So every
key that keeps a flat value renders the byte-identical sentence, from the
byte-identical parameters, whether it goes down the `format` path or the
`formatPlural` one. Switching the path is not a rendering change for them.

### Why a message-valued `count` does not select

`resolveHudLabelParameters` substitutes a localized string for every name
listed in `labelParameterMessages`, so a label could in principle carry a
`count` that is text rather than a number. The `typeof` test rejects it and the
label takes the `format` path. Nothing in `src/` produces one today; the rule
is written down so the outcome is decided rather than discovered.

## Alternatives weighed

**Give `HudLocalizer` a single `format` that detects a plural entry itself.**
Rejected. It makes every one of the tree's formatting call sites plural-aware
by accident, including ones whose `count` is a multiplier rather than a
quantity (`hud.alert.occurrences`, `{count}×`), and it moves a decision about
HUD copy into the localization service, which ADR 0011 keeps free of
UI-specific behaviour.

**Mark the plural keys in a registry the HUD consults.** Rejected. It is a
second list to keep in step with the catalogue, and the catalogue already
states the fact: an entry either has forms or does not. A registry could only
disagree with it.

**Pass an explicit `pluralCount` on the view model.** Rejected. Every producer
of an alert view model would have to set it, the value would duplicate a
parameter already present, and the two could drift. The parameter that is
already the number is the number.

## Consequences

- Two keys migrate on this branch; the remaining thirty-one counted messages
  stay flat, each because nothing in either shipped locale agrees with their
  number. The list and the reasons are pinned in
  `tests/foundation/second-locale-contract.test.ts`.
- A future key can be migrated by editing two catalogues and removing one line
  from that list. No UI change is needed again.
- `hudAlertRowLabel`'s first argument is a port rather than a function, so its
  unit test's spy records which of the two lookups a row asked for.
