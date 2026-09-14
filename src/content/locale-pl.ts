import { type LocalizationCatalog, buildLocalizationCatalog } from './localization';

/**
 * The Polish (`pl`) content-side catalogue: the second locale this project
 * authors, and the counterpart of `default-locale-en.ts` (#661, ADR 0011).
 *
 * ## What this file is, and what it deliberately is not
 *
 * It is **partial on purpose and partial for ever**. `buildLocaleFallbackChain`
 * walks the chain per key, so a key absent here falls back to English message
 * by message rather than abandoning the locale -- which makes a half-authored
 * Polish catalogue a valid shipping state and makes *quality per key* worth
 * more than coverage. A key this file omits is a key nobody was confident
 * about; `docs/research/2026-09-14-the-polish-catalogue.md` lists them with the
 * reason, and adding one later is a catalogue change and nothing else.
 *
 * It is **not** the delivery half. Nothing here registers a chunk, a loader or
 * a language picker -- that is #662 and #663. A translated catalogue nobody can
 * select is still worth having in the tree; a picker with nothing to select is
 * not.
 *
 * It carries **no plural forms**, and that is a finding rather than an
 * omission. `buildLocalizationCatalog` takes
 * `Readonly<Record<LocalizationKey, string>>` (`localization.ts:20-24`), so a
 * `PluralForms` object does not typecheck in a content catalogue at all -- in
 * `pl` or in `en`. Worse, `Localizer.format` reads `entry.value.other` for a
 * plural entry (`src/services/localization/localizer.ts:74`) and the HUD's own
 * `HudLocalizer` exposes `format` and not `formatPlural`
 * (`src/ui/hud/view-model.ts`), so a plural form authored today would render
 * its `other` text for every count, silently. In Polish `other` is the
 * *fraction* category -- `Intl.PluralRules('pl')` puts 2, 3, 4 in `few` and 5+
 * in `many` -- so that would be the wrong form for every whole number a player
 * ever sees. **Every counted message below is therefore written to be correct
 * at every count with no plural forms at all**, which is the same discipline
 * `hud.security.coverage-short-hint` already applies in English.
 *
 * ## The rules this catalogue follows
 *
 * 1. **Sentence case.** English title-cases content names (*Wood Plank*, *High
 *    Security*); Polish does not capitalise common nouns mid-phrase. The
 *    `save.scope.*` items are lower-case throughout, because they are spliced
 *    into the middle of a sentence.
 * 2. **The impersonal `-no`/`-to` past for anything that happened.**
 *    *Zwolniono*, *nie przyjęto*, *nie postawiono*. It has no subject and no
 *    gender, which is what lets the refusal and fault families be translated
 *    without reshaping a single sentence -- and it is the register a Polish
 *    institution actually writes in. There is no gender model anywhere in the
 *    simulation (`src/simulation/identity/name-pool.ts:35`) and the name pool
 *    mixes *Adan* with *Wanda* in one flat list, so a Polish past-tense verb
 *    with a person as its subject cannot be inflected correctly. This device is
 *    how that is avoided rather than papered over.
 * 3. **A parameter goes after a colon, a middle dot, or `x`, or it is the
 *    subject.** Those are the positions where Polish leaves a nominative alone.
 *    Every reshaped sentence here is an application of that one rule, and
 *    no grammatical-case machinery is added to the localiser -- #661 forbids
 *    it and it turns out not to be needed.
 * 4. **Adjective families agree with the noun the panel puts on screen**, and
 *    the group's comment names that noun: `risk-tier.*` with *ryzyko*,
 *    `job-state.*` with *zadanie*, `build-order-state.*` with *zlecenie*,
 *    `door-state.*` with *drzwi*, `worker-state.*` with *symulacja*.
 * 5. **Informal second person** (*ty*), where English addresses the player at
 *    all. The owner's own identity delivery names four direct verbs in exactly
 *    that form -- *Wybierz, Sprawdź, Zaplanuj, Zapisz*
 *    (`docs/design/2026-09-13-identity-v5/DOKUMENTACJA/projekt.md:103`).
 *
 * ## *Osadzony* or *więzień*: the owner ruled, and the ruling is a criterion
 *
 * On 2026-08-30 the owner ruled the mixed register: ***osadzony* in official
 * labels -- rosters, statuses, refusals -- and *więzień* in event text and
 * flavour.** `docs/research/2026-08-30-which-word-for-a-prisoner.md` turns that
 * into a criterion a future key can be decided by rather than a word list, and
 * the seam it rides on is one this repository already draws and tests:
 * `simulation-message-keys.ts` documents its enum labels as *"dense panel
 * labels, not prose"*, and `src/ui/simulation-events.ts` gives narrated events
 * a row prefix of their own beside the refusal and fault paths. Every key
 * derived by `simulationEnumMessages()` is a label by construction and takes
 * *osadzony*.
 */
const plMessages: Readonly<Record<string, string>> = {
  // ---------------------------------------------------------------------
  // Room types -- `room.*.name`. The Rooms panel's catalogue rows, and the
  // `{room}` parameter of several sentences.
  // ---------------------------------------------------------------------
  'room.cell.name': 'Cela',
  'room.holding-cell.name': 'Cela przejściowa',
  'room.solitary-cell.name': 'Cela izolacyjna',
  // "Punkt przyjęć" rather than the bare "Przyjęcia": this is the room, and
  // `hud.intake.title` is the process. English distinguishes them by context
  // ("Reception" against "Intake") and Polish would collide on one word.
  'room.reception.name': 'Punkt przyjęć',
  'room.kitchen.name': 'Kuchnia',
  'room.canteen.name': 'Stołówka',
  'room.shower-room.name': 'Łaźnia',
  'room.laundry.name': 'Pralnia',
  // Institutional register rather than the wing's own word. *Spacerniak* is
  // authentic prison slang and livelier, and it is not what a room-type label
  // in the institution's own catalogue of rooms would say -- which is the seam
  // the owner's 2026-08-30 ruling drew for *osadzony* over *więzień*.
  'room.yard.name': 'Plac spacerowy',
  'room.common-room.name': 'Świetlica',
  'room.classroom.name': 'Sala lekcyjna',
  'room.infirmary.name': 'Ambulatorium',
  'room.security-office.name': 'Dyżurka ochrony',
  'room.staff-room.name': 'Pokój socjalny',
  'room.storage-room.name': 'Magazyn',
  'room.delivery-bay.name': 'Rampa dostawcza',
  'room.garbage-room.name': 'Śmietnik',
  'room.utility-room.name': 'Pomieszczenie techniczne',

  // ---------------------------------------------------------------------
  // Objects -- `object.*.name`. Build panel catalogue rows, and the
  // `{object}` parameter of three Rooms-panel sentences.
  // ---------------------------------------------------------------------
  'object.bed.name': 'Łóżko',
  'object.medical-bed.name': 'Łóżko szpitalne',
  'object.toilet.name': 'Toaleta',
  'object.sink.name': 'Umywalka',
  // Polish names the fixture, not the part: "głowica prysznicowa" is a
  // plumbing-catalogue component and nobody calls a shower that.
  'object.shower-head.name': 'Prysznic',
  'object.washing-machine.name': 'Pralka',
  'object.desk.name': 'Biurko',
  'object.chair.name': 'Krzesło',
  'object.stove.name': 'Kuchenka',
  'object.prep-counter.name': 'Blat roboczy',
  'object.fridge.name': 'Lodówka',
  'object.dining-table.name': 'Stół jadalny',
  'object.bench.name': 'Ławka',
  'object.bookshelf.name': 'Regał na książki',
  'object.medicine-cabinet.name': 'Szafka na leki',
  'object.security-console.name': 'Pulpit ochrony',
  'object.storage-rack.name': 'Regał magazynowy',
  'object.loading-dock-door.name': 'Brama rozładunkowa',
  'object.waste-bin.name': 'Kosz na odpady',
  'object.utility-panel.name': 'Panel techniczny',

  // ---------------------------------------------------------------------
  // Object categories. Two key families over the same seven ids --
  // `object.category.<id>.name` is authored and has the consumer,
  // `object-category.<id>.name` is derived -- and
  // `tests/foundation/content-vocabulary-contract.test.ts` fails on a pair
  // that diverges. One Polish string per id, written twice, for the same
  // reason the English is.
  //
  // English chose "Plumbing" over "Sanitation" and "Catering" over "Food
  // Service" deliberately, naming what a player is hunting for rather than
  // the domain; *Hydraulika* and *Gastronomia* keep that choice. "Sprzęt
  // medyczny" rather than the bare adjective *Medyczne*, because the other
  // six options are nouns and a lone adjective reads as an unfinished phrase
  // in a Polish option list.
  // ---------------------------------------------------------------------
  'object.category.furniture.name': 'Meble',
  'object.category.sanitation.name': 'Hydraulika',
  'object.category.food-service.name': 'Gastronomia',
  'object.category.security.name': 'Ochrona',
  'object.category.storage.name': 'Magazyn',
  'object.category.utility.name': 'Instalacje',
  'object.category.medical.name': 'Sprzęt medyczny',
  'object-category.furniture.name': 'Meble',
  'object-category.sanitation.name': 'Hydraulika',
  'object-category.food-service.name': 'Gastronomia',
  'object-category.security.name': 'Ochrona',
  'object-category.storage.name': 'Magazyn',
  'object-category.utility.name': 'Instalacje',
  'object-category.medical.name': 'Sprzęt medyczny',

  // ---------------------------------------------------------------------
  // Staff roles -- `staff-role.*.name`. Also the `{role}` parameter of
  // `hud.security.hire`.
  //
  // Every one is masculine, and that is a choice rather than an oversight:
  // Polish has no genderless job title, there is no gender model in the
  // simulation to select on, and the masculine generic is what an
  // institution's own roster uses. *Pielęgniarka* is the commoner word and is
  // feminine; *Pielęgniarz* is chosen so the eight rows are one register.
  // "Kucharz" rather than *Personel kuchni* because the control hires one
  // person, which is what the row does whatever the English collective says.
  // ---------------------------------------------------------------------
  'staff-role.warden.name': 'Naczelnik',
  'staff-role.administrator.name': 'Administrator',
  'staff-role.guard.name': 'Strażnik',
  'staff-role.security-chief.name': 'Szef ochrony',
  'staff-role.nurse.name': 'Pielęgniarz',
  'staff-role.doctor.name': 'Lekarz',
  'staff-role.maintenance-worker.name': 'Konserwator',
  'staff-role.kitchen-staff.name': 'Kucharz',

  // ---------------------------------------------------------------------
  // Items -- `item.*.name`. The `{material}` parameter of the buy and sell
  // controls and of the delivery rows.
  // ---------------------------------------------------------------------
  'item.brick.name': 'Cegła',
  'item.wood-plank.name': 'Deska',
  'item.food-ration.name': 'Racja żywnościowa',
  'item.dirty-linen.name': 'Brudna pościel',
  'item.clean-linen.name': 'Czysta pościel',
  'item.waste.name': 'Odpady',

  // ---------------------------------------------------------------------
  // Contraband types -- `contraband.*.name`.
  // ---------------------------------------------------------------------
  'contraband.weapon.name': 'Broń',
  'contraband.drug.name': 'Narkotyki',
  'contraband.phone.name': 'Telefon',
  'contraband.currency.name': 'Gotówka',
  'contraband.tool.name': 'Narzędzie',

  // ---------------------------------------------------------------------
  // Security grades -- `grade.*.name`.
  //
  // The adjectives are masculine, agreeing with an implied *poziom* or
  // *stopień*, and that is an assumption rather than a reading: `grade.`
  // appears in no `src/ui/` file, so nothing on screen says what noun these
  // modify. If a panel ever renders them beside *kategoria* or *strefa* (both
  // feminine) all five change ending. "Tylko personel" is a noun phrase
  // because *Tylko personelowy* is not Polish.
  // ---------------------------------------------------------------------
  'grade.general.name': 'Ogólny',
  'grade.medical.name': 'Medyczny',
  'grade.high-security.name': 'Ściśle strzeżony',
  'grade.staff-only.name': 'Tylko personel',
  'grade.administrative.name': 'Administracyjny',

  // =====================================================================
  // Derived simulation enumerations.
  //
  // These keys have no definition object: `simulationEnumMessages()` computes
  // each from its id, and the English label is authored in
  // `SIMULATION_ENUM_GROUPS.labels`. The Polish is therefore authored here per
  // key rather than derived, which is the only place it can live -- and it
  // means a new enum member arrives with an English label and no Polish one,
  // falls back per key, and costs nothing until somebody adds a row.
  //
  // `simulation-message-keys.ts` documents the whole family as *"short,
  // neutral, HUD-appropriate: these are dense panel labels, not prose"*, which
  // puts every one of them on the *osadzony* side of the owner's 2026-08-30
  // ruling by construction.
  // =====================================================================

  // Actors. `actor-kind.prisoner` is a label, so *Osadzony* (the ruling).
  'actor-kind.prisoner.name': 'Osadzony',
  'actor-kind.staff.name': 'Personel',

  // Needs.
  'need.hunger.name': 'Głód',
  'need.sleep.name': 'Sen',
  'need.hygiene.name': 'Higiena',
  'need.bladder.name': 'Pęcherz',
  'need.safety.name': 'Bezpieczeństwo',
  'need.recreation.name': 'Rekreacja',

  // Action categories -- what the timetable allows. `free-association` is
  // *Czas wolny*; the action of the same name shortens the other way round
  // (see `action.free-association` below), exactly as English shortens "Free
  // Association" to "Association".
  'action-category.sleep.name': 'Sen',
  'action-category.meal.name': 'Posiłek',
  'action-category.work.name': 'Praca',
  'action-category.recreation.name': 'Rekreacja',
  'action-category.education.name': 'Nauka',
  'action-category.hygiene.name': 'Higiena',
  'action-category.free-association.name': 'Czas wolny',

  // Actions -- what somebody is doing. Verbal nouns rather than present-tense
  // verbs (*Śpi*, *Je*), which would have been livelier and are genderless
  // too: `hud.regime.roster-heading` wraps this value as `W drodze:
  // {activity}`, and a wrapper of that shape cannot take a verb. The cost is
  // recorded rather than hidden; letting the two forms differ would need a
  // second key and a call-site change.
  'action.sleep.name': 'Spanie',
  'action.eat-meal.name': 'Jedzenie',
  'action.eat-in-cell.name': 'Jedzenie w celi',
  'action.use-toilet.name': 'Toaleta',
  'action.shower.name': 'Kąpiel',
  'action.yard-recreation.name': 'Spacer',
  'action.common-room-recreation.name': 'Świetlica',
  'action.classroom-education.name': 'Zajęcia',
  'action.free-association.name': 'Wspólny czas',
  'action.laundry-work.name': 'Praca w pralni',
  'action.kitchen-work.name': 'Praca w kuchni',
  // "Errand" names the shift rather than the phase -- the English comment
  // rejects "Carrying" for exactly that reason, because `action-phase` already
  // labels the phases. *Transport* keeps that distinction: the phases below
  // read *W drodze* and *W trakcie*, so nothing here collides with them.
  // *Praca przy transporcie* would parallel the two `Praca w ...` rows more
  // closely and is twenty characters in a roster cell; the shorter noun is
  // chosen for that reason and the alternative is recorded here.
  'action.carry.name': 'Transport',

  // Action phases. Nouns, never adjectives: these stand beside the verbal
  // nouns above in the same roster column and must not carry a gender.
  'action-phase.idle.name': 'Bezczynność',
  'action-phase.travelling.name': 'W drodze',
  'action-phase.performing.name': 'W trakcie',

  // Intake pipeline stages. "Zakończone" rather than *Przyjęty*, which is a
  // masculine participle describing the person; the stage is neuter and
  // describes the stage.
  'intake-stage.queued.name': 'W kolejce',
  'intake-stage.reception.name': 'Przyjęcie',
  'intake-stage.classification.name': 'Klasyfikacja',
  'intake-stage.accommodation-assignment.name': 'Przydział celi',
  'intake-stage.completed.name': 'Zakończone',
  'intake-stage.failed.name': 'Nieudane',

  // Classification. `risk-tier.*` agrees with *ryzyko* (neuter), which is the
  // noun `classification-group.high-risk` puts on screen beside it.
  'classification-group.general-population.name': 'Populacja ogólna',
  'classification-group.high-risk.name': 'Podwyższone ryzyko',
  'risk-tier.0.name': 'Minimalne',
  'risk-tier.1.name': 'Niskie',
  'risk-tier.2.name': 'Średnie',
  'risk-tier.3.name': 'Wysokie',

  // Incidents. "Bez reakcji" for `lapsed`: the English means a deadline that
  // passed unanswered, and *Przedawnione* -- the literal rendering -- is a
  // legal term in Polish that means something else.
  'incident-type.assault.name': 'Napaść',
  'incident-type.escape-attempt.name': 'Próba ucieczki',
  'incident-type.riot.name': 'Bunt',
  'incident-type.gang-retaliation.name': 'Porachunki gangów',
  'incident-state.active.name': 'Aktywne',
  'incident-state.notified.name': 'Zgłoszone',
  'incident-state.responding.name': 'Reakcja w toku',
  'incident-state.resolved.name': 'Rozwiązane',
  'incident-state.lapsed.name': 'Bez reakcji',

  // Guard deployment and what holds a guard.
  'deployment-phase.unassigned.name': 'Bez przydziału',
  'deployment-phase.travelling.name': 'W drodze',
  'deployment-phase.on-post.name': 'Na posterunku',
  'deployment-phase.on-search.name': 'Na przeszukaniu',
  'deployment-phase.returning.name': 'Powrót',
  'guard-claim.deployment.name': 'Posterunek w sektorze',
  'guard-claim.incident-response.name': 'Reakcja na incydent',
  'guard-claim.search.name': 'Przeszukanie',
  // Says "nothing holds this guard", as the English deliberately does.
  'guard-claim.unattributed.name': 'Bez przypisania',

  // Sectors. The three agree with *sektor* (masculine). "Zablokowany" rather
  // than the noun *Blokada*, because the other two are adjectives.
  'sector-control-state.normal.name': 'Normalny',
  'sector-control-state.restricted.name': 'Ograniczony',
  'sector-control-state.lockdown.name': 'Zablokowany',

  // Doors. *Drzwi* is plural-only in Polish, so all three door states take the
  // plural non-masculine-personal form.
  'door-state.open.name': 'Otwarte',
  'door-state.closed.name': 'Zamknięte',
  'door-state.locked.name': 'Zaryglowane',
  // `door-side` labels a tile *edge* from the navigation side --
  // `simulation-message-keys.ts` says the group names the same geometry as
  // `build-edge` "under its own storage names (`top`, `left`)", and the
  // storage is `SparseWorld`'s `topEdge`/`leftEdge` layers. The Polish for
  // that noun is *krawędź*, feminine, which is what these two agree with.
  'door-side.left.name': 'Lewa',
  'door-side.top.name': 'Górna',
  'door-access-denial.locked.name': 'Zaryglowane',
  'door-access-denial.insufficient-clearance.name': 'Za niskie uprawnienia',
  'door-access-denial.missing-permission.name': 'Brak zezwolenia',

  // Routing failures.
  'route-failure.invalid-origin.name': 'Błędny start',
  'route-failure.invalid-destination.name': 'Błędny cel',
  'route-failure.unreachable.name': 'Nieosiągalne',
  'route-failure.permission-denied.name': 'Brak dostępu',

  // Worker lifecycle. The six agree with *symulacja* (feminine), which is the
  // noun `hud.unavailable.simulation` puts on screen.
  'worker-state.uninitialized.name': 'Nieuruchomiona',
  'worker-state.ready.name': 'Gotowa',
  'worker-state.running.name': 'Działa',
  'worker-state.paused.name': 'Wstrzymana',
  'worker-state.shutting-down.name': 'Zamykanie',
  'worker-state.faulted.name': 'Awaria',

  // Searches and contraband. `contraband-state.*` agrees with *kontrabanda*
  // (feminine). *Kontrabanda* rather than *Przedmioty niedozwolone*: the
  // latter is the fuller penitentiary phrase, is twenty-three characters in a
  // status chip, and would flip all three state adjectives to the plural.
  'search-scope.person.name': 'Osoba',
  'search-scope.cell.name': 'Cela',
  'search-scope.sector.name': 'Sektor',
  'search-scope.delivery.name': 'Dostawa',
  'search-order-state.queued.name': 'W kolejce',
  'search-order-state.travelling.name': 'W drodze',
  'search-order-state.searching.name': 'Przeszukiwanie',
  'contraband-holder-kind.prisoner.name': 'Osadzony',
  'contraband-holder-kind.staff.name': 'Personel',
  'contraband-holder-kind.cell.name': 'Cela',
  'contraband-holder-kind.container.name': 'Pojemnik',
  'contraband-source.delivery.name': 'Dostawa',
  // *Widzenie* is the Polish penitentiary term of art for a prison visit.
  'contraband-source.visit.name': 'Widzenie',
  'contraband-source.staff.name': 'Personel',
  'contraband-source.prisoner.name': 'Osadzony',
  'contraband-source.room-object.name': 'Wyposażenie pomieszczenia',
  'contraband-state.concealed.name': 'Ukryta',
  'contraband-state.confiscated.name': 'Skonfiskowana',
  'contraband-state.departed.name': 'Wyniesiona przez posiadacza',
  'contraband-legal-context.illicit.name': 'Nielegalne',
  'contraband-legal-context.restricted.name': 'Ograniczone',
  'contraband-legal-context.controlled.name': 'Kontrolowane',

  // Intelligence.
  'intelligence-target.prisoner.name': 'Osadzony',
  'intelligence-target.staff.name': 'Personel',
  'intelligence-target.cell.name': 'Cela',
  'intelligence-target.sector.name': 'Sektor',
  'intelligence-source.informant.name': 'Informator',
  'intelligence-source.observation.name': 'Obserwacja',
  'intelligence-source.search-residue.name': 'Ślad po przeszukaniu',
  'informant-holder-kind.prisoner.name': 'Osadzony',
  'informant-holder-kind.staff.name': 'Personel',

  // Jobs. The eight agree with *zadanie* (neuter).
  'job-state.available.name': 'Dostępne',
  'job-state.reserved.name': 'Zarezerwowane',
  'job-state.assigned.name': 'Przydzielone',
  'job-state.travelling.name': 'W drodze',
  'job-state.performing.name': 'W trakcie',
  'job-state.completed.name': 'Ukończone',
  'job-state.failed.name': 'Nieudane',
  'job-state.cancelled.name': 'Anulowane',
  'carry-leg.pickup.name': 'Odbiór',
  'carry-leg.dropoff.name': 'Dostarczenie',

  // Build orders. The eight agree with *zlecenie* (neuter). English chose
  // "Awaiting the Crew" over "Assigned" deliberately, naming what the order is
  // waiting for; *Czeka na ekipę* keeps that.
  'build-order-state.planned.name': 'Zaplanowane',
  'build-order-state.approved.name': 'Zatwierdzone',
  'build-order-state.materials-pending.name': 'Czeka na materiały',
  'build-order-state.assigned.name': 'Czeka na ekipę',
  'build-order-state.in-progress.name': 'W trakcie',
  'build-order-state.completed.name': 'Ukończone',
  'build-order-state.cancelled.name': 'Anulowane',
  'build-order-state.failed.name': 'Nieudane',
  'buildable-category.wall.name': 'Ściana',
  'buildable-category.object.name': 'Obiekt',
  'buildable-category.utility.name': 'Instalacja',
  // Substituted after `x` and after a middle dot, both of which leave a
  // nominative alone.
  'build-edge.north.name': 'Północ',
  'build-edge.west.name': 'Zachód',

  // Utilities and world chunks.
  'utility-type.electricity.name': 'Prąd',
  'utility-type.water.name': 'Woda',
  'utility-node-kind.producer.name': 'Źródło',
  'utility-node-kind.consumer.name': 'Odbiornik',
  'utility-node-state.powered.name': 'Zasilany',
  'utility-node-state.disabled-no-supply.name': 'Brak zasilania',
  'utility-node-state.disabled-failure.name': 'Awaria',
  'chunk-lifecycle.metadata-only.name': 'Niewczytany',
  'chunk-lifecycle.loaded.name': 'Wczytany',

  // Room requirements and their status.
  'room-requirement.enclosed.name': 'Zamknięcie',
  'room-requirement.outdoors.name': 'Na zewnątrz',
  'room-requirement.minimum-size.name': 'Minimalny rozmiar',
  'room-requirement.object.name': 'Wymagany obiekt',
  'room-requirement-status.satisfied-by-capability.name': 'Spełnione',
  'room-requirement-status.missing-capability.name': 'Brakuje',
  'room-requirement-status.not-evaluated.name': 'Nieocenione',

  // Categories the projections group content by. "Opieka medyczna" and
  // "Służba zdrowia" rather than bare adjectives, for the reason
  // `object.category.medical` gives.
  'room-category.housing.name': 'Zakwaterowanie',
  'room-category.security.name': 'Ochrona',
  'room-category.operations.name': 'Operacje',
  'room-category.food.name': 'Wyżywienie',
  'room-category.hygiene.name': 'Higiena',
  'room-category.recreation.name': 'Rekreacja',
  'room-category.education.name': 'Edukacja',
  'room-category.medical.name': 'Opieka medyczna',
  'room-category.administration.name': 'Administracja',
  'room-category.logistics.name': 'Logistyka',
  'room-category.utility.name': 'Instalacje',
  'item-category.construction-material.name': 'Materiał budowlany',
  'item-category.food.name': 'Żywność',
  'item-category.linen.name': 'Pościel',
  'item-category.waste.name': 'Odpady',
  'staff-department.administration.name': 'Administracja',
  'staff-department.security.name': 'Ochrona',
  'staff-department.medical.name': 'Służba zdrowia',
  'staff-department.operations.name': 'Operacje',

  // =====================================================================
  // The HUD shell: status strip, clock, tabs, minimap, alert band.
  // =====================================================================
  'hud.status.title': 'Stan więzienia',
  // Label, so *Osadzeni* under the owner's ruling.
  'hud.status.prisoners': 'Osadzeni',
  // *bez* takes the genitive singular and never changes with the count, so
  // this one counted message needs no reshape at all.
  'hud.status.prisoners-without-bed': '{count} bez łóżka',
  'hud.status.staff': 'Personel',
  'hud.status.rooms': 'Pomieszczenia',
  // Reshaped. "{count} niegotowych" is right for 5 and wrong for 2 (*2
  // niegotowe*); the label-then-value form agrees with nothing.
  'hud.status.rooms-not-ready': 'niegotowe: {count}',
  'hud.status.incidents': 'Incydenty',
  'hud.status.coverage': 'Obsada',
  'hud.status.contraband': 'Kontrabanda',
  'hud.status.funds': 'Środki',
  'hud.status.funds-remaining': 'Zostało {remaining}',
  'hud.status.funds-before-deliveries-stop':
    'Do wstrzymania dostaw zostało {remaining} — poniżej tego progu nie można zamówić materiałów, dopóki więzienie nie zarobi. Państwo płaci na koniec każdego dnia, za osadzonych, którzy mają łóżko.',
  'hud.status.funds-deliveries-stopped':
    'Dostawy wstrzymane — nie można zamówić materiałów, dopóki więzienie nie zarobi. Państwo płaci na koniec każdego dnia, za osadzonych, którzy mają łóżko.',
  'hud.status.funds-treasury-floor-exhausted':
    'Skarbiec jest na dnie — niczego nie można wydać, dopóki więzienie nie zarobi. Państwo płaci na koniec każdego dnia i tylko za osadzonych, którzy mają łóżko, więc więzienie, w którym nikt nie mieszka, nie zarabia nic.',
  'hud.status.earned-today': 'Zarobione dziś',
  'hud.status.occupancy': 'Zajętość cel',
  'hud.status.occupancy-value': '{value} z {capacity}',
  'hud.status.incidents-clear': 'Spokój',
  'hud.status.incidents-active': 'Aktywne',

  'hud.clock.title': 'Sterowanie czasem',
  'hud.clock.day-progress': 'Postęp dnia',
  'hud.clock.day': 'Dzień',
  'hud.clock.speed': 'Prędkość {speed}×',
  'hud.clock.paused': 'PAUZA',
  'hud.transport.pause': 'Pauza',
  'hud.transport.play': 'Odtwarzaj z normalną prędkością',
  'hud.transport.fast-forward': 'Przyspiesz',
  'hud.zoom.title': 'Powiększenie',
  'hud.zoom.in': 'Przybliż',
  'hud.zoom.out': 'Oddal',

  'hud.tabs.title': 'Sekcje więzienia',
  /*
   * The five section names, moved on 2026-09-14 to the 2026-09-13 delivery's
   * own five (ADR 0112 decision 3). Here the delivery IS the Polish, so these
   * five are quoted from its navigation table
   * (`docs/design/2026-09-13-identity-v5/DOKUMENTACJA/projekt.md:66-72`)
   * rather than translated from the English: Przegląd / Buduj / Strefy /
   * Zarządzaj / Plan dnia.
   *
   * `hud.tab.build` moves from *Budowa* (a noun) to the delivery's *Buduj* (an
   * imperative), which is the same six characters and the same section.
   *
   * **The measurement this catalogue recorded as owed is now settled, in the
   * direction it hoped for, and the paragraph that owed it is kept below.**
   * It argued that *Pomieszczenia* was the honest word for a panel of rooms
   * even at thirteen characters, and that *Strefy* was a width-driven choice
   * it would rather be overruled on. The overruling did not come from a width
   * budget: the section itself is now Strefy, in the owner's delivery, so the
   * six-character word is the honest one and the thirteen-character one would
   * now be naming the panel inside the section rather than the section. The
   * inherited ADR 0022 figures it was owed against -- 2.2px of clipping on
   * *Overview*, 10.3px of overlap on *Security* -- describe a label that no
   * longer exists, and no Polish section name is now longer than nine
   * characters (*Zarządzaj*, *Plan dnia*).
   *
   * > Thirteen characters, and the honest word. The 2026-08-30 corpus proposed
   * > the six-character *Strefy* to fit ADR 0022's measured tab bar, and named
   * > that as the choice it would rather be overruled on;
   * > `docs/research/2026-08-30-which-word-for-a-prisoner.md` §5 then
   * > re-measured and found the browser assertion does not fire -- a
   * > thirteen-character label stays inside the bar and instead clips and
   * > overlaps its neighbours.
   */
  'hud.tab.overview': 'Przegląd',
  'hud.tab.build': 'Buduj',
  'hud.tab.zones': 'Strefy',
  'hud.tab.manage': 'Zarządzaj',
  'hud.tab.day-plan': 'Plan dnia',

  'hud.minimap.title': 'Minimapa',
  'hud.minimap.placeholder': 'Nie ma tu jeszcze mapy — naciśnięcie może przesunąć kamerę',
  'hud.minimap.navigable': 'Nie ma tu jeszcze mapy — naciśnij, aby przenieść tam kamerę',

  'hud.alerts.title': 'Powiadomienia',
  'hud.alerts.empty': 'Brak aktywnych powiadomień',
  // The sentinel (#1184). The same Polish sentence as `hud.overview.none`
  // below, for the reason the English pair states: one state, one wording.
  'hud.alerts.unknown': 'Żadne więzienie nie przesyła danych.',
  'hud.alert.dismiss': 'Usuń to powiadomienie',
  'hud.alert.time': 'Dzień {day}',
  // A formula: the `×` carries the counting, so there is no grammatical number
  // in any language.
  'hud.alert.occurrences': '{count}×',
  'hud.panel.collapse': 'Zwiń',
  'hud.panel.expand': 'Rozwiń',
  'hud.severity.info': 'Informacja',
  'hud.severity.warning': 'Ostrzeżenie',
  // *Alarm*, not *Krytyczne*: the other two are nouns.
  'hud.severity.danger': 'Alarm',
  'hud.unavailable.simulation':
    'Symulacja niedostępna — ta przeglądarka nie zdołała jej uruchomić, więc nic nie może działać ani zostać zapisane',

  // =====================================================================
  // Refusals the simulation raised -- `hud.alert.refusal.*`.
  //
  // Every one opens with the impersonal `-no`/`-to` past: *nie przyjęto*, *nie
  // zbudowano*, *nie postawiono*. That form has no subject and no gender,
  // which is what lets this whole family be translated without reshaping a
  // sentence, and it is the register a Polish institution writes refusals in.
  // The em dash and the what-then-why order are kept.
  // =====================================================================
  'hud.alert.refusal.admit.no-accommodation':
    'Nikogo nie przyjęto — nie ma jeszcze pomieszczenia, w którym można kogoś umieścić.',
  'hud.alert.refusal.admit.population-full':
    'Nikogo nie przyjęto — to więzienie przetrzymuje już tylu ludzi, ilu może.',
  'hud.alert.refusal.build.duplicate-order': 'Zlecenie budowy nie doszło do skutku — takie zlecenie już istnieje.',
  'hud.alert.refusal.build.out-of-bounds': 'Zlecenie budowy nie doszło do skutku — to pole leży poza mapą.',
  'hud.alert.refusal.build.unbuildable': 'Zlecenie budowy nie doszło do skutku — na tym polu nie da się nic zbudować.',
  'hud.alert.refusal.build.unbuildable-terrain': 'Zlecenie budowy nie doszło do skutku — na tym gruncie nie da się budować.',
  'hud.alert.refusal.build.unknown-buildable':
    'Zlecenie budowy nie doszło do skutku — to więzienie nie wie, jak coś takiego zbudować.',
  'hud.alert.refusal.build.unowned-land': 'Zlecenie budowy nie doszło do skutku — ta ziemia nie należy do ciebie.',
  'hud.alert.refusal.build.water-blocked': 'Zlecenie budowy nie doszło do skutku — na tym polu jest woda.',
  'hud.alert.refusal.cancel-purchase.not-pending': 'Nic nie zwrócono — ta dostawa nie jest już w drodze.',
  'hud.alert.refusal.cancel-build-order.stale-cancellation':
    'Nic nie zwrócono — to zlecenie poszło dalej, zanim dotarło do niego anulowanie. Naciśnij Anuluj jeszcze raz, aby zobaczyć, ile płaci teraz.',
  'hud.alert.refusal.construction.materials-unfunded':
    'Kolejka budowy stoi — żadnych nowych materiałów, dopóki więzienie nie zarobi.',
  'hud.alert.refusal.hire.insufficient-funds':
    'Nikogo nie zatrudniono — zatrudnianie jest wstrzymane, dopóki więzienie nie zarobi.',
  'hud.alert.refusal.hire.no-duty-for-role':
    'Nikogo nie zatrudniono — posterunek może objąć tylko ochrona, a dla tej roli to więzienie nie ma innej pracy.',
  'hud.alert.refusal.hire.roster-full': 'Nikogo nie zatrudniono — to więzienie nie pomieści więcej personelu.',
  'hud.alert.refusal.hire.unknown-role': 'Nikogo nie zatrudniono — to więzienie nie zna takiej roli.',
  'hud.alert.refusal.place-object.duplicate-order': 'Nie postawiono obiektu — takie zlecenie już istnieje.',
  'hud.alert.refusal.place-object.not-a-placeable-object':
    'Nie postawiono obiektu — tego nie buduje się, stawiając na polu.',
  'hud.alert.refusal.place-object.out-of-bounds': 'Nie postawiono obiektu — jego część znalazłaby się poza mapą.',
  'hud.alert.refusal.place-object.outside-room': 'Nie postawiono obiektu — musi stać w wyznaczonym pomieszczeniu.',
  'hud.alert.refusal.place-object.tile-occupied': 'Nie postawiono obiektu — coś już tam stoi.',
  'hud.alert.refusal.place-object.unknown-buildable':
    'Nie postawiono obiektu — to więzienie nie wie, jak coś takiego zbudować.',
  'hud.alert.refusal.place-object.unowned-land': 'Nie postawiono obiektu — nie cała ta ziemia należy do ciebie.',
  'hud.alert.refusal.remove-object.nothing-to-remove':
    'Nic nie usunięto — na tym polu nie ma obiektu ani nic się tam nie buduje.',
  'hud.alert.refusal.remove-wall.nothing-to-remove':
    'Nic nie usunięto — na tym polu nie ma obiektu, nic się tam nie buduje i nie ma tam gotowej ściany.',
  'hud.alert.refusal.purchase.duplicate-order': 'Nie zamówiono materiałów — takie zlecenie już istnieje.',
  'hud.alert.refusal.purchase.insufficient-funds':
    'Nic nie kupiono — dostawy są wstrzymane, dopóki więzienie nie zarobi.',
  'hud.alert.refusal.purchase.invalid-quantity': 'Nie zamówiono materiałów — takiej ilości nie da się kupić.',
  'hud.alert.refusal.purchase.unknown-material': 'Nie zamówiono materiałów — ten materiał nie jest na sprzedaż.',
  'hud.alert.refusal.sell.insufficient-stock': 'Nic nie sprzedano — więzienie nie ma tyle w magazynie.',
  'hud.alert.refusal.sell.invalid-quantity': 'Nic nie sprzedano — takiej ilości nie da się sprzedać.',
  'hud.alert.refusal.sell.unknown-material': 'Nic nie sprzedano — na ten materiał nie ma kupca.',
  // English uses "dismiss" for ending employment and "release" for taking a
  // guard off a post; Polish has a separate verb for each, and *zwolnić*
  // covers only the first. The guard control is *Odwołaj*, the payroll control
  // *Zwolnij*, and every refusal follows its own control -- otherwise two
  // buttons in one panel would both read *Zwolnij*.
  'hud.alert.refusal.dismiss.unknown-staff': 'Nikogo nie zwolniono — tej osoby nie ma na liście personelu.',
  'hud.alert.refusal.release-guard.not-held': 'Nikogo nie odwołano — ten strażnik jest już poza służbą.',
  'hud.alert.refusal.release-guard.unknown-guard': 'Nikogo nie odwołano — tego strażnika nie ma na liście personelu.',
  'hud.alert.refusal.edit-regime-block.unknown-block':
    'Nic nie zmieniono — ta pora dnia nie jest blokiem w tym rozkładzie.',
  'hud.alert.refusal.edit-regime-block.unknown-group': 'Nic nie zmieniono — to więzienie nie ma rozkładu dla tej grupy.',
  'hud.alert.refusal.zone.duplicate-instance-id': 'Nie wyznaczono pomieszczenia — na tym polu zapisano już inne.',
  'hud.alert.refusal.zone.invalid-area': 'Nie wyznaczono pomieszczenia — ten obszar nie jest poprawnym prostokątem.',
  'hud.alert.refusal.zone.out-of-bounds': 'Nie wyznaczono pomieszczenia — część tego obszaru leży poza mapą.',
  'hud.alert.refusal.zone.overlaps-existing-room':
    'Nie wyznaczono pomieszczenia — nachodzi na pomieszczenie, które już tam jest.',
  'hud.alert.refusal.zone.unknown-room-type':
    'Nie wyznaczono pomieszczenia — to więzienie nie zna takiego typu pomieszczenia.',
  'hud.alert.refusal.zone.unowned-land': 'Nie wyznaczono pomieszczenia — nie cała ta ziemia należy do ciebie.',
  'hud.alert.refusal.zone.below-minimum-size':
    'Nie wyznaczono pomieszczenia — ten obszar jest mniejszy, niż pozwala ten typ pomieszczenia.',
  'hud.alert.refusal.zone.not-enclosed':
    'Nie wyznaczono pomieszczenia — ten typ musi być zamknięty, a narysowany obszar jest otwarty z co najmniej jednej strony.',
  'hud.alert.refusal.unzone.invalid-area': 'Nic nie usunięto — ten obszar nie jest poprawnym prostokątem.',
  'hud.alert.refusal.unzone.nothing-to-remove': 'Nic nie usunięto — w tym obszarze nie ma pomieszczenia.',
  'hud.alert.refusal.unzone.room-occupied': 'Nic nie usunięto — ktoś korzysta z tego pomieszczenia.',

  // =====================================================================
  // Protocol faults -- `hud.alert.fault.*`. The same impersonal device, and
  // here it buys something extra: each sentence has to be true of both
  // producers (the worker rejecting the interface and the interface rejecting
  // the worker), and a form with no subject names neither.
  // =====================================================================
  'hud.alert.fault.invalid-message': 'Odrzucono wiadomość symulacji — ta gra nie rozumie takiej wiadomości.',
  'hud.alert.fault.unsupported-protocol-version': 'Odrzucono wiadomość symulacji — napisano ją dla innej wersji gry.',
  'hud.alert.fault.unknown-message-kind':
    'Odrzucono wiadomość symulacji — ta wersja gry nie zna takiego rodzaju wiadomości.',
  'hud.alert.fault.invalid-payload':
    'Odrzucono wiadomość symulacji — jej zawartość nie była tym, co ta wiadomość musi nieść.',
  'hud.alert.fault.not-initialized': 'Odmówiono żądania symulacji — żadne więzienie nie jest jeszcze wczytane.',
  'hud.alert.fault.already-initialized': 'Odmówiono żądania symulacji — ta sesja ma już wczytane więzienie.',
  'hud.alert.fault.duplicate-message': 'Odmówiono polecenia — zostało już wysłane.',
  'hud.alert.fault.sequence-gap': 'Odmówiono polecenia — polecenie wysłane wcześniej nigdy nie dotarło.',
  'hud.alert.fault.invalid-state': 'Odmówiono żądania symulacji — symulacja nie może teraz tego zrobić.',
  'hud.alert.fault.snapshot-incompatible': 'Nie udało się wczytać zapisu — ta wersja gry nie rozumie jego formatu.',
  'hud.alert.fault.shutting-down': 'Odmówiono żądania symulacji — sesja się zamyka.',
  'hud.alert.fault.internal-error': 'Symulacja napotkała błąd wewnętrzny.',

  // =====================================================================
  // Narrated events -- `hud.alert.event.*`. This is the one family on the
  // *więzień* side of the owner's ruling, because it is the game narrating
  // rather than the institution labelling: `src/ui/simulation-events.ts` gives
  // these rows their own `event-` prefix, beside the `refusal-` and `fault-`
  // ones.
  // =====================================================================
  'hud.alert.event.construction.order-cancelled': 'Zlecenie anulowano — pieniądze, które kosztowało, wracają.',
  'hud.alert.event.construction.order-cancelled-underway':
    'Zlecenie anulowano. Co wydano po przekroczeniu punktu bez odwrotu, zostaje wydane.',
  'hud.alert.event.construction.undone': 'Cofnięto ostatnią zmianę w kolejce budowy.',
  'hud.alert.event.construction.redone': 'Ponowiono ostatnią zmianę w kolejce budowy.',
  'hud.alert.event.construction.undone-spend-destroyed':
    'Cofnięto ostatnią zmianę w kolejce budowy — co wydano po przekroczeniu punktu bez odwrotu, zostaje wydane.',
  'hud.alert.event.construction.undo-refused-newer-action':
    'Nic nie cofnięto — cofanie zabiera zmianę w kolejce budowy, a od ostatniej takiej zmiany wydarzyło się coś innego.',
  'hud.alert.event.objects.removed-spend-destroyed': 'Obiekt usunięto — pieniądze, które kosztował, nie wracają.',
  'hud.alert.event.economy.wages-unpaid': 'Wypłata nie doszła do skutku — personelowi należy się {total}.',
  'hud.alert.event.economy.construction-refused':
    'Budowa wstrzymana — skarbiec nie jest w stanie sfinansować teraz kolejki budowy.',
  'hud.alert.event.economy.construction-restored': 'Skarbiec wrócił powyżej progu budowy.',
  'hud.alert.event.economy.deliveries-refused': 'Dostawy wstrzymane — skarbiec nie pokryje teraz zakupu.',
  'hud.alert.event.economy.deliveries-restored': 'Skarbiec wrócił powyżej progu dostaw.',
  // Reshaped: `{total}` lands after a middle dot-free colon-like dash, and the
  // object of the cancelling is moved in front of the impersonal verb.
  'hud.alert.event.economy.delivery-cancelled': 'Dostawę anulowano — zwrot {total}.',
  // Reshaped. "Znaleziono kontrabandę: {item}." puts `{item}` after a colon;
  // "Znaleziono {item}" would need the accusative of the item's own name.
  'hud.alert.event.contraband.discovered': 'Znaleziono kontrabandę: {item}.',
  // Reshaped. "Zwolniono {count} więźniów" needs *więźnia* at 1 and
  // *więźniów* above it, and "kara odbyta" agrees with *kara*, not with a
  // count, so this is correct at every number.
  'hud.alert.event.prisoners.discharged': 'Zwolniono: {count} — kara odbyta.',
  // Reshaped, and this is the sharpest one in the catalogue. `{name}` cannot
  // be the subject of a Polish past-tense verb (they inflect for gender and
  // there is no gender model), and `{room}` arrives as the room catalogue's
  // nominative while "moved to Cell" wants the genitive *do celi*. So `{name}`
  // becomes a heading, the clause becomes the subjectless impersonal *nie
  // było*, and `{room}` lands after a colon. Same two parameters, same facts,
  // same order.
  'hud.alert.event.prisoners.relocated': '{name} — nie było gdzie spać. Nowe miejsce: {room}.',
  // Reshaped for the same reason as `relocated`, and by the same device.
  'hud.alert.event.prisoners.housed': '{name} — nowe miejsce: {room}.',
  // Reshaped. "Wybuchł bunt" is impersonal enough, but "{count} więźniów
  // przestało słuchać" is wrong at 2-4 (*dwaj więźniowie przestali*) and the
  // English's own escape hatch -- pick a range where one form is always right
  // -- does not exist here, because `DEFAULT_MINIMUM_RIOT_PARTICIPANTS` is 2
  // and 2 is exactly where the Polish rule flips. *Przestano* is the
  // impersonal past: it keeps the whole claim and agrees with nothing.
  'hud.alert.event.incidents.riot-opened': 'Wybuchł bunt — przestano słuchać poleceń. Liczba uczestników: {count}.',
  // The one key in the catalogue that carries *więzień* under the owner's
  // ruling: narration, and the noun is unavoidable because the sentence is
  // about who is fighting.
  'hud.alert.event.incidents.assault-opened': 'Doszło do bójki między dwoma więźniami.',
  // Narration, so *więzień* -- and it works here where it would not in a past
  // tense, because a Polish present-tense verb carries no gender.
  'hud.alert.event.incidents.escape-attempt-opened': 'Więzień próbuje się stąd wydostać.',
  // Reshaped: "{name} broke out" is a past-tense verb with a gendered subject.
  // *Ucieczka się powiodła* agrees with *ucieczka*, not with the person.
  'hud.alert.event.incidents.escape-succeeded': '{name} — ucieczka się powiodła. Żaden strażnik nie dotarł na czas.',
  'hud.alert.event.incidents.gang-retaliation-opened': 'Dwa gangi wyrównują rachunki.',
  'hud.alert.event.incidents.all-clear': 'Więzienie znowu jest pod kontrolą — żaden incydent nie jest już otwarty.',
  'hud.alert.event.incidents.all-clear-after-lapse':
    'Żaden incydent nie jest już otwarty — ale ostatniemu skończył się czas, zamiast zostać opanowanym, i ucierpieli wszyscy, którzy się w nim znaleźli.',
  // Reshaped: "Cela wyznaczona" would have to agree with the room name's own
  // gender, which changes per room (*Cela* feminine, *Magazyn* masculine,
  // *Ambulatorium* neuter). The impersonal verb plus a colon agrees with
  // nothing.
  'hud.alert.event.rooms.zoned': 'Wyznaczono: {room}.',
  'hud.alert.event.rooms.unzoned': 'Usunięto: {room}.',
  'hud.alert.event.rooms.needs-cleared':
    '{room} — nie brakuje już niczego z tego, co sprawdza panel Pomieszczenia. To nie znaczy, że ktokolwiek może tam wejść.',

  // =====================================================================
  // What a refused control says -- `hud.refusal.*`. The band under the status
  // strip. Same device, and deliberately the same wording as the alert
  // refusal where the fact is the same.
  // =====================================================================
  'hud.refusal.set-clock': 'Zegar się nie zmienił — żądanie odrzucono.',
  'hud.refusal.place-build-order': 'Nie złożono zlecenia budowy — żądanie odrzucono.',
  'hud.refusal.purchase-materials': 'Nic nie kupiono — zakup odrzucono i nie wydano pieniędzy.',
  'hud.refusal.purchase-materials-past-floor': 'Nic nie kupiono — dostawy są wstrzymane, dopóki więzienie nie zarobi.',
  'hud.refusal.sell-materials': 'Nic nie sprzedano — żądanie odrzucono i nic nie ubyło z magazynu.',
  'hud.refusal.hire-staff': 'Nikogo nie zatrudniono — żądanie odrzucono i nie wydano pieniędzy.',
  'hud.refusal.hire-staff-past-floor':
    'Nikogo nie zatrudniono — zatrudnianie jest wstrzymane, dopóki więzienie nie zarobi.',
  'hud.refusal.undo': 'Nic nie cofnięto — żądanie odrzucono.',
  'hud.refusal.redo': 'Nic nie ponowiono — żądanie odrzucono.',
  'hud.refusal.zone-room': 'Nie wyznaczono pomieszczenia — żądanie odrzucono.',
  'hud.refusal.unzone-room': 'Nic nie usunięto — żądanie odrzucono.',
  'hud.refusal.admit-prisoner': 'Nikogo nie przyjęto — żądanie odrzucono.',
  'hud.refusal.admit-prisoner-no-room': 'Nikogo nie przyjęto — to więzienie nie ma gdzie nikogo umieścić.',
  'hud.refusal.cancel-build-order': 'Zlecenie nadal czeka w kolejce — żądanie odrzucono.',
  'hud.refusal.cancel-material-purchase': 'Nic nie zwrócono — żądanie odrzucono, a dostawa nadal jest w drodze.',
  'hud.refusal.release-guard': 'Nikogo nie odwołano — żądanie odrzucono, a strażnik nadal ma przydział.',

  // =====================================================================
  // Build panel -- `hud.build.*`.
  //
  // The reshapes here are all one shape: an English verb-plus-object becomes a
  // Polish label-plus-colon, so the parameter can stay in the nominative the
  // call site actually passes.
  // =====================================================================
  'hud.build.title': 'Budowa',
  'hud.build.catalogue': 'Co zbudować',
  'hud.build.catalogue-empty': 'Nie ma nic do zbudowania',
  'hud.build.catalogue-row-price': '{buildable} · {total}',
  'hud.build.catalogue-row-price-segment': '{buildable} · {total} za segment',
  'hud.build.selected': 'Wybrane',
  'hud.build.placement': 'Gdzie',
  // *pole*, not *kafelek*: a Polish strategy game calls a grid square a pole.
  'hud.build.tile-x': 'Pole X',
  'hud.build.tile-y': 'Pole Y',
  // Reshaped. A Polish imperative takes the accusative (*Zmniejsz
  // szerokość*), and `{field}` arrives as another catalogue key resolved to
  // its nominative. With today's five field labels the bare form is
  // accidentally right -- masculine inanimates and feminines in *-ość* have
  // accusative = nominative -- which is exactly the problem: it is a grammar
  // rule disguised as a naming convention, and it breaks silently the first
  // time somebody labels a field *Liczba*. The colon licenses the nominative
  // whatever the label is. (It is also why `hud.build.buy-quantity` is
  // *Ilość* and not *Liczba*.)
  'hud.build.step-down': 'Zmniejsz: {field}',
  'hud.build.step-up': 'Zwiększ: {field}',
  'hud.build.edge': 'Krawędź',
  'hud.build.submit': 'Złóż zlecenie',
  'hud.build.note': 'Zlecenie trafia do kolejki od razu, a budowa idzie, gdy zegar chodzi.',
  'hud.build.arm': 'Stawiaj na mapie',
  'hud.build.arm-hint':
    'Kliknij krawędź pola, aby postawić ścianę. Przeciągnij wzdłuż niej, aby położyć cały ciąg. Dwa palce, środkowy przycisk i strzałki nadal poruszają kamerą.',
  'hud.build.arm-hint-object':
    'Kliknij pole wewnątrz wyznaczonego pomieszczenia, aby go postawić. Jedno naciśnięcie, jeden obiekt. Dwa palce, środkowy przycisk i strzałki nadal poruszają kamerą.',
  'hud.build.disarm': 'Przestań stawiać',
  'hud.build.remove': 'Usuń',
  'hud.build.remove-active': 'Przestań usuwać',
  'hud.build.remove-hint':
    'Naciśnij dowolne pole obiektu albo gotową ścianę, aby to zabrać. Obiekt jeszcze budowany zostaje anulowany i zwraca pieniądze — ale nic nie wraca, gdy ekipa już go zaczęła. Gotowy nie podlega zwrotowi.',
  'hud.build.remove-submit': 'Usuń obiekt tutaj',
  'hud.build.target-none': 'Wskaż miejsce na mapie',
  // No reshape in these three: a middle dot and an `×` both leave a nominative
  // alone, and numerals do not decline.
  'hud.build.target-value': '{x}, {y} · {edge}',
  'hud.build.target-run': '{count} × {edge} od {x}, {y}',
  'hud.build.target-tile': '{x}, {y}',
  'hud.build.coordinates': 'Wpisz współrzędne',
  'hud.build.coordinates-hint': 'Droga przez klawiaturę. Wskazanie na mapie jest szybsze.',
  'hud.build.buy': 'Kup',
  'hud.build.sell': 'Sprzedaj',
  'hud.build.buy-quantity': 'Ilość',
  // #661 predicted a reshape here and there is none: the English uses `×`
  // rather than a bare numeral, and *2 × Cegła* is ordinary Polish
  // order-and-receipt notation that keeps the nominative. The `×` is
  // load-bearing for this locale and is worth defending in any future copy
  // change.
  'hud.build.buy-submit': 'Kup {count} × {material} · {total}',
  'hud.build.sell-submit': 'Sprzedaj {count} × {material} · {total}',
  // "you need {amount} more" becomes "brakuje {amount}" -- the same fact from
  // the money's side, which keeps the numeral out of a verb's way.
  'hud.build.buy-shortfall': 'Za mało pieniędzy — brakuje {amount}.',
  'hud.build.buy-hint': 'Przyjeżdża, gdy zegar chodzi, do zapasu, z którego czerpie budowa.',
  'hud.build.queue': 'W kolejce',
  // Reshaped. English puts the numeral first and a participle after it; a
  // Polish participle agrees with what it describes, so *1 czekające* /
  // *2 czekające* / *5 czekających*. Reversing the pair costs nothing.
  'hud.build.queue-count': 'Czeka: {count} · W budowie: {started}',
  'hud.build.queue-order': '{buildable} · {x}, {y} · {edge} · zwrot {total}',
  'hud.build.queue-shortfall': 'Czeka na {total}, aby odblokować następne zlecenie.',
  'hud.build.queue-cancel': 'Anuluj',
  'hud.build.queue-unnamed': 'Zlecenie bez nazwy',
  // *i jeszcze {count}* agrees with nothing at any count, so the counted part
  // needs no reshape; only the tail is rewritten.
  'hud.build.queue-more': 'i jeszcze {count} za nimi — cofnięcie zabiera cały ciąg.',
  'hud.build.deliveries': 'W drodze',
  // Reshaped, same rule as `queue-count`.
  'hud.build.deliveries-count': 'Kupione: {count} · Zwrot przy anulowaniu: {total}',
  'hud.build.delivery': '{count} × {material} · zwrot {total}',
  'hud.build.delivery-cancel': 'Anuluj',
  'hud.build.delivery-unnamed': 'Materiał bez nazwy',
  'hud.build.deliveries-more':
    'i jeszcze {count} w drodze — te przyjadą pierwsze, a reszta pojawi się, gdy tamte dotrą.',
  'hud.build.buildable.wall-brick': 'Ściana z cegły',
  'hud.build.buildable.door-wooden': 'Drewniane drzwi',
  'hud.build.category': 'Kategoria',
  'hud.build.category-all': 'Wszystko',
  'hud.build.category.structure': 'Ściany i drzwi',

  // =====================================================================
  // Intake panel -- `hud.intake.*`.
  //
  // Three reshapes, all for one reason: a Polish verb agrees in number with
  // its numeral and the rule flips at five (*2 czekają*, *5 czeka*), so a
  // count-parameterised sentence with a verb in it is wrong at some counts
  // whatever you write. English has no equivalent, which is why the English
  // catalogue never had to think about it.
  // =====================================================================
  // The Overview section's readout (issue #1183). *Finanse* is the delivery's
  // own word for what this panel holds
  // (`DOKUMENTACJA/projekt.md:66`: "Stan dnia, sprawy do sprawdzenia,
  // finanse, zapis"). The sentinel names the state rather than the remedy, as
  // the English does.
  'hud.overview.title': 'Finanse',
  'hud.overview.none': 'Żadne więzienie nie przesyła danych.',
  'hud.overview.wages': 'Pensje dziennie',

  'hud.intake.title': 'Przyjęcia',
  // A control's label -- the operator acting on the institution -- so
  // *osadzonego* under the owner's ruling.
  'hud.intake.admit': 'Przyjmij osadzonego',
  'hud.intake.hint':
    'Zanim więzienie kogokolwiek przyjmie, potrzebuje celi. Nie potrzebuje wolnego łóżka: przybysz bez łóżka czeka, aż któreś się zwolni.',
  // Reshaped: the numeral moves out of the verb's way entirely.
  'hud.intake.no-place': 'Bez łóżka do spania: {count}',
  'hud.intake.pipeline': 'W przyjęciach',
  'hud.intake.pipeline-count': '{waiting} z {total}',
  // Reshaped: "at {stage}" is *na etapie* plus the locative (*na etapie
  // klasyfikacji*), and `{stage}` arrives as the stage's nominative label.
  'hud.intake.pipeline-stage': '{count} — etap: {stage}',
  // Reshaped: *nie da się* is the Polish impersonal and agrees with nothing.
  'hud.intake.pipeline-failed': 'Nie da się nigdzie umieścić: {count}',

  // =====================================================================
  // Staff panel -- `hud.security.*`.
  // =====================================================================
  'hud.security.staff': 'Personel',
  'hud.security.roles': 'Kogo zatrudnić',
  'hud.security.roles-empty': 'Nie ma jeszcze kogo zatrudnić.',
  'hud.security.selected': 'Wybrane',
  // Reshaped, same rule as `hud.build.step-down`: *Zatrudnij strażnika* is the
  // correct Polish and `{role}` arrives as *Strażnik*. An animate masculine
  // accusative is never equal to its nominative, so the bare form is wrong for
  // every role this game has, not just for some.
  'hud.security.hire': 'Zatrudnij: {role} · {total}',
  // "a day in wages" is *dziennie*, an adverb -- which is the case #661 named
  // and the catalogue did not yet have when it was filed.
  'hud.security.hire-hint': 'Kosztuje teraz {total}, a wynagrodzenie wynosi {wage} dziennie, wliczając dziś.',
  'hud.security.hire-shortfall': 'Za mało pieniędzy — brakuje {amount}.',
  'hud.security.hire-unassigned': 'Nowy strażnik zaczyna bez przydziału.',
  'hud.security.held': 'Na służbie',
  // Reshaped, same rule as `hud.build.queue-count`.
  'hud.security.held-summary': 'Na służbie: {held} · Bez przydziału: {unassigned}',
  'hud.security.held-empty': 'Nikt nie ma teraz przydziału.',
  'hud.security.held-row': '{name} · {claim}',
  'hud.security.held-row-unnamed': 'Strażnik {id} · {claim}',
  // *Odwołaj*, not *Zwolnij*, which is the Dismiss control further down the
  // same panel. English gets away with "Release" and "Dismiss"; Polish has one
  // verb for two of the three senses and has to split them by hand.
  'hud.security.held-release': 'Odwołaj',
  'hud.security.held-more': 'i jeszcze {count}',
  'hud.security.held-hint': 'Odwołany strażnik nadal jest zatrudniony i wraca do puli.',
  'hud.security.roster': 'Na liście płac',
  'hud.security.roster-dismiss': 'Zwolnij',
  // *osoba* (feminine) rather than a masculine noun, so the sentence is true
  // of any staff member -- the same device the relocation event needs.
  'hud.security.roster-dismiss-confirm': 'Zwolnić {name}? Wynagrodzenie przestaje być naliczane, a ta osoba nie wróci.',
  'hud.security.roster-hint': 'Zwolniona osoba odchodzi z więzienia na dobre, a jej wynagrodzenie się kończy.',
  'hud.security.roster-wage-bill': '{total} dziennie',
  'hud.security.coverage': 'Obsada strażników',
  'hud.security.coverage-summary': '{assigned} z {required}',
  'hud.security.coverage-met': 'Obsadzone',
  'hud.security.coverage-met-hint': 'Incydenty i przeszukania potrzebują wolnych strażników.',
  'hud.security.coverage-short': 'Niedobór obsady',
  // No reshape: an imperative plus a bare numeral agrees with nothing.
  'hud.security.coverage-short-hint': 'Zatrudnij jeszcze {count}, aby obsadzić tę populację.',
  'hud.security.coverage-unguarded': 'Bez obsady',
  'hud.security.coverage-unguarded-hint': 'Nikt nie pełni służby. Zatrudnij {count}, aby obsadzić tę populację.',
  'hud.security.coverage-unguarded-consequence':
    'Nikt tu nie pełni służby, więc nikt w tym sektorze nie jest chroniony.',

  // =====================================================================
  // Regime panel -- `hud.regime.*`.
  // =====================================================================
  'hud.regime.title': 'Rozkład dnia',
  'hud.regime.blocks': 'Dzisiejsze bloki',
  // Reshaped. *pozwala na* takes the accusative, applied to a list joined at
  // render time; a label plus a colon leaves the joined list nominative.
  'hud.regime.block-allows': 'Dozwolone: {categories}',
  'hud.regime.block-progress': 'Postęp bloku: {percent}%',
  // Unchanged: Polish uses the same list separator as English.
  'hud.regime.category-separator': ', ',
  // Label, so *Osadzeni*.
  'hud.regime.roster': 'Osadzeni',
  'hud.regime.roster-count': '{shown} z {total}',
  // Unchanged: Polish puts the given name first, as English does. ADR 0015
  // makes the order a locale decision and this locale agrees with the default.
  'hud.regime.roster-name': '{given} {family}',
  // A record identifier standing in for a name, so *Osadzony*.
  'hud.regime.roster-unnamed': 'Osadzony {id}',
  // Reshaped, and this is the key that would have justified the case
  // machinery #661 forbids -- and does not need it. Polish needs both a case
  // *and* a preposition that depend on the destination: *do stołówki*, *na
  // plac spacerowy*, *pod prysznic*. A system that knew every noun's
  // declension would still have to know which preposition each takes. A colon
  // needs neither.
  'hud.regime.roster-heading': 'W drodze: {activity}',
  'hud.regime.roster-more': 'i jeszcze {count}',
  'hud.regime.roster-empty': 'Nie ma jeszcze osadzonych. Zbuduj celę z łóżkiem, aby kogoś przyjąć.',
  'hud.regime.roster-emptied': 'To więzienie jest puste. Przyjmij kogoś, aby zacząć od nowa.',
  'hud.regime.sentence-remaining': 'Pozostała kara (dni w grze): {days}',

  // =====================================================================
  // Rooms panel -- `hud.rooms.*`. The panel with the most reshapes, because it
  // is the one that puts a room name, an object name and two numbers into
  // sentences.
  // =====================================================================
  'hud.rooms.title': 'Pomieszczenia',
  'hud.rooms.catalogue': 'Typ pomieszczenia i obszar',
  'hud.rooms.catalogue-empty': 'Nie ma dostępnych typów pomieszczeń',
  'hud.rooms.selected': 'Wybrane',
  'hud.rooms.arm': 'Rysuj na mapie',
  'hud.rooms.disarm': 'Przestań rysować',
  'hud.rooms.arm-hint': 'Przeciągnij prostokąt przez pola, które ma zająć to pomieszczenie.',
  'hud.rooms.remove': 'Usuń pomieszczenia',
  'hud.rooms.remove-active': 'Przestań usuwać',
  'hud.rooms.remove-hint': 'Przeciągnij przez dowolną część pomieszczenia, aby usunąć je w całości.',
  'hud.rooms.area': 'Obszar',
  'hud.rooms.area-none': 'Nic nie wybrano',
  // Reshaped. After a product Polish wants the genitive plural -- *10 × 8 pól*
  // -- which is right for everything except 1 × 1, where it must be *1 × 1
  // pole*; and this key renders the player's live drag, which is 1 × 1 the
  // instant they press. Moving the noun in front of the product takes it out
  // of the agreement entirely.
  'hud.rooms.area-value': 'Pola: {width} × {height}, w {x}, {y}',
  // No reshape: numerals do not decline and no noun follows them.
  'hud.rooms.confirm': 'Wyznacz {width} × {height}',
  'hud.rooms.confirm-remove': 'Usuń {width} × {height}',
  'hud.rooms.cancel': 'Odrzuć',
  // Reshaped into a labelled form, so the whole block reads as one series.
  // Here the genitive plural would in fact be safe -- no room type in
  // `room-catalog.ts` has a minimum below 2 -- and the label form is chosen so
  // a future 1 × 1 minimum cannot make it wrong silently.
  'hud.rooms.minimum': 'Minimalny rozmiar: {width} × {height}',
  'hud.rooms.minimum-none': 'Bez minimalnego rozmiaru',
  // *Za małe* agrees with *pomieszczenie* (neuter), the noun this panel puts
  // on screen.
  'hud.rooms.too-small': 'Za małe — to pomieszczenie wymaga co najmniej {width} × {height} pól.',
  'hud.rooms.enclosure': 'Zamknięcie',
  'hud.rooms.enclosure-none': 'Jeszcze nieocenione',
  'hud.rooms.enclosure-sealed': 'Otoczone ścianami — to nie jest sprawdzenie drzwi',
  'hud.rooms.enclosure-open': 'Otwarte z co najmniej jednej strony',
  'hud.rooms.requirement-enclosed': 'Musi być zamknięte',
  'hud.rooms.requirement-outdoors': 'Musi być na zewnątrz',
  'hud.rooms.requirement-none': 'Bez reguły zamknięcia',
  'hud.rooms.requires-object': 'Wymaga {count} × {object}',
  'hud.rooms.requires-none': 'Nie wymaga obiektów',
  'hud.rooms.coordinates': 'Wpisz współrzędne',
  'hud.rooms.coordinates-hint': 'Droga przez klawiaturę. Przeciąganie po mapie jest szybsze.',
  'hud.rooms.coordinates-submit': 'Użyj tych pól',
  'hud.rooms.tile-x': 'Pole X',
  'hud.rooms.tile-y': 'Pole Y',
  'hud.rooms.width': 'Szerokość',
  'hud.rooms.height': 'Wysokość',
  'hud.rooms.step-down': 'Zmniejsz: {field}',
  'hud.rooms.step-up': 'Zwiększ: {field}',
  'hud.rooms.needs': 'Niegotowe',
  'hud.rooms.needs-count': '{unfinished} z {total}',
  // Reshaped. "Celi w 4, 7 brakuje" needs the genitive of the room's own name,
  // which arrives as a nominative label; a heading plus a colon does not.
  'hud.rooms.needs-room': '{room} ({x}, {y}) — brakuje:',
  'hud.rooms.needs-object': '{count} × {object}',
  'hud.rooms.needs-object-uncounted': '{object}',
  'hud.rooms.needs-item-more': 'i jeszcze {count}',
  // Lower-case on purpose: substituted where an object name would stand,
  // mid-line.
  'hud.rooms.needs-object-unknown': 'coś, czego ta wersja gry nie potrafi nazwać',
  // Two more items in the same list, and lower-case for the same reason.
  'hud.rooms.needs-doorway': 'drzwi — nikt nie może wejść',
  'hud.rooms.needs-unreachable': 'dojście — nic z zewnątrz nie dociera do drzwi',
  'hud.rooms.at-capacity': 'Komplet',
  'hud.rooms.at-capacity-count': '{full} z {total}',
  'hud.rooms.at-capacity-places': 'miejsca zajęte: {inUse} z {capacity}',
  // Reshaped: "jest pełna/pełny/pełne" would have to agree with the room
  // name's own gender, which changes per room.
  'hud.rooms.at-capacity-room': '{room} ({x}, {y}) — brak wolnych miejsc',

  // =====================================================================
  // Save panel -- `save.*`. Its own namespace and its own module, and the one
  // family where `{detail}` is deliberately untranslated English coming out of
  // `src/persistence/**`. Every Polish frame around it puts that fragment
  // after a colon rather than inside a clause, so an English noun phrase never
  // has to agree with a Polish verb.
  // =====================================================================
  'save.panel.region': 'Zapisy więzień',
  'save.panel.title': 'Więzienia',
  'save.action.create': 'Nowe więzienie',
  'save.action.save': 'Zapisz teraz',
  'save.action.export': 'Eksportuj',
  'save.action.import': 'Importuj',
  'save.action.load': 'Wczytaj',
  'save.action.delete': 'Usuń',
  'save.action.delete-cancel': 'Zachowaj',
  'save.action.delete-confirm': 'Usuń trwale',
  'save.action.tombstone-restore': 'Przywróć',
  'save.action.tombstone-forget': 'Zwolnij miejsce teraz',
  'save.list.empty': 'Nie ma jeszcze żadnych więzień.',
  // The abbreviation dodges declension in Polish exactly as it dodges the
  // plural in English: *gen.* is the same before 1, 2 and 5.
  'save.list.item': '{name} ({count} gen.)',
  // Reshaped: "{name} — usunięto" rather than "{name} usunięte", because
  // `{name}` is a prison name the player typed and nothing knows its gender.
  'save.tombstone.item': '{name} — usunięto. Nadal można je przywrócić.',
  'save.delete.confirm':
    'Usunąć {name}? Każda zapisana kopia tego więzienia zniknie z twojej listy. Przez jeden dzień można je przywrócić z tego panelu, a potem przepada na dobre. Zapisy zmieniano ostatnio {age}.',
  // Abbreviated unit symbols, which do not inflect for number in Polish any
  // more than they do in English: *1 min temu*, *3 min temu*, *22 min temu*.
  // Spelling the units out is what would create the debt, which is why they
  // are not spelled out -- the same reasoning `describeSaveAge` records on the
  // English side.
  'save.delete.age.minutes': '{count} min temu',
  'save.delete.age.hours': '{count} godz. temu',
  'save.delete.age.days': '{count} dn. temu',
  'save.delete.age.moments': 'przed chwilą',
  'save.status.idle': 'Tylko zapisy lokalne — sieć niepotrzebna.',
  'save.status.saved': 'Zapisano (generacja {generation}).',
  'save.status.saving': 'Zapisywanie…',
  'save.status.loading': 'Wczytywanie…',
  'save.status.loaded': 'Wczytano.',
  'save.status.creating': 'Tworzenie więzienia…',
  'save.status.create-failed': 'Nie udało się utworzyć więzienia: {detail}',
  'save.status.no-active-prison': 'Brak aktywnego więzienia — najpierw utwórz albo wczytaj jakieś.',
  'save.status.not-found': 'To więzienie już nie istnieje.',
  'save.status.changed-elsewhere': 'Nie udało się zapisać: to więzienie zmieniono gdzie indziej.',
  'save.status.quota-exceeded':
    'Pamięć jest pełna. Usuń stare więzienie albo wyeksportuj i skasuj zapisy, żeby zwolnić miejsce. Poprzedni zapis jest nienaruszony.',
  'save.status.transaction-aborted':
    'Przeglądarka przerwała zapisywanie. Poprzedni zapis jest nienaruszony — spróbuj zapisać jeszcze raz.',
  'save.status.save-failed': 'Zapis nie powiódł się: {detail}',
  'save.status.list-unreadable':
    'Nie udało się odczytać lokalnej listy więzień (może to być tryb prywatny albo nieczytelny wpis zapisu): {detail}',
  'save.status.no-readable-generation':
    'Dla tego więzienia nie została żadna czytelna generacja zapisu. Każda zachowana kopia nie przeszła walidacji.',
  'save.status.recovered': 'Najnowszy zapis był nieczytelny — odzyskano wcześniejszą, zweryfikowaną generację.',
  'save.status.deleted': 'Więzienie usunięte. Przez jeden dzień można je przywrócić z listy poniżej.',
  'save.status.delete-kept': 'Nic nie usunięto.',
  // Reshaped: "{name} wrócił / wróciła / wróciło" would have to agree with a
  // prison name the player typed.
  'save.status.tombstone-restored': '{name} — z powrotem, dokładnie tak jak było.',
  'save.status.tombstone-forgotten': 'Przepadło na dobre. Nic z tego więzienia już nie zostało.',
  'save.status.tombstone-gone': 'Tego więzienia nie ma już do przywrócenia.',
  'save.status.tombstone-window-closed': 'Za późno — tego więzienia nie da się już przywrócić.',
  'save.status.tombstone-slot-taken':
    'To więzienie nie może wrócić — jego miejsce zajmuje teraz inne więzienie, które nadal tu jest.',
  'save.status.nothing-to-export': 'Nie ma czego wyeksportować — brak poprawnego aktywnego zapisu.',
  'save.status.exported': 'Wyeksportowano bieżący zapis.',
  'save.status.importing': 'Odczytywanie pliku zapisu…',
  'save.status.imported': 'Zaimportowano plik zapisu do tego więzienia (generacja {generation}).',
  'save.status.imported-migrated':
    'Zaimportowano zapis ze starszej wersji Lockstate i uaktualniono go (generacja {generation}).',
  'save.status.import-not-a-save': 'Ten plik nie jest zapisem Lockstate — wybierz plik wyeksportowany z tej gry.',
  'save.status.import-unsupported-version':
    'Ten zapis powstał w nowszej wersji Lockstate niż ta. Uaktualnij grę i zaimportuj go jeszcze raz.',
  'save.status.import-corrupt':
    'Ten zapis nie zgadza się z własną sumą kontrolną — został uszkodzony albo zmieniony po eksporcie, więc go nie zaimportowano.',
  'save.status.import-invalid': 'Nie udało się odczytać tego pliku zapisu: {detail}',
  'save.failure.create': 'Tworzenie więzienia nie powiodło się: {detail}',
  'save.failure.save': 'Zapisywanie nie powiodło się: {detail}',
  'save.failure.load': 'Wczytywanie nie powiodło się: {detail}',
  'save.failure.delete': 'Usuwanie nie powiodło się: {detail}',
  'save.failure.restore': 'Przywracanie więzienia nie powiodło się: {detail}',
  'save.failure.forget': 'Zwolnienie miejsca nie powiodło się: {detail}',
  'save.failure.export': 'Eksportowanie nie powiodło się: {detail}',
  'save.failure.import': 'Importowanie nie powiodło się: {detail}',
  'save.failure.unknown': 'Operacja nie powiodła się: {detail}',
  // Reshaped, and it is the subtlest one here. The thirteen `save.scope.*`
  // items are spliced into *both* halves of this sentence, joined with ", ".
  // In Polish the two frames demand two different cases of the same list --
  // *Przywrócono* takes the accusative, *nie przenosi* the genitive -- and no
  // reshape of the *items* can fix that. Both frames therefore become labels,
  // so both lists stay nominative, and the items below are bare lower-case
  // noun phrases.
  'save.detail.restored-scope': 'Przywrócone: {restored}. Nieprzeniesione przez tę wersję zapisu: {notCarried}.',
  'save.scope.kernel': 'takt jądra i kolejka poleceń',
  'save.scope.rng-streams': 'stany strumieni RNG',
  'save.scope.world': 'teren świata i własność gruntu',
  'save.scope.construction': 'zlecenia budowy oraz cofanie i ponawianie',
  'save.scope.entity-liveness': 'żywotność identyfikatorów bytów',
  // A save-manifest label, so *osadzeni* under the owner's ruling.
  'save.scope.prisoners': 'osadzeni, potrzeby, czynności i przydziały cel',
  'save.scope.operations': 'zadania, pojemniki i sieci instalacji',
  'save.scope.security': 'drzwi, sektory ochrony, strażnicy i patrole',
  'save.scope.contraband': 'kontrabanda, informacje i przeszukania',
  'save.scope.incidents': 'incydenty, gangi i tunele',
  'save.scope.names': 'imiona i nazwiska osadzonych oraz personelu',
  'save.scope.room-caches': 'pamięci podręczne pomieszczeń i topologii (przeliczane ze świata)',
  'save.scope.navigation-caches':
    'pamięci podręczne nawigacji i trwające żądania tras (wysyłane ponownie w następnym takcie)',

  // =====================================================================
  // Semantic input actions -- `input.action.*`. No keybinding or help surface
  // reads these yet.
  // =====================================================================
  'input.action.camera.up': 'Przesuń kamerę w górę',
  'input.action.camera.down': 'Przesuń kamerę w dół',
  'input.action.camera.left': 'Przesuń kamerę w lewo',
  'input.action.camera.right': 'Przesuń kamerę w prawo',
  'input.action.camera.zoom.in': 'Przybliż',
  'input.action.camera.zoom.out': 'Oddal',
  'input.action.selection.primary': 'Wybierz',
  'input.action.build.confirm': 'Potwierdź postawienie',
  'input.action.build.cancel': 'Anuluj',
  'input.action.edit.undo': 'Cofnij',
  'input.action.edit.redo': 'Ponów',

  // =====================================================================
  // Brand badge, display controls and the application's own accessible name.
  // =====================================================================
  'brand.region': 'Kompilacja Lockstate',
  // Not translated: a wordmark is a name.
  'brand.wordmark': 'LockState.io',
  // Left in English. *PREALFA* exists and looks odd; *WERSJA WSTĘPNA* is
  // accurate and long. It is a build-stage token on a badge beside an
  // untranslated wordmark, which argues for leaving it.
  'brand.stage': 'PRE-ALPHA',
  'brand.build': 'v{version} · {commit}',
  'brand.description': 'Lockstate, kompilacja {stage}, wersja {version}, commit {commit}.',
  'display.scale.region': 'Skala interfejsu',
  'display.scale.cycle': 'Zmień skalę interfejsu',
  // The three option labels agree with *motyw* (masculine), which is the noun
  // `display.theme.region` puts on screen beside them.
  'display.theme.region': 'Motyw',
  'display.theme.system': 'Systemowy',
  'display.theme.light': 'Jasny',
  'display.theme.dark': 'Ciemny',
  'display.theme.cycle': 'Zmień motyw interfejsu',
  // The language control (#663). `display.language.english` and
  // `display.language.polish` are **endonyms and are byte-identical to the
  // English catalogue's**, which is the point of them rather than an oversight:
  // a language named in the language the page is currently in is unreadable to
  // the one player looking for it. `Polski` is `Polski` on an English page and
  // `English` is `English` on a Polish one.
  // `tests/foundation/second-locale-contract.test.ts` compares them and fails
  // if either is translated here.
  'display.language.region': 'Język',
  // *Automatycznie* (adverb, "automatically") rather than *Automatyczny*
  // (adjective): the entry describes how the language is chosen, and there is
  // no noun on screen beside it for an adjective to agree with -- the legend
  // above the row says *Język* (masculine), so *Automatyczny* would read as an
  // adjective describing the language itself, which is not what the option
  // means.
  'display.language.automatic': 'Automatycznie ({language})',
  'display.language.english': 'English',
  'display.language.polish': 'Polski',
  // *Przeładuj* rather than *odśwież*: the page really is reloaded, not
  // refreshed in place, and `src/main.ts` saves the prison and awaits that
  // save first -- so both halves of the sentence are true of the code.
  'display.language.cycle': 'Zmień język interfejsu i przeładuj grę',
  'app.shell.label': 'Aplikacja gry Lockstate',
};

export const localePlCatalog: LocalizationCatalog = buildLocalizationCatalog(plMessages);
