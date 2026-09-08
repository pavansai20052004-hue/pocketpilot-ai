param(
    [ValidateSet('Prerequisites', 'Runtime')]
    [string]$Mode = 'Runtime'
)

$ErrorActionPreference = 'Continue'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repositoryRoot '.venv\Scripts\python.exe'
$officialOllamaDirectory = Join-Path $env:LOCALAPPDATA 'Programs\Ollama'
$userMavenHome = [Environment]::GetEnvironmentVariable('MAVEN_HOME', 'User')
$userJavaHome = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User')

if ($userJavaHome) {
    $env:JAVA_HOME = $userJavaHome
}
if ($userMavenHome -and (Test-Path -LiteralPath (Join-Path $userMavenHome 'bin\mvn.cmd') -PathType Leaf)) {
    $env:MAVEN_HOME = $userMavenHome
    $env:Path = "$(Join-Path $userMavenHome 'bin');$env:Path"
}
if (Test-Path -LiteralPath (Join-Path $officialOllamaDirectory 'ollama.exe') -PathType Leaf) {
    $env:Path = "$officialOllamaDirectory;$env:Path"
}

Write-Output "POCKETPILOT PREFLIGHT - $($Mode.ToUpperInvariant())"
$missing = 0
foreach ($tool in @('node', 'npm', 'java', 'mvn', 'ollama')) {
    $available = Get-Command $tool -ErrorAction SilentlyContinue
    if ($null -eq $available) {
        Write-Output "$tool`tTOOL_MISSING"
        $missing += 1
    } else {
        Write-Output "$tool`tREADY`t$($available.Source)"
    }
}

if (Test-Path -LiteralPath $python -PathType Leaf) {
    Write-Output "PocketPilot Python`tREADY`t$python"
} else {
    Write-Output "PocketPilot Python`tTOOL_MISSING"
    $missing += 1
}

$environmentPath = Join-Path $repositoryRoot '.env'
$providerConfigured = $false
$modelConfigured = $false
if (Test-Path -LiteralPath $environmentPath -PathType Leaf) {
    $environmentLines = Get-Content -LiteralPath $environmentPath
    $providerConfigured = [bool]($environmentLines | Where-Object { $_ -match '^POCKETPILOT_LLM_PROVIDER=ollama\s*$' })
    $modelConfigured = [bool]($environmentLines | Where-Object { $_ -match '^POCKETPILOT_OLLAMA_MODEL=qwen3-coder:30b\s*$' })
}
Write-Output "LOCAL AI PROVIDER`t$(if ($providerConfigured) { 'READY' } else { 'NOT_CONFIGURED' })"
Write-Output "qwen3-coder:30b`t$(if ($modelConfigured) { 'CONFIGURED' } else { 'NOT_CONFIGURED' })"
if (-not $providerConfigured -or -not $modelConfigured) {
    $missing += 1
}

$modelInstalled = $false
if ($null -ne (Get-Command ollama -ErrorAction SilentlyContinue)) {
    $modelList = & ollama list 2>$null
    $modelInstalled = [bool]($modelList | Where-Object { $_ -match '^qwen3-coder:30b\s' })
}
Write-Output "qwen3-coder:30b MODEL`t$(if ($modelInstalled) { 'READY' } else { 'CHECK_AFTER_OLLAMA_START' })"

foreach ($port in @(8000, 4173, 8081, 11434)) {
    $listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    $portStatus = if ($null -eq $listening) { 'AVAILABLE' } else { "IN USE (PID $($listening[0].OwningProcess))" }
    Write-Output "PORT $port`t$portStatus"
}

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    exit 1
}

$env:PYTHONPATH = Join-Path $repositoryRoot 'services\agent\src'
$arguments = @('-m', 'pocketpilot_agent.demo_cli', 'check')
if ($Mode -eq 'Prerequisites') {
    $arguments += '--prerequisites-only'
}
& $python @arguments
$demoExitCode = $LASTEXITCODE

if ($missing -gt 0 -or $demoExitCode -ne 0) {
    Write-Output "PREFLIGHT RESULT`tNOT_READY"
    exit 1
}
Write-Output "PREFLIGHT RESULT`tREADY"
exit 0
