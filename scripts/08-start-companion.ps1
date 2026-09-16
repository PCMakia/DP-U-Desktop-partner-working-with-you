# One-click companion: llama.cpp + Utsuwa UI + browser.
# Safe to run if a process is already listening on the same port.

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $root "config.ps1")

$llamaPort = $DefaultPort
$uiPort = 5173
$uiUrl = "http://localhost:$uiPort/app"

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

function Wait-LocalPort([int]$Port, [int]$TimeoutSec, [string]$Label) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-LocalPort $Port) { return }
        Start-Sleep -Seconds 1
    }
    throw "$Label did not open port $Port within ${TimeoutSec}s"
}

$serve = Join-Path $PSScriptRoot "04-serve.ps1"
$ui = Join-Path $PSScriptRoot "07-utsuwa-ui.ps1"

if (Test-LocalPort $llamaPort) {
    Write-Host "llama.cpp already on 127.0.0.1:$llamaPort"
} else {
    Write-Host "Starting llama.cpp on 127.0.0.1:$llamaPort ..."
    Start-Process -FilePath "powershell.exe" -WorkingDirectory $root -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-NoProfile",
        "-File", $serve,
        "-NoSystemPrompt"
    )
}

if (Test-LocalPort $uiPort) {
    Write-Host "Utsuwa already on $uiUrl"
} else {
    Write-Host "Starting Utsuwa UI ..."
    Start-Process -FilePath "powershell.exe" -WorkingDirectory $root -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-NoProfile",
        "-File", $ui
    )
}

Write-Host "Waiting for llama.cpp (model load can take a minute)..."
Wait-LocalPort -Port $llamaPort -TimeoutSec 180 -Label "llama.cpp"

Write-Host "Waiting for Utsuwa..."
Wait-LocalPort -Port $uiPort -TimeoutSec 180 -Label "Utsuwa"

Write-Host "Opening $uiUrl"
Start-Process $uiUrl
Write-Host "Leave the two PowerShell windows open while you chat. Closing them stops the servers, not your saved history."
