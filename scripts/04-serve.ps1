# Local OpenAI-compatible server on 127.0.0.1.
# Use -NoSystemPrompt when Utsuwa owns the character card.

param(
    [ValidateSet("eclipse")]
    [string]$Profile = "eclipse",
    [string]$Character = "character",
    [int]$Port = 0,
    [int]$Ctx = 0,
    [switch]$NoSystemPrompt
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

$llamaArgs = @(
    "-m", $gguf
    "-a", "eclipse"
    "--host", "127.0.0.1"
    "--port", "$Port"
    "-c", "$Ctx"
    "-n", "1024"
)

if (-not $NoSystemPrompt) {
    $sysFile = & (Join-Path $PSScriptRoot "render-persona.ps1") -Character $Character
    if ($sysFile -is [array]) { $sysFile = $sysFile[-1] }
    $sysFile = [string]$sysFile
    if (-not (Test-Path -LiteralPath $sysFile)) {
        throw "persona render failed (expected characters\.generated-$Character.txt)"
    }
    $llamaArgs += @("--system-prompt-file", $sysFile)
    Write-Host "Character baked into llama.cpp: $Character"
} else {
    Write-Host "No llama.cpp system prompt (Utsuwa owns the persona)."
}

$llamaArgs += Get-RpSamplerArgs

Write-Host "Serving $gguf as $Character"
Write-Host "UI:  http://127.0.0.1:$Port/"
Write-Host "API:      http://127.0.0.1:$Port/v1/chat/completions"
Write-Host "Utsuwa:   scripts\07-utsuwa-ui.ps1  or  scripts\08-start-companion.ps1"
& $server @llamaArgs
