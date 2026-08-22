export const ACCESSIBILITY_SETTINGS_VERSION = 1 as const;

export interface AccessibilitySettings {
  readonly version: typeof ACCESSIBILITY_SETTINGS_VERSION;
  readonly reducedMotion: boolean;
  readonly uiScale: number;
}

export const DEFAULT_ACCESSIBILITY_SETTINGS: AccessibilitySettings = {
  version: ACCESSIBILITY_SETTINGS_VERSION,
  reducedMotion: false,
  uiScale: 1,
};

export function decodeAccessibilitySettings(input: unknown): AccessibilitySettings | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  if (
    record.version !== ACCESSIBILITY_SETTINGS_VERSION ||
    typeof record.reducedMotion !== 'boolean' ||
    typeof record.uiScale !== 'number' ||
    !Number.isFinite(record.uiScale) ||
    record.uiScale < 0.75 ||
    record.uiScale > 2
  ) return undefined;
  return { version: ACCESSIBILITY_SETTINGS_VERSION, reducedMotion: record.reducedMotion, uiScale: record.uiScale };
}
