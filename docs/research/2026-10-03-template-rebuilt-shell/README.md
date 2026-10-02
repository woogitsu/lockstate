# Completed template shell removed and independently rebuilt

Measured 2026-10-03 in an isolated worktree at
`4b5e06b4d279260318d34a7dd604bd46c6e9435f`. This is packed runtime
coverage, without a browser or a production change.

## Question and observed boundary

Does a later old-template cancellation destroy an independently purchased wall
or door at the manually removed element's former position, as standing
furniture replacement did in [#1975](https://github.com/woogitsu/lockstate/issues/1975)?

**No, for the genuine manual-removal path measured here.** The existing
`RemoveWall` arm prepares collective reversal, cancels the selected order, and
immediately reconciles the cancelled shell. At this checkpoint the opened
source is `src/simulation/runtime/session-commands.ts:1050-1061`. Every one of
the twenty original Basic Cell orders is already cancelled before the new
independent purchase. Fixtures, doors and the room instance are removed too.
This differs from a direct standing `RemoveObject`; no shell provenance field,
format change or new policy is proposed.

Fresh related Issue searches and #1975 were read before this finding. Existing
manual-door and occupied-cancellation tests cover reversal; this regression
adds the later genuine independent purchase, encoded Load and old-order
cancellation boundary. No new Issue is opened for already-correct behaviour.

## Eight actual player-command cases

`tests/integration/room-template-rebuilt-shell-ownership.test.ts` covers wall
and door, mirror false/true and quarter-turns zero/one. The doors exercise both
north and west edges. Each case:

1. Builds and completes a Basic Cell through packed kernel commands.
2. Manually removes its completed wall or door with `RemoveWall`.
3. Checks all original orders cancelled, no fixture/door/room registry entries,
   and unchanged funds: completed construction stays spent.
4. Purchases the same-position independent square wall or wooden door and
   genuinely finishes it. The charges are exactly 80 and 65 respectively.
5. Encodes and decodes the current V8 save and restores the real runtime.
6. Sends current-revision `CancelBuildOrder` for the original terminal order.
   The entire captured gameplay snapshot, exact new order and its nonempty
   material allocation stay identical; funds and live geometry stay unchanged.
7. Uses a **separate continuation of the actual saved state before old Cancel**
   for the legal Undo control. Undo removes the newest independent purchase;
   another Undo encounters only cancelled original orders. No refund or
   furniture resurrection occurs.

The fork in step7 matters: an intervening unrelated command changes live Undo
eligibility. This record does not claim Undo after such a command is legal.
No synthetic history, source owner or physical state is injected.

[Actual eight captured lifecycles](./actual-packed-lifecycles.json) retain the
complete construction/world/gameplay snapshots before and after these stages.

## Real production negative and exact restoration

Only the manual `RemoveWall` call to `roomTemplates.reconcileCancelledShells()`
was disconnected. The worktree was detached while mutated so the branch-based
checkpoint sweep could not publish deliberate broken production. A `finally`
restored the original file bytes and the original branch.

- [Production mutation output](./production-mutation.txt): **8 failed**, all
  at the remaining-original-orders invariant; 397ms tests, 2.77s total.
- [Exact restoration output](./exact-restoration.txt): **8 passed**, 595ms
  tests, 3.22s total.
- Restored source SHA256:
  `ED9C832F385FF5097383F0A66BFDF94F78816D9B5C324F58E0B8748B32659D0A`.
- `git diff --exit-code -- src/simulation/runtime/session-commands.ts` passed:
  production diff zero.
- Seven neighbouring files: **145 passed**, 6.14s total. Exact paths:
  the new regression, `room-template-manual-door-removal.test.ts`,
  `room-template-occupied-cancel-atomicity.test.ts`,
  `room-template-replacement-order-ownership.test.ts`,
  `undo-refuses-a-transaction-the-player-did-not-just-create.test.ts`
  under `tests/integration/`, plus `tests/unit/construction-doors.test.ts`
  and `tests/unit/construction-geometry.test.ts`.
- Both application and tools TypeScript builds passed; Vite production build
  passed (client 7.00s). Browser acceptance and remote CI were not run here.

Earlier exploratory consumer runs preceded the final regression. Their
initial wording incorrectly described Undo after an intervening old Cancel as
an ordinary legal control; the final consumer forks before that Cancel. Only
that corrected boundary is claimed here. The production negative and exact
restoration above ran the final consumer, with no assertion removed.
