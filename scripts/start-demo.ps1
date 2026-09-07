$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repositoryRoot '.venv\Scripts\python.exe'
$vite = Join-Path $repositoryRoot 'node_modules\vite\bin\vite.js'
$desktopRoot = Join-Path $repositoryRoot 'apps\desktop-web'

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw 'PocketPilot virtual environment is missing. Complete the README setup first.'
}
if (-not (Test-Path -LiteralPath $vite -PathType Leaf)) {
    throw 'PocketPilot desktop dependencies are missing. Complete the README setup first.'
}
foreach ($port in @(8000, 4173)) {
    if ($null -ne (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) {
        throw "Port $port is already in use. If PocketPilot is already running, open the dashboard. Otherwise run npm run demo:stop before retrying."
    }
}

$agent = Start-Process -FilePath $python -ArgumentList @('-m', 'uvicorn', 'pocketpilot_agent.main:app', '--app-dir', 'services/agent/src', '--host', '0.0.0.0', '--port', '8000') -WorkingDirectory $repositoryRoot -WindowStyle Hidden -PassThru
$desktop = Start-Process -FilePath 'node.exe' -ArgumentList @($vite, '--host', '0.0.0.0') -WorkingDirectory $desktopRoot -WindowStyle Hidden -PassThru
$agentProcessId = $null
$desktopProcessId = $null
for ($attempt = 0; $attempt -lt 50 -and ($null -eq $agentProcessId -or $null -eq $desktopProcessId); $attempt++) {
    Start-Sleep -Milliseconds 100
    $agentProcessId = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty OwningProcess
    $desktopProcessId = Get-NetTCPConnection -State Listen -LocalPort 4173 -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty OwningProcess
}
$lanAddress = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
    Where-Object { $null -ne $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
    ForEach-Object { $_.IPv4Address | Select-Object -First 1 -ExpandProperty IPAddress } |
    Select-Object -First 1

Write-Output "Agent started (listener PID $(if ($null -ne $agentProcessId) { $agentProcessId } else { $agent.Id }))."
Write-Output "Desktop started (listener PID $(if ($null -ne $desktopProcessId) { $desktopProcessId } else { $desktop.Id }))."
Write-Output 'Open http://127.0.0.1:4173 on this laptop.'
if ($null -ne $lanAddress) {
    Write-Output "On the phone, pair with http://${lanAddress}:8000."
} else {
    Write-Output 'On the phone, pair with http://<laptop-LAN-address>:8000.'
}
$runtimeRoot = Join-Path $repositoryRoot '.pocketpilot'
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$processRecord = @{
    repository_root = $repositoryRoot
    agent_pid = $(if ($null -ne $agentProcessId) { $agentProcessId } else { $agent.Id })
    desktop_pid = $(if ($null -ne $desktopProcessId) { $desktopProcessId } else { $desktop.Id })
    started_at = (Get-Date).ToUniversalTime().ToString('o')
}
$processRecord | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeRoot 'demo-processes.json') -Encoding UTF8
Write-Output 'Next: open the dashboard, select Python User Service, choose PREPARE DEMO, then pair the phone.'
Write-Output 'Use npm run demo:stop for a safe PocketPilot-only shutdown.'
