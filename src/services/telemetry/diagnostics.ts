import type { TelemetryAttributes } from './events';
import { redactText } from './redaction';

/**
 * Crash diagnostics carry the least that still identifies a bug: error
 * name, redacted message, reduced stack frames and the build they came
 * from. No save payload, no account id, no URL query, no local file path
 * (ADR 0010).
 */

export const MAX_STACK_FRAMES = 12;

export interface CapturedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string | undefined;
}

/** Normalizes anything a `catch` or an error event can hand us into a stable shape. */
export function captureError(error: unknown): CapturedError {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  if (typeof error === 'string') return { name: 'Error', message: error };
  return { name: 'Error', message: 'Non-error value thrown.' };
}

/**
 * Reduces a stack line to `function(file:line:col)`, keeping only the
 * bundle file's basename. The full URL would leak query strings and, in
 * development, the developer's filesystem layout; the basename plus the
 * build version is enough to symbolicate offline against the privately
 * retained source map.
 *
 * The `function(file)` shape is deliberate: the more familiar
 * `function@file.js` form is indistinguishable from an email address, so
 * redaction would (correctly, but uselessly) blank out every frame.
 */
export function reduceStackFrame(line: string): string | undefined {
  const trimmed = line.trim().replace(/^at\s+/, '');
  if (trimmed === '') return undefined;

  let functionName = '<anonymous>';
  let location = trimmed;

  const parenthesized = /^(.*?)\s*\(([^()]*)\)$/.exec(trimmed);
  if (parenthesized !== null) {
    functionName = parenthesized[1] === '' ? '<anonymous>' : (parenthesized[1] ?? '<anonymous>');
    location = parenthesized[2] ?? '';
  } else if (trimmed.includes('@')) {
    const separator = trimmed.indexOf('@');
    const name = trimmed.slice(0, separator);
    functionName = name === '' ? '<anonymous>' : name;
    location = trimmed.slice(separator + 1);
  }

  const position = /:(\d+):(\d+)$/.exec(location);
  const suffix = position === null ? '' : `:${position[1]}:${position[2]}`;
  const filePart = position === null ? location : location.slice(0, position.index);
  const fileName = filePart.split('?')[0]?.split('/').pop();

  return redactText(`${functionName}(${fileName === undefined || fileName === '' ? '<unknown>' : fileName}${suffix})`);
}

/** V8: every frame line begins `at `, after leading whitespace. */
const V8_FRAME_LINE = /^\s*at\s/;

/**
 * SpiderMonkey and JavaScriptCore: `functionName@location:line:col`, with no
 * `at ` to key on.
 *
 * The position at the end is what makes this a *frame* rather than any line
 * containing an at-sign, and requiring it is a defect fix rather than a
 * tightening. The rule used to be the bare `@`, and the comment below said why
 * it was there -- and a V8 header line is `Name: message`, so **any error
 * message containing an at-sign was admitted as a frame**. An email address in
 * a message is exactly that case, and it did not merely duplicate the message:
 * `reduceStackFrame` splits on the first at-sign and rewrites it as
 * `name(location)`, so `mail alice@example.com` became the frame
 * `RangeError: mail alice(example.com)` -- past the point where
 * `SENSITIVE_VALUE_PATTERNS`' email pattern can match it, because the at-sign
 * it keys on is gone. `errorMessage` was correctly redacted to
 * `mail [redacted]` while `frames` carried both halves of the same address in
 * clear. Measured against this file as it stood at 30db0e9:
 * `buildCrashDiagnosticAttributes` for a `RangeError('mail alice@example.com')`
 * produced `frames: 'RangeError: mail alice(example.com) |
 * boot(main-a1b2.js:12:9)'`. The regression is pinned in
 * `tests/unit/services-telemetry.test.ts`, in both directions -- the header
 * line stays out, and an engine that writes no header keeps its frames.
 *
 * It was latent only because nothing produced a telemetry event; it stops
 * being latent in the change that adds the first producer.
 *
 * SpiderMonkey and JavaScriptCore omit the header line entirely, so nothing
 * that was a frame stops being one.
 */
const AT_SIGN_FRAME_LINE = /@\S*:\d+:\d+\s*$/;

export function reduceStack(stack: string | undefined, maxFrames = MAX_STACK_FRAMES): readonly string[] {
  if (stack === undefined) return [];
  const frames: string[] = [];
  for (const line of stack.split('\n')) {
    if (frames.length >= maxFrames) break;
    // The first line of a V8 stack repeats "Name: message"; the message is
    // reported separately (already redacted) and must not be duplicated here.
    if (V8_FRAME_LINE.test(line) === false && AT_SIGN_FRAME_LINE.test(line) === false) continue;
    const frame = reduceStackFrame(line);
    if (frame !== undefined) frames.push(frame);
  }
  return frames;
}

export interface CrashDiagnosticContext {
  /** Coarse area of the app, e.g. `renderer`, `worker`, `persistence`. Never a save id. */
  readonly area: string;
  /** Optional stable, non-identifying detail such as a save schema version. */
  readonly detail?: string | undefined;
}

/**
 * Builds the attribute set for a `diagnostic.*` event. Returns plain
 * attributes rather than a finished envelope so it still passes through
 * the recorder's consent, sampling, validation and (second) redaction
 * steps -- no bypass path exists for diagnostics.
 */
export function buildCrashDiagnosticAttributes(
  error: CapturedError,
  context: CrashDiagnosticContext,
): TelemetryAttributes {
  const frames = reduceStack(error.stack);
  return {
    errorName: redactText(error.name),
    errorMessage: redactText(error.message),
    area: context.area,
    frameCount: frames.length,
    frames: redactText(frames.join(' | ')),
    ...(context.detail === undefined ? {} : { detail: redactText(context.detail) }),
  };
}

/**
 * Session ids are opaque, rotating and generated from an injected random
 * source (never a simulation RNG stream, never the account id). They are
 * not persisted: a new browser session is a new id, by design.
 */
export function createTelemetrySessionId(random: () => number = Math.random): string {
  const part = (): string => Math.floor(random() * 0xffff_ffff).toString(16).padStart(8, '0');
  return `s${part()}${part()}`;
}
