# One prompt to local llama-server, with the character card as the system message.

param(
    [Parameter(Mandatory)]
    [string]$Prompt,
    [string]$Character = "character",
    [int]$Port = 8081
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$sysFile = Join-Path $root "characters\.generated-$Character.txt"

if (-not (Test-Path $sysFile)) {
    $sysFile = & (Join-Path $PSScriptRoot "render-persona.ps1") -Character $Character
}

$system = [System.IO.File]::ReadAllText($sysFile)

$bodyObj = @{
    model       = "eclipse"
    temperature = 0.9
    top_p       = 0.95
    messages    = @(
        @{ role = "system"; content = $system }
        @{ role = "user"; content = $Prompt }
    )
}

$body = $bodyObj | ConvertTo-Json -Depth 6
$uri = "http://127.0.0.1:$Port/v1/chat/completions"
$resp = Invoke-RestMethod -Method Post -Uri $uri -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
Write-Host $resp.choices[0].message.content
