# Retained square-wall material study

Base: published root `9f709f293c47228166a09f550ef9867006d7bec6`.
Own scope: art-only read-only world inventory, one saved draft scene, two
canonical before/after sample poses and physical/light/camera guards. Root
owns browser/build/native and Staff acceptance; HUD owns public View helper.

1. **Complete:** trace actual angled ground and square-wall consumer and
   retained Blender pipeline. Ground uses projected overhead rendered-art
   tiles, whose producer already uses Eevee material shaders and directional
   suns. Registry oblique-floor sprites are not that ground consumer.
2. **Complete:** open actual full square-wall source in pinned Blender5.2.1;
   capture all59 parts, all nine complete stored material graphs, evaluated
   geometry/normals and original bounds. Retain original source and low module.
3. **Complete:** genuine Workbench/Cycles renders at yaw−45/e45 and135/e45,
   original512RGBA/ortho8/64pixels-per-tile/target(.5,.5,0). Both actual before
   renders match released Workbench bodies byte for byte. Save separate draft.
4. **Next:** exercise actual saved cap displacement, light omission and wrong
   camera span; observe rejection then exact original draft restoration.
5. **Pending review:** current literal shader graphs all have default grey
   Base Color0.8, despite distinct authored viewport colors. Literal Cycles
   preserves graphs but loses intended masonry palette differentiation.
   A later adoption needs an explicit approved material-value synchronization
   decision and join comparison; no full72 or runtime adoption in this draft.

Directional SUN radiance is independent of tile position. The finite area-light
profile approved for isolated furniture is not reused for tiled wall modules.
No plane, gameplay part, palette token, alias or production descriptor is added.
Directional light alone does not prove absence of sprite joins: neighboring
modules are absent from isolated ray tracing, so side occlusion/interreflection
at joins remains a separate actual joined-scene review requirement.
