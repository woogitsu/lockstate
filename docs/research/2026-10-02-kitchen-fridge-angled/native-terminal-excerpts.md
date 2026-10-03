# Actual terminal native evidence

Existing 60-second case / 10-second progress limits, one worker; no retries or completion injection.

## initial-native

```text
ok 1 tests\browser\dedicated-kitchen-fridge-player-build.spec.ts:165:1 › player creates storage and delivery capacity before Kitchen (43.6s)
x  2 tests\browser\dedicated-kitchen-fridge-player-build.spec.ts:228:3 › player builds Kitchen at quarterTurns0 and retains authored fridge panel and detail palettes and anchors after Save/Load (41.7s)
Error: fridge detail candidate after construction
Expected: > 1
Received:   0
Error: fridge detail candidate after Load
Expected: > 1
Received:   0
1 failed
1 did not run
1 passed (1.5m)
```

## initial-q1-native

```text
ok 1 tests\browser\dedicated-kitchen-fridge-player-build.spec.ts:165:1 › player creates storage and delivery capacity before Kitchen (43.9s)
x  2 tests\browser\dedicated-kitchen-fridge-player-build.spec.ts:228:3 › player builds Kitchen at quarterTurns1 and retains authored fridge panel and detail palettes and anchors after Save/Load (40.3s)
Error: fridge detail candidate after construction
Expected: > 1
Received:   0
Error: fridge detail candidate after Load
Expected: > 1
Received:   0
1 failed
1 passed (1.5m)
```

## calibrated-native

```text
ok 1 tests\browser\dedicated-kitchen-fridge-player-build.spec.ts:171:1 › player creates storage and delivery capacity before Kitchen (43.7s)
ok 2 tests\browser\dedicated-kitchen-fridge-player-build.spec.ts:234:3 › player builds Kitchen at quarterTurns0 and retains authored fridge panel and detail palettes and anchors after Save/Load (40.4s)
ok 3 tests\browser\dedicated-kitchen-fridge-player-build.spec.ts:234:3 › player builds Kitchen at quarterTurns1 and retains authored fridge panel and detail palettes and anchors after Save/Load (39.4s)
3 passed (2.1m)
```

## consumer-mutation-q0

```text
ok 1 tests\browser\dedicated-kitchen-fridge-player-build.spec.ts:171:1 › player creates storage and delivery capacity before Kitchen (43.8s)
x  2 tests\browser\dedicated-kitchen-fridge-player-build.spec.ts:234:3 › player builds Kitchen at quarterTurns0 and retains authored fridge panel and detail palettes and anchors after Save/Load (39.3s)
Error: fridge freezer panel after construction
Expected: > 350
Received:   0
Error: fridge side louvres after construction
Expected: > 350
Received:   0
Error: fridge freezer panel after Load
Expected: > 350
Received:   0
Error: fridge side louvres after Load
Expected: > 350
Received:   0
1 failed
1 passed (1.4m)
```

## consumer-mutation-q1

```text
ok 1 tests\browser\dedicated-kitchen-fridge-player-build.spec.ts:171:1 › player creates storage and delivery capacity before Kitchen (43.3s)
x  2 tests\browser\dedicated-kitchen-fridge-player-build.spec.ts:234:3 › player builds Kitchen at quarterTurns1 and retains authored fridge panel and detail palettes and anchors after Save/Load (39.1s)
Error: fridge freezer panel after construction
Expected: > 800
Received:   0
Error: fridge side louvres after construction
Expected: > 100
Received:   0
Error: fridge freezer panel after Load
Expected: > 800
Received:   0
Error: fridge side louvres after Load
Expected: > 100
Received:   0
1 failed
1 passed (1.4m)
```

## exact-restored-native

```text
ok 1 tests\browser\dedicated-kitchen-fridge-player-build.spec.ts:171:1 › player creates storage and delivery capacity before Kitchen (43.6s)
ok 2 tests\browser\dedicated-kitchen-fridge-player-build.spec.ts:234:3 › player builds Kitchen at quarterTurns0 and retains authored fridge panel and detail palettes and anchors after Save/Load (40.3s)
ok 3 tests\browser\dedicated-kitchen-fridge-player-build.spec.ts:234:3 › player builds Kitchen at quarterTurns1 and retains authored fridge panel and detail palettes and anchors after Save/Load (41.2s)
3 passed (2.1m)
```
