# Bring Eclipse back after workshop park. Overlay can already be sitting.
# Optional: pass -Discord to start the Discord front as well.

param(
    [switch]$Discord
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $root "config.ps1")

function Test-LocalPort([int]$Port) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect("127.0.0.1", $Port)
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

$serve = Join-Path $PSScriptRoot "04-serve.ps1"
$discord = Join-Path $PSScriptRoot "10-discord.ps1"

if (Test-LocalPort $DefaultPort) {
    Write-Host "llama.cpp already on 127.0.0.1:$DefaultPort"
} else {
    Write-Host "Starting llama.cpp on 127.0.0.1:$DefaultPort ..."
    Start-Process -FilePath "powershell.exe" -WorkingDirectory $root -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-NoProfile",
        "-File", $serve,
        "-NoSystemPrompt"
    )
}

if ($Discord) {
    Write-Host "Starting Discord..."
    Start-Process -FilePath "powershell.exe" -WorkingDirectory $root -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-NoProfile",
        "-File", $discord
    )
}

Write-Host "Wait for llama.cpp to finish loading before Ctrl+Shift+C / PTT."
