# Compiles Start-ALICE.exe next to Start-ALICE.bat (repo root).

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$src = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "AliceLauncher.cs")
$out = Join-Path $root "Start-ALICE.exe"

Add-Type -TypeDefinition $src -ReferencedAssemblies System.Windows.Forms -OutputAssembly $out -OutputType WindowsApplication
if (-not (Test-Path $out)) { throw "Failed to write $out" }
Write-Host "Wrote $out"
