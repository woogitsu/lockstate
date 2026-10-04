from pathlib import Path
import importlib.util
spec=importlib.util.spec_from_file_location('actual_prep_consumer',Path.cwd()/'tooling/blender/render-kitchen-prep-counter-cycles.py');p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
ss=importlib.util.spec_from_file_location('actual_shared_kitchen_entry',Path.cwd()/'tooling/blender/render-kitchen-fixtures-oblique.py');shared=importlib.util.module_from_spec(ss);ss.loader.exec_module(shared)
s,c,t=shared.configure((p.ASSET_ID,p.SOURCE_NAME,p.MANIFEST_NAME,2,1,1.,1.,.8100000619888306))
p.prepare.verify_scene(s,c,p.EXPECTED)
