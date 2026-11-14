"""Copy and measure a user-supplied reference rig; no rig is distributed."""
import argparse
import json
import shutil
import subprocess
from pathlib import Path
from converter import blender_path

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('rig', type=Path, help='Your licensed DarkRide-compatible reference mannequin FBX')
    parser.add_argument('--height', type=float, help='Standing height in metres, if the FBX has no mesh')
    args = parser.parse_args()
    source = args.rig.resolve()
    if not source.read_bytes().startswith(b'Kaydara FBX Binary'):
        parser.error('Use a binary FBX reference rig')
    if args.height is not None and not .3 < args.height < 4:
        parser.error('Reference height must be between 0.3 and 4 metres')
    target = ROOT / 'assets' / 'target.fbx'
    target.parent.mkdir(exist_ok=True)
    if source != target.resolve():
        shutil.copy2(source, target)
    command = [blender_path(), '--background', '--factory-startup', '--python-exit-code', '1',
               '--python', str(ROOT / 'measure_reference.py'), '--', str(ROOT)]
    if args.height is not None:
        command.append(str(args.height))
    subprocess.run(command, check=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    print(json.loads((ROOT / 'dance-ball-v3' / 'reference-rig.json').read_text()))


if __name__ == '__main__':
    main()
