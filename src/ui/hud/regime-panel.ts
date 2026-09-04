import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import { element, eyebrowText, screenReaderText, valueText } from '../primitives/dom';
import { createPanel } from '../primitives/panel';
import { rovingTabStop } from '../primitives/roving-focus';
import { bindRovingFocusKeydown } from '../primitives/roving-focus-keydown';
import { createSegmentedBar, type SegmentedBar } from '../primitives/segmented-bar';
import { createStatusBadge, type BadgeTone, type StatusBadge } from '../primitives/status-badge';
import { HUD_MESSAGE_KEY } from './messages';
import type {
  HudActorNameViewModel,
  HudLocalizer,
  HudPrisonerDetailViewModel,
  HudPrisonerNeedViewModel,
  HudPrisonerRosterViewModel,
  HudPrisonerRowViewModel,
  HudRegimeBlockViewModel,
  HudRegimeViewModel,
} from './view-model';

/**
 * The Regime panel: what the prison's day allows right now, and who is in it
 * (issue #451).
 *
 * ### Why it is here, and why it is one panel and not two
 *
 * The `regime` tab has rendered nothing since ADR 0022 measured the tab bar
 * full at five and `hud-state.ts` gave the last slot to Rooms. It is the only
 * one of the five bound to no panel, and `tests/browser/ui-shell.spec.ts`
 * pinned that emptiness deliberately rather than as an oversight. A sixth tab
 * is foreclosed by the same measurement -- `.hud-tabs__inner` spans
 * 1.8 .. 373.2 at 375x812 -- so this tab is the only surface left, and the
 * roster and the timetable have to share it or one of them does not ship.
 *
 * Sharing it is not a compromise here, which is the reason it is one panel.
 * The two blocks are one subject read at two scales: the timetable says what
 * *general population* and *high risk* may do at this tick, and the roster
 * says who is in each and what they are actually doing. The join between them
 * is the thing #451 is about -- `ClassificationReviewSystem` rewrites a
 * prisoner's `classificationGroupIndex`, `ActionSystem` resolves the schedule
 * from that index on the next reconsideration, and the prisoner's day changes
 * shape. That reads as cause and effect only if both halves are on screen at
 * once.
 *
 * ### Boundaries
 *
 * A composer, exactly like the Staff and Intake panels. It imports nothing from
 * `src/simulation/**`, and every figure and every word it renders arrives on
 * the view model as a number or a message key. In particular it does **not**
 * count anything: the roster's `total` is the projection's, and the window is
 * whatever the host asked for -- a panel that counted its own rows would report
 * the window as the population.
 *
 * **Two clauses of that paragraph expired at issue #895 and are corrected
 * rather than deleted, because what they were protecting is intact.** It read
 * *"It holds no selection, issues no intent"*. It now holds one selection --
 * which prisoner the inspector below the roster is about -- and issues one
 * intent to say so. Both are the shape the Build and Rooms panels already use
 * for a catalogue selection: the selection is **chrome**, applied here
 * immediately and unconditionally, and the host is merely told, because the
 * host is the only thing that can turn a chosen prisoner into a
 * `hud/prisoner-detail` request. What has not changed is the rule the sentence
 * was really about: nothing here decides simulation state, nothing here counts,
 * and no word on the inspector is authored here.
 *
 * ### The inspector, and why it is six needs and not a dossier
 *
 * The roster row shows a prisoner's **worst** need of six. The state withholds
 * part of a prisoner's day of the operating grant *per unmet need*
 * (`unmetNeedCount`, the sum `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS`
 * multiplies), so a prisoner costing the prison four needs' worth and one
 * costing it a single need are indistinguishable on the roster and are the
 * whole subject of this block.
 *
 * Everything else `hud/prisoner-detail` carries is left on the projection, and
 * `src/ui/simulation-prisoner-detail.ts` records a reason per field. Two of
 * those reasons are this panel's own, restated one scale down: the tile and the
 * accommodation still do not answer "where is this person"
 * (`docs/HUD_PROJECTIONS.md` gaps 10 and 11), and a sentence length in ticks is
 * still not a date. The rest is copy: naming the sentence, the current action
 * or the gang needs words nobody has authored, and authoring one here would be
 * `AGENTS.md`'s fourth exclusion.
 *
 * **So the inspector adds no player-facing sentence at all.** Its heading is
 * the prisoner's *name*, which is state rather than copy (ADR 0015), its badge
 * is the same word the row's badge carries, and its six lines are the six need
 * words `simulation-message-keys.ts` authored -- one of them saying in its own
 * comment that a roster cell says what a prisoner is doing. The one thing it
 * cannot say without the owner is why the block has gone away when a selected
 * prisoner is released; it therefore says nothing, and the block leaves rather
 * than standing there with a placeholder in it.
 *
 * ### The need bar, and the decision it reverses
 *
 * Each row now draws that prisoner's **worst** need as a bar (issue #535,
 * decision 6). This block used to be headed "What it deliberately does not
 * show" and its first entry refused exactly that, in these words:
 *
 * > **No need bars.** `PrisonerRosterRowViewModel` carries `lowestNeed`, the
 * > most depleted of the six, and it is not rendered: `docs/HUD_PROJECTIONS.md`
 * > gap 7 records that the simulation defines no warning or critical threshold
 * > for any need, so a bar here could show a level and could not say whether it
 * > was bad. A column of unbanded bars in a four-row window of a prison that
 * > holds up to `DEFAULT_PRISONER_CAPACITY` is not a way to find the starving
 * > prisoner; what would make one is a projected threshold or a projected
 * > worst-off ordering, and both are projection changes rather than panel ones.
 *
 * It is quoted rather than deleted because it was right, and because what
 * changed is a *fact it depended on* rather than the owner's mind
 * (`docs/AGENT_WORKFLOW.md` §4: mark both directions).
 *
 * **The premise expired.** "The simulation defines no warning or critical
 * threshold for any need" was true when it was written and stopped being true
 * at `d1b6b5c` (#488), which added `STATE_INCOME_UNMET_NEED_LEVEL` -- the level
 * at or below which the state withholds part of that prisoner's day of the
 * operating grant. `docs/HUD_PROJECTIONS.md` gap 7 records the same correction
 * against itself: *"Narrowed, not closed, by #443 ... it is the fact this gap
 * was waiting for."*
 *
 * **Its remedy is what shipped.** The old text named two things that would make
 * a bar worth drawing -- "a projected threshold or a projected worst-off
 * ordering" -- and said both were projection changes. Both halves are now true
 * of this panel: `lowestNeed` was already the worst-off *per row*, and
 * `PrisonerNeedViewModel.unmetForStateIncome` is the projected threshold, added
 * for this. The panel compares nothing; it reads a flag. So this is the
 * refusal's own condition being met, not the refusal being overridden.
 *
 * **What stayed refused.** Gap 7's remaining half -- the player-facing "your
 * prisoners are unhappy" line -- is the owner's, and nothing here invents one.
 * The bar's `warning` tone means *the state is withholding for this need*,
 * which is a promise the code keeps (`stateIncomeForPrisonerDay` really does
 * pay less), and it is the shipped constant rather than a number chosen here.
 * If the owner wants a different line, `STATE_INCOME_UNMET_NEED_LEVEL` is the
 * single edit.
 *
 * **The clause that followed that one said `describePrisonerNeed` is "the
 * single reader of the flag", and it is corrected rather than deleted because
 * it names the property worth keeping.** It was already false when an audit
 * found it on 2026-09-03: `paintRoster` reads `prisoner.lowestNeed.unmetForStateIncome`
 * directly to write `data-need-unmet`, reaching past the helper because
 * `PrisonerNeedReadout` carries the *tone* and not the flag. Issue #895 adds a
 * third reader for the same reason, `paintDetail`'s per-need
 * `data-need-unmet`, and one more layer of the same shape: the tone rule now
 * lives in `describeNeed` and `describePrisonerNeed` is that function applied
 * to the row's worst need. What is true, and is what the clause was protecting,
 * is that **`describeNeed` is the single place the flag becomes a colour**;
 * every other reader copies it out as data for a probe and decides nothing.
 *
 * **Corrected 2026-09-03, and the paragraph above is left standing because the
 * claim it makes is the one that broke.** The owner suspended the withheld
 * share at `0` -- *"usuń na razie kary, zobaczymy jak pogram i ocenię
 * łatwość"*, recorded in
 * `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS`'s own docblock -- so
 * *"the state is withholding for this need"* and *"`stateIncomeForPrisonerDay`
 * really does pay less"* are both false today. **What the tone means now, and
 * what it will still mean when the rate comes back, is that this need is at or
 * below `STATE_INCOME_UNMET_NEED_LEVEL`** -- the line the state reads when it
 * settles a day, whatever it currently charges for crossing it. That is still
 * a fact about the simulation the panel takes from a projected flag rather
 * than a threshold of its own, so the refusal's condition is still met and the
 * bar is kept.
 *
 * **No player-visible sentence changed, and none needed to.** The tone is a
 * colour plus the need's own word plus `aria-valuetext`'s percentage; nothing
 * in `src/content/default-locale-en.ts` ever said "withheld" or "unmet", so
 * there is no shipped copy asserting a money consequence and no new copy is
 * authored here (`AGENTS.md`'s fourth exclusion). The correction is to this
 * comment, which is where the false claim actually was.
 *
 * ### Which scale each of a row's two graded values is on (issue #909)
 *
 * A row carries two graded values, and they were on one line: a need's level as
 * a word plus a meter, and the prisoner's standing as a pill. Their vocabularies
 * overlap -- `Low` is a risk tier in the pill and, read as the meter's grade,
 * the opposite instruction -- and the playtest that found it misread its own
 * sample twice (`docs/research/2026-09-03-can-a-player-read-this.md` §4). The
 * fix is composition rather than copy: the pill is on the **name's** line, where
 * the inspector below the roster has always drawn it, and the meter prints its
 * own percentage so the two scales differ in kind as well as in position.
 * `paintRoster`'s row builder carries the reasoning, the rejected alternatives
 * and the before-and-after geometry;
 * `tests/browser/ui-roster-row-scales.spec.ts` is the gate.
 *
 * ### What it still deliberately does not show
 *
 * **No tile, and no cell.** The two spatial fields on the row are a tile and an
 * accommodation, and neither answers "where is this person". `ActionSystem`
 * writes the position component on *arrival* and never in between
 * (`docs/HUD_PROJECTIONS.md` gap 10), so a travelling prisoner's tile is the
 * place they left; and an accommodation resolves to the word "Cell" for every
 * prisoner in a prison whose only residential room type is `room.cell`, over an
 * instance id (`room.cell:12:9`) that is a machine name. Where a prisoner *is*,
 * as a player would say it, is gap 11 -- still unprojected.
 *
 * **No block bounds.** A regime block's `startTickOfDay`/`endTickOfDay` are
 * ticks, and `regime.ts` says outright that `DAY_LENGTH_TICKS` is a tick budget
 * rather than a mapping onto a clock face. The strip already had to withdraw an
 * `HH:MM` readout for exactly this reason. How far through the block the
 * simulation is, is a share of that block and renders honestly as a percent.
 */

/**
 * How many prisoners the roster shows at once.
 *
 * **Four, and the bound is inherited arithmetic rather than a new
 * measurement**, which is stated because the two precedents in this HUD were
 * measured and this is not: `HELD_GUARD_ROW_LIMIT` and
 * `PENDING_DELIVERY_ROW_LIMIT` are both three, and the held block was measured
 * at 219.0px for three rows at 900x600 -- the tightest viewport in the browser
 * suite -- with every Release button above the fold. A held-guard row is
 * floored by a 44px tap target because it carries a control; a roster row
 * carries none, so four of them fit inside that same 219.0px unless a row
 * exceeds 54.75px. `src/ui/simulation-prisoner-roster.ts` asks the worker for
 * exactly this many, so the constant bounds the *message* as well as the
 * layout, and it is one edit if the measurement says otherwise.
 *
 * **The measurement exists now, and it says four still fits.** Taken on
 * 2026-08-29 when the worst-need bar was added (#535 decision 6), which is the
 * change that could have spent the headroom this paragraph was estimating.
 * Four rows of the browser suite's own `ROSTER` fixture, row border-box
 * heights, at all five viewports that suite visits:
 *
 * | viewport | row heights | the activity line wrapped |
 * | --- | --- | --- |
 * | 1280x720 | 44.7, 27.5, 27.5, 44.7 | rows 1 and 4 |
 * | 1440x900 | 44.7, 27.5, 27.5, 44.7 | rows 1 and 4 |
 * | 1024x768 | 44.7, 27.5, 27.5, 44.7 | rows 1 and 4 |
 * | 900x600 | 44.7, 27.5, 27.5, 44.7 | rows 1 and 4 |
 * | 375x812 | 27.5, 27.5, 27.5, 27.5 | none |
 *
 * **44.7px against the 54.75px the arithmetic allows**, so the inherited bound
 * holds rather than merely being assumed to.
 *
 * **Retaken on 2026-09-04 for issue #909**, which is the next change that spent
 * some of that headroom: the standing pill moved out of the row's own flex line
 * and onto the name's, so the pill's 20px box now contributes to the row's
 * height instead of being centred inside it, and the need's figure is printed
 * rather than `.ui-sr-only`. Same fixture, same five viewports:
 *
 * | viewport | row heights | the activity line wrapped |
 * | --- | --- | --- |
 * | 1280x720 | 50.4, 33.2, 33.2, 33.2 | row 1 |
 * | 1440x900 | 50.4, 33.2, 33.2, 33.2 | row 1 |
 * | 1024x768 | 50.4, 33.2, 33.2, 33.2 | row 1 |
 * | 900x600 | 50.4, 33.2, 33.2, 33.2 | row 1 |
 * | 375x812 | 33.2, 33.2, 33.2, 33.2 | none |
 *
 * **50.4px against the same 54.75px**, so the bound still holds, with 4.35px of
 * it left. Two things paid for the 5.7px each row grew, and both are worth
 * knowing before the next change here:
 *
 * - **The tallest row got taller by 5.7px and the fourth row got *shorter* by
 *   11.5px**, because the pill leaving the activity line gave "Free
 *   Association" and its need pair room to fit on one line again. The block as
 *   a whole grew 5.6px, from 144.4px of rows to 150.0px.
 * - **The remaining 4.35px is the whole of what is left.** A third line on any
 *   row, or a taller badge, crosses the ceiling. `revealDetail` is not the
 *   escape for this block -- it is the inspector's -- so what would have to give
 *   is `PRISONER_ROSTER_ROW_LIMIT` itself. The two tall rows are the ones
 * carrying the longest activity words -- "Heading to Showering" and "Free
 * Association" -- whose line wraps to put the need pair underneath; they wrap
 * on the *desktop* viewports and not at 375x812 because the side rail is
 * narrower than the mobile panel, which is the degradation
 * `.hud-regime__roster-line`'s `flex-wrap` exists for. The assertion that
 * actually guards this is `tests/browser/ui-shell.spec.ts`'s *"keeps the last
 * line of the roster inside the panel's fold at every viewport"*; the table is
 * here so the next change to a roster row knows what it is spending.
 *
 * It is a **window on the population, not a list of it.** A prison holds up to
 * `DEFAULT_PRISONER_CAPACITY` (5,000) and `MAX_PROJECTION_PAGE_LIMIT` is 500,
 * so no panel and no single reply could carry a full roster whatever height it
 * had. The count beside the header is what says so, and the total it divides
 * by is the projection's rather than this panel's.
 *
 * **Four is still four after issue #703, and the owner ruled it explicitly**
 * (fourth ruling of 2026-08-31): the alternative on the table was showing more
 * rows, and what shipped instead is that the four rows are now the four
 * *highest-tier* prisoners rather than the four oldest arrivals
 * (`projectPrisonerRoster`). So none of the arithmetic above is spent -- the
 * row heights, the 219.0px budget and the 54.75px ceiling are untouched,
 * because the change is to which four prisoners fill the same four boxes.
 *
 * That reordering is bound by the rule issue #209 left standing --
 * *"the position of a row the player is already reading must not change under
 * them"* (`src/ui/simulation-alerts.ts`, `replaceOrAppend`) -- and the
 * projection keeps it the only way a repainted list can: the order is a total
 * order over state, `(descending riskTier, ascending entity index)`, so a row
 * moves only when that prisoner's tier changes or somebody above them leaves.
 * Two prisoners at the same tier can never swap between publications, which is
 * the failure a "stable sort" would only avoid by accident. Nothing in the
 * block is focusable, so a move cannot take focus with it either.
 */
export const PRISONER_ROSTER_ROW_LIMIT = 4;

/**
 * How many need lines the inspector pools (issue #895).
 *
 * **Six, and it is `NEED_IDS.length` spelled on this side of the boundary** --
 * the same trade `MEDIUM_RISK_TIER` and `HIGH_RISK_GROUP_ID` above make, and
 * for the same reason: `NEED_IDS` lives in `src/simulation/prisoners/needs.ts`
 * and the HUD may not import the simulation (`AGENTS.md` boundary 1, enforced
 * by `tests/unit/ui-hud-messages.test.ts`). `projectPrisonerDetail` publishes
 * *all* of them, always, in that order, so this is a pool sized to a fixed
 * vocabulary rather than a window on a list -- unlike
 * `PRISONER_ROSTER_ROW_LIMIT`, which is a budget chosen against a layout.
 *
 * A seventh need would therefore be **dropped rather than drawn**, silently,
 * which is exactly the failure a number spelled twice invites -- so
 * `tests/unit/ui-simulation-prisoner-detail.test.ts` imports `NEED_IDS` and holds the
 * two together, the shape `tests/unit/regime-need-bar.test.ts` already uses to
 * pin `NEED_BAR_MAX_PERMILLE` against the projection's own quantization.
 *
 * Pooled rather than rebuilt for `paintRoster`'s reason one block up: this
 * block repaints on the same cadence the roster does, so rebuilding would
 * discard and rebuild six `createSegmentedBar` bars up to about four times a
 * second for a list whose length never changes.
 *
 * ### What six of them cost, measured
 *
 * **81.0px for the whole block**, at every one of the five viewports the
 * browser suite visits, and the panel does not scroll at any of them --
 * `scrollHeight - clientHeight` is 0 with a prisoner selected. Taken on
 * 2026-09-03 from `tests/browser/ui-shell.spec.ts`'s *"the chosen prisoner is
 * reachable inside the panel at every viewport"*, which prints the figures on
 * every run:
 *
 * | viewport | block | panel fold | overflow |
 * | --- | --- | --- | --- |
 * | 1280x720 | y=549.0..630.0 | 638.1 | 0.0 |
 * | 1440x900 | y=729.0..810.0 | 818.1 | 0.0 |
 * | 1024x768 | y=597.0..678.0 | 686.1 | 0.0 |
 * | 900x600 | y=433.0..514.0 | 522.1 | 0.0 |
 * | 375x812 | y=629.0..710.0 | 717.7 | 0.0 |
 *
 * **The two columns are what bought that, and the margin is thin.** Six needs
 * down one column is six lines and five gutters; `hud.css` lays them out
 * `repeat(2, minmax(0, 1fr))`, so the block is a heading line and three rows.
 * At 900x600 it ends **8.1px above the fold** -- that is the whole of what is
 * left, so a third need line, a sentence under the heading, or a 44px control
 * of its own would put this block's own bottom past the fold and start the
 * panel scrolling on a press. `revealDetail` is what would then have to carry
 * it, and it is written and measured not to fire today.
 */
export const PRISONER_DETAIL_NEED_ROW_LIMIT = 6;

export interface RegimePanelOptions {
  readonly localizer: HudLocalizer;
  /**
   * The player chose a prisoner to look at, or cleared their choice.
   *
   * *Chrome*, exactly like `arm-build-tool` and `arm-room-tool`: the panel has
   * already applied it, and the host is told because the host is the only thing
   * that can ask `hud/prisoner-detail` about them. Never gated -- blocking a
   * row press because a clock command was in flight would drop an interaction
   * that asks the simulation to change nothing.
   *
   * `undefined` is "nobody", which the player reaches by pressing the row they
   * had already chosen. That is the whole of the way out, and it is deliberately
   * not a control of its own: a Close button would need a word, and the word
   * would be the owner's.
   */
  readonly onSelectPrisoner?: (entityId: number | undefined) => void;
}

/** The localizer call this panel makes, narrowed so the pure helpers below need no `HudLocalizer`. */
type Translate = (key: LocalizationKey, parameters?: MessageParameters) => string;

/**
 * What one prisoner's badge says and what colour it says it in.
 *
 * Pure and exported for the reason `describeStaffCoverage` is: the default
 * Vitest environment is `node` (`docs/TESTING.md`), so nothing headless can
 * call `createRegimePanel`, and *which of three things the panel says about a
 * prisoner's standing* is the decision this change adds. A rule that only ran
 * inside a DOM builder would be unreachable from `pnpm test` rather than merely
 * untested.
 *
 * ### The word and the colour are two different fields, on purpose
 *
 * The **word** is the risk tier once classification has run -- Minimal, Low,
 * Medium, High -- and the intake stage before it. The **tone** is the
 * classification *group*, with one exception the owner ruled on and which the
 * next section is about. They are largely the same fact at two grains
 * (`classificationGroupIdForTier` is `riskTier >= 3`), and splitting them is
 * what lets one badge carry both: a tier moving 0 -> 1 changes the word while a
 * prisoner is still on the general-population timetable, and the group's tone
 * changes on the move that actually changes their day.
 *
 * Deriving one from the other here would be the failure this layer exists to
 * avoid -- the group is projected, so the panel reads it rather than
 * recomputing the simulation's threshold on this thread. The row carries both
 * and this function picks, which is why a prisoner with a tier and no group is
 * impossible to render inconsistently: `projectPrisonerRoster` emits the pair
 * or neither.
 *
 * `warning` for high risk is not a claim that the prisoner is a problem. It is
 * that they are on the restricted timetable -- confined to sleep, meals and
 * hygiene for 2,200 of the day's 2,400 ticks (`HIGH_RISK_REGIME`) -- which is a
 * fact about the prison the player is running, and the badge carries the word
 * beside the colour so the colour never stands alone.
 *
 * ### Tier 2 is the one tone that comes from the tier, and that is a ruling
 *
 * **The paragraph above said "the tone is the classification group", full
 * stop, and that was true until the owner's ruling of 2026-09-02 on issue
 * #788.** It is narrowed rather than deleted, because the reason it gave is
 * intact for every other row and is exactly what made this case hard.
 *
 * Two sound decisions composed into a warning the warning layer could not
 * show. This function tied the tone to the group *deliberately* -- the group is
 * what changes a prisoner's day -- and ADR 0090's
 * `ClassificationEarlyWarningSystem` is capped at `Medium` *precisely so it can
 * never move a group*, because crossing into `high-risk` carries the restricted
 * regime and ADR 0080's contraband draw with it. So the tier that ADR 0090
 * exists to make visible was the one tier that could arrive with no change of
 * colour at all: a playtest of 2026-09-02 measured eleven prisoners reaching
 * tier 2 at tick 26,514 and the badge still reading `neutral` -- the tone
 * `Minimal` carries -- for 3,098 further ticks.
 *
 * Neither decision is changed here. What changed is that **tier 2's tone comes
 * from the tier**, and it is `caution`: its own tone, distinct from
 * `Minimal`/`Low`'s `neutral` and from high risk's `warning`, and a rung below
 * `warning` rather than above it (`BadgeTone`, which says why no existing tone
 * would do). Tier 3 still takes its tone from the group, and the group is still
 * the only thing that can say a prisoner's day has changed.
 *
 * The group is tested **first**, so a row whose group is `high-risk` reads
 * `warning` whatever tier it carries. That ordering is not reachable from
 * `projectPrisonerRoster` -- `classificationGroupIdForTier` writes the pair --
 * and it is chosen rather than left to fall out, because the group is the
 * stronger statement of the two and a disagreement should not be able to
 * *demote* a restricted prisoner's badge.
 *
 * **What this does not do, and it is still owed. Corrected 2026-09-04 at issue
 * #909, and the paragraph is kept because half of it was answered and the other
 * half changed hands.** It read:
 *
 * > The badge carries no `title` and no screen-reader text (ADR 0090 names the
 * > same gap under "What this does not decide"), so `Medium` now has a colour
 * > and still has no explanation. A colour with no name is not reachable by a
 * > screen reader at all, and the sentence that would name it is player-facing
 * > copy -- `AGENTS.md`'s fourth exclusion, the owner's.
 *
 * The badge still carries no `title` and no screen-reader text, and the tone is
 * still unexplained. What #909 fixed is a different and worse gap that this
 * paragraph did not name: the badge's *word* had nothing saying which **scale**
 * it was on, while sitting on one line with a second graded value whose scale
 * shares its vocabulary. `Low` is a risk tier here and a need level one cell to
 * the left. That is fixed by composition -- the pill is on the name's line, not
 * the need's -- and `paintRoster`'s row builder carries the whole reasoning.
 *
 * **What is left is a word, and it is nobody's permission that is missing.**
 * `AGENTS.md`'s fourth reservation was partly released by the owner on
 * 2026-09-04 -- *"Sam decyduj zawsze, jak zacznę grać to ujednolicimy"*, decide
 * yourself, always -- and what that released is the **choice of words**, not
 * the requirement that a sentence be true of the code. So a scale word (`Risk`
 * beside the pill, or a screen-reader prefix inside it) is an ordinary change
 * now. It is not made here for one reason: the string lives in
 * `src/content/default-locale-en.ts`, and this change touches no file it does
 * not have to.
 *
 * Two things any such word has to survive are facts about *this function*, and
 * they are recorded here because "verify, then write" is what the release
 * asks of whoever writes it:
 *
 * - The pill carries an **intake stage** and not a tier whenever
 *   `classificationGroupId` is absent, so one fixed word reading `Risk` would
 *   be false of `Queued`, `Reception` and `Cell Assignment`.
 * - The **tone** is the classification group everywhere except tier 2, so a
 *   word naming what the colour means would be false on three rows in four.
 */
export interface PrisonerRowReadout {
  readonly tone: BadgeTone;
  /** The badge's word: the tier for a classified prisoner, the intake stage for one still arriving. */
  readonly badgeKey: LocalizationKey;
}

/**
 * The tier the owner's ruling of 2026-09-02 gives a tone of its own.
 *
 * `2`, spelled here for the reason the `'high-risk'` group id is spelled in
 * this file and in `projection.ts`: `RiskTier` and
 * `EARLY_WARNING_TIER_CEILING` live under `src/simulation/prisoners/`, and the
 * HUD may not import the simulation (`AGENTS.md` boundary 1, enforced by
 * `tests/unit/ui-hud-messages.test.ts`). The same number is
 * `EARLY_WARNING_TIER_CEILING` on the other side of the boundary -- ADR 0090's
 * cap -- and that is not a coincidence: this is the tier that system exists to
 * make reachable, and the tier a prisoner can now sit at for roughly eighteen
 * in-game days.
 *
 * A wrong number here would tone the wrong tier, which is why
 * `tests/unit/ui-simulation-prisoner-roster.test.ts` drives all four tiers
 * rather than only this one.
 */
const MEDIUM_RISK_TIER = 2;

/** The classification group whose timetable is the restricted one. Spelled for `MEDIUM_RISK_TIER`'s reason. */
const HIGH_RISK_GROUP_ID = 'high-risk';

/**
 * The three fields the badge is decided from, rather than a whole roster row
 * (issue #895).
 *
 * The inspector's badge is this same function: a prisoner whose badge says
 * `High` in `warning` on the row must not say `Medium` in `caution` in the
 * block below it, and the only way to guarantee that is one decision with one
 * caller per surface. `HudPrisonerRowViewModel` and
 * `HudPrisonerDetailViewModel` declare these three identically and neither is a
 * subtype of the other, so the parameter is structural.
 */
export interface PrisonerStandingSource {
  readonly standingLabelKey: LocalizationKey;
  readonly classificationGroupId?: string;
  readonly riskTier?: number;
}

export function describePrisonerRow(row: PrisonerStandingSource): PrisonerRowReadout {
  // No group at all: the prisoner is still in intake, and neither tier nor
  // group has been written. `info` rather than `neutral`, so a prison whose
  // arrivals are stuck at cell assignment does not read as a settled one --
  // the Intake panel on the Overview tab is where that is diagnosed.
  if (row.classificationGroupId === undefined) {
    return { tone: 'info', badgeKey: row.standingLabelKey };
  }
  // The group first, and only then the tier -- see the header. The group is
  // the statement about the prisoner's day; the tier is the statement about
  // where their record is heading.
  if (row.classificationGroupId === HIGH_RISK_GROUP_ID) {
    return { tone: 'warning', badgeKey: row.standingLabelKey };
  }
  return {
    tone: row.riskTier === MEDIUM_RISK_TIER ? 'caution' : 'neutral',
    badgeKey: row.standingLabelKey,
  };
}

/**
 * The maximum a need's `permille` can reach, and the `max` the bar is driven
 * against.
 *
 * `1000` is `BoundedValue`'s own scale, not a number chosen here. The bar is
 * given `(permille, 1000)` rather than the need's raw level and raw maximum
 * because the projection deliberately withholds both -- `BoundedValue`'s header
 * says exposing them "would guarantee a HUD somewhere hard-codes `255`" -- and
 * per-mille is the figure it publishes instead.
 *
 * That substitution has a documented hazard and it is pinned rather than
 * argued. `toBoundedValue` warns that deriving a fill from `permille` "quantizes
 * twice", so `filledSegments(permille, 1000)` could in principle light a
 * different number of segments than the projection's own `filled` did from
 * `(level, NEED_MAX)`. It does not, for any of the 256 levels a need can hold,
 * and `tests/unit/regime-need-bar.test.ts` drives all 256 through both to say
 * so -- the same guard `tests/unit/segment-fill-agreement.test.ts` puts on the
 * two fill implementations.
 */
export const NEED_BAR_MAX_PERMILLE = 1000;

/**
 * What one prisoner's worst-need bar says and what colour it says it in.
 *
 * Pure and exported for `describePrisonerRow`'s reason, which is the whole
 * reason this function exists rather than four lines inside `paintRoster`:
 * `vitest.config.ts` is `environment: 'node'` with no jsdom, so nothing
 * headless can call `createRegimePanel`, and a tone rule written inside the DOM
 * builder would be unreachable from `pnpm test` rather than merely untested --
 * a mutation there survives because nothing can observe it.
 *
 * ### The tone is the state's line, and it is the only line drawn
 *
 * `warning` when the state is withholding part of this prisoner's day of the
 * operating grant over this need, `neutral` otherwise. Three things about that
 * choice are deliberate:
 *
 * - **The threshold is not decided here and is not a number here.** The panel
 *   receives `unmetForStateIncome`, a flag the projection computed from
 *   `STATE_INCOME_UNMET_NEED_LEVEL` via the same predicate `unmetNeedCount`
 *   sums to compute the money. There is no comparison and no constant on this
 *   thread to drift.
 * - **`warning` and not `danger`.** Nothing in the simulation calls an unmet
 *   need critical, and `docs/HUD_PROJECTIONS.md` gap 7 keeps the player-facing
 *   "this is bad" threshold with the owner. `warning` says the prison is losing
 *   money over this, which is true and is the strongest claim the code can keep.
 * - **The colour never stands alone.** The row renders the need's *word* beside
 *   the bar and the bar carries `aria-valuetext`, so a colour-blind player and a
 *   screen reader both get the fact without the hue -- the rule
 *   `describePrisonerRow` states for the badge, applied to the bar.
 */
export interface PrisonerNeedReadout {
  readonly tone: BadgeTone;
  /** The need's word: `need.hunger.name` and its five siblings, authored in `simulation-message-keys.ts`. */
  readonly labelKey: LocalizationKey;
  /** How full, on `BoundedValue`'s per-mille scale. */
  readonly permille: number;
}

/**
 * The same readout, for a need that arrived on its own rather than as a row's
 * worst one (issue #895).
 *
 * The rule is `describePrisonerNeed`'s and there is exactly one copy of it: the
 * inspector draws six of these and the roster draws one, and a second `?:` on
 * `unmetForStateIncome` would be a second place for the tone to stop agreeing
 * with the money. So `describePrisonerNeed` below is now this function applied
 * to `row.lowestNeed`, which is all it ever was.
 */
export function describeNeed(need: HudPrisonerNeedViewModel): PrisonerNeedReadout {
  return {
    tone: need.unmetForStateIncome ? 'warning' : 'neutral',
    labelKey: need.labelKey,
    permille: need.permille,
  };
}

export function describePrisonerNeed(row: HudPrisonerRowViewModel): PrisonerNeedReadout {
  return describeNeed(row.lowestNeed);
}

/**
 * The bar's spoken value: the need's fullness as a percentage.
 *
 * A formatted *number* and not a sentence, which is the whole reason it is
 * allowed to exist without an owner decision -- `AGENTS.md`'s fourth exclusion
 * covers new player-facing copy, and this authors none. The form is the one
 * `status-strip.ts` already uses for the day-progress readout:
 * `formatNumber(fraction, { style: 'percent' })`, so the percent sign, its
 * spacing and the digits are the locale's rather than this panel's.
 *
 * `maximumFractionDigits: 0` because a bar of ten segments cannot show a
 * fraction of a percent, and a spoken value more precise than the thing it
 * describes invites a player to trust a digit the readout did not draw.
 */
export function formatNeedValueText(localizer: HudLocalizer, permille: number): string {
  return localizer.formatNumber(permille / NEED_BAR_MAX_PERMILLE, { style: 'percent', maximumFractionDigits: 0 });
}

/**
 * Who the row is about.
 *
 * A name is the one player-facing string that is not a message key (ADR 0015),
 * and its two halves are put together *here* because their order is a locale
 * decision. A prisoner who has not reached the intake stage that mints one is
 * named by their entity id instead of being left blank -- the rule
 * `formatHeldGuardText` follows one panel over, and for the same reason: the
 * row is still about somebody.
 *
 * **The parameter is the two fields it reads rather than a whole roster row**
 * (issue #895), so the inspector's heading is the same function and not a
 * second one: a prisoner named on the row and named again below it must not be
 * able to read differently, least of all in the unnamed case where the fallback
 * is an entity id.
 */
export function formatPrisonerName(
  t: Translate,
  row: { readonly entityId: number; readonly name?: HudActorNameViewModel },
): string {
  const { name } = row;
  return name === undefined
    ? t(HUD_MESSAGE_KEY.regimeRosterUnnamed, { id: row.entityId })
    : t(HUD_MESSAGE_KEY.regimeRosterName, { given: name.givenName, family: name.familyName });
}

/**
 * What the row says they are doing.
 *
 * Two forms and not three. A prisoner performing an action is described by the
 * action's own word -- "Showering", "Yard Time" -- and a prisoner with no
 * action selected by the phase's, which is "Idle". Only the walk gets a
 * wrapper, because only the walk is about a place the prisoner is not yet.
 */
export function formatPrisonerActivity(t: Translate, row: HudPrisonerRowViewModel): string {
  const activity = t(row.activityLabelKey);
  return row.travelling ? t(HUD_MESSAGE_KEY.regimeRosterHeading, { activity }) : activity;
}

/**
 * What one classification group may do in the block that is running.
 *
 * The categories are joined with a message key rather than a literal, because
 * a list separator is locale vocabulary. The order is the schedule's own -- the
 * projection copies `RegimeBlock.allowedCategories` as declared -- so two
 * clients reading the same tick print the same sentence.
 */
export function formatRegimeAllowsText(t: Translate, group: HudRegimeBlockViewModel): string {
  const separator = t(HUD_MESSAGE_KEY.regimeCategorySeparator);
  return t(HUD_MESSAGE_KEY.regimeBlockAllows, {
    categories: group.allowedCategoryLabelKeys.map((key) => t(key)).join(separator),
  });
}

export interface RegimePanel {
  readonly element: HTMLElement;
  /**
   * Repaint the timetable from a fresh `hud/status-strip` reply.
   *
   * `undefined` hides the block, and it is a different state from a group list
   * that happens to be empty: "nothing has asked yet" must not render as "this
   * prison runs no regime", which is the distinction every pulled readout in
   * this HUD draws.
   */
  setRegime(regime: HudRegimeViewModel | undefined): void;
  /**
   * Repaint the roster from a fresh `hud/prisoner-roster` reply.
   *
   * `undefined` hides the block. A roster with `total: 0` **always** draws a
   * sentence, and `everAdmitted` chooses which: `hud.regime.roster-empty` for a
   * prison nobody has ever been admitted to, and `hud.regime.roster-emptied`
   * for one whose whole population has since left. Both keys exist and neither
   * has been widened to cover the other -- see `paintRoster`'s own comment for
   * why they are two sentences.
   *
   * **This paragraph said the opposite until 2026-09-03 and is corrected
   * rather than overwritten** (`docs/AGENT_WORKFLOW.md` §4, and the shape the
   * rest of this file already uses), because it was true for months and the
   * reason it gave is still the reason the second key exists. It read:
   *
   * > `undefined` hides the block. `total: 0` draws the empty sentence only
   * > when `everAdmitted` is also false -- see `paintRoster`'s own comment
   * > (issue #506) for why a roster that emptied by discharge draws no
   * > sentence at all rather than this one, which would be false of it.
   *
   * It became false at `96ec6130` (#888), where the owner's ruling supplied the
   * sentence the emptied-out state had never had: the paint site and the
   * comment beside it were both updated and this docblock, 280 lines above, was
   * not. The interval is the finding -- this is the **exported interface**, the
   * thing another module reads to learn what the method does, and it disagreed
   * with the method for hours while `paintRoster` itself read correctly.
   */
  setRoster(roster: HudPrisonerRosterViewModel | undefined): void;
  /**
   * Repaint the inspector from a fresh `hud/prisoner-detail` reply (issue #895).
   *
   * `undefined` hides the block, and here it covers *three* states rather than
   * the usual two: nothing has asked, a read was already in flight, or the
   * request failed. None of them is a claim about the prisoner, so none of them
   * draws anything -- and none of them forgets the selection either, because
   * the player's choice is not made false by this thread failing to ask about
   * it. The fourth state, "the worker says there is no such prisoner", is
   * `clearPrisonerSelection` below.
   *
   * A reply whose `entityId` is not the selected prisoner's is **ignored**, not
   * painted: the request is correlated by `messageId` (ADR 0003 decision 2) but
   * the *player* is not, so a reply that was in flight while they moved to
   * another row would otherwise put somebody else's needs under their name.
   */
  setPrisonerDetail(detail: HudPrisonerDetailViewModel | undefined): void;
  /**
   * Forget which prisoner is selected, because the worker says there is no such
   * live prisoner any more (issue #895).
   *
   * Separate from `setPrisonerDetail(undefined)` because the two are different
   * facts and only this one is about the prison: a released prisoner is gone,
   * so the selection is gone with them, the block leaves, and the roster's one
   * tab stop goes back to the top of the list rather than to a row that no
   * longer exists. `PrisonerDetailReader.read` answers `'released'` for exactly
   * this and for nothing else.
   *
   * It raises **no** intent. The host is the only caller and it is the host
   * that stopped asking; telling it what it just told us would be a loop.
   */
  clearPrisonerSelection(): void;
  setVisible(visible: boolean): void;
}

export function createRegimePanel(options: RegimePanelOptions): RegimePanel {
  const { localizer } = options;
  const t: Translate = (key, parameters) => (parameters === undefined ? localizer.format(key) : localizer.format(key, parameters));

  // ---- what the day allows ------------------------------------------
  /*
   * Rebuilt rather than pooled, which is the opposite choice from the roster
   * below and rests on the same rule the Intake panel's stage lines state:
   * there is one row per classification group, the vocabulary is a closed
   * catalogue rather than the population, and nothing in the block is
   * focusable -- so replacing it cannot take focus away from a player.
   */
  const blockList = element('div', { className: 'hud-regime__block-list' });
  const blocksBlock = element('div', {
    className: 'hud-regime__blocks',
    children: [eyebrowText(t(HUD_MESSAGE_KEY.regimeBlocks), 'hud-regime__blocks-header'), blockList],
  });

  let regime: HudRegimeViewModel | undefined;

  function paintRegime(): void {
    blocksBlock.hidden = regime === undefined;
    if (regime === undefined) {
      blockList.replaceChildren();
      return;
    }

    blockList.replaceChildren(
      ...regime.groups.map((group) => {
        const row = element('div', {
          className: 'hud-regime__block-row',
          children: [
            element('div', {
              className: 'hud-regime__block-header',
              children: [
                valueText(t(group.labelKey), 'hud-regime__block-name'),
                eyebrowText(
                  t(HUD_MESSAGE_KEY.regimeBlockProgress, {
                    percent: localizer.formatNumber(group.blockProgressPercent),
                  }),
                  'hud-regime__block-progress',
                ),
              ],
            }),
            eyebrowText(formatRegimeAllowsText(t, group), 'hud-regime__block-allows'),
          ],
        });
        // The group's own id, so a browser assertion can find the line about
        // one group rather than counting rows -- the handle
        // `.hud-intake__pipeline-stage` carries for the same reason.
        row.dataset['group'] = group.classificationGroupId;
        return row;
      }),
    );
  }

  // ---- who is in the prison -----------------------------------------
  /**
   * One pooled roster row: who, what they are doing, and how they stand.
   *
   * Pooled where the timetable above is rebuilt, and the difference is the
   * badge: `createStatusBadge` builds an element per row and this block
   * repaints on the counts cadence, so rebuilding would discard and rebuild
   * `PRISONER_ROSTER_ROW_LIMIT` badges twice a second for a list whose length
   * never changes. It also gives the row a stable box for a layout
   * measurement, which is what `HELD_GUARD_ROW_LIMIT` was fixed against.
   */
  interface RosterRow {
    readonly element: HTMLElement;
    readonly name: HTMLSpanElement;
    readonly activity: HTMLSpanElement;
    readonly needName: HTMLSpanElement;
    readonly needBar: SegmentedBar;
    /**
     * The bar's figure as text, for the reason the bar's own `aria-valuetext`
     * stopped being enough at issue #895.
     *
     * A filled row is `role="radio"`, and ARIA gives `radio` *children
     * presentational: true* -- so the `role="meter"` inside it is announced as
     * the flattened text of the row's name computation rather than as a meter,
     * and the percentage `SegmentedBar.update` writes into `aria-valuetext`
     * would be dropped from what a screen reader says. This span is the same
     * number in the row's text, where the flattening keeps it.
     *
     * **A formatted number and not a sentence**, so it authors no copy:
     * `formatNeedValueText` is the locale's percent form, and its own comment
     * records why that is allowed to exist without an owner decision. The bar
     * beside it is `aria-hidden` for the same reason this exists -- one carrier,
     * announced once, whether or not a given browser implements the
     * presentational rule.
     *
     * **It is on screen as of issue #909, and the paragraph that made it
     * invisible is kept below because its reasoning is what changed rather than
     * its facts.** It read:
     *
     * > `.ui-sr-only` is `position: absolute` at 1px, so the row is exactly as
     * > wide with this as without it -- the property `createStatChip` relies on
     * > for the same trick and `tests/browser/ui-overdraft-badge.spec.ts`
     * > measures.
     *
     * Every clause of that is still true of `.ui-sr-only`. What was wrong was
     * spending it here: it bought a screen reader the need's figure and left a
     * sighted player an unlabelled ten-segment bar, on the one row that also
     * carries a *second* graded value. `docs/research/2026-09-03-can-a-player-read-this.md`
     * §4 measured what that costs -- three rows drew `▮▮▮▮▮▯▯▯` beside `Low`
     * and a fourth drew `▮▮▮▮▮▮▯▯`, *more* filled, beside `Minimal`, so a
     * player reading the pill as the bar's grade got a consistent-looking
     * answer whichever direction they thought the bar ran, and the misreading
     * could not correct itself by observation.
     *
     * Printed, it does correct itself: the need reads as a **percentage** and
     * the standing reads as a **word**, so the two scales differ in kind and
     * not only in position. The width it now costs is paid for by the same
     * change -- the badge left this line for the name's, which is wider than
     * this figure -- and `tests/browser/ui-roster-row-scales.spec.ts` asserts
     * both halves at all five viewports.
     */
    readonly needValue: HTMLSpanElement;
    readonly badge: StatusBadge;
  }

  /**
   * Everything a row asserts about *a particular prisoner*, removed together.
   *
   * One helper and not two copies, because the two callers below -- a roster
   * that went away entirely, and a pooled row the current reply is too short to
   * fill -- have to clear exactly the same set, and the previous shape (the
   * same three `delete`s written twice) is the shape that silently keeps a
   * fourth attribute in one place and not the other. A hidden row carrying a
   * stale `data-need` would answer a probe with the last prisoner who occupied
   * that slot.
   */
  function clearRowData(row: HTMLElement): void {
    delete row.dataset['prisoner'];
    delete row.dataset['classificationGroup'];
    delete row.dataset['riskTier'];
    delete row.dataset['need'];
    delete row.dataset['needPermille'];
    delete row.dataset['needUnmet'];
    delete row.dataset['selected'];
    /*
     * And the row stops being a control at all (issue #895).
     *
     * A vacated pooled row is not a prisoner the keyboard may land on, and
     * this is the half of that which is measured rather than tidy:
     * `tests/browser/app-shell.spec.ts`'s *"every control can actually be
     * pressed ... (#88)"* enumerates the page with
     * `button, [role="button"], a[href], input, select, textarea,
     * [tabindex]:not([tabindex="-1"])` and asserts that the controls it could
     * never lay out are **exactly** its written exemption list. Four pooled
     * rows that stayed focusable while empty would be four controls that sweep
     * can never hit-test in a prison holding nobody -- which is the state it
     * runs in -- so it would fail and name them, correctly.
     *
     * That is also why the row is a `div` carrying `role="radio"` rather than
     * a real `<button>` as `build-panel.ts` and `rooms-panel.ts` use for their
     * own catalogue rows: a `<button>` matches that selector whatever its
     * attributes say, so a pooled one is in the inventory even while hidden,
     * and the only way to keep the sweep green would be to add four
     * exemptions to a list whose own comment calls each entry a tripwire. The
     * price is that `Enter` and `Space` have to be wired by hand, which
     * `rosterList`'s activation listener below does, in one place for all four
     * rows.
     */
    row.removeAttribute('role');
    row.removeAttribute('aria-checked');
    row.removeAttribute('tabindex');
  }

  const rosterList = element('div', { className: 'hud-regime__roster-list' });

  const rosterRows: readonly RosterRow[] = Array.from({ length: PRISONER_ROSTER_ROW_LIMIT }, (): RosterRow => {
    const name = valueText('', 'hud-regime__roster-name');
    const activity = eyebrowText('', 'hud-regime__roster-activity');
    const needName = eyebrowText('', 'hud-regime__roster-need-name');
    // Named empty and renamed on every paint. A pooled row's worst need
    // changes between ticks, so the name that matters is the one `update`
    // sets -- see `SegmentedBarState.label`.
    const needBar = createSegmentedBar({ label: '' });
    // The need's word and its bar share one line, and the line sits *beside*
    // the activity rather than under it. Under it would make the row three
    // lines deep, and `PRISONER_ROSTER_ROW_LIMIT`'s own derivation above puts
    // the whole four-row budget inside 219.0px on the tightest viewport the
    // browser suite visits -- a third line spends headroom that arithmetic
    // does not have to give. Beside it the pair wraps only when the row is
    // genuinely too narrow, which `hud.css` lets it do.
    // The figure the bar draws, printed in the row's text as of issue #909, and
    // the bar itself hidden from the name computation that would otherwise say
    // it twice -- see `RosterRow.needValue` for what it was and why it changed.
    const needValue = eyebrowText('', 'hud-regime__roster-need-value');
    needBar.element.setAttribute('aria-hidden', 'true');
    const need = element('div', {
      className: 'hud-regime__roster-need',
      children: [needName, needBar.element, needValue],
    });
    const badge = createStatusBadge({ tone: 'neutral', text: '' });
    /*
     * The pill's own class, and it is the smaller half of issue #909.
     *
     * Added *here* rather than in `createStatusBadge`, which is the whole
     * point: that primitive is shared with `status-strip.ts` and
     * `staff-panel.ts`, so a class minted inside it would be a class on
     * `Warning`, `Info` and `Covered` too. The playtest's probe walked the row
     * cell by cell, and the only class it could report for this one was
     * `ui-badge__text` -- the primitive's inner text cell, with `ui-badge` on
     * the root outside it. Those are the same two classes those three badges
     * carry on the same screen, so neither the stylesheet nor a measurement
     * could name *this* pill without naming them. `classList.add` on the root
     * the primitive returns is the same reach `hud.css` already had through
     * `.hud-regime__roster-row > .ui-badge`, one step further in and without a
     * descendant selector.
     */
    badge.element.classList.add('hud-regime__roster-standing');
    /*
     * Two lines, and **which value is on which line is the fix for issue
     * #909**.
     *
     * The row used to be the text column with the pill beside it, vertically
     * centred, which put the pill hard against the need's meter at the end of
     * the second line:
     *
     * ```
     * Hana Zielen
     * Association    Bladder ▮▮▮▮▮▯▯▯                    [ Low ]
     * ```
     *
     * Two scales, one line, sharing a vocabulary. `Minimal / Low / Medium /
     * High` is the prisoner's risk tier (or, before classification, their
     * intake stage); `Bladder ▮▮▮▮▮▯▯▯` is how full their worst need is. So
     * `Bladder ▮▮▮▮▮▯▯▯ [Low]` read as one statement -- *bladder need, low* --
     * and `Low` means *act now* on the need scale and *ignore this one* on the
     * risk scale.
     *
     * **The evidence is a reader, not a hypothesis.**
     * `docs/research/2026-09-03-can-a-player-read-this.md` §4 misread this row
     * twice in its own record and left both misreadings in place: its first
     * draft read the pair as "minimal hygiene". Its probe recorded why nothing
     * on screen stopped it -- no column heading, no `aria-label` and no `title`
     * on the row or on any cell -- and the same section records that a *gap* is
     * not the cure, because the two were already separated by most of the row's
     * width and it still read as one statement. Measured before this change, at
     * 375x812 the pill's box (y=562.4..582.4) overlapped the need pair's
     * (y=573.0..586.2) by 9.4px: it sat on neither line.
     *
     * §4 named three remedies -- a heading, a word inside the pill, or **moving
     * it off that line**. This is the third, and it is the one that ships whole:
     * the first two are new player-facing strings and this authors none.
     *
     * The pill therefore joins the **name**, and the composition is not
     * invented here -- it is `.hud-regime__detail-header` one block down, which
     * has always drawn this same badge beside the same prisoner's name. So the
     * panel now says it one way instead of two:
     *
     * ```
     * Hana Zielen                                        [ Low ]
     * Association    Bladder ▮▮▮▮▮▯▯▯ 63%
     * ```
     *
     * **Document order carries the same grouping for a screen reader**, which
     * is why the pill is the name's next sibling rather than merely painted
     * near it. A row is `role="radio"` and is announced as its flattened
     * contents in order, so the shipped row said "Mara Ostrowska, Heading to
     * Showering, Hunger, 20%, Low" -- the tier last, immediately after the
     * need's figure, which is the aural form of the same misreading. A line
     * break is invisible there; the order is not.
     *
     * **Issue #909 put three other shapes on the table, and each is answered
     * here rather than passed over.**
     *
     * 1. **"Label the columns."** These are not columns.
     *    `.hud-regime__roster-line` is `flex-wrap: wrap` and the activity line
     *    *does* wrap at the four desktop viewports and not at 375x812
     *    (`PRISONER_ROSTER_ROW_LIMIT`'s table above), so a heading would sit
     *    over the need pair on some rows and over nothing on others. It would
     *    also be false on one row in four: the pill carries an **intake stage**
     *    for a prisoner classification has not reached, so a column headed with
     *    a risk word would misname `Queued`. And it is new copy.
     * 2. **"Give the risk tier its own vocabulary."** Four shipped words. The
     *    issue reckons the blast radius as this roster *and the status strip*,
     *    on the grounds that #703's ruling put the tiers on the strip; that was
     *    checked and it is not so -- the strip's `high-risk` chip is a **count**
     *    labelled from `classification-group.high-risk.name`
     *    (`projection.ts`), and `risk-tier.N.name` has exactly one reader,
     *    `prisonerStandingLabelKey`, serving this row and the inspector. So the
     *    rename is *cheaper* than the issue thought. It is still not the fix:
     *    renaming the words leaves two graded values on one line with nothing
     *    saying which is which, so it spends four player-visible strings to
     *    make the collision quieter rather than to remove it.
     * 3. **"Take the need meter off the row and let the inspector own it."** The
     *    inspector shows **one** prisoner and only after a press. The roster is
     *    the window on the population, and it is ordered by risk tier rather
     *    than by need (#703's fourth ruling of 2026-08-31), so with the meters
     *    gone a player could not see who is suffering without pressing four
     *    rows in turn. That is the owner's standing design directive read
     *    backwards -- *"gra ma być łatwa przyjazna do grania, a nie jakieś
     *    ukryte funkcje"* -- and it would re-refuse the bar whose own condition
     *    #535 decision 6 had established was met.
     *
     * What all three change is *what the row says*. This changes *where it says
     * it*, which is where the defect was.
     *
     * `.hud-regime__roster-text` survives as the wrapper even though the row
     * now has one child. It carries `min-width: 0`, which `hud.css` records as
     * defensive rather than load-bearing after measuring it, and it is the box
     * the two lines are a column of.
     */
    const row = element('div', {
      className: 'hud-regime__roster-row',
      children: [
        element('div', {
          className: 'hud-regime__roster-text',
          children: [
            element('div', { className: 'hud-regime__roster-head', children: [name, badge.element] }),
            element('div', { className: 'hud-regime__roster-line', children: [activity, need] }),
          ],
        }),
      ],
    });
    row.hidden = true;
    rosterList.append(row);
    return { element: row, name, activity, needName, needBar, needValue, badge };
  });

  /**
   * Which prisoner the inspector is about, and it is this panel's own state
   * (issue #895).
   *
   * Chrome, exactly as `build-panel.ts`'s `selectedId` is chrome: a press
   * applies it here at once and the host is told afterwards, because a
   * selection that waited for a round trip would leave up to about 300 ms
   * between a press and any sign of it (`src/main.ts`'s `roomNeedsReader`
   * header carries that measurement). The *answer* comes back through
   * `setPrisonerDetail`; this is only the question.
   */
  let selectedPrisonerId: number | undefined;

  /**
   * Which row the keyboard is on, when it is on one.
   *
   * The roving tab stop follows the **selection** in `build-panel.ts`, which is
   * right there and wrong here for one reason: that catalogue repaints when the
   * player changes something, and this block repaints up to about four times a
   * second off the clock heartbeat. Recomputing the tab stop from the selection
   * alone would move the group's one `tabindex="0"` back onto the selected row
   * a few hundred milliseconds after the player arrowed away from it, so
   * tabbing out and back would return them somewhere they had left.
   *
   * Not cleared when the prisoner it names leaves the window, and it does not
   * need to be: `paintRoster` resolves it against the ring it is painting, so
   * an id that is no longer drawn simply stops being a candidate and the tab
   * stop falls through to the selection and then to the top of the list.
   */
  let focusedPrisonerId: number | undefined;

  /**
   * The rows currently holding a prisoner, keyed by that prisoner's id.
   *
   * Mutated in place rather than replaced, because `bindRovingFocusKeydown`
   * captures the map once at mount and reads it on every key press. Only
   * *filled* rows are members: a vacated pooled row is not in the ring, which
   * is the same fact `clearRowData` writes into the DOM.
   */
  const rosterRowsByPrisoner = new Map<string, RosterRow>();
  /** The ring's order: top to bottom, as painted. Read fresh on every key press. */
  let rosterFocusOrder: readonly string[] = [];

  /**
   * The press, from either producer, and there is deliberately only one of
   * these (issue #895).
   *
   * **Pressing the selected row clears the selection.** That is the whole of
   * the way back out, and it is a toggle rather than a control of its own
   * because a Close button would need a word and the word would be the
   * owner's. `aria-checked` is what announces the state either way, which is
   * user-agent vocabulary rather than copy.
   */
  function selectPrisoner(entityId: number | undefined): void {
    const next = entityId === selectedPrisonerId ? undefined : entityId;
    if (next === selectedPrisonerId) return;
    selectedPrisonerId = next;
    // The answer on screen belongs to the prisoner who is no longer selected,
    // so it goes now rather than when the next reply lands. Anything else
    // leaves one prisoner's needs under another prisoner's name for as long as
    // the round trip takes.
    detail = undefined;
    paintRoster();
    paintDetail();
    options.onSelectPrisoner?.(next);
  }

  const rosterCount = valueText('', 'hud-regime__roster-count');
  const rosterEmpty = eyebrowText(t(HUD_MESSAGE_KEY.regimeRosterEmpty), 'hud-regime__note');
  const rosterMore = eyebrowText('', 'hud-regime__note hud-regime__roster-more');

  const rosterBlock = element('div', {
    className: 'hud-regime__roster',
    children: [
      element('div', {
        className: 'hud-regime__roster-header',
        children: [eyebrowText(t(HUD_MESSAGE_KEY.regimeRoster)), rosterCount],
      }),
      rosterList,
      rosterEmpty,
      rosterMore,
    ],
  });

  /**
   * The pointer's route into `selectPrisoner`, bound once on the list rather
   * than per row.
   *
   * Delegated because the rows are pooled and a listener per row would be four
   * closures each holding whichever prisoner was in that slot at mount --
   * which is nobody. `data-prisoner` is the row's identity for exactly this
   * reason, and it is absent on a vacated row, so a press on empty space in a
   * short roster reaches no prisoner at all.
   */
  rosterList.addEventListener('click', (event: MouseEvent) => {
    const pressed = event.target;
    if (!(pressed instanceof Element)) return;
    const row = pressed.closest<HTMLElement>('.hud-regime__roster-row');
    const id = row?.dataset['prisoner'];
    if (id === undefined) return;
    selectPrisoner(Number(id));
  });

  /**
   * The keyboard's route in, which is two keys and no third.
   *
   * `Enter` and `Space` are what activates a `radio`, and they have to be
   * written here because the row is a `div` -- see `clearRowData` for why it is
   * a `div` and not the `<button>` the two catalogue panels use. The arrows,
   * `Home` and `End` are `bindRovingFocusKeydown`'s below and are not repeated
   * here.
   *
   * `preventDefault` because `Space` on a focused element scrolls the page, and
   * `stopPropagation` for the reason `roving-focus-keydown.ts` states at
   * length: `WorldScene` binds camera controls on `window` in the bubble phase,
   * gated only on whether a text field has focus, so a key consumed here would
   * otherwise also reach the camera. Only the two keys actually consumed are
   * stopped; everything else stays the browser's and the world's.
   */
  rosterList.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const focused = event.target;
    if (!(focused instanceof HTMLElement)) return;
    const id = focused.dataset['prisoner'];
    if (id === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    selectPrisoner(Number(id));
  });

  /**
   * Where the keyboard is, so a repaint cannot move the tab stop out from under
   * it -- see `focusedPrisonerId`.
   *
   * `focusin` rather than `focus`, because the event has to reach the list: a
   * `focus` event does not bubble. Nothing is repainted from here; the value is
   * read by the next paint that happens for its own reasons.
   */
  rosterList.addEventListener('focusin', (event: FocusEvent) => {
    const focused = event.target;
    if (!(focused instanceof HTMLElement)) return;
    const id = focused.dataset['prisoner'];
    focusedPrisonerId = id === undefined ? undefined : Number(id);
  });

  /**
   * The arrows, `Home` and `End`, through the shared wiring rather than a
   * listener written here.
   *
   * The map and the order are read fresh on every press -- both are rewritten
   * by `paintRoster`, because which prisoners are in the window changes with
   * the prison. That is the difference from the two catalogue panels, whose
   * rings are content: here a row can leave the ring under the player, and the
   * ring the handler walks has to be the one on screen.
   */
  bindRovingFocusKeydown(rosterList, {
    datasetAttribute: 'prisoner',
    order: () => rosterFocusOrder,
    rows: rosterRowsByPrisoner,
  });

  let roster: HudPrisonerRosterViewModel | undefined;

  function paintRoster(): void {
    rosterBlock.hidden = roster === undefined;
    if (roster === undefined) {
      rosterCount.textContent = '';
      delete rosterBlock.dataset['total'];
      delete rosterBlock.dataset['everAdmitted'];
      for (const row of rosterRows) {
        row.element.hidden = true;
        clearRowData(row.element);
      }
      // The ring empties with the rows. It is what the arrow handler walks, so
      // leaving it populated would let a key press focus a row that is hidden
      // and holds nobody.
      rosterRowsByPrisoner.clear();
      rosterFocusOrder = [];
      rosterList.removeAttribute('role');
      rosterList.removeAttribute('aria-label');
      rosterList.hidden = true;
      rosterEmpty.hidden = true;
      rosterMore.hidden = true;
      return;
    }

    // The population as data as well as as text, so a test reads it without
    // parsing a localized sentence -- the job `data-waiting` does on the
    // Intake panel's readout.
    rosterBlock.dataset['total'] = String(roster.total);
    rosterBlock.dataset['everAdmitted'] = String(roster.everAdmitted);

    const shown = roster.rows.slice(0, PRISONER_ROSTER_ROW_LIMIT);
    rosterCount.textContent = t(HUD_MESSAGE_KEY.regimeRosterCount, {
      shown: localizer.formatNumber(shown.length),
      total: localizer.formatNumber(roster.total),
    });

    rosterRowsByPrisoner.clear();
    rosterFocusOrder = shown.map((prisoner) => String(prisoner.entityId));

    rosterRows.forEach((row, index) => {
      const prisoner = shown[index];
      if (prisoner === undefined) {
        row.element.hidden = true;
        clearRowData(row.element);
        return;
      }
      const readout = describePrisonerRow(prisoner);
      const need = describePrisonerNeed(prisoner);
      const needWord = t(need.labelKey);
      row.name.textContent = formatPrisonerName(t, prisoner);
      row.activity.textContent = formatPrisonerActivity(t, prisoner);
      row.badge.update({ tone: readout.tone, text: t(readout.badgeKey) });
      row.needName.textContent = needWord;
      const needValueText = formatNeedValueText(localizer, need.permille);
      // `label` on every update, not just the first: the row is pooled and the
      // *subject* of this bar changes with the prisoner and with which of their
      // six needs is now lowest.
      row.needBar.update({
        value: need.permille,
        max: NEED_BAR_MAX_PERMILLE,
        valueText: needValueText,
        tone: need.tone,
        label: needWord,
      });
      // The same figure in the row's text, because the bar is announced as
      // presentational inside a `radio` -- see `RosterRow.needValue`.
      row.needValue.textContent = needValueText;
      row.element.hidden = false;
      // The row's identity for a browser probe, and the two fields the badge
      // renders as a word and a colour. The rows are pooled, so "the second
      // row" is not a stable name for a prisoner -- the same reason
      // `data-guard` exists on the held list.
      row.element.dataset['prisoner'] = String(prisoner.entityId);
      if (prisoner.classificationGroupId === undefined) delete row.element.dataset['classificationGroup'];
      else row.element.dataset['classificationGroup'] = prisoner.classificationGroupId;
      if (prisoner.riskTier === undefined) delete row.element.dataset['riskTier'];
      else row.element.dataset['riskTier'] = String(prisoner.riskTier);
      // The need as data, and this is the half of the change that makes it a
      // measurement surface rather than a nicety.
      //
      // A bar's value lives in a CSS width and a count of lit `<span>`s, and
      // neither is a number a script can read without re-deriving the panel's
      // own quantization. These three are read directly:
      //
      // - `data-need` -- *which* need, as the stable simulation id, so a probe
      //   does not have to recognise a translated word.
      // - `data-need-permille` -- how full, `0`..`1000`, unrounded and
      //   unquantized. This is the field that finally tells "the need was
      //   served" from "the need decayed but not far enough": before it, both
      //   read as a prisoner on the roster with no number attached.
      // - `data-need-unmet` -- whether this need is at or below
      //   `STATE_INCOME_UNMET_NEED_LEVEL`, the line the state reads when it
      //   settles a day. The worst need being unmet is exactly
      //   `unmetNeedCount >= 1`, because no other need can be lower, so this
      //   attribute answers "does the state count this prisoner as neglected
      //   at all".
      //
      //   **This read "whether the state is withholding grant over it" and
      //   "is this prisoner costing the prison income at all", and both became
      //   false on 2026-09-03**, when the owner suspended
      //   `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` at `0` while they
      //   play (their words are in that constant's docblock). The old wording
      //   is kept here rather than dropped because it is the question this
      //   attribute was built to answer and will answer again the moment the
      //   rate moves; what the attribute *reports* did not change at all, only
      //   what it costs.
      //
      // On the row rather than on the bar for `data-prisoner`'s reason: the
      // rows are pooled, so a probe keys everything about one prisoner off the
      // one element that names them.
      row.element.dataset['need'] = prisoner.lowestNeed.needId;
      row.element.dataset['needPermille'] = String(need.permille);
      row.element.dataset['needUnmet'] = String(prisoner.lowestNeed.unmetForStateIncome);
      /*
       * And the row becomes a control, because it holds somebody (issue #895).
       *
       * `role="radio"` on the row rather than on anything inside it: the whole
       * row is the target, which is what makes it a 44px-tall press area on a
       * touch screen without a control of its own to lay out --
       * `PRISONER_ROSTER_ROW_LIMIT`'s derivation has no headroom for one, and
       * ADR 0010's posture is that a pointer route and a keyboard route ship
       * together rather than one after the other.
       *
       * `aria-checked` is the machine carrier of which prisoner is selected, as
       * it is in `build-panel.ts` and `rooms-panel.ts`; `data-selected` is the
       * one the stylesheet and a probe read. Two attributes for one fact
       * because they have two audiences, which is the split those panels
       * already made.
       */
      row.element.setAttribute('role', 'radio');
      const selected = prisoner.entityId === selectedPrisonerId;
      row.element.setAttribute('aria-checked', selected ? 'true' : 'false');
      row.element.dataset['selected'] = selected ? 'true' : 'false';
      rosterRowsByPrisoner.set(String(prisoner.entityId), row);
    });

    /*
     * Exactly one tab stop in the group, and it is `rovingTabStop`'s answer
     * over the ring that is actually on screen (issue #895).
     *
     * Focus first, selection second, top of the list last -- see
     * `focusedPrisonerId` for why the selection cannot be the only input at
     * this cadence. An id naming a prisoner who has left the window resolves to
     * `undefined` here and falls through to the next candidate, so the group
     * never loses its way in.
     *
     * Written over every row on every paint rather than only on the one that
     * changes, because the rows are pooled: a row that stops being the tab stop
     * has to be told, and a row that has just taken a different prisoner
     * inherits whatever the last one carried.
     */
    const indexOf = (entityId: number | undefined): number | undefined => {
      if (entityId === undefined) return undefined;
      const at = rosterFocusOrder.indexOf(String(entityId));
      return at < 0 ? undefined : at;
    };
    const tabStop = rovingTabStop(rosterFocusOrder.length, indexOf(focusedPrisonerId) ?? indexOf(selectedPrisonerId));
    rosterRows.forEach((row, index) => {
      if (row.element.hidden) return;
      row.element.tabIndex = index === tabStop ? 0 : -1;
    });

    /*
     * The group's own role, and it is conditional for the reason
     * `build-panel.ts` makes its `radiogroup` conditional: a group whose only
     * member is a sentence would announce "one of one" for something there is
     * no way to select. An empty roster draws the empty note and no members, so
     * it is a box with a sentence in it rather than a choice.
     *
     * Named from the header immediately above it -- "Prisoners", the same
     * `hud.regime.roster` key that eyebrow renders -- exactly as the Build
     * catalogue's group is named from its own section eyebrow. **An existing
     * key and not a new sentence**, which is the whole reason the group can be
     * announced at all without an owner decision.
     */
    if (shown.length > 0) {
      rosterList.setAttribute('role', 'radiogroup');
      rosterList.setAttribute('aria-label', t(HUD_MESSAGE_KEY.regimeRoster));
    } else {
      rosterList.removeAttribute('role');
      rosterList.removeAttribute('aria-label');
    }

    rosterList.hidden = shown.length === 0;
    // The empty sentence is true of exactly one state: nobody ever has been
    // admitted (issue #506). A prison that admitted a batch and has since
    // discharged all of it also reads `shown.length === 0`, and the sentence
    // would be false of it -- five people were admitted, served their sentence
    // and left, so neither "No prisoners yet" nor an instruction to build the
    // cell they already have describes them. There is no shipped sentence that
    // says the true thing (searched `default-locale-en.ts`: every other
    // "nobody"/"empty" string names a different subject -- guards, alerts,
    // rooms, saves -- and reusing one would only be a different false claim),
    // and authoring one is the owner's call (`AGENTS.md`'s fourth exclusion
    // covers any new player-facing sentence). So this state draws neither
    // sentence: no box asserting non-admission that isn't true, and no
    // invented substitute. The header above it still reads "0 of 0", which is
    // not a claim about history.
    //
    // **This paragraph named the sentence as "Nobody has been admitted yet"
    // until the owner ruled a replacement on 2026-09-03**, and both halves of
    // what it argued survive that ruling unchanged: the sentence is still true
    // of one state only, and the other state still has no sentence of its own.
    // What moved is only which words this key holds -- see
    // `hud.regime.roster-empty` in `default-locale-en.ts`, which keeps the
    // ruling and the wording it replaced.
    //
    // **The owner ruled the missing sentence on 2026-09-03, so the box no
    // longer goes dark on the second state.** Everything the paragraph above
    // argues is still true of `hud.regime.roster-empty`; what changed is that
    // there is now a *second* key for the state that sentence was never true
    // of. So the visibility test drops its `everAdmitted` half -- an empty
    // roster always draws a line now -- and `everAdmitted` becomes the choice
    // of *which* line. The two states are still two sentences and neither has
    // been widened to cover the other, which is what the previous reading
    // asked for and could not have.
    rosterEmpty.hidden = shown.length > 0;
    if (!rosterEmpty.hidden) {
      // Re-set on every paint rather than only on the transition: `paintState`
      // is keyed on the active tab and this element is pooled, so a roster that
      // empties out while the player is on another tab would otherwise keep
      // whichever sentence was current when it was last painted. The same
      // pooled-row hazard #877 is about, one element wide.
      rosterEmpty.textContent = t(
        roster.everAdmitted ? HUD_MESSAGE_KEY.regimeRosterEmptied : HUD_MESSAGE_KEY.regimeRosterEmpty,
      );
    }
    // Counted against `roster.total` and not against the rows that arrived: the
    // reader asks for one row budget's worth, so the window is what came back
    // and the total is what the prison holds.
    const remaining = roster.total - shown.length;
    rosterMore.hidden = remaining <= 0;
    if (remaining > 0) {
      rosterMore.textContent = t(HUD_MESSAGE_KEY.regimeRosterMore, { count: localizer.formatNumber(remaining) });
    }
  }

  // ---- the one prisoner the player is looking at --------------------
  /**
   * One pooled need line: the need's word, its bar, and the bar's figure as
   * text (issue #895).
   *
   * Pooled for `RosterRow`'s reason, and the same three carriers as a roster
   * row's need pair -- so `describeNeed`'s tone, `NEED_BAR_MAX_PERMILLE` and
   * `formatNeedValueText` are shared rather than reimplemented one block down.
   * The screen-reader figure is here for a different reason from the row's,
   * though: nothing in this block is a control, so the bar's own
   * `aria-valuetext` is announced -- the span is what a *pointer* player gets
   * from `title`-free markup, and it costs no width.
   */
  interface DetailNeedRow {
    readonly element: HTMLElement;
    readonly name: HTMLSpanElement;
    readonly bar: SegmentedBar;
    readonly value: HTMLSpanElement;
  }

  const detailNeedList = element('div', { className: 'hud-regime__detail-needs' });

  const detailNeedRows: readonly DetailNeedRow[] = Array.from(
    { length: PRISONER_DETAIL_NEED_ROW_LIMIT },
    (): DetailNeedRow => {
      const name = eyebrowText('', 'hud-regime__detail-need-name');
      const bar = createSegmentedBar({ label: '' });
      const value = screenReaderText('');
      const row = element('div', {
        className: 'hud-regime__detail-need',
        children: [name, bar.element, value],
      });
      row.hidden = true;
      detailNeedList.append(row);
      return { element: row, name, bar, value };
    },
  );

  const detailName = valueText('', 'hud-regime__detail-name');
  const detailBadge = createStatusBadge({ tone: 'neutral', text: '' });
  const detailBlock = element('div', {
    className: 'hud-regime__detail',
    children: [
      element('div', {
        className: 'hud-regime__detail-header',
        children: [detailName, detailBadge.element],
      }),
      detailNeedList,
    ],
  });

  let detail: HudPrisonerDetailViewModel | undefined;
  /** The prisoner the block was last painted for, so the reveal below happens once per selection. */
  let revealedPrisonerId: number | undefined;

  /**
   * Scrolls the block into the panel's own fold, once, when it first has
   * something in it.
   *
   * **The arithmetic and not `scrollIntoView`**, for the reason
   * `build-panel.ts`'s `revealSelectedRow` gives: that helper walks *every*
   * scroll ancestor, and this panel is itself the scroll container
   * (`.ui-panel.hud-regime` is `overflow-y: auto`, and `hud.css` says why).
   *
   * Called when the block starts being about a different prisoner and at no
   * other time. Not on every paint, because the block repaints up to about four
   * times a second and a player who has scrolled the panel by hand must be left
   * where they put it; and not on the press, because at that moment the block is
   * still empty and there is nothing to reveal -- it grows when the answer
   * arrives, which is up to about 300 ms later in a browser.
   *
   * **Measured, and it does not fire at any viewport the browser suite visits
   * (2026-09-03).** The block is 81.0px with all six needs drawn -- a heading
   * line and three rows of the two-column need grid -- and at every one of the
   * five viewports it ends above the panel's fold with `scrollHeight -
   * clientHeight` still 0: at 900x600, the tightest of them, it occupies
   * y=433.0..514.0 in a panel clipped at y=522.1. So `below` is negative and
   * this method returns having done nothing. It stays because the numbers it
   * depends on are not this panel's to fix -- the timetable above it grows with
   * the number of classification groups and the roster with
   * `PRISONER_ROSTER_ROW_LIMIT` -- and the day either moves, a block a press
   * created and nothing scrolled to would be a readout below its own fold,
   * which is #174's defect wearing a different hat.
   * `tests/browser/ui-shell.spec.ts`'s *"the chosen prisoner is reachable
   * inside the panel at every viewport"* prints the five figures on every run.
   */
  function revealDetail(): void {
    const panelElement = panel.element;
    const panelTop = panelElement.getBoundingClientRect().top + panelElement.clientTop;
    const box = detailBlock.getBoundingClientRect();
    const below = box.bottom - (panelTop + panelElement.clientHeight);
    const above = box.top - panelTop;
    // Down to bring the bottom in, but never so far that the top leaves: a
    // block taller than the fold is shown from its top, which is where the name
    // and the badge are.
    if (below > 0) panelElement.scrollTop += Math.min(below, Math.max(0, above));
  }

  function paintDetail(): void {
    // Hidden covers every state that is not an answer about the selected
    // prisoner: nobody selected, nothing asked yet, a read in flight, a failed
    // read, and a reply about somebody the player has since moved off. None of
    // them is a fact about a prisoner, so none of them draws one -- and there
    // is no sentence for any of them, which is `AGENTS.md`'s fourth exclusion
    // rather than an omission (see this module's header).
    const shown = detail !== undefined && detail.entityId === selectedPrisonerId ? detail : undefined;
    detailBlock.hidden = shown === undefined;
    if (shown === undefined) {
      delete detailBlock.dataset['prisoner'];
      detailName.textContent = '';
      detailBadge.update({ tone: 'neutral', text: '' });
      for (const row of detailNeedRows) {
        row.element.hidden = true;
        delete row.element.dataset['need'];
        delete row.element.dataset['needPermille'];
        delete row.element.dataset['needUnmet'];
      }
      revealedPrisonerId = undefined;
      return;
    }

    // The subject as data as well as as text, so a probe reads which prisoner
    // this block is about without parsing a name -- the job `data-prisoner`
    // does on the row above.
    detailBlock.dataset['prisoner'] = String(shown.entityId);
    // The heading is the prisoner's *name*, through the roster's own formatter:
    // a name is state rather than copy (ADR 0015), so this block needs no
    // authored heading, and the unnamed fallback is the same "Prisoner {id}" the
    // row above shows rather than a second wording of it.
    detailName.textContent = formatPrisonerName(t, shown);
    const standing = describePrisonerRow(shown);
    detailBadge.update({ tone: standing.tone, text: t(standing.badgeKey) });

    detailNeedRows.forEach((row, index) => {
      const need = shown.needs[index];
      if (need === undefined) {
        row.element.hidden = true;
        delete row.element.dataset['need'];
        delete row.element.dataset['needPermille'];
        delete row.element.dataset['needUnmet'];
        return;
      }
      const readout = describeNeed(need);
      const word = t(readout.labelKey);
      const valueText = formatNeedValueText(localizer, readout.permille);
      row.name.textContent = word;
      row.bar.update({
        value: readout.permille,
        max: NEED_BAR_MAX_PERMILLE,
        valueText,
        tone: readout.tone,
        label: word,
      });
      row.value.textContent = valueText;
      row.element.hidden = false;
      // The same three fields the roster row carries, per need, and this is
      // what the block is for: `data-need-unmet` on all six is the *composition*
      // of `unmetNeedCount` -- the figure
      // `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` multiplies -- where
      // the roster's one row can only say whether it is at least one.
      row.element.dataset['need'] = need.needId;
      row.element.dataset['needPermille'] = String(need.permille);
      row.element.dataset['needUnmet'] = String(need.unmetForStateIncome);
    });

    if (revealedPrisonerId !== shown.entityId) {
      revealedPrisonerId = shown.entityId;
      revealDetail();
    }
  }

  let collapsed = false;
  const panel = createPanel({
    title: t(HUD_MESSAGE_KEY.regimeTitle),
    icon: 'regime',
    className: 'hud-regime',
    collapse: {
      collapseLabel: t(HUD_MESSAGE_KEY.panelCollapse),
      expandLabel: t(HUD_MESSAGE_KEY.panelExpand),
      collapsed: false,
      onToggle: () => {
        collapsed = !collapsed;
        panel.setCollapsed(collapsed);
      },
    },
  });
  /*
   * Below the roster, and that is reading order rather than an aesthetic: a
   * player picks a prisoner from the list and then reads about them, so the
   * answer sits under the question. It is also the only place it can go without
   * re-measuring what is already measured -- the roster's four rows and its "and
   * N more" line are asserted to sit inside this panel's fold at all five
   * viewports the browser suite visits
   * (`tests/browser/ui-shell.spec.ts`, *"keeps the last line of the roster
   * inside the panel's fold at every viewport"*), and a block above them would
   * push every one of those measurements down.
   *
   * A third block in this body, not a child of the roster's, so that
   * `.hud-regime__roster`'s own notes and rows keep answering the probes that
   * already read them: `regimeProbe` finds the empty sentence by querying
   * `.hud-regime__note` *inside* the roster block, and its `lastLineBottom` is
   * the lowest of the rows, the "and N more" line and that sentence. A need line
   * nested in there would join both of those without meaning to.
   */
  panel.body.append(blocksBlock, rosterBlock, detailBlock);

  /*
   * The single authority on whether either block has a box, run once here
   * rather than by an initial `hidden` on the elements: a second assignment
   * would be a line no test could fail on, which is the rule `paintNeeds` and
   * `paintCoverage` both state.
   */
  paintRegime();
  paintRoster();
  paintDetail();

  return {
    element: panel.element,
    setRegime(next: HudRegimeViewModel | undefined): void {
      regime = next;
      paintRegime();
    },
    setRoster(next: HudPrisonerRosterViewModel | undefined): void {
      roster = next;
      // The roster is repainted, and with it which row is checked and which row
      // holds the tab stop -- both are functions of the window that just
      // arrived. The inspector is *not* repainted from here: a prisoner who
      // drops out of the four-row window is still a prisoner the worker will
      // answer about, and their needs must not go away because somebody
      // riskier arrived. `hud/prisoner-roster` and `hud/prisoner-detail` are
      // two questions, and this is the answer to only one of them.
      paintRoster();
    },
    setPrisonerDetail(next: HudPrisonerDetailViewModel | undefined): void {
      detail = next;
      paintDetail();
    },
    clearPrisonerSelection(): void {
      if (selectedPrisonerId === undefined) return;
      selectedPrisonerId = undefined;
      detail = undefined;
      // Both, because the selection is on the row as `aria-checked` and
      // `data-selected` and in the block as its whole subject.
      paintRoster();
      paintDetail();
    },
    setVisible(visible: boolean): void {
      panel.element.hidden = !visible;
      // Both readouts are *pulled* while this tab is the one showing, so
      // leaving it stops the refresh -- and a readout nothing is refreshing
      // goes stale in silence. Cleared rather than frozen, exactly as the
      // Rooms and Intake panels clear their own: what is on screen must be
      // something a system is still answering for.
      //
      // **The selection is not cleared with them** (issue #895). It is chrome,
      // not a readout: the player's choice of prisoner is still their choice
      // when they come back, exactly as the Build panel's selected buildable
      // survives a tab change, and the host resumes asking about them on
      // arrival. What is cleared is the *answer*, which is the thing that would
      // otherwise be stale.
      if (!visible) {
        regime = undefined;
        roster = undefined;
        detail = undefined;
        paintRegime();
        paintRoster();
        paintDetail();
      }
    },
  };
}
