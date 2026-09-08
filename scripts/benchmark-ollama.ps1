$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repositoryRoot '.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw 'PocketPilot virtual environment is missing.'
}

& $python (Join-Path $PSScriptRoot 'benchmark_ollama.py')
exit $LASTEXITCODE
