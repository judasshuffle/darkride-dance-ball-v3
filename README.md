# DarkRide Dance Ball V3

A persistent, clickable dance launcher for DarkRide. Visitors choose **Single** or **Couple**, claim temporary floor pose balls, and dance using a shared UTC timeline. Every dance loops; clicking the main floating ball stops your own session and restores avatar position, scale and world collisions.

This is a **source-only release** with fresh Git history. It includes no dance recordings, converted animations, reference models, asset payloads or private installation data. A fresh checkout builds an empty catalogue. Supply assets you are entitled to use, or obtain examples from their original creators.

Start with the [setup guide](docs/SETUP.md), [official animation sources](ANIMATION-SOURCES.md), and [licensing notes](THIRD_PARTY.md).

## Features

- Two actual category buttons: Single and Couple. Longer dance lists have Previous/Next buttons.
- Solo: one temporary cyan ball; click it and choose a dance.
- Couple: cyan Lead and pink Follow. Click either role first; the requester chooses the dance through Lead. No avatar picker, invitations or display-name matching.
- Optional height matching appears only in the main Couple menu. It matches overall height, not limb proportions or hand IK.
- Claimed pose balls disappear. No floating pose labels or extra local mannequin.
- The coordinator owns claims and starts. Distinct session UUIDs, claim tokens, epochs and revisions isolate independent pairs.
- Main-ball Stop restores both participants, including world collisions. Missing heartbeats and abandoned sessions clean up.
- The creator publishes a verified ATP package once; visitors load no helper scripts or settings.

## Quick start with an empty catalogue

Install Python 3.10 or later. From this folder:

```powershell
py -3 build_creator_package_v3.py
```

Run `dance-ball-v3/install.js` once in your creator viewer connected to your own domain, then wait for Ready. This creates the launcher and empty menus; it does not include playable dances. See the setup guide to add your own clips. On other platforms use `python3` instead of `py -3`.

Conversion additionally needs Blender (tested with 4.5) and your own compatible reference rig. Python tests need NumPy; runtime simulations need Node.js 20 or later. No npm packages are needed.

## Local checks

```powershell
py -3 -m pip install -r requirements.txt
py -3 -m unittest test_converter test_public_release
node dance-ball-v3/test-coordinator.js
node dance-ball-v3/test-click-flow.js
py -3 audit_public_repo.py
```

Tests create original synthetic inputs in temporary folders. They do not require downloaded dances or redistribute motion captured from another source. The package fixtures test integrity transport and are deliberately not playable FBX files.

The runtime is derived from a locally live-tested V3 release, including two viewers on one PC. This source distribution has automated empty-build and synthetic-package checks. New user assets, custom avatars and remote network timing need their own live checks; simulation is not a visual dance test.

## Licence and contributions

Project code is under the [MIT licence](LICENSE). Third-party animation data, reference rigs and separately installed dependencies retain their own licences. In particular, DD100 is offered under S-Lab 1.0 for non-commercial use under its conditions; this project's MIT licence does not change that.

Keep generated packages, motion and personal configuration out of commits. Run the source/history audit before publishing. See [contributing](CONTRIBUTING.md).
