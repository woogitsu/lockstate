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

export function reduceStack(stack: string | undefined, maxFrames = MAX_STACK_FRAMES): readonly string[] {
  if (stack === undefined) return [];
  const frames: string[] = [];
  for (const line of stack.split('\n')) {
    if (frames.length >= maxFrames) break;
    // The first line of a V8 stack repeats "Name: message"; the message is
    // reported separately (already redacted) and must not be duplicated here.
    if (/^\s*at\s|@/.test(line) === false) continue;
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
