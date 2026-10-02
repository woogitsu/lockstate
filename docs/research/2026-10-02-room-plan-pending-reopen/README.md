# Pending room-plan reopen status (#1946)

Fresh remote search and reading #1934 distinguish this confirmed issue: #1934 is a late numeric submit completion; this issue retains a previous verdict before a fresh preflight has completed. The actual dialog immediately disabled Submit and cleared the quote but kept old Ready/Blocked text and collision marks.

Actual dialog/tool listener tests hold a fresh preflight after a prior Ready or Blocked verdict. Both fail against previous source (two failures, four passes). Withdrawing old status and tile/fixture collision marks and setting aria-busy for the current query makes six cases green. Removing the production invalidation block causes both failures again; restoring gives six green. TypeScript green.

No existing truthful pending string exists in the template keys. Unavailable would incorrectly claim failure, and Save Loading describes a different operation. The fix marks real query state with aria-busy, leaves prior text empty, and preserves disabled Submit. Current result, invalid coordinates or current failure finish busy state. No new player string, promise, save format or fit policy.

Prepared actual Full HD artifact case uses an active 112-square plan, Escape, ready and blocked reopen cycles, delayed real worker requests, current catalogue quote, collision markers and final modal Escape/focus. Runtime proof pending exclusive browser lease.
