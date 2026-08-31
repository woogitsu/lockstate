/**
 * **Why the host refused, when the reason changes the sentence the player
 * reads.**
 *
 * ## What this is for
 *
 * A *command* intent (`purchase-materials`, `hire-staff`, `place-build-order`
 * …) is refused in one of two places, and this module is about the first of
 * them. `src/main.ts` pre-checks a press on this thread and throws; the HUD's
 * gate catches the throw, and `reportError` in `src/ui/hud/hud.ts` turns it into
 * a sentence on the control that was pressed (issue #207). Until the owner's
 * ruling 18 of 2026-08-31 that sentence was chosen from the `actionId` alone --
 * one key per intent -- so every way of refusing a purchase read the same line:
 * *"Nothing was bought — the purchase was refused and no money was spent."*
 *
 * Ruling 18 needs one of those ways to read differently: a charge that would
 * take the balance past `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` is a **limit**
 * being reached, not the money running out, and the player is owed the
 * difference. The `actionId` cannot carry that -- it names the control -- so the
 * reason travels on the thrown value, and this is the vocabulary it travels in.
 *
 * ## Why it is a module of its own, with no imports
 *
 * Three layers have to agree on it and no two of them may depend on each other:
 * `src/main.ts` throws it, `src/ui/hud/projection.ts` maps it to a message key,
 * and `src/ui/hud/hud.ts` reads it off the failure. The HUD may not import
 * `src/simulation/**` (`AGENTS.md` boundary 1, enforced by
 * `tests/unit/ui-hud-messages.test.ts`), which rules out putting it beside
 * `judgeAffordability` in `./affordability.ts` -- that module imports the
 * treasury's floor constant, and a HUD file importing it would pull the
 * simulation into the HUD's graph through a side door the boundary test cannot
 * see. A file with no imports at all can be depended on by every layer without
 * telling any of them anything about the others.
 *
 * ## Why a class and not a property on a plain `Error`
 *
 * The reader is handed an `unknown` -- `AsyncActionFailure.error` is whatever
 * the handler threw -- so it has to decide from the value itself. `instanceof`
 * answers that; a duck-typed `'reason' in error` would also match any thrown
 * object that happens to carry the word, including one from a library, and
 * would put an invented sentence on screen for it.
 *
 * The message is diagnostic English and deliberately never reaches the player
 * (ADR 0011): it goes to the host through `MountHudOptions.onError`, exactly as
 * every other thrown `Error` on this path does.
 */

/**
 * The closed vocabulary of reasons a *host* refusal can name.
 *
 * One member, and that is not an oversight: a reason belongs here only once
 * some sentence differs because of it. `AffordabilityRefusal`'s other branch
 * (`'malformed-charge'`) is deliberately **not** here -- a quantity that
 * arrived as `NaN` is a defect on this thread, and the generic refusal is the
 * true thing to say about it.
 */
export type HostRefusalReason = 'past-the-overdraft-floor';

/** A pre-dispatch refusal that names its reason. */
export class HostRefusalError extends Error {
  public constructor(
    public readonly reason: HostRefusalReason,
    message: string,
  ) {
    super(message);
    this.name = 'HostRefusalError';
  }
}

/**
 * The reason a thrown value names, or `undefined` for every value that names
 * none -- which is every refusal the interface had before ruling 18, and the
 * fallback is the sentence they all still read.
 */
export function hostRefusalReason(error: unknown): HostRefusalReason | undefined {
  return error instanceof HostRefusalError ? error.reason : undefined;
}
