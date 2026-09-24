# Room identity in the assembled game, 2026-09-24

This checks ADR 0098's two channels on the art branch at `23d4ebf2` after the institutional-floor replacement: the name on the map and the per-type floor tint. The prior environment-art screenshot did not show names because its harness constructs `WorldScene` without `roomName`; that optional callback is supplied by the production composition in `src/main.ts`. The room-label browser harness also supplies it. This check instead loaded the game's normal `index.html` and real simulation worker in Chromium.

## Player route and evidence

At 1920×1080, default camera zoom 1, I created a new prison, used the Rooms panel to draw a 4×4 Kitchen at tiles `(3,8)..(6,11)` and a 6×6 Canteen at `(3,12)..(8,17)`, purchased the wall materials, placed the perimeter wall orders through the Build panel, waited for the crew to finish them, then drew both rectangles again and confirmed each designation. The real worker reported **2 rooms**. The HUD emitted both “Kitchen designated” and “Canteen designated”; both rooms remained “not ready” because no dining furniture or doorway was placed. That readiness is separate from whether the room has a name.

The screenshot is [Kitchen and Canteen at zoom 1](./kitchen-canteen-zoom-1.png). Both names are visible inside their own zoned area, so the earlier missing-name observation was a harness limitation, not a runtime defect. The temporary Playwright flow passed **1/1 in 58.4 s**. It was removed after the visual check because it duplicates the existing room-label browser gate and adds a slow material/build route to the regular suite.

## Pixel measurement

I sampled the unscaled 1920×1080 Chromium screenshot, including the room-label glyph and nearby floor. The most common floor pixels near the two labels were Kitchen **RGB (185,194,175)** and Canteen **RGB (179,194,175)**. Their 6-unit red-channel difference confirms that tint alone offers little visible distinction on this art. Representative dark glyph pixels had about **3.10:1** contrast against the Kitchen floor and **3.76:1** against the Canteen floor; a near-black Canteen outline pixel had **10.36:1** against its floor. These are samples of rendered pixels, not a formal accessibility measurement of every glyph edge. At zoom 1 the words are readable in the screenshot; at a full 1920px view they are small, consistent with the 13px screen-size rule in `RoomLabelLayer`.

This check establishes the labels' presence and legibility at zoom 1 for these two built, designated rooms. It does not establish readiness, every room type, every zoom, or an optimal floor palette. ADR 0098 explicitly assigns identity to the name as well as the tint, so no palette change follows from this observation.
