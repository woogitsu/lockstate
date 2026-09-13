# Design deliveries

This directory holds **design material the owner delivered from outside this
repository**, kept verbatim. It is not a place for design decisions taken here:
a decision belongs in an ADR, and the repository-side statement of the direction
a delivery establishes belongs in [`docs/VISUAL_IDENTITY.md`](../VISUAL_IDENTITY.md).

Each delivery gets one dated subdirectory. Nothing under such a subdirectory is
edited after it lands — not to fix a typo, not to correct a claim, not to update
a path that has since moved. **A delivery is evidence of what the owner asked
for on a date, and an edited copy is no longer that.** Where a delivery is wrong
or has been overtaken, the correction is written *outside* it and says what it
corrects, which is the same rule `docs/AGENT_WORKFLOW.md` §4 applies to this
repository's own prose.

| Delivery | Date | What it is | Repository-side reading |
|---|---|---|---|
| [`2026-09-13-identity-v5/`](./2026-09-13-identity-v5/) | 2026-09-13 | Visual identity, HUD direction, product constitution and an interactive design prototype, generated with the owner outside this repository across five iterations | [`docs/VISUAL_IDENTITY.md`](../VISUAL_IDENTITY.md), [ADR 0112](../adr/0112-what-the-2026-09-13-identity-delivery-decides.md), [`docs/IDENTITY_V5_ROLLOUT.md`](../IDENTITY_V5_ROLLOUT.md) |

## What was removed from the 2026-09-13 delivery, and why

Six `.openai/hosting.json` files — one in the current prototype and one in each
of the five historical snapshots. They carry a hosting project id for a
**private static Site that already exists**, and the delivery's own
`START_TUTAJ.md` asks in its own words that they not be copied here:

> Pliki `.openai/hosting.json` zachowano w snapshotach dla kompletności.
> Identyfikują ISTNIEJĄCY prywatny Site. Nie kopiuj ich do repo gry ani nie
> używaj automatycznie do nowego wdrożenia.

("The `.openai/hosting.json` files were kept in the snapshots for completeness.
They identify an EXISTING private Site. Do not copy them into the game repo and
do not use them automatically for a new deployment.")

Everything else is byte-identical to what was delivered. `MANIFEST.json` in the
delivery carries a SHA-256 for every file it shipped, so the claim in the
previous sentence is checkable rather than merely asserted, and it was checked
rather than asserted. `python3 SPRAWDZ_PACZKE.py`, the delivery's own integrity
script, run inside this checkout, names **exactly** the six removed files and
nothing else:

```
FAILED: AKTUALNY_PROTOTYP/.openai/hosting.json, HISTORIA/01-pierwszy-kierunek/.openai/hosting.json, HISTORIA/02-warsztat-i-research/.openai/hosting.json, HISTORIA/03-panele-i-resize/.openai/hosting.json, HISTORIA/04-tryb-nocny/.openai/hosting.json, HISTORIA/05-audyt-i-konstytucja/.openai/hosting.json
```

85 files were delivered and 79 are here; the other 78 manifest entries match
their files' SHA-256. Re-running that script is how a future reader establishes
that this tree is still the delivery, and a failure naming anything but those
six lines means it is not.

## Why the tree is vendored rather than linked

The delivery arrived as a ZIP in a chat session. A session's uploads do not
survive the session, the private Site the prototype is published to is not
reachable from CI or from a future agent's container, and the five historical
snapshots exist nowhere else. Vendoring costs about 6.5 MB of unique bytes —
the tree is 27 MB on disk, but six of the seven copies of the 3.3 MB world
render are byte-identical and git stores one blob for all seven.
