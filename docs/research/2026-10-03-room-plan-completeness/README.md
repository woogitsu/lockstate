# Public room-plan completeness — actual source audit, 2026-10-03

VERIFIED: isolated worktree starts at coordinator NEXT
`423189bf9c343da8a1ab732ed3df75a77ab7a764`. The public picker constructs a
button for each member of `ROOM_TEMPLATE_IDS` and has complete translated name
keys. Its20 plans cover the18 released catalogue room types: Basic/Large Cell
and Four-cell Row deliberately share `room.cell`. No missing released room type
or unimplemented template was found. No Issue was created for absent tests.

## Actual scheduled90° placement and V8 restore

The reproducible `quarter-turn.audit.ts` is outside the ordinary CI test glob.
Its literal20-row authoring census independently pins dimensions, shell counts,
fixture counts, target room ids and zone counts; expected geometry is not read
from a production plan factory. It uses the actual command packer, simulation
kernel, scheduled construction, template coordinator, object registry, room
enclosure, V8 writer/decoder and restore entry point. It injects no completed
orders, zoning, objects, stock, snapshot or placement verdict.

For each catalogue member, mirrored and unmirrored clockwise90° commands must
create the expected pending owner and shell count, actually complete and furnish
the expected number of orders and objects, preserve orientation1 and source
order identities, register the expected room rectangles, satisfy the real
catalogue minimum in either legal axis order and report the appropriate sealed
or outdoor enclosure. Actual JSON/V8 Save/Load must retain world, all placed
objects, construction history/orders, pending/completed owners and room definitions.
The Yard's zero-shell immediate completion is checked separately by the same
actual path, with no fabricated shell work.

The initial measured run passes41/41: one census plus40 complete q1 cases.
[`actual-quarter-turn-receipts.jsonl`](./actual-quarter-turn-receipts.jsonl)
contains a per-template/per-mirror receipt including exact registered rooms,
completed identities, object anchors/orientations, counts, elapsed scheduled
ticks and actual save schema. [`actual-quarter-turn-run.log`](./actual-quarter-turn-run.log)
retains the complete Vitest result. These are actual source-level observations,
not native browser results and not guarded regression claims; production was
not mutated for this read-only audit.

## Existing controls verified

Five existing source suites passed192/192: complete catalogue, four-turn
geometry, scheduled unrotated mirrored placement/SaveLoad, actual held-dialog
transform ownership and dialog-status refresh. The held-transform cases include
real worker replies for World/Angled Cell, Canteen and Laundry: changed rotation,
mirror or both preserves the current armed tool while refusing the old pointer
release; the next fresh press creates exactly one actual current shell. These
are existing product controls, not a newly discovered defect. Reopened dialog
readiness withdraws obsolete status/collision marks while its check is pending.

UNKNOWN: trusted native keyboard cancellation/reopening and rendered per-plan
pixels in the integrated client. The coordinator owns the browser process and
this audit starts none. A separate source-only follow-up will check the public
dialog rotation/Escape/reopen route rather than inventing an Issue from coverage.
No application, browser spec, workflow, player copy, palette, layout or save
format was changed.

The weakest claim is native public-control acceptance: real browser event
ownership and pixel placement can disagree with source callbacks. A frozen
built-client native run would change that claim; this audit cannot establish it.
