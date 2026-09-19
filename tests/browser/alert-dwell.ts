import type { HudViewModel } from '../../src/ui/hud';
import { type Page, expect } from './network-changed-fixture';
import './ui-harness-api';

/**
 * "This sentence was on the screen for at least N milliseconds" -- the
 * assertion issue [#700](https://github.com/matmaxalez/lockstate/issues/700)
 * was filed for the absence of.
 *
 * ## The class of defect this exists to catch
 *
 * On 2026-08-31 a playtest of `main` at v0.0.273 watched a neglected prison
 * lose three prisoners. The owner's escape sentence -- *"{name} broke out --
 * no guard reached them in time."* -- **was written correctly all three
 * times**, in the `danger` band, unhidden, naming the person. It was replaced
 * **1 ms, 0 ms and 0 ms later** by *"The prison is under control again."*
 * Across 21.8 minutes the frame log held 52 distinct texts and the escape
 * sentence was not one of them: it reached **zero frames**
 * (`docs/research/2026-08-31-playing-the-nine-changes.md` section 2c).
 *
 * **Nothing in this repository could have failed on that**, and that is the
 * point of this file rather than a footnote to it:
 *
 * - `vitest.config.ts` is `environment: 'node'` with no jsdom, so the module
 *   that writes the band (`src/ui/hud/hud.ts`, `applyEventNotice`) is not
 *   merely untested there, it is unreachable.
 * - Every DOM assertion in the browser suite reads the band **after** the
 *   event. By then the replacing sentence is the one in `textContent`, so the
 *   test reads the all-clear and passes.
 * - #691's own browser cases assert the escape row is *produced*, which it
 *   was. The failure was that it did not survive a frame, and **survival is
 *   not a property any assertion in the suite could express.**
 *
 * `tests/browser/clipping.ts` is the model this follows and the two are
 * siblings: that one answers "is the string where the element is", this one
 * answers "was the string ever on the screen, and for how long". Neither is
 * implied by a text assertion and neither implies the other.
 *
 * ## What is measured, and why it takes two recorders
 *
 * **A `MutationObserver` gives the writes; a `requestAnimationFrame` loop
 * gives the paints, and the whole finding is the difference between them.** A
 * poll cannot answer this: the playtest's own 100 ms poll took 52 samples
 * across the run and never once landed on the escape sentence, because a
 * sentence that stands for 1 ms is invisible to any sampling rate a test would
 * choose. Reading the DOM after the fact is worse still -- it reads the
 * *replacement*.
 *
 * So the recorder keeps both, and a `BandRecording` can say the thing #700 had
 * to be written by hand to say: *written three times, painted zero times.*
 *
 * ## Why the delivery has to go through separate tasks
 *
 * `src/main.ts:1784` calls `hud?.update(viewModel)` **synchronously, once per
 * worker message**, with no animation-frame batching anywhere in the path.
 * `SimulationWorkerStateMachine.publishEvents` posts one `simulation/event` per
 * event in a single loop, so two events recorded on one tick arrive as two
 * `Worker.onmessage` tasks that both run before the browser's next paint --
 * two DOM writes, one frame, and the frame shows the second one.
 *
 * A test that applied both view models in a single `page.evaluate` would be
 * measuring something the application never does. `deliverAsTheWorkerWould`
 * therefore hands each model over in its own task, through a `MessageChannel`,
 * which is the same kind of task a `Worker` message arrives on.
 *
 * ## How a test using this is stopped from going vacuous
 *
 * An instrument that observes nothing would let every assertion built on it
 * pass, which is a worse outcome than the defect it was written for. Four
 * guards, and `ui-escape-sentence-survival.spec.ts` proves each of them by
 * exercising it:
 *
 * 1. `installBandRecorder` throws when its selector matches no element.
 * 2. `readBandRecording` throws when no recorder was installed.
 * 3. Every assertion below first requires **at least two animation frames** --
 *    a page that never painted cannot report a dwell -- and **at least one
 *    observed write**. A silent band means the assertion proves nothing, and
 *    it fails saying so.
 * 4. `expectNeverPainted`, the assertion the *control* arm uses, additionally
 *    requires that the text **was written**. Otherwise "it never reached a
 *    frame" would hold for a sentence nobody ever produced -- which is the
 *    exact way a regression test for #700 would rot into a tautology.
 */

/** One DOM write to the band, as the `MutationObserver` saw it. */
export interface BandWrite {
  /** `performance.now()` when the observer ran. */
  readonly at: number;
  readonly text: string;
  readonly severity: string | null;
  /** `hidden`, or inside an ancestor that is not displayed -- issue #220's check. */
  readonly hidden: boolean;
  /**
   * How many `MutationRecord`s this callback carried.
   *
   * A `MutationObserver` callback is a microtask checkpoint, so several writes
   * inside **one** task collapse into one callback. The production path does
   * not do that -- each event is its own worker message and therefore its own
   * task -- but a future one might, and a `records` above 1 is how a reader
   * would tell.
   */
  readonly records: number;
}

/** A stretch of consecutive animation frames in which the band said the same thing. */
export interface BandSpan {
  readonly text: string;
  readonly severity: string | null;
  readonly hidden: boolean;
  /** `performance.now()` of the first frame this state was current in. */
  readonly firstFrameAt: number;
  /** …and of the last. Equal to `firstFrameAt` when it survived exactly one frame. */
  readonly lastFrameAt: number;
  /** Frames it was current in. `1` is "painted once", which is not the same as "seen". */
  readonly frames: number;
}

/** What one recording window observed. */
export interface BandRecording {
  readonly selector: string;
  readonly startedAt: number;
  readonly stoppedAt: number;
  /**
   * Every animation frame the recorder ran in, whether or not the band
   * changed. Zero or one means the page did not paint and **no dwell claim can
   * be made from this recording at all.**
   */
  readonly frameCount: number;
  readonly writes: readonly BandWrite[];
  readonly spans: readonly BandSpan[];
}

interface BandRecorderHandle {
  readonly stop: () => BandRecording;
}

declare global {
  interface Window {
    /** Installed by `installBandRecorder`; removed by `readBandRecording`. */
    __lockstateBandRecorder?: BandRecorderHandle;
  }
}

/**
 * Starts watching `selector` -- both the writes to it and the frames it
 * survives.
 *
 * Install this **before** the thing under test writes to the band. There is no
 * way to recover a frame that has already gone by, which is the whole reason
 * the defect this file exists for was invisible.
 *
 * Runs in the page and is self-contained on purpose: Playwright ships this
 * function to the browser as its own source text, so it may close over nothing
 * from this module.
 */
export async function installBandRecorder(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel: string) => {
    const found = document.querySelector(sel);
    if (found === null) {
      throw new Error(`alert-dwell: nothing matches ${sel}, so a recording of it would observe nothing and prove nothing`);
    }

    const read = (): { text: string; severity: string | null; hidden: boolean } => {
      const el = document.querySelector(sel);
      if (el === null) return { text: '', severity: null, hidden: true };
      const html = el as HTMLElement;
      return {
        text: (html.textContent ?? '').trim(),
        severity: html.getAttribute('data-severity'),
        // `offsetParent === null` is the check issue #220 was measured with: a
        // node inside a `display: none` ancestor is in the DOM and on nobody's
        // screen, and `hidden` alone would not notice.
        // `!== false` rather than a truthiness test: `hidden` is
        // `boolean | 'until-found'` in the DOM lib, and `'until-found'` is a
        // band a player cannot read either.
        hidden: html.hidden !== false || html.offsetParent === null,
      };
    };

    const writes: BandWrite[] = [];
    const spans: BandSpan[] = [];
    const started = performance.now();
    let frameCount = 0;
    let running = true;

    const observer = new MutationObserver((records) => {
      writes.push({ at: performance.now(), records: records.length, ...read() });
    });
    observer.observe(found, { subtree: true, childList: true, characterData: true, attributes: true });

    const sample = (): void => {
      if (!running) return;
      frameCount += 1;
      const at = performance.now();
      const now = read();
      const last = spans.at(-1);
      if (last !== undefined && last.text === now.text && last.severity === now.severity && last.hidden === now.hidden) {
        // Mutable in the page only; the array crosses `page.evaluate` as a
        // structured clone, so nothing outside can see a half-extended span.
        (last as { lastFrameAt: number; frames: number }).lastFrameAt = at;
        (last as { lastFrameAt: number; frames: number }).frames = last.frames + 1;
      } else {
        spans.push({ ...now, firstFrameAt: at, lastFrameAt: at, frames: 1 });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);

    window.__lockstateBandRecorder = {
      stop: (): BandRecording => {
        running = false;
        observer.disconnect();
        return { selector: sel, startedAt: started, stoppedAt: performance.now(), frameCount, writes, spans };
      },
    };
  }, selector);
}

/**
 * Stops the recorder and brings back everything it saw.
 *
 * Throws rather than answering an empty recording when nothing was installed:
 * an empty recording would satisfy no assertion here, but it would satisfy a
 * caller that only counted writes, and a mistake in the harness must not be
 * able to read as a finding about the product.
 */
export async function readBandRecording(page: Page): Promise<BandRecording> {
  return page.evaluate(() => {
    const recorder = window.__lockstateBandRecorder;
    if (recorder === undefined) {
      throw new Error('alert-dwell: readBandRecording with no recorder installed -- call installBandRecorder first');
    }
    delete window.__lockstateBandRecorder;
    return recorder.stop();
  });
}

/**
 * Hands each view model to the mounted HUD **in its own task**, the way the
 * worker's messages arrive.
 *
 * The header says why this matters: the application applies one worker message
 * per task, synchronously, and the defect #700 records is two of those landing
 * inside one frame budget. Delivering the sequence in a single `evaluate`
 * would collapse the writes into one task and measure a path the application
 * does not take.
 *
 * `MessageChannel` rather than `setTimeout(0)`: a channel message is a task
 * with no clamped minimum delay, so the two writes land as close together as
 * the two worker messages do. Widening the gap would make the escape sentence
 * survive for reasons the application does not supply.
 */
export async function deliverAsTheWorkerWould(page: Page, models: readonly HudViewModel[]): Promise<void> {
  await page.evaluate(async (sequence: readonly HudViewModel[]) => {
    for (const model of sequence) {
      await new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          window.lockstateUiHarness.setHudViewModel(model);
          resolve();
        };
        channel.port2.postMessage(undefined);
      });
    }
  }, models);
}

/** Lets the recorder run for `ms` of wall clock, so frames accumulate after the last write. */
export async function letFramesRun(page: Page, ms: number): Promise<void> {
  await page.waitForTimeout(ms);
}

/** Frames in which `text` was the band's whole content and the band was on screen. */
export function framesShowing(recording: BandRecording, text: string): number {
  return recording.spans
    .filter((span) => span.text === text && !span.hidden)
    .reduce((total, span) => total + span.frames, 0);
}

/**
 * The longest unbroken stretch, in milliseconds, that `text` was on screen.
 *
 * The longest rather than the total: a player reads a sentence that stood
 * once, and two 40 ms appearances are not an 80 ms one. A span the recorder
 * caught in exactly one frame measures **0 ms**, which is honest -- it was
 * painted, and nobody could read it.
 */
export function dwellOf(recording: BandRecording, text: string): number {
  return recording.spans
    .filter((span) => span.text === text && !span.hidden)
    .reduce((longest, span) => Math.max(longest, span.lastFrameAt - span.firstFrameAt), 0);
}

/** Writes whose post-mutation text was `text` -- what the band was *told* to say. */
export function writesOf(recording: BandRecording, text: string): number {
  return recording.writes.filter((write) => write.text === text).length;
}

/**
 * The two conditions under which **no** claim about dwell may be made, checked
 * before any of them is.
 *
 * Without this an instrument that failed to attach, or a page that never
 * painted, would turn every assertion built on it green. Guard 3 of the four
 * in the header.
 */
function requireTheRecorderSawSomething(recording: BandRecording, what: string): void {
  expect(
    recording.frameCount,
    `${what}: the recorder ran in ${String(recording.frameCount)} animation frames over ${String(Math.round(recording.stoppedAt - recording.startedAt))} ms, so the page did not paint and nothing here can be concluded about what a player saw`,
  ).toBeGreaterThanOrEqual(2);
  expect(
    recording.writes.length,
    `${what}: nothing wrote to ${recording.selector} during the recording, so this assertion is about a band nobody used and proves nothing`,
  ).toBeGreaterThan(0);
}

/**
 * Asserts that `text` was on screen, in one unbroken stretch, for at least
 * `minimumMs`.
 *
 * The assertion #700 needed and the suite could not express. It fails in three
 * distinguishable ways, and the message says which: the recorder saw nothing;
 * the sentence was written but reached no frame (the #700 shape exactly); or
 * it was painted and did not stand long enough.
 *
 * **On choosing `minimumMs`.** It is a floor on what a test is willing to call
 * "seen", not a claim about how long the product shows something. Keep it well
 * under the interval the producer actually leaves -- an escape sentence stands
 * until the next event, which in the prison #700 measured is thousands of
 * ticks -- so that the assertion fails on *displacement* rather than on a slow
 * machine.
 */
export function expectPaintedFor(recording: BandRecording, text: string, minimumMs: number, what: string): void {
  requireTheRecorderSawSomething(recording, what);

  const written = writesOf(recording, text);
  const frames = framesShowing(recording, text);
  expect(
    frames,
    `${what}: "${text}" was written to the band ${String(written)} time(s) and reached ${String(frames)} animation frames -- written and never painted is issue #700's shape exactly. The band's frames were: ${recording.spans.map((span) => `${String(span.frames)}x "${span.text}"`).join(' | ')}`,
  ).toBeGreaterThan(0);

  const dwell = dwellOf(recording, text);
  expect(
    Math.round(dwell),
    `${what}: "${text}" reached ${String(frames)} frames but stood for only ${String(Math.round(dwell))} ms, under the ${String(minimumMs)} ms this test calls seen`,
  ).toBeGreaterThanOrEqual(minimumMs);
}

/**
 * Asserts that `text` was written to the band and **never reached a frame** --
 * the defect, stated as an assertion.
 *
 * This is what a control arm uses. It is deliberately harder to satisfy than
 * its name suggests: a sentence nobody produced also never reaches a frame, so
 * requiring the write is what stops the control from passing for the wrong
 * reason and taking the instrument's credibility with it. Guard 4 of the four
 * in the header.
 */
export function expectNeverPainted(recording: BandRecording, text: string, what: string): void {
  requireTheRecorderSawSomething(recording, what);

  expect(
    writesOf(recording, text),
    `${what}: "${text}" was never written to the band, so "it never reached a frame" is true of any sentence at all and this control proves nothing`,
  ).toBeGreaterThan(0);
  expect(
    framesShowing(recording, text),
    `${what}: "${text}" reached a frame, so the displacement this control is built on did not happen and the instrument is not being exercised`,
  ).toBe(0);
}
