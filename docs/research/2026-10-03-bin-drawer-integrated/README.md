# Root Bin and navigation acceptance — 2026-10-03

Built subject: `e9e7890042a741fe4689e7a6edae62559dbed07b`, branch
`codex/integrate-bin-drawer-20261003`, [draft PR1987](https://github.com/woogitsu/lockstate/pull/1987).
This is fresh root integration acceptance, separate from the individual model
and registered drawer producer mutation receipts already retained upstream.

Canonical artifact wrapper, one browser worker, original timeouts and retry
policy: [complete terminal output](./native-nine-cases.txt) and
[machine-readable report](./native-suite.json). **9 passed**, no skipped,
unexpected or flaky cases, 127.55 seconds.

| Actual native case | GREEN duration |
| --- | --- |
| Construct Storage and Delivery capacity | 43.9s |
| Garbage Room quarter turn0, completion and Save/Load | 30.3s |
| Garbage Room quarter turn1, completion and Save/Load | 30.3s |
| World drawer Escape: wall / object / room area | 3.0 / 3.0 / 3.0s |
| Angled drawer Escape: wall / object / room area | 3.6 / 3.7 / 3.6s |

The served worker is `worker-DIP7pP3A.js`, SHA256
`5247173b87c7d7935c4c2b312676b4e35bf2c3a35b8568c83ff9a678c78c21d2`.
Client `index-DHueGlEa.js`, CSS `index-BtHvjcB7.css`. The actual worker and
renderer run; no simulation state is replaced.

## Actual square placement and ownership

Two distinct V8 source-order owners point to completed owning orders with exact
matching physical anchors and orientation. Entire observed owner/order tuples
remain equal after genuine IndexedDB Save/Load.

- Quarter turn0: `(21,6)` and `(22,6)`, orientation0;
  palette counts `[865,154]` before and after Load.
  [Worker/owner evidence](./bin-q0.json), [loaded Full HD](./bin-q0-loaded-fullhd.png).
- Quarter turn1: `(22,6)` and `(22,7)`, orientation1;
  palette counts `[334,370]` before and after Load.
  [Worker/owner evidence](./bin-q1.json), [loaded Full HD](./bin-q1-loaded-fullhd.png).

Root opened the rotated loaded PNG. Both bins, the real door and lowered square
wall modules are visible. The original pixel thresholds remain unchanged.

## Actual drawer keys

Each case starts at Full HD with interface scale200%, then explicitly contracts
the CSS viewport to960×540 to exercise the approved navigation drawer. A real
trusted Escape closes that drawer, returns focus and retains the armed tool;
a second ordinary Escape cancels the tool. Every case submits zero map mutation
commands. Native trusted-key/command evidence is attached in the report;
[angled wall capture](./drawer-oblique-wall.png) shows the closed drawer.
This contracted viewport is not presented as a measured browser page-zoom setting.

## Hosted verification repair

Exact-subject CI37074854876 reached7445 passing tests and8 skips, but one
typecheck-coverage contract failed. The retained diagnostic baseline had a
`.test.ts` extension under research although its relative imports explicitly
assumed temporary reproduction under `tests/integration/`.

Root reproduced the same **1 RED /3 controls GREEN**, then archived that file
as `packed-baseline.test.ts.txt` with identical SHA256
`57072fd2a18c6c63b4cbb58e8e6cd00d0a6d53ebfdee3afd118d588a29612277`.
The reproduction instructions now name the archived source. No TypeScript
configuration, test assertion or production source changed. The unchanged
contract then passes **4/4**: [baseline](./coverage-baseline.txt),
[corrected archival coverage](./coverage-restored.txt).

All root native processes are terminal and port5418 has no listener. Browser
ownership was handed to Art for Desk acceptance. Full CI of the following
receipt/archival commit, all stack gates, serial main acceptance, merge and
production release remain outstanding. Nine focused cases are not full-suite
or hosted-release acceptance.
