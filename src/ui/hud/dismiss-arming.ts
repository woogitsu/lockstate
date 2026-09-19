/**
 * The two presses a dismissal takes, decided once and provably.
 *
 * ## Why a dismissal is the one control that gets a confirm step
 *
 * `hud.ts` used to state the opposite where it dispatches `dismiss-staff`, and
 * that sentence is quoted rather than deleted because it was right about
 * everything except the thing that changed: *"**No confirmation step**, and that
 * is a decision rather than an omission. A dismissal cannot be undone -- it
 * destroys an entity -- so a confirm would be defensible; but this repository
 * has no confirmation primitive, inventing a modal here would be a UI pattern
 * decided inside one panel, and the control the player is reaching for is the
 * way *out* of a trap they cannot otherwise escape. [...] A confirm step is
 * worth proposing once there is a pattern for one."*
 *
 * The owner ruled on 2026-09-03 that a dismissal gets **both** a settle window
 * and a confirmation step -- *"Jedno i drugie"* -- and supplied the sentence the
 * confirmation says. So the proposal that paragraph asked for was made and
 * answered, and what is left of its argument is the constraint this module is
 * written under: the pattern must not be a modal, and it must not cost the
 * player the press that gets them out of the trap. Two presses on the *same*
 * control does neither. Nothing is blocked while an arm stands, no second
 * control is added -- the Staff panel's control inventory is fixed and
 * `app-shell.spec.ts` accounts for every button on the page -- and the first
 * press of the two is the one that was always there.
 *
 * ## Why this is a pure reducer rather than two flags in the panel
 *
 * `vitest.config.ts` runs on `environment: 'node'` with no jsdom, so
 * `createStaffPanel` is not merely untested from the unit suite, it is
 * unreachable: a mutation inside a paint function survives because nothing there
 * could observe it. `hud/tool-arming.ts` and `hud/pooled-row-binding.ts` are the
 * two precedents, and `docs/AGENT_WORKFLOW.md` records why extracting the
 * decision is the answer here rather than reporting an unreachable survivor.
 *
 * ## Why the arm may stand indefinitely, and needs no timer
 *
 * An arm that expires would be safer than one that latches *only if a row can be
 * re-pointed under it*, and after #877's fix it cannot: `assignPooledRows` keeps
 * a place naming one person for as long as that person is on the roster, and a
 * freed place stays visibly blank for the panel's settle window. So a standing
 * arm names exactly the person the confirmation box names, however long it
 * stands -- which is the property that makes an expiry unnecessary rather than
 * merely tolerable.
 *
 * An expiry was considered and rejected on evidence: the panel repaints on
 * publications, and publications reach the roster block only while the clock is
 * running and the Security tab is open (`refreshStaffRoster` in `src/main.ts`
 * returns early on any other tab). An arm timed out at paint time would
 * therefore never expire on a paused clock, which is the state a player
 * inspecting their payroll is most likely to be in -- an expiry that fires only
 * when it is least needed is worse than none, because it would be relied on.
 */

/**
 * A dismissal one press away from happening.
 *
 * `named` is the row's own label **as the player read it**, captured at the
 * arming press and not re-read afterwards. That is deliberate: the confirmation
 * box exists to say who is about to be sacked, and the strongest thing it can
 * say is a quotation of the row the player actually pressed. Re-reading it every
 * publication would let the sentence drift while the arm stands -- a status word
 * changing from `Unassigned` to `On Post` is a truthful update to the *row* and
 * a change of subject in a *question already asked*.
 */
export interface DismissArming {
  /** Who the press was aimed at. */
  readonly staffId: number;
  /** What the row said about them, verbatim, at the moment it was pressed. */
  readonly named: string;
}

/** What one press of a dismiss control means, given whether one is already armed. */
export type DismissPress =
  /**
   * Arms this row and sacks nobody. The first press on any row, and every press
   * on a row other than the armed one -- switching aim is arming, not
   * confirming, or a player correcting their aim would sack the person they were
   * correcting away from.
   */
  | { readonly kind: 'arms'; readonly arming: DismissArming }
  /** Confirms the standing arm. Only ever the armed row's own second press. */
  | { readonly kind: 'dismisses'; readonly staffId: number };

/**
 * What a press on one roster row means.
 *
 * `armed` is what the panel is holding, `pressed` is the row that was just
 * pressed as it reads *now*. A press confirms only when the standing arm is on
 * the same person; anything else arms.
 *
 * Keyed on the **person** and not on the row's position, which is the whole
 * point of #877: a position is not a stable name for anybody, so an arm recorded
 * as "row 2" and confirmed as "row 2" is the defect with an extra press in front
 * of it rather than a fix for it. After the fix a row cannot change person while
 * the arm stands, so the two readings agree in every reachable state -- and
 * keying on the person is what makes that a property rather than a coincidence.
 */
export function pressDismiss(armed: DismissArming | undefined, pressed: DismissArming): DismissPress {
  if (armed !== undefined && armed.staffId === pressed.staffId) {
    return { kind: 'dismisses', staffId: armed.staffId };
  }
  return { kind: 'arms', arming: pressed };
}

/**
 * Whether a standing arm survives a repaint.
 *
 * It survives exactly while some drawn row still names that person. That covers
 * every way the arm can become a question about nobody with one rule rather than
 * a list of cases: the person left the roster (dismissed by this press or by
 * another), the block lost its box, the projection stopped answering, or the
 * window slid them off the list.
 *
 * `onRows` is what the rows name after the publication has been applied --
 * `undefined` for a row naming nobody, which is a row holding its place open
 * inside the settle window and is not somebody to confirm about.
 */
export function retainDismissArming(
  armed: DismissArming | undefined,
  onRows: readonly (number | undefined)[],
): DismissArming | undefined {
  if (armed === undefined) return undefined;
  return onRows.includes(armed.staffId) ? armed : undefined;
}
