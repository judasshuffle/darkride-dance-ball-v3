"""Validate a local converted dance without publishing it."""
import hashlib, json, math, re
from pathlib import Path

def sha(data):
    return hashlib.sha256(data).hexdigest()

def inspect(folder):
    folder = Path(folder).resolve()
    if (folder/'FAILED.txt').exists():
        raise ValueError('Failed conversion: '+str(folder))
    raw = (folder/'playback.json').read_bytes()
    m = json.loads(raw)
    dancers = m.get('dancers', [])
    if len(dancers) not in (1, 2):
        raise ValueError('A dance must have one or two dancer records')
    periods, timelines, files, parts = [], [], {'playback.json': raw}, []
    source_roles=[d.get('role','dancer') for d in dancers]
    for index,d in enumerate(dancers):
        role = d['role']
        if not isinstance(role,str) or not role: raise ValueError('Invalid dancer role')
        f = Path(d['file'])
        if f.name != str(f) or f.suffix.lower() != '.fbx' or ':' in str(f) or '\\' in str(f):
            raise ValueError('FBX reference must be a package filename')
        frames, fps, period = d['frames'], d['fps'], d['durationSeconds']
        if not isinstance(frames,int) or frames < 2 or not math.isfinite(fps) or fps <= 0 or not math.isfinite(period) or period <= 0:
            raise ValueError('Invalid timeline')
        positions = d['rootPositions']
        if len(positions) != frames or any(len(p)!=3 or not all(math.isfinite(v) for v in p) for p in positions):
            raise ValueError('Invalid hip path')
        periods.append(period); timelines.append((frames,fps))
        if str(f) in files: raise ValueError('Each dancer must reference its own FBX')
        files[str(f)] = (folder/f).read_bytes()
        if not files[str(f)]: raise ValueError('Empty FBX')
        # Generic FBX conversions can legitimately call BOTH records "dancer".
        # Keep their exact record/index/file; use unique reservation keys only.
        key=role if source_roles.count(role)==1 else 'part'+str(index)
        label='Solo' if len(dancers)==1 else 'Lead' if role=='leader' else 'Follow' if role=='follower' else ['Lead','Follow'][index]
        parts.append({'role':key,'sourceRole':role,'dancerIndex':index,'dancerId':d.get('id'),'file':str(f),'label':label,'url':'atp:'+sha(files[str(f)])})
    if len(set(timelines)) != 1 or max(periods)-min(periods) > 1e-6:
        raise ValueError('Dancers need a single shared timeline and period')
    settings = folder/'dance-publish.json'
    saved = json.loads(settings.read_text(encoding='utf-8')) if settings.exists() else {}
    manifest_name=m.get('name') if m.get('name')!='Animation Convert Blackbox' else None
    default = str(m.get('friendlyName') or manifest_name or dancers[0].get('id') or Path(dancers[0]['file']).stem).split('_')[0]
    default = re.sub(r'(?<=[a-z])(?=[A-Z])',' ',default)
    entry = {'id':sha(folder.name.encode())[:24], 'name':saved.get('name', default),
             'parts':parts, 'periodSeconds':periods[0]}
    if m.get('openGroup') is True or m.get('danceType') == 'open-group':
        entry['openGroup'] = True
    if m.get('mannequinSupported') is True or default.casefold() == 'foxtrot':
        entry['mannequinSupported'] = True
    digest = hashlib.sha256()
    for name, data in sorted(files.items()):
        digest.update(name.encode()); digest.update(b'\0'); digest.update(bytes.fromhex(sha(data)))
    revision = digest.hexdigest()
    prefix = '/dance-ball-v3/dances/'+entry['id']+'/'+revision+'/'
    entry['manifest'] = 'atp:'+prefix+'playback.json'
    entry['revision'] = revision
    return {'folder':folder, 'entry':entry, 'files':files, 'prefix':prefix}
