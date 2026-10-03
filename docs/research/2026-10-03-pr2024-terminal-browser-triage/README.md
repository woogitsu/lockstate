# PR2024 terminal browser triage

## Exact subject and collection

Read-only investigation on 2026-10-03 of [run 37138459762](https://github.com/woogitsu/lockstate/actions/runs/37138459762), exact head `30568432f5f4a681849002962a87bfa8134ddc4a`. One fresh REST response returned this head, `completed`, `failure`. No run was restarted, cancelled or polled. This record is about the frozen V8 release subject; newer approved skin, camera, Rotate and V9 integration are separate subjects.

| Job | Failed | Passed | Did not run | Bootstrap failures |
| --- | ---: | ---: | ---: | ---: |
| Source 1 / 111250456875 | 18 | 305 | 2 | 2 |
| Source 2 / 111250456870 | 21 | 535 | 6 | 5 |
| Artifact / 111250456883 | 38 | 70 | 47 | 25 |
| Total | 77 | 910 | 55 | 32 |

All three no-retry reports contain zero `net::ERR_NETWORK_CHANGED` signatures. The 55 cases that did not run are not acceptance. In particular, serial fixture stages prevented later model acceptance after their bootstrap failed.

The three `.raw.txt` files retain CLI output, ANSI sequences and timestamps. PowerShell redirected them as UTF-16LE; these are captured CLI text, not a claim of unchanged HTTP transport bytes. The first download attempt was rejected by the CLI's escape-sequence protection, not GitHub or the game. Its errors are retained. Downloading with `--allow-escape-sequences` succeeded. The executed parser detects the BOM, strips ANSI only for analysis and requires nonzero parsed failure counts matching the terminal summaries. Its initial UTF-8 assumption produced an invalid zero inventory; it was corrected before this inventory was accepted.

[inventory.json](./inventory.json) contains **every one of the 77 exact case headers, first error, expected/received values, assertion source excerpt, stack and complete failure block**. [capture-manifest.json](./capture-manifest.json) pins captured file sizes and SHA256 values. [executed-log-inventory.cjs.txt](./executed-log-inventory.cjs.txt) is inert executed analysis source.

## Confirmed consumer mismatches

1. **Five Room plans reachability cases** in `app-shell.spec.ts`: 1280×720, 1440×900, 1024×768, 900×600 and 375×812. First assertion reports X/Y hit by the dialog and Place outside the viewport. Source inspection finds the controls are children of a **closed** coordinates disclosure in [the exact preview source](https://github.com/woogitsu/lockstate/blob/30568432f5f4a681849002962a87bfa8134ddc4a/src/ui/hud/room-template-preview.ts#L259). [The sweep](https://github.com/woogitsu/lockstate/blob/30568432f5f4a681849002962a87bfa8134ddc4a/tests/browser/app-shell.spec.ts#L4100) never opens that disclosure; its consumer only filters zero bounding rectangles, with no closed-details ancestor check. This does **not** establish product clipping of an opened form. Recommended correction: independently assert the closed disclosure, then publicly open Enter coordinates before retaining the complete measurement and hit checks. Do not exempt the three controls or change layout.
2. **Hired Guard artifact case** stops at its initial PNG poll, expected true, received false. [The fixture](https://github.com/woogitsu/lockstate/blob/30568432f5f4a681849002962a87bfa8134ddc4a/tests/browser/hired-guard-player-build.spec.ts#L25) awaits the Guard image before public hiring, after asserting an empty roster. [Actual renderer creation](https://github.com/woogitsu/lockstate/blob/30568432f5f4a681849002962a87bfa8134ddc4a/src/rendering/scene/oblique-world-scene.ts#L421) deliberately loads floor readiness only; [the real selected-pose consumer](https://github.com/woogitsu/lockstate/blob/30568432f5f4a681849002962a87bfa8134ddc4a/src/rendering/scene/oblique-world-scene.ts#L851) queues a Guard PNG when a projected Guard exists. Recommended correction: capture the empty world first, publicly Hire, then await that exact frame before checking body pixels. No synthetic fetch or eager-load regression.

Bounded existing actual-loader unit controls on this exact subject: **8 GREEN, 1 file, 1.12 seconds**; raw [demand-source-control.txt](./demand-source-control.txt). They cover floor-only empty boot, actual projected Guard/placed/pending demand, orientation, fallback/repaint and shutdown. This is supporting source evidence, not a browser rerun or a new production mutation claim.

## Concrete layout/readout assertions, separate from timeouts

- Pending-delivery fold: expected slack 7.5, received 0.5; body-height assertion passed first.
- Existing #1292 budget: corner expected 398, received 494; threshold clearance expected 10.19/9.19, received −85.8125/−86.8125. This is a measured geometry mismatch; no reserved layout rule was selected here.
- Alert press at 900×600: reachable height 26, below existing 44; hit belongs to a row label.
- 960px build-target readout: expected one square/catalogue value 80, received Point at the world after literal pointer370,250. Whether the point reaches the intended canvas needs actual geometry evidence; no copy or input producer fault established here.
- FullHD200% Build→Overview alert-list visibility: expected visible, received hidden.
- Off-map camera outline: expected hidden after physical arrow hold, received visible. This is the first failure; New-prison reset was never exercised in that case.
- Completed Yard bench/bin: expected one physical object, received zero. Classroom chairs timed out at a four-object poll. Logs alone do not expose the physical order/worker state needed to establish a gameplay defect.

## Timeout boundaries and remaining uncertainty

Thirty-two cases fail during actual Storage/Delivery bootstrap. The subject-specific build, pixel and whole Save/Load assertions behind these stages were not reached. Two explicit queue examples retain 17 and 14 unfinished orders; neither log records worker route, order progress, material allocation or permanent blockage. Other failures time out during screenshot, DOM access, camera click or public Room plans actions. The session-boundary source case reached its zero-command assertions and then timed out taking its final screenshot. The numeric held-primary artifact case reports page closure during its `finally` mouse release; this cleanup error is not proof that release caused the original delay.

**No shared gameplay or GPU root cause is proved by these logs.** They do not justify budget/retry changes, synthetic bootstrap, a world/path policy change or another blanket rerun. Next source fixes are the two confirmed consumer mismatches, coordinated with the HUD agent's existing View consumer ownership. Remaining bootstrap diagnosis needs a bounded actual worker/progress/timing receipt on an exact compiled subject, rather than assuming a permanent stall from elapsed time.

Production sources, fixtures, workflow and budgets are unchanged in this diagnostic checkpoint. No browser, server or build was launched.
