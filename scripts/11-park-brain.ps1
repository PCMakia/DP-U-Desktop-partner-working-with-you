# Stop Discord + llama.cpp so workshop overlay can sit without Eclipse in VRAM.
# Leave the Utsuwa / overlay window running — blink, look-at, and idle are local.

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $root "config.ps1")

function Stop-MatchingProcess {
    param(
        [Parameter(Mandatory)][string]$Name,
        [string]$CommandMatch
    )
    $procs = Get-CimInstance Win32_Process -Filter "Name = '$Name'" -ErrorAction SilentlyContinue
    foreach ($proc in $procs) {
        if ($CommandMatch -and ($proc.CommandLine -notmatch $CommandMatch)) { continue }
        Write-Host "Stopping $($proc.Name) pid $($proc.ProcessId)"
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

Stop-MatchingProcess -Name "llama-server.exe"
Stop-MatchingProcess -Name "node.exe" -CommandMatch "discord\\bot\.mjs"

Write-Host "Brain parked. Overlay can keep sitting."
Write-Host "Chat/PTT/Discord stay dead until scripts\12-wake-brain.ps1"
