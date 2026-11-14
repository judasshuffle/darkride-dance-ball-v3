"""Register converted, user-supplied assets in ignored local configuration."""
import argparse
import json
import os
from pathlib import Path
from dance_package import inspect

ROOT = Path(__file__).resolve().parent
BALL = ROOT / 'dance-ball-v3'


def register(folder, name, mode='both', style='', notice=None, attribution='', root=ROOT):
    root = Path(root)
    ball = root / 'dance-ball-v3'
    folder = Path(folder).resolve()
    package = inspect(folder)
    count = len(package['entry']['parts'])
    if mode == 'both' and count == 1:
        mode = 'single'
    if mode == 'couple' and count != 2:
        raise ValueError('Couple needs two records on one shared timeline')
    if notice and not Path(notice).read_text(encoding='utf-8').strip():
        raise ValueError('The supplied notice file is empty')
    path = ball / 'config.json'
    config = json.loads(path.read_text()) if path.exists() else {'schema': 1, 'dances': []}
    for choice_mode in (['couple', 'single'] if mode == 'both' else [mode]):
        choice = {'source': Path(os.path.relpath(folder, ball)).as_posix(), 'name': name.strip(),
                  'style': style.strip() or name.strip(), 'mode': choice_mode}
        if not choice['name']:
            raise ValueError('Use a nonempty dance name')
        if choice_mode == 'single':
            choice['dancerIndex'] = next((i for i, p in enumerate(package['entry']['parts']) if p['label'] == 'Lead'), 0)
        if notice:
            choice['notice'] = Path(os.path.relpath(Path(notice).resolve(), ball)).as_posix()
            choice['attribution'] = attribution
        config['dances'] = [d for d in config['dances'] if (d['name'].casefold(), d['mode']) != (choice['name'].casefold(), choice_mode)]
        config['dances'].append(choice)
    path.write_text(json.dumps(config, indent=2) + '\n')
    return config


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', type=Path)
    parser.add_argument('--name', required=True)
    parser.add_argument('--mode', choices=['single', 'couple', 'both'], default='both')
    parser.add_argument('--style', default='')
    parser.add_argument('--notice', type=Path, help='Local licence/copyright/disclaimer file to carry with the release')
    parser.add_argument('--attribution', default='')
    args = parser.parse_args()
    result = register(args.folder, args.name, args.mode, args.style, args.notice, args.attribution)
    print('Registered local choices:', len(result['dances']))


if __name__ == '__main__':
    main()
