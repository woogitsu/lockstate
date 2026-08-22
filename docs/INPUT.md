# Input contract

Input is a renderer-agnostic, user-settings concern. Gameplay and camera consumers receive semantic action IDs such as `camera.up`, never localized key characters.

- Defaults bind physical `KeyboardEvent.code` positions (`KeyW`, `KeyA`, `KeyS`, `KeyD`), so the same movement cluster works on QWERTY and AZERTY keyboards.
- Bindings declare their active contexts. Collisions are rejected only when the same device/code is active in overlapping contexts; mutually exclusive contexts may share a binding.
- `text-entry` is deliberately absent from world action defaults, preventing game controls from firing while a text field owns input.
- Input settings have their own versioned serialization and must not be embedded in a prison simulation snapshot.
- Pointer, touch, and accessibility adapters will emit this same action contract in Issue #11; camera consumers arrive in Issue #10.
