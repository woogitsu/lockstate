import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import {
  type DeleteArming,
  describeDeleteConfirmation,
  describeDeletedPrison,
  describeRestoreOutcome,
  describeSaveAge,
  pressDeleteConfirmation,
  retainDeleteArming,
} from '../../src/ui/save-panel-delete';
import { SAVE_PANEL_MESSAGE_KEY } from '../../src/ui/save-panel-messages';

/**
 * The confirmation step's decisions, in the environment that can watch them
 * (#1142).
 *
 * `vitest.config.ts` is `environment: 'node'`, so `SavePanel` itself is
 * unreachable from here and the browser spec
 * `tests/browser/ui-save-delete-confirmation.spec.ts` is where the wiring is
 * proven. What is proven *here* is the rule the wiring carries out, and the
 * first assertion below is the whole of the issue: before this change the
 * only thing between a row's Delete control and
 * `PrisonSaveRepository.delete` was a function call.
 */

const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const arming = (prisonId: string, named = 'Ironmoor', updatedAt = 0): DeleteArming => ({
  prisonId,
  named,
  updatedAt,
});

describe('no deletion is issued without a confirmation naming that prison (#1142)', () => {
  it('refuses when nothing is armed', () => {
    expect(pressDeleteConfirmation(undefined, 'prison-1')).toEqual({ kind: 'refuses' });
  });

  it('deletes the prison the arm names', () => {
    expect(pressDeleteConfirmation(arming('prison-1'), 'prison-1')).toEqual({
      kind: 'deletes',
      prisonId: 'prison-1',
    });
  });

  it('refuses a press aimed at a prison other than the armed one', () => {
    // A player who arms one deletion and then reaches a second confirmation
    // must lose neither prison: not the one they armed, and not the one they
    // pressed.
    expect(pressDeleteConfirmation(arming('prison-1'), 'prison-2')).toEqual({ kind: 'refuses' });
  });

  it('spends nothing: the arm is not consumed by the decision itself', () => {
    // The decision is pure, so the same arm answers the same way twice. What
    // stops a double deletion is the gate and the prison being gone, not this
    // function pretending to have state.
    const armed = arming('prison-1');
    expect(pressDeleteConfirmation(armed, 'prison-1').kind).toBe('deletes');
    expect(pressDeleteConfirmation(armed, 'prison-1').kind).toBe('deletes');
  });
});

describe('a standing question stops being asked when its subject leaves the list', () => {
  it('keeps an arm whose prison is still listed', () => {
    const armed = arming('prison-1');
    expect(retainDeleteArming(armed, ['prison-0', 'prison-1'])).toBe(armed);
  });

  it('drops an arm whose prison is gone', () => {
    expect(retainDeleteArming(arming('prison-1'), ['prison-0'])).toBeUndefined();
  });

  it('drops an arm when the list is empty, and answers undefined for no arm', () => {
    expect(retainDeleteArming(arming('prison-1'), [])).toBeUndefined();
    expect(retainDeleteArming(undefined, ['prison-1'])).toBeUndefined();
  });
});

describe('the age the confirmation reports', () => {
  it('reads as moments below a minute, at the boundary and for a timestamp ahead of the clock', () => {
    expect(localizer.format(describeSaveAge(0).messageKey)).toBe('less than a minute ago');
    expect(localizer.format(describeSaveAge(MINUTE - 1).messageKey)).toBe('less than a minute ago');
    // A machine whose clock moved back, or a save carried from another device.
    expect(localizer.format(describeSaveAge(-5 * MINUTE).messageKey)).toBe('less than a minute ago');
    expect(localizer.format(describeSaveAge(Number.NaN).messageKey)).toBe('less than a minute ago');
  });

  it('counts down in whole units and never rounds up into the next one', () => {
    const say = (ageMs: number): string => {
      const message = describeSaveAge(ageMs);
      return localizer.format(message.messageKey, message.messageParameters);
    };
    expect(say(MINUTE)).toBe('1 min ago');
    expect(say(59 * MINUTE + 59_000)).toBe('59 min ago');
    expect(say(HOUR)).toBe('1 h ago');
    expect(say(23 * HOUR + 59 * MINUTE)).toBe('23 h ago');
    expect(say(DAY)).toBe('1 d ago');
    expect(say(400 * DAY)).toBe('400 d ago');
  });

  it('uses a different key per bucket, so no bucket is reachable only through another', () => {
    const keys = [0, 5 * MINUTE, 5 * HOUR, 5 * DAY].map((age) => describeSaveAge(age).messageKey);
    expect(keys).toEqual([
      SAVE_PANEL_MESSAGE_KEY.deleteAgeMoments,
      SAVE_PANEL_MESSAGE_KEY.deleteAgeMinutes,
      SAVE_PANEL_MESSAGE_KEY.deleteAgeHours,
      SAVE_PANEL_MESSAGE_KEY.deleteAgeDays,
    ]);
  });
});

describe('the sentence the player is asked to answer', () => {
  it('names the prison and the age, resolved through the real bundled catalogue', () => {
    const message = describeDeleteConfirmation(arming('prison-1', 'Ironmoor'), '12 min ago');
    expect(localizer.format(message.messageKey, message.messageParameters)).toBe(
      'Delete Ironmoor? Every saved copy of this prison goes from your list. You can bring it back from this panel for one day, and after that it is gone for good. Its saves last changed 12 min ago.',
    );
  });

  it('carries the name it was armed with, not a name looked up later', () => {
    // The arming is the record of what the player read. A prison renamed while
    // the question stands is still the prison they were asked about.
    const message = describeDeleteConfirmation(arming('prison-1', 'Old Name'), 'less than a minute ago');
    expect(localizer.format(message.messageKey, message.messageParameters)).toContain('Delete Old Name?');
  });
});

/**
 * The undo window's sentences (ADR 0114), resolved through the real bundled
 * catalogue rather than through a stub.
 *
 * A stub localizer would prove that the right *key* was chosen and nothing
 * about what a player reads; these assertions are the shipped English, so an
 * edit to the catalogue that makes a sentence false about the code fails here
 * and not in a playtest. That is the record `AGENTS.md`'s fourth reservation
 * asks for, in the one place `pnpm test` can hold it.
 */
describe('what a deleted prison is offered as, and what an undo press comes back with', () => {
  it('names the prison on its own row and promises nothing about time', () => {
    const message = describeDeletedPrison('Ironmoor');
    expect(message.messageKey).toBe(SAVE_PANEL_MESSAGE_KEY.tombstoneItem);
    expect(localizer.format(message.messageKey, message.messageParameters)).toBe(
      'Ironmoor — deleted. You can still bring it back.',
    );
  });

  it('falls back to the prison id where there was never a name, exactly as the live row does', () => {
    const message = describeDeletedPrison('prison-1');
    expect(localizer.format(message.messageKey, message.messageParameters)).toBe(
      'prison-1 — deleted. You can still bring it back.',
    );
  });

  it('says the prison came back exactly as it was, and names it', () => {
    const message = describeRestoreOutcome('restored', 'Ironmoor');
    expect(localizer.format(message.messageKey, message.messageParameters)).toBe('Ironmoor is back, exactly as it was.');
  });

  it('gives each refusal its own sentence rather than one "could not"', () => {
    const sentences = (['window-closed', 'slot-taken', 'not-found'] as const).map((outcome) => {
      const message = describeRestoreOutcome(outcome, 'Ironmoor');
      return localizer.format(message.messageKey, message.messageParameters);
    });
    expect(sentences).toEqual([
      'Too late — that prison can no longer be brought back.',
      'That prison cannot come back — another prison now holds its place, and is still here.',
      'That prison is no longer here to bring back.',
    ]);
    // Three distinct states, three distinct sentences (#19's rule), and none of
    // them names the prison: two are true precisely because the thing the name
    // refers to is gone.
    expect(new Set(sentences).size).toBe(3);
    for (const sentence of sentences) expect(sentence).not.toContain('Ironmoor');
  });
});
