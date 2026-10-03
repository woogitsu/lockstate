# Room-plan quote visibility at Full HD

## Candidate and actual measurement

The retained Layout-Escape screenshot suggested that the right HUD rail cut
off the ghost material quote at 200% interface scale. Fresh actual-application
tests on the integrated `8317b42820` base compared 1920 × 1080 at 100% and 200%,
in angled view. The tests use real buttons, native mirror control, pointer
movement, keyboard yaw and worker preflight messages.

The label has a 340px content cap and 26px padding/border: 366px overall.
At 100%, the approved HUD-safe horizontal span is x570–1548. At 200%, it is
x846–1184, while the rail itself starts at x1192. The label frame at 200%
occupies x846–1212: 20px of its background and border are hidden by the rail.
Several text line boxes extend into the 8px clearance margin, with the longest
ending at x1191.08. This is not evidence that the text itself is hidden.

For the basic cell, mirrored four-cell row and Kitchen quote, every sampled
line endpoint and midpoint still hits the actual canvas at both scales.
No quote text obstruction was established. The actual 200% screenshot was
opened and inspected. The complete footprint remains inside the approved
safe rectangle, the label does not overlap the occupied squares, and yaw
retains the chosen four-cell-row origin and the exact worker quote. The
Kitchen preflight may correctly report blocked after that camera movement;
its material quote remains readable. No placement command is submitted.

## Detector proof

- The first conservative assertion against the clearance margin failed at
  200%, but hit testing reported zero hidden text samples. It was corrected
  to distinguish an outside-margin line from an actually obstructed line.
- The final scoped browser test passed both scales on unchanged ghost code.
- Deliberately increasing the production content cap from 340px to 440px
  made the 200% case fail on two actual hidden endpoint samples. The 100%
  case remained green. This demonstrates real obstruction detection without
  equating the clearance margin with the visible map edge.
- Exact CSS restoration was checked by SHA-256 and returned both cases green.
- Both TypeScript projects passed. Browser execution uses the repository
  browser server and actual application entry, rather than an emitted bundle.

No ghost position, fitting, typography, world origin, cost, gameplay, camera,
art or persistence code was changed. No hidden-cost Issue was opened because
that claim was not verified. The clipped frame and tight clearance are a
measured layout limitation; other languages, viewport sizes and quotations
were not proved by these two cases. This record does not claim full CI or
deployed acceptance.

## Separate integration correction

The existing HUD registry test reproduced a real CI failure: both rotation
labels used an inline key missing from HUD_MESSAGE_KEY. Published commit
`d7b87b5bcc3e0e1b244ed93d48fd757f19e7eeb6` adds the constant and uses it in
both consumers. The unchanged guard returned 13/13 green. A deliberate
single-consumer literal mutation made it red again, and exact restoration
returned 13/13 green. No wording or guard exemption was added.
