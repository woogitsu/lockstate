# What the owner still has to decide, and where an accepted decision contradicts the code

This file is for the repository owner and nobody else. It exists because
`docs/adr/README.md` reports statuses and `tests/foundation/adr-numbering-contract.test.ts`
keeps that report honest, but **neither can tell you whether a status is true
about `main`** — the index compares a document to a table, not a decision to an
implementation.

**Nothing here changes a status.** A status moves in the ADR and in the index,
never in this file. What changed with this revision is what the file is *for*:
§1 records **all thirteen** flips, §2 holds **nine entries — the two dated rulings
#382 wrote into ADR 0008 §2, the 2026-08-27 amendment scoping that ADR's §3
by authority, the preconditions on the change that gives this project its
first server-side entry point, ADR 0056's price for keeping a player's
orders in the order they gave them (2026-08-28, and the first row filed by the
change that wrote it since the rule was restated), ADR 0059's price for
making an actor walk (2026-08-28, #485, the second such row), ADR 0074's
price for reading a restored room's rectangle off the zoning plane it already
carries (2026-08-29, #571, the third), ADR 0071's open-area amendment
(2026-08-29, #585, the fourth — and the second consecutive row filed by a
commit whose only job was the filing), and ADR 0077's price for asking whether
the edge in front of an actor is still standing (2026-08-29, #581, filed by
#615 — the fifth, the third consecutive row filed by a commit whose only job
was the filing, and **the first filed as a debt rather than on time**: #581
landed the ADR with no row at all, which is what #615 was opened to
record), and ADR 0093's **two** remaining player-facing sentences for the
errand it built
(2026-09-03, the sixth — and **the first row ever filed for a document that is
already `Accepted` and already implemented**: what waits is the copy, not a
signature, which is a shape this section had not held before; **that count
read "three player-facing sentences" until the owner ruled the action's label
later the same day, and the word is corrected rather than overwritten because
the direction is the finding — this is the first entry in this section ever to
*shrink* without being deleted, so the entry count stays at nine while what
the entry is waiting for gets smaller**)** — **this clause
read "eight entries" until ADR 0093's entry was filed, "seven entries" until
#615's,
"six entries" until #585's, "five entries"
until #571's, and "four entries" until `07add3e`**. **The number above says
nine from the `3f8c00b0` anchor, and it is corrected there rather than by the
commit that earned the correction**: #863 filed ADR 0093's entry, moved
§2's own heading and §5's preamble, wrote the *"read 'eight entries' until ADR
0093's entry was filed"* clause immediately above — and left the number at
eight, so this paragraph contradicted its own correction inside one sentence
until it was read against §2's heading. And the sentence saying four is corrected
rather than overwritten because the split is the finding: #485 filed ADR 0059's
entry, moved §2's own heading with it and moved neither this paragraph nor §5's
preamble, which is the third consecutive time the four places below have split
on exactly the line the paragraph naming them predicts — above the account of why the queue had been
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
than only tallied. **Thirteen is seventeen at `07add3e`**, nine releases later
again: 0059, 0061, 0062 and 0063 arrived, and **two of the seventeen — 0056 and
0059 — have §2 rows**, so the ratio moved with the count and in the same
direction. **Seventeen is twenty-one at `01974e5`**, eleven releases later
again: 0064, 0065, 0066 and 0067 arrived — the needs-grant, save-quarantine,
navigation-tick-budget and assault-sanction ADRs, all four `Proposed, not
self-approved`, none of the four with a §2 row — so the ratio moved to **two
of twenty-one** and, for the first time since it began being tracked, the
count moved without the ratio moving with it: four more outstanding decisions
arrived and the fraction with a row got strictly smaller rather than holding
steady. Counted on disk at the previous anchor by reading the first non-blank
line under each `## Status` heading, which is what
`adr-status-reference-contract.test.ts` reads; the index agreed, twenty-one rows
opening `Proposed`. **Twenty-one is twenty-two at this anchor**, seven
releases later: 0068 (the client-side room-enclosure classification ADR, #498)
arrived, `Proposed, not self-approved` like the four before it, with no §2 row
— so the ratio moves to **two of twenty-two**, the fifth consecutive outstanding
ADR in a row to skip §2 and the sixth overall since the rule was restated
(0064, 0065, 0066, 0067 and now 0068), against two that did (0056, 0059). The
count moved without the ratio moving, for the second time running: this file's
own prediction, at the previous anchor, that the abandonment was "continuing at
a higher rate than ever" held rather than reversing. Re-counted on disk at this
anchor the same way, and the index agrees again: twenty-two rows opening
`Proposed`. A count that has been zero, nine, thirteen, seventeen, twenty-one
and twenty-two across forty-nine releases is the argument against writing it
here at all, and it is written only because each restatement is dated and
derived. **Twenty-two is twenty-two at this anchor**, seven releases later
again — the first reading in this sequence at which the number does not
move at all, because no commit in the window added an ADR: the six merged
pull requests (#511, #512, #513, #515, #518, #519) are re-measurements,
corrections and refusals-added-to-existing-systems, and not one drafts a new
decision. So the ratio holds too, at **two of twenty-two** (0056 and 0059,
unchanged since `07add3e`), and the abandonment streak neither grows nor
breaks — it simply has nothing new to be measured against this time.
Re-counted on disk the same way (the first non-blank line under each
document's own status statement, `## Status` heading or `- Status:` bullet
alike — 0064 and 0067 use the bullet form and a scan that only reads headings
undercounts by two, caught before it was reported), and the index agrees:
still twenty-two rows opening `Proposed`, **Next free number: 0069**,
unmoved. **Twenty-two is twenty-three at this anchor**, ten
releases later: 0069 (the sentence-length-at-admission ADR, #541) arrived,
`Proposed, 2026-08-29. Not self-approved.` like the six before it, with no §2
row — so the ratio moves to **two of twenty-three**, and 0069 is the **sixth**
consecutive outstanding ADR to skip §2 (0064, 0065, 0066, 0067, 0068, now
0069) and the seventh overall since the rule was restated, against two that
did (0056, 0059). **The previous anchor could not measure this and said so**:
its window added no ADR at all, so the rule "add an entry when an ADR arrives"
had nothing to obey or abandon, and it recorded that the streak would resume
the moment the next `Proposed` ADR landed with no row and that nothing
predicted which way it would go. It has resumed, in the direction the earlier
prediction gave rather than the direction the quiet window might have
suggested. Counted on disk at `85c1c29` the same way as every reading in this
sequence — the first non-blank line under each document's *own* status
statement, `## Status` heading or `- Status:` bullet alike — which is the
scan that matters here and not a raw `grep -c Proposed`: 0064 and 0067 still
use the bullet form and a heading-only scan still undercounts by two, and a
scan that matched every `Status` heading at any level would **over**count by
picking up nested `### Status of this amendment` blocks inside accepted ADRs.
Twenty-one documents state `Proposed` under a `## Status` heading and two
(0064, 0067) under a `- Status:` bullet. The index agrees: **twenty-three**
rows opening `Proposed`, and **Next free number: 0070** — moved, where the
previous anchor recorded it unmoved. **Twenty-three is twenty-six at this
anchor**, six releases later — and the reading above is the first in this
sequence that was taken **on the wrong tree**. It says so in its own words,
*"Counted on disk at `85c1c29`"*, while the sentence around it says *"at this
anchor"* and that anchor was `82ae630`. Both numbers are right about `85c1c29`
and neither is right about the tree they warrant: measured at `82ae630` by the
same method the answer is **twenty-five** on disk and twenty-five rows in the
index, and **Next free number** was **0074** rather than the 0070 recorded. The
two that fell in the gap are ADRs that pass's own merge list contains — 0071
arrived at `fcd2a72`, the merge that account names as #554, and 0073 at
`4a224f9`, *"Land ADR 0073: who orders a contraband search"*, a merge it does
not name at all. The correction is left beside the claim rather than replacing
it, because the failure is not arithmetic and re-adding would not have caught
it: a count is warranted by the tree it was taken on, and naming that tree —
which this sequence has always done — is the whole of what makes the mismatch
findable. At `e1813b7` the count is **twenty-six**: 0070 (the staff-dismissal
ADR, #533) arrived, `Proposed` with no §2 row like the eight before it. So the
ratio moves to **two of twenty-six**, 0070 is the **ninth** consecutive
outstanding ADR to skip §2 (0064, 0065, 0066, 0067, 0068, 0069, 0071, 0073, now
0070 — the last three all landing after the sixth was counted) and the tenth
overall since the rule was restated, against two that did (0056, 0059).
Counted on disk at `e1813b7` this time, by the same method; the index agrees,
twenty-six rows opening `Proposed`, and **Next free number: 0074** is unmoved,
because 0070 is below the ceiling 0073 had already set. **Twenty-six is
twenty-seven at `cfab558`**, seven releases later: 0074 (what a restored room
that recorded no rectangle is, #571) arrived, `Proposed, 2026-08-29. Not
self-approved.` — and **it is the first arrival since 0059 to get a §2 row**,
filed by #574 three merges later. So the ratio moves to **three of
twenty-seven**, and the nine-long streak of consecutive outstanding ADRs
skipping §2 — 0064 through 0071, 0073 and 0070 — **is broken**. Counted on
disk at `cfab558` by the same method as every reading in this sequence, the
first non-blank line under each document's own status statement, `## Status`
heading or `- Status:` bullet alike (0064 and 0067 still use the bullet form);
the index agrees, **twenty-seven** rows opening `Proposed` out of 68 rows, and
**Next free number** has moved **0074 → 0075**, because 0074 was the new
maximum on disk.

**Twenty-seven is thirty at `53e1405`**, seven releases later: 0075 (what a
prison that cannot afford its first bed is owed) and 0076 (what happens to a
resident whose bed is taken away) arrived together at `092991e`/#580, and 0077
(when a route stops being valid) at `827201e`/#581, all three `Proposed,
2026-08-29. Not self-approved.` **None of the three has a §2 row**, so the
ratio moves to **three of thirty** — the count moving without the ratio
moving, for the third time in this sequence and the first time it has done so
by three in one window. **Three arrivals in one window is the most this
sequence has recorded**, and the previous largest, five at `cfab558`, was
spread across thirty-one releases rather than seven. Counted on disk at
`53e1405` by the same method as every reading in this sequence — the first
non-blank line under each document's own status statement, `## Status`
heading or `- Status:` bullet alike; 0064 and 0067 are still the only two in
bullet form, so a heading-only scan still undercounts by two — twenty-eight
under a heading and two under a bullet. The index agrees: **thirty** rows
opening `Proposed` out of **71**, and **Next free number** has moved
**0075 → 0078**, in two steps rather than one, because #580 landed two
numbers at once and #581 landed the third. **Two of the three are already
ruled on** — the owner accepted 0075 and 0076 on 2026-08-29, and PR #606 is
open to move both statuses — which is why the ratio above is the weakest
figure in this paragraph rather than the strongest: it counts rows in this
file, and two of the three documents it counts against are one merge from
needing none. The window note below decides each of the three separately and
says why.

**Thirty is twenty-nine at `0637ab1` and thirty again at `898a16a`, and this
paragraph recorded neither until now.** Its count sequence was last extended
by the `53e1405` re-anchor — `186c13f`/#613, found with `git log -S` rather
than assumed — and then stood still across three anchors, `0637ab1`,
`104d078` and `eb1f040`, while the number underneath it fell to twenty-nine
(0075 and 0076 accepted at `f0b98aa`/#606, 0078 arriving at `19482be`/#612)
and rose to thirty again (0079 arriving at `9a25700`/#659). **So this
paragraph was false for three anchors and is true again by accident**, which
is the worst way for a count to be right and the reason it is written out
rather than quietly extended. **No diff could have raised it**, because no
line of it changed; the check that does is the one this header prescribes and
the `4ace2da` pass had to invent — reading the file's own paragraphs against
each other.

**And thirty again at `feb46af`, unmoved — recorded here rather than left to
the window note below, because the finding immediately above is about *this
paragraph* being the site that stops.** No ADR arrived and none left between
`898a16a` and `feb46af`; `docs/adr/README.md` is not among that window's 52
changed files; the value is thirty on disk and thirty in the index. **A window
that moves no count is exactly the window that gives nobody a reason to touch
this paragraph**, and two of the three anchors it was false for — `104d078` and
`eb1f040` — were windows of that shape. So the sentence is extended when there
is nothing to report, which is the only moment at which extending it costs
anything.

**And thirty is TWENTY-NINE at `df46980` (v0.0.281), and it is the first FALL
in this sequence that this file named in advance — in a handover it wrote
itself, at the `85c1c29` anchor, and re-read at anchors ever since.** The one
earlier prediction of this kind, at `898a16a`, named an *arrival* (0079, #659)
and its arithmetic; this one names a departure. **And it named the document
rather than the pull request**, which is why it was still legible nine anchors
later: `85c1c29`, `82ae630`, `e1813b7`, `53e1405`, `0637ab1`, `104d078`,
`eb1f040`, `898a16a`, `feb46af` and `004f799`, read off the anchor accounts
kept below. A prediction naming a branch would have expired the moment the
branch was squashed. ADR **0051** was accepted — `**Accepted, 2026-08-30, by the
repository owner.**` at `docs/adr/0051-…md:22` — by `445f546`/#647, five
releases after the `004f799` anchor, and nothing joined. So the count is
**twenty-nine** on disk and twenty-nine in the index's status column, and the
enumeration is §3's thirty minus 0051: `0042`, `0043`, `0046`, `0047`,
`0048`, `0049`, `0050`, `0052`, `0053`, `0054`, `0056`, `0057`, `0059`, `0061`,
`0062`, `0063`, `0064`, `0065`, `0066`, `0067`, `0068`, `0069`, `0070`, `0071`,
`0073`, `0074`, `0077`, `0078`, `0079`. Counted on disk by the method every
reading in this sequence has used — the first non-blank line under each
document's own status statement, `## Status` heading or `- Status:` bullet
alike, **twenty-seven** under a heading and **two** (0064, 0067, still the only
two) under a bullet, out of **74** documents. Split on the status column the
index agrees: **29 `Proposed`, 45 `Accepted`, 74 rows**, and **Next free
number: 0081**, unmoved.

**And a new instance of this file's oldest trap arrived with #647, in the index
rather than in a document, and the anchored grep this file already uses is
immune to it.** #647 corrected 0051's index cell **in both directions**, so the
word `Proposed` now survives inside the clause saying what the cell used to
read. A whole-row match — `grep '^| \[' docs/adr/README.md | grep -c
Proposed` — therefore returns **30**, one too many. The regex §3's opening has
used since `0637ab1`, `grep -cE '^\|.*\| *\*{0,2}Proposed' docs/adr/README.md`,
returns **29**, because it anchors on the status cell rather than the row.
**Both were run here rather than reasoned about**, and the anchored one being
right is luck this file should not spend: correcting a cell in both directions
is now the standing convention, so every future acceptance adds another row
that a loose grep miscounts.

**This commit is not a re-anchor and deliberately does not move the anchor
span**, which is the shape the paragraph immediately above argues for: the
value moved for a reason a diff *can* state, so the correction is owed by the
commit that can state it rather than by the next sweep. All four counting
sites are moved together here, and the sentences saying thirty are left
standing beside them.

**And twenty-nine is TWENTY-NINE at `58220f7` (v0.0.284), unmoved, which is the
first reading this sequence has taken one anchor after a correction rather than
after a drift.** No ADR was added or removed in the eight releases since: the
only movement in `docs/adr/` was `e6cad72`/#702 rewriting 0051's index cell in
both directions, and 0051 had already left the count at `445f546`/#647. Counted
on disk by the method every reading here has used — **twenty-seven** under a
`## Status` heading and **two** (0064, 0067, still the only two) under a
`- Status:` bullet, out of **74** documents — and the index's status column
agrees at twenty-nine against forty-five `Accepted`. **All four counting sites
were opened and all four read twenty-nine**, which is what a window that moves
no count can establish and no more: it exercises none of them, so this sweep
confirms they agree and nothing whatever about the mechanism that splits them.
That is the weaker of the two possible results and is reported as such.

**And twenty-nine is THIRTY-SIX at `0e2eb7fb` (v0.0.351), which is this
paragraph SIX anchors behind the tree and stopping for the SECOND time.** The
sentence above was correct at `58220f7`, was added by that anchor's own commit
(`8c205082`/#706, found with `git log -S` rather than assumed) and was never
extended again: it stood unchanged through the `a54899a`, `0352116`,
`b04e45f`, `5144eb9e`, `26434e8e` and `33a4a22e` anchors while the number
under it climbed to thirty-four, and the three sections that mirror it — §3's
opening, §5's first bullet and §6's `income.ts` bullet — carried the live
value across that run, with the single gap the previous anchor found and
repaired (§5's first bullet had no dated entry for `26434e8e`). **That is the exact inversion this header already recorded once**, in
the paragraphs below about which of the four places lags: the first time, this
paragraph was the only one anybody moved and the three sections were four
anchors behind; this time this paragraph is the one that stopped and the three
sections are current. **So the finding is not which place lags — it is that
which place lags does not stay put**, and the defence the paragraph below
describes (naming the places) only works if a reader opens all four rather
than the ones that were wrong last time. Extended here rather than
overwritten, and derived rather than copied from the sections: **thirty-six**
on disk, **thirty-four** under a `## Status` heading and **two** (0064, 0067,
still the only two) under a `- Status:` bullet, out of **84** documents, with
the index's status column agreeing at thirty-six against forty-eight
`Accepted`. **Nothing mechanical could have raised this**, because no line of
the sentence above changed; what raises it is the check this header
prescribes, reading the file's own paragraphs against each other, run here as
pass 3.

**And thirty-six is THIRTY-SEVEN at `9b8c8e85` (v0.0.358), seven releases
later — and this paragraph was CURRENT when the window opened, for the first
time since it began being tracked.** The correction above was applied at
`0e2eb7fb` after this paragraph had stood six anchors behind the tree; this
window is therefore the first at which all **four** places that count
`Proposed` documents — this paragraph, §3's opening, §5's first bullet and
§6's `income.ts` bullet — agreed before anything was read, and the four moved
together with nothing to reconcile. **That is a control this sequence has
never had and it is weaker evidence than it looks**: exactly one `Proposed`
ADR arrived in the window, so the mechanism that splits these four — two
commits editing two of them — was never exercised, and a window with one
arrival is the easiest possible test of it. Extended rather than overwritten,
and derived rather than copied from the sections: **thirty-seven** on disk,
**thirty-five** under a `## Status` heading and **two** (0064, 0067, still the
only two) under a `- Status:` bullet, out of **85** documents, with the index's
status column agreeing at thirty-seven against forty-eight `Accepted`. The one
arrival is **0091** (what clears the refusal band, #777/#780, landed by #800),
`**Proposed, 2026-09-02, for decision 2. Not self-approved.**` — and it is the
number §3's own held-number sweep had recorded as *held on a branch* at the
previous anchor, so the same document that moved this count also falsified a
sentence in §3, which is corrected there in both directions.

**And thirty-seven is THIRTY-SEVEN at `1547c7f6` (v0.0.364), six releases
later — unmoved, and extended here for the reason the `feb46af` paragraph
above gives: a window that moves no count is exactly the window that gives
nobody a reason to touch this paragraph, and two of the three anchors it was
once false for were windows of that shape.** No ADR arrived and none left: the
only file under `docs/adr/` among this window's 21 is this one. Counted on
disk at `1547c7f6` the same way as every reading in this sequence —
**thirty-five** under a `## Status` heading and **two** (0064, 0067, still the
only two) under a `- Status:` bullet, out of **85** documents — and the index's
status column agrees at thirty-seven against forty-eight `Accepted`, with
**Next free number: 0092** unmoved. **One trap in the disk scan, hit here and
worth the clause**: a bare `grep -c Proposed` over those 85 status lines
returns **38**, because 0013's *Accepted* line says its §§5-6 *"remain
Proposed"* — the self-quoting shape this file has recorded four times in the
index's cells, appearing once in a document's own status line, and counted
separately by the convention §3's *"A miscount this pass made and caught"*
paragraph already states. All four places that count this were current when
the window opened, for the second consecutive anchor, and nothing arrived to
test whether they would have moved together.

**§2 STILL HOLDS EIGHT ENTRIES at `1547c7f6`, and all four places that count
them agree for the fifth consecutive anchor.** Nothing was filed and nothing
was deleted, and this time **no ADR arrived at all**, so there was neither a
delinquency nor an exemption to record — the first window since the rule was
restated with nothing whatever for the four places to disagree about. Five
consecutive anchors with no entry filed is now the longest such run in this
file's history, and the agreement is the weaker of the two possible results
for the fifth time: a window that files no entry never exercises the mechanism
that splits the four.

**§2 STILL HOLDS EIGHT ENTRIES at `9b8c8e85`, and all four places that count
them agree for the fourth consecutive anchor.** Nothing was filed and nothing
was deleted: 0091 arrived `Proposed` with no §2 row, and it is the window's
only arrival, so there was no exemption to distinguish from a delinquency this
time. **Four consecutive anchors with no entry filed is now the longest such
run in this file's history**, and the consequence is that the split the
paragraph below describes has not been tested against an implementing change
since the rule was restated — the agreement is the weaker of the two possible
results, for the fourth time, and saying so a fourth time is the only honest
way to report it.

**§2 still holds EIGHT entries at `0e2eb7fb`, and all four places that count
them agree.** Nothing was filed and nothing was deleted: 0089 and 0090
arrived `Proposed` with no row, and 0088 arrived already `Accepted` and is
owed none — **the first arrival in this sequence that is exempt rather than
delinquent**, which is worth one clause because every previous window's
arrivals were one or the other. The four places are this paragraph, the title
above it (which states a subject and no count), §2's own heading, and §5's
preamble; that is the third consecutive anchor at which they agree, and for
the third consecutive time the agreement is the weaker result, because a
window that files no entry never exercises the mechanism that splits them.

**And the gate this file names for exactly this class EXEMPTS THIS FILE BY
NAME, which makes the sentence naming it false about the only document it was
written into.** The handover below says both of §5's assertions about a
handed-over status *"go false the moment the acceptance lands, and
`tests/foundation/adr-status-reference-contract.test.ts` is the gate for exactly
that class."* That test's own `EXEMPT` predicate reads
`path === 'docs/adr/STATUS-QUEUE.md'`, with a reason stated in its docblock:
this file *"exists to **quote stale sentences verbatim** so the owner can see
what is stale. Every entry in its §6 is a false claim reproduced on purpose,
and its whole value is that it says so."* **The exemption is right and the
sentence citing it was wrong**, and both are left standing: a gate that failed
on §6 would be a gate demanding this file stop doing its job, and the handover
below promised a check that could never have run.

**Measured in both directions rather than read off the source, because a
predicate is not a behaviour.** The gate was run on `df46980` **before any line
below was edited** — the tree in which 0051 is accepted and all four counting
sites still said thirty — and **passed, four tests**, as did
`adr-status-queue-anchor-contract` and `adr-numbering-contract`: twenty tests,
three files, green. Then a probe was written **into this file** asserting *ADR
0051 is still Proposed*, which is flatly false on this tree: the gate **still
passed**, four tests. The same probe appended to `docs/ARCHITECTURE.md` — a
scanned, non-exempt document — failed it in one line, reporting *"is still
Proposed" -- but ADR 0051 is Accepted*. Both probes were removed by hand and
both files verified byte-identical against copies taken before them. So the
gate works exactly as documented, and the coverage of this file is **zero**.

**What that leaves uncovered here is two things and not one.** A stale *count*
of statuses is uncovered everywhere, in this file and outside it, because a
claim that names no ADR has no subject to resolve — the gate's docblock says so
in terms and names `income.ts` as the instance. And a stale *cited status* is
uncovered **in this file specifically**, by the exemption. So all four counting
sites and both of §5's 0054 sentences are held by nothing mechanical whatever;
what holds them is the check this header prescribes, reading the file's own
paragraphs against each other, which is the method that found this.

**A DIFFERENT gate did catch something in this pass, and it is worth naming
because it is the one gate in this repository that reads this file's prose for
rot.** `tests/foundation/documentation-version-claim-contract.test.ts` failed on
the first draft of the sentences above, naming this file and one line of §5's
new bullet, which said a move *"landed at"* the current release with no commit
beside the number. Its message states the rule: *"a version beside a sha
identifies a tree and cannot rot"*. Three version claims drafted here were
pinned to commits in response — `df46980`, `cd2c7c5` and `966560f`, each
carrying its version in parentheses — and it passes, five tests. **So the gate
coverage over this file is real but orthogonal**: a bare version is caught, a
stale count of statuses is not, and both facts were measured in the same run
rather than reasoned about.

**And writing that failure down re-tripped the same gate, which is the sharpest
thing this pass learned about gates over prose.** A first draft of the
paragraph you are reading quoted the test's output verbatim, bare version token
and all, and the suite came back red a second time on **this** paragraph rather
than on §5's — two hits on one line, because the token appeared twice in the
quotation. **That is the identical failure mode #647 had to work around one
document over**: `adr-status-reference-contract` *"reads English claims and
cannot tell a quotation from an assertion"*, and neither can this one. #647's
answer was to replace the number in the quoted clause with a pronoun; the
answer here is to describe the output instead of reproducing it. **Both are the
same trade** — a gate that cannot parse quotation marks is still worth having,
and the cost is paid by whoever writes about it — and it is recorded because
this file's whole method is quoting sentences that went false, which is
precisely the method these two gates penalise.

**And it inverts the sentence immediately below, which is the more useful
half.** That sentence says this header's paragraph is *"the only one of the
four that anyone had been moving"*, with §3's opening, §5's first bullet and
§6's `income.ts` bullet lagging four anchors behind it. Since `0637ab1` the
opposite has held: those three have carried the live value at every anchor —
moved to twenty-nine there, checked and found still correct at `104d078` and
`eb1f040` — and this paragraph is the one that stopped. Both directions are
left standing, because **which of the four places lags is not stable**, and a
next editor who reads only the sentence below will sweep the three sections
and skip the paragraph that was actually wrong.

**And the header has been the only place carrying this number for three
anchors, which no diff could have said.** §3's opening, §5's first bullet and
§6's `income.ts` bullet are the other three places that state it, and all
three still read **twenty-two** — the value that was correct at `4ace2da`
(v0.0.177) and went false when 0069 landed at #541, inside the
`4ace2da..85c1c29` window. The `85c1c29` pass moved the header to
twenty-three and wrote, in the derivation subsection below, that *"§3's
opening, §5's first bullet and §6's `income.ts` bullet now enumerate
**twenty-three** `Proposed` documents"*; **they enumerated twenty-two when
that sentence was written**, and the same sentence was repeated in
substance at the two anchors after it. That is the class this header calls a
claim already false when its window opened, in this file's own maintenance
prose rather than in an entry, and it is the second count in this sequence
found to have been taken on one tree and written about another. All three are
corrected in place at this anchor, to **twenty-seven**, with the sentences
saying twenty-two left standing beside them; the sentence in the derivation
subsection is corrected where it sits.

**The three ADRs with a known expiry were re-read at this anchor rather than
carried.** 0051, 0052 and 0054 still read `Proposed` on disk at `cfab558`, so
the handover recorded below stands unchanged and all three are still inside
the twenty-seven.

**Three of those twenty-three have a known expiry and are handed over rather
than acted on here.** The owner decided on 2026-08-29 (issue #535, decision 8)
to accept ADRs **0051**, **0052** and **0054**, whose code is merged and live;
that acceptance is deliberately sequenced *after* this re-anchor so that no
tally moves underneath it. All three still read `Proposed` on disk at
`85c1c29`, which is what the twenty-three counts. **This file asserts one of
those statuses twice, in §5**, in the sentences beginning *"ADR 0054 remains
`Proposed, not self-approved` while its code is merged and live"*. Both go
false the moment the acceptance lands, and
`tests/foundation/adr-status-reference-contract.test.ts` is the gate for
exactly that class. They are **left exactly as found** by this pass — flipping
a status is not a re-anchor's job, and the acceptance commit should own the
correction in both directions — and named here so the handover is written
down rather than rediscovered. A fourth live assertion of the same shape sits
outside this file, in `docs/adr/0056-…md`: *"it does not edit ADR 0051,
because ADR 0051 is itself Proposed"*. Same expiry, same owner, recorded for
the same reason.

**That handover is A THIRD DISCHARGED at `445f546`/#647, and the two halves
came apart in a way worth naming.** ADR **0051** is now `**Accepted,
2026-08-30, by the repository owner.**` on disk; **0052** and **0054** still
read `**Proposed, 2026-08-28.** Not self-approved.`, re-read here rather than
carried. So of the three ADRs the owner decided on 2026-08-29 to accept, one
document has been moved and two have not — and the sentence above saying *"all
three"* is left standing rather than reworded, because the split is the
finding: a single ruling covering three documents was discharged one document
at a time by the change that had a reason to open one of them, and nothing
tracks the remaining two except this paragraph.

**And 0051 was accepted by a DIFFERENT ruling from the one this handover
names, which is why the two halves came apart.** `docs/adr/0051-…md:30-42`
records the acceptance as arriving in
[#639](https://github.com/matmaxalez/lockstate/issues/639) — *"OWNER RULINGS
2026-08-30: four calls on what the game tells the player"*, whose first ruling
reads *"**ADR 0051 is accepted.** It has been `Proposed, 2026-08-28. Not
self-approved.` while **its behaviour already ships**"* — and not in #535. So
the document that moved is the one the owner ruled on **twice**, a day apart,
and the two that did not move are the ones covered only by the earlier ruling.
**That is a mechanism rather than a coincidence**, and it is the useful half:
this handover has been standing since `85c1c29`, and what discharged a third of
it was not anybody reading the handover but the owner raising the same subject
again in their own words.

**The earlier ruling was conditional, and the condition is why the remaining
two are not a debt anybody may simply pay.** #535 decision 8 reads *"accept,
with a review pass first"* and states the instruction in terms: *"accept them,
**but report back rather than quietly approving any ADR that describes
something the code does not actually do.** A status is supposed to describe
reality; that cuts both ways."* So moving 0052 or 0054 requires measuring the
document against `main` first and reporting, not editing a status line — and
`AGENTS.md`'s *"never self-approve"* means the report goes to the owner either
way. **#639 supplied exactly that for 0051** by naming the ADR as *"a decision
the code already keeps, waiting on a signature"*; nothing has yet supplied it
for the other two.

**The fourth live assertion, outside this file, was discharged by the same
commit and in the shape this file asks for.** `docs/adr/0056-…md`'s open
question 3 no longer asserts 0051 is Proposed: #647 replaced the ADR number in
the quoted clause with a pronoun and wrote the reason out — *"The reason this
bullet gave expired on 2026-08-30 and is marked rather than overwritten"* —
and named why the pronoun rather than the number: `adr-status-reference-contract`
*"reads English claims and cannot tell a quotation from an assertion"*. That is
the acceptance commit owning the correction in both directions, which is what
the paragraph above said it should do, and it is the first time a handover
recorded here has been honoured by the commit it was addressed to rather than
by the integrator afterwards.

**§5's two assertions about 0054 are still TRUE and are deliberately not
touched.** Both were re-read at `df46980`: 0054 is still `Proposed` on disk, so
the sentences saying *"ADR 0054 remains `Proposed, not self-approved` while its
code is merged and live"* are still correct. **The gate named above would not
have failed on them either way**, and the header now records why: it exempts
this file by name, so the promise that it covers this class was never true of
the document the promise was written into. **The expiry is unchanged, not
cleared** — the owner's 2026-08-29 ruling still covers 0054, so both sentences
go false the moment the second and third documents move, nothing mechanical
will say so, and this paragraph is now the only place that says which two are
left.

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

**And four is not all of them. There is a second family of three, found at
`cfab558`, and it had drifted for four anchors while the four were being
swept every time.** The queue count lives in four places; the count of
`Proposed` ADRs lives in **three** more — §3's opening, §5's first bullet and
§6's `income.ts` bullet — plus this header's own paragraph above, which is the
only one of the four that anyone had been moving. All three sections read
*twenty-two* from `4ace2da` until this commit while the header went
twenty-three and then twenty-six; the value went false when 0069 landed at
#541. **What makes it worse than an ordinary lag is that the file asserted
the sweep had happened**: the derivation subsection below carried, from
`85c1c29` onward, *"§3's opening, §5's first bullet and §6's `income.ts`
bullet now enumerate **twenty-three** `Proposed` documents"*, which was false
on the tree that wrote it and was repeated in substance twice after. So the
defence this paragraph describes — naming the places — works only if
somebody opens them, and a sentence claiming they were opened is
indistinguishable, to every gate in this repository, from having opened them.
**Seven places count something in this file**, and the next editor sweeping
four of them is doing four sevenths of the job.

**The sweep was run again at `07add3e` and it caught the same drift a second
time, in the same two places, nine releases after the first.** The four read:
this paragraph, *"§2 holds **four entries**"*; the title, which states a subject
and no count; §2's heading, *"## 2. Five entries: …"*; and §5's preamble,
*"**FOUR at `c00b641`**"*. #485 filed §2's fifth entry — ADR 0059's — moved §2's
heading and moved neither of the other two, which is precisely what #467 had
done nine releases earlier with the fourth. **So the prediction has now been
confirmed twice by the same mechanism**, and the useful part is that the
*direction* is stable: §2's heading is the one place that is never wrong,
because it is edited by the commit that files the entry, and the two prose
counts are the ones that lag. A next editor who has time for one check should
read §2's heading and then grep for the other two counts. Both are corrected in
place, with the sentences they replaced left standing beside them.

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

Re-anchored at `main` @ `3f8c00b0` (**v0.0.407**) by the delta method this
header describes, from the v0.0.402 anchor described below. **Five of the ten
releases the budget allows, counted on the tree this commit is written
against: `package.json` ships 0.0.407 at `3f8c00b0` and the anchor being
replaced named v0.0.402.** `ANCHOR_STALENESS_BUDGET_RELEASES` is unmoved at
**10**, exactly as the gate demands and as its own failure message insists.

**THE HALFWAY MARK IS KEPT AGAIN, after one pass that spent nine.** The rule
this header states in capitals is *"THE HALFWAY MARK IS A TASK, NOT A
READING"*, and the previous pass ran to nine on a decision it argued for and
named as a cost rather than hid. This one was taken at five, so the sequence
now reads five, five, nine, five — the mark kept three times in four, and
recovered immediately after the one pass that spent past it.

**Window: `402453a9..3f8c00b0`, 64 files, 63 of them besides this one, across
five implementing merges — #857, #863, #859, #864 and #865 — with #858
excluded as self-referential, being the previous anchor's own pass, and five
release-bump commits (v0.0.403 through v0.0.407, the last of them `3f8c00b0`
itself).** The five merges touch 8, 50, 3, 3 and 2 files and #858 touches only
this one; those counts sum to 67 against a union of 64, and the three overlaps
are worth naming because one of them is invisible. Two are ordinary — this
file, edited by #858 and by #863, which filed §2's ADR 0093 row; and
`docs/research/README.md`, appended by #859 and #864. **The third is a file
that was born and died inside this window**: the scratch probe #863 left under
`tests/determinism/` and #865 deleted, `zz-probe.test.ts`, which is in neither
end of the diff and therefore **does not appear in the window's file list at
all**. The brief for this pass named that deletion as something to look at; a
`git diff` across the window's endpoints cannot see it, and the only reason
this account can say what happened is `git show --name-only` on each merge in
turn. **A file created and destroyed inside one window is a blind spot of the
delta method itself**, not of this reading, and it is the first instance this
header has had to record.

**Taken from a fresh `origin/main`, and the merge the fetch brought was
asserted by file rather than by exit code.** `git fetch origin main`
immediately before the window was cut, per `docs/AGENT_WORKFLOW.md` §2's
stale-worktree trap — *"a merge against it looks like a success"* — and the
check that the fetch actually moved anything is that
`tests/foundation/test-suite-carries-no-scratch-probe-contract.test.ts`, which
is #865's and exists nowhere before it, is present in the tree this pass ran
on.

**Ten members besides this file, and the basename scan finally earns the
warning three anchors have given it.** The delta intersection over §§3-6
(lines 5951-10905 on this tree, 142 distinct path-like backticked spans)
gives, by full path: `docs/adr/README.md`, `docs/research/README.md`,
`src/content/default-locale-en.ts`, `src/simulation/economy/procurement.ts`,
`src/simulation/prisoners/release.ts`,
`src/simulation/runtime/session-systems.ts`, `src/ui/hud/hud.css`,
`src/ui/hud/messages.ts`, `src/ui/hud/staff-panel.ts` and
`tests/foundation/documentation-links-contract.test.ts`. `package.json` is read
for its version rather than diffed, as every anchor's convention states. Run
both ways as the method requires: the basename scan returns **twelve**, and the
two extra are **phantoms** — `src/simulation/operations/index.ts` and
`src/simulation/prisoners/index.ts`, reached only because §3 cites
`src/simulation/identity/index.ts` and `index.ts` is the least distinctive
basename in this repository. **Three consecutive anchors recorded that the
basename intersection happened to give the right answer anyway, each for a
different reason; this is the window where it does not**, which is a better
argument for the full-path rule than three more coincidences would have been.

**Two cited spans MOVED, both inside members, both by lines inserted above
them, and both re-derived byte for byte rather than arithmetically.**
`src/ui/hud/staff-panel.ts:489` is now **`:526`**, +37, from #857's coverage
readout and its three panel hunks landing above it; the sentence the citation
exists for is byte-identical — the setter that *"decides nothing"*, with
`BuildPanel.setTreasury` named beside it as *"the same setter for the same
reason on the Buy button"*. And `src/simulation/prisoners/release.ts:194` is
now **`:216`**, +22, from #863 replacing `PrisonerWorkerReleasePort` with
`PrisonerCarryReleasePort` above it; `entityStore.destroy(entityId);` is
byte-identical, so §5's *"Question 2 is answered"* holds in every term. Both
are corrected below with the old span kept beside the new one.

**A third citation was wrong when it was WRITTEN, and it is a wrong file
rather than a wrong line.** §2's ADR 0071 entry names the concurrent-use
ceiling's *"three production callers"* as
`src/simulation/prisoners/action-system.ts:820`, `:1067` and `:1082`. That file
is a member of this window, so the three lines were opened: on `3f8c00b0` they
are comment prose, and at `71617799` — the commit that wrote the citation —
they were comment prose as well. The three callers that pass a capability were
then, and are now, in `src/simulation/prisoners/room-instance-registry.ts`, at
`:902`, `:941` and `:1109` on that tree and at **`:987`, `:1026` and `:1194`**
on this one. **The claim holds and only its address is wrong**, which makes it
a sharper instance of `docs/AGENT_WORKFLOW.md` §4's rule than any drifted
anchor: no diff over any window could have caught this going wrong, because it
never went wrong. Corrected in §2 in both directions and re-cited by symbol.

**The counters moved, for the first time in this sequence by an ACCEPTANCE
rather than an arrival.** `Proposed` **40 → 39**, `Accepted` **48 → 49**, **88**
documents unchanged, because #863 recorded the owner accepting ADR 0093 and
implemented it in the same change. Recomputed by replicating `statusStatement`
from `tests/foundation/adr-status-reference-contract.test.ts` rather than with
a grep written for the occasion, which is the instrument the v0.0.388 pass
established and the reason it gave is unchanged. The index agrees on its status
column — `grep -cE '^\|.*\| *\*{0,2}Proposed' docs/adr/README.md` returns
**39** against **49** `Accepted` across **88** linked rows, which is 88
documents, and **89** table rows once the kept `0018` row that carries no link
is counted. **Next free number: 0095**, unmoved and matching the index, with
the absent numbers the same six — `0018`, `0030`, `0055`, `0058`, `0060`,
`0072`.

**ADR 0093's §2 row predicted that move, named the wrong pair of numbers, and
the cause is a stale block in this very header.** The row says *"The pass also
records 'The three that count `Proposed` documents hold at THIRTY-SEVEN', and
ADR 0093 was one of the thirty-seven: its acceptance of 2026-09-03 takes them
to thirty-six"*, and attributes that sentence to *"The anchor pass at
`402453a9` (v0.0.402)"*. **It is not that pass's sentence.** It belongs to the
**v0.0.364** pass, written by #819, and it is still standing in the four-pass
method block below — in the present tense, immediately beneath an anchor line
that has moved five times since. The v0.0.402 pass's own reading is in §3 and
reads *"Still FORTY at `402453a9` (v0.0.402)"*. So the row's direction is right
in both halves and both of its numbers are wrong: the acceptance takes forty to
thirty-nine, not thirty-seven to thirty-six. **The row is left exactly as it
stands** — it is an accurate record of what its filer read, and what its filer
read is this header — and what is corrected here is the header that misled it.

**EVERYTHING FROM THE NEXT PARAGRAPH DOWN TO THE KEPT ANCHOR RECORDS IS A
SUPERSEDED PASS ACCOUNT, AND NOTHING IN IT SAID SO UNTIL NOW.** Established
with `git log -L <line>,<line>:docs/adr/STATUS-QUEUE.md` rather than by
reading: the paragraphs opening *"This pass was dispatched at FIVE of ten"* and
*"Window: 10 files across four implementing merges"* were last written by #847,
the **v0.0.388** pass, and the four-pass method block under them was last
written by #819, the **v0.0.364** pass — its pass 1 diffs
`9b8c8e85..1547c7f6`, its pass 3 states *"The three that count `Proposed`
documents hold at THIRTY-SEVEN"* and *"The four that count §2 all read eight"*,
and its recommendation opens *"Re-anchoring at six of ten"*. Every number in it
was true of the tree it was taken on and none of it is a reading of this
anchor's tree. **It is kept and not rewritten**, per `docs/AGENT_WORKFLOW.md`
§4, and it is labelled because the alternative has already cost something one
commit into this window. **This is the same defect #864 fixed in ADR 0017 §9
four commits earlier in this very window**: a superseded section that does not
say so is read as current by whoever arrives at it, and marking both directions
is the only thing that stops that. The live account of this anchor is the
paragraphs above, in §3 under *"THIRTY-NINE at `3f8c00b0`"*, and in the marked
corrections in §§2, 5 and 6.

**§2's entry count is NINE, and one of the four places had not moved.** #863
moved §2's own heading (*"## 2. Nine entries: …"*) and §5's preamble (*"NINE at
ADR 0093's filing (2026-09-03)"*), and said in the row itself that the anchor
*"is not this row's to move"*. The title states a subject and no count and
cannot rot this way. **The fourth place, this header's opening paragraph, was
contradicting itself inside one sentence**: it read *"§2 holds **eight
entries**"* while its own correction clause two lines later read *"this clause
read 'eight entries' until ADR 0093's entry was filed"*. Moved to nine here
with the clause kept — the sixth time the four places have split on exactly the
line the paragraph naming them predicts, and the first time the split was
visible inside a single sentence rather than between two sections.

**§5's first bullet and §6's `income.ts` mirror had both stopped being updated
at `1547c7f6` — six anchors — and each of them already records having fallen
into this exact split once before.** Their last dated readings are *"Thirty-two
is THIRTY-TWO at `1547c7f6`, six releases later"* and *"STILL THIRTY-SEVEN at
`1547c7f6`, six releases later"*, and no anchor at v0.0.372, 377, 383, 388, 393
or 402 gave either one a reading. Both are extended below rather than
overwritten, and this window gives them something to net rather than nothing:
**thirty-nine `Proposed` documents, five of which carry a §2 row (0056, 0059,
0071, 0074, 0077), so thirty-four outstanding decisions with no entry giving
the owner the evidence.** **ADR 0093's row is the ninth §2 entry and it cannot
enter that subtraction**, because its document is `Accepted` — the first time
§2 has held a row the outstanding count has no use for, which is exactly what
the row itself says makes it a different shape, and it is worth restating where
the subtraction lives rather than only where the row does.

**The self-quoting-cell figure moved, and this time the TREE moved it rather
than the instrument.** The previous anchor settled that its predecessor's
apparent movement was one character of grep and nothing in the index. Here
`docs/adr/README.md` genuinely changed: #863 rewrote ADR 0093's status cell and
kept its former wording inside it, *"**This cell read `Proposed, 2026-09-02.
Not self-approved` until the acceptance**"*. So the narrow reading — cells
quoting their own former wording in **backticks** — goes **two to three**
(0051, 0082, **0093**), and the wide reading, which also counts the
double-quoted form, goes **three to four** (adding 0088). Enumerated on both
trees rather than subtracted, because the derivation this file's own sentence
states has never computed its own figure.

**Every standing claim re-run rather than carried.** §5's ADR 0025 entry, on a
window that edited `src/ui/hud/hud.css` in two hunks (+9 at `:1372` and +20 at
`:2427`): `find src/ui -name "*.css"` still returns **four** and `grep -rn
'3\.9' src/` still returns exactly one hit, `src/ui/primitives/icon.ts:77`,
still `'M15.8 16.1h3.9'`. §4's two absences in `supabase/migrations/`: the bare
`grep -ril 'total_bytes\|max_total_bytes\|retention\|prune'` over the
directory still returns exactly one file and its only hit is still the
*comment* at `20260826130000_server_stamp_updated_at.sql:68` about a **future**
retention job; the directory still holds **23** files. §6's
`ui-hud-messages.test.ts:269-275` is byte-identical and that file is not in the
window. `docs/research/README.md`'s rule at `:9` holds word for word on a file
this window appended two rows to. And §5's `-1,250`/`-2,000` narration in
`src/content/default-locale-en.ts` is unmoved at `:229`, `:547`, `:620` and
`:654` — #857 added 48 lines to that file and every one of them landed below
the last of the four.

**The `Amendment`/`Addendum` heading count was re-derived because three ADR
documents are in this window, and it did not move.**
`grep -RniE '^#{2,6}\s+[*_\`]*(Amendment|Addendum)\b' docs/adr/*.md`,
excluding this file and the index, returns **40 headed sections across 24
documents** at `402453a9` and the same at `3f8c00b0`: #864's supersession
marker on ADR 0017 §9 is a blockquote under an existing heading, and #863's
edits to ADR 0059 are inside existing prose, so neither is a section. **The
figure this file last states is 32 across 18, at `082959e7`**, and the drift
from there to 40/24 was caused by commits outside this window — named here
rather than corrected in place, for the reason the §6 item itself gives about a
hand count and a derivable count never having been two readings of the same
set.

**The held-number sweep is clean over a remote that grew back.** `git ls-remote
--refs --heads origin` returns **142** heads, up from the 129 the previous pass
swept just after the branch cleanup, and `git ls-tree --name-only <head> --
docs/adr/` over every one of them finds **no head holding an ADR number at or
above 0095** — the seventh consecutive clean reading of the collision risk.
Swept more broadly than the risk, the same scan returns the same three
abandoned drafts and nothing new: `0018-construction-material-supply.md` on
`claude/construction-materials-supply`, and two different documents both
claiming **0030**, on `fix/352-incident-response-record-persistence` and on
`claude/concurrent-use-ceiling-research`. Reported, not repaired; no branch was
touched.

**#864's supersession of ADR 0017 §9 touches nothing in this file, and that is
recorded because it was expected to.** The brief for this pass named §9's
reopened ECON-002 hard lock as the live player-facing defect an audit had
reported and #864 withdrew. Grepped rather than reasoned about: `ECON-002`,
*"not put to the owner"* and `§9` return **nothing** in this file, and ADR 0017
appears here only as an `Accepted` document whose decisions 4, 5 and 7 §§2, 5
and 6 discuss. **No economy decision counted anywhere in this file was ever
that lock**, so nothing is withdrawn and nothing is recounted — which is worth
one paragraph, because a pass that looked and found nothing is
indistinguishable in silence from a pass that did not look.

**Two of the owner's rulings of 2026-09-03 are NOT on `origin/main` at this
window's close, so two things this file says are true of this window and are
expected to be false within the day.** §2's ADR 0093 row says of the first of
its three owed sentences that *"It is there, reading `'Errand'`, and it is
marked in that file as a draft for the owner's review"* — re-verified here at
`src/content/simulation-message-keys.ts:204`, with the marking two lines above
it. The owner has since confirmed *Errand* as the label, which settles that
sentence and leaves two; that ruling is on the branch
`feat/two-rulings-of-2026-09-03`, which is not among the 142 remote heads this
pass swept and is not in `402453a9..3f8c00b0`. The Buy and Hire refusal copy —
which releases #772/#799, #807 and ADR 0087 decision 2 — is on
`feat/the-refusal-says-how-much-is-missing`, likewise unpublished at this
window's close. **Named rather than implemented or duplicated**: neither is
this pass's surface, a re-anchor authors no player-visible sentence, and the
row those rulings edit belongs to the commit that lands them.

**What this pass is blind to, stated because a list of findings reads like
coverage.** The window is `402453a9..3f8c00b0` — five implementing merges, 63
files besides this one — and **a delta pass is blind to a claim that was
already false when its window opened.** Three of this pass's findings are of
exactly that class and not one came from a diff: §2's ADR 0071 citation, found
by opening the three lines it names; the superseded header blocks, found by
reading the file's own counts against each other; and the two count bullets
that stopped six anchors ago, found the same way. Nothing here re-measured a
behavioural claim in §5 — every measurement there is carried on the strength of
its inputs still existing, which is what §5's ADR 0027 entry says about itself
in terms — and **§1's thirteen flips were not re-read at all**. **And #856,
which the brief for this pass placed in this window, is not in it**: `git
merge-base --is-ancestor 2c9306a3 402453a9` returns true, it is the last
implementing merge before the previous anchor, and that anchor's own account
already lists it. Checked rather than trusted, which is the third consecutive
pass whose brief needed correcting on its merge list.

**This pass was dispatched at FIVE of ten — the halfway mark exactly, and the
reading that triggered it was taken at the moment a merge landed.** The rule
reads: *"THE HALFWAY MARK IS A TASK, NOT A READING."* The previous pass went at
six and diagnosed itself correctly: the budget had been read *on a schedule*
rather than watched as merges landed, and one merge slipped between the reading
that said four and the reading that said six. This pass applied that diagnosis
instead of restating it — the budget was re-read immediately after each merge
in the queue, and #840's landing is what moved it from four to five, which is
where it was stopped. **Six pull requests were green and mergeable at that
moment (#833, #834, #839, #843, #844, #846) and all six were held**, because
merging them would have carried the budget to eleven and spent the window
before the anchor was taken.

**Window: 10 files across four implementing merges — #835, #832, #836 and
#840 — with #837 excluded as self-referential, being the previous anchor's own
pass.** The delta intersection over §§3-6 (lines 5656-10350 on this tree, 113
distinct rooted paths) gives **five members**: `docs/AGENT_WORKFLOW.md`,
`docs/adr/README.md`, `docs/research/README.md`,
`src/content/default-locale-en.ts` and `src/ui/tokens.css`. Run both ways as
the method requires: full-path returns six and basename returns the same six,
and the sixth is this file, which is not in its own dependency set. **The
window file that is a member of neither scan is worth naming, because the
header's own prose discusses it and this pass nearly recorded it as
falsified**: the previous anchor's pass 1 says of `ui-design-tokens.test.ts`
that *"there is no such file"*, the window edits
`tests/unit/ui-design-tokens.test.ts`, and the sentence survives untouched
because it is scoped to `tests/foundation/` — where there is still no such
file, checked rather than reasoned about. The other non-member is
`tests/browser/playtest-waste-multiplier.playtest.ts`, which nothing in
§§3-6 cites and which `playwright.config.ts`'s `testMatch: /.*\.spec\.ts$/`
does not collect in any case.

**Two live "verified at" claims moved to this anchor and both were re-run
rather than carried.** §4's pair of absences in `supabase/migrations/`: the
bare `grep -ril 'total_bytes\|max_total_bytes\|retention\|prune'` over that
directory still returns exactly one file, and its only hit is still the
*comment* at `20260826130000_server_stamp_updated_at.sql:68` about a **future**
retention job. Scoping matters here and is recorded because the first run of it
this pass was wrong: the same grep over `supabase/` rather than
`supabase/migrations/` returns **two** files, the second being
`supabase/tests/009_rls_policy_surface.test.sql`, which is outside the
directory the claim is about. The claim says "over the directory" and it means
it. §6's `ui-hud-messages.test.ts:269-275` citation is carried unchanged
because `git diff --name-only` over that file across this window returns
nothing at all, so the span #827 moved is still where the entry says it is.

**§5's ADR 0025 entry is the claim this window could actually have broken, and
this is the second consecutive window to edit a file it counts.** The entry
counts `.css` files under `src/ui` and asserts `3.9` appears in none of them;
the previous window added the `caution` tone's tokens and this one, through
#840, rewrote three of them. Re-run on this tree: `find src/ui -name "*.css"`
still returns **four**, and `grep -rn '3\.9' src/` still returns exactly one
hit, `src/ui/primitives/icon.ts:77`, still `'M15.8 16.1h3.9'`, on a file this
window does not touch. The entry survives in every clause. So does §5's
`-1,250`/`-2,000` narration in `src/content/default-locale-en.ts`: three of
this window's merges edited that file — #835 the Remove hint, and two keys
this pass's own queue added — and none of them went near the sentences at
`:229`, `:547`, `:620` or `:654` that carry the figure.

**No counter moved — `Proposed` 39, `Accepted` 48, 87 ADR files, next free
0094 — and the way they were counted is the finding.** They were recomputed by
replicating this repository's own algorithm, `statusStatement` from
`tests/foundation/adr-status-reference-contract.test.ts` (the first non-empty
paragraph after `## Status`, then the first status keyword in it), rather than
by a grep written for the occasion. The grep written for the occasion was tried
first and **returned 42 Accepted and 37 Proposed** — 79 against 87 files, eight
documents silently unclassified because their status paragraph runs past the
three lines it read, and it would have written two confident wrong counters into
this header. A file that exists to keep other files honest cannot count with an
instrument it has not checked.

**The "gap" figure is handed back rather than carried or corrected, because
its own stated method does not reproduce it — and this pass first got that
wrong in the other direction.** The previous pass records *"Gap unchanged at
**four** (0051, 0082, 0084, 0088), re-enumerated by subtracting the two
greps."* Three things in this file are called a gap and they are not the same
thing: the numbers absent from `docs/adr/` (six on this tree — `0018`,
`0030`, `0055`, `0058`, `0060`, `0072`), the difference between index rows and
documents (one, the kept `0018` row), and the **self-quoting-cell gap** this
sentence is actually about — index rows whose status cell quotes its own
former `Proposed` wording. **This pass drafted a correction reading "the gap
is six, not four" and retracted it before pushing**: it had measured missing
file numbers and then contradicted a claim about self-quoting cells, which is
the same class of error as reading a count out of the wrong instrument two
paragraphs above. 0051, 0082, 0084 and 0088 are all present on disk; nothing
about them was ever a missing number.

What is left is a figure that cannot be re-derived as written. The stated
subtraction gives `grep '^| \[' docs/adr/README.md | grep -c Proposed` = **43**
minus `grep -c "cell read \`Proposed" docs/adr/README.md` = **2**, which is 41,
not four. Enumerated directly instead — index rows for an ADR whose cell
self-quotes `Proposed` — this tree returns **three**: `0051`, `0082` and
`0088`. **`0084` is not among them**, though the last four readings name it and
the reading before those named 0084, 0051 and 0082 as the three. So the figure
has moved and the enumeration has changed membership twice, and neither the
subtraction the sentence cites nor the count it states matches what is on
disk. `docs/adr/README.md` **is** a member of this window (#832 corrected ADR
0092's row), so a cell could legitimately have changed here. This is reported
and not repaired: the previous figure is left standing beside this measurement
rather than overwritten, per `docs/AGENT_WORKFLOW.md` §4's "mark both
directions", and the next pass inherits a named question instead of a number
it would have to trust.

**The held-number sweep is empty of the thing it is for, and not empty, and the
distinction is the whole reading.** Across **478** remote heads — nine more
than the 469 the previous pass scanned — **no head holds an ADR number at or
above the next free number**, so nothing on any branch can collide with a
document drafted at 0094; that is the fifth consecutive clean reading of the
risk. Scanned broadly rather than only for the risk, the same sweep returns
**three held numbers, all at gap numbers below the maximum, and all abandoned**:
`0018-construction-material-supply.md` on
`claude/construction-materials-supply` — PR #91, closed and never merged,
which is the case `docs/adr/README.md` already explains and
`tests/foundation/documentation-links-contract.test.ts`'s allowlist already
excuses, so the sweep confirms that documentation rather than finding anything;
`0030-restoring-an-interrupted-incident-response.md` on
`fix/352-incident-response-record-persistence` — PR #361, closed and never
merged; and `0030-concurrent-use-ceiling-scope.md` on
`claude/concurrent-use-ceiling-research`, which has **no pull request at all**.
**Two different documents therefore claim 0030.** Neither is reachable from
`main` and neither threatens 0094, so nothing is done about it here beyond
saying so: if either draft is ever revived it collides with the other, not
with the index, and whoever revives one needs to know the other exists. This
is reported, not repaired — the branches are left exactly as they are.

**And the reading itself has a trap that answers confidently and wrongly, hit
by the coordinator twice now and named in the brief for this pass as having
bitten twice.** A loose `grep -oP 'v0\.0\.\d+'` over this file returns
**v0.0.281** first — a version token belonging to a superseded count paragraph
hundreds of lines below the anchor — which would have made the budget
eighty-three releases rather than six. The live span has to be matched whole:

```
grep -oP 'Re-anchored at `main` @ `[0-9a-f]+` \(\*\*v0\.0\.\d+\*\*\)' docs/adr/STATUS-QUEUE.md
```

That returns exactly one line, which is what
`tests/foundation/adr-status-queue-anchor-contract.test.ts` requires. Every
superseded anchor below is kept as a **marked supersession** and never
deleted, and each is invisible to that pattern only because of the
load-bearing line break this header documents further down — so a reader who
greps for the anchor and a gate that counts them agree by construction, and a
re-flow of one kept paragraph breaks both at once.

**A second trap, new at this anchor and of the same family: this file's line
numbers are not the same in two checkouts of it.** The first cut of this pass's
member-set scan took the `## 3.` heading's line number from a listing run in a
*different* checkout of this repository, one whose copy of this file was 147
lines shorter above §3, and cut §§3-6 from that number on the tree being
anchored. The cut started 147 lines early, ended 147 lines early, and dropped
the last 147 lines of §6 — which is where §6's one citation of
`docs/research/README.md` sits — so the scan returned **one** member where the
true answer is two. Caught by re-deriving the heading lines on the tree the
scan ran against, which is the same rule this header already states for
counts: **a number is warranted by the tree it was taken on.** A `file:line`
into this file is the least durable citation in the corpus, §4 of
`docs/AGENT_WORKFLOW.md` says so, and it turns out that includes a
`file:line` into this file used *by* a pass over this file.

**The method, stated because an anchor that does not say how it was earned is
worth nothing.** **Four** passes, in this order — the three every anchor in
this series has run, and the fourth written down two anchors ago and argued
for under pass 4 — each named so a reader can re-run it rather than take it:

1. **The delta pass.** `git diff --name-only 9b8c8e85..1547c7f6` is **21
   files** including this one, so **20** excluding it (+3,812/−37 lines
   outside this file), across **five merged pull requests**, read off `git log
   --oneline --first-parent 9b8c8e85..1547c7f6` excluding the six release-bump
   commits between them (v0.0.359 through v0.0.364, the last of them
   `1547c7f6` itself): #813 ("Re-anchor at v0.0.358 — the window was six
   merges, not the nine I claimed") is the *previous* re-anchor's own commit —
   `2a6033ca`, touching only this file (660 insertions, 322 deletions, nothing
   else) — and it is excluded from the member set the same way a release-bump
   commit is: it is self-referential, and diffing `9b8c8e85..1547c7f6`
   already nets it out, so counting it as a sixth implementing merge would
   double-count this file against itself. The five that remain, in merge
   order: #808 ("Two comments that deny a decision the owner signed and a
   third file implements", `2feb8e6a`, one file), #806 ("Playing what landed
   today — a guard cannot be seen walking at all, and Medium does not even
   change colour", `1c3eee98`, three files), #807 ("The Hire button says
   whether it can act too — the class #772 opened, with #799's lesson pinned
   by a mutation", `638b9349`, six files), #809 ("42% of the open backlog
   cannot be worked as written — an audit of all 85 open issues against
   main", `ba814db9`, two files) and #814 ("A warning has a tone of its own
   (#788) — and ADR 0090's test was pinning the wrong cap", `6d8352a0`, eight
   files). One, three, six, two and eight are twenty, which is the whole of
   the window outside this file, so no file in it arrived by a commit the
   list does not name.
   **The brief for this pass named five merged pull requests, and five is
   right — the first brief in three passes whose merge count survived.** It
   was checked rather than trusted, because the previous two briefs were each
   wrong on the same point: `git merge-base --is-ancestor <merge> 9b8c8e85`
   returns false for every one of the six non-bump merges in the list, so
   none belongs to the previous window, and the previous anchor's own pass 1
   names none of them. **The brief was wrong on one path instead**: it placed
   `ui-design-tokens.test.ts` under `tests/foundation/`, and the file #814
   rewrote is `tests/unit/ui-design-tokens.test.ts` — there is no such file
   under the foundation directory. It changes nothing here, because §§3-6
   cite neither path, and it is recorded because a wrong path in a brief is
   the shape that would have produced a wrong member set had §§3-6 cited it.
   **No merge in the window lands a document in `docs/adr/`**: the directory's
   only changed file is this one, so `docs/adr/README.md` is not a member for
   the first time in four anchors and the bare-`00NN` scan adds nothing.
   The member set was computed rather than recalled — scanning §§3-6 (lines
   5550-9832 on this tree, 87 distinct rooted paths) for backticked rooted
   paths and intersecting with the twenty, **by full path and never by
   basename** — giving **two members**: `docs/research/README.md` and
   `src/ui/hud/hud.ts`.
   **The basename warning gives the right answer by accident for the second
   consecutive anchor, and the reason it does is different from last time.**
   §§3-6 cite three files named `README.md` — the root `README.md`,
   `docs/adr/README.md` and `docs/research/README.md` — and the one window
   file with that basename is the third, a genuine member, so a basename
   intersection returns the same two files. Run both ways rather than argued:
   full-path returns two, basename returns two, and none of the eighteen
   non-members shares a basename with any cited rooted path (checked over all
   eighteen, including `src/ui/hud/staff-panel.ts` and
   `src/ui/hud/regime-panel.ts`, whose neighbour `hud.ts` is cited seven
   times). The anchor before last recorded the phantom, the previous one the
   coincidence of both README files changing; this is the coincidence of only
   the cited one changing, and three windows giving three different reasons
   for the same rule is the argument for the rule.
   **A third scan, run because the previous anchor's CSS bullet names files by
   bare basename, reaches two more window files the rooted-path scan cannot.**
   §5's ADR 0025 entry names `tokens.css` and `primitives.css` with no
   directory, and both changed in this window: #814 added the `caution`
   tone's tokens to `src/ui/tokens.css` (+13, three hunks at `:195`, `:242`
   and `:254`) and one rule to `src/ui/primitives/primitives.css` (+1 at
   `:138`). Neither is a member by the stated method and both were read
   anyway, under pass 2 below, because the claim they carry — a count of
   `.css` files and an absence in them — is exactly the shape a window that
   edits them can falsify.
   **The overlap with the previous anchor's eleven members is two** — both of
   this anchor's two — so `docs/research/README.md` and `src/ui/hud/hud.ts`
   are members for the second consecutive anchor, and the other nine of that
   anchor's set are untouched here. That window was four HUD changes, a
   documentation correction and an operating-method append; this one is two
   HUD changes, two research records, one comment correction and one index
   repair, and the two shared members are the index the records land in and
   the HUD file every HUD change reaches.
2. **The mechanical re-derivation of every `file:line` span and every quoted
   sentence in §§3-6 into those two members, plus the two the bare-basename
   scan reaches.** No span moved, every quoted sentence held word for word,
   and one live claim was falsified outright — by a branch, not by a file.
   - In `src/ui/hud/hud.ts`: **every one of the seven citations is unmoved for
     the second consecutive anchor, and this time the bound is one hunk.**
     `export type HudIntent =` `:321`, the union closing at `:640`,
     `HudUnavailableNotice` `:654`, `arm-build-tool` `:454-459`,
     `arm-room-tool` `:635-640`, `cancel-build-order` `:496` and
     `dismiss-alert` `:594` all hold, measured rather than inferred: `git diff
     --unified=0 9b8c8e85..1547c7f6 -- src/ui/hud/hud.ts` reports **one**
     hunk, `@@ -2161,0 +2162,6 @@`, six lines added and none removed, inside
     `mountHud` — #807's `staffPanel.setTreasury(next.counts)` at `:2167`,
     beside the `buildPanel.setTreasury(next.counts)` at `:2140` it mirrors.
     **The live count holds at TWENTY members, re-derived by the stated
     method** (`readonly kind: '` between `export type HudIntent =` and the
     union's close returns 20) **and the reason is the same one the previous
     anchor recorded, one window later**: #807 gave the Hire button a real new
     behaviour — it now says whether it can act — and routed the treasury to
     the staff panel as a setter, not as an intent; the panel's own comment
     on that setter (`src/ui/hud/staff-panel.ts:489`) says the line *"decides
     nothing"* and that `BuildPanel.setTreasury` *"is the same setter for the
     same reason on the Buy button"*. So this is the second consecutive window
     to add a control's behaviour to this file without adding a member, and a
     reader who incremented on seeing "the Hire button gained a state" would
     be at twenty-one for the second time.
   - In `docs/research/README.md`: the rule §6 rests on **holds**, at `:9`
     and word for word — *"are read-only history: when the code moves on, a
     record here does not become wrong, it becomes older. Do not update one to
     match current `main`"* — on a file this window changed in **three
     hunks**, and the shape of the change is worth one sentence because it is
     the first time in this series the file has been repaired rather than
     appended. `git diff --unified=0 9b8c8e85..1547c7f6 --
     docs/research/README.md` reports `@@ -70,2 +69,0 @@`, `@@ -72,0 +71 @@`
     and `@@ -95,0 +95,2 @@`: #809 removed a line that carried a **duplicate**
     row for the 2026-08-30 *what a classification can reach* record with the
     *what stays readable under the pseudo-locale* row **glued onto its end** —
     a lost newline — together with a blank line inside the table, and
     restored the pseudo-locale row on a line of its own; #806 and #809
     appended one record row each. Rows matching `^| \[` went 42 → **44**:
     minus one duplicate, plus one row un-glued, plus two records. **None of
     it touches §6's entry**: that entry is about the *records* being
     read-only, the README's table is the index of them and not one of them,
     and the two records §6 cites — `docs/research/2026-08-25-economy-rate.md:443`
     and `:630` — are not in the window and still read *"Proposed, not"* and
     *"(Proposed —"* at those lines. The gate still exempts the directory by
     prefix (`tests/foundation/adr-status-reference-contract.test.ts:148`,
     `path.startsWith('docs/research/')`), so *"Deliberately left, and to stay
     left"* stands in every term.
   - In `src/ui/tokens.css` and `src/ui/primitives/primitives.css`, reached by
     the bare-basename scan: the ADR 0025 withdrawal §5 quotes **holds in
     every clause that is about CSS, on two files this window edited.**
     `find src/ui -name "*.css"` still returns **four** — `src/ui/brand.css`,
     `src/ui/hud/hud.css`, `src/ui/primitives/primitives.css` and
     `src/ui/tokens.css` — so the count this entry once got wrong is still
     right; `3.9` appears in **none** of the four, re-run rather than carried,
     after #814 added fourteen lines across two of them; and `grep -rn '3\.9'
     src/` still returns exactly one hit, `src/ui/primitives/icon.ts:77`,
     still `'M15.8 16.1h3.9'`, on a file this window does not touch. The
     seventh `BadgeTone` #814 added is `caution`
     (`src/ui/primitives/status-badge.ts:42`), and it is named here only
     because it is what the fourteen lines are: a tone, not a headroom figure.
   - **The one falsified live claim in this window, and no file in the window
     did it.** §3's held-number sweep ended, at the previous anchor, *"The
     held-number sweep itself returns NOTHING for the first time"*, true of
     444 remote heads at `9b8c8e85`. At `1547c7f6` the same sweep over
     **449** heads (`git ls-remote --refs --heads origin`, then `git ls-tree
     --name-only <head> -- docs/adr/` over every one) finds **0092** held on
     `docs/where-a-guard-stands-and-what-route-they-walk`, as
     `0092-who-decides-where-a-guard-stands.md`, unmerged — while
     `docs/adr/README.md`'s **Next free number** line still reads **0092**.
     So the index is again offering a number a branch has taken, one anchor
     after the first reading that found nothing held, and §3 is corrected in
     both directions rather than overwritten. **A held number is the one class
     of claim in §3 that no file in any window can move**, which is why it is
     the one claim a delta pass has to re-run rather than intersect; the
     previous anchor said so and this window is the instance.
   - **What #808 changed that §§3-6 do not cite, checked rather than
     assumed.** #808 corrected two comments in `src/ui/simulation-events.ts`
     (`:237` and `:635` on the tree before it, by its own account) that said
     ADR 0084 decision 4 was not taken, when `src/ui/hud/event-band-dwell.ts`
     implements the ruling. A grep over §§3-6 for that file, for *"decision
     4"* and for *"dwell"* returns nothing — 0084 is cited in §5 only as the
     ADR whose decision 3 added `dismiss-alert` to `HudIntent` — so there was
     nothing here to invert, and it is reported because #808 is exactly the
     shape §6 exists for (a comment denying a decision the owner signed)
     landing in a file this document never reached.
3. **Reading the file's own headings and counts against each other.** Seven
   places count something here and all seven were opened, and **this is a
   window that moves none of them** — the shape the header's own `feb46af`
   paragraph names as the one that gives nobody a reason to touch a count,
   and therefore the moment at which extending one costs anything.
   - **The four that count §2 all read eight and all four are correct**: this
     header's opening paragraph, the title (which states a subject and no
     count), §2's own heading, and §5's preamble. No entry was filed and none
     was deleted, and **no ADR arrived at all** — so there was neither an
     abandonment nor an exemption to record, which is the first window since
     the rule was restated with nothing whatever to test the four against.
     That is the fifth consecutive anchor at which no entry was filed, and
     the weaker of the two possible results for the fifth time.
   - **The three that count `Proposed` documents hold at THIRTY-SEVEN**, and
     the header's own paragraph is extended with them rather than left, for
     the reason the `feb46af` paragraph gives. Counted on disk by the method
     every reading in this sequence has used — the first non-blank line under
     each document's own status statement, `## Status` heading or `- Status:`
     bullet alike — **thirty-five** under a heading and **two** (0064, 0067,
     still the only two) under a bullet, out of **85** documents. The index
     agrees on its status column: `grep -cE '^\|.*\| *\*{0,2}Proposed'
     docs/adr/README.md` returns **37** against **48** `Accepted` across
     **85** linked rows. **And the disk scan has a self-quoting trap of its
     own, hit here and caught by §3's own paragraph about it**: a `grep -c
     Proposed` over the 85 status lines returns **38**, because ADR 0013's
     *Accepted* line says its §§5-6 *"remain Proposed"* — the same shape as
     the four index cells that quote the word, in a document's status line
     rather than an index row. §3's *"A miscount this pass made and caught"*
     paragraph recorded exactly this at `53e1405`, and it is what made the 38
     legible in a minute rather than an hour.
   - **All four places that count `Proposed` were current when the window
     opened, for the second consecutive anchor**, and this time nothing
     arrived to move them — so the control the previous anchor called weak is
     weaker still: a window with no arrival exercises nothing.
   - **`docs/adr/README.md`'s Next free number is 0092, unmoved, and the
     held-number sweep finds 0092 HELD** — see pass 2 above. The line itself
     is the correct `max + 1` off disk, which is what the index's own
     paragraphs say the line states; what the sweep adds is that the next
     drafter must be handed **0093**, and that the pull request landing 0092
     owes the move of that line, as #800 moved it for 0091. Reported rather
     than edited: that file is not a re-anchor's surface.
   - **The self-quoting-cell gap is unchanged at FOUR**, re-run rather than
     reasoned about: `grep '^| \[' docs/adr/README.md | grep -c Proposed`
     returns **41** where the anchored status-column regex returns **37**, and
     the four rows are still 0051's, 0082's, 0084's and 0088's, enumerated.
   - `src/simulation/economy/income.ts` is untouched in this window (not among
     the 20) and still carries no count: `grep -c "Proposed"
     src/simulation/economy/income.ts` returns **0**, run rather than
     inherited — the weaker of the two results, for the sixth consecutive
     anchor. No file under `supabase/migrations/` changed either, so §3's
     table needed no re-derivation and its two absences hold; the directory
     still holds twenty-three files, counted again. **0072 is still not a
     member and still not missing**, and neither are 0030, 0055 and 0058: no
     such document exists on disk, checked with `ls docs/adr/00NN-*.md` on
     all four rather than carried forward.
4. **The §2-entry pass, written down two anchors ago and asked for by
   [#608](https://github.com/matmaxalez/lockstate/issues/608).** See the rule
   stated in full immediately below; what it found in this window is recorded
   there too.

**THE SCOPE RULE, WRITTEN DOWN BECAUSE IT DID NOT EXIST.** A re-anchor's
surface is `docs/adr/STATUS-QUEUE.md` **and nothing else** — that is why this
header's pass 2 has twice refused to fix a stale code comment it found and
repeated the handover instead, and why two earlier anchors record that
*"flipping a status is not a re-anchor's job"*. **Both of those exclusions
point outward, at other files.** A §2 entry is **inside** the surface, and this
file's own introduction states the contract that settles it: *an entry's
evidence is a claim about `main`, so landing the change an entry describes
means updating that entry in the same commit.* So §2 entry **content** was
never out of scope on principle. Nobody had written the scope down. **What
actually kept it out was cost, and the delta method already bounds that**:
re-verifying every §2 entry at every anchor is unbounded work, but a §2 entry
can only have stopped being true about `main` if something inside the delta
window moved it. **The rule, therefore: re-read the §2 entries whose subject
landed inside the delta window, by the same intersection pass 1 already
performs for §§3-6 spans.** No new pass over the corpus — one more
intersection, against a set that is already computed.

**Where #608 came from, because the rule is only as convincing as the instance
that forced it.** ADR 0074's §2 entry kept a pre-fix measurement in the present
tense — a restored 8×8 yard answering `Infinity` — after **#571** landed the
recovery that made a restored yard answer 4. The entry was owed an update by
this file's own contract and did not get one, and **no gate in this repository
could have asked for the correction**: `docs/adr/0074-…md` did not change in
the window that would have had to catch it, §2 is not covered by the §§3-6
derivation, and the sentence that went false is prose. #608 raised it, made the
argument against itself first (in context the sentence is an argument's
evidence rather than a free-standing claim), and then settled it the other way
on the introduction's contract. The instance was corrected in both directions
in §2 below; the entry there records that #608's second half — *"whether
re-anchoring should cover §2 entries whose subject has since landed"* — was
**left open for the owner**. It was answered at `0e2eb7fb`, by the owner's
decision, and that paragraph is the record of it. (This sentence read *"at
the previous anchor"* through two re-anchors after the one that wrote it, and
is pinned to the commit here because *previous* moves and a sha does not.)

**What the extra intersection found at this anchor: NOTHING in both halves,
for the first time.** Both directions were run over §2's eight entries.
- **By path, ZERO of the eight entries touch this window.** §2's twenty-four
  rooted paths intersect the twenty in nothing, and its eleven
  [`README.md`](./README.md) links all resolve to `docs/adr/README.md`, which
  is not in the window — the first time since the rule was written that no
  entry is reached by path at all. The previous two readings found seven of
  eight reached through one README hunk each; this one finds the README
  unchanged, so the recipe *"the exact line that would replace the status"*
  in every entry is untouched by construction. Both scans — rooted path and
  link text — were run, because the previous anchor left the note that the
  link text is where seven of the eight live.
- **By subject the result is NOTHING, and the enumeration establishes it.**
  No §2 entry's subject landed in this window, checked entry by entry against
  the twenty rather than inferred from the merge titles: ADR 0008's benchmark
  scenario (`benchmarks/scenarios/actor-render-publication.mjs`) and
  `docs/BENCHMARKING.md` are not in the window; the server entry point's
  `public/_headers` and `docs/DEPLOYMENT.md` are not; ADR 0056's
  `src/simulation/prisoners/action-system.ts` is not; ADR 0059's
  `src/simulation/locomotion/locomotion-system.ts` is not; ADR 0074's
  `src/simulation/objects/room-capacity.ts`,
  `tests/migrations/save-v4-room-bounds.test.ts` and
  `tests/fixtures/persistence/save-v4-yard.json` are not; ADR 0071's
  `tests/helpers/open-ground.ts` and `src/content/room-catalog.ts` are not;
  and ADR 0077's `src/simulation/security/guard-roster.ts` and
  `guard-locomotion.ts` are not. The twenty are two HUD panels, one badge
  primitive, two stylesheets, one affordability helper, one comment
  correction, seven test and harness files, two research records and their
  index, and the version bump — none of which any of the eight is about.
- **The non-mechanical step, run against the five merges with the eight
  subjects in hand.** #808 is about ADR 0084 decision 4; #814 about #788 and
  ADR 0090; #807 about the #772 class of controls that say whether they can
  act; #806 and #809 are research records. No §2 entry has any of those as
  its subject, so the human half of the rule rejects all five, and for the
  second window running it had something plausible to reject rather than
  nothing to read.
- **What the rule does NOT reach, said plainly so it is not mistaken for
  coverage.** ADR 0056's evidence (issue #437 reproduced on `6f671d5`) and ADR
  0074's own measurement are outside this window, so the rule is silent about
  them — exactly as designed, and exactly the limitation §2's ADR 0074 entry
  already names when it says both were *"deliberately not checked"*. The rule
  bounds cost by giving up completeness; it buys the entries the window can
  have broken, and no others.

**Three things the previous anchor handed back rather than assumed were
re-read at this anchor rather than carried, and all three stand.** ADR **0023**
still asserts *"Object placement does not exist"* at
`docs/adr/0023-room-occupancy-authority.md:91` and *"placement does not
exist"* at `:309`; ADR **0027** still does at
`docs/adr/0027-cell-sharing-assessment.md:81`; neither file is in the window
and neither line moved. **One thing about the first of those is new, found by
opening the line rather than grepping for it**: 0023's `:91` cites its own
`:54` as where the quoted sentence sits, and `:54` on this tree is a sentence
about *"mirrors of shipped artifacts"* — a `file:line` that drifted inside the
ADR, of the kind #481 once corrected for ADR 0022's `HudRoomGesture` anchor,
and handed over the same way. ADR **0086** still reads
`**Proposed, 2026-09-01. Not self-approved.**` at
`docs/adr/0086-what-refreshes-a-pulled-hud-readout.md:22`, its 2026-09-02
amendment still begins at `:526` and the section #765's sweep added inside it
at `:616` is still unsigned — an amendment is not a status, for the third
consecutive anchor on the same document. And the index's next-free line is the
subject of pass 2's falsified claim above: **0092 is held**, where the previous
anchor found nothing held. All of it is handed on, not fixed: none of those
files is a re-anchor's surface, and flipping a status is not a re-anchor's job.
§5's two sentences saying ADR 0054 *"remains `Proposed, not self-approved`"*
are still true — 0052 and 0054 both still read `**Proposed, 2026-08-28.** Not
self-approved.` on disk — and are left as found.

**Recommendation.** Re-anchoring at six of ten cost one read of twenty files
and returned, in the order the passes found them: a brief whose merge count
was right for the first time in three passes and whose one wrong path would
have mattered had §§3-6 cited it; a member-set scan that returned one member
before its section boundaries were re-derived on the right tree and two after;
seven `hud.ts` citations that held under a one-hunk window and a `HudIntent`
count that held because a second consecutive control was routed as a setter
rather than an intent; a research index repaired rather than appended, with
the rule §6 rests on intact at `:9`; two stylesheets edited by the window and
reached only by a bare-basename scan, whose absence claim was re-run and held;
one live claim falsified by a branch rather than a file — the held-number
sweep, which found 0092 held one anchor after it first found nothing; a
`Proposed` count that did not move, with a self-quoting trap in the disk scan
that §3's own paragraph made cheap; and a §2 scope rule that returned nothing
in both halves for the first time, with the enumeration that establishes it.
**Every one of those is cheaper found now than found by a red gate.**
Recommendation 1 at the foot of §6 — cite by symbol, not by line — was not
even tested this window: no cited line moved, because the two files the
window reached were edited below every span cited into them. **The one thing
this pass does not have is its own schedule**, for the second consecutive
anchor: it was dispatched at six of ten against a rule written in capitals two
anchors ago, one release late, and the honest reading is that a rule two
passes have missed by two and then by one is being approached rather than
kept.

**The anchor before this one, kept — v0.0.402.** It read: *"Re-anchored at `main` @
`402453a9` (**v0.0.402**) by the delta method this header describes, from the
v0.0.393 anchor described below. Nine of the ten releases the budget
allows."* It is the only pass in this sequence since the halfway-mark rule was
written in capitals to have spent nine deliberately, and it argued for the
choice rather than drifting into it: the queue held six green mergeable pull
requests plus two that landed mid-pass, and anchoring at five would have meant
two passes over a 10,000-line file inside ninety minutes for a window of four
files each. Its window was 32 files across eight implementing merges (#843,
#845, #852, #841, #833, #855, #854, #856), with #851 excluded as
self-referential, and its delta intersection was **ten members besides this
file — the widest any pass here has had**, because #833 and #843 worked the
construction-and-procurement surface §5 cites more densely than any other. It
moved no counter — `Proposed` 40, `Accepted` 48, 88 documents, next free 0095 —
and its finding was **the cost of the completed branch cleanup**: 338 of 466
branches deleted with zero failures, the remote down to 129, and one commit
cited in a *test comment* orphaned, because the citation guard #852 had
narrowed to `docs/` did not read `tests/` or `src/`. #856 repaired it and
widened the guard; the old scope saw 342 cited shas and the new one 356.
**Two things it left for its successor and both were taken here**: its record
of §2 as *"unmoved at eight live entries"*, which #863 split one commit later
by moving two of the four places that state it and not the other two; and its
own `Proposed` reading of forty, which ADR 0093's acceptance in that same
commit took to thirty-nine — the first movement in this chain caused by an
acceptance rather than an arrival.


**The anchor before that one, kept — v0.0.393.** It read: *"Re-anchored at `main` @
`f36148d7` (**v0.0.393**) by the delta method this header describes, from the
v0.0.388 anchor described below. Five of the ten releases the budget
allows."* It was taken at the halfway mark for the second consecutive pass and
held six green mergeable pull requests rather than spend the window. Its window
was 26 files across four implementing merges (#846, #848, #849, #850) and its
delta intersection five. **It settled the "gap" figure the pass before it had
handed back unresolved, and the answer was that the instrument had moved rather
than the tree**: rows self-quoting `Proposed` with backticks are two (0051,
0082) and rows quoting it with double quotes as well are three (adding 0088),
so two anchors an hour apart differed by one character of grep and
`docs/adr/README.md` had not changed 0088's row at all. It also recorded the
first counter to move in four windows — `Proposed` 39 became 40 when ADR 0094
landed — and **the first defect the branch cleanup caused**: the twenty-branch
trial batch orphaned a commit cited in ADR 0063, because squash-merging leaves
every intermediate commit on the branch and nowhere else.


**The anchor before that one, kept — v0.0.388.** It read: *"Re-anchored at `main` @
`98e05058` (**v0.0.388**) by the delta method this header describes, from the
v0.0.383 anchor described below. Five of the ten releases the budget
allows."* It was the **first pass in the sequence to be dispatched at the
halfway mark by watching a merge land** rather than by reading the budget on a
schedule, which is the fix the pass before it had prescribed for its own miss
at six; it held six green mergeable pull requests rather than spend the window.
Its window was 10 files across four implementing merges (#835, #832, #836,
#840), with #837 excluded as self-referential, and its delta intersection was
five. It moved no counter — `Proposed` 39, `Accepted` 48, 87 documents, next
free 0094 — and it recorded three things this pass builds on directly: that the
counters must be computed with `statusStatement` from
`tests/foundation/adr-status-reference-contract.test.ts` rather than a grep
written for the occasion (the grep it tried first answered 42/37 over 79 of 87
documents); that the held-number sweep is clean for the collision risk it
exists for while a broad sweep finds three abandoned drafts, two of them both
claiming 0030; and that the **"gap" figure cannot be re-derived as written**.
It also **wrote a retraction into this header**, of a correction reading *"the
gap is six, not four"* that it drafted and withdrew before pushing, having
measured absent ADR file numbers and used them to contradict a claim about
self-quoting index cells.


**The anchor before that one, kept — v0.0.383.** It read: *"Re-anchored at `main` @
`aa762112` (**v0.0.383**) by the delta method this header describes, from the
v0.0.377 anchor described below. Six of the ten releases the budget allows,
counted on the tree this commit is written against."* It was dispatched at
**six** of ten — one release past the halfway mark, after the pass before it had
kept the mark exactly — and it named its own cause rather than the number:
the budget had been read as part of a routine health check instead of watched
as merges landed, so one merge slipped between a reading that said four and a
reading that said six. That diagnosis is the reason this anchor exists at five;
it was applied rather than quoted. Its window was 13 files across five
implementing merges, its delta intersection eleven. It moved no counter —
`Proposed` 39, `Accepted` 48, 87 rows, next free 0094 — and it recorded two
firsts: a cited span that had moved for the first time since v0.0.358
(`ui-hud-messages.test.ts`, `:218-224` to `:269-275` by #827, byte-identical),
and the mutation the anchor before it had watched survive on this file, now
caught by `tests/foundation/adr-status-queue-anchor-contract.test.ts`'s
positional gate on the live next-free restatement (#831). It also carried
forward the trap this header still documents below, the loose
`grep -oP 'v0\.0\.\d+'` that answers **v0.0.281**.


**The anchor before that one, kept — v0.0.377.** It read: *"Re-anchored at `main` @
`708b68c7` (**v0.0.377**) by the delta method this header describes, from the
v0.0.372 anchor described below. Five of the ten releases the budget allows,
counted on the tree this commit is written against."* It was dispatched at
**five** of ten — the halfway mark exactly, and the first pass in the sequence
to keep the rule rather than miss it, triggered by the reading itself before
two clean pull requests were merged. Its window was 10 files against four
implementing merges (#822, #823, #824, #825) with #821 excluded as
self-referential — the thinnest window in the sequence, which it named as the
price of keeping the rule. Its delta intersection was **three**
(`docs/AGENT_WORKFLOW.md`, `docs/adr/0092-*`, `docs/research/README.md`), with
`package.json` **excluded with its reason**: it appeared in §§3-6 only inside
the previous anchor's narrative enumeration of its own window, a mention in a
list rather than a citation of a claim, and a release bump edits it by
construction. It moved no counter — `Proposed` 39, `Accepted` 48, 87 rows,
gap four, next free 0094 — and found the held-number sweep empty for the third
consecutive reading across 459 heads. It found **one live claim falsified
inside its own window by the coordinator's own merge**: ADR 0092's status said
no code implemented any of it while #825 had shipped decision 3, and it handed
that back rather than editing it. It also **ran a mutation on this file and
watched it survive**: changing the live next-free restatement 0094 → 0093 left
all 466 foundation tests green, because the only gate reading such a line read
the index's and not this file's — recorded rather than covered, and closed one
window later by #831. And it recorded that its own prose had changed what its
method could see: ADR 0092 became reachable by the rooted scan only because the
anchor before it had written the full path.


**The anchor before that one, kept — v0.0.372.** It read: *"Re-anchored at `main` @
`b2941064` (**v0.0.372**) by the delta method this header describes, from the
v0.0.364 anchor described below. Eight of the ten releases the budget allows,
counted on the tree this commit is written against."* It was dispatched at
**eight** of ten — the largest miss in the sequence — and recorded the reason
rather than smoothing it: the pass was held deliberately while six pull
requests drained one at a time so that one window would describe seven merges
instead of two describing the same seven. Its window was 21 files against
seven implementing merges (#810, #811, #815, #818, #816, #817, #820) with #819
excluded as self-referential, and it was the **first window in this file's
history with no file under `src/`** — three ADRs, two research notes, two
indexes, eleven foundation tests, two integration tests and a version bump.
Its delta intersection was **three**, and the third member was reachable only
by the bare-basename scan the two anchors before it had recorded as a trap:
ADR 0092 is cited in §3 with no directory. That was the first window in which
that scan added a real member rather than a phantom or nothing. It moved
`Proposed` **thirty-seven → thirty-nine** — the first reading in the sequence
where the count moved because ADRs arrived rather than because a sentence
rotted — held `Accepted` at 48 across seven merges, and found the held-number
sweep empty for the second time in its history and for the opposite reason to
the first: both held numbers had landed. It also found **one live sentence in
§2 falsified**, that a `Proposed` row in the index *"is the only one"* against
thirty-nine, and recorded that the paragraph named the one way it expected to
break and broke another way entirely — by accumulation, which no gate could
have caught, because §2's counters count §2's entries and that sentence is a
claim about the index's rows.


**The anchor before that one, kept — v0.0.364.** It read: *"Re-anchored at `main` @
`1547c7f6` (**v0.0.364**) by the delta method this header describes, from the
v0.0.358 anchor described below. Six of the ten releases the budget allows,
counted on the tree this commit is written against."* It was dispatched at six
of ten and recorded that one-release miss rather than folding it into the
account, noting it was the smallest the series had then recorded. Its window
was 21 files against five implementing merges (#808, #806, #807, #809, #814)
with #813 excluded as self-referential; its delta intersection was **two**
members — `docs/research/README.md` and `src/ui/hud/hud.ts` — and it recorded
the intersection as the coincidence case for a new reason: §§3-6 cite three
files named `README.md` and only the genuinely cited one was in the window.
Neither member's spans moved. `hud.ts` took one hunk below all seven of its
citations and `HudIntent` stayed at 20, the second consecutive window to add
behaviour without touching a member. It moved no counter — §2 at eight for the
fifth consecutive anchor, `Proposed` at thirty-seven, next free at 0092 — and
found **one live claim falsified by a branch rather than by a file**: §3's
held-number sweep *"returns NOTHING"*, inverted one anchor after it was
written, by 0092 being held on
`docs/where-a-guard-stands-and-what-route-they-walk`. It ran the §2 scope rule
to **zero of eight** by path, the first time that had happened, and nothing by
subject. It also recorded the disk-scan form of the self-quoting trap: a bare
`grep -c Proposed` over the 85 status lines returned 38, because 0013's
*Accepted* line mentions its §§5-6 remaining Proposed.


**The anchor before that one, kept — v0.0.358.** It read: *"Re-anchored at `main` @
`9b8c8e85` (**v0.0.358**) by the delta method this header describes, from the
v0.0.351 anchor described below. Seven of the ten releases the budget allows,
counted on the tree this commit is written against: `package.json` ships
0.0.358 at `9b8c8e85` and the anchor being replaced named v0.0.351."* It was
dispatched at seven of ten and recorded that as a miss against the rule the
anchor before it wrote, noting that the same number had that day ended once in
a red `main` and once in seven frozen pull requests. Its window was 44 files
against six merged pull requests (#799, #800, #801, #802, #803, #805), its
delta intersection was eleven members plus two the bare-number scan added
(0086 and 0091), and its mechanical re-derivation moved two spans in
`src/main.ts` (the consent-mount gate `:3072` → `:3108` and the mount call
`:3076-3081` → `:3112-3117`), held all seven `hud.ts` citations on a file that
gained 136 lines, and found one live claim falsified — §3's *"0091 is held,
not landed"*, inverted by the very pull request that paragraph named as
holding the number. It corrected the brief it was given by three merges and
two ADR arrivals, all belonging to the previous window; recorded the first
held-number sweep in the file's history to find nothing held; moved the
`Proposed` enumeration thirty-six → thirty-seven with all four counting places
current at the start; found the basename intersection right by coincidence
where the anchor before it had found a phantom; and ran the §2 scope rule to
seven-of-eight by path through one README hunk and nothing by subject.

**The anchor before this one, kept — v0.0.351.** It read: *"Re-anchored at `main` @
`0e2eb7fb` (**v0.0.351**) by the delta method this header describes, from the
v0.0.346 anchor described below. Five of the ten releases the budget allows,
counted on the tree this commit is written against."* Its window was 43 files
against four merged pull requests, its delta intersection was ten members (plus
two the bare-number scan added, 0086 and 0088), and its mechanical
re-derivation found four moved spans, one `file:line` claim false on the tree
that wrote it (#796's *"line 131"*), and one command this file offers a reader
to re-run that does not run — a `grep` whose fourth argument names a
`brand.css` under `src/ui/primitives/`, where the real file is one directory
up — from which the previous anchor read a conclusion that
happened to be right. **That path is deliberately described rather than
written as a span here, and the first draft of this record proved why**:
written out, `tests/foundation/documentation-links-contract.test.ts` came back
red naming *"docs/adr/STATUS-QUEUE.md -> src/ui/primitives/brand.css"* — one
failure, the exact defect, found without being looked for, which is the same
measurement that anchor recorded and is repeated because the trap caught the
pass that had just read the warning. It wrote down the §2 scope rule this header now carries,
answered #608 with the owner's decision, repaired this header's own `Proposed`
paragraph after six anchors, moved the `Proposed` enumeration thirty-four →
thirty-six, recorded the fourth instance of the self-quoting-cell trap in ADR
0088's row, and handed over a held number (0091) the index's next-free line had
already given away.

**The anchor before that one, kept -- v0.0.346.** It read: *"Re-anchored at `main` @
`33a4a22e` (**v0.0.346**) by the delta method this header describes, from the
v0.0.340 anchor described below. Six of the ten releases the budget allows,
counted on the tree this commit is written against."* Its window was 47 files
against five merged pull requests, its delta intersection was nine files (seven
of them shared with the anchor before it), and its mechanical re-derivation
moved two spans — `ConstructionProcurementSink`'s declaration `:251` → `:282`,
and `ui-hud-messages.test.ts`'s cited `it` block `:355-361` → `:362-368` —
while every quote-based citation held. Its third pass found that §5's first
bullet had never been given the confirmation sentence §3's opening and §6's
`income.ts` bullet both carried, and added it dated to both anchors it was
owed. It also re-opened the `materials-procurement.ts` construction-rung
comment and reported it **still stale**, eleven merges after #785 made it so —
**a handover #796 then discharged four releases later, and the only one in
this file's history paid by the pull request that had a reason to open the
file rather than by an integrator afterwards.** One thing in that account does
not survive this pass and is corrected in pass 3 above rather than in its own
paragraph: the CSS grep it offered a reader to re-run names a fourth path that
does not exist, so the command it quotes cannot run as written.

**The anchor before that, kept — v0.0.340.** It read: *"Re-anchored at `main` @
`26434e8e` (**v0.0.340**) by the delta method this header describes, from the
v0.0.328 anchor described below. Twelve of the ten releases the budget
allows — two past it, the only overrun in this series — counted on the tree
this commit was written against."* Its window was 101 files against eleven
merged pull requests, its delta intersection was twelve files (eight shared
with the anchor before it, four new from the alerts-corner and rung work),
and its mechanical re-derivation found `ConstructionProcurementSink`'s
declaration moved `:224` → `:251` (+27, a docblock from #769), six `hud.ts`
citations moved a non-uniform +7/+8 from #775's and #785's work, `state-machine.ts`'s
fourth `transition()` call moved `:1376` → `:1410`, `src/main.ts`'s
consent-mount gate moved `:3023` → `:3044`, and `ui-hud-messages.test.ts`'s
cited `it` block drifted to `:355-361`, 137 lines from where `bb3a01e` first
named it — six spans in nine members, the rest unmoved. Its own third pass
found the four-place §2 sweep still agreeing at eight and the Proposed count
still agreeing at thirty-four across "the three places that count `Proposed`
documents" — a claim the `33a4a22e` pass found true of two of the
three and unverified of the third, corrected there rather than at `26434e8e`
because finding it took reading §5's first bullet directly rather than
trusting the sentence that named it. It also found, and recorded rather than fixed, that
`src/simulation/construction/materials-procurement.ts`'s `ConstructionFundingRefusalReason`
docblock had gone stale under #785's rung-equalisation five merges earlier in
the same window — a handover the `33a4a22e` pass re-opened and found still
outstanding eleven merges later, and which #796 discharged at `315dbbb6`
inside *this* anchor's window.

**The previous anchor's account, kept.** It read: *"Re-anchored at `main` @
`5144eb9e` (**v0.0.328**) by the delta method this header describes, from the
v0.0.319 anchor described below. Nine of the ten releases the budget allows,
counted on the tree this commit is written against: `package.json` ships
`0.0.328` and the anchor being replaced named v0.0.319 — one release of
headroom remains: the next merge reaches the bound exactly, and the one after
that spends it."* Its window was 58 files against nine merged pull requests,
its delta intersection was twelve files (the widest this file's history had
then produced), and its mechanical re-derivation found nine spans moved,
across `state-machine.ts` (the three `protocol/handshake` receivers and the
four `transition()` sites), `icon.ts` (`3.9` → `:77`), `hud.ts` (six citations,
from a twentieth `HudIntent` member, `dismiss-alert`), `commands.ts`
(`simulationCommandSchema` → `:597`, discriminating fifteen members) and
`save-schema.ts` (one comment, unmoved in substance). Its second pass found
the three places counting `Proposed` documents had fallen behind the tree by
one (thirty-three read where thirty-four was true, from ADR 0084's acceptance
and ADR 0086's and ADR 0087's arrival) and corrected all three; a fourth
finding discharged the file's longest-standing handover, the "seventeen
post-hoc additions" count `docs/adr/README.md` rulings 3 and 4 rest on,
re-enumerating it at 33 (26 covered, 7 not) rather than seventeen. Both
corrections stand as written; the ADR count needed no further correction here
because the true count did not move again, and the post-hoc-additions
enumeration is untouched by this window because none of its 33 members'
covering commits is among this window's eleven.
`b04e45f` (**v0.0.319**) by the delta method this header describes, from the
v0.0.309 anchor described below. Ten of the ten releases the budget allows,
counted on the tree this commit is written against: `package.json` ships
`0.0.319` and the anchor being replaced named v0.0.309 — the budget reached
exactly, at the edge this series has never let itself run past."* Its window
was 60 files against nine merged pull requests, its delta intersection was
three files (the narrowest a nine-merge window had produced), and its
mechanical re-derivation over all 115 spans found one moved — `just-in-time-
materials.ts`'s `JustInTimeMaterialsService` declaration, `:281`→`:304`, with
`materials-procurement.ts`'s citation unmoved at `:224`. Its second finding,
from reading §5 against its own mirror in §6 rather than from delta or
derivation, was that the two bullets counting §2-filed `Proposed` documents
disagreed with the tree by one and with each other by one — the true count
was five exceptions (0056, 0059, 0074, 0071, 0077) against twenty-eight
outstanding, not either bullet's own carried-forward tally. Both corrections
stand as written; neither is touched by this window, because none of the six
files either finding turned on is in this window's 58.

**The anchor before that one, kept.** It read: *"Re-anchored at `main` @
`4ac0973` (**v0.0.309**) by the delta method this header describes, from the
v0.0.301 anchor described below. Eight of the ten releases the budget
allows, counted on the tree this commit is written against: `package.json`
ships `0.0.309` and the anchor being replaced named v0.0.301."* Its window
was 61 files against seven merged pull requests, its delta intersection was
ten files, and its mechanical re-derivation found two live anchors moved —
`materials-procurement.ts:213`→`:224` and `save-schema.ts:1289`, both inside
files its own delta intersection already named — and one substantive
finding: 0082's acceptance in the same commit that implements it moved the
`Proposed` count from thirty-two to thirty-one. What follows below is that
pass's own writing, kept in full because it is the record of how those
numbers were earned.

**The method, stated because an anchor that does not say how it was earned is
worth nothing.** Three passes, in this order, and each is named so a reader
can re-run it rather than take it:

1. **The delta pass.** `git diff --name-only 0352116..4ac0973` is **61
   files** across **seven merged pull requests** — #731 (ADR 0082's build-order
   placement sequence), #729 (the worker's refusal wording), #732 (a restored
   guard says `Returning`), #728 (documentation only, the determinism
   fingerprint's stated scope), #734 (the removal-toggle reducer), #736 (the
   `alert-dwell` instrument) and #738 (a playtest record) — read off `git log
   --oneline --first-parent 0352116..4ac0973` excluding the eight
   release-bump commits. `35663087`/#730 is the previous anchor's own writing
   commit, kept below as that anchor's account, and is not separately re-read
   as new drift. The member set was computed rather than recalled: scanning
   §§3-6 for backticked rooted paths and intersecting with the 61 gives **ten
   members** — `docs/HUD_PROJECTIONS.md`, `docs/adr/README.md`,
   `docs/adr/STATUS-QUEUE.md`, `docs/research/README.md`,
   `src/persistence/save-schema.ts`,
   `src/simulation/construction/materials-procurement.ts`,
   `src/simulation/economy/just-in-time-materials.ts`,
   `src/ui/hud/build-panel.ts`, `src/ui/hud/hud.css` and
   `src/ui/hud/messages.ts` — against twenty at the previous anchor, the
   widest this file had recorded.
2. **The mechanical re-derivation of every `file:line` in §§3-6** — extract
   each backticked `path:N` span, open the file, print the line, over all
   **115** such spans this range carries, not only the ten the delta names.
   **Two moved, and both are inside the ten-file intersection**, which this
   window's small size did not prevent:
   `src/simulation/construction/materials-procurement.ts`'s
   `ConstructionProcurementSink` declaration went `:213` to `:224` (+11, from
   #731's own docblock landing above it), and `src/persistence/save-schema.ts`'s
   `masterSeedSchema` comment went `:1289` to `:1324` (+35, from the same
   commit's `placementSequence` field) — the seventh value this file has now
   recorded for that one unchanged sentence, one behind the count §5 states
   until this correction lands. Both are corrected in §5 in place, with the
   numbers they replaced kept beside them. **Every other span opened still
   reads what this file says it reads**, re-derived rather than assumed,
   because two genuine finds in one commit's files is an argument for opening
   the neighbours, not a reason to trust them.
3. **Reading the file's own headings and counts against each other.** The
   four places that count §2 were swept and all four still agree at eight —
   this header's opening paragraph, the title, §2's own heading *"## 2. Eight
   entries"*, and §5's preamble's *"EIGHT at #615"* — because no §2 entry was
   filed or accepted in this window; an agreeing sweep is the weaker result
   and is recorded because the paragraph naming the four places asks for it
   either way. **The three places that count `Proposed` did not agree with
   the tree, and it is this window's one substantive finding.** `61c4f384`/#731
   accepts ADR 0082 in the same commit that implements it — the ADR's own
   Status block moves from `Proposed` to `Accepted` in that commit, exactly as
   0051's did at `df46980` — so the `Proposed` count falls from thirty-two to
   **thirty-one**: `grep -cE '^\|.*\| *\*{0,2}Proposed' docs/adr/README.md`
   confirms it against **46** `Accepted` and the same **77** rows, and none of
   §3's opening, §5's abandonment-streak bullet or §6's `income.ts` bullet had
   moved. All three are corrected in place, with the sentences they replaced
   left standing beside them. **The loose whole-row grep now disagrees by two
   rather than one**: 0082's own README row now carries a self-correcting
   cell in the same shape 0051's does — *"this cell read `Proposed,
   2026-08-31. Not self-approved` until the acceptance"* — so the word
   survives in the row's own history a second time, and the anchored regex is
   what keeps a second instance of the grep trap this section already names
   from mattering.

**The other five window commits were checked against every citation in
§§3-6, and none of them lands on one.** #729 rewrites two worker refusal
strings inside `src/ui/hud/messages.ts`, at `:958` onward; every citation this
file makes into that module is at `:28`, well above the insertion, and this
file cites no line past it. #732 (`src/simulation/security/guard-roster.ts`
and its neighbours), #728 (`tests/helpers/determinism-state.ts`), #736
(`tests/browser/alert-dwell.ts`, `docs/TESTING.md`) and #738 (a new research
document and a new playtest) touch no file this document cites at all, by
`grep` over the full text. **None of the five is ADR-related either, on their
own telling**: #729 and #732 transcribe the owner's own rulings 23 and 24
verbatim rather than deciding anything; #736 states in its own commit message
that it "changes no simulation code and writes no ADR"; #734 and #738 name no
ADR. So the negative result is reported rather than assumed — this window's
small size protected almost nothing by itself; it is the full re-derivation
and the delta intersection together that found the two real drifts above and
nothing else.

**Both absences below were re-verified at this anchor and neither could have
moved**: no path under `supabase/` or `.github/` appears in the 61 files,
`supabase/migrations/*.sql` still counts 23, and the retention grep at
`20260826130000_server_stamp_updated_at.sql:68` still returns the one
non-mechanism hit it has returned since `53e1405`.

**Recommendation.** Eight of ten releases is not the bound and this pass was
not dispatched at it; nothing here argues for a different trigger than the
release count this series settled on after six failed predictions. The one
thing worth naming forward is the two-file finding above, stated as a shape
rather than a rule: a docblock landing inside one schema's field moved a
citation into a *different* declaration eleven lines below it and a comment
thirty-five lines below that, in the same commit, on a file that had nothing
else to do with what the commit was about. That is the ordinary reason the
mechanical re-derivation runs over every span in §§3-6 and not only the
delta's, restated because it is cheap to restate and expensive to relearn.

**The previous anchor's account, kept.** It read: *"Re-anchored at `main` @
`0352116` (**v0.0.301**) by the delta method this header describes, from the
v0.0.291 anchor described below. TEN OF THE TEN releases the budget allows,
counted on the tree this commit is written against: `package.json` ships
`0.0.301` and the anchor being replaced named v0.0.291... It opened at eight
and `main` took #726 and #727 underneath it; the branch was rebuilt on
`0352116` rather than pushed at a stale sha, which is the only reason
`tests/foundation/adr-status-queue-anchor-contract.test.ts` is green here and
not red on the next release commit. Zero releases of headroom are left as of
this commit, and four more changes were in flight behind it."* Its window was
104 files against ten merges, its delta intersection was twenty files — the
widest this file has recorded — and its mechanical re-derivation found nine
live anchors moved, four of which had been wrong before its own window
opened, the worst being `transferables.ts:41`/`:50` carried as *"(unmoved)"*
for twelve consecutive anchors after `82ae630` falsified them, in a file no
delta window had ever named. It also found the three `Proposed`-count places
three anchors stale — twenty-nine carried in §3, §5 and §6 while the true
figure had reached thirty-two — and corrected all three in place. **That
tally stands as written and its coverage does not, in the same shape it
recorded of its own predecessor**: two more citations, inside two of the ten
files its own delta intersection already named as members, went stale in the
very next window — `materials-procurement.ts:213` and
`save-schema.ts:1289` — because neither line had moved yet when that pass
re-derived them. Eight of ten releases of headroom was a fact about its own
tree; the next window spent two finding what a second read of the same
intersection would not have reached, since the change that moved both had not
landed.


**The `a54899a` anchor's account, kept. The paragraphs below are that pass's,
including its own record of the anchors before it.** Its anchor line named
`a54899a` and **v0.0.291**, coming from the v0.0.284 anchor described below, and
stated **seven of the ten releases the budget allows** with three of headroom
left. It is described here rather than quoted, for the reason that pass gives
further down: the gate counts anchor spans and requires exactly one. The
verbatim line is kept, once, in the line-broken form the gate cannot see, with
the other kept anchor records further down this file. **That pass added no
`kept` heading of its own before the account it superseded**, so the `58220f7`
paragraphs below ran on from its own with nothing marking the seam; the heading
for them is supplied at the foot of this account rather than left missing.

**The window: 41 files, six merged pull requests, and one drifted citation.**
`git diff --name-only 58220f7..a54899a` reports 41 files. The merges are #707,
#708, #709, #711, #712 and #713 — the owner's rulings 3, 2, 12 and 13 of
[#703](https://github.com/matmaxalez/lockstate/issues/703) plus ADRs 0081 and
0082. **The delta intersection is four files** — `src/simulation/protocol/types.ts`
(13 citations here), `src/ui/hud/messages.ts` (11 plus one line-numbered),
`src/ui/hud/build-panel.ts` (9) and `src/ui/hud/projection.ts` (6 plus one
line-numbered) — and only **three citations in the whole file carry a line
number** into any of them, which is recommendation 1 at the foot of §6 working
as intended: a symbolic citation does not rot when a docblock above it grows.

Those three were re-read one at a time and **one had drifted**:

- `types.ts:173` still reads
  `protocolVersion: z.literal(SIMULATION_PROTOCOL_VERSION)`. **Holds.**
- `messages.ts:85` still reads *"ADR 0017 -- Accepted"*. **Holds.**
- **`projection.ts:408` no longer reads what §6 says it reads.** #707 inserted
  the contraband-name docblock above it and the sentence *"ADR 0017 is Accepted
  without naming one either"* moved to **`:454`**, +46. Corrected at its own
  site, with the old number kept as history in the form the `types.ts` anchors
  above use. **The claim itself is unharmed** — the label rests on neither file
  naming a currency, and neither does.

**Both absences below were re-verified at this anchor and neither could have
moved**, which the delta says rather than a grep: no path under `supabase/` or
`.github/` appears in the 41, `supabase/migrations/*.sql` still counts 23, and
`migrate-database.yml`'s three properties still land.

**THE PREVIOUS ANCHOR'S PREDICTION MISSED IN THE SAME DIRECTION FOR THE THIRD
CONSECUTIVE WINDOW, AND THAT IS NOW A PATTERN RATHER THAN AN OBSERVATION.** It
was written at eight of ten *because* three changes were in flight on disjoint
surfaces — the owner's rulings 2, 3 and 4 — and said three merges would be three
releases, which is eleven. **Two of those three landed** (#707 for ruling 3,
#709 for ruling 2); ruling 4's is open and red at the time of writing. **Four of
the six merges in this window did not exist when that sentence was written**:
#708, #711, #712 and #713. So the anchor was again right about the count and
wrong about the cause, and the finding the last two anchors each recorded once is
confirmed a third time: **what spends this budget is not the queue anybody can
see, it is the work the window generates.** The practical consequence, stated so
the next pass can act on it rather than re-derive it: **the trigger to dispatch
should be the release count alone, and naming the queue that will spend it is
worth doing only as a record of having been wrong about it.**

**What this window created that §§3-6 will have to carry, listed here rather
than filed as entries, because every one of them is `Proposed` and none is yet a
disagreement between an accepted decision and the code:** ADR 0081 (partial fill
— the owner ruled *whether* and, on 2026-08-31, *at what granularity*: per
order; status line still unsigned), ADR 0082 (build-order execution order —
**since accepted by the owner on 2026-08-31 and implemented in #722**, so it is
no longer one of the `Proposed` documents this paragraph is listing; the
sentence is corrected rather than rewritten because the window it describes is
what it is), and ADR 0083 (what opens the negative balance — the owner ruled a
standing overdraft and 50% escalated diversion on 2026-08-31; **not on `main`**
at this anchor, so it is named and not cited).

**One genuine disagreement was found in this window and is not filed above
because the ADR that would carry it is on an unmerged branch**, so it is
recorded here as the thing to file next: `Treasury.setOverdraftFloor` has zero
production callers, `LoanBook.draw` credits the treasury and never opens the
floor, and no session is given a `LoanBook` at all — while `treasury.ts`'s own
docblock says the floor **is** ADR 0075 decision 2's *"accrual cap"* and that
*"the way out is `LoanBook`"*. ADR 0075 is **Accepted**. That is a §5 entry the
moment ADR 0083 lands.

**The `58220f7` anchor's account, kept, and this heading is supplied by the
`0352116` pass rather than by the one that superseded it.** Its anchor line
named `58220f7` and **v0.0.284**, coming from the v0.0.276 anchor described
below. The paragraphs from here to the `898a16a` heading further down are that
pass's; the `a54899a` pass wrote its own account above them and marked no seam,
so a reader working downwards had no way to tell where one pass stopped and the
next began. It is described rather than quoted for the reason both accounts
above give, and the verbatim line is kept once, further down, in the
line-broken form.

**This is the second anchor here written before the budget forced it, and the
first written because a queue that does not exist yet would have overrun it.**
The previous one was written at eight with nothing pending. This one is written
at eight with **three changes in flight on disjoint surfaces** — the owner's
rulings 2, 3 and 4 of [#703](https://github.com/matmaxalez/lockstate/issues/703),
each in its own worktree. Three merges are three releases, which is eleven, so
the arithmetic that forced this pass is about work that has not landed rather
than work that has. That is a better reason than either of the two before it,
and it is the first time this budget has been spent forward rather than
recovered.

**The previous anchor's own prediction is the thing worth recording, and it
missed in the same direction the one before it did.** It named ten open pull
requests — #685, #682, #681, #679, #678, #676, #675, #658, #653 and #647 — and
said **all ten landing first would put the budget at seventeen**. **Two of the
ten merged inside this window**, #647 and #658; the other eight did not, so the
seventeen never happened. Counted against the window's own merge list — #698,
#699, #701, #658, #647, #702, #704 and #705 — **six of the eight merges here
were work that did not exist when that list was written**, which is why the
budget still reached eight. **So the count was right and the named cause was
wrong, for the second consecutive anchor**: what spends this budget is not the
queue anybody can see, it is the work the window generates. That is the finding,
and it is the reason this pass looked forward at three unlanded changes instead
of backward at an open list.

**That figure is a fact about this commit and it is not a claim about the
merge, and this is the third anchor running to scope it that way — but the
previous anchor's own prediction is the thing worth recording here, because it
did not come true and the direction it missed in is the useful one.** That pass
was written at ten of ten with the whole budget spent, listed seven open pull
requests, and said that *"any one of them landing first puts `main` at eleven
before this branch can clear it"*. **None of them did.** `fc11269`/#674 was the
very next merge after `898a16a` and released as v0.0.253, so the anchor it wrote
was one release behind when it landed rather than eleven. Four of the seven it
listed merged after it, inside this window — #640, #650, #655 and #668 — and
three are still open (#647, #653, #658). **So the refusal to claim headroom for
the merge tree was right and the specific fear it expressed was wrong**, and
both halves are written down, because a prediction that is only marked when it
comes true is not a record. **Seven as of the commit that writes this
paragraph**, and no headroom figure at all is claimed for the tree this lands
on: **ten non-draft pull requests are open** at the time of writing — #685,
#682, #681, #679, #678, #676, #675, #658, #653 and #647 — each merge costs a
release, and all ten landing first would put the budget at seventeen.

**One of those ten would move a count this file states in four places, and it
is named in advance for the reason the previous anchor named #659 in advance.**
[#681](https://github.com/matmaxalez/lockstate/pull/681) carries **ADR 0080**,
`Proposed`, for the tier-3 contraband band. A branch nobody has merged is
invisible from disk, so the thirty counted below is a count of `main` and 0080
is deliberately uncounted. **If #681 merges before this does, the count is
thirty-one and all four `Proposed` counting sites need it**, and 0080 leaves the
index's *Next free number* residue by becoming a member — the same movement
0078 and 0079 each made. Which way that goes is not something this pass can
record.

`58220f7` is `origin/main`'s tip at the time of writing and is itself the
**v0.0.284 release commit**, named deliberately rather than the merge commit
beneath it, for the reason every previous anchor gives: it is cut after the last
merge in the window (#705, `9529b04`), contains every sentence below, and is the
exact tree every citation here was re-derived from.

**The delta note for `58220f7`.** `git diff --name-only 004f799..58220f7` is
**32 files**, of which **seven are members**: `docs/HUD_PROJECTIONS.md`,
`docs/adr/README.md`, `docs/research/README.md`, `src/main.ts`,
`src/ui/hud/build-panel.ts`, `src/ui/hud/hud.css` and `src/ui/hud/messages.ts`.
`docs/adr/STATUS-QUEUE.md` is an eighth changed file that §§3-6 name and is
deliberately outside its own set. The member set was **computed rather than
recalled**: scanning §§3-6 for backticked rooted paths gives 74 distinct spans,
of which **46 exist on disk**, and the intersection with the diff is the seven
above.

**The `src/ui/hud/**` glob member is what makes this window wide, and it is the
first window in which that glob has done real work.** Eight files under it
changed — `build-panel.ts`, `hud.css`, `hud-state.ts`, `hud.ts`, `messages.ts`,
`rooms-panel.ts`, `status-strip.ts` and `view-model.ts` — three of them named
individually as members and five caught only by the glob. A member set that
enumerates files and then adds a directory glob over the same directory will
under-report its own intersection to anybody who reads only the named list, and
this is the first anchor where the difference is five files rather than none.

**`docs/adr/README.md` DID change in this window**, which is the first time in
several, so the ADR counts below are **moved rather than carried** — and they
moved by a correction rather than by an arrival. `e6cad72`/#702 rewrote ADR
0051's index cell in both directions after `445f546`/#647 accepted the document.
Split on the status column: **74 rows, 45 `Accepted`, 29 `Proposed`**, against
44 and 30 at the previous anchor. **No ADR was added or removed**; `Next free
number: 0081`, unmoved, and 0080 is still the newest on disk.

**And that correction created a grep trap in the index, recorded because it will
recur.** A whole-row match — `grep '^| \[' docs/adr/README.md | grep -c
Proposed` — returns **30**, because 0051's cell now carries the clause saying
what it used to read. The anchored regex §3's opening has used since `0637ab1`
returns **29**. Both were run. Correcting a cell in both directions is the
standing convention here, so every future acceptance adds another row a loose
grep miscounts.

**Nothing under `supabase/migrations/`, `src/services/telemetry/**` or
`src/ui/primitives/**` changed**, so those three glob members contributed none,
and `src/services/telemetry/` still holds **fifteen** modules, counted rather
than carried.

**The window is eight releases carrying eight merged pull requests** — #698,
#699, #701, #658, #647, #702, #704 and #705 — read off `git log --oneline
--first-parent 004f799..58220f7` (excluding the eight release-bump commits).
**Two of the eight edit this file**: `6911df1`/#699 is the previous anchor's own
writing commit, kept below as that anchor's account, and `e6cad72`/#702 is a
correction pass this file asked for in terms — its handover said *"the
acceptance commit should own the correction in both directions"*, #647 did not,
and #702 discharged it.

**Five of the eight are behaviour rather than records, which inverts the
previous window.** That one was seven records against one behaviour change; this
one is #658 (the status-strip breakpoint and the room-drag check), #647 (the
paused clock readout), #704 (the alerts log opens, scrolls, and stops claiming
control after an escape) and #705 (what the alerts cap sacrifices), against #699,
#702 and #701 as records. **So the widest member intersection this file has
recorded comes from the window with the most behaviour in it**, which is the
correlation a delta method should show and had not until now.

**#704 is the one worth naming, because it is the first pull request in this
file's history whose own branch found a defect in the fix it was carrying.** The
flex chain it added to make the alerts list scroll overrode `[hidden]` and broke
the fold that the same ruling depends on; a browser assertion caught it; and
fixing that exposed a second, latent break in a different test that only CI's
idle run could see. Recorded here rather than in an entry because it is a fact
about how this repository's gates compose, not about a decision the owner owes.

**The delta note for `004f799`.** `git diff --name-only c0a3a6b..004f799` is
**27 files**, of which **five are members**: `docs/HUD_PROJECTIONS.md`,
`docs/research/README.md`, `package.json`, `src/persistence/save-schema.ts` and
`src/simulation/prisoners/intake-system.ts`. `docs/adr/STATUS-QUEUE.md` is a
sixth changed file that §§3-6 name and is deliberately outside its own set.

**`docs/adr/README.md` did not change in this window**, so the ADR counts below
are carried rather than moved — and they were **re-derived anyway**, because the
previous anchor recorded that a whole-file `grep -c` gives 50 and 41 where the
status column gives 44 and 30. `grep "^| \[" docs/adr/README.md` split on that
column: **74 rows, 44 `Accepted`, 30 `Proposed`**, unchanged. No ADR landed
here; 0080 landed in the previous window.

**Nothing under `supabase/migrations/`, `src/services/telemetry/**` or
`src/ui/primitives/**` changed**, so those three glob members contributed none,
and `src/services/telemetry/` still holds **fifteen** modules, counted rather
than carried.

**The window is eight releases carrying eight merged pull requests** — #695,
#676, #679, #653, #675, #678, #696 and #697 — read off `git log --oneline
--first-parent c0a3a6b..004f799` (excluding the eight release-bump commits).
**One of the eight edits this file and it is not new drift**: `8b8541c`/#695 is
the previous anchor's own writing commit, kept below as that anchor's account.

**Seven of the eight are records rather than behaviour**, which is why five
members moved against twenty-seven changed files — the widest window here by
release count and one of the narrowest by member intersection. The exception
worth naming is #697, because it is the first pull request in this file's
history whose whole subject is **testing another merged pull request's claims**:
it pinned four things #694 asserted about the save format and determinism, and
**one of the four did not survive**. That is a shape this file should expect to
see again, and it is the reason the two citations below drifted.

**No commit in this window filed a §2 entry**, so all four places that count §2
stay at eight: this header's paragraph, the title (which states a subject and no
count), §2's own heading *"## 2. Eight entries"*, and §5's preamble's *"EIGHT at
#615"*. All four were opened rather than assumed. That is the **sixth**
consecutive window in which the split those four places keep coming apart on has
not been exercised at all, so this sweep, like the five before it, confirms
nothing about it.

**THIRTY at `feb46af`, unmoved.** No ADR arrived, none left, and no status
flipped: `docs/adr/README.md` is not among the 52 changed files, and the only
ADR that is, **0073**, took a body correction from `eb98a6b`/#672 while its `##
Status` still reads `**Proposed, 2026-08-29. Not self-approved.**` at `:21`.
Counted on disk anyway rather than inferred from the diff, by the method every
reading in this sequence has used — the first non-blank line under each
document's own status statement, `## Status` heading or `- Status:` bullet alike
— **twenty-eight** under a heading and **two** under a bullet (0064 and 0067,
still the only two), out of **73** documents on disk. `docs/adr/README.md`
agrees, counted independently: **thirty** rows opening `Proposed`, and **Next
free number: 0080**, unmoved. The ratio stays **four of thirty** (0056, 0059,
0074 and 0077) and the decisions outstanding with no §2 entry stay at
**twenty-six**.

**All four places that state that number were opened and what each read is
written down, because a sentence claiming they were opened is
indistinguishable, to every gate in this repository, from having opened them.**
§3's opening reads *"Twenty-nine is THIRTY again at `898a16a`"*; §5's first
bullet reads *"THIRTY at `898a16a`, ten releases later, and the fall did not
continue"*; §6's `income.ts` bullet reads its thirteenth falsification, *"at
`898a16a` … it is thirty"*; and this header's opening paragraph — the fourth
site, the one the previous anchor found had stopped for three anchors — reads
thirty as well. **None of the three sections is edited, because none of them is
wrong**, and that is the weaker of the two possible results rather than the
stronger one: a window that moves no count exercises no counting site, so this
sweep establishes that the four agree and nothing whatever about the mechanism
that splits them. **The header's paragraph is extended anyway**, with one dated
sentence saying the value is unchanged, for the reason given there.

**THE FINDING, and it is an entry §5 never held rather than one that drifted.**
ADR 0017 is `Accepted`, and its decision 7 reads, in full: *"Materials are
just-in-time by default; holding is permitted, never required."* The code did
the opposite. A build order reached `materials-pending` and stayed there until
the player bought what it needed, and the word *material* appeared nowhere on
the visible HUD, so the code enforced a requirement the game never stated.
**That is precisely this file's §5 subject — an accepted decision the code
contradicts — and §5 never had an entry for it**, at any anchor in the sequence
below. It was closed on 2026-08-30 by `a87b0d3`/#640, released as **v0.0.254**,
inside this window; `docs/HUD_PROJECTIONS.md` carries the correction in its own
body, in both directions, and dates the disagreement to **#249**. **So the gap
outlived this file's entire anchor sequence and left it before this file
noticed it**, and the entry now written into §5 is written as closed for that
reason. **What that costs is worth stating plainly**: §5's membership is created
by somebody filing an entry, exactly as §2's is, and both derivation scans this
header prescribes are checks on *citations* — a path written down, a number
written down. Neither could have found this, neither can find the next one, and
that is a limit of the method rather than of this pass.

**TWO CITATIONS DRIFTED, both by the same twelve lines.** `src/main.ts` took
**+15/-3** in exactly two hunks — an import swap at `:89` that is net zero, and
a twelve-line addition inside `staffRoster()` at `:800` from #650's wage work.
So the four top telemetry anchors — the import span `:103-105`, the pipeline
block `:163`, the prose hit `:179` and the crash-reporter gate `:201-204` — are
**unmoved for the second consecutive anchor**, while the consent-prompt mount
goes `:2869-2874` → **`:2881-2886`** and its gate `:2865` → **`:2877`**, a
uniform **+12** which is once again the file's entire net change. **Third
consecutive anchor at which the two halves of §5's telemetry bullet moved by
different amounts**, and the second running in which one of the two amounts is
zero. Both are corrected in place in §5, re-derived by symbol rather than
offset.

**`tests/unit/ui-hud-messages.test.ts` moved and falsified nothing, for the
second anchor running.** It took **+15/-7** from #640's message-key work, +8 of
it above the citation, so `it('imports nothing from the simulation', …)` goes
`:235-241` → **`:243-249`**. The two places that cite it as `:218-224` both
scope that number to `bb3a01e` in the same sentence, so they are dated records
rather than live claims; the current value is written here so the next reader
has it without re-deriving it.

**`src/ui/hud/hud.ts` gained six lines inside `mountHud` and moved nothing in
§§3-6.** Every anchor §5 gives into that file — `:153`, `:271`, `HudIntent`'s
declaration at `:312`, and the three `cfab558`-dated members at `:445-450`,
`:487` and `:599-604` — sits above `:1833`, where the change lands. **The live
count holds**: `HudIntent` still declares **nineteen** members, counted the way
§5 says to count them.

**Three more members changed and none of them carries a line citation that
could break.** #640 added five message-key blocks to `src/ui/hud/messages.ts`
starting at `:246`, so §6's ADR 0017 correction at `:85` is unmoved and still
reads *"ADR 0017 -- Accepted"*. `src/ui/hud/build-panel.ts` and
`src/ui/hud/hud.css` are cited in §5 by name only, and the quoted sentence the
900×600 entry rests on — *"7.8px is the entire budget"* — is still in
`build-panel.ts`, at `:1113`. There are still **four** `.css` files under
`src/ui/`, re-derived with `git ls-tree -r HEAD -- src/ui`, so that entry's
own hand count stays right.

**§5's quotation of gap 13 survives verbatim** — *"Object placement exists, and
`minQuantity` is counted"* — and is still at **`:885`**, unmoved, **even though
`docs/HUD_PROJECTIONS.md` changed in this window**: #696 added its sixteen lines
*below* every line §5 depends on. So the run of two consecutive windows in which
that line number moved ends here, and it ends by the change landing in the right
place rather than by the file being left alone — which is the more useful of the
two ways for it to end. The account of the 92 lines it gained in the previous window is
kept below. The 92 lines are #640's amendment, inserted at `:1288`, below
every line §5 depends on. **This is the case §6's recommendation 1 is for**: the
document §5 quotes changed underneath it, in the section §5's subject is about,
and the quotation needed nothing.

**`docs/research/README.md` gained three table rows — #668's, #640's and #673's
records — and §6's *"deliberately left"* bullet still rests on the rule that
file states rather than on the table.** The rule is at
`docs/research/README.md:8-10`, opened rather than inherited, and it still reads
*"They are read-only history: when the code moves on, a record here does not
become wrong, it becomes older."* The three new rows are at `:69-71`, below
every line the rule occupies.

**Four members outside the intersection were re-derived anyway, because each
carries a count rather than a line and a count is cheap to re-take.**
`src/persistence/save-schema.ts`, `src/simulation/protocol/commands.ts` and
`src/simulation/construction/definition.ts` are untouched in this window, and
three of the four figures hold and one drifted. **`masterSeedSchema`'s comment
moved `save-schema.ts:1214` → `:1229` → **`:1289`**, fifteen lines and then
sixty, because #694 added the loan section above it and #697 then added sixty
lines of corrected prose above that — the second consecutive window in which this
one citation moved, and the reason it is worth naming rather than quietly
re-derived; the sentence it anchors is unchanged and the
citation is corrected rather than the claim. The rest: `simulationCommandSchema` still discriminates
**fourteen**, declared at `commands.ts:542`; and `grep -rno "'object\.[a-z-]*'"
src/ --include=*.ts | grep -v '^src/content/'` still returns **39** hits in
**two** files, **nineteen** in `definition.ts` and **twenty** in
`environment-art.ts`. The fourth, `HudIntent`'s nineteen, is recorded above.
**One of those four is worth a sentence this time rather than a tick**: #640
added a whole procurement subsystem under `src/simulation/construction/` and put
no `'object.*'` token in it, which is why a figure that looks fragile against
this window is not.

**Two claims are INHERITED rather than re-established, and in both cases that is
the weaker of the two results.** §5's handshake claim still returns **nine**
hits from `grep -rn "protocol/handshake" src/ --include=*.ts`, still split **4 /
2 / 3** across `types.ts`, `transferables.ts` and `state-machine.ts` — and this
time it is **re-established rather than inherited**: two of those three files
changed in this window (#685 touched `state-machine.ts`, #691 touched
`types.ts`). The previous anchor recorded that *"the run of five consecutive
anchors at which the claim had to be re-run ends here by the window not touching
it"* — **that account is true of its own window and the run did not end; it
resumes at six here**, and both halves are kept because a run declared over and
then continuing is exactly the shape this file asks to be marked rather than
overwritten. §6's `income.ts` absence is likewise **re-established**:
`grep -c "Proposed" src/simulation/economy/income.ts` returns **0**, against a
file #694 *did* change, ending the two anchors of inheritance the previous pass
recorded.

**The two live `verified at` claims were re-run rather than carried.** Neither
`supabase/migrations/` nor `.github/workflows/` appears anywhere in this
window's 52 files. The migrations directory still holds **twenty-three** files
(`ls supabase/migrations/*.sql | wc -l` returns 23); the retention grep still
returns exactly **one** hit and it is still
`20260826130000_server_stamp_updated_at.sql:68`, prose rather than a mechanism;
all six SQL anchors (`:45`, `:71-73`, `:91`, `:150`, `:178`, `:188`) and all
four workflow anchors (`:33`, `:34`, `:41`, `:65`) were opened and still land,
and `grep -c '^\s*push:'` over the workflow still returns **0**. Both claims are
re-anchored to `feb46af`.

**Both derivation scans were re-run over §§3-6, and for the first time this
subsection could check its numbers against a prediction instead of against a
memory.** The previous anchor wrote that a reader re-deriving after its commit
should expect **81** spans, **62** existing, **19** residue, and **67** number
tokens with a five-token residue — 0030, 0055, 0058, 0072 and 0080. Measured on
`feb46af`: **81 / 62 / 19**, and **67** tokens with exactly that residue.
**Confirmed to the number in both scans.** That is worth more than a clean
residue on its own, because it establishes independently of the file-level diff
that nothing in the window added or removed a citation.

- **The path scan** — every backticked span in §§3-6 carrying a `/`, with
  `:N`/`:N-M` stripped, filtered to those ending in a known file extension, the
  span pattern tolerating a line break because that is the filter the previous
  anchor settled — returns **81** distinct spans, of which **62 exist on disk**
  and **19 are `git` and `grep` command lines that carry a slash without being
  paths**. Of the 62, **59 are named members** and the other three are the
  documented exemptions: `docs/adr/STATUS-QUEUE.md`, outside its own set, and
  the two spans reaching the set through a directory glob
  (`src/ui/primitives/icon.ts`, one file under `supabase/migrations/`). Nothing
  is left over.
- **The number scan** — every bare `00NN` token in §§3-6 — returns **67**
  tokens, of which **62 name an ADR that exists on disk**; the residue is
  **0030**, **0055**, **0058**, **0072** and **0080**, each still a number
  inside a claim about `docs/adr/README.md`'s **Next free number** line or, for
  0072, the held events-persistence number. **0079 is in this scan's output for
  the first time**, exactly where the previous anchor said it would be, which
  makes it the confirmation that pass asked for rather than a discovery.
  **One regex note, because it cost this pass a false residue token and will
  cost the next one the same**: a token pattern of `(?<![\d/-])00\d\d(?![\d-])`
  returns a sixty-eighth token, **0096**, out of the sha `9f0096c` quoted in §5
  and §6, because the `f` before it is not a digit. `\b00\d\d\b` does not,
  because `f` *is* a word character. The `\b` form is what every reading in this
  sequence has used and what the figures here are taken with.
- **What this commit's own edits do to both scans, re-run over §§3-6 *after*
  them, so the next pass is not comparing against a tree that no longer
  exists.** The path scan goes **81 → 83** spans, **62 → 63** existing and **19
  → 20** residue: the new existing span is
  `docs/research/2026-08-30-a-wall-that-buys-itself.md`, which the new §5 entry
  cites and which joins the member list in this same commit, and the new residue
  span is one `git` command line this pass adds. **So a reader re-deriving after
  this commit should expect 83/63/20 and sixty-seven tokens with the same
  five-token residue** — the number scan is unmoved, because this commit cites
  no ADR §§3-6 did not already cite — **and not the 81/62/19 this subsection
  reports for the anchor tree.** Both sets of numbers are right about the text
  they were taken over.

**The `898a16a` anchor's account, kept. The paragraphs below are that pass's,
including its own record of the anchors before it.** Its anchor line named
`898a16a` and **v0.0.252**, coming from the v0.0.242 anchor described below, and
stated **ten of the ten releases the budget allows** as a figure about the
commit that wrote it rather than about the tree it landed on. It is described
rather than quoted, for the reason that pass gives further down: the gate counts
anchor spans and requires exactly one. **Its scoping was right and its fear was
not**, which the paragraph at the top of this pass's account measures.

**That figure is a fact about this commit and it is not a claim about the
merge, and this is the second anchor running to scope it that way because the
first one was proved right within minutes.** The `104d078` pass was dispatched
at nine of ten and merged at eleven, reddening every open pull request
including the one fixing the flake that was reddening its own; the `eb1f040`
pass therefore scoped its figure to its commit, and then measured
`origin/main` reaching v0.0.243 before its branch even had a pull request. So:
**ten as of the commit that writes this paragraph**, and no headroom figure at
all is claimed for the tree this lands on. **The count at merge may differ,
and this pass cannot read which way**: seven non-draft pull requests are open
at the time of writing — #640, #647, #650, #653, #655, #658 and #668 — every
merge of one costs a release, and with the budget exactly spent any one of
them landing first puts `main` at eleven before this branch can clear it. That
is the same finding from a third side: not dispatched with no headroom, and
not dispatched with headroom and merged without it, but **dispatched with the
last release of it already gone**.

`898a16a` is `origin/main`'s tip at the time of writing and is itself the
**v0.0.252 release commit**, named deliberately rather than the merge commit
beneath it, for the reason every previous anchor gives: it is cut after the
last merge in the window (#671, `9950171`), contains every sentence below, and
is the exact tree every citation here was re-derived from.

**The delta note for `898a16a`.** `git diff --name-only eb1f040..898a16a` is
**45 files**, of which **ten are members** of the set as it stood before this
commit: `docs/adr/README.md`, `docs/research/README.md`, `package.json`,
`src/main.ts`, `src/simulation/protocol/types.ts`, `src/ui/hud/hud.ts`, and
ADRs **0023**, **0069**, **0076** and **0078**. ADR **0079** is an eleventh
and it joins the set in this commit, by the citation this commit creates
rather than by having been missed — the order the previous anchor found broken
twice. `docs/adr/STATUS-QUEUE.md` is a twelfth changed file that §§3-6 name
and is deliberately outside its own set. **Nothing under
`supabase/migrations/`, `src/services/telemetry/**` or `src/ui/primitives/**`
changed**, so those three glob members contributed none.

**The window is ten releases carrying ten merged pull requests** — #646, #665,
#656, #654, #660, #659, #666, #670, #669 and #671 — read off `git log
--oneline --first-parent eb1f040..898a16a` (excluding the ten release-bump
commits). **One of the ten edits this file and it is not new drift**:
`007582c`/#665 is the previous anchor's own writing commit, kept below as that
anchor's account. **What it changed inside §§3-6 is two shas and nothing
else** — `diff` over §§3-6 between the two trees returns exactly the two
`verified at` values and no other line, measured rather than assumed. **No
commit in this window filed a §2 entry**, so all four places that count §2
stay at eight: this header's paragraph, the title (which states a subject and
no count), §2's own heading *"## 2. Eight entries"*, and §5's preamble's
*"EIGHT at #615"*. That is the third consecutive window in which the split
those four places keep coming apart on has not been exercised at all, so this
sweep, like the two before it, confirms nothing about it.

**Twenty-nine is THIRTY at this anchor, and what closed the question is the
one the previous anchor left open.** That pass recorded ADR **0079** as
existing on `agent/593-longer-sentences` and deliberately uncounted, because a
branch nobody has merged is invisible from disk, and wrote that *"If #659
merges before this does, the count is thirty and four places need it"*, adding
that which way it went was not something that pass could record. **#659 merged**,
at `9a25700` (v0.0.248). So the count is thirty and the four places needed it.
0079 — a sentence long enough to be a history — reads `**Proposed,
2026-08-30. Not self-approved.**` on disk and has **no §2 row**, which makes
it the second consecutive arrival with none, after 0078. The ratio therefore
moves to **four of thirty** (0056, 0059, 0074 and 0077), and the decisions
outstanding with no §2 entry go from twenty-five to **twenty-six**.

Counted on disk at `898a16a` by the same method as every reading in this
sequence, the first non-blank line under each document's *own* status
statement, `## Status` heading or `- Status:` bullet alike — **twenty-eight**
under a heading and **two** under a bullet (0064 and 0067, still the only two,
so a heading-only scan still undercounts by two). `docs/adr/README.md` agrees,
counted independently: **thirty** rows opening `Proposed`, and **Next free
number** has moved **0079 → 0080**. **The denominator is stated more carefully
than the previous three anchors stated it**, because two different numbers are
both defensible: there are **73** ADR documents on disk and **74** numbered
rows in the index, the extra being 0018's *"Free — released when PR #91 was
closed as superseded"* row, which names no document. Earlier readings in this
sequence wrote *"out of 72"* and *"out of 71"* meaning documents; that is the
figure carried forward here, and the row count is written beside it so a
reader re-deriving either does not take the disagreement for a defect.

**All three of the other places that state the `Proposed` count were opened
and the value found in each is written down, because a sentence claiming they
were opened is indistinguishable, to every gate in this repository, from
having opened them.** §3's opening read *"twenty-nine"*, §5's first bullet
read *"TWENTY-NINE at `0637ab1`"* and §6's `income.ts` bullet read *"it is
twenty-nine"*; all three are moved to thirty in this commit, each beside the
sentence it supersedes. **This is the first window in three that exercised the
mechanism at all** — the two before it added no ADR, and this header said in
terms that two consecutive unexercised windows say nothing about the split.

**And opening them turned up a fourth place that had stopped, which is the
largest thing this pass found and which no delta could have raised.** This
header's own opening paragraph — the one the file names as the fourth
`Proposed` counting site, and the one it says is *"the only one of the four
that anyone had been moving"* — last extended its count at `53e1405` and read
**thirty** all the way through `0637ab1`, `104d078` and `eb1f040`, while the
number was twenty-nine. It is right again now only because 0079 put the count
back. The correction is written into that paragraph rather than here, in both
directions, because the finding is not the arithmetic: **the three sections
carried the live value at every one of those anchors and the header's
paragraph did not**, which is the reverse of the lag this file records
whenever it names the four places, and it means the standing advice to sweep §3, §5 and §6 would have
missed it.

**The `Proposed` count is the only structural thing that moved, and two
citations drifted underneath it — one of them under the commit that exists to
stop citations drifting.**

**ADR 0023's two live spans both moved, 104 lines each, and #654 moved them.**
That pull request converted ADR 0023's own `file:line` citations into
verbatim quotations under the owner's 2026-08-30 ruling on #645, adding a new
gate, `tests/foundation/adr-quotation-verbatim-contract.test.ts`. Its commit
message records the measurement that motivated it — *"ADR 0023's citations
drifted with zero commits to ADR 0023"* — and the same commit moved the two
spans **this** file cites into that ADR: the resolver's three branches from
`:196-203` to **`:300-307`**, and the *"Step 1 is unimplementable today"*
sentence from `:204-205` to **`:308-309`**. Both re-derived by symbol here
rather than offset, and both corrected in place in §5. **The half of §5 that
did not break is the half that was already a quotation**: the branch text is
quoted there in full and needed nothing, while the range beside it broke —
which is recommendation 1 at the foot of §6 producing a measurable result
again, from inside the window that produced the counter-example.

**And #654 closes the other open question the previous anchor recorded.** That
pass listed #654 as *"open against the budget itself"* and said nothing here
anticipated what it would decide. It decided **not to build one**:
`ANCHOR_STALENESS_BUDGET_RELEASES` is untouched, still **10** at
`tests/foundation/adr-status-queue-anchor-contract.test.ts:89`, and that file
does not appear in this window's 45 changed files at all. The reasoning is in
the new gate's own header, measured rather than argued — this tree took 238
releases in fourteen days, so ten releases is about fourteen hours, and a
per-ADR budget on that model would put all 46 ADRs citing `src/` permanently
red on work none of them touched. **The budget survives here for the reason it
would not survive there**: one document can be re-read in an afternoon and
forty-six cannot. Nothing in this pass raises it, and the wish to raise it
remains the signal that a pass is due.

**`src/main.ts` moved by exactly its net growth at the bottom and not at all
at the top, so the two halves of §5's telemetry bullet moved by different
amounts for the second consecutive anchor.** The file took **+53/-21** from
`9a25700`/#659 and `c93109a`/#669, every line of it between `:204` and
`:2833`. So the import span stays at `:103-105`, the pipeline block at
`:163`, the prose hit at `:179` and the crash-reporter gate at `:201-204` —
all four unmoved — while the consent-prompt mount goes `:2837-2842` →
**`:2869-2874`** and its gate `:2833` → **`:2865`**, a uniform +32 that is the
file's entire net change. A single shift figure would again have been wrong
for one half, which is why every anchor here is opened rather than offset.

**`src/ui/hud/hud.ts` gained one import line and moved everything below it by
one, and nothing in §§3-6 is falsified by that.** The three anchors §5's ADR
0022 entry gives for the members a hand count missed are dated to `cfab558`
in the sentence that gives them, so they are records rather than live claims;
their current values are written here so the next reader has them without
re-deriving: `arm-build-tool` `:444-449` → `:445-450`, `cancel-build-order`
`:486` → `:487`, `arm-room-tool` `:598-603` → `:599-604`. **The live count
holds**: `HudIntent` still declares **nineteen** members, counted the way §5
says to count them, `grep -c "readonly kind: '"` between `export type
HudIntent =` — which itself moved `:311` → `:312` — and the union's close.

**§5's handshake claim was re-run because `types.ts` changed again, and for
the second consecutive anchor none of the nine moved.** `grep -rn
"protocol/handshake" src/ --include=*.ts` still returns **nine** hits, still
split **4 / 2 / 3**, all receivers or declarations: `types.ts` at `:12`,
`:23`, `:223` and `:442`, `transferables.ts` at `:39` and `:55`,
`state-machine.ts` at `:796`, `:826` and `:835`. `types.ts` took **+57/-0** in
this window and every line of it lands at `:1390` or below the four anchors,
so the decoder's `protocolVersion: z.literal(...)` at `:173` is unmoved too.
**This is the fifth consecutive anchor at which the claim has had to be
re-run** and the second at which the re-run cost nothing.

**`income.ts` did *not* change in this window, which breaks a run of three
anchors at which it had.** So §6's absence is inherited rather than
re-established, and that is the weaker result of the two: `grep -c "Proposed"
src/simulation/economy/income.ts` returns **0**, re-grepped rather than
assumed, but against a file nothing touched.

**`docs/research/README.md` gained one table row — #646's authored-content
record — and §6's *"deliberately left"* bullet still rests on the rule that
file states rather than on the table.** The rule is at
`docs/research/README.md:8-10`, opened rather than inherited, and it still
reads *"They are read-only history: when the code moves on, a record here does
not become wrong, it becomes older."* The new row is at `:68`, below every
line the rule occupies.

**Three ADRs changed for reasons §§3-6 make no claim about, and each was read
for its status line.** **0069** took +36 from #659's sentence-length work;
`**Proposed, 2026-08-29. Not self-approved.**` at `:18`, unmoved. **0076**
took +187/-9 across #666 and #670, both of which convert its implementation
paragraph to quotations and requote a widened field; `**Accepted, 2026-08-29,
by the repository owner.**` at `:17`, unmoved, and every claim §§3-6 make
about 0076 is about its *departure* from the `Proposed` count, which neither
change touches. **0078** took +23; `**Proposed, 2026-08-29. Not
self-approved.**` at `:39`, unmoved.

**Four members outside the intersection were re-derived anyway, because each
carries a count rather than a line and a count is cheap to re-take.**
`src/persistence/save-schema.ts`, `src/simulation/protocol/commands.ts` and
`src/simulation/construction/definition.ts` are untouched in this window, and
all four figures hold: `masterSeedSchema`'s comment is still at
`save-schema.ts:1214`; `simulationCommandSchema` still discriminates
**fourteen**, declared at `commands.ts:542`; and `grep -rno "'object\.[a-z-]*'"
src/ --include=*.ts | grep -v '^src/content/'` still returns **39** hits in
**two** files, **nineteen** in `definition.ts` and **twenty** in
`environment-art.ts`. The fourth, `HudIntent`'s nineteen, is recorded above
because `hud.ts` is in the intersection this time.

**The two live `verified at` claims were re-run rather than carried.** Neither
`supabase/migrations/` nor `.github/workflows/` appears anywhere in this
window's 45 files. The migrations directory still holds **twenty-three**
files (`ls supabase/migrations/*.sql | wc -l` returns 23); the retention grep
still returns exactly **one** hit and it is still
`20260826130000_server_stamp_updated_at.sql:68`, prose rather than a
mechanism; all six SQL anchors (`:45`, `:71-73`, `:91`, `:150`, `:178`,
`:188`) and all four workflow anchors (`:33`, `:34`, `:41`, `:65`) were opened
and still land, and `grep -c '^\s*push:'` over the workflow still returns
**0**. Both claims are re-anchored to `898a16a`.

**Both derivation scans were re-run over §§3-6, neither returned a member the
list has never named — and the one-span discrepancy the previous anchor could
not reconcile is reconciled here, by measurement.**

- **The path scan** — every backticked span in §§3-6 carrying a `/`, with
  `:N`/`:N-M` stripped, filtered to those ending in a known file extension —
  returns **79** distinct spans, of which **62 exist on disk** and **17 are
  `git` and `grep` command lines that carry a slash without being paths**.
  Every one of the seventeen was read rather than pattern-matched against last
  time's, which is the correction #665 recorded: they are ten `git show` /
  `git log` / `git diff` invocations and seven `grep` invocations, and the
  full list is `git diff --numstat cfab558..origin/main -- src/main.ts`, `git
  log --first-parent cfab558..origin/main -- src/main.ts`, `git log -S 'h3.9'
  -- src/ui/primitives/icon.ts`, `git show 53e1405:docs/adr/STATUS-QUEUE.md`,
  `git show 54418b6:src/ui/hud/hud.ts`, `git show
  54418b6:tests/foundation/unconsumed-command-contract.test.ts`, `git show
  82ae630:src/ui/hud/hud.ts`, `git show bb3a01e:docs/adr/README.md`, `git show
  cfab558:docs/adr/STATUS-QUEUE.md`, `git show cfab558:src/ui/primitives/icon.ts`,
  `grep -c "Proposed" src/simulation/economy/income.ts`, `grep -c "type:
  z.literal" src/simulation/protocol/commands.ts`, the
  `^\|.*\| *\*{0,2}Proposed` count over `docs/adr/README.md`, a second
  `grep -n "Proposed"` over `income.ts`, `grep -n "this.transition("
  src/simulation/worker/state-machine.ts`, the `Amendment`/`Addendum` heading
  count over `docs/adr/*.md`, and `grep -rn "services/telemetry" src/
  --include=*.ts`. Of the 62 that exist, the documented non-members are
  `docs/adr/STATUS-QUEUE.md`, outside its own set, and the two spans reaching
  the set through a directory glob (`src/ui/primitives/icon.ts`, one file
  under `supabase/migrations/`). The remaining **59 are all named members**.
  Nothing is left over.
- **The number scan** — every bare `00NN` token in §§3-6 — returns **65**
  tokens, of which **61 name an ADR that exists on disk**. The four that do
  not are **0030**, **0055**, **0058** and **0072**: identical to the previous
  two anchors' residue, each still a number inside a claim about
  `docs/adr/README.md`'s **Next free number** line or, for 0072, the held
  events-persistence number, which is still not a member and still not
  missing. **0079 is not in this scan's output**, because §§3-6 did not cite
  it before this commit; the citation is created here, so the next pass's scan
  will return it and the membership recorded below is what makes that a
  confirmation rather than a discovery.
- **What this commit's own edits do to both scans, re-run over §§3-6 *after*
  them, so the next pass is not comparing against a tree that no longer
  exists.** The path scan goes **79 → 81** spans, **62 → 62** existing and
  **17 → 19** residue: the two new spans are both `git` command lines this
  pass added to §5 (`git diff --numstat eb1f040..898a16a -- src/main.ts` and
  the `898a16a` half of the mount-span history), and **no new file joins the
  62** — measured by diffing the two existing-span sets, which is empty. The
  number scan goes **65 → 67** tokens: **0079**, which is now a member and now
  cited, and **0080**, which is the index's new **Next free number** and
  therefore joins the documented next-free residue exactly as 0078 did at
  `53e1405` before leaving it by becoming a document. **So a reader
  re-deriving after this commit should expect 81/62/19 and a five-token
  residue — 0030, 0055, 0058, 0072 and 0080 — and not the figures this
  subsection reports for the anchor tree.** Both sets of numbers are right
  about the text they were taken over, and saying which is which is the whole
  of what the previous anchor found the reporting, rather than the scan,
  getting wrong.

**The 78-versus-79 question the previous anchor left open is settled, and the
answer is one character in a regular expression.** That pass measured its own
filter at **78** spans with a **16**-line residue over `eb1f040`, and recorded
that `104d078` had measured **79** and **17** over that same tree, adding that
*"neither pass states its filter finely enough to reconcile it"*. Measured
here rather than argued: the difference is a single backticked span that
**crosses a line break** — `grep -n "Proposed"` on one line and
`src/simulation/economy/income.ts` on the next, inside §6's `income.ts`
bullet. A span pattern of `` `[^`]+` `` tolerates the newline and finds it; one
of `` `[^`\n]+` `` does not. Run both ways over `eb1f040` the counts are 79/17
and 78/16, and run both ways over `898a16a` they are 79/17 and 78/16 again.
Both passes were right about the same text and neither filter was wrong; the
count of *existing* spans, **62**, is the figure that never differed. **And
the two trees agree exactly**: `diff` over the two scans' outputs between
`eb1f040` and `898a16a` is empty in both directions, for the path scan and the
number scan alike, which is what the two-sha §§3-6 diff above predicts.

**The 0051 half of this pass's brief was not done, and the reason is the same
fact about `main` that stopped the previous pass.** The brief made it
conditional and the condition is unmet: **PR #647 has not merged.** It is open
at the time of writing, `state: "open"`, `merged: false`, one of the seven
non-draft pull requests listed above. `docs/adr/0051-…md:22` reads
`**Proposed, 2026-08-28. Not self-approved.**` on disk at `898a16a`, and 0052
and 0054 read `**Proposed, 2026-08-28.** Not self-approved.` at `:5` each —
the emphasis falls differently in 0051 than in the other two, which is
recorded because the previous pass rendered all three alike. So the
`Proposed` tally is *not* one high, the header's handover naming those three
is *not* a third discharged, and the thirty counted above is a count of the
tree rather than of that branch. Nothing has been changed in anticipation.
**The work that lands with #647 is unchanged from the list the previous anchor
left**: the four `Proposed` counting sites (this header's paragraph, §3's
opening, §5's first bullet, §6's `income.ts` bullet), the header's handover
paragraph, §5's two sentences asserting ADR 0054's status, and the fourth
assertion of the same shape outside this file at `docs/adr/0056-…md:311`,
*"it does not edit ADR 0051, because ADR 0051 is itself Proposed"*, opened on
disk here and still standing —
all of which stay untouched here for the reason they have always stayed
untouched: flipping a status is not a re-anchor's job.

**The `eb1f040` anchor's account, kept. The paragraphs below are that pass's,
including its own record of the anchors before it.** Its anchor line named
`eb1f040` and **v0.0.242**, coming from the v0.0.234 anchor described below,
and stated **eight of the ten releases the budget allows** as a figure about
the commit that wrote it rather than about the tree it landed on. It is
described rather than quoted, for the reason that pass gives further down: the
gate counts anchor spans and requires exactly one. **Its scoping was
vindicated and its arithmetic was not overtaken**: it merged at `007582c`,
which released as v0.0.244, so `package.json` read `0.0.243` at the moment it
landed and its fresh anchor was **one** release behind rather than eleven.
Whether any earlier pass in this sequence also landed inside its own window is
not checked here and is not claimed.

**That figure is a fact about this commit and it is not a claim about the
merge, and the previous pass is the whole reason it is written that way.** That
pass was dispatched at nine of ten and landed at eleven, and the sentence it
wrote about its own headroom was falsified by two releases it could not see.
So: **eight as of the commit that writes this paragraph**, and no
headroom figure at all is claimed for the tree this lands on. Nine non-draft
pull requests are open at the time of writing — #640, #647, #650, #653, #654,
#655, #656, #658 and #659 — every merge costs one release, and the budget at
merge is therefore anything from eight upward depending on how many of them go
first. **A number measured when a branch is cut says nothing about the tree it
lands on**, which is the previous anchor's own finding applied to this
paragraph rather than restated about that one. One of those nine, **#654**, is
open against the budget itself; nothing here anticipates what it decides.

**And it started moving immediately, which is recorded because it is evidence
for the paragraph above rather than a correction to it.** Measured once, minutes
after the commit that wrote it: `origin/main` had already reached
**v0.0.243** — `48be7e6`, releasing #646 (`c277864`), which edits one member,
`docs/research/README.md` — so the count was **nine** before this branch had a
pull request, and one member had moved since the tree every citation here was
derived from. **The anchor is not chased to that tree**, deliberately: an
anchor names the commit its citations were re-read against, and #646's edit
belongs to the next window rather than to this one. What the reading is for is
that it settles, with a number rather than an argument, that the figure above
had to be scoped to a commit.

`eb1f040` is `origin/main`'s tip at the time of writing and is itself the
**v0.0.242 release commit**, named deliberately rather than the merge commit
beneath it, for the reason every previous anchor gives: it is cut after the
last merge in the window (#643, `93bfbbb`), contains every sentence below, and
is the exact tree every citation here was re-derived from.

**The delta note for `eb1f040`.** `git diff --name-only 104d078..eb1f040` is
**69 files**, of which **nine are members**: `docs/research/README.md`,
`package.json`, `src/simulation/economy/income.ts`,
`src/simulation/protocol/types.ts`, `src/ui/hud/messages.ts`,
`src/ui/hud/projection.ts`, `tests/unit/ui-hud-messages.test.ts` and ADRs
**0028** and **0064**. `docs/adr/STATUS-QUEUE.md` is a tenth changed file that
§§3-6 name and is deliberately outside its own set. **Nothing under
`supabase/migrations/`, `src/services/telemetry/**` or `src/ui/primitives/**`
changed**, so those three glob members contributed none.

**The window is eight releases carrying eight merged pull requests** — #636,
#635, #638, #628, #637, #651, #644 and #643 — read off `git log --oneline
--first-parent 104d078..eb1f040` (excluding the eight release-bump commits).
**Two of the eight edit this file and neither is new drift**: `68f1d9b`/#638 is
the previous anchor's own writing commit, kept below as that anchor's account,
and `8ca7a68`/#651 is the correction to it, also kept below. **What those two
changed inside §§3-6 is two shas and nothing else** — `diff` over §§3-6 between
the two trees returns exactly the two `verified at` values and no other line,
which is measured rather than assumed and is why the enumerated-citation
surface below is untouched. **No commit in this window filed a §2 entry**, so
all four places that count §2 stay at eight.

**Nothing structural moved, for the second anchor running — and the second
reading is worth less than the first, which is said here rather than left to be
inferred.** The `Proposed` count is **unchanged at twenty-nine**: counted on
disk at `eb1f040` by the same method as every reading in this sequence, the
first non-blank line under each document's *own* status statement, `## Status`
heading or `- Status:` bullet alike — **twenty-seven** under a heading and
**two** under a bullet (0064 and 0067, still the only two, so a heading-only
scan still undercounts by two). `docs/adr/README.md` agrees, counted
independently: **twenty-nine** rows opening `Proposed` out of **72**, and
**Next free number: 0079**, unmoved. No ADR arrived in the window and no status
flipped in it. So §3's opening, §5's first bullet and §6's `income.ts` bullet
all still read **twenty-nine**, all three are still correct, and none was
edited. **The first such window was a result; a second one running is a weaker
result and not a stronger one**, because two consecutive windows that exercise
nothing say nothing about the mechanism that splits the four places apart.

**ADR 0079 exists and is not counted, and the reason is the one this file gives
every time.** It is `Proposed` on `agent/593-longer-sentences` (PR #659, open
and unmerged at this commit); a branch nobody has merged is invisible from
disk, and the twenty-nine is a count of `main`. If #659 merges before this
does, the count is thirty and four places need it. **Which way that goes is not
something this pass can record**, and it is written down rather than guessed at
for the same reason the budget figure above is scoped to this commit.

**§5's handshake claim was re-run because `types.ts` changed, and this time
none of the nine moved.** `grep -rn "protocol/handshake" src/ --include=*.ts`
still returns **nine** hits, still split **4 / 2 / 3**, all receivers or
declarations. `types.ts` is unmoved at `:12`, `:23`, `:223` and `:442` after
taking **+31/-8** in this window from #644's stale-comment sweep;
`transferables.ts` is unmoved at `:39` and `:55` and `state-machine.ts` at
`:796`, `:826` and `:835`, both of those files being outside the window
entirely. **This is the fourth consecutive anchor at which the claim has had to
be re-run**, and the first of the four at which the re-run cost nothing: the
`0637ab1` pass moved six of the nine and `104d078` moved three
(`state-machine.ts`, a uniform +2). Whether any anchor before those three also
found all nine unmoved is not checked here and is not claimed.

**`income.ts` changed again — #637's relocation work — so §6's absence is
re-established rather than inherited for the third anchor running**: `grep -c
"Proposed" src/simulation/economy/income.ts` returns **0** against the edited
file.

**One citation moved, and it is the smallest thing in this window.**
`tests/unit/ui-hud-messages.test.ts` gained a five-line fixture comment from
#635 (`occupiedPlaces: 0`, so the `PRISONERS` chip takes its
`prisonersWithoutBed` branch), and `it('imports nothing from the simulation',
…)` moved from `:230` to **`:235-241`**. **Nothing in this file is falsified by
that**, and saying why is the point: the two places that cite that test as
`:218-224` both scope the number to `bb3a01e` in the same sentence, so they are
dated records rather than live claims, and `git show
bb3a01e:tests/unit/ui-hud-messages.test.ts` puts the test at `:218` — the
record is correct about the tree it names. The current value is written here so
the next reader has it without re-deriving it.

**`messages.ts` and `projection.ts` both changed and both of §6's ADR 0017
corrections hold.** `src/ui/hud/messages.ts:85` reads *"ADR 0017 -- Accepted"*
and `src/ui/hud/projection.ts:454` (read `:408` at `58220f7`; #707 inserted the contraband-name docblock above it, the same +46 recorded in the header) *"ADR 0017 is Accepted without naming one
either"*; neither file names a currency, which is what the label rests on.

**Two ADRs changed and neither change reaches a claim §§3-6 make about them.**
**0028** gained a dated narrowing on 2026-08-30 from ADR 0076 decision A(i)
(#637) — a resident the prison *can* rehouse is moved rather than left, while
*"nobody is evicted"* and *"occupancy above capacity is a legal, named state"*
both survive as decided. §5's ADR 0023/0028 entry is about 0028's six phases,
the `zoning.ts` capacity collaborator and the `'object.*'` grep, and the
amendment touches none of the three; 0028's status is still **`Accepted,
2026-08-25.`** **0064** gained a #543 correction recording that the income line
walks `residentIdsWithExistingPlace` rather than `residentIds`; it is read here
only for its status line, `- Status: Proposed, 2026-08-28` at `:3`, unmoved.

**`docs/research/README.md` gained seventeen lines across two commits — two
table rows from #636 and #643, and a re-read note under them — and §6's
*"deliberately left"* bullet still rests on the rule that file states rather
than on the table.** The rule is at `docs/research/README.md:8-10`, opened
rather than inherited, and it reads *"They are read-only history: when the code
moves on, a record here does not become wrong, it becomes older."* **The
`cfab558..53e1405` window note further down this header renders it as
*"records here are read-only history: …"***, which is a paraphrase rather than
the sentence as `docs/research/README.md` states it; the
rule it rests on is unaffected and the wording is corrected here rather than
there, because that paragraph is a kept record of what that pass read.

**Four members outside the intersection were re-derived anyway, because each
carries a count rather than a line and a count is cheap to re-take.**
`src/ui/hud/hud.ts`, `src/persistence/save-schema.ts`,
`src/simulation/protocol/commands.ts` and
`src/simulation/construction/definition.ts` are all untouched in this window,
and all four figures hold: `HudIntent` still declares **nineteen** members,
counted the way §5's ADR 0022 entry says to count them; `masterSeedSchema`'s
comment is still at `save-schema.ts:1214`; `simulationCommandSchema` still
discriminates **fourteen**, declared at `commands.ts:542`; and `grep -rno
"'object\.[a-z-]*'" src/ --include=*.ts | grep -v '^src/content/'` still
returns **39** hits in **two** files, **nineteen** in `definition.ts` and
**twenty** in `environment-art.ts`, which is the shape §5 records as falsified
and the numbers it records it at.

**The two live `verified at` claims were re-run rather than carried.** Neither
`supabase/migrations/` nor `.github/workflows/` appears anywhere in this
window's 69 files. The migrations directory still holds **twenty-three** files
(`ls supabase/migrations/*.sql | wc -l` returns 23); the retention grep still
returns exactly **one** hit and it is still
`20260826130000_server_stamp_updated_at.sql:68`, prose rather than a mechanism;
all six SQL anchors (`:45`, `:71-73`, `:91`, `:150`, `:178`, `:188`) and all
four workflow anchors (`:33`, `:34`, `:41`, `:65`) were opened and still land,
and `grep -c '^\s*push:'` over the workflow still returns **0**. Both claims
are re-anchored to `eb1f040`.

**The four places that count §2 were swept and all four agree at eight** —
this header's paragraph, the title (which states a subject and no count, and is
therefore the only one that cannot rot this way), §2's own heading *"## 2.
Eight entries"*, and §5's preamble's *"EIGHT at #615"*. As at the previous
anchor, they agree because nothing moved them rather than because a filing
commit moved them together, and that is the weaker of the two results: **the
split has now gone two consecutive windows without being exercised at all**,
so this sweep confirms nothing about it.

**Both derivation scans were re-run over §§3-6, and this time one of them
returned a member the enumerated list has never named. The seven-anchor run
ends, and it ends by finding that the last two entries in it were wrong.**

- **The path scan** — every backticked span in §§3-6 carrying a `/`, with
  `:N`/`:N-M` stripped, filtered to those ending in a known file extension —
  returns **78** distinct spans, of which **62 exist on disk** and **16 are
  `git` and `grep` command lines that carry a slash without being paths**
  (`git show cfab558:src/ui/primitives/icon.ts`, `grep -rn
  "services/telemetry" src/ --include=*.ts`, and fourteen more of that shape).
  Of the 62, the documented non-members are `docs/adr/STATUS-QUEUE.md`, outside
  its own set, and the spans reaching the set through a directory glob
  (`src/ui/primitives/icon.ts`, one file under `supabase/migrations/`).
  **One is left over and it is a real omission**:
  `docs/research/2026-08-29-a-prison-that-cannot-buy-its-first-bed.md`, cited
  in §5's first bullet for the two §2 entries handed over in it. It is added to
  the set below.
- **The number scan** — every bare `00NN` token in §§3-6 — returns **65**
  tokens, of which **61 name an ADR that exists on disk**. The four that do not
  are **0030**, **0055**, **0058** and **0072**: identical to the previous
  anchor's residue, and each still a number inside a claim about
  `docs/adr/README.md`'s **Next free number** line or, for 0072, the held
  events-persistence number. **0072 is still not a member and still not
  missing**: no such document exists on disk, the number being held for the
  events-persistence decision. Four further tokens — 0038, 0039,
  0040 and 0041 — now name ADRs that *do* exist while appearing in §§3-6 only
  inside claims about that same next-free line, so they stay classified where
  this subsection has always put them: a scan that returns a token is not a
  citation that creates a dependency.

**Why the omission is worth more than the file it names.** The span was in the
scan output at `0637ab1` and at `104d078`, and both of those passes reported
that neither scan returned a member the list had never named — *"the sixth
anchor running"* and *"the seventh anchor running"*. It entered §§3-6 in
`0637ab1`'s **own** commit: that pass wrote the sentence citing the record and
did not add the file to the set, which is exactly the omission this
subsection's maintenance rule exists to prevent, committed by the pass that
maintains the rule. Then `104d078` re-ran the scan, got the span back, and
reported a clean residue. **So the derivation check found this twice and was
overruled by the sentence written about it twice** — which is a different
failure from the one this subsection was built for. The scan is not the weak
part; reading its output is. Measured rather than argued: re-running the filter
above over §§3-6 **as they stood at `104d078`** returns the same 78 spans and
the same 62 existing files, including this one.

**Neither total is comparable with any previous anchor's and the residue is
what is comparable**, as every reading in this sequence says. The `104d078`
pass recorded **79** spans with a residue of **17** command lines; this filter
returns **78** and **16** over that same tree, so the one-span difference lives
entirely inside the command-line residue and neither pass states its filter
finely enough to reconcile it. The count of *existing* spans, 62, is identical
across the two trees, and so is the set: `diff` over the two scans' outputs is
empty in both directions, for both the path scan and the number scan.

**The 0051 half of this pass's brief was not done, and the reason is a fact
about `main` rather than a judgement.** The brief said ADR 0051 had been
accepted on 2026-08-30, that the `Proposed` tally was one high in several
places, and that the header's handover naming **0051**, **0052** and **0054**
was a third discharged. **PR #647 has not merged.** It is open at the time of
writing, and `docs/adr/0051-…md` reads **`Proposed, 2026-08-28. Not
self-approved.`** on disk at `eb1f040`; 0052 and 0054 each read
`**Proposed, 2026-08-28.** Not self-approved.` there too — so the tally is
*not* one high, the handover is *not* a third discharged, and every count
above is a count of the tree rather than of that branch. Two corrections to the
brief, recorded because the next pass will be handed the same task: the
handover paragraph naming those three ADRs is in **this header**, not in §2 —
§2 mentions 0051 only inside ADR 0056's entry — and the fourth live assertion
of the same shape sits in `docs/adr/0056-…md:311`, *"it does not edit ADR
0051, because ADR 0051 is itself Proposed"*, re-read on disk here and still
standing; #647 proposes to correct it. When #647 lands, the work is the four `Proposed` counting sites
(this header's paragraph, §3's opening, §5's first bullet, §6's `income.ts`
bullet), the header's handover paragraph, and §5's two sentences asserting ADR
0054's status — which stay untouched here for the reason they have always
stayed untouched: flipping a status is not a re-anchor's job.

**The `104d078` anchor's account, kept. The paragraphs below are that pass's,
including its own correction by #651 and its own record of the anchors before
it.** Its anchor line named `104d078` and **v0.0.234**, coming from `0637ab1`
(v0.0.225), and recorded that it was dispatched at nine of the ten releases the
budget allows and merged at eleven. It is described rather than quoted, for the
reason the paragraph further down gives: the gate counts anchor spans and
requires exactly one.

**The paragraph that stood here until 2026-08-30 said "ten of the ten
releases the budget allows -- the first pass in this series dispatched with
no headroom left at all", and went on to say that the *next* merge of
anything would take the budget to eleven, and that this was "the gate firing
rather than being anticipated". A second paragraph beneath it explained "why
the headroom went in one night", counting nine releases from `53e1405` and
naming #606, #578, #605, #617, #618 and #619.** Every sentence of both was
true of the **previous** anchor and was carried over with only the sha and
the version changed: `53e1405` is v0.0.215, and v0.0.215 to v0.0.234 is
nineteen releases, not nine. The correct attribution has always been below,
at the previous anchor's own line, which says v0.0.225 was *"dispatched at
ten of ten -- the only pass in this series moved with no headroom at all"* --
and still says it.

It is corrected rather than deleted, because **the carry-over is itself the
finding**: this file's own pass reproduced, in its own header, the exact
class of defect the file exists to catch. `adr-status-queue-anchor-contract`
did not see it, correctly -- it tests the anchor's format and singularity,
not whether the prose around it is true.

**What actually happened is worse than the sentence it replaces, which is why
this is not bookkeeping.** `0637ab1` (v0.0.225) to `104d078` (v0.0.234) is
**nine** releases, so this pass was dispatched with one still spendable. It
was not merged there. Two further releases landed while it sat open --
`main` reached **v0.0.236** -- so the budget went to **eleven** and the
contract turned `main` red *before this pass landed*. **Every open pull
request inherited that failure**, because the gate tests the tree rather than
the diff -- including #628, the fix for the browser flake that was itself
reddening this pull request's own `browser` job. The pass that exists to keep
the budget solvent was blocked by the budget it was spending, and the merge
went through with a red `browser` job on evidence recorded in that pull
request.

So the case this sequence had not yet met has now been met, and it is not the
one the carried-over paragraph named. Not *dispatched with no headroom*, but
**dispatched with headroom and merged without it**.

**The remedy is still not a larger budget** -- the constant's own comment
forbids raising it and says why -- but the shape of what would help has
changed with the finding. A check that *warns* at seven rather than failing
at eleven would put the signal where the merging happens, and it must read
the count **at merge**, because this pass was correct at dispatch by exactly
the margin that failed at merge. A number measured when a branch is cut says
nothing about the tree it lands on. That is not done here.

`104d078` is `origin/main`'s tip at the time of writing and is itself the
**v0.0.234 release commit**, named deliberately rather than the merge commit
beneath it, for the reason every previous anchor gives: it is cut after the
last merge in the window (#633, `36dcdf3`), contains every sentence below, and
is the exact tree every citation here was re-derived from.

**The delta note for `104d078`.** `git diff --name-only 0637ab1..104d078` is
**46 files**, of which **eight are members**: `docs/AGENT_WORKFLOW.md`,
`docs/HUD_PROJECTIONS.md`, `docs/research/README.md`, `package.json`,
`src/simulation/economy/income.ts`, `src/simulation/protocol/types.ts`,
`src/simulation/worker/state-machine.ts` and ADR **0003**. Nothing under
`supabase/migrations/`, `src/services/telemetry/**` or `src/ui/primitives/**`
changed.

**Nothing structural moved, and that is the result rather than an absence of
one.** The `Proposed` count is **unchanged at twenty-nine** — no ADR was added
and no status flipped in nine releases, which has not happened since this
sequence began tracking it. `docs/adr/README.md` agrees at twenty-nine,
counted independently. So §3's enumeration, §5's first bullet and §6's
`income.ts` bullet are all still correct and none was edited; a pass that
changes nothing is reported as such rather than padded.

**§5's handshake claim was re-run, because both its files changed again.**
Still **nine hits, still split 4 / 2 / 3**, all receivers or declarations.
`types.ts` is unmoved at `:12`, `:23`, `:223`, `:442` and `transferables.ts`
at `:39`, `:55`; `state-machine.ts` moved from `:794`, `:824`, `:833` to
**`:796`, `:826`, `:835`** — a uniform +2. That is the third consecutive
anchor at which this one claim needed re-running, and the second at which only
`state-machine.ts` moved.

**`income.ts` changed again** — #626 gave it `stateIncomeForOccupiedPlaces` —
so §6's absence is re-established rather than inherited for the second anchor
running: `grep -c "Proposed" src/simulation/economy/income.ts` returns **0**
against the edited file.

**Both derivation scans were re-run over §§3-6, and neither returned a member
the list has never named — the seventh anchor running at which that is true.**
The path scan returned **79** distinct backticked spans ending in a known
extension; its entire residue is the documented one, and it is **17 `git` and
`grep` command lines that carry a slash without being paths** — `git show
cfab558:src/ui/primitives/icon.ts`, `grep -rn "services/telemetry" src/
--include=*.ts`, and fourteen more of that shape. Every span that is a path
exists on disk.

The number scan returned **65** tokens, of which **61 name an ADR that exists**.
The four that do not are **0030**, **0055**, **0058** — the next-free residue
this subsection already enumerates — and **0072**, which is held and unwritten
for the events-persistence decision and which this file has recorded as *"not a
member and not missing"* for six anchors. **The residue did not grow this
time**, which is the first anchor since `53e1405` where it held: that pass added
0078 to it, and 0078 has since left by becoming a real citation, so the count
is back where it was.

**The previous anchor's line named `0637ab1` and **v0.0.225**, coming from
`53e1405` (v0.0.215), and was dispatched at ten of ten -- the only pass in
this series moved with no headroom at all. The one before it named `53e1405`
and **v0.0.215**, coming from `cfab558` (v0.0.208), with six open pull
requests listed -- #578, #605, #606, #610, #611 and #612.** It is described rather than quoted, and that is not style:
`tests/foundation/adr-status-queue-anchor-contract.test.ts` counts every span
matching *"Re-anchored at `main` @ `<sha>` (v<version>)"* and requires exactly
**one**, so a verbatim quotation of a superseded anchor line fails the gate as
a second live anchor. The first attempt at this paragraph did quote it and the
gate caught it -- `1 failed`, *"must open with exactly one"*, `expected […] to
have a length of 1 but got 2`. **That test grants a past-tense exemption to
`verified at` claims and none to its own anchor line**, which is an asymmetry
rather than an oversight to route around: the exemption exists so §5 can
preserve what a superseded entry used to claim, and the anchor line has no
such record to preserve because this paragraph is it.

**And the six kept anchor records further down this file do quote it verbatim,
which looks like a contradiction and is instead an undocumented load-bearing
line break.** Each reads *"It read: 'Re-anchored at `main` @"* with the sha on
the **next** line, and the gate's pattern requires a literal space between `@`
and the opening backtick -- ``Re-anchored at `main` @ `([0-9a-f]{7,40})` ``. A
newline is not that space, so every one of those six records is invisible to
the scanner **because of where the paragraph happens to wrap**. Measured, not
inferred: joining the `82ae630` record onto one line and running the gate gives
*"expected […] to have a length of 1 but got 2"*, and restoring the break gives
`4 passed`. **So re-flowing any of those six paragraphs -- a formatting edit,
the kind nobody reviews -- turns a historical record into a second live anchor
and fails a gate whose message will talk about anchors rather than about
wrapping.** Written down because it is exactly the shape of trap this file
exists to record: a property everything below depends on, held by nothing that
says so. Four of those five have merged
inside this window and are accounted for below; **#578 is still open**, which
makes it the only pull request to have been named in two consecutive anchors'
dispatch notes as outstanding. That is recorded rather than acted on: whether
a pull request open across seven releases is stalled or merely large is not
something this file can read, and `docs/AGENT_WORKFLOW.md` §3's rule about
state this repository cannot read applies to it.

**The window is 58 files**, across seven releases carrying **seven** merged
pull requests -- #583, #603, #577, #579, #580, #581 and #607 -- read off
`git log --oneline --first-parent cfab558..origin/main` (excluding the seven
release-bump commits). **One of the seven edits this file and it is not new
drift**: `d47edfd`/#583 is the previous anchor's own writing commit, kept
below as that anchor's account. **No commit in this window filed a §2 entry**,
so all four places that count §2 stay at six and the sweep below reports
agreement rather than a correction.

The delta intersection against the enumerated set is **eight**:
`docs/adr/README.md`, `docs/research/README.md`, `package.json` (read for its
version rather than diffed, as every anchor's convention states),
`src/main.ts`, `src/ui/hud/hud.css`, `src/ui/primitives/icon.ts`,
`src/ui/primitives/primitives.css` and `src/ui/tokens.css`.
`docs/adr/STATUS-QUEUE.md` is a ninth changed file that §§3-6 name and is
deliberately outside its own set. **`src/ui/primitives/icon.ts` reaches the
intersection only through the directory glob `src/ui/primitives/**`**, which
§5's `ui-hud-messages.test.ts` citation is a claim about -- and it is the member
that produced this window's sharpest finding, which is the argument for
listing a glob as a member rather than only the files under it that are cited
by name. **No file under `supabase/migrations/` changed** -- the directory
still holds twenty-three, so §3's table needed no re-derivation. **Three ADRs
join the set in this commit** -- **0075**, **0076** and **0077** -- by the
rule the derivation subsection states: the corrected counts below now
enumerate them.

**What the eight cost: one entry corrected, one accepted ADR's sentence
falsified outside this file, and a citation pair moved twice in one file.**

**Falsified by this window, and it is not in this file: ADR 0025's withdrawal
sentence.** §5's `3.9px` bullet quotes that accepted ADR verbatim -- *"`3.9`
appears in no other ADR, in no `.css` file and nowhere in `src/`"* -- and the
last clause went false at **`2a00f98`** (#579, v0.0.212). `src/ui/primitives/icon.ts:68`
now holds `'M15.8 16.1h3.9'`, the fourth stroke of the `ui-scale` glyph the
interface-scale work added; `git show cfab558:src/ui/primitives/icon.ts`
returns no `3.9` at all, and `git log -S 'h3.9'` names that one commit. **The
sentence's point survives and its grep does not**, which is the distinction
worth keeping: no `.css` file records the figure (there are still **four**
under `src/ui/`, re-derived here), no other ADR records it, and nothing in
`src/` records it *as a measurement* -- but a reader running the raw grep the
sentence invites now gets a hit, and it is SVG path data rather than a
headroom figure. **The fix is ADR 0025's, not this file's**, and it is handed
over rather than made here: the clause needs the same both-directions
treatment everything else here gets, naming the path-data hit so the next
reader does not have to re-derive that it is not a measurement. Recorded in
§5's bullet as well, where the quotation lives.

**Moved by this window: `src/main.ts`, in two places and by two different
amounts.** #579 is the only commit in the window to touch that file (`git log
--first-parent cfab558..origin/main -- src/main.ts` returns `2a00f98` alone),
and it added 73 lines split either side of the code §5's telemetry bullet
cites. Every anchor in that bullet was re-derived by opening the file: the
import span `:98-100` is **`:103-105`**, the pipeline construction `:158-199`
is **`:163-204`**, the `crashReporter` gate `:196-199` is **`:201-204`** and
the prose hit `:174` is **`:179`** -- all four five lines down -- while the
consent-prompt gate `:2762` is **`:2833`** and the mount span `:2766-2771` is
**`:2837-2842`**, both seventy-one lines down. **That is the seventh
consecutive anchor at which this bullet's `src/main.ts` numbers have moved**,
and `src/ui/telemetry-consent-prompt.ts:8` -- the one anchor in it cited by
symbol -- has still never moved, on a file no window has touched. The grep the
bullet tells the next reader to run still returns **six** hits, still split
four in `src/main.ts` and two in `src/ui/telemetry-consent-prompt.ts`, and the
two prose hits are still the same two.

**Unchanged, every one opened rather than rested on the diff.**
`src/ui/hud/hud.css` took 121 added lines against 5 removed and still records
no `3.9`; `src/ui/tokens.css` took 190 against 17 and
`src/ui/primitives/primitives.css` one against one, and neither records one
either -- so the four-`.css`-file half of the ADR 0025 finding survived the
largest edit any of those files has taken inside a window this file has
measured. Counted with `git diff --numstat` rather than `--stat`, because
`--stat`'s single figure is added *plus* removed, and reading it as growth is
how a line count in this file comes to be wrong by the size of a deletion. `docs/research/README.md` gained one table row
and §6's *"deliberately left"* bullet still rests on the rule that file states
rather than on the table; the rule is still there, under *"Research
records"*, in the sentence *"records here are read-only history: when the code
moves on, a record here does not become wrong"*. `src/simulation/economy/income.ts`
is outside this window -- not among the fifty-eight files the diff reports --
and was re-grepped anyway: still no `Proposed` count in it at all, for the
eleventh reading.

**Three members outside the intersection were re-derived anyway, because each
carries a count rather than a line and a count is cheap to re-take.**
`src/ui/hud/hud.ts`, `src/persistence/save-schema.ts` and
`src/simulation/protocol/commands.ts` are all untouched in this window (`git
diff --name-only cfab558..origin/main` lists none of the three), and all three
figures hold: `HudIntent` still declares **nineteen** members, counted the way
§5's ADR 0022 entry says to count them; `masterSeedSchema`'s comment is still
at `save-schema.ts:1214`; and `simulationCommandSchema` still discriminates
**fourteen**. **The previous anchor found two of those three wrong**, both
falsified in a window before its own, so re-taking them on an untouched tree
is the control that says the corrections held rather than an idle repetition.

**`docs/adr/README.md` moved two lines this file cites by value.** **Next free
number** went **0075 → 0078** across two commits -- #580 landed 0075 and 0076
together and moved it to 0077, #581 landed 0077 and moved it to 0078 -- and
the Proposed row count went 27 → **30** out of **71** rows. Every other
citation this file makes into the index by number sits inside a preserved
record of a superseded claim and is left as it stands.

**The two live `verified at` claims were re-run rather than carried.** Neither
`supabase/migrations/` nor `.github/workflows/` appears anywhere in this
window's 58 files. The migrations directory still holds twenty-three files;
the retention grep still returns exactly one hit and it is still
`20260826130000_server_stamp_updated_at.sql:68`, prose rather than a
mechanism; all six SQL anchors (`:45`, `:71-73`, `:91`, `:150`, `:178`,
`:188`) and all four workflow anchors (`:33`, `:34`, `:41`, `:65`) were opened
and still land. Both claims are re-anchored to `53e1405`.

**The four places that count §2 were swept and all four agree at six** -- this
header's paragraph, the title (which states a subject and no count, and is
therefore the only one that cannot rot this way), §2's own heading *"## 2. Six
entries"*, and §5's preamble's *"SIX at #571"*. **This is the first window in
the series in which the four agreed because nothing moved them**, rather than
because a filing commit moved them together: no commit in this window filed a
§2 entry, so the mechanism that splits them was never exercised. That is a
weaker result than the previous anchor's and is reported as the weaker one --
a sweep that finds agreement on an untouched set of paragraphs has confirmed
nothing about the split, exactly as the previous anchor recorded of *its*
count-only window.

**Three outstanding ADRs landed in this window with no §2 row, and this pass
files none of them. The reason is the one §2's own text calls the rule
"unsatisfiable under concurrency", and it is verifiable rather than
asserted.** 0075 and 0076 arrived at `092991e`/#580 and 0077 at
`827201e`/#581, all three `Proposed, 2026-08-29. Not self-approved.` on disk
at this anchor. Taking them one at a time:

- **0075 and 0076: the entries exist, they were handed over deliberately, and
  the handover is still open.** `docs/research/2026-08-29-a-prison-that-cannot-buy-its-first-bed.md`
  §8 is headed *"Handed over: the two `docs/adr/STATUS-QUEUE.md` §2 entries"*
  and carries both in full, with the reason written out: *"any count written
  here is wrong by one whichever way the two branches land, in all four places
  at once, and the merge conflicts in exactly the four paragraphs whose value
  is the record of how they came apart."* That was true against
  `agent/status-queue-0074-entry` when it was written and **it is true again
  now**, against a different branch: PR **#610** is open at the time of
  writing and its `docs/adr/STATUS-QUEUE.md` reads *"## 2. Seven entries: …
  and ADR 0071's open-area amendment"*. Filing 0075's and 0076's rows from
  this branch would move the same four counters from six in the same four
  paragraphs. **So the entries are owed, they are written, and the commit that
  files them is the one that can read the true count off the merged file** --
  which is the mechanism `9f0096c`/#574 demonstrated and which the previous
  anchor recorded from the other side.
- **The owner has ruled on both, which changes what the entry is for but not
  whether it is owed.** Both ADRs' own `Status` sections say the rulings were
  the owner's and dated 2026-08-29, and PR **#606** (`claude/accept-adr-0075-0076`)
  is open to move both to `Accepted, 2026-08-29, by the repository owner.`
  **This pass deliberately does not treat that as discharging the row.** A
  status that is `Proposed` on `main` is what every gate here reads, an
  unmerged branch is invisible from disk -- this file's own numbering
  paragraph says so repeatedly -- and if #606 merges first the correct action
  is the standing recipe, which is to file nothing and delete nothing, because
  there was never a row to delete. Both outcomes are written down here so
  whichever lands is a lookup rather than a re-derivation.
- **0077 is the one with no handover anywhere**, and it is the finding. #581
  added the ADR, did not file a §2 row, and left no entry text in its PR body,
  in the ADR, or in any research record -- `grep -rn "STATUS-QUEUE" docs/adr/0077-*.md
  docs/research/2026-08-29-playtest-ordering-and-the-second-room.md` returns
  nothing. So it is the **eleventh** outstanding ADR since the rule was
  restated to arrive with no row, the first since 0074 broke the nine-long
  streak, and the only one of the eleven that is not either a bare skip or a
  recorded handover: it is a skip that looks like a handover from the outside,
  because the two ADRs beside it in the same window *were* handed over. **That
  is a new failure shape for this file and it is named rather than fixed
  here**, because writing a §2 entry for 0077 means asserting what settling it
  commits the project to, and that is the drafting agent's evidence to give,
  not a re-anchor's to invent.

**The `cfab558` anchor's window note and findings, kept as that anchor's
account. The paragraphs below are that pass's, including its own four-place
sweep, which found all four agreeing at six.**

**The window was 53 files**, across seven releases carrying **seven** merged
pull requests -- #567, #568, #570, #571, #572, #575 and #574 -- read off
`git log --oneline --first-parent e1813b7..origin/main` (excluding the seven
release-bump commits). **Two of the seven edit this file and neither is new
drift**: `6165952`/#567 is the previous anchor's own writing commit, kept
below as that anchor's account, and `9f0096c`/#574 filed §2's sixth entry and
swept all four counts in the same commit, which is the case §5's preamble
records from the other side.

The delta intersection against the enumerated set is **ten**:
`docs/adr/README.md`, `docs/research/README.md`, `package.json` (read for its
version rather than diffed, as every anchor's convention states),
`src/persistence/save-schema.ts`,
`src/simulation/presentation/room-projection.ts`,
`src/simulation/rooms/zoning.ts`, `src/ui/hud/build-panel.ts`,
`src/ui/hud/hud.ts`, `src/ui/hud/messages.ts` and
`tests/foundation/unconsumed-command-contract.test.ts`.
`docs/adr/STATUS-QUEUE.md` is an eleventh changed file that §§3-6 name and is
deliberately outside its own set. **No file under `supabase/migrations/`
changed** -- the directory still holds twenty-three, so §3's table needed no
re-derivation. **Four ADRs join the set in this commit** -- **0070**,
**0071**, **0073** and **0074** -- by the rule the derivation subsection
states: the corrected counts below now enumerate them.

**One sentence in the previous anchor's window note is wrong about this file's
own dependency set, and it is the cheap kind to find.** It read *"two of those
are this file and the index, which are not in their own dependency sets"*.
This file is not in its own set and says so wherever the question comes up;
**`docs/adr/README.md` is a declared member**, named in the second bullet of
*"The set, in full"* below since long before that sentence was written.
Corrected here rather than overwritten, because the arithmetic around it is
unaffected -- the index was read either way -- and because a sentence that
takes a member out of the set is exactly how a later delta pass comes to skip
a file.

**The previous anchor's window note, kept.** It read: *"**The window is 80
files.** Six merges landed in it (#564, #533, #548, #549, #543 and #566, with
their releases). The delta intersection against the **43** files §§3-6 cite is
**eight** ... **The enumerated set grew from 41 to 43 with no commit deciding
to grow it**: it is derived by scanning §§3-6 for rooted paths that exist on
disk, so a citation added anywhere in those sections joins the dependency set
silently."* **That derivation was re-run at this anchor and its own total of
43 is not reproducible**, which is recorded rather than quietly restated:
scanning §§3-6 for backticked rooted paths that exist on disk returns **79**
distinct spans here, of which **18** are bare directory prefixes and **61**
are files -- one of them `docs/adr/STATUS-QUEUE.md` itself. The two numbers
are not comparable, because the sentence giving 43 does not state its filter;
what *is* comparable is the residue, and it is unchanged: **no member the
enumerated list has never named**, for the fourth anchor running.

**What the ten cost: three entries corrected, and two of the three were
already false when this window opened.** The one this window actually
falsified is the smallest of them.

**Falsified by this window:** §5's ADR 0009 entry cites
`src/persistence/save-schema.ts:1198` for the comment naming `masterSeedSchema`
*"from `services/challenges`"*. #571's V4 bounds-recovery work added sixteen
lines above it, so it is **`:1214`** here. That is the fifth pair of numbers
this one comment has been given and the sentence it supports has never
changed a word, which is the symbol-over-line argument made again by the
same citation.

**Already false, first: `src/ui/hud/hud.ts`, and the count as well as the
numbers.** §5's ADR 0022 entry states the live measurement *"`HudIntent`
declares **eighteen** members"*. It declares **nineteen** at `cfab558`,
counted the way the entry says to count it — `grep -c "readonly kind: '"`
between `export type HudIntent =` and the union's close. The nineteenth is
`dismiss-staff`, added by **#533 at `a8a446e`**, which is in the *previous*
window; `git show <sha>:src/ui/hud/hud.ts` puts the member on `e1813b7` and
not on `82ae630`. **The previous pass had that pull request in front of it and
recounted the wrong union**: its own header records #533 moving the command
union from thirteen to fourteen, in the same paragraph, and did not recount
the intent union the same change extended. Three of that entry's member
anchors were stale by the same window or an earlier one and are re-derived
here: `arm-build-tool` `:429-434` → **`:444-449`**, `cancel-build-order`
`:471` → **`:486`** and `arm-room-tool` `:561-566` → **`:598-603`**. The first
two were exact at `4ace2da`/`85c1c29` and one line out from `82ae630`; the
third was **twenty-three lines out at `e1813b7`**, moved by #533 as well. The
count *"three of them room-related"* holds — `dismiss-staff` is not a room —
and that is the half of the sentence worth keeping.

**Already false, second: `src/simulation/rooms/zoning.ts`, stale across five
anchors.** §5's ADR 0023/0028 entry gives the `RoomZoningService` capacity
collaborator as declared at `:398` and called at `:567`, the zeroes `register`
writes at `:560-562` and the comment above them at `:556`. All four are the
`bb3a01e`-through-`07add3e` values; **`7d81040` (#499) moved them inside the
`07add3e..01974e5` window** and they have been carried unchanged through
`01974e5`, `33510df`, `4ace2da`, `85c1c29`, `82ae630` and `e1813b7`. At
`cfab558` the declaration is **`:428`**, the call **`:607`**, the zeroes
**`:600-602`** and the comment **`:596`** — and `git show` puts them at those
values on every one of those six trees, so nothing in *this* window moved
them. The entry already says these numbers *"have now been wrong at three
successive anchors"* and that they are *"an aid rather than the citation"*;
the sentence is right about the shape and now understates the run, so the
number in it is corrected too. The two zoning anchors the entry cites for the
enclosure refusal, `:217` and the quoted comment at `:255-256`, were opened
and both still land.

**Seven intersecting citations survived unchanged, every one opened rather
than rested on the diff.** `src/ui/hud/build-panel.ts` still says *"7.8px is
the entire budget"* after a 48-line change; `src/ui/hud/messages.ts` still
says ADR 0017 is Accepted and still names no currency after a 17-line change;
`src/simulation/presentation/room-projection.ts` still reads an over-capacity
room as full at 100 % (its two edits in this window replace *"a V4 save"* with
the post-#559 wording and touch nothing this file cites);
`tests/foundation/unconsumed-command-contract.test.ts` gained sixteen lines
**below** everything cited, so `AWAITING_PRODUCER` is still declared at
`:224` with its gate comment at `:250` and **still empty**;
`docs/research/README.md` gained one table row and §6's *"deliberately left"*
bullet rests on the rule that file states rather than on the table.
`src/simulation/protocol/commands.ts` and `src/simulation/economy/income.ts`
are outside this window and were re-grepped anyway: fourteen `type: z.literal`
hits with `simulationCommandSchema` still at `:542`, and no `Proposed` count
in `income.ts` at all.

**`docs/adr/README.md` moved one line this file cites by value.** **Next free
number** went **0074 → 0075** with 0074's row, and the Proposed row count went
26 → 27; every other citation this file makes into the index by number sits
inside a preserved record of a superseded claim and is left as it stands.

**The two live `verified at` claims were re-run rather than carried.** Neither
`supabase/migrations/` nor `.github/workflows/` appears anywhere in this
window's 53 files. The migrations directory still holds twenty-three files;
the retention grep still returns exactly one hit and it is still
`20260826130000_server_stamp_updated_at.sql:68`, prose rather than a
mechanism; all six SQL anchors (`:45`, `:71-73`, `:91`, `:150`, `:178`,
`:188`) and all four workflow anchors (`:33`, `:34`, `:41`, `:65`) were opened
and still land. Both claims are re-anchored to `cfab558`.

**The four places that count §2 were swept and all four agree at six** — this
header's paragraph, the title (which states a subject and no count, and is
therefore the only one that cannot rot this way), §2's own heading *"## 2. Six
entries"*, and §5's preamble's *"SIX at #571"*. **They agree at seven since
#585**, which filed ADR 0071's open-area amendment as its own commit and moved
the three that carry a number with it; this sentence records what the sweep
found at `cfab558` and is left standing rather than restated, because the
anchor is the whole of what makes it readable. **This is the first window in
the series in which an entry was filed *and* the four places did not split**,
and the mechanism is the one §5's preamble names: `9f0096c`/#574 was a commit
whose only job was to file ADR 0074's entry, so it had nothing else to think
about and moved all four together. The observation now has two instances
rather than one, and it is still an observation: the split has never been
tested against an implementing change since the rule was restated, because no
implementing change has filed an entry since #485.

**The previous anchor's findings, kept as a record. The paragraphs below are
that pass's, including its own four-place sweep, which found all four agreeing
at five.**

**Two entries had drifted, and one is the telemetry bullet in §5 for the second
consecutive anchor.** Its `src/main.ts` anchors moved as before -- uniformly two
lines through the import and doc-comment region, and 92 at the consent mount,
which is the file's entire growth in this window -- and they are corrected in
place below, in both directions. **The movement is not the finding.** The
parenthesis reading *"the consent prompt is not mounted either
(`src/main.ts:185-188`, and `:2598` ... both gate on `telemetry.enabled`)"*
named two ranges, and at `82ae630` **neither of them was a gate**. `:185-188`
was doc-comment prose four lines above the `const crashReporter =
telemetry.enabled === false` expression, which was at `:194-197`; and `:2598`
was a doc comment about `AutosaveScheduler` -- unrelated code, seventy-two lines
above the `if (telemetry.enabled && appRoot !== null)` at `:2670`. That second
number is the *mount span's* value from the anchor before last, left behind when
the mount was renumbered and the gate beside it was not. So this citation did
not go stale in this window: it was already naming the wrong code on the tree
that wrote it, which is the class the header calls a claim already false when
the window opened, found now for the third consecutive anchor. Both are
re-derived by symbol here -- `src/main.ts:196-199` and `src/main.ts:2762` -- and
the one anchor in that bullet which has still never moved,
`src/ui/telemetry-consent-prompt.ts:8`, is the argument for citing by symbol
rather than by line, made for the fifth time by the same bullet.

**The second drift is the command union in §5, and it is an ordinary one.** It
counted **thirteen** members and put the `simulationCommandSchema` declaration
at `src/simulation/protocol/commands.ts:493`. #533 added `DismissStaff`, so the
count is **fourteen** and the declaration is at `:542`;
`grep -c "type: z.literal" src/simulation/protocol/commands.ts` returns 14. The
fourteenth landed with its producer in the same change, so `AWAITING_PRODUCER`
in `tests/foundation/unconsumed-command-contract.test.ts` is still empty --
that declaration has moved from `:204` to `:224` and its gate comment from
`:230` to `:250`, both re-derived by opening the file.

**Four intersecting citations survived unchanged.** ADR 0025's withdrawn
`3.9px` is still absent from every ADR, every `.css` file and all of `src/`;
`src/ui/hud/messages.ts` and `src/ui/hud/projection.ts` still say ADR 0017 is
Accepted and still name no currency; and `docs/HUD_PROJECTIONS.md` gap 13 still
opens *"Object placement exists, and `minQuantity` is counted"*. **The entry
that retired its line number in favour of the quotation is the one that needed
no work at this anchor** -- gap 13 has moved to `:879` and nobody had to notice
-- which is recommendation 1 at the foot of §6 paying for the second time.

**The two live `verified at` claims were both re-run rather than carried.**
Neither `supabase/migrations/` nor `.github/workflows/` appears anywhere in this
window's 80 files. The migrations directory still holds twenty-three files; the
retention grep still returns exactly one hit and it is still the comment rather
than a mechanism; and all six SQL anchors (`:45`, `:71-73`, `:91`, `:150`,
`:178`, `:188`) and all four workflow anchors (`:33`, `:34`, `:41`, `:65`) were
opened and still land.

**The four places that count §2 were swept and all four agree at five** -- this
header's paragraph, the title (which states a subject and no count, and is
therefore the only one that cannot rot this way), §2's own heading *"## 2. Five
entries"*, and §5's preamble's *"FIVE at `07add3e`"*. No decision was filed or
accepted in this window, so there was nothing to split them. An agreeing sweep
is a weaker result than a catching one and is recorded because the paragraph
naming the four places asks for it either way.

**The recommendation this series has now made six times running is a scheduled
read rather than a warning band, and it has now failed to be taken six times.**
This window says something the last five could not. The previous pass was
dispatched early and on purpose, with headroom, exactly as the recommendation
asks -- and it still counted on the wrong tree, because **dispatching early does
nothing about what gets re-read.** The delta method covers the citations; the
counts in the header are not citations, nothing in the method reaches them, and
no amount of scheduling would have.

**The previous anchor's account, kept -- v0.0.291.** It read: *"Re-anchored at `main` @
`a54899a` (**v0.0.291**) by the delta method this
header describes, from the v0.0.284 anchor described below. **Seven of the ten
releases the budget allows, counted on the tree this commit is written
against**: `package.json` ships `0.0.291` and the anchor being replaced named
v0.0.284. Three releases of headroom are left as of this commit."* Its window
was 41 files against six merges, its delta intersection was four, and it found
one drifted citation — `projection.ts:408` to `:454`. **That tally stands as
written and its coverage does not**: the same intersection contained
`src/simulation/protocol/types.ts` and this pass found two live anchors into
`transferables.ts` that had been wrong since #507, in a file that intersection
did not reach, plus the two `src/main.ts` anchors #704 had already falsified in
the *previous* window. Three releases of headroom was a fact about its own tree;
the next window spent ten.

**The anchor before that one, kept -- v0.0.284.** It read: *"Re-anchored at `main` @
`58220f7` (**v0.0.284**) by the delta method this
header describes, from the v0.0.276 anchor described below. **Eight of the ten
releases the budget allows** … Two releases of headroom are left as of this
commit -- the **same figure as the previous anchor, from an identically sized
window**."* **It is the first anchor in this series dispatched because of work
that had not landed rather than work that had**, and the account in the header
records what became of that: two of its three named changes merged inside this
window and four merges it could not have named did. Its own tally -- 44 files,
eight merges, a delta intersection of eleven, one drift found in ADR 0056's
entry -- stands as written.

**The anchor before that, kept.** It read: *"Re-anchored at `main` @
`82ae630` (**v0.0.195**) by the delta method this
header describes, from `85c1c29` (v0.0.187). **Dispatched at eight of the ten
releases the budget allows, with four pull requests already green and waiting**
-- merging them would have reached ten and the release after that would have
been eleven, so this pass is the first in the series dispatched *because a queue
was about to spend the budget* rather than on a schedule or at the bound."* Its
window was the largest this file has measured, 70 files and eight merges, its
delta intersection was ten of 41 and it re-read eight entries, and it reported
**one** drifted entry -- the telemetry bullet -- and seven survivors. That
tally stands as it was written: the second drift found here, the command union,
was created by #533 *inside this* window and was not available to it, and the
count error above is in the header rather than in §§3-6 and so is outside what
its intersection could reach.

**The anchor before that, kept -- v0.0.187.** It read: *"Re-anchored at `main` @
`85c1c29` (**v0.0.187**) by the delta method this
header describes, from `4ace2da` (v0.0.177)."* **This is the first re-anchor
dispatched at the bound rather than with headroom**, and the distinction is
the finding rather than the arithmetic: ten of the ten releases the budget
allows, so
`tests/foundation/adr-status-queue-anchor-contract.test.ts` passes at this
tree and the *next* release commit breaks it. The three passes before this
one were each dispatched at seven of ten and each recorded that a scheduled
read, not a warning band, is what the series needs; **that recommendation has
now failed to be taken four times running**, and this window is the evidence
that "dispatch early while green" is not self-sustaining either — two of the
three early dispatches were followed by a window that spent the whole budget.
`85c1c29` is `origin/main`'s tip at the time of writing and is itself the
**v0.0.187 release commit** — named deliberately rather than the merge commit
beneath it, for the reason every previous anchor gives: this release commit is
cut *after* the last merge in the window (#541, `89da98f`), contains every
sentence below, and is the exact tree every citation here was re-derived from.
One commit in the window, `b73ea41` (#521), is the previous anchor's own
re-anchoring pass — it wrote the paragraph this one now supersedes and is not
separately re-read as new drift, because its content *is* the previous
anchor's account, already kept below. **Recorded because a reader will find it
in `git log` and wonder**: that pass declared its anchor `4ace2da`, which is
*earlier* than `b73ea41`, the commit that wrote it. That is this file's
standing convention rather than a defect — the anchor names the tree the
reading was taken against, and the branch merges afterwards — but it means the
window this pass measures, `4ace2da..85c1c29`, contains the previous pass's own
writing commit, exactly as the last three windows did.

**The previous anchor's account, kept.** It read: *"Re-anchored at `main` @
`4ace2da` (**v0.0.177**) by the delta method this
header describes, from `33510df` (v0.0.170). This is the second consecutive
re-anchor dispatched deliberately with the gate green and headroom to
spare — seven of the ten releases the budget allows, the identical margin
the previous anchor was dispatched at — rather than in response to a fail or
right at the bound; the previous anchor's own recommendation was a scheduled
read rather than a warning band, and this pass is that recommendation taken a
third time. `4ace2da` is `origin/main`'s tip at the time of writing and is
itself the **v0.0.177 release commit** — named deliberately rather than the
merge commit beneath it, for the reason every previous anchor gives: this
release commit is cut *after* the last merge in the window (#519, `f43e98b`),
contains every sentence below, and is the exact tree every citation here was
re-derived from. **Two release bumps for one merge, recorded because a reader
will find it in `git log` and wonder**: `v0.0.176` (`6ae2cb6`) and `v0.0.177`
(`4ace2da`) are consecutive commits with no merge between them, both
immediately after #519 on `git log --first-parent`. The version workflow ran
twice for one merge rather than once; this header already treats a release
bump as a commit that "starts no CI run" and is not guaranteed 1:1 with a
merge, so the release count below is read from the tag on the tip rather than
from counting bump commits, and is unaffected either way. One commit in the
window, `d61df4e` (#510), is the previous anchor's own re-anchoring pass — it
wrote the paragraph this one now supersedes and is not separately re-read as
new drift, because its content *is* the previous anchor's account, already
kept below."*

**The anchor before that one, kept.** It read: *"Re-anchored at `main` @
`33510df` (**v0.0.170**) by the delta method this header describes, from
`01974e5` (v0.0.163). This is the first re-anchor dispatched deliberately with
the gate green and headroom to spare — seven of the ten releases the budget
allows — rather than in response to a fail or right at the bound; the
previous anchor's own recommendation was a scheduled read rather than a
warning band, and this pass is that recommendation taken a second time.
`33510df` is `origin/main`'s tip at the time of writing and is itself the
v0.0.170 release commit — named deliberately rather than the merge commit
beneath it, for the reason every previous anchor gives: this release commit
is cut after the last merge in the window (#509, `795ba81`), contains every
sentence below, and is the exact tree every citation here was re-derived
from. One commit in the window, `15a8df6` (#501), is the previous anchor's
own re-anchoring pass — it wrote the paragraph this one now supersedes and is
not separately re-read as new drift, because its content is the previous
anchor's account, already kept below."*

**The anchor before that one, kept.** It read: *"Re-anchored at `main` @
`01974e5` (**v0.0.163**) by the delta method this header describes, from
`07add3e` (v0.0.152). This is the first re-anchor the gate itself refused to
pass: eleven releases since the previous anchor against a budget of ten,
failing `tests/foundation/adr-status-queue-anchor-contract.test.ts` with "11
releases of history that no entry in that file has been read against" — the
exact failure mode the previous three anchors were each dispatched to
pre-empt and the fourth did not arrive in time to. `01974e5` is `origin/main`'s
tip at the time of writing and is itself the v0.0.163 release commit — named
deliberately rather than the merge commit beneath it, for the reason the
previous anchor gives: this release commit is cut after the last merge in the
window (#500, `1f3b227`), contains every sentence below, and is the exact tree
every citation here was re-derived from."*

**The anchor before that one, kept.** It read: *"Re-anchored at `main` @
`07add3e` (**v0.0.152**) by the delta method this header describes, from
`c00b641` (v0.0.143). This is the first re-anchor taken while the gate was
green — 0.0.152 against an anchor at v0.0.143 is nine of the ten releases the
budget allows, so one more release would sit exactly on the bound and two
would break it — and it was dispatched deliberately for that reason rather
than because anything had gone red. The previous pass ended by recording that
what finds the real errors here is not a diff and that nothing schedules the
read; this pass is that recommendation taken once, and it is evidence about it
rather than about the constant. `07add3e` is `origin/main`'s tip at the time
of writing. It is the v0.0.152 release commit, which this header elsewhere
warns against naming — but the warning is about a release commit cut before
the branches it warrants merged, and this one is cut after the last merge in
the window (#486, `3989bb6`), contains every sentence below, and is the exact
tree every citation here was re-derived from. Naming `3989bb6` instead would
have spent a release of budget on arrival for nothing."* **And the recommendation
it was evidence for did not get taken**: nothing scheduled the next read, and
the budget was spent by release bumps rather than by anyone choosing to wait —
v0.0.162 sat exactly at ten of ten, one bump before the fail, and nothing ran
the gate there either, because as this header has recorded twice before every
merge spends a release whether or not anyone reads this file and the release
commit that spends it starts no CI run. So this re-anchor is the failure mode
the previous three anchors were each dispatched to pre-empt, arriving anyway.
The header's own recommendation — a scheduled read, not a warning band,
because a band still ties the read to a counter and the counter was never
what was wrong — is now evidence against "once" being enough: it was tried
once, the very next window crossed the budget regardless, and nothing about
that outcome is a property of the constant.

`git diff --name-only c00b641..07add3e` reports **122 files**; **fourteen
intersect the declared set** — `package.json`, `docs/HUD_PROJECTIONS.md`,
`docs/adr/README.md`, ADRs **0022**, **0029** and **0054**,
`src/persistence/save-schema.ts`,
`src/persistence/session/session-controller.ts`,
`src/rendering/world/environment-art.ts`,
`src/simulation/prisoners/intake-system.ts`,
`src/simulation/prisoners/release.ts`,
`src/simulation/worker/state-machine.ts`,
`tests/foundation/documentation-links-contract.test.ts` and
`tests/integration/object-placement-loop.test.ts` — with **no migration**.
`docs/adr/STATUS-QUEUE.md` itself changed twice in the window and is not in its
own set, which is the fact the sweep above exists to cover. **Nine releases
carrying nine merged pull requests**: #480, #475, #476, #481, #482, #483, #484,
#485 and #486, read off `git log --oneline --first-parent c00b641..07add3e`.

**The brief this pass was given named the `.assetsignore` deployment gate as
part of this window's content, and it is not**: `git log -S'.assetsignore'`
returns exactly one commit, `a532032` (#474), which is in the *previous* window
and which §4 already records. The same cheap check that has corrected the brief
at each of the last two anchors corrected it again. The rest of the brief's list
holds — ADRs 0059 (#485), 0061 (#484), 0062 (#482) and 0063 (#486) all landed
here, as did the source-comment extension to
`tests/foundation/documentation-links-contract.test.ts` (#483), and that last
one **discharges a handover §5 had repeated for eleven releases**.

**The previous anchor's delta note, kept as a record.** It read: *"`git diff
--name-only bb3a01e..c00b641`
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
taken and are **not** in it."* Both of those merged in the window above.

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
checks still do not find the same things.** Ten corrections and one discharge,
split by source:

**From the fourteen-file intersection**, seven, and this is the reverse of the
previous pass: **six of the seven are code anchors, and the counts they carry
all held.** `src/simulation/worker/state-machine.ts` moved five at once —
the `WorkerState` union (`:33-39` → `:34-40`), the four `transition()` sites
(`:664`, `:799`, `:834`, `:1110` → `:671`, `:860`, `:895`, `:1171`) and the two
handshake receivers (`:681`, `:711` → `:697`, `:727`) — while the count stayed
four, the four target states stayed the same, `'ready'` stayed unreachable and
`protocol/handshake` still returns **nine** hits in `src/` split exactly 4/2/3.
`src/simulation/prisoners/intake-system.ts` moved two (`:403`, `:409` →
`:442`, `:448`, #484's contraband-at-intake stage);
`src/simulation/prisoners/release.ts` moved one (`:156` → `:194`);
`src/persistence/save-schema.ts` moved one (`:1164` → `:1182`); and ADR 0022's
*"÷ 12.2 is 23.9"* moved one (`:582` → `:588`, #481). The seventh is not a
number: `docs/adr/README.md` gained four `Proposed` rows, which falsified the
*"thirteen"* figure in §3, in §5's first bullet and in §6's `income.ts` bullet
(**seventeen**, in all three places) and moved §5's *"one of the thirteen has a
§2 row"* to **two of seventeen**.

**From the same intersection, one claim withdrawn and one handover discharged**,
both in §5's `environment-art.ts` bullet and both caused by #483. That bullet
said the documentation-links gate *"rejects a rooted path that is not on disk,
with no allowlist"* and *"reads `docs/`, `README.md` and `.github/` and not
`src/` comments, which is why the comment shipped"*, and it closed *"Whether the
gate should scan `src/` comments is a decision, not an edit."* **The decision was
taken and the edit made**: the gate now runs the rooted-path check over comments
in `src/`, `tests/`, `tooling/`, `scripts/` and `benchmarks/`, it does carry an
allowlist keyed on the path/citer pair, and the dead name in
`src/rendering/world/environment-art.ts:24` is corrected — the comment names
`tests/unit/environment-art.test.ts` and records the old name below it. So the
handover is closed rather than repeated for a twelfth release.

**From the four-place queue sweep**, one, and no diff could have reached it:
§2's heading has said *"Five entries"* since #485 while this header's opening
paragraph and §5's preamble both still said four. **Same drift, same two places,
nine releases after the identical one #467 caused** — which makes the header's
prediction confirmed rather than merely stated.

**From deriving the set against the document**, nothing missing and one addition
required by this pass's own corrections. Both scans were re-run; the results and
the commands are under *"How to extend this anchor cheaply"* below. The
bare-number scan surfaced 0030, 0038, 0039, 0040, 0041, 0055 and 0058, and
**every one of them is a number inside a claim about `docs/adr/README.md`'s
next-free line rather than a citation of an ADR document**, so none is a member;
that file is already in the set. The four ADRs this pass's corrected counts now
name — **0059, 0061, 0062, 0063** — are added below in this commit, which is the
rule the subsection states.

**What the pass is structurally blind to, stated because the arithmetic above
reads like coverage.** The intersection is fourteen files out of 122, and a
delta pass can only find a claim that a file in the set falsified *during* the
window. It cannot see a claim already false when the window opened, and it
cannot see a file contradicting itself — which is the class two of this pass's
findings belong to. It also cannot see anything in §§3-6 that rests on a file
the set does not name, which is why the derivation is run first and not last.

**Every rooted `file:line` in §§3-6 was re-derived mechanically at `07add3e`**
— extract each backticked `path:N` span, resolve it, open the file, print the
line — over **sixty** rooted anchors plus the bare `:N` continuations §6
enumerates. **Nine moved, all nine in files the intersection had already named,
and every count they carry held.** The untouched half was spot-read rather than
rested on and produced nothing this time, which is the first pass at which it
has not.

**The previous anchor's account, kept as a record. The three sub-paragraphs
below are that pass's, verbatim.** It read: *"Six corrections,
split by source:

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
been since before the previous anchor.* Re-counted at `07add3e`:
`git ls-files src/services/telemetry` still returns fifteen.

**And that pass's closing sentence did not survive nine releases**, which is
worth recording where it stands rather than only in §6. It read: *"this is the
first pass at which the counts, not the numbers, were the damage"*. At
`07add3e` the numbers are the damage again — nine of them — and the counts are
the half that held: thirteen commands, eighteen `HudIntent` members, nine
handshake hits split 4/2/3, four `.css` files, 39 object ids in two files, 27
amendment sections across 16 ADRs, twenty-three migrations and fifteen telemetry
modules were all re-derived and none moved. Only the `Proposed` tally did. **So
the two passes are opposite cases and neither is the general rule**, and the
durable statement is the one recommendation 1 already makes: a code anchor is
checked by grep and a prose count is not, so the first is worth carrying and the
second is worth deriving.

The previous pass's paragraph, kept: every other rooted `file:line` in §§3-6 was
re-derived mechanically and
**landed** — including the four `transition()` sites in
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

**Observed at `07add3e`, and it is the one thing this pass can say about #449
that the previous four could not: the gate was green.** It stood at nine of ten
with two releases of headroom, and this re-anchor was dispatched anyway. That
makes this the first data point in the series taken outside the failure mode —
every earlier pass ran because the gate had already blocked every branch in the
repository — and what it measured is that **the read still found ten
corrections, a withdrawn claim and a discharged handover.** Two of the eleven
were unreachable by any diff. So the read was not made cheap by being early;
what being early bought was that nobody else was blocked while it happened.
**That is evidence for the scheduled-read shape of answer and against the
warning-band shape**, because a band still ties the read to the counter and the
counter is not what was wrong — but it is evidence, not a decision, and the
decision is the owner's. **Nothing here changes the unit or the constant.**

**And the unit itself got a second clean measurement.** #449's weakest claim is
*"that 169 commits is the right measure of 'unread history' for this file"*.
Three consecutive windows have now been run by the header's own method:
`54418b6..bb3a01e` was eleven releases, 209 commits, 337 files, twenty-nine in
the set; `bb3a01e..c00b641` was eleven releases, 22 commits, 82 files, eight;
`c00b641..07add3e` is **nine releases, 22 commits, 122 files, fourteen in the
set**. So across three adjacent windows a release bought 19, 2 and 2.4 commits
and 30.6, 7.5 and 13.6 files. **The release count and the quantity a re-read has
to spend are still different quantities**, and the third window says something
the second could not: a window with the *same* commit count as its predecessor
produced **half again as much** to read, because what matters is which files the
commits touched and not how many there were. A budget denominated in releases
cannot see that, and neither can one denominated in commits.

**Observed at the previous anchor and recorded rather than acted on, because the
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

**Both scans were re-run at `07add3e` and, for the first time, neither found a
member the list had never named.** That is a result and is reported as one
rather than skipped. The commands, so a reader can re-run them: §§3-6 are
`sed -n '1198,2842p' docs/adr/STATUS-QUEUE.md` at `07add3e`; the path scan is
every backticked span in that text with a `/` in it, `:N`/`:N-M` stripped, minus
the directory prefixes and the grep tokens (`protocol/handshake`,
`hud/build-queue`, `services/challenges`, `simulation/status-counts`) that carry
a slash without being paths; the number scan is every `\b00\d\d\b` token. The
path scan returned **89** distinct spans and the number scan **46** tokens.

**What the two scans surfaced that is not a member, recorded because the next
reader will re-derive them and wonder.** From the path scan: `dist/.assetsignore`,
which §4 cites twice — it is a **build output**, produced by the client build and
absent from a checkout, so it cannot be a member of a set whose whole use is
`git diff --name-only`; the sentences citing it are about `docs/DEPLOYMENT.md`
and `#474`, both of which are members. And `docs/adr/STATUS-QUEUE.md` itself,
which is deliberately not in its own set and which the four-place sweep covers
instead. From the number scan: **0030, 0038, 0039, 0040, 0041, 0055** and
**0058**, every one of them a number appearing inside a claim about
`docs/adr/README.md`'s **Next free number** line rather than a citation of an
ADR document. `docs/adr/README.md` is already a member, so the claims those
numbers sit in are covered; the ADRs are not cited and are not added. **A scan
that returns a token is not the same as a citation that creates a dependency**,
and saying which is which is the part of this check that is not mechanical.

**And the sentence that classification licenses — *"neither scan returned a
member the list has never named"* — was written at seven consecutive anchors
and was false at the last two of them.** At `eb1f040` the path scan returns
**78** distinct backticked spans ending in a known extension, **62** of them
files on disk, and one of the 62 is
`docs/research/2026-08-29-a-prison-that-cannot-buy-its-first-bed.md`, which §5
has cited since `0637ab1` and which this list had never named until now. The
same span is in the scan's output on the `0637ab1` and `104d078` trees,
re-measured here rather than inferred. The number scan is clean at `eb1f040`
— **65** tokens, **61** naming an ADR that exists, residue 0030, 0055, 0058
and 0072, unchanged. **The check works and the reporting of it did not**,
which is the distinction to carry forward: this subsection's rule asks for the
scan to be *run*, and running it has never been the failing half.

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
  bullet rests on the rule it states). **Added at `eb1f040`, by the derivation
  scan rather than by the commit that created the citation**:
  `docs/research/2026-08-29-a-prison-that-cannot-buy-its-first-bed.md` — §5's
  first bullet cites its §8 for the two §2 entries handed over in it. **The
  citation is two anchors older than this membership.** It entered §§3-6 in the
  `0637ab1` pass's own commit, and that pass, and `104d078` after it, each
  reported that neither derivation scan had returned a member the list had never
  named. The scan returned this one on both trees; what failed was reading its
  output, not running it. Recorded here rather than added quietly, because a
  file joining the set silently is the case this subsection's rule is written
  against and a file joining it *twice unnoticed* is a worse one. **Added at `feb46af`, by the
  commit that creates the citation rather than two anchors after it**:
  `docs/research/2026-08-30-a-wall-that-buys-itself.md` — §5's new ADR 0017
  entry cites its §2b for the two questions #640 left open. That is the order
  this subsection's rule asks for, and it is the exact opposite of the case
  immediately above, which is why the two are written next to each other.
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
  **0051** and **0052**. Added at the previous anchor because the corrected counts
  then named them: **0053**, **0054**, **0056** and **0057**. **Added at this
  anchor, for the same reason and by the same rule**: **0059**, **0061**,
  **0062** and **0063** — §5's first bullet and §6's `income.ts` bullet now
  enumerate seventeen `Proposed` documents and these are the four that joined,
  and 0059 additionally has a §2 row. 0022, 0029 and 0054 changed in this
  window; all three were opened, 0022's *"÷ 12.2 is 23.9"* line moved from
  `:582` to `:588`, and 0029's and 0054's statuses were re-read and are
  unmoved. **Added at this anchor, for the same reason and by the same rule**:
  **0064**, **0065**, **0066** and **0067** — §3's opening, §5's first bullet
  and §6's `income.ts` bullet now enumerate twenty-one `Proposed` documents and
  these are the four that joined; none of the four has a §2 row. 0029 changed
  in this window too — #491 appended a dated amendment measuring two new
  counters ADR 0041 made countable — and its Status line, `:5`, is unmoved:
  still `Accepted, 2026-08-26`. **Added at this anchor, for the same reason and
  by the same rule**: **0068** — §3's opening, §5's first bullet and §6's
  `income.ts` bullet now enumerate twenty-two `Proposed` documents and this is
  the one that joined; it has no §2 row. 0015, 0026 and 0050 changed in this
  window too — #505's entity-retirement work amended ADR 0026 (question 1
  answered), corrected ADR 0015's now-false "ids repeat" claim in place, and
  updated a cross-reference in ADR 0050; all three were opened and re-read. **Added at this anchor, for the same reason and by the same rule**:
  **0069** — §3's opening, §5's first bullet and §6's `income.ts` bullet now
  enumerate **twenty-three** `Proposed` documents and this is the one that
  joined; it has no §2 row either, which is the sixth consecutive time and is
  the finding the sweep above reports. (**That sentence was false when it was
  written, and stayed false for three anchors.** 0069 did join the set and the
  membership rule was applied correctly; what is wrong is the claim about the
  three sections, which all still read *twenty-two* at `85c1c29`, at
  `82ae630`, at `e1813b7` and until this commit. The header's own count moved
  and the three sections' did not, and this maintenance sentence asserted the
  move on their behalf. Corrected in place at this anchor rather than
  overwritten, because a sentence claiming a sweep that did not happen is a
  worse defect than the missed sweep and is the only trace of it.) It is read here only for its `Status`
  line, `Proposed, 2026-08-29. Not self-approved.` **No other member joins at
  this anchor**: both derivation scans were re-run over §§3-6 — every
  backticked path and every bare `00NN` token — and neither returned a member
  the list had never named, which is the third anchor running at which that is
  true and is reported as a result rather than skipped. The path scan returned
  **67** distinct spans and the number scan **55** tokens; those totals are
  **not** comparable with the 89 and 46 the `07add3e` pass recorded, because
  this pass filtered backticked spans to those ending in a known file
  extension rather than stripping directory prefixes by hand, and §§3-6 have
  grown since. What is comparable is the residue, and it is unchanged: the
  path scan's only non-members are `docs/adr/STATUS-QUEUE.md`, deliberately
  outside its own set, and two **grep commands** that carry a slash without
  being paths (`grep -rn "services/telemetry" src/ --include=*.ts` and the
  amendment-heading count over `docs/adr/*.md`); the number scan's only
  non-members are the same seven this subsection already names — **0030,
  0038, 0039, 0040, 0041, 0055** and **0058** — every one still a number
  inside a claim about `docs/adr/README.md`'s **Next free number** line rather
  than a citation of an ADR document. **Added at `cfab558`, for the same
  reason and by the same rule**: **0070**, **0071**, **0073** and **0074** —
  §3's opening, §5's first bullet and §6's `income.ts` bullet now enumerate
  **twenty-seven** `Proposed` documents (this time checked in all three places
  by opening them, which is what the sentence three paragraphs above claimed
  and did not do) and these are the four that joined; 0074 additionally has a
  §2 row, filed by #574 rather than by the commit that wrote the ADR. Each is
  read here only for its `Status` line. **0072 is not a member and is not
  missing**: no such document exists on disk, because the number is held for
  the events-persistence decision. **No other member joins at this anchor**:
  both derivation scans were re-run over §§3-6 — every backticked path and
  every bare `00NN` token — and neither returned a member the list had never
  named, which is the fourth anchor running at which that is true. The path
  scan returned **79** distinct existing spans, of which 18 are bare directory
  prefixes and 61 are files; its only non-member file is
  `docs/adr/STATUS-QUEUE.md`, deliberately outside its own set, and its only
  other residue is the same handful of grep and `git show` commands that carry
  a slash without being paths. The number scan returned **56** tokens, whose
  only non-members are the seven next-free numbers named above. Those totals
  are **not** comparable with the 67 and 55 recorded at `85c1c29` or the 89
  and 46 recorded at `07add3e`, because each pass has filtered the spans
  differently and none of the three states its filter in the sentence that
  gives the number; the residue is what is comparable, and it is unchanged.
  **Added at `53e1405`, for the same reason and by the same rule**: **0075**,
  **0076** and **0077** — §3's opening, §5's first bullet and §6's
  `income.ts` bullet now enumerate **thirty** `Proposed` documents and these
  are the three that joined; none of the three has a §2 row, and the header's
  window note decides each of them separately rather than treating them as one
  case. Each is read here only for its `Status` line, and all three read
  `**Proposed, 2026-08-29. Not self-approved.**` at this anchor — re-read on
  disk rather than taken from the index, because **PR #606 is open to move two
  of them to `Accepted`** and a member read off a branch would be a member read
  off a tree this file is not anchored to. **0072 is still not a member and
  still not missing**, for the fifth anchor running: no such document exists on
  disk, the number being held for the events-persistence decision. **No other
  member joins at this anchor**: both derivation scans were re-run over §§3-6 —
  every backticked path and every bare `00NN` token — and neither returned a
  member the list has never named, which is the fifth anchor running at which
  that is true. The path scan returned **79** distinct existing spans, of which
  18 are bare directory prefixes and 61 are files; its only non-member file is
  `docs/adr/STATUS-QUEUE.md`, deliberately outside its own set. **The number
  scan returned 65 tokens and its residue grew by one**: **0078**, which is the
  index's new **Next free number** and therefore the same class as the seven
  this subsection already names — 0030, 0038, 0039, 0040, 0041, 0055 and 0058
  — a number inside a claim about that line rather than a citation of an ADR
  document. It is written down rather than passed over, because the residue
  being *unchanged* has been this subsection's reported result for four
  anchors and this is the first time it has moved; the rule that classifies it
  is unchanged, and a reader re-deriving the list should expect eight
  next-free tokens now rather than seven. Those totals are **not** comparable
  with the 67/55 at `85c1c29` or the 89/46 at `07add3e`, for the reason every
  reading in this sequence gives: each pass filters the spans differently and
  none states its filter in the sentence that gives the number.

  **Added at `0637ab1`, for the same reason and by the same rule**: **0078**
  (what keeps a prisoner safe) — §3's opening, §5's first bullet and §6's
  `income.ts` bullet now enumerate **twenty-nine** `Proposed` documents and
  this is the one that joined; it has no §2 row. It is read here only for its
  `Status` line, `**Proposed, 2026-08-29. Not self-approved.**` **0075 and
  0076 do not leave the set**, and that is the rule rather than an oversight:
  membership is created by §§3-6 citing a document, and both are now cited
  *more* heavily than before — §2's foot records why their handed-over entries
  were never filed, and §3, §5 and §6 each record their departure from the
  `Proposed` count. A document that stops being `Proposed` stops being counted
  and does not stop being a dependency. **0072 is still not a member and still
  not missing**, for the sixth anchor running. **No other member joins**: both
  derivation scans were re-run over §§3-6 — every backticked path and every
  bare `00NN` token — and neither returned a member the list has never named,
  which is the sixth anchor running at which that is true. The number scan's
  residue is unchanged at the eight next-free tokens the paragraph above
  names: 0030, 0038, 0039, 0040, 0041, 0055, 0058 and 0078 — except that
  **0078 has now left that residue by becoming a real citation**, so a reader
  re-deriving the list should expect seven next-free tokens again rather than
  eight. That is the first time a token has moved *out* of this residue, and
  it moved because the number stopped being a prediction and became a
  document.

  **Added at `898a16a`, for the same reason and by the same rule**: **0079**
  (a sentence long enough to be a history, #659) — §3's opening, §5's first
  bullet and §6's `income.ts` bullet enumerate **thirty** `Proposed`
  documents and this is the one that joined; it has no §2 row. It is read here
  only for its `Status` line, `**Proposed, 2026-08-30. Not self-approved.**`
  **The three sections enumerate thirty because this same commit moved them**,
  and that is stated rather than left ambiguous: they read *twenty-nine*
  before it, the value each was checked at is written into this pass's header,
  and this sentence is the one whose ancestors were false at three consecutive
  anchors for claiming a sweep somebody else was supposed to have done.
  **0079 is also the first member to join this list in the same commit that
  creates the citation making it one, in this sequence's recent history**, and
  it is the opposite of what the previous anchor found: that pass added
  `docs/research/2026-08-29-a-prison-that-cannot-buy-its-first-bed.md` two
  anchors after its citation landed, because two passes read a clean residue
  out of a scan output that contained it. Consequently **the derivation scan
  run over §§3-6 at this anchor does not return 0079** — the citation did not
  exist when the scan ran — and the next pass's scan will. That ordering is
  recorded so the next reader does not take the confirmation for a discovery.
  **0072 is still not a member and still not missing** — no such document
  exists on disk, the number being held for the events-persistence decision;
  the consecutive-anchor figure this clause used to carry is dropped for the
  reason §3's opening now gives. **No other member joins**: both derivation scans were re-run over
  §§3-6 — every backticked path and every bare `00NN` token — and neither
  returned a member the list has never named. The path scan returned **79**
  distinct spans ending in a known extension, **62** of them files on disk,
  **59** of those named members and the other three the documented
  exemptions (`docs/adr/STATUS-QUEUE.md`, outside its own set;
  `src/ui/primitives/icon.ts` and one file under `supabase/migrations/`,
  both reaching the set through a directory glob); its residue is **17**
  `git` and `grep` command lines, every one of which was read rather than
  matched against the previous anchor's list, and they are enumerated in this
  pass's header for that reason. The number scan returned **65** tokens,
  **61** naming an ADR that exists, residue **0030, 0055, 0058** and
  **0072** — unchanged for a third anchor over the anchor tree. **This
  commit's own edits then add two**, and they are written down rather than
  left for the next pass to find: **0079** stops being a residue token by
  becoming a member, and **0080**, the index's new **Next free number**, joins
  the residue in its place — the same movement `53e1405` recorded for 0078.
  The path scan's residue rises from 17 to 19 in the same way, both additions
  being `git` command lines this pass adds to §5.
  **The 78-versus-79 discrepancy the previous two passes could not reconcile
  is settled here and it is a property of the filter, not of the text**: one
  backticked span in §6's `income.ts` bullet crosses a line break, so a span
  pattern that excludes newlines returns 78 spans and a 16-line residue while
  one that tolerates them returns 79 and 17. Measured both ways on both
  trees. The count of *existing* spans, **62**, is identical under either
  filter and across both trees, and `diff` over the two scans' outputs
  between `eb1f040` and `898a16a` is empty in both directions.
  **Added at `0e2eb7fb`, for the same reason and by the same rule**: **0089**
  (how a host refusal names its reason to the player, #791) and **0090**
  (medium as a warning, not a skipped step, #788) — §3's opening, §5's first
  bullet and §6's `income.ts` bullet now enumerate **thirty-six** `Proposed`
  documents and these are the two that joined; neither has a §2 row. Each is
  read here only for its status line, `**Proposed, 2026-09-02. Not
  self-approved.**` **0088 arrived in the same window and is a member for a
  different reason**: §3's held-number sweep has cited it by number since
  `26434e8e`, so it was already inside the set as a *held* number, and what
  changed is that it landed — `**Accepted, 2026-09-02, by the repository
  owner.**` on disk, so it never joins the `Proposed` enumeration and is read
  here only for the status line that keeps it out. **0090 has already replaced
  it in the residue**, as the index's **Next free number** — except that the
  index says **0091**, and the sweep this pass ran over 433 remote heads finds
  0091 taken on `fix/777-780-what-clears-a-refusal` (PR #800, open), so the
  residue token and the held number are the same number for the first time in
  this subsection's history.
  **Added at `9b8c8e85`, for the same reason and by the same rule**: **0091**
  (what clears the refusal band, #777/#780, landed by #800) — §3's opening,
  §5's first bullet and §6's `income.ts` bullet now enumerate
  **thirty-seven** `Proposed` documents and this is the one that joined; it
  has no §2 row. Read here only for its status line,
  `**Proposed, 2026-09-02, for decision 2. Not self-approved.**` — a wording
  no previous member carries, because 0091 is `Proposed` **for one of its two
  decisions** and states that decision 1 needed no ADR and is already
  implemented. It is counted as one `Proposed` document all the same, because
  the method every reading in this sequence has used reads the first non-blank
  line under the document's own status statement and that line opens
  `Proposed`; the partial scope is recorded here rather than allowed to make
  the count a judgement. **0091 also arrives having been a member already**,
  as a *held* number §3's sweep had cited since the previous anchor — the
  second document after 0088 to join the set as a hold and then land, and the
  first whose landing falsified a live sentence in §3 rather than only moving
  a count. **The residue is unchanged at four** — 0030, 0055, 0058 and 0072 —
  and the index's **Next free number** token in it moves 0091 → **0092**, so
  for the first time in this subsection's history the residue token and the
  held number are *not* the same number, which is the reverse of what the
  previous anchor recorded and for the plainest possible reason: nothing is
  held. A sweep of all **444** remote heads finds no four-digit prefix above
  0091 anywhere.

  **AND THIS LIST HAS NOT BEEN EXTENDED IN NINE ANCHORS, which the additions
  above only make visible.** The last entry before this one is `898a16a`'s
  0079. Since then **0081, 0083, 0085, 0086** and **0087** all joined the
  `Proposed` enumeration §3's opening, §5's first bullet and §6's
  `income.ts` bullet keep — every one of them a citation this list is
  supposed to record in the commit that creates it — and not one was added
  here, across the nine anchors `feb46af`, `004f799`, `58220f7`, `a54899a`,
  `0352116`, `b04e45f`, `5144eb9e`, `26434e8e` and `33a4a22e`, nor in the
  `df46980` correction commit that is deliberately not one. **They
  are named rather than back-filled**, for the reason this subsection gives
  about a file joining the set silently: a quiet addition would destroy the
  only evidence of how long the list was behind, and the five names are the
  evidence. The membership rule was not broken by any one commit; it was
  broken by the same mechanism this file records everywhere else — a
  maintenance list that only its own author reads. **What makes it worse than
  an ordinary lag, and what makes it cheap to fix, are the same fact**: the
  derivation scan this subsection prescribes would have returned all five on
  any of those ten trees, and each of those passes reported the scan clean or
  did not report it at all. **This pass did not verify what each of those nine
  passes reported about its own scan**, so the sentence above says what is on
  the trees and not what anybody claimed; the two are different findings and
  only the first was measured here.
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
  claim about. **Missing until this anchor, found by this pass's derivation
  rather than added when the citing sentence landed**: `entity/entity-store.ts`
  — #505 added the sentence citing it (`src/simulation/entity/entity-store.ts`
  retiring a slot at generation 4,095) to §5's ADR 0026 entry in the same
  commit that answered question 1, and did not add the file here, which is
  exactly the omission this subsection's own rule exists to prevent. No `:N` is
  cited, so no line-drift risk was hidden by the gap, but the rule is about the
  citation existing, not about what it risks.
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

**The delta note for `0637ab1`, stated so a reader can re-run it.** The diff is
`git diff --name-only 53e1405..0637ab1`, **89 files**, of which **19 are
members**: `docs/DEPLOYMENT.md`, `docs/HUD_PROJECTIONS.md`,
`docs/adr/README.md`, `docs/research/README.md`, `package.json`,
`src/content/room-catalog.ts`, `src/simulation/economy/income.ts`,
`src/simulation/protocol/types.ts`, `src/simulation/rooms/zoning.ts`,
`src/simulation/worker/state-machine.ts`, `src/ui/hud/messages.ts`,
`src/ui/hud/projection.ts`, `tests/unit/ui-hud-messages.test.ts`, and ADRs
**0003, 0025, 0042, 0071, 0075** and **0076**. Nothing under
`supabase/migrations/`, `src/services/telemetry/**` or `src/ui/primitives/**`
changed, so those three glob members contributed none.

**The one measured claim in §§3-6 that both its files moved under, re-run
rather than assumed.** §5's handshake entry rests on `grep -rn
"protocol/handshake" src/ --include=*.ts`, and both `types.ts` and
`state-machine.ts` are in this delta. **The substance holds exactly: still
nine hits, still split 4 / 2 / 3**, and all nine are still a `case` label, a
handler signature or a reply kind — receiver, union or schema, never a sender.
**Six of the nine line numbers moved**, and two of them are worth naming
because the previous two anchors recorded them as *unmoved*:
`transferables.ts` read `:41` and `:50` and now reads **`:39` and `:55`** —
the pair moved in **opposite directions**, which no uniform-offset assumption
would have caught. `state-machine.ts` read `:698`, `:728`, `:737` and now
reads **`:794`, `:824`, `:833`**, a uniform +96. `types.ts` alone is unmoved
at `:12`, `:23`, `:223`, `:442`.

**ADR 0003's independent copy of the same measurement is now stale in its
anchors and is left alone**, deliberately. `docs/adr/0003-simulation-worker-protocol.md:533`
names `types.ts:7`, `:18`, `:206`, `:425`; `transferables.ts:41`, `:50`;
`state-machine.ts:607`, `:637`, `:646` — every one of the nine has moved. Its
substance holds for the same reason this file's does, and it says so in its
own §535. It is a member of the dependency set, but §§3-6 make no claim about
those particular line numbers, so correcting them is ADR 0003's own job and is
handed over rather than done here.

**The delta note for the `07add3e` anchor, kept below.** The diff
is `git diff --name-only c00b641..07add3e`, **122 files**. Intersected with the
set as it stood *before* this commit extended it, it is **fourteen**:
`package.json`, `docs/HUD_PROJECTIONS.md`, `docs/adr/README.md`, ADRs **0022**,
**0029** and **0054**, `src/persistence/save-schema.ts`,
`src/persistence/session/session-controller.ts`,
`src/rendering/world/environment-art.ts`,
`src/simulation/prisoners/intake-system.ts`,
`src/simulation/prisoners/release.ts`,
`src/simulation/worker/state-machine.ts`,
`tests/foundation/documentation-links-contract.test.ts` and
`tests/integration/object-placement-loop.test.ts`. **No file under
`supabase/migrations/` changed** — the directory still holds twenty-three, so
§3's table needed no re-derivation and its two absences hold. **Intersected with
the four members this commit adds — ADRs 0059, 0061, 0062 and 0063 — it is four
more**, and all four are documents this pass reads only for their `Status`
line. Eighteen files read.

**What the fourteen cost, because a small intersection is not a small
consequence and this file has now said so three times.** Nine `file:line`
citations moved and they are concentrated in one file:
`src/simulation/worker/state-machine.ts` alone moved five (the `WorkerState`
union and the four `transition()` sites, plus the two handshake receivers, of
which the union and the four transitions are the five distinct spans §5 cites),
`src/simulation/prisoners/intake-system.ts` two,
`src/simulation/prisoners/release.ts` one, `src/persistence/save-schema.ts` one
and ADR 0022 one. `docs/adr/README.md` gained four `Proposed` rows and moved its
**Next free number** line from 0058 to **0064**. **Four declared members changed
without moving a single citation**, which is worth naming because two of them
have now done it twice running:
`src/persistence/session/session-controller.ts` still declares
`DEFAULT_AUTOSAVE_INTERVAL_MS = 30_000` at `:9` after a **third** consecutive
window of edits to that file; `docs/HUD_PROJECTIONS.md` moved gap 13 from
`:754` to `:766` and cost nothing, because that citation was retired in favour
of its quoted sentence one anchor ago; `tests/integration/object-placement-loop.test.ts`
still carries the title §5 quotes and still calls `wallRoomPerimeter` three
times; and `tests/foundation/documentation-links-contract.test.ts` changed in a
way that **discharges** a §5 handover rather than breaking a citation.

**The delta note for this anchor, `07add3e..01974e5`, stated so a reader can
re-run it.** The diff is `git diff --name-only 07add3e..01974e5`, **85 files**
— the smallest window measured so far, across eleven releases carrying **ten**
merged pull requests: #488, #489, #490, #491, #494, #495, #496, #497, #499 and
#500, read off `git log --oneline --first-parent 07add3e..01974e5`. **Today
alone — 2026-08-28 — landed 0066 and 0067**, and the brief this pass was
handed said a third, 0068, landed too; it did not. `docs/adr/README.md`'s own
**Next free number** paragraph is explicit: 0068 is *reserved* for issue
#493's still-unmerged branch and is "not this ADR's to take, or anyone else's
until that branch's draft returns and is numbered in this file." Corrected
here because the brief said it and the index says otherwise — the same class
of correction this section has made twice before about a brief's contents.

Intersected with the set as it stood *before* this commit extended it, it is
**ten**: `package.json` is not among them — it changed every release, as it
always does, and is read for its version rather than diffed — but
`docs/HUD_PROJECTIONS.md`, `docs/adr/README.md`, `docs/adr/0029-concurrent-room-use-claims.md`,
`docs/research/README.md`, `src/main.ts`, `src/persistence/save-schema.ts`,
`src/persistence/session/session-controller.ts`,
`src/simulation/economy/income.ts`,
`src/simulation/prisoners/intake-system.ts` and
`src/simulation/rooms/zoning.ts` are. **No file under `supabase/migrations/`
changed** — the directory still holds twenty-three, so §3's table needed no
re-derivation and its two absences hold. **Intersected with the four members
this commit adds — ADRs 0064, 0065, 0066 and 0067 — it is four more**, and all
four are documents this pass reads only for their `Status` line. Fourteen
files read.

**What the ten cost.** Two `file:line` citations moved:
`src/simulation/prisoners/intake-system.ts`'s `findBestAvailable`/`#79` pair,
`:448`/`:442` → `:474`/`:468` (#497's assault-sanction work is the only commit
touching that file in this window); and `src/persistence/save-schema.ts`'s
`masterSeedSchema` comment, `:1182` → `:1198` (the same commit). Two more moved
inside `src/main.ts` and were retired to a range rather than a bare number
already, so the correction is recorded above rather than repeated here:
`:2506-2511` → `:2545-2550` and `:2506` → `:2545`, both from #500's
`generateMasterSeed` function landing 39 lines above them. `docs/HUD_PROJECTIONS.md`
moved gap 13 again, `:766` → `:793`, and cost nothing — retired to its quoted
sentence two anchors ago. `docs/adr/README.md` gained four `Proposed` rows and
moved its **Next free number** line four times in sequence, 0064 → 0065 →
0066 → 0067 → 0068 (recorded above). **Five declared members changed without
moving a single citation, and this is the most of any window so far:**
`src/persistence/session/session-controller.ts` still declares
`DEFAULT_AUTOSAVE_INTERVAL_MS = 30_000` at the same lines after a **fourth**
consecutive window of edits to that file (recorded above); `src/simulation/economy/income.ts`
gained 240 lines and still restates no `Proposed` count (recorded above, and
the strongest instance of that finding yet, because this is the first time
the file itself changed while being re-read); `src/simulation/rooms/zoning.ts`
gained 141 lines and its two live citations, `:116-117` and `:125`, are
untouched; `docs/adr/0029-concurrent-room-use-claims.md` gained a dated
amendment (#491) below every line this file cites, so its Status-line citation
at `:5` is untouched; and `docs/research/README.md` gained one table row,
which the *"deliberately left"* bullet's citation does not depend on the
contents of.

**The four-place queue sweep for this anchor, run again and finding nothing to
find** — the first window in the series with nothing filed at all, not merely
nothing filed with a row. §2 gained **zero** entries in the seven releases to
`4ace2da`, and for the first time that is not because a `Proposed` ADR arrived
without one: **no commit in the window adds a `Proposed` ADR**, so the rule
this section states — "any commit that adds an outstanding ADR adds an entry
here" — had nothing to be obeyed or abandoned against. The heading, the title,
the header paragraph and §5's preamble all still read "five" / name the same
five entries, in agreement, for the **fifth** consecutive anchor now — three
of those five anchors (`07add3e`, `01974e5`, this one) have found the four
places already agreeing, which is the longest run of agreement this file has
recorded. **Both halves of the question this task was asked to check, stated
separately because a quiet mechanism is not the same finding as a quiet
window:** the four-place split itself has not recurred in three anchors
running, and the abandonment rate is unmeasurable this window rather than
holding or improving, because there was no arrival to abandon a row for. The
streak resumes the moment the next `Proposed` ADR lands with no row, and
nothing here predicts which way that goes.

**The four-place queue sweep for this anchor, and the two halves come apart
for the first time.** The four places agree: the title states a subject and no
count, the header paragraph reads *"§2 holds **five entries**"*, §2's own
heading reads *"## 2. Five entries: …"*, and §5's preamble reads *"**FIVE at
`07add3e`**"* — the **sixth** consecutive anchor at which they agree, and the
longest run of agreement this file has recorded. **That is the weaker half of
the result, and it is weaker than the run length makes it look.** Three of
those six anchors, including the immediately previous one, were windows in
which §2 gained no entry, so the mechanism that splits the four places — an
entry filed into §2 and its heading, with the two prose counts left behind —
was never exercised. A count that cannot drift because nothing writes to it is
not evidence that the sweep is working.

**This window did exercise it, and the answer is the other half: no entry was
filed at all.** ADR 0069 landed in this window (#541), `Proposed, 2026-08-29.
Not self-approved.`, with its code merged and live — precisely the shape §2's
own rule names, *"any commit that adds an outstanding ADR adds an entry
here"*. No §2 entry was added for it. `grep -n '0069' docs/adr/STATUS-QUEUE.md`
before this commit returned three hits, every one of them a claim about
`docs/adr/README.md`'s **Next free number** line and not one of them a citation
of the document — the same distinction the derivation subsection below draws
between a scan token and a citation. So the two questions this sweep asks have
**different answers for the first time**: the four places did not split, *and*
the rule they exist to protect was abandoned again. Reporting them as one
result would have read as "the sweep found nothing", which is false in the
half that matters. The four places agreeing is a fact about five entries that
nobody touched; the rule being obeyed is a fact about the sixth that nobody
wrote.

**The delta note for this anchor, `4ace2da..85c1c29`, stated so a reader can
re-run it.** The diff is `git diff --name-only 4ace2da..85c1c29`, **65 files**,
across ten releases (`v0.0.177` at the base is excluded, as every anchor's
convention states) carrying **ten** merged pull requests: #520, #521, #522,
#526, #527, #530, #534, #536, #539 and #541, read off `git log --oneline
--first-parent 4ace2da..85c1c29` (excluding the ten release-bump commits).
`b73ea41`/#521 is the previous anchor's own writing commit and is accounted for
above rather than re-read as new drift. **Ten of ten releases: this window
spent the entire budget**, and the gate passes at this tree only because
`toBeLessThanOrEqual(10)` is inclusive — the next release commit, which
`.github/workflows/version.yml` produces after every merge and which starts no
CI run, takes it to eleven and turns `main` red. That is the third time this
series has arrived at the bound and the first time it has been re-anchored
*on* it rather than past it.

Intersected with the set as it stood *before* this commit extended it, it is
**seventeen** — `package.json` is not among them, by the same convention as
every anchor before this one, and `docs/adr/STATUS-QUEUE.md` is not a member of
its own set, also by convention. They are `AGENTS.md`,
`docs/AGENT_WORKFLOW.md`, `docs/HUD_PROJECTIONS.md`, `docs/adr/README.md`,
`docs/research/README.md`, `src/main.ts`,
`src/simulation/construction/definition.ts`,
`src/simulation/presentation/room-projection.ts`,
`src/simulation/prisoners/intake-system.ts`,
`src/simulation/protocol/commands.ts`, `src/ui/hud/build-panel.ts`,
`src/ui/hud/hud.ts`, `src/ui/primitives/async-action.ts`,
`src/ui/primitives/dom.ts`, `src/ui/primitives/focus-handoff.ts`,
`tests/integration/object-placement-loop.test.ts` and
`tests/unit/ui-hud-build-panel.test.ts` — the last three under `src/ui/`
by way of the `ui/primitives/**` member the list carries rather than by name.
**No file under `supabase/migrations/` changed** — the directory still holds
twenty-three, so §3's table needed no re-derivation. **One new ADR joins the
set**: **0069**, by the same rule as 0068, 0064-0067 and 0059-0063 before it —
§3's opening, §5's first bullet and §6's `income.ts` bullet now enumerate
twenty-three `Proposed` documents and this is the one that joined. Eighteen
files read. **Seventeen is more than three times the previous window's five**,
on a window only three releases longer, which is the same non-proportionality
between window length and intersection size this file has now recorded twice.

**What the seventeen cost: fourteen `file:line` citations across four files,
and one quoted sentence — the first quotation this file has lost.** Set out
below by file, because the concentration is the finding.

**`src/main.ts` moved eight cited spans, the most any single file has moved in
this series.** #541's sentence-drawing work and #534's door-edge work together
added five lines high in the import block and 53 more before the consent
mount: the three telemetry imports `:82-84` → **`:87-89`**; the pipeline-and-
listeners block `:154-195` → **`:159-200`**; the `crashReporter` gate
`:180-183` → **`:185-188`** (**this entry said "unmoved" and it is now moved**;
the word is corrected rather than the sentence deleted); the consent mount
`:2545-2550` → **`:2598-2603`** and its gate `:2545` → **`:2598`**; the
challenges comment `:102` → **`:107`**; and `import type { CancelScheduledPump }`
`:84` → **`:89`**. **One of the eight is a claim rather than an anchor and is
corrected as one**: §5's ADR 0009 entry says *"`src/main.ts:86` is now `import
'./styles.css';`"*, and at this anchor `:86` is `import { createTelemetryConsentPrompt }
from './ui/telemetry-consent-prompt';` — `import './styles.css';` is at **`:91`**.
That sentence was itself written as a correction of an earlier wrong anchor,
which makes it the fourth consecutive pass at which a correction has rotted no
slower than the claim it corrected, exactly as §4 of `docs/AGENT_WORKFLOW.md`
says.

**`src/ui/hud/hud.ts` moved four, and none of them moved in this window.**
`export type HudIntent =` `:271` → **`:296`**, the union's close `:541` →
**`:566`**, `HudUnavailableNotice` `:555` → **`:580`**, `arm-build-tool`
`:404-409` → **`:429-434`**, `arm-room-tool` `:537-542` → **`:561-566`** and
`cancel-build-order` `:446` → **`:471`**. `git show <sha>:src/ui/hud/hud.ts`
across the anchor chain puts every one of them at the old value through
`01974e5` and at the new value from `33510df` onward, so **`8dc2540` (#498)
moved them, two anchors ago** — inside the `01974e5..33510df` window, where
`src/ui/hud/hud.ts` was a declared member that the diff reported as changed.
**Two consecutive anchor passes therefore had this file in their intersection
and did not re-derive these six anchors.** This is the class the header calls a
claim already false when the window opened, found for the third consecutive
anchor, and it is the sharpest instance yet because the file was *not*
untouched — it was in the intersection both times and was read for something
else. The count itself holds: `HudIntent` still declares **eighteen** members,
re-counted as `grep -c "readonly kind: '"` between `export type HudIntent =`
and `HudUnavailableNotice`, unchanged at `4ace2da` and here.

**`src/simulation/prisoners/intake-system.ts` moved two, and this is the fifth
anchor to move the same pair.** `findBestAvailable` `:474` → **`:530`** and its
`#79` comment `:468` → **`:524`**, from #541 inserting the sentence draw above
them at the `classification` stage. **Fifth anchor, fifth pair of numbers, and
the expression has still not changed**: `findBestAvailable` is still handed a
`rateCellSharing` closure and is still the only allocator. A citation that has
been re-pointed at five consecutive anchors without the sentence it supports
changing a word is the argument for the symbol-over-line rule this file keeps
making and keeps not applying here.

**`src/simulation/protocol/commands.ts` moved one.** `simulationCommandSchema`
`:467` → **`:493`**, from #536's and #541's insertions above it. The count is
unmoved: it still discriminates **thirteen**, re-counted rather than trusted —
`grep -c "type: z.literal"` returns 13 at `4ace2da` and 13 here — and the
thirteen are the same thirteen the entry enumerates.

**And the one that is not a line number, which is the result worth having.**
§5's *"Two Accepted ADRs still say object placement does not exist"* entry
retired its `docs/HUD_PROJECTIONS.md` gap-13 citation from a line number to a
quotation three anchors ago, on the stated ground that *"a quoted sentence is
the most"* durable citation and the number had moved three times without the
sentence changing a word. **The sentence has now changed.** That entry quotes
gap 13 as opening *"Object placement exists, and `minQuantity` is still
unchecked"*; at this anchor it opens **"Object placement exists, and
`minQuantity` is counted"**, changed by #530 (issue #528), which closed the
second half of the gap. The quotation is corrected in place with the old
wording kept beside it. **This is the first time a quoted-sentence citation in
this file has gone false**, and it is recorded as a limit on the rule rather
than as an argument against it: the rule is that a quotation rots *slower*, not
that it cannot rot, and the thing that falsifies one is a real change to the
subject rather than an edit anywhere above it. Both halves of gap 13 are now
closed, so the two ADRs that cite it — 0023 and 0027 — are further from the
world than they were, not closer, and the handover to amend them stands.

**Ten declared members changed and cost nothing, and two of them are the rule
working rather than luck.** `AGENTS.md` gained #539's *"Nothing may exist only
in the container"* rule, inserted into *"The parts of it that are rules rather
than advice"* and therefore **below** the numbered *"Architectural
boundaries"* list that §5's `environment-art.ts` entry rests on: boundary 6 is
unmoved. `docs/AGENT_WORKFLOW.md` gained 48 lines in one hunk at its §2, which
pushed §4 down bodily — and **all four of the §§3, 5 and 6 quotations of that
§4 were re-read and are still verbatim**, because they are quotations and not
line numbers. That is the same rule that failed for gap 13 above, working here
for the reason it usually does, and the two cases belong together.
`docs/research/README.md` gained one table row and corrected another; §6's
*"deliberately left"* bullet rests on the rule the file states and not on the
table, and the rule is untouched. `docs/adr/README.md` gained 0069's row and
moved **Next free number** 0069 → 0070 (recorded above); every citation this
file makes into it by number sits in a preserved record of a superseded claim
rather than in a live one, and those are left as they stand.
`src/simulation/construction/definition.ts` still returns **33** for
`grep -c placesObjectId`, unchanged at `4ace2da` and here.
`src/simulation/presentation/room-projection.ts` still reads an over-capacity
room as full — *"over-capacity room therefore reads as full at 100 %"* — at
`:190`. `src/ui/hud/build-panel.ts` still says *"7.8px is the entire budget"*.
`tests/integration/object-placement-loop.test.ts` still carries the title §5
quotes, *"a player buys a plank, places a bed in a cell they zoned, and a
prisoner lives in it"*, and still calls `wallRoomPerimeter` three times. The
three `src/ui/primitives/` files changed under #522's and #527's focus and
description work, and the claim that rests on them — that
`tests/unit/ui-hud-messages.test.ts`'s *"imports nothing from the simulation"*
covers every file under `src/ui/hud/**` and `src/ui/primitives/**` — was
re-read at the assertion and still holds over `[...hudFiles, ...primitiveFiles]`.
`tests/unit/ui-hud-build-panel.test.ts` changed and still defers to that test
by name.

**Forty-eight of the sixty-five changed files are outside the set and outside
it correctly** — checked by reading the ten PRs' subjects and touched files
against the citations in §§3-6 rather than assumed. The determinism suites,
`src/simulation/prisoners/sentence.ts` and `classification.ts`, the browser
specs, `scripts/wip-sweep.sh`, `docs/INPUT.md`, `docs/NAVIGATION.md` and
`docs/TESTING.md` are the bulk of them, and §§3-6 make no claim about any.

**Also re-derived at this anchor, and reported as a result rather than
skipped**: every rooted `path:N` span in §§3-6 was extracted mechanically,
opened and printed, as the last three passes each did. Beyond the fourteen
corrected above, the scan surfaced one span whose value is right and whose
framing is worth a reader's caution — `tests/unit/ui-hud-messages.test.ts:218-224`
is stated *"at `bb3a01e`"* and is still exactly true of `bb3a01e`; that
assertion is at `:223` here, and the file is in neither this window's diff nor
the last two, so the difference is dated rather than false. It is left as
written because a dated claim about a named tree is a record, not a live
citation — the distinction this file's own single-anchor gate turns on.

**The previous anchor's delta note, kept as a record.** It read: *"**The delta
note for that anchor, `33510df..4ace2da`, stated so a reader can
re-run it.** The diff is `git diff --name-only v0.0.170..origin/main`,
**28 files**, across seven releases (`v0.0.170` at the base is excluded, as
every anchor's convention states) carrying **six** merged pull requests: #511,
#512, #513, #515, #518 and #519, read off
`git log --oneline --first-parent v0.0.170..origin/main` (excluding the seven
release-bump commits and `d61df4e`/#510, the previous anchor's own writing
commit, already accounted for above — that commit touches
`docs/adr/STATUS-QUEUE.md` alone, confirmed by `git show --stat`, so it is
correctly the only file in the raw diff this note does not treat as this
window's content). Intersected with the set as it stood *before* this commit
extended it — and nothing needs to extend it, see below — it is **five**:
`package.json` is not among them, by the same convention as every anchor
before this one, and `docs/adr/STATUS-QUEUE.md` is not a member of its own
set, also by convention — but `docs/CLOUD_SAVE.md`,
`docs/adr/0022-room-zoning-surface.md`,
`docs/adr/0044-what-happens-to-a-service-tier-nothing-calls.md`,
`docs/adr/README.md` and `src/simulation/protocol/types.ts` are. **No file
under `supabase/migrations/` changed** — the directory still holds
twenty-three, so §3's table needed no re-derivation. **No new ADR joins the
set**, because none was added — the first window since this convention began
at which that sentence is simply true rather than "zero this time, still
watching." Five files read.

**Twenty-three of the twenty-eight changed files are outside the set and
outside it correctly** — checked by reading every one of the six PRs' subjects
and touched files against every citation in §§3-6 rather than assumed, and
nothing found: the pointer-gesture recovery (#519) and the run-length-codec
fold (#518, which also corrected `docs/PERSISTENCE.md` and two line citations
inside ADR 0022 and ADR 0040's own bodies — neither line is one this file
cites) touch rendering, presentation and persistence-doc surfaces §§3-6 make
no claim about; the tick-cost re-measurement (#513, which left
`scripts/report-tick-system-cost.mjs` behind) and the duplicate-build-order
refusal (#515, which also found `ObjectPlacementService.remove` never
cancelling its finished construction order) touch construction and economy
surfaces this file is likewise silent on.

**What the five cost: nothing, and every one of the five was opened rather
than assumed.** `src/simulation/protocol/types.ts` gained 28 lines from #515's
new `build.duplicate-order` reason, all of it inside and below the
`REFUSAL_REASONS` doc comment starting at line 803 — below every anchor this
file cites (`:12`, `:23`, `:173`, `:223`, `:442`), and `grep -c
"protocol/handshake"` still returns **nine**, still split 4/2/3, confirmed by
re-running it rather than trusting the arithmetic. `docs/adr/README.md`'s own
edit (#511) corrected its "every ADR is Accepted" prose but touched no line
this file cites by number — all of this file's own citations into it are
either historical (already retired to quotation) or the Proposed-count/Next-
free-number reading already re-derived above, which is unchanged at
twenty-two rows and `0069`. `docs/adr/0022-room-zoning-surface.md` and
`docs/adr/0044-what-happens-to-a-service-tier-nothing-calls.md` were each
corrected by #518 and #512 respectively, in their own bodies, at lines
neither of this file's own citations names (this file cites ADR 0022's
*"÷ 12.2 is 23.9"* line, re-verified still at `:588`, and ADR 0044's title
only, by name). `docs/CLOUD_SAVE.md` gained nine lines from #512's account-
reducer correction, at `:201-218`, above the capacity table this file quotes
rather than lines (`:1659-1661`, moved by the insertion and re-verified,
quoted here rather than numbered for exactly the reason §6's recommendation 1
gives).

**What no diff could have found, and this pass's one real correction.** §6's
`income.ts` bullet had been contradicting itself for at least two anchors: the
paragraph correctly stating "nine readings… across seven anchors… twenty-two"
was immediately followed, unheaded, by the leftover tail of an already-
superseded **six-reading, "it is thirteen"** paragraph — a duplicate of the
same title/§2 defect this file's own header records finding twice before, in
the one bullet a delta pass is least likely to open because none of its five
changed files touches it. Found and corrected in place below, in §6, by the
check the header prescribes for exactly this class: reading the file's own
paragraphs against each other. Recorded here because the sweep that found it
is not the four-place sweep above it, and conflating the two would understate
how many independent checks this anchor actually ran.

**The four-place queue sweep for the `01974e5` anchor, kept as a record.** It
found nothing that window — not because the mechanism improved, but because
nothing was filed to drift. §2 gained **zero** entries in that window: all four
Proposed ADRs that landed then (0064, 0065, 0066, 0067) were, like fifteen
before them, decisions with no queue row. So the heading, the title, that
paragraph and §5's preamble all still read "five" / name the same five
entries, in agreement, for the third consecutive anchor at that time — but
unlike the two anchors before it (#467's fourth entry and #485's fifth, each
of which moved §2's heading and the header paragraph while leaving §5's
preamble behind for nine releases), the split this file had found twice did not
recur, because there was no third filing for it to lag behind. The abandonment
continued at a higher rate than ever — four more in that window, none obeying
the rule — while the drift this file specifically watches for stayed dormant."*

**The anchor before that one's delta note, kept as a record.** The diff was
`git diff --name-only 01974e5..origin/main` (`origin/main` there meaning
`33510df`, the previous anchor's own tip),
**61 files**, across seven releases carrying **six** merged pull requests:
#498, #502, #504, #505, #508 and #509, read off
`git log --oneline --first-parent 01974e5..origin/main` (excluding the release
commits and `15a8df6`/#501, the previous anchor's own writing commit, already
accounted for above). Intersected with the set as it stood *before* this
commit extended it, it is **fourteen**: `package.json` is not among them, by
the same convention as every anchor before this one — but
`docs/HUD_PROJECTIONS.md`, `docs/adr/0015-actor-identity-allocation.md`,
`docs/adr/0026-entity-id-lifetime.md`, `docs/adr/0050-when-a-sentence-ends.md`,
`docs/adr/README.md`, `docs/research/README.md`,
`src/simulation/protocol/types.ts`, `src/simulation/worker/state-machine.ts`,
`src/ui/hud/hud.ts`, `src/ui/hud/messages.ts`, `src/ui/hud/projection.ts`,
`tests/unit/actor-identity.test.ts`, `tests/unit/entity-generation-wrap.test.ts`
and `tests/unit/ui-hud-messages.test.ts` are. **No file under
`supabase/migrations/` changed** — the directory still holds twenty-three, so
§3's table needed no re-derivation. **Intersected with the one member this
commit adds — ADR 0068 — it is one more**, read for its `Status` line and,
because it is new rather than merely re-read, for its full text. Fifteen
files read. **Forty-seven of the sixty-one changed files are outside the set
and outside it correctly** — guard rendering (#502, ADR 0040 slice 2), the
client-side room-enclosure classifier (#498, ADR 0068's own implementation),
the Regime roster's discharge wording (#508), the status strip's incident-kind
badge (#509) and the rejected canteen-walk hypothesis (#504, a new
`docs/research/` entry with no ADR and no code change to any file §§3-6 cite)
all touch rendering, presentation and roster surfaces §§3-6 make no claim
about; checked by grepping each PR's subject and touched files against every
citation in §§3-6 rather than assumed, and nothing found.

**What the fourteen cost.** Three ADRs were corrected in place rather than
moved by a diff: #505 answered ADR 0026 question 1 (entity-generation-wrap.test.ts
and prisoners-intake-system.test.ts's `DEFECT`-pinning became fixed-behaviour
pinning, RED/GREEN by hand, recorded in the same commit) and, in the same
commit, corrected ADR 0015's now-false "ids repeat" claim and cross-referenced
it from ADR 0050 — all read and confirmed still true on disk, and one §6
bullet describing the old `entity-generation-wrap.test.ts` comment was stale
and is corrected above. Nine `file:line` citations moved, all in one cluster:
`src/simulation/worker/state-machine.ts`'s four `transition()` sites (a uniform
+1, from #505's one-line insertion above `EntityStore.destroy`'s call site)
and its three handshake-receiver anchors (the same +1); `src/simulation/protocol/types.ts`'s
four handshake-schema anchors and its `protocolVersion` literal (a uniform +5,
from #498's and #502's insertions ahead of the schema). `src/ui/hud/hud.ts`
moved four anchors by a uniform +25 (`HudIntent`'s open, close,
`HudUnavailableNotice` and the `arm-build-tool`/`arm-room-tool`/`cancel-build-order`
member positions) while its **eighteen**-member count, three-room-member count
and `HudRoomGesture`'s `:154` all held; `tests/unit/ui-hud-messages.test.ts`
moved one anchor by +5 (new test above it). **Four declared members changed
without moving a single citation this pass depends on**:
`docs/HUD_PROJECTIONS.md` (gap 13's wording, quoted rather than lined, still
verbatim), `docs/adr/README.md` (gained a `0068` row and moved **Next free
number** from 0068 to 0069 — recorded above), `docs/research/README.md` (gained one
table row, the guards research entry, which the *"deliberately left"* bullet's
citation does not depend on the contents of), and
`src/simulation/worker/state-machine.ts`'s `WorkerState` union specifically,
one of five anchors into that same file — it stayed at `:34-40` despite the
file changing around it and despite its other four anchors (the
`transition()` sites and the handshake receivers) all moving. `package.json`
changed too, as it does every release, and is read for its version rather
than diffed, per this note's own opening convention. **One correction this
pass made was to itself**: an
intermediate draft of the Proposed-ADR retally wrongly counted ADR 0022 as a
twenty-third `Proposed` document by trusting a bare `grep -l '^\*\*Proposed'`
hit, which was actually its nested amendment's `### Status of this amendment`
marker and not the ADR's own `## Status` line (`Accepted, 2026-08-25 — as
amended`, matching the index); caught before landing rather than after, by
reading the heading above the hit — the exact discipline this task's own
brief named as the trap and the reason to name it here rather than silently
fix it.

**The four-place queue sweep for the `33510df` anchor, kept as a record.** It
found nothing new that window either — not because the mechanism improved,
but because nothing was filed to drift. §2 gained **zero** entries in that
window: the one Proposed ADR that landed (0068) is, like nineteen before it,
a decision with no queue row. So
the heading, the title, the header paragraph and §5's preamble all still read
"five" / name the same five entries, in agreement, for the fourth consecutive
anchor now. The abandonment continues — one more decision with no row, seven
releases after the last one — while the specific four-place drift this file
watches for stayed dormant for a second consecutive anchor: twenty became
twenty-two (recorded above) in the same window that produced zero four-place
splits. **Both halves of the question this pass was asked to check, stated
together because they cut opposite ways**: the four-place split itself has not
recurred in two anchors running, but the rule the split is a symptom of — "any
commit that adds an outstanding ADR adds an entry here" — was abandoned once
more, for the sixth time since it was restated, at the same rate as every
anchor since `01974e5`. The mechanism is quiet because nothing has been filed
to disagree about, not because the underlying practice improved.

**The previous anchor's delta note, kept as a record.** The diff was
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

**The members the diff reports as untouched were spot-read at `07add3e` too,
and for the first time in four passes they produced nothing.** Every rooted
`file:line` in §§3-6 was re-derived mechanically and every anchor into a file
the diff reports as untouched lands: `commands.ts:467` (still thirteen),
`hud.ts:271`, `:404-409`, `:446`, `:537-542`, `:541` and `:555` (still
eighteen), all eight `zoning.ts` anchors, `topology.ts:72` and `:99`,
`types.ts:168`, `main.ts:82-84`, `:84`, `:86`, `:102`, `:154-195`, `:180-183`
and `:2506-2511`, `verification.ts:136` and `:324`,
`requirements.ts:19`, `room-projection.ts:74`, `room-catalog.ts:68-165`, `:69`
and `:70`, the six `entity-generation-wrap.test.ts` anchors,
`prisoners-intake-system.test.ts:230` and `:529`,
`unconsumed-command-contract.test.ts:204` and `:230` (`AWAITING_PRODUCER` still
empty), `ui-hud-messages.test.ts:218-224`, `environment-art.test.ts:248` and
`:256`, the four `adr-status-reference-contract.test.ts` floors,
`docs/DEPLOYMENT.md:198-205`, `:221` and `:253`, `docs/TRUSTED_SERVICES.md:604`,
`:607` and `:610`, `README.md:59`, `wrangler.jsonc:12` and `:20`, the four
`.github/workflows/migrate-database.yml` anchors, the six into
`20260823100000_bound_free_tier_capacity.sql`, and every ADR-body anchor
including `0003-…md:535`, whose quoted handshake split was re-measured and is
still 4/2/3. **Three passes running found something here and this one did not**,
which is a real result and not a skipped check: the class is not extinct, it is
that the citations this pass would have caught were caught by the two before it.

**The previous anchor's account of the same check, kept.** It read: because the
last two passes each found a citation that was already wrong before their window
opened and no diff could have raised either, that pass re-derived **every**
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

**That handover was taken and is discharged.** #481 corrected ADR 0022 in its
own commit: the ADR now reads *"`hud.ts:154` now declares **`HudRoomGesture`**"*,
and `src/ui/hud/hud.ts:154` is `export type HudRoomGesture =`. Re-read at
`07add3e`. **One handover raised at the previous anchor and closed nine releases
later, by the party entitled to make the edit** — recorded because this file has
raised more handovers than it has seen closed, and the ratio is the thing worth
watching.

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

## 2. Nine entries: #382's two rulings in ADR 0008 §2, 2026-08-27's scope clause for its §3, the Worker that lands with telemetry ingest, ADR 0056's price for keeping a player's orders in order, ADR 0059's price for making them walk, ADR 0074's price for reading a restored room's rectangle, ADR 0071's open-area amendment, ADR 0077's price for asking whether the edge in front of an actor is still standing, and ADR 0093's two remaining player-facing sentences for the errand it built

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

**Re-read at `0e2eb7fb` under the scope rule the header now states, because
this entry's own subject file moved in the window — and nothing in it needed
changing.** `src/simulation/locomotion/locomotion-system.ts` is among the
window's forty-two files: `LocomotionSystem.order` stops being a fixed `200`
and becomes a constructor parameter, so ADR 0088's guard instance can register
at 201 without tripping `tests/determinism/kernel-system-order.test.ts`'s
requirement that every declared order in a real session be distinct. **None of
the five costs priced above moves under it.** The prisoner instance still
defaults to 200, the cadence is still one tile per two kernel ticks, the
walking speed and the 2,400-tick day are untouched, ADR 0062's exact-equality
result is not revisited, the reconsider-at-the-door mitigation is unchanged,
and the mid-journey save rule is unchanged. **This is the case the new rule
exists for**, and it is worth saying which half of it did the work: the
intersection told this pass to open the file, and only reading the entry
against it could say the entry was fine. A rule that merely flagged the file
would have produced a correction nobody needed. **Open question 4 is answered
and the answer is not this entry's to record**: ADR 0088 took it, was accepted
on arrival, and §2 is owed no row for a decision already signed — the
confirmation belongs in ADR 0077's entry, where the prediction was made, and
it is there.

**The exact line that would replace the status.** In
[`0059-how-an-actor-gets-from-one-tile-to-the-next.md`](./0059-how-an-actor-gets-from-one-tile-to-the-next.md),
`**Proposed, 2026-08-28.**` becomes `**Accepted, <date> — <by whom, and what
was read>.**`, with the matching `Proposed, 2026-08-28 — …` prefix in that ADR's
[`README.md`](./README.md) row changed to `Accepted, <date> — …`, **and this
entry deleted in the same commit**, which is this section's standing recipe.

### ADR 0074 (2026-08-29) — the recovery is decided, whether a legacy prison should silently change under a player is not

**What is waiting.**
[ADR 0074](./0074-what-a-restored-room-that-recorded-no-rectangle-is.md),
`Proposed`, arrived with the change that implements it (#571,
`agent/559-v4-room-bounds`). A restored room instance that recorded no rectangle
recovers one from the zoning plane the same payload already carries, rather than
keeping [ADR 0071](./0071-what-bounds-a-room-whose-activity-consumes-no-object.md)'s
unbounded answer. It **amends ADR 0071 decision 2**, whose sentence still
describes the code correctly but whose *example* — "a V4 save" — was wrong.

**The evidence, and it is measured rather than argued.** `94adf1c` (v0.0.61, a
shipped build at `SAVE_SCHEMA_VERSION` 4) was checked out and *its own* path run
to produce `tests/fixtures/persistence/save-v4-yard.json`; every byte including
the checksum is what a V4 build wrote. Through the real restore path an 8×8 yard
answers **`Infinity`** where the same yard zoned by this build answers **4**. So
#554's balance change does not reach a restored prison, and nothing on screen
says so.

**That measurement was taken before the recovery landed, and it is kept
because it is why the decision exists — but it is not true of `main` and has
not been since `d0af2d7` (#571).** Through the same restore path at
`53e1405` a restored 8×8 yard answers **4**, the number the live zoning gives,
and `tests/migrations/save-v4-room-bounds.test.ts` pins it: *"restores a yard
bounded by the ground the save says it covers, not an unbounded one"* asserts
`expect(ceiling).toBe(YARD_PLACES)` and, beside it,
`expect(ceiling, 'issue #559 is that this was Infinity, so the claim gate
never refused').not.toBe(Number.POSITIVE_INFINITY)`. Run at this anchor:
`./node_modules/.bin/vitest run tests/migrations/save-v4-room-bounds.test.ts`
-> `Test Files 1 passed (1) / Tests 9 passed (9)`. **Both sentences stand. The
paragraph above is the evidence the decision was taken on and the paragraph
here is the state of `main`**, and overwriting the first would delete the only
statement of what the bug was.

**Why this correction was owed, and why no gate could have asked for it.**
[Issue #608](https://github.com/matmaxalez/lockstate/issues/608) raised it from
an independent re-audit against `23edabc` (v0.0.213) and made the argument
against itself first: read in context the `Infinity` sentence sits under *"The
evidence, and it is measured rather than argued"*, and the paragraph after it
opens *"Refusing it costs #559 staying open"*, so the passage is the case
**for** the change and the sentence is a record of what was found. **That
reading does not save it, and this file's own introduction is what settles
it**: *an entry's evidence is a claim about `main`, so landing the change an
entry describes means updating that entry in the same commit.* #571 landed the
recovery and did not update the entry, so a reader trusting the contract this
file states was misled — the exact class this file exists to catch, occurring
inside the file itself. The audit was right on the substance and slightly
overstated in form, and both halves are recorded because *"a false claim"* and
*"a true record the file's own rules require to be updated"* are different
defects with different fixes.

**And the gap in scope is the more useful half.** The `cfab558` re-anchor
(#583) re-read §§3-6 against its diff window and swept §2's four counters.
**§2's entry *content* was in neither scope**, and no delta could have raised
it: `docs/adr/0074-…md` did not change in that window, this file's §2 is not
covered by the §§3-6 derivation, and the sentence that went false is prose in
a section the method never opens. So this is the same structural blindness the
header records twice already — a delta pass cannot see a claim falsified
outside its enumerated set — arriving in the one section the method excludes
by construction. **The scope question is left open for the owner rather than
decided here**: whether re-anchoring should read every §2 entry whose subject
has since landed is a change to what a re-anchor costs, and #608 asks it in
those terms. What is decided is the instance, in both directions, above.

**THAT SENTENCE IS SUPERSEDED: the scope question is ANSWERED, at
`0e2eb7fb`.** It is left standing rather than overwritten because the
sequence is the record — an entry that says a question is open, and the
commit that closes it, are two different facts and both are true of the
trees they name. The owner's decision, and the rule it produced, are stated
in full in this file's header where the method is stated:
**re-read the §2 entries whose subject landed inside the delta window, by
the same intersection the method already performs for §§3-6 spans.** No new
pass; one more intersection over a set pass 1 has already computed. The
reasoning is #608's own and is recorded there: both of a re-anchor's
standing exclusions — refusing to fix a code comment, and refusing to flip a
status — point **outward** at other files, while a §2 entry is inside the
one file a re-anchor may edit, and this file's introduction already binds an
entry's evidence to `main`. What kept §2 content out was never principle but
cost, and the delta window is the bound. **The rule was applied in the same
pass that wrote it down**, which is the only way to land a method change
honestly: it confirmed ADR 0077's decision-1 prediction against ADR 0088
(recorded in that entry), re-read ADR 0059's entry because its subject file
moved and found it unchanged in every term (recorded in that entry), and
found nothing at all for the other six.

**And the paragraph below is still true of ADR 0056 and still true of the
measurement in this very entry, which is the honest limit of the new rule.**
Neither subject landed in the `33a4a22e..0e2eb7fb` window, so the rule is
silent about both by design. It buys the entries the window can have broken
and no others; completeness was the thing traded away to make it cost one
intersection instead of a re-run of every measurement in §2.

**Two entries carry evidence of the same shape and were deliberately not
checked, which is stated rather than left for the next reader to discover.**
ADR 0056's row opens **"The evidence."** and reproduces #437 on `6f671d5`;
ADR 0059's opens **"The evidence, and it is measured rather than argued."**
and gives a 100 ms render-delta ceiling and a 24-tick fixture divergence.
Both are present-tense measurements on named trees, exactly like ADR 0074's,
and **neither was re-run at this anchor** — their subjects are outside this
window and outside §§3-6, and this pass's scope is the delta plus the seven
counts plus the one entry #608 names. **That is a gap, not a verdict**: it is
not a claim that either has gone false, and the only way to find out is to run
them. Named here so that whoever decides #608's scope question has the size of
the job in front of them rather than having to re-derive it.

**Refusing it costs #559 staying open**, and the alternatives on the table are
both worse. A migration provably cannot reach the case: restore that payload,
run it, capture it, and the new envelope declares version 5 and decodes with
`migrated: false` while **still carrying the boundless row** — so the class of
save needing repair was never "V4 saves", and a repair inside
`migrateSaveEnvelopeV4ToV5` would have been offered such a save exactly once.
The other alternative is a guessed finite capacity, which invents a number.

**What approving commits the project to**, and this is the cost rather than the
benefit:

1. **One widening.** A restored legacy room gains object attribution and
   instance-scoped removal it did not have. Both move it *toward* what a room
   zoned in this build already does, which is the argument for them — but they
   are still behaviour a player's existing prison did not have yesterday, and
   ADR 0074 decision 6 deliberately ships **no player-facing string** saying so,
   on the ground that copy describing a "repair" would be a promise about a
   save's history nothing in the tree can substantiate. **Whether a legacy
   prison should change under a player without being told is the part that is
   the owner's**, not the arithmetic.
2. **A recovery recomputed on every load.** Nothing is written to any file, so
   rejecting this later costs a revert and no player's prison — which is the
   whole reason it was built this way (ADR 0033's shape rather than ADR 0030's,
   for the reason [#391](https://github.com/matmaxalez/lockstate/pull/391)
   established, reached here on its own measurement rather than by deference).
3. **A row the plane cannot support keeps ADR 0071's unbounded answer**, pinned
   by a test so nobody later turns the residue into a silent guess.

**The exact line that would replace the status.** In
[`0074-what-a-restored-room-that-recorded-no-rectangle-is.md`](./0074-what-a-restored-room-that-recorded-no-rectangle-is.md),
`**Proposed, 2026-08-29. Not self-approved.**` becomes `**Accepted, <date> —
<by whom, and what was read>.**`, with the matching `Proposed, 2026-08-29 — …`
prefix in that ADR's [`README.md`](./README.md) row changed to
`Accepted, <date> — …`, **and this entry deleted in the same commit**, which is
this section's standing recipe. **ADR 0071's own text is a second, separate
debt** and is not discharged by accepting this one: its index row and its
decision 2 still name "a V4 save" as the unbounded case, and whether that gets a
marked amendment is the owner's call.

### ADR 0071's open-area amendment (2026-08-29) — the scoping is the owner's, the document it scopes is still `Proposed`

**What is waiting.** A dated amendment section in
[ADR 0071](./0071-what-bounds-a-room-whose-activity-consumes-no-object.md),
*"Amendment, 2026-08-29: floor-area capacity applies only to a room type tagged
as an open area (issue #585)"*, arrived with the change that implements it
(#585, `agent/585-occupied-place`). Capacity derived from a room's own ground
now binds only a room type explicitly tagged in `src/content/room-catalog.ts` —
`room.yard`, `room.holding-cell`, `room.delivery-bay` — and every other room
type answers **0** for an action that consumes no object, whatever its
rectangle and whether or not it has one.

**Two things are outstanding, and neither of them is the ruling.** The ruling
is the owner's, recorded on
[issue #585](https://github.com/matmaxalez/lockstate/issues/585) on 2026-08-29
in the owner's own words, and the amendment says so in its own opening as
[`README.md`](./README.md)'s *"An amendment to an accepted ADR"* section
requires. What a reader cannot see without this row is:

1. **ADR 0071 itself is still `Proposed, 2026-08-29. Not self-approved.`** This
   section's rule exists for exactly this: an amendment inside a document is
   invisible to `adr-numbering-contract.test.ts`, which counts documents by
   their `Status` line. So a reader meeting decision 1 has to be told both that
   it is proposed and that it is already narrower than it reads — and neither
   fact is reachable from the index row, which still describes the unscoped
   rule at length.
2. **The debt ADR 0074's entry named is still open.** That entry records that
   *"ADR 0071's own text is a second, separate debt … its index row and its
   decision 2 still name 'a V4 save' as the unbounded case, and whether that
   gets a marked amendment is the owner's call."* This amendment does **not**
   discharge it. It touches decision 2 only for the untagged case; "a V4 save"
   is still there and still wrong, in the ADR and in its README row.

**The evidence, and part of it is a correction to the ruling's own premise.**
Measured at `05640b6` (v0.0.210):

- **The decision being amended is ADR 0071's, not ADR 0017 decision 5**, which
  the ruling names. ADR 0017 decision 5 reads, in full: *"This ADR decides no
  prices and no balance values. #29 puts final pricing and balance out of scope
  and nothing here changes that."*
- **A bedless `cell` has never had floor-area capacity in this tree**, so floor
  area was not the cause of the exploit #585 measured. `residentCapacity` is
  the summed `footprint.width` of the `'sleep-surface'` objects standing in the
  room (`src/simulation/objects/room-capacity.ts:176-201`, ADR 0028 decision 2)
  and reads no rectangle; the rule this amendment scopes is the
  *concurrent-use* ceiling, whose three production callers
  (`src/simulation/prisoners/action-system.ts:820`, `:1067`, `:1082`) all pass a
  capability and all sit behind a `room-catalog-id` target, so only
  `action.yard-recreation` on `room.yard` can reach it.

  **The three coordinates above name the wrong FILE, and they did so on the day
  they were written — corrected at the `3f8c00b0` anchor, in both directions.**
  `src/simulation/prisoners/action-system.ts` is a member of that anchor's delta
  window, so the three lines were opened rather than carried forward: on
  `3f8c00b0` all three are comment prose, and at `71617799` — the commit that
  wrote this citation — they were comment prose as well. The ceiling's three
  callers that pass a capability were then, and are now, in
  `src/simulation/prisoners/room-instance-registry.ts`: at `:902`, `:941` and
  `:1109` on that tree, and at **`:987`, `:1026` and `:1194`** on this one.
  **The claim holds in every term and only its address is wrong** — all three
  pass a capability, and the `some` predicate among them is the one that
  resolves a `room-catalog-id` target — so what is corrected is where to look
  and not what is there. **Re-cited by symbol from here on**: the two `const
  ceiling = this.concurrentUseCapacityFor(` sites and the `some` predicate
  beside them, all three inside `RoomInstanceRegistry`. The original
  coordinates are kept above rather than overwritten, because a `file:line`
  that was **never** right is a sharper instance of `docs/AGENT_WORKFLOW.md`
  §4's rule than any drifted one: no diff over any window could have caught it
  going wrong, because it never went wrong.
- **The exploit was residency's and is fixed by the other half of #585.** Three
  prisoners assigned above one standing bed earned **900 minor units a day
  before and 300 after**, against a control's unchanged 300, measured through
  the real command router.

**So this amendment changes nothing a player can currently reach**, and that is
the argument for it rather than against it: `room.yard` is tagged, every
ceiling in the game is what it was, and not one number in ADR 0071 moves. What
it buys is that the door cannot open later — the next action naming no
capability, on any room type, cannot conjure a place out of a bedless cell's
floor, and cannot do it by omission either, because an absent tag means "not an
open area".

**What approving commits the project to**, and this is the cost rather than the
benefit:

1. **A per-room-type authoring obligation, paid forever.** Every room type
   added from now on is not an open area unless somebody says so. The only
   guard is `tests/unit/content-catalogs.test.ts`, which pins the tagged set as
   a whole rather than as three memberships, so a *fourth* room quietly
   acquiring the tag fails.
2. **A generality given up.** Decision 1 used to be a statement about rooms and
   is now a statement about three of them. A future room whose activity really
   is people on open ground gets nothing until it is tagged, and it will look
   like the pre-#326 defect when it does — a room that exists and admits
   nobody.
3. **The owner's own stated cost:** *"this is a change to a decision, not to an
   implementation, and every reader of [the ADR] who learned decision 5 in its
   general form now has to learn the exception."*

**Refusing it costs nothing a player would notice and leaves the door open.**
The tag, `RoomInstance.openArea`, the two registration sites and the domain
test in `openGroundCapacityOf` revert together; nothing is persisted, so no
save carries it and no prison changes under anybody.

**The exact line that would replace the status.** There is no status of this
amendment's own to move — that is the point of
[`README.md`](./README.md)'s ruling 3. Approving it means ADR 0071's own
`**Proposed, 2026-08-29. Not self-approved.**` becoming `**Accepted, <date> —
<by whom, and what was read>.**`, with the matching `Proposed, 2026-08-29 — …`
prefix in its [`README.md`](./README.md) row changed to `Accepted, <date> — …`
**and a clause added to that row recording that the document is amended**, on
the model of 0022's and 0023's rows — **and this entry deleted in the same
commit**, which is this section's standing recipe. Point 2 above is *not*
discharged by that and outlives it.

### ADR 0077 (2026-08-29) — the rule is decided, whether a lockdown may strand a walker is not

**What is waiting.** [ADR 0077](./0077-when-a-route-stops-being-valid.md), *"When
a route stops being valid"*, is `Proposed, 2026-08-29. Not self-approved.` It
landed at `827201e` (#581) with the change that implements it, and **with no row
here** — the omission [#615](https://github.com/matmaxalez/lockstate/issues/615)
records, and this entry discharges.

**The evidence, which is a reproduction rather than a reading.** SIM-001 from the
2026-08-29 audit pass rated *"active locomotion routes are not invalidated by
later topology changes"* HIGH/HIGH; the independent red-team pass reached the
same code as RED-002 and **declined to call it a defect**, because it had not
shown a legitimate present-day player sequence that leaves a walk alive across
the construction transition. Neither audit executed anything.
`tests/integration/wall-built-mid-walk.test.ts` is the producer-side proof the
second one refused to assume, through the real `PlaceBuildOrder` path on seed
`0x0b1ec7`:

| tick | what happened |
| --- | --- |
| 1,621 | the wall is standing, and the prisoner is **thirteen tiles short of it** |
| 1,657 | the prisoner crosses the walled edge — thirty-six ticks later |
| 1,663 | it finishes inside a cell nothing in the prison can reach |

The thirteen tiles are the point: the fixture is shaped so the window is
**measured rather than assumed**, which is the difference between "walked through
a wall" and "crossed on the tick it appeared".

**What settling it commits the project to.** Six decisions, and three of them
commit to something a later change cannot quietly undo.

1. **A required predicate on `LocomotionStore` (decision 5).** Not an optional
   one with a permissive default — a default of *"always allowed"* is precisely
   the state the audited tree was in. Making it required turned five call sites
   into compile errors, and `tests/helpers/open-ground.ts` is the named answer
   for fixtures that build no geometry. **This is the mechanism by which ADR 0059
   open question 4 — do guards walk — cannot reintroduce SIM-001 by omission**,
   so accepting it commits every future locomotion caller to answering the
   question at the compiler rather than at review.
2. **A standing gate on the cadence, not on the wall clock.** *"Once per tile
   crossed, not once per tick"* is a count, so unlike the microseconds beside it
   it survives a shared runner, which is why `docs/BENCHMARKING.md` refuses a
   wall-clock threshold and this decision still gets a gate.
   `benchmarks/scenarios/actor-render-publication.mjs` pins
   `canCrossCallsPerWalkerPerPublication` at exactly `1`. Both gates were watched
   failing: moving the predicate into the per-tick loop takes `canCrossCalls` to
   334 against 167 at smoke and 3,334 against 1,667 at full. **Accepting this
   commits to keeping that pin**, and the pin is what a later refactor would
   break silently.
3. **One passability ordering, one place (decision 4).** `canStep` in
   `local-search.ts` stops holding a second copy and goes through `edgeStanding`.
   The *policies* still differ legitimately; the ordering is now written once.

**The decision inside it that is written down as reversible, and the reason this
row exists rather than only the ADR.** Decision 6 puts doors inside the rule, so
a door **locked under a walker** — which is exactly what a riot lockdown does via
`setControlState(sectorId, 'lockdown')` (ADR 0057) — now stops that walker, where
before the walk continued through it. **The ADR states its own evidence for this
as negative and does not dress it up**: `riot-regime-loop`,
`incident-consequence-loop` and `incident-events-loop` all pass unchanged, and
**no test was written that watches a prisoner meet a door locked mid-walk,
because none existed to extend and building one was not reached.** The narrower
alternative is one line and is written out in the ADR so nobody has to re-derive
it under pressure: return `true` for `standing.kind === 'door'` instead of
consulting `checkDoorAccess`, keeping the whole SIM-001 fix, at the cost of a
lockdown that does not confine anybody already walking for the length of one
journey.

That is the part of this ADR an owner would want to have seen before it is
settled, and it is a playability judgement rather than a correctness one.

**What it does not cost, stated because the expensive alternative was the
tempting one.** No save-format change, no migration, no persisted field on a
walk — option C, the route validity token, would have been an
[ADR 0038](./0038-what-makes-a-save-compatible.md) question and a
`SAVE_SCHEMA_VERSION` conversation, and was rejected for that among two other
counts. **No determinism fingerprint moves**: no system added or reordered, no
RNG stream added or drawn from differently, the predicate a pure function of
world state. **No player-facing string** is added or changed. The one visible
consequence is recorded rather than hidden — an actor refused an edge steps back
up to half a tile, and the look-ahead that removes even that is named, costed at
double the predicate calls, and deliberately not taken.

**The number is provisional and the document pre-commits to renumbering.** ADR
0077's own preamble records that the assigner's branch sweep and the drafting
agent's `max + 1` off disk **disagreed** — disk said 0075, the sweep across every
remote head said 0077, because 0075 and 0076 sat unmerged on
`agent/econ-hardlock-and-recycling` and 0072 is held and unwritten. Both answers
are in the document on purpose. Since then 0075 and 0076 have merged and are
Accepted, so the sweep's answer is now visible on disk too and the collision it
avoided can be checked by anybody.

**DECISION 1's PREDICTION CAME TRUE INSIDE A DELTA WINDOW, and this is the
first §2 entry re-read under the scope rule the header states at
[#608](https://github.com/matmaxalez/lockstate/issues/608)'s request.** Decision
1 above says the required `canCross` predicate *"is the mechanism by which ADR
0059 open question 4 — do guards walk — cannot reintroduce SIM-001 by
omission"*, and that accepting it *"commits every future locomotion caller to
answering the question at the compiler rather than at review"*. **That future
caller landed at `9dd6e601`** (#740, PR #781, v0.0.349), inside the
`33a4a22e..0e2eb7fb` window: ADR 0088 answers ADR 0059 open question 4 for
guards, `GuardRoster` takes a `LocomotionStore` of its own
(`src/simulation/security/guard-roster.ts:61`), and
`createGuardLocomotionSystem` wires a second `LocomotionSystem` instance
(`src/simulation/security/guard-locomotion.ts`) at order 201.
**The predicate it supplies is a real edge check and not a permissive
default**: the closure passed for `canCross` is
`navigation.canTraverseEdge(from, to, routeContextResolver(guards.getStaffRoleId(guardId)))`,
re-validated at the edge rather than trusted from when the route was planned,
and `guard-roster.ts:52` names this ADR by number and calls it *"completing
the required `canCross` socket"*. **So the entry is confirmed, not corrected** —
which is a shape this file has not recorded before. An entry's evidence is a
claim about `main`; a prediction that came true is as much a fact about `main`
as one that failed, and it belongs beside the prediction rather than in a
report nobody keeps. **What it does NOT settle is the thing still waiting**:
decision 6 — whether a lockdown may strand a walker — is untouched by #740,
which converts deployment travel and patrol legs only and leaves incident
response and contraband search teleporting. The playability judgement this row
exists for is exactly where it was.

**The exact line that would replace the status:** `**Accepted, <date> — <by whom,
and what was read>.**` in
[`0077-when-a-route-stops-being-valid.md`](./0077-when-a-route-stops-being-valid.md)
and the matching change to its [`README.md`](./README.md) row, **naming whether
decision 6 is taken whole or in its narrower form**, because those are different
games and the ADR says so. **Delete this entry in the same commit.**

### ADR 0093 (2026-09-03) — the mechanic is accepted and built; two of the three sentences it needs are not

**What is waiting.** [ADR 0093](./0093-a-carry-is-an-action.md), *"A carry is
an action"*, is **`Accepted, 2026-09-03, by the repository owner`** and its six
decisions are **implemented**. Nothing about its *status* is outstanding, and
that is what makes this entry a different shape from every other one in this
section: what is waiting is not a signature on a decision, it is **two of the
three player-facing sentences the document deliberately did not write**, and
one member of the `PrisonCondition` union that cannot exist until one of them
does.

**This paragraph said "three" when the row was filed, and the word is
corrected rather than overwritten** (`docs/AGENT_WORKFLOW.md` §4). Later on
2026-09-03 the owner ruled the first of the three — the action's label,
*"Errand"* — recorded in ADR 0093's *Amendment, 2026-09-03: the action's label
is the owner's word*. **So this entry shrinks rather than being deleted**: it
is filed for three sentences, one is settled, and it stays until the other two
are. The count in this section's own heading, in the header paragraph at the
top of this file and in §5's preamble moves with it, and **the entry count is
unmoved at nine.**

**The anchor was deliberately left alone by the edit that shrank this row.**
Moving it is the integrator's budget and not this row's, exactly as the
paragraph below already says of the reading it was taken against.

**And that sentence has already been overtaken, which is why it is corrected
here rather than left to rot.** It read: *"The `Re-anchored at` line still
names `402453a9` (v0.0.402)"* — true when this row was written, and false from
the moment the re-anchor to `3f8c00b0` (v0.0.407) lands, which the integrator
had in flight in the same hour. Both directions are marked per
`docs/AGENT_WORKFLOW.md` §4: the old reading is quoted above and the live line
is whatever the anchor at the top of this file says, which is the only reading
that cannot go stale. Whichever of the two changes lands second, nothing here
needs a further edit.

**The live anchor's reading of "eight" was correct when it was taken, and this
is the ninth, filed after it.** The anchor pass at `402453a9` (v0.0.402)
checked the four places that count this section and found all four reading
eight, which they did; this row and the three counters that move with it are a
change *since* that reading, not a correction of it. **The anchor itself is
untouched**, and it is not this row's to move.

**Two numbers in that anchor are worth handing to whoever takes the next
one.** The pass also records *"The three that count `Proposed` documents hold
at THIRTY-SEVEN"*, and ADR 0093 was one of the thirty-seven: its acceptance of
2026-09-03 takes them to **thirty-six**. And the same pass reports *"the fifth
consecutive anchor at which no entry was filed"* — this row ends that streak.
Neither sentence is edited here, because both are true of the commit they were
taken at; they are named so the next reading does not have to rediscover why
its own count differs.

**Why it is filed here rather than in §5.** §5 is *"where an accepted decision
and the code disagree"*, and they do not: the code implements every decision
this file's title says the owner still has to decide about. What the owner still
has to decide is the copy. That is this file's first half, and the rule this
section states — *"nothing else in the corpus would tell the owner that a
decision is waiting"* — is exactly why the row exists.

**The evidence, which is a run rather than a reading.** Seed `0x0b1ec7`, a
prison built through `Kernel.submitCommand`: a cell with a bed and a toilet, a
4x4 walled `room.delivery-bay` holding a `loading-dock-door-wooden`, a 3x3
walled `room.storage-room` holding two `storage-rack-wooden`, one prisoner
admitted at tick 600, and one `PurchaseMaterials` at 1,350.

| tick | the job | the prisoner |
| --- | --- | --- |
| 1,450 | `delivery.buy-3.1450` `available` | `action.free-association` |
| 1,481 | `assigned`, pickup leg | `action.carry`, `travelling`, at (4, 6) |
| 1,529 | | `performing` at the bay's anchor, (10, 6) |
| 1,541 | leg → `dropoff` | `travelling` |
| 1,621 | | `performing` at the storeroom's anchor, (20, 20) |
| 1,641 | `completed` | `idle` at (20, 20) |
| 1,661 | | back to ordinary life |

So a delivery lands in a bay, a prisoner in a work block chooses the errand at
rank 0, walks both legs through `LocomotionStore`, dwells at each end, and the
materials arrive in the container construction draws from. Before this,
`JobBoard.submitCarryItem` had exactly one occurrence under `src/` — its own
declaration — and `JobWorkerPool.register` had no `src/` caller at all.

**What settling the three sentences commits the project to** — item 1 as
settled, items 2 and 3 as still owed.

1. **The action's label — SETTLED, 2026-09-03, by the owner: *"Errand"*.**
   `src/content/simulation-message-keys.ts` carries one
   label per entry of `DEFAULT_ACTIONS`, and
   `tests/unit/simulation-message-keys.test.ts` requires each namespace to
   label *exactly* the ids its declaration declares — so an entry had to exist
   the moment the catalogue held one. That is why this was the one of the three
   that was **already on screen**, and it is why the ruling moved no string:
   the owner confirmed the word the catalogue already held. What changed is
   that the entry stopped being provisional.

   **What this item said while it was owed is kept rather than overwritten**
   (`docs/AGENT_WORKFLOW.md` §4). It read: *"**It is there, reading `'Errand'`,
   and it is marked in that file as a draft for the owner's review**, in the
   identical form `action.kitchen-work`'s `'Kitchen Duty'` has carried since
   #532. This is therefore the one of the three that is **already on screen**:
   the roster and the detail panel will say Errand until the owner says
   otherwise."* They have now said, and the draft marking is gone from
   `src/content/simulation-message-keys.ts` and from
   `tests/foundation/content-vocabulary-contract.test.ts`, each of which
   records the ruling and the words it replaced. **`action.kitchen-work`'s
   label is still a draft**, and that half of the comparison is untouched by
   this ruling.

   The alternatives considered and rejected are written out beside it — *Carrying*
   (a phase, and `action-phase` already labels three of those), *Haulage* (the
   trade, not the shift), *Delivery Duty* (names the purchase, and a carry will
   not always be a delivery once other producers arrive).
2. **The standing condition for a delivery waiting in a bay with nobody in a
   work block to carry it.** ADR 0093 decision 2 requires this to be *visible*
   as an [ADR 0087](./0087-whether-a-refusal-is-an-event-or-a-condition.md)
   standing condition, and states the cost it makes visible: a bayed prison
   whose population is outside a work block leaves a delivery waiting for up to
   **1,100 ticks** — from the end of the 1,300–1,800 block to the start of the
   next day's 500–1,000 block — and a build order waits with it. **It is not
   built**, and the omission is deliberate rather than unfinished: a
   `PrisonCondition` member with no authored sentence is the locale-key-with-no
   -implementation defect `AGENTS.md`'s fourth exclusion exists for. Settling it
   commits to one sentence and one union member; leaving it means the wait is
   real and unexplained, which is the cost of *this* row rather than of the
   decision.
3. **Whatever the detail panel says about goods in hand**, if it says anything.
   `PrisonerActionViewModel` carries an action and a room; a carry has an item
   and a quantity, and whether a player sees them is a copy decision. Nothing
   was added, so the panel currently says what it says for any action.

**And the three open questions ADR 0093 puts to the owner are untouched by the
build**: whether a carrier is interruptible by a regime change (the document
says no, by analogy with every other action, and a lockdown that leaves a
prisoner walking a crate across the yard is worth a ruling); what the cancel
path owes a player who un-zones the bay or the storeroom mid-flight (ADR 0037
open question 1, now reachable); and whether a `'carrier-departed'` job
deserves a player-visible notice. The first of those is now the one with live
traffic behind it.

**One defect the build measured and did not fix, because fixing it is a
balance decision.** A work block allows `work`, `education` and
`free-association` only, so **a hungry prisoner cannot eat during one**;
`action.free-association` scores 0 by construction; and the owner's amendment
routes a prisoner whose hunger the state withholds for to
`action.kitchen-work`, whose `hunger` effect is **1** a tick against
`action.eat-meal`'s **4**. So the ruling sends a starving prisoner to the
slowest of the three routes to hunger — which is strictly better than the
errand, whose effect on hunger is nothing, and is not a cure.
`tests/integration/carry-need-threshold.test.ts` measures the direction rather
than arguing it. **This is not a defect ADR 0093 introduced**: it is what a
work block already was, and the amendment is the first thing that reads it.

**The exact line that would replace the status:** none — the status is already
`Accepted`. **What would delete this entry is the owner writing the two
sentences that are left**, or ruling that they are not owed. Whichever it is,
delete this entry in the same commit, and if the standing condition is taken,
`src/simulation/protocol/types.ts` gains the member ADR 0093's change list
records as item 9. **That sentence read "the owner writing the three
sentences" until the first was written**, and the recipe is unchanged by the
correction: a settled sentence shrinks this entry, and only the last one
deletes it.

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

### ADR 0075 and ADR 0076 — accepted 2026-08-29, and their entries were written and never filed

**Six, not four.** The heading above counted 0032, 0033, 0034 and 0035 and is
left standing, because what it counted is exactly right and the shape it named
is what happened again. These two are recorded separately rather than folded
into that count, because **they are a different failure and the difference is
the finding**.

The four above were *never written*. These two were written in full — argued,
evidenced, with the exact status line each acceptance would need — and handed
over as text in
`docs/research/2026-08-29-a-prison-that-cannot-buy-its-first-bed.md` §8, under a
heading that says so, with a stated reason:

> any count written here is wrong by one whichever way the two branches land, in
> all four places at once, and the merge conflicts in exactly the four
> paragraphs whose value is the record of how they came apart

That is this section's own *"unsatisfiable under concurrency"* diagnosis, applied
correctly by an author who could see it coming. They did the thing #571 had just
proved works: leave the file alone, hand the entry to a separate filing commit
that can read the true count off the merged tree. **The handover was right, the
reasoning was right, and the entries still never reached this file** — because
[#606](https://github.com/matmaxalez/lockstate/pull/606) accepted both on
2026-08-29 before the filing commit ran.

**So the entries are not filed here, and that is a decision rather than the
omission repeating.** Both were written ending in this section's standing recipe
— *"Delete this entry in the same commit"* — and both ADRs are now
`**Accepted, 2026-08-29, by the repository owner.**` Filing them in order to
delete them in the same commit would put two rows in this file that describe
decisions nobody is waiting on, which is the opposite of what §2 is for. The
full text of both survives in the research document, which is where a reader
who wants to know what the acceptance was weighing should be sent.

**What the pair costs, which the four above did not.** 0032's case established
that an ADR can be approved faster than its queue entry can be written. These
two establish something narrower and worse: **an entry can be written, correct,
complete, and deliberately routed around a known concurrency defect, and still
not arrive.** Diligence was not the missing ingredient in any of the six. The
window between "the entry exists as text" and "the entry is in the file" is
owned by nobody, and every instance so far has been lost inside it.

**And the acceptance route is worth reading beside this.** #606 records, in both
ADRs, that the owner's acceptance was given **against a summary of each ADR's
subject and its stated cost, as one of eight decisions, not against the full
text**. A §2 row is the artefact that would ordinarily carry that summary. Both
rows existed and neither was in front of anybody. That is not an argument that
the acceptance was wrong — 0075's and 0076's substance had already been ruled on
— but it is the clearest case yet of what this section is for, met by not being
there.

The fix named four cases ago is unchanged and is now overdue by two more: **one
file per entry in a directory**, so that a filing commit cannot be beaten to the
finish by an acceptance, and so that "the file is held" and "the count will be
wrong whichever way the branches land" both stop being reasons.

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

> **This paragraph's present tense is FALSE as of `b2941064` (v0.0.372), and it
> is kept rather than overwritten because what it records is true history.**
> *"A `Proposed` row in `docs/adr/README.md` is the only one"* was true when it
> was written and there are **39** today, against 48 `Accepted` across 87 rows.
> **The paragraph names the one way it expected to break and that is not the
> way it broke.** It expected an ADR arriving with its own implementing change
> to sit `Proposed` unnoticed, and guarded that with a mechanical trigger. What
> actually happened is plainer and had no guard at all: thirty-eight more
> `Proposed` rows arrived, one or two at a time, over sixty-odd releases, and
> nobody re-read this sentence. **No gate could have caught it**, which is the
> part worth keeping: §2's counters count §2's *entries*, and this sentence is
> a claim about the *index's rows* — a different file, counted nowhere near
> here. The property the exercise bought was real and it was spent by
> accumulation rather than by any decision, and the mechanical trigger the
> paragraph installed is what kept the *entries* at eight while the rows went
> to thirty-nine.


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
this section's own evidence for stating a subject instead of a tally.
**Seventeen at `07add3e`**, nine releases later again — 0059, 0061, 0062 and
0063 — so the count has been zero, nine, thirteen and seventeen across
thirty-one releases and the sentence saying thirteen is corrected in place
beside the ones saying nine and one, for the same reason. **Twenty-one at
`01974e5`**, eleven releases later again — 0064, 0065, 0066 and 0067 — so the
count has been zero, nine, thirteen, seventeen and twenty-one across
forty-two releases, and the sentence saying seventeen is corrected in place
beside the rest, for the same reason. **Twenty-two at this anchor**, seven
releases later — 0068 alone, the client-side room-enclosure classification ADR
(#498) — so the count has been zero, nine, thirteen, seventeen, twenty-one and
twenty-two across forty-nine releases, and the sentence saying twenty-one is
corrected in place beside the rest, for the same reason. Counted on disk at
this anchor exactly as the header counts it — the first non-blank line under
each document's `## Status` heading: `0042`, `0043`, `0046`, `0047`, `0048`,
`0049`, `0050`, `0051`, `0052`, `0053`, `0054`, `0056`, `0057`, `0059`, `0061`,
`0062`, `0063`, `0064`, `0065`, `0066`, `0067`, `0068` — twenty-two, none of
0064-0067 accepted in the interval, all four still `Proposed` on disk, plus
0068 joining them.

**Twenty-seven at `cfab558`, and the sentence above spent four anchors saying
twenty-two while the header said otherwise.** Five more have arrived since
`4ace2da` — **0069** (how long a prisoner is held for, #541), **0070** (the
staff-dismissal ADR, #533), **0071** (what bounds a room whose activity
consumes no object), **0073** (who orders a contraband search) and **0074**
(what a restored room that recorded no rectangle is, #571) — so the count has
been zero, nine, thirteen, seventeen, twenty-one, twenty-two and twenty-seven
across **eighty-seven** releases — the span is measured from `54418b6`
(v0.0.121), where the zero was read, to `cfab558` (v0.0.208), which is the
same base the *"forty-nine releases"* above is measured from. The sentence saying twenty-two is corrected in
place beside the ones saying twenty-one, seventeen, thirteen, nine and one,
for the same reason every earlier one was.

**The lag is the finding rather than the arithmetic, and it is dated.**
Twenty-two was correct on the tree it was written against, `4ace2da`
(v0.0.177); it went false when 0069 landed at **#541**, inside the
`4ace2da..85c1c29` window. Three re-anchors have passed since, each moving
the header's copy of this number and none moving this one — and the
`85c1c29` pass wrote into the derivation subsection above that *"§3's
opening, §5's first bullet and §6's `income.ts` bullet now enumerate
**twenty-three** `Proposed` documents"*, which was **false on the tree that
wrote it**: all three said twenty-two. So this is the same shape as the four
places that count §2, in a different set of places, and nothing in this file
had named it. A next editor who greps for a count in this file should expect
**seven** places rather than four: the four that count §2, and these three
that count `Proposed`.

Counted on disk at `cfab558` by the method every reading in this sequence has
used — the first non-blank line under each document's own status statement,
`## Status` heading or `- Status:` bullet alike, 0064 and 0067 still being the
two in bullet form: `0042`, `0043`, `0046`, `0047`, `0048`, `0049`, `0050`,
`0051`, `0052`, `0053`, `0054`, `0056`, `0057`, `0059`, `0061`, `0062`,
`0063`, `0064`, `0065`, `0066`, `0067`, `0068`, `0069`, `0070`, `0071`,
`0073`, `0074` — twenty-seven. `0022` is still checked and still excluded, by
the nested-amendment reading recorded below. `docs/adr/README.md` agrees:
twenty-seven rows opening `Proposed` out of 68, and **Next free number:
0075**. **0072 is not on disk at all** — it is held for the events-persistence
decision, which the index's own next-free paragraph states — so a reader
re-deriving this list should expect a gap there and not a miscount. **`0022` was checked and is not a member of this tally at
all**, despite a bare `grep -l '^\*\*Proposed'` over `docs/adr/` matching its
file: that hit is `### Status of this amendment` — a dated amendment's own
approval marker, nested below the ADR's top-level `## Status` heading, which
for 0022 reads `**Accepted, 2026-08-25 — as amended...**` and has read that
since before this tally began. `docs/adr/README.md`'s row for 0022 agrees:
`Accepted, 2026-08-25 — as amended`. This is the grep trap this pass was
warned about, caught by reading the heading a hit sits under rather than the
hit alone, and it is recorded here because the same shape of hit could as
easily have added a document that belongs. What is
still true, and is why the section keeps its subject rather than being folded
into that bullet, is narrower and is the durable half: **0013 §§5-6 is the only
open decision in the corpus whose two halves are *partly enforced in a live
database*, and the only one this file has ever had to track by reading SQL.**
The seventeen are ordinary `Proposed` documents with index rows; this one is a
split status inside an `Accepted` one, which no index row can show.

**Thirty at `53e1405`**, seven releases later — **0075** (what a prison that
cannot afford its first bed is owed, #580), **0076** (what happens to a
resident whose bed is taken away, #580) and **0077** (when a route stops being
valid, #581) — so the count has been zero, nine, thirteen, seventeen,
twenty-one, twenty-two, twenty-seven and thirty across **ninety-four**
releases, measured from the same base as the eighty-seven above, `54418b6`
(v0.0.121), to `53e1405` (v0.0.215). The sentence saying twenty-seven is
corrected in place beside the ones saying twenty-two, twenty-one, seventeen,
thirteen, nine and one, for the same reason every earlier one was.

**And this time the correction was not a lag.** The `cfab558` pass moved this
sentence, §5's first bullet and §6's `income.ts` bullet together, after four
anchors in which only the header moved — so all three were read here at
**twenty-seven** before being moved to thirty, which is the first time in this
sequence that a re-anchor has found the three sections already agreeing with
the header rather than four anchors behind it. That is the sweep the previous
anchor named paying, and it is worth recording because the previous anchor's
own account of the same defect notes that *a sentence claiming they were
opened is indistinguishable, to every gate in this repository, from having
opened them.* All three were opened at this anchor, and the value found in
each before the edit is written here so the claim is falsifiable:
`git show 53e1405:docs/adr/STATUS-QUEUE.md` returns twenty-seven in all three
places — this sentence's opening, §5's first bullet's *"TWENTY-SEVEN at
`cfab558`"* and §6's *"it is twenty-seven"*. **The obvious command is the
wrong one and is worth naming**: `git show cfab558:docs/adr/STATUS-QUEUE.md`
returns twenty-**two** in all three, because an anchor names the tree a pass
*read* and not the commit that pass *wrote*. That pass's writing commit is
`d47edfd`/#583, which landed six commits later, and confusing the two is how a
count comes to be taken on one tree and written about another — the failure
this sequence has now recorded twice.

Counted on disk at `53e1405` by the method every reading in this sequence has
used — the first non-blank line under each document's own status statement,
`## Status` heading or `- Status:` bullet alike, 0064 and 0067 still being the
two in bullet form: `0042`, `0043`, `0046`, `0047`, `0048`, `0049`, `0050`,
`0051`, `0052`, `0053`, `0054`, `0056`, `0057`, `0059`, `0061`, `0062`,
`0063`, `0064`, `0065`, `0066`, `0067`, `0068`, `0069`, `0070`, `0071`,
`0073`, `0074`, `0075`, `0076`, `0077` — thirty. `0022` is still checked and
still excluded, by the nested-amendment reading recorded below.
`docs/adr/README.md` agrees: thirty rows opening `Proposed` out of 71, and
**Next free number: 0078**. **0072 is still not on disk at all** — it remains
held for the events-persistence decision — so the gap a re-deriving reader
finds there is still deliberate and is still not a miscount.

**Thirty is TWENTY-NINE at `0637ab1`, and this is the first time in the whole
sequence that the count has FALLEN.** Every previous reading moved it up or
held it: nine, one, one, none, nine, thirteen, seventeen, twenty-one,
twenty-two, twenty-seven, thirty. The set changed by three documents in one
window and netted minus one:

- **0075 and 0076 left**, both to `**Accepted, 2026-08-29, by the repository
  owner.**` at `f0b98aa`/#606. They are the first documents to leave this count
  by being *decided* rather than by being renumbered.
- **0078 joined** (what keeps a prisoner safe), `**Proposed, 2026-08-29. Not
  self-approved.**`, at `19482be`/#612.

So the enumeration is now `0042`, `0043`, `0046`, `0047`, `0048`, `0049`,
`0050`, `0051`, `0052`, `0053`, `0054`, `0056`, `0057`, `0059`, `0061`,
`0062`, `0063`, `0064`, `0065`, `0066`, `0067`, `0068`, `0069`, `0070`,
`0071`, `0073`, `0074`, `0077`, `0078` — **twenty-nine**, plus 0013's split
and with 0022 still excluded. `docs/adr/README.md` agrees: **twenty-nine**
rows opening `Proposed`, counted independently with
`grep -cE '^\|.*\| *\*{0,2}Proposed' docs/adr/README.md`, which returns 29
here and 30 at `53e1405`. **0072 is still not on disk**, for the sixth anchor
running.

**Twenty-nine is THIRTY again at `898a16a`**, ten releases later, and the
count returns to a value it held two anchors ago. **That is the second time
this sequence has returned to a value it already held, not the first** — the
run opens `nine, one, one, none, nine`, so `nine` recurred at the fifth
reading, and a first draft of this sentence claimed novelty it did not have
until the earlier run was read back. **0079** joined (a sentence long enough to be a
history, #659, landed at `9a25700`), `**Proposed, 2026-08-30. Not
self-approved.**`, and nothing left. So the enumeration is now `0042`, `0043`,
`0046`, `0047`, `0048`, `0049`, `0050`, `0051`, `0052`, `0053`, `0054`,
`0056`, `0057`, `0059`, `0061`, `0062`, `0063`, `0064`, `0065`, `0066`,
`0067`, `0068`, `0069`, `0070`, `0071`, `0073`, `0074`, `0077`, `0078`,
`0079` — **thirty**, plus 0013's split and with 0022 still excluded, counted
on disk by the method every reading in this sequence has used: twenty-eight
under a `## Status` heading and two (0064, 0067) under a `- Status:` bullet.
`docs/adr/README.md` agrees: **thirty** rows opening `Proposed`, counted
independently, and **Next free number: 0080**. **The value returning is not
the same fact as the value never having moved**, and the difference matters to
this sentence's subject: thirty at `53e1405` was 0075, 0076 and 0077 arriving
together, and thirty here is that set minus the two the owner accepted, plus
0078 and 0079. The number is a poor summary of its own membership, which is
this section's standing argument for stating a subject rather than a tally.
**0072 is still not on disk**, and it remains held for the events-persistence
decision. How many consecutive anchors that has now been true for is *not*
restated here: the last two anchors did not restate it either, so continuing
the count from the last number written would be arithmetic over a gap, and a
streak figure nobody re-derives is the shape of sentence §4 of
`docs/AGENT_WORKFLOW.md` warns rots first.

**Thirty is TWENTY-NINE again at `df46980` (v0.0.281), and this is the second
fall in the sequence and the first with a single cause.** **0051** left the set
by being *decided* — `**Accepted, 2026-08-30, by the repository owner.**`,
moved onto disk by `445f546`/#647 — and nothing joined. **Both rulings that
cover it are older than the move**: #535 decision 8 was filed with `main` at
`966560f` (**v0.0.184**) and #639's first ruling with `main` at `cd2c7c5`
(**v0.0.236**), read off the release commit standing at each issue's creation
time, so the status line moved **97** and **45** releases behind them
respectively. So the count has been zero, nine, thirteen, seventeen,
twenty-one, twenty-two, twenty-seven, thirty, twenty-nine, thirty and
twenty-nine across **one hundred and sixty** releases, measured from the same
base as every span above, `54418b6` (v0.0.121), to `df46980` (v0.0.281). The
sentence saying thirty is corrected in place beside the ones saying
twenty-nine, thirty, twenty-seven, twenty-two, twenty-one, seventeen, thirteen,
nine and one, for the same reason every earlier one was.

**The two falls are not the same shape, and that is the part worth reading.**
`0637ab1`'s fall netted minus one out of three movements — two accepted, one
arriving — so the number moved for reasons that partly cancelled. This one is
one document leaving and nothing else: the first reading in the sequence whose
whole cause is a single acceptance. **And it is the first fall this file saw
coming**, because the handover in the header names 0051 by number and says the
acceptance would land after a re-anchor; what it did not say, and could not,
is that the ruling covering three documents would be discharged one at a time.

So the enumeration is now `0042`, `0043`, `0046`, `0047`, `0048`, `0049`,
`0050`, `0052`, `0053`, `0054`, `0056`, `0057`, `0059`, `0061`, `0062`, `0063`,
`0064`, `0065`, `0066`, `0067`, `0068`, `0069`, `0070`, `0071`, `0073`, `0074`,
`0077`, `0078`, `0079` — **twenty-nine**, plus 0013's split and with 0022 still
excluded, counted on disk at `df46980` by the method every reading in this
sequence has used: **twenty-seven** under a `## Status` heading and **two**
(0064, 0067) under a `- Status:` bullet, out of **74** documents.
**0080 is not a member and never was** — it landed already `Accepted`, its
status reading *"**Accepted, 2026-08-30, on the owner's ruling…**"* at
`402c466`/#681, verified by reading `## Status` out of the commit that added
the document rather than out of the tip, so it moved the index's *Next free
number* to 0081 without ever touching this count. **A first draft of that
sentence called it the first ADR in this corpus to arrive already decided, and
that is false**: nineteen have, checked by reading `## Status` out of the
adding commit for all seventy-four documents — 0001-0011, 0020, 0037-0041,
0044 and 0080 — of which **two arrived inside this sequence's span**, 0044 at
`4ae2e39`/#378 and 0080. So the true claim is the narrow one: 0080 is the
**second** ADR to arrive already decided since the zero at `54418b6` was read,
and the first in the **145** releases since 0044 — which arrived in the same
release window as that zero, `4ae2e39` carrying version `0.0.121` and not being
an ancestor of `54418b6`, so the two readings are one release apart and the gap
after them is the whole of the sequence. The wrong draft is
recorded rather than deleted because it is the same error class this section
already holds two instances of — a count asserted from what a pass expected to
find rather than from a scan — and this time the scan was cheap and the
assertion was one command away from being checked. `docs/adr/README.md`
agrees when its **status column** is read rather than its rows: **twenty-nine**
`Proposed`, **forty-five** `Accepted`, seventy-four rows. **The regex this
section has used since `0637ab1` still returns the right answer** —
`grep -cE '^\|.*\| *\*{0,2}Proposed' docs/adr/README.md` returns **29** — and
a looser whole-row match does not: `grep '^| \[' docs/adr/README.md | grep -c
Proposed` returns **30**, because 0051's cell now carries its own correction in
both directions and the word survives inside the clause saying what the cell
used to read. Both were run. That is a new instance of the grep trap this
section already records for 0022, in the index rather than in a document, and
it will get worse rather than better as more cells are corrected in place —
the anchored regex is what keeps it from mattering, and it is recorded here so
that nobody replaces it with something shorter. **0072 is still not on disk**, and
it remains held for the events-persistence decision.

**Twenty-nine is THIRTY-TWO at `0352116` (v0.0.301), twenty releases later,
and the sentence saying twenty-nine had been false for fourteen of them.** Three
documents joined and none left: **0081** (whether a purchase may be partly
filled, `0514458`/#708, released as v0.0.287), **0082** (what order build orders
are carried out in, `c5f2db5`/#712, v0.0.290) and **0083**
(what opens the negative balance and what bounds it, `a11261a`/#715, v0.0.293).
**0081 and
0082 landed inside the *previous* window**, at `58220f7..a54899a`, and that pass
named both in this file's header while leaving this sentence at twenty-nine —
so the lag here is two anchors on two of the three and one anchor on the third,
and it is the fifth time this section has recorded the header's copy of a count
moving while this one did not. So the count has been zero, nine, thirteen,
seventeen, twenty-one, twenty-two, twenty-seven, thirty, twenty-nine, thirty,
twenty-nine and thirty-two across **one hundred and eighty** releases,
measured from the same base as every span above, `54418b6` (v0.0.121), to
`0352116` (v0.0.301). The sentence saying twenty-nine is corrected in place
beside the ones saying thirty, twenty-nine, thirty, twenty-seven, twenty-two,
twenty-one, seventeen, thirteen, nine and one, for the same reason every earlier
one was.

So the enumeration is now `0042`, `0043`, `0046`, `0047`, `0048`, `0049`,
`0050`, `0052`, `0053`, `0054`, `0056`, `0057`, `0059`, `0061`, `0062`, `0063`,
`0064`, `0065`, `0066`, `0067`, `0068`, `0069`, `0070`, `0071`, `0073`, `0074`,
`0077`, `0078`, `0079`, `0081`, `0082`, `0083` — **thirty-two**, plus 0013's
split and with 0022 still excluded, counted on disk at `0352116` by the method
every reading in this sequence has used: **thirty** under a `## Status` heading
and **two** (0064, 0067) under a `- Status:` bullet, out of **79** documents.
`docs/adr/README.md` agrees when its **status column** is read rather than its
rows — `grep -cE '^\|.*\| *\*{0,2}Proposed' docs/adr/README.md` returns **32**
against **45** `Accepted` and **77** rows — and the loose whole-row match still
does not: `grep '^| \[' docs/adr/README.md | grep -c Proposed` returns **33**,
one more than the anchored regex for the same reason 0051's corrected cell gave
at `df46980`. Both were run. **0072 is still not on disk**, and it remains held
for the events-persistence decision. **0080 is still not a member and never
was**, for the reason recorded above.

**The rise is the largest single jump this section has recorded, and its cause
is one day rather than one window.** All three of 0081, 0082 and 0083 carry
`**Proposed, 2026-08-31. Not self-approved.**`, all three come out of the
owner's rulings on
[#703](https://github.com/matmaxalez/lockstate/issues/703), and two of the three
already have their decisions implemented on `main` while the documents stay
`Proposed` — 0081's decisions 1 and 2 by `a67b141`/#725, and 0083's standing
overdraft by `04e27ca`/#716. **That is the ADR 0054 shape this section has named
at every anchor since `07add3e`, arriving three at a time**, and a reader
counting thirty-two open decisions should not read them as thirty-two unshipped
ones.

**Thirty-two is THIRTY-ONE at `4ac0973` (v0.0.309), eight releases later, and
the ratio improved for the first time since it fell to thirty-two.** One
document left and none joined: **0082** (what order build orders are carried
out in) moved to `**Accepted, 2026-08-31, by the repository owner.**` at
`61c4f384`/#731, which also implements it — the ADR's own Status block moves in
the same commit that makes it true, exactly as 0051's did at `df46980`. So the
directory holds `0042`, `0043`, `0046`, `0047`, `0048`, `0049`, `0050`, `0052`,
`0053`, `0054`, `0056`, `0057`, `0059`, `0061`, `0062`, `0063`, `0064`, `0065`,
`0066`, `0067`, `0068`, `0069`, `0070`, `0071`, `0073`, `0074`, `0077`, `0078`,
`0079`, `0081` and `0083` — **thirty-one**, plus 0013's split and with 0022
still excluded, counted on disk at `4ac0973` by the method every reading in
this sequence has used: **twenty-nine** under a `## Status` heading (0013
excluded, counted separately, exactly as the miscount paragraph below argues)
and **two** (0064, 0067) under a `- Status:` bullet, out of **79** documents.
`docs/adr/README.md` agrees when its **status column** is read rather than its
rows — `grep -cE '^\|.*\| *\*{0,2}Proposed' docs/adr/README.md` returns **31**
against **46** `Accepted` and the same **77** rows — and the loose whole-row
match now disagrees by **two** rather than one: `grep '^| \[' docs/adr/README.md
| grep -c Proposed` returns **33** still, because 0082's own row now carries the
same shape of self-correcting cell 0051's did — *"this cell read `Proposed,
2026-08-31. Not self-approved` until the acceptance"* — so the word survives in
the row's own history alongside 0051's, and a second source of the same grep
trap this section has recorded once before is now live. Both were run. **0072
is still not on disk**, and it remains held for the events-persistence
decision. **The ADR 0054 shape above is now two documents rather than three**:
0081 and 0083 still carry `Proposed` with part of their decisions already
merged; 0082 is the first member of that shape this section has ever recorded
leaving it by being accepted rather than by this section catching up to a stale
count.

**Thirty-one is THIRTY-THREE at `b04e45f` (v0.0.319), ten releases later, and
nothing left.** Two documents joined: **0084** (what the alerts channel owes
a player, #744) and **0085** (what the HUD corner is for, and what the strip
may drop, #751), both `Proposed, 2026-09-01. Not self-approved`. **Three
things that could have moved this count did not, and are named because a
reader who only watches the count would miss why.** The owner's ruling 19 of
2026-08-31 (#747) is drafted as ADR 0017's own *"Amendment, 2026-09-01"* — an
amendment to an **Accepted** ADR, not a new document, exactly the form
`docs/adr/README.md`'s *"An amendment to an accepted ADR"* section and §2's
own rule above both give it. Ruling 20 (#746) and the owner's unnumbered 2026-09-01 ruling (#753) are
drafted the same way, as two amendments inside **Accepted** ADR 0076 — the
first superseding part of decision B's premise, the second reversing
decision B's own sentence about a completed object — both signed the same
day they were drafted, so neither ever stood `Proposed` on `main` at all.
(Ruling 21 is a different, unrelated decision — #723's coverage-badge
shortening — and is named here only to head off the guess that it belongs
to this pair.) None of the three
adds or removes a row. So the directory holds `0042`, `0043`, `0046`, `0047`,
`0048`, `0049`, `0050`, `0052`, `0053`, `0054`, `0056`, `0057`, `0059`,
`0061`, `0062`, `0063`, `0064`, `0065`, `0066`, `0067`, `0068`, `0069`,
`0070`, `0071`, `0073`, `0074`, `0077`, `0078`, `0079`, `0081`, `0083`,
`0084` and `0085` — **thirty-three**, plus 0013's split and with 0022 still
excluded, counted on disk at `b04e45f` the same way as every reading in this
sequence, cross-checked against `docs/adr/README.md`'s status column by
reading the leading word of every status cell rather than a whole-row match:
`grep -cE '^\|.*\| *\*{0,2}Proposed' docs/adr/README.md` returns **33**
against **46** `Accepted` and **79** rows (0018 excluded, its own cell reads
`—`). The whole-row trap this section named at the previous anchor is
unchanged rather than widened: `grep '^| \[' docs/adr/README.md | grep -c
Proposed` still returns **35**, still exactly 0051's and 0082's own
self-correcting cells quoting the word `Proposed` in their history — neither
0083's, 0084's nor 0085's row carries such a quote. It is not run again here
because the leading-word method the previous two anchors both learned from it
does not fall into it: a python pass over every `| [NNNN]` row's status cell,
taking only the first word, agrees with the anchored `grep` at 33 without
needing the whole-row form at all.

**Thirty-three is THIRTY-FOUR at `5144eb9e` (v0.0.328), nine releases later,
and it is the mirror image of the previous window's: one document left by
being decided and two joined.** **0084** left — *"Accepted, 2026-09-01, by
the repository owner — all four decisions, taken on the day this was
drafted"* — at `8d04de84`/#754, though "all four" is the ADR's own rulings
count rather than its own decision numbering, named below. **Decision 4, the
dwell floor on the
events band, is explicitly not among them and stays open** — the brief
carrying the rulings called them "all four", which the ADR's own Status
section says is true of the rulings and false of this document's own
numbering, so 0084 is decided rather than fully closed and stays worth
naming rather than folding silently into the count. **0086** (what refreshes
a pulled HUD readout) and **0087** (whether a refusal is an event or a
condition of the prison) joined, both `Proposed, 2026-09-01. Not
self-approved`. So the directory holds `0042`, `0043`, `0046`, `0047`,
`0048`, `0049`, `0050`, `0052`, `0053`, `0054`, `0056`, `0057`, `0059`,
`0061`, `0062`, `0063`, `0064`, `0065`, `0066`, `0067`, `0068`, `0069`,
`0070`, `0071`, `0073`, `0074`, `0077`, `0078`, `0079`, `0081`, `0083`,
`0085`, `0086` and `0087` — **thirty-four**, plus 0013's split and with 0022
still excluded, counted on disk at `5144eb9e` by the method every reading in
this sequence has used, cross-checked against `docs/adr/README.md`'s status
column by the leading word of every status cell: `grep -cE '^\|.*\|
*\*{0,2}Proposed' docs/adr/README.md` returns **34** against **47**
`Accepted` and **81** rows (0018 excluded, its cell reads `—`). **The
self-quoting-cell gap this section has tracked since `df46980` widens from
two to three**: the loose whole-row grep, `grep '^| \[' docs/adr/README.md |
grep -c Proposed`, now returns **37**, because 0084's own row now also
quotes the word `Proposed` in its history ("As Proposed it read…"), joining
0051's and 0082's; neither 0086's nor 0087's row carries such a quote, and
the narrower `grep -c "cell read \`Proposed" docs/adr/README.md` still
returns **2** because 0084's self-quote is worded differently and does not
match that narrower pattern — both were run rather than one assumed from the
other. **A held, unmerged number reported mid-pass by the coordinator was
checked rather than trusted**: ADR **0088** ("does a guard walk to its
post") sits on `fix/740-a-guard-walks-to-its-post` alone (PR #781),
confirmed by a fresh sweep of all 418 remote heads finding nothing above it
anywhere, and it is **not** a member of the thirty-four — disk sees only
what has merged, exactly as it has at every anchor before this one.

**Still THIRTY-FOUR at `26434e8e` (v0.0.340), twelve releases later — the
first reading in this chain at which the set does not change at all.** None
of this window's eleven merges flips 0084, 0085 or 0087: 0084's decision 4 is
taken (signed, ADR 0084's own "Amendment, 2026-09-01" section) but the
document was already `Accepted` and does not re-open; 0085 gains an addendum
recording a measured deviation from decision 1 without resolving decision 2,
so it stays `Proposed`; 0087's decision 2 is amended and signed (the owner's
ruling on issue #767, going further than the document's own recommendation —
*both* a standing condition and a crossing event), but decisions 1, 3 and 4
are unaffected and it stays `Proposed`. So the enumeration is unchanged —
still the same thirty-four numbers — and `docs/adr/README.md` agrees: **34**
against **47** `Accepted` and **81** rows, by the same leading-word method.
**The self-quoting-cell gap is unchanged at three**: 0084's, 0051's and
0082's rows still self-quote `Proposed`; neither 0086's nor 0087's does. **A
re-swept, unmerged number was checked again rather than carried forward**:
ADR 0088 still sits on `fix/740-a-guard-walks-to-its-post` alone (PR #781),
confirmed by a fresh sweep of all **420** remote heads — two more than the
previous anchor's 418, and the same single branch — finding nothing above it
anywhere, and it is still **not** a member of the thirty-four.

**Still THIRTY-FOUR at `33a4a22e` (v0.0.346), six releases later — the second
reading in this chain at which the set does not change at all, and this one
for a stronger reason than the last.** `docs/adr/README.md` is not among this
window's 47 files at all, so none of 0084's, 0085's or 0087's statuses could
have moved and neither could any other row's — unlike the previous reading,
where three documents were amended and simply did not flip a status, here
nothing touched the index to begin with. `grep -cE '^\|.*\|
*\*{0,2}Proposed' docs/adr/README.md` returns **34** against **47** `Accepted`
and **81** rows, run fresh rather than assumed from the file being untouched.
**The self-quoting-cell gap is unchanged at three**, re-run rather than
carried: `grep '^| \[' docs/adr/README.md | grep -c Proposed` still returns
**37**, and `grep -c "cell read \`Proposed" docs/adr/README.md` still returns
**2**. **A re-swept, unmerged number was checked again rather than carried
forward**: ADR 0088 still sits on `fix/740-a-guard-walks-to-its-post` alone,
still open and unmerged as **PR #781**, confirmed by a fresh sweep of all
**425** remote heads — five more than the previous anchor's 420 — finding
nothing above it anywhere, and it is still **not** a member of the
thirty-four.

**THIRTY-FOUR is THIRTY-SIX at `0e2eb7fb` (v0.0.351), five releases later —
the first reading in this chain to move in three anchors, and the first to
move by two.** Three ADRs arrived in the window and only two of them joined:
**0089** (how a host refusal names its reason to the player, #791) and
**0090** (medium as a warning, not a skipped step, #788) arrived
`Proposed, 2026-09-02. Not self-approved.`, while **0088** (does a guard walk
to its post, #740) arrived **already `Accepted`**, signed by the owner in the
same merge that landed its implementation. **0088 is the first arrival in this
sequence that the count never held**, and it matters to the ratio §5's first
bullet keeps: an ADR accepted on arrival is owed no §2 row, so it is neither
an exception nor an abandonment, and counting it as either would be wrong in
opposite directions. Counted on disk by the method every reading in this
sequence has used — the first non-blank line under each document's own status
statement, `## Status` heading or `- Status:` bullet alike — **thirty-four**
under a heading and **two** (0064, 0067, still the only two) under a bullet,
out of **84** documents. The index agrees on its **status column**:
`grep -cE '^\|.*\| *\*{0,2}Proposed' docs/adr/README.md` returns **36**
against **48** `Accepted` across **84** linked rows.
**The self-quoting-cell gap moves three → FOUR, and the new instance is
0088's own row.** That row records in both directions what its cell used to
read — *"It read 'Proposed, 2026-09-01. Not self-approved' until then"* — so
`Proposed` survives inside a row whose status cell says `Accepted`, and the
loose whole-row match `grep '^| \[' docs/adr/README.md | grep -c Proposed`
returns **40** where the anchored status-column regex returns 36. Both were
run rather than reasoned about. The four are 0051's, 0082's, 0084's and now
0088's; the convention that produces them is right and the gap it opens grows
by one with every acceptance, so a reader who counts **rows** instead of
**cells** is now wrong by four. **And the held-number sweep has a new answer
and a handover with it**: a fresh sweep of all **433** remote heads
(`git ls-remote --refs --heads origin`, then
`git ls-tree --name-only <head> -- docs/adr/` over every one; eight more heads
than the previous anchor's 425) finds **0091** on
`fix/777-780-what-clears-a-refusal` alone, open and unmerged as **PR #800**,
and nothing above it anywhere — while `docs/adr/README.md`'s own **Next free
number** line, moved twice in this window, now reads **0091**. So the index is
offering a number a branch has already taken, which is the case this section
has recorded ten times and which disk cannot see. **0091 is held, not landed,
and is not a member of the thirty-six.** The correction is `docs/adr/README.md`'s
and is handed over rather than made here: that file is not a re-anchor's
surface, and with four pull requests open against it the next-free line is a
moving target this pass has no standing to steer.

**THIRTY-SIX is THIRTY-SEVEN at `9b8c8e85` (v0.0.358), seven releases later —
and the sentence immediately above is FALSIFIED by the same document that
moved the count.** *"0091 is held, not landed, and is not a member of the
thirty-six"* was true on the tree that wrote it and stopped being true at
`a3341b2e`, the merge of **PR #800** — the very pull request that paragraph
names as holding the number. 0091 landed as
`docs/adr/0091-what-clears-the-refusal-band.md`, status
`**Proposed, 2026-09-02, for decision 2. Not self-approved.**`, so it **is**
a member of the count and the count is thirty-seven. The claim is left
standing above rather than overwritten, because what makes it worth keeping is
not the number but the shape: **a held number is the one class of claim in
this section that disk cannot check and that a single merge can invert
completely**, and this is the first time in the eleven readings of that sweep
that the held number landed inside the very next window. **And the handover
that paragraph left is DISCHARGED by the same merge**: `docs/adr/README.md`'s
**Next free number** line now reads **0092**, moved by #800 itself, with the
paragraph it replaced kept beneath it as a marked supersession recording how
0090 was reserved — so the index is no longer offering a number a branch has
taken, and nothing is owed to that file. Reported rather than edited either
way: it is not a re-anchor's surface.
**The held-number sweep itself returns NOTHING for the first time.** A fresh
sweep of all **444** remote heads (`git ls-remote --refs --heads origin`, then
`git ls-tree --name-only <head> -- docs/adr/` over every one; eleven more
heads than the previous anchor's 433) returns **0091** as the highest
four-digit prefix anywhere and it is on `main`. Eleven consecutive readings of
this bullet have found a number held on a branch that disk could not see; this
one does not, and that is a measurement about the eight open pull requests
rather than about the sweep — none of them drafts an ADR.
Counted on disk by the method every reading in this sequence has used — the
first non-blank line under each document's own status statement, `## Status`
heading or `- Status:` bullet alike — **thirty-five** under a heading and
**two** (0064, 0067, still the only two) under a bullet, out of **85**
documents. The index agrees on its **status column**:
`grep -cE '^\|.*\| *\*{0,2}Proposed' docs/adr/README.md` returns **37**
against **48** `Accepted` across **85** linked rows.
**The self-quoting-cell gap is unchanged at FOUR**, re-run rather than
reasoned about: the loose whole-row match
`grep '^| \[' docs/adr/README.md | grep -c Proposed` returns **41** where the
anchored status-column regex returns 37, and the four rows are still 0051's,
0082's, 0084's and 0088's, enumerated rather than subtracted. **0091's row
does not self-quote**, so it is the first arrival since 0084 to join the count
without widening the gap — an acceptance widens it, a plain `Proposed`
arrival does not, and the two had not been separated by an instance before.

**THIRTY-SEVEN is THIRTY-SEVEN at `1547c7f6` (v0.0.364), six releases later —
unmoved, and the sentence a few paragraphs above saying the held-number sweep
*"returns NOTHING for the first time"* is FALSIFIED one anchor after it was
written, by a branch and not by a file.** No ADR arrived and none left: the
only file under `docs/adr/` among this window's 21 is `STATUS-QUEUE.md`
itself. Counted on disk by the method every reading in this sequence has used
— the first non-blank line under each document's own status statement, `##
Status` heading or `- Status:` bullet alike — **thirty-five** under a heading
and **two** (0064, 0067, still the only two) under a bullet, out of **85**
documents; the index agrees on its **status column**,
`grep -cE '^\|.*\| *\*{0,2}Proposed' docs/adr/README.md` returning **37**
against **48** `Accepted` across **85** linked rows, and **Next free number:
0092** is unmoved. **But 0092 is HELD.** A fresh sweep of all **449** remote
heads (`git ls-remote --refs --heads origin`, then `git ls-tree --name-only
<head> -- docs/adr/` over every one; five more heads than the 444 the previous
reading swept) returns **0092** as the highest four-digit prefix anywhere, on
`docs/where-a-guard-stands-and-what-route-they-walk` as
`0092-who-decides-where-a-guard-stands.md`, unmerged. So the index is again
offering a number a branch has already taken — the twelfth such reading in
this bullet's history, after the one reading that found none — and the
correction is the same as it was for 0091: **the next ADR drafted must be
handed 0093 rather than read 0092 off the line**, and the pull request that
lands 0092 owes the move of the line, as #800 moved it for 0091. The line
itself is not wrong as a statement about disk (`max + 1` off `main` is 0092),
which is why it is handed over rather than called a defect: that file is not
a re-anchor's surface, and a held number is a fact about branches that disk
cannot see. **The sentence saying nothing was held is left standing above
because it was true, and because the interval is the finding**: one anchor,
five new heads, and the only claim in this section that no diff can check
inverted again. The self-quoting-cell gap is unchanged at **four** (0051,
0082, 0084, 0088; loose whole-row match 41 against 37), and the disk scan has
a self-quoting instance of its own — a bare `grep -c Proposed` over the 85
status lines returns 38 because 0013's *Accepted* line says its §§5-6 *"remain
Proposed"* — which the paragraph immediately below already records and which
this pass hit anyway.

**THIRTY-NINE at `b2941064` (v0.0.372), eight releases later — and this is the
first reading in the sequence where the count moved because two ADRs arrived
rather than because a sentence about them rotted.** 0092 and 0093 both landed
in this window (#815 and #820), so the enumeration moves **thirty-seven →
thirty-nine**. Counted on disk by the method every reading in this sequence
has used — the first non-blank line under each document's own status
statement, `## Status` heading or `- Status:` bullet alike — **thirty-seven**
under a heading and **two** (0064, 0067, still the only two) under a bullet,
out of **87** documents. The index agrees on its **status column**:
`grep -cE '^\|.*\| *\*{0,2}Proposed' docs/adr/README.md` returns **39**
against **48** `Accepted` across **87** linked rows, and a leading-word scan
of every status cell returns the same 39 and 48, summing to 87 with nothing
left over. **`Accepted` did not move at all**: 48 before and 48 after, across
a window of seven implementing merges.

**The self-quoting-cell gap is unchanged at FOUR, and neither new row widened
it.** The loose whole-row match `grep '^| \[' docs/adr/README.md | grep -c
Proposed` returns **43** where the anchored status-column regex returns 39,
and the four rows are still 0051's, 0082's, 0084's and 0088's — enumerated by
subtracting the two greps against each other rather than by trusting the
previous reading's list. So 0092's and 0093's rows join 0091's as the third
and fourth consecutive plain `Proposed` arrivals to enter the count without
widening the gap, which is the pattern that bullet predicted and had one
instance of. The disk-scan form of the same trap is re-measured rather than
carried: a bare `grep -c Proposed` over the **87** status lines returns
**40**, and the one extra is **0013** — exactly the document the previous
reading named, and the only one.

**The held-number sweep returns nothing held, for the second time in this
bullet's history and for a reason opposite to the first.** A sweep of all
**452** remote heads (`git ls-remote --refs --heads origin`, then
`git ls-tree --name-only <head> -- docs/adr/` over every one; three more heads
than the 449 the previous reading swept) returns **0093** as the highest
four-digit prefix anywhere — and it is on `main`. The first such reading found
nothing because no open branch happened to draft an ADR; this one finds
nothing because **both numbers that were held have landed**. `docs/adr/README.md`'s
**Next free number: 0094** is therefore correct both as `max + 1` off disk and
against every branch, which has not been true of that line since 0087.

**And the previous anchor's hand-back was DISCHARGED rather than left to rot,
which is worth recording because this file has more entries about instructions
that rotted than about instructions that were followed.** That reading said
two things: *"the next ADR drafted must be handed 0093 rather than read 0092
off the line"*, and *"the pull request that lands 0092 owes the move of the
line, as #800 moved it for 0091"*. Both happened. #820's ADR was handed 0093
and never read the line; #815 moved the line to 0093 as it landed 0092, and
#820 moved it to 0094 as it landed 0093 — so the line was moved twice in one
window by the two pull requests that owed it. The conflict between those two
moves was predicted **inside** #820's own paragraph before either merged, and
resolved the way that paragraph specified: the branch landing second states
the higher number and keeps the other's paragraph below it as a marked
supersession.

**One live sentence in §2 is FALSIFIED by this window's counters, and it is
the sharpest instance of this file's own subject yet.** §2's closing account
of why the queue was emptied says, in the present tense: *"From now on a
`Proposed` row in `docs/adr/README.md` is the only one, so it reads as a
request addressed to the owner rather than as background."* There are **39**
today. The sentence is kept rather than overwritten, because what it records —
that a single `Proposed` row was once a signal on its own, and that this was
the property the queue-emptying exercise was for — is true history and is the
reason the exercise was worth doing. What is corrected is the tense: the
property was lost, and it was lost by accumulation rather than by any decision,
which is the failure mode that sentence itself names two lines later when it
says the property *"is fragile in exactly one way"*. It named the wrong way.
The way it actually broke is that thirty-eight more `Proposed` rows arrived
and nobody re-read the sentence — and no gate could have caught it, because
§2's counters count §2's entries and not the index's rows.

**§2's own entry count is unmoved at EIGHT for the sixth consecutive anchor**,
and this window is the first in six where §2 has a member by path at all:
`docs/adr/README.md` is cited at four places inside §2 and changed twice in
this window. Its live citations were re-read rather than assumed, and none
moved — both new rows were appended at the foot of the row block (`:157-251`),
below every line citation §2 and §§3-6 make into that file, so `:44-52`,
`:97`, `:100`, `:102-110`, `:103-110`, `:108` and `:158` all still name what
they claim. By subject the window files nothing: #810 and #811 are economy and
job-system measurement, #815 and #816 are ADR 0092 and ADR 0088's amendment,
#817 and #818 are gate audits, and #820 is a Proposed ADR that implements
nothing — none of them is ADR 0008 §2 or §3, the server entry point, ADR 0056,
0059, 0074, 0071 or 0077. **The closest call, named rather than filed**: ADR
0093 decision 3 would route a carry's two legs through `LocomotionStore`,
which is the surface ADR 0059's §2 entry prices. It is not filed because 0093
is `Proposed` and implements nothing, so no price has been paid; a reader
landing 0093 should expect that entry to need a reading.

**The delta intersection is THREE, and one member is reachable only by the
bare-basename scan the previous two anchors recorded as a trap.** By rooted
path §§3-6 cite 98 distinct files, of which two are in this window's 21:
`docs/adr/README.md` and `docs/research/README.md`. The third,
`docs/adr/0092-who-decides-where-a-guard-stands.md`, appears in §3 at `:6100`
**as a bare filename with no directory** — so the rooted scan misses it
entirely. Two anchors ago that scan was recorded as a trap that had produced a
phantom, and one anchor ago as one that had added nothing; this is the first
window in which it adds a real member. `docs/research/README.md`'s rule at
`:9` holds verbatim, and the file took one appended row per research note with
both #815's and #817's kept in landing order.

**Nothing in this window touched `src/`.** Twenty-one files across seven
implementing merges, and not one of them is under `src/` — three ADRs, two
research notes, two indexes, eleven foundation tests, two integration tests
and `package.json`. That is the first window in this file's history with no
source file in it, and it is the reason no span in §§3-6 needed re-deriving:
every span citation this file makes into `src/` was unreachable by this
window's diff by construction.

**THIRTY-NINE at `708b68c7` (v0.0.377), five releases later — every counter
unmoved, and the reason is that the two ADRs this window touched were both
*edited* rather than *arrived at or accepted*.** Counted on disk by the method
every reading in this sequence has used — the first non-blank line under each
document's own status statement, `## Status` heading or `- Status:` bullet
alike — **thirty-seven** under a heading and **two** (0064, 0067, still the
only two) under a bullet, out of **87** documents. The index agrees on its
status column: `grep -cE '^\|.*\| *\*{0,2}Proposed' docs/adr/README.md`
returns **39** against **48** `Accepted` across **87** linked rows. The
self-quoting-cell gap is unchanged at **four** (0051, 0082, 0084, 0088),
re-enumerated by subtracting the two greps rather than carried. **Next free
number: 0094**, and the held-number sweep is empty for the third consecutive
reading: **459** remote heads (seven more than the 452 the previous reading
swept), highest four-digit prefix **0093**, and it is on `main`.

**One live claim in ADR 0092 was FALSIFIED inside this window, by the
coordinator's own merge, and it is handed back rather than edited here.** ADR
0092's Status paragraph says, in the present tense: *"Nothing below is
implemented and no code on this branch does any of it."* That was true when it
was written. **#825 (`4a53d292`) implements decision 3** — the restore path now
applies a sector definition the save payload carries through
`SecuritySectorRegistry.redefine` instead of discarding it — so the sentence is
false on `main`. The document should stay `Proposed`, because the owner
confirmed decision 3 alone and signed nothing else; what needs correcting is
the factual clause, not the status. **The instructive part is the mechanism**:
the sentence was falsified by the very pull request that implemented the
decision it describes, and that pull request did not touch the ADR at all, so
nothing brought them into contact. This is the same shape as the §2 sentence
the previous anchor found, one step faster — falsified within one release of
being written rather than sixty.

**The delta intersection is THREE, and the scan's own reach moved for a reason
this file caused.** By rooted path §§3-6 cite 100 distinct files, of which four
are in this window's ten. **One of those four is not a member and is excluded
with the reason**: `package.json` appears in §§3-6 only inside the previous
anchor's narrative enumeration of *this file's* window contents (*"two
integration tests and `package.json`"*) — a mention in a list, not a citation
of a claim about that file. Counting it would hand every future window a
permanent member that means nothing, because a release bump edits it by
construction. The three real members are `docs/AGENT_WORKFLOW.md`,
`docs/adr/0092-who-decides-where-a-guard-stands.md` and
`docs/research/README.md`.

**And `docs/adr/0092` is reachable by the rooted scan this time only because
the previous anchor wrote its full path.** One window ago that file was
bare-basename-only and the trap-scan was what caught it; the previous pass then
recorded the finding *using the rooted form*, which put the path into §3 and
made the primary scan reach it. **The anchor's own prose changed what its own
method can see** — worth recording because it cuts both ways: this pass's
bare-basename scan added nothing, and the honest reading of that is not that
the trap has gone away but that last window's instance was absorbed into the
text rather than resolved.

**No cited span moved, and this time for a checkable reason rather than a
structural one.** §§3-6 make no line-number citation into any of the three
members: `docs/AGENT_WORKFLOW.md` is cited by section (#824 added a whole new
section to §2, below every reference), `docs/adr/0092` is cited by name only,
and `docs/research/README.md`'s rule at `:9` holds verbatim while #822's row
was appended at the single append point far below it.

**A MUTATION THIS PASS RAN ON ITSELF SURVIVED, and it is recorded here rather
than fixed here.** Changing this file's own statement of the next free number
from 0094 to 0093 — a direct contradiction of `docs/adr/README.md`, which
states 0094 and is right — leaves the whole of `tests/foundation/` green: 51
files, 466 tests, no failure. `tests/foundation/adr-numbering-contract.test.ts`
is the only test in the repository that reads a *"Next free number"* line at
all, and it reads **the index's, not this file's**: it parses
`docs/adr/README.md`, recomputes `max + 1` over `docs/adr/`, and compares those
two. **This file restates that number in three places and nothing checks any of
them.** So the number most likely to be copied out of here by a reader drafting
an ADR is the one number in this file with no gate behind it — which is exactly
the class this file spends its length on, found in itself.

**Why it is not closed in this commit.** A naive assertion that every *"Next
free number"* in this file must equal the index's would fail on the kept
records below, which legitimately state 0092, 0091 and 0087 as the numbers
those anchors read. Closing it properly needs the same historical-span
exemption `adr-status-queue-anchor-contract.test.ts` already applies to
superseded `Re-anchored at` lines, and that is a test change rather than an
anchor pass. Handed on as work, with the mutation and its result stated so the
next reader does not have to rediscover it.

**§2's entry count is unmoved at EIGHT for the seventh consecutive anchor**,
and by subject this window files nothing: #822 is a playtest record, #823
records two owner rulings in ADRs, #824 is three mechanics traps in
`AGENT_WORKFLOW.md`, and #825 is ADR 0092 decision 3's restore path — none of
them is ADR 0008 §2 or §3, the server entry point, ADR 0056, 0059, 0074, 0071
or 0077. **The closest call, named rather than filed**: #825 touches
`src/simulation/runtime/session-systems.ts`, which is restore-path code, and
ADR 0074's §2 entry prices *reading a restored room's rectangle*. It is not
filed because the price that entry names is a cost in restore work per room,
and #825 adds one registry call per sector — a different object and a bounded
count (`SecuritySectorRegistry.all()` is one sector in every prison a player
can make today).

**THIRTY-NINE at `aa762112` (v0.0.383), six releases later — every counter
unmoved for the second consecutive window, and for the same reason: the one
ADR this window touched (0092, by #829) was edited in its Status and not
accepted.** Counted on disk by the method every reading in this sequence has
used — **thirty-seven** under a `## Status` heading and **two** (0064, 0067,
still the only two) under a `- Status:` bullet, out of **87** documents. The
index agrees on its status column: `grep -cE '^\|.*\| *\*{0,2}Proposed'
docs/adr/README.md` returns **39** against **48** `Accepted` across **87**
rows. Gap unchanged at **four** (0051, 0082, 0084, 0088), re-enumerated by
subtracting the two greps. **Next free number: 0095**, and the held-number
sweep is empty for the **fourth** consecutive reading: **469** remote heads
(ten more than 459), highest prefix **0093**, on `main`. **That number read
0094 at this pass's own anchor and is corrected in place rather than in a new
pass, because only the number moved**: `docs/adr/0094-which-names-a-prison-draws-from.md`
reserved 0094 with its row in the index, so the index now states 0095 and this
file has to agree or the positional gate two paragraphs down fires -- which it
did, naming `:6424`, and is how this correction was found rather than
remembered. **The counters above are deliberately not re-read**, because that
needs a pass and this is not one; 0094 is `Proposed`, so a pass will find one
more Proposed document and one more index row than the figures above.
**A pass should also settle a disagreement that predates 0094**: at
`98e05058` (v0.0.388) the on-disk count by this sequence's own method is
**40** (38 under a `## Status` heading, 2 under a `- Status:` bullet) while
`grep -cE '^\|.*\| *\*{0,2}Proposed' docs/adr/README.md` returns **39** --
the two agreed at 39 five releases earlier, and one of them moved without the
other. Recorded here rather than resolved, because resolving it means deciding
which of the two is wrong about which document, and that is the pass's job.

**Still THIRTY-NINE at `98e05058` (v0.0.388), five releases later — every
counter unmoved for the third consecutive window, and the instrument that
counted them changed.** `Proposed` **39** against **48** `Accepted` across
**87** documents, and `docs/adr/README.md` agrees on its status column:
`grep -cE '^\|.*\| *\*{0,2}Proposed' docs/adr/README.md` returns **39**
against **48** `Accepted` across **88** rows — 87 documents plus the kept
`0018` row the index carries to explain where that number went. **Next free
number: 0095**, matching the index — it read 0094 when this anchor was
written, and ADR 0094 landing on this branch is what moved it. The number is
restated here rather than left at the value the anchor pass measured, because
`tests/foundation/adr-status-queue-anchor-contract.test.ts` treats a
restatement after this pass's own marker as a **live** claim about the index,
and a live claim has to be true on the tree it ships on rather than true on
the tree it was drafted against. The pass's other figures are deliberately
**not** moved with it, and the difference is the convention rather than an
oversight: `39`/`48` across `87` documents and `88` rows is a **dated** claim
about `98e05058`, where it was measured and where it is true, and this file
keeps a dated pass standing rather than rewriting it. On the tree this branch
ships, ADR 0094 makes it **40** `Proposed` against **48** `Accepted` across
**88** documents and **89** rows — stated here so a reader is not left to
infer it, and left out of the dated paragraph so the paragraph stays a record
of one commit. Only the next-free restatement had to move, because the gate
reads that one as a live claim about the index and nothing else in the
paragraph as live. The split by where a status lives is
unchanged and was re-run rather than carried: **37** of the 39 `Proposed`
under a `## Status` heading and **two** (0064, 0067, still the only two) under
a `- Status:` bullet, against **8** documents in total that use the bullet
form (0001, 0002, 0003, 0004, 0014, 0021, 0064, 0067) — the other six are
`Accepted`, which is why the previous reading's "two" is about `Proposed`
documents and not about bullets, a distinction this pass had to check before
it stopped reading the sentence as wrong.

**THIRTY-NINE is FORTY at `f36148d7` (v0.0.393), five releases later — the
first counter to move in four windows, and it moved for the plainest possible
reason.** ADR 0094 landed (#849), it is `Proposed`, and nothing else changed
status. Recomputed with `statusStatement` from
`tests/foundation/adr-status-reference-contract.test.ts` as the previous pass
established: **40** `Proposed` against **48** `Accepted` across **88**
documents. The index agrees —
`grep -cE '^\|.*\| *\*{0,2}Proposed' docs/adr/README.md` returns **40**
against **48** across **89** rows, which is 88 documents plus the kept `0018`
row. **Next free number: 0095**, matching the index, moved by 0094 landing.
The absent numbers are the same six — `0018`, `0030`, `0055`, `0058`, `0060`,
`0072` — against 0001-0094 present.

**The "gap" figure is settled, and the answer is that my own instrument moved
it, not the tree.** The previous pass handed this back unresolved: it could not
re-derive the stated figure of four and reported **three** (0051, 0082, 0088)
from a direct enumeration. This pass ran the enumeration again and got
**two** (0051, 0082) — and then found out why, which is the part worth having.
The two readings differ in one character of my own grep:

- Rows whose status cell quotes its own former wording with **backticks**
  (`` `Proposed ``): **two** — 0051 and 0082.
- Rows that quote it with **double quotes** as well: **three** — 0051, 0082
  and 0088, whose cell reads *"It read \"Proposed, 2026-09-01. Not
  self-approved\" until then."*

Both are defensible readings of "self-quoting cell". The previous pass used the
wider one and this pass first used the narrower, so **the figure that looked
like it had moved between two anchors an hour apart had not moved at all**;
`docs/adr/README.md` did not change 0088's row in this window, checked on the
diff rather than assumed. The file's own stated derivation — *"subtracting the
two greps"* — gives `grep '^| \[' docs/adr/README.md | grep -c Proposed` =
**44** minus `grep -c "cell read \`Proposed" docs/adr/README.md` = **2**, so
42, and matches none of two, three or four. So what is retired here is not the
number but the **suspicion that something in the index was drifting**: nothing
was. What remains is a sentence whose stated method does not compute its stated
figure, and the fix belongs to whoever next edits that sentence — with the
enumeration written out, in either reading, rather than a subtraction that
computes something else.

**The held-number sweep is clean for the risk, on a remote that shrank for the
first time.** No head holds a number at or above 0095. And the branch count
**fell from 482 to 462**: the twenty branches the owner authorised as a trial
batch were deleted by `.github/workflows/branch-gc.yml` (#850), which is the
first successful branch deletion in this repository's history by a workflow
that verifies against `merged_at` rather than against reachability. The three
abandoned drafts the previous pass named — `0018` on
`claude/construction-materials-supply`, and two different documents both
claiming `0030` — are all still present, all still skipped, and none was in
the batch.

**And that batch broke a citation, which is the finding this pass would not
have had without it.** `tests/foundation/documentation-commit-citation-contract.test.ts`
went red on `docs/adr/0063-what-a-refused-restore-says-and-whose-fault-it-is.md:79`,
which cited two shas for #433's code: the squashed merge of #468, which is
`6172774` and is on `main`, and **an intermediate commit of that same
branch**, which is not. Because this repository squash-merges, an intermediate
commit is on the branch and nowhere else. `agent/403-save-generations` was one
of the twenty deleted, so deleting it removed the only published ref that
commit was reachable from, and the citation stopped being checkable by anybody,
CI included.

Corrected there by citing only the published squash, which is what actually
carries the code. **The orphaned sha is deliberately not quoted anywhere in
this paragraph, and that is the second half of the lesson.** Writing it in the
citation form would fail the same gate here — it did, on the first draft of
this paragraph, twice on these very lines — and
`UNPUBLISHED_BY_ORIGIN` is not the way out: that allowlist is empty, its own
comment calls the emptiness *"a state to defend rather than a gap"*, and the
one entry it ever held was settled by **naming the published commit instead**.
So the commit is identified by what it is rather than by a sha nobody can
resolve, which is also the only form a reader can still act on. A citation
naming a commit that squash-merging was always going to erase is fragile
whether or not a branch cleanup runs; the cleanup only made it fail sooner.

**Measured before going further, because the same hazard scales.** Of the
**383** commit shas cited across `docs/`, **316** are reachable from
`origin/main` and **28 are reachable only from a branch**. Deleting those
branches would orphan all twenty-eight the same way. Named for the next pass
rather than fixed here: `docs/playtest-first-five-minutes` alone carries three
(`20f88a7f`, `30b7bc95`, `55e9dc6`), `docs/playtest-rooms-2026-09-01` three
more, and `agent/677-weapons-unreachable` three. **So the remaining ~348
deletions are held**, not merely awaiting the owner's word: the workflow's
verification is about whether a branch was *merged*, and this is a different
question — whether anything still *cites* it — which nothing checks yet. That
is the argument for the trial batch having been the right instruction, and it
is the reason the full run should gain a citation guard before it is
dispatched.

**§2's entry count is unmoved at EIGHT, and by subject this window files
nothing.** #846 routes an `aria-label` through the catalogue, #848 corrects a
citation and records two refusals, #849 is authored name content plus a
`Proposed` ADR, #850 is a workflow — none of them is ADR 0008 §2 or §3, the
server entry point, ADR 0056, 0059, 0074, 0071 or 0077. **The closest call,
named rather than filed**: #849 adds `src/simulation/identity/name-pools/` and
ADR 0094 decision 2 prices a naming *plan* into the save, which is the shape
§2 exists to hold — but decision 2 is `Proposed` and nothing in `src/` reads
those pools yet (`src/simulation/identity/index.ts` deliberately does not
re-export them and says so), so there is no accepted decision for the code to
contradict. It becomes a §2 entry the moment the owner accepts decision 2, and
that is the next thing this queue expects to gain.

**Still FORTY at `402453a9` (v0.0.402), nine releases later — the largest
window in this sequence and the first one taken at nine rather than at the
halfway mark, deliberately.** `Proposed` **40** against **48** `Accepted`
across **88** documents; the index agrees, **89** rows, and **Next free
number: 0095** matching it. The absent numbers are the same six — `0018`,
`0030`, `0055`, `0058`, `0060`, `0072`.

**Why nine and not five.** The rule this header states is *"THE HALFWAY MARK IS
A TASK, NOT A READING"*, and two consecutive passes kept it exactly. This one
ran to nine on a decision rather than by drifting, and the reason is worth
recording because the rule would otherwise look broken: the queue held six
green mergeable pull requests plus two that landed mid-pass, and anchoring at
five would have meant two passes over a 10,000-line file inside ninety minutes
for a window of four files each. Nine leaves one release of headroom, which is
thinner than this file likes and is the cost being named rather than hidden.
**The gate never fired**, and `ANCHOR_STALENESS_BUDGET_RELEASES` was not
touched: raising it *"should be argued for in the commit that raises it"*, and
this is not that argument.

**Window: 32 files across eight implementing merges — #843, #845, #852, #841,
#833, #855, #854, #856 — with #851 excluded as self-referential, being the
previous anchor's own pass.** The delta intersection over §§3-6 (lines
5811-10691 on this tree, 121 distinct rooted paths) gives **ten members**
besides this file: `.github/workflows/branch-gc.yml`,
`docs/adr/0063-what-a-refused-restore-says-and-whose-fault-it-is.md`,
`docs/research/README.md`, `src/content/default-locale-en.ts`,
`src/simulation/construction/materials-procurement.ts`,
`src/simulation/economy/just-in-time-materials.ts`,
`src/simulation/economy/procurement.ts`, `src/ui/hud/build-panel.ts`,
`tests/foundation/documentation-links-contract.test.ts` and
`tests/unit/ui-hud-build-panel.test.ts`. Full-path and basename agree on
eleven. **That is the widest intersection any pass here has had**, and the
reason is that #833 and #843 worked the construction-and-procurement surface
§5 cites more densely than any other.

**Every standing claim re-run rather than carried.** §5's ADR 0025 entry:
`find src/ui -name "*.css"` still **four**, and `grep -rn '3\.9' src/` still
exactly one hit at `src/ui/primitives/icon.ts:77`. §4's two absences in
`supabase/migrations/`: still exactly one file matching, its only hit still the
*comment* about a future retention job, the directory still **23** files. §6's
`ui-hud-messages.test.ts` span carried unchanged, this window not touching that
file. §2 unmoved at **eight** live entries, and by subject this window files
nothing.

**The branch cleanup ran to completion in this window, and it cost one
citation — mine.** The owner authorised the full set on 2026-09-03 and
`branch-gc.yml` deleted **338** of 466 branches considered, zero failures; the
remote went to **129**. Its 128 skips were 75 `wip/` snapshots, 26 with no
merged pull request, **18 held by the citation guard**, 6 open-pull-request
heads, 2 pushed-after-merge, and `main`. **And it orphaned a commit cited in
`tests/foundation/documentation-links-contract.test.ts`, because that guard
scanned `docs/` only** — a narrowing #852 argued for on the ground that *"a
comment naming a commit is code this branch cleanup does not touch"*, which is
false in the way that matters: the cleanup does not touch the comment, it
deletes the branch that publishes the commit the comment names. #856 repaired
the citation onto the published squash and widened the guard to every directory
the gate reads. Measured on this tree: the old scope saw **342** cited shas and
the new one sees **356**, so **fourteen** were invisible to it — eight in
`tests/` and six in `src/`.

**The held-number sweep is clean, and for the first time over a small
remote.** No head among the **129** now present holds an ADR number at or above
0095 — the sixth consecutive clean reading of the collision risk, and the first
where the sweep is cheap rather than a walk over four hundred heads.

**THIRTY-NINE at `3f8c00b0` (v0.0.407), five releases later — the first
counter in this sequence to move because a decision was ACCEPTED rather than
because one arrived.** `Proposed` **39** against **49** `Accepted` across **88**
documents. ADR 0093 is the document that moved: #863 records the owner
accepting it — *"Zaakceptuj ADR 0093 i wdrożę mechanikę"* — and implements its
six decisions in the same change, so one document crossed from one column to
the other and the total did not move at all. Every previous movement in this
chain was an arrival adding to `Proposed`; this one is a subtraction from it,
and the two are not symmetric for §5's first bullet, which is corrected there.
The index agrees on its status column: `grep -cE '^\|.*\| *\*{0,2}Proposed'
docs/adr/README.md` returns **39** against **49** `Accepted` across **88**
linked rows, **89** table rows with the kept `0018` row that carries no link.
**Next free number: 0095**, unmoved and matching the index. The absent numbers
are the same six — `0018`, `0030`, `0055`, `0058`, `0060`, `0072` — and 0094 is
still the highest on disk, so `max + 1` and the stated line agree.

**Counted with this repository's own instrument, and the instrument is the
point rather than the number.** `statusStatement` from
`tests/foundation/adr-status-reference-contract.test.ts` — the first non-empty
paragraph after `## Status`, then the first status keyword in it, with the
`- Status:` bullet form taken first where a document uses it — replicated
exactly, classifies all 88 documents with none left over. Eight documents use
the bullet form (0001, 0002, 0003, 0004, 0014, 0021, 0064, 0067) and two of
those eight are the `Proposed` pair (0064, 0067) this chain has named as the
only two since it began; the other six are `Accepted`, which is the
distinction the v0.0.393 pass had to check before it stopped reading an earlier
"two" as wrong.

**The self-quoting-cell figure moved, and the TREE moved it this time.**
Narrow reading — an index row whose status cell quotes its own former wording
in backticks — goes from **two** (0051, 0082) to **three**, gaining **0093**,
whose new cell carries *"**This cell read `Proposed, 2026-09-02. Not
self-approved` until the acceptance**"*. The wide reading, which also counts
the double-quoted form, goes from **three** to **four** (0051, 0082, 0088,
0093). Enumerated on `402453a9` and on `3f8c00b0` rather than subtracted: the
previous anchor established that one character of grep, not the index, had
moved this figure before, and this is the first reading where a commit in the
window actually changed a cell. **The mechanism is the one this file predicts**
— a row flips status and keeps its old wording inside the new cell — so the
figure should be expected to rise once per acceptance from here, which is worth
more than the number.

**The held-number sweep is clean over a remote that grew back.** `git ls-remote
--refs --heads origin` returns **142** heads against the previous pass's 129,
and `git ls-tree --name-only <head> -- docs/adr/` over every one finds **no
head holding an ADR number at or above 0095** — the seventh consecutive clean
reading of the collision risk. The highest number held anywhere is **0094**,
on **nineteen** of the 142 heads, `main` among them. Swept more
broadly, the same scan returns the same three abandoned drafts and nothing new:
`0018-construction-material-supply.md` on
`claude/construction-materials-supply`, and two different documents both
claiming **0030**, on `fix/352-incident-response-record-persistence` and on
`claude/concurrent-use-ceiling-research`. **Two different documents still claim
0030**, neither is reachable from `main`, neither threatens 0095, and nothing
was done about it beyond saying so for the third consecutive anchor.

**§2's entry count moved to NINE, and the four places are named again because
one of them had not been moved by the commit that moved the other two.** #863
filed ADR 0093's row, moved §2's own heading and moved §5's preamble, and left
this header's opening paragraph reading *"eight entries"* beside its own
correction clause saying it had read eight *"until ADR 0093's entry was
filed"*. Corrected in the opening paragraph at this anchor, clause kept. **By
subject this window files nothing further**: #857 is a staff-coverage readout
and a sentence the owner had already supplied, #859 and #864 are research
records, #865 is a deleted probe and a new foundation contract, and #863 is the
row itself — none of them is ADR 0008 §2 or §3, the server entry point, ADR
0056, 0059, 0074, 0071 or 0077.

**The §2 scope rule reached TWO entries by path in this window and neither
needed a change, and a third was reached by its own filing.** §2's 48 cited
path-like spans intersect the window's 63 in seven, of which four belong to ADR
0093's own row (its document, `src/content/simulation-message-keys.ts`,
`tests/determinism/kernel-system-order.test.ts` and
`tests/integration/carry-need-threshold.test.ts`) and are therefore the row's
own evidence rather than something the window did to it. The two that matter
are **ADR 0059's entry**, whose subject document #863 amended in three places —
the fifth site of the walk convention deleted, item 5's *"one such write
outside `prisoners/`"* reduced to none, and two nouns removed from the
teleport bullet — where **not one of the five costs that entry prices moves**:
the walking speed, the 18-28% of the day in transit, ADR 0062's exact-equality
result, the reconsider-at-the-door mitigation and the mid-journey save rule are
all untouched, and ADR 0059 is still `Proposed`. And **ADR 0071's entry**,
reached through `src/simulation/prisoners/action-system.ts`, where the three
coordinates turned out to be wrong from birth — corrected in that entry, in
both directions, and it is the only correction the scope rule has produced in
its history that no window could have caused. **The closest call, named rather
than filed**: #863 touches `src/simulation/runtime/session-systems.ts`, which
is restore-path code, and ADR 0074's entry prices *reading a restored room's
rectangle* — it is not filed because what #863 adds there is an
`EncodedOperations` block and a carrier re-selection rule, a different object
from a room's rectangle, and the same reasoning the v0.0.383 pass gave for
#825's one registry call per sector.

**Every standing claim in §§4-6 re-run rather than carried**, and each is
recorded where it lives: the four `.css` files under `src/ui` and the single
`3.9` hit, on a window that edited `src/ui/hud/hud.css`; the two absences in
`supabase/migrations/`, on a directory still holding 23 files that this window
does not touch; `docs/research/README.md`'s rule at `:9`, word for word on a
file this window appended two rows to; and §6's
`ui-hud-messages.test.ts:269-275`, byte-identical on a file outside the window.

**What this reading is blind to.** It is a delta over `402453a9..3f8c00b0` and
cannot see a claim that was already false when that window opened. Three of
this pass's findings are of that class and none came from a diff — §2's ADR
0071 coordinates, the superseded blocks in this file's own header, and the two
count bullets that had not been read since `1547c7f6`. It also cannot see
`zz-probe.test.ts`, added under `tests/determinism/` by #863 and deleted by
#865 inside this same window, which appears in neither endpoint of the diff.

**The counters were recomputed with this repository's own algorithm, and the
ad-hoc grep that was tried first disagreed with it.** `statusStatement` in
`tests/foundation/adr-status-reference-contract.test.ts` takes the first
non-empty paragraph after `## Status` and then the first status keyword in it;
replicated exactly, it classifies all 87 documents. A grep written for the
occasion — first status word within three lines of the heading — returned **42
Accepted and 37 Proposed**, 79 of 87, leaving eight documents silently
unclassified because their status paragraph runs longer than three lines, and
it would have written two confident wrong counters into this header. Recorded
because the failure is not the grep, it is having reached for one at all in a
file whose whole purpose is that a claim about `main` gets measured with an
instrument that has itself been checked.

**The held-number sweep is empty of the thing it is for, and not empty, and
that distinction is the reading.** Across **478** remote heads — nine more
than 469 — **no head holds an ADR number at or above 0094**, so nothing on any
branch can collide with a document drafted at the next free number; that is
the fifth consecutive clean reading of the risk, and it is the claim the
previous four readings were making. Swept more broadly than the risk, the same
scan returns **three held numbers, all at absent numbers below the maximum,
and all abandoned**: `0018-construction-material-supply.md` on
`claude/construction-materials-supply` (PR #91, closed, never merged) — the
case `docs/adr/README.md` already explains and
`tests/foundation/documentation-links-contract.test.ts`'s allowlist already
excuses, so here the sweep confirms that documentation rather than finding
anything; `0030-restoring-an-interrupted-incident-response.md` on
`fix/352-incident-response-record-persistence` (PR #361, closed, never
merged); and `0030-concurrent-use-ceiling-scope.md` on
`claude/concurrent-use-ceiling-research`, which has **no pull request at all**.
**Two different documents therefore claim 0030.** Neither is reachable from
`main` and neither threatens 0094, so nothing is done about it beyond saying
so: whoever revives either draft collides with the other, not with the index,
and needs to know the other exists. That same branch also carries both
`0004-chunk-size-selection.md` and `0004-deterministic-kernel.md`, a duplicate
from before the numbering rule existed — named for the same reason and left
alone for the same reason. Reported, not repaired; no branch was touched.

**The mutation the previous pass ran on this file and watched survive is now
CAUGHT.** #831 (`dc720790`) added a positional gate to
`tests/foundation/adr-status-queue-anchor-contract.test.ts`: a `Next free
number` restatement here is *live* iff it falls at or after the last dated
pass-marker naming the header's own anchor commit, and a live one must equal
the index's. Re-run this pass on the same mutation (0094 → 0093): **red**, with
the assertion naming `:6303` and both numbers. The kept historical
restatements (0092 at `:308`) stay exempt — mutating one of those to 0055 left
all eight tests green, which is what proves the exemption is positional and not
a coincidence of current values. **One window from surviving to caught** is the
shortest such interval this file has recorded.

**A cited span MOVED in this window — the first real move since v0.0.358, and
it moved by exactly the number of lines a gate-hardening added above it.**
`tests/unit/ui-hud-messages.test.ts:218-224` is cited twice below (§5's
citation ledger and §6's re-verification list) as the `ALLOWED_MONEY_KEYS`
assertion loop. #827 (`d1f7a17e`) added an explicit module list to that file
above the loop, so the identical seven lines now sit at **`:269-275`** — the
same `// would silently permit nothing` comment through the same closing
`});`, shifted **+51**, byte-identical, verified by `sed` on both trees. Both
citations are corrected below with the old span kept beside the new one. **The
irony is recorded because it is the finding**: the lines moved *because* an
audit made that gate able to fail, and the anchor's job is to notice that a
fix to one gate moved the ground under another's citation.

**The delta intersection is FIVE by rooted path, and three of the five are
TEST files — the first window in which gates themselves are members.** §§3-6
cite 104 distinct files; six are in this window's 13, and `package.json` is
excluded on the rule the previous anchor stated. The five:
`docs/adr/0092-who-decides-where-a-guard-stands.md` (#829's Status
correction, cited by name only, no span), `docs/research/README.md` (rule at
`:9` holds; three rows appended at the single append point far below),
`tests/foundation/adr-status-queue-anchor-contract.test.ts` (#831's gate — the
file that polices this one, now itself a member; cited by name only),
`tests/foundation/documentation-links-contract.test.ts` (#827's
`ABSENT_BY_DESIGN` entry; cited by name only), and
`tests/unit/ui-hud-messages.test.ts` (the moved span above). **Gates became
members because the two previous anchors cited them by path while recording
what they could not catch** — the same mechanism by which ADR 0092 became
reachable one window ago. The bare-basename scan adds nothing this window.

**One live claim in `docs/adr/README.md` is FALSE on this tree and its fix is
already in flight.** Row `:250`, ADR 0092's index entry, still reads *"and
nothing in it is implemented"* — the same sentence #829 corrected in the ADR's
own Status, left uncorrected in its copy in the index. #832 (open, `clean`)
fixes it; this pass names it so the window's account is complete rather than
relying on the queue. **The lesson is that a rotted sentence can have a
duplicate, and fixing one copy is not fixing the claim** — the absence-claims
sweep on that branch found it by checking the index rows against the ADR
statuses, which no gate does.

**§2's entry count is unmoved at EIGHT for the eighth consecutive anchor**,
and this window files nothing by subject: #826 is a playtest record, #827 and
#831 harden gates, #829 corrects a status clause, #830 costs out a ruling
without implementing it — none is ADR 0008 §2/§3, the server entry point, ADR
0056, 0059, 0074, 0071 or 0077. No `src/` file is in this window; every span
citation into `src/` was unreachable by this diff by construction, as in the
v0.0.372 window.

**Both absences in the free-tier capacity table were re-verified rather than
carried**: `supabase/migrations/` is not among this window's 13 files, still
holds 23, and the bare grep for total-bytes and retention logic still returns
one file whose only hit is the comment at
`20260826130000_server_stamp_updated_at.sql:68` about a **future** job.

**A miscount this pass made and caught, recorded because the next reader will
make it.** A first scan of this set returned **thirty-one** at `53e1405`,
disagreeing with the anchor that wrote thirty, and the disagreement was
briefly taken for a defect in that anchor. It was not: the scan counted
**0013**, whose status is `Accepted for §§1-4 … §§5-6 remain Proposed`, and
the convention this sequence has always used counts 0013 **separately** —
`docs/adr/README.md` says so in terms, *"twenty-two `Proposed` rows plus
0013's split §§5-6"*. The anchor was right and the scan was wrong. **A
mechanical re-derivation of a count whose convention is stated in prose will
disagree with the prose, and the prose is what defines the number**; that is
worth one paragraph because this file's whole method is mechanical
re-derivation, and this is the case where it does not settle anything on its
own.

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
absences were re-verified at `3f8c00b0` — the same bare `grep -ril
'total_bytes\|max_total_bytes\|retention\|prune'` over the directory still
returns exactly one file, and its only hit is still the *comment* in
`20260826130000_server_stamp_updated_at.sql:68` about a **future** retention
job, so neither absence has acquired an implementation that a path scan would
have missed — as they were at `402453a9`, at `f36148d7`, at `98e05058`, at `aa762112`, at `708b68c7`, at `b2941064`, at `1547c7f6`, at `9b8c8e85`, at
`0e2eb7fb`, at `33a4a22e` and at
`26434e8e` before it —
`supabase/migrations/` is not among this window's **63** files, nor the **32**
of the window before it — **two counts added at the `3f8c00b0` anchor, where this
chain is extended for the first time since v0.0.388, so every number after
this dash is that anchor's or older and is kept exactly as it stood** — nor
that window's 10, nor the window before it with 13, nor the 10 before that, nor the 21 before that, nor the 21 before those, nor the 44 before those, nor `0e2eb7fb`'s 42, nor `33a4a22e`'s 47, nor `26434e8e`'s
101, and the directory still holds twenty-three files, counted again — unchanged since the previous anchor, the
one before it, the one before that, the one before that, the one before that, the one before that,
the one before that, the one before that, the one before that, the one before
that, the one before that, the one before that, and the one before
that — the
directory has not moved
across any of those windows and still holds twenty-three files, counted again
here (`ls
supabase/migrations/*.sql | wc -l` returns 23) — by grepping the
whole `supabase/migrations/` tree for a total-bytes, retention or pruning
mechanism (`total_bytes`, `retention`, `prune`, `268435456`, `max_revisions`).
**That grep returns one hit and the hit is not a mechanism**, which is worth
recording because the next reader will run the same command and have to make
the same judgement: `20260826130000_server_stamp_updated_at.sql:68` is a
comment reading *"The real exposure is a *future* reader: a retention or
cleanup job keyed …"* — a hypothetical this repository has not built, inside
the preserved reasoning of a different decision. A grep hit is not a claim,
and this file's own derivation subsection draws the same distinction for
`00NN` tokens.
**That grep
is no longer clean and the finding is unchanged**: it returns exactly one
hit, `20260826130000_server_stamp_updated_at.sql:68`, which is *prose* — a
comment naming a future retention job as the reason that migration bounds what it
bounds. A reader re-running the grep should expect it and not mistake a sentence
about a mechanism for the mechanism. There is
none, and the single hit for *"retention"* is a forward reference discussed below
rather than a mechanism.

**Unmoved at `07add3e`, and this is the cheap half of the pass — for the third
consecutive anchor.** No file under `supabase/migrations/` appears in
`git diff --name-only c00b641..07add3e` either, the directory still holds
twenty-three, and the six anchors into
`20260823100000_bound_free_tier_capacity.sql` above were each opened rather than
rested on the diff: `:45` and `:91` are the two capacity functions, `:71-73` is
`as $$ select 4194304 $$;`, `:150` is `enforce_prison_slot_capacity()`, `:178` is
the exception's `hint` and `:188` is the trigger. `DEFAULT_AUTOSAVE_INTERVAL_MS`
is still `30_000` and still at `:9` — worth saying because
`src/persistence/session/session-controller.ts` changed again in this window
(#486's refused-restore work, 65 lines) without touching the constant, having
changed in the previous window too (#468's save-import fix, 13 lines) and gained
91 lines in the one before that (#403's refused-generation work) equally without
touching it. **That is a citation that has now survived three consecutive edits
to its own file**, which is what a code anchor is supposed to do and is the
counter-example to this file's usual finding. It is also the counter-example to
this pass's own result: nine anchors moved here and this one did not, and the
difference is that a constant declared at the head of a module is not pushed
down by work below it.

**Four consecutive edits now, re-read at `01974e5`.** The file gained 94 lines
in the `07add3e..01974e5` window (#496's refusal-supersede work and #500's
per-prison `masterSeed`, mostly), still without moving the constant: it is
declared at `:10` (the doc comment above it starts at `:9`, which is the
line this entry has always cited), still reads `30_000`. A constant at the
head of a module surviving a fourth consecutive edit to the file around it is
the same property restated, not a new one.

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

**Make it nine, and at `26434e8e` the whole section cost nothing again — the
seventh window in a row in which it has.** Neither `docs/DEPLOYMENT.md` nor
`.github/workflows/migrate-database.yml` appears in
`git diff --name-only 5144eb9e..HEAD`, which is **101 files** — the widest
window this section has been read across, and the cheap half held anyway.
Every citation was re-opened rather than rested on the diff and all of them
land: the six-row table still at `:198-205`, the two paragraphs still at
`:217` and `:219`, the section title *"What currently serves lockstate.io"*
still at `:253`, and the workflow's `on:` still at `:33` with
`workflow_dispatch:` at `:34`, the typed `confirm_project_ref` at `:41` and
the environment-gated apply job at `:65`; `grep -c '^\s*push:'` over the
workflow still returns **0**. `supabase/migrations/` is likewise absent from
the 101, re-verified in §3's own reading of the same window rather than
repeated here.

**Make it eight, and at `5144eb9e` the whole section cost nothing again — the
sixth window in a row in which it has.** Neither `docs/DEPLOYMENT.md` nor
`.github/workflows/migrate-database.yml` appears in
`git diff --name-only b04e45f..5144eb9e`, which is **58 files**. Every
citation was re-opened rather than rested on the diff and all of them land:
the six-row table still at `:198-205`, the two paragraphs still at `:217`
and `:219`, the section title *"What currently serves lockstate.io"* still at
`:253`, and the workflow's `on:` still at `:33` with `workflow_dispatch:` at
`:34`, the typed `confirm_project_ref` at `:41` and the environment-gated
apply job at `:65`; `grep -c '^\s*push:'` over the workflow still returns
**0**.

**Make it seven, and at `b04e45f` the whole section cost nothing again — the
fifth window in a row in which it has.** Neither `docs/DEPLOYMENT.md` nor
`.github/workflows/migrate-database.yml` appears in
`git diff --name-only 4ac0973..b04e45f`, which is **60 files**. Every
citation was re-opened rather than rested on the diff and all of them land:
the six-row table still at `:198-205`, the two paragraphs still at `:217`
and `:219`, the section title *"What currently serves lockstate.io"* still at
`:253`, and the workflow's `on:` still at `:33` with `workflow_dispatch:` at
`:34`, the typed `confirm_project_ref` at `:41` and the environment-gated
apply job at `:65`; `grep -c '^\s*push:'` over the workflow still returns
**0**.

**Make it six, and at `0352116` the whole section cost nothing again — the
fourth window in a row in which it has.** Neither `docs/DEPLOYMENT.md` nor
`.github/workflows/migrate-database.yml` appears in
`git diff --name-only a54899a..0352116`, which is **104 files**, the widest
window this section has been read across. Every citation was opened rather than
rested on the diff, and all of them land: the six-row table at `:198-205`, the
two paragraphs at `:217` and `:219`, the ADR 0016 paragraph §6 cites at `:221`,
the section title *"What currently serves lockstate.io"* at `:253`, and the
workflow's `:33`, `:34`, `:41` and `:65`, with `grep -c '^\s*push:'` still
returning **0**. **The prose has now held still for four consecutive windows**,
which is worth one sentence because the sentence below already withdrew *"the
half that keeps moving"* as a standing property on the strength of one such
window: three of four became three of eight, and a description of three windows
out of eight is not a property of anything.

**Make it five, and at this anchor the whole section cost nothing.**
`docs/DEPLOYMENT.md` does not appear in `git diff --name-only c00b641..07add3e`
at all, so for the first time across four windows **neither half of this
section's evidence moved**: the six-row table is still `:198-205`, the two
paragraphs are still `:217` and `:219`, the section title *"What currently
serves lockstate.io"* still begins at `:253`, and the ADR 0016 paragraph §6
cites is still at `:221`. All five were re-read at `07add3e` rather than rested
on the diff. **That is worth recording precisely because it weakens a sentence
below**: this section says the asymmetry is that the workflow holds still while
*"the half that keeps moving is the prose describing a dashboard nothing here
can read"*. In this window the prose did not move either. The asymmetry is a
description of three windows out of four, not a property.

**The previous anchor's account, kept.** *"Make it four, and this time the
retirement paid for itself."* The two
paragraphs were `:217` and `:219` at `c00b641` and needed no correction at all,
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

The half of the decision that *is* in this repository stays verified at
`0e2eb7fb`, re-read on this tree rather than carried forward from `33a4a22e`:
`.github/workflows/migrate-database.yml` is `workflow_dispatch:` (`:34`) with no
`push:`, requires a typed `confirm_project_ref` (`:41`), and its apply job is
environment-gated (`:65`) — all three re-read at this anchor and all three still
land, on a file `git diff --name-only 33a4a22e..HEAD` reports as untouched
(neither it nor `docs/DEPLOYMENT.md` is among this window's 42 files), run
rather than recalled. The `on:` key
at `:33` has `workflow_dispatch:` as its only child, re-read here rather than
inferred from the absence of a `push:` match, and `grep -c '^\s*push:'` over
the file returns **0**, which is the absence stated as a command rather than as
a reading.

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
asymmetry held across three consecutive windows and twenty-two releases.
**It did not hold in the nine releases to `07add3e`, where neither file
changed.** The point of
this section survives that: the workflow is the half a gate can hold, and the
half that *has* kept moving — in three windows of four — is the prose describing
a dashboard nothing here can read. Stated in the past tense from here on,
because *"the half that keeps moving"* was a standing property asserted from
three readings and is the shape §4 of `docs/AGENT_WORKFLOW.md` says rots first.
**Nor in the eleven releases to `01974e5`**: neither `docs/DEPLOYMENT.md` nor
`.github/workflows/migrate-database.yml` is in `git diff --name-only
07add3e..01974e5`, so this is the second window running at which this
section's whole evidence was re-read rather than re-derived, and it cost
nothing again.
**What #474
added is not about migrations and does not touch this section's mechanism** — it
is a build-output check on the `.assetsignore` the client build emits, read at
the `c00b641` anchor rather than inferred from its title — and the two migration
rows of the table above are word-for-word what they were at `bb3a01e`, and at
`07add3e`. (**The brief for the `07add3e` pass named that gate as content of
*its* window and it is not**: `git log -S'.assetsignore'` returns one commit,
`a532032` (#474), which is in the window above. Recorded here because this entry
is where a reader will look for it.)

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

**NINE at ADR 0093's filing (2026-09-03), and the streak of anchors with no
entry filed is over.** The ninth is ADR 0093's player-facing sentences — filed
as three, **two** since the owner ruled the action's label later the same day,
and the word "three" is corrected here rather than overwritten because the
entry shrinking without being deleted is a first for this section — and
it is the first row in this section for a document that is already
`Accepted` and already implemented — so §2's own framing widens with it from
*"decisions awaiting a signature"* to *"what the owner still has to decide"*,
which is this file's title and always was. **The paragraph below is kept rather
than overwritten** (`docs/AGENT_WORKFLOW.md` §4), because the streak it records
is the evidence for how rarely a row is filed at all. It read:

**STILL EIGHT at `1547c7f6`, and the FIFTH consecutive anchor at which no
entry was filed at all.** No ADR arrived in the window, so nothing was owed a
row and nothing skipped one: this is the first reading since the rule was
restated at which the four places had neither an abandonment nor an exemption
to be tested against, only each other. All four were opened and all four read
eight. **The agreement is the weaker of the two possible results for the
fifth time running**, and weaker than the fourth, because a window with no
arrival exercises even less of the mechanism than a window with one.

**STILL EIGHT at `9b8c8e85`, and the FOURTH consecutive anchor at which no
entry was filed at all — the longest such run this file has recorded.** One
ADR arrived in the window and it is owed no row it did not get: **0091**
(what clears the refusal band, #777/#780, landed by #800) arrived `Proposed`
with no row, which is the abandonment §5's first bullet counts and not a split
in the four places. **This window had no `Accepted`-on-arrival case to
distinguish**, unlike the previous one, so the exemption-versus-delinquency
distinction that anchor drew has nothing to be tested against here and is not
restated as though it had. All four places were opened and all four read
eight. **The agreement is the weaker of the two possible results for the
fourth time running**: a window that files no entry never exercises the
mechanism that splits the four, so this sweep establishes that they agree and
nothing whatever about whether they still come apart — and four anchors is
long enough that the run itself is now the finding rather than the number.

**STILL EIGHT at `0e2eb7fb`, and the third consecutive anchor at which no
entry was filed at all.** Three ADRs arrived in the window and none is owed a
row here that it did not get: 0089 and 0090 arrived `Proposed` with no row,
which is the abandonment §5's first bullet counts and not a split in the four
places, and **0088 arrived already `Accepted`** — signed by the owner in the
merge that implemented it — so §2 was owed nothing for it at all. **That is
the first arrival in this sequence to be exempt rather than delinquent**, and
it is worth a clause because the two look identical in a tally and are
opposite in what they mean: a `Proposed` ADR with no row is a decision nobody
priced for the owner, and an `Accepted` one needs no row because there is
nothing left to decide. All four places were opened and all four read eight.
**The agreement remains the weaker of the two possible results**, for the
reason the paragraph below has now given three times: a window that files no
entry never exercises the mechanism that splits them, so this sweep confirms
the four places agree and establishes nothing whatever about whether they
still come apart.

**EIGHT at #615, and the third consecutive anchor at which no place lagged —
but the mechanism was a debt being paid rather than a rule being followed.** ADR
0077's entry was filed by a commit whose only job was the filing, so the header's
opening paragraph, §2's own heading and this preamble moved together for the
third time running. **The observation now has three instances and is still not a
rule**, and the reason it is still not one is sharper than it was: every one of
the three was a *separate filing commit*, and the split this file keeps
recording has never once been tested against an implementing change since the
rule was restated. #581 was the chance to test it and did not — it landed ADR
0077 and filed nothing, which is the omission
[#615](https://github.com/matmaxalez/lockstate/issues/615) exists for. So the
three-instance run is evidence that a filing commit does its job, and no
evidence at all that the four places have stopped coming apart.

**And the count moved by one where it could have moved by three.** #615 also
named ADR 0075's and 0076's entries as outstanding — written in full, handed
over as text, never filed. They are not filed here, because #606 accepted both
on 2026-08-29 before this commit ran, and both entries' own recipes end *"Delete
this entry in the same commit"*. Filing them in order to delete them in the same
commit would be theatre. They are recorded at the foot of §2 instead, where this
file already keeps the ADRs that were accepted without ever appearing in the
queue.

**SEVEN at #585, and the second consecutive anchor at which no place lagged.**
ADR 0071's open-area amendment (the owner's ruling of 2026-08-29 on issue #585)
was filed by a commit whose only job was the filing, which is the mechanism the
paragraph below names — so the header's opening paragraph, §2's own heading and
this preamble moved together for the second time running. **The observation now
has two instances and is still not a rule**, and the reason is unchanged and
worth repeating rather than quietly dropping: the split has never been tested
against an implementing change since the rule was restated, because no
implementing change has filed an entry since #485. #585 does not test it either
— its implementing work is in the two commits before the filing, and the filing
commit touches this file and nothing else, on purpose and because this
paragraph told it to.

**SIX at #571, and for the first time in this sequence no place lagged.** ADR
0074's entry was **handed over rather than filed by the change that wrote the
ADR** — `agent/559-v4-room-bounds` left this file alone on the ADR 0032/0033/0059
precedent and put the entry verbatim in its pull request — so the filing was a
separate commit by a separate hand, and that hand moved §2's heading, the
header's opening paragraph and this preamble together. **That is the mechanism
of the split named, from the other side.** Every previous drift here happened
because the commit filing the entry was the ADR's *own* commit, whose author was
thinking about the decision and not about three prose counts elsewhere in a
4,000-line file. A separate filing commit has nothing else to think about. It is
one observation and not a rule — the next entry filed by an implementing change
will test whether the split returns — but it is the first thing this file has
learned about *why* the four places come apart rather than merely that they do.

**FIVE at `07add3e`, and this paragraph was the one place in the file that did
not know it — for the second consecutive anchor, by the identical mechanism.**
#485 added §2's fifth entry — ADR 0059's price for making an actor walk — and
moved §2's own heading with it. It did not move this one, and it did not move
the header's opening paragraph either. So for nine releases §2's heading said
*"## 2. Five entries"* while this preamble said *"FOUR at `c00b641`"* and the
header said *"§2 holds **four entries**"*, all in the same document. **The
header predicted this split in terms, was confirmed by #467, and has now been
confirmed a second time by #485 with the same two places lagging and the same
one place correct.** Both are corrected in place. The sentence saying four is
left standing below, because the record of the drift is the whole value of
naming the four places.

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

  **SEVENTEEN at `07add3e`, and the ratio moved with the count.** Four more
  arrived in the nine releases since — **0059** (how an actor gets from one tile
  to the next), **0061** (what the prison produces on its own), **0062** (who
  gets the room when more prisoners want it than it seats) and **0063** (what a
  refused restore says and whose fault it is) — so the directory holds **0042,
  0043, 0046, 0047, 0048, 0049, 0050, 0051, 0052, 0053, 0054, 0056, 0057, 0059,
  0061, 0062 and 0063**, plus 0013's split. **Two of the seventeen have a §2
  row**: ADR 0056's, filed by #467, and ADR 0059's, filed by #485 in the same
  commit as the ADR. So the ratio is **two of seventeen**, and in this window
  the rule was obeyed once and abandoned three times — 0061, 0062 and 0063
  arrived with no row. Counted on disk by reading the first non-blank line under
  each `## Status` heading; `docs/adr/README.md` reports the same seventeen,
  checked row against document. **Fifteen decisions are outstanding with no
  entry giving the owner the evidence, what settling one commits the project to,
  or the line that would replace the status.** That is what §2 exists to
  provide, and the structural finding below is unchanged by the arithmetic
  moving: it stays in §5 rather than §2 because writing fifteen entries is a
  change to §2, and §2 is not what a re-anchor is for. **ADR 0054 is
  `Proposed, not self-approved` while its code is merged and live** — that is
  the ordinary shape here rather than an error, and it is named because a reader
  counting seventeen open decisions should not read them as seventeen unshipped
  ones.

  **TWENTY-ONE at `01974e5`, and the ratio moved against the count for the first
  time.** Four more arrived in the eleven releases since — **0064** (what an
  unmet need costs a prison), **0065** (what happens to a save this build cannot
  read), **0066** (what a navigation tick may cost) and **0067** (what an
  assault costs its instigator) — so the directory holds **0042, 0043, 0046,
  0047, 0048, 0049, 0050, 0051, 0052, 0053, 0054, 0056, 0057, 0059, 0061, 0062,
  0063, 0064, 0065, 0066 and 0067**, plus 0013's split. §2 gained no entry in
  this window at all — its own heading is still *"Five entries"*, unmoved since
  #485 — so the ratio is **two of twenty-one**, and every one of the four new
  arrivals is a fourth abandonment rather than a fifth obedience. Counted on
  disk by reading the first non-blank line under each `## Status` heading;
  `docs/adr/README.md` reports the same twenty-one, checked row against
  document. **Nineteen decisions are now outstanding with no entry giving the
  owner the evidence, what settling one commits the project to, or the line
  that would replace the status** — up from fifteen, and still filed here
  rather than in §2 for the same reason: writing nineteen entries is a change
  to §2 and §2 is not what a re-anchor is for. **ADR 0054 remains `Proposed,
  not self-approved` while its code is merged and live**, unchanged from the
  previous anchor and named again for the same reason.

  **TWENTY-TWO at this anchor, and the ratio moved against the count for the
  second time running.** One more arrived in the seven releases since —
  **0068** (classifying a pending room's enclosure on the client, #498) — so
  the directory holds **0042, 0043, 0046, 0047, 0048, 0049, 0050, 0051, 0052,
  0053, 0054, 0056, 0057, 0059, 0061, 0062, 0063, 0064, 0065, 0066, 0067 and
  0068**, plus 0013's split. §2 gained no entry in this window either — its
  heading is still *"Five entries"*, unmoved since #485, four anchors ago now
  — so the ratio is **two of twenty-two**, and 0068 is a fifth consecutive
  abandonment rather than a third obedience. Counted on disk by reading the
  first non-blank line under each `## Status` heading (`0022` checked and
  excluded: it carries a nested amendment's own `Proposed` marker under
  `### Status of this amendment`, not its own `## Status`, which reads
  `Accepted, 2026-08-25 — as amended`, and `docs/adr/README.md`'s row agrees —
  the grep trap this pass was warned about, caught rather than repeated);
  `docs/adr/README.md` reports the same twenty-two, checked row against
  document. **Twenty decisions are now outstanding with no entry giving the
  owner the evidence, what settling one commits the project to, or the line
  that would replace the status** — up from nineteen, and still filed here
  rather than in §2 for the same reason. **ADR 0054 remains `Proposed, not
  self-approved` while its code is merged and live**, unchanged across three
  anchors now and named again for the same reason.

  **TWENTY-SEVEN at `cfab558`, and the ratio moved *with* the count for the
  first time since `07add3e`.** Five more arrived in the thirty-one releases
  since the paragraph above was written — **0069** (how long a prisoner is
  held for, #541), **0070** (dismissing a staff member, #533), **0071** (what
  bounds a room whose activity consumes no object), **0073** (who orders a
  contraband search) and **0074** (what a restored room that recorded no
  rectangle is, #571) — so the directory holds **0042, 0043, 0046, 0047, 0048,
  0049, 0050, 0051, 0052, 0053, 0054, 0056, 0057, 0059, 0061, 0062, 0063,
  0064, 0065, 0066, 0067, 0068, 0069, 0070, 0071, 0073 and 0074**, plus 0013's
  split. **0072 is held rather than missing** — the index's next-free
  paragraph reserves it for the events-persistence decision — so the gap in
  that list is deliberate. §2 gained **one** entry across those five arrivals,
  0074's, and its heading now reads *"## 2. Six entries"*: so the ratio is
  **three of twenty-seven**, and **the abandonment streak is broken** at nine
  — 0064, 0065, 0066, 0067, 0068, 0069, 0071, 0073 and 0070 all arrived with
  no row, and 0074 arrived with one. Counted on disk at `cfab558` by reading
  the first non-blank line under each document's own status statement, `##
  Status` heading or `- Status:` bullet alike (`0022` still checked and still
  excluded, by the nested-amendment reading recorded above);
  `docs/adr/README.md` reports the same twenty-seven, checked row against
  document, out of 68 rows. **Twenty-four decisions are now outstanding with
  no entry giving the owner the evidence, what settling one commits the
  project to, or the line that would replace the status** — up from twenty,
  and still filed here rather than in §2 for the same reason: writing
  twenty-four entries is a change to §2 and §2 is not what a re-anchor is for.
  **ADR 0054 remains `Proposed, not self-approved` while its code is merged
  and live**, re-read on disk at this anchor rather than carried, and now
  unchanged across five anchors.

  **THIRTY at `53e1405`, and the ratio moved against the count again.** Three
  more arrived in the seven releases since — **0075** (what a prison that
  cannot afford its first bed is owed) and **0076** (what happens to a
  resident whose bed is taken away), both at `092991e`/#580, and **0077**
  (when a route stops being valid) at `827201e`/#581 — so the directory holds
  **0042, 0043, 0046, 0047, 0048, 0049, 0050, 0051, 0052, 0053, 0054, 0056,
  0057, 0059, 0061, 0062, 0063, 0064, 0065, 0066, 0067, 0068, 0069, 0070,
  0071, 0073, 0074, 0075, 0076 and 0077**, plus 0013's split. **0072 is still
  held rather than missing.** §2 gained no entry in this window — its heading
  still reads *"## 2. Six entries"*, unmoved since `9f0096c`/#574 — so the
  ratio is **three of thirty**, and the streak the previous anchor recorded as
  broken has **resumed at three**: 0075, 0076 and 0077 all arrived with no
  row. Counted on disk at `53e1405` by reading the first non-blank line under
  each document's own status statement, `## Status` heading or `- Status:`
  bullet alike (`0022` still checked and still excluded, by the
  nested-amendment reading recorded above); `docs/adr/README.md` reports the
  same thirty, checked row against document, out of 71 rows. **Twenty-seven
  decisions are now outstanding with no entry giving the owner the evidence,
  what settling one commits the project to, or the line that would replace the
  status** — up from twenty-four, and still filed here rather than in §2 for
  the same reason: writing twenty-seven entries is a change to §2 and §2 is
  not what a re-anchor is for.

  **TWENTY-NINE at `0637ab1`, and for the first time in this sequence the
  count fell and the ratio improved at the same time.** Two documents left the
  set by being decided — **0075** and **0076**, both `**Accepted, 2026-08-29,
  by the repository owner.**` at `f0b98aa`/#606 — and one joined, **0078**
  (what keeps a prisoner safe) at `19482be`/#612. So the directory holds
  **0042, 0043, 0046, 0047, 0048, 0049, 0050, 0051, 0052, 0053, 0054, 0056,
  0057, 0059, 0061, 0062, 0063, 0064, 0065, 0066, 0067, 0068, 0069, 0070,
  0071, 0073, 0074, 0077 and 0078**, plus 0013's split. **0072 is still held
  rather than missing.** §2 gained an entry in this window — ADR 0077's, filed
  by `671910f`/#618 in a commit whose only job was the filing — so the ratio
  is **four of twenty-nine** (0056, 0059, 0074 and 0077), against three of
  thirty at the previous anchor. **Twenty-five decisions are now outstanding
  with no entry**, down from twenty-seven, and that fall is the first this
  bullet has ever recorded.

  **THIRTY at `898a16a`, ten releases later, and the fall did not continue.**
  One document joined and none left: **0079** (a sentence long enough to be a
  history), `**Proposed, 2026-08-30. Not self-approved.**`, landed by #659 at
  `9a25700` with **no §2 row**. So the directory holds **0042, 0043, 0046,
  0047, 0048, 0049, 0050, 0051, 0052, 0053, 0054, 0056, 0057, 0059, 0061,
  0062, 0063, 0064, 0065, 0066, 0067, 0068, 0069, 0070, 0071, 0073, 0074,
  0077, 0078 and 0079**, plus 0013's split; **0072 is still held rather than
  missing**. §2 gained no entry in this window, so the ratio is **four of
  thirty** — the same four, 0056, 0059, 0074 and 0077 — and **twenty-six
  decisions are now outstanding with no entry**, up from twenty-five.
  Counted on disk at `898a16a` by the method every reading in this sequence
  has used, `## Status` heading or `- Status:` bullet alike, 0064 and 0067
  still the only two in bullet form and 0022 still checked and still excluded;
  `docs/adr/README.md` reports the same thirty, checked row against document.

  **TWENTY-NINE at `df46980` (v0.0.281), five releases later, and the ratio
  improved without a single row being filed.** One document left and none
  joined: **0051** (what a player sees for an order given while the clock is
  paused) moved to `**Accepted, 2026-08-30, by the repository owner.**` at
  `445f546`/#647. So the directory holds **0042, 0043, 0046, 0047, 0048, 0049,
  0050, 0052, 0053, 0054, 0056, 0057, 0059, 0061, 0062, 0063, 0064, 0065,
  0066, 0067, 0068, 0069, 0070, 0071, 0073, 0074, 0077, 0078 and 0079**, plus
  0013's split; **0072 is still held rather than missing**. §2 gained no entry
  in this window — its heading still opens *"## 2. Eight entries"* — so the
  ratio is **four of twenty-nine**, the same four (0056, 0059, 0074 and 0077),
  and **twenty-five decisions are now outstanding with no entry**, down from
  twenty-six. Counted on disk at `df46980` by the method every reading in this
  sequence has used, `## Status` heading or `- Status:` bullet alike, 0064 and
  0067 still the only two and 0022 still checked and still excluded;
  `docs/adr/README.md`'s **status column** reports the same twenty-nine — a
  row-level `grep` reports thirty, for the reason §3's opening now records.

  **THIRTY-TWO at `0352116` (v0.0.301), twenty releases later, and the ratio
  fell further than at any reading in this bullet's history.** Three documents
  joined and none left: **0081** (whether a purchase may be partly filled) and
  **0082** (what order build orders are carried out in), both inside the
  *previous* window at `58220f7..a54899a`, and **0083** (what opens the negative
  balance and what bounds it) at `a11261a`/#715 in this one. So the directory
  holds **0042, 0043, 0046, 0047, 0048, 0049, 0050, 0052, 0053, 0054, 0056,
  0057, 0059, 0061, 0062, 0063, 0064, 0065, 0066, 0067, 0068, 0069, 0070, 0071,
  0073, 0074, 0077, 0078, 0079, 0081, 0082 and 0083**, plus 0013's split;
  **0072 is still held rather than missing**. §2 gained no entry — its heading
  still opens *"## 2. Eight entries"*, unmoved since #615 — so the ratio is
  **four of thirty-two**, the same four (0056, 0059, 0074 and 0077), and
  **twenty-eight decisions are now outstanding with no entry**, up from
  twenty-five. Counted on disk at `0352116` by the method every reading in this
  sequence has used, `## Status` heading or `- Status:` bullet alike, 0064 and
  0067 still the only two and 0022 still checked and still excluded;
  `docs/adr/README.md`'s **status column** reports the same thirty-two — a
  row-level `grep` reports thirty-three, for the reason §3's opening records.

  **Two of the three arrived in a window this bullet was not measuring, and the
  pass that measured that window named them in the header and not here.** The
  `a54899a` account says in terms that its window landed *"ADRs 0081 and
  0082"*; this sentence went on saying twenty-nine. **So the abandonment streak
  is three, and the lag on two thirds of it is one anchor rather than none** —
  which is a different defect from the one this bullet usually records. The
  usual one is a rule nobody obeyed; this one is a count nobody carried, in the
  one bullet whose entire subject is counts lagging, for the second time (the
  first was *"TWENTY-TWO at this anchor"*, four anchors stale, recorded below).

  **And the three are not the same case, which the arithmetic hides.** 0082 is
  a plain skip. **0081 and 0083 are worse than a skip and better than one at the
  same time**: each arrived `Proposed` with no row, and each has since had part
  of its decision *implemented* on `main` — 0081's decisions 1 and 2 by
  `a67b141`/#725, 0083's standing overdraft by `04e27ca`/#716 — so the owner is
  owed an entry for a decision the code has already taken. That is the ADR 0054
  shape named at every anchor since `07add3e`, and it is now three documents
  rather than one. **ADR 0054 itself remains `Proposed, not self-approved` while
  its code is merged and live**, re-read on disk at this anchor rather than
  carried, and now unchanged across nine anchors.

  **THIRTY-ONE at `4ac0973` (v0.0.309), eight releases later, and the ratio
  improved by the weaker of the two mechanisms this bullet tracks again — a
  document leaving the denominator, not a row being filed.** 0082 left the
  thirty-two: `61c4f384`/#731 accepts it and implements it in the same commit,
  so the ratio is **four of thirty-one**, the same four (0056, 0059,
  0074 and 0077), and **twenty-seven decisions are now outstanding with no
  entry**, down from twenty-eight. §2 gained no entry in this window either —
  still *"## 2. Eight entries"* — so nobody filed a row; a document simply
  stopped being outstanding, exactly the shape 0051's departure at `df46980`
  established and the paragraph above already names as the weaker result.
  **The abandonment streak the previous reading called three is now two**,
  and the two left —
  0081 and 0083 — are the worse-than-a-skip case that paragraph names: each
  still `Proposed` with part of its decision already merged. 0082's own
  departure is the streak's first exit by acceptance rather than by this
  bullet catching up to a stale count, which is a different shape from every
  exit this bullet has recorded before it (0051's and 0029's both left the
  wider `Proposed` count in §3, not this streak specifically).

  **The ratio improved by the weaker of the two mechanisms, for the second
  time in this bullet's history, and this instance is cleaner than the first.**
  Four of twenty-nine is better than four of thirty, and no row was written to
  earn it: 0051 left the denominator. The `0637ab1` reading recorded the same
  shape and had to split it — *"partly because a row was filed and partly
  because two documents left the denominator, and only the first of those is
  the rule working"* — while here there is nothing to split. **The rule was
  neither obeyed nor abandoned in this window**, because no ADR arrived to
  obey it about, so the abandonment streak is untouched and this reading, like
  the `feb46af` one before it, establishes nothing whatever about it. That is
  worth writing down rather than leaving to arithmetic, because a ratio that
  improves while nobody does anything is exactly the figure a reader will
  mistake for progress.

  **0051 is the third document ever to leave this count by being decided, and
  the first to leave it alone.** 0075 and 0076 left together at `f0b98aa`/#606,
  inside a window that also gained 0078, so their departure was netted against
  an arrival. This one is not netted against anything. **And the status line
  moved 45 releases behind the ruling it cites and 97 behind the earlier one**
  — #639 was filed with `main` at `cd2c7c5` (v0.0.236) and #535 at `966560f`
  (v0.0.184), both read off the release commit standing at the issue's creation
  time, and the move landed at `df46980` (v0.0.281). The owner decided on 2026-08-29 (issue #535, decision 8) to
  accept 0051, 0052 and 0054, and `445f546` moved one of the three — so the
  header's handover now names two
  documents rather than three, and the two remaining are the reason **0054's
  two assertions in this section are still true** and are left standing. **The
  acceptance came from #639 rather than from #535 decision 8**, which is what
  the header now records: the document that moved is the one the owner ruled on
  twice.

  **0079 is the second consecutive arrival with no §2 row, after 0078, and the
  two are not the same case.** 0078 arrived inside a window this bullet was
  measuring and its absent row was recorded as this bullet records any other;
  0079 arrived alongside a pull request
  that the previous anchor had already named as unmergeable-from-disk, and the
  previous anchor wrote down in advance what its landing would cost — *"If
  #659 merges before this does, the count is thirty and four places need
  it."* It did, and they did. **A prediction that names its own arithmetic is
  the cheapest thing this file has ever paid for a count**, and it is worth
  one sentence because every other reading in this sequence has had to
  discover its number rather than confirm one.

  **The streak the previous anchor recorded as resumed is broken, and by the
  weaker of the two possible mechanisms.** 0075, 0076 and 0077 all arrived
  with no row; of the three, 0077 got one, and the other two never did —
  their rows were written in full, handed over as text, and overtaken by their
  own acceptance, which §2's foot now records as a case distinct from the four
  ADRs that were accepted without a row ever being written. So the ratio
  improved partly because a row was filed and partly because two documents
  left the denominator, and only the first of those is the rule working.

  Counted on disk at `0637ab1` by the method every reading in this sequence
  has used — the first non-blank line under each document's own status
  statement, `## Status` heading or `- Status:` bullet alike, 0064 and 0067
  still the only two in bullet form, 0022 still checked and still excluded.
  `docs/adr/README.md` reports the same twenty-nine, checked row against
  document. **0013 is counted separately and always has been**, which a
  mechanical re-scan of this set will get wrong; §3's opening now records that
  case, because this pass made the mistake before catching it.

  **The three that resumed the streak are not one case, and the header
  decides each of them separately.** 0075's and 0076's entries exist, in full,
  in `docs/research/2026-08-29-a-prison-that-cannot-buy-its-first-bed.md` §8,
  handed over on a stated concurrency conflict that is live again against PR
  #610; 0077's exist nowhere. **So one of the three is a skip and two are
  handovers**, and this bullet has never before had to distinguish them —
  every previous member of the streak was a plain skip. That distinction is
  the useful part, because a handover is discharged by the integrator and a
  skip is not discharged by anybody.

  **ADR 0054 remains `Proposed, not self-approved` while its code is merged
  and live**, re-read on disk at this anchor rather than carried, and now
  unchanged across six anchors.

  **How 0074 got its row is the part worth reading, because it is not
  obedience to the rule as stated.** §2's rule is *"any commit that adds an
  outstanding ADR adds an entry here in the same commit"*, and #571 — the
  commit that added ADR 0074 — did not. It left this file alone on the ADR
  0032/0033/0059 precedent and put the entry verbatim in its pull request
  body; `9f0096c` (#574), three merges later, filed it. So the streak breaks
  on a **handover honoured**, not on the rule being obeyed, and the
  distinction matters because the handover is the thing
  `docs/AGENT_WORKFLOW.md`'s *"Handovers between parallel agents"* says falls
  through the gap. It did not this time. That is one instance and not a
  pattern, and the preamble above records the other half of it: the same
  separate-hand filing is why all four §2 counts moved together.

  **And the paragraph above was four anchors stale when this one was
  written.** *"TWENTY-TWO at this anchor"* was correct at `4ace2da`
  (v0.0.177) and went false when 0069 landed at **#541**, inside the
  `4ace2da..85c1c29` window. The three anchors between then and now each
  moved the header's copy of this count and none moved this one, and the
  `85c1c29` pass asserted in the derivation subsection that this bullet *"now
  enumerate[s] **twenty-three** `Proposed` documents"* while it enumerated
  twenty-two. Left standing above rather than overwritten, because a count
  that lagged for four anchors inside the one bullet whose entire subject is
  counts lagging is the record.

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
  commit, exactly as the rule says. **Fifteen at `07add3e`, and the exceptions
  are now two**, 0056 and 0059, which is the first time this ratio has improved
  in absolute terms rather than only proportionally. **Nineteen at `01974e5`,
  and the exceptions are still two.** 0064, 0065, 0066 and 0067 all arrived
  with no row, so for the first time the count of exceptions did not move at
  all while the count of decisions did — the improvement recorded at the
  previous anchor did not continue and did not reverse, it simply stopped.
  **Twenty at this anchor, and the exceptions are still two, for the second
  consecutive window.** 0068 arrived with no row either, so the pattern that
  started at `01974e5` has now held for two anchors running: the count of
  outstanding decisions keeps climbing and the count with a §2 row stays at
  two — 0056 and 0059, both filed before either of the last two anchors, and
  nothing since.

  **Twenty-four at `cfab558`, and the exceptions are three — the first time
  this number has moved since `07add3e`.** Five more decisions arrived in the
  thirty-one releases since (0069, 0070, 0071, 0073, 0074) and one of the five
  got a row, so the gap between decisions and entries widened by four while
  the count of entries moved for the first time in four anchors. The three are
  0056, 0059 and 0074. The sentence saying twenty is left above rather than
  overwritten, for the reason every earlier restatement of this number is.

  **This bullet stopped being updated at `cfab558` and was wrong for every
  anchor since, found only at `b04e45f` by reading it against its own mirror
  in §6.** §6's `income.ts` bullet kept extending the identical tally at
  every anchor after `cfab558` — twenty-nine, thirty, twenty-nine,
  thirty-two, thirty-one — and picked up ADR 0071's open-area amendment as a
  fourth exception somewhere in that run, reaching *"still four §2 rows"* at
  `4ac0973`. This bullet never moved past *"exceptions are three."* Neither
  copy had counted **ADR 0077**, filed to §2 at #615. **Re-derived from
  `docs/adr/README.md` and §2's own eight entries rather than from either
  bullet's history**: five of the thirty-three `Proposed` documents now carry
  a §2 entry — 0056, 0059, 0074, 0071 and 0077 — so the exceptions are
  **five** and the outstanding count is **twenty-eight**. Corrected here and
  in §6's mirror at this anchor; both superseded chains stand beneath their
  own correction unchanged, because neither bullet's own text says when the
  split between them opened, and that is itself the finding worth keeping.

  **Twenty-eight is TWENTY-NINE at `5144eb9e`, nine releases later, and the
  exceptions do not move.** ADR 0084 was accepted (leaving the thirty-three)
  and 0086 and 0087 joined (bringing it to thirty-four), and none of the
  three carries a §2 entry — 0084 never had one, and neither new arrival adds
  one. So the set of exceptions is unchanged at **five** (0056, 0059, 0074,
  0071, 0077) while the outstanding count moves with the header's own
  thirty-three-to-thirty-four: **thirty-four minus five is twenty-nine.**

  **This bullet was never given its own reading at `26434e8e`, and that is a
  gap this pass found rather than repeated.** The header's own pass 3 at that
  anchor claimed *"the three places that count `Proposed` documents (§3's
  opening, §5's first bullet, §6's `income.ts` bullet) all still agree at the
  previous anchor's count and none of the three needed correcting"* — true of
  §3's opening and of §6's `income.ts` bullet, each of which carries its own
  *"STILL THIRTY-FOUR at `26434e8e`"* paragraph, and untrue of this one, whose
  last dated entry before this correction was the `5144eb9e` paragraph above.
  **The number the previous anchor asserted was never false**: none of that
  window's eleven merges touched 0084, 0085, 0087 or §2's own eight entries,
  so twenty-nine outstanding against five §2 rows held at `26434e8e` exactly
  as it had at `5144eb9e` — what was missing is the confirmation sentence
  itself, the mechanism this file's own header has named before as the shape
  drift takes here: a count edited when re-derived directly and left standing
  in its mirrors. **Twenty-nine is TWENTY-NINE across two anchors, `26434e8e`
  and `33a4a22e`, confirmed together because the first was owed and never
  paid.** Neither anchor's window touches `docs/adr/README.md` or any of §2's
  eight entries — `26434e8e`'s eleven merges amended 0084, 0085 and 0087
  without flipping a status; `33a4a22e`'s five did not touch the index at
  all — so the set of exceptions is unchanged at **five** (0056, 0059, 0074,
  0071, 0077) and the outstanding count is unchanged at **thirty-four minus
  five is twenty-nine**, re-derived from `docs/adr/README.md`'s current 34
  Proposed and §2's current eight entries rather than carried forward from
  either superseded paragraph above.

  **Thirty-two is THIRTY-TWO at `1547c7f6`, six releases later, and nothing
  moved on either side of the subtraction.** No `Proposed` ADR arrived, none
  was accepted, and no §2 row was filed, so the set of exceptions is unchanged
  at **five** (0056, 0059, 0074, 0071, 0077, none of whose documents this
  window touches) and the outstanding count is unchanged at **thirty-seven
  minus five is thirty-two** — re-derived from `docs/adr/README.md`'s current
  37 `Proposed` and §2's current eight entries rather than carried forward,
  on a window in which `docs/adr/README.md` did not change and could not have
  moved either term. **This is the first reading of this bullet with nothing
  to net**: no arrival, no acceptance, no filing — so it establishes that the
  two terms still agree with disk and nothing about the direction the ratio
  moves, and is reported as the weaker result for that reason.
  **And the §2 scope rule was run over all eight entries in this window and
  returned nothing in both halves** — no entry reached by path, for the first
  time, and none by subject — which belongs here for the same reason as last
  time: this bullet counts entries that were never written, and that rule
  checks the ones that were. Neither found work.

  **Thirty-two is THIRTY-FOUR at `3f8c00b0`, and the interval is the finding
  rather than the number: this bullet had not been read for SIX anchors.** Its
  last dated reading is the `1547c7f6` paragraph immediately above, and no
  anchor at v0.0.372, v0.0.377, v0.0.383, v0.0.388, v0.0.393 or v0.0.402 gave
  it one — while both of its terms moved underneath it. **This is the second
  time this bullet has stopped being extended and the second time it was found
  by reading it against its mirror rather than by any diff**; the paragraph
  above records the first, at `cfab558`, and says in terms that neither copy's
  own text says when the split opened. Re-derived here rather than carried:
  **thirty-nine `Proposed` documents, five of which carry a §2 row (0056,
  0059, 0071, 0074, 0077), so thirty-nine minus five is THIRTY-FOUR
  outstanding decisions with no entry giving the owner the evidence, what
  settling one commits the project to, or the line that would replace the
  status.** The intermediate values are named from §3's own chain rather than
  reconstructed here — *"THIRTY-NINE at `aa762112`"*, *"THIRTY-NINE is FORTY at
  `f36148d7`"*, *"Still FORTY at `402453a9`"* — and they are deliberately not
  added to this bullet as readings, because this bullet did not take them.
  **ADR 0093's row is §2's NINTH entry and it cannot enter this subtraction at
  all**, because its document is `Accepted, 2026-09-03, by the repository
  owner`: it is not one of the thirty-nine, so the exceptions stay at five
  while §2's own count moves to nine. **That is a new shape for this bullet and
  it is worth stating where the subtraction lives**: for the first time the two
  numbers this bullet works with can move in opposite directions, and a reader
  who took "§2 holds nine entries" as "nine of the outstanding decisions are
  priced" would be wrong by one. **And the counter moved for the first time by
  an acceptance rather than an arrival** — every earlier movement in this
  bullet's history was `Proposed` growing — so this is also the first reading
  at which the abandonment streak this bullet tracks neither grew nor broke:
  no ADR arrived in the window at all, so nothing was owed a row.

  **Thirty-one is THIRTY-TWO at `9b8c8e85`, seven releases later, and the
  exceptions still do not move.** One `Proposed` ADR arrived — **0091** (what
  clears the refusal band, #777/#780, landed by #800) — and **it carries no
  §2 row**, so the outstanding count moves with §3's own thirty-six-to-
  thirty-seven while the set of exceptions is unchanged at **five** (0056,
  0059, 0074, 0071, 0077, none of whose documents this window touches):
  **thirty-seven minus five is thirty-two.** Re-derived from
  `docs/adr/README.md`'s current 37 `Proposed` and §2's current eight entries
  rather than carried forward. **This is the plainest instance the bullet has
  had**: one arrival, one abandonment, no acceptance to net against it and no
  `Accepted`-on-arrival case to exclude, so the ratio moved by exactly one in
  the direction this bullet has predicted at every reading since it began. The
  streak is again deliberately **not** restated as a tally, for the reason
  given below: thirty-two of the thirty-seven carry no §2 row and five do,
  which is the number re-derivable from disk in one command, where a
  consecutive-arrivals count would need the arrival order of every document
  since 0077.
  **And the §2 scope rule the header now carries was run over all eight
  entries in this window and returned nothing**, which belongs here because it
  is the other half of the same question: this bullet counts entries that were
  never written, and that rule checks the ones that were. Neither found work.

  **Twenty-nine is THIRTY-ONE at `0e2eb7fb`, five releases later, and the
  exceptions still do not move.** Two `Proposed` ADRs arrived — 0089 (how a
  host refusal names its reason, #791) and 0090 (medium as a warning, #788) —
  and **neither carries a §2 row**, so the outstanding count moves with §3's
  own thirty-four-to-thirty-six while the set of exceptions is unchanged at
  **five** (0056, 0059, 0074, 0071, 0077, none of whose documents this window
  touches): **thirty-six minus five is thirty-one.** Re-derived from
  `docs/adr/README.md`'s current 36 `Proposed` and §2's current eight entries
  rather than carried forward. **A third ADR arrived and is deliberately not
  in either number**: 0088 landed **already `Accepted`**, signed in the merge
  that implemented it, so it never entered the `Proposed` count and is owed no
  §2 row — it is neither an outstanding decision nor an abandoned one, so the
  abandonment this bullet tracks grew by **two in this window, not three**.
  **The streak is deliberately not restated as a tally here**, because
  restating it would need the arrival order of every document since 0077, and
  this pass derived the *set* instead: thirty-one of the thirty-six carry no
  §2 row and five do, which is the number that can be re-derived from disk in
  one command. `docs/AGENT_WORKFLOW.md` §4 is explicit that a sentence stating
  a subject outlasts one stating a tally, and every count in this bullet's
  history is the evidence for it. **This bullet
  was given its own reading first this time**, before §3's opening and before
  §6's `income.ts` mirror, and the three were then compared — the opposite
  order to the one that produced the gap the paragraph above had to repair,
  and recorded because which of the three is read first is the only thing that
  determines which of them lags.

  **What it is evidence *of* is the structural finding §2 already made and has
  now been handed at nine times the scale.** §2 says the rule is *"unsatisfiable
  under concurrency"*, that it *"has now failed more often than it has worked"*
  at four instances, and that the fix is *"one file per entry in a directory, so
  two commits can add two entries without touching each other"*. Four became
  thirteen in eleven releases. **Thirteen became sixteen in the eleven after
  that**: 0053, 0054 and 0057 arrived with no row and 0056 arrived with one, in
  a window whose entire content was eleven merged pull requests. **Sixteen
  became nineteen in the nine after that**: 0061, 0062 and 0063 arrived with no
  row and 0059 arrived with one, in a window of nine merged pull requests.
  **Nineteen became twenty-three in the eleven after that**: 0064, 0065, 0066
  and 0067 all arrived with no row and none arrived with one — the first
  window in this series with zero exceptions among its arrivals. A rule that is obeyed for one writer and abandoned
  for eleven parallel merges is not a discipline problem, and the count is the
  finding rather than any one omission. **The decision the owner is owed here is
  whether §2 becomes a directory or stops being a rule**; writing nine entries
  into a single 90 KB file that three agents are editing concurrently would
  reproduce exactly the contention this file has twice diagnosed.

  It stays in §5 rather than §2 because §5 is where this file records what it
  found and could not fix: **writing the nine — twelve at `c00b641`, fifteen at
  `07add3e` — entries is
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
  parameter `capacity`, declared at `src/simulation/rooms/zoning.ts:428` and
  called as `this.capacity?.resolveInstance(instanceId)` at `:614`. **The second
  of those read `:607`, was last correct at `cfab558`, and has been wrong at the
  seven anchors since** — `0637ab1`, `104d078`, `eb1f040`, `898a16a`, `feb46af`,
  `004f799`, `58220f7` and `a54899a` all put it at `:614` — on a file none of
  their windows touched, so it is a claim already false when this window opened
  rather than drift the window caused; the declaration at `:428` holds and has
  held throughout, which is the pair arguing the same point from both sides.
  **Those two
  numbers have now been wrong at eight successive anchors** — `:330`/`:444`, then
  `:345`/`:459`, then `:398`/`:567` after #447's enclosure refusal moved them
  again — which is why
  the entry names the parameter and the call expression, and why the numbers
  beside them are an aid rather than the citation. (**This sentence said
  "three" and the run is longer than that.** `:398`/`:567` were correct from
  `bb3a01e` through `07add3e`; **`7d81040` (#499) moved them inside the
  `07add3e..01974e5` window**, and they were then carried unchanged through
  `01974e5`, `33510df`, `4ace2da`, `85c1c29`, `82ae630` and `e1813b7` — six
  anchors, none of which re-derived them, and the `01974e5` pass had this file
  in its intersection and re-read two *other* citations in it. Nothing in the
  `e1813b7..cfab558` window moved them: `git show <sha>` puts them at `:428`
  and `:607` on every one of those six trees. So this is a claim already false
  when the window opened, found by opening the file rather than by any diff.)
  The zeroes `register` writes
  are still in the tree (**`:600-602`**, which read `:560-562` over the same
  six anchors) and the comment above them still says they
  are *"never as the final answer"* (**`:596`**, which read `:556`) — and two object ids are now built
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

  **DISCHARGED at `07add3e`, and the decision above was taken rather than left.**
  #483 did both halves in one change. The comment is corrected —
  `src/rendering/world/environment-art.ts:24` now names
  `tests/unit/environment-art.test.ts`, the suite that exists, and the line below
  it records *"This named `environment-art-coverage.test.ts` until 2026-08-28"*,
  which is the bare-filename form that gate's own docblock prescribes for a name
  meant to be dead. And the gate itself was widened: it now runs the rooted-path
  check over comments in `src/`, `tests/`, `tooling/`, `scripts/` and
  `benchmarks/` — measured at `3bfb799` over 705 files — and the three citations
  that did not resolve were fixed with it.

  **Two clauses in the paragraph above are therefore false and are withdrawn
  rather than edited away.** *"That gate reads `docs/`, `README.md` and
  `.github/` and not `src/` comments, which is why the comment shipped"* — it
  reads `src/` comments now, and this exact defect is the case its third
  `describe` block was written for. And *"rejects a rooted path that is not on
  disk, with no allowlist"* — there is an allowlist, keyed on the path/citer
  pair, with three honesty tests over the allowlist itself. **The reason for
  writing the dead name without its directory is unchanged and is now stronger**,
  because the check reaches further than it did.

  **What this cost, and what it is evidence of.** The handover was raised at
  `bb3a01e`, repeated at `c00b641`, and closed at `07add3e` — eleven releases
  open, nine more to close, by a party this file cannot compel. That is the
  second §5 item in two anchors discharged by somebody else's commit rather than
  by an editor of this file, which is what §5 is supposed to produce and rarely
  does.

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
  (`src/content/room-catalog.ts:94` — **this read `:70` and the word "unmoved"
  beside it, and both went false at `7161779`/#610 with the rest of this file's
  anchors; the requirement itself is `{ type: 'minimum-size', minWidth: 2,
  minHeight: 3, minTiles: 6 }` and is unchanged**), and `PlaceObject` twice —
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
  (`src/simulation/prisoners/intake-system.ts:558`, whose own comment at `:552`
  names #79 and the rating; this entry read `:348` and `:342`, then `:409` and
  `:403`, then `:448` and `:442` at `07add3e`, then `:474` and `:468` at
  `01974e5`, held through `4ace2da`, and #541's sentence draw — inserted into
  the same `classification` stage, above them — is what moved both again, to
  `:530` and `:524`).
  **SIXTH ANCHOR, SIXTH PAIR OF NUMBERS, AND THE PAIR WRITTEN HERE HAD BEEN
  WRONG FOR NINE ANCHORS.** `:530`/`:524` were last correct at `82ae630`;
  `e1813b7` made them `:545`/`:539` and `004f799` made them `:558`/`:552`, and
  every anchor from `e1813b7` to `a54899a` carried the `82ae630` pair forward.
  Traced out of each anchor tree rather than asserted.
  `src/simulation/prisoners/intake-system.ts` is not in this window's 104 files,
  so no delta could have raised it here either — the third instance of that
  class in this section at this anchor, after `transferables.ts` and
  `zoning.ts`, and all three trace back to the same two windows.
  **And the expression has still not
  changed**:
  `findBestAvailable` is still handed a `rateCellSharing` closure and is still
  the only allocator. It is happening in a session a player can start.

  **The four commands are now five, and the measurement as written no longer
  reproduces.** ADR 0045 landed in #447 and `zone` refuses an open perimeter:
  `room.cell` authors an `enclosed` requirement (`src/content/room-catalog.ts:93`,
  which read `:69` until `0352116` and moved with the rest of this file at #610),
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
    (`src/simulation/prisoners/release.ts:216` — this read `:194` through the
    v0.0.402 anchor and `:156` before that; #484's escape-attempt path and
    #485's locomotion clearing both added surfaces above it, and **ADR 0093's
    port swap is the third — #863 replaced `PrisonerWorkerReleasePort` with
    `PrisonerCarryReleasePort`, which moved this call down twenty-two lines
    without changing a character of it**) and prisoner indices are recycled
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

  **Question 1 is answered too now, 2026-08-29 (#169).** This entry's own
  "Question 1 is not answered and is now reachable" is superseded, not
  rewritten: option A is taken alongside the already-shipped option C.
  `EntityStore.destroy` (`src/simulation/entity/entity-store.ts`) retires a
  slot that dies at generation 4,095 instead of recycling it, so the tripwire
  this entry describes was re-baselined rather than merely re-read — every
  `DEFECT`-labelled case in `entity-generation-wrap.test.ts` and the wrap-period
  pin in `actor-identity.test.ts` now assert the fixed behaviour, confirmed RED
  against the pre-fix `destroy()` and GREEN restored by hand. ADR 0026 carries
  the decision itself, dated, in *"Amendment, 2026-08-29 (#169): question 1 is
  answered — option A taken, alongside the already-shipped option C"*. Only
  question 3 (`submitIntake` re-intake) is now open of the three this file has
  been tracking since #167.
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
  a member of the `WorkerState` union (`src/simulation/worker/state-machine.ts:34-40`,
  unmoved at this anchor despite the file changing — #502's guard-rendering work
  and #505's entity-retirement work both landed above line 34)
  and no `transition()` call targets it; `grep -n "this.transition(" src/simulation/worker/state-machine.ts`
  is the enumeration and it returns exactly four, reaching `'faulted'`,
  `'paused'`, `'paused'`/`'running'` and `'shutting-down'` — **`:672`, `:861`,
  `:896` and `:1172` at `01974e5..origin/main`**, having read
  `:671`, `:860`, `:895` and `:1171` at `07add3e`, `:664`, `:799`,
  `:834` and `:1110` at `bb3a01e` and `c00b641`. **Those four anchors have now moved at
  five of six anchors, and every previous set but the last was wrong.** They first read
  `:566`, `:601`, `:825`; those were corrected to `:584`, `:619`, `:843` with `:455` declared
  unchanged; at `83d9616` all four were wrong again and read `:590`, `:725`,
  `:760`, `:984`; #452's staffing warning and #455's payroll moved every
  one of them again; #486's restore-refusal work moved all four once
  more; and this anchor's #505 (entity retirement, one line added above `EntityStore.destroy`'s
  call site inside `PrisonerDischargeSystem`'s reach, felt here as a uniform
  +1) moved all four a sixth time, by exactly one line each — the smallest
  move recorded yet, and still not zero. **MAKE IT SEVEN AT `0352116` —
  `:812`, `:1001`, `:1043` and `:1328` — AND THE PAIR OF SENTENCES ABOVE HAD
  BEEN WRONG FOR TWELVE CONSECUTIVE ANCHORS.** `:672`, `:861`, `:896` and
  `:1172` were last correct at `85c1c29`; `82ae630` moved all four to `:766`,
  `:955`, `:990` and `:1266`, and every pass from `82ae630` to `a54899a`
  inclusive — twelve of them — carried the `85c1c29` values forward. Traced
  rather than asserted, by running the grep out of each anchor tree in turn:
  `82ae630`/`e1813b7`/`cfab558` 766·955·990·1266, `53e1405` the same,
  `0637ab1` 768·957·992·1268, `104d078`/`eb1f040`/`898a16a`/`feb46af`
  770·959·994·1270, `004f799`/`58220f7`/`a54899a` 808·997·1039·1324, and
  `0352116` 812·1001·1043·1328. **The drift against what was written is +140,
  +140, +147 and +156; the drift this window actually caused is a uniform +4**,
  from #716's overdraft work landing above the message handlers. The count and
  the four
  target states have held throughout
  seven readings, which is the whole argument, and it is now a much stronger one
  than the paragraph above was making: **the grep is the citation, the numbers
  beside it are an aid, and this entry has just demonstrated that a set of four
  can be wrong for twelve anchors while the sentence around it stays exactly
  true.** Nothing in `src/` sends a `protocol/handshake` at
  all — re-read at this anchor, all nine occurrences are the receiver
  (`state-machine.ts:838`, `:868` and `:877` at `0352116`; `:834`, `:864` and
  `:873` at `004f799` through `a54899a`; `:796`, `:826` and `:835` at
  `898a16a`; `:792`, `:822` and `:831` from `82ae630`; `:698`, `:728` and `:737`
  at `33510df` and `85c1c29`, which is the set written above and which went
  stale on the same commit and for the same reason the four `transition()` sites
  did; `:697` and `:727` at
  `07add3e`; `:472` and `:502`, then `:681` and `:711` before that), the
  transferables switch, the kind list or the
  schema. **Re-counted at this anchor and still nine, still split 4/2/3, and
  this time the four in `types.ts` are the ones that did not move** —
  `types.ts:12`, `:23`, `:223`,
  `:442` all still land, on a file this window *did* touch (#716's widening of
  `treasuryMinorUnits` past `countSchema`), which is a citation surviving an
  edit to its own file rather than resting on the file being untouched;
  they read `:7`, `:18`, `:218`, `:437` at `07add3e`, moved +5 by #498's
  client-side room-enclosure work and #502's actor-render payload, and have held
  since. `state-machine.ts:838`, `:868` and `:877`, traced above.

  **MAKE IT EIGHT AT `5144eb9e`.** The four `this.transition()` call sites are
  now **`:845`, `:1037`, `:1091` and `:1376`** — a non-uniform +33/+36/+48/+48
  from `:812`/`:1001`/`:1043`/`:1328`, from #754's and #756's HUD-alert and
  HUD-readout work landing at several points through the file rather than in
  one block, which is why the four did not move together this time. **This
  pair had not been individually re-opened since `0352116`, nine releases
  before the previous anchor** — the `b04e45f` pass's own mechanical
  re-derivation found `state-machine.ts` outside its three-file delta
  intersection and did not open it — so this correction is against this tree
  directly and does not trace which of the intervening windows moved the four
  first. The three `protocol/handshake` receivers in `state-machine.ts` are
  now **`:871`, `:901` and `:910`** (`case 'protocol/handshake':`,
  `handleHandshake`'s own signature, and the `'protocol/handshake-accepted'`
  kind it replies with), for the same reason and on the same file; the total
  is still **nine**, still split **4/2/3**, because `types.ts`'s four and
  `transferables.ts`'s two are both outside this window's diff and re-read
  unmoved (`types.ts:12`, `:23`, `:223`, `:442`; `transferables.ts:39`,
  `:55`). The `'ready'` union member is unmoved for a third consecutive
  anchor, still `:34-40`, on a file that changed around it three times
  running rather than at it. `protocolVersion: z.literal(...)` in
  `src/simulation/protocol/types.ts:173` is likewise unmoved, on a file this
  window did touch elsewhere (#758's second-locale work). So ADR 0006's state
  2 and ADR 0003 decision 4's version negotiation are exactly as this bullet
  found them; only the receiver sites moved.

  **MAKE IT NINE AT `26434e8e`, and this time it is the receivers' turn to
  hold and one `transition()` site's turn to move.** The three
  `protocol/handshake` receivers are unmoved — still `:871`, `:901` and
  `:910` — because #774's `publishEvents()`-on-drain fix (issue #749) lands
  at `:1193-1226`, below all three receivers and below the first three
  `transition()` sites too. The fourth site, `:1376` → **`:1410`**, +34,
  matching that insertion exactly: `git diff --numstat 5144eb9e..HEAD --
  src/simulation/worker/state-machine.ts` is `35 1`, all of it above `:1410`
  and below `:1091`. The total is still **nine**, still split **4/2/3**:
  `types.ts`'s four (`:12`, `:23`, `:223`, `:442`) and `transferables.ts`'s
  two (`:39`, `:55`) are both outside this window's diff and re-read
  unmoved, on a `types.ts` this window's diff *does* touch elsewhere (374
  insertions from ADR 0087's `PrisonCondition` union, landing after all
  four). The `'ready'` union member is unmoved for a fourth consecutive
  anchor, still `:34-40`. `protocolVersion: z.literal(...)` in
  `src/simulation/protocol/types.ts:173` is likewise unmoved. So ADR 0006's
  state 2 and ADR 0003 decision 4's version negotiation are exactly as this
  bullet found them; only one `transition()` site moved.

  **`transferables.ts:41` and `:50` were described as *"(unmoved)"* and had been
  wrong for twelve anchors, on the same commit that broke the other twelve.**
  They are `:39` and `:55` at `0352116`, and have been since `82ae630`:
  `b158a67`/#507's shared event channel moved them, and
  every pass since has carried the pair forward on the strength of the file not
  being in its window — which is exactly what *"unmoved"* asserts and exactly
  what nobody checked. Traced by running the grep out of each anchor tree:
  `41 50` at `07add3e`, `33510df` and `85c1c29`, and `39 55` at `82ae630` and
  at every anchor since. **So one commit falsified three sets of numbers in this
  one bullet and none of the twelve passes after it noticed any of the three** —
  which is a finding about the method rather than about #507, and it is the
  reason this pass ran the mechanical re-derivation over every `file:line` in
  §§3-6 rather than only over the window's intersection.
  `src/simulation/protocol/transferables.ts` is **not** in
  `git diff --name-only a54899a..0352116`, so this window could not have raised
  it either; only opening the file did. **The two numbers are not even a uniform
  offset from each other** (−2 and +5), so no reader could have inferred them
  from the drift of anything else. The claim the pair supports is untouched: the
  two hits are the transferables switch, both receivers. Corrected in place with
  the old pair kept, because *"unmoved"* is the word §5's telemetry bullet
  already withdrew once for the same reason, and this is the second instance of
  the same class in the same section.

  **ADR 0003 now carries the same measurement independently**, at
  `docs/adr/0003-simulation-worker-protocol.md:547` — **which read `:535` here,
  and was already one line short at `a54899a` (`:546`) before this window pushed
  it one further**, from #723's addition of `treasuryOverdraftFloorMinorUnits`
  to that ADR's own status-counts tally: *"grepping `protocol/handshake`
  across `src/` still returns four hits in `types.ts`, two in `transferables.ts`
  and three in `state-machine.ts`, all receivers or declarations"* — nine, split
  exactly as counted here, arrived at by a different reader, and that sentence
  carries no line numbers so this anchor's moves do not touch it. Two independent
  routes to the same fact are worth keeping, as #371's were below. So ADR 0006's state 2 describes a state the machine cannot
  occupy and ADR 0003 decision 4's version negotiation runs for nobody. Version
  compatibility still fails closed, by a different route: the decoder's
  `protocolVersion: z.literal(...)` in `src/simulation/protocol/types.ts:173`
  (read `:168` at `07add3e`, the same +5 as the other three `types.ts` anchors
  above). This is
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
  returns `src/main.ts:105-107` (`createTelemetryPipeline`, `createCrashReporter`,
  and a `CancelScheduledPump` type import) and
  `src/ui/telemetry-consent-prompt.ts:8`. **The first of those read `:98-100`
  until `53e1405` and `:103-105` until `0352116`**, and is corrected here rather
  than overwritten for the
  reason this bullet keeps every previous value: the sequence is the argument.
  **A seventh hit appeared in this window and is inside the directory, so it
  does not touch the count**: `src/services/telemetry/admission.ts:17` names
  `src/services/telemetry/recorder.ts` in its own header, so a reader running
  the raw grep now sees seven and the six this sentence is about are still the
  six outside.
  `src/main.ts:165-206` builds the
  pipeline as the first thing after `GAME_VERSION` and registers `error` and
  `unhandledrejection` listeners that call `crashReporter.reportUnhandledError`
  (**this read `:163-204` until `0352116`**);
  `src/main.ts:2945-2950` mounts the consent prompt (**this read `:2494-2499`;
  #468's save-import work moved it twelve lines and it was re-anchored to
  `:2506-2511` at `c00b641`, then held through `07add3e`, then #500's
  `generateMasterSeed` function — inserted above it for the determinism reason
  its own doc comment gives — pushed it down 39 lines more to `:2545-2550`,
  then #534's door-edge work and #541's sentence draw pushed it 53 further to
  `:2598-2603`, then it moved **76 more** to `:2674-2679` — the largest single
  jump in the run — because #546's requirements work and #551's event channel
  both landed above it; then **92 more**, to `:2766-2771`, which was the whole
  of what `src/main.ts` gained in that window; at `53e1405` **71 more**, to
  `:2837-2842`, which is again the file's entire net growth in the window
  (`git diff --numstat cfab558..origin/main -- src/main.ts` is `72 1`, and
  `git log --first-parent cfab558..origin/main -- src/main.ts` names
  `2a00f98`/#579 as the only commit that touched it); and at `898a16a`
  **32 more**, to `:2869-2874`, which is once more the file's entire net
  growth in the window (`git diff --numstat eb1f040..898a16a -- src/main.ts`
  is `53 21`, and the two commits that touched it are `9a25700`/#659 and
  `c93109a`/#669); and at `feb46af` **12 more**, to `:2881-2886`, which is once
  again the file's entire net growth in the window — `git diff --numstat
  898a16a..feb46af -- src/main.ts` is `15 3`, in exactly two hunks, an import
  swap at `:89` that is net zero and #650's twelve-line addition inside
  `staffRoster()` at `:800`); **and then it stopped being re-read for two
  anchors and went stale, which had not happened to this pair before**:
  `323d033`/#704 moved it **16 more**, to `:2897-2902`, inside the
  `004f799..58220f7` window, and neither the `58220f7` pass nor the `a54899a`
  pass corrected it — even though `src/main.ts` is a **named member** of the
  `58220f7` intersection and that pass listed it as one. It moved **44 more** in
  this window, to `:2945-2950`, from #710's ninth chip and #716's overdraft work
  together, so the value written here was 64 lines out by the time it was
  opened)**). **The import span
  moved for the fourth consecutive anchor**, having held across the four before
  that: `:82-84`, then `:87-89`, then `:96-98`, then `:98-100` — two lines
  down, because #533's dismissal work added an import to the block above it, and
  **`:103-105` at `53e1405`**, five lines down, because #579's interface-scale
  work added an import block above it in turn. **The two halves of this bullet
  have now moved by different amounts in the same window**, which they had not
  done before: five lines at the top of the file and seventy-one at the bottom,
  because #579 added code both above the imports and above the mount. A single
  shift figure would have been wrong for one of them, which is why every anchor
  here is opened rather than offset.
  **The run of four ends at `898a16a` and the different-amounts finding does
  not**: the import span, `:163`, `:179` and `:201-204` are all **unmoved**,
  while the mount and its gate moved by the whole of the file's net **+32**,
  because #659's and #669's `+53/-21` falls entirely between `:204` and
  `:2833`. So the two halves moved by different amounts for the second
  consecutive anchor, from a window in which one of the two amounts is zero.
  `src/ui/telemetry-consent-prompt.ts:8` is the one anchor in this bullet that
  has **still** never moved, on a file no window has touched — six anchors now,
  five of which have moved and the sixth being the only one cited by symbol.
  **Two hits this sentence has never named, recorded because the next reader
  will run the grep and count six**: `src/main.ts:181` (this read `:172`, then
  `:174`, then `:179` from `53e1405`, and is **two further down at `0352116`**
  with the import span above it) and `src/ui/telemetry-consent-prompt.ts:17` are
  prose inside doc comments, not imports. **The count in this sentence was `four` until this anchor and it was
  right then**; the import span gaining a third line (`CancelScheduledPump`) is
  what makes it six, and the `src/main.ts` prose hit moved with the rest, from
  `:163` to `:172`. The two named here are still the only two that are prose. They were there at `bb3a01e` too, so the sentence has always been
  about the import sites rather than about the raw hit count; it is left saying
  what it means and the difference is written down here instead.
  So **the sentence this entry
  said did not hold is the one that now does** — telemetry is fed from the main
  thread's orchestration layer, off the tick and frame paths — and the sentence
  this entry asserted is the one that is false.

  **Re-opened whole at `5144eb9e`, because `src/main.ts` gained 104 lines and
  lost 22 in this window (#754, #756, #758 together) and every citation this
  bullet makes is into that file.** The import trio
  (`createTelemetryPipeline`, `createCrashReporter`, `type
  CancelScheduledPump`) is now **`:110-112`** (was `:105-107`); the prose hit
  naming `services/telemetry` from outside the directory is now **`:186`**
  (was `:181`); the pipeline construction and its two listeners now span
  **`:161-223`**; the `crashReporter` gate is now **`:208-211`** (was
  `:203-206`); the consent-mount gate is now **`:3023`** (was `:2941`) and the
  mount call is now **`:3028-3033`** (was `:2945-2950`).
  `src/ui/telemetry-consent-prompt.ts:8` and `:17` are unmoved, on a file this
  window does not touch, so the count stays **six** hits outside the
  directory and the two prose ones stay the same two. None of these moves
  changes what any sentence in this bullet says — the pipeline still
  constructs nothing with no ingestion destination configured, both listeners
  still exist and still gate on `telemetry.enabled`, and the consent prompt is
  still not mounted. Cited by symbol from here on per recommendation 1 at the
  foot of §6, since this is now the fourth consecutive anchor at which a
  fraction of `src/main.ts`'s growth landed inside one of this bullet's two
  spans and the rest landed between them.

  **Re-opened again at `26434e8e`, and for the first time the two spans this
  bullet cites moved by different amounts rather than together.** `#785`'s
  own two docblocks (documenting the new `pressFloorMinorUnits(...)` argument
  `judgeAffordability` takes at the Buy and Hire intent handlers, ADR 0017's
  equalisation amendment) land between the `crashReporter` gate and the
  consent-mount gate, so the import trio, the prose hit, the pipeline span
  and the `crashReporter` gate are all **unmoved** (`:110-112`, `:186`,
  `:161-223`, `:208-211`), while the consent-mount gate moves **`:3023` →
  `:3044`** and the mount call **`:3028-3033` → `:3048-3053`**, +21 both.
  None of these moves changes what any sentence in this bullet says — the
  pipeline still constructs nothing with no ingestion destination
  configured, both listeners still exist and still gate on
  `telemetry.enabled`, and the consent prompt is still not mounted; the
  `pressFloorMinorUnits` addition is ADR 0017's, not ADR 0010's, and does not
  touch this bullet's subject at all beyond moving two of its six anchors.

  **Re-opened again at `0e2eb7fb`, and the split repeats with a different
  cause and the same two halves.** `src/main.ts` is a member again — #796's
  issue-#765 work corrects seven comments in it that named 255 ms as the worst
  case a player waits before a pulled HUD readout refreshes, a figure PR #762
  measured in a real browser at up to roughly 300 ms — and **every one of its
  hunks lands below `:1181`**, which is a measurement and not an inference:
  `git diff --unified=0 33a4a22e..HEAD -- src/main.ts` reports eight hunks, at
  `:1181` (+2), `:1193` (+17) and six between `:1942` and `:1998` (+9 in
  total). So the import trio, the prose hit, the pipeline span and the
  `crashReporter` gate are **unmoved for the second consecutive anchor**
  (`:110-112`, `:186`, `:161-223`, `:208-211`), while the consent-mount gate
  moves **`:3044` → `:3072`** and the mount call **`:3048-3053` →
  `:3076-3081`**, **+28 both** — the whole of what the file gained above them.
  **The cause differs from the previous anchor's in a way worth one clause**:
  there the two docblocks landed *between* the two halves of this bullet's six
  anchors, so the split was structural; here all eight hunks land above both
  moving spans and below none of the four still spans, so the split is the
  same shape produced by a completely different edit — which is the argument
  for re-deriving rather than assuming a uniform offset for a file this bullet
  cites six times. Nothing here changes what any sentence in this bullet says:
  `grep -rn "services/telemetry" src/ --include=*.ts` still returns seven
  hits, six of them outside the directory and two of those six prose rather
  than imports, exactly as this bullet has said since `bb3a01e`; the pipeline
  still constructs nothing with no ingestion destination configured; both
  listeners still exist and still gate on `telemetry.enabled`; and the consent
  prompt is still not mounted. `src/ui/telemetry-consent-prompt.ts:8` and
  `:17` are unmoved on a file no window has yet touched — seven anchors now,
  and still the only anchors in this bullet that have never moved.

  **Re-opened again at `9b8c8e85`, and the split repeats a THIRD time, from a
  third distinct cause.** `src/main.ts` is a member again, and this time for
  two unrelated reasons in one window: #805's issue-#765 work adds two
  corrections to the same docblock #796 had corrected — the falsified bound is
  ADR 0086 **§5**'s prediction *"no gap above 260 ms"* and not §2's mechanism,
  which the same four runs confirm — and #802 adds a comment on the minimap
  click. `git diff --unified=0 0e2eb7fb..HEAD -- src/main.ts` reports exactly
  **two** hunks, `+29/-3` at `:1207` and `+10` at `:1960`, net **+36**. So the
  import trio, the prose hit, the pipeline span and the `crashReporter` gate
  are **unmoved for the third consecutive anchor** (`:110-112`, `:186`,
  `:161-223`, `:208-211`), while the consent-mount gate moves **`:3072` →
  `:3108`** and the mount call **`:3076-3081` → `:3112-3117`**, **+36 both** —
  again the whole of what the file gained above them. **The three causes are
  worth naming together, because they are the argument against a uniform
  offset**: at `26434e8e` two docblocks landed *between* the two halves of
  this bullet's six anchors and the split was structural; at `0e2eb7fb` eight
  hunks landed above both moving spans; here two hunks from two pull requests
  that have nothing to do with each other land in the same band. Same split,
  three mechanisms, and the only way to know which spans moved was to open
  them. Nothing here changes what any sentence in this bullet says:
  `grep -rn "services/telemetry" src/ --include=*.ts` still returns seven
  hits, six of them outside the directory and two of those six prose rather
  than imports, exactly as this bullet has said since `bb3a01e`; the pipeline
  still constructs nothing with no ingestion destination configured; both
  listeners still exist and still gate on `telemetry.enabled`; and the consent
  prompt is still not mounted. `src/ui/telemetry-consent-prompt.ts:8` and
  `:17` are unmoved on a file no window has yet touched — eight anchors now,
  and still the only anchors in this bullet that have never moved.

  **What is still true is narrower and rests on something else entirely, which is
  why this is a rewrite and not a strike.** No build of this repository sends
  anything, because the transport's destination comes from deployment
  configuration, nothing sets it, and with it absent the pipeline constructs
  *nothing* — so the consent prompt is not mounted either
  (`src/main.ts:208-211`, unmoved since `5144eb9e`, and `:3108` at
  `9b8c8e85` — both gate on `telemetry.enabled`; the second read `:3072` at
  `0e2eb7fb`, `:3044` at
  `26434e8e` and through `33a4a22e`, `:3023` at `5144eb9e`, and
  `:203-206`/`:2941` before that).
  **Both read `:201-204` and `:2877` until `0352116`, and the second of the two
  had been wrong for two anchors before this window touched it** — `323d033`/#704
  moved it to `:2897` inside `004f799..58220f7`, and #710 and #716 moved it to
  `:2941` here, while the first moved only the +2 the import block above it
  gained. **So the two halves moved by different amounts for the fourth
  consecutive anchor, and for the first time one of the two was already stale
  when the window opened.**
  **The second of those read `:2833` until the `898a16a` anchor** and moved by
  the net **+32** `src/main.ts` took from `9a25700`/#659 and `c93109a`/#669,
  while the first did not move at all, because every line of that change lands
  below `:204` and above `:2833`. **It then read `:2865` until this anchor**,
  and moved again by the whole of the file's net **+12** while the first again
  did not move at all, for the same reason in a different window: #650's twelve
  lines land at `:800`, below `:204` and above `:2865`. **That is the third
  consecutive anchor at which these two numbers moved by different amounts, and
  the second running at which one of the two amounts is zero.**
  **This parenthesis read `:196-199` and `:2762` until `53e1405`**; both were
  correct at `cfab558` — they are the pair that anchor re-derived by symbol,
  after two consecutive anchors of naming the wrong code — and both moved with
  the rest of the file at #579, the first by five lines and the second by
  seventy-one. **That is the first time in this bullet's history that these two
  numbers went stale by ordinary drift rather than by having been wrong when
  they were written**, and it is the evidence that re-deriving them by symbol
  worked: a citation that is right on the tree that writes it moves cleanly
  afterwards, while one that is not accumulates a second error every time
  somebody offsets it.
  **Both numbers in this parenthesis read differently until this anchor, and
  neither of them named a gate.** It read *"(`src/main.ts:185-188`, and `:2598`
  — this read `:2494`, then `:2506` at `c00b641`/`07add3e`, then `:2545` — both
  gate on `telemetry.enabled`)"*, and opening `82ae630` says what those two
  lines actually held there: `:185-188` was doc-comment prose — *"for the same
  reason: `vitest.config.ts` runs in `node` with no jsdom"* — four lines above
  the `const crashReporter = telemetry.enabled === false` expression at
  `:194-197`; and `:2598` was a doc comment about `AutosaveScheduler`, seventy-two
  lines above the `if (telemetry.enabled && appRoot !== null)` at `:2670`, and
  is the *mount span's* opening value from one anchor earlier, left behind when
  the mount was renumbered and the gate beside it was not. **So this is not a
  citation that went stale in the last window; it was naming the wrong code on
  the tree that wrote it**, which is the class `docs/AGENT_WORKFLOW.md` §3 calls
  a claim false the day it is written, and which this file's own header calls
  the thing a delta pass is structurally blind to. Both are re-derived by symbol
  above. **The word "unmoved" stood on the first of those two
  anchors and is withdrawn rather than deleted**: `:180-183` was the
  `crashReporter` gate at `4ace2da`, and the drift recorded here is what became
  of it. A citation described as unmoved
  is the one a reader is least likely to re-check, which is the argument for
  not writing the word at all — and this correction is the same argument made
  the harder way, because the citation nobody re-checked had stopped being about
  its own subject two anchors before anyone noticed. That is
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
  import"*. `src/main.ts:86` was then `import './styles.css';` — a real import, of
  nothing to do with challenges, so the anchor no longer supported the sentence it
  was given for. The comment moved to `src/main.ts:102`, where it read
  *"`src/services/challenges/verification.ts`, against a challenge definition's
  …"*. (**Written here as `import type { CancelScheduledPump }` in the first
  draft of this correction and caught by re-deriving every anchor mechanically
  before commit** — that line was `:84`. Recorded because it is the same off-by-two
  the entry is about, committed while correcting it.)

  **Every number in the paragraph above has now moved, and the correction rotted
  no slower than the claim it corrected.** At `85c1c29`: `src/main.ts:86` is
  `import { createTelemetryConsentPrompt } from './ui/telemetry-consent-prompt';`,
  `import './styles.css';` is at **`:91`**, the challenges comment is at
  **`:107`**, and `import type { CancelScheduledPump }` is at **`:89`** — all
  five lines down, from #541 adding one import above them. The three sentences
  are put into the past tense against `bb3a01e` rather than renumbered, because
  the useful content is the *shape* of the error and not the values: this is a
  correction of a correction of an anchor, three deep, and the only one of the
  four spans that has ever stayed put is the one cited by symbol. §4 of
  `docs/AGENT_WORKFLOW.md` says a correction is no more durable than the claim
  it corrected; this is the fourth consecutive anchor at which that has been
  demonstrated inside this file's own text, which stops being an anecdote and
  starts being the measured base rate. And **there are two mentions
  now, not one**: `src/persistence/save-schema.ts:1289` names
  `masterSeedSchema` *"from `services/challenges`"* in a comment explaining why it
  does **not** import it (this read `:1164`, then `:1182` at `07add3e` after
  #486's refused-restore work added eighteen lines above it, then `:1198` after
  #497's assault-sanction work added sixteen more, and **`:1214` at `cfab558`**
  after #571's V4 bounds-recovery work added sixteen more again; re-read at
  each, and the sentence itself is unmoved by any of the three changes: it is
  about a schema-module boundary, not about which value production supplies.
  **Five values for one unchanged comment** — that is the symbol-over-line rule
  at the foot of §6 arguing for itself in a single citation. **Make it six, and
  the sixth is not a drift this window caused**: it is `:1289` at `0352116` and
  was `:1289` at `a54899a` too, moved by `d34c573`/#694's loan pricing and
  `7dd66a4`/#697's pin on what #694 claimed, both of which landed before the
  previous anchor. `src/persistence/save-schema.ts` is not in this window's 101
  files, so nothing but opening it would have found this — which is the same
  class as `transferables.ts` above and in the same section). Both
  are comments, so the finding holds; the word
  *"single"* is the part that rotted, which is the shape §4 of
  `docs/AGENT_WORKFLOW.md` says rots first.

  **Make it seven, and this one the window did cause.** `src/persistence/save-schema.ts`
  is in *this* anchor's window — `61c4f384`/#731 (ADR 0082) added the
  `placementSequence` docblock, +35 lines, directly under `buildOrderSchema`'s
  `edge` field, above `masterSeedSchema`'s comment — and the comment moved from
  `:1289` to `:1324`, re-derived by opening the file. **Six values for one
  unchanged comment**, one behind the count above until this correction lands.

  **Make it eight at `5144eb9e`.** `src/persistence/save-schema.ts` is in this
  window too — #754's alerts-save section adds a net 56 lines
  (`git diff --stat b04e45f..5144eb9e -- src/persistence/save-schema.ts` is
  `58 insertions(+), 2 deletions(-)`) above `masterSeedSchema`'s comment,
  which moved from `:1324` to **`:1380`**, re-derived by opening the file
  rather than assumed from the diff. **Seven values for one unchanged
  comment**, and the comment still says nothing about which value production
  supplies. `src/main.ts:86` and its neighbours have moved again too, and are
  re-derived from scratch rather than offset for the reason the header's own
  method section gives: `src/main.ts` gained 104 lines and lost 22 in this
  window. `import { createTelemetryConsentPrompt }` is now `:109`,
  `import './styles.css'` is `:114`, the challenges comment this bullet cites
  is `:130`, and `import type { CancelScheduledPump }` is `:112` — all four
  a uniform **+23** from the `85c1c29` values this paragraph carried
  forward (`:86`, `:91`, `:107`, `:89`), which this pass does not claim to
  have traced through the many anchors between `85c1c29` and this one: the
  uniformity of the offset is itself evidence nothing landed *inside* the
  block in between, but not evidence about when outside it moved. `verifyChallengeSubmission`
  and `isPubliclyRankable` are unmoved, still `:136` and `:324`, on a file
  (`src/services/challenges/verification.ts`) this window does not touch.
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
  line has moved from `:562` to `:582`, and **to `:588` at `07add3e`** after #481
  corrected that ADR's `HudRoomGesture` anchor. So the residue of this entry is one live
  fact — **the 900×600 budget now has two figures in the corpus, 7.81 live and
  11.8/12.2 recorded as superseded, and no third** — and one lesson, that the
  entry's own hand count of `.css` files was the least reliable thing in it.

  **And at `53e1405` the sentence this entry quotes as the discharge has gone
  partly false, in the one clause nobody was watching.** ADR 0025's withdrawal
  reads *"`3.9` appears in no other ADR, in no `.css` file and nowhere in
  `src/`"*. The last clause stopped being true at **`2a00f98`** (#579,
  v0.0.212): `src/ui/primitives/icon.ts:68` now holds `'M15.8 16.1h3.9'`, the
  fourth stroke of the `ui-scale` glyph the interface-scale work added.
  `git show cfab558:src/ui/primitives/icon.ts` returns no `3.9` at all, and
  `git log -S 'h3.9' -- src/ui/primitives/icon.ts` names that one commit, so
  the date is derived rather than inferred from the window.

  **That anchor is `:77` at `9b8c8e85`, not `:68`, and it drifted where no
  delta pass could see it.** `src/ui/primitives/icon.ts` has not been in a
  member set since the paragraph above was written — it is not among this
  window's 44 files — so the nine lines it moved were invisible to every
  intersection between, and the only reason the drift surfaced is that this
  pass re-ran the grep the paragraph invites instead of carrying its result
  forward. Re-derived by symbol: `grep -n "3\.9" src/` returns exactly one
  hit, `src/ui/primitives/icon.ts:77`, still `'M15.8 16.1h3.9'`, and
  `git log -1 -S "M15.8 16.1h3.9" -- src/ui/primitives/icon.ts` still names
  `2a00f98e` (#579, 2026-08-29) — so the *claim* is unchanged and only the line
  number was wrong. `:68` is kept above rather than overwritten, because this
  is the class `docs/AGENT_WORKFLOW.md` §4 calls the least durable citation
  here landing in a paragraph whose own subject is a grep whose result rotted:
  the bare line number went stale while the quoted path data and the commit
  that added it did not. The three ADRs that match `3\.9` incidentally were
  re-opened too, and none of them records the figure either — ADR 0017's
  `283.95px` table cell, ADR 0022's *"÷ 12.2 is 23.9"* and ADR 0080's `13.94 %`
  row — so the reader running the raw grep now has four hits to dismiss rather
  than two, and the caveat below is the only thing that lets them.

  **Still `:77` at `1547c7f6`, and this is the first window since the entry
  was written to edit two of the four `.css` files it counts.** #814 added the
  seventh `BadgeTone`, `caution` (`src/ui/primitives/status-badge.ts:42`), and
  with it +13 lines to `src/ui/tokens.css` (three hunks, at `:195`, `:242` and
  `:254`) and +1 to `src/ui/primitives/primitives.css` (at `:138`). Neither
  file is reached by the rooted-path scan the header's pass 1 runs, because
  this entry names them by bare basename; both were read because the claim
  they carry is an absence, and an absence is what an edit falsifies.
  Re-run rather than carried: `find src/ui -name "*.css"` still returns
  **four**, `3.9` is still in **none** of them, and `grep -rn '3\.9' src/`
  still returns exactly one hit, `src/ui/primitives/icon.ts:77`, still
  `'M15.8 16.1h3.9'`, on a file this window does not touch. So the finding
  above is unaffected in every clause, and the tokens a warning tone needed
  turned out to include no figure that looks like a headroom.

  **The sentence's point survives and its grep does not, and the distinction
  is the whole of the finding.** No `.css` file records the figure — there are
  still **four** under `src/ui/`, re-derived at this anchor by
  `git ls-tree -r HEAD -- src/ui`, so the count this entry once got wrong is
  right now and stays right — no other ADR records it, and nothing in `src/`
  records it *as a measurement*. What changed is that a reader running the raw
  grep the sentence invites gets a hit, and has to work out unaided that SVG
  path data in an icon is not a headroom figure. **That is precisely the move
  this entry already made once**, for `grep '3\.9'` also matching ADR 0022's
  *"÷ 12.2 is 23.9"*, and the caveat it wrote for that case is the shape the
  new one needs: name the hit, say why it is not the thing, and let the next
  reader stop.

  **The fix is ADR 0025's and is handed over rather than made here**, because
  this commit's surface is `docs/adr/STATUS-QUEUE.md` alone and an accepted
  ADR's body is amended in its own commit — the rule §5 applies to every other
  entry. What it is owed is one clause, corrected in both directions: the
  measurement claim kept, and beside it the path-data hit named with its
  commit. **The class, not the instance**: a sentence of the form *"X appears
  nowhere in `src/`"* is the absence-claim `docs/AGENT_WORKFLOW.md` §4 says
  rots first, and it is falsified by any file that happens to contain the
  characters for an unrelated reason. Two of the three clauses in this one are
  bounded (ADRs and `.css` files are small, enumerable sets); the third is
  bounded by nothing, and it is the one that broke.

  **`icon.ts:68` is `:77` at `5144eb9e`**, from #756's HUD-readout work adding
  nine lines above it; `'M15.8 16.1h3.9'` is unmoved in content. `3.9` is
  still absent from all four `.css` files under `src/ui/`, re-derived at this
  anchor by `git ls-tree -r HEAD -- src/ui`, so the finding above is
  unaffected — only the path-data hit's line number moved.
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

  What is left is the measurement, re-taken at this anchor. `HudIntent`
  declares **nineteen** members at `cfab558`, counted as
  `grep -c "readonly kind: '"` between `export type HudIntent =` and the
  union's close — three of them room-related (`zone-room`, `unzone-room`,
  `arm-room-tool`), which is the half of this sentence that did not move.
  (**This read "eighteen" and had been false for one anchor.** The nineteenth
  is `dismiss-staff`, added by **#533 at `a8a446e`**, which is in the
  `82ae630..e1813b7` window — `git show 82ae630:src/ui/hud/hud.ts` has no such
  member and `git show e1813b7:…` does. The pass that anchored at `e1813b7`
  had that pull request in front of it and **recounted the command union from
  it in its own header**, thirteen to fourteen, while leaving this union — which
  the same change extended — at eighteen. Two unions, one commit, one
  recounted. Corrected here rather than overwritten, because the entry's whole
  subject is a hand count that drifted and this is that happening to the
  correction, for the fourth time in this entry.);
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
  `AWAITING_PRODUCER` declaration at `:224` has a body that is nothing but a
  comment beginning *"**Empty, and that is a first.**"*, and whose gate comment at
  `:250` calls an empty list *"not a state to defend"* but *"the state this gate
  exists to bring about"*, and which fails in both directions — **these read
  `:204` and `:230` until this anchor**, moved twenty lines by the twenty-line
  account of `DismissStaff` that #533 added to the declaration's own comment,
  and the list is still empty); the `onIntent`
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

  **That range is `:355-361` at `26434e8e`, a drift of 137 lines from the
  `:218-224` `bb3a01e` (v0.0.132) named, none of it individually re-opened
  until this one.** The file sat outside every intervening anchor's own
  delta intersection — this window is the first in which it changed — so
  the true drift accumulated across many anchors' worth of unrelated growth
  rather than only this window's own **+16** lines (two new
  `hud.status.funds-*` locale keys #766 adds, both well above the test). The
  property the test proves is unchanged; only the line range is, again.

  **And it is `:362-368` at `33a4a22e`, +7 in the same file for the second
  window running.** #782's own `hud.status.funds-treasury-floor-exhausted`
  comment — documenting the third tone issue #768's ruling added to the
  `ALLOWED_MONEY_KEYS` set two tests above this one — lands inside the same
  `describe` block, above `it('imports nothing from the simulation', …)`
  rather than inside it, so the property is unaffected and only the citation
  moved. Re-derived by opening the file rather than offset from the diff:
  `it('imports nothing from the simulation'` now begins at `:362` and the
  block closes at `:368`.

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
  hand count missed are `arm-build-tool` (**`src/ui/hud/hud.ts:444-449` at
  `cfab558`**, which read `:404-409` from `bb3a01e` until #498 moved it and
  then `:429-434` through `85c1c29`) and
  `arm-room-tool` (**`:598-603`**, which read `:537-542` and then `:561-566`
  over the same spans), the
  only two declared across several lines rather
  than on one, which is exactly the shape a hand count skips. The sixteenth,
  though, is on a single line (**`:486`**, `cancel-build-order`, which read
  `:446` and then `:471`) and was missed for
  the ordinary reason: nobody recounted. **All three were stale before this
  window opened rather than by it**: `:429-434`, `:561-566` and `:471` are the
  `4ace2da`/`85c1c29` values, one line out from `82ae630`, and `arm-room-tool`
  was **twenty-three lines out at `e1813b7`** — moved by #533, the same commit
  that added the nineteenth member. Re-derived by symbol at `cfab558` and
  recorded with every value the three have carried, because the list of values
  is the argument and the current one is only the last of them.

  **A twentieth member arrives at `5144eb9e`, and every number in this passage
  moves again.** `HudIntent` gains **`dismiss-alert`** (`:587`) — ADR 0084
  decision 3's own control, and the first new member since `dismiss-staff`
  made it nineteen — so `export type HudIntent =` is now **`:314`** (was
  `:271`), the union closes at **`:632`** (was `:541`),
  `HudUnavailableNotice` begins at **`:647`** (was `:555`), `arm-build-tool`
  is now **`:447-452`** (was `:444-449`), `arm-room-tool` is now
  **`:627-632`** (was `:598-603`) and `cancel-build-order` is now **`:489`**
  (was `:486`). None of these six had been individually re-opened since
  `cfab558`, twenty releases before the previous anchor — `hud.ts` was
  outside the `b04e45f` pass's own three-file delta intersection — so this
  correction is derived directly against this tree and does not trace which
  of the intervening windows moved each of them first; the values immediately
  above are the last ones this file stated, not the last ones that were true.
  `AWAITING_PRODUCER`'s declaration and gate comment in
  `tests/foundation/unconsumed-command-contract.test.ts` are unmoved, still
  `:224` and `:250`.

  **Still twenty members at `26434e8e`, and every number in this passage moves
  again anyway.** No member joined — #775's alerts-corner work and #785's
  rung-equalisation work both touch `hud.ts` without adding to `HudIntent` —
  but the six citations move by a non-uniform +7/+8 because the two land at
  several points through the file rather than in one block, the same shape
  the previous two arrivals took: `export type HudIntent =` is now **`:321`**
  (was `:314`), the union closes at **`:640`** (was `:632`),
  `HudUnavailableNotice` begins at **`:654`** (was `:647`), `arm-build-tool`
  is now **`:454-459`** (was `:447-452`), `arm-room-tool` is now
  **`:635-640`** (was `:627-632`) and `cancel-build-order` is now **`:496`**
  (was `:489`); `dismiss-alert` itself moves the same +7 as four of the five
  others, `:587` → **`:594`**. `AWAITING_PRODUCER`'s declaration and gate
  comment are unmoved, still `:224` and `:250`, on a file this window does
  not touch.

  **STILL TWENTY MEMBERS at `9b8c8e85`, and for the first time every number in
  this passage HOLDS on a file the window changed.** `src/ui/hud/hud.ts` gained
  **136** lines and lost **14** across four merges (#799, #800, #801, #802),
  and not one of the seven citations moved: `export type HudIntent =` is still
  **`:321`**, the union still closes at **`:640`**, `HudUnavailableNotice`
  still begins at **`:654`**, `arm-build-tool` is still **`:454-459`**,
  `arm-room-tool` still **`:635-640`**, `cancel-build-order` still **`:496`**
  and `dismiss-alert` still **`:594`**. That is measured rather than lucky:
  `git diff --unified=0 0e2eb7fb..HEAD -- src/ui/hud/hud.ts` reports eight
  hunks and the **earliest is at `:766`**, below every span this passage cites,
  because everything the window added lives in `MountHudOptions` and inside
  `mountHud` rather than in the intent union.
  **And the count holding at twenty is the finding, not the number.** #802 added
  a real new HUD control in this window — `onMinimapNavigate` on
  `MountHudOptions` — and it is deliberately **not** a `HudIntent` member.
  `src/main.ts`'s own comment on the wiring says why in terms: *"Unlike the
  build/room/object gestures above this is not routed through `HudIntent` at
  all: moving the camera never reaches the simulation (`AGENTS.md` boundary 1),
  so there is nothing for the intent gate or the refusal line to do with it"*.
  So a window can add a control to this file without adding a member, which is
  a case a hand count cannot get wrong by drifting and can very easily get
  wrong by *assuming*: a reader who saw "the minimap gained a click handler"
  and incremented would now be at twenty-one. The count was re-derived by the
  method stated above — `readonly kind: '` between `export type HudIntent =`
  and the union's close — rather than reasoned from the diff.
  `AWAITING_PRODUCER`'s declaration and gate comment in
  `tests/foundation/unconsumed-command-contract.test.ts` are unmoved, still
  `:224` and `:250`, on a file this window does not touch.

  **STILL TWENTY MEMBERS at `1547c7f6`, every number in this passage holds for
  the second consecutive anchor, and this time the bound is a single hunk.**
  `git diff --unified=0 9b8c8e85..1547c7f6 -- src/ui/hud/hud.ts` reports
  **one** hunk, `@@ -2161,0 +2162,6 @@` — six lines added inside `mountHud`,
  #807's `staffPanel.setTreasury(next.counts)` at `:2167` beside the
  `buildPanel.setTreasury(next.counts)` at `:2140` it mirrors — and nothing
  removed, so `export type HudIntent =` is still **`:321`**, the union still
  closes at **`:640`**, `HudUnavailableNotice` still begins at **`:654`**,
  `arm-build-tool` is still **`:454-459`**, `arm-room-tool` still
  **`:635-640`**, `cancel-build-order` still **`:496`** and `dismiss-alert`
  still **`:594`**. The count was re-derived by the stated method —
  `readonly kind: '` between `export type HudIntent =` and the union's close
  — and returns **20**. **And it is the second consecutive window to add a
  control's behaviour to this file without adding a member**: #807 gave the
  Hire button the same can-it-act state #799 gave the Buy button, and routed
  the treasury to the staff panel as a setter rather than as an intent — the
  panel's comment on it (`src/ui/hud/staff-panel.ts:526` — **this read `:489`
  through the v0.0.402 anchor; #857's staff-coverage readout added 37 lines
  above it in this window and the comment itself is byte-identical**) says the
  line *"decides nothing"* and that `BuildPanel.setTreasury` *"is the same
  setter for the same reason on the Buy button"*. The previous anchor's minimap
  control was kept out of the union because it never reaches the simulation;
  this one because it decides nothing — two reasons, one count.
  `AWAITING_PRODUCER`'s declaration and gate comment in
  `tests/foundation/unconsumed-command-contract.test.ts` are unmoved, still
  `:224` and `:250`, on a file this window does not touch.

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
  `src/simulation/protocol/commands.ts` (**`:542` at this anchor**; this entry
  cited `:437`, then `:465`, then `:467`, then `:493`, and all four were
  overtaken — `:467` held from `bb3a01e` through `4ace2da` and #536's and #541's
  insertions above it moved it 26 lines, and #533's `DismissStaff` schema moved
  it 49 more), discriminates
  **fourteen**, matching the fourteen hits of
  `grep -c "type: z.literal" src/simulation/protocol/commands.ts`: #392
  added `CancelMaterialPurchase` and #394 added `ReleaseGuardAssignment`, both
  with producers in the same change, so `AWAITING_PRODUCER` stayed empty while
  the count moved. `AdmitPrisoner` (#306) still concerns a prisoner. **Re-counted
  at `bb3a01e` and it was thirteen then**, which was the only count in §5 to
  survive that delta unchanged: `commands.ts` was edited in it (#460's
  paused-clock work) and added no member. **Thirteen is fourteen at this
  anchor**: #533 added `DismissStaff`, the command that made a *departure*
  reachable where `ReleaseGuardAssignment` had only released a claim, and it
  landed with its producer in the same change — so `AWAITING_PRODUCER` stayed
  empty while the count moved, for the third time in this entry's history. The
  fourteen are `PlaceBuildOrder`, `CancelBuildOrder`,
  `ZoneRoom`, `UnzoneRoom`, `PurchaseMaterials`, `CancelMaterialPurchase`,
  `AdmitPrisoner`, `HireStaff`, `PlaceObject`, `RemoveObject`,
  `ReleaseGuardAssignment`, **`DismissStaff`**, `Undo` and `Redo` — enumerated
  rather than tallied, because this entry's whole subject is a tally that
  rotted, and **the enumeration is what made this drift cheap to correct**: the
  list said which thirteen, so finding the fourteenth was a set difference and
  not a re-count. The
  load-bearing half of the argument is
  unaffected — there is still no player input to *placement*, and an override
  still needs a new command type, its codec case, a handler branch and a decision
  about whether intake blocks — so the body was left verbatim rather than
  rewritten by the commit that accepted it, exactly as 0022's drift was.

  **Fourteen is fifteen at `5144eb9e`.** `DismissAlert` — ADR 0084 decision
  3's own command, the alerts log's dismissal gesture — landed with its
  producer in the same change, exactly the shape `DismissStaff` set: so
  `AWAITING_PRODUCER` stays empty while the count moves, for the fourth time
  in this entry's history. `simulationCommandSchema`'s declaration is now
  **`:597`** (was `:542`), and `grep -c "type: z.literal"
  src/simulation/protocol/commands.ts` returns **15**, matching
  `tests/foundation/unconsumed-command-contract.test.ts`'s own
  `COMMAND_TYPES.length).toBe(15)`, pinned in the same commit that added the
  member. `AdmitPrisoner` is still the only one of the fifteen that concerns
  a prisoner. The fifteen are the fourteen above plus `DismissAlert`.

- **Two Accepted ADRs still say object placement does not exist**, which is the
  same drift as 0022's and 0027's structural citations and is recorded the same
  way. `docs/adr/0023-room-occupancy-authority.md` says step 1 of its resolver is
  *"unimplementable today … object placement does not exist
  (`docs/HUD_PROJECTIONS.md` gap 13), so until it does, the resolver's only
  reachable branches are 2 and 3"*, and
  `docs/adr/0027-cell-sharing-assessment.md` says a freshly zoned room is
  registered with `capacity: 0` *"because object placement does not exist"*. ADR
  0028 phase 1 falsified the premise in both. The document they both cite has
  already moved — gap 13 opened *"Object placement exists, and `minQuantity`
  is still unchecked"* in `docs/HUD_PROJECTIONS.md`, which is how it should be
  cited: that number has been `:553`, then `:639`, and was `:754` at `bb3a01e`,
  three anchors and three readings of a sentence that had never changed a word,
  so the number was retired there and the quotation kept. **The retired number
  has since moved twice more, to `:993` and then to `:1019` at `9b8c8e85`** —
  five values against one sentence that has changed once, the last move being
  +26 from #805's four hunks at `:539`, `:545`, `:571` and `:575`. It is
  recorded here without being re-adopted: the point of retiring it was that
  the sentence outlasts it, and each further move is evidence for the retirement
  rather than a reason to cite a number again.

  **And then the quotation itself went false, which had not happened before in
  this file.** At `85c1c29` gap 13 opens **"Object placement exists, and
  `minQuantity` is counted"** — #530 (issue #528) closed the second half of the
  gap, and its own body now says so in terms: *"both halves of this gap are now
  closed, the second at #528"*, with the superseded paragraph kept beneath it in
  the same marked-rather-than-overwritten style this file uses. The quotation is
  corrected above and the old wording left standing beside it. **This is worth
  more than the correction.** §4 of `docs/AGENT_WORKFLOW.md` ranks a quoted
  sentence as the most durable citation available here, and this entry retired a
  line number *to* a quotation three anchors ago on exactly that ground. The
  ranking survives — the number moved three times in the span the sentence
  survived once — but "most durable" is not "cannot rot", and the thing that
  falsifies a quotation is the only thing that should: a real change to the
  subject, rather than an edit anywhere above it. A quotation fails **loudly**,
  because the words are gone and no grep finds them, where a line number fails
  **silently** by landing on a plausible neighbour. That asymmetry is the actual
  argument for the rule, and it is stronger than the durability claim this entry
  had been making for it. **The consequence for the two ADRs is the opposite of
  a discharge**: both halves of gap 13 are now closed, so
  `docs/adr/0023-room-occupancy-authority.md` and
  `docs/adr/0027-cell-sharing-assessment.md` are further from the world than
  when this entry was written, not closer, and the handover to amend them
  stands and has grown — so the two ADRs are the
  last places in the corpus asserting the old world, and a reader who follows
  either citation lands on a page contradicting the sentence that sent them. The
  two sentences are still there and were re-read here:
  `docs/adr/0023-room-occupancy-authority.md:308-309` — **which read
  `:204-205`, and which this entry described as *"unmoved"* until this
  anchor.** #654 moved it **104 lines** while converting that ADR's own
  `file:line` citations into verbatim quotations, so the drift arrived in the
  window from the commit that exists to stop drift of exactly this shape; the
  sentence there is unchanged and now reads *"Step 1 is unimplementable today
  and this ADR does not pretend otherwise: object placement does not exist
  (`docs/HUD_PROJECTIONS.md` gap 13), so until it does, the resolver's only
  reachable branches are 2 and 3."* It is quoted here, rather than only
  re-anchored, so that the next move of it costs nothing — and
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
  (`docs/adr/0023-room-occupancy-authority.md:300-307`, which read `:196-203`
  until #654 moved it 104 lines; **the quoted branch survived the move and
  only the range beside it broke**, which is recommendation 1 at the foot of
  §6 producing a measurable result again, this time inside the window that
  produced the counter-example) — and a cell holding two
  beds resolves through **branch 1** to a `residentCapacity` of 2 in a session a
  player can start. Branch 3 is what an *empty* room takes; branch 2 is
  unreachable in either world, because no room definition authors a nominal
  figure — the eighteen definitions at `src/content/room-catalog.ts:92-190`
  declare `requirements` and nothing else (re-counted and re-grepped after #376 added an
  import-time cross-catalogue check to the head of that file, which moved every
  definition down by two lines and changed nothing else this entry rests on;
  **the range read `:68-165` until `0352116`** and went false at `0637ab1`,
  eight anchors before this one, on a file none of those windows touched).

  **This entry also said *"the string `capacity` does not occur in that file at
  all"*, and that went false on the same commit and at the same anchor.** It
  occurs **twice** — `src/content/room-catalog.ts:67` and `:229` — and has since
  `7161779`/#610, the open-area work, which is also what moved the definitions
  down 24 lines. **Both hits are prose**: `:67` is the
  docblock sentence saying that floor-area capacity *"applies **only** to room
  types tagged here"*, and `:229` argues that *"inventing floor-area capacity
  for one would be asserting a room nobody can zone"*. **So the load-bearing
  half of the claim survives and the way it was written does not**: no room
  *definition* authors a capacity field, which is what branch 2 turns on, and
  the grep that was offered as the proof of it now returns two hits that are
  arguments about capacity rather than declarations of one. This is the same
  shape as ADR 0025's *"`3.9` appears nowhere in `src/`"* two bullets up — an
  absence claim over an unbounded set, falsified by text that happens to contain
  the characters — and it is recorded beside that one deliberately, because the
  bullet that named the class then went on to make the same claim itself. The
  corrected form states the subject: **no row of `ROOM_CATALOG` declares a
  capacity, and the two occurrences of the word are comments explaining why
  not.** And 0027's co-occupancy is reachable:
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
     over here. **Still open at `07add3e`**, re-read rather than assumed:
     `docs/adr/README.md` ruling 3 still says *"Ten of the 17 post-hoc additions
     on disk are covered today"* and ruling 4 still says *"Condemns **16 of the
     17** post-hoc additions on disk"*, while the mechanically derivable figure
     — 27 `Amendment`/`Addendum` sections across 16 ADRs — is unchanged from
     `c00b641`. The seventeen is a hand count whose method is not stated
     anywhere, so it can neither be re-derived nor corrected from here. **Two
     anchors open. This is the one §5/§6 handover that has not moved**, in
     contrast to the two discharged in this window. **Still open at `0352116`,
     which makes it the longest-running handover this file holds**: both
     README rulings still state the seventeen verbatim, and the mechanically
     derivable figure has moved for the first time since `c00b641` — it is
     **29 sections across 17 ADRs** here, run as
     `grep -rc "^#\{2,4\} \(Amendment\|Addendum\)" docs/adr/*.md`. **The two
     figures moving apart is the point rather than the arithmetic**: the
     derivable one has now gone 15/9 → 27/16 → 29/17 while the hand count has
     said seventeen throughout, so a reader who assumed they were two readings
     of the same set would be wrong by twelve. Correcting the README is still
     not this file's edit to make and is handed over again. The two exceptions were ADR 0008's rulings,
     which had no section at all — the only unsectioned dated rulings in the
     directory — and ADR 0033's undated heading. ADR 0008's are corrected in the
     same commit as this entry, text untouched.

     **DISCHARGED at `082959e7`/#757, eight anchors after `0352116` first
     called this the longest-running handover this file holds.** The README
     recount this item asked for and could not itself make has been made: a
     post-hoc addition is now defined precisely — a headed
     `Amendment`/`Addendum` section, or an unheaded passage doing the same job
     inline, each with a stated and runnable test — and re-enumerated against
     that definition rather than hand-counted: **33** on this tree, not
     seventeen (32 headed sections across 18 documents, run as
     `grep -RniE '^#{2,6}\s+[*_\`]*(Amendment|Addendum)\b' docs/adr/*.md`
     excluding this file and `README.md` itself, plus one unheaded passage in
     [ADR 0028](./0028-object-placement-and-derived-room-capacity.md)
     narrowing decision 2 per [ADR 0076](./0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
     decision A(i), which carries no heading and no mention in 0028's own
     `Status`). **This closes the gap this entry itself opened**: the
     mechanically derivable `Amendment`/`Addendum`-heading count had drifted
     to 15/9 → 27/16 → 29/17 while the hand count stood at seventeen
     throughout, and the two were never the same set — the redone 33 is the
     29 headed sections' *current* count (32, the heading count having moved
     again since `0352116`) plus the one unheaded passage no heading-only grep
     would ever find, which is why 33 is not simply 29 plus a few. The
     covered/uncovered split is redone against all 33 rather than carried
     forward: **26 covered, 7 not** — 0003's four amendments are the backlog
     item 4 below still does not condemn, and the ADR 0028 paragraph is a
     newly surfaced uncovered-and-load-bearing member alongside ADR 0008's own
     two, taking the seat ADR 0026's addendum vacates on being reclassified
     covered (its opening states "No decision changes here" on the same terms
     the audit-amendments already get). Item 4's own alternative-count bullet
     — *"Condemns 16 of the 17 post-hoc additions on disk"* — is corrected
     the same way, to **28 of the 33**, with the old figure kept beside it.
     **Nothing here changes what the ruling decided**: the queue rule is still
     not widened to cover amendments as a class, for the same "unsatisfiable
     under concurrency" reason item 2 above already gives: the ratio moved
     (16 of 17 to 28 of 33) without the argument moving.
  4. **The trigger stays *outstanding*.** An amendment says in its own opening
     whether it was approved; one that says nothing reads as outstanding without
     anyone having to reconstruct who wrote it. **This read "ten of the
     seventeen"; per the `082959e7`/#757 recount above it is 26 of the 33** —
     the seven that are not are named in `docs/adr/README.md` ruling 3, and
     five of them (0003's four amendments) are still the backlog this decision
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

  **And the line reads 0064 at `07add3e`**, nine releases after it read 0058 —
  0059, 0061, 0062 and 0063 all landed, and only 0063 moved the line, because
  the contract is `max + 1` and the other three were below the maximum already
  on disk. The number is recorded once more only to date it: **0032, 0038, 0041,
  0053, 0058, 0064 — six readings of one line across five anchors**, which is
  the same six-item proof §6's `income.ts` bullet carries and is why the durable
  statement above is not a number.

  **And the line reads 0068 at `01974e5`**, eleven releases after it read
  0064 — 0065, 0066 and 0067 all landed, and this time all three moved the
  line, one after another, because each was the new maximum the moment it
  landed (`docs/adr/README.md`'s own paragraph walks through why: 0064 was
  unmerged when 0065's draft returned, so 0065 declined a number the way 0064
  had; 0066 declined for a reason that turned out not to hold, and landed as
  the number a guess would have taken anyway; 0067 moved the line to 0068,
  which that paragraph then had to correct in place — it had reserved 0067 for
  a different, still-unmerged branch, #493's, and the reservation moved to
  0068 instead). The number is recorded once more only to date it: **0032,
  0038, 0041, 0053, 0058, 0064, 0068 — seven readings of one line across six
  anchors**, one fewer than §6's `income.ts` bullet now carries (eight,
  because that sentence was already falsified once more before this file
  existed) — a different sentence in a different file, tracked separately; the
  two have moved together by coincidence of timing rather than by any rule
  tying them.

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

- **CLOSED on 2026-08-30 — and this entry is written for the first time in the
  same commit that records it closed, because §5 never held it while it was
  open.** ADR 0017 is `Accepted`, and its decision 7 reads, in full:
  *"Materials are just-in-time by default; holding is permitted, never
  required."* The code did the opposite. A build order reached
  `materials-pending` and stayed there until the player bought what it needed;
  the word *material* appeared nowhere on the visible HUD; so the code enforced
  a precondition the game never stated, against an accepted decision that had
  ruled the precondition out. **That is exactly this section's subject, and no
  anchor in the sequence above ever filed it here.**

  **What closed it, and when.** `a87b0d3`/#640 merged on 2026-08-30 and released
  as **v0.0.254**, inside the `898a16a..feb46af` window. A build order now buys
  what it needs at the press, from the treasury, at catalogue price
  (`JustInTimeMaterialsService`, `ConstructionProcurementSink`), and a player who
  pre-buys sees no change, because the deficit nets off both stock held and
  deliveries already paid for. `docs/HUD_PROJECTIONS.md` carries the correction
  in its own body, in both directions, and is quoted here rather than cited by
  line: *"the sentence above about the player having to buy first is now false,
  and the paragraph is kept rather than rewritten because the sequence it
  describes is what the defect was"*, and *"ADR 0017 decision 7 had already ruled
  the other way … so the code and an accepted decision had disagreed since
  #249"*. **The date is the ADR's own document's, not this pass's inference**:
  #249 is the slice that implemented answer 2's just-in-time shape in part.

  **Two things #640 left open, and neither is an editor's call nor a §5 entry.**
  What a fresh prison *starts* with is still unmade and is a session/economy
  decision; and the purchase the game now makes on the player's behalf is
  announced only inside the procurement fold — the exact fold the change exists
  so a player never has to find — which is player-facing copy and therefore the
  owner's under `AGENTS.md`. Both are recorded in
  `docs/research/2026-08-30-a-wall-that-buys-itself.md` §2b, the record #640
  landed with, and neither is an accepted decision the code contradicts, which
  is the test for belonging here.

  **Re-read at `0352116`, and the mechanism this entry describes has been
  rewritten under it without reopening it.** `a67b141`/#725 stopped the
  just-in-time pass buying *"one aggregated per-item lump all-or-nothing"* and
  made it walk `ConstructionSystem.orderedOrders()`, funding each whole order
  the treasury covers and skipping the ones it does not — the owner's rulings 9
  and 12 of #703, recorded as ADR 0081 decisions 1 and 2.
  `JustInTimeMaterialsService` and `ConstructionProcurementSink` both still
  exist, at `src/simulation/economy/just-in-time-materials.ts:281` (unmoved,
  re-derived at this anchor too) and `src/simulation/construction/materials-procurement.ts:213`
  — **this read `:213` from `0352116` through this anchor's own drafting and is
  now `:224`**, +11 from `61c4f384`/#731's ADR 0082 docblock, which lands
  directly above the `ConstructionProcurementSink` declaration to explain
  `placementSequence`; caught by opening the file rather than assumed, in the
  same file this entry's own subject (just-in-time procurement) already had a
  reason to open — and a build order
  still buys what it needs at the press from the treasury at catalogue price, so
  **the sentence that closed this entry is still true and its *"at the press"*
  is now the only part of it that is unconditional**: the scheduled pass funds
  per order rather than per pass, and an order the treasury cannot cover whole
  is skipped rather than half-filled. `ProcurementSystem.purchase` — the
  player's own Buy press — is deliberately unchanged and still spends the whole
  figure or none of it.

  **Re-read again at `b04e45f`, and the same two anchors were the ones this
  window's own subject had a reason to move.** #746 (ADR 0076's cancel-refund
  amendment, the owner's ruling 20) and #747 (ADR 0017 decision 8's ladder,
  ruling 19) both land docblocks in
  `src/simulation/economy/just-in-time-materials.ts` — the refund paths and
  the construction rung this entry's own class now also carries — and one of
  the two citations moved under them: `JustInTimeMaterialsService`'s class
  declaration, **`:281` from `0352116` through the previous anchor and now
  `:304`**, +23. `ConstructionProcurementSink`'s declaration is unmoved at
  `:224`: #746's two new methods on that interface
  (`refundAllocatedMaterials`, `refundSurplusDeliveries`) are appended after
  it closes rather than above it, the opposite placement from the docblock
  that moved the other citation. Neither #746 nor #747 touches decision 7's
  subject — a build order still buys what it needs at the press from the
  treasury at catalogue price, unconditionally, and the scheduled pass still
  funds per whole order — so this remains a citation correction and not a
  reopening, for the same reason the paragraph below already gives for #725's
  larger rewrite.

  **Re-read again at `26434e8e`, and this time it is the sink's declaration
  that moves and the class's turn to hold.** `JustInTimeMaterialsService`'s
  class declaration is **unmoved at `:304`**: #785 (ADR 0017's rung-
  equalisation amendment) lands two docblocks inside the class body — on the
  buy-at-the-press bound (now the same −1,250 a Buy press stops at, where it
  used to be shallower) and on the twenty-order-tail figure (explicitly not
  re-measured under the equalised rungs) — both below `:304`.
  `ConstructionProcurementSink`'s declaration, by contrast, moves for the
  first time this entry has recorded: `:224` → **`:251`**, +27, from #769's
  `ConstructionFundingRefusalReason` docblock landing above it in
  `materials-procurement.ts`. **That docblock is itself now stale, in a way
  worth naming rather than fixing here.** It cites the construction rung by
  value — *"the money that was refused was refused at the construction rung
  -- -2,000 under the owner's ruling 19 of 2026-08-31"* — and #785, six
  merges later in this same window, equalised that rung to the deliveries
  floor: `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS` is now a plain
  alias of `INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS`,
  −1,250 (`src/simulation/economy/treasury.ts:397`). The comment's
  *argument* survives untouched — the refusal is still uniquely the
  construction rung's, by construction rather than by a branch, and nothing
  about `ConstructionFundingRefusalReason` having one member depends on the
  rung's magnitude — but its stated figure describes a rung that no longer
  exists. Fixing a code comment is outside this commit's surface
  (`docs/adr/STATUS-QUEUE.md` alone), so this is handed over rather than
  silently corrected, in the same spirit §5 already hands over ADR 0081's
  pairing two paragraphs below. Neither #769 nor #785 touches decision 7's
  subject — a build order still buys what it needs at the press from the
  treasury at catalogue price, unconditionally, and the scheduled pass still
  funds per whole order — so this remains two citation corrections and one
  handed-over residue, not a reopening.

  **Re-read again at `33a4a22e`, and the handover from the paragraph above is
  checked rather than assumed still open — it is, and the sink's declaration
  moves a second time.** `grep -n "construction rung"
  src/simulation/construction/materials-procurement.ts` still returns line
  131's *"-2,000 under the owner's ruling 19 of 2026-08-31"*, five merges
  after the previous anchor recorded it stale and eleven after #785 actually
  equalised the rung — the comment has now been wrong for two consecutive
  anchors and this pass fixes neither, for the same reason the last one
  didn't: a code comment is outside a re-anchor's own surface. `ConstructionProcurementSink`'s
  declaration moves again, `:251` → **`:282`**, +31, from #782's two
  `nextOrderShortfallMinorUnits` docblocks (issue #771's second finding — the
  build queue panel now reads the cost of the *next* unfunded order rather
  than the sum of every unfunded order, because ADR 0081 decision 2 can fund
  a later, cheaper order while an earlier one still waits) landing above the
  stale docblock, not inside it. `JustInTimeMaterialsService`'s class
  declaration is **unmoved at `:304`**: #782's own shortfall-tracking code
  (`nextOrderShortfallMinorUnits`, `sawUnfundedOrder`) lands at `:517`
  onward, inside `procureForPendingOrders`, well below the declaration.
  Neither #782 nor anything else in this window touches decision 7's
  subject — a build order still buys what it needs at the press from the
  treasury at catalogue price, unconditionally — so this remains one citation
  correction and one handed-over residue, still not a reopening.

  **The handover is discharged at `315dbbb6`, and it took more than a digit.**
  Read against what the comment was actually claiming rather than swapped in
  place: its argument is `procureForPendingOrders` being the only caller that
  ever asks `Treasury.canAfford` under `'construction'`, which is a fact about
  *who calls*, never about the two floors' magnitudes — so the equalisation
  that made this docblock's number wrong left its argument intact, and fixing
  it was replacing the stale figure and citing #771's equalisation, not
  reworking the reasoning around it. Line 131 now reads the construction
  rung's current floor, -1,250, and names the ruling that moved it there
  (`src/simulation/construction/materials-procurement.ts`). The same pass
  swept the rest of the tree for the same stale claim — "-2,000" asserted as
  *today's* construction rung, without noting the equalisation — and found
  five more production instances of it, all corrected the same way in the
  same commit: `src/simulation/economy/procurement.ts`,
  `src/simulation/protocol/types.ts`, `src/ui/simulation-alerts.ts`,
  `src/simulation/economy/insolvency-rung-system.ts` (whose "why a system of
  its own" argument had actually leaned on the 750-unit gap between the two
  floors, so this one needed more than a citation — the crossing it describes
  is narrower now that a construction spend can only reach the deliveries
  floor rather than pass it, and the corrected text says so),
  `src/content/default-locale-en.ts`, and one test docblock,
  `tests/unit/simulation-refusals.test.ts`. Left alone, on purpose: the three
  ADRs that name -2,000 as history (0017, 0083, 0087 -- 0017 already carries
  the equalisation as its own amendment section), the dated research
  playtest notes, and the remaining `tests/*.playtest.ts` and
  `tests/*.test.ts` occurrences, which already narrate the change with dates
  and the #771 citation rather than asserting it as present fact. Full
  `vitest run` (378 files, 4,363 passed, 1 pre-existing skip) and both
  typecheck projects were run clean against the fix before it landed.

  **Re-read at `0e2eb7fb`, and the paragraph above has a citation this pass
  had to correct in the sentence that discharged the handover.** *"Line 131
  now reads the construction rung's current floor, -1,250"* is off by five
  lines. Opened here rather than trusted: line **131** is
  *"construction rung, and cannot be any other rung's, because no other caller
  ever reaches this list"*; the retired figure is marked in both directions at
  **`:132-133`** (*"That rung was -2,000 under the owner's ruling 19 of
  2026-08-31; it is not any more."*); and the live -1,250, with the
  `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS ===
  INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS` identity beside it, is at
  **`:136`**, inside a docblock that now runs **`:115-150`**. **The fix itself
  is real and nothing about the discharge changes** — only the line number was
  wrong, and it was wrong on the tree that wrote it, four days ago, by the
  pull request that had the file open. That is the shape
  `docs/AGENT_WORKFLOW.md` §4 names — *"a `file:line` into a document under
  active edit is the least durable citation here; a quoted sentence is the
  most"* — landing inside a paragraph whose entire subject is a comment that
  went stale, which is why it is corrected in place rather than merely noted.
  **And the citation this entry actually depends on moved with it**:
  `ConstructionProcurementSink`'s declaration, **`:282` → `:293`**, +11, from
  #796's own expansion of that docblock landing above it — the third
  consecutive anchor at which this one span has moved, and the third
  consecutive time the cause was a docblock inserted above a declaration
  nobody edited. `JustInTimeMaterialsService`'s class declaration is not
  re-derived here, because `src/simulation/economy/just-in-time-materials.ts`
  is **not** in this window's forty-two files and so is not a member of this
  pass's set; its last derived value, `:304`, stands on the previous anchor's
  authority and is marked as such rather than silently restated as current.
  Nothing in this window touches ADR 0017 decision 7's subject — a build order
  still buys what it needs at the press, from the treasury, at catalogue
  price, and the scheduled pass still funds per whole order — so this remains
  one citation correction, one citation moved, and no reopening.

  **This does not reopen the entry and it is worth saying why**, because the
  change is large and the temptation is to reopen anything large. ADR 0017
  decision 7 says materials are just-in-time by default and holding is permitted
  and never required; funding one whole order at a time is still just-in-time
  and still requires no holding. **What #725 changed is the granularity of a
  mechanism this entry says exists, not whether it exists**, and the decision
  that names the granularity is ADR 0081 — `Proposed`, not accepted, with its
  own decisions 1 and 2 already on `main`. That pairing belongs in §5's first
  bullet as an outstanding decision without a §2 row, and it is recorded there,
  not here.

  **Why this is filed as a finding about the method rather than as an oversight
  to apologise for.** §5's membership is created by somebody writing an entry,
  exactly as §2's is. Both derivation scans the header prescribes check
  *citations* — a path that is written down, a number that is written down — so
  an accepted decision nobody ever wrote an entry about is invisible to both, to
  the anchor gate, and to every other gate in this repository. **This is the
  first instance of that class the file has recorded**, and the class is the
  point: the scans measure drift in what §§3-6 already say, and nothing measures
  what they do not say. The check that would is the one the header already
  names for a different purpose — reading the corpus against the file rather
  than the file against itself — and it is not cheap, which is why this entry
  states the limit instead of pretending to have closed it.

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
  **Corrected, 2026-08-29 (#169, #505): the comment this bullet describes no
  longer exists, and the fact it stated no longer holds.** #505 rewrote the
  file "from `DEFECT`-pinning to fixed-behaviour pinning" — its own commit's
  words — replacing the paragraph this bullet quoted with one headed *"The
  decision taken (#169, ADR 0026 question 1, option A)"* (`:31`), which cites
  no `Proposed` status at all. And the fact side is falsified independently of
  the wording: ADR 0026's three questions are no longer all open. Question 2
  (recycling) was answered as option C before this anchor; question 1
  (exhaustion) is answered now, as option A, dated in ADR 0026's own
  *"Amendment, 2026-08-29 (#169)"*; only question 3 (`submitIntake` re-intake)
  remains, which is exactly what the next bullet already says about
  `prisoners-intake-system.test.ts`. So this bullet's subject — a stale
  comment calling an Accepted ADR `Proposed` — is retired rather than merely
  re-read: the class of defect it recorded is gone from this file, not moved.
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

  **FALSIFIED a third time at `07add3e`, in the same direction again, nine
  releases later: it is seventeen.** 0059, 0061, 0062 and 0063 joined the
  thirteen, derived the same way — the first non-blank line under each
  document's `## Status` heading, which is what
  `adr-status-reference-contract.test.ts` reads, cross-checked against
  `docs/adr/README.md` row by row. **So the count has now been nine, one, one,
  none, nine, thirteen and seventeen — seven readings of one sentence in one
  file, across five anchors.** The live consequence in §5's first bullet has
  moved with it: seventeen outstanding decisions, **two** §2 rows. Each
  restatement was correct on the day it was made, which is the argument rather
  than an excuse for making a seventh: *a count of documents in a status is
  something the index already computes, so prose should not restate it*.
  `income.ts` itself still carries no count at all, re-read at this anchor on a
  file `git diff` reports as untouched — **which is the point**: the sentence
  that keeps rotting is this file's own record of the correction, not the
  correction.

  **FALSIFIED an eighth time at `01974e5`, in the same direction, eleven
  releases later: it is twenty-one.** 0064, 0065, 0066 and 0067 joined the
  seventeen, derived the same way. **So the count has now been nine, one, one,
  none, nine, thirteen, seventeen and twenty-one — eight readings of one
  sentence in one file, across six anchors.** The live consequence in §5's
  first bullet has moved with it: twenty-one outstanding decisions, still
  **two** §2 rows. `income.ts` gained 240 lines in this window — #488's needs-
  grant work, the only commit touching this file in the window to this anchor
  — which makes this the first of the eight readings where
  the file itself changed rather than being re-read on an untouched tree, and
  it **still carries no count**, re-verified by grep rather than assumed. That
  is the strongest confirmation yet of the rule this bullet exists to argue
  for: a count of documents in a status is something the index already
  computes, so prose should not restate it — and a file that changed
  substantially and still restates nothing cannot be accused of having simply
  not been touched.

  **FALSIFIED a ninth time at this anchor, in the same direction, seven
  releases later: it is twenty-two.** 0068 joined the twenty-one. **So the
  count has now been nine, one, one, none, nine, thirteen, seventeen,
  twenty-one and twenty-two — nine readings of one sentence in one file,
  across seven anchors.** The live consequence in §5's first bullet has moved
  with it: twenty-two outstanding decisions, still **two** §2 rows.
  `income.ts` is untouched in this window — not among the sixty-one files the
  diff reports — so this reading is on the same tree as the previous one, and
  it still carries no count, re-verified by grep rather than assumed.

  **FALSIFIED a tenth time, at `cfab558`, in the same direction, thirty-one
  releases later: it is twenty-seven.** 0069, 0070, 0071, 0073 and 0074 joined
  the twenty-two, derived the same way. **So the count has now been nine, one,
  one, none, nine, thirteen, seventeen, twenty-one, twenty-two and
  twenty-seven — ten readings of one sentence in one file, across eight
  anchors.** The live consequence in §5's first bullet has moved with it:
  twenty-seven outstanding decisions and **three** §2 rows, the first time
  that second number has moved since `07add3e`. `income.ts` is untouched in
  this window too — not among the fifty-three files the diff reports — and it
  still carries no count, re-grepped rather than assumed.

  **FALSIFIED an eleventh time, at `53e1405`, in the same direction, seven
  releases later: it is thirty.** 0075, 0076 and 0077 joined the twenty-seven,
  derived the same way. **So the count has now been nine, one, one, none,
  nine, thirteen, seventeen, twenty-one, twenty-two, twenty-seven and thirty —
  eleven readings of one sentence in one file, across nine anchors.** The live
  consequence in §5's first bullet has moved with it: thirty outstanding
  decisions and still **three** §2 rows. `income.ts` is untouched in this
  window too — not among the fifty-eight files the diff reports — and it still
  carries no count, re-grepped rather than assumed (`grep -n "Proposed"
  src/simulation/economy/income.ts` returns nothing at `53e1405`).

  **FALSIFIED a twelfth time, at `0637ab1`, and for the first time DOWNWARD:
  it is twenty-nine.** 0075 and 0076 left the set by being accepted at
  `f0b98aa`/#606 and 0078 joined at `19482be`/#612, derived the same way. **So
  the count has now been nine, one, one, none, nine, thirteen, seventeen,
  twenty-one, twenty-two, twenty-seven, thirty and twenty-nine — twelve
  readings of one sentence in one file, across ten anchors, and eleven of the
  twelve moved it up or held it.** The live consequence in §5's first bullet
  has moved with it, in both terms and in opposite directions for the first
  time: twenty-nine outstanding decisions and **four** §2 rows.

  **FALSIFIED a thirteenth time, at `898a16a`, ten releases later: it is
  thirty.** 0079 joined the twenty-nine at `9a25700`/#659 and nothing left,
  derived the same way. **So the count has now been nine, one, one, none,
  nine, thirteen, seventeen, twenty-one, twenty-two, twenty-seven, thirty,
  twenty-nine and thirty — thirteen readings of one sentence in one file,
  across eleven anchors, and the second time the run has returned to a value
  it already held: `nine` recurred at the fifth reading, after `one`, `one`
  and `none`.** The live consequence in §5's first bullet has
  moved with it in one term only: thirty outstanding decisions and still
  **four** §2 rows.

  **FALSIFIED a fourteenth time, at `df46980` (v0.0.281), five releases later:
  it is twenty-nine.** 0051 left the thirty by being accepted at
  `445f546`/#647 and nothing joined, derived the same way. **So the count has
  now been nine, one, one, none, nine, thirteen, seventeen, twenty-one,
  twenty-two, twenty-seven, thirty, twenty-nine, thirty and twenty-nine —
  fourteen readings of one sentence in one file, across eleven anchors and one
  correction commit that is deliberately not an anchor, and the third time the
  run has returned to a value it already held.** `nine`
  recurred at the fifth reading and `thirty` at the thirteenth; `twenty-nine`
  now recurs at the fourteenth. **A count that has returned to an earlier
  value three times in fourteen readings is not a trend at all**, which is
  this bullet's own subject stated as arithmetic rather than as prose: the
  sentence in `income.ts` never named an ADR, so no reading of it has ever
  been able to say *which* decision it meant, and the number moving up and
  back tells a reader nothing they could act on. The live consequence in §5's
  first bullet has moved with it in one term only, and in the improving
  direction for the first time since `0637ab1`: **twenty-five** outstanding
  decisions and still **four** §2 rows.

  **FALSIFIED a fifteenth time, at `0352116` (v0.0.301), twenty releases
  later: it is thirty-two.** 0081 (`0514458`/#708) and 0082 (`c5f2db5`/#712)
  joined the twenty-nine inside the
  *previous* window and 0083 at `a11261a`/#715 inside this one, and nothing
  left, derived the same way. **So the count has now been nine, one, one, none,
  nine, thirteen, seventeen, twenty-one, twenty-two, twenty-seven, thirty,
  twenty-nine, thirty, twenty-nine and thirty-two — fifteen readings of one
  sentence in one file, across twelve anchors and one correction commit that is
  deliberately not an anchor.** The live consequence in §5's first bullet has
  moved with it in one term only, and in the worsening direction:
  **twenty-eight** outstanding decisions and still **four** §2 rows.

  **And this reading IS a lag, which ends the run of four the paragraph below
  records.** *"It is twenty-nine"* was correct at `df46980` and went false when
  0081 landed at `0514458`/#708, with 0082 following at `c5f2db5`/#712, both
  inside the `58220f7..a54899a` window —
  the window the previous anchor measured, whose own account in this file's
  header names *"ADRs 0081 and 0082"* as content of it. **So the pass that knew
  about both documents is the pass that left this sentence at twenty-nine**,
  which is not the mechanism any earlier lag in this bullet had: every previous
  one was a pass that had not looked. This one looked, wrote the documents into
  the header, and did not carry the number three thousand lines down. The four
  places that count §2 have a sweep and the three that count `Proposed` do not,
  and that asymmetry is now the whole explanation. **A next editor who has time
  for one more check should grep this file for the last-written `Proposed`
  tally and compare it with `grep -cE '^\|.*\| *\*{0,2}Proposed'
  docs/adr/README.md`** — one command, three sites, and it would have caught
  this at the previous anchor.

  **`income.ts` did NOT change in this window either, so the absence is
  inherited for the second consecutive anchor.** It is not among the **101**
  files `git diff --name-only a54899a..0352116` reports — the *widest* window
  this bullet records, against the 17 at `df46980` which was the narrowest — and
  `grep -c "Proposed" src/simulation/economy/income.ts` returns **0** at
  `0352116`, re-grepped rather than assumed but against a file nothing touched.
  That is the weaker of the two results and is reported as such, for the reason
  the `898a16a` reading gave. **The width is worth one clause**: a 101-file
  window that does not touch this file is stronger evidence of the sentence's
  irrelevance than a 17-file one that does not, and neither is evidence that
  anybody read it.

  **FALSIFIED a sixteenth time, at `4ac0973` (v0.0.309), eight releases later:
  it is thirty-one.** 0082 left the thirty-two — `61c4f384`/#731 accepts and
  implements it in the same commit — and nothing joined, derived the same way.
  **So the count has now been nine, one, one, none, nine, thirteen, seventeen,
  twenty-one, twenty-two, twenty-seven, thirty, twenty-nine, thirty,
  twenty-nine, thirty-two and thirty-one — sixteen readings of one sentence in
  one file, across thirteen anchors and one correction commit that is
  deliberately not an anchor.** The live consequence in §5's first bullet has
  moved with it: **twenty-seven** outstanding decisions, still **four** §2
  rows. `income.ts` is untouched in this window — not among the **61** files
  `git diff --name-only 0352116..4ac0973` reports — and it still carries no
  count, re-verified by grep rather than assumed: `grep -c "Proposed"
  src/simulation/economy/income.ts` returns **0** at `4ac0973`, on the same
  tree as the previous reading.

  **FALSIFIED a seventeenth time, at `b04e45f` (v0.0.319), ten releases
  later: it is thirty-three.** 0084 and 0085 joined the thirty-one and
  nothing left, derived the same way. **So the count has now been nine, one,
  one, none, nine, thirteen, seventeen, twenty-one, twenty-two, twenty-seven,
  thirty, twenty-nine, thirty, twenty-nine, thirty-two, thirty-one and
  thirty-three — seventeen readings of one sentence in one file, across
  fourteen anchors and one correction commit that is deliberately not an
  anchor.** **The live consequence in §5's first bullet is corrected rather
  than merely moved with it, and by more than this window's arithmetic
  alone**: re-read against §5's own copy at this anchor, the two had
  disagreed since somewhere before `cfab558` — this bullet kept climbing
  (twenty-seven, thirty, twenty-nine, thirty-two, thirty-one at the last five
  anchors) while §5's own text stopped at *"exceptions are three"* and never
  picked up ADR 0071's or ADR 0077's §2 entries. Re-derived here from
  `docs/adr/README.md` and §2's own eight entries directly: five of the
  thirty-three carry a §2 entry (0056, 0059, 0074, 0071, 0077), so the
  outstanding count is **twenty-eight** rather than the twenty-seven this
  bullet's own arithmetic would have given by adding two to thirty-one.
  `income.ts` is untouched in this window — not among the **60** files
  `git diff --name-only 4ac0973..b04e45f` reports — and it still carries no
  count, re-verified by grep rather than assumed: `grep -c "Proposed"
  src/simulation/economy/income.ts` returns **0** at `b04e45f`, on the same
  tree as the previous reading.

  **FALSIFIED an eighteenth time, at `5144eb9e` (v0.0.328), nine releases
  later: it is thirty-four.** 0084 left the thirty-three by being accepted at
  `8d04de84`/#754 and 0086 and 0087 joined, net **+1**, derived the same way.
  **So the count has now been nine, one, one, none, nine, thirteen,
  seventeen, twenty-one, twenty-two, twenty-seven, thirty, twenty-nine,
  thirty, twenty-nine, thirty-two, thirty-one, thirty-three and thirty-four —
  eighteen readings of one sentence in one file, across fifteen anchors and
  one correction commit that is deliberately not an anchor.** The live
  consequence in §5's first bullet moves with it in one term only, the
  exceptions being unaffected by any of the three ADRs this window moved:
  **twenty-nine** outstanding decisions, still **five** §2 rows. `income.ts`
  is untouched in this window — not among the **58** files
  `git diff --name-only b04e45f..5144eb9e` reports — and it still carries no
  count, re-verified by grep rather than assumed: `grep -c "Proposed"
  src/simulation/economy/income.ts` returns **0** at `5144eb9e`, on the same
  tree as every previous reading.

  **STILL THIRTY-FOUR at `26434e8e`, twelve releases later — the first
  reading in this sequence at which nothing moved at all.** None of ADR
  0084's, 0085's or 0087's amendments in this window's eleven merges flips a
  status: 0084 stays `Accepted` (its decision 4 is signed but the document
  does not re-open), 0085 stays `Proposed` (its addendum records a measured
  deviation without resolving decision 2), 0087 stays `Proposed` (its
  decision 2 is amended and signed but decisions 1, 3 and 4 are unaffected).
  **So the count has now been nine, one, one, none, nine, thirteen,
  seventeen, twenty-one, twenty-two, twenty-seven, thirty, twenty-nine,
  thirty, twenty-nine, thirty-two, thirty-one, thirty-three, thirty-four and
  thirty-four — nineteen readings of one sentence in one file, across
  sixteen anchors and one correction commit that is deliberately not an
  anchor.** The live consequence in §5's first bullet is unaffected in
  every term: still **twenty-nine** outstanding decisions, still **five**
  §2 rows. `income.ts` is untouched in this window — not among the **101**
  files `git diff --name-only 5144eb9e..HEAD` reports — and it still
  carries no count, re-verified by grep rather than assumed: `grep -c
  "Proposed" src/simulation/economy/income.ts` returns **0** at `26434e8e`,
  on the same tree as every previous reading.

  **That claim about §5's first bullet was checked here and not there, which
  is itself the finding this anchor's own pass 3 records above.** This
  sentence read "unaffected in every term" and was right about the *number*
  — twenty-nine outstanding, five §2 rows, both correct — and silent about
  the fact that §5's first bullet's own text had no dated paragraph saying so
  until this anchor added one. So the claim in this bullet was true and the
  bullet it pointed at was, for one anchor, an assertion the reader could not
  verify by turning to it. Both are corrected now: §5's first bullet carries
  its own `26434e8e`-and-`33a4a22e` paragraph, and this sentence no longer
  stands alone as the only place that said so.

  **STILL THIRTY-FOUR at `33a4a22e`, six releases later — `docs/adr/README.md`
  is not among this window's 47 files, so nothing here could have moved and
  nothing needed to be flipped to stay unmoved.** `income.ts` is untouched in
  this window either — not among the **47** files `git diff --name-only
  26434e8e..HEAD` reports — and it still carries no count, re-verified by
  grep rather than assumed: `grep -c "Proposed" src/simulation/economy/income.ts`
  returns **0** at `33a4a22e`, on the same tree as every previous reading.
  **So the count is now nine, one, one, none, nine, thirteen, seventeen,
  twenty-one, twenty-two, twenty-seven, thirty, twenty-nine, thirty,
  twenty-nine, thirty-two, thirty-one, thirty-three, thirty-four, thirty-four
  and thirty-four — twenty readings of one sentence in one file, across
  seventeen anchors and one correction commit that is deliberately not an
  anchor.** The live consequence in §5's first bullet is unaffected in every
  term and this time says so in both places: still **twenty-nine** outstanding
  decisions, still **five** §2 rows.

  **STILL THIRTY-SEVEN at `1547c7f6`, six releases later — the first reading
  since `33a4a22e` at which the number did not move, and the second taken
  with all four counting places already agreeing.** No `Proposed` ADR arrived
  and none was accepted: the only file under `docs/adr/` among this window's
  21 is `STATUS-QUEUE.md` itself, so nothing here could have moved and nothing
  needed flipping to stay unmoved. **So the count is now nine, one, one,
  none, nine, thirteen, seventeen, twenty-one, twenty-two, twenty-seven,
  thirty, twenty-nine, thirty, twenty-nine, thirty-two, thirty-one,
  thirty-three, thirty-four, thirty-four, thirty-four, thirty-six,
  thirty-seven and thirty-seven — twenty-three readings of one sentence in
  one file, across twenty anchors and one correction commit that is
  deliberately not an anchor.** The live consequence in §5's first bullet is
  unaffected in every term and says so in its own text at this anchor: still
  **thirty-two** outstanding decisions, still **five** §2 rows (0056, 0059,
  0074, 0071, 0077). **The reading order was kept the same on purpose** —
  §5's first bullet first, then §3's opening, then this bullet — because a
  window that moves nothing cannot tell whether the order matters, and
  varying it here would have spent the one control a quiet window offers.
  **`income.ts` did not change in this window**: it is not among the **20**
  files `git diff --name-only 9b8c8e85..1547c7f6` reports outside this one,
  and `grep -c "Proposed" src/simulation/economy/income.ts` returns **0** at
  `1547c7f6`, re-grepped rather than assumed but against a file nothing
  touched — the weaker of the two results, reported as such for the sixth
  consecutive anchor.

  **THIRTY-NINE at `3f8c00b0`, and this chain has a SIX-ANCHOR HOLE in it that
  this reading does not paper over.** The sequence above ends at thirty-seven,
  `1547c7f6`, and the next reading of it is this one: no anchor at v0.0.372,
  v0.0.377, v0.0.383, v0.0.388, v0.0.393 or v0.0.402 extended it, and neither
  did §5's first bullet, which stopped in the same window. **The two mirrors
  went stale together, which is the third instance of exactly the split both of
  them already record** — and the previous two were found the same way, by
  reading one against the other rather than by any diff. **So the count is now
  nine, one, one, none, nine, thirteen, seventeen, twenty-one, twenty-two,
  twenty-seven, thirty, twenty-nine, thirty, twenty-nine, thirty-two,
  thirty-one, thirty-three, thirty-four, thirty-four, thirty-four, thirty-six,
  thirty-seven, thirty-seven and thirty-nine — twenty-four readings, and the
  values the six skipped anchors would have contributed are named from §3's own
  chain (thirty-nine at `aa762112`, forty at `f36148d7`, forty at `402453a9`)
  and deliberately NOT counted as readings of this sentence, because this
  sentence did not take them.** **The number moved by an acceptance rather than
  an arrival, for the first time in twenty-four readings**: ADR 0093 crossed
  from `Proposed` to `Accepted` in #863 and nothing arrived, so forty became
  thirty-nine. The live consequence in §5's first bullet moves with it and says
  so in its own text at this anchor: **thirty-four** outstanding decisions,
  still **five** §2 rows (0056, 0059, 0071, 0074, 0077), and a ninth §2 entry
  that the subtraction cannot use. **The reading order was §5's first bullet,
  then §3's opening, then this bullet** — the same order the last two readings
  used — and it is worth saying that the order was not what failed this time:
  all three were read in one pass and what had failed was that no pass had read
  any of them for six anchors. **`income.ts` did not change in this window**:
  it is not among the **63** files `git diff --name-only 402453a9..3f8c00b0`
  reports outside this one, and `grep -c "Proposed"
  src/simulation/economy/income.ts` returns **0** at `3f8c00b0`, re-grepped
  rather than assumed but against a file nothing touched — the weaker of the
  two results, reported as such for the seventh consecutive anchor.

  **THIRTY-SEVEN at `9b8c8e85`, seven releases later — the number moved for
  the second consecutive anchor, and this is the first reading in the sequence
  taken when all four counting places already agreed.** One `Proposed` ADR
  arrived (0091, #777/#780, landed by #800) and nothing was accepted, so the
  set gains one. **So the count is now nine, one, one, none, nine, thirteen,
  seventeen, twenty-one, twenty-two, twenty-seven, thirty, twenty-nine,
  thirty, twenty-nine, thirty-two, thirty-one, thirty-three, thirty-four,
  thirty-four, thirty-four, thirty-six and thirty-seven — twenty-two readings
  of one sentence in one file, across nineteen anchors and one correction
  commit that is deliberately not an anchor.** The live consequence in §5's
  first bullet moves with it and says so in its own text at this anchor:
  **thirty-two** outstanding decisions, still **five** §2 rows (0056, 0059,
  0074, 0071, 0077). **The reading order was reversed again on purpose** —
  §5's first bullet first, then §3's opening, then this bullet, the same order
  the previous anchor used — because the split this bullet and that one have
  twice fallen into is a function of which is read first, and repeating the
  order that produced no split is the only way to tell whether the order was
  what fixed it. **`income.ts` did not change in this window**: it is not
  among the **44** files `git diff --name-only 0e2eb7fb..HEAD` reports, and
  `grep -c "Proposed" src/simulation/economy/income.ts` returns **0** at
  `9b8c8e85`, re-grepped rather than assumed but against a file nothing
  touched — the weaker of the two results, reported as such for the fifth
  consecutive anchor.

  **THIRTY-SIX at `0e2eb7fb`, five releases later — and this is the first
  reading in this sequence at which the number MOVED in three anchors.** Two
  `Proposed` ADRs arrived (0089, #791; 0090, #788) and one arrived already
  `Accepted` (0088, #740), so the set gains two and not three. **So the count
  is now nine, one, one, none, nine, thirteen, seventeen, twenty-one,
  twenty-two, twenty-seven, thirty, twenty-nine, thirty, twenty-nine,
  thirty-two, thirty-one, thirty-three, thirty-four, thirty-four, thirty-four
  and thirty-six — twenty-one readings of one sentence in one file, across
  eighteen anchors and one correction commit that is deliberately not an
  anchor.** The live consequence in §5's first bullet moves with it and says
  so in its own text at this anchor: **thirty-one** outstanding decisions,
  still **five** §2 rows (0056, 0059, 0074, 0071, 0077). **The reading order
  was reversed on purpose this time** — §5's first bullet was opened and
  re-derived *first*, then §3's opening, then this bullet — because the split
  this bullet and that one have twice fallen into is a function of which is
  read first and which is asserted on the other's behalf, and no anchor had
  yet varied it. **`income.ts` did not change in this window**: it is not
  among the **42** files `git diff --name-only 33a4a22e..HEAD` reports, and
  `grep -c "Proposed" src/simulation/economy/income.ts` returns **0** at
  `0e2eb7fb`, re-grepped rather than assumed but against a file nothing
  touched — the weaker of the two results, reported as such for the fourth
  consecutive anchor.

  **`income.ts` did NOT change in this window, and the absence is inherited
  rather than re-established.** It is not among the **17** files
  `git diff --name-only 004f799..df46980` reports — narrower than any window
  this bullet records, the next narrowest being the 27 files at `004f799` — and `grep -c "Proposed"
  src/simulation/economy/income.ts` returns **0** at `df46980`, re-grepped
  rather than assumed but against a file nothing touched. That is the weaker of
  the two results and is reported as such, for the reason the `898a16a` reading
  gave: a grep over an untouched file rests on the file not having moved.

  **And this reading is not a lag either, which makes four consecutive passes
  without one.** The `898a16a` pass moved this bullet with the header, the
  `feb46af` and `004f799` passes each opened it and found it correct, and this
  commit moves it with the other three sites in the same change. **Four passes
  of agreement is the longest run this file has recorded** and it is
  still not a habit — the mechanism that broke them is not prevented by
  anything mechanical, and the header now records what was measured this time:
  `adr-status-reference-contract` passes with all four sites stale, so nothing
  in this repository can fail when they come apart.

  **`income.ts` did NOT change in this window, which ends a run of three
  anchors at which it had**, so the absence is inherited rather than
  re-established: it is not among the 45 files the diff reports, and `grep -c
  "Proposed" src/simulation/economy/income.ts` returns **0** at `898a16a`,
  re-grepped rather than assumed but against a file nothing touched. That is
  the weaker of the two results and is reported as such, for the same reason
  the `0637ab1` reading gave for the stronger one: a grep over an edited file
  rests on nothing, and a grep over an untouched one rests on the file not
  having moved.

  **`income.ts` DID change in this window, which breaks a run of four anchors
  at which it had not** — it is among the 89 files the diff reports, edited by
  #599's coverage-provisions-safety work. So the absence is re-established
  rather than inherited: `grep -c "Proposed" src/simulation/economy/income.ts`
  returns **0** at `0637ab1`, run against the edited file. That matters more
  than the four inherited readings before it, because those rested on the file
  not having moved and this one does not rest on anything.

  **And this reading is the first in the run that was not also a lag**, which
  is worth one sentence because the two paragraphs below are entirely about
  the lag. The tenth reading was moved into this bullet by the `cfab558` pass
  in the same commit that moved the header's copy; this eleventh one found the
  two agreeing and moved them together again. Two consecutive anchors at which
  the three `Proposed` counts and the header agree is not yet a habit, and the
  mechanism that broke them — a pass asserting a sweep it had not run — is not
  prevented by anything mechanical, only by opening the three places. They
  were opened.

  **And the ninth reading stood here for three anchors after it stopped being
  true, which is the sharpest thing this bullet has ever had to say about its
  own subject.** *"It is twenty-two"* was correct at `4ace2da` (v0.0.177) and
  went false when 0069 landed at **#541**; three re-anchors passed, each
  moving the header's copy of the number, and none moved this one. The
  `85c1c29` pass went further and asserted, in the derivation subsection near
  the top of this file, that this bullet *"now enumerate[s] **twenty-three**
  `Proposed` documents"* — a claim about a sentence three thousand lines away
  that was false on the tree it was written against, and that no diff of any
  window could have raised, because nothing in this bullet had changed. **This
  is the argument this bullet exists to make, arriving from inside the
  bullet:** a count of documents in a status is something the index already
  computes, and prose that restates it goes stale in a place nobody is
  looking. The reading is left standing above rather than overwritten.

  **Found at this anchor (`4ace2da`), and it is the same class of defect as
  the title/§2 split recorded near the top of this file: this bullet had been
  contradicting itself, not diffably, since at least `01974e5`.** Immediately
  after the "ninth time… twenty-two" paragraph above, the text continued,
  unheaded, as the tail of a **sixth-time** reading it had already
  superseded: *"it is thirteen[…] So the count has now been nine, one, one,
  none, nine and thirteen — six readings of one sentence in one file[…]
  thirteen outstanding decisions, **one** §2 row."* Three later insertions —
  seventeen (`07add3e`), twenty-one (`01974e5`), twenty-two (`33510df`) — had
  each prepended a new paragraph above it without removing the one each
  superseded, so the bullet stated two different reading-counts (six and
  nine) and two different tallies (thirteen and twenty-two) for the same
  sentence in the same breath. Found by the check this file's own header
  prescribes — reading its paragraphs against each other, which no diff of
  any window would have raised, because no line in the superseded tail had
  changed since it was written. **Corrected by removing the superseded tail
  rather than by prepending a tenth paragraph**, since the count it restated
  is already given, correctly, above.

  One fact in the removed tail is not recorded anywhere else in this file and
  is kept: ADR 0031's acceptance (§1, `e560656`) dropped two stale line
  citations this entry had carried — `docs/adr/README.md:100` as "the single
  `Proposed` row" and `0031-build-queue-cancellation-surface.md:5` as its
  status line — rather than re-pointing them, because both sentences they had
  supported were gone by then. **The other half of this entry was already
  fixed before this change**: the *"ADR 0023 open, ADR 0028 proposed"*
  parenthesis is no longer in the file, which ADR 0028's phase 1 rewrote along
  with the measurement around it.
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
- `docs/adr/0015-actor-identity-allocation.md:159-163` — *"Accepting 0015
  without 0012 leaves the taxonomy it argues in still Proposed"*, describing a
  case that cannot arise. Both were accepted in the same commit, so item 1 of
  *What this asks a human to accept* is discharged and says so: *"**Both were
  accepted in the same commit**, so the taxonomy this ADR argues in is settled
  and the case this item guarded against — 0015 accepted while 0012 was not —
  cannot arise."* (This entry cited `:145-146`,
  which is now a passage about the name pool; the discharge is eight lines
  further down. **It then cited `:153-156`, and that landed on the sentence
  introducing the list rather than on item 1 — a plausible neighbour on the same
  subject, which is the worse kind of drift.** The quoted sentence *"Both were
  accepted in the same commit"* is at `:161` and has been at `:161` since at
  least `cfab558`, so this is a citation that was wrong on a tree nobody's window
  touched, corrected here to the item's own span. The quotation is the citation
  and the range is the aid.)
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
  and `ui-hud-messages.test.ts:269-275` (was `:218-224` until #827 added 51 lines above it; re-anchored at `aa762112`). Enumerated rather than totalled, for the
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

**The sixth pass, at `07add3e`, is the first taken while the gate was green, and
it is the reverse of the fifth in every respect that matters.** Stated so it can
be checked:

- **Every rooted `file:line` in §§3-6 was re-derived mechanically again** — the
  same extract-resolve-open-print check, over sixty rooted anchors plus the bare
  `:N` continuations enumerated above — and **nine moved**, all of them code:
  `state-machine.ts`'s `WorkerState` union (`:33-39` → `:34-40`), its four
  `transition()` sites (`:664`, `:799`, `:834`, `:1110` → `:671`, `:860`,
  `:895`, `:1171`) and its two handshake receivers (`:681`, `:711` → `:697`,
  `:727`); `intake-system.ts:403` and `:409` → `:442` and `:448`;
  `release.ts:156` → `:194`; `save-schema.ts:1164` → `:1182`; and ADR 0022's
  *"÷ 12.2 is 23.9"* line `:582` → `:588`. Every other anchor lands, including
  every one into a file the diff reports as untouched.
- **Every count in §§3-6 was re-derived and exactly one moved.** Unmoved:
  `simulationCommandSchema` still discriminates **thirteen**, `HudIntent` still
  declares **eighteen**, `protocol/handshake` still returns **nine** hits split
  4/2/3, the `.css` files under `src/ui/` are still **four**, the object ids
  outside `src/content/` are still **39** in **two** files (19 and 20), the
  `Amendment`/`Addendum` sections are still **27 across 16 ADRs**,
  `supabase/migrations/` still holds **twenty-three**, `src/services/telemetry/`
  still holds **fifteen**, `room-catalog.ts` still authors **eighteen**
  definitions with the string `capacity` occurring **zero** times in it, and
  `AWAITING_PRODUCER` is still empty. Moved: the `Proposed` documents, thirteen
  to **seventeen**, in the three places that state it. §2's entries also went
  three to four to **five**, but that is the sweep's finding rather than a
  count re-derived from disk.
- **What the pass found that no diff could have.** §2's heading has said *"Five
  entries"* since #485 while the header's opening paragraph and §5's preamble
  both still said four — **the identical split #467 caused nine releases
  earlier, in the identical two places**, which turns the header's prediction
  from a stated risk into a measured regularity. Nothing else in this pass came
  from the "already false when the window opened" class, which breaks a run of
  three consecutive anchors that each found one.
- **One claim withdrawn, one handover discharged, both by #483.** §5's
  `environment-art.ts` bullet said the documentation-links gate does not read
  `src/` comments and has no allowlist; both are now false, the dead
  `environment-art-coverage.test.ts` name it handed over is corrected in the
  source, and the decision it filed as *"a decision, not an edit"* was taken.
- **The fifth pass's closing sentence did not survive.** It read *"this is the
  first pass at which the counts, not the numbers, were the damage"*. At this
  anchor the numbers are the damage again and the counts held. **Two adjacent
  passes, opposite results, same method** — so neither is the general rule, and
  the durable statement is recommendation 1 itself: a code anchor is checked by
  grep in one command and is worth carrying; a prose count is checked by nobody
  and is worth deriving instead of restating.
- **What this pass is blind to, stated because a list of findings reads like
  coverage.** The delta half of it read fourteen files out of 122 and cannot see
  a claim that was already false when the window opened. The sweep half reads
  four sentences. The derivation half checks that the set names what §§3-6 cite,
  not that what §§3-6 say about them is true. **Nothing here read §§1-2, and
  nothing here re-measured a single behavioural claim** — every measurement in
  §5 is carried forward on the strength of its inputs still existing, which is
  what §5's ADR 0027 entry says about itself in terms.

**The fifth pass, at `c00b641`, was the first at which the rewrite paid and the
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
  `ui-hud-messages.test.ts:269-275` (moved from `:218-224` by #827, byte-identical, re-verified at `3f8c00b0`); `environment-art.test.ts:248` and `:256`;
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
