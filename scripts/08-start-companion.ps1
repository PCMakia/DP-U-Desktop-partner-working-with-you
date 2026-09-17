# One-click companion: llama.cpp + Utsuwa UI + browser.
# Safe to run if a process is already listening on the same port.

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $root "config.ps1")

$llamaPort = $DefaultPort
$uiPort = 5173
$uiUrl = "http://localhost:$uiPort/app"

function Test-LocalPort([int]$Port) {
    $hosts = @("127.0.0.1", "localhost", "::1")
    foreach ($name in $hosts) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $client.Connect($name, $Port)
            $client.Close()
            return $true
        } catch { }
    }
    foreach ($url in @("http://127.0.0.1:$Port/", "http://localhost:$Port/", "http://[::1]:$Port/")) {
        try {
            Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null
            return $true
        } catch { }
    }
    return $false
}

function Wait-LocalPort([int]$Port, [int]$TimeoutSec, [string]$Label) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    $started = Get-Date
    while ((Get-Date) -lt $deadline) {
        if (Test-LocalPort $Port) {
            Write-Host "$Label is ready."
            return
        }
        $elapsed = [int]((Get-Date) - $started).TotalSeconds
        Write-Host "`rWaiting for $Label... ${elapsed}s   " -NoNewline
        Start-Sleep -Seconds 1
    }
    Write-Host ""
    throw "$Label did not open port $Port within ${TimeoutSec}s"
}

function Pause-Launcher([string]$Message) {
    Write-Host $Message
    Write-Host "Press Enter to close this window."
    try {
        Read-Host | Out-Null
    } catch {
        Start-Sleep -Seconds 8
    }
}

try {
    Write-Host "ALICE launcher"
    Write-Host "Press Enter to activate Discord after llama.cpp and Utsuwa are up."
    Write-Host "Type skip then Enter to leave Discord off."
    $discordAnswer = Read-Host "Discord"
    $startDiscord = $discordAnswer -notmatch '^(skip|n|no|q)$'

    $serve = Join-Path $PSScriptRoot "04-serve.ps1"
    $ui = Join-Path $PSScriptRoot "07-utsuwa-ui.ps1"
    $discord = Join-Path $PSScriptRoot "10-discord.ps1"

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

    if ($startDiscord) {
        $envFile = Join-Path $root ".env"
        if (-not (Test-Path $envFile)) {
            throw "Discord was requested but .env is missing. Copy .env.example and set DISCORD_BOT_TOKEN and OWNER_DISCORD_ID."
        }
        Write-Host "Starting Discord..."
        Start-Process -FilePath "powershell.exe" -WorkingDirectory $root -ArgumentList @(
            "-NoExit",
            "-ExecutionPolicy", "Bypass",
            "-NoProfile",
            "-File", $discord
        )
    }

    Pause-Launcher "Ready. You can close this window. Leave llama.cpp, Utsuwa$(if ($startDiscord) { ', and Discord' }) open."
} catch {
    Write-Host $_ -ForegroundColor Red
    Pause-Launcher "Launcher stopped with an error. llama.cpp / Utsuwa windows can stay up if they already started."
    exit 1
}
