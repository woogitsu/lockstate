# Existing staff roles in the angled view

The Blender sources `actor.cook.base.blend`, `actor.medic.base.blend`, and `actor.staff.base.blend` already contain authored role detail and packed fabric textures. This work reuses those sources; it does not model duplicate actors or change their atlas rigs. The cook has a continuous apron and marked cap, the medic has a cap cross and side kit, and staff has a blue shoulder yoke and tool pouch. The renderer rejects a source if those defining objects or either rig pivot is missing, or if a texture is left unpacked.

The new `tooling/blender/render-role-actors-oblique.py` exports the same 24 yaw × 3 elevation catalog, 512×512 frame, 64 nominal pixels per tile, `pivotPx: [256, 256]`, and `[0, 0, 0]` camera target as the existing guard and prisoner catalogs. It first produced one real Blender preview per source at yaw 45°, elevation 45°: [cook](cook-preview-yaw45-elev45.png), [medic](medic-preview-yaw45-elev45.png), [staff](staff-preview-yaw45-elev45.png).

The transparent-pixel bounds of these previews are cook `(236,167)–(273,265)`, medic `(236,167)–(273,265)`, and staff `(236,171)–(274,265)`. The already published guard at the same pose is `(237,169)–(273,269)`, so the role sprites occupy almost the same on-screen scale with feet near the same pivot. The three preview PNGs are byte-identical to their corresponding published yaw 45°/elevation 45° catalog frames.

Blender 5.2.1 rendered **72 hashed poses per role, 216 total**. All frames passed the exporter’s transparent-border clipping check. The manifests `oblique-actor-{cook,medic,staff}.v1.json` preserve each existing `.blend` source hash and every published frame hash, and `oblique-module-registry.v1.json` lists the three new catalogs. The new catalog test checked the source/PNG hashes and the exact guard pose, scale and foot-pivot contract: **3/3 green**. Replacing the first cook frame hash with zeroes made that test **1 fail / 2 pass** with the expected SHA mismatch; restoring the manifest returned **3/3 green**. The rendered-art validator accepted **40 catalog entries**, including these roles; the existing actor-atlas validator accepted **10 clip atlases**, and TypeScript compilation passed.

This is an art and registry deliverable. The renderer’s role-ID consumer mapping and a production scene check remain separate work before these three roles appear in gameplay.

## Consumer integration and actual pixels

The combined branch now recognises the registered canonical cook/medic/staff identities and the real snapshot feed's prisoner/guard constants. Issue #1922 records the discovered mismatch: the initial mapper accepted only shortened fixture identities, while the session snapshot publishes actor.prisoner.base and actor.guard.base. The new regression imports those production constants; it fails before the explicit canonical mapping and passes after correction. Unknown identities still use the Graphics fallback.

The actual Full HD scene at45-degree yaw/elevation displays all three new role frames. Each role has more than100 changed canvas pixels when comparing its image visible versus hidden, and the exact three role texture identities are checked. Deliberately making actor alpha zero preserves those identities but fails with0 changed pixels; restoration passes1/1 in15.9seconds. The full authored-actor file passes4/4 in44.0seconds, including canonical prisoner/guard wall depth, actor image reuse and solid image reuse/depth while actors move. The screenshot was visually inspected.

![Blender cook medic and staff in the actual angled scene](blender-role-actors-fullhd.png)

The new role check uses an explicit render-feed fixture. The current session snapshot decoder publishes prisoners and guards, not cook/medic/staff positions. This change does not invent staff simulation positions or prove those populations' gameplay lifecycle, walking animation, facing, or Save/Load. That remaining integration must be completed before claiming that all five populations are active in gameplay. This is feature-branch runtime evidence, not a production release.
