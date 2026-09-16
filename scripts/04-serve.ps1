# Local OpenAI-compatible server on 127.0.0.1. Character is baked as a system prompt.

param(
    [ValidateSet("eclipse")]
    [string]$Profile = "eclipse",
    [string]$Character = "character",
    [int]$Port = 0,
    [int]$Ctx = 0
)

. (Join-Path $PSScriptRoot "..\config.ps1")
Set-LlamaRuntimeEnv
if ($Port -le 0) { $Port = $DefaultPort }
if ($Ctx -le 0) { $Ctx = $DefaultCtx }

$server = Get-LlamaExe "llama-server.exe"
$gguf = Get-ModelPath $Profile
if (-not (Test-Path $gguf)) {
    throw "Model not on disk: $gguf`nRun scripts\02-download-gguf.ps1"
}
Set-HighPerformanceGpu $server

$sysFile = & (Join-Path $PSScriptRoot "render-persona.ps1") -Character $Character
if ($sysFile -is [array]) { $sysFile = $sysFile[-1] }
$sysFile = [string]$sysFile
if (-not (Test-Path -LiteralPath $sysFile)) {
    throw "persona render failed (expected characters\.generated-$Character.txt)"
}

$llamaArgs = @(
    "-m", $gguf
    "--host", "127.0.0.1"
    "--port", "$Port"
    "-c", "$Ctx"
    "-n", "1024"
    "--system-prompt-file", $sysFile
)
$llamaArgs += Get-RpSamplerArgs

Write-Host "Serving $gguf as $Character"
Write-Host "UI:  http://127.0.0.1:$Port/"
Write-Host "API: http://127.0.0.1:$Port/v1/chat/completions"
Write-Host "Ask: scripts\05-ask.ps1 -Prompt 'hey' -Character $Character"
& $server @llamaArgs
