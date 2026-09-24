import { refusalBandCeilingPassed } from '../simulation/refusals/refusal-band-lifetime';
import type { LocalizationKey } from '../content/localization';
import type { ProtocolFaultCode, RefusalReason, WorkerToMainMessage } from '../simulation/protocol/types';
import { PROTOCOL_FAULT_CODES } from '../simulation/protocol/types';
import type { HudAlertViewModel, HudRefusalNoticeViewModel, HudSpeed } from './hud/view-model';

/**
 * What the player is told about each refusal the simulation can report.
 *
 * ADR 0011's three namespaces, kept apart at exactly this line: the
 * simulation sends a stable id, this table turns it into a *message key*, and
 * the HUD resolves the key to text at render time. No sentence ever crosses
 * the worker boundary and no translated string ever travels back toward the
 * simulation.
 *
 * The keys are HUD-namespaced (`hud.alert.refusal.*`) and authored, rather
 * than derived through `src/content/simulation-message-keys.ts` the way every
 * other projected simulation enum's key is. That module labels an id a panel
 * renders **as a label** -- a cell reading "Awaiting Materials", a badge
 * reading "High Risk" -- and it says so: "short, neutral, HUD-appropriate:
 * these are dense panel labels, not prose". A refusal is not a label. It is a
 * sentence saying what did not happen and why, and a derived
 * `refusal-reason.build.unowned-land.name` reading "Unowned Land" would have
 * nowhere to be rendered. `tests/unit/simulation-message-keys.test.ts` carries
 * the exemption and this reason with it.
 *
 * A `Record` over the closed `RefusalReason` union, so a reason added to the
 * protocol fails to compile here until it has something to say.
 * `tests/unit/ui-simulation-alerts.test.ts` resolves every one of these
 * against the bundled default catalog, which is what stops a key from
 * shipping as its own raw dotted text --
 * `tests/foundation/localization-key-completeness.test.ts` cannot: it scans
 * for `labelKey: '...'` literals, and these are `Record` values.
 */
const REFUSAL_LABEL_KEYS: Readonly<Record<RefusalReason, LocalizationKey>> = {
  'admit.no-accommodation': 'hud.alert.refusal.admit.no-accommodation',
  'admit.population-full': 'hud.alert.refusal.admit.population-full',
  'build.duplicate-order': 'hud.alert.refusal.build.duplicate-order',
  'build.out-of-bounds': 'hud.alert.refusal.build.out-of-bounds',
  'build.unbuildable': 'hud.alert.refusal.build.unbuildable',
  'build.unbuildable-terrain': 'hud.alert.refusal.build.unbuildable-terrain',
  'build.unknown-buildable': 'hud.alert.refusal.build.unknown-buildable',
  'build.unowned-land': 'hud.alert.refusal.build.unowned-land',
  'build.water-blocked': 'hud.alert.refusal.build.water-blocked',
  'cancel-build-order.stale-cancellation': 'hud.alert.refusal.cancel-build-order.stale-cancellation',
  'cancel-purchase.not-pending': 'hud.alert.refusal.cancel-purchase.not-pending',
  'construction.materials-unfunded': 'hud.alert.refusal.construction.materials-unfunded',
  'dismiss.unknown-staff': 'hud.alert.refusal.dismiss.unknown-staff',
  'edit-regime-block.unknown-block': 'hud.alert.refusal.edit-regime-block.unknown-block',
  'edit-regime-block.unknown-group': 'hud.alert.refusal.edit-regime-block.unknown-group',
  'hire.insufficient-funds': 'hud.alert.refusal.hire.insufficient-funds',
  'hire.no-duty-for-role': 'hud.alert.refusal.hire.no-duty-for-role',
  'hire.roster-full': 'hud.alert.refusal.hire.roster-full',
  'hire.unknown-role': 'hud.alert.refusal.hire.unknown-role',
  'place-object.duplicate-order': 'hud.alert.refusal.place-object.duplicate-order',
  'place-object.not-a-placeable-object': 'hud.alert.refusal.place-object.not-a-placeable-object',
  'place-object.out-of-bounds': 'hud.alert.refusal.place-object.out-of-bounds',
  'place-object.outside-room': 'hud.alert.refusal.place-object.outside-room',
  'place-object.tile-occupied': 'hud.alert.refusal.place-object.tile-occupied',
  'place-object.unknown-buildable': 'hud.alert.refusal.place-object.unknown-buildable',
  'place-object.unowned-land': 'hud.alert.refusal.place-object.unowned-land',
  'purchase.duplicate-order': 'hud.alert.refusal.purchase.duplicate-order',
  'purchase.delivery-capacity': 'hud.alert.refusal.purchase.delivery-capacity',
  'purchase.insufficient-funds': 'hud.alert.refusal.purchase.insufficient-funds',
  'purchase.invalid-quantity': 'hud.alert.refusal.purchase.invalid-quantity',
  'purchase.unknown-material': 'hud.alert.refusal.purchase.unknown-material',
  'release-guard.not-held': 'hud.alert.refusal.release-guard.not-held',
  'release-guard.unknown-guard': 'hud.alert.refusal.release-guard.unknown-guard',
  'remove-object.nothing-to-remove': 'hud.alert.refusal.remove-object.nothing-to-remove',
  'remove-wall.nothing-to-remove': 'hud.alert.refusal.remove-wall.nothing-to-remove',
  'sell.insufficient-stock': 'hud.alert.refusal.sell.insufficient-stock',
  'sell.invalid-quantity': 'hud.alert.refusal.sell.invalid-quantity',
  'sell.unknown-material': 'hud.alert.refusal.sell.unknown-material',
  'zone.below-minimum-size': 'hud.alert.refusal.zone.below-minimum-size',
  'zone.duplicate-instance-id': 'hud.alert.refusal.zone.duplicate-instance-id',
  'zone.invalid-area': 'hud.alert.refusal.zone.invalid-area',
  'zone.not-enclosed': 'hud.alert.refusal.zone.not-enclosed',
  'zone.out-of-bounds': 'hud.alert.refusal.zone.out-of-bounds',
  'zone.overlaps-existing-room': 'hud.alert.refusal.zone.overlaps-existing-room',
  'zone.unknown-room-type': 'hud.alert.refusal.zone.unknown-room-type',
  'zone.unowned-land': 'hud.alert.refusal.zone.unowned-land',
  'unzone.invalid-area': 'hud.alert.refusal.unzone.invalid-area',
  'unzone.nothing-to-remove': 'hud.alert.refusal.unzone.nothing-to-remove',
  'unzone.room-occupied': 'hud.alert.refusal.unzone.room-occupied',
};

/**
 * What the player is told about each protocol fault the worker can raise.
 *
 * A `Record` over the closed `ProtocolFaultCode` union for the same reason
 * `REFUSAL_LABEL_KEYS` is one: a thirteenth code added to the protocol fails
 * to compile here until somebody decides what it says to a player, which is
 * the property a lookup with a fallback would not have. Every key is resolved
 * against the bundled catalog by `tests/unit/ui-simulation-alerts.test.ts`.
 *
 * ## Why one sentence per code serves both directions
 *
 * These rows have two producers, and they are on opposite sides of the
 * boundary: the worker rejecting a message the main thread sent
 * (`src/simulation/worker/worker.ts`, `recoverable: true` since ADR 0024), and
 * the main thread rejecting a message the worker sent
 * (`SimulationClient.handleMessage`, `recoverable: false`). Each sentence is
 * therefore written to be true of both -- "a simulation message was rejected
 * because ...", never "the worker said" or "this page could not read" -- and
 * the direction is carried by `severity`, which is the part of the difference
 * a player can act on.
 *
 * Splitting them would need twenty-four keys to express a distinction whose
 * player-facing content is "can I keep playing", and that is already said.
 * The *diagnostic* difference is not lost either: both producers write the
 * direction into `payload.message`, which reaches the console.
 */
const PROTOCOL_FAULT_LABEL_KEYS: Readonly<Record<ProtocolFaultCode, LocalizationKey>> = {
  'invalid-message': 'hud.alert.fault.invalid-message',
  'unsupported-protocol-version': 'hud.alert.fault.unsupported-protocol-version',
  'unknown-message-kind': 'hud.alert.fault.unknown-message-kind',
  'invalid-payload': 'hud.alert.fault.invalid-payload',
  'not-initialized': 'hud.alert.fault.not-initialized',
  'already-initialized': 'hud.alert.fault.already-initialized',
  'duplicate-message': 'hud.alert.fault.duplicate-message',
  'sequence-gap': 'hud.alert.fault.sequence-gap',
  'invalid-state': 'hud.alert.fault.invalid-state',
  'snapshot-incompatible': 'hud.alert.fault.snapshot-incompatible',
  'shutting-down': 'hud.alert.fault.shutting-down',
  'internal-error': 'hud.alert.fault.internal-error',
};

/**
 * The sentence this catalogue already ships for a fault an *action* failed
 * with, found by walking a thrown value.
 *
 * ## Why this is here and not beside the thing that throws
 *
 * `PROTOCOL_FAULT_LABEL_KEYS` above is the one table in the repository that
 * says what a fault code means to a player, and it is exhaustive over the
 * closed twelve-member vocabulary by construction. A second lookup written
 * anywhere else would be the drift `tests/unit/ui-simulation-alerts.test.ts`
 * exists to prevent, and the one that drifted would be the one still passing.
 * So the map stays private and this is the accessor.
 *
 * ## Why it walks the `cause` chain
 *
 * Because the layers between the worker and a panel wrap rather than
 * flatten, deliberately. `WorkerSessionHost` raises `WorkerFaultError`
 * carrying the code; `startFromSnapshot` re-raises it as
 * `SnapshotRestoreRejectedError` or `SnapshotRestoreFaultError` with the
 * original as `cause`; `WorkerPerSessionHost.beginSession` wraps a worker
 * that could not be constructed the same way. Reading only the outermost
 * value would lose the code on exactly the paths that have one.
 *
 * ## Why it duck-types instead of importing the error classes
 *
 * A `code` that is a member of `PROTOCOL_FAULT_CODES` is the whole contract,
 * and it is the contract the protocol declares. Importing
 * `src/persistence/session/worker-session-host.ts` for an `instanceof` would
 * make a UI module depend on the persistence seam to read a protocol value,
 * and would still miss `ProjectionRequestError`, which carries the same codes
 * from a different module. The closed set is what makes the check safe: an
 * arbitrary object with a `code` of `'not-found'` matches nothing.
 *
 * Returns `undefined` when nothing in the chain declared a protocol fault --
 * a storage `DOMException`, a reply timeout, a file the browser would not
 * read. Those carry no code, so there is no catalogue sentence to find and
 * the caller has to decide what to say instead.
 */
export function protocolFaultMessageKeyOf(error: unknown): LocalizationKey | undefined {
  const codes: readonly string[] = PROTOCOL_FAULT_CODES;
  // Bounded rather than `while (true)`: a `cause` cycle is possible in
  // principle and a UI helper must not be the thing that hangs the page.
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current !== null && typeof current === 'object'; depth += 1) {
    const code = (current as { readonly code?: unknown }).code;
    if (typeof code === 'string' && codes.includes(code)) {
      return PROTOCOL_FAULT_LABEL_KEYS[code as ProtocolFaultCode];
    }
    current = (current as { readonly cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * The two row families this module produces, as prefixes on
 * `HudAlertViewModel.id`.
 *
 * The list is a single flat array on the view model, and the two producers
 * update it independently -- a status-counts publication replaces the refusal
 * row and must leave a standing fault alone, and a fault must leave the
 * refusal alone. The id already has to be stable and unique per row, so it is
 * also the cheapest place to record which family a row belongs to; the
 * alternative is a second field on `HudAlertViewModel` that only this module
 * would ever read, and that the HUD would have to ignore.
 */
const REFUSAL_ROW_PREFIX = 'refusal-';
const FAULT_ROW_PREFIX = 'fault-';

/**
 * Turns what the worker said it refused into the rows the HUD's alerts list
 * paints.
 *
 * The third of the translators outside `src/ui/hud/` -- beside
 * `hudClockFromWorkerMessage` and `hudCountsFromWorkerMessage` -- and it
 * lives here for the same reason they do: the HUD is a view over plain data
 * and may not import `src/simulation/**` (`AGENTS.md` boundary 1, enforced by
 * `tests/unit/ui-hud-messages.test.ts`), so the module that has to know both
 * a protocol message and a view model sits outside it. Pure, so proving it
 * needs neither a worker nor a DOM.
 *
 * `HudViewModel.alerts` had **no producer** before this. The list, the
 * severity badges, the folding section, the empty-state row and the insertion
 * ordering #209 measured in a real browser were all implemented; `src/main.ts`
 * wrote only `clock` and `counts` into the view model, and between #220 --
 * which moved the one message ever routed there, "simulation unavailable", to
 * `.hud__unavailable` -- and #261 the only assignment to the field anywhere in
 * `src/` was the literal `[]` in `EMPTY_HUD_VIEW_MODEL`.
 *
 * ## Two producers, and why `previous` is a parameter
 *
 * The refusal channel is a snapshot on a cadence carrying the *last* refusal,
 * so it contributes exactly one row or none -- see `RefusalLog` for why a
 * queue could not be carried honestly there. Since #187 there is a second
 * producer: an uncorrelated `protocol/error`, which is the fault nobody else
 * reads.
 *
 * They arrive on separate messages and neither may erase the other. Returning
 * the complete list from the message alone cannot express that -- a
 * status-counts publication arrives up to twice a second, so a fault row
 * returned on its own would be painted over within 500 ms, which is
 * indistinguishable from the swallowing this change exists to remove. So the
 * caller passes the list it is holding and gets the next one back, exactly as
 * it already does for `hudClockFromWorkerMessage(message, viewModel.clock)`.
 * The function stays pure: same arguments, same result, no state of its own.
 *
 * The list stays bounded -- at most one refusal row and at most one row per
 * fault code -- so `docs/HUD_PROJECTIONS.md` contract 5 still has nothing to
 * page here.
 *
 * ## Why it stays up
 *
 * Nothing clears a row: "the last refusal was X" stays true until another
 * refusal replaces it or the session ends, and the same holds of a fault --
 * "this session has seen an `invalid-message` fault" does not stop being true. This channel has no way to say
 * "dismissed" -- that would be a main-to-worker message and a piece of
 * simulation state to hold it, which is a decision rather than a detail, so
 * it is recorded in `docs/HUD_PROJECTIONS.md` instead of guessed at here.
 *
 * **That paragraph is kept and is now half true, which is worth one sentence
 * rather than a silent edit.** It is still exactly right about *these* rows: no
 * gesture retires a refusal or a fault, and `docs/HUD_PROJECTIONS.md` gap 34 is
 * still where that decision waits. What it stopped being right about is the
 * *list*, because the other producer's rows can now be dismissed -- the owner's
 * decision 2 of 2026-09-01 on
 * [ADR 0084](../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md).
 * And the shape this paragraph predicted is the shape that was built: a
 * `DismissAlert` command and a mark in `SimulationEventLog`, which is a piece
 * of simulation state, snapshotted so the row stays gone across a reload.
 *
 * Why it did **not** reach a refusal row, decided rather than deferred: a
 * refusal is a *level*, republished unchanged on `simulation/status-counts` up
 * to twice a second and replaced in place by ordinal, so retiring one means
 * suppressing a value the worker keeps re-asserting -- a different mechanism
 * from marking a run of occurrences as read, and one nobody has ruled on. ADR
 * 0084 says in terms that it does not reopen gap 34.
 *
 * For a **refusal**, `severity` is `'warning'` for every reason, and
 * uniformly rather than arbitrarily: each of these says the same thing -- the
 * player asked for something and the prison is not doing it -- and grading one
 * refusal above another would be a balance judgement this layer has no basis
 * for, exactly as `docs/HUD_PROJECTIONS.md` contract 4 refuses to band a need
 * bar. A **fault** is the one case where this layer does grade, and it grades
 * on a fact the sender reported rather than on a judgement of its own: see the
 * `protocol/error` branch.
 *
 * Note that `build.out-of-bounds` and `zone.out-of-bounds` are separate
 * entries with separate sentences, and that is the point of the namespace:
 * the same condition refuses a wall and a room, and a player reading "the
 * build order failed" after zoning a canteen would go and look at the wrong
 * control. `unzone.invalid-area` is the third instance of the same rule --
 * spelled identically to `zone.invalid-area` and carrying a different
 * sentence, because a player told "the room was not zoned" after asking to
 * *remove* a room would look at the wrong control for the same reason. And
 * `hire.insufficient-funds` and `purchase.insufficient-funds` are the fourth
 * (ADR 0025): the treasury refuses both, and only the command says which panel
 * the player should be looking at.
 *
 * **`construction.materials-unfunded` is the ladder's second rung and the
 * sharpest instance of the rule this whole comment states.** It is the same
 * treasury refusing the same `ProcurementSystem.purchase` as
 * `purchase.insufficient-funds`, and it is a different sentence because it is
 * a different *rung*: the owner's ruling 19 of 2026-08-31 refused a player's
 * delivery at -1,250 and the build queue's own materials at -2,000, so one
 * sentence on both told a prison at -1,800 that deliveries were refused when
 * what had actually stopped was construction. Until the owner ruled on
 * 2026-09-01 this table had no row for it to resolve to -- and could not have
 * had one, because `reportMaterialsFunding` had no reason to record. That is
 * the mechanism working: a `Record` over a closed union is what made "rung 2
 * needs a sentence" a compile error rather than a wish.
 *
 * **Ruling 19's two thresholds are history, not the present.** The owner's
 * later ruling on #771 (2026-09-01, ADR 0017's equalisation amendment)
 * retired the -1,250/-2,000 split this paragraph's example depends on:
 * `construction.materials-unfunded` and `purchase.insufficient-funds` now
 * fire at the same -1,250. The row this section argues for still earns its
 * keep -- the two remain different *events* on different controls, which is
 * the fourth-instance rule this whole comment states -- but the -1,800
 * example above is a snapshot of the band #771 closed, not a balance where
 * the two sentences can still disagree today.
 *
 * **Those two now resolve to the host's own sentences** -- the owner's ruling
 * 23 of 2026-08-31, *"Te same słowa co host"*. One refusal is decided on either
 * side of `sender.submit` and both land on the same `.hud__refusal` band, so a
 * charge the standing overdraft cannot carry says the same thing whichever side
 * caught it. They stay two rows here rather than becoming references to
 * `hud.refusal.hire-staff-past-floor` and
 * `hud.refusal.purchase-materials-past-floor`, because this table's contract is
 * one authored `hud.alert.refusal.*` key per `RefusalReason` and the
 * `hud.refusal.*` namespace belongs to a control on this thread, not to the
 * wire -- and because the fourth-instance rule above still applies to them: the
 * two sentences share their tail and differ in what did not happen.
 */
export function hudAlertsFromWorkerMessage(
  message: WorkerToMainMessage,
  previous: readonly HudAlertViewModel[] = [],
): readonly HudAlertViewModel[] | 'none' | undefined {
  switch (message.kind) {
    case 'simulation/status-counts': {
      const { refusal, counts } = message.payload;
      const standing = previous.filter((row) => !row.id.startsWith(REFUSAL_ROW_PREFIX) && row.id !== 'intake-delayed' && !row.id.startsWith('holding-'));
      const delayed = counts.delayedIntakeCount ?? 0;
      const queueRows: HudAlertViewModel[] = delayed > 0 ? [{
        id: 'intake-delayed', labelKey: 'hud.alert.intake-delayed', severity: 'warning', labelParameters: { count: delayed },
      }] : [];
      const holdingRows: HudAlertViewModel[] = [
        ...((counts.holdingStrainedCount ?? 0) > 0 ? [{
          id: 'holding-strained', labelKey: 'hud.alert.holding-strained', severity: 'warning' as const,
          labelParameters: { count: counts.holdingStrainedCount! },
        }] : []),
        ...((counts.holdingCriticalCount ?? 0) > 0 ? [{
          id: 'holding-critical', labelKey: 'hud.alert.holding-critical', severity: 'danger' as const,
          labelParameters: { count: counts.holdingCriticalCount! },
        }] : []),
      ];
      if (refusal === undefined) return [...standing, ...queueRows, ...holdingRows];
      return [
        ...standing,
        ...queueRows,
        ...holdingRows,
        {
          // The refusal's own ordinal, so a readout that repeats an
          // unchanged refusal beside a changed count updates the row the
          // player is looking at instead of rebuilding it -- which is what
          // `HudAlertViewModel.id` exists for -- while a *new* refusal is a
          // new row rather than the old one silently rewritten.
          id: `${REFUSAL_ROW_PREFIX}${refusal.sequence}`,
          labelKey: REFUSAL_LABEL_KEYS[refusal.reason],
          severity: 'warning',
          // Forwarded, not decided: the place a refusal is about is the
          // simulation's fact and this module's job is to put it where the
          // HUD can reach it (ADR 0122 option D step 2, adopted 2026-09-22).
          // Absent on the ten `RefusalLog` domains that are aimed nowhere, so
          // spread rather than passed as `undefined` --
          // `exactOptionalPropertyTypes` is on and the two are different
          // values, exactly as `routeDecidedSince` below is spread on the
          // band.
          //
          // **The band does not get it and that asymmetry is deliberate.**
          // `HudRefusalNoticeViewModel` is one sentence in an always-laid-out
          // corner with no row to press; ADR 0122's recommendation is that
          // *the alerts row* becomes the press, and option D step 2 names
          // `HudAlertViewModel` and nothing else. Giving the band a
          // destination nothing can press would be a field with no reader on
          // the surface that has no gesture, which is a different thing from
          // the field with no reader *yet* on the surface that will get one.
          ...(refusal.tile === undefined ? {} : { tile: refusal.tile }),
        },
      ];
    }

    case 'protocol/error': {
      // A fault that answers a request is already reported by whoever made
      // the request, and reporting it twice is worse than not reporting it
      // here: `WorkerSessionHost` rejects the pending promise with a
      // `WorkerFaultError`, and the save panel names the action that failed.
      // What has never had a reader is the *uncorrelated* fault -- and it is
      // uncorrelated for a reason in every case that can produce one, which
      // is what makes this rule a boundary rather than a filter.
      if (message.replyTo !== undefined) return undefined;
      const { code, recoverable } = message.payload;
      return replaceOrAppend(previous, {
        // Keyed by code, not by occurrence, and that is what keeps the list
        // bounded: a peer emitting malformed messages in a loop updates one
        // row rather than growing the alerts list without limit, which is
        // `docs/HUD_PROJECTIONS.md` contract 5. There are twelve fault codes,
        // so there are at most twelve of these rows in a session.
        id: `${FAULT_ROW_PREFIX}${code}`,
        labelKey: PROTOCOL_FAULT_LABEL_KEYS[code],
        // The two halves of #187 differ here and nowhere else. A worker that
        // rejected a message it never applied stays usable and says so
        // (`recoverable: true`, ADR 0024); a reply this thread could not read
        // leaves it unable to say what the worker did at all. That is the
        // difference between "something you asked for did not happen" and
        // "stop trusting what you are looking at", and it is the one thing
        // about a fault a player can act on.
        severity: recoverable ? 'warning' : 'danger',
      });
    }

    // The session is over. A refusal by a simulation that no longer exists is
    // not something the player can act on, and neither is a fault raised by a
    // worker that has stopped, so the list comes off.
    //
    // **`'none'` rather than `[]` as of issue #1184, and the difference is the
    // whole fix.** An empty array is what a prison *reporting nothing wrong*
    // sends, and returning it here made the two indistinguishable: the HUD
    // painted `'hud.alerts.empty'` -- "No active alerts" -- over a session
    // that had ended, the same sentence it paints for a running prison with a
    // clean log. This is now the tri-state `hudRefusalFromWorkerMessage`
    // below has always had, and for the identical reason: `undefined` is a
    // message that said nothing about alerts and the field must be left alone,
    // `'none'` is a message that says there is no longer anything to report,
    // and `src/main.ts` deletes the field for it.
    case 'simulation/stopped':
      return 'none';

    default:
      return undefined;
  }
}

/**
 * Turns the same refusal into the notice the HUD's always-laid-out band
 * paints.
 *
 * The fifth translator outside `src/ui/hud/`, and the structural half of
 * issue #220's fix -- see `HudRefusalNoticeViewModel` for the measurement it
 * rests on and `mountHud`'s refusal element for the band's own rules.
 *
 * ## Why this is a second reading of one message rather than a second message
 *
 * There is exactly one refusal on the wire: `RefusalLog`'s last record, on
 * `simulation/status-counts`. This function and `hudAlertsFromWorkerMessage`
 * read that one record for two different surfaces, and they are separate
 * functions rather than one returning a pair because the two surfaces have
 * different lifetimes and different neighbours. The list merges the refusal
 * with standing `protocol/error` rows and therefore needs the list it is
 * updating; the band holds one sentence and needs nothing but the message.
 * Folding them together would hand the band the alerts list's `previous`
 * parameter for no reason, and `src/main.ts` would still have to pick the two
 * results apart.
 *
 * ## What each surface is for, now that there are two
 *
 * - **The band is the notice.** It is laid out at every viewport and needs no
 *   section opened, so it is where the player is *told*. It carries the most
 *   recent refusal and nothing else.
 * - **The list is the log.** It keeps the refusal row -- keyed by the same
 *   ordinal, so it is still the row `HudAlertViewModel.id` was designed for --
 *   *beside* the `protocol/error` rows nothing else on this thread reads.
 *   Those two families cannot share one line: a fault is not a refusal of a
 *   player command, it stands per code, and several can stand at once
 *   (`replaceOrAppend`). The band cannot hold them and the list can, so the
 *   list is not redundant and is not being emptied.
 *
 * The sentence therefore appears twice on a wide viewport with the section
 * opened, and that is the intended reading rather than a duplication to be
 * removed: one is what is happening now, the other is the entry it left.
 *
 * Tri-state for the reason `hudZoningFromWorkerMessage` is: `undefined` means
 * this message says nothing about a refusal and the view model must be left
 * alone, while `'none'` is a message that does say, and says there is none.
 * Collapsing them would make a session that has refused nothing
 * indistinguishable from a `simulation/delta`, and the band would go on
 * showing a refusal from a session that had ended.
 */
export function hudRefusalFromWorkerMessage(
  message: WorkerToMainMessage,
  speed: HudSpeed,
): HudRefusalNoticeViewModel | 'none' | undefined {
  switch (message.kind) {
    case 'simulation/status-counts': {
      const { refusal } = message.payload;
      if (refusal === undefined) return 'none';
      // `routeDecidedSince` is forwarded rather than acted on here: this
      // function serves the band, and the band's rule is `hud.ts`'s to state.
      // Spread rather than passed as `undefined`, because
      // `exactOptionalPropertyTypes` is on and the field is `true`-or-absent.
      //
      // `outlivedBandTicks` is *computed* here rather than forwarded, and it
      // is the one thing this translator decides. The arithmetic is a
      // subtraction of two integers the payload already carries -- the tick
      // this readout is about and the tick the refusal happened on -- so the
      // wire gains no member for it (`refusalSchema` is unchanged). This
      // module is the composition root's helper and is allowed to know both
      // sides of the boundary, which is why the simulation's own constant can
      // be imported here and must not be copied into `src/ui/hud/`: a second
      // copy of a tick budget on this side would disagree with the simulation
      // the day the balance moved, exactly as `HudClockViewModel`'s
      // `dayLengthTicks` comment says of the day length.
      //
      // **`speed` is a parameter and still no wire member**, which is the
      // cheapest honest answer to "where does the threshold's scale come
      // from" (the owner's *"Skalować sufit prędkością"*, 2026-09-20). The
      // main thread already holds the current speed: `simulation/clock-state`
      // carries it, `hudClockFromWorkerMessage` puts it on
      // `HudClockViewModel.speed`, and `src/main.ts` has that value in hand on
      // the same publication this function is reading. Putting the speed on
      // `simulation/status-counts` instead would have added a fifth member to
      // `refusalSchema` -- and `documented-wire-schema-membership-contract`
      // would then require naming it in every document that enumerates that
      // shape, `docs/adr/STATUS-QUEUE.md` among them -- to carry a fact the
      // receiving thread was already holding.
      //
      // **The caller passes the speed the clock is running at now, and a
      // paused clock keeps the last one it ran at.** That stickiness is
      // `hudClockFromWorkerMessage`'s own documented behaviour and it is
      // load-bearing here rather than incidental: `1` is the shortest
      // threshold, so a paused clock reported as x1 would shrink the budget
      // under a standing refusal.
      return {
        sequence: refusal.sequence,
        labelKey: REFUSAL_LABEL_KEYS[refusal.reason],
        ...(refusal.routeDecidedSince === true ? { routeDecidedSince: true as const } : {}),
        ...(refusalBandCeilingPassed(refusal.tick, message.payload.tick, speed)
          ? { outlivedBandTicks: true as const }
          : {}),
      };
    }

    // The session is over, so the band empties -- the same thing the list
    // does, and for the same reason: a refusal by a simulation that no longer
    // exists is not something the player can act on.
    case 'simulation/stopped':
      return 'none';

    default:
      return undefined;
  }
}

/**
 * `row` in place of the row sharing its id, or appended if there is none.
 *
 * In place rather than moved to the end, because the position of a row the
 * player is already reading must not change under them when the same fault
 * recurs -- the same property `HudAlertViewModel.id` exists for. Rebuilt as a
 * new array rather than mutated: the view model is a value, and `src/main.ts`
 * replaces the whole field.
 */
function replaceOrAppend(
  previous: readonly HudAlertViewModel[],
  row: HudAlertViewModel,
): readonly HudAlertViewModel[] {
  return previous.some((existing) => existing.id === row.id)
    ? previous.map((existing) => (existing.id === row.id ? row : existing))
    : [...previous, row];
}
