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
};

export const localePlCatalog: LocalizationCatalog = buildLocalizationCatalog(plMessages);
