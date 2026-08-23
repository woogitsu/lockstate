[CmdletBinding()]
param(
    [string]$Blender = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$contract = Join-Path $repositoryRoot 'assets\contracts\character-8-direction.contract.json'
$intermediate = Join-Path $repositoryRoot 'assets\intermediate'
$runtime = Join-Path $repositoryRoot 'public\assets\actors'

if (-not (Test-Path -LiteralPath $Blender -PathType Leaf)) {
    throw "Blender executable was not found: $Blender"
}

$actorIds = @('actor.prisoner.base', 'actor.guard.base', 'actor.medic.base', 'actor.cook.base', 'actor.staff.base')
foreach ($actorId in $actorIds) {
    $blend = Join-Path $repositoryRoot "assets\source\blender\$actorId.blend"
    $actorIntermediate = Join-Path $intermediate (Join-Path 'build' $actorId)
    & $Blender --background --python-exit-code 1 --python (Join-Path $PSScriptRoot 'create-prisoner-base.py') -- --asset-id $actorId
    if ($LASTEXITCODE -ne 0) { throw "Source-scene creation failed for $actorId." }

    & $Blender --background --python-exit-code 1 $blend --python (Join-Path $PSScriptRoot 'export-directional-sprites.py') -- --asset-id $actorId --output $actorIntermediate
    if ($LASTEXITCODE -ne 0) { throw "Directional sprite export failed for $actorId." }

    & $Blender --background --python-exit-code 1 --python (Join-Path $PSScriptRoot 'pack-sprite-atlas.py') -- --input $actorIntermediate --contract $contract --output $runtime
    if ($LASTEXITCODE -ne 0) { throw "Atlas packing failed for $actorId." }
}

$node = 'C:\Users\matma\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { $node = 'node' }
& $node (Join-Path $repositoryRoot 'tooling\validate-runtime-atlas.mjs') $runtime
if ($LASTEXITCODE -ne 0) { throw 'Runtime atlas validation failed.' }

& $node (Join-Path $repositoryRoot 'tooling\build-asset-registry.mjs') $runtime
if ($LASTEXITCODE -ne 0) { throw 'Runtime asset-registry generation failed.' }
