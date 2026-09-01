import { deriveSimulationMessageKey } from '../content/simulation-message-keys';
import type { WorkerToMainMessage } from '../simulation/protocol/types';
import { EMPTY_HUD_VIEW_MODEL, type HudCountsViewModel } from './hud/view-model';

/**
 * Turns what the worker said about its population into what the HUD paints.
 *
 * The counterpart of `hudClockFromWorkerMessage` (`./simulation-clock.ts`),
 * and it lives beside it for the same reason: the HUD is a view over plain
 * data and may not import `src/simulation/**` (`AGENTS.md` boundary 1,
 * enforced by `tests/unit/ui-hud-messages.test.ts`), so the module that has
 * to know both a protocol message and a view model sits outside
 * `src/ui/hud/`. It is a pure function, so proving it needs neither a worker
 * nor a DOM.
 *
 * Every value it returns comes out of a `simulation/status-counts`
 * publication the worker sent, and nothing is extrapolated or remembered
 * between messages: before this existed the HUD's counts were the literal
 * zeros of `EMPTY_HUD_VIEW_MODEL` for the whole session, however many
 * prisoners the simulation held (issue #104).
 *
 * **One field is composed rather than read straight through**, since issue
 * #506 finding 2: `activeIncidentTypeLabelKey` turns the worker's stable
 * `activeIncidentType` id into a message key with `deriveSimulationMessageKey`.
 * That is content-namespace composition, not simulation derivation -- it
 * resolves no catalogue and holds no state, the same distinction
 * `simulation-intake.ts` and this module's other `value`-content peers draw
 * -- so "nothing is derived" above still means what it always meant: no
 * simulation figure is computed here.
 */
export function hudCountsFromWorkerMessage(message: WorkerToMainMessage): HudCountsViewModel | undefined {
  switch (message.kind) {
    case 'simulation/status-counts': {
      const { counts } = message.payload;
      return {
        prisoners: counts.prisoners,
        /**
         * Straight through, and for the same reason
         * `stateIncomeAccruedTodayMinorUnits` below is: the HUD may not derive
         * a simulation figure. `accommodationCapacity` is the summed
         * `residentCapacity` of the rooms `IntakeSystem` would house an
         * arrival in, computed in the projection
         * (`src/simulation/presentation/status-strip-projection.ts`).
         *
         * **This read `prisonerCapacity: 0` until the field existed**, which
         * switched off the strip's only overcrowding signal: `occupancyTone`
         * (`src/ui/hud/projection.ts`) returns `undefined` for a capacity
         * `<= 0`, so the `> 1` danger badge and the `>= 0.9` warning could not
         * fire in any session, and the occupancy bar was omitted entirely.
         * ADR 0048 made overcrowding the thing a prison riots over, so the
         * cause was on screen and the warning was not.
         *
         * The comment that stood here gave a **false** reason for a correct
         * refusal: it said `roomCapacity` includes "canteens, yards and shower
         * rooms", and it does not -- `deriveRoomCapacity` credits
         * `residentCapacity` only for an object declaring `'sleep-surface'`,
         * and a bench, a dining table and a shower head declare none, so a
         * 40-seat canteen adds 0. Its last sentence named the real one: two
         * objects carry that capability, `object.bed` and
         * `object.medical-bed`, so `roomCapacity` counts an infirmary's beds
         * while intake will never house anybody in one. That is the gap the
         * new field closes, and it is why this is not simply
         * `counts.roomCapacity`.
         */
        prisonerCapacity: counts.accommodationCapacity,
        /**
         * Straight through, for `accommodationCapacity`'s reason above, and
         * it is the figure the `PRISONERS` chip's *"N with no bed"* badge is
         * built out of (issue #609).
         *
         * **`counts.roomOccupants` is on this payload and is deliberately not
         * read.** That field is residency -- who the prison has assigned
         * somewhere -- and ADR 0028 decision 2 keeps a resident where they
         * are when the bed under them is taken away, so it reports a prisoner
         * as housed whose bed no longer exists. `occupiedPlaces` is
         * `residentIdsWithExistingPlace().length`, the places that currently
         * exist, which is what the income line pays for
         * (`src/simulation/economy/income.ts`,
         * `stateIncomeForCompletedDay`). A badge fed from `roomOccupants`
         * would read *"0 with no bed"* for a prison the state has already
         * stopped paying for.
         *
         * Issue #609's own second correction is the measurement: a 3x3
         * `room.cell` with two beds and two prisoners housed, one bed then
         * removed, publishes `roomOccupants` 2 and `occupiedPlaces` 1
         * (`tests/integration/economy-occupied-place-exists.test.ts`).
         */
        occupiedPlaces: counts.occupiedPlaces,
        staff: counts.staff,
        rooms: counts.rooms,
        // Straight through, deliberately not `prisonerCapacity` above -- see
        // `HudCountsViewModel.roomCapacity`'s own doc comment for why the
        // host's starter-rung pre-flight needs the unfiltered sum and the
        // occupancy bar needs the accommodation-scoped one.
        roomCapacity: counts.roomCapacity,
        // Straight through, all three, for `accommodationCapacity`'s reason:
        // the HUD may not derive a simulation figure, and these are the rungs
        // `SafetyCoverageSystem` counted the population onto on the same walk
        // that provisioned its `safety` (issue #588).
        prisonersCovered: counts.prisonersCovered,
        prisonersUnderstaffed: counts.prisonersUnderstaffed,
        prisonersUnguarded: counts.prisonersUnguarded,
        /**
         * Straight through, for `accommodationCapacity`'s reason above, and it
         * is the figure the strip's `HIGH RISK` chip states (issue #703, the
         * owner's fourth ruling of 2026-08-31).
         *
         * **It has crossed the protocol since ADR 0032 and until this line
         * nothing in `src/ui/` read it**, which is the shape
         * `dailyWageBillMinorUnits` below records for its own field. The
         * measurement is worth keeping because the grep that establishes it is
         * easy to get wrong: `grep -rn 'highRisk' src/ui/` returns nothing --
         * and so does `grep -rn 'highRisk' src/`, because the field is
         * `prisonersHighRisk` with a capital `H` and the substring never
         * appears anywhere. The grep that says something is
         * `grep -rni 'high.risk' src/ui/`; before this change every hit it
         * returned was a comment or the `classificationGroupId === 'high-risk'`
         * tone rule in `hud/regime-panel.ts`, and none of them was this count.
         * No tally is given, because the point is the *spelling* of the grep and
         * a count of hits would rot on the next comment anybody writes.
         */
        prisonersHighRisk: counts.prisonersHighRisk,
        activeIncidents: counts.activeIncidents,
        /**
         * The one label this module derives rather than reads straight
         * through, and it is derived for the reason `simulation-intake.ts`
         * and the three other `value`-content translators give: the
         * alternative is a hand-written table of four `incident-type.*.name`
         * strings, which is exactly the drift `deriveSimulationMessageKey`'s
         * own derivation rule exists to prevent. `counts.activeIncidentType`
         * is absent exactly when the worker could not name one kind (issue
         * #506 finding 2), and the key is **omitted**, not set to
         * `undefined`, when that happens -- the spread below rather than a
         * ternary value, because `HudCountsViewModel.activeIncidentTypeLabelKey`
         * is optional for the reason its own doc comment gives (a channel one
         * layer down cannot carry a present-but-`undefined` value). The strip
         * decides what "no single kind" reads as (`src/ui/hud/projection.ts`),
         * not this translator.
         */
        ...(counts.activeIncidentType === undefined
          ? {}
          : { activeIncidentTypeLabelKey: deriveSimulationMessageKey('incident-type', counts.activeIncidentType) }),
        contrabandFound: counts.contrabandDiscovered,
        /**
         * Straight through, and **not** derived the way
         * `activeIncidentTypeLabelKey` above is -- the difference is where the
         * key comes from (issue #703 ruling 3). An incident type is an *enum*
         * with no definition object, so its key has to be composed from a
         * namespace and an id by `deriveSimulationMessageKey`. A contraband
         * category is a content definition that carries its own `nameKey`
         * (`src/content/contraband-catalog.ts`), so the projection sends the
         * finished key and composing a second one here would be a second
         * answer to a question the catalog already answered -- exactly the
         * drift `src/content/simulation-message-keys.ts` says its derivation
         * rule exists to prevent, arrived at from the other side.
         *
         * **Omitted, not set to `undefined`**, for the reason the incident
         * label above is: `HudCountsViewModel.contrabandNameKey` is optional
         * because the channel one layer down cannot carry a
         * present-but-`undefined` value, and a spread is what keeps "absent"
         * the only spelling of "cannot name one category" on both sides. The
         * strip decides what that reads as
         * (`src/ui/hud/projection.ts`), not this translator.
         */
        ...(counts.contrabandNameKey === undefined ? {} : { contrabandNameKey: counts.contrabandNameKey }),
        treasuryMinorUnits: counts.treasuryMinorUnits,
        /*
         * Straight through and conditionally spread, exactly as
         * `contrabandNameKey` below is: the field is optional on both sides,
         * and writing `treasuryOverdraftFloorMinorUnits: counts.…` unguarded
         * would put a present-but-`undefined` key on the view model for every
         * payload that carries no floor.
         *
         * The treasury's own floor (the owner's ruling 18 of 2026-08-31), never
         * `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` restated here -- which is what
         * keeps this module's simulation dependency type-only and the HUD's
         * `{remaining} left` badge a reading rather than an assumption.
         */
        ...(counts.treasuryOverdraftFloorMinorUnits === undefined
          ? {}
          : { treasuryOverdraftFloorMinorUnits: counts.treasuryOverdraftFloorMinorUnits }),
        stateIncomeAccruedTodayMinorUnits: counts.stateIncomeAccruedTodayMinorUnits,
        /**
         * Straight through, for `accommodationCapacity`'s reason above, and it
         * is the figure the collapsed `On the payroll` header states (issue
         * #639 ruling 2).
         *
         * **It has crossed the protocol since ADR 0042 step 3 and until this
         * line nothing in `src/ui/` read it** -- `grep -rn
         * 'dailyWageBillMinorUnits' src/ui/` returned nothing. The prison's
         * whole standing cost was computed, published twice a second and shown
         * to nobody, which is issue #629's class rather than a missing feature.
         */
        dailyWageBillMinorUnits: counts.dailyWageBillMinorUnits,
      };
    }

    // The session is over. Anything still on screen would be the last
    // reading from a simulation that no longer exists, so the counts go back
    // to the empty prison -- the same thing the clock does with
    // `UNKNOWN_HUD_CLOCK`.
    case 'simulation/stopped':
      return EMPTY_HUD_VIEW_MODEL.counts;

    default:
      return undefined;
  }
}
