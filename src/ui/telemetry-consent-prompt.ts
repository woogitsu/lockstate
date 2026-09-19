import type { LocalizationKey } from '../content/localization';
import {
  type TelemetryConsentDraft,
  EMPTY_TELEMETRY_CONSENT_DRAFT,
  TELEMETRY_CONSENT_MESSAGE_KEY,
  TELEMETRY_CONSENT_ROWS,
  setTelemetryConsentCategory,
} from '../services/telemetry/consent-flow';
import { element, nextUiId } from './primitives/dom';

/**
 * The consent prompt's DOM, and nothing else.
 *
 * ## Where the line is drawn, and why it is drawn there
 *
 * Every decision this surface makes lives in
 * `src/services/telemetry/consent-flow.ts`: whether to ask at all, what a
 * stored decision means, which categories exist, which label belongs to each,
 * what the draft starts as, and what a toggle does to it. This file resolves
 * those into elements and turns two events back into calls.
 *
 * The reason is a hard constraint rather than taste. `vitest.config.ts` sets
 * `environment: 'node'` with no jsdom, so **every line below is unreachable
 * from `pnpm test`** and can only be exercised by the Playwright suite in
 * `tests/browser/`. Anything decided here would be a privacy control with no
 * headless coverage. What is consequently browser-only is precisely: that the
 * elements are created, that the checkbox `change` handler reaches
 * `setTelemetryConsentCategory`, that the two buttons call `onDecision`, and
 * that the section is removed afterwards. What each of those *computes* is
 * asserted in `tests/unit/services-telemetry-consent-flow.test.ts`.
 *
 * ## It is not a cookie banner
 *
 * It blocks nothing, dims nothing and steals no focus: the game is fully
 * playable with the prompt on screen, because refusing telemetry must cost a
 * player nothing. "Send nothing" is a real, one-click answer that writes a
 * decision rather than deferring one, so declining is as final as accepting
 * and the prompt does not come back.
 */

export interface TelemetryConsentLocalizer {
  format(key: LocalizationKey): string;
}

export interface TelemetryConsentPromptOptions {
  readonly localizer: TelemetryConsentLocalizer;
  /**
   * Called once, with the categories the player chose. Declining sends an
   * all-false draft rather than nothing: a refusal is a decision and is
   * recorded as one, which is what stops the prompt reappearing every load.
   */
  readonly onDecision: (draft: TelemetryConsentDraft) => void;
}

export interface TelemetryConsentPromptHandle {
  readonly element: HTMLElement;
  /** Removes the prompt. Safe to call twice; called for you after a decision. */
  dismiss(): void;
}

export function createTelemetryConsentPrompt(
  options: TelemetryConsentPromptOptions,
): TelemetryConsentPromptHandle {
  let draft: TelemetryConsentDraft = EMPTY_TELEMETRY_CONSENT_DRAFT;

  const titleId = nextUiId('telemetry-consent-title');
  const title = element('h2', {
    className: 'telemetry-consent__title',
    text: options.localizer.format(TELEMETRY_CONSENT_MESSAGE_KEY.title),
    attributes: { id: titleId },
  });

  const body = element('p', {
    className: 'telemetry-consent__body',
    text: options.localizer.format(TELEMETRY_CONSENT_MESSAGE_KEY.body),
  });

  const rows = TELEMETRY_CONSENT_ROWS.map((row) => {
    const input = element('input', {
      className: 'telemetry-consent__checkbox',
      attributes: { type: 'checkbox' },
    });
    // The draft is the source of truth, not the checkbox: the reducer decides
    // what a toggle means and this only reports the event to it.
    input.checked = draft[row.category];
    input.addEventListener('change', () => {
      draft = setTelemetryConsentCategory(draft, row.category, input.checked);
    });

    return element('label', {
      className: 'telemetry-consent__row',
      children: [input, element('span', { text: options.localizer.format(row.labelKey) })],
    });
  });

  const decide = (chosen: TelemetryConsentDraft): void => {
    dismiss();
    options.onDecision(chosen);
  };

  const accept = element('button', {
    className: 'telemetry-consent__action',
    text: options.localizer.format(TELEMETRY_CONSENT_MESSAGE_KEY.accept),
    attributes: { type: 'button' },
  });
  accept.addEventListener('click', () => decide(draft));

  const decline = element('button', {
    className: 'telemetry-consent__action',
    text: options.localizer.format(TELEMETRY_CONSENT_MESSAGE_KEY.decline),
    attributes: { type: 'button' },
  });
  decline.addEventListener('click', () => decide(EMPTY_TELEMETRY_CONSENT_DRAFT));

  const section = element('section', {
    className: 'telemetry-consent',
    // `region` plus `aria-labelledby` rather than a second catalog key for an
    // accessible name: the heading already carries the name, and a key with
    // nothing rendering it is the defect this whole change exists to fix.
    attributes: { role: 'region', 'aria-labelledby': titleId },
    children: [
      title,
      body,
      element('div', { className: 'telemetry-consent__rows', children: rows }),
      element('div', { className: 'telemetry-consent__actions', children: [accept, decline] }),
    ],
  });

  function dismiss(): void {
    section.remove();
  }

  return { element: section, dismiss };
}
