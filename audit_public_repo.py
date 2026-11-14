"""Reject assets, embedded payloads, private paths and common secrets in Git."""
import argparse
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FORBIDDEN_SUFFIXES = {'.fbx', '.npy', '.npz', '.blend', '.blend1', '.zip', '.gz', '.bin', '.log'}
FORBIDDEN_DIRS = {'assets', 'sources', 'output', 'fixtures', 'diagnostics', 'backups', 'package-assets', '.venv', '__pycache__'}
GENERATED = {'creator-package.json', 'asset-verification.json', 'reference-rig.json', 'config.json', 'LIBRARY.md'}
PATTERNS = [
    ('private Windows path', re.compile(r'[A-Za-z]:[/\\](?:Users|Projects)[/\\]', re.I)),
    ('private key', re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')),
    ('GitHub token', re.compile(r'gh[pousr]_[A-Za-z0-9]{30,}')),
    ('AWS key', re.compile(r'AKIA[A-Z0-9]{16}')),
    ('long embedded base64 data', re.compile(r'[A-Za-z0-9+/]{512,}={0,2}')),
]


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def check_path(name):
    path = Path(name)
    if path.suffix.lower() in FORBIDDEN_SUFFIXES or any(p in FORBIDDEN_DIRS for p in path.parts):
        raise ValueError('Asset/generated path in Git: ' + name)
    if path.name in GENERATED or path.name.startswith('.env') or path.name.endswith('.local.json'):
        raise ValueError('Local/generated file in Git: ' + name)


def check_bytes(name, raw):
    if len(raw) > 256*1024 or b'\x00' in raw:
        raise ValueError('Large/binary object in Git: ' + name)
    text = raw.decode('utf-8')
    for label, pattern in PATTERNS:
        if pattern.search(text):
            raise ValueError(label + ' in ' + name)


def audit(history=True):
    names = [s for s in git('ls-files', '-z').decode().split('\0') if s]
    for name in names:
        check_path(name)
        check_bytes(name, (ROOT / name).read_bytes())
    objects = 0
    has_head = subprocess.run(['git', 'rev-parse', '--verify', 'HEAD'], cwd=ROOT, capture_output=True).returncode == 0
    if history and has_head:
        for line in git('rev-list', '--objects', '--all').decode().splitlines():
            sha, _, name = line.partition(' ')
            if git('cat-file', '-t', sha).strip() != b'blob':
                continue
            check_path(name)
            check_bytes(name or sha, git('cat-file', '-p', sha))
            objects += 1
    print(f'Public source audit passed: {len(names)} tracked files, {objects} historical blobs; no excluded asset data, private paths or matched secrets.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--no-history', action='store_true', help='Pre-commit working/index check only')
    args = parser.parse_args()
    audit(not args.no_history)
