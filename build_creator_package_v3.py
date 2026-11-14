"""Build an ignored local V3 installer index from user-supplied assets.

A fresh checkout builds an empty, usable catalogue without any reference model.
Dance bytes are kept in separate compressed payloads, not the index or Git.
"""
import base64
import gzip
import hashlib
import json
from pathlib import Path
from dance_package import inspect

ROOT = Path(__file__).resolve().parent
RELEASE = 'v3-public-1'
RUNTIME_FILES = ['ball-client.js', 'ball-server.js', 'catalogue-coordinator.js',
                 'catalogue-store.js', 'playback.js', 'menu.html']


def load_config(root=ROOT):
    ball = Path(root) / 'dance-ball-v3'
    path = ball / 'config.json'
    config = json.loads((path if path.exists() else ball / 'config.example.json').read_text(encoding='utf-8'))
    if not isinstance(config.get('dances'), list):
        raise ValueError('Local configuration needs a dances array')
    return config


def build(root=ROOT):
    root = Path(root).resolve()
    ball = root / 'dance-ball-v3'
    choices = load_config(root)['dances']
    reference = None
    if choices:
        path = ball / 'reference-rig.json'
        if not path.exists():
            raise ValueError('Run setup_reference.py with your own rig before packaging dances')
        reference = json.loads(path.read_text())
        if not .3 < reference['heightMeters'] < 4:
            raise ValueError('Invalid reference height')
        if hashlib.sha256((root / reference['source']).read_bytes()).hexdigest() != reference['sourceSha256']:
            raise ValueError('Reference rig changed; rerun setup_reference.py and reconvert')
    files, entries, report, packages = [], [], [], {}
    payloads = ball / 'package-assets'
    payloads.mkdir(exist_ok=True)
    paths = set()

    def add(path, data, inline=False):
        if path in paths:
            return
        paths.add(path)
        item = {'path': path, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
        if inline:
            item['text'] = data.decode('utf-8')
        else:
            item['source'] = 'package-assets/' + item['sha256'] + '.json'
            payload = {'sha256': item['sha256'], 'gzipBase64': base64.b64encode(gzip.compress(data, mtime=0)).decode('ascii')}
            encoded = json.dumps(payload, separators=(',', ':')).encode('ascii')
            if len(encoded) >= 8*1024*1024:
                raise ValueError('Payload too large for bounded module loading: ' + path)
            (ball / item['source']).write_bytes(encoded)
        files.append(item)

    for name in RUNTIME_FILES:
        add(name, (ball / name).read_bytes(), True)
    target_height = reference.get('targetPelvisHeight') if reference else None
    for choice in choices:
        if choice.get('mode') not in ['single', 'couple']:
            raise ValueError('Choose single or couple mode')
        folder = (ball / choice['source']).resolve()
        package = packages.get(folder) or inspect(folder)
        manifest = json.loads(package['files']['playback.json'])
        height = manifest['targetPelvisHeight']
        if target_height is None:
            target_height = height
        if abs(target_height - height) > 1e-6:
            raise ValueError('Mixed reference rigs: reconvert dances with the configured rig')
        prefix = 'dances/' + package['entry']['id']
        entry = json.loads(json.dumps(package['entry']))
        if choice['mode'] == 'single':
            index = choice.get('dancerIndex', 0)
            if not isinstance(index, int) or not 0 <= index < len(entry['parts']):
                raise ValueError('Invalid dancerIndex')
            entry['parts'] = [entry['parts'][index]]
            entry['parts'][0]['label'] = 'Solo'
            if len(manifest['dancers']) > 1:
                entry['id'] = hashlib.sha256((entry['id'] + ':solo:' + str(index)).encode()).hexdigest()[:24]
        else:
            if len(entry['parts']) != 2:
                raise ValueError('Couple needs two dancers')
            entry['parts'].sort(key=lambda p: p['label'] != 'Lead')
            entry['referenceHeight'] = reference['heightMeters']
        entry['name'] = choice['name']
        entry['style'] = choice.get('style', choice['name'])
        entry['manifest'] = prefix + '/playback.json'
        entry.pop('mannequinSupported', None)
        entry.pop('mannequin', None)
        if choice.get('notice'):
            notice = (ball / choice['notice']).read_bytes()
            if not notice.strip():
                raise ValueError('Licence notice is empty')
            notice_path = 'notices/' + hashlib.sha256(notice).hexdigest() + '.txt'
            add(notice_path, notice)
            # Relative to the immutable release; the installer makes it an ATP URL.
            entry['notice'] = notice_path
            entry['attribution'] = choice.get('attribution', '')
        entries.append(entry)
        if folder not in packages:
            packages[folder] = package
            for filename, raw in package['files'].items():
                if filename.endswith('.fbx') and not raw.startswith(b'Kaydara FBX Binary  \x00\x1a\x00'):
                    raise ValueError('Not a binary FBX: ' + filename)
                add(prefix + '/' + filename, raw)
            report.append({'manifest': entry['manifest'], 'files': {
                name: {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
                for name, raw in package['files'].items()}})
    if len({e['id'] for e in entries}) != len(entries):
        raise ValueError('Duplicate dance choices; register each source/mode once')
    bundle = {'schema': 3, 'format': 'sharded-gzip', 'release': RELEASE,
              'targetPelvisHeight': target_height if target_height is not None else 1.2090423107147217,
              'entries': entries, 'files': files}
    encoded = json.dumps(bundle, ensure_ascii=True, separators=(',', ':')).encode('utf-8')
    if len(encoded) >= 256*1024:
        raise ValueError('Package index too large; split the library into smaller releases')
    dest = ball / 'creator-package.json'
    dest.write_bytes(encoded)
    (ball / 'asset-verification.json').write_text(json.dumps({'release': RELEASE, 'assets': report}, indent=2) + '\n')
    (ball / 'LIBRARY.md').write_text('# Local dance catalogue\n\n' + (
        '\n'.join('- ' + e['name'] + (' (Single)' if len(e['parts']) == 1 else ' (Couple)') for e in entries)
        if entries else 'Empty catalogue. Import your own licensed dances; see the setup guide.') + '\n')
    return dest


if __name__ == '__main__':
    print(build())
