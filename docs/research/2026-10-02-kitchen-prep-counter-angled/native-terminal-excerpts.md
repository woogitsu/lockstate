# Actual terminal native evidence

Existing 60-second case / 10-second progress limits, one worker; no retries or completion injection.

## initial-q0-native

```text
ok 1 tests\browser\dedicated-kitchen-prep-counter-player-build.spec.ts:167:1 › player creates storage and delivery capacity before Kitchen (43.4s)
x  2 tests\browser\dedicated-kitchen-prep-counter-player-build.spec.ts:230:3 › player builds Kitchen at quarterTurns0 and retains authored prep counter worktop and detail palettes and anchors after Save/Load (41.7s)
Error: prep counter physical tray rims after construction
Expected: > 20
Received:   2
Error: prep counter physical tray rims after Load
Expected: > 20
Received:   2
1 failed
1 passed (1.5m)
```

## initial-q1-native

```text
ok 1 tests\browser\dedicated-kitchen-prep-counter-player-build.spec.ts:167:1 › player creates storage and delivery capacity before Kitchen (42.5s)
x  2 tests\browser\dedicated-kitchen-prep-counter-player-build.spec.ts:230:3 › player builds Kitchen at quarterTurns1 and retains authored prep counter worktop and detail palettes and anchors after Save/Load (39.9s)
Error: prep counter physical tray rims after construction
Expected: > 20
Received:   0
Error: prep counter physical tray rims after Load
Expected: > 20
Received:   0
1 failed
1 passed (1.4m)
```

## calibrated-native

```text
ok 1 tests\browser\dedicated-kitchen-prep-counter-player-build.spec.ts:172:1 › player creates storage and delivery capacity before Kitchen (43.7s)
ok 2 tests\browser\dedicated-kitchen-prep-counter-player-build.spec.ts:235:3 › player builds Kitchen at quarterTurns0 and retains authored prep counter worktop and detail palettes and anchors after Save/Load (39.2s)
ok 3 tests\browser\dedicated-kitchen-prep-counter-player-build.spec.ts:235:3 › player builds Kitchen at quarterTurns1 and retains authored prep counter worktop and detail palettes and anchors after Save/Load (39.6s)
3 passed (2.1m)
```

## consumer-mutation-q0

```text
ok 1 tests\browser\dedicated-kitchen-prep-counter-player-build.spec.ts:172:1 › player creates storage and delivery capacity before Kitchen (43.4s)
x  2 tests\browser\dedicated-kitchen-prep-counter-player-build.spec.ts:235:3 › player builds Kitchen at quarterTurns0 and retains authored prep counter worktop and detail palettes and anchors after Save/Load (39.1s)
Error: prep counter wood worktop after construction
Expected: > 100
Received:   0
Error: prep counter physical tray rims after construction
Expected: > 80
Received:   3
Error: prep counter wood worktop after Load
Expected: > 100
Received:   0
Error: prep counter physical tray rims after Load
Expected: > 80
Received:   3
1 failed
1 passed (1.4m)
```

## consumer-mutation-q1

```text
ok 1 tests\browser\dedicated-kitchen-prep-counter-player-build.spec.ts:172:1 › player creates storage and delivery capacity before Kitchen (42.9s)
x  2 tests\browser\dedicated-kitchen-prep-counter-player-build.spec.ts:235:3 › player builds Kitchen at quarterTurns1 and retains authored prep counter worktop and detail palettes and anchors after Save/Load (39.2s)
Error: prep counter wood worktop after construction
Expected: > 150
Received:   0
Error: prep counter physical tray rims after construction
Expected: > 100
Received:   27
Error: prep counter wood worktop after Load
Expected: > 150
Received:   0
Error: prep counter physical tray rims after Load
Expected: > 100
Received:   27
1 failed
1 passed (1.4m)
```

## exact-restored-native

```text
ok 1 tests\browser\dedicated-kitchen-prep-counter-player-build.spec.ts:172:1 › player creates storage and delivery capacity before Kitchen (43.1s)
ok 2 tests\browser\dedicated-kitchen-prep-counter-player-build.spec.ts:235:3 › player builds Kitchen at quarterTurns0 and retains authored prep counter worktop and detail palettes and anchors after Save/Load (40.2s)
ok 3 tests\browser\dedicated-kitchen-prep-counter-player-build.spec.ts:235:3 › player builds Kitchen at quarterTurns1 and retains authored prep counter worktop and detail palettes and anchors after Save/Load (38.7s)
3 passed (2.1m)
```
