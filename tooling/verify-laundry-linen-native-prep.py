"""Bounded real native observer mutations; no browser/server/build/Blender invocation."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent.parent
REPORT = ROOT / "docs/research/2026-10-03-laundry-linen-rack-native"
SOURCE = ROOT / "tests/browser/laundry-linen-rack/native-evidence.ts"
TEST = "tests/unit/native-laundry-linen-rack-evidence.test.ts"

def sha(data):
    return hashlib.sha256(data).hexdigest()

def run(name):
    result = subprocess.run([shutil.which("node"), "node_modules/vitest/vitest.mjs", "run", TEST, "--reporter=dot"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    output = result.stdout + result.stderr
    (REPORT / (name + ".log")).write_text(output.rstrip() + "\n", encoding="utf-8", newline="\n")
    return {"exitCode": result.returncode, "log": name + ".log"}

original = SOURCE.read_bytes()
protected = [SOURCE, ROOT / "tests/browser/laundry-linen-rack/art-fixture.ts", ROOT / "public/game-content/oblique-furniture-laundry-linen-rack.v1.json", ROOT / "assets/source/blender/furniture.laundry.linen-rack.blend", ROOT / "src/rendering/assets/oblique-object-mapping.ts", ROOT / "public/game-content/oblique-module-registry.v1.json"]
protected += list((ROOT / "public/assets/environment/oblique").glob("furniture.laundry.linen-rack-*.png"))
before = {str(file.relative_to(ROOT)): sha(file.read_bytes()) for file in protected}
controls = []
try:
    for name, needle, replacement in [
        ("actual-observer-source-pin", b"sourceSha256: art.sourceSha256", b"sourceSha256: '" + b"0" * 64 + b"'"),
        ("actual-paid-owner-orientation", b"orientation: 0, sourceOrderId: paidOrderId", b"orientation: 1, sourceOrderId: paidOrderId"),
    ]:
        if original.count(needle) != 1:
            raise RuntimeError("native observer mutation target is not uniquely present: " + name)
        SOURCE.write_bytes(original.replace(needle, replacement))
        red = run(name + "-RED")
        if red["exitCode"] == 0:
            raise RuntimeError("actual native observer mutation incorrectly accepted: " + name)
        SOURCE.write_bytes(original)
        green = run(name + "-exact-restore-GREEN")
        if green["exitCode"] != 0:
            raise RuntimeError("exact native observer restoration failed: " + name)
        controls.append({"name": name, "red": red, "green": green, "sourceExactRestored": SOURCE.read_bytes() == original})
finally:
    SOURCE.write_bytes(original)
after = {str(file.relative_to(ROOT)): sha(file.read_bytes()) for file in protected}
if after != before:
    raise RuntimeError("protected source/descriptor/72 frames/context bytes changed")
(REPORT / "actual-native-observer-controls.json").write_text(json.dumps({"controls": controls, "protectedFileCount": len(protected), "protectedBefore": before, "protectedAfter": after, "exactBytesRestored": True, "browserRun": False, "buildRun": False, "serverRun": False}, indent=2) + "\n", encoding="utf-8", newline="\n")
print(json.dumps({"controls": controls, "protectedFileCount": len(protected), "exactBytesRestored": True}))
