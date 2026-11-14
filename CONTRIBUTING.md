# Contributing

Keep pull requests source-only. Do not add recordings, reference models, converted FBXs, generated installer indices/payloads or asset-containing release archives. Add official provider links and import instructions instead.

Create test motions from original numbers/geometry in test code. Do not make public fixtures by trimming, renaming or re-exporting a third-party dance. Current fixtures are synthetic and test transport, identity and timing; they do not establish visual dance quality.

Before committing:

```powershell
python -m unittest test_converter test_public_release
node dance-ball-v3/test-coordinator.js
node dance-ball-v3/test-click-flow.js
python audit_public_repo.py
git diff --check
```

The audit covers tracked paths, their contents and all reachable Git history. It is a focused safeguard against asset payloads, private paths and common secrets, not a complete copyright or security audit. Review changed files as well. Do not attach a generated package to a public software release without separately checking its asset distribution rights and notices.

Public software changes need automated checks; custom assets and viewers still need manual visual checks. Keep simulation results separate from live observations, and distinguish two viewers on one PC from remote timing tests.
