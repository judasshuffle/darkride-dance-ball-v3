"""Import matching DD100 takes obtained independently from the official source.

Requires the dataset's complete copyright/licence/disclaimer notice. It is carried
into the generated installer and ATP release, not added to this source repository.
"""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
from add_dance import register
from converter import convert, inputs
from dance_package import inspect

ROOT = Path(__file__).resolve().parent
LABELS = {'Lumba': 'Rumba', 'PasoDable': 'Paso Doble', 'Qiaqiaqia': 'Cha Cha'}
ATTRIBUTION = 'DD100 / Duolando, Li Siyao and collaborators, ICLR 2024. https://lisiyao21.github.io/projects/Duolando/ ; S-Lab 1.0, non-commercial.'


def select_takes(source, takes=2, styles=None):
    groups = {}
    for path in sorted(Path(source).glob('*_01.npy')):
        style = path.stem.split('_')[0]
        if (not styles or style in styles) and path.with_name(path.stem[:-3] + '_00.npy').is_file():
            groups.setdefault(style, []).append(path)
    if styles and set(styles) - set(groups):
        raise ValueError('Styles not found: ' + ', '.join(sorted(set(styles) - set(groups))))
    if not groups:
        raise ValueError('No matching _01.npy / _00.npy takes found')
    if takes < 1:
        raise ValueError('Use at least one take')
    for style, paths in groups.items():
        if len(paths) < takes:
            raise ValueError(style + ' has fewer matching takes than requested')
    return {style: paths[:takes] for style, paths in groups.items()}


def verified_output(path):
    selected = inputs([path])
    expected = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in selected}
    for folder in sorted((ROOT / 'output').glob(path.stem + '-*'), reverse=True):
        try:
            package = inspect(folder)
            manifest = json.loads(package['files']['playback.json'])
            if len(package['entry']['parts']) == 2 and manifest.get('inputSha256') == expected:
                return folder
        except (OSError, ValueError, KeyError):
            pass
    return convert([str(path)])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--takes', type=int, default=2)
    parser.add_argument('--styles', nargs='+', help='Optional source genre prefixes, e.g. Jive Ballet')
    parser.add_argument('--jobs', type=int, choices=[1, 2], default=2)
    parser.add_argument('--notice', type=Path, required=True, help='Complete licence/copyright/disclaimer obtained from the authors')
    args = parser.parse_args()
    if not args.notice.read_text(encoding='utf-8').strip():
        parser.error('Supply the complete nonempty dataset licence notice')
    selected = select_takes(args.source.resolve(), args.takes, args.styles)
    paths = [p for group in selected.values() for p in group]
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
        outputs = dict(zip(paths, pool.map(verified_output, paths)))
    for style, group in selected.items():
        for i, path in enumerate(group):
            name = LABELS.get(style, style) + ' ' + f'{i+1:02}'
            register(outputs[path], name, 'both', LABELS.get(style, style), args.notice, ATTRIBUTION)
            print('Registered Single and Couple: ' + name, flush=True)


if __name__ == '__main__':
    main()
