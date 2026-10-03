# Exact UI inventory repair after integrated verification

Prepared in an isolated worktree from `f80088fc60dc2c1caa83dcc045fb2be2d879d4a2`. Scope: two existing UI test inventories and two explicit per-module simulation type allowances. Production, gate scanners, package/construction rules, floors, budgets, workflow, architecture, copy, layout and Save format remain unchanged. The unapproved rotation draft is on a separate branch and is not included here.

## Actual cause and measured boundary 3 contracts

The real new `src/ui/simulation-object-placement-port.ts` was absent from both exact top-level inventories. The existing `object-tool.ts` and this new port also added the following **three erased import contracts** without corresponding manifest entries:

| Actual import site | Measured contract | Why it is orchestration permitted by AGENTS.md boundary 3 |
| --- | --- | --- |
| `src/ui/object-tool.ts` → `../simulation/objects/object-placement-service` | `import type { ObjectPlacementPreflight }` | The input orchestrator owns selected tool/aim and stale response ownership, then reports the already worker-produced footprint, price and refusal verdict. Its injected callback performs the read; it never imports or calls the simulation service. The actual placement gesture still reaches the worker, including when a preview is blocked. |
| `src/ui/simulation-object-placement-port.ts` → `../simulation/objects/object-placement-service` | `import type { ObjectPlacementPreflight }` | The channel adapter types the worker's reply. Its only runtime dependency is intra-UI `SimulationProjectionRequester`; the kernel's actual preflight/admission remains authoritative. |
| `src/ui/simulation-object-placement-port.ts` → `../simulation/worker/worker-channel` | `import type { SimulationMessageChannel }` | The injected channel/publication contract lets the main-thread orchestrator correlate a read-only request and follow authoritative ready/stopped/status/clock publications. It neither constructs a worker/kernel nor reads collision, claims or economy state directly. This matches the existing `simulation-room-template-port.ts` allowance. |

Opened actual sources and the neighboring room-template adapter/requester before editing. The manifest groups dependency kind by file and tree, so these three import sites require **two** narrowly named `simulation` entries, both `type-only`. The top-level list now includes this one actual module, as does the existing hard-coded-sentence inventory. No global simulation allowance, import-value exception, missing-module exclusion or scanner relaxation is introduced.

## Obtained evidence

- Original exact two test files: **4 RED / 35 GREEN**. Failures are the missing top-level source, the unlisted dependencies, the manifest-honesty check and the exact UI sentence inventory. Original raw output is retained.
- Corrected inventories: **39 GREEN / 2 files** at the original assertions.
- Real production negative: change each of the two actual `ObjectPlacementPreflight` import statements to import and reference the runtime `ObjectPlacementService` value. The unchanged gate reports both exact dependencies as `type-only` → `value`: **1 RED / 38 GREEN**. No test expectation is mutated.
- Both production files restored byte-exact before verification; SHA256 receipts below. `git diff` for the two production files is empty.
- Restored inventories plus neighboring full HUD-message boundary gate: **52 GREEN / 3 files**. The command also named a nonexistent helper test, `module-boundaries.test.ts` under the helpers directory; collection actually ran three files and only those three are claimed. The real scanner is `tests/helpers/module-boundaries.ts` used by the existing gate. The original command remains in the raw evidence; this sentence does not cite that missing file as an existing repository path.
- App and tools TypeScript checks: exit **0**. PowerShell retains the successful command's stderr as `NativeCommandError` text in the raw log; the process exit code was captured separately.

| Restored production source | Exact working-byte SHA256 |
| --- | --- |
| `src/ui/object-tool.ts` | `8db7c239a2a376ae2d30e30841140536b90b93e108f4a83660d7531f5f39840c` |
| `src/ui/simulation-object-placement-port.ts` | `ef1b82b29ff0d47c3ebdf8488b6b73e6b2a2b57778f5d87ba133c6081b248daf` |

Raw logs are stored byte-for-byte in [evidence](./evidence/receipt.json), with SHA256 and exact exit codes. No build/browser/server/native or complete `pnpm verify` run was performed. This resolves the four measured failures in this scoped set; root owns the remaining integration failures and full-gate acceptance.
