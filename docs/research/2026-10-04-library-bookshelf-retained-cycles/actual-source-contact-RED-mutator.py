from pathlib import Path
import bpy
bpy.ops.wm.open_mainfile(filepath=str(Path.cwd()/'assets/source/blender/furniture.library.bookshelf.soft-light.blend'))
bpy.data.objects['angled-library-bookshelf.shelf end horizontal bearing 0 -0.875'].location.z += 4
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(Path.cwd()/'assets/source/blender/furniture.library.bookshelf.soft-light.blend'))
