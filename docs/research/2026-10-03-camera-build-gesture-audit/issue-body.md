## Registered-source reproduction; native acceptance pending

At source79c00d238469e96902323caab418f66208e9d345, real WorldScene input handlers commit a held left-button construction press when the middle mouse button is released. The mouse pointer ID is shared across buttons. Actual Phaser Pointer.down/up leaves primaryDown=true and buttons=1 after a native-shaped middle release; InputPlugin.processUpEvents still emits pointerup/pointerupoutside. World finishPointer then calls commitBuild/commitObject/commitArea without checking the button that was released.

The real BuildTool/ObjectTool/RoomTool and exact main command producer bodies feed actual SimulationCommandSender/SimulationWorkerStateMachine. This submits one PlaceBuildOrder (whole square11,11), PlaceObject (Bed11,11), or ZoneRoom (11,11,1?1) before the left button is released. The latter proves premature submission, not successful minimum-size Yard zoning.

Reproducible sequence: arm the respective tool; left down/buttons1; move; middle down/buttons5; move; middle up/buttons1. Expected: no construction commit until the owning left release. The ordinary camera-only middle gesture must remain responsive and command-free.

New exact-source test tests/unit/world-build-camera-button-release.test.ts:6 RED /12 legal controls GREEN, maxWorkers2. Both World pointerup and pointerupoutside routes fail for all three tools. The six Angled chord equivalents already preserve ownership and six genuine camera-only/fresh-left controls pass. Actual Camera and Pointer implementations and actual InputPlugin release body execute; Scene/DOM/graphics plumbing is not a native browser. Fresh native chord acceptance is pending with ROOT.

Fresh dedup read1950 (Angle middle-pan admission),1907 (template interrupted press/revision) and516 (missing release recovery): those are different consumers/causes. This is an emitted non-owning-button release erroneously finalizing World's current construction press. No source modification yet; narrow finishPointer release-ownership correction authorized separately, with original source evidence retained in docs/research/2026-10-03-camera-build-gesture-audit/.
