param(
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repositoryRoot '.venv\Scripts\python.exe'
$desktopDist = Join-Path $repositoryRoot 'apps\desktop-web\dist'
$runtimeRoot = Join-Path $repositoryRoot '.pocketpilot'
$recordPath = Join-Path $runtimeRoot 'release-processes.json'
$ollamaExecutable = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
$started = [System.Collections.Generic.List[object]]::new()

function Get-ListenerProcessId([int]$Port) {
    return Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty OwningProcess
}

function Wait-Http([string]$Url, [int]$Attempts = 60) {
    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        try {
            $response = Invoke-RestMethod -Uri $Url -TimeoutSec 2
            if ($null -ne $response) {
                return $response
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    throw "Timed out waiting for $Url"
}

function Add-OwnedProcess([System.Diagnostics.Process]$Process, [string]$Kind, [string]$Signature) {
    $started.Add([ordered]@{
        kind = $Kind
        pid = $Process.Id
        started_at = $Process.StartTime.ToUniversalTime().ToString('o')
        executable = $Process.Path
        command_signature = $Signature
    })
}

function Stop-StartedProcesses {
    for ($index = $started.Count - 1; $index -ge 0; $index--) {
        $entry = $started[$index]
        $ownedProcess = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
        if ($null -ne $ownedProcess) {
            Stop-Process -Id $entry.pid -ErrorAction SilentlyContinue
        }
    }
}

try {
    & (Join-Path $PSScriptRoot 'preflight-demo.ps1') -Mode Prerequisites
    if ($LASTEXITCODE -ne 0) {
        throw 'PocketPilot prerequisites are not ready. Review the preflight result above.'
    }

    $lanAddress = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
        Where-Object { $null -ne $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
        ForEach-Object { $_.IPv4Address | Where-Object { $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1 -ExpandProperty IPAddress } |
        Select-Object -First 1
    if (-not $lanAddress) {
        throw 'No active private LAN IPv4 address was found. Connect the laptop and phone to the same trusted network.'
    }
    $env:POCKETPILOT_ADVERTISED_HOST = $lanAddress

    $agentPortOwner = Get-ListenerProcessId 8000
    $desktopPortOwner = Get-ListenerProcessId 4173
    if ($agentPortOwner -or $desktopPortOwner) {
        if (-not ($agentPortOwner -and $desktopPortOwner)) {
            throw 'Only one PocketPilot port is in use. Run the safe stop script or close the conflicting application.'
        }
        $health = Wait-Http 'http://127.0.0.1:8000/health' 4
        $desktop = Invoke-WebRequest -Uri 'http://127.0.0.1:4173' -UseBasicParsing -TimeoutSec 3
        if ($health.status -ne 'ok' -or $desktop.StatusCode -ne 200) {
            throw 'Ports 8000 or 4173 are occupied by another application.'
        }
        $pairing = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/api/v1/devices/pairing-code' -TimeoutSec 5
        Write-Output 'PocketPilot is already running and healthy.'
        Write-Output "Laptop dashboard: http://127.0.0.1:4173"
        Write-Output "Phone agent address: http://${lanAddress}:8000"
        Write-Output "Pairing code: $($pairing.code)"
        if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:4173' }
        exit 0
    }

    if (-not (Test-Path -LiteralPath $ollamaExecutable -PathType Leaf)) {
        throw 'Official Ollama executable was not found.'
    }
    if ($null -eq (Get-ListenerProcessId 11434)) {
        $ollama = Start-Process -FilePath $ollamaExecutable -ArgumentList 'serve' -WindowStyle Hidden -PassThru
        Add-OwnedProcess $ollama 'ollama' 'ollama.exe serve'
    }
    $tags = Wait-Http 'http://127.0.0.1:11434/api/tags' 60
    if (-not ($tags.models | Where-Object { $_.name -eq 'qwen3-coder:30b' })) {
        throw 'qwen3-coder:30b is not installed. Startup never downloads models automatically.'
    }

    if (-not (Test-Path -LiteralPath (Join-Path $desktopDist 'index.html') -PathType Leaf)) {
        & npm run build --workspace=@pocketpilot/desktop-web
        if ($LASTEXITCODE -ne 0) {
            throw 'The desktop presentation build failed.'
        }
    }

    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    [ordered]@{
        repository_root = $repositoryRoot
        advertised_host = $lanAddress
        created_at = (Get-Date).ToUniversalTime().ToString('o')
        processes = @($started)
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $recordPath -Encoding UTF8

    $agent = Start-Process -FilePath $python -ArgumentList @('-m', 'uvicorn', 'pocketpilot_agent.main:app', '--app-dir', 'services/agent/src', '--host', '0.0.0.0', '--port', '8000') -WorkingDirectory $repositoryRoot -WindowStyle Hidden -PassThru
    Add-OwnedProcess $agent 'agent' 'pocketpilot_agent.main:app --port 8000'
    $agentHealth = Wait-Http 'http://127.0.0.1:8000/health' 60
    if ($agentHealth.status -ne 'ok') {
        throw 'PocketPilot agent health check failed.'
    }
    $provider = Wait-Http 'http://127.0.0.1:8000/api/v1/analysis/provider' 10
    if (-not $provider.available -or $provider.provider -ne 'ollama' -or $provider.model -ne 'qwen3-coder:30b') {
        throw 'Local Ollama qwen3-coder:30b is not ready.'
    }

    $desktop = Start-Process -FilePath $python -ArgumentList @('-m', 'http.server', '4173', '--bind', '127.0.0.1', '--directory', $desktopDist) -WorkingDirectory $repositoryRoot -WindowStyle Hidden -PassThru
    Add-OwnedProcess $desktop 'desktop' 'http.server 4173 --bind 127.0.0.1'
    $desktopReady = Invoke-WebRequest -Uri 'http://127.0.0.1:4173' -UseBasicParsing -TimeoutSec 10
    if ($desktopReady.StatusCode -ne 200) {
        throw 'PocketPilot dashboard did not become ready.'
    }

    [ordered]@{
        repository_root = $repositoryRoot
        advertised_host = $lanAddress
        created_at = (Get-Date).ToUniversalTime().ToString('o')
        processes = @($started)
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $recordPath -Encoding UTF8

    $pairing = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/api/v1/devices/pairing-code' -TimeoutSec 5
    Write-Output ''
    Write-Output 'POCKETPILOT READY'
    Write-Output 'Local AI: qwen3-coder:30b'
    Write-Output 'Laptop dashboard: http://127.0.0.1:4173'
    Write-Output "Phone agent address: http://${lanAddress}:8000"
    Write-Output "Pairing code: $($pairing.code)"
    Write-Output 'Open PocketPilot AI on the phone, pair, and start the demo.'
    if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:4173' }
} catch {
    Stop-StartedProcesses
    if (Test-Path -LiteralPath $recordPath -PathType Leaf) {
        Remove-Item -LiteralPath $recordPath -Force
    }
    Write-Error $_
    exit 1
}
