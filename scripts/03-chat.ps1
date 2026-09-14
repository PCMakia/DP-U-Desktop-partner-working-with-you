# Offline terminal RP chat. Persona comes from the character card, not a fine-tune.

param(
    [ValidateSet("eclipse")]
    [string]$Profile = "eclipse",
    [string]$Character = "character",
    [int]$Ctx = 0
)

. (Join-Path $PSScriptRoot "..\config.ps1")
Set-LlamaRuntimeEnv
if ($Ctx -le 0) { $Ctx = $DefaultCtx }

$cli = Get-LlamaExe "llama-cli.exe"
$gguf = Get-ModelPath $Profile
if (-not (Test-Path $gguf)) {
    throw "Model not on disk: $gguf`nRun scripts\02-download-gguf.ps1"
}
Set-HighPerformanceGpu $cli

$sysFile = & (Join-Path $PSScriptRoot "render-persona.ps1") -Character $Character
if ($LASTEXITCODE -ne 0 -or -not $sysFile) { throw "persona render failed" }

$llamaArgs = @(
    "-m", $gguf
    "--color"
    "-c", "$Ctx"
    "-n", "1024"
    "--system-prompt-file", $sysFile
)
$llamaArgs += Get-RpSamplerArgs

Write-Host "Model: $gguf"
Write-Host "Character: $Character ($sysFile)"
Write-Host "Context: $Ctx  |  Close browsers if VRAM OOMs"
Write-Host "Offline chat. Ctrl+C to stop generation / exit."
& $cli @llamaArgs
