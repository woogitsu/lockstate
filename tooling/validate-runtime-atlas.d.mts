/**
 * Types for the runtime atlas validation gate so `pnpm test` can drive the
 * *same* implementation CI runs, instead of a second copy of the rules.
 */

export interface AtlasValidationOptions {
  /** Path to the character contract JSON. Defaults to the production contract. */
  readonly contract?: string;
  /** Validate a single manifest file instead of the whole directory. */
  readonly manifestName?: string;
}

export interface AtlasValidationResult {
  /** Every problem found, not just the first. Empty means the batch is valid. */
  readonly errors: readonly string[];
  readonly atlasCount: number;
}

export function validateAtlasDirectory(
  atlasDirectory: string,
  options?: AtlasValidationOptions,
): Promise<AtlasValidationResult>;
