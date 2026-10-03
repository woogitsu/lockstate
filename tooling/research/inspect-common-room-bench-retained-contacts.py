"""Reopen the actual dedicated bench and record retained rear frame connections."""
from pathlib import Path
import importlib.util
import json
import bpy

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('common_room_reopened_producer', ROOT / 'tooling/blender/render-common-room-bench-oblique.py')
producer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(producer)
scene, camera = producer.configure()
spec = importlib.util.spec_from_file_location('common_room_retained_contact_audit', ROOT / 'tooling/blender/refine-guard-belt-detail.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
targets = {
    'back support': ['side seat bearer', 'sealed timber arm', 'steel upright.001'],
    'back support.001': ['side seat bearer.001', 'sealed timber arm.001', 'steel upright.003'],
}
contacts = audit.actual_triangle_contacts(scene, targets)
assert len(contacts) == 6
receipt = json.loads(producer.PROVENANCE.read_text())
proof = {'retainedMeshNames': sorted(row['name'] for row in receipt['retainedMeshesBefore']),
    'retainedActualRearFrameTargets': targets, 'retainedActualRearFrameTriangleContacts': contacts,
    'addedFrontRiserTargets': receipt['actualContactTargets'], 'addedFrontRiserTriangleContacts': audit.actual_triangle_contacts(scene, receipt['actualContactTargets'])}
output = ROOT / 'docs/research/2026-10-03-common-room-bench-front-arm-supports/actual-retained-rear-and-added-front-contact-graph.json'
output.write_text(json.dumps(proof, indent=2) + '\n', encoding='utf-8')
print('COMMON_ROOM_REOPENED_33_RETAINED/6_REAR/4_FRONT_TRIANGLE_CONTACTS', flush=True)
