# Exact construction counters V10

## Owner decision, 2026-10-03

The owner selected the clickable option for [Issue #2025](https://github.com/woogitsu/lockstate/issues/2025):

> Tak — V10, dokładne liczniki i migracja (zalecane)

This is the option label the owner selected, reported directly by the coordinator,
not an implementing agent's approval. The question covered exact counters as
text, preserving V1–V9 and the corresponding cancellation requests. The accepted
scope is canonical nonnegative decimal strings (no leading zero), exact +1
without saturation/wrapping, lossless historical migration of construction
markers/revisions and queued expectedRevision tokens. History, source ownership,
in-flight data, refunds and existing stale refusal/copy remain unchanged.

The original [V9 active limit diagnosis](../2026-10-03-v9-active-revision-limit/README.md)
is retained from immutable `ff504a35a9cabe375dc2014dae2a144bc6887776`, including
actual two RED/two legal controls and separate original protocol/treasury fixture
errors. Those are original V9 measurements, not V10 results.

Implementation subject starts at published
`c28d4815844af9081c4d16925bbf498eb3df2ff1`. This independent branch has no browser,
server, build or native claim. Verification receipts will be appended after
actual execution; approval does not itself establish a GREEN implementation.
