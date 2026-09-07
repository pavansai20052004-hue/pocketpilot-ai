$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$recordPath = Join-Path $repositoryRoot '.pocketpilot\demo-processes.json'

if (-not (Test-Path -LiteralPath $recordPath -PathType Leaf)) {
    Write-Output 'No PocketPilot-owned demo process record was found. Nothing was stopped.'
    exit 0
}

$record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
if ($record.repository_root -ne $repositoryRoot) {
    throw 'The demo process record belongs to a different repository. Nothing was stopped.'
}

$stopped = 0
foreach ($processId in @($record.agent_pid, $record.desktop_pid)) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        continue
    }
    $commandLine = [string]$process.CommandLine
    $isAgent = (
        $commandLine.Contains('pocketpilot_agent.main:app') -and
        $commandLine.Contains('--app-dir services/agent/src') -and
        $commandLine.Contains('--port 8000')
    )
    $isDesktop = $commandLine.Contains($repositoryRoot) -and (
        $commandLine.Contains('apps\desktop-web') -or $commandLine.Contains('vite.js')
    )
    $isPocketPilot = $isAgent -or $isDesktop
    if (-not $isPocketPilot) {
        Write-Warning "PID $processId no longer matches a PocketPilot demo process and was preserved."
        continue
    }
    Stop-Process -Id $processId -ErrorAction Stop
    $stopped += 1
}

Remove-Item -LiteralPath $recordPath -Force
Write-Output "Stopped $stopped PocketPilot-owned demo process(es)."
