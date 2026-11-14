"""Asset-free tests. All sample motion and byte fixtures are authored here."""
import base64
import gzip
import hashlib
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from add_dance import register
from build_creator_package_v3 import build, ROOT, RUNTIME_FILES
from dance_package import inspect
from import_v3_library import select_takes


def make_project(root):
    ball = root / 'dance-ball-v3'
    ball.mkdir()
    for name in RUNTIME_FILES + ['install.js', 'assets.js', 'publish-runner.js', 'test-creator.js']:
        shutil.copy2(ROOT / 'dance-ball-v3' / name, ball / name)
    (ball / 'config.example.json').write_text('{"dances":[]}')
    return ball


def synthetic_package(root):
    folder = root / 'output' / 'authored-test-take'
    folder.mkdir(parents=True)
    dancers = []
    for i, role in enumerate(['leader', 'follower']):
        # Deliberately not a playable FBX: only tests binary integrity plumbing.
        raw = b'Kaydara FBX Binary  \x00\x1a\x00' + ('original-test-bytes-' + str(i)).encode() * 20
        filename = role + '.fbx'
        (folder / filename).write_bytes(raw)
        dancers.append({'id': role, 'role': role, 'file': filename, 'frames': 4, 'fps': 1,
                        'durationSeconds': 3, 'rootPositions': [[i*.5+t*.1, 1.2, 0] for t in range(4)]})
    (folder / 'playback.json').write_text(json.dumps({'dancers': dancers, 'targetPelvisHeight': 1.2}))
    assets = root / 'assets'
    assets.mkdir()
    rig = b'Original test reference bytes, not a rig or model'
    (assets / 'target.fbx').write_bytes(rig)
    (root / 'dance-ball-v3' / 'reference-rig.json').write_text(json.dumps({
        'heightMeters': 1.9, 'targetPelvisHeight': 1.2, 'source': 'assets/target.fbx',
        'sourceSha256': hashlib.sha256(rig).hexdigest()}))
    return folder


class PublicReleaseTests(unittest.TestCase):
    def test_empty_checkout_build_and_real_installer(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            bundle = json.loads(build(root).read_text())
            self.assertEqual(bundle['entries'], [])
            self.assertEqual(len(bundle['files']), len(RUNTIME_FILES))
            self.assertFalse(any('source' in f for f in bundle['files']))
            subprocess.run(['node', '--max-old-space-size=64', 'dance-ball-v3/test-creator.js'], cwd=root, check=True)

    def test_shared_manifest_indices_notices_and_installer(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ball = make_project(root)
            folder = synthetic_package(root)
            notice = root / 'original-notice.txt'
            notice.write_text('Original synthetic test notice; freely authored test fixture.')
            register(folder, 'Original example', 'both', 'Example', notice, 'Synthetic test authors', root)
            bundle = json.loads(build(root).read_text())
            couple, solo = bundle['entries']
            self.assertEqual([len(e['parts']) for e in bundle['entries']], [2, 1])
            self.assertNotEqual(couple['id'], solo['id'])
            self.assertEqual(couple['manifest'], solo['manifest'])
            self.assertEqual(solo['parts'][0]['dancerIndex'], 0)
            self.assertEqual(sum(f['path'].endswith('.fbx') for f in bundle['files']), 2)
            self.assertEqual(couple['notice'], solo['notice'])
            for f in bundle['files']:
                if 'text' in f:
                    raw = f['text'].encode()
                else:
                    packet = json.loads((ball / f['source']).read_text())
                    raw = gzip.decompress(base64.b64decode(packet['gzipBase64']))
                self.assertEqual(hashlib.sha256(raw).hexdigest(), f['sha256'])
            subprocess.run(['node', '--max-old-space-size=64', 'dance-ball-v3/test-creator.js'], cwd=root, check=True)

    def test_reject_invalid_pair_and_duplicate_registration(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_project(root)
            folder = synthetic_package(root)
            register(folder, 'Example', root=root)
            register(folder, 'Example', root=root)
            self.assertEqual(len(json.loads((root / 'dance-ball-v3/config.json').read_text())['dances']), 2)
            manifest_path = folder / 'playback.json'
            manifest = json.loads(manifest_path.read_text())
            manifest['dancers'][1]['fps'] = 2
            manifest_path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'timeline'):
                inspect(folder)

    def test_partial_dataset_selection_has_no_legacy_dependencies(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)
            for take in ['001', '002', '003']:
                for role in ['00', '01']:
                    (source / f'Example_001_{take}_{role}.npy').touch()
            result = select_takes(source, 2, ['Example'])
            self.assertEqual([p.name for p in result['Example']], ['Example_001_001_01.npy', 'Example_001_002_01.npy'])
            with self.assertRaisesRegex(ValueError, 'Styles not found'):
                select_takes(source, 1, ['Missing'])

    def test_missing_reference_and_changed_reference_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ball = make_project(root)
            folder = synthetic_package(root)
            register(folder, 'Example', root=root)
            (root / 'assets/target.fbx').write_bytes(b'Changed reference')
            with self.assertRaisesRegex(ValueError, 'Reference rig changed'):
                build(root)
            (ball / 'reference-rig.json').unlink()
            with self.assertRaisesRegex(ValueError, 'setup_reference'):
                build(root)

    def test_history_audit_rejects_a_removed_asset(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            shutil.copy2(ROOT / 'audit_public_repo.py', root / 'audit_public_repo.py')
            subprocess.run(['git', 'init', '-q'], cwd=root, check=True)
            private = root / 'creator-package.json'
            private.write_text('{"forbidden":"original synthetic test marker"}')
            identity = ['git', '-c', 'user.name=Test contributors', '-c', 'user.email=tests@example.invalid']
            subprocess.run(['git', 'add', '.'], cwd=root, check=True)
            subprocess.run(identity + ['commit', '-qm', 'Test old asset'], cwd=root, check=True)
            private.unlink()
            subprocess.run(['git', 'add', '-u'], cwd=root, check=True)
            subprocess.run(identity + ['commit', '-qm', 'Remove test asset'], cwd=root, check=True)
            result = subprocess.run(['python', 'audit_public_repo.py'], cwd=root, text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Local/generated file in Git: creator-package.json', result.stderr)


if __name__ == '__main__':
    unittest.main()
