# Stop the whole DP&U stack: llama.cpp, Discord, Vite, leftover helper shells.
# Does not delete models, avatars, or repo files. Closing Tauri calls this so
# Eclipse leaves VRAM and nothing keeps running in the background.

$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path $PSScriptRoot -Parent

function Stop-MatchingProcess {
    param(
        [Parameter(Mandatory)][string]$Name,
        [string]$CommandMatch
    )
    $procs = Get-CimInstance Win32_Process -Filter "Name = '$Name'" -ErrorAction SilentlyContinue
    foreach ($proc in $procs) {
        if ($CommandMatch -and ($proc.CommandLine -notmatch $CommandMatch)) { continue }
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Stop-ListenPort([int]$Port) {
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.OwningProcess -gt 4) {
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
}

Stop-MatchingProcess -Name "llama-server.exe"
Stop-MatchingProcess -Name "llama-cli.exe"
Stop-MatchingProcess -Name "node.exe" -CommandMatch "discord\\bot\.mjs"
Stop-MatchingProcess -Name "node.exe" -CommandMatch "vendor\\utsuwa"
Stop-MatchingProcess -Name "node.exe" -CommandMatch "vendor/utsuwa"
Stop-ListenPort 8081
Stop-ListenPort 5173

Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
    $cmd = [string]$_.CommandLine
    if ($cmd -match "04-serve\.ps1|10-discord\.ps1|13-utsuwa-desktop\.ps1|08-start-companion\.ps1") {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}
