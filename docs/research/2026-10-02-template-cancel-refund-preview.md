# Coupled template cancellation: the queue row must quote the actual press

Dated 2026-10-02. LOCAL RUNTIME VERIFIED, with no browser, hosted release or CI
claim. Source/proof checkpoint `91fd4e82b0` on
`codex/template-cancel-refund-preview-20261002`.

## Question and existing decisions

Does a template queue row's existing refund number equal the money returned by
its own exact-revision `CancelBuildOrder` command?

The owner ruling recorded beside `hud.build.queue-order` in
`src/content/default-locale-en.ts` makes the number what Cancel returns; `0 back`
is deliberate when nothing returns. Issue #853 establishes that promise. Its
previous temporal cause and ADR0107's stale revision guard are distinct from
this finding. Issue #860 concerns a recycled row's target, also distinct.
Issues #1608 and #1657 already require whole-template cancellation and collective
occupied-room refusal/relocation. ADR0076's allocation destruction/refund rules
and actual recorded delivery payments remain the pricing rules. No new text,
tariff, refund policy, history rule or save field was introduced.

Fresh related Issue bodies and refund searches were read before implementation.
The evidence is an extension of those accepted boundaries, rather than a new
policy decision or a duplicate cancellation Issue.

## Baseline and corrected ancestry

Published base `b715dcf94a746665371924b780bbdb40cecb737d` did not yet contain the
accepted atomic cancellation source, although the live root checkout did.
The initial statement that the published base already contained it was corrected.
Owned accepted source dependencies were then cherry-picked, before the occupied
comparison: `7a7072799a`, `8a07fdfcab` and `7aa65eaef1` became `647082ca82`,
`9bd4b743d9` and `434c1402bb` in this isolated branch. The dependency source was
not rewritten for the new task.

Initial unoccupied diagnostic `b40e7346d7`: four failures and one ordinary control,
4.40 seconds. Correct expanded baseline `7d839045de`: six failures and the same
ordinary control. An earlier occupied fixture let intake choose its older spare
room instead of the row; that setup was discarded. The published corrected
fixture asserts actual row occupancy before preview and cancellation.

| Actual domain state | Existing row number | Actual command refund |
| --- | ---: | ---: |
| Basic Cell paid pending shell, live | 80 | 1425 |
| Same shell after encoded Save/Load | 80 | 1425 |
| Saved partial mirrored 90-degree row, selected in-progress fixture | 0 | 355 |
| Same row, selected assigned fixture | 40 | 355 |
| Occupied partial row, no spare | 65 | 0, occupied refusal |
| Occupied partial row, genuine older spare | 65 | 315, resident relocated |

The command already reversed the coupled gesture. The preview read only the
selected order and did not evaluate whether collective removal could succeed.

## Implementation boundary

The coordinator's exact completed metadata/history association is shared between
actual cancellation and the pure preview. Pending shells retain their existing
coupling; an ordinary shared wall gesture remains a single-order cancellation.
The session wires one nonpersisted cancellation-sequence reader.

Zoning shares its original validation, canonical tile collection and use-claim
check with a pure feasibility reader. Resident selection is the same existing
ascending-entity relocation walk, with the same accommodation and sharing rules,
over a private registry containing the actual room definitions and copied
residency claims. The live path retains its original claim/cold-state write and
rollback sequence. Preview writes neither live claims nor cold state.

Pricing replays the selected order first, followed by the coordinator's existing
coupled traversal. Each step removes demand progressively. One local delivery
list and stock map model the existing largest-fitting whole-delivery choice,
recorded paid amount, delivery-before-stock order, shelf bound and allocation
pricing. It does not sum independent previews or price only final demand.

The historical-delivery control restores legal encoded records with a small
2-brick batch paid at 13 and a larger indivisible batch paid at 777, while an
ordinary wall still needs bricks. Actual cancellation returns 78 in total and
leaves the large batch; jumping straight to final demand promises 842. These are
restored historical payment records, not a catalogue price change.

## Regression and production mutations

The final ten cases use real packed commands, the production worker projection,
exact row revision, actual treasury delta and encoded Save/Load. Occupied cases
include current metadata and legacy absent completed metadata. Complete saved
snapshots before/after projection catch money, orders, history and residency
changes. No-spare refusal preserves all persisted state except command sequence;
the spare cases prove the actual destination and removal of the old room.

| Deliberate production mutation | Observed red result |
| --- | --- |
| Disconnect the session cancellation-sequence reader | 9 failed, 1 ordinary control passed; 3.42s |
| Exclude the entire group from demand before its first cancellation | 1 failed, 9 controls passed; actual 78 versus preview 842; 3.41s |
| Run preview relocation on live claims/cold state | 2 failed, 8 controls passed; immutable snapshot assertion caught relocation; 3.39s |

Every mutation was restored to the exact saved source bytes in a `finally`
block. The restored ten-case run passed in 3.40s. Subsequent comments only moved
method documentation back onto its matching public method; the published final
ten-case run passed in 4.26s.

Related restored verification: 277 tests across 14 files passed in 9.13s, covering
existing ordinary queue refunds/JIT material accounting, occupied Cancel/Undo,
legacy occupied history, room-template economy transitions, zoning, relocation
notices, excess relocation and canonical iteration. App and tooling TypeScript
builds and production output verification passed. These are scoped local gates,
not a claim that the entire suite or hosted game was tested.

## Documentation evidence and limits

An exact seven-source-file before/after comparison passed all 12 quotation tests
before this source change, then identified eight newly shifted verifying anchors
in WORLD and ADR0019/0022/0047/0108. Only those live fragments were re-aimed;
previous numbers were retained explicitly as historical indications. Budgets,
tolerance, scanner and guards were not edited. The corrected quotation gate
passed 12/12 in 351ms.

The stale published base separately contains an unindexed generic-office-desk
collection and a build ID parsed as a nonexistent commit citation. The root
agent confirmed those are already corrected in its newer published integration.
They are inherited limitations of this isolated base, not preview regressions,
and were not edited by this task. Final release/CI and browser acceptance remain
with the root integration.
