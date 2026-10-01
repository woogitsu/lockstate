# Native modal keyboard context

Source/unit reproduction from root b6ebf85e8a: both world scenes supplied text-entry or world as the keyboard active context. Native room-plan card buttons are not text-entry controls, so the registered ArrowRight and KeyE camera bindings remain eligible beneath a showModal() dialog. This is an unused existing modal context, not a new player-control policy.

Reproducing the old active-context expression with the actual KeyboardInputAdapter and default bindings fails two assertions: ArrowRight emits camera.right while a modal card owns focus, and an already held camera key stays active when the modal opens. The fix uses an injected document to select the existing modal context for native dialog:modal, preserving text-entry precedence and ordinary non-modal HUD buttons. Both scenes pass their ambient document explicitly; no additional browser-global seam or allowlist change is introduced in input.

Checkpoint: modal context plus input/rendering boundaries 13/13, TypeScript passed. Fresh GitHub all-state duplicate search `modal camera dialog` returned no Issues. Actual browser reproduction and mutation are still pending the single-browser lease; no Issue has been created based solely on this unit result.
