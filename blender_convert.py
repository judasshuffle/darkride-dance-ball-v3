"""Background Blender retargeting. World matrices are evaluated after FBX pre/post rotations."""
import bpy,sys,json,math,re,traceback
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
import numpy as np
ROOT=Path(__file__).parent
sys.path.insert(0,str(ROOT))
from safe_npy import load_npy

def clean():
 bpy.ops.wm.read_factory_settings(use_empty=True)
def imp(p):
 before=set(bpy.data.objects); bpy.ops.import_scene.fbx(filepath=str(p),use_anim=True,automatic_bone_orientation=False)
 return [o for o in bpy.data.objects if o not in before and o.type=='ARMATURE']
def q(m): return m.to_quaternion().normalized()
def vec(v): return [float(x) for x in v]
def yup(v): return [float(v[0]),float(v[2]),float(-v[1])]
def mapping(o):
 out={}; used=set()
 # Biped uses hierarchy depth and semantic stems, never suffix values to assign a dancer.
 for b in o.data.bones:
  n=b.name.split(':')[-1]; n=re.sub(r'^mixamorig','',n,flags=re.I)
  if n in TARGET: out[n]=b.name; used.add(b.name)
 hips=next((b for b in o.data.bones if re.search(r'\bPelvis\d*$',b.name,re.I)),None)
 if hips:
  out['Hips']=hips.name; used.add(hips.name)
  spine=sorted([b for b in hips.children_recursive if re.search(r'\bSpine\d*$',b.name,re.I)],key=lambda b:len(b.parent_recursive))
  for dst,b in zip(['Spine','Spine1','Spine2'],spine):out[dst]=b.name;used.add(b.name)
  for b in hips.children_recursive:
   n=b.name
   simple={'Neck':'Neck','Head':'Head'}
   for stem,dst in simple.items():
    if re.search(r'\b'+stem+r'\d*$',n,re.I):out[dst]=n;used.add(n)
   for side,prefix in [('L','Left'),('R','Right')]:
    for stem,dst in [('Clavicle','Shoulder'),('UpperArm','Arm'),('Forearm','ForeArm'),('Hand','Hand'),('Thigh','UpLeg'),('Calf','Leg'),('Foot','Foot'),('Toe','ToeBase')]:
     if re.search(r'\b'+side+r' '+stem+r'\d*$',n,re.I):out[prefix+dst]=n;used.add(n)
 return out,[b.name for b in o.data.bones if b.name not in used]
def frame_basis(rest,mp):
 p=lambda n:rest[mp[n]].translation
 x=(p('LeftUpLeg')-p('RightUpLeg')).normalized();z=(p('Head')-p('Hips')).normalized(); y=z.cross(x).normalized(); x=y.cross(z).normalized()
 return Matrix((x,y,z)).transposed().to_quaternion()
def source_fbx(path):
 rigs=imp(path);fps=bpy.context.scene.render.fps/bpy.context.scene.render.fps_base; result=[]
 for o in rigs:
  mp,unmapped=mapping(o)
  if not all(k in mp for k in ['Hips','Head','LeftUpLeg','RightUpLeg','LeftArm','RightArm']):continue
  if not o.animation_data or not o.animation_data.action:continue
  action=o.animation_data.action;start,end=action.frame_range
  rest={b.name:o.matrix_world@b.matrix_local for b in o.data.bones}; basis=frame_basis(rest,mp)
  samples=[]
  for f in range(round(start),round(end)+1):
   bpy.context.scene.frame_set(f)
   world={k:o.matrix_world@o.pose.bones[n].matrix for k,n in mp.items()}
   samples.append({'rot':{k:q(m)@q(rest[mp[k]]).inverted()@basis for k,m in world.items()},'hip':world['Hips'].translation.copy(),'hands':{k:world[k].translation.copy() for k in ['LeftHand','RightHand'] if k in world},'relativePoints':{k:m.translation-world['Hips'].translation for k,m in world.items()}})
  result.append({'id':path.stem+'_'+o.name,'fps':fps,'samples':samples,'mapping':mp,'unmapped':unmapped,'source':str(path),'rest':{k:vec(m.translation) for k,m in rest.items()},'kind':'FBX'})
 if not result:raise ValueError('No animated humanoid hierarchy found. Bones: '+', '.join(b.name for o in rigs for b in o.data.bones))
 return result
SMPL_NAMES=['Hips','LeftUpLeg','RightUpLeg','Spine','LeftLeg','RightLeg','Spine1','LeftFoot','RightFoot','Spine2','LeftToeBase','RightToeBase','Neck','LeftShoulder','RightShoulder','Head','LeftArm','RightArm','LeftForeArm','RightForeArm','LeftHand','RightHand',None,None,None]
for side in ['Left','Right']:
 for finger in ['Index','Middle','Pinky','Ring','Thumb']:
  for i in range(1,4):SMPL_NAMES.append(side+'Hand'+finger+str(i))
PARENTS=[-1,0,0,0,1,2,3,4,5,6,7,8,9,9,9,12,13,14,16,17,18,19,15,15,15]+[20,25,26,20,28,29,20,31,32,20,34,35,20,37,38,21,40,41,21,43,44,21,46,47,21,49,50,21,52,53]
def source_npy(path):
 d=load_npy(path);p=np.asarray(d['poses']);t=np.asarray(d['transl']);g=np.asarray(d['global_orient'])
 if p.ndim!=2 or p.shape[1]!=165 or t.shape!=(len(p),3) or g.shape!=(len(p),3):raise ValueError('DD100 requires poses Tx165, transl Tx3, global_orient Tx3')
 if not all(np.isfinite(a).all() for a in [p,t,g]):raise ValueError('Non-finite DD100 values')
 # DD100 preprocessing uses poses for rotmat, global_orient for SMPL-X position reconstruction.
 if not np.allclose(p[:,:3],g,atol=1e-4):raise ValueError('Conflicting poses root and global_orient; refusing ambiguous facing')
 C=Matrix.Rotation(math.pi/2,4,'X').to_quaternion(); samples=[]
 for pose,trans in zip(p.reshape(-1,55,3),t):
  absolute=[];rot={}
  for i,v in enumerate(pose):
   v=Vector(v);local=Quaternion(v.normalized(),v.length) if v.length else Quaternion()
   a=absolute[PARENTS[i]]@local if PARENTS[i]>=0 else local;absolute.append(a)
   if SMPL_NAMES[i]:rot[SMPL_NAMES[i]]=a@C.inverted()
  # SMPL-X pelvis offset is shape dependent. Use target pelvis height; translations remain in metres.
  hip=Vector(trans)
  samples.append({'rot':rot,'hip':hip,'hands':{}})
 return [{'id':path.stem,'fps':30.0,'samples':samples,'mapping':{n:i for i,n in enumerate(SMPL_NAMES) if n},'unmapped':['jaw','left_eye_smplhf','right_eye_smplhf'],'source':str(path),'kind':'DD100','warnings':['Shape betas are not applied to avatar proportions. Root transl is preserved in metres; one shared vertical offset aligns the first dancer to target pelvis height; shape-dependent SMPL-X pelvis offsets remain unavailable.']}]
def retarget(d,out):
 # Target has canonical mannequin rest transforms. No second rest correction is done in playback.
 rigs=imp(ROOT/'assets/target.fbx');o=rigs[0];o.animation_data_clear();o.name='RobotDolly_'+d['id']
 # Normalize object transform into armature data, keeping Blender world units in metres.
 bpy.context.view_layer.objects.active=o;bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 for pb in o.pose.bones:
  pb.scale=(1,1,1);pb.location=(0,0,0);pb.rotation_quaternion=(1,0,0,0)
 rest={b.name:b.matrix_local.copy() for b in o.data.bones};target_basis=frame_basis(rest,{k:k for k in TARGET if k in rest})
 correction={k:target_basis.inverted()@q(m) for k,m in rest.items()}
 scene=bpy.context.scene;scene.render.fps=round(d['fps']);scene.render.fps_base=scene.render.fps/d['fps'];scene.frame_start=1;scene.frame_end=len(d['samples'])
 expected=[]
 curves={}
 for i,s in enumerate(d['samples'],1):
  world={}
  for b in o.data.bones:
   pb=o.pose.bones[b.name];parent=b.parent
   rot=s['rot'][b.name]@correction[b.name] if b.name in s['rot'] else (q(world[parent.name])@q(rest[parent.name]).inverted()@q(rest[b.name]) if parent else q(rest[b.name]))
   loc=(world[parent.name]@(rest[parent.name].inverted()@rest[b.name]).translation) if parent else rest[b.name].translation.copy()
   m=rot.to_matrix().to_4x4();m.translation=loc;world[b.name]=m
  # Two-bone arm IK keeps FBX wrist locations in the shared source space where reachable.
  overrides={}
  for side in ['Left','Right']:
   upper,lower,hand=side+'Arm',side+'ForeArm',side+'Hand'
   points=s.get('relativePoints',{})
   if not all(k in points and k in world for k in [upper,lower,hand]):continue
   shoulder=world[upper].translation
   goal=world['Hips'].translation+points[hand]
   pole=world['Hips'].translation+points[lower]
   local1=(rest[upper].inverted()@rest[lower]).translation
   local2=(rest[lower].inverted()@rest[hand]).translation
   length1,length2=local1.length,local2.length
   direction=goal-shoulder;distance=direction.length
   if distance<1e-7:continue
   axis=direction.normalized();distance=max(abs(length1-length2)+1e-6,min(distance,length1+length2-1e-6))
   pole=(pole-shoulder)-axis*(pole-shoulder).dot(axis)
   if pole.length<1e-7:pole=(world[lower].translation-shoulder)-axis*(world[lower].translation-shoulder).dot(axis)
   if pole.length<1e-7:continue
   along=(length1*length1-length2*length2+distance*distance)/(2*distance)
   elbow=shoulder+axis*along+pole.normalized()*math.sqrt(max(0,length1*length1-along*along))
   wrist=shoulder+axis*distance
   overrides[upper]=(q(world[upper])@local1).rotation_difference(elbow-shoulder)@q(world[upper])
   overrides[lower]=(q(world[lower])@local2).rotation_difference(wrist-elbow)@q(world[lower])
  if overrides:
   for b in o.data.bones:
    parent=b.parent;rot=overrides.get(b.name,q(world[b.name]))
    loc=(world[parent.name]@(rest[parent.name].inverted()@rest[b.name]).translation) if parent else rest[b.name].translation.copy()
    m=rot.to_matrix().to_4x4();m.translation=loc;world[b.name]=m
  for b in o.data.bones:
   pb=o.pose.bones[b.name];parent=b.parent;m=world[b.name]
   local=(world[parent.name].inverted()@m) if parent else m
   restlocal=(rest[parent.name].inverted()@rest[b.name]) if parent else rest[b.name]
   basis=restlocal.inverted()@local
   pb.rotation_mode='QUATERNION'
   for prop,values in [('rotation_quaternion',q(basis)),('location',basis.translation)]:
    for channel,value in enumerate(values):curves.setdefault((pb.path_from_id(prop),channel),[]).extend((i,float(value)))
  if i in {1,len(d['samples']),1+len(d['samples'])//4,1+len(d['samples'])//2,1+3*len(d['samples'])//4}:
   expected.append({'frame':i,'rot':{k:vec(q(m)) for k,m in world.items()},'pos':{k:vec(m.translation) for k,m in world.items() if k in ['Hips','LeftHand','RightHand']}})
 o.animation_data_create();o.animation_data.action=bpy.data.actions.new(o.name+'Action')
 for (path,index),values in curves.items():
  fc=o.animation_data.action.fcurves.new(path,index=index);fc.keyframe_points.add(len(values)//2);fc.keyframe_points.foreach_set('co',values)
  for point in fc.keyframe_points:point.interpolation='LINEAR'
  fc.update()
 o.animation_data.action_slot=o.animation_data.action.slots[0]
 scene.frame_set(1)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 filename=re.sub(r'[^\w.-]','_',d['id'])+'.fbx';p=out/filename
 bpy.ops.export_scene.fbx(filepath=str(p),use_selection=True,object_types={'ARMATURE'},add_leaf_bones=False,bake_anim=True,bake_anim_use_all_actions=False,bake_anim_use_nla_strips=False,bake_anim_simplify_factor=0.0,axis_forward='-Z',axis_up='Y',apply_unit_scale=True)
 # Reimport and compare physical world poses, including facing, at sampled frames.
 imported=imp(p)[0];errors=[];positions=[]
 for e in expected:
  scene.frame_set(round(e['frame']+imported.animation_data.action.frame_range[0]-1));
  for k,v in e['rot'].items():
   if k not in imported.pose.bones:raise ValueError('Export lost joint '+k)
   actual=imported.matrix_world@imported.pose.bones[k].matrix
   err=math.degrees(q(actual).rotation_difference(Quaternion(v)).angle)
   if min(err,360-err)>0.15:print('JOINT_ERROR',e['frame'],k,err,flush=True)
   errors.append(err)
   if k in e['pos']:positions.append((actual.translation-Vector(e['pos'][k])).length)
 maxrot=max(min(x,360-x) for x in errors);maxpos=max(positions)
 d['_positions']={e['frame']-1:{k:Vector(v)+d['samples'][e['frame']-1]['hip']-rest['Hips'].translation for k,v in e['pos'].items()} for e in expected}
 actual_frames=round(imported.animation_data.action.frame_range[1]-imported.animation_data.action.frame_range[0])+1
 if actual_frames!=len(d['samples']):raise ValueError('Export duration changed')
 if maxrot>0.15 or maxpos>0.002:raise ValueError('FBX reimport verification failed: '+str((maxrot,maxpos)))
 return {'id':d['id'],'role':('leader' if d['id'].endswith('_01') else 'follower' if d['id'].endswith('_00') else 'dancer'),'file':filename,'fps':d['fps'],'frames':len(d['samples']),'durationSeconds':(len(d['samples'])-1)/d['fps'],'rootPositions':[yup(s['hip']) for s in d['samples']],'mapping':d['mapping'],'unmapped':d['unmapped'],'warnings':d.get('warnings',[]),'verification':{'maxJointRotationErrorDegrees':maxrot,'maxJointPositionErrorMeters':maxpos,'samples':[e['frame'] for e in expected],'rootMotion':'Script only; FBX Hips translation constant','sampleHipsUpInBlender':[vec(Quaternion(e['rot']['Hips'])@Vector((0,1,0))) for e in expected],'sourceRootTravelMeters':(d['samples'][-1]['hip']-d['samples'][0]['hip']).length,'sourceRootPathLengthMeters':sum((b['hip']-a['hip']).length for a,b in zip(d['samples'],d['samples'][1:])),'sourceRootBoundsMeters':[[min(s['hip'][i] for s in d['samples']),max(s['hip'][i] for s in d['samples'])] for i in range(3)],'maxHipsRotationFromFirstDegrees':max(min(math.degrees(d['samples'][0]['rot']['Hips'].rotation_difference(s['rot']['Hips']).angle),360-math.degrees(d['samples'][0]['rot']['Hips'].rotation_difference(s['rot']['Hips']).angle)) for s in d['samples'])}}
def main():
 global TARGET,TARGET_HEIGHT
 job=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text(encoding='utf-8'));out=Path(job['output']);clean()
 target=imp(ROOT/'assets/target.fbx')[0];TARGET=set(b.name for b in target.data.bones);TARGET_HEIGHT=(target.matrix_world@target.data.bones['Hips'].matrix_local).translation.z
 clean();dancers=[]
 for p in job['inputs']:dancers+=(source_npy(Path(p)) if p.lower().endswith('.npy') else source_fbx(Path(p)))
 if len(dancers)>2:raise ValueError('Found more than two dancers; select one dance or one matching pair.')
 if len(dancers)==2 and (abs(dancers[0]['fps']-dancers[1]['fps'])>1e-5 or len(dancers[0]['samples'])!=len(dancers[1]['samples'])):raise ValueError('Pair timeline mismatch; refusing to truncate or shift either dancer')
 origin=dancers[0]['samples'][0]['hip'].copy();origin.z=(origin.z-TARGET_HEIGHT) if all(d['kind']=='DD100' for d in dancers) else 0
 for d in dancers:
  for s in d['samples']:s['hip']-=origin
 manifest={'schema':1,'name':'Animation Convert Blackbox','coordinateSystem':'right-handed Y-up metres; shared horizontal origin','targetPelvisHeight':TARGET_HEIGHT,'rootMotion':'script-only','dancers':[],'darkridePlaybackObserved':False,'inputs':job['inputs'],'sourceSharedHorizontalOriginMeters':yup(origin),'sourceWorldUp':('Z' if all(d['kind']=='DD100' for d in dancers) else 'FBX evaluated Z-up'),'coordinateCorrectionVersion':2}
 for d in dancers:manifest['dancers'].append(retarget(d,out))
 if len(dancers)==2:
  checks=[]
  for i in [0,len(dancers[0]['samples'])//4,len(dancers[0]['samples'])//2,3*len(dancers[0]['samples'])//4,len(dancers[0]['samples'])-1]:
   a,b=[d['samples'][i] for d in dancers];checks.append({'frame':i,'relativeHipMeters':yup(b['hip']-a['hip']),'sourceHandSeparationsMeters':{x+'-'+y:(a['hands'][x]-b['hands'][y]).length for x in a['hands'] for y in b['hands']}})
  manifest['pairSourceMeasurements']=checks
  comparison=[]
  for i in sorted(set(dancers[0]['_positions']) & set(dancers[1]['_positions'])):
   a,b=[d['_positions'][i] for d in dancers];sa,sb=[d['samples'][i] for d in dancers]
   entry={'frame':i,'relativeHipErrorMeters':((b['Hips']-a['Hips'])-(sb['hip']-sa['hip'])).length,'hands':{}}
   for x in ['LeftHand','RightHand']:
    for y in ['LeftHand','RightHand']:
     distance=(a[x]-b[y]).length;src=(sa['hands'][x]-sb['hands'][y]).length if x in sa['hands'] and y in sb['hands'] else None
     entry['hands'][x+'-'+y]={'retargetedSeparationMeters':distance,'sourceSeparationMeters':src,'differenceMeters':distance-src if src is not None else None}
   comparison.append(entry)
  manifest['pairComparison']=comparison
 (out/'playback.json').write_text(json.dumps(manifest,indent=2))
 print('CONVERSION_OK',str(out))
if __name__=='__main__':
 try:main()
 except Exception:
  traceback.print_exc();sys.exit(1)
