/**
 * Every way a submission can fail, as a distinct code. A single `invalid`
 * code would make the difference between "your build is too old" (a support
 * answer) and "these hashes do not match the replay" (a cheating or
 * determinism signal) invisible.
 *
 * Declared as an array rather than only as a union so the vocabulary can be
 * *enumerated* at run time, exactly as `PROTOCOL_FAULT_CODES` is
 * (src/simulation/protocol/types.ts). "Which members can nothing produce" and
 * "which members does no test drive" are questions a union type cannot be
 * asked, and issue #264 found three members of this vocabulary --
 * `evidence-too-large`, `command-after-final-tick` and
 * `objective-metric-missing` -- that no test reached, each mutable to a
 * no-op with the whole suite still green.
 *
 * It lives in its own module rather than beside the pipeline for the same
 * reason `PROTOCOL_FAULT_CODES` lives in `protocol/types.ts` and not in the
 * worker that emits it: the gate over this vocabulary
 * (`tests/foundation/challenge-rejection-code-reachability-contract.test.ts`)
 * measures which codes appear as literals in the module that *emits* them, so
 * a declaration sitting in that same module would make every code read as
 * emitted no matter what the pipeline does -- a gate green for the wrong
 * reason, which is the defect the gate exists to prevent.
 */
export const CHALLENGE_REJECTION_CODES = [
  'invalid-shape',
  'account-mismatch',
  'challenge-mismatch',
  'challenge-version-mismatch',
  'definition-hash-mismatch',
  'build-not-allowed',
  'content-version-not-allowed',
  'config-hash-mismatch',
  'seed-mismatch',
  'submission-window-closed',
  'evidence-too-large',
  'command-budget-exceeded',
  'tick-budget-exceeded',
  'command-stream-out-of-order',
  'command-after-final-tick',
  'checkpoint-cadence-invalid',
  'evidence-hash-mismatch',
  'duplicate-evidence',
  'replay-failed',
  'checkpoint-hash-mismatch',
  'final-state-hash-mismatch',
  'metrics-mismatch',
  'objective-metric-missing',
] as const;

export type ChallengeRejectionCode = (typeof CHALLENGE_REJECTION_CODES)[number];
