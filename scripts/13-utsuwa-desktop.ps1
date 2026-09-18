# Real desktop overlay: always-on-top transparent Tauri window.
# Use this instead of the browser if you want the companion over Cursor with click-through.
# Requires Visual Studio C++ tools the first time (Tauri native build).

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $root "config.ps1")
Set-Location $root

$utsuwa = Join-Path $root "vendor\utsuwa"
if (-not (Test-Path (Join-Path $utsuwa "package.json"))) {
    throw "Utsuwa is missing at $utsuwa"
}

& (Join-Path $PSScriptRoot "render-persona.ps1") | Out-Null
node (Join-Path $PSScriptRoot "sync-utsuwa-persona.mjs")

$vrmSrc = Join-Path $root "avatars\character.vrm"
$vrmDst = Join-Path $utsuwa "static\models\character.vrm"
if (Test-Path $vrmSrc) {
    Copy-Item -Force $vrmSrc $vrmDst
}

function Invoke-Pnpm {
    param([Parameter(ValueFromRemainingArguments)][string[]]$PnpmArgs)
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        throw "Node.js is not on PATH. Install Node 22+ so corepack/pnpm can run."
    }
    $nodeDir = Split-Path $node.Source
    if ($env:PATH -notlike "*$nodeDir*") {
        $env:PATH = "$nodeDir;$env:PATH"
    }
    corepack enable | Out-Null
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        & pnpm @PnpmArgs
        return $LASTEXITCODE
    }
    & corepack pnpm @PnpmArgs
    return $LASTEXITCODE
}

Set-Location $utsuwa
$env:ALLOW_LOCAL_PROVIDER_HOSTS = "true"
$env:ALICE_YUE_ROOT = $root
if (-not (Test-Path "node_modules")) {
    $code = Invoke-Pnpm install
    if ($code -ne 0) { throw "pnpm install failed" }
}

Write-Host "Utsuwa desktop: a second transparent overlay window."
Write-Host "In the main window, click the monitor button or press Ctrl+Shift+U."
$code = Invoke-Pnpm tauri dev
if ($code -ne 0) { throw "pnpm tauri dev failed" }
