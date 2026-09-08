param([switch]$NoBrowser)

& (Join-Path $PSScriptRoot 'start-pocketpilot.ps1') -NoBrowser:$NoBrowser
exit $LASTEXITCODE
