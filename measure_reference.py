"""Blender-only measurement of a locally supplied rig, without editing it."""
import hashlib
import json
import sys
from pathlib import Path
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
root = Path(args[0])
source = root / 'assets' / 'target.fbx'
digest = hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(source), use_anim=False)
rigs = [o for o in bpy.data.objects if o.type == 'ARMATURE']
if len(rigs) != 1 or not {'Hips', 'Head', 'LeftHand', 'RightHand'} <= set(rigs[0].data.bones.keys()):
    raise ValueError('Use one standard DarkRide-compatible humanoid reference rig')
points = [o.matrix_world @ Vector(p) for o in bpy.data.objects if o.type == 'MESH' for p in o.bound_box]
height = float(args[1]) if len(args) > 1 else max(p.z for p in points) - min(p.z for p in points) if points else 0
if not .3 < height < 4:
    raise ValueError('Standing height unavailable; rerun setup_reference.py with --height in metres')
hips = (rigs[0].matrix_world @ rigs[0].data.bones['Hips'].matrix_local).translation.z
if not .1 < hips < height:
    raise ValueError('Reference Hips must be above its floor and below its standing height')
assert digest == hashlib.sha256(source.read_bytes()).hexdigest()
record = {'schema': 1, 'heightMeters': height, 'targetPelvisHeight': hips, 'source': 'assets/target.fbx',
          'sourceSha256': digest, 'method': 'User-supplied height' if len(args) > 1 else 'Standing world-space mesh bounds in Blender metres'}
(root / 'dance-ball-v3' / 'reference-rig.json').write_text(json.dumps(record, indent=2) + '\n')
