# Selected-object occupied dimensions

Owner-requested usability enhancement for whole-square building. Parent authorized a truthful static occupied-dimensions label; no new placement rule, procurement promise, save field or wall-run semantics.

- Main supplies optional objectFootprint through the existing canonical objectFootprintOf lookup used by ObjectTool.
- Selected catalogue content shows localized occupied-square dimensions; catalogue valuation remains unchanged.
- Object hover uses the existing localized area-at-anchor formatter. Removal still names only its target tile. Wall runs retain their original formatter and command semantics.
- Selection refresh repaints the current anchor with the newly selected dimensions without waiting for pointer movement.
- Unit baseline: occupied-dimension case red (old `7, 7` instead of `2 x 1 tiles at 7, 7`); removing the production footprint branch reproduces exactly that red assertion. Restored focused suites: 83 green. Locale/token/boundary/message suites: 115 green. TypeScript green.
- First probe incorrectly called Localizer.t and lost the multiplication glyph in the PowerShell/Python boundary; corrected harness uses Localizer.format and a Unicode escape. Those probe failures are not game regressions.

Actual Full HD keyboard station/bench selection and Escape verification remain pending a browser lease. This source checkpoint does not claim runtime completion.
