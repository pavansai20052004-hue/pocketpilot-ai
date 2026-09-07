$ErrorActionPreference = 'Continue'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repositoryRoot '.venv\Scripts\python.exe'

Write-Output 'POCKETPILOT DEMO PREFLIGHT'
foreach ($tool in @('node', 'npm', 'python', 'java', 'mvn', 'ollama')) {
    $available = Get-Command $tool -ErrorAction SilentlyContinue
    if ($null -eq $available) {
        Write-Output "$tool`tTOOL_MISSING"
    } else {
        Write-Output "$tool`tREADY`t$($available.Source)"
    }
}

foreach ($port in @(8000, 4173, 8081, 11434)) {
    $listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    Write-Output "PORT $port`t$(if ($null -eq $listening) { 'AVAILABLE' } else { 'IN USE' })"
}

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    Write-Error 'PocketPilot virtual environment is missing.'
    exit 1
}

$env:PYTHONPATH = Join-Path $repositoryRoot 'services\agent\src'
& $python -m pocketpilot_agent.demo_cli check
exit $LASTEXITCODE
