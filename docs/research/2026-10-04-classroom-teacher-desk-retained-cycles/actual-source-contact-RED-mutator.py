from pathlib import Path
import bpy
bpy.ops.wm.open_mainfile(filepath=str(Path.cwd()/'assets/source/blender/furniture.classroom.teacher-desk.soft-light.blend'))
bpy.data.objects['Classroom teacher desk.desktop textbook rack base'].location.z += .8
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(Path.cwd()/'assets/source/blender/furniture.classroom.teacher-desk.soft-light.blend'))
