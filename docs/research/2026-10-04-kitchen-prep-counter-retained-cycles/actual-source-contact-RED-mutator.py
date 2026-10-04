from pathlib import Path
import bpy
bpy.ops.wm.open_mainfile(filepath=str(Path.cwd()/'assets/source/blender/furniture.kitchen.prep-counter.soft-light.blend'))
bpy.data.objects['foot'].location.z -= .4
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(Path.cwd()/'assets/source/blender/furniture.kitchen.prep-counter.soft-light.blend'))
