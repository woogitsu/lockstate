import { describe, expect, it } from 'vitest';
import {
  BROWSER_SUITES,
  DEFAULT_BROWSER_SUITE_NAME,
  selectBrowserSuite,
} from '../browser/browser-suites';

/**
 * Which browser gate `tests/browser/run-suite.ts` runs, driven directly.
 *
 * ## Why this is worth its own file
 *
 * The wrapper now drives two configs with opposite subjects: a Vite dev server
 * over `src/**`, and `dist/` served by workerd. #578 is what a mix-up costs --
 * the artefact spec was collected by the dev-server config, ran against
 * `src/**`, and **passed** while asserting a property of the built client.
 * Every refusal below is therefore asserted as a refusal: an argument parser
 * that falls back to a default when it does not understand its input is one
 * typo away from repeating that, and the fallback would be silent.
 *
 * Nothing here can establish that Playwright accepts the config path, that
 * `dist/` exists, or that the artefact suite measures what it claims. The first
 * two are demonstrated by running the wrapper; the third is
 * `tests/foundation/browser-suite-partition-contract.test.ts`.
 */

describe('browser suite selection', () => {
  it('runs the dev-server suite when nothing names one', () => {
    const result = selectBrowserSuite([]);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.selection.suite.name).toBe(DEFAULT_BROWSER_SUITE_NAME);
    expect(result.selection.suite.config).toBe('tests/browser/playwright.config.ts');
    expect(result.selection.forwarded).toEqual([]);
  });

  it('runs the artefact suite when it is named, in either spelling', () => {
    for (const argv of [['--suite', 'artifact'], ['--suite=artifact']]) {
      const result = selectBrowserSuite(argv);

      expect(result.ok, `\`${argv.join(' ')}\` was refused`).toBe(true);
      if (!result.ok) {
        continue;
      }
      expect(result.selection.suite.config).toBe(
        'tests/browser/playwright.artifact.config.ts',
      );
      expect(result.selection.forwarded).toEqual([]);
    }
  });

  it('hands every other argument to Playwright, in order, on both sides of the flag', () => {
    const result = selectBrowserSuite([
      '--grep',
      'boots',
      '--suite',
      'artifact',
      '--reporter=line',
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    // Order matters: `--grep boots` is one flag and its value, and a parser
    // that collected arguments into a set or sorted them would separate them.
    expect(result.selection.forwarded).toEqual(['--grep', 'boots', '--reporter=line']);
  });

  it('refuses a suite it does not know rather than falling back to the default', () => {
    const result = selectBrowserSuite(['--suite', 'playtest']);

    expect(
      result.ok,
      'an unrecognised suite name was accepted. The wrapper would then run the dev-server gate under a CI step that believes it is running the artefact gate -- which is #578, whose whole finding was a suite passing against the wrong subject.',
    ).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toContain('playtest');
    // The remedy has to be in the message: the reader is looking at a CI step
    // that just failed, not at this file.
    expect(result.error).toContain('artifact');
  });

  it('refuses `--suite` with nothing after it', () => {
    const result = selectBrowserSuite(['--grep', 'boots', '--suite']);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toContain('--suite');
  });

  it('refuses an empty name, which is not the default either', () => {
    const result = selectBrowserSuite(['--suite=']);

    expect(result.ok).toBe(false);
  });

  it('refuses two suites in one invocation rather than letting one win', () => {
    const result = selectBrowserSuite(['--suite', 'browser', '--suite=artifact']);

    expect(
      result.ok,
      'two `--suite` flags were accepted, so one of the two intentions was dropped without a word. Which gate ran would then depend on the parser rather than on the command line.',
    ).toBe(false);
  });

  it('names every registered suite by a distinct name and a distinct config', () => {
    // Vacuity guard, and the reason the count is a floor rather than an equality:
    // adding a third gate should extend this registry, not fail this file.
    expect(BROWSER_SUITES.length).toBeGreaterThanOrEqual(2);

    expect(new Set(BROWSER_SUITES.map((suite) => suite.name)).size).toBe(BROWSER_SUITES.length);
    expect(new Set(BROWSER_SUITES.map((suite) => suite.config)).size).toBe(BROWSER_SUITES.length);

    for (const suite of BROWSER_SUITES) {
      const result = selectBrowserSuite(['--suite', suite.name]);
      expect(result.ok, `the registry lists ${suite.name} but selection refuses it`).toBe(true);
    }
  });
});
