import type { LocalizationKey } from '../../content/localization';

/**
 * Every message key the HUD can render.
 *
 * ADR 0011: the HUD contains no literal user-facing text. A key is a stable
 * ASCII identifier that never reaches a player; the text is resolved at
 * render time through the localization runtime and an unresolved key renders
 * as itself -- visible, greppable and obviously wrong in a screenshot rather
 * than a blank gap.
 *
 * Collected in one frozen object so `tests/unit/ui-hud-messages.test.ts` can
 * assert that the bundled default catalog resolves all of them. A key added
 * here without a default-locale entry fails `pnpm test` rather than shipping
 * as raw dotted text on someone's screen.
 */
export const HUD_MESSAGE_KEY = {
  statusRegion: 'hud.status.title',
  prisoners: 'hud.status.prisoners',
  /**
   * How many prisoners have no bed, as a badge under the `PRISONERS` chip
   * (issue #609).
   *
   * **The wording is the owner's and was signed off before it was built**:
   * *"N with no bed"*. It counts what is **missing** rather than what is
   * fine -- "N housed" was the rejected alternative -- and it deliberately
   * echoes the Intake panel's existing sentence, `hud.intake.no-place`
   * (*"{count} waiting with no bed to sleep in"*), so a player meets the same
   * fact in the same words in two places and connects them.
   *
   * The two counts are siblings rather than the same number, and the shorter
   * wording is what says so. The Intake panel's is *arrivals a bed would
   * house right now* -- prisoners standing at `accommodation-assignment` with
   * no free place. This one is *every prisoner without a bed*, which also
   * covers the prisoner whose bed was taken out from under them (ADR 0028
   * decision 2). In the prison issue #609 measured -- twelve admitted into
   * three beds -- both read 9.
   *
   * **Not rendered when it is zero**, which is why it is a badge that comes
   * and goes rather than a permanent chip: `coverageTone` records the reason
   * and it applies to a "0 with no bed" as much as to a green badge -- *"a
   * status strip where several things are always amber teaches players to
   * ignore amber"*.
   */
  prisonersWithoutBed: 'hud.status.prisoners-without-bed',
  staff: 'hud.status.staff',
  rooms: 'hud.status.rooms',
  incidents: 'hud.status.incidents',
  /**
   * The guard-coverage chip (issue #588).
   *
   * "Coverage" rather than "Guards", because the chip beside it already counts
   * guards: `staff` is how many the prison employs and this is how many
   * *prisoners* those guards are covering, which is the number the state's
   * withholding now depends on. Naming it for the headcount would put two
   * chips on one fact and leave the fact that matters unnamed.
   *
   * The same word the Staff panel's own badge uses for the top rung
   * (`securityCoverageMet`, "Covered"), in its noun form, so the strip and the
   * panel are recognisably about one thing.
   */
  coverage: 'hud.status.coverage',
  /*
   * **`coverageDetail` stood here and is gone** -- `hud.status.coverage-detail`,
   * `'{understaffed} understaffed · {unguarded} unguarded'`, removed by the
   * owner's ruling 21 of 2026-08-31 along with its default-locale entry.
   *
   * Both directions are recorded rather than the entry simply vanishing,
   * because the reason it existed has not gone away. Issue #588 authored it so
   * that the chip's value carried the top rung while this line carried the
   * whole of the remainder *with its counts*, "so the 40s are attributable":
   * since ADR 0064 the state withholds part of the prisoner-day grant per unmet
   * need, and those two numbers are how much of the population is paying the
   * `safety` withholding and for which of the two reasons. That is a real
   * readout and the strip no longer has it.
   *
   * What removed it is a width the owner measured rather than a change of mind
   * about the readout: at 1280 a strip carrying every badge is 1,627px of
   * content in a 1,256px row, and this sentence was the second-largest single
   * contributor. `coverageBadge` (`./projection.ts`) now reuses
   * `securityCoverageShort` and `securityCoverageUnguarded`, which are authored
   * already and already on screen in the Staff panel -- so the ruling costs the
   * two counts and authors no string. The counts stay readable in full on that
   * panel.
   *
   * The key was deleted rather than left unread because an entry nobody renders
   * is content a translator will still translate: `docs/research/2026-08-30-candidate-polish-translations.md`
   * already carries a proposed Polish rendering of this exact sentence.
   */
  contraband: 'hud.status.contraband',
  /**
   * The treasury balance chip (#96).
   *
   * "Funds" rather than a currency name, because #96 decided that money is
   * the primary resource and did not name one, and ADR 0017 -- Accepted, and
   * Accepted in full -- names none either. A label that names no currency lets
   * the number be shown honestly without inventing one.
   */
  funds: 'hud.status.funds',
  /**
   * How much of the standing overdraft is still spendable, under the `FUNDS`
   * chip while the balance is negative -- the owner's ruling 18 of 2026-08-31,
   * and the owner's own words: `{remaining} left`.
   *
   * `{remaining}` is `balance - overdraftFloor`, rendered through the strip's
   * own number formatter so it groups exactly as the figure above it does
   * (`HudMetricBadge.numberParameters`). At the floor it is `0`, which is the
   * true sentence for a prison that can spend nothing.
   *
   * **The one key in this registry named after a quantity of money besides the
   * chip's own label**, and the allow-list in
   * `tests/unit/ui-hud-messages.test.ts` is extended for it rather than the
   * rule relaxed. What that rule guards against is a string inviting a number
   * no system produces; this number is produced by `Treasury` and published on
   * `simulation/status-counts`, and the rule's own exception for
   * `hud.status.funds` is the same exception one field wider.
   */
  fundsRemaining: 'hud.status.funds-remaining',
  /**
   * The full sentence behind `{remaining} left`, on the `FUNDS` chip's hover
   * tooltip and in its screen-reader text -- the owner's ruling of 2026-09-01.
   *
   * ## Why the badge does not say this itself
   *
   * It cannot. The owner first chose `{remaining} left before deliveries stop`
   * for the badge, on the condition that the badge be measured, and
   * `tests/browser/ui-overdraft-badge.spec.ts` measured it: that wording costs
   * the chip **+133px** and pushes the FUNDS chip -- eighth of nine on a row
   * whose scrollbar `hud.css` suppresses -- off the visible edge at 1280x800
   * for the whole four-digit range of the remainder. The ruling that followed
   * keeps the short badge *because it fits* and moves the name of the
   * threshold to the two places that have room for a sentence: here, and the
   * refusal alert.
   *
   * ## Why a tooltip is not where this ends
   *
   * A hover-only sentence is unreachable on touch and invisible to a player
   * who never hovers, which is the owner's standing directive against hidden
   * functionality. So this is one of **two** places the rung is named, not the
   * only one: `hud.alert.refusal.purchase.insufficient-funds` says it in full
   * when the refusal actually happens, and
   * `tests/unit/ui-hud-funds-threshold-named.test.ts` fails if either place
   * stops naming it. `createStatChip` writes the sentence into the DOM as
   * screen-reader text as well as into `title`, for the reason
   * `createIconButton` states.
   */
  fundsBeforeDeliveriesStop: 'hud.status.funds-before-deliveries-stop',
  /**
   * The same tooltip once the remainder is nothing -- the deliveries rung has
   * been reached and the sentence above would be about a future that has
   * arrived.
   *
   * Two keys rather than one with a `0` in it, because they state different
   * facts: `1,249 left before deliveries stop` is a warning and
   * `deliveries have stopped` is a report. The badge already draws the same
   * distinction in colour (`overdraftTone` in `./projection.ts` paints
   * `warning` above the rung and `danger` at it), so a single sentence here
   * would be the one channel on this chip that does not.
   *
   * **Reserved for `danger` and above the treasury floor only, since the
   * owner's ruling on issue #768.** This key used to be the sentence for
   * every balance at or below the deliveries rung, `danger` and `critical`
   * alike -- the gap `overdraftDescription`'s docblock and
   * `tests/unit/ui-hud-projection.test.ts` recorded rather than closed.
   * `fundsTreasuryFloorExhausted` below now takes `critical`, on the same
   * `atTreasuryFloor` boundary `overdraftTone` already drew the colour on.
   */
  fundsDeliveriesStopped: 'hud.status.funds-deliveries-stopped',
  /**
   * The chip's tooltip once the balance has reached the treasury floor
   * itself -- `critical`, not merely `danger` -- and the sentence the owner's
   * ruling on issue #768 asked for: colour is never the only signal, so a
   * third tone needs a third sentence rather than reusing
   * `fundsDeliveriesStopped`.
   *
   * **Chosen on exactly the boundary `overdraftTone` paints `critical` on**
   * (`atTreasuryFloor` in `./projection.ts`, over
   * `counts.treasuryOverdraftFloorMinorUnits`), not a new judgement -- see
   * `overdraftDescription`.
   *
   * **The words are player-facing copy and are owner-pending**
   * (`AGENTS.md`'s fourth exclusion): written to be the clearest available
   * sentence rather than a placeholder, but subject to the owner's revision.
   * It says two things `fundsDeliveriesStopped` does not: that the *overdraft
   * itself*, not only deliveries, is exhausted, and that nothing at all --
   * not construction, not hiring, not even the wage payment the ladder's
   * other two rungs still let through -- can spend from this balance until
   * the state pays what it owes.
   */
  fundsTreasuryFloorExhausted: 'hud.status.funds-treasury-floor-exhausted',
  /**
   * The rising "earned today" chip beside the balance (#29).
   *
   * Named for what the number is -- what this in-game day has earned so far --
   * rather than for the flow behind it, and the distinction is not cosmetic.
   * The state pays per prisoner-day at the end of the day (ADR 0017 decisions
   * 3 and 6), so the figure beside the balance is *this day's accrual*. A
   * label reading "Income", "Budget" or "Projected" would each name something
   * no system produces: there is no rate to display, no budget to spend
   * against, and nothing that forecasts past the current day.
   *
   * The one honest caveat, since the accrual prorates *current* occupancy
   * across the ticks already served (`stateIncomeAccruedByTick`): if occupancy
   * changes mid-day the figure restates the whole elapsed day at the new
   * occupancy rather than tracking what each tick actually held. "Earned
   * today" is still the right name for it -- it is what the day will pay -- and
   * nothing in `src/` can change occupancy mid-day today, because nothing can
   * admit a prisoner.
   */
  earnedToday: 'hud.status.earned-today',
  occupancy: 'hud.status.occupancy',
  occupancyValue: 'hud.status.occupancy-value',
  incidentsClear: 'hud.status.incidents-clear',
  incidentsActive: 'hud.status.incidents-active',

  clockRegion: 'hud.clock.title',
  /**
   * Names the value beside the day number for a screen reader.
   *
   * It replaced `hud.clock.time`, which labelled an `HH:MM` readout the
   * simulation never produced: there is no hour-of-day in Lockstate
   * (`docs/HUD_PROJECTIONS.md`, gap 5), so what the strip shows is the
   * position within the in-game day and the label has to say so.
   */
  clockDayProgress: 'hud.clock.day-progress',
  clockDay: 'hud.clock.day',
  clockSpeed: 'hud.clock.speed',
  /**
   * What the speed readout says instead of `×1` while the clock is stopped.
   *
   * `×1` printed identically whether the clock ran or not -- the readout was
   * written from the speed alone -- so `Day 1 / 0% / ×1` was the same screen
   * stopped as running, and the owner played a whole session against it
   * (#627, #636). The ruling on #639 is this word plus a second visual
   * channel; the greying is in `hud.css` off `data-clock-mode`, so the state
   * never rests on reading one word.
   */
  clockPaused: 'hud.clock.paused',
  transportPause: 'hud.transport.pause',
  transportPlay: 'hud.transport.play',
  transportFastForward: 'hud.transport.fast-forward',

  tabsRegion: 'hud.tabs.title',
  tabOverview: 'hud.tab.overview',
  tabBuild: 'hud.tab.build',
  tabSecurity: 'hud.tab.security',
  tabRegime: 'hud.tab.regime',
  tabRooms: 'hud.tab.rooms',

  minimapTitle: 'hud.minimap.title',
  minimapPlaceholder: 'hud.minimap.placeholder',
  /**
   * Replaces `minimapPlaceholder` the first time a click on the surface
   * actually moves the camera (issue #793): the surface still draws no map
   * (`hud.ts`'s own comment on it is unchanged and still true -- rendering
   * belongs to the renderer and does not exist yet), so "not available yet"
   * stops being the honest sentence the moment the surface has visibly *done*
   * something, and this is what replaces it. Never reverts: once a session
   * has a world the surface can navigate within, later clicks always find
   * one too (`WorldRenderView.loadedBounds` only grows -- `system.ts:340-365`
   * -- and a stopped session keeps its last one -- `simulation-snapshot-feed.ts`
   * preserves `frame.world` across `simulation/stopped`).
   */
  minimapNavigable: 'hud.minimap.navigable',
  alertsTitle: 'hud.alerts.title',
  alertsEmpty: 'hud.alerts.empty',
  /**
   * What a row of the alerts log adds to its sentence: how many times, and when
   * (the owner's decisions 1 and 2 of 2026-09-01 on ADR 0084).
   *
   * **Both sentences are the owner's own, given on the same day**, and this
   * comment records what they chose *against* because the alternatives are what
   * a later pass would otherwise re-propose:
   *
   * - `hud.alert.occurrences` is `{count}×` -- the multiplier **after** the
   *   figure, chosen over `×{count}` and over `{count} times`. `{count}` is a
   *   whole number and is at least 2 wherever this is rendered at all; a row
   *   that has arrived once shows no multiplier (`hudAlertRowLabel`).
   * - `hud.alert.time` is `Day {day}` -- the day **alone**. The owner was shown
   *   `Day {day}, {progress}%` and rejected it: a percentage of a day is a
   *   strange unit to put in front of a player. `{progress}` is still produced
   *   and passed and is deliberately not rendered; see the catalog entry, which
   *   is where that is argued, and `HudAlertTimeViewModel` for what produces
   *   it. What tells two events on the same day apart is the count beside them.
   *
   * **All three keys here were declared with no catalog entry first**, so that
   * `tests/unit/ui-hud-messages.test.ts` would fail by name until the owner
   * supplied each word -- `resolveLocalizationKey` renders an unknown key as
   * itself, which is the *"wrong shipping state"*
   * `tests/foundation/localization-key-completeness.test.ts` exists to catch,
   * and a placeholder sentence would have passed both gates with an un-owned
   * word on a player's screen. The tripwire is recorded rather than deleted
   * now that all three are filled: it is the procedure, not an incident, and
   * the next key on this surface should be added the same way.
   */
  alertsOccurrences: 'hud.alert.occurrences',
  alertsTime: 'hud.alert.time',
  /**
   * What the `×` control on a dismissable alert row is called: **"Clear this
   * alert"**, the owner's own sentence of 2026-09-01.
   *
   * The owner took ADR 0084's decision 3 that day and ruled on the *shape* of
   * the control with it: a separate `×` rather than the whole row, chosen with
   * the cost of the alternative in front of them -- pressing a row dismisses it
   * permanently, the mark goes into the save, and there is no undo, so a
   * mis-tap that cannot be reversed was judged worse than a smaller target. A
   * `×` glyph is not an accessible name, so `createIconButton` requires this
   * one: a button whose only content is a glyph reaches a screen reader as
   * nothing at all.
   *
   * **Chosen over "Dismiss this notice", and `hud.security.roster-dismiss`
   * ("Dismiss") is not reused** -- the near miss is the reason the sentence
   * looks the way it does. That word ends a staff member's employment; its own
   * hint says *"a dismissed staff member leaves the prison for good, and their
   * wage stops"*. One key meaning both "sack this person" and "I have read this
   * notice" is two answers to one question, which is the failure
   * `hud.regime.roster-name` is shared to avoid in the other direction -- and
   * a *second* sentence built on the same verb would have left **dismiss**
   * meaning two different things in one interface, which is that failure one
   * step further on. So the sentence avoids the verb instead of reusing it.
   * The catalog entry carries the argument too, because that is where a
   * translator meets it.
   *
   * No parameter: the row's own sentence is beside the control and the name
   * does not repeat it. If a locale needs the subject, this key gains one and
   * `hudAlertDismissLabel` is where it would be resolved -- `hud.ts` would not
   * change.
   */
  alertsDismiss: 'hud.alert.dismiss',

  panelCollapse: 'hud.panel.collapse',
  panelExpand: 'hud.panel.expand',

  buildTitle: 'hud.build.title',
  buildCatalogue: 'hud.build.catalogue',
  buildCatalogueEmpty: 'hud.build.catalogue-empty',
  buildSelected: 'hud.build.selected',
  buildPlacement: 'hud.build.placement',
  buildTileX: 'hud.build.tile-x',
  buildTileY: 'hud.build.tile-y',
  buildStepDown: 'hud.build.step-down',
  buildStepUp: 'hud.build.step-up',
  buildEdge: 'hud.build.edge',
  buildSubmit: 'hud.build.submit',
  buildNote: 'hud.build.note',

  buildArm: 'hud.build.arm',
  buildDisarm: 'hud.build.disarm',
  buildArmHint: 'hud.build.arm-hint',
  buildTargetNone: 'hud.build.target-none',
  buildTargetValue: 'hud.build.target-value',
  buildTargetRun: 'hud.build.target-run',
  /*
   * The readout for an aim that is on a *tile* rather than on a tile edge
   * (#550).
   *
   * A fourth key rather than reusing `buildTargetValue` with an empty `{edge}`:
   * that template is `{x}, {y} · {edge}` and an object has no edge at all, so a
   * blank interpolation would leave a dangling separator on the one line in the
   * panel that says where the player is aiming. Reusing it would also make the
   * separator content's problem to remove, in every locale, rather than this
   * layer's problem to not print.
   *
   * It is the readout for both halves of the object tool -- placing and
   * removing -- because both are one press on one tile and the tile is the
   * whole of what "where" means for either. What is *standing* on that tile is
   * the simulation's to know and the ghost's to draw.
   */
  buildTargetTile: 'hud.build.target-tile',
  buildCoordinates: 'hud.build.coordinates',
  buildCoordinatesHint: 'hud.build.coordinates-hint',
  /*
   * The removal mode's four keys (ADR 0028 phase 3).
   *
   * `buildRemove` and `buildRemoveActive` are the two labels of one toggle,
   * spelled the way `roomsRemove`/`roomsRemoveActive` are because they are the
   * same control on a different surface: the button says what pressing it will
   * do, so it reads "Remove" while off and "Stop removing" while on.
   * `buildRemoveHint` replaces the arm hint in the note line, which is one line
   * tall either way so the controls under it cannot move. `buildRemoveSubmit`
   * relabels the numeric route's one submit button, because that route is
   * removal's keyboard half and a button saying "Place order" must not clear a
   * tile.
   */
  buildRemove: 'hud.build.remove',
  buildRemoveActive: 'hud.build.remove-active',
  buildRemoveHint: 'hud.build.remove-hint',
  buildRemoveSubmit: 'hud.build.remove-submit',

  /**
   * The purchase surface (#89).
   *
   * `buildBuy` labels the disclosure that sits beside "Place on map" and
   * costs the panel no height of its own; the other three label the row it
   * reveals. None of them names a currency, for the reason `funds` does not:
   * #96 decided money is the primary resource and named no currency, so the
   * figures are rendered as the plain minor units every price in
   * `src/content/procurement-catalog.ts` is quoted in.
   *
   * `buildBuySubmit` states the quantity, the material and the total in one
   * sentence, so the button says what pressing it will spend rather than
   * leaving the player to multiply. The step buttons reuse `buildStepDown`
   * and `buildStepUp` with the quantity field's own label -- a second pair
   * saying "Decrease quantity" would be the same sentence maintained twice.
   */
  buildBuy: 'hud.build.buy',
  buildBuyQuantity: 'hud.build.buy-quantity',
  buildBuySubmit: 'hud.build.buy-submit',
  buildBuyHint: 'hud.build.buy-hint',
  /**
   * **What stops a Buy press, and what would lift it** -- the wording half of
   * issue #772, authored by the owner on 2026-09-03.
   *
   * #772 split itself in two: *"the cheap, obviously-correct half is to use
   * the number that already exists"*, and *"the half that is a decision, and
   * so is not an agent's to take: what the control says"*. PR #799 shipped the
   * first half on this button and PR #807 shipped it on `securityStaffHire`,
   * and both said so in their own comments -- *"this is the mechanical half
   * only"*, with the wording left to the owner under `AGENTS.md`'s fourth
   * exclusion. This key is the second half.
   *
   * The sentence is the owner's, given as a choice among four candidates and
   * chosen verbatim: *"Not enough money — you need {amount} more."* Nothing
   * here paraphrases it, and the em dash is theirs.
   *
   * `{amount}` is the **shortfall** --
   * `AffordabilityVerdict.shortfallMinorUnits` (`src/ui/affordability.ts`),
   * `charge - (balance - floor)` -- and not the price, which the button's own
   * label already states, nor the balance, which the FUNDS chip already
   * states. Formatted through `HudLocalizer.formatNumber` like every other
   * money figure on this HUD, in the same minor units and with no currency
   * (#96).
   *
   * **It is one of the money words this panel's keys otherwise avoid, and
   * that is why the key is named for the gap rather than for the money**: the
   * sentence says "money" because the owner's sentence says it, and
   * `tests/unit/ui-hud-messages.test.ts`'s allow-list is about *keys* that
   * imply an income or a standing cost. A shortfall is neither.
   *
   * **Its twin is `securityStaffHireShortfall`, and the two carry byte-identical
   * text.** One authored sentence, two call sites, on this file's own standing
   * rule for that: *"a key here is a call site and never a string pool"*
   * (`src/content/default-locale-en.ts`, at the four insolvency refusals), the
   * precedent being `hud.build.step-up` / `hud.rooms.step-up`. What keeps them
   * identical is a test rather than a shared key --
   * `tests/unit/ui-hud-refusal-shortfall.test.ts` pins both against the
   * owner's sentence and against each other.
   */
  buildBuyShortfall: 'hud.build.buy-shortfall',
  /**
   * The queue block, which is what #348 made worth building.
   *
   * Construction now builds one order at a time, so a twelve-segment run
   * finishes at tick 730 rather than 70 -- and nothing on screen said a queue
   * existed. `buildQueue` labels the fold, `buildQueueCount` is the figure in its
   * header (the whole queue, not the rows that fit), and `buildQueueOrder` is one
   * row: what it is, where it is, which edge, and what it is waiting for. The
   * state's own word comes from `build-order-state` in
   * `src/content/simulation-message-keys.ts` rather than from a key here, for the
   * reason the edge labels do -- it is a projected simulation enum, and a second
   * set of words for it here would drift.
   *
   * `buildQueueCancel` is the badge on every row saying what pressing it does.
   * A row that only named an order would be a control whose action a player has
   * to guess, and this one is destructive.
   *
   * `buildQueueUnnamed` is for an order whose buildable the host names no key
   * for -- possible by construction (`docs/HUD_PROJECTIONS.md` gap 32) and not
   * reachable with the shipped catalogue. The row is still drawn, because an
   * order nobody can name is still an order a player may want to withdraw.
   *
   * `buildQueueMore` states how many orders are queued behind the last row
   * shown, and the reason there is no control to reach them is in
   * `BUILD_QUEUE_ROW_LIMIT`: the list is the crew's schedule, so the rows are
   * the orders that are about to happen, and taking a whole run back is what
   * `Undo` is for.
   *
   * `buildQueueShortfall` is the queue's one sentence about **money**, and it
   * is the only member of this group that is not a fact about rows (#627,
   * #629, #640). It is drawn outside the fold, unlike everything above it: the
   * queue section starts collapsed, and #625 is the record of what that costs
   * -- *"Awaiting Materials"* lived inside it and reached nobody. `{total}` is
   * `HudBuildQueueMaterialsFundingViewModel.shortfallMinorUnits`, in the same
   * minor units as the status strip's Funds chip, which is the comparison the
   * projection says the figure exists for.
   */
  buildQueue: 'hud.build.queue',
  buildQueueCount: 'hud.build.queue-count',
  buildQueueOrder: 'hud.build.queue-order',
  buildQueueCancel: 'hud.build.queue-cancel',
  buildQueueUnnamed: 'hud.build.queue-unnamed',
  buildQueueMore: 'hud.build.queue-more',
  buildQueueShortfall: 'hud.build.queue-shortfall',
  /**
   * What has been bought and has not arrived, inside the buy disclosure (#285).
   *
   * These label the one surface in the interface that says money is in transit,
   * and they sit **beside the control that spent it** rather than in a block of
   * their own -- see `PENDING_DELIVERY_ROW_LIMIT` for the measurement that
   * decided that, which is a fact about the panel's height rather than a
   * preference about layout.
   *
   * **Corrected 2026-08-31 (issue #703 ruling 2): they are no longer inside that
   * disclosure**, and the words are unchanged by the move -- no key here was
   * added, removed or re-authored. What changed is that they are now read
   * without a press, so *"what cancelling it gives back"* is the sentence a
   * player meets on arrival at a prison that has bought its own bricks (#640)
   * rather than one they went looking for. `beside the control that spent it` is
   * still true of a purchase the player pressed *Buy* for and no longer true of
   * one the game made for them, which is the reason the block moved.
   *
   * `buildDeliveries` labels the group and `buildDeliveriesCount` is the figure
   * beside it: how many purchases are out and what they would refund. The refund
   * total is the number #285 is about -- the status strip says what is left, and
   * nothing said what is out.
   *
   * `buildDelivery` is one row: how much of what, and what cancelling it gives
   * back. `buildDeliveryCancel` is the control's own word, because a row that
   * only named a delivery would leave a player guessing what pressing it does.
   * Neither names a currency, for the reason `buildBuySubmit` does not.
   *
   * `buildDeliveryUnnamed` is for a delivery whose item the host names no key
   * for. The row is still drawn: money nobody can label is still money, and
   * dropping the row would hide the only control that recovers it.
   *
   * `buildDeliveriesMore` states how many purchases are behind the last row, and
   * unlike `buildQueueMore` it names no alternative control -- there is no
   * `Undo` for a purchase. It says what actually happens instead: the rows are
   * the deliveries arriving soonest, and the rest come into view as those land.
   */
  buildDeliveries: 'hud.build.deliveries',
  buildDeliveriesCount: 'hud.build.deliveries-count',
  buildDelivery: 'hud.build.delivery',
  buildDeliveryCancel: 'hud.build.delivery-cancel',
  buildDeliveryUnnamed: 'hud.build.delivery-unnamed',
  buildDeliveriesMore: 'hud.build.deliveries-more',

  /**
   * The Staff panel on the Security tab
   * ([ADR 0025](../../../docs/adr/0025-guard-hiring-surface.md)).
   *
   * `securityStaffTitle` names the panel and `securityStaffRoles` the list of
   * roles it can hire; `securityStaffHire` is the one action, and it states
   * the role and what the press will spend in a single sentence so that the
   * figure is a statement about the button rather than a standalone readout
   * -- exactly the distinction `hud.build.buy-submit` draws, and the reason
   * neither key carries a money word.
   *
   * None of them names a currency, for the reason `funds` does not: #96
   * decided money is the primary resource and named no currency, so the
   * figure is rendered as the plain minor units the treasury, the procurement
   * catalogue and the staff-role catalogue's wage bands are all quoted in.
   *
   * `securityStaffHint` is the sentence under the action, and since issue #639
   * ruling 2 it carries **two** figures rather than none: what one press spends
   * and what the same person bills at every in-game day boundary afterwards. It
   * said *"Taken from the treasury on hire"* until then, which read as a fee
   * paid once while `PayrollSystem` charged the same figure every day -- the
   * player-visible promise the code does not keep that `AGENTS.md` reserves to
   * the owner, whose replacement sentence it now holds verbatim.
   *
   * **It is the one key on this panel that names the money word**, and that is
   * deliberate rather than an exception to the paragraph above: "wages" is a
   * category, not a currency, and it is here so that a player meets the word
   * once with a price attached and again on the `securityRosterTitle` header,
   * which since the same ruling carries the standing daily bill as a trailing
   * figure.
   */
  securityStaffTitle: 'hud.security.staff',
  securityStaffRoles: 'hud.security.roles',
  securityStaffRolesEmpty: 'hud.security.roles-empty',
  securityStaffSelected: 'hud.security.selected',
  securityStaffHire: 'hud.security.hire',
  securityStaffHint: 'hud.security.hire-hint',
  /**
   * What stops a Hire press, and what would lift it: the owner's sentence of
   * 2026-09-03, byte-identical to `buildBuyShortfall`'s.
   *
   * A key of its own rather than the Build panel's, for the reason that key's
   * docblock gives at length and this file's own rule states: one call site,
   * one key. `{amount}` here is the shortfall against
   * `staffHireCostMinorUnits` -- the engagement fee one press debits, which is
   * what `src/main.ts` judges and therefore what `paintHire` compares -- and
   * deliberately not the daily wage `securityStaffHint` beside it prices (see
   * `paintHire`'s own comment on which of a hire's two costs is a press).
   */
  securityStaffHireShortfall: 'hud.security.hire-shortfall',
  /**
   * And what the press gets you, which is a guard and not yet a post.
   *
   * `securityStaffUnassigned` is the second half of the sentence
   * `securityStaffHint` used to be, restored as a key of its own when the
   * owner's approved replacement took the whole of that value (issue #639
   * ruling 2, approved 2026-08-30). Two keys rather than one string with two
   * sentences because the panel has to render them as two elements: the short
   * viewport clamp in `hud.css` cuts a two-line note to one line, and the
   * clause a player needs -- that the new guard is posted nowhere -- is the one
   * that would be cut. Only the second element is exempted from that clamp, so
   * splitting the key is what makes the exemption addressable at all.
   */
  securityStaffUnassigned: 'hud.security.hire-unassigned',

  /**
   * The Staff panel's held-guards list
   * ([ADR 0034](../../../docs/adr/0034-releasing-a-claimed-guard.md)).
   *
   * `securityHeldTitle` names the section and `securityHeldSummary` states the
   * pair that makes a release a decision rather than a button -- how many guards
   * are held against how many are free. `securityHeldRow` is one row: who, and
   * what is holding them. `securityHeldRelease` is the action, and it names no
   * claim, because a release does the same thing whatever held the guard --
   * which is ADR 0034's whole shape and would be undone by three verbs.
   *
   * `securityHeldEmpty` exists because a blank rectangle is indistinguishable
   * from a broken one, the rule `hud.security.roles-empty` follows one section up.
   * `securityHeldMore` is the overflow line, in the shape
   * `hud.build.deliveries-more` set: the list is windowed to the panel's row
   * budget and the header counts the whole roster, so the difference has to be
   * said rather than implied by a list that stops.
   */
  securityHeldTitle: 'hud.security.held',
  securityHeldSummary: 'hud.security.held-summary',
  securityHeldEmpty: 'hud.security.held-empty',
  securityHeldRow: 'hud.security.held-row',
  securityHeldRowUnnamed: 'hud.security.held-row-unnamed',
  securityHeldRelease: 'hud.security.held-release',
  securityHeldMore: 'hud.security.held-more',
  securityHeldHint: 'hud.security.held-hint',
  /**
   * The Staff panel's roster block (issue #533, the owner's decision on issue
   * #535 decision 4). Three keys, and the count is deliberate: **every string
   * this change adds is flagged for the owner's review**, so the block reuses
   * `securityHeldRow`, `securityHeldRowUnnamed` and `securityHeldMore` rather
   * than duplicating them and only drafts what has no existing equivalent.
   *
   * The reuse of `securityHeldRow` -- `'{name} · {claim}'` -- is worth naming
   * because its placeholder is called `claim` and what fills it here is a
   * *deployment phase*. The rendered sentence is the same shape and the same
   * fact about a person on a row, so a second key would be two sentences to
   * translate identically; the mismatch is in the placeholder's name alone and
   * is recorded here rather than papered over.
   *
   * `securityRosterEmpty` is absent for a reason rather than forgotten: the
   * block has no box at all until somebody is hired, so there is no empty state
   * to word. `securityRosterSummary` likewise -- the overflow line already says
   * how many did not fit.
   */
  securityRosterTitle: 'hud.security.roster',
  /**
   * The standing daily wage bill, as the collapsed header states it.
   *
   * `securityRosterWageBill` is the *sentence* around the figure, not the
   * figure: `'{total} a day'`. The badge is a trailing element on a section
   * that starts shut, so it is all a player sees of the payroll until they open
   * it -- and beside a header that names people, the figure alone reads as a
   * headcount. `buildQueueCount` is the same mechanism one panel over and has
   * never been bare for the same reason.
   *
   * It is the second key in this registry whose *name* carries a money word,
   * and `tests/unit/ui-hud-messages.test.ts` has to allow it by name: that gate
   * refuses a label for a flow nothing renders, and the flow this one names is
   * rendered by the block that owns this key.
   */
  securityRosterWageBill: 'hud.security.roster-wage-bill',
  securityRosterDismiss: 'hud.security.roster-dismiss',
  securityRosterHint: 'hud.security.roster-hint',

  /**
   * The Staff panel's coverage block
   * ([ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md)
   * consequence 1).
   *
   * `securityCoverageTitle` names the block and `securityCoverageSummary` is
   * the pair the whole readout is about -- how many guards are assigned against
   * how many the prison asks for -- in the shape `hud.status.occupancy-value`
   * already set for a figure against its ceiling.
   *
   * Three badge words rather than a colour, for the reason
   * `hud.status.incidents-active` carries one: the tone is an addition to the
   * word and never a replacement for it, so the block reads the same in
   * monochrome and to a screen reader. They name three different prisons and
   * not three shades of one -- `securityCoverageMet` has what it asks for,
   * `securityCoverageShort` has some of it, and `securityCoverageUnguarded` has
   * nobody on duty at all, which is the rung of ADR 0048 decision 5's ladder
   * where one hire is the whole of the difference between a prison that riots
   * and one that does not.
   *
   * Each badge has a hint under it, and two of the three name the **action**
   * rather than restating the diagnosis: the hire control is the next thing in
   * this panel, so "understaffed" without "hire {count} more" would be a
   * sentence that stops one line short of the button that answers it.
   *
   * `{count}` is the shortage rather than the requirement, so the number in the
   * sentence is the number of presses. No plural form: `HudLocalizer` exposes
   * `format` and not `formatPlural`, and both sentences are worded to read
   * correctly at every count rather than at all but one of them.
   */
  securityCoverageTitle: 'hud.security.coverage',
  securityCoverageSummary: 'hud.security.coverage-summary',
  securityCoverageMet: 'hud.security.coverage-met',
  securityCoverageMetHint: 'hud.security.coverage-met-hint',
  securityCoverageShort: 'hud.security.coverage-short',
  securityCoverageShortHint: 'hud.security.coverage-short-hint',
  securityCoverageUnguarded: 'hud.security.coverage-unguarded',
  securityCoverageUnguardedHint: 'hud.security.coverage-unguarded-hint',
  /**
   * **What an empty post costs, on the one rung where the cost is total** --
   * the owner's chosen sentence of 2026-09-03, and the only sentence in this
   * registry that states a consequence of a staffing state rather than the
   * state or the action.
   *
   * The paragraph above says two of the three hints "name the **action**
   * rather than restating the diagnosis". This is the third thing a coverage
   * block can be about and it is neither: `securityCoverageUnguardedHint`
   * keeps the action and its count, and this says what is being paid while
   * nobody presses it. It is a separate key rather than a longer hint because
   * the two have different lifetimes -- a rebalanced requirement rewords the
   * action, a rebalanced provisioning table rewords this -- and because the
   * hint is line-clamped at short viewports and this sentence is a whole
   * clause or nothing (`.hud-staff__coverage-consequence` in `./hud.css`,
   * which follows `.hud-staff__hire-unassigned`'s exemption).
   *
   * **Only on the `unguarded` rung, and that is a fact about the multiplier
   * rather than about emphasis.** `SAFETY_COVERAGE_PROVISION_MULTIPLIER`
   * (`src/simulation/prisoners/needs.ts`) is `1` / `0.5` / `0` over
   * `covered` / `understaffed` / `unguarded`, so this is the one rung where
   * the provisioning is *nothing* and the sentence's "nobody" is exact. The
   * middle rung still costs a long-stayer their safety and is deliberately
   * left unsaid here: at half provisioning the net rate is -0.01 a tick and
   * the sentence would need a different verb, which is copy nobody has
   * authored.
   */
  securityCoverageUnguardedConsequence: 'hud.security.coverage-unguarded-consequence',

  /**
   * Labels for the two `BUILDABLE_REGISTRY` entries whose ids name no content
   * entry.
   *
   * Two of four since ADR 0028 phase 2, and it is these two that stay: a
   * buildable with a `placesObjectId` is labelled by that object's own
   * `nameKey` (`buildableLabelKey` in `src/main.ts` records why), so `bed-wooden`
   * reads `object.bed.name` and `toilet-brick` reads `object.toilet.name` and
   * neither needs a key here. `wall-brick` and `door-wooden` place no object and
   * therefore still do.
   *
   * They live here, in the HUD's own namespace, because that registry carries
   * a hard-coded English `name` and no `nameKey` -- an ADR 0011 gap issue #74
   * records and leaves to the content layer (`docs/HUD_PROJECTIONS.md`, gap
   * 32). When a buildable gains a real `content.*` key these two go away and
   * the host passes the catalog's key through instead; nothing else changes,
   * because the panel already renders whatever key it is handed.
   */
  buildableWallBrick: 'hud.build.buildable.wall-brick',
  buildableDoorWooden: 'hud.build.buildable.door-wooden',

  /**
   * The catalogue's category filter (#390,
   * [ADR 0035](../../../docs/adr/0035-buildable-catalogue-category-filter.md)).
   *
   * **Three keys, not eight.** The seven groups a player can choose between
   * are the seven categories `src/content/object-catalog.ts` authors, and each
   * is named in the *content* namespace by `OBJECT_CATEGORY_NAME_KEYS` -- the
   * same split `buildableWallBrick` above already lives on the other side of.
   * A `hud.build.category.furniture` key here would author a second English
   * word for a content fact and let the two drift, which is the mistake
   * `buildableLabelKey`'s comment in `src/main.ts` refuses for row labels.
   *
   * These three are the panel's own, because none of them names content:
   *
   *   - `buildCategory` is the control's accessible name. The filter sits in
   *     the catalogue's header row beside a 44px eyebrow, with no room for a
   *     visible label of its own, so this is an `aria-label` -- which is
   *     allowed here and not a tooltip-only label, because the control shows
   *     its own current value as its visible text.
   *   - `buildCategoryAll` is the option that filters nothing, and it is the
   *     arrival state: the panel arrives showing every row, exactly as it did
   *     before this filter existed, so nothing a player already knew moved.
   *   - `buildCategoryStructure` is the group for the two buildables that
   *     place no object -- `wall-brick` and `door-wooden` -- and so belong to
   *     no `ObjectCategory`. It is a HUD key rather than a content one for the
   *     same reason the two labels above it are: there is no content entry to
   *     read it off.
   */
  buildCategory: 'hud.build.category',
  buildCategoryAll: 'hud.build.category-all',
  buildCategoryStructure: 'hud.build.category.structure',

  /**
   * The intake surface (#261 step 4).
   *
   * `intakeHint` is not decoration and is not a disclaimer. A control that can
   * be refused has to say why *before* it is pressed as well as after -- the
   * refusal line answers "that did not happen", and the hint answers "and here
   * is what this control needs". The two sentences are different jobs and
   * neither replaces the other.
   *
   * **The hint used to describe a refusal that does not exist**, and this note
   * used to defend it: it said an admission needs "a room to hold them", and
   * the note here said every press was refused "until something in the
   * application can zone a room". Neither survived contact with a played
   * prison (issue #549). `IntakeSystem.hasAccommodationTarget` refuses on a
   * prison that holds no *instance* of a housing room type -- it never asks
   * whether a place in one is free -- so a one-bed cell took twelve admissions,
   * housed one, and left eleven waiting at Cell Assignment while the panel's
   * own sentence said that could not happen.
   *
   * `intakeNoPlace` is the other half of that correction and the reason the
   * hint does not have to carry a warning: the hint states the standing rule,
   * and this states what is true of *this* prison right now. It is the one
   * toned figure on the panel, it sits beside the control that produces it, and
   * it says nothing at all until the prison actually runs out of beds -- see
   * `HudIntakePipelineViewModel.waitingWithoutPlace` for why that is not the
   * `accommodation-assignment` stage count.
   */
  intakeTitle: 'hud.intake.title',
  intakeAdmit: 'hud.intake.admit',
  intakeHint: 'hud.intake.hint',
  intakeNoPlace: 'hud.intake.no-place',

  /**
   * Where the arrivals the player has already admitted are (#104's channel,
   * third consumer).
   *
   * Four keys for one readout, and the split is the readout's whole point.
   * `intakePipeline` and `intakePipelineCount` are the block's header -- the
   * eyebrow, and how many of the prison's people are still in intake.
   * `intakePipelineStage` is one line per stage that holds somebody, and the
   * stage's *own* name is interpolated into it from the key the simulation's
   * enum catalog derives (`intake-stage.*.name`), never authored here.
   *
   * `intakePipelineFailed` is a separate sentence rather than a fifth stage
   * line, because the fact is a different kind: an arrival waiting for a cell
   * is released the moment a place exists, and one in the terminal `failed`
   * stage is released by nothing at all (ADR 0028 decision 8). One sentence
   * covering both would tell a player that building something will help when
   * it will not.
   */
  intakePipeline: 'hud.intake.pipeline',
  intakePipelineCount: 'hud.intake.pipeline-count',
  intakePipelineStage: 'hud.intake.pipeline-stage',
  intakePipelineFailed: 'hud.intake.pipeline-failed',

  /**
   * What the player is told when a control's action was refused (issue #207).
   *
   * One key per *command* intent rather than one generic sentence, because
   * each command leaves the prison in a different state and a player acting
   * on the message needs to know which: a refused clock change leaves the
   * simulation running exactly as it was, a refused build order leaves
   * nothing queued, a refused purchase leaves the money where it was, and a
   * refused undo or redo leaves in place whatever the player was trying to
   * take back or reapply.
   *
   * `refusalPurchaseMaterials` covers both ways a purchase is refused before
   * it is sent -- no session at all, and a total the last published balance
   * cannot cover -- because they leave the prison in the same state and there
   * is nothing different for the player to do about them. What it does *not*
   * cover is a refusal the worker makes after accepting the command, and that
   * is a division of labour rather than a gap: since #261 all eight command
   * routes record to the session's `RefusalLog`
   * (`src/simulation/runtime/session-commands.ts`), and the sentence comes
   * from `hud.alert.refusal.*` -- the simulation's own vocabulary, mapped in
   * `src/ui/simulation-alerts.ts`, which can say *why* where these keys can
   * only say *what*. Both land on the same band; see the refusal element in
   * `hud.ts` for the one-line rule that governs it.
   *
   * Deliberately no key for the thrown `Error`'s own text. Those messages are
   * hard-coded English raised on the main thread (`src/ui/simulation-commands.ts`,
   * `src/main.ts`), so putting one on screen would put untranslated text in
   * the HUD -- which ADR 0011 and `tests/unit/ui-hud-messages.test.ts` forbid.
   * The diagnostic detail stays with the host through `MountHudOptions.onError`;
   * what reaches the player is a localized sentence about the outcome.
   */
  /**
   * The Rooms panel (ADR 0022, amended).
   *
   * A dedicated tab rather than a block inside Build, which is the surface the
   * owner chose over that ADR's original decision: the Build panel's whole
   * always-visible budget at 900x600 is 7.81px, and this panel needs a
   * confirm step, a removal control, a minimum-size rule, an enclosure
   * readout and a catalogue of eighteen rows. Those are the strings for all
   * five.
   *
   * `roomsConfirm` and `roomsCancel` are the confirm step, and it is a step
   * rather than a straight submit for a reason the removal control does not
   * remove: a designation can cover 4,096 tiles, and while `UnzoneRoom` now
   * makes that recoverable, "recoverable" is not the same as "costless" --
   * removal grows each covered tile into the whole room instance that claims
   * it, so clipping one corner of a 6x6 canteen still takes all 36 tiles. Two
   * Point Hospital puts a confirm on the same gesture for the same reason.
   *
   * This used to add "so undoing an accidental overlap of two rooms takes both
   * away", and #337 made that false: removal is bounded to the instance the
   * tile belongs to, resolved through the rectangle rather than by flooding the
   * same-type region, so a neighbour of the same type survives. The confirm
   * still earns its place on the clause above it.
   *
   * `roomsMinimum` states the authored floor, so the rule is readable *before*
   * the drag rather than only in the refusal after it. `roomsEnclosureSealed`
   * and `roomsEnclosureOpen` are the readout of what the simulation actually
   * found.
   *
   * **`roomsEnclosureOpen` gained a second render location in issue #493, not
   * a second key.** `paintNote` now shows the identical sentence, before the
   * press, when the pending rectangle is open against a room type that
   * requires enclosure -- reusing this key rather than drafting a differently
   * worded one for the same fact, which is exactly the kind of pair
   * `docs/LOCALIZATION.md` would flag as drift the day one of the two changed
   * and the other did not.
   *
   * **There used to be a `roomsEnclosureOpenRequired` here** -- "the one case
   * that is worth flagging: the room asked to be enclosed and the rectangle's
   * perimeter is not. It is a *warning*, never a refusal." It is deleted, and
   * the deletion is the point rather than a tidy-up. `RoomZoningService.zone`
   * now refuses that pair (the ADR "Must a zoned room be enclosed"), so an
   * *accepted* zoning can no longer report it and the branch that read the key
   * was unreachable in every session, fresh or restored -- an orphaned locale
   * key, which `docs/LOCALIZATION.md` treats as a defect class. The sentence is
   * not lost: it is `hud.alert.refusal.zone.not-enclosed`, said at the moment
   * the player can still act on it.
   */
  roomsTitle: 'hud.rooms.title',
  roomsCatalogue: 'hud.rooms.catalogue',
  roomsCatalogueEmpty: 'hud.rooms.catalogue-empty',
  roomsSelected: 'hud.rooms.selected',
  roomsArm: 'hud.rooms.arm',
  roomsDisarm: 'hud.rooms.disarm',
  roomsArmHint: 'hud.rooms.arm-hint',
  roomsRemove: 'hud.rooms.remove',
  roomsRemoveActive: 'hud.rooms.remove-active',
  roomsRemoveHint: 'hud.rooms.remove-hint',
  roomsArea: 'hud.rooms.area',
  roomsAreaNone: 'hud.rooms.area-none',
  roomsAreaValue: 'hud.rooms.area-value',
  roomsConfirm: 'hud.rooms.confirm',
  roomsConfirmRemove: 'hud.rooms.confirm-remove',
  roomsCancel: 'hud.rooms.cancel',
  roomsMinimum: 'hud.rooms.minimum',
  roomsMinimumNone: 'hud.rooms.minimum-none',
  roomsTooSmall: 'hud.rooms.too-small',
  roomsEnclosure: 'hud.rooms.enclosure',
  roomsEnclosureNone: 'hud.rooms.enclosure-none',
  roomsEnclosureSealed: 'hud.rooms.enclosure-sealed',
  roomsEnclosureOpen: 'hud.rooms.enclosure-open',
  roomsRequirementEnclosed: 'hud.rooms.requirement-enclosed',
  roomsRequirementOutdoors: 'hud.rooms.requirement-outdoors',
  roomsRequirementNone: 'hud.rooms.requirement-none',
  /*
   * What a room type will need standing in it, read before the drag (#529,
   * #535 decision 2).
   *
   * These two join `roomsMinimum` and `roomsRequirement*` in the rule block,
   * in the same voice as `roomsMinimum` -- which already reads "Needs at least
   * {width} x {height} tiles" -- so the block reads as one series of statements
   * about the selected room type:
   *
   *     Needs at least 6 x 6 tiles
   *     Must be enclosed
   *     Needs 2 x Dining Table
   *     Needs 4 x Bench
   *
   * That is why `roomsRequiresObject` repeats the verb rather than sitting
   * under a "Requires:" heading. A heading would cost a line of a panel whose
   * always-visible budget ADR 0022 measured at 7.9px, and would make the object
   * lines read as a different kind of statement from the size line directly
   * above them -- which they are not: all of them are the authored catalogue,
   * true before a single tile is dragged.
   *
   * **They are `hud.rooms.requires-*` and not `hud.rooms.needs-*`, and the
   * distance between those prefixes is load-bearing.** `needs-*` below is what
   * a *particular zoned room* is short right now: instance state, pulled over
   * the projection channel, revised as the player builds, and able to be
   * uncountable. These are content -- what the *type* asks for, supplied once
   * at mount, true of a room nobody has zoned. Two blocks, two prefixes, two
   * verbs ("Needs ..." against "is missing"), so a player cannot read a
   * statement about the catalogue as a statement about their prison.
   *
   * `roomsRequiresNone` exists for the reason `roomsMinimumNone` and
   * `roomsRequirementNone` do: silence is ambiguous once its neighbours speak.
   * `room.yard` authors no object requirement at all, and with every other room
   * type listing its objects, a yard that simply said nothing would read as a
   * panel that had failed rather than as a room that needs nothing.
   *
   * The object's name is substituted from the object catalogue's own `nameKey`
   * and never authored here -- the rule `roomsNeedsObjectUnknown` below already
   * states -- and that key is reused as the stand-in when the catalogue defines
   * nothing under the id, rather than a second stand-in being drafted for the
   * identical hole.
   */
  roomsRequiresObject: 'hud.rooms.requires-object',
  roomsRequiresNone: 'hud.rooms.requires-none',
  /*
   * The typed route to a rectangle (#411).
   *
   * Four numbers and the disclosure that holds them, so a rectangle can be
   * *said* as well as dragged. `AGENTS.md` boundary 10 is not satisfied by "it
   * works with a mouse", and until this existed the Rooms panel was the one
   * surface in the HUD with no keyboard producer at all -- which made the game
   * unfinishable without a pointer, because zoning gates accommodation and
   * accommodation gates every admission.
   *
   * `roomsCatalogue` is reworded rather than left alone, and that is what these
   * keys cost the panel besides themselves: the section that holds the room
   * list now holds this form at its foot, so a header reading "Room type" would
   * name half of its own contents -- the ADR 0011 objection ADR 0022 used
   * against putting the Rooms panel behind an existing tab.
   *
   * `roomsStepDown` and `roomsStepUp` are the step buttons' full sentences,
   * parameterized by the field's own label, exactly as `buildStepDown` and
   * `buildStepUp` are for the Build panel: the visible content of those buttons
   * is a symbol, so the sentence is all a screen reader has.
   */
  roomsCoordinates: 'hud.rooms.coordinates',
  roomsCoordinatesHint: 'hud.rooms.coordinates-hint',
  roomsCoordinatesSubmit: 'hud.rooms.coordinates-submit',
  roomsTileX: 'hud.rooms.tile-x',
  roomsTileY: 'hud.rooms.tile-y',
  roomsWidth: 'hud.rooms.width',
  roomsHeight: 'hud.rooms.height',
  roomsStepDown: 'hud.rooms.step-down',
  roomsStepUp: 'hud.rooms.step-up',
  /*
   * What a designated room is still missing (#331 milestone).
   *
   * The five keys of the readout that answers "I zoned a cell and nothing
   * happened". The simulation has been able to answer that since #123 --
   * `projectRoomList` reports `missingCapability` per room and
   * `projectRoomDetail` names the object each unmet requirement wants -- and
   * until now nothing under `src/ui/` asked it, so the panel that made the room
   * could not say why the room does nothing.
   *
   * `roomsNeeds` and `roomsNeedsCount` are the block's header: the eyebrow and,
   * beside it, how many of the prison's rooms are unfinished. The pair is
   * shaped like `roomsEnclosure` and its value deliberately -- label left,
   * figure right -- because it is the same kind of line: a readout of what the
   * simulation found, not a control.
   *
   * `roomsNeedsRoom` names the room the block is about and `roomsNeedsObject`
   * is one line under it per object that room is short, with how many of it.
   * `roomsNeedsObjectUncounted` is the same line for the state in which the
   * simulation could not count (see below), and `roomsNeedsItemMore` closes the
   * list when there are more lines than the panel may draw.
   *
   * **This used to be `roomsNeedsOne` and `roomsNeedsMore`**, two forms of a
   * single sentence: *"{room} at {x}, {y} needs {object}"* and the same *", and
   * {count} more"*. Both are deleted rather than kept beside the new keys,
   * because an unused key is an orphan and `docs/LOCALIZATION.md` treats that as
   * a defect class -- a translator's work spent on a string nothing renders.
   * What they said is recorded here because #529 is a measurement *of* them:
   * "and 5 more" was the entire account of five unmet requirements, and there
   * was no surface anywhere in the application that enumerated them.
   *
   * **A list and not one line**, which reverses the sentence this comment used
   * to carry: *"**One line and not a list**, and that is a measurement rather
   * than a preference ... the whole readout has about 43px to live in. A
   * three-row list measured 101.3px and pushed the rule readout 58px below the
   * panel's fold."* That budget was measured before ADR 0039 and #411 moved the
   * coordinate form out of the panel body and into the catalogue scroller, and
   * its "three rows" were three 44px `ListRow`s rather than the 13.2px eyebrow
   * lines this block draws. `ROOM_NEEDS_NAMED_LIMIT` in `rooms-panel.ts` carries
   * the re-measurement and both directions of the correction.
   *
   * The quantity is the **shortfall** and not the requirement: a canteen
   * authored for four benches and holding three reads "1 x Bench", because one
   * is what the player has to build. What the room type asks for in total is the
   * `roomsRequires*` pair above, in the other block, in the other voice.
   *
   * `roomsNeedsObjectUncounted` is the one state that must not carry a numeral.
   * The projection answers `satisfyingQuantity` only when it was handed the
   * placed objects to count; without them the verdict beside it came from the
   * pre-#528 capability test, which never consulted `minQuantity`. Rendering
   * "1 x Bed" there would dress an uncounted answer as a counted one, which is
   * the defect `RoomRequirementViewModel.satisfyingQuantity` is written to
   * prevent one layer down. Two keys chosen in code rather than one with an
   * optional placeholder, which is the split ADR 0011 names outright ("where a
   * message genuinely needs nested selection, it is split into separate keys
   * chosen in code"). No session a player runs reaches it -- the worker supplies
   * the placed objects -- and it is a real key rather than a blank because
   * "unreachable" and "handled" are different claims.
   *
   * `roomsNeedsObjectUnknown` stands in for the object's name when the object
   * catalogue defines nothing under the id the requirement names -- which is
   * the *reason* the projection calls that requirement unmet. Substituted as
   * `{object}` rather than given the sentence a fourth variant, and it is a key
   * rather than a blank because a sentence that trailed off would read as a
   * rendering bug rather than as the content error it is.
   *
   * There is deliberately **no** "every room is ready" key. A room that is fine
   * earns no line at all -- the block is not drawn -- which is what keeps this
   * out of the way of a panel whose always-visible budget ADR 0022 measured at
   * 7.9px.
   */
  roomsNeeds: 'hud.rooms.needs',
  roomsNeedsCount: 'hud.rooms.needs-count',
  roomsNeedsRoom: 'hud.rooms.needs-room',
  roomsNeedsObject: 'hud.rooms.needs-object',
  roomsNeedsObjectUncounted: 'hud.rooms.needs-object-uncounted',
  roomsNeedsItemMore: 'hud.rooms.needs-item-more',
  roomsNeedsObjectUnknown: 'hud.rooms.needs-object-unknown',

  /*
   * The Regime panel, on the fifth tab (issue #451).
   *
   * The tab has existed and rendered nothing since ADR 0022 spent the last
   * slot on Rooms, and `tests/browser/ui-shell.spec.ts` pinned that emptiness
   * on purpose. These are the keys that retire it.
   *
   * `regimeTitle` names the panel after the tab it sits on, because the tab's
   * own label already says "Regime" and a panel that called itself something
   * else would be the mismatch `hud-state.ts` refuses to create by
   * relabelling a tab.
   *
   * `regimeBlockAllows` is a sentence and not a bare list, because a list of
   * words with no verb in front of it does not say whether they are what the
   * group *may* do or what it is doing. `regimeCategorySeparator` is what
   * joins them: a list separator is locale vocabulary (`، ` in Arabic, `、` in
   * Japanese) and `src/ui/save-panel.ts:217` hard-codes `', '` for the same
   * job, which is the one place in the tree that does.
   *
   * `regimeRosterName` exists because the *order* of a person's two names is a
   * locale decision even though neither half is translated (ADR 0015, and
   * `docs/HUD_PROJECTIONS.md` contract 3). `regimeRosterUnnamed` is the row
   * for a prisoner who has not reached the intake stage that mints one -- it
   * names the entity id, so the row is still identifiable rather than
   * anonymous, exactly as `securityHeldRowUnnamed` does one panel over.
   *
   * `regimeRosterHeading` is the *only* wrapper around an activity. A
   * performing prisoner's row says the action's own word and nothing else;
   * putting "Doing" in front of "Showering" would be a second sentence saying
   * what the first already said.
   *
   * There is deliberately no key for a need, a threshold or a warning about
   * one. `docs/HUD_PROJECTIONS.md` gap 7: the simulation defines no
   * warning or critical level for any need, so a row that called one low would
   * be a balance decision made in a message catalogue.
   */
  regimeTitle: 'hud.regime.title',
  regimeBlocks: 'hud.regime.blocks',
  regimeBlockAllows: 'hud.regime.block-allows',
  regimeBlockProgress: 'hud.regime.block-progress',
  regimeCategorySeparator: 'hud.regime.category-separator',
  regimeRoster: 'hud.regime.roster',
  regimeRosterCount: 'hud.regime.roster-count',
  regimeRosterName: 'hud.regime.roster-name',
  regimeRosterUnnamed: 'hud.regime.roster-unnamed',
  regimeRosterHeading: 'hud.regime.roster-heading',
  regimeRosterMore: 'hud.regime.roster-more',
  regimeRosterEmpty: 'hud.regime.roster-empty',
  regimeRosterEmptied: 'hud.regime.roster-emptied',

  refusalSetClock: 'hud.refusal.set-clock',
  refusalPlaceBuildOrder: 'hud.refusal.place-build-order',
  refusalPurchaseMaterials: 'hud.refusal.purchase-materials',
  /**
   * A hire the host refused before it was sent -- no session at all, or a wage
   * the last published balance cannot cover. Its own key rather than sharing
   * `refusalPurchaseMaterials`, because the two leave the prison in states a
   * player would act on differently: one has no new staff member, the other
   * has no materials on the way, and reading the wrong one sends them to the
   * wrong panel.
   */
  refusalHireStaff: 'hud.refusal.hire-staff',
  /**
   * The two sentences for the one refusal that is a **limit** rather than an
   * absence -- the owner's ruling 18 of 2026-08-31, and both are the owner's
   * own words.
   *
   * Every prison has a standing overdraft of one tenth of its opening grant
   * (`TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS`, #703 ruling A, ADR 0083 §2), so a
   * charge this thread refuses on money has not run the prison out of money: it
   * has reached the end of what the state will carry. The pair above cannot say
   * that -- they are chosen from the `actionId`, which names the control and not
   * the reason -- and until this pair existed the player read *"the purchase was
   * refused and no money was spent"* for a limit they had no other way of
   * learning about.
   *
   * **Two keys and not one, for the reason the pair above is two keys**: one
   * prison has no materials on the way and the other has no new staff member.
   * The reason travels from `src/main.ts` as a `HostRefusalError`
   * (`src/ui/host-refusal.ts`) and `refusalMessageKey` in `./projection.ts`
   * chooses between the four.
   *
   * **They do not cover the same refusal decided a tick later.** A charge the
   * *worker* refuses arrives as `hud.alert.refusal.purchase.insufficient-funds`
   * or `hud.alert.refusal.hire.insufficient-funds` through the alerts list --
   * the simulation's own vocabulary, which as of this ruling still says "there
   * are not enough funds" for a refusal that is also always the floor. Ruling 18
   * authored no replacement for those two, so they are unchanged; the two sit on
   * opposite sides of `sender.submit`, so one press produces exactly one of
   * them.
   *
   * **The last part of that paragraph is past tense as of the owner's ruling 23
   * of the same day, and the rest of it still holds.** Ruling 23 -- *"Te same
   * słowa co host"* -- gave those two worker keys these two sentences verbatim,
   * so the alerts-list vocabulary no longer says "there are not enough funds"
   * for a refusal that is the floor. What is unchanged is the *shape*: they are
   * still separate keys in a separate namespace, still chosen by
   * `REFUSAL_LABEL_KEYS` from a `RefusalReason` rather than by
   * `refusalMessageKey` from an `actionId`, and one press still produces
   * exactly one of the four. The two directions are marked rather than
   * overwritten because the reason ruling 18 left them alone -- new
   * player-facing copy is the owner's (`AGENTS.md`) -- is exactly why ruling 23
   * had to be the thing that changed them.
   * `tests/unit/ui-simulation-alerts.test.ts` pins the equality of text, which
   * is what keeps the four in step now that no key is shared.
   */
  refusalPurchaseMaterialsPastFloor: 'hud.refusal.purchase-materials-past-floor',
  refusalHireStaffPastFloor: 'hud.refusal.hire-staff-past-floor',
  refusalUndo: 'hud.refusal.undo',
  refusalRedo: 'hud.refusal.redo',
  /**
   * The two room intents, each with its own sentence for the reason every
   * other entry here has one: a refused designation leaves the prison with no
   * new room, and a refused removal leaves the room exactly where it was --
   * different states, and different things for the player to do next.
   */
  refusalZoneRoom: 'hud.refusal.zone-room',
  refusalUnzoneRoom: 'hud.refusal.unzone-room',
  /**
   * Covers both ways an admission is refused before it is sent -- no session
   * at all, and a prison the last published counts say holds no room -- for
   * the reason `refusalPurchaseMaterials` covers both of its: they leave the
   * prison in the same state and there is nothing different to do about them.
   */
  refusalAdmitPrisoner: 'hud.refusal.admit-prisoner',
  refusalAdmitPrisonerNoRoom: 'hud.refusal.admit-prisoner-no-room',
  refusalCancelBuildOrder: 'hud.refusal.cancel-build-order',
  /**
   * A cancelled purchase the host refused before it was sent -- which here means
   * only "there is no session", because this thread has nothing to pre-check
   * (#285).
   *
   * Its own key rather than sharing `refusalCancelBuildOrder`, for the reason
   * every entry here has one: a withdrawn build order and a cancelled delivery
   * leave the prison in different states, and one of the two is about money.
   *
   * It is **not** the sentence a player sees when the delivery has already
   * landed. That refusal is the simulation's -- `cancel-purchase.not-pending`,
   * decided at the tick the command executes -- and it arrives in the alerts
   * list. The two sit on opposite sides of `sender.submit`, so one press
   * produces exactly one of them and never both.
   */
  refusalCancelMaterialPurchase: 'hud.refusal.cancel-material-purchase',

  /**
   * What a refused *dispatch* of a release says, on the control that was pressed
   * (ADR 0034).
   *
   * Its own sentence rather than a shared one, for the reason every other member
   * of this family has one: this press leaves the prison with the guard still
   * held, and a player told only "that was refused" would not know whether to
   * press again or go and look elsewhere.
   *
   * It is **not** the sentence a player sees when the guard was already free.
   * That refusal is the simulation's -- `release-guard.not-held`, decided at the
   * tick the command executes -- and it arrives in the alerts list. The two sit
   * on opposite sides of `sender.submit`, so one press produces exactly one of
   * them and never both.
   */
  refusalReleaseGuard: 'hud.refusal.release-guard',

  severityInfo: 'hud.severity.info',
  severityWarning: 'hud.severity.warning',
  severityDanger: 'hud.severity.danger',
} as const satisfies Readonly<Record<string, LocalizationKey>>;

export type HudMessageKey = (typeof HUD_MESSAGE_KEY)[keyof typeof HUD_MESSAGE_KEY];

export const HUD_MESSAGE_KEYS: readonly HudMessageKey[] = Object.values(HUD_MESSAGE_KEY);
