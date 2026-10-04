from pathlib import Path
import bpy
bpy.ops.wm.open_mainfile(filepath=str(Path.cwd()/'assets/source/blender/furniture.kitchen.prep-counter.soft-light.blend'))
bpy.data.objects.remove(bpy.data.objects['Modern draft soft warm key'],do_unlink=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(Path.cwd()/'assets/source/blender/furniture.kitchen.prep-counter.soft-light.blend'))
