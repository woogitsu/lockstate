# Cell toilet: actual rear ceramic transfer neck

## Source preparation checkpoint ? native acceptance pending

VERIFIED locally with the actual Blender5.2.1 LTS executable, upstream build9e2066aef7ef (executable SHA256284f4041f98e113f3dc10654a7193ffaaa9bfdfec8b87fa116620a48b5f6d4cb), not a build digest abbreviated as a Git commit.

The current default is `object.toilet` ? `fixture.cell.toilet_sink`, authoritative `toilet-brick`1?1. `cell-basic` places it at local(2,4). The historical asset name is retained; the actual model is a toilet and this work introduces no basin, gameplay identity, schema or copy. Prior source/history were inspected before authoring. The current44-part source already has corrected valve winding, seat hinge barrels/mounts/bolts and cistern joints. They are all retained.

[Original full inventory](actual-original-inventory-and-source-poses.json) records44 raw meshes, material indices/modifier RNA/world matrices/evaluated position hashes and8 full stored shader graphs. Original source `fixture.cell.toilet_sink.angled.blend` SHA256335544282e27ff01608f7f10987c054012d38ec3905340c24c142b7b794b1b2a is preserved byte for byte.

Actual evaluated cistern-band maximum Y?.20400001108646393 and bowl minimum Y?.19840000569820404 leave a strict separating Y-plane gap of .005600005388259888tile. This proves absence of direct band/bowl contact; the existing rear seat hinge may support the cistern assembly. This is **not** a claim that the whole cistern assembly was disconnected or that the previously correct source had inward normals.

The missing visible outlet passage is now one32-sided ceramic transfer neck, radius.07, length.23, centred(0,?.225,.555), using the existing warm glazed porcelain graph. It reaches under the cistern into the rear bowl. Actual evaluated triangle parity and nearest triangle surfaces, rather than bounding-box overlap alone, prove points inside both solids at both ends. Retained-target surface depths are .00749999285tile(cistern band) and .00161460321tile(bowl); see dedicated provenance. All44 original raw arrays, material indices, modifier RNA, matrices, evaluated position hashes/normals and8graphs/actions are identical. Full bounds stay min[?.3240000009536743,?.41200000047683716,.005000002682209015], max[.41600024700164795,.46217596530914307,1.102500081062317].

New source `fixture.cell.toilet_sink.angled-connection.blend` SHA256ebc1570274663d22315eed0adfafe8886120bdbf9901dfa744edcde540428ff8 contains45 parts. Its convex new neck has outward evaluated geometric winding; existing nonconvex bowl/torus normal records are preserved without falsely treating their concave faces as a defect.

[Actual original/new four-yaw comparison](actual-original-versus-connected-toilet-four-yaws.png) was opened and inspected. Both rows use the **same existing** EEVEE studio,512px/ortho8=64pixels per tile, fixed lighting/AgX/transparent film and camera target(.5,.5,.553750041872263). At yaw45/105/?75/?135,elevation40, actual RGBA changes are32/32/0/11pixels. The outlet closes the visible under-cistern passage at45/105; it is occluded at?75. Full feet are included in the nearest-neighbour comparison. No new small-part ROI is invented.

Canonical72 replay/export, exact repeat, actual producer/decoder controls and app/tools TS/build remain pending at this source checkpoint. Original native ROI/minima are untouched. No browser/server ran; runtime Build/SaveLoad and hosted acceptance are **pending root acceptance**.
