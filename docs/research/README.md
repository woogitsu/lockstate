# Research records

Dated evidence gathered to answer a specific open decision, kept because the
decision cites it.

These are **not** architecture decisions and they are not documentation of how
the code works. An ADR records what was decided; a file here records what was
known at the time it was decided, including what could not be established. They
are read-only history: when the code moves on, a record here does not become
wrong, it becomes older. Do not update one to match current `main` — write a new
one and let the ADR cite that instead.

## What makes a record trustworthy here

Each report labels every factual claim with how it was obtained, and the tiers
are not decoration:

- **VERIFIED** — a source was opened and read. In this repository's network
  environment that mostly means a shipped game data file or decompilation
  mirrored on `raw.githubusercontent.com`, which is reachable, and quoted
  verbatim.
- **SEARCH-SUMMARY** — a real page exists and a search tool summarised it, but
  the page itself was never opened. Weaker than VERIFIED and deliberately kept
  as its own tier rather than folded into it.
- **FROM MEMORY** — believed, not checked. Useful, and honest about being the
  weakest kind of claim.
- **UNKNOWN** — could not be established.

The tiers exist because of a specific failure. An earlier research round
produced roughly two hundred citations, and spot-checking twelve of the specific
factual claims found: two refuted outright (a keybinding attributed to a base
game that belongs to a mod, and one that does not exist at all), a starting
balance wrong by more than an order of magnitude, a currency range that silently
depended on a DLC nobody mentioned, and **a design opinion attributed by name to
a real developer that could not be sourced anywhere**. The claims that failed
were disproportionately the confidently precise ones.

So the standing rules for anything added here:

- Never invent a patch number, version, date, price or quote.
- Never average two figures you are unsure of into a range described as version
  variance. Say you are unsure of both.
- A forum post, a video tutorial or a search snippet is not a source for what a
  designer intended.
- Currency figures from other games are unusable for balancing this one unless
  genuinely sourced. Derive from this game's own costs instead.
- Name your own weakest claim, and say what would change your mind.

## Records

| Record | Question it answered | Decision it fed |
| --- | --- | --- |
| [2026-08-25 room zoning gesture](./2026-08-25-room-zoning-gesture.md) | What gesture designates a room, and where does the control live? | ADR 0022 |
| [2026-08-25 room occupancy](./2026-08-25-room-occupancy.md) | Where does a room's occupancy capacity come from? | ADR 0023 |
| [2026-08-25 economy rate](./2026-08-25-economy-rate.md) | What does the state pay per prisoner-day, on what cadence, from what balance? | [#29](https://github.com/matmaxalez/lockstate/issues/29), within ADR 0017 |
| [2026-08-26 failure modes](./2026-08-26-failure-modes.md) | What should failing look like, and what is the cheapest honest route to it from what already exists? | None yet — it states two shapes and declines to pick. **§3's mutual-exclusion finding is corrected in place** (#396): an *unhoused* arrival's `safety` does decay to zero, so overcrowding is the reachable pressure and a riot fires at tick 15,600 |
| [2026-08-26 repository audit](./2026-08-26-repository-audit.md) | Across every discipline at once, what is wrong with this repository at v0.0.108, and what should be done first? | None yet — it ranks work and names the decisions that need an ADR |
| [2026-08-28 risk tier and income](./2026-08-28-risk-tier-and-income.md) | Does a prisoner's `riskTier` change what the state pays, or what the prison spends? | None — it refutes an audit finding and proposes no change. ADR 0017 decision 6 stands |
| [2026-08-28 navigation tick budget](./2026-08-28-navigation-tick-budget.md) | What does a navigation tick cost, and may its budget be a wall clock? | **ADR 0066.** This cell read *"None yet — it carries an ADR draft awaiting a centrally assigned number"* and had been false since that number was assigned: the draft landed as `docs/adr/0066-what-a-navigation-tick-may-cost.md`, which the record's own §6 already links. Corrected here rather than left, and marked rather than overwritten, because a row that keeps saying "awaiting a number" after the number arrives is how this directory stops being readable. ADR 0009 stands unamended |
| [2026-08-29 sentence length at admission](./2026-08-29-sentence-length-at-admission.md) | Where does a sentence length come from — which thread, which RNG stream — and how long should it be? | [#535](https://github.com/matmaxalez/lockstate/issues/535) decision 5, and **ADR 0069**, whose draft this record carried and which has since landed with that number assigned centrally. The range itself is a proposal for the owner, not a settled call; §5's `priorIncidents` finding fed [#540](https://github.com/matmaxalez/lockstate/issues/540) |
| [2026-08-29 playtest: ordering and the second room](./2026-08-29-playtest-ordering-and-the-second-room.md) | Is *ordering* — walls before zoning — the wall a new player hits, and what is on the route past it? | None yet. It proposes no change. Its §7 is a finding with a measured mechanism and is handed to whoever owns `src/ui/**` and `src/rendering/**`; §2 is a product question for the owner; §3, §5 and the trackpad question are empty categories with the numbers behind them |
| [2026-08-28 drawing guards](./2026-08-28-drawing-guards.md) | Should a guard be drawn while `GuardRecord` still teleports, the question ADR 0059 open question 4 left open? | Answers that open question in place, within ADR 0040 slice 2 (issue #414's surviving half); no new ADR number taken |
| [2026-08-29 mouse playtest](./2026-08-29-mouse-playtest.md) | Playing with the mouse only, where does a new player stop being told what the game wants? | **None — [#569](https://github.com/matmaxalez/lockstate/issues/569) should be closed as not-a-defect.** The record originally concluded that a refused designation's explanation never reaches the player; §1 carries the correction, by the author, hours later: it reaches `.hud__refusal`, measured at 1440x32 and 900x32 with `role="status"`, which is #220's fix for the very 0x0 alerts row this re-derived. The measurements stand, the inference did not. The reproduction stays unmerged on `agent/playtest-mouse-route`; it is a harness, not a gate |

### Findings from the first four records that changed a decision

Recorded here because each contradicted something the project believed, and a
reader who only sees the resulting ADR will not know the belief was ever held.

**The first seven bullets were true on 2026-08-25 and the last three on
2026-08-26, and all of them are written in the present tense, which is a trap
this index laid for itself.** Each bullet belongs to the record it came from and
the table above says which; this sentence has to be re-read whenever a record is
added, which is the habit `docs/adr/STATUS-QUEUE.md` asks of its anchor line, for
the same reason and with the same failure available if nobody does. The rule
above — *"a record here does not
become wrong, it becomes older"* — protects the dated files, and it cannot
protect a summary that says "currently" and "today" in the index. So the bullets
keep what was found, because that is the point of the section, and each one that
the code has since overtaken says so inline. Adding a finding here means writing
it the same way.

Re-read on **2026-08-26** when the repository-audit record was added. That record fed no
decision and contributed no bullet, so the ten below still belong to the four records this
heading now names explicitly — the count moved out of the heading rather than being left to
drift, which is the failure the paragraph above describes.

Re-read again on **2026-08-28** when the risk-tier-and-income record was added. It fed no
decision and contributes no bullet either, so the ten below still belong to the same four
records. One bullet was checked against it specifically and survives: *"'Running out of
money' is not a failure mode either"* was written on 2026-08-26 and is still true on
`317f487` — the two `Treasury.spend` callers are both one-off and player-initiated, and
nothing debits on a schedule. That is expected to be overtaken by the recurring payroll
debit in progress on `agent/0042-step3-recurring-debit`; whoever lands it should mark this
bullet overtaken rather than deleting it, the way the two above it are marked.

- **Authoring one occupancy number per room type is a no-op.** `findAvailable`
  gates on capacity *and* on a `'sleep-surface'` capability, so a capacity
  number alone unblocks nothing. The minimum content change is two fields, not
  one.
- **Four of six comparable games have no room-capacity concept at all.**
  Prison Architect is the exception, and it uses a *different rule per
  designation* rather than one model.
- **"Prisoners would starve in an abstract box" is false.** Accommodation
  actions never check capability, so five of six needs become serviceable
  without any object; only hygiene requires one.
- **No game in the sample designates a nameless area and labels it later** —
  the shape the zoning question implicitly floated is genre-unattested. The
  real split is purpose-first painting versus fully derived rooms.
- **A mis-drag is currently permanent.** No command removes a zone, `Undo`
  reaches only the construction system, and re-zoning is blocked by
  `overlaps-existing-room` — so one stray drag creates unremovable room for the
  session, with no recovery at all on touch, where there is no undo key.
  **Overtaken:** this is the finding the Rooms tab was built to answer.
  `UnzoneRoom` is a command with a producer (#312, and #317 for the touch half),
  so a stray drag is recoverable with the same gesture that made it. The
  `overlaps-existing-room` refusal and the reach of `Undo` are both unchanged;
  what changed is that removal no longer has to go through either.
- **"Pack the prison" is not the reachable failure mode.** Occupancy is
  hard-gated, so overcrowding is unrepresentable; the strategy the economy has
  to price against is sprawl.
- **Construction is effectively instantaneous** — a wall completes in about
  2.5 seconds, with no labour cap and every order in parallel. Money, not
  time, is the only constraint on building today.
  **Overtaken in its second half (#348).** A single wall still finishes on the
  same tick it always did, so "a wall completes in about 2.5 seconds" survives
  unchanged. Orders are no longer parallel: one order holds the crew at a time
  and a waiting order takes it in the canonical ascending-id sequence, so a
  twelve-wall perimeter finishes at tick 730 rather than at 70. Money is
  therefore no longer the only constraint on building, which is the half of
  this finding an economy memo would have leaned on.

**Added 2026-08-26**, from the failure-mode record. The first two extend the
"pack the prison" bullet above rather than replacing it: that bullet is right,
and it stopped one step short of its own consequence.

- **"Running out of money" is not a failure mode either — it is not even
  representable.** `Treasury.spend` refuses rather than overdrawing, the balance
  is validated non-negative in four places, and nothing debits it on a schedule,
  so a running prison's balance is monotonically non-decreasing. The premise that
  money was the *one* failure mode understated the gap: there were none. Measured
  over ten in-game days with one housed prisoner, the balance closes at 27,935
  from an opening 25,000.
- **No incident can fire in any session a player can start, and the missing
  producer is not the reason.** `IncidentTriggerSystem` iterates a watched-sector
  array that only the restore path ever writes, and none of the eleven protocol
  commands creates a sector — but wiring one by hand does not help. Contraband
  pressure has no producer, so the risk score cannot exceed
  `0.5 x needsPressure + 0.3`; `needsPressure` reads the `safety` need alone; and
  `safety` is raised twenty times faster than it decays by the sleep action,
  which requires the very bed `AdmitPrisoner` refuses an arrival without.
  **The hard gate on occupancy and the riot trigger are wired in mutual
  exclusion.** Measured fully wired, with zero guards against a four-guard
  schedule: 0.32 against a 0.6 threshold, and no incident in 25 in-game days.
- **"Until a session/scenario registers them" defers to a caller that has never
  been written.** There is no scenario type, class or module under `src/` at all.
  The same deferral leaves the escape-opportunity resolver, the incident
  summariser, the incident alert projection and the whole tunnel registry with no
  caller in `src/` — the same class as issue #287's two uncalled capabilities,
  three layers deeper.
