# Registered canteen floor calibration — #1932

The catalogue uses `rendered.floor.canteen.terrazzo.a1f31f17de5a.png`, but the renderer calibration still described the older ed4339 tile. Its measured mean RGB drift was 18.4138 and failed the existing real-PNG gate.

Decoded registered PNG mean RGB: 191.43820190429688, 183.58155822753906, 169.8818817138672. Runtime calibration now uses the rounded values. Approved zoning colours, opacity and contrast limits are unchanged.

Validation: zoning tint and real-PNG legibility suites pass 23/23. With the service-boundary suite, 37/37 pass; TypeScript passes. The original production constant reproduced the red gate before correction.
