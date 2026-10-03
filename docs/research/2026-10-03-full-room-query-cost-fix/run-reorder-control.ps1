$ErrorActionPreference='Continue'
$taskPath=Join-Path (Get-Location) 'src/simulation/prisoners/room-instance-registry.ts'
$taskFixedBytes=[IO.File]::ReadAllBytes($taskPath)
$taskFixedText=[IO.File]::ReadAllText($taskPath)
$taskFixedSHA=(Get-FileHash -LiteralPath $taskPath -Algorithm SHA256).Hash.ToLowerInvariant()
$taskProducerName='  public findAvailableForUse('
$taskStart=$taskFixedText.IndexOf($taskProducerName)
if($taskStart -lt 0 -or $taskStart -ne $taskFixedText.LastIndexOf($taskProducerName)){throw 'Producer boundary ambiguous'}
$taskFixedEnd=$taskFixedText.IndexOf('  /**',$taskStart)
$taskBaselineLines=git -c core.longpaths=true show c076d1f657:src/simulation/prisoners/room-instance-registry.ts
if($LASTEXITCODE -ne 0){throw 'Actual committed baseline not readable'}
$taskBaseline=$taskBaselineLines -join "`n"
$taskBaselineStart=$taskBaseline.IndexOf($taskProducerName)
$taskBaselineEnd=$taskBaseline.IndexOf('  /**',$taskBaselineStart)
if($taskFixedEnd -le $taskStart -or $taskBaselineEnd -le $taskBaselineStart){throw 'Producer boundary missing'}
$taskOldProducer=$taskBaseline.Substring($taskBaselineStart,$taskBaselineEnd-$taskBaselineStart)
$taskMutation=$taskFixedText.Substring(0,$taskStart)+$taskOldProducer+$taskFixedText.Substring($taskFixedEnd)
try{
  [IO.File]::WriteAllText($taskPath,$taskMutation,[Text.UTF8Encoding]::new($false))
  & node_modules/.bin/vitest.cmd run tests/integration/room-selection-query-cost.test.ts tests/unit/room-use-eligibility-order.test.ts 2>&1 | Tee-Object -FilePath docs/research/2026-10-03-full-room-query-cost-fix/actual-reorder-omission-red.log
  $taskNegativeExit=$LASTEXITCODE
}finally{[IO.File]::WriteAllBytes($taskPath,$taskFixedBytes)}
$taskRestoredSHA=(Get-FileHash -LiteralPath $taskPath -Algorithm SHA256).Hash.ToLowerInvariant()
if($taskFixedSHA -ne $taskRestoredSHA){throw 'Fixed producer bytes not restored'}
if($taskNegativeExit -eq 0){throw 'Actual source reorder omission unexpectedly GREEN'}
& node_modules/.bin/vitest.cmd run tests/integration/room-selection-query-cost.test.ts tests/unit/room-use-eligibility-order.test.ts 2>&1 | Tee-Object -FilePath docs/research/2026-10-03-full-room-query-cost-fix/actual-reorder-exact-restore-green.log
$taskRestoredExit=$LASTEXITCODE
@{producer='src/simulation/prisoners/room-instance-registry.ts';mutation='only findAvailableForUse producer restored to committed unfixed c076d1f657';originalFixedSHA256=$taskFixedSHA;restoredFixedSHA256=$taskRestoredSHA;actualOmissionExit=$taskNegativeExit;actualRestoredExit=$taskRestoredExit} | ConvertTo-Json | Set-Content -LiteralPath docs/research/2026-10-03-full-room-query-cost-fix/actual-reorder-restoration.json -Encoding UTF8
if($taskRestoredExit -ne 0){throw 'Exact fixed source restoration is not GREEN'}
