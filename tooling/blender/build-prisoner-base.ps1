# Rebuild the starter actor set: source scenes, directional frames, atlases,
# validation and the runtime asset registry.
#
# The pipeline is pinned to the Blender version in `pipeline_common.py`
# (SUPPORTED_BLENDER_VERSION). Each Blender script asserts `bpy.app.version`
# against it and refuses to run otherwise, so pointing -Blender at another
# install fails immediately instead of producing subtly different pixels.
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

# --factory-startup keeps user preferences, enabled add-ons and startup files out
# of the render. Without it the output depends on whoever's machine ran it.
$blenderFlags = @('--background', '--factory-startup', '--python-exit-code', '1')

$actorIds = @('actor.prisoner.base', 'actor.prisoner.riot', 'actor.prisoner.assault', 'actor.guard.base', 'actor.guard.response', 'actor.guard.search', 'actor.medic.base', 'actor.cook.base', 'actor.staff.base')
foreach ($actorId in $actorIds) {
    $actorContract = if ($actorId -eq 'actor.guard.response') {
        Join-Path $repositoryRoot 'assets\contracts\guard-response-8-direction.contract.json'
    } elseif ($actorId -eq 'actor.guard.search') {
        Join-Path $repositoryRoot 'assets\contracts\guard-search-8-direction.contract.json'
    } elseif ($actorId -eq 'actor.prisoner.riot') {
        Join-Path $repositoryRoot 'assets\contracts\prisoner-riot-8-direction.contract.json'
    } elseif ($actorId -eq 'actor.prisoner.assault') {
        Join-Path $repositoryRoot 'assets\contracts\prisoner-assault-8-direction.contract.json'
    } else { $contract }
    $blend = Join-Path $repositoryRoot "assets\source\blender\$actorId.blend"
    $actorIntermediate = Join-Path $intermediate (Join-Path 'build' $actorId)
    & $Blender @blenderFlags --python (Join-Path $PSScriptRoot 'create-prisoner-base.py') -- --asset-id $actorId --output $blend
    if ($LASTEXITCODE -ne 0) { throw "Source-scene creation failed for $actorId." }

    & $Blender @blenderFlags $blend --python (Join-Path $PSScriptRoot 'export-directional-sprites.py') -- --asset-id $actorId --output $actorIntermediate
    if ($LASTEXITCODE -ne 0) { throw "Directional sprite export failed for $actorId." }

    & $Blender @blenderFlags --python (Join-Path $PSScriptRoot 'pack-sprite-atlas.py') -- --input $actorIntermediate --contract $actorContract --output $runtime
    if ($LASTEXITCODE -ne 0) { throw "Atlas packing failed for $actorId." }
}

$node = 'C:\Users\matma\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { $node = 'node' }
& $node (Join-Path $repositoryRoot 'tooling\validate-runtime-atlas.mjs') $runtime
if ($LASTEXITCODE -ne 0) { throw 'Runtime atlas validation failed.' }

& $node (Join-Path $repositoryRoot 'tooling\build-asset-registry.mjs') $runtime
if ($LASTEXITCODE -ne 0) { throw 'Runtime asset-registry generation failed.' }
