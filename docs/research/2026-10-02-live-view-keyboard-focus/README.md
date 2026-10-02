# Keyboard live view focus ? pending native diagnosis

## VERIFIED: source audit

The native View select sets `disabled=true` while awaiting the renderer port, then re-enables itself. It does not explicitly restore focus after success. Failure calls native `reportValidity`, whose actual focus behavior must be measured in the browser. The existing unit stub does not implement native disabling/focus behavior, so source inspection alone cannot establish a player regression.

## Prepared actual regression

`tests/browser/live-view-keyboard-focus.spec.ts` navigates with Tab to New prison, activates Enter, then tabs to the View selector. It changes the real production renderer with native ArrowDown/ArrowUp and checks that focus remains available for the next keyboard action. A second case injects an actual registry503 response and checks focus for immediate keyboard retry.

TypeScript passed. The shared browser lease belongs to the camera agent; these cases have not run. No Issue or source correction is claimed yet.
