$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$recordPath = Join-Path $repositoryRoot '.pocketpilot\release-processes.json'

if (-not (Test-Path -LiteralPath $recordPath -PathType Leaf)) {
    Write-Output 'No PocketPilot-owned release process record was found. Nothing was stopped.'
    exit 0
}

$record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
if ($record.repository_root -ne $repositoryRoot) {
    throw 'The process record belongs to a different repository. Nothing was stopped.'
}

$unresolved = [System.Collections.Generic.List[object]]::new()
$stopped = 0
foreach ($entry in $record.processes) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($entry.pid)" -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        continue
    }
    $commandLine = [string]$process.CommandLine
    $valid = switch ($entry.kind) {
        'agent' { $commandLine.Contains('pocketpilot_agent.main:app') -and $commandLine.Contains('--port 8000') }
        'desktop' { $commandLine.Contains('http.server') -and $commandLine.Contains('4173') -and $commandLine.Contains('127.0.0.1') }
        'ollama' { $commandLine.Contains('ollama.exe') -and $commandLine.Contains('serve') }
        default { $false }
    }
    if (-not $valid) {
        Write-Warning "PID $($entry.pid) no longer matches the recorded PocketPilot $($entry.kind) process and was preserved."
        $unresolved.Add($entry)
        continue
    }
    $actual = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
    $recordedStart = [DateTimeOffset]::Parse(
        [string]$entry.started_at,
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::RoundtripKind
    ).UtcDateTime
    if ($null -eq $actual -or [Math]::Abs(($actual.StartTime.ToUniversalTime() - $recordedStart).TotalSeconds) -gt 3) {
        Write-Warning "PID $($entry.pid) start time does not match the ownership record and was preserved."
        $unresolved.Add($entry)
        continue
    }
    Stop-Process -Id $entry.pid -ErrorAction Stop
    $stopped += 1
}

if ($unresolved.Count -eq 0) {
    Remove-Item -LiteralPath $recordPath -Force
} else {
    $record.processes = @($unresolved)
    $record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $recordPath -Encoding UTF8
}
Write-Output "Stopped $stopped PocketPilot-owned process(es)."
if ($unresolved.Count -gt 0) {
    Write-Warning "$($unresolved.Count) ownership record(s) were preserved for manual review."
}
