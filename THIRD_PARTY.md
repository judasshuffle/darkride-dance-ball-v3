# Licensing and provenance

The project implementation and documentation are supplied under [MIT](LICENSE). This source export contains the converter and V3 runtime, rather than a fork or vendor copy of an animation dataset repository. It contains no recorded dance data or external model files. Joint names and format mappings describe interoperability; they are not a redistributed SMPL-X body model.

Separately obtained material keeps its own licence:

| Material | How used | Terms and source |
|---|---|---|
| DD100 / Duolando | Optional user-supplied NPY motion; format/documentation reference | [Official project](https://lisiyao21.github.io/projects/Duolando/) and its linked [S-Lab 1.0 licence](https://github.com/lisiyao21/Bailando/blob/main/LICENSE). Non-commercial under its conditions; commercial permission is separate. |
| Mixamo | Optional user-supplied FBX | [Adobe FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html); check applicable terms before any asset redistribution. |
| DarkRide/reference mannequin | Target application; user supplies a compatible local rig | [DarkRide source project](https://github.com/caitlynmeeks/darkride-interface). Check the licence of the specific rig you obtain. None is bundled. |
| Blender | Independently installed conversion tool; its FBX importer/exporter is called through its API | [Blender licence information](https://www.blender.org/about/license/). No Blender executable or source is bundled. |
| Python | Independently installed runtime | [Python licensing](https://docs.python.org/3/license.html). |
| NumPy | Separately installed Python dependency; Blender also supplies NumPy | [NumPy licence](https://numpy.org/doc/stable/license.html). |

Keep a complete copyright/licence/disclaimer notice with any redistributed assets that require it. The DD100 bulk importer requires a local notice file and the builder includes it in the generated package, with attribution linked from catalogue entries. Users remain responsible for obtaining permission for their intended use; a code licence, conversion or ATP upload does not change an asset licence.

Do not apply this repository's MIT licence to imported third-party assets or to any third-party source you add later. Preserve required upstream notices and conditions when extending the code. Project/provider names identify compatibility and sources, not endorsement.
