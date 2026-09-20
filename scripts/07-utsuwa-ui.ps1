# Sync persona + optional VRM into Utsuwa, then start the web UI only
# (http://localhost:5173). Does not start llama.cpp or Discord.
# Optional later: .\scripts\12-wake-brain.ps1   or send a chat (auto-wakes Eclipse)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$utsuwa = Join-Path $root "vendor\utsuwa"
if (-not (Test-Path (Join-Path $utsuwa "package.json"))) {
    throw "Utsuwa is missing at $utsuwa"
}

Write-Host "Syncing persona into Utsuwa..."
& (Join-Path $PSScriptRoot "render-persona.ps1") | Out-Null
node (Join-Path $PSScriptRoot "sync-utsuwa-persona.mjs")

$vrmSrc = Join-Path $root "avatars\character.vrm"
$vrmDst = Join-Path $utsuwa "static\models\character.vrm"
if (Test-Path $vrmSrc) {
    Copy-Item -Force $vrmSrc $vrmDst
    Write-Host "Copied avatars\character.vrm -> vendor\utsuwa\static\models\character.vrm"
} else {
    Write-Host "No avatars\character.vrm yet. UI will run; the companion gallery slot will 404 until you drop a VRM there."
    Write-Host "See avatars\PUT_VRM_HERE.txt"
}

function Invoke-Pnpm {
    param([Parameter(ValueFromRemainingArguments)][string[]]$PnpmArgs)
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        & pnpm @PnpmArgs
        return $LASTEXITCODE
    }
    corepack enable | Out-Null
    & corepack pnpm @PnpmArgs
    return $LASTEXITCODE
}

Set-Location $utsuwa
$env:ALLOW_LOCAL_PROVIDER_HOSTS = "true"
$env:DPU_ROOT = $root
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing Utsuwa dependencies (first run)..."
    $code = Invoke-Pnpm install
    if ($code -ne 0) { throw "pnpm install failed" }
}

Write-Host "Utsuwa UI: http://localhost:5173/app"
Write-Host "LLM:       http://127.0.0.1:8081/v1  (start with scripts\04-serve.ps1 -NoSystemPrompt)"
$code = Invoke-Pnpm dev
if ($code -ne 0) { throw "pnpm dev failed" }
