# Input contract

Input is a renderer-agnostic, user-settings concern. Gameplay and camera consumers receive semantic action IDs such as `camera.up`, never localized key characters.

- Defaults bind physical `KeyboardEvent.code` positions (`KeyW`, `KeyA`, `KeyS`, `KeyD`), so the same movement cluster works on QWERTY and AZERTY keyboards.
- User-facing labels use the browser keyboard-layout map when available; the deterministic fallback is the physical-code label. Labels are display-only and never participate in action lookup.
- Bindings declare their active contexts. Collisions are rejected only when the same device/code is active in overlapping contexts; mutually exclusive contexts may share a binding.
- `text-entry` is deliberately absent from world action defaults, preventing game controls from firing while a text field owns input.
- Keyboard and the minimal pointer/touch adapter emit one `SemanticActionEvent` contract. The pointer adapter handles primary/select-or-confirm and cancellation only; pinch, pan, drag/box selection and gesture arbitration are deferred to Issue #11.
- The touch gesture core now exposes pan deltas and cursor-centered pinch scale independently from Phaser. Phaser integration and gesture arbitration remain renderer-owned.
- A pinch carries the **translation of the midpoint** as well as the scale, because two fingers on a map mean "move and scale this". That stopped being cosmetic with #74's build tool: while a tool is armed the one-finger drag builds, so two fingers are the only way a touch player can pan, and a pinch that could not translate would leave them able to zoom and never to move.
- Gesture arbitration for building is **modal**, not threshold-based. Laying a wall run *is* a drag, so no travel threshold can tell it apart from a pan without guessing, and a wrong guess either scrolls the world or builds a wall. The HUD arms the tool explicitly; while it is off every gesture keeps its previous meaning, and the middle-drag, wheel, keyboard and two-finger gestures are camera controls at all times. See `docs/RENDERING.md`.
- Accessibility preferences are a separate versioned user-settings record. `reducedMotion` and `uiScale` are validated integration points; neither belongs in authoritative prison state.
- Input settings have their own versioned serialization and must not be embedded in a prison simulation snapshot.
- Pointer, touch, and accessibility adapters will emit this same action contract in Issue #11; camera consumers arrive in Issue #10.
- Settings persistence goes through an injectable `KeyValueStore` (`getItem`/`setItem`), not a hard-coded browser global, so tests stay headless. The browser `main.ts` entry point supplies `window.localStorage`; this is a separate store from the IndexedDB prison-save path. Keys are `lockstate.settings.input` and `lockstate.settings.accessibility`; corrupted or missing entries fall back to defaults rather than failing boot.
- `remapAndPersistKeyboardBinding` composes validation with persistence so a conflicting or invalid remap is never written to storage.
