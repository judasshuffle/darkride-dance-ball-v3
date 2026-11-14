"""Restricted reader and discovery tests with entirely synthetic inputs."""
import tempfile
import unittest
from pathlib import Path
import numpy as np
from safe_npy import load_npy
from converter import inputs


class ReaderTests(unittest.TestCase):
    def test_matching_roles_and_solo(self):
        with tempfile.TemporaryDirectory() as tmp:
            paths = [Path(tmp) / ('Original_001_' + role + '.npy') for role in ['00', '01']]
            for p in paths:
                p.touch()
            self.assertEqual(len(inputs([paths[0]])), 2)
            self.assertEqual(len(inputs([paths[0]], solo=True)), 1)

    def test_numeric_types(self):
        with tempfile.TemporaryDirectory() as tmp:
            for dtype in ['float32', 'float64', '>f4']:
                p = Path(tmp) / 'original.npy'
                np.save(p, {'poses': np.zeros((4, 165), dtype=dtype), 'transl': np.zeros((4, 3))})
                self.assertEqual(load_npy(p)['poses'].shape, (4, 165))

    def test_reject_arbitrary_pickle(self):
        class Evil:
            def __reduce__(self):
                return eval, ('1+1',)
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'evil.npy'
            np.save(p, {'poses': Evil()})
            with self.assertRaisesRegex(ValueError, 'Forbidden pickle global'):
                load_npy(p)

    def test_reject_numeric_array_and_mismatched_pair(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'numeric.npy'
            np.save(p, np.zeros((4, 165)))
            with self.assertRaisesRegex(ValueError, 'dictionary'):
                load_npy(p)
            paths = [Path(tmp) / name for name in ['Alpha_00.npy', 'Beta_01.npy']]
            for p in paths:
                p.touch()
            with self.assertRaisesRegex(ValueError, 'matching'):
                inputs(paths)


if __name__ == '__main__':
    unittest.main()
