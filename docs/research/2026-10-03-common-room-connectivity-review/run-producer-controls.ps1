$ErrorActionPreference='Continue'
$taskCollection=Join-Path (Get-Location) 'docs/research/2026-10-03-common-room-connectivity-review'
Remove-Item Env:LOCKSTATE_CONNECTIVITY_REVIEW_RECEIPT -ErrorAction SilentlyContinue
$taskCases=@(
  @{Name='action-current-position';File='src/simulation/prisoners/action-system.ts';Needle='this.navigation.sharesPhysicalComponent(currentTile, candidate.anchorTile)';Replacement='this.navigation.sharesPhysicalComponent(candidate.anchorTile, candidate.anchorTile)'},
  @{Name='physical-label-cache';File='src/simulation/navigation/navigation-system.ts';Needle='if (this.physicalComponentGraph !== graph) {';Replacement='if (true) { // controlled review negative: always rebuild labels'}
)
$taskRecords=@()
foreach($taskCase in $taskCases){
  $taskPath=Join-Path (Get-Location) $taskCase.File
  $taskOriginal=[IO.File]::ReadAllBytes($taskPath)
  $taskText=[IO.File]::ReadAllText($taskPath)
  $taskHash=(Get-FileHash -LiteralPath $taskPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if($taskText.IndexOf($taskCase.Needle) -lt 0 -or $taskText.IndexOf($taskCase.Needle) -ne $taskText.LastIndexOf($taskCase.Needle)){throw 'Producer mutation needs exactly one match'}
  try{
    [IO.File]::WriteAllText($taskPath,$taskText.Replace($taskCase.Needle,$taskCase.Replacement),[Text.UTF8Encoding]::new($false))
    & node_modules/.bin/vitest.cmd run --config docs/research/2026-10-03-common-room-connectivity-review/vitest.audit.config.ts 2>&1 | Tee-Object -FilePath (Join-Path $taskCollection ($taskCase.Name+'-negative.log'))
    $taskNegative=$LASTEXITCODE
  }finally{[IO.File]::WriteAllBytes($taskPath,$taskOriginal)}
  $taskRestoredHash=(Get-FileHash -LiteralPath $taskPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if($taskRestoredHash -ne $taskHash){throw 'Producer bytes not restored'}
  if($taskNegative -eq 0){throw 'Actual producer negative unexpectedly GREEN'}
  & node_modules/.bin/vitest.cmd run --config docs/research/2026-10-03-common-room-connectivity-review/vitest.audit.config.ts 2>&1 | Tee-Object -FilePath (Join-Path $taskCollection ($taskCase.Name+'-exact-restore.log'))
  $taskRestored=$LASTEXITCODE
  $taskRecords+=@{producer=$taskCase.File;control=$taskCase.Name;originalSHA256=$taskHash;restoredSHA256=$taskRestoredHash;actualNegativeExit=$taskNegative;actualRestoredExit=$taskRestored}
  $taskRecords | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskCollection 'actual-producer-restoration.json') -Encoding UTF8
  if($taskRestored -ne 0){throw 'Exact restored producer not GREEN'}
}
