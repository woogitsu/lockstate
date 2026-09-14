import type { LocalizationKey } from '../content/localization';
import type { RestoreOutcome } from '../persistence/local/repository';
import type { MessageParameters } from '../services/localization/format';
import { SAVE_PANEL_MESSAGE_KEY } from './save-panel-messages';

/**
 * The decisions a confirmed deletion is made of, as pure functions.
 *
 * ## Why this is a module and not three branches inside `SavePanel`
 *
 * `vitest.config.ts` runs `environment: 'node'` with no jsdom, so every line
 * of `SavePanel` that touches `document` is not merely untested from
 * `pnpm test`, it is **unreachable**: a mutation inside `refresh` survives
 * because nothing there could observe it. `orderPrisonsForDisplay` was
 * extracted from that same file for exactly this reason (issue #445, its own
 * docblock records that reversing the comparator survived the entire suite),
 * and `src/ui/hud/dismiss-arming.ts` is the same extraction for the other
 * confirmation step in this repository. So the rule that a deletion needs a
 * confirmation is written here, where `pnpm test` can watch it go red, and
 * the panel is left holding only the wiring a browser has to check.
 *
 * ## Why a second control rather than two presses of the first
 *
 * `src/ui/hud/dismiss-arming.ts` confirms a dismissal with a second press of
 * the *same* control, and its docblock says why: the Staff panel's control
 * inventory is fixed, `app-shell.spec.ts` accounts for every button on the
 * page, and the control the player is reaching for there is the way out of a
 * trap. None of that holds here. The save panel's list is already built and
 * discarded on every `refresh`, its per-row controls already come and go with
 * the rows, and a deletion is not an escape from anything -- so the reason to
 * overload one control is absent and the cost of overloading it is real: two
 * presses of `Delete` is a gesture a player can complete without ever having
 * read the question, which is the whole of what issue #1142 reports.
 *
 * ## What is captured at the press, and why it is not re-read
 *
 * `DeleteArming` holds the prison's name and the timestamp its stored record
 * carried **when the player pressed Delete**, and nothing re-reads either
 * while the arm stands. That is `dismiss-arming.ts`'s rule applied to a
 * different subject: the confirmation exists to say what is about to be
 * destroyed, and a question already asked must not change subject underneath
 * the player. The *age* rendered from that timestamp is recomputed on every
 * paint, which is the opposite treatment for the opposite reason -- the
 * subject is fixed, the clock is not, and "3 min ago" left standing for an
 * hour would be a false sentence about a true subject.
 */

/** A message key and its parameters; structurally a `SaveMessage` (`save-panel.ts`). */
interface SaveMessage {
  readonly messageKey: LocalizationKey;
  readonly messageParameters?: MessageParameters;
}

/** A deletion one press away from happening. */
export interface DeleteArming {
  /** Which prison the press was aimed at. */
  readonly prisonId: string;
  /** What the row named it, verbatim, at the moment Delete was pressed. */
  readonly named: string;
  /** `PrisonSlotMetadata.updatedAt` as it read at that same moment. */
  readonly updatedAt: number;
}

/** What a press of the confirming control means, given what is armed. */
export type DeletePress =
  /** The armed prison is deleted. Only ever reached for the prison the arm names. */
  | { readonly kind: 'deletes'; readonly prisonId: string }
  /**
   * Nothing is deleted and no intent is issued -- nothing is armed, or what is
   * armed is a different prison from the one the press names.
   */
  | { readonly kind: 'refuses' };

/**
 * Whether a confirming press may issue a deletion.
 *
 * **This is the guard issue #1142 reports as missing.** `SavePanel.requestDelete`
 * called `controller.deletePrison` the moment a row's Delete button was
 * pressed, and `PrisonSaveRepository.delete` is unconditional by design
 * (`src/persistence/local/repository.ts:467`) -- it takes a prison id and
 * destroys every generation it references plus the slot record, in one
 * transaction, with no argument that could mean "ask first". That is the right
 * shape for the data layer: a confirmation is a fact about the player's
 * intent, and the only place that intent exists is the interface. So the
 * guard is here.
 *
 * Keyed on the prison and not merely on "something is armed", for
 * `pressDismiss`' reason one module over: a player who arms a deletion of one
 * prison and then presses the confirming control of another must not have the
 * first one deleted, and must not have the second one deleted either.
 */
export function pressDeleteConfirmation(armed: DeleteArming | undefined, prisonId: string): DeletePress {
  if (armed === undefined || armed.prisonId !== prisonId) return { kind: 'refuses' };
  return { kind: 'deletes', prisonId };
}

/**
 * Whether a standing arm survives a repaint.
 *
 * It survives exactly while the list still holds the prison it names. That
 * covers every way the question can become a question about nothing with one
 * rule rather than a list of cases: the prison was deleted by this press, by
 * another tab, or the slot record stopped validating and the list refused it.
 *
 * `retainDismissArming` is the same function for the roster, and the argument
 * for having one at all is the same: a confirmation left standing over a
 * subject that is gone would ask the player about nobody.
 */
export function retainDeleteArming(
  armed: DeleteArming | undefined,
  prisonIds: readonly string[],
): DeleteArming | undefined {
  if (armed === undefined) return undefined;
  return prisonIds.includes(armed.prisonId) ? armed : undefined;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * How long ago a prison's stored record was last written, as a message.
 *
 * ## Why the sentence says *changed* and not *saved*
 *
 * The only timestamp the panel has is `PrisonSlotMetadata.updatedAt`, and the
 * repository bumps it from **six** call sites, not one: `create` (`:459`),
 * `writeGeneration` (`:656`), `demoteGeneration` (`:829`),
 * `quarantineGeneration` (`:938`), `releaseQuarantinedGeneration` (`:987`) and
 * `confirmGeneration` (`:1045`), all in
 * `src/persistence/local/repository.ts`. Exactly one of those is a save. Four
 * are retention and quarantine bookkeeping that a *load* reaches --
 * `SessionController.loadPrison` calls `releaseQuarantinedGeneration` and then
 * the demotion loop -- and one is the prison being created before it has ever
 * been saved at all. (`recoverToGeneration` at `:1068` is the one slot write
 * that deliberately does not touch it.)
 *
 * So `'last saved 3 min ago'` would be a sentence this repository cannot keep:
 * a player who loaded a prison an hour after last saving it can see that
 * timestamp move without having saved anything. `'last changed'` is what the
 * field actually records, and it is the wording `AGENTS.md`'s fourth
 * reservation asks for -- the choice of words is ours, the truth is not.
 *
 * ## Why four buckets and abbreviated units
 *
 * The buckets exist because a player deciding whether to destroy a prison
 * needs to know whether it is minutes or months old, not what second it was
 * written. The units are abbreviated (`min`, `h`, `d`) because
 * `src/content/default-locale-en.ts` is a `Record<string, string>` with no
 * plural forms available in it at all (`save-panel-messages.ts` records the
 * same limitation for `save.list.item`), and an abbreviated unit symbol does
 * not inflect for number in English or in Polish -- so these four are counted
 * messages that genuinely need no plural forms, which is the reason
 * `tests/foundation/second-locale-contract.test.ts` requires beside every
 * entry in its list.
 *
 * A non-finite or negative age reads as `moments`: a stored timestamp ahead of
 * the clock is a real state (a machine whose clock was moved back, a save
 * carried from another device) and `'-4 min ago'` is worse than imprecise, it
 * is wrong.
 */
export function describeSaveAge(ageMs: number): SaveMessage {
  if (!Number.isFinite(ageMs) || ageMs < MINUTE_MS) {
    return { messageKey: SAVE_PANEL_MESSAGE_KEY.deleteAgeMoments };
  }
  if (ageMs < HOUR_MS) {
    return {
      messageKey: SAVE_PANEL_MESSAGE_KEY.deleteAgeMinutes,
      messageParameters: { count: Math.floor(ageMs / MINUTE_MS) },
    };
  }
  if (ageMs < DAY_MS) {
    return {
      messageKey: SAVE_PANEL_MESSAGE_KEY.deleteAgeHours,
      messageParameters: { count: Math.floor(ageMs / HOUR_MS) },
    };
  }
  return {
    messageKey: SAVE_PANEL_MESSAGE_KEY.deleteAgeDays,
    messageParameters: { count: Math.floor(ageMs / DAY_MS) },
  };
}

/**
 * The question the confirmation asks, as a key and its parameters.
 *
 * `{age}` arrives already resolved, which is the same last-possible-moment
 * split `describeRestoredScope` uses for `{restored}`: a fragment spliced into
 * a sentence has to be text by the time it is spliced, and resolving it
 * through the panel's own localizer is what keeps it a catalogue entry rather
 * than a literal authored in a module (ADR 0011).
 *
 * `{name}` is the row's own label as the player read it. It is player-authored
 * data or a prison id, never translatable, exactly as `save.list.item`'s
 * `{name}` is.
 */
export function describeDeleteConfirmation(
  arming: DeleteArming,
  age: string,
): SaveMessage {
  return {
    messageKey: SAVE_PANEL_MESSAGE_KEY.deleteConfirm,
    messageParameters: { name: arming.named, age },
  };
}

/**
 * What a deleted prison's row says while its undo window is open (ADR 0114).
 *
 * `{name}` is the display name the tombstone kept a copy of, or the prison id
 * where there never was one -- the same fallback the live row uses, and for the
 * same reason: both are data the player recognises and neither is translatable.
 *
 * **No remaining time is computed here, and that is the design rather than an
 * omission.** `SavePanel.refresh()` runs at mount and after every action and
 * never on a timer, so any duration painted into this row would be correct only
 * until the player stopped pressing things. ADR 0114 §3 settles what a display
 * may claim: the gate on an undo is the repository's own clock reading at the
 * press, never what a row last said, so a row that promises nothing about time
 * cannot promise it wrongly. What the row does assert -- that this prison can
 * still be brought back -- is true by construction, because
 * `listTombstones()` swept every copy whose window had closed before returning
 * the ones it did.
 */
export function describeDeletedPrison(named: string): SaveMessage {
  return { messageKey: SAVE_PANEL_MESSAGE_KEY.tombstoneItem, messageParameters: { name: named } };
}

/**
 * The four outcomes of pressing "Bring it back", as message keys.
 *
 * Shaped as a total switch over `RestoreFromTombstoneResult`'s arms rather than
 * as an `ok ? a : b`, so a fifth outcome added to the repository fails `tsc`
 * here instead of silently falling through to whichever sentence was written
 * last. That is `describeSaveResult`'s discipline one module over, and
 * `retentionVerdictFor` in `repository.ts` states the same rule for the same
 * reason.
 *
 * `named` is only spent on the success arm. The three refusals deliberately do
 * not name the prison: two of them are true precisely because the thing the
 * name refers to is gone, and a sentence that names it while saying it is not
 * there reads as though something is still recoverable.
 *
 * `RestoreOutcome` is imported from the repository rather than restated here,
 * so the union has exactly one definition and this switch is what fails when it
 * grows. It is a type, erased at compile time -- this module still runs no
 * persistence code, which is what its entry in
 * `tests/unit/ui-orchestration-boundaries.test.ts` records.
 */
export function describeRestoreOutcome(outcome: RestoreOutcome, named: string): SaveMessage {
  switch (outcome) {
    case 'restored':
      return {
        messageKey: SAVE_PANEL_MESSAGE_KEY.statusTombstoneRestored,
        messageParameters: { name: named },
      };
    case 'window-closed':
      return { messageKey: SAVE_PANEL_MESSAGE_KEY.statusTombstoneWindowClosed };
    case 'slot-taken':
      return { messageKey: SAVE_PANEL_MESSAGE_KEY.statusTombstoneSlotTaken };
    case 'not-found':
      return { messageKey: SAVE_PANEL_MESSAGE_KEY.statusTombstoneGone };
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled restore outcome "${String(unhandled)}".`);
    }
  }
}
