from pathlib import Path
import bpy
bpy.ops.wm.open_mainfile(filepath=str(Path.cwd()/'assets/source/blender/furniture.classroom.student-chair.soft-light.blend'))
bpy.data.materials['sealed timber writing-room accent'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.8,.8,.8,1)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(Path.cwd()/'assets/source/blender/furniture.classroom.student-chair.soft-light.blend'))
