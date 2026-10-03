# Integrated V9 history consumer correction

Obtained 2026-10-03 on exact source `2102c1700f79f5f5191edfcb3e64bdc571b3e697`, in branch `codex/v9-history-consumer-integration-20261003`. This changes four integration fixtures and evidence only. Production, persistence formats, refusal messages, refunds and budgets are unchanged.

## Original failure and scope

The parent obtained the full integrated failure log at `C:/Users/matma/AppData/Local/Temp/lockstate-staff-v9-complete-suite-20261003.txt` (SHA256 `3387041d99523251dae02a3448609b16bc72388a163ae135a765e718035053d6`). Its 182 failures across 16 files are a parent result. Our original run of the four assigned files obtained **40 failures and 91 passes, 131 total, in 8.31 seconds**; [original raw output](./raw/original-owned-baseline.txt).

The actual causes in those four files were:

- Two absent-alert acknowledgements now expose the approved persisted newer-action marker. The acknowledgement remains an accepted action even when the alert is absent.
- Two completed standing-object manual removals now expose that marker. Their complete order/history/revision snapshots remain unchanged apart from the exact boolean.
- Thirty-six occupied Undo expectations implicitly relied on the old save format losing the accepted admission marker. Current V9 correctly preserves it, so the existing newer-action refusal precedes occupied-room unzoning or spare relocation.

The coordinator approved the correction explicitly: current V9 must retain admission protection and refuse older Undo atomically; historical occupied Undo/relocation controls must use actual frozen encoded V8 absence with recomputed checksum and approved defaults. No production change was authorized or required.

## Corrected consumer oracles

Both occupied-history fixtures first encode/decode current V9 and compare the **entire restored session snapshot** to the actual captured state. Genuine packed Undo then proves that marker, revision ledger, treasury, objects/owners, residents, world and history remain exact. The sole expected kernel command-sequence change and exact existing `construction.undo-refused-newer-action` event, including bounded alert retention, are asserted separately.

Historical controls derive a V8 envelope from that genuine captured state: header 8, both new construction fields absent, recomputed payload checksum, and the real registered decoder/migration. Restored defaults must be exactly `false` and `{}`. These are explicit historical test fixtures, not a claim that a particular player supplied an old save. No runtime marker reset bypasses the guard. The legacy-metadata fixture additionally preserves its existing absent-template-metadata boundary and asserts the production omission of the empty coordinator section.

Original occupied refusal, collective row exclusion, genuine release/retry, spare relocation, funds, route/readiness and Undo/Redo assertions remain. Current V9 protection is tested before each historical conversion. The remaining acknowledgement/removal corrections permit only the exact boolean difference and keep all other persisted construction fields exact.

## Obtained verification

- Same four files and same 131 cases: **131 passes, 8.76 seconds**; [corrected raw output](./raw/corrected-owned.txt).
- Strict application and tools TypeScript: both exit 0; [app output](./raw/types-app.txt), [tools output](./raw/types-tools.txt).
- [Machine receipt](./raw/terminal.json) retains exact base, original log hash and scope.
- Bounded research-index, documentation-link and quotation contracts: **26 passes, one inherited failure, 13.80 seconds**; [raw output](./raw/docs-terminal.txt). Index and quotation contracts pass. The existing construction-history V9 record cites `docs/research/2026-10-03-queued-template-cancellation-load/v9-review-proposal.md`, which is absent from this exact integrated tree. Source line 7 contains an ordinary single-line path; the apparent line break in the raw terminal is output wrapping. This correction leaves the parent's separate documentation surface untouched.

No production mutation, browser, server, build or full-suite execution was performed in this correction. These results establish the scoped consumer correction; they do not add a new producer-negative or native acceptance claim. The previous V9 source record retains its separate actual producer omission/restoration evidence.
