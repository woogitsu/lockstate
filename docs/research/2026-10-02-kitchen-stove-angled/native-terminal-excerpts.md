## calibrated-native

  ok 1 tests\browser\dedicated-kitchen-stove-player-build.spec.ts:166:1 › player creates storage and delivery capacity before Kitchen (43.6s)
  ok 2 tests\browser\dedicated-kitchen-stove-player-build.spec.ts:229:3 › player builds Kitchen at quarterTurns0 and retains authored stove enamel and cast-iron detail palettes and anchors after Save/Load (38.5s)
  ok 3 tests\browser\dedicated-kitchen-stove-player-build.spec.ts:229:3 › player builds Kitchen at quarterTurns1 and retains authored stove enamel and cast-iron detail palettes and anchors after Save/Load (38.6s)
  3 passed (2.1m)

## consumer-mutation-q0

  ok 1 tests\browser\dedicated-kitchen-stove-player-build.spec.ts:166:1 › player creates storage and delivery capacity before Kitchen (43.9s)
  x  2 tests\browser\dedicated-kitchen-stove-player-build.spec.ts:229:3 › player builds Kitchen at quarterTurns0 and retains authored stove enamel and cast-iron detail palettes and anchors after Save/Load (39.7s)
    Error: stove enamel body after construction
    Expected: > 500
    Received:   0
    Error: stove cast-iron support after construction
    Expected: > 25
    Received:   0
    Error: stove enamel body after Load
    Expected: > 500
    Received:   0
    Error: stove cast-iron support after Load
    Expected: > 25
    Received:   0
  1 failed
  1 passed (1.4m)

## consumer-mutation-q1

  ok 1 tests\browser\dedicated-kitchen-stove-player-build.spec.ts:166:1 › player creates storage and delivery capacity before Kitchen (43.6s)
  x  2 tests\browser\dedicated-kitchen-stove-player-build.spec.ts:229:3 › player builds Kitchen at quarterTurns1 and retains authored stove enamel and cast-iron detail palettes and anchors after Save/Load (40.0s)
    Error: stove enamel body after construction
    Expected: > 50
    Received:   0
    Error: stove cast-iron support after construction
    Expected: > 50
    Received:   0
    Error: stove enamel body after Load
    Expected: > 50
    Received:   0
    Error: stove cast-iron support after Load
    Expected: > 50
    Received:   0
  1 failed
  1 passed (1.4m)

## exact-restored-native

  ok 1 tests\browser\dedicated-kitchen-stove-player-build.spec.ts:166:1 › player creates storage and delivery capacity before Kitchen (44.2s)
  ok 2 tests\browser\dedicated-kitchen-stove-player-build.spec.ts:229:3 › player builds Kitchen at quarterTurns0 and retains authored stove enamel and cast-iron detail palettes and anchors after Save/Load (40.1s)
  ok 3 tests\browser\dedicated-kitchen-stove-player-build.spec.ts:229:3 › player builds Kitchen at quarterTurns1 and retains authored stove enamel and cast-iron detail palettes and anchors after Save/Load (41.3s)
  3 passed (2.1m)
