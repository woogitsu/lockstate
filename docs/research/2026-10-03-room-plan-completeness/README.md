# Public room-plan completeness — actual source audit, 2026-10-03

VERIFIED: isolated worktree starts at coordinator NEXT
`423189bf9c343da8a1ab732ed3df75a77ab7a764`. The public picker constructs a
button for each member of `ROOM_TEMPLATE_IDS` and has complete translated name
keys. Its 20 plans cover the 18 released catalogue room types: Basic/Large Cell
and Four-cell Row deliberately share `room.cell`. No missing released room type
or unimplemented template was found. No Issue was created for absent tests.

## Actual scheduled 90° placement and V8 restore

The reproducible `quarter-turn.audit.ts` is outside the ordinary CI test glob.
Its literal 20-row authoring census independently pins dimensions, shell counts,
fixture counts, target room ids and zone counts; expected geometry is not read
from a production plan factory. It uses the actual command packer, simulation
kernel, scheduled construction, template coordinator, object registry, room
enclosure, V8 writer/decoder and restore entry point. It injects no completed
orders, zoning, objects, stock, snapshot or placement verdict.

For each catalogue member, mirrored and unmirrored clockwise 90° commands must
create the expected pending owner and shell count, actually complete and furnish
the expected number of orders and objects, preserve orientation1 and source
order identities, register the expected room rectangles, satisfy the real
catalogue minimum in either legal axis order and report the appropriate sealed
or outdoor enclosure. Actual JSON/V8 Save/Load must retain world, all placed
objects, construction history/orders, pending/completed owners and room definitions.
The Yard's zero-shell immediate completion is checked separately by the same
actual path, with no fabricated shell work.

The final measured run passes 43/43 at 11:29:58 local time: one census plus 40
complete q1 cases and the two actual-worker dialog cases described below.
[`actual-quarter-turn-receipts.jsonl`](./actual-quarter-turn-receipts.jsonl)
contains a per-template/per-mirror receipt including exact registered rooms,
completed identities, object anchors/orientations, counts, elapsed scheduled
ticks and actual save schema. [`actual-quarter-turn-run.log`](./actual-quarter-turn-run.log)
retains the complete Vitest result. The 40 scheduled placement cases are actual
source-level observations, not native browser results or guarded regression
claims: the placement producer was not mutated for this audit.

The initial 41/41 run also performed actual writer/decoder/restore, but its
receipt observer accessed `envelope.schemaVersion`, which does not exist.
The subsequent dedicated strict typecheck exposed TS2551. The observer now
reads and explicitly asserts the actual `saveSchemaVersion === 8`; final
receipts contain that field. The untouched initial receipts and log are kept as
[`initial-quarter-turn-receipts.jsonl`](./initial-quarter-turn-receipts.jsonl)
and [`initial-quarter-turn-run.log`](./initial-quarter-turn-run.log).

## Actual worker dialog rotation, Escape and reopening

`dialog-reopen.audit.ts` executes the production public dialog listeners and
`RoomTemplateTool` with genuine preflight, quote and placement replies from
`SimulationWorkerStateMachine`. It supplies only DOM plumbing and the existing
new-session seed 73, with no forged worker verdict, projection or placement.
Both mirror variants rotate Basic Cell to q1, arm map placement, close the
reopened dialog with Escape, check opener focus and unchanged armed revision,
reopen and wait for a fresh genuine worker verdict and exact independent quote
(20 orders, 35 brick, two planks, catalogue value 1530). The full worker snapshot
remains unchanged across those dialog interactions. A numeric submit then
creates exactly one actual q1 pending owner and all 18 independently enumerated
shell orders at origin 5,5, consumes the armed owner and refuses a duplicate
submit. Exact wall sets are sorted by tile solely to ignore the producer's
rotation-dependent insertion order; door anchor and edge remain literal.

Two initial observer failures were corrected without changing player text or
production: the actual status is `Room plan submitted.`, and identical wall
sets arrive in rotated insertion order. Raw logs are retained as
[`initial-dialog-observer-failure.log`](./initial-dialog-observer-failure.log)
and [`initial-dialog-order-observer-failure.log`](./initial-dialog-order-observer-failure.log).

A controlled producer negative removed only the Escape listener's
`dialog.close()` in this isolated worktree. Both dialog cases went RED at the
actual `dialog.open` assertion (11:31:11); restoring the exact original bytes
made both GREEN (11:31:15). Original and restored producer SHA256 are
`25f90ad451f43d4a62ab22fa2bc8f2cc6c70799499994669b728cd279400f2bb`.
[`actual-escape-producer-negative.log`](./actual-escape-producer-negative.log)
and [`actual-escape-exact-restore.log`](./actual-escape-exact-restore.log)
retain both actual outputs. This establishes this source audit's sensitivity
to that producer omission; it does not establish trusted native keyboard or
window bubbling. Final production source has no diff.

## Existing controls verified

Five existing source suites passed 192/192: complete catalogue, four-turn
geometry, scheduled unrotated mirrored placement/SaveLoad, actual held-dialog
transform ownership and dialog-status refresh. The held-transform cases include
real worker replies for World/Angled Cell, Canteen and Laundry: changed rotation,
mirror or both preserves the current armed tool while refusing the old pointer
release; the next fresh press creates exactly one actual current shell. These
are existing product controls, not a newly discovered defect. Reopened dialog
readiness withdraws obsolete status/collision marks while its check is pending.

UNKNOWN: trusted native keyboard cancellation/reopening and rendered per-plan
pixels in the integrated client. The coordinator owns the browser process and
this audit starts none. No confirmed defect was found, so no Issue was invented.
No application, browser spec, workflow, player copy, palette, layout or save
format was changed.

Final strict application, tools and dedicated audit typechecks all exit 0.
The research index contract passes 5/5. Reproduce the source audit with
`vitest run --config docs/research/2026-10-03-room-plan-completeness/vitest.audit.config.ts`;
set `LOCKSTATE_CATALOGUE_AUDIT_RECEIPT` to a new file to retain per-case receipts.

The weakest claim is native public-control acceptance: real browser event
ownership and pixel placement can disagree with source callbacks. A frozen
built-client native run would change that claim; this audit cannot establish it.
