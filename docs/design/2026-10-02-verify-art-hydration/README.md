# Proposed verify input hydration

## Current decision — approved2026-10-02

The owner selected "Tak — dodaj ten krok i oba globy (zalecane)" through the clickable question in this conversation. This approves the prepared verify-job step with `assets/source/blender/*.blend,public/assets/environment/oblique/*.png`, including subsequent models in these directories. The exact patch has been applied; existing CI configuration, retry and partition guards pass58/58. Fresh Ubuntu exact-head CI remains required. The proposal below records what was submitted before approval; its waiting-state language is historical.

## Concrete observed blocker

Terminal PR1899 CI36997641989 reports21 authored-source SHA256 mismatches. The art audit independently matched every reported pair to the real committed LFS object ID and the SHA256 of its pointer text. The verify checkout does not hydrate LFS, while these new checks open actual Blender bytes. Strict frame hashes and decoded PNG borders also need real angled frames. This is an input-provisioning mismatch, not evidence of21 damaged models.

## Exact proposal awaiting the owner

Apply [this prepared patch](./ci-verify-art-hydration.patch) to `.github/workflows/ci.yml`: add one step before `pnpm verify`, using the same ephemeral token/header cleanup pattern as the existing browser job. Fetch exactly `assets/source/blender/*.blend,public/assets/environment/oblique/*.png`; no change to tests, thresholds, runners, browser filtering or deployment. The globs cover future authored sources and angled frames in these existing directories too.

This is a new verify-job step outside the previously approved browser LFS filter, so the repository's reservation requires an explicit owner choice. The live workflow is unchanged until that choice. The patch is reviewable and can be checked with `git apply --check` without applying it.

## Costs and alternatives

The verify job downloads those LFS objects rather than hashing tiny pointer files. A clean runner pays the network/storage cost. Hash assertions keep checking real bytes; invalid/corrupt sources and frames remain failures. Changing assertions to accept pointer IDs would check reference identity instead of downloaded content and would not exercise PNG decoding, so it is not the recommended substitute.

Weakest claim: the local diagnosis and patch syntax do not prove the fresh Ubuntu verify job completes; exact-head CI must confirm provisioning and the full gate after approval. Gameplay, UI and actual model acceptance continue independently while this decision is pending.
