"""Real serial producer/source/PNG negatives, always restoring exact owned bytes.

Run with Python + Pillow and the pinned Blender. No browser/server or second72 render.
"""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "docs/research/2026-10-03-interior-north-door-pose-completion"
SCRATCH = ROOT / "assets/intermediate/interior-north-door-production-controls"
PRODUCER = ROOT / "tooling/blender/render-interior-north-door-oblique.py"
SOURCE = ROOT / "assets/source/blender/door.interior.leaf.open.blend"
MANIFEST = ROOT / "public/game-content/oblique-cell-door-open.v1.json"
BLENDER = os.environ.get("LOCKSTATE_BLENDER", r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe")
CLI = [BLENDER,"--background","--factory-startup","--threads","1","--python-exit-code","1"]


def sha(body):return hashlib.sha256(body).hexdigest()


def run(label,script=PRODUCER,args=(),expect_error=None):
    result=subprocess.run(CLI+["--python",str(script),"--",*args],cwd=ROOT,capture_output=True,timeout=60)
    output=(result.stdout+result.stderr).decode("utf-8",errors="replace")
    (REPORT/(label+".log")).write_text(output.rstrip()+"\n",encoding="utf-8",newline="\n")
    if expect_error:
        if result.returncode==0 or expect_error not in output:
            raise AssertionError(f"{label}: real production mutation did not fail for {expect_error}\n{output}")
    elif result.returncode!=0:
        raise AssertionError(f"{label}: producer unexpectedly failed\n{output}")
    print(label,"RED" if expect_error else "GREEN",result.returncode,flush=True)
    return {"label":label,"exitCode":result.returncode,"expectedFailure":expect_error}


def main():
    SCRATCH.mkdir(parents=True,exist_ok=True)
    manifest=json.loads(MANIFEST.read_text(encoding="utf-8"))
    source_bytes=SOURCE.read_bytes();producer_bytes=PRODUCER.read_bytes();manifest_bytes=MANIFEST.read_bytes()
    west=ROOT/"public/game-content/oblique-cell-door-west-full.v1.json"
    west_manifest=json.loads(west.read_text(encoding="utf-8"))
    protected={PRODUCER,SOURCE,MANIFEST,west,ROOT/"assets/source/blender/wall.interior.cutaway.blend",
               ROOT/"assets/source/blender/door.interior.open.full.export-contract.json",
               ROOT/"public/game-content/oblique-module-registry.v1.json",
               ROOT/"src/rendering/assets/oblique-object-mapping.ts"}
    protected.update(ROOT/"public"/f["image"].lstrip("/") for f in manifest["frames"]+west_manifest["frames"])
    # The final authored tree deliberately retained some older unreferenced skins.
    # Preserve them too; their presence is not evidence a repeat emitted them.
    protected.update((ROOT/"public/assets/environment/oblique").glob("cell-door-open-yaw*.png"))
    before={p.relative_to(ROOT).as_posix():sha(p.read_bytes()) for p in sorted(protected)}
    receipt={"originalSourceSha256":sha(source_bytes),"controls":[],"boundedRepeatedPoses":[],"protectedBefore":before}
    try:
        # Mutate the REAL authored .blend, then allow that actual temporary byte hash
        # through dispatch, so the physical guard (not a trivial stale hash) must fail.
        mutation=SCRATCH/"disconnect-original-leaf.py"
        mutation.write_text('''from pathlib import Path
import sys,bpy
ROOT=Path.cwd();sys.path.insert(0,str(ROOT/'tooling/blender'))
import pipeline_common
pipeline_common.require_blender_version()
source=ROOT/'assets/source/blender/door.interior.leaf.open.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
for obj in bpy.context.scene.objects:
 if obj.type=='MESH':
  transform=obj.matrix_world.copy();transform.translation.x+=1;obj.matrix_world=transform
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(source))
print('ACTUAL_SOURCE_MUTATION leaf assembly moved +1X',flush=True)
''',encoding="utf-8",newline="\n")
        try:
            receipt["controls"].append(run("actual-source-mutation-written",mutation))
            mutant_sha=sha(SOURCE.read_bytes());receipt["actualMutantSourceSha256"]=mutant_sha
            if mutant_sha==sha(source_bytes):raise AssertionError("Actual source bytes did not mutate")
            text=producer_bytes.decode("utf-8")
            original=f'LEAF_SHA = "{sha(source_bytes)}"'
            if text.count(original)!=1:raise AssertionError("Temporary genuine source dispatch hash is not unique")
            PRODUCER.write_text(text.replace(original,f'LEAF_SHA = "{mutant_sha}"'),encoding="utf-8",newline="\n")
            receipt["controls"].append(run("actual-disconnected-source-red",args=("--verify-only",),
                expect_error="North door retained hinge actual contact disconnected"))
        finally:
            SOURCE.write_bytes(source_bytes);PRODUCER.write_bytes(producer_bytes)
        receipt["controls"].append(run("exact-source-restore-green",args=("--verify-only",)))

        try:
            text=producer_bytes.decode("utf-8").replace('ASSET = "door.interior.open.full"','ASSET = "door.interior.open.west.full"')
            PRODUCER.write_text(text,encoding="utf-8",newline="\n")
            receipt["controls"].append(run("actual-asset-dispatch-red",args=("--verify-only",),
                expect_error="North door source/camera/asset dispatch changed"))
        finally:PRODUCER.write_bytes(producer_bytes)
        receipt["controls"].append(run("exact-dispatch-restore-green",args=("--verify-only",)))

        frame=next(f for f in manifest["frames"] if f["yawDegrees"]==135 and f["elevationDegrees"]==45)
        original_image=ROOT/"public"/frame["image"].lstrip("/")
        bad_image=None
        try:
            with Image.open(original_image) as image:
                bad=image.convert("RGBA");bad.putpixel((0,0),(120,90,60,255))
                staging=SCRATCH/"actual-hash-valid-bad-border.png";bad.save(staging)
            body=staging.read_bytes();digest=sha(body)
            name=f'cell-door-open-yaw+135-elev45.{digest[:12]}.png'
            bad_image=original_image.with_name(name);bad_image.write_bytes(body)
            with Image.open(bad_image) as decoded:
                decoded.load()
                if decoded.size!=(512,512) or decoded.convert("RGBA").getpixel((0,0))!=(120,90,60,255):
                    raise AssertionError("Actual negative is not a valid decoded PNG")
            corrupted=json.loads(manifest_bytes)
            record=next(f for f in corrupted["frames"] if f["yawDegrees"]==135 and f["elevationDegrees"]==45)
            record["image"]="/assets/environment/oblique/"+name;record["sha256"]=digest
            MANIFEST.write_text(json.dumps(corrupted,indent=2)+"\n",encoding="utf-8",newline="\n")
            receipt["hashValidBadPNG"]={"sha256":digest,"decodedPixel":[120,90,60,255],"descriptorAndPathHashesMatch":True}
            receipt["controls"].append(run("actual-hash-valid-png-border-red",args=("--verify-exports",),
                expect_error="North door decoded silhouette clips frame border"))
        finally:
            MANIFEST.write_bytes(manifest_bytes)
            if bad_image is not None:bad_image.unlink(missing_ok=True)
        receipt["controls"].append(run("exact-png-descriptor-restore-green",args=("--verify-exports",)))

        for yaw in (45,135,-135,-45):
            existing=set(original_image.parent.glob(f"cell-door-open-yaw{yaw:+03d}-elev45.*.png"))
            receipt["controls"].append(run(f"canonical-repeat-{yaw:+d}-green",args=("--yaw",str(yaw),"--elevation","45")))
            selected=next(f for f in manifest["frames"] if f["yawDegrees"]==yaw and f["elevationDegrees"]==45)
            if sha((ROOT/"public"/selected["image"].lstrip("/")).read_bytes())!=selected["sha256"]:
                raise AssertionError("Actual bounded repeated pose differs from complete canonical matrix")
            # Check that a different hash-named repeat has not silently appeared.
            matches=list(original_image.parent.glob(f"cell-door-open-yaw{yaw:+03d}-elev45.*.png"))
            if any(p not in existing and sha(p.read_bytes())!=selected["sha256"] for p in matches):
                raise AssertionError("Bounded producer emitted an inconsistent additional pose")
            receipt["boundedRepeatedPoses"].append(selected)
    finally:
        SOURCE.write_bytes(source_bytes);PRODUCER.write_bytes(producer_bytes);MANIFEST.write_bytes(manifest_bytes)
        SOURCE.with_name(SOURCE.name+"1").unlink(missing_ok=True)
    after={p.relative_to(ROOT).as_posix():sha(p.read_bytes()) for p in sorted(protected)}
    if after!=before:raise AssertionError("Exact owned source/producer/frames/West/registry/mapping restoration failed")
    receipt["protectedAfter"]=after;receipt["exactRestoredProtectedFiles"]=len(before)
    (REPORT/"actual-production-negative-controls.json").write_text(json.dumps(receipt,indent=2)+"\n",encoding="utf-8",newline="\n")
    print("NORTH_DOOR_PRODUCTION_CONTROLS_GREEN",len(before),"exact restored protected files",flush=True)


if __name__=="__main__":main()
