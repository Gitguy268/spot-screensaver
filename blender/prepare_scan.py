# Shrinks the blanket scan of Spot for the web: textures resized (colour 2048, normal 2048,
# metal/rough 1024) and written as WebP, mesh kept as is. Run headless:
#   Blender -b --factory-startup -P blender/prepare_scan.py -- <in.glb> <out.glb>
import bpy, sys
src, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for img in bpy.data.images:
    if img.size[0] == 0:
        continue
    size = 1024 if 'metallic' in img.name or 'rough' in img.name else 2048
    if img.size[0] > size:
        img.scale(size, size)
    print('IMAGE', img.name, tuple(img.size))
for o in bpy.context.scene.objects:
    if o.type == 'MESH':
        o.name = 'SpotScan'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='WEBP', export_image_quality=88,
                          export_yup=True, export_apply=True, export_animations=False)
