$ErrorActionPreference='Continue'
$env:PATH='C:/Program Files/Git/bin;'+(Join-Path $env:TEMP 'lockstate-pnpm-11-22-20261002')+';C:/Users/matma/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin;'+$env:PATH
$taskBranch='codex/integrate-common-room-connectivity-20261003'
$taskHead='a7db8b1fe3c2ee7340213b71dad4580a40d6bc10'
if ((git rev-parse HEAD) -ne $taskHead -or (git status --porcelain)) {throw 'Own subject must be clean and exact'}
if(-not(Test-Path -LiteralPath (Join-Path $env:TEMP 'lockstate-world-roving-positive-20261003'))){
 node (Join-Path $env:TEMP 'lockstate-capture-combined-20261003.cjs')
 if ($LASTEXITCODE -ne 0) {throw 'Capture failed'}
}
git switch --detach $taskHead
if ($LASTEXITCODE -ne 0) {throw 'Detach failed'}
$taskPrepared=$false
try {
 node (Join-Path $env:TEMP 'lockstate-world-native-control-20261003.cjs') reprepare
 if ($LASTEXITCODE -ne 0) {throw 'Preparation failed'}
 $taskPrepared=$true
 node scripts/cloudflare-task.mjs build production *> (Join-Path $env:TEMP 'lockstate-world-negative-build-20261003.txt')
 if ($LASTEXITCODE -ne 0) {throw 'Actual mutant build failed'}
 $env:LOCKSTATE_WORLD_ROVING_NATIVE='1'
 $env:LOCKSTATE_ARTIFACT_TEST_PORT='5365'
 $env:PLAYWRIGHT_JSON_OUTPUT_FILE=Join-Path $env:TEMP 'lockstate-world-roving-negative-20261003.json'
 pnpm --config.verify-deps-before-run=false exec playwright test --config docs/research/2026-10-03-world-roving-native-prep/playwright.native.config.ts --reporter=list,json *> (Join-Path $env:TEMP 'lockstate-world-roving-negative-20261003.txt')
 $taskNegativeCode=$LASTEXITCODE
 node (Join-Path $env:TEMP 'lockstate-capture-combined-20261003.cjs') world-negative
 if ($LASTEXITCODE -ne 0) {throw 'Negative capture failed'}
 if ($taskNegativeCode -eq 0) {throw 'Actual omission unexpectedly passed'}
 Write-Output "Actual omission exit $taskNegativeCode; inspect exact assertion"
} finally {
 if($taskPrepared){
  node (Join-Path $env:TEMP 'lockstate-world-native-control-20261003.cjs') restore
  if ($LASTEXITCODE -ne 0) {throw 'Exact restoration failed: keep detached for inspection'}
 }
 if(git status --porcelain){throw 'Source status differs after restoration'}
 git switch $taskBranch
 if ($LASTEXITCODE -ne 0) {throw 'Branch restoration failed'}
}
if((git rev-parse HEAD) -ne $taskHead){throw 'Restored HEAD differs'}
$env:PLAYWRIGHT_JSON_OUTPUT_FILE=Join-Path $env:TEMP 'lockstate-world-roving-restored-20261003.json'
pnpm --config.verify-deps-before-run=false exec playwright test --config docs/research/2026-10-03-world-roving-native-prep/playwright.native.config.ts --reporter=list,json *> (Join-Path $env:TEMP 'lockstate-world-roving-restored-20261003.txt')
$taskRestoredCode=$LASTEXITCODE
node (Join-Path $env:TEMP 'lockstate-capture-combined-20261003.cjs') world-restored
if($LASTEXITCODE -ne 0 -or $taskRestoredCode -ne 0){throw 'Restored actual subject failed'}
Write-Output 'Restored actual subject GREEN'
