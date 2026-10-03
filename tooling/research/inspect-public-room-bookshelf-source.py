"""Read-only genuine Blender source audit used to reject a redundant Classroom replacement."""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
import bpy

ROOT = Path(__file__).resolve().parents[2]
HERE = ROOT / 'tooling/blender'
sys.path.insert(0, str(HERE))
import pipeline_common
pipeline_common.require_blender_version()

spec = importlib.util.spec_from_file_location('actual_retained_bookshelf_audit', HERE / 'refine-guard-belt-detail.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
source = ROOT / 'assets/source/blender/furniture.library.bookshelf.angled-detail.blend'
body = source.read_bytes()
bpy.ops.wm.open_mainfile(filepath=str(source))
rows = audit.capture(bpy.context.scene)
graphs = audit.materials_record()
result = {
    'source': source.relative_to(ROOT).as_posix(), 'sourceSha256': hashlib.sha256(body).hexdigest(),
    'blenderVersion': list(bpy.app.version), 'blenderBuildHash': bpy.app.build_hash.decode(),
    'meshCount': len(rows), 'bounds': audit.bounds(bpy.context.scene),
    'materialGraphs': [{'name': graph['name'], 'sha256': hashlib.sha256(
        json.dumps(graph, sort_keys=True, separators=(',', ':')).encode()).hexdigest()} for graph in graphs],
    'meshEvaluatedPositionSha256': {name: row['evaluatedPositionSha256'] for name, row in rows.items()},
    'sourceBytesUnchangedAfterReadOnlyOpen': source.read_bytes() == body,
    'newRender': False,
}
assert result['meshCount'] == 63 and len(graphs) == 9
assert result['sourceBytesUnchangedAfterReadOnlyOpen']
report = ROOT / 'docs/research/2026-10-03-public-room-art-context-coverage/actual-readonly-bookshelf-source.json'
report.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print('ACTUAL_READONLY_SOURCE', result['meshCount'], 'meshes', len(graphs), 'graphs', result['sourceSha256'])
