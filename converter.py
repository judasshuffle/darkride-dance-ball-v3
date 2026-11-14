"""Animation Convert Blackbox: Windows GUI and repeatable CLI."""
import argparse,datetime,json,os,shutil,subprocess,sys,threading,queue,uuid,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def blender_path():
 candidates=[os.environ.get('BLENDER_EXE'),shutil.which('blender')]
 candidates+=sorted((Path(os.environ.get('ProgramFiles','C:/Program Files'))/'Blender Foundation').glob('Blender */blender.exe'),reverse=True)
 for p in candidates:
  if p and Path(p).is_file():return str(p)
 raise RuntimeError('Blender is missing. Install Blender 4.2 LTS or newer from https://www.blender.org/download/ or set BLENDER_EXE to the full path of blender.exe.')
def inputs(paths,solo=False):
 result=[]
 for p in paths:
  p=Path(p).resolve()
  if not p.is_file() or p.suffix.lower() not in ['.fbx','.npy']:raise ValueError('Choose an FBX or DD100 NPY file: '+str(p))
  if p not in result:result.append(p)
 if len(result)==1 and not solo and result[0].suffix.lower()=='.npy':
  p=result[0]
  if p.stem.endswith(('_00','_01')):
   other=p.with_name(p.stem[:-3]+('_01' if p.stem.endswith('_00') else '_00')+'.npy')
   if other.is_file():result.append(other)
 if len(result)>2:raise ValueError('Select one FBX or up to two matching dancer files.')
 if len(result)==2 and all(p.suffix.lower()=='.npy' for p in result):
  if {p.stem[-3:] for p in result}!={'_00','_01'} or result[0].stem[:-3]!=result[1].stem[:-3]:raise ValueError('The two DD100 files must be the matching _00 and _01 take.')
 return result

def convert(paths,solo=False):
 exe=blender_path();selected=inputs(paths,solo)
 def digest(p):
  h=hashlib.sha256()
  with p.open('rb') as f:
   for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
  return h.hexdigest()
 hashes={str(p):digest(p) for p in selected}
 stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:6]
 out=ROOT/'output'/(selected[0].stem+'-'+stamp);out.mkdir(parents=True)
 (out/'job.json').write_text(json.dumps({'inputs':list(map(str,selected)),'output':str(out)},indent=2))
 command=[exe,'--background','--factory-startup','--python-exit-code','1','--python',str(ROOT/'blender_convert.py'),'--',str(out/'job.json')]
 with (out/'conversion.log').open('w',encoding='utf-8') as log:
  process=subprocess.run(command,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
 if process.returncode or not (out/'playback.json').exists():
  tail=(out/'conversion.log').read_text(encoding='utf-8',errors='replace')[-2500:]
  (out/'FAILED.txt').write_text(tail,encoding='utf-8')
  raise RuntimeError('Conversion failed. Details in '+str(out/'conversion.log')+'\n\n'+tail)
 manifest=json.loads((out/'playback.json').read_text(encoding='utf-8'))
 if hashes!={str(p):digest(p) for p in selected}:raise RuntimeError('An input file changed during conversion; output requires review.')
 manifest['inputSha256']=hashes
 (out/'playback.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
 summary=[]
 for d in manifest['dancers']:
  summary.append(d['file']+'  -  '+str(d['frames'])+' frames at '+str(d['fps'])+' fps; '+str(round(d['durationSeconds'],3))+' seconds')
  summary.append('Unmapped source joints: '+(', '.join(d['unmapped']) or 'none'))
  summary.extend(d['warnings'])
 summary.append('Root movement: use the included player. FBX root movement is intentionally constant to prevent double movement.')
 summary.append('FBX reimport verification passed. Avatar appearance and hand contact require a viewer test.')
 (out/'conversion-summary.txt').write_text('\n'.join(summary),encoding='utf-8')
 return out

def main():
 parser=argparse.ArgumentParser(description='Convert user-supplied FBX or matching DD100 NPY files')
 parser.add_argument('files',nargs='*');parser.add_argument('--cli',action='store_true',help='Accepted for compatibility; conversion is command-line based')
 parser.add_argument('--solo',action='store_true',help='Do not find an NPY partner');parser.add_argument('--check',action='store_true',help='Show detected Blender')
 args=parser.parse_args()
 if args.check:print(blender_path());return
 if not args.files:parser.print_help();return
 if not (ROOT/'assets/target.fbx').is_file():parser.error('Set up your own reference rig first: python setup_reference.py --help')
 print(convert(args.files,args.solo))
if __name__=='__main__':main()
