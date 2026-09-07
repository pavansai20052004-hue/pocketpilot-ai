$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repositoryRoot '.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw 'PocketPilot virtual environment is missing. Complete the README setup first.'
}

$env:PYTHONPATH = Join-Path $repositoryRoot 'services\agent\src'
& $python -m pocketpilot_agent.demo_cli reset
exit $LASTEXITCODE
