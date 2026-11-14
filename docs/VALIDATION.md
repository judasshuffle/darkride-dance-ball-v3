# Source-release validation

Checked locally on 14 November 2026 with Python 3.10 / NumPy 1.26, Node.js 24 and Blender 4.5 on Windows.

| Check | Result |
|---|---|
| Ten Python tests | Passed: restricted NPY reading, matching pairs, original synthetic data, empty build, package integrity, clip indices, licence-notice transport, duplicate registration, reference guards, dataset selection and history auditing. |
| Coordinator simulation | Passed: both role orders, duplicate claims, racing Follow, distinct sessions, independent pairs, one UTC start, loops, stop, disconnect, expiry and reuse. |
| Attached client/server simulation | Passed: clickable menus, consumed pose balls, main-ball Stop, restored world collisions and original scale, main-menu height choice, no local mannequin or pose labels, stale callbacks/messages, empty Single and Couple lists with Back. |
| Creator simulation with a 64 MB Node heap | Passed for an empty catalogue and a synthetic populated catalogue; reads one JSON payload at a time, evicts cache/parent references, checks decoded bytes and uploaded readback, carries notice URLs, commits catalogue last and isolates V1/V2 resources. |
| Fresh local Git clone | Passed all tests and built an empty catalogue without reference or dance assets. |
| Real Blender conversion from that clone | Measured a separately supplied local rig, converted an original synthetic 12-frame duet, reimport-verified both real FBXs, registered Single/Couple, built and verified their payloads in installer simulation. These generated files were temporary and were never committed. |
| Public Git audit | Passed tracked-source and complete reachable-history checks for excluded asset paths, generated payloads, private Windows paths and matched secret patterns. A negative test proves that removing an asset from the latest tree does not conceal it from the history audit. |

The source release is based on a locally live-tested V3 runtime. The new public empty-catalogue build and setup changes were validated locally as above, not installed through a live viewer during this release check. User assets and avatars still require manual visual testing. Remote dance timing is a separate check from two viewers on one PC.

The repository audit is a focused safeguard, not a complete copyright or security assessment. Official source references, code licensing and external-asset conditions are documented in [licensing notes](../THIRD_PARTY.md) and [animation sources](../ANIMATION-SOURCES.md).
