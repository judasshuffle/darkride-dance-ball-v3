# Setup and installation

## 1. Check the domain and tools

Use a DarkRide domain where your creator account can rez entities and write ATP assets, and an entity-script-server assignment is running. Visitors need no script installation or settings changes.

Install Python 3.10+, Blender (conversion tested with 4.5) and optionally Node.js 20+ for tests. Set `BLENDER_EXE` to your Blender executable if automatic discovery cannot find it. Run commands from the repository folder. Windows examples use `py -3`; use `python3` on other platforms.

```powershell
py -3 -m pip install -r requirements.txt
py -3 converter.py --check
```

The command-line converter is included. The private project's older GUI/publisher and V1/V2 installers are not part of this source release.

## 2. Optional first install with empty menus

```powershell
py -3 build_creator_package_v3.py
```

In your creator viewer, use its script-loading interface to run the local `dance-ball-v3/install.js`. Wait for Ready. Click the main ball, choose Single or Couple and claim the corresponding floor ball: the dance list has a clear empty state and Back. Click the main ball to cancel any waiting session before updating.

Building the empty catalogue requires no rig or animation downloads. On a domain with an existing V3 catalogue, installation merges entries; an empty build does not delete previously published dances.

## 3. Supply your own compatible reference rig

The converter needs a licensed DarkRide-compatible reference mannequin in its standard standing rest pose, with canonical names such as Hips, Head, LeftHand and RightHand. One option is the reference mannequin from your own DarkRide installation, subject to that asset's terms. Rig compatibility matters: a random humanoid file may have different rest transforms or names.

```powershell
py -3 setup_reference.py 'C:/MyAssets/reference-mannequin.fbx'
```

This copies your file into ignored `assets/target.fbx`, measures its mesh and Hips in Blender, and saves ignored `dance-ball-v3/reference-rig.json`. Your source is not changed. If it is a rig without a mesh, supply its known standing height in metres:

```powershell
py -3 setup_reference.py 'C:/MyAssets/reference-mannequin.fbx' --height 1.9
```

Use the same rig for every conversion in a package. If you change it, run setup again and reconvert. Height matching uses this measurement; different body proportions can still prevent exact hand contact.

## 4. Obtain example dances from the creators

See [Animation sources](../ANIMATION-SOURCES.md) for the official Duolando/DD100 page, data download link and example filenames. Download and extract the dataset yourself under its terms. It is not included here. Its NPY pairs live under `data/motion/smplx/all/`.

For DD100, obtain the complete licence notice from the authors' linked licence. For example, keep a local copy in ignored `sources/`:

```powershell
New-Item -ItemType Directory -Force sources
Invoke-WebRequest 'https://raw.githubusercontent.com/lisiyao21/Bailando/main/LICENSE' -OutFile sources/DD100-LICENSE.txt
```

The official Duolando page links that Bailando licence. Review the current conditions yourself: non-commercial use is permitted subject to its conditions, and commercial use needs the contributors' permission. The notice file must include its copyright, conditions and disclaimer.

## 5. Convert and register a first example

```powershell
py -3 converter.py --cli 'C:/MyAssets/DD100/data/motion/smplx/all/Jive_001_002_01.npy'
```

The matching `_00.npy` file is found automatically. The converter prints a new folder under `output/`. It preserves shared offsets and timing, checks input hashes before/after, and reimports the exported FBXs in Blender to check physical transforms and duration. Failed conversions have `FAILED.txt` and must not be installed.

Replace the output-folder placeholder below with the folder just printed:

```powershell
py -3 add_dance.py 'output/YOUR-CONVERTED-FOLDER' --name 'Jive 01' --style Jive --mode both --notice sources/DD100-LICENSE.txt --attribution 'DD100 / Duolando, Li Siyao and collaborators, ICLR 2024; https://lisiyao21.github.io/projects/Duolando/ ; S-Lab 1.0, non-commercial.'
```

`--mode both` creates one Couple choice and a Single choice using the Lead recording. They share verified files; Solo plays only its selected part. Use `--mode single` for a one-dancer FBX. Adding `--solo` to the converter explicitly ignores an NPY partner.

For your own original animations, supply your own appropriate attribution/notice, or omit `--notice` when no third-party notice is required. Registration writes only ignored `dance-ball-v3/config.json`.

## 6. Optional: two takes per style

After setting up the reference rig, import a larger DD100 library:

```powershell
py -3 import_v3_library.py 'C:/MyAssets/DD100/data/motion/smplx/all' --takes 2 --notice sources/DD100-LICENSE.txt
```

With all ten styles present, this makes 20 Single and 20 Couple choices, entirely from DD100. There is no dependency on an old Ballet clip or private Foxtrot output. Source prefixes Lumba, PasoDable and Qiaqiaqia display as Rumba, Paso Doble and Cha Cha.

To start small, add `--styles Jive --takes 1`. `--jobs 1` reduces concurrent Blender work. Existing outputs are reused only when the original input hashes match. Reregistering the same name and mode updates its local choice.

## 7. Build and publish through the creator viewer

```powershell
py -3 build_creator_package_v3.py
```

The build creates an ignored small `dance-ball-v3/creator-package.json` index and compressed JSON modules in ignored `dance-ball-v3/package-assets/`. It includes supplied licence notices, links them from catalogue entries and uploads them under the immutable ATP release. Keep this generated folder beside the installer until upload completes. Generated `asset-verification.json` records byte sizes/hashes.

Stop current V3 sessions. Run `dance-ball-v3/install.js` once in the creator viewer and wait for Ready. A larger library may take several minutes. The installer reads one payload through the supported local JSON loader, immediately evicts its cached module, verifies decoded bytes, uploads and verifies readback, then continues. The catalogue is committed only after all files verify. Progress is in `DANCE BALL V3 v3-public-1 INSTALL` logs. No separate uploader service is needed.

All release paths are under `atp:/dance-ball-v3/`. V1/V2 paths and settings are separate. A domain with an existing V3 installation shares its V3 catalogue/settings with this release; an empty or smaller build does not prune older entries. Test a new installation in your own test domain first when preserving an existing V3 build matters.

## 8. Manual viewer check

1. Main ball > Couple > sizing choice. A clicks cyan Lead and selects the new dance. B clicks pink Follow on that pair. Both start from one UTC time, loop once, then either dancer clicks the main ball to stop.
2. Repeat with Follow joining first. Try a Single choice and stop it from the main ball.
3. Check original sizes/positions and world collisions restore; no extra mannequin or floating pose labels appear. Different avatars may still need visual alignment checks.

Inspect fresh viewer logs before repeating a failed click. Identify the release, session UUID and session ID; two viewers can have the same display name. A two-viewer test on one PC checks the flow. Remote timing remains a separate test.

## Troubleshooting

- **No dances:** register successful conversions, rebuild and reinstall. A fresh source checkout intentionally has an empty catalogue.
- **Reference rig changed:** rerun setup and reconvert with the same rig; do not bypass the hash/height checks.
- **Missing payload module:** rebuild and keep the generated payload folder beside the installer.
- **Out of memory:** use the small-index builder. Do not combine all animation data into one JSON file or retain every payload in the module cache.
- **No coordinator heartbeat:** check the domain's entity-script-server assignment. The installer must reach Ready before use.
- **Upload/permission failure:** check creator rez/ATP permissions and the logged file; no guest setting changes are required.

## Publishing your own fork

Commit only source/configuration templates and documentation. Do not commit local configuration, reference models, recordings, converted motion, installer payloads, licence files downloaded into `sources/`, or asset-containing backups. Use `python audit_public_repo.py` to inspect tracked files and all reachable history. A generated installer containing third-party assets is a separate distribution subject to those assets' licences; do not attach it automatically to a public software release.
