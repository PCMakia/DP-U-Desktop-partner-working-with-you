# Clone stock Utsuwa, then restore this repo's overlay files on top.
param([switch]$Force)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$dest = Join-Path $root "vendor\utsuwa"
$url = "https://github.com/JuiceBoxxGames/utsuwa.git"

New-Item -ItemType Directory -Force -Path (Join-Path $root "vendor") | Out-Null

$hasPackage = Test-Path (Join-Path $dest "package.json")
if ($hasPackage -and -not $Force) {
    Write-Host "Utsuwa already present at $dest"
} else {
    if (Test-Path $dest) {
        Write-Host "Cloning Utsuwa into a temp dir, then merging onto $dest ..."
        $tmp = Join-Path $root "vendor\_utsuwa_fetch"
        if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
        git clone --depth 1 $url $tmp
        Get-ChildItem -Force $tmp | ForEach-Object {
            $target = Join-Path $dest $_.Name
            if ($_.Name -eq ".git") { return }
            Copy-Item -Recurse -Force $_.FullName $target
        }
        Remove-Item -Recurse -Force $tmp
    } else {
        git clone --depth 1 $url $dest
        if (Test-Path (Join-Path $dest ".git")) {
            Remove-Item -Recurse -Force (Join-Path $dest ".git")
        }
    }
}

Set-Location $root
git checkout HEAD -- vendor/utsuwa 2>$null
Write-Host "Utsuwa is ready. Overlay files from this repo were restored."
Write-Host "Next: scripts\01-build-llama.ps1  (or skip to 07 if llama.cpp is already built)"
