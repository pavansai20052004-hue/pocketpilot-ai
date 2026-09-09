param(
    [int]$OfflineDetectionTimeoutSeconds = 900
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$evidenceDirectory = Join-Path $repositoryRoot ".pocketpilot"
$evidencePath = Join-Path $evidenceDirectory "offline-proof.json"
$benchmarkStderrPath = Join-Path $evidenceDirectory "offline-benchmark.stderr.log"
$probeUri = "https://www.gstatic.com/generate_204"
$monitor = $null

New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null

function Test-WanAvailable {
    try {
        Invoke-WebRequest -Uri $probeUri -TimeoutSec 4 -UseBasicParsing | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Write-Evidence([hashtable]$Evidence) {
    $Evidence | ConvertTo-Json -Depth 20 | Set-Content -Path $evidencePath -Encoding utf8
}

$startedAt = Get-Date
Write-Evidence @{
    status = "WAITING_FOR_OFFLINE"
    started_at = $startedAt.ToString("o")
    evidence_path = $evidencePath
}

try {
    $offlineDeadline = $startedAt.AddSeconds($OfflineDetectionTimeoutSeconds)
    $consecutiveOfflineChecks = 0
    while ($consecutiveOfflineChecks -lt 3) {
        if ((Get-Date) -gt $offlineDeadline) {
            throw "Internet remained available; offline proof did not start."
        }
        if (Test-WanAvailable) {
            $consecutiveOfflineChecks = 0
        }
        else {
            $consecutiveOfflineChecks++
        }
        if ($consecutiveOfflineChecks -lt 3) {
            Start-Sleep -Seconds 5
        }
    }

    $offlineStartedAt = Get-Date
    $ollamaHealth = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5
    $modelPresent = @(
        $ollamaHealth.models | Where-Object { $_.name -like "qwen3-coder:30b*" }
    ).Count -gt 0
    if (-not $modelPresent) {
        throw "The required qwen3-coder:30b model is not stored locally."
    }

    Write-Evidence @{
        status = "RUNNING_OFFLINE_WORKFLOW"
        started_at = $startedAt.ToString("o")
        offline_started_at = $offlineStartedAt.ToString("o")
        model = "qwen3-coder:30b"
        model_present_locally = $modelPresent
    }

    $monitor = Start-Job -ScriptBlock {
        param($Uri)
        while ($true) {
            $available = $false
            try {
                Invoke-WebRequest -Uri $Uri -TimeoutSec 4 -UseBasicParsing | Out-Null
                $available = $true
            }
            catch {}
            [pscustomobject]@{
                checked_at = (Get-Date).ToString("o")
                wan_available = $available
            }
            Start-Sleep -Seconds 5
        }
    } -ArgumentList $probeUri

    $env:POCKETPILOT_OLLAMA_MODEL = "qwen3-coder:30b"
    $env:POCKETPILOT_OLLAMA_DEMO_ID = "python-null-user"
    $env:POCKETPILOT_OLLAMA_BENCHMARK_CYCLES = "1"
    $env:POCKETPILOT_OLLAMA_TIMEOUT_SECONDS = "300"
    $env:POCKETPILOT_OLLAMA_CONTEXT_TOKENS = "8192"
    $env:POCKETPILOT_OLLAMA_MAX_OUTPUT_TOKENS = "2048"

    $benchmarkOutput = (
        & (Join-Path $repositoryRoot ".venv\Scripts\python.exe") `
            (Join-Path $repositoryRoot "scripts\benchmark_ollama.py") `
            2> $benchmarkStderrPath | Out-String
    )
    $benchmarkExitCode = $LASTEXITCODE
    $benchmarkStderr = if (Test-Path $benchmarkStderrPath) {
        Get-Content $benchmarkStderrPath -Raw
    }
    else {
        ""
    }
    $finalWanAvailable = Test-WanAvailable

    Stop-Job -Job $monitor
    $monitorChecks = @(Receive-Job -Job $monitor)
    Remove-Job -Job $monitor
    $monitor = $null

    $completedAt = Get-Date
    $onlineChecks = @($monitorChecks | Where-Object { $_.wan_available }).Count
    $benchmark = $null
    try {
        $benchmark = $benchmarkOutput | ConvertFrom-Json
    }
    catch {}

    $passed = (
        $benchmarkExitCode -eq 0 -and
        $null -ne $benchmark -and
        $benchmark.passed -eq 1 -and
        $benchmark.total -eq 1 -and
        $onlineChecks -eq 0 -and
        -not $finalWanAvailable
    )
    $status = if ($passed) { "PASS" } else { "FAIL" }
    Write-Evidence @{
        status = $status
        started_at = $startedAt.ToString("o")
        offline_started_at = $offlineStartedAt.ToString("o")
        completed_at = $completedAt.ToString("o")
        offline_duration_ms = [math]::Round(
            ($completedAt - $offlineStartedAt).TotalMilliseconds
        )
        model = "qwen3-coder:30b"
        model_present_locally = $modelPresent
        wan_monitor_checks = $monitorChecks
        wan_online_check_count = $onlineChecks
        wan_available_at_completion = $finalWanAvailable
        benchmark_exit_code = $benchmarkExitCode
        benchmark = $benchmark
        benchmark_stderr = $benchmarkStderr
        benchmark_raw_output = if ($null -eq $benchmark) { $benchmarkOutput } else { $null }
    }

    if ($passed) {
        [console]::Beep(900, 300)
        [console]::Beep(1200, 500)
        exit 0
    }
    exit 1
}
catch {
    Write-Evidence @{
        status = "ERROR"
        started_at = $startedAt.ToString("o")
        completed_at = (Get-Date).ToString("o")
        error = $_.Exception.Message
    }
    exit 2
}
finally {
    if ($null -ne $monitor) {
        Stop-Job -Job $monitor -ErrorAction SilentlyContinue
        Remove-Job -Job $monitor -Force -ErrorAction SilentlyContinue
    }
}
