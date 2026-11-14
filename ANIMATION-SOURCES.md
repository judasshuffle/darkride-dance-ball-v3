# Animation sources and examples

Obtain animations from the creators and follow the applicable terms. This software's MIT licence covers its code; it does not grant rights to animations or reference models. The repository includes no third-party motion or downloadable asset bundle.

## DD100 / Duolando

- [Official project page](https://lisiyao21.github.io/projects/Duolando/): follow the authors' **Data** link for downloads and view their dance previews.
- [Official repository and data-format documentation](https://github.com/lisiyao21/Duolando#dd100-data).
- [S-Lab 1.0 licence linked by the official project](https://github.com/lisiyao21/Bailando/blob/main/LICENSE). The Bailando link is intentional: it is the licence linked on the Duolando project page.

Credit: Li Siyao and collaborators, **Duolando**, ICLR 2024; dataset **DD100**.

Matching `_01.npy` and `_00.npy` files under `data/motion/smplx/all/` are Lead and Follow recordings of one take. Referenced examples:

| Style | Lead | Follow |
|---|---|---|
| Ballet | `Ballet_001_001_01.npy` | `Ballet_001_001_00.npy` |
| Jive | `Jive_001_002_01.npy` | `Jive_001_002_00.npy` |
| Foxtrot | `Foxtrot_004_014_01.npy` | `Foxtrot_004_014_00.npy` |

The official page identifies dataset and code as S-Lab 1.0. Its licence permits non-commercial use and redistribution, including modifications, under its copyright, licence/disclaimer and non-endorsement conditions. Commercial use or redistribution requires contacting the contributors. Supply the complete notice to the importer; it is carried into the generated installer and ATP release. These links alone do not satisfy notice obligations for redistributed data.

## Mixamo

- [Official Mixamo library](https://www.mixamo.com/).
- [Adobe's official FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html).
- [Adobe Community guidance on raw-file redistribution](https://community.adobe.com/questions-696/mixamo-faq-licensing-royalties-ownership-eula-and-tos-589400).

Users may obtain their own FBX from Mixamo under the applicable Adobe terms. Adobe's FAQ permits use in projects; the community guidance distinguishes this from redistribution of standalone animation files. No Mixamo dance, including any legacy Ballet clip, is supplied by this repository. The DD100 importer has no Mixamo dependency.

## Reference rigs

Provide your own compatible reference rig under its terms, for example from your own DarkRide installation. No mannequin, avatar mesh, licensed SMPL-X model, regressor or reference animation is distributed here. Setup measures a local rig without changing your source file.

See the [setup guide](docs/SETUP.md) for conversion, notices and installation. Use original provider links in your documentation rather than mirroring assets or exposing a private domain's ATP copies.
