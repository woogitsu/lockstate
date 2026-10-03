# Layout Escape: isolated main release evidence

## Scope and base

**VERIFIED, fresh git fetch and opened source.** Current main was `af180e33f9ea9f1490498860e36e91ec2a5f5667`, version 0.0.836. Its Layout menu Escape handler called `preventDefault` and closed the menu, allowing the key to continue to the world listener. The accepted integration fix was not on main. The existing open [issue #1962](https://github.com/woogitsu/lockstate/issues/1962) records this exact defect; a fresh title search found no dedicated open Layout Escape PR.

Own branch `codex/layout-escape-release-20261002` starts directly from that main checkpoint. Production changes only the open menu's consumed Escape: three explanatory lines and `event.stopPropagation()`. No player labels, renderers, simulation, persistence, camera bindings, workflow or browser configuration changes are included. The later world Escape still cancels placement.

## Actual player and artifact checks

**VERIFIED, local terminal outputs on 2026-10-02.** The shared [acceptance helper](../../tests/browser/layout-menu-escape-acceptance.ts) sets a 1920x1080 viewport and 200% interface scale, creates a prison, pauses, opens Build, arms placement, opens Layout and focuses Reset layout. It presses Escape, checks menu closure and focus return, verifies the Build tool remains armed, then presses Escape again and verifies cancellation. Both standard and angled views execute the flow.

The [dev browser cases](../../tests/browser/hud-layout-menu-fullhd.spec.ts) reuse that helper. The existing required [production artifact spec](../../tests/browser/production-artifact.spec.ts) calls the same helper in two additional cases, so artifact CI covers the behavior without expanding workflow or configuration scope.

- Exact main built client: **2 failed**, world 12.5s and angled 13.2s. At the preservation check the expected button text was `Stop placing`, but the observed text was `Place on map`.
- Scoped fix: complete production artifact suite **4 passed**, 13.6s, including its existing boot/worker and command/persistence checks.
- Production mutation removing only the new menu `stopPropagation` and rebuilding: **2 failed**, world 12.6s and angled 13.3s, with the same observed unwanted cancellation. Both had zero network-change signatures; the repository wrapper refused retry.
- Exact source byte restoration: SHA256 before and after `FA701D3169918E0C5B5B01AD894B8D00DEB6964AED5E7235D3F681E7E9CD7D4C`. Rebuilt restored artifact: **4 passed**, 13.2s. Restored dev suite: **2 passed**, 21.3s.

Both TypeScript projects, the production build, and 98 related layout/browser-partition/network-retry/CI-configuration unit and foundation cases passed. Screenshots of both restored artifact views were opened and inspected; the rendered badge identifies source checkpoint `05e082e`. Source restoration is byte-exact; builds before and after the code commit carry different commit badges, so no identical emitted-bundle hash claim is made.

The complete research-index, commit-citation and documentation-claims files passed 28/28. This checkout initially tracked only origin/main; explicitly fetching the already pushed own branch established its published citation without changing remote configuration. The additional native-Windows documentation-links run had three failures: unchanged baseline citations use Windows backslashes while their absent-by-design allowlist keys use forward slashes. None of the reported paths came from this change, and that test file is unchanged from main. No full local suite success is claimed; Linux exact-head CI remains required.

An initial anchored title filter selected no tests; it is not counted as baseline evidence. The corrected filter executed both cases. The baseline used a separate output directory; the later mutation and restored runs used the repository wrapper's normal output location and retained copies. The dev world run printed an image-decode warning; the scoped key behavior passed, and this record makes no asset-coverage claim.

## Delivery gates and weakest claim

**VERIFIED, one bounded GitHub API lookup at 10:41:30 UTC.** Serial main CI `36994796706` on `d2293aa8d856c1a8895c56e0c4101cef36df506c` was still in progress. The successful Push-on-main run `36994832508` belonged to the release commit above and was not substituted for serial CI.

The PR must pass its exact-head required checks and the serial main CI gate before merging. This record establishes a small independently based change and local built-client acceptance. It does not claim successful remote CI, merge, deployment or hosted verification. The weakest inference would be that local browser success proves hosted delivery; it does not, and those terminal gates remain required.
