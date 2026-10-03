"""Read actual retained square-wall shader/mesh values before a bounded study."""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
import bpy
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import pipeline_common
pipeline_common.require_blender_version()
spec = importlib.util.spec_from_file_location('modern_wall_material_reader', HERE / 'refine-guard-belt-detail.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
path = ROOT / 'assets/source/blender/wall.square.brick.full.blend'
bpy.ops.wm.open_mainfile(filepath=str(path))
scene = bpy.context.scene
names = sorted(obj.name for obj in scene.objects if obj.type == 'MESH')
rows = audit.capture(scene)
materials = audit.materials_record()
receipt = {'source': path.relative_to(ROOT).as_posix(), 'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
           'genuineBlenderVersion': list(bpy.app.version), 'meshCount': len(names),
           'rawMeshes': [audit.raw_record(bpy.data.objects[name]) for name in names],
           'evaluatedPositions': {name: rows[name]['evaluatedPositionSha256'] for name in names},
           'completeStoredMaterialGraphs': materials, 'normals': audit.normal_record(scene), 'bounds': audit.bounds(scene),
           'usedMaterials': [{'name': material.name, 'useNodes': material.use_nodes, 'diffuseRGBA': list(material.diffuse_color),
                              'roughness': material.roughness, 'metallic': material.metallic,
                              'nodeTypes': sorted(node.bl_idname for node in material.node_tree.nodes) if material.node_tree else []}
                             for material in bpy.data.materials if material.users]}
folder = ROOT / 'docs/research/2026-10-03-modern-square-wall-material-study'
folder.mkdir(parents=True, exist_ok=True)
pipeline_common.write_text(folder / 'actual-retained-source-audit.json', json.dumps(receipt, indent=2) + '\n')
print('ACTUAL_SQUARE_WALL_RETAINED_AUDIT', len(names), len(materials), json.dumps(receipt['usedMaterials']), flush=True)
