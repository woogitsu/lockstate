# 2026-09-15 — What `main` never published

**Question.** `.github/workflows/ci.yml`'s concurrency block records a mechanism
and an early measurement: GitHub keeps at most one PENDING run per concurrency
group whatever `cancel-in-progress` says, so a third push arriving while one run
is in progress and a second waits cancels the second — *"which never starts, and
records no jobs at all"* — and *"eight of the sixty most recent completed CI runs
started by a push to `main`"* were that, over one day in August. Nobody had ever
re-derived that figure, extended it over the whole history, checked what is
unpublished as a result, or confirmed that `staging-blocked` (#424) actually
fires. This record does those four things and derives a merge-spacing rule from
them.

**Taken 2026-09-15, against `main` @ `e044a3e8` (v0.0.640).** Every figure below
comes from the GitHub Actions REST API through the `mcp__github__*` tools and
from `git` in a worktree of `origin/main`. No `gh` CLI was available and none
was used.

## Evidence tiers

Using this directory's tiers, mapped onto an API rather than onto a web page:

- **VERIFIED** — read out of an API response in this session, counted by script,
  and reproducible from the run ids quoted.
- **INFERRED** — follows from VERIFIED data plus one stated assumption, and the
  assumption is named where it is used. The CI-run-to-Deploy-run pairing is the
  main one and §2.1 says exactly what it rests on.
- **UNKNOWN** — could not be established. §7.

## 1. The census — VERIFIED

**Sample: every CI run on `main` in the repository's history.** The API reports
`total_count` **822** for `ci.yml` on branch `main`, of which **818** were
started by a `push`. Nine pages of 100 were fetched; pages 1-8 (**800 unique
runs**, 2026-08-22T18:29:15Z → 2026-09-15T17:09:09Z) were saved and counted by
script, and page 9's remaining **18** runs (run numbers 17-34, all
2026-08-22) were read inline — 17 `success`, 1 `failure`, **0 `cancelled`**. The
four non-push runs on `main` were not examined.

| Conclusion | Runs | Share of 818 |
| --- | ---: | ---: |
| `success` | 687 + 17 = **704** | 86.1 % |
| `failure` | 48 + 1 = **49** | 6.0 % |
| `cancelled` | **65** | **7.9 %** |

**Every one of the 65 was then asked for its job count** — one
`get_job_logs(run_id, failed_only)` call each, which returns `total_jobs`
without returning any log body:

- **47 recorded ZERO jobs.** These are the shape the workflow comment names: a
  run held pending by the concurrency group, cancelled by the next push, which
  never started and therefore has no job, no step and no log.
- **18 recorded one to three jobs.** These were cancelled after starting, which
  is a different event with a different cause (§5).

**No run outside the 65 recorded zero jobs**, because no run with zero jobs can
conclude `success` or `failure`; so "cancelled or zero jobs" and "cancelled" name
the same 65 runs here, and the census's interesting split is the 47/18 inside it.

### 1.1 The workflow comment's own figure reproduces exactly — VERIFIED

*"Eight of the sixty most recent completed CI runs started by a push to `main`,
measured over 2026-08-25T18:08Z to 2026-08-26T19:45Z."* Re-derived rather than
carried:

- Runs created inside that window: **59** — 37 `success`, 14 `failure`,
  **8 `cancelled`**.
- The sixty most recent at the window's close (2026-08-25T17:58:45Z →
  2026-08-26T19:41:49Z): **38 `success`, 14 `failure`, 8 `cancelled`** — which is
  `docs/DEPLOYMENT.md`'s "When the automatic path does not publish" figure to the
  run, including its 38/14/8 split.

**The figure is confirmed and is not representative.** 8 of 60 is 13.3 %; over
the whole history the rate is **65 of 818, 7.9 %**. The August day was worse than
average, not typical.

### 1.2 It is bursty, not steady — VERIFIED

Cancellations per calendar day, over the 25 days `main` has existed
(`runs` / `cancelled`): 08-22 20/6, 08-23 58/10, 08-24 97/3, 08-25 34/1,
08-26 51/8, 08-27 3/0, 08-28 39/0, 08-29 53/2, 08-30 51/4, 08-31 35/0,
09-01 41/0, 09-02 47/0, 09-03 49/6, 09-04 34/2, 09-05 29/0, 09-06 27/0,
09-07 12/0, 09-08 19/12, 09-09 19/5, 09-10 11/0, 09-11 15/0, 09-12 10/0,
09-13 4/0, 09-14 20/0, **09-15 22/6**.

**Eleven of the twenty-five days have none at all**, and 2026-09-08 lost 12 of
19 runs. The defect does not accumulate quietly; it arrives in bursts, on the
days work is integrated fast.

## 2. Did `staging-blocked` fire? — VERIFIED, and yes, every time it could

`deploy.yml` triggers on CI *completion*, so a cancelled CI run does produce a
Deploy run. Which job ran in it is the question #424 is about.

### 2.1 How a Deploy run was matched to its CI run — INFERRED, assumption named

**A Deploy run's `head_sha` is NOT the commit it publishes.** A `workflow_run`
workflow runs against the default branch's tip, so the Deploy run's `head_sha` is
`main`'s tip at trigger time, while the `staging` job checks out
`workflow_run.head_sha`. Matching by `head_sha` is therefore wrong, and this
record does not do it. **Deploy runs were matched to CI runs by time**: the Deploy
run created 0-300 s after the CI run's `updated_at`, greedily nearest-first, over
all **769** Deploy runs and **800** CI runs. **731 pairs**, with **699 of them
inside 60 s**. The 67 CI runs left unpaired are all earlier than
2026-08-24T01:49Z — that is, before #100 (`68a3e132`, 2026-08-23T22:34Z) switched
`deploy.yml` from `push` to `workflow_run`, when no such Deploy run existed to
find. **The assumption is that a Deploy run created within five minutes of a CI
run finishing, and nearest to it, is that CI run's child.** Two pairings were
checked against the job API directly and both held (§2.2).

### 2.2 The result, for the 49 cancelled runs in the `workflow_run` era

| Paired Deploy run concluded | Cancelled CI runs |
| --- | ---: |
| `failure` — `staging-blocked` ran and exited 1 | **37** |
| `skipped` — every job skipped, nothing announced | **12** |
| (no Deploy run: pre-#100 era) | 16 |

**The boundary is #424's own landing.** The last `skipped` is `33005035205`
(2026-08-26T19:25Z) — one of the two runs the workflow comment cites by number —
and the first `failure` is `33262523563` (2026-08-29T16:21Z). Every cancelled
`main` CI run since #424 landed has produced a red Deploy run; **none before it
did.**

Confirmed by name rather than by conclusion, on four runs:

- Deploy `33005039649`, the child of the comment's own `33005035205`, has
  **two jobs, `staging` and `production`, both `skipped`** — there is no
  `staging-blocked` job in it. That is the silence #424 describes.
- Deploy `34996522855` (from #1218's cancelled CI), `34996533665` (#1221's) and
  `34999457654` (#1220's) each report **one failed job, named
  `staging-blocked`**. #424 works.

The log bodies themselves are gone — GitHub returned **HTTP 404** for the log
download of every one of those jobs — so what is verified here is the job's
name, conclusion and run, not the text it printed. **The brief's claim that the
job-log endpoint 404s for a run with no jobs is refuted**: for a zero-job run the
endpoint answers `{"failed_jobs":0,"total_jobs":0}` with HTTP 200, and the 404s
come from expired log blobs on runs that *did* have jobs. The zero-job signature
is `total_jobs: 0`, not a 404.

## 3. What is unpublished right now — VERIFIED

**The live build is `c3faf19d` (#1219).** Its CI run `34988616717` concluded
`success` at 2026-09-15T15:55:20Z and Deploy run `34991659217`, created
2026-09-15T15:55:22Z, is **the newest Deploy run of any kind with conclusion
`success`**. Nothing has published since — not automatically, and not by hand:
the last `workflow_dispatch` of `deploy.yml` was `32657945974`, 2026-08-23.

`main` is **eleven first-parent commits ahead of what is served**, and the gap is
`c3faf19d..e044a3e8`:

| # | Commit | Why it is not published |
| --- | --- | --- |
| 1 | `45776d1a` v0.0.636 | `chore(release)`, no CI run — state 3, by design |
| 2 | `0f91582e` #1213 | **CI `success`, Deploy `failure` — the failed job is `staging`** |
| 3 | `2f995565` v0.0.637 | `chore(release)` |
| 4 | `f1cf9d15` #1218 | **CI cancelled, zero jobs** |
| 5 | `9aec129a` #1221 | **CI cancelled, zero jobs** |
| 6 | `4a4d514c` #1222 | CI `failure` |
| 7-9 | `9f10363b` `46664b24` `22055b84` v0.0.638-640 | `chore(release)` |
| 10 | `3ad3eca4` #1220 | **CI cancelled, zero jobs** |
| 11 | `e044a3e8` #1223 | CI `failure` (run `34999451358`, attempt 2) |

`git diff --stat c3faf19d origin/main` is **24 files, 1,926 insertions, 610
deletions**; restricted to what ships (`src/`, `public/`, `index.html`) it is
**5 files, 158 insertions, 13 deletions**.

### 3.1 Superseded versus unpublished — the distinction the brief asks for

**Sixty-two of the 65 cancelled commits are superseded and cost nothing.** A
successful `staging` deploy publishes a whole tree, and all 65 cancelled commits
are ancestors of `c3faf19d` on `main`'s first-parent line; so every one of them
that precedes `c3faf19d` was carried to the site by a later merge's deploy, which
is exactly what `staging-blocked`'s own message tells the reader to check.

**Three are not, and they are today's:** `f1cf9d15` (#1218), `9aec129a` (#1221)
and `3ad3eca4` (#1220). Of the three, only **#1218 changed shipped code** — two
files, 18 insertions and 8 deletions, in `src/simulation/economy/income.ts` and
`src/content/default-locale-en.ts`. #1221 and #1220
touched `tooling/`, `docs/` and `tests/` only, so their cancellation cost a gate
result and no deployment.

**And the cancellations are not the largest hole on `main` today.** `0f91582e`
(#1213) passed CI and its Deploy run's **`staging` job failed** — 3 seconds, on
runner `docker-runner-01`, log expired — leaving 81 lines of
`src/simulation/prisoners/action-system.ts` unpublished for a reason that has
nothing to do with concurrency. #1222 and #1223 are red. **Cancellation
contributed 18 of the 158 unpublished shipped lines; a red `main` and one failed
publish contributed the other 140.**

## 4. The merge-spacing number — VERIFIED, then modelled

### 4.1 What was measured

For each of the 47 zero-job cancellations, the interval from its own creation to
**the next push to `main`** — the merge that killed it:

```
0.08 0.10 0.10 0.10 0.12 0.12 0.12 0.12 0.13 0.13 0.13 0.13 0.15 0.15 0.15
0.15 0.17 0.17 0.18 0.20 0.22 0.23 0.23 0.27 0.27 0.27 0.28 0.28 0.33 0.40
0.50 0.55 0.63 0.65 0.92 0.93 1.08 1.53 1.88 2.27 2.58 3.23 4.37 7.40 10.70
13.42 16.42                                                        (minutes)
```

**Median 0.27 min. Maximum 16.42 min.** Not one of the 818 runs was cancelled
with zero jobs when the next merge was more than **16.5 minutes** behind it. The
comparison set matters: of the other 752 runs, 366 also had a successor inside 20
minutes and survived — so a short gap is necessary for this failure, not
sufficient, which is what the three-run mechanism predicts.

### 4.2 The rule, and why it is half a run rather than a whole one

The mechanism is a three-merge one. With merges M1, M2, M3: M1's run is in
progress, M2's waits, M3's arrival evicts M2's. So **two merges may be in flight
safely and the third is the one that kills**. If merges are spaced by `S` and a
`main` run takes `D`, M3 arrives at `2S` and must find M1 finished:

> **`S ≥ D / 2`.**

`D` on the pool CI actually runs on now, from the 36 attempt-1 `main` runs since
2026-09-13 that ran longer than five minutes: **median 21.2 min**, p90 66.9 min,
minimum 11.6 min. Queue time is 0.0 min on every one of them, so `D` is execution
and the long tail is contention between concurrent runs — that is, `D` grows when
`S` shrinks, which is why the rule must be read off the tail rather than the
median.

**The number to follow: 20 minutes between merges to `main`, and 35 when the
suite is already running long.** Twenty exceeds the largest lethal gap ever
observed (16.42 min) and is `D/2` for a run of 40 minutes; thirty-five is `D/2`
at the p90 of 66.9 minutes. **The exact form of the rule, which needs no clock:**
*do not merge while two `main` CI runs are unfinished.* One running and one
queued is safe; the third merge is the cancellation.

### 4.3 What today actually cost — VERIFIED, and the brief overstated one half

Twenty-two merges reached `main` on 2026-09-15. **The largest number inside any
60-minute window is five**, not seven — twelve merges landed across the 4h11m
from 12:57:57Z to 17:09:09Z. **Six `main` runs were cancelled, not three:**
`34942957925` (#1197, 07:41), `34972036987` (#1209, 12:58), `34972373659`
(#1210, 13:01), and the three the brief names — `34996498467` (#1218, 16:40:39),
`34996516400` (#1221, 16:40:50), `34999433102` (#1220, 17:09:00). The brief's
count of the cost is low by three and its count of the cadence is high by two.

The 16:40 burst is the mechanism in one paragraph: #1213's run had been in
progress since 15:34 and took **87.7 minutes**; #1218 merged at 16:40:39 and
queued behind it; #1221 merged eleven seconds later and evicted #1218's run;
#1222 merged six seconds after that and evicted #1221's. A single long run held
the group open and three merges arrived inside eighteen seconds.

## 5. The eighteen cancellations that are a different thing — VERIFIED

Eighteen of the 65 recorded jobs before being cancelled, so the concurrency
group did not evict them: something cancelled a run that was already executing,
and `cancel-in-progress` is `false` for a push. Fourteen are from 2026-08-22 and -23,
inside minutes of each other, in the era before the `browser` job existed. **The four long ones are all 2026-09-08** —
`34193121796` (33.1 m), `34193128792` (78.8 m), `34210518092` (101.9 m),
`34210573172` (173.9 m) — which is the day `AGENTS.md` records the `browser` job
failing to finish on a saturated pool and the day the job's `timeout-minutes`
was raised from 30 to 90. **Who or what cancelled them is not established here**
(§7); they are separated out so they do not inflate the concurrency figure, and
§4.1's gap measurement deliberately excludes them.

## 6. The repair, stated and not made

`.github/workflows/` is the owner's under `AGENTS.md`'s third reservation, and
none of the five dated releases inside it covers this. **So this is the change,
written out, and it was not made.**

**What is NOT the answer.** `cancel-in-progress: false` for a push is already in
force and is already the deliberate mitigation, with its reasoning written above
it. It governs the run that is running; it does not govern the pending slot,
which holds exactly one run whatever the setting says. Nothing expressible in
`concurrency:` fixes this, because the eviction is GitHub's queue policy rather
than the workflow's.

**The one-line change that would fix it**, in `.github/workflows/ci.yml`:

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}-${{ github.event_name == 'push' && github.sha || '' }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

Putting `github.sha` in the group for a push gives every `main` commit a
concurrency group of one. No pending slot is ever contended, so no run is ever
evicted, and the pull-request behaviour — where `cancel-in-progress` is the point
and the ref is the right key — is untouched. **The cost is real and is the
reason this is a decision rather than an oversight:** `main` runs would then
overlap without limit, and §4.2's measurement says that is exactly what stretches
a 21-minute suite to 88. The trade is *every commit gets a gate result* against
*the gate takes longer when merges are fast*, and the second half is already
being paid without buying the first.

**Two alternatives, both also the owner's, both cheaper to state than to run.** A
GitHub merge queue makes the three-merge race impossible at the source rather
than at the gate. Or `deploy.yml` could publish `main`'s head on a successful CI
run instead of its own commit, which drains the backlog rather than preventing
the hole — `docs/DEPLOYMENT.md` already records that as #424's open trade-off
wanting an ADR, and it fixes the deployment consequence while leaving the missing
gate result missing.

**The behavioural repair needs none of them**, and §4.2 is it.

## 7. What this record did not establish — UNKNOWN

- **Why the 18 job-bearing runs were cancelled.** Manual cancellation by the
  owner is consistent with the 2026-09-08 dates and is not evidence.
- **Why Deploy `34998695352`'s `staging` job failed** on a commit whose CI had
  passed. The job ran 3 s on `docker-runner-01` and its log returns HTTP 404.
  This is a second, independent hole in publication and nothing in this
  repository tracks it.
- **What the `staging-blocked` jobs actually printed.** Every log body older than
  GitHub's retention is gone; the job names and conclusions are what survive.
- **Whether the 4 non-push CI runs on `main`** (822 − 818) include any of this
  shape. They were not examined.
- **Anything about the pull-request side.** Only `main` was measured.

## 8. Weakest claim, and what would change my mind

**The weakest claim is §2.1's time-pairing**, and everything in §2.2 and §3 rests
on it. It is a nearest-neighbour match on timestamps, not a stated parent-child
link, because the run list does not carry the triggering run's id. It would be
wrong wherever two CI runs finished within seconds of each other and their Deploy
runs were created out of order — which is precisely the burst condition this
record is about. Two things hold it up: 699 of 731 pairs are inside 60 s, and the
four pairings the argument actually turns on were confirmed against the job API
by job name. **What would change my mind:** reading
`github.event.workflow_run.id` out of any one of those Deploy runs and finding it
names a different CI run than the pairing does. That is one API call per run
against an endpoint this session did not have.

**The second weakest is §4.2's 20 minutes.** It is `D/2` with `D` read off a
pool whose run time is itself a function of how fast merges arrive, so it is a
fixed point asserted from one side. **What would change my mind:** a week of
merges at 20-minute spacing producing even one zero-job cancellation, which would
mean `D` is larger than the sample says, or a week producing none while median
`D` falls below 20 minutes, which would mean the rule is more conservative than
it needs to be.
