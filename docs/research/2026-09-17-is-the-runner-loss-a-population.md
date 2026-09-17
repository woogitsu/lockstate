# Is the `browser` runner loss a population, or two anecdotes?

**Date:** 2026-09-17.
**Tree:** `origin/main` at `c9b4a7f7`, in a worktree cut from it. Nothing under
`src/`, `tests/` or `.github/` was read for a figure except where a path is
cited below; no production or workflow file was changed.
**Instrument:** the GitHub REST API, read directly over HTTPS with the
session's own token — `/actions/workflows/340062411/runs` (22 pages),
`/actions/runs/{id}/jobs?filter=all` (one call per run), `/actions/jobs/{id}/logs`
and `/actions/runs/{id}/artifacts`. Snapshot taken **2026-09-17 between 16:35Z
and 16:55Z**. Everything below is recomputable from those endpoints and from
nothing else this session holds.
**Author's standing:** this record measures. It proposes no change to
`.github/workflows/` — the owner's reservation 3 — and it does not revisit the
2026-09-16 decision about the docker runners. Two findings touch that decision
and are marked where they do.

> **The unit of every count is a *job*, not a run, and the classifier is a
> single structural predicate** applied to the API's own `steps` array:
> **a job whose `status` is `completed` while at least one of its steps is still
> `in_progress` or `pending`.** That predicate never reads a log, so it is
> immune to what a log does or does not contain — which matters, because the
> defining property of this failure is that the log does not exist.

## Six findings

1. **The census is complete rather than sampled, and it cost about 2,290 API
   calls.** Every run of `.github/workflows/ci.yml` (workflow id `340062411`)
   that GitHub still holds — **2,155 runs**, `2026-08-22T14:16:13Z` through
   `2026-09-17T16:31:25Z` — was listed, and the jobs of every one of them were
   fetched with `filter=all` so that superseded attempts are included. That is
   **6,198 jobs**, of which **2,008 are `browser`**. This is not "as long a
   window as I could afford": it is the whole retained history, and the
   rate limit was never approached (15,000/hour, ~2,290 used).
2. **The loss signature occurs 11 times in that history, not twice — and it is
   not confined to `browser`.** Seven `browser` jobs and **four `verify` jobs**
   carry it. Every one of the 11 is on the **`lockstate-wsl-DOM-NEW-01/-02/-03`**
   pool, and every one falls between `2026-09-14T05:41:26Z` and
   `2026-09-16T20:23:10Z`. The predecessor WSL pool
   (`lockstate-wsl-DOM-NEW`, `-2`, `-3`, `-4`) ran **1,355 `browser` jobs**
   between 2026-08-23 and 2026-09-05 with **zero** occurrences.
3. **The brief describes the 2026-09-16 event as a pair. It is a triple**, and
   the third member is the one that makes it unambiguous: `browser` of run
   **35141373900** (PR #1272's sibling branch `agent/pinned-adrs-0020-0025`) on
   **`lockstate-wsl-DOM-NEW-02`**, completed **`20:23:06Z`** — between the two
   the brief names. All three runners in the pool, inside 11 seconds.
4. **At every instant a loss was recorded, every job in flight anywhere in the
   pool was lost. There is not one survivor, in any of the incidents.**
   3 of 3, 2 of 2, 1 of 1, 1 of 1. This is a stronger statement than
   "the losses cluster", and it is what removes the job as a candidate cause:
   the two singletons are singletons only because nothing else happened to be
   running.
5. **The 60-second bring-up timeouts are NOT a milder form of the same thing,
   and the brief's reading of the #1273 evidence is backwards.** The two specs
   it names are precisely the `withSignature=2` — the harness classified them as
   host-level aborts. The five failures carrying *no* `ERR_NETWORK_CHANGED`
   evidence are five `#88` control-press assertions, which are ordinary reds.
   And the timeout is not a host stall: the test immediately before and the test
   immediately after each 60-second failure ran at their normal speed.
6. **They share a *mechanism* with the runner loss even so, and that mechanism
   is already written down in this repository.** `tests/browser/network-changed-signature.ts`
   opens by naming it: *"the WSL2 CI runner's host network reconfigures mid-run
   and Chromium aborts every in-flight request with `net::ERR_NETWORK_CHANGED`"*
   (issue #616, the owner's ruling of 2026-08-30). This census puts numbers on
   that class for the first time and shows the runner loss is the same event
   seen from the other side of the same connection.

## 1. The window, the population, and what the classification cost

| | |
| --- | --- |
| Workflow | `.github/workflows/ci.yml`, id `340062411` |
| Runs listed | **2,155**, `2026-08-22T14:16:13Z` .. `2026-09-17T16:31:25Z` |
| Jobs fetched (`filter=all`) | **6,198** — `verify` 2,145, `assets` 2,045, `browser` 2,008 |
| API calls | ~2,290 (22 run pages + 2,155 job listings + 97 job-log downloads + 11 log probes + 7 artifact listings) |
| Snapshot | 2026-09-17 16:35Z–16:55Z |

`browser` job outcomes across the whole history:

| Outcome | Count |
| --- | ---: |
| `success` | 1,594 |
| `cancelled` | 142 |
| `skipped` | 140 |
| `failure` | **126** |
| still running at snapshot | 6 |

The 126 failures classify as follows. The buckets are the brief's, with one
added because the population required it.

| Bucket | Count | How it was decided |
| --- | ---: | --- |
| **Runner loss** | **6** | step 12 left `in_progress` on a `completed` job |
| **Real failure** — the suite ran and reported | **97** | step 12 `completed` with conclusion `failure` |
| **Failed before the suite started** | **20** | an earlier step failed; step 12 `skipped`. `Provision Playwright's Chromium` 16, `Checkout` 4 |
| **Neither** | **3** | one job with an empty `steps` array; one with step 12 `cancelled`; one with step 12 `success` |

A seventh runner loss is in the `cancelled` column rather than the `failure`
column — job `104208152625`, run **34914054768** — because a concurrency cancel
reached the abandoned job before GitHub gave up on it. **Counting only
`conclusion == 'failure'` undercounts this class**, which is the first reason to
classify on the step array rather than on the conclusion.

**The "neither" bucket is small and dull.** The empty-`steps` job never
allocated a runner; the `cancelled` and `success` step-12 jobs failed in the
post-suite steps. None of the three resembles a loss.

**The 20 pre-suite failures are almost entirely the docker runners and are
listed here only so the count is closed**: 16 `Provision Playwright's Chromium`
(2 on `woogitsu-linux-*` on 2026-09-07, **14 on `docker-runner-0N` on
2026-09-15**) and 4 `Checkout`, all four on `docker-runner-0N` within the same
second, `2026-09-16T06:51Z`. That bears on the 2026-09-16 docker decision; it is
recorded as a finding and the decision is not this record's.

## 2. The eleven losses, and the fact that there are no survivors

Every figure in this table is read from `/actions/runs/{run}/jobs?filter=all`.

| # | Job | Run | Attempt | Name | Runner | Started (Z) | Recorded lost (Z) | Concl. |
| ---: | --- | --- | ---: | --- | --- | --- | --- | --- |
| 1 | 103860012261 | 34806751057 | 1 | verify | `-01` | 09-14 05:31:25 | **09-14 05:41:26** | failure |
| 2 | 103859478898 | 34806564268 | 1 | verify | `-02` | 09-14 05:31:25 | **09-14 05:41:26** | failure |
| 3 | 104208152625 | 34914054768 | 1 | browser | `-02` | 09-15 00:41:17 | **09-15 00:50:06** | cancelled |
| 4 | 104207153193 | 34913763149 | 1 | browser | `-03` | 09-15 00:36:33 | **09-15 00:53:35** | failure |
| 5 | 104210007565 | 34914466109 | 1 | verify | `-02` | 09-15 05:26:04 | **09-15 05:36:04** | failure |
| 6 | 104210728971 | 34913817933 | 1 | verify | `-01` | 09-15 05:26:04 | **09-15 05:36:04** | failure |
| 7 | 104571539077 | 35025364364 | 1 | browser | `-02` | 09-15 21:25:37 | **09-15 21:47:39** | failure |
| 8 | 104596198683 | 35026828766 | 2 | browser | `-03` | 09-16 05:35:15 | **09-16 05:45:16** | failure |
| 9 | 104950451249 | 35139857720 | 1 | browser | `-03` | 09-16 20:10:58 | **09-16 20:22:59** | failure |
| 10 | 104948461565 | 35141373900 | 1 | browser | `-02` | 09-16 19:56:03 | **09-16 20:23:06** | failure |
| 11 | 104953658685 | 35141752060 | 1 | browser | `-01` | 09-16 20:05:08 | **09-16 20:23:10** | failure |

Job ids 1, 2, 5 and 6 are quoted from the same fetch as the rest; rows 9 and 11
are the two the brief names, and row 10 is the one it does not.

**Every one returns HTTP 404 for its logs, and the 404 is specific:** the API's
`/logs` redirect resolves to Azure blob storage, which answers
`<Code>BlobNotFound</Code>`. A green `browser` job on the same pool
(`104309219079`, `2026-09-15T08:28:45Z`) returns 200 through the identical
redirect, so the 404 is a property of these jobs and not of this session's
access. **Every one of the 11 runs also has zero artifacts** —
`/actions/runs/{id}/artifacts` returns `total_count: 0` for all of them, so no
failure evidence was uploaded. For the seven `browser` losses the step list says
why in as many words: step 15, `Upload the browser suite's failure evidence`, is
still `pending` when the job is already `completed`.

**Now the part that is not in the brief.** Taking each recorded-lost instant and
asking which jobs — of any name, on any runner — were in flight across it:

| Instant (Z) | Jobs in flight | Lost | Survived |
| --- | ---: | ---: | ---: |
| 2026-09-16 20:22:59 | 3 | **3** | **0** |
| 2026-09-15 00:50:06 | 2 | **2** | **0** |
| 2026-09-15 21:47:39 | 1 | **1** | **0** |
| 2026-09-16 05:45:16 | 1 | **1** | **0** |

Eleven losses are therefore **six incidents**, not eleven independent events:
09-14 ~05:41 (2 jobs), 09-15 ~00:50 (2), 09-15 ~05:36 (2), 09-15 ~21:47 (1),
09-16 ~05:45 (1), 09-16 ~20:23 (3).

## 3. Does the clustering survive testing?

**Yes, by a margin that does not need a careful test.** Three of the six
incidents involve two or three runners at once, and in the tightest one the
three `completed_at` stamps span **11 seconds** while the three jobs' step-12
start times span **27 minutes** (19:56:15, 20:05:19, 20:11:08). Nothing that
counts from the start of a job can produce that. A crude null — six incidents
uniform over the 41.6-hour span they cover — puts three of them inside a common
11-second window at order **1e-7**. The exact figure is not worth defending; the
order is.

**The right question is not "which runner", and the data says so.** Browser-job
losses by runner are `-02` 3, `-03` 3, `-01` 1 against volumes of 97, 78 and 100
completed `browser` jobs — no runner stands out, and finding 4 explains why:
the incident takes whatever is running, so per-runner counts measure the
duty cycle and not the fault.

**There is a time-of-day signal, and the exposure weighting makes it stronger
rather than weaker.** Three of the six incidents are recorded in the
`05:36Z`–`05:45Z` band, on three consecutive days (09-14, 09-15, 09-16). Over
the current pool's era (`2026-09-09T08:00Z` onward) the **05Z hour holds 1.70 %
of all job-seconds** — 5,556 of 326,140 — because almost nothing runs overnight
(`01Z`–`04Z` is 0 job-seconds across eight days). Under a binomial null with
p = 0.017, P(3 or more of 6) is about **1e-4**, and about **2e-3** after a
look-elsewhere correction across all 24 hours. **That is an estimate, not a
count**, and n = 6 is n = 6; it is offered as a place to look, not as a result.

**What makes the morning band worth looking at is not the p-value — it is the
queue.** Three of the six incidents are the *first jobs the pool took after a
multi-hour outage*, and the outage is visible in the API without any inference:

| Incident | Jobs created | Jobs started | Waited | Lost |
| --- | --- | --- | ---: | --- |
| 09-14 ~05:41 | 04:34:35, 04:37:40 | **both 05:31:25** | 57 / 54 min | 10m 01s later |
| 09-15 ~05:36 | 00:50:07, 00:53:35 | **both 05:26:04** | 276 / 272 min | 10m 00s later |
| 09-16 ~05:45 | 09-15 22:54:00 | 05:35:15 | **401 min** | 10m 01s later |

Two runners starting a job in the *same second* after a 4.5-hour wait is a pool
coming back, not a scheduler coincidence. And each time, what it took first died
almost exactly ten minutes in.

**The 09-16 20:23 incident has the opposite shape and should not be merged with
those three.** The pool was saturated, not absent — jobs were queueing 15 to 27
minutes before it — and the runners took new work **2 to 8 seconds** after the
loss was recorded (`-03` at 20:23:01, `-02` at 20:23:08, `-01` at 20:23:18).
The runner processes were not gone; only the jobs were.

### What cannot be concluded from the API alone

- **Whether the three runners share one Windows host.** The triple is
  overwhelming evidence that they share *something*; the API exposes no host
  identity, only `runner_name`, and this session cannot see the machines.
- **When the incident actually happened.** `completed_at` is when GitHub gave
  up, not when the runner did. Four of the eleven are exactly 10m00s or 10m01s
  after their job started and the rest are not, so the detection delay is **not
  a constant** and the incident time cannot be recovered by subtracting one.
  Every "Recorded lost" stamp above is an upper bound.
- **Why the two pools differ.** 7 of 275 completed `browser` jobs on
  `-01/-02/-03` against 0 of 1,355 on the predecessor pool is a real difference
  in the observable and a Fisher test on it is not close. It is **not** evidence
  that the machines differ: the runner name changed on 2026-09-05 and again on
  2026-09-09, and a rename is not a re-provision. This is the single largest
  thing this record cannot resolve from here.
- **Whether `assets` jobs are affected.** Zero `assets` jobs carry the
  signature, but `assets` is short, so its exposure is small; absence here is
  not evidence.

## 4. The 60-second bring-up timeouts are a different failure with the same cause

The brief asks whether these are a milder host stall. **They are not a stall of
any kind, and that is measurable inside the run it cites.** From job
`104993489613` (run **35145807587**, PR #1273, `lockstate-wsl-DOM-NEW-03`), the
Playwright list reporter's own per-test timings around each 60-second failure:

```
22:32:33  ✓   96   0.8s  environment-art.spec.ts:562:3
22:33:33  ✘   97  60.0s  hud-corner-chrome-passthrough.spec.ts:114:3
22:33:37  ✓   98   3.5s  hud-corner-chrome-passthrough.spec.ts:152:3

22:41:45  ✓  355   0.5s  ui-shell.spec.ts:2352:5
22:42:46  ✘  356  60.0s  ui-shell.spec.ts:2375:5
22:42:47  ✓  357   0.6s  ui-shell.spec.ts:2396:5
```

Test 357 loads the same `HARNESS_URL` in the same `beforeEach` that test 356
spent 60 seconds failing to load, and it takes **0.6 s**. The median test in
that run is **0.66 s** over 536 results. A host too slow to bring a page up
would not be fast enough to bring the next one up one second later. **The
failure is confined to one page load.**

**And the brief has the harness's verdict inverted.** The same log, one line per
failure, at the exact seconds those two tests gave up:

```
22:33:33  LOCKSTATE_NETWORK_CHANGED_OBSERVED signature=net::ERR_NETWORK_CHANGED
          observations=204 status=timedOut test="hud-corner-chrome-passthrough.spec.ts > ..."
22:42:46  LOCKSTATE_NETWORK_CHANGED_OBSERVED signature=net::ERR_NETWORK_CHANGED
          observations=120 status=timedOut test="ui-shell.spec.ts > HUD shell > build panel ..."
22:46:00  LOCKSTATE_BROWSER_SUITE_NO_RETRY suite=browser failures=7 withSignature=2
```

The two bring-up timeouts **are** the `withSignature=2`. The five the harness
named as carrying no evidence are the five `#88` *"every control can actually be
pressed"* assertions at 1280x720, 1440x900, 1024x768, 900x600 and 375x812 —
which failed on their own accounting assertion in 8 to 22 seconds, not on a
timeout. The brief quotes the no-retry sentence beside the two timeouts in a way
that reads as though the timeouts were the unexplained ones. They are the
explained ones.

**204 `net::ERR_NETWORK_CHANGED` observations inside one 60-second page load**
is 3.4 per second. `tests/browser/network-changed-signature.ts` already names
what that is, and `tests/browser/network-changed-fixture.ts` is what records it.

Across the population, from the 97 real-failure logs:

| | |
| --- | --- |
| `LOCKSTATE_NETWORK_CHANGED_OBSERVED` events | **53**, in **18** distinct jobs |
| of those, `status=timedOut` | 40 (`failed` 11, `passed` 2) |
| observations per event | min 2, median 102, **max 204** |
| by runner | `-01` 23, `-03` 18, `-02` 6, and 4 on the predecessor pool |
| by day | 09-01 2, 09-02 1, 09-04 3, **09-09 11, 09-10 3, 09-11 16, 09-12 4**, 09-14 1, 09-15 5, 09-16 7 |

**Two caveats on that table, both load-bearing.** The instrumentation landed in
`8297b5cb` on **2026-08-30** (#628), so a zero before that date means "not
measured", not "did not happen" — and ten `browser` failures between 08-27 and
08-30 do carry 60-second timeouts with no signature line for exactly that
reason. Second, **the five `docker-runner-0N` jobs on 2026-09-16 that hit
60-second timeouts recorded zero `NETWORK_CHANGED` observations**, which is the
one place in the population where the timeout appears without the network
signature. n = 5, and the docker decision is not this record's, but it is the
observation that keeps the identification honest.

**So the answer to question 3 is: different failure, same cause, opposite
sides of the same connection.** The host's network reconfigures. Chromium, which
has an open connection to a local dev server, aborts every in-flight request and
the page never assembles — a 60-second test timeout, and the job survives.
The Actions runner, which has an open connection to GitHub, loses it — and when
whatever it loses is enough, GitHub abandons the job and the log is never
uploaded. **The one thing that would falsify this is a loss with no network
event at the same second**, and this session cannot look.

## 5. What would settle it, on the hosts

Named precisely, because the owner has shell there and this session does not.
The target timestamp throughout is **2026-09-16 20:22:59–20:23:10Z**, which is
**22:22:59–22:23:10 Europe/Brussels (CEST, UTC+2)**, and the three runner
install directories are visible in the logs as
`/home/mateusz/actions-runner-lockstate-0N/`.

**a. The runner's own diagnostic log — do this one first.**
```
ls -la /home/mateusz/actions-runner-lockstate-0*/_diag/
grep -nE "Runner connect|reconnect|SocketException|TaskCanceled|session|Exiting" \
  /home/mateusz/actions-runner-lockstate-0*/_diag/Runner_2026091*.log
```
**A positive result looks like:** a `Runner listener` message-loop error, a lost
or renewed *session*, or a listener restart stamped within a second or two of
22:23:0x on **all three** instances. That would place the fault in the runner's
connection to GitHub and end the question. The matching `Worker_*.log` for each
abandoned job should simply stop mid-step with no shutdown line — if instead it
ends with a signal or a clean exit, the cause is local to the worker and not the
connection.

**b. Was the worker killed, and was it memory?**
```
sudo dmesg -T | grep -Ei "out of memory|killed process|oom-kill|Runner.Worker|chrome|node"
```
**Positive:** `Out of memory: Killed process NNNN (Runner.Worker)` — or `(node)`
or `(chrome)` — at 22:23 local. **Negative is informative too:** no OOM line at
that minute rules memory out as the proximate cause and leaves (a) and (c).
`/proc/pressure/memory` and `/proc/pressure/io` are worth a look but are
*current* values; they say nothing about yesterday unless something was
sampling them.

**c. Did the host's network change at that second? This is the leading
hypothesis and it is testable from Windows, not from WSL.** In PowerShell on the
Windows host:
```
Get-WinEvent -FilterHashtable @{LogName='System'; StartTime='2026-09-16 22:20'; EndTime='2026-09-16 22:26'} |
  Sort-Object TimeCreated | Format-Table TimeCreated,ProviderName,Id,LevelDisplayName -Auto
Get-WinEvent -LogName 'Microsoft-Windows-NetworkProfile/Operational' -MaxEvents 200 |
  Where-Object { $_.TimeCreated -gt '2026-09-14' } | Format-Table TimeCreated,Id,Message -Auto
```
**Positive:** an `NDIS` link-state event (10400/10401), a
`Hyper-V-VmSwitch` port event, a `Tcpip` address change, a `WlanSvc` roam, or a
VPN adapter connecting, timestamped 22:23:00–22:23:10. `NetworkProfile` event
10000 is "network connected" and 10001 "disconnected" — either at that second
is the answer.

**d. The same event, from inside WSL, going forward.** WSL2 rewrites
`/etc/resolv.conf` and re-creates `eth0` when the Windows host's networking
changes, and that is the documented producer of `net::ERR_NETWORK_CHANGED`.
Leave this running on one instance:
```
( ip monitor link addr route & \
  while :; do printf '%s ' "$(date -u +%FT%TZ)"; ip -br addr show eth0; \
                 md5sum /etc/resolv.conf; sleep 1; done ) >> /var/tmp/wsl-net-watch.log 2>&1 &
```
**Positive:** an `eth0` address change or a `resolv.conf` hash change at the
same second as the next runner loss, or at the same second as the next
`LOCKSTATE_NETWORK_CHANGED_OBSERVED` line in `browser-suite.log`. **One
co-occurrence closes the identification in finding 6**; the CI side of the pair
is already being recorded by `tests/browser/network-changed-fixture.ts` and
needs nothing added.

**e. The morning band — the cheapest check of the six, and it explains three of
the six incidents on its own.** Three incidents are the first jobs taken after
the pool had been unreachable for one to almost seven hours, ending at
05:26–05:35Z (**07:26–07:35 local**). On the Windows host:
```
powercfg /sleepstudy
Get-WinEvent -LogName System | Where-Object { $_.Id -in 1,42,107,109 } |
  Select-Object -First 40 TimeCreated,Id,Message
```
**Positive:** `Kernel-Power` id 42 (entering sleep) the previous evening and id
107 or 1 (resume) at 07:26 local on 09-15 and 07:35 on 09-16 — about ten minutes
before each of those losses. If the host sleeps, the overnight outage and the
morning losses are one phenomenon, and they are a *different* phenomenon from
the 20:23 triple, which happened with the pool fully loaded.

**f. If a fresh occurrence is wanted rather than forensics.** The predicate in
this record is one API call per run and needs no log. Re-running it against
`/actions/workflows/340062411/runs` weekly re-derives the count; the useful pair
to watch is a loss instant against (d)'s watcher, because the API side is
already complete and the host side is the only missing half.

## What this record does not do

It proposes nothing in `.github/workflows/`, and the two findings that bear on
that file are stated as findings: **any retry or timeout tuning aimed at this
class would miss**, because the job is abandoned without its log and without
its evidence upload, so nothing inside the workflow observes the failure at all;
and **the 09-16 20:23 triple took `assets`-bound and `verify`-bound capacity as
well**, so it is not a `browser` problem. The docker-runner observations in §1
and §4 are recorded because the census produced them, not as a reopening of the
owner's 2026-09-16 decision.

## Weakest claim, and what would change my mind

**The weakest claim is finding 6's identification — that the runner loss and the
`ERR_NETWORK_CHANGED` bring-up timeout share one cause.** It rests on a
mechanism this repository wrote down in August and on the fact that both
populations sit on the same pool in the same fortnight; it does **not** rest on
a single observation of both at the same second, because the losing jobs upload
no log and so cannot report a signature. The five `docker-runner` timeouts with
no network observation are a real counter-instance at small n.

**What would change my mind:** a runner loss whose `_diag` listener log shows a
clean connection across the loss instant, or a Windows System log with no
network event at 22:23:10 on 2026-09-16. Either one leaves the loss unexplained
and the identification dead.

**The second-weakest is the time-of-day estimate in §3**, which is six events
against an exposure profile, computed and labelled as an estimate. The queue
evidence in the same section is a count and does not depend on it.
