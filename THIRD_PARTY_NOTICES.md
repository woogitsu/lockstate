# Third-party notices

`docs/research/ARCHITECTURE_PATTERN_AUDIT.md` requires that Apache-2.0 or
MIT-family code adapted into Lockstate preserve its required notices and add
an entry here, with source, commit, licence and modifications. This file is
that destination. It did not exist, so the rule named a mechanism that was
not there (issue #141).

## Adapted source

**None.** No file in `src/`, `scripts/`, `tooling/` or `tests/` carries a
third-party copyright line, an SPDX identifier, or an "adapted from"
attribution. Everything first-party in this repository is independently
written, which is what the audit's provenance rules require of it.

## What this file does *not* cover

- **Runtime and build dependencies** installed from npm. Their licences travel
  with the packages, and `pnpm-lock.yaml` pins exactly which versions ship. This
  file is only for third-party code **copied or adapted into this repository's
  own source**, which is the case the audit's rule is about.
- **Art and audio.** `public/game-content/source-art.v1.json` records every
  sheet as `owner-supplied, project-internal`, and
  `assets/contracts/character-8-direction.contract.json` governs the actor
  pipeline. Neither is third-party material.

## Adding an entry

One section per adapted source, with: where it came from, the exact commit or
release, the licence, and what was changed. Preserve any notice the licence
requires verbatim — an entry here does not replace a header the licence
mandates in the file itself.
