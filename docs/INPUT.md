# Input contract

Input is a renderer-agnostic, user-settings concern. Gameplay and camera consumers receive semantic action IDs such as `camera.up`, never localized key characters.

- Defaults bind physical `KeyboardEvent.code` positions (`KeyW`, `KeyA`, `KeyS`, `KeyD`), so the same movement cluster works on QWERTY and AZERTY keyboards.
- User-facing labels use the browser keyboard-layout map when available; the deterministic fallback is the physical-code label. Labels are display-only and never participate in action lookup.
- Bindings declare their active contexts. Collisions are rejected only when the same device/code is active in overlapping contexts; mutually exclusive contexts may share a binding.
- `text-entry` is deliberately absent from world action defaults, preventing game controls from firing while a text field owns input.
- Keyboard and the minimal pointer/touch adapter emit one `SemanticActionEvent` contract. The pointer adapter handles primary/select-or-confirm and cancellation only; pinch, pan, drag/box selection and gesture arbitration are deferred to Issue #11.
- Input settings have their own versioned serialization and must not be embedded in a prison simulation snapshot.
- Pointer, touch, and accessibility adapters will emit this same action contract in Issue #11; camera consumers arrive in Issue #10.
