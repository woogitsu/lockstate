# What the owner still has to decide, and where an accepted decision contradicts the code

This file is for the repository owner and nobody else. It exists because
`docs/adr/README.md` reports statuses and `tests/foundation/adr-numbering-contract.test.ts`
keeps that report honest, but **neither can tell you whether a status is true
about `main`** — the index compares a document to a table, not a decision to an
implementation.

**Nothing here changes a status.** A status moves in the ADR and in the index,
never in this file. What changed with this revision is what the file is *for*:
§1 records **all thirteen** flips, §2 holds **four entries — the two dated rulings
#382 wrote into ADR 0008 §2, the 2026-08-27 amendment scoping that ADR's §3
by authority, the preconditions on the change that gives this project its
first server-side entry point, and ADR 0056's price for keeping a player's
orders in the order they gave them (2026-08-28, and the first row filed by the
change that wrote it since the rule was restated)** — above the account of why the queue had been
emptied three times and what that bought (ADR 0029 was accepted on 2026-08-26
and its entry deleted; 0031 arrived immediately after and was itself accepted)
— and everything after it is the residue — the open decisions, one
watch item, and the gaps between an accepted decision and the code. **That
clause read "one genuinely open decision" until 2026-08-28**, when nine
`Proposed` ADRs landed in eleven releases; §3 still holds the one that is
partly enforced in SQL, and §5's first bullet holds them. **Nine is thirteen at
`c00b641`**, and the sentence saying nine is left above rather than overwritten
because the number is the finding: 0053, 0054, 0056 and 0057 arrived in the
eleven releases since, and **one of the thirteen — 0056 — now has a §2 row**,
which is the first time a document counted in that bullet has been filed rather
than only tallied. Counted on disk at this anchor by reading the first non-blank
line under each `## Status` heading, which is what
`adr-status-reference-contract.test.ts` reads; the index agrees, thirteen rows
opening `Proposed`.

**This sentence and the title above it were both false, and this is the second
time this file's title has rotted the same way.** They read *"One decision is
awaiting approval"* and *"§2 holds the one decision awaiting approval — ADR
0031"*, while §2's own heading three hundred lines below said **"The queue is
empty"** and its subsection said 0031 was accepted. ADR 0031 was accepted at
`e560656` (#389, **v0.0.104**), which is **seventeen releases** before this
anchor — and, more to the point, `git merge-base --is-ancestor e560656 8d29aa6`
confirms it predates the *previous* anchor too, so the last re-anchor did not
catch it either.

**Why neither delta pass caught it, which is the useful part.** The delta method
this header describes reads the intersection of `git diff <anchor>..HEAD` with
the enumerated file set below. `docs/adr/0031-build-queue-cancellation-surface.md`
is in that set — but it has not changed since either anchor, because the flip
that falsified this sentence happened *before* both of them. **A delta pass can
only find claims that a file in the set falsified during that delta.** It is
structurally blind to a claim that was already false when the window opened, and
to a file contradicting itself, which is what this was: the title and §2 of the
same document disagreed, and no diff anywhere would have said so. The cheap check
that does find it is not a diff at all — it is reading the file's own headings
against each other, which takes a minute and had not been done. The title is now
worded so that it states the file's subject rather than a count, because a count
in a title is the same rotting shape as an absence in a sentence and this one
rotted twice. §6 used to be the inventory of stale sentences the flips left behind;
**they are corrected, and that class is now asserted by a test**, so what it
holds instead is the account of what moved, what may not be touched, and what
the test cannot see. Deciding is still the owner's; this file only makes the
next decision cheap.

**Four places in this file count the queue, and the next editor has to sweep all
four.** They are: this paragraph, the title above it, §2's own heading, and §5's
preamble. They have disagreed before — *"One decision is awaiting approval"*,
*"§2 holds **the one decision awaiting approval — ADR 0031**"*, *"## 2. The
queue is empty"* and *"**The queue is not empty** — §2 holds **two** entries"*,
all four in the same document, recorded as **ARC-07, CONFIRMED** in
`docs/research/audit-2026-08-26/04-architecture.md`. The drift is structural
rather than careless: §2's count is edited when a decision is accepted, and the
other three are edited when somebody remembers them. **Nothing mechanical can
compare an English count in one paragraph to an English count in another**, so
naming the four places here is the whole of the defence.

**The sweep was run at `c00b641` and it caught one, which is the first time
naming the four places has paid.** The four read: this paragraph, *"§2 holds
**four entries**"*; the title, which states a subject and no count and is
therefore the only one that cannot rot this way; §2's heading, *"## 2. Four
entries: …"*; and §5's preamble, *"§2 holds three entries"*. **The fourth was
eleven releases behind the other two.** #467 added §2's fourth entry — ADR
0056's — and moved this paragraph and §2's heading and not §5's, which is the
exact split the paragraph above predicts: §2's count is edited when a decision
is filed, and the others when somebody remembers. §5's preamble is corrected in
place, with the sentence it replaced left standing beside it. **The sweep is
also the only check that could have found it**: this file is not in its own
dependency set, every file ADR 0056's entry cites *is* in it, and the delta
intersection for this anchor would have handed a reader eleven files and not
this one.

Re-anchored at `main` @ `c00b641` (**v0.0.143**) by the delta method this header
describes, from `bb3a01e` (v0.0.132). `git diff --name-only bb3a01e..c00b641`
reports **82 files**; **eight intersect the declared set as it stood before this
commit extended it** — `package.json`, `docs/DEPLOYMENT.md`,
`docs/adr/README.md`, `src/main.ts`,
`src/persistence/session/session-controller.ts`,
`src/simulation/construction/definition.ts`, `src/simulation/protocol/types.ts`
and `src/ui/hud/hud.css` — with **no ADR in the declared set touched** and **no
migration**. **Three more intersect the omissions this pass derived from the
document itself**: `docs/AGENT_WORKFLOW.md` and ADRs **0042** and **0048**, so
eleven files were read rather than eight. Eleven releases carrying **eleven**
merged pull requests: #463, #464, #465, #466, #467, #468, #469, #471, #472, #473
and #474, read off `git log --oneline --first-parent bb3a01e..c00b641`.
`c00b641` is `origin/main`'s tip at the time of writing and is a merged commit,
not a branch tip; #475 and #476 were open and unmerged when this reading was
taken and are **not** in it.

**The previous anchor's delta note, kept rather than deleted, because the two
windows are the same length and the intersections differ by a factor of three.**
It read: *"`git diff --name-only 54418b6..bb3a01e` reports **337 files**;
**twenty-nine intersect the declared set below** — seventeen named files, twelve
ADRs (0002, 0008, 0010, 0012, 0013, 0015, 0017, 0022, 0025, 0026, 0028, 0029)
and **no new migration**. Eleven releases carrying **eleven** merged pull
requests: #447, #450, #452, #453, #454, #455, #458, #459, #460, #461, #462."*
This window landed almost entirely in `src/simulation/`, `src/ui/` and `tests/`,
where §§3-6 cite little. **The brief this pass was given named #455, #458, #459
and #462 as its content: all four are in the *previous* window**, and
`git log --first-parent` is the cheap check that says so — the same check the
previous pass recorded for the same reason.

**What this delta did to §§3-6, and which check found which, because the three
checks did not find the same things.** Six corrections, split by source:

**From the eleven-file intersection**, four. `docs/adr/README.md` gained four
ADR rows, which falsified three claims in one go — the *"nine `Proposed`"*
figure in §3, in §5's first bullet and in §6's `income.ts` bullet (**thirteen**,
in all three places); §5's *"not one of them has a §2 row"* (**withdrawn**, and
it goes the other way for once: ADR 0056 arrived with its row); and §5's *"Four
became thirteen"* (sixteen). It also moved that file's **Next free number** line,
which falsified §5's *"That file now states **0038** as next free"* — it states
0058 now, and `git show bb3a01e:docs/adr/README.md` states **0053**, so that
*correction* was **already false on the tree it was written against**.
`src/main.ts` and `docs/DEPLOYMENT.md` moved three code anchors:
`:2494-2499` → `:2506-2511`, `:2494` → `:2506`, and the six-row deployment
table `:145-152` → `:198-205`.

**From the four-place queue sweep**, one, and no diff could have reached it:
§5's preamble said *"§2 holds three entries"* while §2's own heading has said
four since #467. That is the header's predicted drift, caught by the check the
header prescribes.

**From deriving the set against the document**, one: the list itself said
`services/telemetry/**` is *"thirteen modules"* and it is **fifteen**, and has
been since before the previous anchor.

Every other rooted `file:line` in §§3-6 was re-derived mechanically and
**lands** — including the four `transition()` sites in
`src/simulation/worker/state-machine.ts`, which had moved at each of the three
previous anchors and did not move here. **So this is the first pass at which the
counts, not the numbers, were the damage**, which is the reverse of every
previous pass and is what §6's recommendation 1 was for. It is also the third
consecutive pass to find a claim that was already false when its window opened,
and this time two of them were.

**The previous delta, `54418b6..bb3a01e`, touched a great deal that §§3-6 depend
on, and the sentence this header warns about would have been false.** Reading the intersection withdrew
**three** claims outright, overtook **four** more as done-elsewhere, retired
**fourteen** prose citations in favour of quoted sentences, and re-anchored every
code citation in §§3-6 against `bb3a01e`. What was withdrawn: §5's *"the telemetry layer is
inert"*, §6's *"no ADR in the directory is `Proposed`"* (nine are), and §5's
*"exactly one file, and for exactly one reason"* about object ids outside
`src/content/`.

**And the set was still incomplete, which is the finding *this* pass exists to
report — the second consecutive pass to find it, by a wider derivation than the
last one used.** The previous pass extracted every backticked *path* in §§3-6.
That misses an ADR cited as a bare number, which is how §§3-6 usually cite one,
so this pass extracted every backticked path **and** every bare `00NN` token in
§§3-6 and diffed both against the list. It found **twenty-two** members the list
had never named: eleven files — `AGENTS.md`, `docs/AGENT_WORKFLOW.md`,
`docs/research/README.md`, `src/persistence/save-schema.ts`, `src/ui/tokens.css`,
`src/ui/brand.css`, `src/ui/primitives/primitives.css`,
`tests/foundation/adr-numbering-contract.test.ts`,
`tests/foundation/adr-status-queue-anchor-contract.test.ts`,
`tests/foundation/documentation-links-contract.test.ts` and
`tests/unit/environment-art.test.ts` — and eleven ADRs: **0007**, **0014**,
**0032**, **0033**, **0042**, **0043**, **0047**, **0048**, **0049**, **0051**
and **0052**. Nine of those eleven ADRs are the very documents §5's first bullet
and §6's `income.ts` bullet count, so the pass that wrote those bullets cited
nine ADRs and listed none of them. **Three of the twenty-two changed in this
window** — `docs/AGENT_WORKFLOW.md`, ADR 0042 and ADR 0048 — and reading them is
why the four quoted `docs/AGENT_WORKFLOW.md` sentences in §§3-6 could be
confirmed still verbatim and why 0042's and 0048's statuses could be reported as
unmoved rather than assumed. **And one entry in the list was wrong rather than
missing**: it says `services/telemetry/**` is *"thirteen modules"*. It is
**fifteen**, and `git ls-tree bb3a01e` returns fifteen too, so that count was
wrong when it was written and not overtaken. A dependency set is a claim like any
other and rots the same way.

**Also not in the set, and left out deliberately rather than missed:** ADR
**0020**, which changed in this window and which §2 cites (ADR 0056 amends its
Ordered Command Queue). The set's stated scope is §§3-6 and nothing in §§3-6
cites 0020, so adding it would widen the rule rather than complete the list.
Recorded here because the next reader will find it in the diff and wonder.

**The previous pass's finding, kept:** the enumerated set did not cover the
`54418b6..bb3a01e` delta either. §§3-6 cite **fourteen** files the set did not list,
and **nine of them changed in this window**: `src/main.ts`, the thirteen modules
under `src/services/telemetry/`,
`src/persistence/session/session-controller.ts`,
`src/simulation/protocol/transferables.ts`, `src/ui/hud/hud.css`,
`tests/integration/object-placement-loop.test.ts`,
`tests/unit/actor-identity.test.ts`, and ADRs **0003** and **0006**. The largest
falsification in this pass is in two of them, and the intersection would never
have put either in front of a reader. So the delta note is not merely a claim
that has to be checkable — **on a stale set it is checkable and wrong**, which is
a worse failure than not writing one. The set is completed below and the rule
that keeps it complete is restated where it binds.

**What the previous pass found, and the shape it found it in**, kept because the
ratio is the argument for the rewrite §6 closes with. Every one of the seven
falsified citations was a *line number*, and not one of the sentences those
numbers point at had changed: the command union still discriminates thirteen,
`state-machine.ts` still makes exactly four `transition()` calls and still
targets `'ready'` from none of them, and `protocol/handshake` still has exactly
nine occurrences in `src/`, all of them the receiver or the schema. That was the
third consecutive pass to report the same ratio, and this file had by then said
three times that **a `file:line` into a file under active edit is its least
durable citation and a quoted sentence is its most.** §6's closing paragraph
carries the proposal that followed.

**The fourth pass stopped saying it and started doing it.** Where an entry in
§§3-6 cites *prose*, this re-anchor re-cites it by section title and quoted
sentence and drops the number; where it cites *code*, the number stays and is
re-anchored to `bb3a01e`, because grep checks a code anchor and nobody re-reads a
prose one. That is recommendation 1 at the foot of §6, applied rather than
re-proposed, and it is why this pass corrects fewer numbers than the last three
while opening more files. The one class deliberately left as numbers is a table
row, which a quotation cannot name uniquely.

The one claim of substance *that* delta falsified was §4's, and it was the one
this file had singled out as *not* having moved: `.github/workflows/migrate-database.yml`
and `docs/DEPLOYMENT.md` were both edited by #423 at `4f738ae` (v0.0.116), which
ends the "twenty-one releases without moving" that §4 recorded as its outcome.
The constraint §4 watches is intact — every mechanism citation was re-read and
still lands — but the sentence asserting the *absence* of movement is exactly the
shape this corpus keeps finding rots first, and it rotted five releases after it
was written.

Two claims the delta *could* have falsified and did not, carried forward and
re-checked at this anchor: `AWAITING_PRODUCER` is still empty
(`tests/foundation/unconsumed-command-contract.test.ts:204`, whose whole body is
a comment beginning *"**Empty, and that is a first.**"*), and `minQuantity` is
still unchecked (`src/simulation/rooms/requirements.ts:19` and
`src/simulation/presentation/room-projection.ts:74` both still say so). Both
files are in the set; both were read rather than assumed.

**Why that anchor moved twice in one day, and it was not carelessness.** Every
merge triggers a `Version` bump in a commit of its own that starts no CI run, so
nine merges spent nine releases of budget without any of them running this gate.
The budget was crossed by release bumps, not by unread history — but the fix is
the same either way, because the releases are real and the entries had genuinely
not been read against them.

**Observed at this anchor and recorded rather than acted on, because the
constant is not an editor's to move (issue #449).** The gate went from green to
blocking **every branch in the repository** with nothing in between for the
second consecutive time: it is measured against `package.json`, every merge cuts
a release, and the release commit starts no CI run — so the first run that sees
11 is a run on somebody else's unrelated branch. There is no state between "in
budget" and "everyone is red", and nothing schedules the read that would keep it
from arriving. Two shapes of answer exist and both are the owner's: a visible
band below the hard bound, or a scheduled read that does not wait for the gate.
**Neither is a change to the number**, which is what the budget is for.

**And this anchor is evidence about the unit, which is the open half of #449.**
That issue's weakest claim, in its own words, is *"that 169 commits is the right
measure of 'unread history' for this file"*, and it names the test:
*"running the header's own delta method and finding the intersection is
genuinely small"*. Two consecutive windows of **exactly eleven releases each**
have now been run by that method: `54418b6..bb3a01e` was **209** commits, 337
files, **twenty-nine** in the set; `bb3a01e..c00b641` was **22** commits, 82
files, **eight**. So a release bought nine times as much history in one window
as in the next, measured on adjacent windows of the same declared length, which
is #449's point demonstrated rather than argued. The intersection **is**
genuinely small in the second — eleven
files read, exactly what #449 asked to see. **And it still missed everything
that mattered.** The four real errors this pass corrected were a paragraph
disagreeing with a heading in the same file, a correction that was false on the
tree it was written against, a count in three places, and a dependency list that
had never been complete — **none of them reachable from any diff of any size**,
because none of them is a change to a file. That is a finding about the unit and
not a proposal: the quantity a budget can measure and the quantity a re-read has
to spend are different quantities, and this window is the clean case where the
first was small and the second was not.

**This anchor is the opposite case and it is worth naming, because the same gate
fired for the opposite reason.** Eleven releases carried eleven merged pull
requests, every one of them real work: six owner decisions settled as ADRs
0042-0047 with a live privacy defect fixed (#447), riots (#450), a rendered
staffing warning (#452), recurring wages and arrears (#455), a sentence that ends
(#458), a prisoner roster and a Regime panel (#459), a command answered while the
clock is paused (#460) and a renderer that reads the shipped source art (#462).
The budget was spent on **history nobody had read**, which is what it is for.
Three of those eleven — #447, #450 and #452 — were missing from the brief this
pass was given, and #447 alone carries the two largest falsifications below; the
count came off `git log --first-parent`, which is the cheap check that finds
them.

**Something the last anchor got wrong, recorded because it is structural rather
than careless.** This line named `54418b6`, which is the **v0.0.121 release
commit** — and `git log --oneline -- docs/adr/STATUS-QUEUE.md` shows eight
commits editing §§2, 5 and 6 *after* it, all eight inside #447 — `513cdfc`,
`4297c73`, `ab33903`, `906077e`, `374065b`, `674266e`, `002e118`, `ceaa265`,
which is the whole of `git log 54418b6..bb3a01e -- docs/adr/STATUS-QUEUE.md`. So the
declared anchor was once again **older than parts of the document it warranted**,
which is the exact defect
`tests/foundation/adr-status-queue-anchor-contract.test.ts` was written for and
which no assertion in it can see: the sha is well-formed, the version is in
budget, and the file is still ahead of its own anchor. An anchor should name the
tree the reading was done against, and a release commit cut before the branch
merged is not that tree. `bb3a01e` is `origin/main`'s tip at the time of writing
and contains every sentence below.

The older warrant, kept because it is still the correct description of the
method: **the warrant is stated
precisely because it is not the same warrant the last two anchors carried**:
§§3-6 were read in full at `83c3121`, and the delta `83c3121..dbe271f` was read
against them by the method under *"How to extend this anchor cheaply"* below. So
every claim below has been read from disk at `83c3121` or later, and every claim
whose evidence the delta touched has been read at `dbe271f`. Entries cite symbols
rather than line numbers where a citation would otherwise drift on the next edit
(the precedent is #309) — and the two anchors' worth of line numbers that drifted
anyway are the argument for doing it more.

**This line said `4e3976d` (v0.0.65) for twelve releases, and the file carried a
second, older anchor underneath it.** Two commits after that re-anchor — #331
and #335 — edited §5 without moving this line, so the file's declared anchor was
older than parts of the file itself. Meanwhile §§3-5 said "re-verified at
`4ed571f`" in five places, and `4ed571f` is **v0.0.58**, seven releases older
again. A reader had two dates to reconcile and no way to tell which entry had
been checked when, which is the failure mode this whole file exists to prevent.
Both anchors are now the same commit, every "re-verified at" below names it, and
`tests/foundation/adr-status-queue-anchor-contract.test.ts` asserts that they
stay one commit and that the version this line names does not fall far behind
`package.json`. That test cannot tell whether a sentence here is true — nothing
mechanical can — but it can tell that the file has stopped being re-read, which
is what actually went wrong.

**And it happened again, which is why that test exists rather than a promise.**
The line above said `cddaebb` (v0.0.77) for eleven releases. Two commits in that
window edited this file — #356, which accepted ADR 0029 and emptied §2, and #367,
which put ADR 0031 in it — and **neither touched §§3-6 or moved the anchor**, so
the declared anchor was once more older than parts of the document it warranted.
This is the first re-anchor the gate asked for rather than a human noticing: it
went red at v0.0.88 with *"11 releases of history that no entry in that file has
been read against"*. §§3-6 were then re-read entry by entry against `83c3121`,
which is the work the budget stands for and not the moving of this line. What
that reading found is recorded where it belongs, and it is not a formality: **six
claims in §§3-6 were withdrawn as false**, three counts in prose were wrong, and
ten `file:line` citations no longer landed where they said. The largest is the §5
entry on ADR 0027, which said that ADR's subject was *"unreachable in any session
a player can start"* — measured here, two prisoners share one cell through four
commands a player sends, so the entry is withdrawn and replaced by the
measurement that refutes it. Two more sentences still turned on ADR 0029 being
unapproved and now name ADR 0031.

**And a third time, ten releases later, on the same day.** That re-read landed at
v0.0.96 and named `83c3121` (v0.0.88) — the release commit its branch was cut
from, which was already eight releases old when the branch merged. **An anchor
moved to a commit that is already old spends most of its budget on arrival**, and
this one spent eight of ten before anyone could read it: the gate stood at exactly
10 with the next release commit — which `.github/workflows/version.yml` produces
after every merge and which starts no CI run — guaranteed to break it. So this
re-anchor is not a second full re-read. It is the **delta** `83c3121..dbe271f`,
read against the dependency set below, and that is the practice this file is
adopting rather than a shortcut taken once.

### How to extend this anchor cheaply, and what it costs to be allowed to

**§§3-6 do not depend on the tree at large. They depend on an enumerable set of
files**, and every claim in them cites one.

**That sentence was true and the list under it was not, and the difference cost
this pass its largest finding.** The list below had **fourteen** omissions on
2026-08-28 — files §§3-6 already cited and the set never named — and nine of them
changed in the `54418b6..bb3a01e` window. They are marked **(added 2026-08-28,
already cited)** where they now sit. The rule at the foot of this subsection was
never broken by a single entry; it was broken by the entries that predate the
rule, and nothing re-reads a list for citations that were already in the file
when it was written. **So the maintenance rule is not enough on its own, and the
check that is: derive the list from the document rather than trusting it** —
extract every backticked path in §§3-6 and diff it against this list. That is one
command and it is what found these fourteen.

**That derivation was itself incomplete, and 2026-08-28's second pass found
twenty-two more by widening it.** A backticked-path scan cannot see an ADR cited
as a bare number, and a bare number is how §§3-6 cite an ADR nine times out of
ten — so the nine `Proposed` ADRs that §5's first bullet and §6's `income.ts`
bullet are *about* were cited without one of them being listed here. **The check
is therefore two scans, not one**: every backticked path **and** every bare
`00NN` token in §§3-6, both diffed against this list. Both are one command each.
The twenty-two are marked **(added 2026-08-28, second pass, already cited)**
below, and the list also carried one entry that was *wrong* rather than missing —
`services/telemetry/**` was described as thirteen modules and has been fifteen
since before the previous anchor.

The set, in full:

- `package.json` and `supabase/migrations/**` (§3);
  `.github/workflows/migrate-database.yml`, `docs/DEPLOYMENT.md` and
  `wrangler.jsonc` (§4). `supabase/tests/003_data_api_grants.test.sql` was added
  on 2026-08-27, when §2's third entry began citing the role sweep it holds.
- `docs/CLOUD_SAVE.md`, `docs/TRUSTED_SERVICES.md`, `docs/HUD_PROJECTIONS.md`,
  `README.md`, `docs/adr/README.md` and
  `docs/research/2026-08-25-economy-rate.md` — **and, added 2026-08-28, second
  pass, already cited**: `AGENTS.md` (§5's `environment-art.ts` entry rests on
  its boundary 6), `docs/AGENT_WORKFLOW.md` (§§3, 5 and 6 quote its §4 four
  times, and it **changed in this window**; all four quotations were re-read and
  are still verbatim) and `docs/research/README.md` (§6's *"deliberately left"*
  bullet rests on the rule it states).
- ADRs **0002, 0008, 0009, 0010, 0012, 0013, 0015, 0016, 0017, 0022, 0023, 0025,
  0026, 0027, 0028, 0029, 0031** — and, **added 2026-08-28, already cited**,
  **0003** and **0006** (§5's handshake entry is about both, and both changed in
  this delta), **0024** (the same entry names its deleted implementation note).
  Added 2026-08-28 because entries rewritten at this anchor now cite them:
  **0044**, **0045**, **0046** and **0050**. **Added 2026-08-28, second pass,
  already cited**: **0007** (§5's fourth case is about its amendment), **0014**
  (§6's `README.md` bullet asserts its status), **0032** (§5's first bullet
  rests on its precedent), **0033** (§5 and §6 both make claims about it), and
  the seven `Proposed` documents §5's first bullet and §6's `income.ts` bullet
  count without listing — **0042**, **0043**, **0047**, **0048**, **0049**,
  **0051** and **0052**. Added at this anchor because the corrected counts now
  name them: **0053**, **0054**, **0056** and **0057**. 0042 and 0048 both
  changed in this window; both statuses were re-read and are unmoved.
- Files under `src/` — sixteen until 2026-08-28, when the omissions were counted:
  `ui/hud/messages.ts`, `ui/hud/projection.ts`,
  `ui/hud/hud.ts`, `ui/hud/build-panel.ts`, `content/procurement-catalog.ts`,
  `content/room-catalog.ts`, `simulation/economy/income.ts`,
  `simulation/rooms/zoning.ts`, `simulation/rooms/topology.ts`,
  `simulation/worker/state-machine.ts`, `simulation/protocol/commands.ts`,
  `simulation/protocol/types.ts`, `simulation/construction/definition.ts`,
  `simulation/prisoners/intake-system.ts`,
  `services/challenges/verification.ts`, `persistence/cloud/sync-engine.ts`
  (added 2026-08-27 with §2's new entry, in the same commit, which is what the
  paragraph below requires) — **and, added 2026-08-28, already cited**:
  `main.ts`, `services/telemetry/**` (**fifteen** modules; §5's ADR 0010 entry is
  a claim about the whole directory. **This read "thirteen" and was wrong when it
  was written** — `git ls-tree bb3a01e src/services/telemetry/` returns fifteen
  too, so it was never overtaken, and nothing in the directory changed in this
  window), `persistence/session/session-controller.ts`,
  `simulation/protocol/transferables.ts`, `ui/hud/hud.css`,
  `simulation/presentation/room-projection.ts` and `simulation/rooms/requirements.ts`.
  Added 2026-08-28 because entries rewritten at this anchor now cite them:
  `ui/telemetry-consent-prompt.ts`, `simulation/prisoners/release.ts` and
  `rendering/world/environment-art.ts`. **Added 2026-08-28, second pass, already
  cited**: `persistence/save-schema.ts` (§5's ADR 0009 entry cites `:1164` by
  line), and the three `.css` files §5's 900x600 entry counts —
  `ui/tokens.css`, `ui/brand.css` and `ui/primitives/primitives.css` — together
  with `ui/primitives/**`, which §5's `ui-hud-messages.test.ts` citation is a
  claim about.
- Under `tests/`: `foundation/adr-status-reference-contract.test.ts`,
  `foundation/unconsumed-command-contract.test.ts`,
  `unit/ui-hud-messages.test.ts`, `unit/objects-room-capacity.test.ts`,
  `unit/entity-generation-wrap.test.ts`,
  `unit/prisoners-intake-system.test.ts` — **and, added 2026-08-28, already
  cited**: `integration/object-placement-loop.test.ts`,
  `unit/actor-identity.test.ts`, `unit/ui-hud-build-panel.test.ts` and
  `unit/ui-simulation-zoning.test.ts` — **and, added 2026-08-28, second pass,
  already cited**: `foundation/adr-numbering-contract.test.ts`,
  `foundation/adr-status-queue-anchor-contract.test.ts`,
  `foundation/documentation-links-contract.test.ts` and
  `unit/environment-art.test.ts`. The last is the one §5's `environment-art.ts`
  handover turns on, and the first three are the gates §6 describes: §§3-6 make
  claims about what each of them asserts, so each is a dependency in exactly the
  sense this list means.

**So extending the anchor is `git diff --name-only <anchor>..HEAD` intersected
with that set, and then reading only the intersection.** Run for
`83c3121..dbe271f`: **53 files changed, 15 of them in the set** — three docs, six
ADRs and `docs/adr/README.md`, `package.json`, two new migrations, and **three of
the twenty-one files under `src/` and `tests/`**. Reading fifteen files is not
reading eighty citations, and that difference is what makes an anchor extensible
instead of a thing nobody has time to move.

**The delta note for this anchor, stated so a reader can re-run it.** The diff is
`git diff --name-only bb3a01e..c00b641`, **82 files**. Intersected with the set
as it stood *before* this commit extended it, it is **eight**: `package.json`,
`docs/DEPLOYMENT.md`, `docs/adr/README.md`, `src/main.ts`,
`src/persistence/session/session-controller.ts`,
`src/simulation/construction/definition.ts`, `src/simulation/protocol/types.ts`
and `src/ui/hud/hud.css`. **No ADR in the declared set changed**, and **no file
under `supabase/migrations/` changed** — the directory still holds twenty-three
— which is why §3's table needed no re-derivation and why its two absences hold.
Intersected with the twenty-two members this commit adds, it is **three** more:
`docs/AGENT_WORKFLOW.md`, ADR 0042 and ADR 0048. Eleven files read.

**What the eight and the three actually cost, because a small intersection is
not a small consequence and this file has said so twice.** `docs/DEPLOYMENT.md`
gained 54 lines in #474 and moved §4's deployment table from `:145-152` to
`:198-205`; `src/main.ts` moved §5's telemetry-consent anchors from
`:2494-2499`/`:2494` to `:2506-2511`/`:2506`; `docs/adr/README.md` gained four
ADR rows and moved its **Next free number** line from 0053 to 0058, which
falsified a *correction* §5 had written one anchor earlier. The other five
declared members changed without moving a single citation:
`src/persistence/session/session-controller.ts` still declares
`DEFAULT_AUTOSAVE_INTERVAL_MS = 30_000` at `:9`,
`src/simulation/protocol/types.ts` still declares
`protocolVersion: z.literal(...)` at `:168`,
`src/simulation/construction/definition.ts` still carries nineteen `object.*`
literals on `BUILDABLE_REGISTRY` rows, `src/ui/hud/hud.css` is still one of four
`.css` files under `src/ui/`, and `package.json` is the version this line names.

**The members the diff reports as untouched were spot-read anyway**, because the
last two passes each found a citation that was already wrong before their window
opened and no diff could have raised either. This pass re-derived **every**
rooted `file:line` in §§3-6 mechanically — extract each backticked `path:N`
span, open the file, print the line — and the untouched half held completely:
the four `transition()` sites in `src/simulation/worker/state-machine.ts` are
still `:664`, `:799`, `:834` and `:1110` after moving at each of the three
previous anchors; `simulationCommandSchema` is still at
`src/simulation/protocol/commands.ts:467` and still discriminates thirteen;
`HudIntent` still declares eighteen members between `src/ui/hud/hud.ts:271` and
`:541`; `protocol/handshake` still returns nine hits in `src/`, split 4/2/3
exactly as ADR 0003 records. **The one thing the untouched half did surface** is
that ADR 0022's own note citing `hud.ts:153` for `HudRoomGesture` lands one line
short — it is at `:154`, and it was at `:154` at `bb3a01e` too, so that is a
drift inside ADR 0022 that predates this window. Correcting an ADR body is not
this file's edit; it is handed over here.

**The previous anchor's delta note, kept as a record.** The diff was
`git diff --name-only 54418b6..bb3a01e`, **337 files**. Intersected with the set
as it stood *before* this commit extended it, it is **twenty-nine**: the
seventeen named files `package.json`, `docs/DEPLOYMENT.md`, `docs/CLOUD_SAVE.md`,
`docs/TRUSTED_SERVICES.md`, `docs/HUD_PROJECTIONS.md`, `docs/adr/README.md`,
`src/ui/hud/messages.ts`, `src/ui/hud/hud.ts`,
`src/content/procurement-catalog.ts`, `src/simulation/rooms/zoning.ts`,
`src/simulation/worker/state-machine.ts`, `src/simulation/protocol/commands.ts`,
`src/simulation/protocol/types.ts`, `src/simulation/construction/definition.ts`,
`src/simulation/prisoners/intake-system.ts`, `tests/unit/ui-hud-messages.test.ts`
and `tests/unit/prisoners-intake-system.test.ts`; plus ADRs 0002, 0008, 0010,
0012, 0013, 0015, 0017, 0022, 0025, 0026, 0028 and 0029. **No file under
`supabase/migrations/` changed**, which is why §3's table needed no re-derivation
and why its two absences hold. `wrangler.jsonc`,
`.github/workflows/migrate-database.yml`, `README.md`,
`src/content/room-catalog.ts`, `src/simulation/rooms/topology.ts`,
`src/simulation/economy/income.ts`, `src/ui/hud/projection.ts`,
`src/ui/hud/build-panel.ts`, `src/services/challenges/verification.ts`,
`src/persistence/cloud/sync-engine.ts`, `docs/research/2026-08-25-economy-rate.md`,
`tests/foundation/adr-status-reference-contract.test.ts`,
`tests/foundation/unconsumed-command-contract.test.ts`,
`tests/unit/objects-room-capacity.test.ts`,
`tests/unit/entity-generation-wrap.test.ts` and ADRs 0009, 0016, 0023, 0027 and
0031 are the members `git diff` reports as untouched; the `file:line` citations
into them were spot-checked anyway rather than rested on the diff, because the
last pass recorded that resting on it is how two of six came apart.

**And then the intersection was checked for completeness against the document
itself, which is the step the method was missing.** Every backticked path in
§§3-6 was extracted and diffed against the list; the fourteen omissions are named
in the header above, nine of them changed, and reading those nine is where the
telemetry finding came from. **At this anchor the same check was run again with
bare `00NN` tokens added to it and found twenty-two more**, eleven of them ADRs
— including nine that §5's and §6's own bullets enumerate by number. So the
completeness check has now run twice and found omissions twice, and the second
run found more than the first: **a set derived by one pattern is only complete
with respect to that pattern**, which is the same failure one level up. Both
scans are stated in the subsection above so the next reader runs both. **A delta pass is only as sound as its set**, and
nothing in the arithmetic tells you the set is wrong — the intersection of a real
diff with an incomplete list is a real, small, reassuring number.

**What this is not licence to do.** A delta note is a claim and it needs an
entry's standard: *"the delta touched nothing §§3-6 depend on"* is a sentence
somebody has to be able to check, so it must name the diff it ran and the set it
intersected, and it is false the moment the set is stale — an entry that starts
citing a file not listed above has to add it here in the same commit, exactly as
landing a change means updating its entry. **And a small intersection is not a
small consequence.** Three files under `src/`/`tests/` moved in this delta and
they falsified **three claims**, one of them a claim the previous re-read had
written eight releases earlier. The cheap step is finding *what to read*. Nothing
here licenses deciding that nothing needs reading.

A note on keeping this file true, since it is the kind of document that rots
silently: an entry's evidence is a claim about `main`, so **landing the change
an entry describes means updating that entry in the same commit**, exactly as
moving a status means moving its index row. #295 changed the code and ADR 0012
and left this file behind, which is how the old entry 7 came to be false for two
releases — a correction that itself had to be landed separately, at `b653b93`,
before the entry could be acted on. Nothing mechanical can catch that: the gates
over `docs/adr/` check statuses against documents — the index against the ADR,
and every sentence in the corpus against the ADR — and none of them checks a
status against code. It is a habit, not an assertion.

The one thing that *is* now asserted is narrower and is the failure that
actually happened: the anchor line above stopped moving.
`tests/foundation/adr-status-queue-anchor-contract.test.ts` requires this file
to declare exactly one anchor commit, requires every live "verified at" below to
name that same commit, and fails when the version the anchor names falls more
than ten releases behind `package.json`. It proves nothing about whether a
sentence here is true — moving the anchor without re-reading anything passes it
— so it is a bound on unreviewed history and not a substitute for the habit.

---

## 1. What was decided, and when — all thirteen

Every flip happened on **2026-08-25**, in three commits, each flip as the pair
the suite requires: the `Status` line in the ADR and that ADR's row in
`docs/adr/README.md`.

### The six retroactive approvals (#308)

The entries this file was originally written for. Each was a decision the code
had already been built on while the document still said it was awaiting
approval.

| ADR | Was | Is |
| --- | --- | --- |
| [0012](./0012-derived-identifier-reproducibility.md) | Proposed | **Accepted** |
| [0013](./0013-free-tier-cloud-save-capacity.md) | Proposed — pending human approval | **Accepted for §§1-4; §§5-6 remain Proposed** |
| [0014](./0014-art-storage-and-runtime-asset-delivery.md) | Proposed | **Accepted** |
| [0015](./0015-actor-identity-allocation.md) | Proposed | **Accepted** |
| [0016](./0016-migration-delivery-mechanism.md) | Proposed — pending human approval | **Accepted**, retroactively |
| [0021](./0021-http-response-security-headers.md) | Proposed — pending human approval | **Accepted** |

Two of those status lines say more than a bare keyword, because a bare
replacement would have left a true status next to a stale sentence. **0012**
records the remedy #295 landed (`nextGlobalId` is a local of
`recomputeGlobalTopology`, so ids are handed out from 1 in canonical sorted order
on every recompute) and names the residue that was still open in code. That
residue — `chunkTopologies` was never evicted — has since closed too, in #324,
so §5 no longer carries it and what remains open there is the world-streaming
policy rather than the eviction. **0015** says 0012 is
Accepted, because the same commit falsified its old "Extends ADR 0012, which is
Proposed".

### The three room decisions (#314)

The three entries this file carried as *genuine open decisions* — shipped
against not at all, or only in part.

| ADR | Was | Is |
| --- | --- | --- |
| [0022](./0022-room-zoning-surface.md) | Proposed — pending human approval; amended 2026-08-25 | **Accepted, 2026-08-25 — as amended** (Decision §1 superseded by that amendment) |
| [0023](./0023-room-occupancy-authority.md) | Proposed — pending human approval | **Accepted, 2026-08-25 — as amended**; *not* superseded by 0028 |
| [0028](./0028-object-placement-and-derived-room-capacity.md) | Proposed — pending human approval | **Accepted, 2026-08-25** |

What was signed for **0022** is the amendment (the Rooms tab, shipped in #312),
not the Decision text, which is left verbatim as the historical record. **0023**
was kept accepted rather than superseded so that its authored *nominal* fallback
stays available if object placement proves too large — and because it was kept
alive it could not be left stating something false, so it carries a dated
amendment recording that a capacity-only fallback is a **no-op**: the capability
half of `findAvailable`/`findBestAvailable` is what refuses a zoned cell, and a
nominal capacity of 2 would leave every arrival accruing
`accommodationBacklogTicks` exactly as `capacity: 0` does. **0028** got the
status line and nothing else: editing its phases in the commit that approved
them would have been the approval deciding something the owner did not.

### The four in this commit

| ADR | Was | Is |
| --- | --- | --- |
| [0024](./0024-protocol-fault-recoverability.md) | Proposed — pending human approval | **Accepted, 2026-08-25** |
| [0025](./0025-guard-hiring-surface.md) | Proposed — pending human approval | **Accepted, 2026-08-25** |
| [0026](./0026-entity-id-lifetime.md) | Proposed — pending human approval | **Accepted, 2026-08-25 — as the framing and the tripwire; its three questions stay open** |
| [0027](./0027-cell-sharing-assessment.md) | Proposed — pending human approval | **Accepted, 2026-08-25 — as the mechanism; its three questions stay open** |

**0024 dragged the one thing in the corpus that had to move with a status, and
that was the point of it.** Accepting it deleted the implementation note in
`docs/adr/0006-simulation-worker-adapter.md` ("a protocol decode error no longer
reaches state 5") and narrowed ADR 0006 state 5's clause to an unhandled
exception, with a one-sentence cross-reference to 0024 for where a decode error
goes instead. That note existed precisely so an Accepted ADR would not be amended
on a Proposed one's authority; the acceptance supplied the authority and the note
had nothing left to record. Nothing else in the corpus depended on it —
re-verified by grep at this commit: the only other references to it were 0024's
own Status and Follow-up, both rewritten in the same commit, and the two
remaining notes of that shape (`0006`'s states 1-2 and `0003`'s decision 4)
belong to the handshake gap in §5 and are untouched. `main` needed no change in
`src/` to comply with 0024, because the code that proposed it already
implemented it.

**0025 sets no wage figure and settles nothing wider than its surface.** The
approval covers three separable things — the Staff panel in the Security tab's
rail slot, a one-off charge read from `wageBand.minPerDay` in the treasury's
minor units, and a producer offering `staff-role.guard` against a command that
accepts any *declared* role. Prices stay with issue #29, per ADR 0017 decision 5.
All **seven** items in that ADR's *What this decision does not settle* remain
open and were deliberately not touched: payroll, where in a band an individual
sits, dismissal and refunds, undoability, which roles the surface offers, whether
the panel lists who is hired, and whether the arrival tile must be owned, in
bounds or reachable.

**0026 and 0027 are accepted as framings, not as answers**, and their status
lines say so rather than leaving a reader to discover it. 0026 approves that its
three questions are one decision, that the defect is pinned in the suite as a
labelled tripwire rather than fixed quietly, and that #31 is where the answers
get taken; options A, B and C and question 3's three shapes are exactly as open
as before. 0027 approves the mechanism that landed — the rating seam on
`findBestAvailable`, one term, occupants sorted ascending by entity id, advisory
and stateless — and leaves its three questions open. **The owner was told when
approving 0027 that its subject was "unreachable in any session a player can
start"**: that a zoned room derives capacity zero while nothing is placed in it,
so nobody shares a cell and the decision's effects are not observable until a
shipped session can place an object into a zoned room. **That is recorded here as
what was said, because it was wrong** — and wrong already on the day it was said,
not overtaken since. 0028's phase 1 had shipped, a player can place a bed, and
§5's rewritten ADR 0027 entry carries the measurement: two prisoners housed in
one `room.cell` instance through commands only a player sends. What the approval
does leave open is narrower and is in §5 — the *rating* between two eligible
cells is exercised nowhere, because no shipped session yet furnishes two.

---

## 2. Five entries: #382's two rulings in ADR 0008 §2, 2026-08-27's scope clause for its §3, the Worker that lands with telemetry ingest, ADR 0056's price for keeping a player's orders in order, and ADR 0059's price for making them walk

**This heading has now read "empty", "exactly one entry: ADR 0029", "empty
again", one entry, two, one, empty for the third time, one again, and — on
2026-08-27 — three** —
0031, 0032, 0033 and 0007's amendment were all accepted on 2026-08-26. Two of those four
never appeared here at all, which is the failure recorded at the foot of this
section, and the churn in this heading is the point rather than noise: it is the
only place a reader can see how fast this corpus moves. **Two of the three
entries it holds are amendments rather than new documents**. Counting from this
section's own record that 0007's was the first amendment ever to have a row here,
the amendments queued in this file are 0007's — by its author's own instinct —
and ADR 0008's two, both queued by the ruling recorded in
`docs/adr/README.md`. An amendment is queued here for the
same reason a new ADR is: it decides something the sections above it do not, and
nothing else in the corpus would tell the owner that a decision is waiting.
`adr-numbering-contract.test.ts` counts documents by their `Status` line, so an
amendment inside an accepted ADR is invisible to every mechanical gate there is;
this row is the only thing that says it exists. 0029 was accepted on 2026-08-26 and
its entry was deleted, which is what this section's own rule prescribed — the
entry said *"this entry is deleted"* as part of the exact recipe for accepting
it, and following that recipe is the whole point of writing one.

The rule this section states — *"any commit that adds an outstanding ADR adds an
entry here in the same commit, giving the evidence, what settling it commits the
project to, and the exact line that would replace the status"* — is followed by
0031, and the account of why the queue was emptied is kept below unchanged,
because it is the argument for why one row is worth reading.

**The rule's trigger is unchanged by the 2026-08-27 ruling, and that is the
ruling's main point.** `docs/adr/README.md`'s *"An amendment to an accepted ADR"*
section settles what this file filed in §5 as the owner's question — whether
*"applies an accepted decision"* and *"amends an accepted decision"* can be told
apart by anything a reader can check. They cannot, so **the answer is not to
widen this rule to cover amendments as a class**: exactly one of the seventeen
post-hoc additions in `docs/adr/` ever had a row here, and widening a rule this
section already calls *"unsatisfiable under concurrency"* would have condemned
sixteen of them on the day it landed. What the ruling requires instead is form —
an amendment is a dated `Amendment`/`Addendum` section that says in its own
opening whether it was approved — so that *outstanding*, which is and stays the
trigger, is something a reader can see rather than reconstruct. The entry below
is the one case where nobody could see it.

What the round trip is worth recording for: 0029 arrived on the same branch as
its implementing code, and **it sat `Proposed` on `main` for a day while that
code was already shipping.** That is precisely the fragile case this section
names, met in practice rather than in theory. The queue did its job — the row was
the reason anyone knew a decision was outstanding — but the gap between the code
landing and the status moving is the cost, and it is not zero.

The account of why the queue was emptied the first time is kept below unchanged,
because it is still the argument for why one row is worth reading.

### ADR 0008 §2's two rulings (#382) — awaiting approval

**What is waiting.** Two rulings #382 wrote into
[ADR 0008](./0008-trusted-service-boundary.md) §2 on 2026-08-26 as decided, with
no approval caveat and — until 2026-08-27 — no heading, no date in the document
structure and no row here. ADR 0008 is `Accepted` and **stays** `Accepted`; that
keyword is not what is in question and no status moves either way on this. Both
rulings now sit under dated `#### Amendment, 2026-08-26 (#382, …)` headings in §2,
each with an opening paragraph saying that the only warrant behind it is #382's
judgement.

1. **A Data API role holds exactly the DML privileges its zone needs on a table,
   and nothing else** (issue #280 finding F14). Its own words for the general
   part: *"The rule this settles for every future table is that a new relation in
   `public` starts closed, and its migration opens exactly what it means to
   open."*
2. **Authority over a row is not authority over the record of when it was
   written** (issue #194). It narrows §2's *"Prison simulation state, saves,
   settings — Z0/Z1 (client-authoritative, RLS-scoped)"* row by ruling a
   `created_at`/`updated_at` column out of a row's *content*: the timestamp's
   authority is Z2 even on a table whose payload is Z0's.

**The evidence, and it is not in dispute.** Both are executed in SQL, not merely
written down. `20260826120000_revoke_ambient_table_privileges.sql` revokes
`REFERENCES`, `TRIGGER` and `MAINTAIN` and the `ALTER DEFAULT PRIVILEGES` entries
that handed them back; `20260826130000_server_stamp_updated_at.sql` stamps
`updated_at` from a `BEFORE INSERT OR UPDATE` trigger on `prisons`, `profiles`
and `user_settings` and keeps the column out of every client grant. So the
question is not whether the code matches the rulings — it does — but whether the
rulings are the project's or one pull request's.

**What approving commits the project to.** Ruling 1 binds every migration written
from now on: a new relation in `public` starts with a null ACL and its own
migration opens exactly the privileges it needs, which is a per-table cost paid
forever in exchange for the class of ambient-privilege defect that produced #163,
#280 F14 and F15. Ruling 2 says a client never writes a server timestamp, and
pre-commits the alternative: *"If a client-side edit time is ever needed for
reconciliation it gets its own column, named for what it is (`client_edited_at`)"*
— so approving it also closes off the cheaper option of reusing `updated_at` for
that.

**The exact edit that accepts them.** In
[ADR 0008](./0008-trusted-service-boundary.md) §2, both `#### Amendment` headings
gain `— approved <date>` and their opening paragraphs lose the sentence saying
nobody has approved them, replaced by who approved what; the two rulings'
own paragraphs are not touched, because they are the text being approved. The
`0008` row in [`README.md`](./README.md) is unaffected — its status keyword is
`Accepted` either way. **And this entry is deleted**, which is the recipe this
section prescribes and the thing following it is for.

**If the answer is no**, the two rulings do not simply get struck: the two
migrations above have shipped, so rejecting either is a decision to write a
migration that reverses it, and the ADR text becomes the record of a rule that
was tried. Say which of the two, because they are independent — ruling 1 is about
grants on future tables, ruling 2 about one column's authority — and #382 argued
them separately.

**Why this is one entry rather than two.** They landed in one pull request, on one
reading of §2's zone taxonomy, and the governance question they raised is common
to both. The substance is separable and the answer may differ per ruling; the row
is shared because the thing the owner has not seen is the same thing twice.

### ADR 0008 §3's scope clause (2026-08-27) — the reading is the owner's, the wording is not

**What is waiting, and it is narrower than the entry above.** The owner **has**
decided the substance: the amendment of 2026-08-26 recorded that §3's scope was
unstated and put two readings to them — bind §3 by *runtime* (§1's zone list) or
by *authority* (§2's table) — and they chose **by authority**. The amendment
dated 2026-08-27 at the foot of
[ADR 0008](./0008-trusted-service-boundary.md) writes that choice down. ADR 0008
is `Accepted` and **stays** `Accepted`; no status moves, and the `0008` row in
[`README.md`](./README.md) is unaffected.

**So why a row at all.** Two reasons, and the first is the one this section's
own text gives: *"an amendment inside an accepted ADR is invisible to every
mechanical gate there is; this row is the only thing that says it exists."* The
second is that a choice between two readings does not approve the consequences
drawn from it, and this amendment draws several the owner has not seen. Those
are what is outstanding:

1. **The clause's wording is the editor's.** The owner's draft, quoted in the
   2026-08-26 amendment, was *"every mutation path over Z2-authoritative
   state"*. What landed is *"every mutation path over state that §2's authority
   table assigns to Z2, and only those"*, plus a decide-versus-touch test. The
   amendment argues both changes; neither was put to the owner.
2. **`create_save_version` falls outside §3, and the argument for it is the
   weakest joint.** The pointer columns `current_revision` and
   `current_version_id` are out of every client grant and
   `src/persistence/cloud/sync-engine.ts` orders reconciliation by one of them,
   which is close to what §2's 2026-08-26 ruling calls the server's own
   statement. The amendment distinguishes them — the pointer is caller-proposed
   and server-validated, a timestamp is server-computed — and says in terms that
   a reader who disagrees should add a §2 row rather than re-argue the
   paragraph. That is a real fork.
3. **A new threat row, T13**, for flood, forgery and retention evasion against
   an unauthenticated ingest. It is an addition to an accepted threat model.
4. **An obligation the clause creates rather than removes:** a telemetry
   retention or deletion job is *inside* §3, because deciding what is kept is
   the half §2 assigns to Z2. So is the `service_role` column `UPDATE` that
   writes a challenge verdict, which §1's runtime list would not obviously have
   caught.

**What approving commits the project to.** That §3's six steps are demanded of
entitlements, payment facts, challenge submissions and challenge verdicts, and
are **not** demanded of cloud saves, prison creation or telemetry ingest; and
that any future path claiming either answer names a §2 row first, adding one in
the same commit if none covers it.

**What it does not buy, and the amendment says so in its own part 6.** §3 step
1's only enforcement is the pgTAP suites. They sweep database roles by literal
name — `anon`, `authenticated`, `service_role` — so a dedicated Worker role would
be unswept, and a Worker calling a `SECURITY DEFINER` function with a server key
is indistinguishable from any other holder of that key to PostgreSQL. **Nothing
red appears if this boundary is later got wrong.**

**If the answer is no on any of the four**, the clause itself still stands —
the reading was the owner's — and what changes is the consequence. Say which
number, because they are independent.

**The exact edit that accepts them.** The 2026-08-27 `## Amendment` heading in
[ADR 0008](./0008-trusted-service-boundary.md) gains `— approved <date>`, and
its opening paragraph's second half — the one saying the wording and the
consequences are the editor's and open — is replaced by who approved what. The
clause, the table and T13 are not touched, because they are the text being
approved. **And this entry is deleted.**

### The first server-side entry point (2026-08-27) — the order is decided, the pre-merge approval is not

**What is not waiting.** The owner has decided the *order*: telemetry ingest
needs a `main` in `wrangler.jsonc`, they were offered "separate staging from
production first" or "add the Worker together with the ingest", and they chose
the second — one deliberate change, with what lands on `lockstate.io` written
down and approved before it merges. That choice is recorded in
[`docs/DEPLOYMENT.md`](../DEPLOYMENT.md), "The first server entry point lands
with the ingest, not before", which is where a person looks before touching what
serves the live site.

**Why it is nonetheless in this file.** Because the condition attached to the
choice is a **future approval that nothing will ask for**. `lockstate.io` is
served by `lockstate-staging`; the `staging` job publishes on every merge to
`main` whose CI concludes `success`; and the gate on that row is a CI conclusion,
not an approval. So the merge that adds `main` is the act that puts executing
code on the public site, and no workflow will pause to ask. This row is the
standing reminder that the approval is owed, and it is deleted by the change that
obtains it.

**What the owner is being asked for, and when.** Not now — at the pull request
that adds `main`. Nine items, listed in full in that `docs/DEPLOYMENT.md`
section and summarised here so this row is readable on its own: the commit and
the fact that merging it publishes; which requests the handler claims and that
everything else still falls through to Static Assets; what the Worker may hold;
what it must not — **never a `service_role` key**, because that role may call
`record_entitlement_event`, so a public Worker holding it would hold the
paid-entitlement write path; server-side validation, bounding, and a
server-decided occurrence time and weight; whether `public/_headers` changes;
rollback; the wrangler trap; and ADR 0002's amendment.

**The credential is the sharp one, and it is unswept either way.**
`supabase/tests/003_data_api_grants.test.sql` pins the privilege surface of
`anon`, `authenticated` and `service_role`, each named as a literal. A dedicated
least-privilege role for the Worker — which is the mitigation — is seen by none
of it unless that suite's role list is extended in the same change. Extending a
pinned list is what adding a role looks like here.

**Whether ADR 0002 needs amending now: no, and the reason is which sentence goes
false.** Its rejected alternative *"Add a Worker server entry point now"* is
**honoured** rather than overturned — it was rejected because *"a placeholder
server would add routing and security surface without product value"*, and a
Worker that arrives carrying the ingest is not a placeholder. What goes false is
the Decision bullet *"Deploy the current application as an assets-only Worker
with no application-server entry point"*, and it goes false in the commit that
adds `main`, not on the day the decision to do it was recorded. Amending it today
would put the document ahead of the code. **If the owner disagrees and wants ADR
0002 amended now, that is the one part of this row that is a decision rather
than a reminder.**

**And this entry is deleted** by the pull request that adds `main`, in the same
commit — which is this file's standing rule that landing the change an entry
describes means updating the entry with it.

### ADR 0056 (2026-08-28) — the fix is decided, the second of simulated time it costs a player is not

**Filed by the change that implements it, which is what §2's rule asks for.**
`agent/437-undo-inversion` adds
[ADR 0056](./0056-keeping-a-players-orders-in-the-order-they-gave-them.md)
alongside the code it decides, so this row arrives in the same commit rather
than being reconstructed later.

**The evidence.** Issue #437 is reproduced on `6f671d5`, driving the shipped
`SimulationCommandSender` against the shipped `SimulationWorkerStateMachine`
with a real `Kernel`, `FixedStepClock` and `ConstructionSystem`. A player who
places a wall, presses play, places a second wall, pauses inside the twenty-tick
lead and presses Undo has **the first wall cancelled and the second one built**
— because `projectExecuteTick` collapses backwards on a pause, so the Undo
carries a higher `sequence` at a lower `executeAtTick` and dispatches first.
Re-run with the transaction id per gesture that the shipped HUD actually mints,
the outcome is one step worse than the issue reports: both undo and redo stacks
end empty, so the wrongly cancelled wall cannot be recovered by any gesture.
The defect survived [ADR 0051](./0051-what-a-player-sees-for-an-order-given-while-the-clock-is-paused.md)
with every reported value unchanged but by a different route, which was measured
rather than assumed: that ADR (#460) replaced the very dispatch mechanism #437
names, so "the mechanism has changed" was treated as a reason to re-measure and
not as a reason to assume the issue was stale.

**What settling it commits the project to.** Two things, and only the second is
a judgement call.

1. *That the ordering fix is right.* It is the remedy
   [ADR 0020](./0020-deterministic-kernel.md)'s own closing section names and
   leaves open, it refuses nothing, it touches no simulation code, and the
   determinism scenario's state hash does not move.
2. *That the price is acceptable.* An order given during a pause that began
   **within one second of the previous order** now takes effect on the first
   step after play rather than immediately — which narrows ADR 0051's promise
   that "`Undo` takes back the thing the player just did instead of nothing".
   The window is bounded by one command lead and by nothing else; outside it
   ADR 0051 is untouched. ADR 0056's open question 1 names the alternative that
   would keep immediacy — rebasing pending commands down to the current tick
   when the player pauses — and does not take it.

**A third thing the owner should see even though it is not being decided here.**
ADR 0056 records that grounds 2 and 3 of ADR 0020's *"Decision, 2026-08-27"*
are overtaken by this change: they are costs of refusing an `executeAtTick`
*below* the highest queued, and the shipped sender no longer submits one, so the
kernel-side guard that decision rejected is now inert rather than expensive
against the front door. **Ground 1 is untouched and is what the decision rests
on.** #437 puts a kernel-side refusal out of scope and this branch does not
re-open it; the note exists so the next reader of that section knows two of its
four numbers describe a front door that has changed.

**The exact line that would replace the status**, in
`docs/adr/0056-keeping-a-players-orders-in-the-order-they-gave-them.md`:

```
**Accepted, <date>.**
```

replacing `**Proposed, 2026-08-28.** Not self-approved.`, with the matching
`Proposed, 2026-08-28 — …` prefix in that ADR's
[`README.md`](./README.md) row changed to `Accepted, <date> — …`, **and this
entry deleted in the same commit**, which is this section's standing recipe.

### ADR 0059 (2026-08-28) — the walk is decided, the day it eats is not

**What is waiting.**
[ADR 0059](./0059-how-an-actor-gets-from-one-tile-to-the-next.md), `Proposed`,
landed with its implementation on `agent/414-delta-channel`. It answers
[ADR 0040](./0040-the-shape-of-the-render-delta-channel.md) open question 1: an
actor that has a resolved route walks it, one tile per two kernel ticks, with
sub-tile progress in a transient store no save carries.

**The evidence, and it is measured rather than argued.** The render delta
channel has been live at a 100 ms ceiling since ADR 0040 slice 1, and actors
still teleported, because `ActionSystem.continueTravelling` wrote the
destination anchor in the statement that resolved the route — a position that
changed twice per errand. Mutating that line back reproduces the defect exactly:
30 tiles in one tick against the 1 the guard now requires.

**What approving commits the project to**, and each of these is a cost rather
than a benefit:

1. **A walking speed of ten tiles a second, chosen against a 2,400-tick day.**
   It is bounded below by starvation, measured twice as the speed was raised:
   one prison starved its prisoner at 2.5 tiles/s, and a second, larger one
   starved at 5, because a journey outlasted the 100-tick regime block that had
   sent them on it. It is bounded above by looking like sliding — 640 px/s at
   1× zoom is hurried. **The day length is the parameter that forced both
   raises**, and ADR 0059 open question 1 hands that back.
2. **A prisoner spends 18–28% of the day in transit** where they spent 3.5%.
   Twenty-five integration assertions were re-measured for it.
3. **[ADR 0062](./0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md)'s
   exact-equality result does not survive it.** Six prisoners no longer bottom
   out at identical hunger, because six cells at six distances give six
   different days; the spread is bounded at three levels and no longer tracks
   scan position, which is what #434 was about, and the assertion says so
   rather than being deleted.
4. **A refusal at a room's door reconsiders on the spot**, which mitigates
   [ADR 0029](./0029-concurrent-room-use-claims.md)'s wasted trip without taking
   the reservation-with-expiry that ADR's own revisit condition prescribes. Two
   mechanisms for one race is how the next defect gets written, so if open
   question 2 is ever answered, that line goes.
5. **A save taken mid-journey restores the prisoner idle on the tile they had
   reached.** That rule is not new; how often it is reached is, and one riot
   fixture's live and restored arms now spend a 400-tick window 24 ticks apart
   in what they get through while doing the same things.

**The exact line that would replace the status.** In
[`0059-how-an-actor-gets-from-one-tile-to-the-next.md`](./0059-how-an-actor-gets-from-one-tile-to-the-next.md),
`**Proposed, 2026-08-28.**` becomes `**Accepted, <date> — <by whom, and what
was read>.**`, with the matching `Proposed, 2026-08-28 — …` prefix in that ADR's
[`README.md`](./README.md) row changed to `Accepted, <date> — …`, **and this
entry deleted in the same commit**, which is this section's standing recipe.

### ADR 0031 — accepted 2026-08-26, and the entry is deleted

Following this section's own recipe: the decision was settled, the accepted count
moved by one, and the entry it replaced is gone rather than annotated. What is
kept is the one thing the entry could not have predicted, because a reader of
0031 needs it and the deleted entry is where they would have looked for it.

**It was accepted with a condition, not plainly.** Open question 4 of that ADR
("is the catalogue the right donor?") is promoted to *blocking*: the catalogue
needs a surface of its own before more rows arrive. The entry deleted here argued
the trade on a `BUILDABLE_REGISTRY` of two rows; the amendment at the foot of the
ADR re-argued it at four and reported three of four behind a scroll at 900x600;
ADR 0028 phase 4 then landed **twenty-one**. At the row height and list box that
ADR measured, that is one row of twenty-one visible — derived from its own two
figures, not re-measured, and labelled as derived in its Status.

The generalisable part, and the reason this closure is longer than "deleted": a
queue entry states the price of a decision *at the moment it is written*, and
nothing re-reads it when a later change multiplies that price. This one was
multiplied twice by an unrelated ADR's phases, between being written and being
approved. **A queue entry whose argument rests on a count should name the count
and where it lives**, so that the next reader can check it in one command rather
than trusting the number. This entry did not, and the acceptance had to
reconstruct it.
### ADR 0007's amendment — accepted 2026-08-26, and the entry is deleted

Following the exact edit this entry itself prescribed: the amendment's heading
lost `(awaiting approval)`, the sentence saying it was unapproved is gone, and
this entry is deleted. **No `Status` line moved and no row in
[`README.md`](./README.md) changed**, because 0007 was Accepted throughout and an
amendment to it does not touch that — which is precisely why this row was the
only record that a decision was outstanding.

What is kept, because deleting it would leave nothing behind: the approval is now
recorded **only in the amendment's own opening paragraph**. Every mechanical
check in this repository counts documents by their `Status` line, so from this
commit onward there is no gate, no index row and no queue entry that could tell
anyone this decision was ever pending, or that it was decided. That is the
structural gap this entry existed to cover, and closing the entry re-opens it.

The generalisable part, since this is the second time in one day the same shape
has cost something: **a decision that changes no `Status` line has no home in
this corpus.** 0032 and 0033 were both approved without ever getting an entry
here because the file was held by other work; this amendment got one and it
worked exactly as designed. The difference was not diligence, it was contention —
so the fix is a queue two commits can append to without conflicting, not more
care.

### Four ADRs have now been accepted without ever appearing in this queue

0032, 0033, **0034 and 0035**. All four the same way, and the rule has now failed
more often than it has worked, so the count is the finding rather than any one
instance.

0034 and 0035 were written in the same hour by two agents, each told this file was
out of scope because a third was rewriting it. Both did exactly what 0032's
precedent prescribes — debt recorded in the ADR's own Status, entry quoted
verbatim in the pull request — and both were then accepted before anyone was free
to write the entry. **The entries were never wrong, never disputed and never
written.**

What the four cases together show, which no single one did: the rule's cost is
paid by whoever holds the file, and its benefit accrues to a reader who may never
arrive. A rule with that shape is not obeyed less carefully over time — it is
obeyed until the first collision and then routed around, correctly, by people
doing the right thing. **The fix is structural and it is now overdue**: one file
per entry in a directory, so two commits can add two entries without touching each
other, and so "the file is held" stops being a reason.

The section that follows records 0032's case in the detail it was written with,
and is kept as the first instance rather than folded into this count.

### ADR 0032 was accepted without ever appearing in this queue

Recorded because it is this section's own rule failing, and the rule is worth
more than the appearance of a clean record.

[ADR 0032](./0032-incident-consequences-and-classification-review.md) — what an
incident costs the prisoner who was in it — arrived with its implementing change
on 2026-08-26 and was accepted the same day. **It never had an entry here.** Its
author could not add one: this file was held by concurrent work, so the
instruction they were given put it out of scope. They did the next best thing —
recorded the debt in the ADR's own Status, recorded it again in
[`README.md`](./README.md), and quoted the entry they would have written in the
pull request — and the debt was then paid by nobody, because the acceptance
arrived before the file was free.

Two things follow, and neither is "try harder".

**The rule as written is unsatisfiable under concurrency.** *"Any commit that adds
an outstanding ADR adds an entry here in the same commit"* assumes one writer.
With two changes in flight, one of them must either edit a file another is
rewriting or break the rule; the author chose to break it visibly, which was the
right call and should not be held against them. If this rule is to survive, the
queue needs to be something two commits can append to without conflicting — a
file per entry in a directory, most likely — or the rule needs to say what to do
when the file is held.

**An ADR can be approved faster than its queue entry can be written.** This
section is addressed to the owner and exists so a pending decision is visible;
0032 was visible enough to be decided without it. That is not evidence the queue
is unnecessary — 0031 sat for a day *with* an entry — but it is evidence that the
queue is not the only path, and a rule whose violation costs nothing observable
will be violated again.

### Why the queue was emptied, and what that bought

**Before 0029, no ADR in `docs/adr/` was `Proposed`.** Twenty-seven documents,
twenty-seven `Accepted` statuses — several with a qualifier the document itself carries, which
is the honest form for a decision accepted in part (0013 §§1-4, 0026's framing,
0027's mechanism). Verified by reading each document's own status line and its
index row, not by trusting a table.

Two things follow, and the second matters more than the first.

**The count is zero rather than untracked.** The previous revision of this file
had to record that its own premise did not hold: the three room flips were
expected to empty the queue and left four behind. This one closes that, and it is
worth saying why the four were missed. **0025, 0026 and 0027 had never had an
entry in this file at all.** Each arrived with the change that wrote it — 0025
alongside the hiring surface it designs (#302), 0026 and 0027 as a pair in #299 —
rather than being drafted against `main` and left for review, so a file written
for the *retroactive-approval* problem never picked them up. That was a real gap
in this file's coverage, not a small one: three of the four remaining Proposed
ADRs were invisible to the only document that was supposed to be tracking them.
The gap is closed by the queue being empty, and the way to keep it closed is
stated below.

**The next `Proposed` ADR is a signal on its own.** While there were four or
eight, a new one was one of a crowd and nothing distinguished "awaiting a
decision" from "nobody has looked at this in a fortnight". From now on a
`Proposed` row in `docs/adr/README.md` is the only one, so it reads as a request
addressed to the owner rather than as background. That is the property this
exercise was for, and it is fragile in exactly one way: an ADR that arrives with
its own implementing change, as 0025, 0026 and 0027 did, is `Proposed` on `main`
from the moment it merges and can sit there unnoticed. **The rule that keeps this
true is therefore mechanical about the trigger rather than about the queue: any
commit that adds a `Proposed` ADR adds an entry here in the same commit**, giving
the evidence, what settling it commits the project to, and the exact line that
would replace the status. There was nothing to inherit — the queue was empty, so
the next entry would be the whole of it. **That next entry is ADR 0029, above,
and it arrived in exactly the predicted shape: with its own implementing change.**

`docs/adr/README.md` and the root `README.md` were both corrected in this commit
to stop claiming a queue; §6 records what was corrected and what was left.

---

## 3. Still outstanding: ADR 0013 §§5-6

**This section opened *"The one genuinely open decision left in the corpus"* and
that is false at `bb3a01e`.** It was true at `54418b6`, when no document in
`docs/adr/` was `Proposed`; nine were at `bb3a01e` (0042, 0043, 0046-0052, all
arrived in that delta, all listed in §5's first bullet). **Thirteen are at
`c00b641`** — 0053, 0054, 0056 and 0057 arrived in the eleven releases since —
and the sentence saying nine is left above rather than overwritten, because a
count that has now been zero, nine and thirteen across twenty-two releases is
this section's own evidence for stating a subject instead of a tally. What is
still true, and is why the section keeps its subject rather than being folded
into that bullet, is narrower and is the durable half: **0013 §§5-6 is the only
open decision in the corpus whose two halves are *partly enforced in a live
database*, and the only one this file has ever had to track by reading SQL.**
The thirteen are ordinary `Proposed` documents with index rows; this one is a
split status inside an `Accepted` one, which no index row can show.

A count in a section's opening sentence is the shape this file's own title
rotted twice on, and it has now done it here. Stated as a subject above rather
than as a tally.

0013 is **Accepted for §§1-4
only**, and that is not a formality: two of its six decisions are enforced in the
database and two are explicitly absent.

| ADR section | state | evidence |
| --- | --- | --- |
| §1 five free slots, enforced by the database | **shipped, accepted** | `base_save_slot_capacity()`, `account_save_slot_capacity(uuid)` |
| §2 a trigger, with an RPC as the front door | **shipped, accepted** | `enforce_prison_slot_capacity()` and its trigger |
| §3 over-capacity degrades read-only | **shipped, accepted** | the exception's `hint` |
| §4 4 MiB per-save payload bound | **shipped, accepted** | `max_save_payload_bytes()` — `as $$ select 4194304 $$;` |
| §5 256 MiB total per account | **absent, still Proposed** | no total-bytes function, trigger or column anywhere in `supabase/migrations/` |
| §6 20 revisions retained per prison | **absent, still Proposed** | no retention or pruning logic anywhere in `supabase/migrations/` |

Functions in that table live in
`supabase/migrations/20260823100000_bound_free_tier_capacity.sql`, and every row
of that table was re-read against the file at this commit: `:45` and `:91`,
`:150` with its trigger at `:188`, the exception's `hint` at `:178`, and
`:71-73`'s `as $$ select 4194304 $$;`. Both
absences were re-verified at `c00b641` by grepping the whole
`supabase/migrations/` tree for a total-bytes, retention or pruning mechanism
(`total_bytes`, `retention`, `prune`, `268435456`, `max_revisions`). **That grep
is no longer clean and the finding is unchanged**: it returns exactly one
hit, `20260826130000_server_stamp_updated_at.sql:68`, which is *prose* — a
comment naming a future retention job as the reason that migration bounds what it
bounds. A reader re-running the grep should expect it and not mistake a sentence
about a mechanism for the mechanism. There is
none, and the single hit for *"retention"* is a forward reference discussed below
rather than a mechanism.

**Unmoved at `c00b641`, and this is the cheap half of the pass — for the second
consecutive anchor.** No file under `supabase/migrations/` appears in
`git diff --name-only bb3a01e..c00b641` either, the directory still holds
twenty-three, and the six anchors into
`20260823100000_bound_free_tier_capacity.sql` above were each opened rather than
rested on the diff: `:45` and `:91` are the two capacity functions, `:71-73` is
`as $$ select 4194304 $$;`, `:150` is `enforce_prison_slot_capacity()`, `:178` is
the exception's `hint` and `:188` is the trigger. `DEFAULT_AUTOSAVE_INTERVAL_MS`
is still `30_000` and still at `:9` — worth saying because
`src/persistence/session/session-controller.ts` changed again in this window
(#468's save-import fix, 13 lines) without touching the constant, having gained
91 lines in the previous one (#403's refused-generation work) equally without
touching it. **That is a citation that has now survived two consecutive edits to
its own file**, which is what a code anchor is supposed to do and is the
counter-example to this file's usual finding.

**One sentence in this section points at nothing, and no diff could have said
so.** It reads *"the release count said 'eighteen' for twelve releases and now
reads thirty"* — but no release count remains anywhere in this section for
*"thirty"* to be. The sentence it corrected was
`git diff 4ed571f..main -- supabase/migrations/` *"is empty across all eighteen
releases"*, which `83c3121` carried and which a later rewrite deleted outright,
taking the referent with it and leaving the correction behind. **A correction
outliving the claim it corrected is the same rot as a claim outliving the code**,
and §4 of `docs/AGENT_WORKFLOW.md` says as much: a correction is no more durable
than the claim it corrected. It is kept, marked, and the missing half is supplied
here: the number that was eighteen and then thirty is the count of releases across
which that diff had been empty, and it is now meaningless because the diff has not
been empty since #382.

**The claim underneath that one moved at the previous anchor, and it was the first
time this section had had to change for a reason other than nobody deciding
anything.**
This entry said the directory *"holds the same twenty-one files it held at
`4ed571f`"* and that `git diff 4ed571f..main -- supabase/migrations/` *"is
empty"*. It holds **twenty-three**, and that diff is no longer empty: **#382
added two** — `20260826120000_revoke_ambient_table_privileges.sql` and
`20260826130000_server_stamp_updated_at.sql`. Neither touches capacity. The
base migration this section's whole table cites is byte-identical (`git diff
83c3121..main` over `20260823100000_bound_free_tier_capacity.sql` is empty), so
every row above still stands; what changed is a sentence this entry used as a
shortcut for "nothing here has moved", which is exactly the kind of sentence that
stops being true without anybody deciding to make it false. **And the release
count said "eighteen" for twelve releases and now reads thirty** — a release
count in prose is a claim about `main` that goes stale on every merge, so it is
the number to check first and the reason the anchor above has a test.

**One thing in #382 bears on §6 without deciding it, and is the reason the
retention grep is no longer silent.** `20260826130000_server_stamp_updated_at.sql:68-76`
argues that the exposure of a client-writable `updated_at` is *"a **future**
reader: a retention or cleanup job keyed on `updated_at` (docs/CLOUD_SAVE.md
names 'cleanup of abandoned anonymous accounts' as open work, ADR 0013 sections
5-6)"*, and closes it now *"because the column becomes load-bearing in the commit
that first reads it, not in the commit that first writes it"*. So whichever
retention policy §6 eventually gets, **the column it would key on is now
server-authoritative** — a constraint the decision inherits rather than an answer
to it. §6 is still undecided and still unimplemented.

**§5 — 256 MiB per account.** Undecided and unimplemented. The ADR's own §5
records that it depends on the revision-depth decision below and on the
JSONB-versus-Storage question, so it cannot be settled ahead of §6.

**§6 — 20 revisions per prison.** Undecided and unimplemented, and the number
*is* the decision. The arithmetic that originally justified it is wrong: 20
revisions at `DEFAULT_AUTOSAVE_INTERVAL_MS`
(`src/persistence/session/session-controller.ts:9`, `30_000`, re-read at this
anchor) is **ten minutes**, not *"roughly a day of ordinary autosaving"* — and §6
computes 2,880 rows a day from that same constant five lines earlier, so a day of
ordinary autosaving is 2,880 revisions, **144× the proposed number**. The ADR
already records this and withdraws the justification while deliberately leaving
the figure at 20, because moving it is the owner's call (issue #274, Q2). So what
is open is not the discovery but the policy: keep 20 and accept that "restore an
earlier generation" means the last ten minutes of autosaving, or keep "roughly a
day" as the requirement and raise the number. **Settle that before accepting
§6.**

Accepting §§1-4 deliberately did **not** approve 256 MiB or 20 revisions.

---

## 4. The live risk to watch: ADR 0016 §2 is binding and nothing enforces it

This is the one thing the flips *added* to the risk surface, and it belongs at
the top of any future audit. None of the seven flips after #308 touches
deployment, SQL or a live hosted mechanism, so nothing here moved with them.

Accepting 0016 makes its §2 a **binding constraint**: production is a separate
Supabase project with a distinct project ref, and the Supabase GitHub integration
is never reconfigured to point at it. The ADR says plainly why that is fragile:

> Recorded as a constraint precisely because nothing enforces it mechanically.

The mechanism it constrains is live and irreversible. Migrations reach the hosted
Supabase staging project *"automatically, on every merge to `main`"* with gating
*"none"* (`docs/DEPLOYMENT.md`, "Automated deployment"), rollback is not
automated, and the trigger is the merge rather than the diff — PR #87 touched no
file under `supabase/migrations/` and nine migrations were applied anyway. The
evidence is in that same section: the six-row table (`docs/DEPLOYMENT.md:198-205`
— a table row is the one thing a quotation cannot name uniquely, so this stays a
number), the paragraph beginning *"`migrate-database.yml` has three runs in its
entire history"* for the 71-second window, and the one beginning *"Read that row
as 'on every merge', not 'when migration files change'"* for #87 itself. All
three re-read at this anchor.

**Those last two were `:160` and `:162` here and are now `:164` and `:166`, and
the table was `:143-147` and is now `:145-152`** — `docs/DEPLOYMENT.md` gained 99
lines in the `54418b6..bb3a01e` delta. The previous anchor had already corrected the same two from
`:159` and `:161`. **That was the third consecutive anchor at which the same two
numbers moved and the two sentences did not**, so they are re-cited by their
opening words above and the numbers are retired; the sentences have survived
every edit and the numbers have survived none.

**Make it four, and this time the retirement paid for itself.** The two
paragraphs are `:217` and `:219` at `c00b641` and needed no correction at all,
because they are cited by their opening words. **The table is the one citation
in this section that a quotation cannot replace, and it is the only one that
broke**: `:143-147`, then `:145-152`, and `:198-205` now. `docs/DEPLOYMENT.md`
gained **54 lines** in this delta — #474, which gates the `dist/.assetsignore`
exclusion that keeps the generated Wrangler config off the public origin, and
which inserts its new section *above* everything this entry cites. The section
title *"What currently serves lockstate.io"*, which §5's ADR 0002 entry cites,
moved from `:200` to `:253` in the same edit and likewise needed nothing. That
is recommendation 1 at the foot of §6 producing a measurable result rather than
being restated: **three of the four citations into the fastest-moving document
in the set survived an edit that moved every line of them.**

The half of the decision that *is* in this repository stays verified at `c00b641`:
`.github/workflows/migrate-database.yml` is `workflow_dispatch:` (`:34`) with no
`push:`, requires a typed `confirm_project_ref` (`:41`), and its apply job is
environment-gated (`:65`) — all three re-read at this anchor and all three still
land, on a file `git diff` reports as untouched since `54418b6`.

**This entry used to say that nothing here had moved, and that has been false
since v0.0.116.** It read: *"`git diff cddaebb..main` over that file is still empty, and so is
`git diff 83c3121..main` — neither this workflow nor `docs/DEPLOYMENT.md` appears
in either delta, so nothing in this section has moved across twenty-one
releases."* Both files were edited by **#423 at `4f738ae` (v0.0.116)**, which
closed the deploy gate: `.github/workflows/migrate-database.yml` gained five
lines and `docs/DEPLOYMENT.md` thirteen. So the run of untouched releases ended
five releases after the sentence claiming it was written. **`docs/DEPLOYMENT.md`
has moved again in the eleven releases to `bb3a01e`** — 99 lines, from #447's
staging-deploy and first-server-entry-point work — and
`.github/workflows/migrate-database.yml` has not. **And again in the eleven to
`c00b641`** — 54 lines, from #474 — while the workflow still has not, so the
asymmetry now holds across three consecutive windows and twenty-two releases.
The asymmetry is the point of
this section: the workflow is the half a gate can hold, and the half that keeps
moving is the prose describing a dashboard nothing here can read. **What #474
added is not about migrations and does not touch this section's mechanism** — it
is a build-output check on `dist/.assetsignore`, read at this anchor rather than
inferred from its title — and the two migration rows of the table above are
word-for-word what they were at `bb3a01e`.

**What did and did not follow from that.** The mechanism this section watches is
unchanged — every citation above was re-read rather than assumed, and #423
tightened the *frontend* deploy gate without touching the migration path. What
the edit falsified is only the sentence asserting the absence of movement, which
is the shape this corpus keeps finding rots first: adding the thing an absence
denies never touches the sentence denying it. Recording the outcome was right;
stating it as a standing property rather than as a reading at a named commit was
what made it rot. Rewritten above as a reading at this anchor. The one thing that *did* move nearby is #382's two new
migrations, and they reach a hosted database by exactly the mechanism this
section is about — which is the risk being live rather than the constraint being
broken.

So the constraint is approved architecture whose only defence is a sentence in a
document. Repointing the integration is a two-click change in a dashboard; it
would violate an Accepted ADR with no code review and no trace in this
repository. **There is nothing to decide here — this is a watch item**, and the
thing to watch for is the creation of a second Supabase project.

---

## 5. Where an accepted decision and the code disagree

Everything below describes a mechanism `main` does not exercise, or documents
that disagree with each other. **None is a status defect.** This paragraph used
to say that "with the queue empty that is the whole of what this section can be:
either a decision is accepted and the code has not caught up, which is a code or
wiring gap, or two documents state different numbers, which is a docs-truth job".
That premise is withdrawn all the same, and with it the claim that those two
shapes are exhaustive: there are two more, described below. **And the queue is
not empty now** — §2 holds three entries: the two rulings #382 wrote into ADR 0008
§2, the 2026-08-27 amendment scoping that ADR's §3, and the preconditions on the
first server-side entry point — so the "with the queue empty" opening no longer
describes the file either. **Still three at `bb3a01e`**: no entry was added or
deleted in the eleven releases, and this is one of the four places the header
names as counting the queue, swept here for that reason.

**FOUR at `c00b641`, and this paragraph was the one place in the file that did
not know it.** #467 added §2's fourth entry — ADR 0056's price for keeping a
player's orders in the order they gave them — and moved the title paragraph and
§2's own heading with it. It did not move this one. So for eleven releases the
header said *"§2 holds **four entries**"*, §2's heading said *"## 2. Four
entries"*, and this preamble said *"§2 holds three entries"*, all in the same
document. **That is exactly the fourth-place drift the header predicts in
terms**, and it was found by the check the header prescribes — reading the
file's own headings against each other — and by nothing else:
`docs/adr/STATUS-QUEUE.md` is not in the dependency set, every file ADR 0056's
entry cites *is*, and no diff of any of them would ever have said that one
paragraph in this file disagreed with another. The sentence saying three is left
above rather than overwritten, because the drift is the record. What did change is not
the count of entries but the count of decisions they are supposed to be tracking,
and that is the first bullet below.

**Corrected at this anchor, and it is the sharper defect of the two.** The
paragraph above then read *"**The queue is not empty** — §2 holds **two**
entries"*, while §2's own heading three hundred lines above says **"The queue is
empty"** and its subsections record both entries as deleted on acceptance. **One
file, two sections, flatly opposite.** The two entries were ADR 0031 and ADR
0007's amendment, both accepted on 2026-08-26; §2 was updated and this paragraph
was not. Nothing mechanical could catch it — the gates over `docs/adr/` compare a
status word to a document, never a document to itself.

**Third: the code has run ahead of a decision nobody has approved.** #367 shipped
the `hud/build-queue` read model, the per-order cancel control and the Build
panel's one-row catalogue floor **before** ADR 0031 was approved. **This entry
said `docs/adr/0031-build-queue-cancellation-surface.md:5` "still reads
`**Proposed — pending human approval.** Not accepted.`" — it reads "Accepted,
2026-08-26 — with open question 4 promoted to blocking", and has since `e560656`
(#389).** That is not a defect — §2 exists to make exactly that visible, and the
ADR arrived in the same commit as the code, which is the rule §2 states — but a
section written on the assumption that an unapproved decision cannot have an
implementation would mis-file it.

**Fourth, and newer: a decision is waiting inside a document whose `Status` line
will never move.** #380 queued an **amendment** to ADR 0007, which is Accepted and
stays Accepted, on the argument §2 now states — that
`adr-numbering-contract.test.ts` counts documents by their `Status` line, so an
amendment inside an accepted ADR *"is invisible to every mechanical gate there
is; this row is the only thing that says it exists"*. Its heading carried the
approval state instead — this entry quoted it as *"## Amendment, 2026-08-26
(awaiting approval)"*, and on acceptance the heading became *"## Amendment,
accepted 2026-08-26: the shared plan is the plan `findRoute` computes…"*, so the
quote is history rather than a live citation and is kept as one. Nothing in §§3-6
could have held that: every entry here is keyed to an ADR's status or to code, and
this is neither. It is also why a README sentence counting outstanding *rows* is
not a contradiction of §2's count — the README counts rows in its own table, and
an amendment has no row. **This shape is no longer only a fourth case: it is a
class with a rule.** `docs/adr/README.md`'s *"An amendment to an accepted ADR"*
section, decided 2026-08-27, is what §2's live entry rests on, and this paragraph
is the first instance it was written from.

**This entry has now cited the README wrongly twice, by line both times.** It
read `docs/adr/README.md:108`'s *"One row is outstanding: 0031"* when the
sentence was neither at that line nor about that ADR; corrected to *"One row is
outstanding: 0033"*, which the README has since **withdrawn**, because 0033 was
accepted on 2026-08-26. A line number is the part of a citation that rots first
and the part a reader checks last. **Cited by quotation rather than by line from
here on**, which is what this file's own §6 concluded and kept not doing.

The entries below are recorded so that
reading this file does not leave the impression that the corpus was audited in
one direction.

- **NEW at the previous anchor — nine ADRs are `Proposed` on `main` and not one
  of them has a §2 row.** At `54418b6` the directory held no `Proposed` document at all;
  at `bb3a01e` it holds **0042, 0043, 0046, 0047, 0048, 0049, 0050, 0051 and
  0052**, plus 0013's standing §§5-6 split. Every one of them arrived in that
  delta, each with its own implementing change, each declining to self-approve —
  *"Proposed. Not accepted, and deliberately not self-approved"* is the wording
  most of them carry — and §2's rule is *"any commit that adds an outstanding ADR
  adds an entry here in the same commit"*.

  **THIRTEEN at `c00b641`, and the second half of that heading is no longer
  true.** Four more arrived in the eleven releases since — **0053** (who may
  stand a security post), **0054** (what a prisoner's day is made of when the
  prison is empty), **0056** (keeping a player's orders in the order they gave
  them) and **0057** (what a riot does to a prisoner's day) — so the directory
  holds **0042, 0043, 0046, 0047, 0048, 0049, 0050, 0051, 0052, 0053, 0054,
  0056 and 0057**, plus 0013's split. **One of the thirteen has a §2 row**: #467
  filed ADR 0056's, in the same commit as the ADR, and recorded that it was the
  first row filed since the rule was restated. So *"not one of them has a §2
  row"* is withdrawn — true when written, false now — and what replaces it is a
  ratio rather than an absence: **one of thirteen**. Counted on disk by reading
  the first non-blank line under each `## Status` heading, which is what
  `adr-status-reference-contract.test.ts` reads; `docs/adr/README.md` reports
  the same thirteen, checked row against document.

  **This is recorded and not decided, and it is emphatically not an accusation.**
  Each of the nine did the thing 0032's precedent prescribes: the debt is in the
  ADR's own Status, the index row is there, and `docs/adr/README.md` reports each
  one as `Proposed`, so nothing is hidden from a reader who opens the index. What
  is missing is the thing §2 exists to give the owner — the evidence, what
  settling it commits the project to, and the exact line that would replace the
  status — for nine decisions at once. **Twelve at `c00b641`**, and the one
  exception is worth naming precisely because it shows the rule is satisfiable
  by one writer and not by eleven: ADR 0056 arrived with its row, in its own
  commit, exactly as the rule says.

  **What it is evidence *of* is the structural finding §2 already made and has
  now been handed at nine times the scale.** §2 says the rule is *"unsatisfiable
  under concurrency"*, that it *"has now failed more often than it has worked"*
  at four instances, and that the fix is *"one file per entry in a directory, so
  two commits can add two entries without touching each other"*. Four became
  thirteen in eleven releases. **Thirteen became sixteen in the eleven after
  that**: 0053, 0054 and 0057 arrived with no row and 0056 arrived with one, in
  a window whose entire content was eleven merged pull requests. A rule that is obeyed for one writer and abandoned
  for eleven parallel merges is not a discipline problem, and the count is the
  finding rather than any one omission. **The decision the owner is owed here is
  whether §2 becomes a directory or stops being a rule**; writing nine entries
  into a single 90 KB file that three agents are editing concurrently would
  reproduce exactly the contention this file has twice diagnosed.

  It stays in §5 rather than §2 because §5 is where this file records what it
  found and could not fix: **writing the nine — twelve at `c00b641` — entries is
  a change to §2, and §2 is not what this re-anchor was for.** It is filed here so the next reader of §§3-6
  does not conclude, from §6's *"no ADR in the directory is `Proposed`"*, that
  there is nothing to look at.

- **ADR 0023 and ADR 0028 are Accepted and now partly implemented, on the
  schedule 0028 set.** This entry read "Accepted and unimplemented", re-verified
  at `4ed571f` on three grounds: that `RoomZoningService` registered every
  instance with `capacity: 0` and `objectCapabilities: []`, that no room
  definition carries a capacity field, and that no `'object.*'` id appeared as a
  literal under `src/` outside `src/content/`. The first and third have since
  moved. `RoomZoningService` no longer hardcodes the zero — it resolves a
  derived figure through a collaborator: an optional fourth constructor
  parameter `capacity`, declared at `src/simulation/rooms/zoning.ts:398` and
  called as `this.capacity?.resolveInstance(instanceId)` at `:567`. **Those two
  numbers have now been wrong at three successive anchors** — `:330`/`:444`, then
  `:345`/`:459`, and #447's enclosure refusal has moved them again — which is why
  the entry names the parameter and the call expression, and why the numbers
  beside them are an aid rather than the citation. The zeroes `register` writes
  are still in the tree (`:560-562`) and the comment above them still says they
  are *"never as the final answer"* (`:556`) — and two object ids are now built
  by construction
  definitions (`placesObjectId: 'object.bed'` on `BUILDABLE_REGISTRY`'s
  `bed-wooden` row and `'object.toilet'` on its `toilet-brick` row,
  `src/simulation/construction/definition.ts`; cited by symbol rather than by
  line, because the two line numbers this entry used to give have already
  drifted once), so something does place, build and read an object. What has **not** moved is the second ground
  and the observable outcome: no room definition authors a capacity, and an
  empty zoned room still derives zero, which is why ADR 0027's tripwire below
  is still green rather than fired — but *"the observable outcome"* no longer
  survives as stated, because a **furnished** room is reachable through the
  shipped path and the rewritten ADR 0027 entry below carries the measurement.
  **Five of 0028's six phases have now landed in whole or in part. This sentence
  said "four" and then enumerated five** — 1, 2, 3, 5 and 6 — so it was refuted
  by its own list on the day it landed. That is the third hand count in this
  section to be off by one, and the reason none of them is worth keeping in
  prose. Phases 1-2
  landed in #320, #321 and #323; **phase 3** (removal, and the
  objects-removed-while-occupied path) landed in **#328**, so a standing object
  can be deleted and an order that has not been built can be cancelled and
  refunded; **phase 5**'s Rooms-tab readout landed *in half* in **#336**, which
  ships the per-room "what is this room missing" verdict but not the
  "over capacity" state the projection still cannot say
  (`room-projection.ts` reads an over-capacity room as full at 100%); and
  **phase 6**'s counting landed in #323 under ADR 0029, which **is no longer
  awaiting approval**: #356 accepted it on 2026-08-26
  (`docs/adr/0029-concurrent-room-use-claims.md:5`, *"**Accepted,
  2026-08-26.**"*, plus its index row), so phase 6 now rests on an Accepted
  decision. **This sentence went on to say "and the queue's one pending entry is
  ADR 0031 instead", which is withdrawn** — 0031 was accepted on 2026-08-26 and
  §2's one entry is now ADR 0008 §2's two rulings. A phase's footing does not
  depend on what else is in the queue, so the clause was decoration that could
  only rot; what it was for is the sentence before it. Phase 4 — the
  rest of the object catalogue — is
  untouched at `dbe271f`: exactly two `'object.*'` ids appeared as literals
  under `src/` outside `src/content/`, both on `BUILDABLE_REGISTRY` rows.
  **ADR 0028 phase 4 (#384) took that to nineteen**, still all on
  `BUILDABLE_REGISTRY` rows and still all in
  `src/simulation/construction/definition.ts` — measured by
  `grep -rno "'object\.[a-z-]*'" src/ --include=*.ts | grep -v '^src/content/'`.

  **FALSIFIED at `bb3a01e`, and this time it is the shape and not the number.**
  That same grep now returns **39** hits in **two** files: nineteen in
  `src/simulation/construction/definition.ts`, all still `placesObjectId` on
  `BUILDABLE_REGISTRY` rows, and **twenty in
  `src/rendering/world/environment-art.ts`**, which #462 added to key artwork by
  the identifiers the simulation already uses. So the sentence this entry twice
  corrected the *number* of — *"object ids still appear outside `src/content/` in
  exactly one file and for exactly one reason"* — is now wrong in the half it
  claimed was durable. It is not a boundary violation: `environment-art.ts` is a
  data module by `AGENTS.md` boundary 6 and its own header says so, and
  `tests/unit/environment-art.test.ts` fails if its lists and the
  registries disagree in either direction — *"accounts for every catalogued
  object exactly once"* (`:248`) and *"accounts for every terrain exactly once"*
  (`:256`).

  **Handed over, because it is not this file's to fix: that module's own header
  cites a test that does not exist.** `src/rendering/world/environment-art.ts:24`
  names a suite `environment-art-coverage.test.ts` under `tests/unit/` and says
  it *"fails if the lists and the registries disagree in either direction"*.
  **There is no such file**; the suite is `tests/unit/environment-art.test.ts`.
  (The wrong name is written here without its directory on purpose:
  `tests/foundation/documentation-links-contract.test.ts` rejects a rooted path
  that is not on disk, with no allowlist, and it rejected this paragraph twice
  before the quotation was broken — which is how the defect was found in the
  first place. That gate reads `docs/`, `README.md` and `.github/` and not `src/`
  comments, which is why the comment shipped and why quoting it into a document
  is what caught it.) **Still open at `c00b641`**: `environment-art.ts:24` still
  names the file that does not exist, `tests/unit/environment-art.test.ts` still
  carries both assertions (`:248` and `:256`), and neither file changed in this
  window — so this handover is eleven releases old and is repeated rather than
  assumed. The claim
  the comment makes is true of the file it means. **Whether the gate should scan
  `src/` comments is a decision, not an edit**, and it is the same class as the
  four blind spots listed above.

  What the entry was watching for was
  object ids leaking into *logic*; a second data module is a second reason, which
  is the thing the sentence denied. **An absence held for two corrections of the
  count and died on the first change that added a reason** — which is what §4 of
  `docs/AGENT_WORKFLOW.md` predicts about a sentence phrased as *"exactly one"*. One
  thing phase 1 promised is now true and was **not** delivered by any phase:
  `door-wooden` builds a real door, and since **#334** the crossing is pinned at
  the two sites that decide it rather than only at the one the issue named. It could not be an object placement — a door
  is a fact about a tile edge — so it is edge geometry plus a `DoorRegistry`
  row, it contributes nothing to either derived capacity, and 0028 carries an
  amendment saying so. Nothing about the eight decisions moved with it. A
  **second** amendment (#326) does move one rule inside decision 2: the
  concurrent-use ceiling is now scoped to the capability being asked for, rather
  than summing `footprint.width` over every object in the room. Measured before
  the change at `9d0a125`, on the real gate: a canteen holding four toilets and a
  storage rack admitted 19 diners to tables that seat 6, and an empty 8x8 yard
  admitted nobody while the same yard holding one loading-dock door admitted
  three. Decision 2's other lines, the other seven decisions and the phase order
  are untouched, and the amendment corrects that ADR's own worked example --
  under capability scoping its canteen seats 6, because `object.bench` declares
  `'seating'` and `'recreation'` and not `'dining'`. The empty zoned room above
  still derives zero for every capability, so ADR 0027's tripwire below is
  unaffected: what changed is that an action naming **no** capability now has no
  object-derived ceiling at all, which is `room.yard` and nothing else. A
  **third** amendment (#348) touches no decision at all: it corrects the
  *measurement* under decision 4, which said "every order advances every
  scheduled tick, so a hundred objects take the same wall-clock time as one".
  Construction now runs one order at a time, so a twelve-wall perimeter finishes
  at tick 730 rather than 70 while a single wall still finishes at 70. Decision
  4's own ruling — that a labour cap is #26's to make, and that furniture must
  not be the one buildable that waits — is untouched and is satisfied rather
  than contradicted, because the queue applies to every buildable alike.
- **FALSIFIED — ADR 0027's subject is reachable, and two prisoners already share
  one cell.** This entry read *"ADR 0027's subject is unreachable, so its effects
  are not observable"*, and it argued that *"the rating seam that was approved is
  live, and it is inert"*. **Measured against `83c3121` and it is not inert.**
  Four commands, all of them ones a player sends, through the real kernel and the
  real decoder: `PurchaseMaterials` for four planks, `ZoneRoom` for the 2×3
  rectangle at (4,6) that `room.cell`'s `minimum-size` requirement accepts
  (`src/content/room-catalog.ts:70`, unmoved), and `PlaceObject` twice —
  `definitionId: 'bed-wooden'` at (4,6) and at (5,6), the two 1×2 footprints that
  fit side by side inside it. Nothing refused (`refusals.count` 0), both orders
  completed, and the instance the registry then holds is

  > `residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities:
  > ['sleep-surface'], concurrentUseCapacityByCapability: [['sleep-surface', 2]]`

  Two `AdmitPrisoner` commands later, `getAccommodation` returns `room.cell:4:6`
  for **both** arrivals and `occupancyOf('room.cell:4:6')` is **2**. That is
  ADR 0027's subject — co-occupancy of one cell, and both placements went through
  the approved seam: `IntakeSystem` allocates through
  `RoomInstanceRegistry.findBestAvailable` and nothing else
  (`src/simulation/prisoners/intake-system.ts:409`, whose own comment at `:403`
  names #79 and the rating; this entry read `:348` and `:342`, and #458's
  discharge path moved both). It is happening in a session a player can start.

  **The four commands are now five, and the measurement as written no longer
  reproduces.** ADR 0045 landed in #447 and `zone` refuses an open perimeter:
  `room.cell` authors an `enclosed` requirement (`src/content/room-catalog.ts:69`),
  `not-enclosed` is the eighth refusal reason
  (`src/simulation/rooms/zoning.ts:217`), and the comment on the check says so in
  terms — *"An `enclosed` definition against an `open` rectangle is now
  `not-enclosed` and never reaches here"* (`src/simulation/rooms/zoning.ts:255-256`).
  The independent evidence is that
  `tests/integration/object-placement-loop.test.ts` — the case this entry leans
  on — had to be given three `wallRoomPerimeter(...)` calls in the same delta to
  keep passing. **The conclusion survives and the reproduction does not**: a
  player still reaches co-occupancy, because walls are a buildable and building
  them is something a player does, but the sequence recorded above now needs a
  walled perimeter before the `ZoneRoom`, and anyone re-running it verbatim will
  get a `not-enclosed` refusal and read it as the finding having evaporated.
  Recorded rather than re-measured: **the measurement is not re-taken here,
  because re-taking it is a code change to a test and this file changes no code.**
  What is checked is that every input to it still exists and that the one new
  refusal is the only thing between them.

  **The three things this entry got right, and why they did not add up to its
  conclusion.** `findBestAvailable` does return `undefined` for `room.cell` with
  and without the `sleep-surface` filter *in a prison whose cell is empty*; a
  zoned room with nothing in it does derive zero
  (`tests/unit/objects-room-capacity.test.ts`, *"is zero for a room with nothing
  in it"*); and the case at `tests/unit/prisoners-intake-system.test.ts:230` —
  cited as `:229` here, one line out at `bb3a01e` — does still
  pass. **That case was retitled by #371 and this entry's quotation of it is
  stale**: it read *"houses nobody at all through the shipped session path"* and
  now reads *"houses nobody through the shipped session path **while the cell is
  unfurnished**, because capacity comes from the objects standing in it"*. The
  narrowing is the right resolution and is better than the *"must not be
  re-baselined"* this entry demanded — every assertion still holds, and the title
  now says which world it is true of. What the entry did was generalise from that
  tripwire to the whole tree. It cannot carry that weight: it zones two rooms and places
  nothing, so it says nothing whatever about a prison with a bed in it, and
  `tests/integration/object-placement-loop.test.ts` — *"a player buys a plank,
  places a bed in a cell they zoned, and a prisoner lives in it"* — had been on
  `main` since phase 1 saying the opposite. **This entry was therefore already
  false when it was written**, not falsified by the eleven releases: across
  `cddaebb..main` every diff under `src/simulation/objects/` and
  `src/simulation/rooms/` is a comment correction and not one executable line
  moved, so the placement path behaved on 2026-08-26 exactly as it does now. It
  is the exact failure the anchor gate is a proxy for, found by re-reading rather
  than by any assertion, and it is why *"moving the anchor without re-reading
  anything passes it"* is written at the top of this file.

  **Somebody else found it first, one release after the anchor this entry was
  written against, and that is the strongest argument for the delta note above.**
  #371 — *"ADR 0028 shipped, and the tripwire written to announce it could not
  fire"* — landed at v0.0.89 and measured the same fact independently: seed 11,
  two `bed-wooden` in one zoned 3×3 `room.cell`, `residentCapacity: 2`, two
  `AdmitPrisoner` accepted with no refusal, `occupancyOf('room.cell:3:3')` **2**,
  `completedCount: 2`, `failedCount: 0`. Different seed, different rectangle,
  different anchor tile, same conclusion — which is a stronger result than either
  measurement alone, and is recorded here rather than replaced because two
  independent routes to a fact are worth keeping. But the re-read that produced
  the entry above was cut from `83c3121`, **one commit before #371 merged**, so it
  rediscovered at length a thing already on `main` and already written into the
  ADR. That cost is what the delta note exists to avoid.

  **ADR 0027 now carries it in its own body**, which is where it belongs and where
  a reader should go first: `docs/adr/0027-cell-sharing-assessment.md:14-32`,
  *"Update, 2026-08-26 — the subject is now reachable, and this ADR named the
  day"*, with the preconditions kept verbatim below it *"because every design
  argument below them was made under them"*. The index row moved with it — the
  `0027` row in `docs/adr/README.md` now reads *"its subject became reachable
  when 0028 shipped (measured 2026-08-26)"* where it read *"unreachable until
  0028 ships"*. (Cited as `:97` here; the row is at `:158` at `bb3a01e` **and
  still at `:158` at `c00b641`**, because the four rows the index gained in this
  window — 0053, 0054, 0056, 0057 — all sort below it. `:97` is now a sentence
  about queue entries — the index gained twelve ADR rows in the previous delta
  and four in this one, so a row number in that file is the least durable
  citation in the corpus after `docs/CLOUD_SAVE.md`'s, and this one surviving a
  window is luck rather than a property.)

  **And #371 adds one live gap this entry did not have.** `rateCellSharing` *"is
  deciding real allocations in a live session for the first time, and nothing
  exercises it through that path — every test of it still registers its instances
  by hand"* (`docs/adr/0027-…md:27-30`). That is sharper than this entry's own
  closing observation and it supersedes it: the point is not only that no session
  furnishes two cells, it is that the rating function is now load-bearing in
  production with **no** test reaching it through a command. ADR 0027 files it as
  a coverage question rather than resolving it, and it stays here as the thing to
  watch.

  **What is left of it, restated as what is true.** The retitled case is green
  and correct. ADR 0027's status qualifier is still the right shape — its three
  questions stay open and are now *load-bearing rather than hypothetical*, which
  is how the ADR's own Update puts it. What is worth watching is the coverage gap
  #371 names above, and, narrower, that nothing in a shipped session yet chooses
  **between** two eligible cells on the strength of a rating: every measurement
  here and in #371 lands in the only cell there is. The notice for that would be
  a session with two furnished cells and a prisoner sent to the emptier one.
  Nothing here is awaiting a decision, which is why it stays in §5.
- **PARTLY FALSIFIED — ADR 0026's question 2 is answered, and question 1 is
  reachable for the first time.** This entry read *"ADR 0026's three questions are
  open under an Accepted ADR, and the only thing holding them is a set of tests
  that assert the wrong answer on purpose"*, and it closed *"the release path is
  where all three questions become load-bearing on the same day"*. **The release
  path landed** — [ADR 0050](./0050-when-a-sentence-ends.md), merged as #458 —
  and it did not do all three at once.

  The tripwire half stands and was re-read on a file `git diff` reports as
  untouched: `tests/unit/entity-generation-wrap.test.ts`, five `DEFECT`-labelled
  cases at `:96`, `:163`, `:178`, `:190` and `:204`, the wrap-period pin at
  `:124`, and one case in `tests/unit/prisoners-intake-system.test.ts` (the
  re-intake comment, `:529` — this entry's companion in §6 cited `:494`). What is
  no longer true is *three*:

  - **Question 2 is answered**, as option C plus the accounting option C asked
    for. `EntityStore.destroy` now has a call site in `src/`
    (`src/simulation/prisoners/release.ts:156`) and prisoner indices are recycled
    in an ordinary session. ADR 0026 carries this itself, dated, in an amendment
    that deliberately contradicts rather than rewrites the paragraph it
    supersedes: *"Question 2 is answered, as option C plus the accounting option C
    asked for."*
  - **Question 1 is not answered and is now reachable**, which is the reverse of
    the situation the ADR was written in — the ADR's own words. Nothing was
    decided; what changed is the exposure.
  - **Question 3 is not answered and the release path creates no re-intake
    caller**, so the one case in `prisoners-intake-system.test.ts` is still the
    only thing holding it.

  Still not a status defect and still the entry to read before #31. **What this
  entry got wrong was the shape of the prediction, not the substance**: it
  expected one day on which three questions went live together, and what happened
  is one answered, one made reachable and one untouched — which is why the
  sentence is kept above rather than deleted.

  **The rest of this entry is FALSIFIED, and by the best possible thing: somebody
  measured the tripwire.** It said *"nothing else in the suite observes any of it:
  mutating the wrap period from `& 0xFFF` to `& 0xF` leaves the suite green except
  one case in `actor-identity.test.ts`"*. **#373 closed both halves of that**, and
  found the gap was worse than this entry described.

  - The wrap period **is now pinned in that file**, in its own case
    (`tests/unit/entity-generation-wrap.test.ts:124`, *"rejects a stale handle for
    every one of the 4,095 recycles before the wrap, and only wraps at 4,096"*).
    So the `& 0xF` mutation no longer leaves this file green, and the pin no
    longer rests on `actor-identity.test.ts` alone.
  - **Why that mattered more than coverage**, and this is the part worth keeping:
    `actor-identity.test.ts`'s pin *"is the one ADR 0026 names as the cost of
    option A"*, so the sole guard on the counter **was scheduled to be
    re-baselined by one of the options this file exists to gate** — the gate would
    have been dismantled by the decision it was guarding.
  - **And the generation check was not exercised at all.** Every
    `isAlive(stale) === false` was asserted between a `destroy` and the following
    `spawn`, with the slot on the free list, so `alive[index] !== 1` satisfied it
    and the generation comparison was never reached. Measured: removing the
    generation term from `isAlive` — #110's fix, the exact guard whose failure at
    the wrap is that file's subject — **left all 190 test files and 2,229 tests
    green**. The assertions now run with the slot occupied.

  ADR 0026 carries this itself, as an addendum that changes no decision
  (`docs/adr/0026-entity-id-lifetime.md`, *"Addendum, 2026-08-26 (#169): the
  tripwire's own coverage, measured"*). **No `src/` change**: none of options A,
  B or C was taken, so the three questions are exactly as open as before — what
  moved is that the tripwire now detects what it claims to.
- **ADR 0012 — a retained topology is now evicted; the streaming policy is what
  is left.** This entry read "`chunkTopologies` is never evicted", re-verified at
  `4ed571f` on the ground that no `delete` existed on that map. **#324 closed
  it**: `update()` drops the retained topology of every chunk the world no longer
  reports as loaded — `evictUnloadedTopologies()`, called from `update()` at
  `src/simulation/rooms/topology.ts:72`, whose `this.chunkTopologies.delete(key)`
  is still exactly at `:99` where this entry last cited it — so the walk sees only loaded
  chunks and an id is no longer a function of chunk *load* history either.
  `GlobalTopologyId` therefore meets ADR 0012's category 2 outright rather than
  only with respect to *recompute* history. What this section still carries is
  the ruling the ADR reserves and #324 deliberately did not take: whether an
  unloaded chunk should be *representable* in a topology at all, and if so from
  what persisted geometry. That is a decision, not a code gap — which is why it
  belongs here and the eviction no longer does.
- **ADR 0006 / ADR 0003 decision 4 — the handshake gates nothing.** `'ready'` is
  a member of the `WorkerState` union (`src/simulation/worker/state-machine.ts:33-39`,
  re-read at this anchor and still exactly that range)
  and no `transition()` call targets it; `grep -n "this.transition(" src/simulation/worker/state-machine.ts`
  is the enumeration and it returns exactly four, reaching `'faulted'`,
  `'paused'`, `'paused'`/`'running'` and `'shutting-down'` — `:664`, `:799`,
  `:834` and `:1110` at `bb3a01e`. **Those four anchors have now moved three
  times, and every previous set is wrong.** They first read `:566`, `:601`,
  `:825`; those were corrected to `:584`, `:619`, `:843` with `:455` declared
  unchanged; at `83d9616` all four were wrong again and read `:590`, `:725`,
  `:760`, `:984`; and #452's staffing warning and #455's payroll have moved every
  one of them again. The count and the four target states have held throughout
  four readings, which is the whole argument: **the grep above is what the next
  reader should run, and the numbers beside it are there to be checked, not
  trusted.** Nothing in `src/` sends a `protocol/handshake` at
  all — re-read at this anchor, all nine occurrences are the receiver
  (`state-machine.ts:681` and `:711`; this entry read `:472` and `:502`), the
  transferables switch, the kind list or the
  schema. **ADR 0003 now carries the same measurement independently**, at
  `docs/adr/0003-simulation-worker-protocol.md:535`: *"grepping `protocol/handshake`
  across `src/` still returns four hits in `types.ts`, two in `transferables.ts`
  and three in `state-machine.ts`, all receivers or declarations"* — nine, split
  exactly as counted here, arrived at by a different reader. Two independent
  routes to the same fact are worth keeping, as #371's were below. So ADR 0006's state 2 describes a state the machine cannot
  occupy and ADR 0003 decision 4's version negotiation runs for nobody. Version
  compatibility still fails closed, by a different route: the decoder's
  `protocolVersion: z.literal(...)` in `src/simulation/protocol/types.ts:168`. This is
  issue #118 item 1 and issue #274's A2, and both ADRs carry an implementation
  note for it — the two notes of that shape the corpus still holds, now that
  0024's has been deleted. The fix is in the code, and the open decision is
  whether to send the handshake or delete `'ready'` (issue #274, Q4).
- **FALSIFIED — ADR 0010's telemetry layer is wired, and the half of this entry
  that was a *code* claim is gone.** This entry was re-verified at `54418b6` and
  read: *"the telemetry layer is inert,
  nothing outside `src/services/telemetry/` imports it, by grepping the whole of
  `src/` for that path — every hit is inside the
  directory itself — so consent is never asked for and `record()` is never
  called. The prohibition half of the ADR holds; the sentence 'telemetry is fed
  from the main thread's orchestration layer' does not."*

  **Re-run at `bb3a01e`, the same grep is not clean and the conclusion inverts.**
  `grep -rn "services/telemetry" src/ --include=*.ts` outside the directory
  returns `src/main.ts:82-84` (`createTelemetryPipeline`, `createCrashReporter`,
  and a `CancelScheduledPump` type import) and
  `src/ui/telemetry-consent-prompt.ts:8`. `src/main.ts:154-195` builds the
  pipeline as the first thing after `GAME_VERSION` and registers `error` and
  `unhandledrejection` listeners that call `crashReporter.reportUnhandledError`;
  `src/main.ts:2506-2511` mounts the consent prompt (**this read `:2494-2499`;
  #468's save-import work moved it twelve lines and it is re-anchored to
  `c00b641` here, which is what a code citation is for**). So **the sentence this entry
  said did not hold is the one that now does** — telemetry is fed from the main
  thread's orchestration layer, off the tick and frame paths — and the sentence
  this entry asserted is the one that is false.

  **What is still true is narrower and rests on something else entirely, which is
  why this is a rewrite and not a strike.** No build of this repository sends
  anything, because the transport's destination comes from deployment
  configuration, nothing sets it, and with it absent the pipeline constructs
  *nothing* — so the consent prompt is not mounted either
  (`src/main.ts:180-183`, unmoved, and `:2506` — this read `:2494` — both gate on
  `telemetry.enabled`). That is
  [ADR 0044](./0044-what-happens-to-a-service-tier-nothing-calls.md)'s rule
  obeyed, not inertness: the old claim was *"nobody wired it"* and the new fact
  is *"it is wired and switched off by the absence of a destination"*. The two
  look the same from a `record()` count and are opposite in what they say about
  the decision.

  **ADR 0010 carries all of this in its own body and got there first**, dated, in
  both directions — *"That feed did not exist between 2026-08-24 and 2026-08-27,
  and what this paragraph used to say about the present is what
  [ADR 0046](./0046-shipping-the-telemetry-pipeline.md) proposes to replace"* —
  and it records that the consent surface landed alone before any producer
  existed, so the sentence about the first `record()` call *"had no referent until
  2026-08-27"*. Nothing here is awaiting a decision that is not already §2's:
  standing the ingest up needs the first server-side entry point, and ADR 0046 is
  `Proposed`. What this entry is for now is the record that a §§3-6 claim about
  an absence survived three anchors and died in one delta, in two files
  (`src/main.ts` and `src/services/telemetry/**`) that **this file's enumerated
  set did not list** until the same commit that wrote this paragraph.
- **ADR 0009 — "Accepted — implementation gated", and all four gates are unmet.**
  `verifyChallengeSubmission` and `isPubliclyRankable`
  (`src/services/challenges/verification.ts:136` and `:324`, both re-read at this
  anchor on a file `git diff` reports as untouched) exist; no replay
  runner implements the port, no endpoint exists, and nothing outside
  `src/services/` imports the layer. **This status is the most accurate in the corpus** — it says "gated", and
  the gates are genuinely shut. Listed as a model, not a defect.

  **Two corrections at `bb3a01e`, both to the same clause.** It said *"the single
  mention elsewhere (`src/main.ts:86`) is a comment naming the file, not an
  import"*. `src/main.ts:86` is now `import './styles.css';` — a real import, of
  nothing to do with challenges, so the anchor no longer supports the sentence it
  was given for. The comment moved to `src/main.ts:102`, where it reads
  *"`src/services/challenges/verification.ts`, against a challenge definition's
  …"*. (**Written here as `import type { CancelScheduledPump }` in the first
  draft of this correction and caught by re-deriving every anchor mechanically
  before commit** — that line is `:84`. Recorded because it is the same off-by-two
  the entry is about, committed while correcting it.) And **there are two mentions
  now, not one**: `src/persistence/save-schema.ts:1164` names
  `masterSeedSchema` *"from `services/challenges`"* in a comment explaining why it
  does **not** import it. Both are comments, so the finding holds; the word
  *"single"* is the part that rotted, which is the shape §4 of
  `docs/AGENT_WORKFLOW.md` says rots first.
- **The 900×600 budget had three figures in the corpus and now has two, because
  ADR 0025 withdrew the third.** This entry used to be headed *"ADR 0022's
  pre-correction 900×600 budget disagrees with `src/ui/hud/build-panel.ts`"*,
  which overstated it in one direction and understated it in another, so it was
  rewritten rather than re-verified; the heading then read *"three figures in the
  corpus, and only one of them is live"*, and the third was withdrawn at
  `bb3a01e`. Both wordings are kept because the second was the finding that got
  the third figure withdrawn.

  **Overstated:** there is no live disagreement between the ADR and the file.
  `src/ui/hud/build-panel.ts` has said *"7.8px is the entire budget"* since
  before `4ed571f`, and ADR 0022's table reads `| 900×600 | 12.2 | 7.8 |` with a
  `Now` column measured to 0.05px (7.81). Both name the same corrected figure.
  `11.8` survives in that file only as the reading it explicitly records as
  superseded, and ADR 0022 already devotes a bolded paragraph to the `11.8`/`12.2`
  split and to why it declines to resolve it — so the entry's closing claim that
  the disagreement *"has survived unnoticed"* was the one sentence here that was
  plainly false. It was noticed, in writing, in the document itself.

  **Understated, and CLOSED at `bb3a01e` — the ADR withdrew the figure.** This
  entry read: *"the third figure has no source. ADR 0025 says its inherited budget
  is 'the 3.9px at 900×600 that ADR 0022 and `hud.css` both record'. Re-verified
  at `54418b6` by grepping the whole tree: **`3.9` appears in no ADR but 0025 —
  `docs/adr/0025-guard-hiring-surface.md:70` and `:182` — in no `.css` file, and
  nowhere in `src/`.** … it is a docs-truth task inside an accepted ADR and it
  belongs in a change of its own."*

  **That change is #447**, and the ADR now says it in its own body rather than
  only here: *"The headroom figure this paragraph used to state, 3.9px, is
  withdrawn rather than replaced. It was attributed to ADR 0022 and
  `src/ui/hud/hud.css`, and neither records it: `3.9` appears in no other ADR, in
  no `.css` file and nowhere in `src/`."* It also states what the two sources do
  record at 900×600 — 7.81px — says why no replacement is put in its place
  (*"picking a replacement would be inventing a measurement rather than inheriting
  one"*), and offers a labelled guess at the number's origin: 11.8 − 7.81 = 3.99,
  *"a figure for the space that turned out **not** to exist"*. **Left verbatim was
  the right call and it is now discharged by the party entitled to make it**,
  which is the outcome this entry asked for.

  **Two corrections to the entry itself, both found by re-reading rather than by
  the delta.** Its anchors `:70` and `:182` no longer name the figure — the
  withdrawal is at `docs/adr/0025-guard-hiring-surface.md:74-76` — and it said
  *"there are five `.css` files under `src/ui/`"*. **There are four**, and
  `git ls-tree -r 54418b6 -- src/ui` returns four as well, so that count was wrong
  when it was written and not overtaken: `hud.css`, `tokens.css`,
  `primitives.css`, `brand.css`, with no `3.9` in any of them. The caveat about
  `grep '3\.9'` also hitting ADR 0022's *"÷ 12.2 is 23.9"* still holds and that
  line has moved from `:562` to `:582`. So the residue of this entry is one live
  fact — **the 900×600 budget now has two figures in the corpus, 7.81 live and
  11.8/12.2 recorded as superseded, and no third** — and one lesson, that the
  entry's own hand count of `.css` files was the least reliable thing in it.
- **ADR 0022 was written against v0.0.30, its structural citations had drifted,
  and at `bb3a01e` the ADR has corrected them itself.** This entry read *"its
  structural citations have drifted"* and left the body verbatim on the ground
  that a body is amended in its own commit. **#447 was that commit.** ADR 0022 now
  dates the historical claim instead of asserting it — *"That was true of `main`
  when this document was written, at v0.0.30: `HudIntent` declared seven members
  and none of them was a room"* — and adds *"Both halves of that sentence have
  since been overtaken, and the anchor it carried is now actively misleading"*,
  with the eighteen-member count, the three room-related members and the note
  that `hud.ts:153` *"now declares `HudRoomGesture`"*, so a reader following the
  old anchor lands on a type that is about nothing else. It says in terms that it
  is correcting this rather than leaving it *"as `STATUS-QUEUE.md` recorded
  them, because that entry said this belonged in a change of its own and this is
  that change"*. **That is the second entry in this section discharged by the
  document it was about, in the same pull request as the first**, and it is what
  §5 is for.

  What is left is the measurement, re-taken at this anchor. `HudIntent` declares
  **eighteen** members, counted as `grep -c "readonly kind: '"` between
  `export type HudIntent =` and the union's close — three of
  them room-related (`zone-room`, `unzone-room`, `arm-room-tool`);
  (**This entry said "sixteen" and gave the range as `:270-491`.** The count was
  wrong by two and the range short by 62 lines, and both were wrong **when
  written**: counting the same way at the previous anchor `8d29aa6` also gives
  eighteen, and the set has not changed since. That is worth recording where it
  happened, because this entry's entire subject is somebody else's drifted hand
  count and its stated moral is that a count in prose is the least durable
  citation this corpus has. It then made the same mistake in the sentence saying
  so — which is the argument for the rule §6 now closes with, and the reason the
  count above is stated with the boundary that lets a reader re-derive it rather
  than on its own.)

  **The union's own line numbers, since they are cited three times below.** At
  `bb3a01e` `export type HudIntent =` is at `src/ui/hud/hud.ts:271` and the union
  closes at `:541`; `HudUnavailableNotice` begins at `:555`. Every one of those is
  one greater than it was at `54418b6`, so the range this entry gave as
  `:270-553` is now `:271-554` and ADR 0022's own freshly-written `:270-540` is
  now `:271-541` — **a corrected anchor that drifted inside the same eleven
  releases that corrected it**, which is the sharpest available argument for
  recommendation 1 at the foot of §6 and is recorded here for that reason rather
  than to condemn the correction.
  **`AWAITING_PRODUCER` is now empty**, which is more than this entry's old
  claim that `ZoneRoom` is not in it: #312 gave `ZoneRoom` a producer and #367
  gave the last one, `CancelBuildOrder`, its own
  (`tests/foundation/unconsumed-command-contract.test.ts`, whose
  `AWAITING_PRODUCER` declaration at `:204` has a body that is nothing but a
  comment beginning *"**Empty, and that is a first.**"*, and whose gate comment at
  `:230` calls an empty list *"not a state to defend"* but *"the state this gate
  exists to bring about"*, and which fails in both directions); the `onIntent`
  switch in `src/main.ts` has moved; and its
  citation of *"`tests/unit/ui-hud-messages.test.ts:196-200` asserts it by
  scanning for the import"* now lands eight lines short — #339 removed the
  single-file, comment-blind copy of that check from
  `tests/unit/ui-hud-build-panel.test.ts`, and the surviving assertion, which
  covers every file under `src/ui/hud/**` and `src/ui/primitives/**` over
  comment-stripped source, is `it('imports nothing from the simulation', …)`,
  `:218-224` at `bb3a01e`. The ADR names the right test and
  the property it names is strictly stronger than it was; only the line range
  drifted.

  **This entry's own anchor into that gate was wrong before the delta opened, not
  by it.** It read `:173-203` for the `AWAITING_PRODUCER` declaration, and
  `git show 54418b6:tests/foundation/unconsumed-command-contract.test.ts` puts the
  declaration at `:204` and the quoted comment at `:230` on that tree too — the
  file is in the delta's *untouched* set, so no diff was ever going to raise it
  and only opening it did. That is the class the header calls a claim already
  false when the window opened, found here for the second consecutive anchor.
  `:204-210`, by contrast, was exact at `54418b6`, and fourteen lines of a new
  status-strip case moved it to `:218-224`.

  **This entry said "thirteen", then "fifteen", and neither was right for long.**
  It was fourteen at `ac03d8f`, the commit that wrote "thirteen"; `remove-object`
  (#328) made it fifteen; and `cancel-build-order` (#367) has now made it
  **sixteen** — so a sentence written to record somebody else's drifted count has
  itself been wrong at three successive readings. The two members the original
  hand count missed are `arm-build-tool` (`src/ui/hud/hud.ts:404-409`) and
  `arm-room-tool` (`:537-542`), the only two declared across several lines rather
  than on one, which is exactly the shape a hand count skips. The sixteenth,
  though, is on a single line (`:446`, `cancel-build-order`) and was missed for
  the ordinary reason: nobody recounted.

  **Make it four readings, and the fourth was a self-contradiction rather than a
  drift.** *"Sixteen"* stood in this paragraph while the paragraph above it in the
  same entry said **eighteen**: `ab33903` corrected the first count and did not
  sweep the second, and `cancel-material-purchase` and `release-guard` are the two
  members the difference is made of. **This entry disagreed with itself for eleven
  releases about a count whose entire subject is counts disagreeing.** No diff
  would have said so; reading the entry's own paragraphs against each other did,
  which is the check §4 of `docs/AGENT_WORKFLOW.md` names and the same one that
  caught this file's title twice. The two anchors above moved with it —
  `arm-build-tool` read `:403-408` and `arm-room-tool` `:486-491`, and
  `git show 54418b6:src/ui/hud/hud.ts` puts `arm-room-tool` at `:536` on **that**
  tree, so that one was fifty lines out before the delta opened rather than by
  it. Nothing in
  the ADR turns on the figure; what it demonstrates is that a count in prose is
  the least durable citation this corpus has, and it is the reason the entries
  around it cite symbols instead. None of it
  touches the decision, but a reader following a `file:line` out of that ADR
  should expect to land near rather than on.
- **ADR 0027's command-surface count has drifted the same way**, new as of this
  commit and worth recording because it is one clause inside a question that
  stays open. Its question 2 says the entire command surface is seven members and
  *"not one of them concerns a prisoner"*. **This entry answered "nine", and the
  correction has itself drifted twice** — which is the entry's own point turned
  back on it, and the reason the anchor above now has a test. Nine was right at
  `4ed571f`; `PlaceObject` (#320) made it ten before the v0.0.65 re-anchor, which
  did not re-count; `RemoveObject` (#328) has since made it eleven. Re-verified at
  `83c3121` and it is **still eleven** — the one count in this section that has
  held across the eleven releases to `dbe271f`, because #367 wired an existing
  member rather than adding one. **It no longer holds at that count.**
  `simulationCommandSchema`, declared
  `export const simulationCommandSchema = z.discriminatedUnion('type', [` in
  `src/simulation/protocol/commands.ts` (`:467`, unmoved at `bb3a01e`; this entry
  cited `:437` and then `:465`, and both were overtaken), still discriminates
  **thirteen**, matching the thirteen hits of
  `grep -c "type: z.literal" src/simulation/protocol/commands.ts`: #392
  added `CancelMaterialPurchase` and #394 added `ReleaseGuardAssignment`, both
  with producers in the same change, so `AWAITING_PRODUCER` stayed empty while
  the count moved. `AdmitPrisoner` (#306) still concerns a prisoner. **Re-counted
  at `bb3a01e` and still thirteen**, which is the only count in §5 to survive this
  delta unchanged: `commands.ts` was edited in it (#460's paused-clock work) and
  added no member. The thirteen are `PlaceBuildOrder`, `CancelBuildOrder`,
  `ZoneRoom`, `UnzoneRoom`, `PurchaseMaterials`, `CancelMaterialPurchase`,
  `AdmitPrisoner`, `HireStaff`, `PlaceObject`, `RemoveObject`,
  `ReleaseGuardAssignment`, `Undo` and `Redo` — enumerated rather than tallied,
  because this entry's whole subject is a tally that rotted. The
  load-bearing half of the argument is
  unaffected — there is still no player input to *placement*, and an override
  still needs a new command type, its codec case, a handler branch and a decision
  about whether intake blocks — so the body was left verbatim rather than
  rewritten by the commit that accepted it, exactly as 0022's drift was.

- **Two Accepted ADRs still say object placement does not exist**, which is the
  same drift as 0022's and 0027's structural citations and is recorded the same
  way. `docs/adr/0023-room-occupancy-authority.md` says step 1 of its resolver is
  *"unimplementable today … object placement does not exist
  (`docs/HUD_PROJECTIONS.md` gap 13), so until it does, the resolver's only
  reachable branches are 2 and 3"*, and
  `docs/adr/0027-cell-sharing-assessment.md` says a freshly zoned room is
  registered with `capacity: 0` *"because object placement does not exist"*. ADR
  0028 phase 1 falsified the premise in both. The document they both cite has
  already moved — gap 13 now opens *"Object placement exists, and `minQuantity`
  is still unchecked"* in `docs/HUD_PROJECTIONS.md`, which is how it should be
  cited: that number has been `:553`, then `:639`, and is `:754` at `bb3a01e`,
  three anchors and three readings of a sentence that has never changed a word,
  so the number is retired here and the quotation kept — so the two ADRs are the
  last places in the corpus asserting the old world, and a reader who follows
  either citation lands on a page contradicting the sentence that sent them. The
  two sentences are still there and were re-read here:
  `docs/adr/0023-room-occupancy-authority.md:204-205`, unmoved, and
  `docs/adr/0027-cell-sharing-assessment.md:81` — **which this entry cited as
  `:55`**, before #371 added that ADR's 2026-08-26 Update above it. The Update is
  now the first thing a reader of 0027 meets, so the contradiction is at least
  signposted inside the document rather than only here.

  **The second half of this entry is withdrawn as false.** It read: *"Neither
  conclusion moves, which is why the bodies are left verbatim: 0023's step 1 is
  now reachable but still resolves to zero for an empty room, so branches 2 and 3
  remain the ones a shipped session takes, and 0027's co-occupancy is still
  unreachable."* Both halves are refuted by the measurement in the ADR 0027 entry
  above. 0023's resolver orders its branches *"1. If any placed object in the room
  supplies occupancy, aggregate those objects' capabilities"*, then the authored
  nominal figure, then `0`
  (`docs/adr/0023-room-occupancy-authority.md:196-203`) — and a cell holding two
  beds resolves through **branch 1** to a `residentCapacity` of 2 in a session a
  player can start. Branch 3 is what an *empty* room takes; branch 2 is
  unreachable in either world, because no room definition authors a nominal
  figure — the eighteen definitions at `src/content/room-catalog.ts:68-165`
  declare `requirements` and nothing else, and the string `capacity` does not
  occur in that file at all (re-counted and re-grepped after #376 added an
  import-time cross-catalogue check to the head of that file, which moved every
  definition down by two lines and changed nothing else this entry rests on). And 0027's co-occupancy is reachable:
  two prisoners hold `room.cell:4:6`. So what is false in those two ADRs is the
  stated **cause** — object placement does exist — and their **conclusions have
  moved too**; the bodies are still left verbatim, but on the narrower ground
  that a body is amended in its own commit and by whoever takes the decision, not
  because the sentences after the false clause survived. The same phrase in
  `docs/research/` stays untouched for the reason that directory's README gives.

- **ANSWERED 2026-08-27 — two dated rulings were written into ADR 0008's Accepted
  body with no queue row, on the same day #380 argued that such a thing needs
  one.** The governance question this entry filed as the owner's is decided and
  the rule is `docs/adr/README.md`'s *"An amendment to an accepted ADR: what form
  it takes, and when it needs a queue row"*; **the two rulings' own substance is
  still the owner's and is now in §2 as this file's one live entry.** The entry
  below is kept as written, because it is the argument the ruling answers and
  because this file's practice is to quote what it corrects rather than overwrite
  it. What the ruling settled, in four lines:

  1. **No.** *"Applies"* and *"amends"* are not distinguishable by anything a
     reader can check — the test would be *"does the ADR as it stood already
     entail this?"*, a re-derivation from the old text, and an ADR exists to
     spare the next reader exactly that. So **no rule turns on the difference.**
  2. **The queue rule is therefore not widened to cover amendments as a class.**
     Counted on disk: seventeen post-hoc additions live in `docs/adr/`, and
     **exactly one of them ever had a row here** — 0007's second amendment.
     Widening the rule would have condemned sixteen on the day it landed, and
     this section already calls that rule *"unsatisfiable under concurrency"*.
  3. **What is required instead is form, and the corpus already keeps it**:
     fifteen `Amendment`/`Addendum` sections across nine ADRs, fourteen of them
     already dated in the heading. **Both figures were exact at `54418b6` — the
     same grep run against that tree still returns 15 across 9 — and both are
     now wrong: at `bb3a01e` it is 27 sections across 16 ADRs**
     (`grep -rc "^#\{2,4\} \(Amendment\|Addendum\)" docs/adr/*.md`), because
     #447 alone added amendments to ten ADRs. The ruling does not turn on the
     tally; the *"seventeen post-hoc additions"* and *"ten covered / seven not"*
     figures in item 2 and item 4 below rest on a hand count whose method this
     entry never states, so they cannot be re-derived here and are **not**
     re-asserted at this anchor. `docs/adr/README.md` ruling 3 still states them
     verbatim, which means the corpus now carries a stale seventeen in two
     places; correcting the README is not this file's edit to make and is handed
     over here. The two exceptions were ADR 0008's rulings,
     which had no section at all — the only unsectioned dated rulings in the
     directory — and ADR 0033's undated heading. ADR 0008's are corrected in the
     same commit as this entry, text untouched.
  4. **The trigger stays *outstanding*.** An amendment says in its own opening
     whether it was approved; one that says nothing reads as outstanding without
     anyone having to reconstruct who wrote it. Ten of the seventeen are covered
     that way today; the seven that are not are named in
     `docs/adr/README.md` ruling 3, and five of them are a backlog this decision
     does not condemn.

  **Also corrected: this entry's closing citation.** It said *"Two ADR numbers
  are unused — `docs/adr/README.md:102-106` records **0032** as next free and
  0030 as 'held by an unmerged branch'"*. That file now states **0038** as next
  free, and 0030 is still held. The point the clause was making survives —
  nothing here was blocked on a number — but the line-range citation did not, on a
  file this same entry is a claim about and which this same commit edits. That is
  the argument for citing by quoted phrase rather than by line, which is what the
  rest of §5 already does and what the entries above it were rewritten to do.

  **And the correction above was itself false on the day it was written, which is
  the third time this file has caught that inside its own text.** *"That file now
  states **0038** as next free"* was written at `bb3a01e`, and
  `git show bb3a01e:docs/adr/README.md` states **0053** — 0038 is what the
  *previous* anchor's tree said, carried forward without re-reading. At
  `c00b641` the line reads **0058**, and it now says in its own words that it is
  *"a ceiling over a gap rather than the next gap — read the table"*, because
  0055 and 0058 are held by parallel drafts and 0056 and 0057 were assigned
  ahead of their drafts. So the durable statement is not a number at all: **the
  next-free line is a ceiling, the table is the record, and this entry should
  never have restated either.** 0030 is still held, which is the one half of the
  original clause that has survived four anchors. The point the clause was
  making — that nothing here was blocked on a number — survives all of it.

  The entry as filed, unchanged:

  This is for the owner rather than a defect this file can settle, and it is here
  because nothing else would surface it. #382 added both to
  `docs/adr/0008-trusted-service-boundary.md` §2: *"**Generalised, 2026-08-26
  (issue #280 finding F14): a Data API role holds exactly the DML privileges its
  zone needs on a table, and nothing else**"*, which states *"the rule this
  settles for every future table"*; and *"**Authority over a row is not authority
  over the record of when it was written.** Decided 2026-08-26 for issue #194"*,
  which narrows §2's *"saves, settings — Z0/Z1 (client-authoritative)"* row by
  ruling a timestamp column out of "content". Both are written as decided. Neither
  carries an approval caveat, and **neither has a §2 row**.

  **The tension is with a rule that landed hours earlier, not with a rule this
  file invented.** #380 queued its ADR 0007 amendment on the argument §2 now
  states — that an amendment inside an Accepted ADR is invisible to
  `adr-numbering-contract.test.ts`, so *"this row is the only thing that says it
  exists"* — and it declined to self-approve, marking its heading *"(awaiting
  approval)"*. #382 took the other view for the same shape of edit. Its stated
  reason is that these are *applications* of ADR 0008 §2's existing zone taxonomy
  rather than new decisions: *"Recorded as a rule in ADR 0008 section 2 rather
  than only in a migration, because the question is asked again by every table
  that gets a timestamp."*

  **That reading may well be right**, and §2's rule triggers on an *outstanding*
  decision, so a ruling that is not outstanding needs no row by the letter of it.
  What is missing is the line between the two, because #380's argument does not
  draw one: both edits add prose to an Accepted ADR that changes what the ADR
  requires of future work. **The question for the owner is whether "applies an
  accepted decision" and "amends an accepted decision" are distinguishable by
  anything a reader can check**, and if not, whether the queue rule should cover
  both. Recorded, not decided; ADR 0008's `Status` is `Accepted` and no status is
  wrong either way. Numbers were free at the time — the index's **Next free
  number** line said so, and still records 0030 as *"held by an unmerged
  branch"* — so nothing here was blocked on a number. **This entry cited
  `docs/adr/README.md:102-106` and said that range "records **0032** as next
  free". Both halves are stale:** the index has since passed 0038, 0039 and 0040
  and now states 0041, and `:102-106` is prose about how a neighbouring
  paragraph is worded for a test, not the next-free line at all. Cited by name
  rather than by line and number, because this is the third correction of the
  same shape in this file.

Also not here as a decision: **ADR 0002**, whose configuration matches the ADR
exactly (`wrangler.jsonc:12` for `lockstate-staging`, `:20` for `lockstate`, both
re-read at `bb3a01e` on a file the delta did not touch) while
`docs/DEPLOYMENT.md`'s section **"What currently serves lockstate.io"** records
that `lockstate.io` is in fact served by `lockstate-staging` and that the Worker
`lockstate` is *"a Worker that has never been deployed"*. That is a live
operational trap. **This entry called it "a missing warning in the ADR body" and
that is false** — the warning is not missing.
`docs/adr/0002-cloudflare-static-assets.md:31-42` carries it in the ADR's own
body, under the heading *"Operational note, 2026-08-24: what is configured here
is not what is deployed"*: `:31` says *"Neither describes what is currently
serving traffic"*, `:33` quotes the deployment document, and `:42` states *"This
note records the discrepancy; it does not resolve it"* and assigns the open
decision to issue #274, Q9.

**Both of this entry's `docs/DEPLOYMENT.md` numbers are retired rather than
repaired, and ADR 0002 is the reason.** They read `:167` and `:172`. At `bb3a01e`
that section began at `:200` and at `c00b641` it begins at `:253`, which is the
retirement earning its keep for a second window: the section title is the
citation and it needed no repair when #474 pushed the whole document down 54
lines. `:167` is a blank line and **`:172` lands inside
"What can publish the staging Worker"** — a neighbouring section about which
credentials let CI publish staging, which says nothing about what holds the
domain. That is precisely the failure ADR 0002 spent a paragraph on in this same
delta, about its own former anchors into the same file: *"the three anchors did
not merely drift by a few lines — they landed on a neighbouring subject that
reads plausibly … **this is the one citation in this corpus where following the
wrong paragraph can cost the live domain**"*. A reader sent to `:172`, finding a
section about publishing staging and no trap warning, could conclude the trap had
been resolved and dispatch the `production` job. **So this entry made the same
mistake ADR 0002 was correcting, in the same file, while quoting the ADR that
corrects it** — and the fix is the one ADR 0002 took: the section title and the
quoted sentence, no number. The ADR's `:38` moved to `:42` in the same delta,
which is its own small argument. That note landed in #284, long before either of this file's last two
anchors, so the sentence was wrong when it was written and not overtaken —
another entry that a re-read catches and no gate can. What remains true is the
part that matters: it is not a wrong status, and the deployment document carries
the trap.

Also not here as a decision, and **new at this pass: ADR 0003 has no amendment
for the `zoning` sibling of `simulation/status-counts`.** The ADR gained an
amendment when `refusal` was added to that payload (*"Amendment, 2026-08-24:
`simulation/status-counts` also carries the last refusal"*), and a second
optional sibling was added by #312 with no matching amendment and no mention of
the word anywhere in the document. Two sentences in the body then described the
payload as the counts plus `tick`, `schemaVersion` and a refusal; both are
corrected in place at this pass, and both now point here. What is *not* an
editor's call is whether the ADR should carry a third amendment stating the
`zoning` shape and its compatibility argument the way the refusal one does, or
whether the corrected sentences are enough -- that is the owner's, and it is the
only thing this entry asks for. **It is not a wrong status and not a code gap:**
`zoningNoticeSchema` is declared, `.strict()`, optional, produced by the worker
and decoded on the main thread, with `tests/unit/ui-simulation-zoning.test.ts`
driving the notice through a real `simulation/status-counts` message; the
document is what is
behind the code, in the same way and for the same reason that
`src/simulation/protocol/transferables.ts`'s comment said "Eleven integers" for
two days after the twelfth landed (#444).

---

## 6. Stale status references: cleared, and now asserted

Flipping a status does not update every document that *reports* that status.
Each approval was scoped to the status lines and their index rows, so the
references this section used to list were deliberately left alone and recorded
here as known rather than missed. **They have since been corrected, in one
change of their own, and the class is now under a test.** What is left below is
the account of what moved, what could not move and why, and what the test can
and cannot see — because the residue is the part a future reader needs.

### The gate

`tests/foundation/adr-status-reference-contract.test.ts` reads every ADR's own
status statement and every sentence in `src/`, `tests/`, `docs/`, `README.md`
and `.github/` that predicates a status of an ADR, and fails when the two
disagree. It is the layer between the index check and this file:
`adr-numbering-contract.test.ts` compares a document to a table, this file
compares a decision to an implementation, and the new test compares a *sentence*
to a document.

Three properties it was built to have, stated here because a `toEqual([])`
gate that lacks them reads exactly like compliance:

- **Non-vacuous.** It asserts floors — more than 300 corpus files walked
  (`tests/foundation/adr-status-reference-contract.test.ts:427`) and more than 15
  status claims actually parsed and compared (`:431`; 33 on the tree that landed
  it), plus more than 20 ADRs found on disk (`:405`) — so a scanner that read
  nothing, or a claim pattern that stopped matching prose, fails instead of
  passing quietly. All three floors re-read at this commit. Its positive control
  runs the checker against text whose verdict is known, in both directions.
- **It bites.** Proved by reintroducing `"ADR 0017 is still Proposed"` into
  `src/ui/hud/messages.ts` and watching it fail with that file and that
  sentence named.
- **It does not fire on history.** Past tense is not matched, so *"while this
  ADR was `Proposed` it said…"* is left alone; an ADR's `Amendment` sections are
  skipped, which is what lets ADR 0022's *Status of this amendment* keep its
  `**Proposed.**`; and `docs/research/` is exempt for the reason that directory's
  README gives.

**What it cannot catch**, and this is the honest boundary rather than a
formality: a claim that names no ADR. `src/simulation/economy/income.ts` said *"a
ninth `Proposed` document in `docs/adr/`"* — false, and about the *count* rather
than about any one ADR, with no number in it for a subject. The same goes for a
`##` heading with no subject (ADR 0012's `## Decision (proposed)`) and for a
table cell whose ADR is cited only in the sentence introducing the table. All
three shapes existed in this corpus and all three were corrected by hand.

**A fourth blind spot, found since and not previously recorded here: it cannot
tell an assertion from a denial.** #356 hit it while accepting ADR 0029 — the
gate correctly caught two sentences still calling 0029 `Proposed`, and then
caught a third that was *true*, *"No row is `Proposed`."* It matches on the
status word rather than parsing the claim, so a sentence saying that **no** ADR
holds a status trips it exactly as a false one would. The wording was changed to
"every row is accepted", which is true and leaves the gate meaningful, and the
constraint is written down where it binds — `docs/adr/README.md`, the note
opening *"A note on how this paragraph is worded, because it matters to a
test"*, `:103-110` at `bb3a01e` — rather than left for the next person to
rediscover by failing the suite. (**This entry cited `:44-52`, which at
`bb3a01e` is a paragraph about prose tallies rotting beside a table** — a
plausible neighbour on the same subject, which is the worse kind of drift, so
the quotation is the citation from here on.) Teaching the scanner to read negation is the
alternative and is not obviously worth it. **It belongs in this list**, because
it is the same class as the three above: a claim the scanner's shape cannot
evaluate, which a reader has to hold instead.

The test exempts itself, because its header and its positive control quote false
claims on purpose — **and it exempts this file**, for the same reason and by
name (`tests/foundation/adr-status-reference-contract.test.ts:147-150`, alongside
`docs/research/`). Worth stating rather than leaving implicit: every quoted
sentence in §6 below is a false claim reproduced on purpose, so no gate is
reading them and nothing but a human re-reading this file keeps them honest.

### Corrected, with what each said and what is true

**Comments calling an Accepted ADR proposed.** Older than the thirteen flips and
never recorded before this round:

- `src/ui/hud/messages.ts` — *"ADR 0017 is still Proposed"*. 0017 has been
  Accepted since `a786b64`, with all three answers. Now says it is Accepted and
  names no currency either, which is what the label rests on.
- `src/ui/hud/projection.ts` — *"ADR 0017 is Proposed."* Same correction; the
  chip still prints minor units, for the same reason.
- `src/content/procurement-catalog.ts` — ADR 0017 answers #96's three questions
  *"**as recommendations pending approval**"*, and *"ADR 0017's recommendation on
  the buffer question"*, and *"When the owner takes ADR 0017's answers, this
  table is where a real economy starts"*. They are its decisions 6, 7 and 8 and
  they are accepted. The placeholder argument is unaffected and it needed the
  better reason it now carries: **decision 5** reserves prices to issue #29, so
  every figure here is provisional with nothing left to approve.
- `tests/unit/entity-generation-wrap.test.ts` — *"ADR 0026 states all three at
  Proposed"*. 0026 is Accepted as the framing and the tripwire, and leaves all
  three open, which is what the file needed to say. The tests are untouched.
- `tests/unit/prisoners-intake-system.test.ts` — *"it is stated at Proposed
  in ADR 0026 rather than settled here"*, on the re-intake case. Now names it as
  0026's question 3, left open by an Accepted ADR: *"it is ADR 0026's question 3
  — left open by that ADR, which is Accepted as the framing and not as an answer
  — rather than settled here"*, `:529` at `bb3a01e`. (Cited as `:465`, then
  `:494`, and now `:529`; #373 added a case pinning the determinism half of the
  same question and #458's discharge work moved it again. **Three anchors, three
  numbers, one unchanged sentence** — so the quotation above is the citation and
  the number is the aid.)
- `src/simulation/economy/income.ts` — *"a ninth `Proposed` document in
  `docs/adr/`"*. **This entry then said "there is exactly one, and it is 0029",
  which was falsified when 0029 was accepted on 2026-08-26 (#356); the
  replacement said the one `Proposed` document was ADR 0031, and that was
  falsified the same day at `e560656` (#389) when 0031 was accepted too. At the
  `54418b6` anchor no ADR in the directory was `Proposed`.**

  **FALSIFIED at `bb3a01e`, and by nine documents at once.** `docs/adr/` now holds
  nine `Proposed` ADRs — 0042, 0043, 0046, 0047, 0048, 0049, 0050, 0051 and 0052 —
  every one of them arrived in this delta. Derived by reading the first non-blank
  line under each document's `## Status` heading, which is what
  `adr-status-reference-contract.test.ts` reads. **So the same sentence has now
  rotted four times in this file: nine, then one (0029), then one (0031), then
  none, and now nine again** — and the fourth correction was written eleven
  releases before the count went back to where the original comment had it. That
  is the strongest case this file has for the rule below it: *a count of documents
  in a status is something the index already computes, so prose should not restate
  it*. This paragraph restates it once more only because saying "the count moved
  again" without the number would be useless, and the number is dated and derived
  rather than remembered. The live consequence is in §5's first bullet: nine
  outstanding decisions, no §2 rows.

  **FALSIFIED again at `c00b641`, in the same direction, eleven releases later:
  it is thirteen.** 0053, 0054, 0056 and 0057 joined the nine, derived the same
  way. **So the count has now been nine, one, one, none, nine and thirteen —
  six readings of one sentence in one file** — and the fifth and sixth were
  eleven releases apart. Each restatement was correct on the day it was made,
  which is precisely the argument: *a count of documents in a status is
  something the index already computes, so prose should not restate it*, and
  this bullet is now its own six-item proof. The live consequence in §5's first
  bullet has moved with it: thirteen outstanding decisions, **one** §2 row. The two line citations that
  came with it — `docs/adr/README.md:100` as "the single `Proposed` row" and
  `0031-build-queue-cancellation-surface.md:5` as its status line — are stale for
  the same reason and are dropped rather than re-pointed. **That is the same
  sentence rotting three times inside one file**, which is the argument for the
  rule §6 closes with: a count of documents in a status is something the index
  already computes, so prose should not restate it. Re-read at this commit: `income.ts` carries no count at
  all, which is why the correction itself did not go stale with the number — the
  argument for keeping the rate on issue #29 never depended on the count, so the
  count is gone from it, and that is the durable half. The stale sentence was
  this file's own parenthetical naming which ADR the count was, which is a
  reminder that §6 is a record and a record has to be re-read too. **The other half of this entry was already fixed before this change**: the
  *"ADR 0023 open, ADR 0028 proposed"* parenthesis is no longer in the file,
  which ADR 0028's phase 1 rewrote along with the measurement around it.
- `src/simulation/rooms/zoning.ts` — ADR 0012 *"is still `Proposed`"*, plus
  *"ADR 0012 has to be settled first"* in the move-or-resize clause. 0012 is
  Accepted, so what a future resize would force is its **taxonomy being applied
  to this id**, not the ADR being settled. The reasoning is unaffected: a
  room-instance id still needs neither category answer. (Re-read at `bb3a01e`:
  the corrected comment is at `:116-117` and the move-or-resize clause at `:125`;
  the second-pass list below cited `:106` and `:115`, and #447's enclosure
  refusal moved both. **ADR 0012's own Decision has since been corrected too**,
  by `e1d9f5e` in this delta, which stopped it denying the determinism fix its
  Status recorded — so the two halves of that ADR no longer contradict each
  other, which is what this bullet's sibling below reserved.)

**The single-ADR stale statuses this section used to list:**

- `docs/DEPLOYMENT.md`, the paragraph beginning *"The reasoning that put
  migrations in their own workflow"* — ADR 0016 *"is **Proposed, not
  accepted**"*. Now records it as Accepted, retroactively for the §1 mechanism,
  and says what the acceptance makes binding: §2, with nothing enforcing it
  mechanically. That is §4 of this file, and the deployment document is where a
  reader meets it. (Cited as `:163`, corrected to `:164`, `:168` at `bb3a01e`,
  and **`:221` at `c00b641`** after #474 pushed the document down 54 lines.
  **Fourth anchor, fourth number, and the sentence has still not changed a
  word** — so it is cited by its opening words, which is recommendation 1 at
  the foot of this section applied to the citation that has cost the most, and
  which is why this anchor required no correction here at all: the number above
  is a record of four readings, not the citation.)
- `docs/adr/0016-migration-delivery-mechanism.md:173` — quoted that sentence
  verbatim, so the two moved together, as this section said they would have to.
- `docs/adr/0012-derived-identifier-reproducibility.md` — the self-contradiction,
  and the most visible entry this section ever held. `## Decision (proposed)`,
  *"which is why this ADR is proposed rather than applied"* and Consequences
  clause (a) *"The status above stays Proposed"* all sat under a status line
  reading `Accepted`. Clause (a) now records that the category-2 reading **was**
  taken; clause (b) — `chunkTopologies` is never evicted — was true when this
  entry was written and #324 has since falsified it, so the clause now records
  the eviction as closed and reserves only the world-streaming ruling. A fourth
  sentence went with them, not previously
  listed: the path-request-id clause said its question was *"left open for
  whoever accepts this ADR"*, and the acceptance did not take it either.
- `docs/adr/0013-free-tier-cloud-save-capacity.md:15` and `:151` — the Status
  table row and the §4 heading both marked 4 MiB `PROPOSED`; `:19-21` asked a
  reviewer for *three* numbers. (The heading citation read `:150` here and `:150`
  is a blank line; the heading is `### 4. Per-save payload bound — **ACCEPTED:
  4 MiB (4,194,304 bytes)**`.) §4 is Accepted, the heading and the row say so,
  and the ask is now two — 20 revisions (§6) and 256 MiB (§5). One more in the
  same document, not previously listed: §4's headroom bullet asked that *"the
  approval asked for in the Status table above should be given or withheld
  against these figures"*, which is a request that has been answered; it now
  says these are the figures §4's bound stands on.
- `docs/adr/0015-actor-identity-allocation.md:153-156` — *"Accepting 0015
  without 0012 leaves the taxonomy it argues in still Proposed"*, describing a
  case that cannot arise. Both were accepted in the same commit, so item 1 of
  *What this asks a human to accept* is discharged and says so: *"**Both were
  accepted in the same commit**, so the taxonomy this ADR argues in is settled
  and the case this item guarded against — 0015 accepted while 0012 was not —
  cannot arise."* (This entry cited `:145-146`,
  which is now a passage about the name pool; the discharge is eight lines
  further down.)
- `README.md:59` — ADR-0014's *"`Status` is `Proposed` … the decision has not
  been approved"*. Now Accepted, and the pipeline the repository implements is
  the approved one rather than a proposal it happens to match.
- `docs/CLOUD_SAVE.md` (*"the ADR is `Proposed`, not…"*) and its capacity table's
  4 MiB row. The prose states the split — *"partly accepted and partly still
  proposed -- **that ADR is `Accepted` for its §§1-4 and its §§5-6 remain
  `Proposed`**"* — and the row reads *"**Accepted** as ADR 0013 §4. Implemented,
  in one function."* **The two rows below it were true and stayed true** —
  *"20 retained revisions per prison | ADR 0013 §6, **still Proposed. Not
  implemented** — needs a pruner"* and *"256 MiB of payload per account | ADR 0013
  §5, **still Proposed. Not implemented**"* — and they gained their ADR section
  numbers so that a reader (and the gate) can tell a §-scoped
  `Proposed` from a claim about the whole document. Two further mentions,
  *"unbounded within a bounded slot (ADR 0013 §5–§6)"* and *"see ADR 0013
  §5–§7"*, were already §-scoped and are untouched.

  **All five numbers have now drifted twice, in two consecutive anchors, and
  nothing else in this file has done that.** They read `:1184`, `:1200`,
  `:1201-1202`, `:1239`, `:1250` at `cddaebb`; were corrected to `:1268-1269`,
  `:1285`, `:1286-1287`, `:1324`, `:1336` at `83c3121` after that file gained 85
  lines (#350, #353); and are corrected again here after it gained **361 more**
  (#368 and #382's cloud-save work). The sentences have never changed. **The
  numbers are the wrong citation for this document** — it is the fastest-growing
  file in the dependency set, and the next re-read should expect to correct these
  five again unless somebody re-cites them by heading or quoted phrase, which is
  the remedy this file keeps recommending elsewhere and has not applied here.
- `docs/TRUSTED_SERVICES.md` — *"the 4 MiB per-save figure is proposed,
  not accepted"*, and *"ADR 0013 is in `Proposed` status"*. Both corrected — the
  bullet now reads *"**The 4 MiB per-save figure is accepted** — ADR 0013 §4"*
  (`:604` at `bb3a01e`) — and the two numbers that genuinely remain open are
  named as §§5-6 (`:607`) and the churn lever as §7 (`:610`). This entry cited
  `:577`, which was a bullet about `public.create_prison()`, and the citation was
  wrong when it was written rather than overtaken; it then read `:592-598`, which
  was exact at `54418b6` and is twelve lines short at `bb3a01e`.
- `.github/workflows/migrate-database.yml:20` — *"(ADR 0016 §2, Proposed)"*.
  Now `Accepted`, and the comment says the constraint is binding with nothing
  enforcing it mechanically, which is the sentence that made the flip worth
  landing here at all.

**Which of the citations above survived, since a list of corrections is only
worth reading if it says which parts of itself were checked.** Two passes are
recorded, because they were checked differently and a reader should know which.

**At `83c3121`, a full re-read of every sentence in this subsection.** Nine
citations had moved and were corrected then: 0013's §4 heading, 0015's discharge,
five in `docs/CLOUD_SAVE.md`, one in `docs/TRUSTED_SERVICES.md`, and one factual
claim — which `Proposed` ADR the `income.ts` count referred to.

**At `dbe271f`, the delta only**, by the method the header describes: intersect
`git diff --name-only 83c3121..dbe271f` with the dependency set, then read the
intersection. Of the files this subsection cites, **three changed** —
`docs/CLOUD_SAVE.md`, `tests/unit/prisoners-intake-system.test.ts` and
`tests/unit/entity-generation-wrap.test.ts` — and two of them moved a citation,
both corrected above. The other seven code and test comments are in files
`git diff` reports as untouched, so they hold as corrected without re-reading:
`messages.ts:28`, `projection.ts:211`, `procurement-catalog.ts:13` and `:23`,
`entity-generation-wrap.test.ts:37` (verified anyway, since the file changed),
`income.ts` and `zoning.ts:106`/`:115`. Six `file:line` citations are in
untouched files and still land where they say: `docs/DEPLOYMENT.md:163`,
`docs/adr/0016-migration-delivery-mechanism.md:173`,
`docs/adr/0013-free-tier-cloud-save-capacity.md:15` and `:19-21`, `README.md:59`,
and `.github/workflows/migrate-database.yml:20`. **`docs/TRUSTED_SERVICES.md`
gained six lines and its `:592-598` citation was re-read rather than assumed —
it still lands**, which is the one case where "the file changed" and "the
citation moved" came apart.

**At `54418b6` two of those six are no longer in untouched files, and they came
apart in opposite directions** — which is worth recording because the sentence
above rests each of the six on the file having not changed, not on anyone having
looked. #423 edited both. `docs/DEPLOYMENT.md:163` **moved to `:164`**: it now
lands on the blank line above the paragraph it names. `.github/workflows/migrate-database.yml:20`
**still lands**, re-read rather than assumed, as `docs/TRUSTED_SERVICES.md` was.
The other four — `0016:173`, `0013:15` and `:19-21`, `README.md:59` — are still
in files `git diff 8d29aa6..HEAD` reports as untouched, and were spot-checked
anyway: all four land.

That is the whole cost of the second pass, and the ratio across both is the
argument for the practice this file keeps recommending and keeps failing to
follow: **a `file:line` into a document under active edit is the least durable
citation here, and a quoted sentence is the most.** Across both passes this
subsection needed fifteen corrections — eight line citations at `83c3121`, six
more at `dbe271f`, and exactly **one** correction of substance, the ADR the
`income.ts` count referred to. **Fourteen of fifteen were numbers**, and not one
of the sentences those numbers point at has changed.

**The third pass, at `54418b6`, made it twenty-three across three: twenty-one
line citations and two corrections of substance.** Seven numbers moved here — the
command union's, three of the four `transition()` sites, and three in
`docs/DEPLOYMENT.md` — and again not one of the sentences behind them had
changed. The count is still thirteen, the transitions are still four, `'ready'`
is still unreachable.

**The fourth pass, at `bb3a01e`, stopped counting and started rewriting, so the
running total above is discontinued rather than extended.** A retired citation is
not a corrected one and the two cannot be added together, so a fourth number in
that series would compare unlike things — which is the same defect the series was
recording. What this pass did instead, stated so it can be checked:

- **Every rooted `file:line` in §§3-6 was re-derived mechanically before this
  commit was written** — extract each backticked `path:N` span, open the file,
  print the line. That is the whole check, it takes seconds, and **it caught
  three errors this pass had just introduced**: `src/main.ts:86` written as an
  import it is not, `docs/adr/README.md:44-52` for a constraint that has moved to
  `:103-110`, and `docs/adr/README.md:97` for an index row now at `:158`. A
  correction is exactly as liable to be wrong as the claim it corrects, and this
  is the third consecutive pass to prove it inside its own text.
- **Fourteen prose citations were retired rather than renumbered**, replaced by a
  section title and a quoted sentence: three into `docs/DEPLOYMENT.md` (the
  71-second window, #87, and the ADR 0016 paragraph, which has now been `:163`,
  `:164` and `:168` across three anchors without a word changing), the two in
  §5's ADR 0002 entry, five in `docs/CLOUD_SAVE.md`, the
  `docs/TRUSTED_SERVICES.md` range, `docs/HUD_PROJECTIONS.md`'s gap 13 (`:553`,
  `:639`, `:754` — three anchors, one sentence) and the two
  `docs/adr/README.md` anchors above.
- **Every code anchor was re-numbered against `bb3a01e`**, because grep checks a
  code anchor and `src/` moves for reasons that change meaning: four
  `transition()` sites, two handshake receivers, six in `zoning.ts` across §5 and
  §6, two in `intake-system.ts`, two in `prisoners-intake-system.test.ts`, four
  in `hud.ts`, one in `main.ts`, two in `unconsumed-command-contract.test.ts`,
  and `ui-hud-messages.test.ts:218-224`. Enumerated rather than totalled, for the
  reason this whole subsection exists.
- **Two of them were wrong at `54418b6`, before this delta opened**: the
  `AWAITING_PRODUCER` declaration (`:173-203` for a thing at `:204`) and
  `arm-room-tool` (`:486-491` for a thing at `:536`). Both are in files
  `git diff 54418b6..bb3a01e` reports as **untouched**, so the delta method could
  not have raised either. Only opening them did, and that is the argument for
  spot-reading the untouched half rather than resting on the diff — which the
  third pass had already learned once and which this makes twice.
- **Three claims of substance were withdrawn and four were discharged
  elsewhere**, all named in §§3-5 with what they used to say. The withdrawals are
  §5's *"the telemetry layer is inert"*, §6's *"no ADR in the directory is
  `Proposed`"* and §5's *"exactly one file and for exactly one reason"* about
  object ids. The discharges are ADR 0025's 3.9px withdrawal, ADR 0022's own
  count-and-anchor correction, ADR 0026's question 2, and ADR 0012's Decision no
  longer denying its Status — **four entries closed by the documents they were
  about, all inside one pull request**, which is what §5 is supposed to produce
  and had not before.

**The fifth pass, at `c00b641`, is the first at which the rewrite paid and the
numbers were not the damage.** Stated so it can be checked:

- **Every rooted `file:line` in §§3-6 was re-derived mechanically again** — the
  same extract-open-print check — and **exactly three moved**:
  `docs/DEPLOYMENT.md`'s six-row deployment table (`:145-152` → `:198-205`) and
  two anchors into `src/main.ts` (`:2494-2499` → `:2506-2511`, `:2494` →
  `:2506`). Everything else lands. That includes the four `transition()` sites
  in `state-machine.ts`, which had moved at *each* of the three previous
  anchors and are still `:664`, `:799`, `:834` and `:1110`; the two handshake
  receivers at `:681` and `:711`; `commands.ts:467`; `hud.ts:271`, `:404-409`,
  `:446`, `:537-542`, `:541` and `:555`; `zoning.ts:116-117`, `:125`, `:217`,
  `:255-256`, `:398`, `:556`, `:560-562` and `:567`; `intake-system.ts:403` and
  `:409`; `topology.ts:72` and `:99`; `release.ts:156`; `types.ts:168`;
  `session-controller.ts:9`; `save-schema.ts:1164`; `main.ts:82-84`, `:86`,
  `:102`, `:154-195` and `:180-183`;
  `prisoners-intake-system.test.ts:230` and `:529`;
  `entity-generation-wrap.test.ts:96`, `:124`, `:163`, `:178`, `:190` and
  `:204`; `unconsumed-command-contract.test.ts:204` and `:230`;
  `ui-hud-messages.test.ts:218-224`; `environment-art.test.ts:248` and `:256`;
  `adr-status-reference-contract.test.ts:147-150`, `:405`, `:427` and `:431`;
  `docs/adr/README.md:103-110` and `:158`; `docs/TRUSTED_SERVICES.md:604`,
  `:607` and `:610`; `docs/adr/0013-…md:15`, `:19-21` and `:151`;
  `docs/adr/0015-…md:153-156`; `docs/adr/0023-…md:196-203` and `:204-205`;
  `docs/adr/0025-…md:74-76`; `docs/adr/0027-…md:14-32` and `:81`;
  `docs/adr/0002-…md:31-42`; `README.md:59`; `wrangler.jsonc:12` and `:20`;
  `.github/workflows/migrate-database.yml:20`, `:34`, `:41` and `:65`; and the
  six anchors into `20260823100000_bound_free_tier_capacity.sql`.
- **Every count in §§3-6 was re-derived and two of them moved.** Unmoved:
  `simulationCommandSchema` still discriminates **thirteen**, `HudIntent` still
  declares **eighteen**, `protocol/handshake` still returns **nine** hits split
  4/2/3, the `.css` files under `src/ui/` are still **four**, the object ids
  outside `src/content/` are still **39** in **two** files (19 and 20), the
  `Amendment`/`Addendum` sections are still **27 across 16 ADRs**, and
  `supabase/migrations/` still holds **twenty-three**. Moved: the `Proposed`
  documents, nine to **thirteen**, and §2's entries, three to **four** in one of
  the two places that state it.
- **What the pass actually found was three self-contradictions and a stale set,
  not drift.** §5's preamble disagreed with §2's own heading about how many
  entries §2 holds; §5's *"That file now states 0038 as next free"* was false on
  the tree it was written against; and the dependency list called
  `services/telemetry/**` thirteen modules when it has been fifteen throughout.
  **None of the three is reachable by any diff**, and two of them are the
  header's *"already false when the window opened"* class, found for the third
  consecutive anchor. The one that is a genuine window falsification — §5's
  preamble — is also the one the header's four-place sweep exists to catch, and
  it was caught by that sweep and by nothing else.
- **Nothing was withdrawn as false in the way the previous four passes
  withdrew.** One clause was: §5's *"not one of them has a §2 row"*, and it went
  the other way — a rule this file records as abandoned was obeyed once, by
  #467.

**The two paragraphs above about the second and third passes are left as they
were, and two of their numbers no longer land.** `docs/DEPLOYMENT.md:163` is a
blank line at `bb3a01e` and `:164` is the row above the ADR 0016 paragraph. **At
`c00b641` both land somewhere else again** — `:163` is still blank and `:164` is
now a sentence about an ordering correction — which changes nothing: they are
records of what a past pass checked on a past tree, not live citations, and
rewriting them would destroy the record — the same exemption `§6`'s gate grants
past-tense status claims.

**So the diagnosis has been made five times and acted on once, and the once is
the fourth pass.** The evidence that it worked is in the fifth: three of the
four citations into `docs/DEPLOYMENT.md` — the fastest-moving document in the
set, which gained 54 more lines in this window — needed no repair, because they
are quotations. The one that broke is the one a quotation cannot express. The proposal below is what was acted on; it is left standing
because only its first item is done, and items 2 and 3 are still the owner's:

1. **Stop citing a bare `file:line` into a document under active edit.** Every
   correction in this subsection across three passes has been a number pointing
   at an unchanged sentence. A citation of the form *"`docs/DEPLOYMENT.md`, the
   paragraph beginning 'The reasoning that put migrations'"* survives every edit
   that does not change the sentence, which is all of them so far. Code citations
   are different and should stay `file:line`: they are checked by grep, not read
   by eye, and `src/` moves for reasons that do change meaning.
2. **This one is assertable, unlike the rest of this file.** A test can extract
   each quoted sentence from this document and require it to appear verbatim in
   the file named. That catches the drift that actually happens — a quote going
   stale — and it cannot be satisfied by moving a number without reading
   anything, which is the honest boundary
   `tests/foundation/adr-status-queue-anchor-contract.test.ts` names about
   itself.
3. **The cost is a one-off rewrite of the citations in §§3-6** and a rule that
   new entries quote rather than count lines. The benefit is that the delta pass
   this header describes stops spending most of its budget on numbers.

The separate structural change this file has also diagnosed and not made — one
file per entry in a directory, so two commits can add two entries without
touching each other — is a different problem (contention on a single 90 KB file)
with a different fix, and is not addressed by the above.

### Cannot be edited at all

- `supabase/migrations/20260823100000_bound_free_tier_capacity.sql` —
  *"PROPOSED, PENDING HUMAN APPROVAL (ADR 0013)"* above the 4 MiB function that
  is now Accepted as §4, and the same framing twice more in the file's header
  (`:19`, `:25`). **Re-verified at this commit: all three are still there and
  were not touched.** Applied migrations are immutable, so this can only be
  corrected by a **new** migration superseding the function, or left as a
  historical artefact. Leaving it is the recommendation — it is a comment, not
  behaviour. The gate does not scan `supabase/`, deliberately: it could only
  ever report something nobody is allowed to fix.

### Deliberately left, and to stay left

- `docs/research/2026-08-25-economy-rate.md:443` and `:630` — call ADR 0023
  *"Proposed, not accepted"* and *"(Proposed …)"*. These are **dated research
  records** and the repository treats them as records: they were true on
  2026-08-25 when the memo was written, the memo says what it was measuring and
  when, and **editing a research record to match a later decision would make it
  stop being one.** `docs/research/README.md` states the rule. Both stay, and
  the gate exempts that directory for exactly this reason rather than by
  oversight.

ADR 0017 is the precedent for how the editable ones were cleared: when it was
accepted its body was rewritten to say what it had said *while* it was
`Proposed`, rather than leaving present-tense drafting language in place. 0022's
`## Status` section uses the narrower half of the same move, pointing forward at
the amendment it was accepted *as* instead of rewriting the passage that records
it.

---

## How to act on a future entry, mechanically

Each flip is **two lines, in one commit**, and the suite enforces the pairing:

1. the `Status` line in the ADR itself, and
2. that ADR's row in the `docs/adr/README.md` table.

`tests/foundation/adr-numbering-contract.test.ts` (*"reports each ADR with the
status that ADR itself holds"*) fails if you move one and not the other, so a
half-done flip cannot merge. **A third file now fails too, and it is the one
that will bite:** `tests/foundation/adr-status-reference-contract.test.ts` reads
every sentence in `src/`, `tests/`, `docs/`, `README.md` and `.github/` that
predicates a status of an ADR, so a flip whose *reporting* sentences are left
behind cannot merge either. §6 records what it sees and what it does not. The parser reads the **first keyword** of each side
— `Accepted`, `Proposed`, `Superseded`, `Deprecated` — and requires the two to
agree, which is why 0013's split status opens with `Accepted` on both sides and
qualifies only afterwards, and why 0022's, 0023's, 0026's and 0027's qualified
statuses all open with `Accepted` before saying what they are qualified by. It
reads the first non-blank line under the `## Status` **section heading** only, so
a `###` subsection cannot be mistaken for the document's status — which is what
lets 0022's *Status of this amendment* keep its historical `**Proposed.**` while
the document is Accepted.

Three things that are *not* mechanical, and all three were needed by the thirteen
flips above.

**A status section is not only a keyword.** 0022's said "nothing in `src/`
implements it yet", 0024's named a reversal that would leave ADR 0006 unamended,
0025's said "it is not accepted until they say so", and 0026's and 0027's asked a
reviewer to settle questions the approval does not settle. Each had to move with
the keyword or the file would have contradicted itself in its first paragraph.

**An ADR kept alive rather than superseded must be true.** 0023 was accepted
precisely so its fallback stays available, which is why the false framing around
that fallback could not be left standing.

**Accepting an ADR can oblige an edit elsewhere, and only the ADR knows.** 0024
named the implementation note in ADR 0006 that had to be deleted with it, and
that note was the only one of its kind in the corpus — the six retroactive
approvals and the three room flips dragged nothing. Nothing mechanical would have
found it: the obligation was written in prose, in the document being accepted,
which is the argument for reading an ADR's Follow-up section before flipping its
status rather than after.
