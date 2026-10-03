# Stationary room-plan ghost after completed Undo/Redo

2026-10-03; frozen subject6820098b36cbd4b24fd74d37849db2e1751b1323.
[Issue2007](https://github.com/woogitsu/lockstate/issues/2007). Isolated branch
codex/hud-template-history-verdict-audit-20261003. Production unchanged at this
diagnostic checkpoint; no browser/server/CI run.

## Actual route and original evidence

A packed kernel command builds/completes q1 Basic Cell at the independently
picked origin, with actual20 complete orders/zone/two fixtures. That actual
snapshot initializes SimulationWorkerStateMachine. Production
SimulationSnapshotFeed subscribes before initialize, just as main does, and
receives/pumps real worker messages; Scene frame plumbing reads that real feed.
Actual main ghost-install body, public dialog callbacks, RoomTemplateTool, worker
preflight/quote/commands and literal main Undo/Redo cases execute.

World origin11,11 / Angled10,11: public Undo cancels actual20 completed orders,
removes both actual objects and zone. Render revision increases; published rooms/
structures become empty. Fresh read-only worker preflight is ok:true. Stationary
ghost remains blocked: its old origin/selection dedup never rechecks world edits.
The source receipt records unchanged map query count before/after rendered frames;
the explicit diagnostic worker read adds one query without mutating the ghost.
Physical move to another square/back legally refreshes to clear.

Reverse: public orientation0/1 reselection legally obtains current clear verdict
after Undo, then actual public Redo restores same pending plan and20 existing
transaction members (including furniture, distinct from initial shell18). Current
worker refuses overlapping placement, while unchanged ghost still says clear.
Another real public orientation refresh legally makes it blocked. No purchase
without worker validation, completed Redo or unauthorized command is claimed.

`actual-final4red4controls.log`:4 actual failures/4 legal controls, maxWorkers2.
Both actual main/Scene modes cover both directions. Strict final diagnostic
`strict-diagnostic-final.log`:exit0. Fresh searches and full1657/1669/1946/1980
are retained: completed Undo and paused reservation cleanup really work, render
feed is current, and this is a map-ghost query omission rather than numeric dialog
status during a new query.

## Honest setup failures

- `initial-source.log`:4 extractor errors (TypeScript-stripper rejected a bare
  function-body return); same literal callback compiled directly as JavaScript.
- `strict.log`:illegal paused speed extra field and missing optional object
  guards, repaired only in fixture; `legal-protocol2red2controls.log` keeps
  actual2 Undo failures and2 movement controls with legal protocol.
- `actual-feed2red2controls.log`:2 empty-frame setup errors from subscribing
  after initialization. Subscribe before initialize;
  `actual-initialized-feed2red2controls.log` restores actual2 Undo failures/2
  controls, now proving published current frame too.
- `actual-undo-redo4red4controls.log`:actual2 Undo errors plus4 WRONG observer
  counts; I assumed Redoqueues shell18. Existing completed transaction reactivates
  all20 members. Correct independent expected20 yields actual4 RED/4 GREEN.

These setup errors are not production regressions or producer mutation proof.
No native trust, modal inertness, actual accessibility200% layout or pixels are
claimed. Logical HUD bounds scale2 exercises approved fit; real World Camera and
Angled yaw35/elevation65/zoom1.4 are the actual source projections.

## Granted next scope

Bridge/main named adapter may consume existing renderFeed.revision to invalidate
only the stale preview query. Preserve selected/fitted origin, press/selection
ownership, session logic, #2006 non-primary-touch reset and worker validation.
No polling/protocol/persistence/Scene/copy/layout changes. Source fix, real
producer omission, byte-exact restoration and ROOT native acceptance pending.
