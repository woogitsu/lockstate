# Genuine modern material/light draft: original Laundry linen rack

This is a bounded source/render draft for the owner's direction that the game should look modern and warmer rather than like a1990s RTS. It is not final visual acceptance or a production art replacement. The forthcoming modern reference is pending review; no full72 rerender, runtime dispatch change, browser/server/build or synthetic image has occurred.

## Actual cause and proposed change

The current published renderer sets `BLENDER_WORKBENCH`, `STUDIO`, `paint.sl`, `color_type=MATERIAL`. The actual retained Laundry source contains111authored mesh parts and12complete materials, including the2172?724 packed authored wood image and Principled steel/cloth shading. Workbench uses material display colour, so those node textures and roughness/metallic responses do not participate in the visible result. Source parts and full material graphs are already correct; the bounded proposal is to render their actual existing shader materials under broad soft area lights.

Draft uses genuine Blender5.2.1Cycles CPU/thread1,64fixed samples/seed0/no adaptive sampling/no denoising, restrained warm key450W/4unit diameter, neutral fill180W/5diameter, broad rear300W/3diameter; neutral world indirect strength.25, AgX/None/exposure0/gamma1. Palette RGBs/material node values and texture bytes are not changed. Original accepted18room palettes, gameplay, scale, footprint and maps/save/picking are untouched. Soft shadows are actual self-shadows inside the assembly; no floor plane/contact-ground shadow is added or claimed.

Both renders use exact original256?RGBA/canonical4tile orthographic span/64pixels-per-tile, pivot128/128, target(.5,.5,.7039999961853027), yaw60and300/elevation40. Both actual new Workbench before renders reproduce published PNG bytes exactly. The after images are real path-traced renders of the same model, not AI concepts or pasted texture replacements.

## Opened actual before/after samples

| Published Workbench reproduced | Original material nodes + soft area lighting |
| --- | --- |
| ![Before source60/e40](before-workbench-yaw60-elev40.png) | ![Draft after source60/e40](after-soft-original-materials-yaw60-elev40.png) |
| ![Before source300/e40](before-workbench-yaw300-elev40.png) | ![Draft after source300/e40](after-soft-original-materials-yaw300-elev40.png) |

All four genuine256px PNGs were opened. After rendering, texture/grain and physical metal highlights become visible; panels/rail cast actual self-shadow. The steel appears darker than Workbench's display colour. This is an honest material/light difference to judge against the forthcoming reference, not a claim that unchanged intrinsic RGBs make perceived palette identical. Object silhouette, proportions and111part/12graph/eightcontact assembly remain exactly the same. At64px per tile this rack is still a small sprite; lighting alone is not a complete modern art direction for the whole prison.

## Genuine source, invariants and hashes

Original released source SHA256: `779d11f79c28b8049ccd3371d840c75b52cd153439f3882e28c593d05dd964ec`. Saved actual draft `.blend`: `assets/source/blender/draft.laundry.linen-rack.soft-light.blend`. The saved draft is the existing min-corner export scene with the same111meshes/12material graphs and three actual area lights, canonical camera and render profile; it is intentionally not a new runtime fixture/source descriptor.

`actual-before-after.json` pins the draft .blend hash, all four PNG body hashes, exact before/after raw/evaluated geometry, complete stored material/texture graphs, normals, eight actual BVH triangle contact witnesses and canonical source bounds. All79protected original source/provenance/descriptor/72PNG/registry/context/room-palette files are byte-identical. Actual producer is `tooling/blender/render-modern-retained-material-draft.py`; it first invokes the existing strict Laundry source guard and canonical camera/PNG decoder. No authored component is filtered out.

Next checkpoint: bounded actual source/contact/camera/light-assembly negatives with exact restoration and one repeat sample, source-only tests/types; no large matrix or native result before owner/reference review.
