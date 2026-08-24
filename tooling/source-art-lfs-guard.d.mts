/**
 * Types for the source-art git-lfs guard, so `pnpm test` can drive the *same*
 * refusal the generator runs instead of a second copy of the rule.
 */

export const LFS_POINTER_PREFIX: string;

/** Builds the generator's own reader: the leading bytes of `<sourceDir>/<assetId>.png`. */
export function readSourceHead(sourceDir: string): (assetId: string) => Promise<string>;

export interface SourceInputCheck {
  /** Asset ids, without the `.png` extension -- the intake manifest's own vocabulary. */
  readonly entries: readonly string[];
  /** Returns the leading bytes of an input, decoded as UTF-8. */
  readonly readHead: (assetId: string) => Promise<string> | string;
}

/** Rejects when any input is a git-lfs pointer file rather than an image. */
export function assertSourceInputsAreImages(check: SourceInputCheck): Promise<void>;
