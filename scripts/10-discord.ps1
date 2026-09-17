# Start the Discord front. llama.cpp should already be running.
# Fill .env with DISCORD_BOT_TOKEN and OWNER_DISCORD_ID first.

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not (Test-Path (Join-Path $root ".env"))) {
    throw "Create .env from .env.example and set DISCORD_BOT_TOKEN and OWNER_DISCORD_ID"
}

& (Join-Path $PSScriptRoot "render-persona.ps1") | Out-Null

$discord = Join-Path $root "discord"
if (-not (Test-Path (Join-Path $discord "node_modules"))) {
    Write-Host "Installing discord.js..."
    Push-Location $discord
    npm install
    Pop-Location
}

Set-Location $discord
node .\bot.mjs
