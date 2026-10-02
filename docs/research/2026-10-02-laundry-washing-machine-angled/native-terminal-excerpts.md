# Actual terminal native evidence

Existing 60-second case / 10-second progress limits, one worker; no retries or completion injection.

## initial-q0-native

```text
ok 1 tests\browser\dedicated-laundry-washing-machine-player-build.spec.ts:167:1 › player creates storage and delivery capacity before Laundry (43.2s)
ok 2 tests\browser\dedicated-laundry-washing-machine-player-build.spec.ts:230:3 › player builds Laundry at quarterTurns0 and retains washing machine palettes and anchors after Save/Load (37.1s)
2 passed (1.4m)
```

## initial-q1-native

```text
ok 1 tests\browser\dedicated-laundry-washing-machine-player-build.spec.ts:167:1 › player creates storage and delivery capacity before Laundry (42.8s)
x  2 tests\browser\dedicated-laundry-washing-machine-player-build.spec.ts:230:3 › player builds Laundry at quarterTurns1 and retains washing machine palettes and anchors after Save/Load (38.3s)
Error: washing machine 1 authored palette after construction
Expected: > 50
Received:   2
Error: washing machine 2 authored palette after construction
Expected: > 50
Received:   0
Error: washing machine 1 authored palette after Load
Expected: > 50
Received:   2
Error: washing machine 2 authored palette after Load
Expected: > 50
Received:   0
1 failed
1 passed (1.4m)
```

## calibrated-native

```text
ok 1 tests\browser\dedicated-laundry-washing-machine-player-build.spec.ts:168:1 › player creates storage and delivery capacity before Laundry (43.3s)
ok 2 tests\browser\dedicated-laundry-washing-machine-player-build.spec.ts:231:3 › player builds Laundry at quarterTurns0 and retains washing machine palettes and anchors after Save/Load (37.7s)
ok 3 tests\browser\dedicated-laundry-washing-machine-player-build.spec.ts:231:3 › player builds Laundry at quarterTurns1 and retains washing machine palettes and anchors after Save/Load (38.2s)
3 passed (2.0m)
```

## consumer-mutation-q0

```text
ok 1 tests\browser\dedicated-laundry-washing-machine-player-build.spec.ts:168:1 › player creates storage and delivery capacity before Laundry (43.2s)
x  2 tests\browser\dedicated-laundry-washing-machine-player-build.spec.ts:231:3 › player builds Laundry at quarterTurns0 and retains washing machine palettes and anchors after Save/Load (39.0s)
Error: washing machine 1 authored palette after construction
Expected: > 100
Received:   0
Error: washing machine 2 authored palette after construction
Expected: > 100
Received:   0
Error: washing machine 1 authored palette after Load
Expected: > 100
Received:   0
Error: washing machine 2 authored palette after Load
Expected: > 100
Received:   0
1 failed
1 passed (1.4m)
```

## consumer-mutation-q1

```text
ok 1 tests\browser\dedicated-laundry-washing-machine-player-build.spec.ts:168:1 › player creates storage and delivery capacity before Laundry (42.8s)
x  2 tests\browser\dedicated-laundry-washing-machine-player-build.spec.ts:231:3 › player builds Laundry at quarterTurns1 and retains washing machine palettes and anchors after Save/Load (38.2s)
Error: washing machine 1 authored palette after construction
Expected: > 100
Received:   0
Error: washing machine 2 authored palette after construction
Expected: > 100
Received:   0
Error: washing machine 1 authored palette after Load
Expected: > 100
Received:   0
Error: washing machine 2 authored palette after Load
Expected: > 100
Received:   0
1 failed
1 passed (1.4m)
```

## exact-restored-native

```text
ok 1 tests\browser\dedicated-laundry-washing-machine-player-build.spec.ts:168:1 › player creates storage and delivery capacity before Laundry (43.4s)
ok 2 tests\browser\dedicated-laundry-washing-machine-player-build.spec.ts:231:3 › player builds Laundry at quarterTurns0 and retains washing machine palettes and anchors after Save/Load (37.2s)
ok 3 tests\browser\dedicated-laundry-washing-machine-player-build.spec.ts:231:3 › player builds Laundry at quarterTurns1 and retains washing machine palettes and anchors after Save/Load (38.0s)
3 passed (2.0m)
```
