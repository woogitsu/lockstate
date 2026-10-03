"""Genuine retained Cell toilet full-shader EEVEE versus bounded soft Cycles samples."""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
import time
import bpy
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
sys.path.insert(0,str(HERE))
import pipeline_common
pipeline_common.require_blender_version()


def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

source=load('toilet_real_canonical_source',HERE/'render-oblique-cell-toilet.py')
audit=load('toilet_retained_all45_audit',HERE/'refine-cell-toilet-flush-neck.py')
profile=load('toilet_existing_staff_laundry_soft_profile',HERE/'render-modern-retained-material-draft.py')
profile_reader=load('toilet_actual_saved_soft_profile_reader',HERE/'prepare-staff-chair-cycles.py')
SAVED=ROOT/'assets/source/blender/fixture.cell.toilet_sink.soft-light.blend'
PROVENANCE=SAVED.with_suffix('.provenance.json')
HISTORY=ROOT/'assets/source/blender/fixture.cell.toilet_sink.eevee-descriptor.v1.json'
REPORT=ROOT/'docs/research/2026-10-03-cell-toilet-retained-cycles'
POSES=(45,135)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def physical(scene):
    names=sorted(obj.name for obj in scene.objects if obj.type=='MESH')
    rows=audit.capture(scene)
    return {'meshCount':len(names),'rawMeshes':[audit.raw_record(bpy.data.objects[name]) for name in names],
      'evaluatedPositions':{name:rows[name]['evaluatedPositionSha256'] for name in names},
      'objectMatrices':{name:[list(row) for row in bpy.data.objects[name].matrix_world] for name in names},
      'completeStoredMaterialGraphs':audit.materials_record(),'evaluatedNormals':audit.normal_record(scene),
      'actualInteriorContacts':audit.actual_contacts(scene),'minCornerBounds':audit.bounds(scene),
      'retainedActions':audit.a.animation_record()}


def materials():
    rows=[]
    for material in sorted(bpy.data.materials,key=lambda value:value.name):
        shader=next((node for node in material.node_tree.nodes if node.bl_idname=='ShaderNodeBsdfPrincipled'),None)
        rows.append({'name':material.name,'users':material.users,'diffuseRGBA':list(material.diffuse_color),
          'viewportRoughnessProperty':material.roughness,
          'shaderBaseColorDefault':list(shader.inputs['Base Color'].default_value) if shader else None,
          'shaderRoughness':shader.inputs['Roughness'].default_value if shader else None,
          'shaderMetallic':shader.inputs['Metallic'].default_value if shader else None,
          'actualBaseColorLinks':[[link.from_node.name,link.from_socket.name] for link in shader.inputs['Base Color'].links] if shader else []})
    return rows


def verify_scene(scene,expected):
    audit.actual_contacts(scene) # Actual contact failure precedes source SHA checks.
    if physical(scene)!=expected['physicalAssembly']:
        raise ValueError('Toilet retained45 geometry/eight complete graphs/normals/contacts/matrices changed')
    if profile_reader.lighting(scene,source.TARGET)!=expected['lightingProfile']:
        raise ValueError('Toilet actual bounded saved soft-light/profile changed')
    camera=scene.camera
    if camera.data.type!='ORTHO' or camera.data.ortho_scale!=8 or list(source.TARGET)!=[.5,.5,.5537500381469727]:
        raise ValueError('Toilet actual canonical512/64px target camera changed')
    if (scene.render.resolution_x,scene.render.resolution_y,scene.render.resolution_percentage)!=(512,512,100):
        raise ValueError('Toilet canonical512RGBA resolution changed')
    for row in audit.capture(scene).values():
        for point in row['points']:
            for turns in range(4):
                x,y=point.x-.5,point.y-.5
                for _ in range(turns):x,y=-y,x
                if not(-.5<=x<=.5 and -.5<=y<=.5 and point.z>=-1e-6):
                    raise ValueError('Toilet retained actual surfaces escape rotated1?1 footprint')


def render(scene,yaw,label):
    source.point_camera(scene,yaw,40)
    path=REPORT/f'{label}-yaw{yaw}-elev40.png'
    scene.render.filepath=str(path)
    began=time.monotonic()
    bpy.ops.render.render(write_still=True)
    source.strip_png_metadata(path)
    validate_png(path.read_bytes())
    return {'stage':label,'yawDegrees':yaw,'elevationDegrees':40,'image':path.relative_to(ROOT).as_posix(),
      'sha256':sha(path),'renderSeconds':time.monotonic()-began}


def protected():
    paths=[source.SOURCE,source.PROVENANCE,audit.ORIGINAL,audit.ORIGINAL.with_suffix('.provenance.json'),
      ROOT/'assets/source/blender/environment.mvp.catalog.blend',source.MANIFEST,source.REGISTRY,
      ROOT/'src/content/room-catalog.ts',ROOT/'src/content/room-template-catalog.ts']
    paths+=list((ROOT/'public/assets/environment/oblique').glob('cell-toilet-*.png'))
    for folder in ['tests/browser','src/rendering','src/ui']:
        paths.extend(path for path in (ROOT/folder).rglob('*') if path.is_file())
    return {path.relative_to(ROOT).as_posix():sha(path) for path in sorted(set(paths))}


def validate_png(body):
    import struct, zlib
    if body[:8] != b'\x89PNG\r\n\x1a\n': raise ValueError('Toilet frame is not PNG')
    offset, compressed, header = 8, b'', None
    while offset < len(body):
        length = struct.unpack('>I', body[offset:offset+4])[0]
        kind = body[offset+4:offset+8]; data = body[offset+8:offset+8+length]
        if zlib.crc32(kind+data)&0xffffffff != struct.unpack('>I',body[offset+8+length:offset+12+length])[0]:
            raise ValueError('Toilet PNG CRC invalid')
        if kind == b'IHDR': header=struct.unpack('>IIBBBBB',data)
        elif kind == b'IDAT': compressed += data
        offset += length+12
    if header != (512,512,8,6,0,0,0): raise ValueError('Toilet PNG dimensions/RGBA format changed')
    raw=zlib.decompress(compressed);stride=2048;previous=bytearray(stride);occupied=0
    if len(raw) != 512*(stride+1): raise ValueError('Toilet PNG decoded length changed')
    for y in range(512):
        mode=raw[y*(stride+1)];row=bytearray(raw[y*(stride+1)+1:(y+1)*(stride+1)])
        if mode>4: raise ValueError('Toilet PNG filter invalid')
        for x in range(stride):
            left=row[x-4] if x>=4 else 0;above=previous[x];corner=previous[x-4] if x>=4 else 0
            estimate=left+above-corner;distances=(abs(estimate-left),abs(estimate-above),abs(estimate-corner))
            predictor=(0,left,above,(left+above)//2,(left,above,corner)[distances.index(min(distances))])[mode]
            row[x]=(row[x]+predictor)&255
        if (y in (0,511) and any(row[3::4])) or row[3] or row[-1]:
            raise ValueError('Toilet decoded silhouette clips frame border')
        occupied += sum(alpha>0 for alpha in row[3::4]);previous=row
    if occupied<=500: raise ValueError('Toilet decoded frame has no complete visible model')


def main():
    REPORT.mkdir(parents=True,exist_ok=True)
    if '--verify-saved' in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(SAVED))
        verify_scene(bpy.context.scene,json.loads(PROVENANCE.read_text()))
        print('ACTUAL_SAVED_TOILET45_GRAPH8_CONTACT2_CAMERA64_PROFILE_GREEN',flush=True)
        return
    held=protected()
    scene=source.setup_scene()
    source.append_collection() # Exactly the existing producer's one min-corner translation.
    original=physical(scene)
    if original['meshCount']!=45 or len(original['completeStoredMaterialGraphs'])!=8 or len(original['actualInteriorContacts'])!=2:
        raise ValueError('Toilet complete retained45parts/eightgraphs/twoactualcontacts missing')
    material_audit=materials()
    frames=[]
    catalog=json.loads(source.MANIFEST.read_text())
    for yaw in POSES:
        frame=render(scene,yaw,'before-eevee-authored-materials')
        expected=next(row for row in catalog['frames'] if (row['yawDegrees'],row['elevationDegrees'])==(yaw,40))
        frame['byteExactPublishedEEVEE']=frame['sha256']==expected['sha256']
        frame['publishedSha256']=expected['sha256']
        frames.append(frame)
    # Replace only the actual historical harsh SUN light objects, preserving all meshes/materials.
    old_lights=[{'name':obj.name,'type':obj.data.type,'energy':obj.data.energy} for obj in scene.objects if obj.type=='LIGHT']
    for obj in list(scene.objects):
        if obj.type=='LIGHT':bpy.data.objects.remove(obj,do_unlink=True)
    profile.soft_original_materials(scene,source.TARGET)
    expected={'physicalAssembly':original,'lightingProfile':profile_reader.lighting(scene,source.TARGET)}
    verify_scene(scene,expected)
    for yaw in POSES:frames.append(render(scene,yaw,'after-soft-original-materials'))
    source.point_camera(scene,45,40)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(SAVED))
    receipt={'assetId':source.ASSET_ID,'source':SAVED.relative_to(ROOT).as_posix(),'sourceSha256':sha(SAVED),
      'retainedSource':source.SOURCE.relative_to(ROOT).as_posix(),'retainedSourceSha256':sha(source.SOURCE),
      'originalSource':audit.ORIGINAL.relative_to(ROOT).as_posix(),'originalSourceSha256':sha(audit.ORIGINAL),
      'footprintTiles':[1,1],'canonicalMinCornerTranslation':[.5,.5,0],'cameraTargetTiles':list(source.TARGET),
      'nominalPixelsPerTile':64,'orthoScaleTiles':8,'materialGraphsChanged':False,'originalMaterialAudit':material_audit,
      'historicalLightObjects':old_lights,**expected,'genuineBlenderVersion':list(bpy.app.version),'frames':frames,
      'full72Run':False,'productionDispatchChanged':False,'groundPlaneAdded':False,'nativeAcceptance':False,
      'protectedBefore':held,'protectedAfter':protected()}
    if receipt['protectedAfter']!=held:raise ValueError('Toilet prep changed releasedsource/72/consumer/UI/nativefixture')
    pipeline_common.write_text(PROVENANCE,json.dumps(receipt,indent=2)+'\n')
    pipeline_common.write_text(REPORT/'actual-before-after.json',json.dumps(receipt,indent=2)+'\n')
    print('ACTUAL_TOILET_FULL_AUTHORED_SHADER_TWO_POSES_PREPARED',receipt['sourceSha256'],json.dumps(frames),flush=True)


if __name__=='__main__':main()
